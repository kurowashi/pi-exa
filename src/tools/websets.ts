/**
 * exa_websets - the Websets v0 API (`/websets/v0`), including items, searches,
 * enrichments, imports, and Webset monitors.
 *
 * Websets is asynchronous: create/get accept `wait` and poll until the Webset
 * is idle, then use action=items to read results.
 */

import { Type } from "typebox";
import type { AgentToolUpdateCallback, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatJson } from "../format.ts";
import { isJsonObject } from "../types.ts";
import {
	buildBody,
	compactDetails,
	errorText,
	optionsSchema,
	pollUntil,
	progressReporter,
	queryFrom,
	requireResponse,
	type Runtime,
	textResult,
	type ToolResult,
} from "./common.ts";

const ACTIONS = [
	"create",
	"get",
	"list",
	"update",
	"delete",
	"cancel",
	"preview",
	"items",
	"item",
	"delete_item",
	"add_search",
	"get_search",
	"cancel_search",
	"add_enrichment",
	"get_enrichment",
	"update_enrichment",
	"delete_enrichment",
	"cancel_enrichment",
	"create_import",
	"list_imports",
	"get_import",
	"update_import",
	"delete_import",
	"create_monitor",
	"list_monitors",
	"get_monitor",
	"update_monitor",
	"delete_monitor",
	"monitor_runs",
	"monitor_run",
] as const;

const DONE_STATUSES = new Set(["idle", "paused"]);

function statusOf(value: unknown): string {
	return isJsonObject(value) && typeof value.status === "string" ? value.status : "unknown";
}

function idOf(value: unknown): string | undefined {
	return isJsonObject(value) && typeof value.id === "string" ? value.id : undefined;
}

async function waitForWebset(
	runtime: Runtime,
	websetId: string,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<unknown> | undefined,
): Promise<{ webset: unknown; timedOut: boolean }> {
	const config = runtime.config();
	const report = progressReporter(onUpdate, `Waiting for webset ${websetId}:`);
	const outcome = await pollUntil<unknown>({
		timeoutMs: config.wait.webset.timeoutMs,
		intervalMs: config.wait.webset.pollIntervalMs,
		signal,
		isDone: (value) => DONE_STATUSES.has(statusOf(value)),
		onProgress: (value) => report(`status ${statusOf(value)}`),
		poll: async () => {
			const response = await runtime.client().send({
				method: "GET",
				path: `/websets/v0/websets/${encodeURIComponent(websetId)}`,
				signal,
			});
			return response.data;
		},
	});
	return { webset: outcome.value, timedOut: outcome.timedOut };
}

