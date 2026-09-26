import test from "node:test";
import assert from "node:assert/strict";
import { applyContentMode, buildBody, hasContentMode, queryFrom, withContentMode } from "../src/body.ts";

test("buildBody applies defaults, then curated fields, then options", () => {
	const body = buildBody(
		{ type: "auto", numResults: 5, contents: { highlights: true, maxAgeHours: 24 } },
		{ query: "hello", numResults: 8 },
		{ numResults: 2, moderation: true },
	);
	assert.deepEqual(body, {
		type: "auto",
		numResults: 2,
		query: "hello",
		moderation: true,
		contents: { highlights: true, maxAgeHours: 24 },
	});
});

test("buildBody keeps query out of the body", () => {
	const body = buildBody({}, { query: "x" }, { query: { limit: 5 }, extra: 1 });
	assert.deepEqual(body, { query: "x", extra: 1 });
});

test("applyContentMode replaces configured modes but keeps other content options", () => {
	const body: Record<string, unknown> = { contents: { text: true, maxAgeHours: 0 } };
	applyContentMode(body, "highlights");
	assert.deepEqual(body.contents, { highlights: true, maxAgeHours: 0 });

	applyContentMode(body, "none");
	assert.deepEqual(body.contents, { maxAgeHours: 0 });

	applyContentMode(body, "text+highlights");
	assert.deepEqual(body.contents, { text: true, highlights: true, maxAgeHours: 0 });
});

test("applyContentMode with nested=false writes top-level keys", () => {
	const body: Record<string, unknown> = { urls: ["https://example.com"], text: true };
	applyContentMode(body, "summary", false);
	assert.deepEqual(body, { urls: ["https://example.com"], summary: {} });
	assert.equal(hasContentMode(body, false), true);
});

test("hasContentMode detects configured nested modes", () => {
	assert.equal(hasContentMode({ contents: { maxAgeHours: 0 } }), false);
	assert.equal(hasContentMode({ contents: { highlights: true } }), true);
	assert.equal(hasContentMode({ contents: {} }), false);
});

test("withContentMode applies the curated mode before options merge", () => {
	const body = buildBody(
		withContentMode({ contents: { highlights: true, maxAgeHours: 24 } }, "text"),
		{},
		{ contents: { maxCharacters: 100 } },
	);
	assert.deepEqual(body, { contents: { maxAgeHours: 24, text: true, maxCharacters: 100 } });
});

test("withContentMode keeps a same-key setting instead of flattening it to true", () => {
	const body = withContentMode({ text: { maxCharacters: 12000 }, maxAgeHours: 24 }, "text", false);
	assert.deepEqual(body, { maxAgeHours: 24, text: { maxCharacters: 12000 } });
});

test("withContentMode replaces a disabled setting with the requested mode", () => {
	const body = withContentMode({ contents: { highlights: false } }, "highlights");
	assert.deepEqual(body, { contents: { highlights: true } });
});

test("queryFrom reads the transport hint from options", () => {
	assert.deepEqual(queryFrom({ query: { limit: 5, successful: true } }), { limit: 5, successful: true });
	assert.deepEqual(queryFrom(undefined), {});
	assert.deepEqual(queryFrom({ limit: 5 }), {});
});
