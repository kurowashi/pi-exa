import assert from "node:assert/strict";
import test from "node:test";
import {
	ENDPOINTS,
	helpText,
	isKnownPath,
	nearestPaths,
	normalizeRequestPath,
	TOPICS,
	topicNames,
} from "../../src/reference.ts";
import { GROUP_NAMES, HELP_TOOL, MANAGED_TOOLS, TOOL_SIGNATURES, toolsForGroups } from "../../src/registry.ts";

test("every endpoint is documented by a topic", () => {
	for (const endpoint of ENDPOINTS) {
		assert.ok(TOPICS[endpoint.topic], `${endpoint.method} ${endpoint.path} points at unknown topic ${endpoint.topic}`);
	}
	const covered = new Set(ENDPOINTS.map((endpoint) => `${endpoint.method} ${endpoint.path}`));
	assert.ok(covered.has("POST /search"));
	assert.ok(covered.has("POST /contents"));
	assert.ok(covered.has("POST /answer"));
	assert.ok(covered.has("POST /findSimilar"));
	assert.ok(covered.has("POST /agent/runs"));
	assert.ok(covered.has("POST /websets/v0/websets"));
	assert.ok(covered.has("GET /websets/v0/teams/me"));
	assert.ok(covered.has("GET /research/v0/tasks/{id}"));
});

test("topic groups reference known groups", () => {
	for (const [name, topic] of Object.entries(TOPICS)) {
		for (const group of topic.groups) {
			assert.ok(GROUP_NAMES.includes(group), `topic ${name} references unknown group ${group}`);
		}
	}
});

test("every topic returns documentation", () => {
	for (const name of topicNames()) {
		const text = helpText(name);
		assert.ok(text.length > 50, `topic ${name} is too short`);
		assert.doesNotMatch(text, /Unknown topic/);
	}
	assert.match(helpText("nope"), /Unknown topic/);
});

test("the overview lists every endpoint path", () => {
	const overview = helpText("overview");
	for (const endpoint of ENDPOINTS) {
		assert.ok(overview.includes(endpoint.path), `overview misses ${endpoint.path}`);
	}
});

test("isKnownPath accepts templates with ids and rejects unknown paths", () => {
	assert.ok(isKnownPath("/search"));
	assert.ok(isKnownPath("/agent/runs/agent_run_abc"));
	assert.ok(isKnownPath("/websets/v0/websets/webset_123/items/item_9"));
	assert.ok(isKnownPath("/websets/v0/websets?expand=items".split("?")[0] as string));
	assert.ok(!isKnownPath("/nope"));
	assert.ok(!isKnownPath("/websets/v0/websets/webset_123/unknown"));
});

test("nearestPaths suggests documented paths", () => {
	const suggestions = nearestPaths("/websets/v0/webset");
	assert.ok(suggestions.some((path) => path.startsWith("/websets/v0/websets")));
	assert.ok(suggestions.length > 0);
});

test("normalizeRequestPath rejects URLs and traversal", () => {
	assert.equal(normalizeRequestPath("search").path, "/search");
	assert.match(normalizeRequestPath("https://api.exa.ai/search").error ?? "", /path/);
	assert.match(normalizeRequestPath("/../etc/passwd").error ?? "", /\.\./);
});

test("registry groups and signatures stay in sync", () => {
	const signatureKeys = Object.keys(TOOL_SIGNATURES).sort();
	const expected = MANAGED_TOOLS.filter((name) => name !== HELP_TOOL).sort();
	assert.deepEqual(signatureKeys, expected);
	const core = toolsForGroups(["core"]);
	assert.ok(core.includes(HELP_TOOL));
	assert.ok(core.includes("exa_search"));
	assert.ok(!core.includes("exa_agent_run"));
	assert.ok(toolsForGroups(["all"]).includes("exa_request"));
});
