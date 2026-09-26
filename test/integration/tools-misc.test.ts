/**
 * Behavior of exa_request (verbatim endpoint access) and exa_help (progressive
 * disclosure): path validation, request forwarding, and group activation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHelpTool } from "../../src/tools/help.ts";
import { registerRequestTool } from "../../src/tools/request.ts";
import { createToolHarness, responseOf, toolDetails, toolText } from "../helpers/tool-harness.ts";

test("exa_request forwards method, path, body, query, and beta", async () => {
	const h = createToolHarness(registerRequestTool);
	h.queue(responseOf({ ok: true }));
	await h.call("exa_request", {
		method: "POST",
		path: "/search",
		body: { query: "q" },
		query: { limit: 1 },
		beta: "batches-2026-06-06",
	});

	assert.equal(h.sent[0]?.method, "POST");
	assert.equal(h.sent[0]?.path, "/search");
	assert.deepEqual(h.sent[0]?.body, { query: "q" });
	assert.deepEqual(h.sent[0]?.query, { limit: 1 });
	assert.equal(h.sent[0]?.beta, "batches-2026-06-06");
});

test("exa_request rejects urls and unknown paths without sending", async () => {
	const h = createToolHarness(registerRequestTool);
	const url = await h.call("exa_request", { method: "GET", path: "https://api.exa.ai/search" });
	assert.equal(toolDetails(url)["error"], true);
	const unknown = await h.call("exa_request", { method: "GET", path: "/not-a-real-endpoint" });
	assert.match(toolText(unknown), /not a documented Exa endpoint/);
	assert.equal(h.sent.length, 0);
});

test("exa_request surfaces client failures", async () => {
	const h = createToolHarness(registerRequestTool);
	h.queue(new Error("network down"));
	const result = await h.call("exa_request", { method: "GET", path: "/search" });
	assert.match(toolText(result), /Error: network down/);
	assert.equal(toolDetails(result)["error"], true);
});

test("exa_help returns a topic and activates the requested groups", async () => {
	const h = createToolHarness(registerHelpTool);
	const result = await h.call("exa_help", { topic: "overview" });
	assert.match(toolText(result), /Active groups/);
	assert.equal(toolDetails(result)["tool"], "exa_help");

	const activated = await h.call("exa_help", { topic: "search", activate: ["agent", "monitors"] });
	assert.deepEqual(h.activated[1], ["core", "agent", "monitors"]);
	assert.match(toolText(activated), /Active groups/);
});

test("exa_help reports an unknown topic instead of throwing", async () => {
	const h = createToolHarness(registerHelpTool);
	const result = await h.call("exa_help", { topic: "definitely-not-a-topic" });
	assert.match(toolText(result), /Unknown topic/);
});
