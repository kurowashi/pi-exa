import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { DEFAULT_OUTPUT, deepMerge, loadConfigs, resolveApiKey, resolveConfig } from "../../src/config.ts";

function withTempDir<T>(fn: (dir: string) => T): T {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-exa-config-"));
	try {
		return fn(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function withEnv(names: string[], fn: () => void): void {
	const saved = new Map(names.map((name) => [name, process.env[name]]));
	try {
		fn();
	} finally {
		for (const [name, value] of saved) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
}

test("deepMerge merges objects recursively and replaces arrays", () => {
	const merged = deepMerge(
		{ contents: { highlights: true, maxAgeHours: 24 }, tags: ["a"] },
		{ contents: { text: true }, tags: ["b", "c"] },
	);
	assert.deepEqual(merged, { contents: { highlights: true, maxAgeHours: 24, text: true }, tags: ["b", "c"] });
});

test("resolveApiKey prefers the configured env var, then EXA_API_KEY, then a literal key", () => {
	withEnv(["EXA_API_KEY", "MY_EXA_KEY"], () => {
		process.env["EXA_API_KEY"] = "from-default-env";
		process.env["MY_EXA_KEY"] = "from-configured-env";
		assert.deepEqual(resolveApiKey([{ apiKeyEnv: "MY_EXA_KEY", apiKey: "literal" }]), {
			apiKey: "from-configured-env",
			source: "env:MY_EXA_KEY",
		});
		delete process.env["MY_EXA_KEY"];
		assert.deepEqual(resolveApiKey([{ apiKeyEnv: "MY_EXA_KEY", apiKey: "literal" }]), {
			apiKey: "from-default-env",
			source: "env:EXA_API_KEY",
		});
		delete process.env["EXA_API_KEY"];
		assert.deepEqual(resolveApiKey([{ apiKey: "literal" }]), { apiKey: "literal", source: "config" });
		const missing = resolveApiKey([{}]);
		assert.equal(missing.apiKey, undefined);
		assert.match(missing.warning ?? "", /no Exa API key/);
	});
});

test("loadConfigs merges global then project config when trusted", () => {
	withTempDir((dir) => {
		const agentDir = path.join(dir, "agent");
		const cwd = path.join(dir, "project");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		process.env["PI_CODING_AGENT_DIR"] = agentDir;
		try {
			fs.writeFileSync(
				path.join(agentDir, "exa.json"),
				JSON.stringify({ baseUrl: "https://global.test", timeoutSeconds: 1 }),
			);
			fs.writeFileSync(
				path.join(cwd, ".pi", "exa.json"),
				JSON.stringify({
					baseUrl: "https://project.test",
					defaults: { search: { numResults: 3 } },
					wait: { agent: { timeoutSeconds: 900, pollIntervalSeconds: 3 } },
				}),
			);

			const trusted = resolveConfig(loadConfigs(cwd, true), { knownGroups: ["core", "agent"] });
			assert.equal(trusted.baseUrl, "https://project.test");
			assert.equal(trusted.timeoutMs, 1000);
			assert.equal(trusted.wait.agent.timeoutMs, 900_000);
			assert.equal(trusted.wait.agent.pollIntervalMs, 3_000);
			assert.equal(trusted.defaults.search["numResults"], 3);

			const untrusted = resolveConfig(loadConfigs(cwd, false), { knownGroups: ["core", "agent"] });
			assert.equal(untrusted.baseUrl, "https://global.test");
			assert.deepEqual(untrusted.defaults.search, {});
			assert.ok(untrusted.groups.includes("core"), "warnings do not break defaults");
		} finally {
			delete process.env["PI_CODING_AGENT_DIR"];
		}
	});
});

test("resolveConfig validates groups and merges output settings", () => {
	const config = resolveConfig(
		{
			globalFile: "/nonexistent/exa.json",
			projectFile: "/nonexistent/.pi/exa.json",
			configs: [{ groups: ["core", "nope"], output: { maxResults: 3 } }, { output: { maxCharsPerResult: 900 } }],
			warnings: [],
		},
		{ knownGroups: ["core", "agent"] },
	);
	assert.deepEqual(config.groups, ["core"]);
	assert.equal(config.output.maxResults, 3);
	assert.equal(config.output.maxCharsPerResult, 900);
	assert.equal(config.output.maxTotalChars, DEFAULT_OUTPUT.maxTotalChars);
	assert.equal(config.wait.agent.timeoutMs, 600_000);
});

test("resolveConfig treats groups 'all' as a wildcard", () => {
	const config = resolveConfig(
		{ globalFile: "g", projectFile: "p", configs: [{ groups: "all" }], warnings: [] },
		{ knownGroups: ["core", "agent"] },
	);
	assert.deepEqual(config.groups, ["all"]);
});
