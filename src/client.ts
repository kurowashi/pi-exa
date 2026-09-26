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
	body?: JsonObject;
	query?: Record<string, unknown>;
	/** Value for the `Exa-Beta` header (e.g. "batches-2026-06-06"). */
	beta?: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}

export interface ExaResponse {
	status: number;
	requestId?: string;
	data: unknown;
	/** Non-fatal adjustments made to the request (e.g. dropped `stream`). */
	notes: string[];
}

export class ExaApiError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly requestId?: string;

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
		if (error.name === "TimeoutError") return "Exa request timed out (narrow the request, or ask the user to raise timeoutMs in ~/.pi/agent/exa.json)";
		if (error.name === "AbortError") return "Exa request was aborted";
		return error.message;
	}
	return String(error);
}

function buildQuery(query: Record<string, unknown> | undefined): string {
	if (!query) return "";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item === undefined || item === null) continue;
				params.append(key, typeof item === "string" ? item : JSON.stringify(item));
			}
		} else if (typeof value === "object") {
			params.append(key, JSON.stringify(value));
		} else {
			params.append(key, String(value));
		}
	}
	const text = params.toString();
	return text ? `?${text}` : "";
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	if (!signal) return timeout;
	const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
	if (typeof anySignal === "function") return anySignal.call(AbortSignal, [signal, timeout]);
	const controller = new AbortController();
	const abort = (reason: unknown): void => controller.abort(reason);
	if (signal.aborted) abort(signal.reason);
	else signal.addEventListener("abort", () => abort(signal.reason), { once: true });
	if (timeout.aborted) abort(timeout.reason);
	else timeout.addEventListener("abort", () => abort(timeout.reason), { once: true });
	return controller.signal;
}

interface ParsedError {
	code?: string;
	message?: string;
	requestId?: string;
}

export function parseErrorPayload(data: unknown, fallback: string): ParsedError {
	if (!isJsonObject(data)) return { message: fallback };
	const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
	const nested = data.error;
	if (isJsonObject(nested)) {
		const code = typeof nested.code === "string" ? nested.code : typeof nested.type === "string" ? nested.type : undefined;
		const message = typeof nested.message === "string" ? nested.message : fallback;
		return { code, message, requestId: typeof nested.requestId === "string" ? nested.requestId : requestId };
	}
	if (typeof nested === "string") {
		const message = typeof data.message === "string" ? String(data.message) : nested;
		return { code: nested, message, requestId };
	}
	const message = typeof data.message === "string" ? data.message : fallback;
	const code = typeof data.code === "string" ? data.code : undefined;
	return { code, message, requestId };
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
				"no Exa API key configured: set EXA_API_KEY or add {\"apiKey\": \"...\"} to ~/.pi/agent/exa.json",
			);
		}
		const notes: string[] = [];
		const body = request.body ? { ...request.body } : undefined;
		if (body && "stream" in body && body.stream === true) {
			delete body.stream;
			notes.push("`stream: true` was ignored: this extension always uses non-streaming JSON responses");
		}
		if (body && "stream" in body && body.stream === false) delete body.stream;

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
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: combineSignals(request.signal, request.timeoutMs ?? this.config.timeoutMs),
			});
		} catch (error) {
			throw new ExaApiError(0, undefined, describeError(error));
		}

		const requestId = response.headers.get("x-request-id") ?? undefined;
		const text = await response.text();
		let data: unknown = undefined;
		const contentType = response.headers.get("content-type") ?? "";
		if (text.trim().length > 0) {
			if (contentType.includes("text/event-stream")) {
				throw new ExaApiError(
					response.status,
					"STREAMING_UNSUPPORTED",
					"received an event stream; remove `stream: true` and retry",
					requestId,
				);
			}
			try {
				data = JSON.parse(text);
			} catch {
				if (response.ok) {
					throw new ExaApiError(response.status, "BAD_RESPONSE", `response was not JSON: ${text.slice(0, 300)}`, requestId);
				}
				data = undefined;
			}
		}

		if (!response.ok) {
			const parsed = parseErrorPayload(data, text.slice(0, 500) || response.statusText);
			throw new ExaApiError(response.status, parsed.code, parsed.message ?? "request failed", parsed.requestId ?? requestId);
		}

		const responseRequestId =
			isJsonObject(data) && typeof data.requestId === "string" ? data.requestId : requestId;
		return { status: response.status, requestId: responseRequestId, data, notes };
	}
}
