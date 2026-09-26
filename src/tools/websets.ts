/**
 * exa_websets - the Websets v0 API (`/websets/v0`), including items, searches,
 * enrichments, imports, and Webset monitors.
 *
 * Websets is asynchronous: create/get accept `wait` and poll until the Webset
 * is idle, then use action=items to read results.
 */

import type { AgentToolUpdateCallback, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ExaClient, ExaResponse } from "../client.ts";
import { formatJson } from "../format.ts";
import { isJsonObject, type ResolvedConfig } from "../types.ts";
import {
	buildBody,
	compactDetails,
	errorText,
	optionsSchema,
	pollUntil,
	progressReporter,
	queryFrom,
	type Runtime,
	type ToolResult,
	textResult,
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
	return isJsonObject(value) && typeof value["status"] === "string" ? value["status"] : "unknown";
}

function idOf(value: unknown): string | undefined {
	return isJsonObject(value) && typeof value["id"] === "string" ? value["id"] : undefined;
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

interface WebsetParams {
	action: string;
	websetId?: string | undefined;
	id?: string | undefined;
	runId?: string | undefined;
	query?: string | undefined;
	count?: number | undefined;
	wait?: boolean | undefined;
	limit?: number | undefined;
	cursor?: string | undefined;
	options?: unknown;
}

interface WebsetContext {
	client: ExaClient;
	runtime: Runtime;
	params: WebsetParams;
	websetBase: string;
	query: Record<string, unknown>;
	signal: AbortSignal | undefined;
}

/** Actions that do not need a webset id; all others do. */
const WEBSET_OPTIONAL = new Set([
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
]);

/** Actions whose path ends in an item/search/enrichment/import/monitor id. */
const WEBSET_ID_ACTIONS = new Set([
	"item",
	"get_search",
	"get_enrichment",
	"update_enrichment",
	"delete_enrichment",
	"cancel_enrichment",
	"get_import",
	"update_import",
	"delete_import",
	"get_monitor",
	"update_monitor",
	"delete_monitor",
	"monitor_runs",
]);

/** Missing ids for the action. */
function websetIdError(params: WebsetParams): string | undefined {
	if (!WEBSET_OPTIONAL.has(params.action) && !params.websetId) {
		return `Error: websetId is required for action "${params.action}"`;
	}
	if (WEBSET_ID_ACTIONS.has(params.action) && !params.id) {
		return `Error: id is required for action "${params.action}"`;
	}
	return undefined;
}

/** The query argument stands in for different things per action. */
function websetQueryError(params: WebsetParams): string | undefined {
	const needsQuery = params.action === "create" || params.action === "preview" || params.action === "add_search";
	if (needsQuery && !params.query) return `Error: query is required for action "${params.action}"`;
	if (params.action === "add_enrichment" && !params.query) {
		return 'Error: query is required for action "add_enrichment" (it is the enrichment description)';
	}
	return undefined;
}

/** Webset monitors have their own id rules. */
function websetMonitorError(params: WebsetParams): string | undefined {
	if (params.action === "create_monitor" && !params.websetId) {
		return 'Error: websetId is required for action "create_monitor"';
	}
	if (params.action === "monitor_run" && (!params.id || !params.runId)) {
		return 'Error: id (monitor id) and runId are required for action "monitor_run"';
	}
	return undefined;
}

/** Validation error for one action, or undefined when the params are usable. */
function websetError(params: WebsetParams): string | undefined {
	return websetIdError(params) ?? websetQueryError(params) ?? websetMonitorError(params);
}

/** Webset lifecycle and preview actions. */
async function sendWebsetCrud(ctx: WebsetContext): Promise<ExaResponse> {
	const { client, params, websetBase, query, signal } = ctx;
	switch (params.action) {
		case "create":
			return client.send({
				method: "POST",
				path: websetBase,
				body: buildBody({}, { search: { query: params.query, count: params.count ?? 10 } }, params.options),
				signal,
			});
		case "get":
			return client.send({ method: "GET", path: websetBase, query, signal });
		case "list":
			return client.send({ method: "GET", path: websetBase, query, signal });
		case "update":
			return client.send({ method: "POST", path: websetBase, body: buildBody({}, {}, params.options), signal });
		case "delete":
			return client.send({ method: "DELETE", path: websetBase, signal });
		case "cancel":
			return client.send({ method: "POST", path: `${websetBase}/cancel`, signal });
		default: {
			const extraQuery = queryFrom(params.options);
			return client.send({
				method: "POST",
				path: "/websets/v0/websets/preview",
				body: buildBody({}, { search: { query: params.query, count: params.count ?? 10 } }, params.options),
				query: Object.keys(extraQuery).length > 0 ? extraQuery : undefined,
				signal,
			});
		}
	}
}

/** Items and searches scoped to one webset. */
async function sendWebsetItems(ctx: WebsetContext): Promise<ExaResponse> {
	const { client, runtime, params, websetBase, query, signal } = ctx;
	const withId = (subpath: string): string => `${websetBase}/${subpath}/${encodeURIComponent(params.id ?? "")}`;
	switch (params.action) {
		case "items":
			return client.send({ method: "GET", path: `${websetBase}/items`, query, signal });
		case "item":
			return client.send({ method: "GET", path: withId("items"), signal });
		case "delete_item":
			return client.send({ method: "DELETE", path: withId("items"), signal });
		case "add_search":
			return client.send({
				method: "POST",
				path: `${websetBase}/searches`,
				body: buildBody(
					runtime.config().defaults.websetSearch,
					{ query: params.query, count: params.count ?? 10 },
					params.options,
				),
				signal,
			});
		case "get_search":
			return client.send({ method: "GET", path: withId("searches"), signal });
		default:
			return client.send({ method: "POST", path: `${withId("searches")}/cancel`, signal });
	}
}

/** Enrichment columns on one webset. */
async function sendWebsetEnrichments(ctx: WebsetContext): Promise<ExaResponse> {
	const { client, params, websetBase, signal } = ctx;
	const withId = (subpath: string): string => `${websetBase}/${subpath}/${encodeURIComponent(params.id ?? "")}`;
	switch (params.action) {
		case "add_enrichment":
			return client.send({
				method: "POST",
				path: `${websetBase}/enrichments`,
				body: buildBody({}, { description: params.query }, params.options),
				signal,
			});
		case "get_enrichment":
			return client.send({ method: "GET", path: withId("enrichments"), signal });
		case "update_enrichment":
			return client.send({
				method: "PATCH",
				path: withId("enrichments"),
				body: buildBody({}, params.query ? { description: params.query } : {}, params.options),
				signal,
			});
		case "delete_enrichment":
			return client.send({ method: "DELETE", path: withId("enrichments"), signal });
		default:
			return client.send({ method: "POST", path: `${withId("enrichments")}/cancel`, signal });
	}
}

/** Webset import jobs. */
async function sendWebsetImports(ctx: WebsetContext): Promise<ExaResponse> {
	const { client, params, query, signal } = ctx;
	const importPath = `/websets/v0/imports/${encodeURIComponent(params.id ?? "")}`;
	switch (params.action) {
		case "create_import":
			return client.send({
				method: "POST",
				path: "/websets/v0/imports",
				body: buildBody({}, {}, params.options),
				signal,
			});
		case "list_imports":
			return client.send({ method: "GET", path: "/websets/v0/imports", query, signal });
		case "get_import":
			return client.send({ method: "GET", path: importPath, signal });
		case "update_import":
			return client.send({ method: "PATCH", path: importPath, body: buildBody({}, {}, params.options), signal });
		default:
			return client.send({ method: "DELETE", path: importPath, signal });
	}
}

/** Webset monitors (the older monitor API). */
async function sendWebsetMonitors(ctx: WebsetContext): Promise<ExaResponse> {
	const { client, params, query, signal } = ctx;
	const monitorPath = `/websets/v0/monitors/${encodeURIComponent(params.id ?? "")}`;
	switch (params.action) {
		case "create_monitor":
			return client.send({
				method: "POST",
				path: "/websets/v0/monitors",
				body: buildBody({}, { websetId: params.websetId }, params.options),
				signal,
			});
		case "list_monitors":
			return client.send({
				method: "GET",
				path: "/websets/v0/monitors",
				query: { ...query, websetId: params.websetId },
				signal,
			});
		case "get_monitor":
			return client.send({ method: "GET", path: monitorPath, signal });
		case "update_monitor":
			return client.send({ method: "PATCH", path: monitorPath, body: buildBody({}, {}, params.options), signal });
		case "delete_monitor":
			return client.send({ method: "DELETE", path: monitorPath, signal });
		case "monitor_runs":
			return client.send({ method: "GET", path: `${monitorPath}/runs`, query, signal });
		default:
			return client.send({
				method: "GET",
				path: `${monitorPath}/runs/${encodeURIComponent(params.runId ?? "")}`,
				signal,
			});
	}
}

const WEBSET_CRUD_ACTIONS = new Set(["create", "get", "list", "update", "delete", "cancel", "preview"]);
const WEBSET_ITEM_ACTIONS = new Set(["items", "item", "delete_item", "add_search", "get_search", "cancel_search"]);
const WEBSET_ENRICHMENT_ACTIONS = new Set([
	"add_enrichment",
	"get_enrichment",
	"update_enrichment",
	"delete_enrichment",
	"cancel_enrichment",
]);
const WEBSET_IMPORT_ACTIONS = new Set([
	"create_import",
	"list_imports",
	"get_import",
	"update_import",
	"delete_import",
]);

/** Send the request for one webset action. */
function sendWebsetAction(ctx: WebsetContext): Promise<ExaResponse> {
	const { action } = ctx.params;
	if (WEBSET_CRUD_ACTIONS.has(action)) return sendWebsetCrud(ctx);
	if (WEBSET_ITEM_ACTIONS.has(action)) return sendWebsetItems(ctx);
	if (WEBSET_ENRICHMENT_ACTIONS.has(action)) return sendWebsetEnrichments(ctx);
	if (WEBSET_IMPORT_ACTIONS.has(action)) return sendWebsetImports(ctx);
	return sendWebsetMonitors(ctx);
}

/** create/get wait until the webset is idle unless the caller opts out. */
function shouldWaitForWebset(params: WebsetParams, config: ResolvedConfig, data: unknown): boolean {
	if (params.action !== "create" && params.action !== "get") return false;
	return (params.wait ?? config.wait.webset.enabled) && !DONE_STATUSES.has(statusOf(data));
}

/** Wait when needed, then format the final tool result. */
async function finishWebset(
	runtime: Runtime,
	config: ResolvedConfig,
	response: ExaResponse,
	params: WebsetParams,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<unknown> | undefined,
): Promise<ToolResult> {
	let data = response.data;
	let timedOut = false;
	const websetId = params.websetId ?? idOf(data);
	if (shouldWaitForWebset(params, config, data) && websetId) {
		const outcome = await waitForWebset(runtime, websetId, signal, onUpdate);
		data = outcome.webset;
		timedOut = outcome.timedOut;
	}
	const result = textResult(formatJson(data, config.output), {
		tool: "exa_websets",
		action: params.action,
		...(compactDetails({ ...response, data }) as object),
	});
	if (timedOut && websetId) {
		result.content[0].text += `\n\n[wait timed out after ${config.wait.webset.timeoutMs / 1000}s; call exa_websets action=get websetId=${websetId} to continue]`;
	}
	return result;
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
			websetId: Type.Optional(
				Type.String({ description: "Webset id or external id (required for webset-scoped actions)." }),
			),
			id: Type.Optional(
				Type.String({
					description:
						"Item, search, enrichment, import, or monitor id for the *_{item,search,enrichment,import,monitor} actions.",
				}),
			),
			runId: Type.Optional(Type.String({ description: "Monitor run id for action=monitor_run." })),
			query: Type.Optional(
				Type.String({ description: "Natural-language search query for create/add_search/preview." }),
			),
			count: Type.Optional(
				Type.Integer({ minimum: 1, description: "Target number of items for create/add_search (default 10)." }),
			),
			wait: Type.Optional(
				Type.Boolean({
					description:
						"For create/get: wait until the Webset is idle before returning (default: from config, normally true).",
				}),
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
				const abort = signal ?? ctx.signal;
				const invalid = websetError(params);
				if (invalid) return textResult(invalid, { error: true });
				const websetBase = params.websetId
					? `/websets/v0/websets/${encodeURIComponent(params.websetId)}`
					: "/websets/v0/websets";
				const context: WebsetContext = {
					client: runtime.client(),
					runtime,
					params,
					websetBase,
					query: { limit: params.limit, cursor: params.cursor, ...queryFrom(params.options) },
					signal: abort,
				};
				const response = await sendWebsetAction(context);
				return await finishWebset(runtime, config, response, params, abort, onUpdate);
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_websets", error: true });
			}
		},
	});
}
