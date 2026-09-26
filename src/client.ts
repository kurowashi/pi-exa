/**
 * Minimal Exa HTTP client.
 *
 * Deliberately small: JSON in, JSON out. Streaming responses are not
 * supported, so a `stream: true` body flag is dropped with a note instead of
 * corrupting the result.
 */

import type { JsonObject, ResolvedConfig } from "./types.ts";
import { isJsonObject } from "./types.ts";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ExaRequest {
	method: HttpMethod;
	/** Path below the base URL, e.g. "/search" or "/websets/v0/websets". */
	path: string;
	body?: JsonObject | undefined;
	query?: Record<string, unknown> | undefined;
	/** Value for the `Exa-Beta` header (e.g. "batches-2026-06-06"). */
	beta?: string | undefined;
	signal?: AbortSignal | undefined;
	timeoutMs?: number | undefined;
}

export interface ExaResponse {
	status: number;
	requestId?: string | undefined;
	data: unknown;
	/** Non-fatal adjustments made to the request (e.g. dropped `stream`). */
	notes: string[];
}

export class ExaApiError extends Error {
	readonly status: number;
	readonly code: string | undefined;
	readonly requestId: string | undefined;

	constructor(status: number, code: string | undefined, message: string, requestId?: string) {
		super(message);
		this.name = "ExaApiError";
		this.status = status;
		this.code = code;
		this.requestId = requestId;
	}
}

export function describeError(error: unknown): string {
	if (error instanceof ExaApiError) {
		const parts = [`Exa API ${error.status || "request"} error`];
		if (error.code && error.code !== error.message) parts.push(`[${error.code}]`);
		parts.push(error.message);
		if (error.requestId) parts.push(`(request ${error.requestId})`);
		return parts.join(" ");
	}
	if (error instanceof Error) {
		if (error.name === "TimeoutError")
			return "Exa request timed out (narrow the request, or ask the user to raise timeoutMs in ~/.pi/agent/exa.json)";
		if (error.name === "AbortError") return "Exa request was aborted";
		return error.message;
	}
	return String(error);
}

/** Arrays repeat the key; strings pass through, everything else is encoded. */
function appendItem(params: URLSearchParams, key: string, item: unknown): void {
	if (item === undefined || item === null) return;
	params.append(key, typeof item === "string" ? item : JSON.stringify(item));
}

function appendQueryValue(params: URLSearchParams, key: string, value: unknown): void {
	if (value === undefined || value === null || value === "") return;
	if (Array.isArray(value)) {
		for (const item of value) appendItem(params, key, item);
		return;
	}
	params.append(
		key,
		typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value),
	);
}

function buildQuery(query: Record<string, unknown> | undefined): string {
	if (!query) return "";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) appendQueryValue(params, key, value);
	const text = params.toString();
	return text ? `?${text}` : "";
}

/** Mirror an abort from `source` onto `controller`, immediately if already aborted. */
function forwardAbort(source: AbortSignal, controller: AbortController): void {
	if (source.aborted) controller.abort(source.reason);
	else source.addEventListener("abort", () => controller.abort(source.reason), { once: true });
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	if (!signal) return timeout;
	const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
	if (typeof anySignal === "function") return anySignal.call(AbortSignal, [signal, timeout]);
	const controller = new AbortController();
	forwardAbort(signal, controller);
	forwardAbort(timeout, controller);
	return controller.signal;
}

interface ParsedError {
	code?: string | undefined;
	message?: string | undefined;
	requestId?: string | undefined;
}

/** The error code Exa uses, from either `code` or its legacy `type` field. */
function errorCode(error: JsonObject): string | undefined {
	const code = error["code"];
	if (typeof code === "string") return code;
	const type = error["type"];
	return typeof type === "string" ? type : undefined;
}

