/**
 * Shared tool plumbing: runtime interface, request-body assembly, polling,
 * and compact detail storage.
 */

import { Type } from "typebox";
import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import { describeError } from "../client.ts";
import type { ExaClient, ExaResponse } from "../client.ts";
import type { JsonObject, ResolvedConfig } from "../types.ts";
import { isJsonObject } from "../types.ts";

export {
	applyContentMode,
	buildBody,
	hasContentMode,
	jsonObject,
	queryFrom,
	withContentMode,
	type ContentMode,
} from "../body.ts";

export interface Runtime {
	config(): ResolvedConfig;
	client(): ExaClient;
	/** Enable tool groups; returns the tools that were not active before. */
	activate(groups: string[]): string[];
	/** Groups whose tools are currently active. */
	activeGroups(): string[];
}

export interface ToolResult {
	content: { type: "text"; text: string }[];
	details: unknown;
}

export function textResult(text: string, details: unknown): ToolResult {
	return { content: [{ type: "text", text }], details };
}

/** Free-form advanced options object accepted by the curated tools. */
export function optionsSchema(hint: string) {
	return Type.Optional(
		Type.Object(
			{},
			{
				additionalProperties: true,
				description: `Advanced Exa parameters merged into the request body (they override the curated arguments). ${hint}`,
			},
		),
	);
}

export interface PollOptions<T> {
	timeoutMs: number;
	intervalMs: number;
	signal?: AbortSignal;
	isDone: (value: T) => boolean;
	poll: () => Promise<T>;
	onProgress?: (value: T) => void;
}

export interface PollOutcome<T> {
	value: T;
	timedOut: boolean;
	polls: number;
}

export async function pollUntil<T>(options: PollOptions<T>): Promise<PollOutcome<T>> {
	const startedAt = Date.now();
	let value = await options.poll();
	let polls = 1;
	options.onProgress?.(value);
	let timedOut = false;
	while (!options.isDone(value)) {
		if (Date.now() - startedAt >= options.timeoutMs) {
			timedOut = true;
			break;
		}
		await sleep(Math.min(options.intervalMs, Math.max(0, options.timeoutMs - (Date.now() - startedAt))), options.signal);
		if (options.signal?.aborted) throw options.signal.reason;
		value = await options.poll();
		polls += 1;
		options.onProgress?.(value);
	}
	return { value, timedOut, polls };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timer);
			cleanup();
			reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
		};
		const cleanup = (): void => {
			signal?.removeEventListener("abort", onAbort);
		};
		if (signal) {
			if (signal.aborted) {
				onAbort();
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

/** Keep tool details small enough that the session file does not balloon. */
export function compactDetails(response: ExaResponse, limit = 80_000): unknown {
	const data = response.data;
	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(data);
	} catch {
		serialized = undefined;
	}
	const meta = {
		status: response.status,
		requestId: response.requestId,
		notes: response.notes.length > 0 ? response.notes : undefined,
	};
	if (serialized !== undefined && serialized.length <= limit) {
		return { ...meta, response: data };
	}
	if (isJsonObject(data)) {
		const summary: JsonObject = { ...meta, truncated: true };
		if (typeof data.requestId === "string") summary.requestId = data.requestId;
		if (Array.isArray(data.results)) {
			summary.results = data.results.map((result) =>
				isJsonObject(result)
					? { title: result.title, url: result.url, id: result.id, publishedDate: result.publishedDate }
					: result,
			);
		}
		if (isJsonObject(data.costDollars)) summary.costDollars = data.costDollars;
		if (typeof data.id === "string") summary.id = data.id;
		if (typeof data.status === "string") summary.status = data.status;
		return summary;
	}
	return meta;
}

/** Guard for action-dispatch tools: every handled action assigns a response. */
export function requireResponse(response: ExaResponse | undefined, action: string): ExaResponse {
	if (!response) throw new Error(`no response produced for action "${action}"`);
	return response;
}

export function errorText(error: unknown): string {
	return `Error: ${describeError(error)}`;
}

/** Update callback helper for long-running tools. */
export function progressReporter(onUpdate: AgentToolUpdateCallback<unknown> | undefined, label: string) {
	return (message: string): void => {
		onUpdate?.({
			content: [{ type: "text", text: `${label} ${message}` }],
			details: undefined,
		});
	};
}
