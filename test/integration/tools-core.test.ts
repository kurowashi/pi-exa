/**
 * Behavior of the always-on core tools and exa_similar: request assembly,
 * result formatting, defaults, and the error path returned to the model.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { registerCoreTools } from "../../src/tools/core.ts";
import { registerSimilarTool } from "../../src/tools/similar.ts";
import { createToolHarness, responseOf, toolDetails, toolText } from "../helpers/tool-harness.ts";

test("exa_search assembles the curated body, merges options, and formats results", async () => {
	const h = createToolHarness(registerCoreTools);
	h.queue(
		responseOf({ results: [{ title: "Counts", url: "https://example.test/a", highlights: ["42"] }] }, ["adjusted"]),
	);
	const result = await h.call("exa_search", { query: "answer", numResults: 3, options: { moderation: true } });

	assert.equal(h.sent[0]?.method, "POST");
	assert.equal(h.sent[0]?.path, "/search");
	const body = h.sent[0]?.body as Record<string, unknown>;
	assert.equal(body["query"], "answer");
	assert.equal(body["numResults"], 3);
	assert.equal(body["moderation"], true);
	assert.deepEqual(body["contents"], { highlights: true }, "the default content mode is applied");
	assert.match(toolText(result), /^note: adjusted/);
	assert.match(toolText(result), /Counts/);
	assert.equal(toolDetails(result)["tool"], "exa_search");
});

test("exa_search honors an explicit content mode and reports client errors", async () => {
	const h = createToolHarness(registerCoreTools);
	h.queue(responseOf({ results: [] }));
	await h.call("exa_search", { query: "q", content: "none" });
	const noneRequest = h.sent[0];
	assert.ok(noneRequest);
	assert.equal(
		(noneRequest.body as Record<string, unknown>)["contents"],
		undefined,
		"content=none must not ask for any content mode",
	);

	h.queue(responseOf({ results: [] }));
	await h.call("exa_search", { query: "q", content: "text+highlights" });
	const bothRequest = h.sent[1];
	assert.ok(bothRequest);
	assert.deepEqual(
		(bothRequest.body as Record<string, unknown>)["contents"],
		{ text: true, highlights: true },
		"content=text+highlights must ask for both views",
	);

	h.queue(new Error("upstream down"));
	const failed = await h.call("exa_search", { query: "q" });
	assert.match(toolText(failed), /Error: upstream down/);
	assert.equal(toolDetails(failed)["error"], true);
});

test("exa_contents sends urls and defaults to text", async () => {
	const h = createToolHarness(registerCoreTools);
	h.queue(responseOf({ results: [{ url: "https://example.test/a", text: "body" }] }));
	const result = await h.call("exa_contents", { urls: ["https://example.test/a"] });

	assert.equal(h.sent[0]?.path, "/contents");
	const body = h.sent[0]?.body as Record<string, unknown>;
	assert.deepEqual(body["urls"], ["https://example.test/a"]);
	assert.deepEqual(body["text"], true);
	assert.match(toolText(result), /body/);
	assert.equal(toolDetails(result)["tool"], "exa_contents");
});

test("exa_answer renders the grounded answer and citations", async () => {
	const h = createToolHarness(registerCoreTools);
	h.queue(
		responseOf({
			answer: "42",
			citations: [{ title: "The Answer", url: "https://example.test/42", publishedDate: "2025-01-01" }],
		}),
	);
	const result = await h.call("exa_answer", { query: "life" });

	assert.equal(h.sent[0]?.path, "/answer");
	assert.match(toolText(result), /Exa answer: "life"/);
	assert.match(toolText(result), /42/);
	assert.match(toolText(result), /The Answer/);
	assert.equal(toolDetails(result)["tool"], "exa_answer");
});

test("exa_similar posts to /findSimilar and formats like a search", async () => {
	const h = createToolHarness(registerSimilarTool);
	h.queue(responseOf({ results: [{ title: "Neighbor", url: "https://example.test/n" }] }));
	const result = await h.call("exa_similar", { url: "https://example.test/a" });

	assert.equal(h.sent[0]?.path, "/findSimilar");
	const similar = h.sent[0];
	assert.ok(similar);
	assert.equal((similar.body as Record<string, unknown>)["url"], "https://example.test/a");
	assert.match(toolText(result), /Exa similar/);
	assert.match(toolText(result), /Neighbor/);
	assert.equal(toolDetails(result)["tool"], "exa_similar");
});
