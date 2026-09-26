import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_OUTPUT } from "../../src/config.ts";
import { formatAgentRun, formatAnswer, formatContents, formatSearch, truncate } from "../../src/format.ts";

const output = { ...DEFAULT_OUTPUT, maxTotalChars: 10_000 };

const searchData = {
	requestId: "req_1",
	resolvedSearchType: "auto",
	results: [
		{
			title: "First page",
			url: "https://example.com/1",
			publishedDate: "2026-01-02",
			author: "Ada",
			highlights: ["relevant excerpt one", "relevant excerpt two"],
		},
		{
			title: "Second page",
			url: "https://example.com/2",
			text: "x".repeat(500),
			extras: {
				links: ["https://example.com/link"],
				imageLinks: ["https://example.com/a.png", "https://example.com/b.png", "https://example.com/c.png"],
			},
		},
	],
	costDollars: { total: 0.0065 },
};

test("formatSearch renders headers, results, and cost", () => {
	const text = formatSearch(searchData, output, { query: "example", type: "auto", count: 2 });
	assert.match(text, /Exa search: "example"/);
	assert.match(text, /type=auto/);
	assert.match(text, /2 results/);
	assert.match(text, /cost \$0\.0065/);
	assert.match(text, /1\. First page/);
	assert.match(text, /- relevant excerpt one/);
	assert.match(text, /2\. Second page/);
	assert.match(text, /links \(1\): https:\/\/example\.com\/link/);
	assert.match(text, /images \(3\): https:\/\/example\.com\/a\.png/);
});

test("formatSearch obeys maxResults and maxTotalChars", () => {
	const many = {
		results: Array.from({ length: 30 }, (_value, index) => ({
			title: `Page ${index}`,
			url: `https://example.com/${index}`,
			text: "y".repeat(2000),
		})),
	};
	const text = formatSearch(many, { ...output, maxResults: 5, maxTotalChars: 3000 }, {});
	assert.match(text, /result[s]? omitted by the output budget/);
	assert.ok(text.length < 3600, `expected a bounded result, got ${text.length} chars`);
});

test("formatSearch truncates an over-budget synthesized output instead of dropping it", () => {
	const big = {
		output: { content: { report: "A".repeat(30_000) } },
		results: [{ title: "Page", url: "https://example.com/1" }],
	};
	const text = formatSearch(big, { ...output, maxTotalChars: 4000 }, {});
	assert.match(text, /Synthesized output:/);
	assert.match(text, /truncated \d+ chars by the output budget/);
	assert.ok(text.length < 4300, `expected a bounded result, got ${text.length} chars`);
});

test("formatContents reports per-url statuses and failures", () => {
	const data = {
		results: [{ title: "Page", url: "https://ok.example", text: "hello" }],
		statuses: [
			{ id: "https://ok.example", status: "success", source: "cached" },
			{ id: "https://bad.example", status: "error", error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 } },
		],
		costDollars: { total: 0.001 },
	};
	const text = formatContents(data, output);
	assert.match(text, /Exa contents: 1 page/);
	assert.match(text, /\[success\/cached\]/);
	assert.match(text, /failed: https:\/\/bad\.example \(CRAWL_NOT_FOUND HTTP 404\)/);
});

test("formatAnswer renders structured answers and citations", () => {
	const data = {
		answer: { winner: "M4", reasons: ["efficiency"] },
		citations: [{ title: "Review", url: "https://example.com/review", publishedDate: "2026-03-01" }],
		costDollars: { total: 0.005 },
	};
	const text = formatAnswer(data, output, "Which is better?");
	assert.match(text, /Exa answer: "Which is better\?"/);
	assert.match(text, /"winner": "M4"/);
	assert.match(text, /1\. Review/);
});

test("formatAgentRun surfaces status, output, grounding, and pending guidance", () => {
	const completed = formatAgentRun(
		{
			id: "agent_run_1",
			status: "completed",
			stopReason: "schema_satisfied",
			usage: { agentComputeUnits: 2.5, searches: 12 },
			costDollars: { total: 0.31 },
			output: {
				text: "Answer text",
				structured: { companies: [{ name: "Acme" }] },
				grounding: [
					{ field: "structured.companies[0].name", citations: [{ url: "https://acme.test" }], confidence: "high" },
				],
			},
		},
		output,
	);
	assert.match(completed, /status=completed stopReason=schema_satisfied/);
	assert.match(completed, /usage: 2\.5 ACU, 12 searches/);
	assert.match(completed, /Answer:\n\s+Answer text/);
	assert.match(completed, /"name": "Acme"/);
	assert.match(completed, /structured\.companies\[0\]\.name \[high\] → https:\/\/acme\.test/);
	assert.doesNotMatch(completed, /still running/);

	const running = formatAgentRun(
		{ id: "agent_run_2", status: "running", output: { text: "", structured: null, grounding: [] } },
		output,
	);
	assert.match(running, /still running\. Call exa_agent_get with runId=agent_run_2/);
});

test("truncate keeps the head and marks the cut", () => {
	const text = truncate("abcdefghij", 4);
	assert.match(text, /^abcd\n…\[truncated 6 chars\]$/);
	assert.equal(truncate("abc", 10), "abc");
});
