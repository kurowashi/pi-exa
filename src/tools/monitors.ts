/**
 * exa_monitor - Exa Agent Monitors (`/monitors`).
 *
 * Monitors re-run a search on an interval and deliver new/changed results to a
 * webhook. This is the current monitor API; `/websets/v0/monitors` is a
 * different, older one exposed through exa_websets.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ExaClient, ExaResponse } from "../client.ts";
import { formatJson } from "../format.ts";
import { buildBody, compactDetails, errorText, optionsSchema, queryFrom, type Runtime, textResult } from "./common.ts";

const ACTIONS = ["create", "list", "get", "update", "delete", "trigger", "runs", "run", "batch"] as const;

interface MonitorParams {
	action: string;
	monitorId?: string | undefined;
	runId?: string | undefined;
	query?: string | undefined;
	interval?: string | undefined;
	name?: string | undefined;
	status?: string | undefined;
	webhookUrl?: string | undefined;
	outputSchema?: Record<string, unknown> | undefined;
	limit?: number | undefined;
	cursor?: string | undefined;
	options?: unknown;
}

/** options.action for a batch request, when it is present. */
function batchAction(params: MonitorParams): string | undefined {
	const body = buildBody({}, {}, params.options);
	return typeof body["action"] === "string" ? body["action"] : undefined;
}

/** Validation error for one action, or undefined when the params are usable. */
function monitorError(params: MonitorParams): string | undefined {
	if (!["create", "list", "batch"].includes(params.action) && !params.monitorId) {
		return `Error: monitorId is required for action "${params.action}"`;
	}
	if (params.action === "create" && !params.query) return 'Error: query is required for action "create"';
	if (params.action === "run" && !params.runId) return 'Error: runId is required for action "run"';
	if (params.action === "batch" && batchAction(params) === undefined) {
		return 'Error: action="batch" needs options.action = "delete" | "pause" | "unpause"';
	}
	return undefined;
}

/** Send the request for one monitor action. */
async function sendMonitorAction(
	client: ExaClient,
	params: MonitorParams,
	monitorPath: string,
	query: Record<string, unknown>,
	signal: AbortSignal | undefined,
): Promise<ExaResponse> {
	switch (params.action) {
		case "create":
			return client.send({
				method: "POST",
				path: "/monitors",
				body: buildBody(
					{},
					{
						name: params.name,
						search: { query: params.query },
						trigger: { type: "interval", period: params.interval ?? "1d" },
						webhook: params.webhookUrl ? { url: params.webhookUrl } : undefined,
						outputSchema: params.outputSchema,
					},
					params.options,
				),
				signal,
			});
		case "list":
			return client.send({ method: "GET", path: "/monitors", query, signal });
		case "get":
			return client.send({ method: "GET", path: monitorPath, query, signal });
		case "update":
			return client.send({
				method: "PATCH",
				path: monitorPath,
				body: buildBody(
					{},
					{ name: params.name, status: params.status, search: params.query ? { query: params.query } : undefined },
					params.options,
				),
				signal,
			});
		case "delete":
			return client.send({ method: "DELETE", path: monitorPath, signal });
		case "trigger":
			return client.send({ method: "POST", path: `${monitorPath}/trigger`, signal });
		case "runs":
			return client.send({ method: "GET", path: `${monitorPath}/runs`, query, signal });
		case "run":
			return client.send({
				method: "GET",
				path: `${monitorPath}/runs/${encodeURIComponent(params.runId ?? "")}`,
				signal,
			});
		default:
			return client.send({ method: "POST", path: "/monitors/batch", body: buildBody({}, {}, params.options), signal });
	}
}

export function registerMonitorTool(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_monitor",
		label: "Exa Monitor",
		description:
			"Manage Exa Agent Monitors: scheduled searches that emit new results to a webhook. " +
			"Actions: create, list, get, update, delete, trigger (run now), runs (list runs), run (get one run), batch (pause/unpause/delete many). " +
			'Call exa_help with topic "monitors" for the full request bodies.',
		promptSnippet: "Create and manage Exa monitors (scheduled searches with webhook delivery)",
		parameters: Type.Object({
			action: Type.Union(
				ACTIONS.map((value) => Type.Literal(value)),
				{ description: "Operation to perform." },
			),
			monitorId: Type.Optional(
				Type.String({
					description: "Monitor id, e.g. monitor_abc123 (required for everything except create/list/batch).",
				}),
			),
			runId: Type.Optional(Type.String({ description: "Monitor run id (required for action=run)." })),
			query: Type.Optional(Type.String({ description: "Search query for action=create." })),
			interval: Type.Optional(
				Type.String({
					description:
						'How often the monitor runs: "1h", "6h", "1d", "7d" (minimum 1 hour, single unit). Default "1d".',
				}),
			),
			name: Type.Optional(Type.String({ description: "Optional monitor name for create/update." })),
			status: Type.Optional(
				Type.Union(
					["active", "paused"].map((value) => Type.Literal(value)),
					{
						description: "Monitor status for action=update.",
					},
				),
			),
			webhookUrl: Type.Optional(
				Type.String({ description: "HTTPS webhook URL that receives results; must not be localhost or a private IP." }),
			),
			outputSchema: Type.Optional(
				Type.Object(
					{},
					{
						additionalProperties: true,
						description:
							'Schema for run output. { "type": "text" } (default) returns a plain-text summary; an object schema returns structured output.',
					},
				),
			),
			limit: Type.Optional(
				Type.Integer({ minimum: 1, maximum: 100, description: "Page size for list/runs (default 25)." }),
			),
			cursor: Type.Optional(Type.String({ description: "Pagination cursor from a previous list/runs call." })),
			options: optionsSchema(
				'Extra fields merged into the body (create/update/batch), or use { query: {...} } to add query-string parameters for get/list/runs. Examples: { search: { numResults: 20, includeDomains: ["arxiv.org"] }, metadata: { team: "research" } }, { action: "pause", filter: { name: "arxiv" }, dry_run: false }. Call exa_help with topic "monitors".',
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				const invalid = monitorError(params as MonitorParams);
				if (invalid) return textResult(invalid, { error: true });
				const base = "/monitors";
				const monitorPath = params.monitorId ? `${base}/${encodeURIComponent(params.monitorId)}` : base;
				const query = { limit: params.limit, cursor: params.cursor, ...queryFrom(params.options) };
				const response = await sendMonitorAction(
					runtime.client(),
					params as MonitorParams,
					monitorPath,
					query,
					signal ?? ctx.signal,
				);
				return textResult(formatJson(response.data, config.output), {
					tool: "exa_monitor",
					action: params.action,
					...(compactDetails(response) as object),
				});
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_monitor", error: true });
			}
		},
	});
}
