/**
 * Pure request-body helpers (no Pi or TypeBox imports, so they are unit
 * testable in isolation).
 */

import { deepMerge } from "./config.ts";
import type { JsonObject } from "./types.ts";
import { isJsonObject } from "./types.ts";

const CONTENT_KEYS = ["text", "highlights", "summary", "context"] as const;

function jsonObject(value: unknown): JsonObject | undefined {
	return isJsonObject(value) ? value : undefined;
}

/** Query-string parameters passed inside an `options` object as `{ query: {...} }`. */
export function queryFrom(options: unknown): Record<string, unknown> {
	const object = jsonObject(options);
	if (!object) return {};
	const query = jsonObject(object["query"]);
	return query ? { ...query } : {};
}

/** Build a request body from config defaults, curated fields, and free-form options. */
export function buildBody(defaults: JsonObject, curated: Record<string, unknown>, options: unknown): JsonObject {
	let body = deepMerge({}, defaults);
	for (const [key, value] of Object.entries(curated)) {
		if (value !== undefined) body[key] = value;
	}
	const extra = jsonObject(options);
	if (extra) body = deepMerge(body, stripOptionHelpers(extra));
	return body;
}

/** `options.query` is a transport hint, not part of the body. */
function stripOptionHelpers(options: JsonObject): JsonObject {
	if (!("query" in options)) return options;
	const { query: _query, ...rest } = options;
	return rest;
}

export type ContentMode = "highlights" | "text" | "summary" | "text+highlights" | "none";

/**
 * Apply a curated content mode, clearing any previously configured mode keys.
 * `nested` selects the `/search` style (`contents: { ... }`) or the `/contents`
 * style (top-level keys).
 */
export function applyContentMode(body: JsonObject, mode: ContentMode, nested = true): void {
	const contents = nested && isJsonObject(body["contents"]) ? { ...body["contents"] } : {};
	const target: JsonObject = nested ? contents : body;
	/** A same-key setting (maxCharacters, ...) survives: the mode must not flatten it to `true`. */
	const existing = { ...target };
	const kept = (value: unknown, fallback: unknown): unknown =>
		value === undefined || value === false ? fallback : value;
	for (const key of CONTENT_KEYS) delete target[key];
	switch (mode) {
		case "highlights":
			target["highlights"] = kept(existing["highlights"], true);
			break;
		case "text":
			target["text"] = kept(existing["text"], true);
			break;
		case "summary":
			target["summary"] = kept(existing["summary"], {});
			break;
		case "text+highlights":
			target["text"] = kept(existing["text"], true);
			target["highlights"] = kept(existing["highlights"], true);
			break;
		case "none":
			break;
	}
	if (nested) {
		if (Object.keys(contents).length > 0) body["contents"] = contents;
		else delete body["contents"];
	}
}

/**
 * Copy `defaults` with the curated content mode applied, so the caller's `options`
 * and curated fields still merge on top of it.
 */
export function withContentMode(defaults: JsonObject, mode: ContentMode | undefined, nested = true): JsonObject {
	const body = deepMerge({}, defaults);
	if (mode) applyContentMode(body, mode, nested);
	return body;
}

/** True when the body already asks for some content mode (from config defaults). */
export function hasContentMode(body: JsonObject, nested = true): boolean {
	if (nested) {
		return (
			isJsonObject(body["contents"]) && CONTENT_KEYS.some((key) => (body["contents"] as JsonObject)[key] !== undefined)
		);
	}
	return CONTENT_KEYS.some((key) => body[key] !== undefined);
}
