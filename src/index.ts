/**
 * pi-exa - Exa API access for Pi.
 *
 * Design:
 *  - Four tools are active at session start: exa_search, exa_contents,
 *    exa_answer, and exa_help. They cover the everyday web-research flows with
 *    a curated argument set.
 *  - Every other Exa endpoint is registered but inactive. `exa_help(topic)`
 *    returns the full parameter reference for a topic and enables the tools it
 *    needs, so advanced options only enter the context when they are asked for.
 *  - `exa_request` keeps the whole API reachable even for endpoints that have
 *    no typed tool.
 *  - `~/.pi/agent/exa.json` (and `<cwd>/.pi/exa.json`) provide defaults for
 *    every call: search type, result counts, content modes, output budget, and
 *    which groups start active.
 */

import * as fs from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ExaClient } from "./client.ts";
import { exampleConfig, globalConfigPath, loadConfigs, resolveConfig } from "./config.ts";
import { GROUP_NAMES, GROUPS, HELP_TOOL, MANAGED_TOOLS, toolsForGroups } from "./registry.ts";
import { registerAgentTools } from "./tools/agent.ts";
import { registerBatchTool } from "./tools/batches.ts";
import type { Runtime } from "./tools/common.ts";
import { registerCoreTools } from "./tools/core.ts";
import { registerHelpTool } from "./tools/help.ts";
import { registerMonitorTool } from "./tools/monitors.ts";
import { registerRequestTool } from "./tools/request.ts";
import { registerSimilarTool } from "./tools/similar.ts";
import { registerWebhooksTool } from "./tools/webhooks.ts";
import { registerWebsetsTool } from "./tools/websets.ts";
import type { ResolvedConfig } from "./types.ts";

