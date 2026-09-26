/**
 * Extension wiring: tool registration, startup group activation, notifications,
 * and the /exa command surface. The Pi API is mocked; the extension code under
 * test is the real entry.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import exaExtension from "../../src/index.ts";
import { MANAGED_TOOLS, toolsForGroups } from "../../src/registry.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type CommandHandler = (args: string, ctx: ExtensionContext) => unknown;

interface Harness {
	emit(event: string, data: unknown): unknown;
	runCommand(args?: string): Promise<unknown>;
	active(): string[];
	toolNames(): string[];
	notifications: string[];
	ctx: ExtensionContext;
}

function harness(cwd: string, trusted = true): Harness {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, CommandHandler>();
	const tools = new Map<string, ToolDefinition>();
	const notifications: string[] = [];
	let active = [...MANAGED_TOOLS];
	const api = {
		registerTool(tool: ToolDefinition) {
			tools.set(tool.name, tool);
		},
		on(event: string, handler: Handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => {};
		},
		registerCommand(name: string, command: { handler: CommandHandler }) {
			commands.set(name, command.handler);
		},
		getActiveTools: () => [...active],
		setActiveTools: (names: string[]) => {
			active = [...names];
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		cwd,
		hasUI: true,
		isProjectTrusted: () => trusted,
		ui: {
			notify: (message: string) => {
				notifications.push(message);
			},
			theme: { fg: (_color: string, text: string) => text },
		},
	} as unknown as ExtensionContext;
	exaExtension(api);
	return {
		ctx,
		notifications,
		active: () => [...active],
		toolNames: () => [...tools.keys()],
		emit(event, data) {
			let result: unknown;
			for (const handler of handlers.get(event) ?? []) result = handler(data, ctx) ?? result;
			return result;
		},
		runCommand(args = "") {
			const handler = commands.get("exa");
			if (!handler) throw new Error("the exa command is not registered");
			return Promise.resolve(handler(args, ctx));
		},
	};
}

/** Temp cwd + agent dir; EXA_API_KEY is cleared so config files decide the key. */
async function withAgent<T>(
	config: Record<string, unknown> | undefined,
	fn: (cwd: string, home: string) => Promise<T>,
): Promise<T> {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-exa-ext-"));
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-exa-ext-"));
	const savedDir = process.env["PI_CODING_AGENT_DIR"];
	const savedKey = process.env["EXA_API_KEY"];
	delete process.env["EXA_API_KEY"];
	process.env["PI_CODING_AGENT_DIR"] = home;
	try {
		if (config) fs.writeFileSync(path.join(home, "exa.json"), JSON.stringify(config));
		return await fn(cwd, home);
	} finally {
		if (savedDir === undefined) delete process.env["PI_CODING_AGENT_DIR"];
		else process.env["PI_CODING_AGENT_DIR"] = savedDir;
		if (savedKey === undefined) delete process.env["EXA_API_KEY"];
		else process.env["EXA_API_KEY"] = savedKey;
		fs.rmSync(cwd, { recursive: true, force: true });
		fs.rmSync(home, { recursive: true, force: true });
	}
}

function start(h: Harness): void {
	h.emit("session_start", { type: "session_start" });
}

test("loading registers exactly the managed tools", async () => {
	await withAgent(undefined, async (cwd) => {
		const h = harness(cwd);
		assert.deepEqual(h.toolNames().sort(), [...MANAGED_TOOLS].sort());
	});
});

test("session_start narrows the active set to the configured groups", async () => {
	await withAgent({ groups: ["core", "agent"] }, async (cwd) => {
		const h = harness(cwd);
		assert.deepEqual([...h.active()].sort(), [...MANAGED_TOOLS].sort(), "all tools start active");
		start(h);
		assert.deepEqual(h.active().sort(), toolsForGroups(["core", "agent"]).sort());
	});
});

test("session_start announces a non-default base URL and config warnings", async () => {
	await withAgent({ baseUrl: "https://proxy.example.test/", groups: ["bogus"] }, async (cwd) => {
		const h = harness(cwd);
		start(h);
		assert.ok(
			h.notifications.some((message) => message.includes("using baseUrl https://proxy.example.test")),
			h.notifications.join("\n"),
		);
		assert.ok(h.notifications.some((message) => message.includes("unknown tool group")));
	});
});

test("/exa status reports the effective configuration", async () => {
	await withAgent(undefined, async (cwd) => {
		const h = harness(cwd);
		start(h);
		await h.runCommand("status");
		const report = h.notifications.at(-1) ?? "";
		assert.match(report, /groups {5}core \(startup\)/);
		assert.match(report, /active {5}exa_search, exa_contents, exa_answer/);
	});
});

test("/exa config masks the API key", async () => {
	await withAgent({ apiKey: "1234567890abcdef" }, async (cwd, home) => {
		const h = harness(cwd);
		start(h);
		await h.runCommand("config");
		const shown = JSON.parse(h.notifications.at(-1) ?? "{}") as Record<string, unknown>;
		assert.equal(shown["apiKey"], "1234…cdef");
		assert.deepEqual(shown["configFiles"], {
			global: path.join(home, "exa.json"),
			project: `${cwd}/.pi/exa.json (trusted projects only)`,
		});
	});
});

test("/exa enable activates groups and rejects unknown names", async () => {
	await withAgent(undefined, async (cwd) => {
		const h = harness(cwd);
		start(h);
		await h.runCommand("enable agent");
		assert.match(h.notifications.at(-1) ?? "", /^Enabled: exa_agent_run/);
		assert.ok(h.active().includes("exa_agent_run"));

		await h.runCommand("enable nope");
		assert.match(h.notifications.at(-1) ?? "", /unknown: nope/);
		await h.runCommand("enable");
		assert.match(h.notifications.at(-1) ?? "", /Usage: \/exa enable/);
	});
});

test("/exa init writes the example config once and forces on request", async () => {
	await withAgent(undefined, async (cwd, home) => {
		const h = harness(cwd);
		start(h);
		const file = path.join(home, "exa.json");

		await h.runCommand("init");
		assert.match(h.notifications.at(-1) ?? "", /Wrote example config/);
		assert.ok(fs.existsSync(file));

		await h.runCommand("init");
		assert.match(h.notifications.at(-1) ?? "", /already exists/);

		await h.runCommand("init force");
		assert.match(h.notifications.at(-1) ?? "", /Wrote example config/);
	});
});

test("unknown /exa actions warn instead of throwing", async () => {
	await withAgent(undefined, async (cwd) => {
		const h = harness(cwd);
		start(h);
		await h.runCommand("frobnicate");
		assert.match(h.notifications.at(-1) ?? "", /Unknown \/exa action "frobnicate"/);
	});
});