export function registerWebsetsTool(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_websets",
		label: "Exa Websets",
		description:
			"Work with the Exa Websets API: persistent, asynchronously built sets of entities with enrichment columns. " +
			"Actions cover websets (create/get/list/update/delete/cancel/preview), items, searches, enrichments, and imports. " +
			"Create and get can wait until the Webset is idle, then read items with action=items. " +
			'Call exa_help with topic "websets" for the full request bodies. For new list-building work the Agent API (exa_agent_run) is usually a better fit.',
		promptSnippet: "Create and manage Exa Websets, items, enrichments, and imports",
		parameters: Type.Object({
			action: Type.Union(
				ACTIONS.map((value) => Type.Literal(value)),
				{ description: "Operation to perform." },
			),
			websetId: Type.Optional(Type.String({ description: "Webset id or external id (required for webset-scoped actions)." })),
			id: Type.Optional(Type.String({ description: "Item, search, enrichment, import, or monitor id for the *_{item,search,enrichment,import,monitor} actions." })),
			runId: Type.Optional(Type.String({ description: "Monitor run id for action=monitor_run." })),
			query: Type.Optional(Type.String({ description: "Natural-language search query for create/add_search/preview." })),
			count: Type.Optional(Type.Integer({ minimum: 1, description: "Target number of items for create/add_search (default 10)." })),
			wait: Type.Optional(
				Type.Boolean({ description: "For create/get: wait until the Webset is idle before returning (default: from config, normally true)." }),
			),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Page size for list/items." })),
			cursor: Type.Optional(Type.String({ description: "Pagination cursor from a previous list/items call." })),
			options: optionsSchema(
				'Extra body fields, or { query: {...} } for query-string parameters. Examples: { title: "AI infra companies", enrichments: [{ description: "Find the CEO", format: "text" }] }, { format: "number", options: [{ label: "yes" }] }, { expand: "items" }. Call exa_help with topic "websets".',
			),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = runtime.config();
				const client = runtime.client();
				const abort = signal ?? ctx.signal;
				const query = { limit: params.limit, cursor: params.cursor, ...queryFrom(params.options) };
				const websetBase = params.websetId
					? `/websets/v0/websets/${encodeURIComponent(params.websetId)}`
					: "/websets/v0/websets";
				const needsWebset = ![
					"create",
					"list",
					"preview",
					"create_import",
					"list_imports",
					"get_import",
					"update_import",
					"delete_import",
					"list_monitors",
					"create_monitor",
				].includes(params.action);
				if (needsWebset && !params.websetId) {
					return textResult(`Error: websetId is required for action "${params.action}"`, { error: true });
				}
				const needsId = /^(item|get_search|get_enrichment|update_enrichment|delete_enrichment|cancel_enrichment|get_import|update_import|delete_import|get_monitor|update_monitor|delete_monitor|monitor_runs)$/.test(
					params.action,
				);
				if (needsId && !params.id) {
					return textResult(`Error: id is required for action "${params.action}"`, { error: true });
				}
				const withId = (subpath: string): string => `${websetBase}/${subpath}/${encodeURIComponent(params.id as string)}`;

				let response;
				let result: ToolResult | undefined;
				switch (params.action) {
					case "create": {
						if (!params.query) return textResult('Error: query is required for action "create"', { error: true });
						const body = buildBody({}, { search: { query: params.query, count: params.count ?? 10 } }, params.options);
						response = await client.send({ method: "POST", path: websetBase, body, signal: abort });
						break;
					}
					case "get":
						response = await client.send({ method: "GET", path: websetBase, query, signal: abort });
						break;
					case "list":
						response = await client.send({ method: "GET", path: websetBase, query, signal: abort });
						break;
					case "update": {
						const body = buildBody({}, {}, params.options);
						response = await client.send({ method: "POST", path: websetBase, body, signal: abort });
						break;
					}
					case "delete":
						response = await client.send({ method: "DELETE", path: websetBase, signal: abort });
						break;
					case "cancel":
						response = await client.send({ method: "POST", path: `${websetBase}/cancel`, signal: abort });
						break;
					case "preview": {
						if (!params.query) return textResult('Error: query is required for action "preview"', { error: true });
						const body = buildBody({}, { search: { query: params.query, count: params.count ?? 10 } }, params.options);
						const extraQuery = queryFrom(params.options);
						response = await client.send({
							method: "POST",
							path: "/websets/v0/websets/preview",
							body,
							query: Object.keys(extraQuery).length > 0 ? extraQuery : undefined,
							signal: abort,
						});
						break;
					}
					case "items":
						response = await client.send({ method: "GET", path: `${websetBase}/items`, query, signal: abort });
						break;
					case "item":
						response = await client.send({ method: "GET", path: withId("items"), signal: abort });
						break;
					case "delete_item":
						response = await client.send({ method: "DELETE", path: withId("items"), signal: abort });
						break;
					case "add_search": {
						if (!params.query) return textResult('Error: query is required for action "add_search"', { error: true });
						const body = buildBody(
							runtime.config().defaults.websetSearch,
							{ query: params.query, count: params.count ?? 10 },
							params.options,
						);
						response = await client.send({ method: "POST", path: `${websetBase}/searches`, body, signal: abort });
						break;
					}
					case "get_search":
						response = await client.send({ method: "GET", path: withId("searches"), signal: abort });
						break;
					case "cancel_search":
						response = await client.send({ method: "POST", path: `${withId("searches")}/cancel`, signal: abort });
						break;
					case "add_enrichment": {
						if (!params.query) return textResult('Error: query is required for action "add_enrichment" (it is the enrichment description)', { error: true });
						const body = buildBody({}, { description: params.query }, params.options);
						response = await client.send({ method: "POST", path: `${websetBase}/enrichments`, body, signal: abort });
						break;
					}
					case "get_enrichment":
						response = await client.send({ method: "GET", path: withId("enrichments"), signal: abort });
						break;
					case "update_enrichment": {
						const body = buildBody({}, params.query ? { description: params.query } : {}, params.options);
						response = await client.send({ method: "PATCH", path: withId("enrichments"), body, signal: abort });
						break;
					}
					case "delete_enrichment":
						response = await client.send({ method: "DELETE", path: withId("enrichments"), signal: abort });
						break;
					case "cancel_enrichment":
						response = await client.send({ method: "POST", path: `${withId("enrichments")}/cancel`, signal: abort });
						break;
					case "create_import": {
						const body = buildBody({}, {}, params.options);
						response = await client.send({ method: "POST", path: "/websets/v0/imports", body, signal: abort });
						break;
					}
					case "list_imports":
						response = await client.send({ method: "GET", path: "/websets/v0/imports", query, signal: abort });
						break;
					case "get_import":
						response = await client.send({
							method: "GET",
							path: `/websets/v0/imports/${encodeURIComponent(params.id as string)}`,
							signal: abort,
						});
						break;
					case "update_import": {
						const body = buildBody({}, {}, params.options);
						response = await client.send({
							method: "PATCH",
							path: `/websets/v0/imports/${encodeURIComponent(params.id as string)}`,
							body,
							signal: abort,
						});
						break;
					}
					case "delete_import":
						response = await client.send({
							method: "DELETE",
							path: `/websets/v0/imports/${encodeURIComponent(params.id as string)}`,
							signal: abort,
						});
						break;
					case "create_monitor": {
						if (!params.websetId) {
							return textResult('Error: websetId is required for action "create_monitor"', { error: true });
						}
						const body = buildBody({}, { websetId: params.websetId }, params.options);
						response = await client.send({ method: "POST", path: "/websets/v0/monitors", body, signal: abort });
						break;
					}
					case "list_monitors":
						response = await client.send({
							method: "GET",
							path: "/websets/v0/monitors",
							query: { ...query, websetId: params.websetId },
							signal: abort,
						});
						break;
					case "get_monitor":
						response = await client.send({
							method: "GET",
							path: `/websets/v0/monitors/${encodeURIComponent(params.id as string)}`,
							signal: abort,
						});
						break;
					case "update_monitor": {
						const body = buildBody({}, {}, params.options);
						response = await client.send({
							method: "PATCH",
							path: `/websets/v0/monitors/${encodeURIComponent(params.id as string)}`,
							body,
							signal: abort,
						});
						break;
					}
					case "delete_monitor":
						response = await client.send({
							method: "DELETE",
							path: `/websets/v0/monitors/${encodeURIComponent(params.id as string)}`,
							signal: abort,
						});
						break;
					case "monitor_runs":
						response = await client.send({
							method: "GET",
							path: `/websets/v0/monitors/${encodeURIComponent(params.id as string)}/runs`,
							query,
							signal: abort,
						});
						break;
					case "monitor_run": {
						if (!params.id || !params.runId) {
							return textResult('Error: id (monitor id) and runId are required for action "monitor_run"', { error: true });
						}
						response = await client.send({
							method: "GET",
							path: `/websets/v0/monitors/${encodeURIComponent(params.id)}/runs/${encodeURIComponent(params.runId)}`,
							signal: abort,
						});
						break;
					}
				}

				const settled = requireResponse(response, params.action);
				let data = settled.data;
				let timedOut = false;
				const shouldWait =
					(params.action === "create" || params.action === "get") &&
					(params.wait ?? config.wait.webset.enabled) &&
					!DONE_STATUSES.has(statusOf(data));
				const websetId = params.websetId ?? idOf(data);
				if (shouldWait && websetId) {
					const outcome = await waitForWebset(runtime, websetId, abort, onUpdate);
					data = outcome.webset;
					timedOut = outcome.timedOut;
				}
				if (!result) {
					result = textResult(formatJson(data, config.output), {
						tool: "exa_websets",
						action: params.action,
						...(compactDetails({ ...settled, data }) as object),
					});
				}
				if (timedOut && websetId) {
					result.content[0].text += `\n\n[wait timed out after ${config.wait.webset.timeoutMs}ms; call exa_websets action=get websetId=${websetId} to continue]`;
				}
				return result;
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_websets", error: true });
			}
		},
	});
}
