/**
 * Contract: the model-facing surface and the always-on context tax.
 *
 * Inactive tools are invisible to the model, so the budget applies to the
 * tools that are active at session start (core plus exa_help). The registered
 * set is pinned separately: adding or renaming a tool is a decision that must
 * update this file, not an accident that slips through review.
 *
 * The extension is loaded through Pi's own loader, so this covers the shipped
 * artifact and its real wiring, not a re-import of the tool modules.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { loadExaExtension } from "../helpers/loader.ts";

/** Every registered tool. The inactive ones cost nothing until exa_help enables them. */
const EXPECTED_TOOLS = [
	"exa_agent_control",
	"exa_agent_get",
	"exa_agent_run",
	"exa_answer",
	"exa_batch",
	"exa_contents",
	"exa_help",
	"exa_monitor",
	"exa_request",
	"exa_search",
	"exa_similar",
	"exa_webhooks",
	"exa_websets",
];

/** Tools active at session start; their descriptions are re-sent on every request. */
const ALWAYS_ON = ["exa_answer", "exa_contents", "exa_help", "exa_search"];

/**
 * Combined budget for the always-on descriptions and parameter schemas.
 *
 * Measured baseline after the description review: 1611 tokens
 * (search 777, contents 303, answer 197, help 334). The cap leaves about 10%
 * of room for wording changes and fails a new always-on tool, which is the
 * point. Advanced tools reach the model only after exa_help activates them.
 */
const TOKEN_BUDGET = 1800;

/** Cheap, dependency-free estimate. Provider tokenizers do not change the verdict. */
const CHARS_PER_TOKEN = 4;

function tokensOf(name: string, tool: ToolDefinition): number {
	return Math.ceil(`${name}\n${tool.description}\n${JSON.stringify(tool.parameters)}`.length / CHARS_PER_TOKEN);
}

test("the registered tool surface is exactly the documented set", async () => {
	const extension = await loadExaExtension();
	assert.deepEqual([...extension.tools.keys()].sort(), EXPECTED_TOOLS);
});

test("every tool has a label, a description, and an object schema", async () => {
	const extension = await loadExaExtension();
	for (const [name, registered] of extension.tools) {
		const tool = registered.definition;
		assert.ok(tool.label.length > 0, `${name} needs a label`);
		assert.ok(tool.description.length > 0, `${name} needs a description`);
		assert.equal((tool.parameters as { type?: string }).type, "object", `${name} parameters must be an object schema`);
	}
});

test("the always-on tool surface stays inside the token budget", async () => {
	const extension = await loadExaExtension();
	const alwaysOn = ALWAYS_ON.map((name) => {
		const registered = extension.tools.get(name);
		assert.ok(registered, `${name} must be registered`);
		return [name, registered.definition] as const;
	});
	const total = alwaysOn.reduce((sum, [name, tool]) => sum + tokensOf(name, tool), 0);
	const perTool = alwaysOn.map(([name, tool]) => `${name}=${tokensOf(name, tool)}`).join(", ");
	assert.ok(
		total <= TOKEN_BUDGET,
		`always-on surface is ${total} tokens (${perTool}), budget is ${TOKEN_BUDGET}. ` +
			"Shrink the descriptions or move the tool out of the core group before raising the budget.",
	);
});