function maskKey(key: string | undefined): string | undefined {
	if (!key) return undefined;
	if (key.length <= 8) return "***";
	return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** The /exa config payload, with the key masked. */
function configReport(resolved: ResolvedConfig, cwd: string): string {
	const shown = {
		...resolved,
		apiKey: maskKey(resolved.apiKey),
		configFiles: {
			global: globalConfigPath(),
			project: `${cwd}/.pi/exa.json (trusted projects only)`,
		},
	};
	return JSON.stringify(shown, null, 2);
}

/** /exa init [force]: write the example config unless it exists. */
function initConfig(ctx: ExtensionContext, force: boolean): void {
	const target = globalConfigPath();
	if (fs.existsSync(target) && !force) {
		ctx.ui.notify(`${target} already exists (use /exa init force to overwrite)`, "warning");
		return;
	}
	try {
		fs.writeFileSync(target, `${JSON.stringify(exampleConfig(), null, 2)}\n`, "utf8");
		ctx.ui.notify(`Wrote example config to ${target}`, "info");
	} catch (error) {
		ctx.ui.notify(`Failed to write ${target}: ${error instanceof Error ? error.message : String(error)}`, "error");
	}
}

/** /exa enable <group...>: activate the requested groups. */
function enableGroups(requested: string[], activate: (groups: string[]) => string[], ctx: ExtensionContext): void {
	const invalid = requested.filter((group) => !GROUP_NAMES.includes(group) && group !== "all");
	if (requested.length === 0 || invalid.length > 0) {
		ctx.ui.notify(
			`Usage: /exa enable <${GROUP_NAMES.join("|")}|all>${invalid.length > 0 ? ` (unknown: ${invalid.join(", ")})` : ""}`,
			"warning",
		);
		return;
	}
	const groups = requested.includes("all") ? GROUP_NAMES : requested;
	const enabled = activate(groups);
	ctx.ui.notify(enabled.length > 0 ? `Enabled: ${enabled.join(", ")}` : "Those tools were already enabled.", "info");
}

/** /exa status: the effective config and active tool surface. */
function statusReport(resolved: ResolvedConfig, active: string[]): string {
	const activeExa = active.filter((name) => MANAGED_TOOLS.includes(name) && name !== HELP_TOOL);
	return [
		`config     ${globalConfigPath()}`,
		`apiKey     ${resolved.apiKey ? `set (${resolved.apiKeySource})` : "not set"}`,
		`baseUrl    ${resolved.baseUrl}`,
		`groups     ${resolved.groups.join(", ")} (startup)`,
		`active     ${activeExa.join(", ") || "none"}`,
		`available  ${GROUP_NAMES.join(", ")}`,
		`usage      /exa status | /exa config | /exa enable <group> | /exa init [force]`,
	].join("\n");
}

export default function exaExtension(pi: ExtensionAPI): void {
	let config: ResolvedConfig | undefined;
	let warnings: string[] = [];
	let notified = false;

	const getConfig = (): ResolvedConfig => {
		if (!config) config = resolveConfig(loadConfigs(process.cwd(), false), { knownGroups: GROUP_NAMES });
		return config;
	};

	const refreshConfig = (cwd: string, trusted: boolean): ResolvedConfig => {
		const loaded = loadConfigs(cwd, trusted);
		const resolved = resolveConfig(loaded, { knownGroups: GROUP_NAMES });
		config = resolved;
		warnings = loaded.warnings;
		return resolved;
	};

	const runtime: Runtime = {
		config: getConfig,
		client: () => new ExaClient(getConfig()),
		activate: (groups) => activate(groups),
		activeGroups: () => {
			const active = new Set(pi.getActiveTools());
			return GROUP_NAMES.filter((group) => {
				const tools = GROUPS[group] ?? [];
				return tools.length > 0 && tools.every((tool) => active.has(tool));
			});
		},
	};

	/** Enable groups without touching tools owned by other extensions. */
	function activate(groups: string[]): string[] {
		const active = pi.getActiveTools();
		const activeSet = new Set(active);
		const target = toolsForGroups(groups);
		const newlyEnabled = target.filter((name) => !activeSet.has(name));
		if (newlyEnabled.length > 0) {
			pi.setActiveTools([...active, ...newlyEnabled]);
		}
		return newlyEnabled;
	}

	/** Apply the configured startup groups: enable them and disable the rest of ours. */
	function applyStartupGroups(groups: string[]): void {
		const desired = new Set(toolsForGroups(groups));
		const current = pi.getActiveTools();
		const next = [...current.filter((name) => !MANAGED_TOOLS.includes(name) || desired.has(name))];
		for (const name of desired) {
			if (!next.includes(name)) next.push(name);
		}
		pi.setActiveTools(next);
	}

	registerCoreTools(pi, runtime);
	registerSimilarTool(pi, runtime);
	registerAgentTools(pi, runtime);
	registerMonitorTool(pi, runtime);
	registerWebsetsTool(pi, runtime);
	registerWebhooksTool(pi, runtime);
	registerBatchTool(pi, runtime);
	registerRequestTool(pi, runtime);
	registerHelpTool(pi, runtime);

	let initialized = false;
	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		const resolved = refreshConfig(ctx.cwd, ctx.isProjectTrusted());
		if (initialized) return;
		initialized = true;
		const groups = resolved.groups.includes("all") ? GROUP_NAMES : resolved.groups;
		applyStartupGroups(groups);
		if (!notified && resolved.baseUrl !== "https://api.exa.ai") {
			ctx.ui.notify(`pi-exa: using baseUrl ${resolved.baseUrl}`, "info");
		}
		if (!notified) {
			for (const warning of warnings) ctx.ui.notify(`pi-exa: ${warning}`, "warning");
			notified = true;
		}
	});

	pi.registerCommand("exa", {
		description: "pi-exa: status | config | enable <group...> | init",
		handler: async (args, ctx) => {
			const resolved = refreshConfig(ctx.cwd, ctx.isProjectTrusted());
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const action = parts[0] ?? "status";
			switch (action) {
				case "config":
					ctx.ui.notify(configReport(resolved, ctx.cwd), "info");
					return;
				case "init":
					initConfig(ctx, parts[1] === "force");
					return;
				case "enable":
					enableGroups(parts.slice(1), activate, ctx);
					return;
				case "status":
				case "help":
					ctx.ui.notify(statusReport(resolved, pi.getActiveTools()), "info");
					return;
				default:
					ctx.ui.notify(`Unknown /exa action "${action}". Try /exa status.`, "warning");
			}
		},
	});
}
