/**
 * ExaClient behavior against a stubbed fetch: request assembly, response
 * parsing, and the error taxonomy the tools surface to the model.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { describeError, ExaApiError, ExaClient, parseErrorPayload } from "../../src/client.ts";
import { resolveConfig } from "../../src/config.ts";
import { GROUP_NAMES } from "../../src/registry.ts";
import type { ExaConfigFile, ResolvedConfig } from "../../src/types.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function configWith(file: ExaConfigFile = {}): ResolvedConfig {
	return resolveConfig(
		{ globalFile: "", projectFile: "", configs: [{ apiKey: "test-key", ...file }], warnings: [] },
		{ knownGroups: GROUP_NAMES },
	);
}

interface FetchCall {
	url: string;
	init: RequestInit;
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): FetchCall[] {
	const calls: FetchCall[] = [];
	globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
		const call = { url: String(input), init: init ?? {} };
		calls.push(call);
		return handler(call.url, call.init);
	}) as typeof fetch;
	return calls;
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

test("send refuses to run without an API key", async () => {
	const saved = process.env["EXA_API_KEY"];
	delete process.env["EXA_API_KEY"];
	try {
		const client = new ExaClient(
			resolveConfig({ globalFile: "", projectFile: "", configs: [], warnings: [] }, { knownGroups: GROUP_NAMES }),
		);
		assert.equal(client.hasApiKey(), false);
		await assert.rejects(client.send({ method: "POST", path: "/search" }), (error: unknown) => {
			assert.ok(error instanceof ExaApiError);
			assert.equal(error.status, 0);
			assert.equal(error.code, "NO_API_KEY");
			return true;
		});
	} finally {
		if (saved === undefined) delete process.env["EXA_API_KEY"];
		else process.env["EXA_API_KEY"] = saved;
	}
});

test("send assembles url, headers, and body from the request and config", async () => {
	const calls = stubFetch(() => jsonResponse({ ok: true }, 200, { "x-request-id": "req_header" }));
	const client = new ExaClient(configWith({ baseUrl: "https://example.test/", headers: { "x-proxy": "p" } }));
	const response = await client.send({
		method: "POST",
		path: "/search",
		body: { query: "hi" },
		query: { array: ["a", "b"], object: { k: 1 }, empty: "", nil: null, undef: undefined, num: 3 },
		beta: "batches-2026-06-06",
	});

	assert.equal(response.status, 200);
	assert.equal(response.requestId, "req_header");
	assert.deepEqual(response.notes, []);
	assert.equal(calls.length, 1);
	const [call] = calls;
	assert.ok(call);
	assert.ok(call.url.startsWith("https://example.test/search?"), `unexpected url ${call.url}`);
	assert.match(call.url, /array=a&array=b/);
	assert.match(call.url, /object=%7B%22k%22%3A1%7D/);
	assert.match(call.url, /num=3/);
	assert.ok(!call.url.includes("empty="));
	assert.ok(!call.url.includes("nil="));
	const headers = new Headers(call.init.headers);
	assert.equal(headers.get("x-api-key"), "test-key");
	assert.equal(headers.get("x-proxy"), "p");
	assert.equal(headers.get("exa-beta"), "batches-2026-06-06");
	assert.deepEqual(JSON.parse(String(call.init.body)), { query: "hi" });
});

test("send drops stream flags and explains why", async () => {
	stubFetch(() => jsonResponse({}));
	const client = new ExaClient(configWith());
	const dropped = await client.send({ method: "POST", path: "/answer", body: { stream: true, query: "q" } });
	assert.deepEqual(dropped.notes, [
		"`stream: true` was ignored: this extension always uses non-streaming JSON responses",
	]);
	const silent = await client.send({ method: "POST", path: "/answer", body: { stream: false, query: "q" } });
	assert.deepEqual(silent.notes, []);
});

test("send tolerates an empty body and falls back to the header request id", async () => {
	stubFetch(() => new Response("", { status: 200 }));
	const client = new ExaClient(configWith());
	const response = await client.send({ method: "DELETE", path: "/agent/runs/x" });
	assert.equal(response.status, 200);
	assert.equal(response.data, undefined);
	assert.equal(response.requestId, undefined);
});

test("send surfaces nested API errors with code and request id", async () => {
	stubFetch(() =>
		jsonResponse({ error: { code: "INVALID_REQUEST", message: "bad query", requestId: "req_body" } }, 422, {
			"x-request-id": "req_header",
		}),
	);
	const client = new ExaClient(configWith());
	await assert.rejects(client.send({ method: "POST", path: "/search" }), (error: unknown) => {
		assert.ok(error instanceof ExaApiError);
		assert.equal(error.status, 422);
		assert.equal(error.code, "INVALID_REQUEST");
		assert.equal(error.message, "bad query");
		assert.equal(error.requestId, "req_body");
		return true;
	});
});

test("send falls back to text when an error body is not JSON", async () => {
	stubFetch(() => new Response("upstream exploded", { status: 502, statusText: "Bad Gateway" }));
	const client = new ExaClient(configWith());
	await assert.rejects(client.send({ method: "GET", path: "/search" }), (error: unknown) => {
		assert.ok(error instanceof ExaApiError);
		assert.equal(error.message, "upstream exploded");
		return true;
	});
});

test("send rejects a non-JSON success body as BAD_RESPONSE", async () => {
	stubFetch(() => new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } }));
	const client = new ExaClient(configWith());
	await assert.rejects(client.send({ method: "POST", path: "/search" }), (error: unknown) => {
		assert.ok(error instanceof ExaApiError);
		assert.equal(error.code, "BAD_RESPONSE");
		return true;
	});
});

test("send rejects event streams with a fix hint", async () => {
	stubFetch(() => new Response("data: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }));
	const client = new ExaClient(configWith());
	await assert.rejects(client.send({ method: "POST", path: "/search" }), (error: unknown) => {
		assert.ok(error instanceof ExaApiError);
		assert.equal(error.code, "STREAMING_UNSUPPORTED");
		return true;
	});
});

test("send wraps a network failure and maps timeouts and aborts", async () => {
	const client = new ExaClient(configWith());
	stubFetch(() => Promise.reject(new Error("socket reset")));
	await assert.rejects(client.send({ method: "GET", path: "/search" }), (error: unknown) => {
		assert.ok(error instanceof ExaApiError);
		assert.equal(error.message, "socket reset");
		return true;
	});

	// The reasons fetch rejects with when the deadline or the caller aborts.
	stubFetch(() => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
	await assert.rejects(client.send({ method: "GET", path: "/search" }), (error: unknown) => {
		assert.ok(error instanceof ExaApiError);
		assert.match(error.message, /timed out/);
		return true;
	});

	stubFetch(() => Promise.reject(new DOMException("This operation was aborted", "AbortError")));
	await assert.rejects(client.send({ method: "GET", path: "/search" }), (error: unknown) => {
		assert.ok(error instanceof ExaApiError);
		assert.match(error.message, /aborted/);
		return true;
	});
});

test("send combines the caller signal with the request deadline", async () => {
	let seen: AbortSignal | undefined;
	stubFetch((_url, init) => {
		seen = init.signal ?? undefined;
		return init.signal?.aborted ? Promise.reject(init.signal.reason) : jsonResponse({});
	});
	const controller = new AbortController();
	const client = new ExaClient(configWith());
	const response = await client.send({ method: "GET", path: "/search", signal: controller.signal, timeoutMs: 5_000 });
	assert.equal(response.status, 200);
	assert.ok(seen);
	assert.equal(seen.aborted, false);
	controller.abort();
	assert.equal(seen.aborted, true);
	assert.equal(seen.reason, controller.signal.reason);

	const preAborted = new AbortController();
	preAborted.abort();
	await assert.rejects(
		client.send({ method: "GET", path: "/search", signal: preAborted.signal, timeoutMs: 5_000 }),
		(error: unknown) => error instanceof ExaApiError && /aborted/i.test(error.message),
	);
});

test("describeError covers each error kind", () => {
	assert.equal(
		describeError(new ExaApiError(429, "RATE_LIMITED", "slow down", "req_1")),
		"Exa API 429 error [RATE_LIMITED] slow down (request req_1)",
	);
	assert.equal(describeError(new ExaApiError(500, "boom", "boom", undefined)), "Exa API 500 error boom");
	const timeout = new Error("timed out");
	timeout.name = "TimeoutError";
	assert.match(describeError(timeout), /timed out/);
	const abort = new Error("gone");
	abort.name = "AbortError";
	assert.equal(describeError(abort), "Exa request was aborted");
	assert.equal(describeError(new Error("plain")), "plain");
	assert.equal(describeError("string"), "string");
});

test("parseErrorPayload reads the shapes Exa actually returns", () => {
	assert.deepEqual(parseErrorPayload({ error: { type: "TYPE_CODE", message: "m" } }, "fallback"), {
		code: "TYPE_CODE",
		message: "m",
		requestId: undefined,
	});
	assert.deepEqual(parseErrorPayload({ error: "string_code", message: "outer" }, "fallback"), {
		code: "string_code",
		message: "outer",
		requestId: undefined,
	});
	assert.deepEqual(parseErrorPayload({ code: "C", message: "m", requestId: "r" }, "fallback"), {
		code: "C",
		message: "m",
		requestId: "r",
	});
	assert.deepEqual(parseErrorPayload("not an object", "fallback"), { message: "fallback" });
});