function stringOr(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

export function parseErrorPayload(data: unknown, fallback: string): ParsedError {
	if (!isJsonObject(data)) return { message: fallback };
	const requestId = typeof data["requestId"] === "string" ? data["requestId"] : undefined;
	const nested = data["error"];
	if (isJsonObject(nested)) {
		return {
			code: errorCode(nested),
			message: stringOr(nested["message"], fallback),
			requestId: typeof nested["requestId"] === "string" ? nested["requestId"] : requestId,
		};
	}
	if (typeof nested === "string") {
		return { code: nested, message: stringOr(data["message"], nested), requestId };
	}
	return {
		code: typeof data["code"] === "string" ? data["code"] : undefined,
		message: stringOr(data["message"], fallback),
		requestId,
	};
}

/** Strip `stream` from the body; the note explains the silent adjustment. */
function prepareBody(request: ExaRequest): { body: JsonObject | undefined; notes: string[] } {
	if (!request.body) return { body: undefined, notes: [] };
	const body = { ...request.body };
	const stream = body["stream"];
	if (stream !== true && stream !== false) return { body, notes: [] };
	delete body["stream"];
	const notes =
		stream === true ? ["`stream: true` was ignored: this extension always uses non-streaming JSON responses"] : [];
	return { body, notes };
}

interface ParsedResponse {
	data: unknown;
	text: string;
}

/** Read the body once and reject the shapes this client cannot represent. */
async function parseResponse(response: Response, requestId: string | undefined): Promise<ParsedResponse> {
	const text = await response.text();
	if (text.trim().length === 0) return { data: undefined, text };
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("text/event-stream")) {
		throw new ExaApiError(
			response.status,
			"STREAMING_UNSUPPORTED",
			"received an event stream; remove `stream: true` and retry",
			requestId,
		);
	}
	try {
		return { data: JSON.parse(text), text };
	} catch {
		if (response.ok) {
			throw new ExaApiError(response.status, "BAD_RESPONSE", `response was not JSON: ${text.slice(0, 300)}`, requestId);
		}
		return { data: undefined, text };
	}
}

export class ExaClient {
	private readonly config: ResolvedConfig;

	constructor(config: ResolvedConfig) {
		this.config = config;
	}

	get configSnapshot(): ResolvedConfig {
		return this.config;
	}

	hasApiKey(): boolean {
		return typeof this.config.apiKey === "string" && this.config.apiKey.length > 0;
	}

	async send(request: ExaRequest): Promise<ExaResponse> {
		if (!this.hasApiKey()) {
			throw new ExaApiError(
				0,
				"NO_API_KEY",
				'no Exa API key configured: set EXA_API_KEY or add {"apiKey": "..."} to ~/.pi/agent/exa.json',
			);
		}
		const { body, notes } = prepareBody(request);

		const url = `${this.config.baseUrl}${request.path}${buildQuery(request.query)}`;
		const headers: Record<string, string> = {
			"content-type": "application/json",
			"x-api-key": this.config.apiKey as string,
			...this.config.headers,
		};
		if (request.beta) headers["exa-beta"] = request.beta;

		let response: Response;
		try {
			response = await fetch(url, {
				method: request.method,
				headers,
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: combineSignals(request.signal, request.timeoutMs ?? this.config.timeoutMs),
			});
		} catch (error) {
			throw new ExaApiError(0, undefined, describeError(error));
		}

		const requestId = response.headers.get("x-request-id") ?? undefined;
		const { data, text } = await parseResponse(response, requestId);

		if (!response.ok) {
			const parsed = parseErrorPayload(data, text.slice(0, 500) || response.statusText);
			throw new ExaApiError(
				response.status,
				parsed.code,
				parsed.message ?? "request failed",
				parsed.requestId ?? requestId,
			);
		}

		const responseRequestId =
			isJsonObject(data) && typeof data["requestId"] === "string" ? data["requestId"] : requestId;
		return { status: response.status, requestId: responseRequestId, data, notes };
	}
}
