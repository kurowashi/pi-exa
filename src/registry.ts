/**
 * Tool registry: names, groups, and short signatures.
 *
 * `core` tools are active at session start; every other group is registered but
 * inactive until the user config enables it or the model calls `exa_help` for a
 * topic that needs it. Inactive tools are invisible to the model, which is what
 * keeps the always-on context small.
 */

export const HELP_TOOL = "exa_help";

export const GROUPS: Record<string, string[]> = {
	core: ["exa_search", "exa_contents", "exa_answer"],
	similar: ["exa_similar"],
	agent: ["exa_agent_run", "exa_agent_get", "exa_agent_control"],
	monitors: ["exa_monitor"],
	websets: ["exa_websets"],
	webhooks: ["exa_webhooks"],
	batches: ["exa_batch"],
	raw: ["exa_request"],
};

export const GROUP_NAMES = Object.keys(GROUPS);

export const MANAGED_TOOLS: string[] = [HELP_TOOL, ...new Set(Object.values(GROUPS).flat())];

/** Tool names that belong to `group`. */
export function toolsInGroup(group: string): string[] {
	if (group === "all") return MANAGED_TOOLS.filter((name) => name !== HELP_TOOL);
	return GROUPS[group] ?? [];
}

/** Tool names for a list of groups, always including the help tool. */
export function toolsForGroups(groups: string[]): string[] {
	const names = new Set<string>([HELP_TOOL]);
	for (const group of groups) {
		for (const name of toolsInGroup(group)) names.add(name);
	}
	return [...names];
}

/** Short, model-facing signature lines used by exa_help after activation. */
export const TOOL_SIGNATURES: Record<string, string> = {
	exa_search:
		"exa_search { query, type?, numResults?, category?, includeDomains?, excludeDomains?, startPublishedDate?, endPublishedDate?, content?, options? }",
	exa_contents: "exa_contents { urls, content?, options? }",
	exa_answer: "exa_answer { query, options? }",
	exa_similar: "exa_similar { url, numResults?, content?, includeDomains?, excludeDomains?, options? }",
	exa_agent_run: "exa_agent_run { query, effort?, outputSchema?, wait?, options? }",
	exa_agent_get: "exa_agent_get { runId, wait?, options? }",
	exa_agent_control:
		'exa_agent_control { action: "list" | "cancel" | "stop" | "delete" | "events", runId?, limit?, cursor? }',
	exa_monitor:
		'exa_monitor { action: "create" | "list" | "get" | "update" | "delete" | "trigger" | "runs" | "run" | "batch", monitorId?, runId?, query?, interval?, name?, webhookUrl?, outputSchema?, options? }',
	exa_websets:
		'exa_websets { action: "create" | "get" | "list" | "update" | "delete" | "cancel" | "preview" | "items" | "item" | "delete_item" | "add_search" | "get_search" | "cancel_search" | "add_enrichment" | "get_enrichment" | "update_enrichment" | "delete_enrichment" | "cancel_enrichment" | "create_import" | "list_imports" | "get_import" | "update_import" | "delete_import", websetId?, id?, query?, count?, wait?, options? }',
	exa_webhooks:
		'exa_webhooks { action: "create" | "list" | "get" | "update" | "delete" | "attempts" | "events" | "event", webhookId?, id?, options? }',
	exa_batch:
		'exa_batch { action: "create" | "get" | "list" | "delete" | "cancel", requests?, batchId?, wait?, options? }',
	exa_request: 'exa_request { method: "GET" | "POST" | "PATCH" | "DELETE", path, body?, query?, beta? }',
};

export function signaturesForTools(tools: string[]): string[] {
	return tools
		.map((tool) => TOOL_SIGNATURES[tool])
		.filter((signature): signature is string => Boolean(signature))
		.map((signature) => `  ${signature}`);
}

export function signaturesFor(groups: string[]): string[] {
	const lines: string[] = [];
	for (const group of groups) {
		for (const tool of toolsInGroup(group)) {
			const signature = TOOL_SIGNATURES[tool];
			if (signature) lines.push(`  ${signature}`);
		}
	}
	return lines;
}
