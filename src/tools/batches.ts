/**
 * exa_batch - the Batch API (`/batches`).
 *
 * The batch endpoints currently require the `Exa-Beta: batches-2026-06-06`
 * header, which this tool sends automatically.
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
	type Runtime,
	textResult,
} from "./common.ts";

const ACTIONS = ["create", "get", "list", "delete", "cancel"] as const;
const BETA = "batches-2026-06-06";
const TERMINAL = new Set(["completed", "cancelled", "expired"]);

type BatchAction = (typeof ACTIONS)[number];

interface BatchParams {
	action: BatchAction;
	requests?: unknown;
	batchId?: string | undefined;
	status?: string | undefined;
	limit?: number | undefined;
	cursor?: string | undefined;
	wait?: boolean | undefined;
	options?: unknown;
}

function statusOf(value: unknown): string {
	return isJsonObject(value) && typeof value["status"] === "string" ? value["status"] : "unknown";
}

function idOf(value: unknown): string | undefined {
	return isJsonObject(value) && typeof value["id"] === "string" ? value["id"] : undefined;
}

/** The requests to enqueue, normalized from either argument or the options bag. */
function batchRequests(params: BatchParams): unknown[] | undefined {
	const requests = params.requests ?? (isJsonObject(params.options) ? params.options["requests"] : undefined);
	return Array.isArray(requests) && requests.length > 0 ? requests : undefined;
}

/** Validation error for one action, or undefined when the params are usable. */
function batchError(params: BatchParams): string | undefined {
	if ((params.action === "get" || params.action === "delete" || params.action === "cancel") && !params.batchId) {
		return `Error: batchId is required for action "${params.action}"`;
	}
	if (params.action === "create" && !batchRequests(params)) return "Error: requests is required for action=create";
	return undefined;
}

/** Send the request for one batch action. */
async function sendBatchAction(
	client: ExaClient,
	runtime: Runtime,
	params: BatchParams,
	signal: AbortSignal | undefined,
): Promise<ExaResponse> {
	const idPath = `/batches/${encodeURIComponent(params.batchId ?? "")}`;
	switch (params.action) {
		case "create":
			return client.send({
				method: "POST",
				path: "/batches",
				body: buildBody(runtime.config().defaults.batchRequest, { requests: batchRequests(params) }, params.options),
				beta: BETA,
				signal,
			});
		case "get":
			return client.send({ method: "GET", path: idPath, beta: BETA, signal });
		case "list":
			return client.send({
				method: "GET",
				path: "/batches",
				query: { limit: params.limit, cursor: params.cursor, status: params.status },
				beta: BETA,
				signal,
			});
		case "delete":
			return client.send({ method: "DELETE", path: idPath, beta: BETA, signal });
		default:
			return client.send({ method: "POST", path: `${idPath}/cancel`, beta: BETA, signal });
	}
}

function shouldWaitForBatch(params: BatchParams, config: ResolvedConfig, data: unknown): boolean {
	if (params.action !== "get") return false;
	return (params.wait ?? config.wait.batch.enabled) && !TERMINAL.has(statusOf(data));
}

/** Poll a batch until it reaches a terminal status or the wait budget expires. */
async function waitForBatch(
	client: ExaClient,
	config: ResolvedConfig,
	batchId: string,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<unknown> | undefined,
): Promise<{ data: unknown; timedOut: boolean }> {
	const report = progressReporter(onUpdate, `Waiting for batch ${batchId}:`);
	const outcome = await pollUntil<unknown>({
		timeoutMs: config.wait.batch.timeoutMs,
		intervalMs: config.wait.batch.pollIntervalMs,
		signal,
		isDone: (value) => TERMINAL.has(statusOf(value)),
		onProgress: (value) => report(`status ${statusOf(value)}`),
		poll: async () => {
			const polled = await client.send({
				method: "GET",
				path: `/batches/${encodeURIComponent(batchId)}`,
				beta: BETA,
				signal,
			});
			return polled.data;
		},
	});
	return { data: outcome.value, timedOut: outcome.timedOut };
}

export function registerBatchTool(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_batch",
		label: "Exa Batch",
		description:
			"Queue many `/search` or `/agent/runs` requests in one Batch API call and collect the results. " +
			"Actions: create, get (optionally waiting), list, delete, cancel. " +
			'Call exa_help with topic "batches" for the request shape.',
		promptSnippet: "Run many Exa requests as one batch",
		parameters: Type.Object({
			action: Type.Union(
				ACTIONS.map((value) => Type.Literal(value)),
				{ description: "Operation to perform." },
			),
			requests: Type.Optional(
				Type.Array(
					Type.Object(
						{
							customId: Type.String({ description: "Your unique handle for this request (unique inside the batch)." }),
							method: Type.Optional(Type.String({ description: 'HTTP method; only "POST" is supported today.' })),
							url: Type.Union([Type.Literal("/search"), Type.Literal("/agent/runs")], {
								description: "Target Exa route.",
							}),
							body: Type.Optional(
								Type.Object(
									{},
									{
										additionalProperties: true,
										description: "Request body for the target route (stream is not allowed).",
									},
								),
							),
						},
						{ additionalProperties: true },
					),
					{ description: "Requests to enqueue (action=create)." },
				),
			),
			batchId: Type.Optional(
				Type.String({ description: "Batch id, e.g. batch_01j... (required for get/delete/cancel)." }),
			),
			status: Type.Optional(
				Type.Union(
					["in_progress", "completed", "cancelling", "cancelled", "expired"].map((value) => Type.Literal(value)),
					{ description: "Filter for action=list." },
				),
			),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Page size for action=list." })),
			cursor: Type.Optional(Type.String({ description: "Pagination cursor from a previous list call." })),
			wait: Type.Optional(
				Type.Boolean({ description: "For get: wait until the batch reaches a terminal status (default true)." }),
			),
			options: optionsSchema('Extra body fields, e.g. { metadata: { team: "research" } }.'),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = runtime.config();
				const abort = signal ?? ctx.signal;
				const invalid = batchError(params);
				if (invalid) return textResult(invalid, { error: true });

				const response = await sendBatchAction(runtime.client(), runtime, params, abort);
				let data = response.data;
				let timedOut = false;
				const batchId = params.batchId ?? idOf(data);
				if (shouldWaitForBatch(params, config, data) && batchId) {
					const outcome = await waitForBatch(runtime.client(), config, batchId, abort, onUpdate);
					data = outcome.data;
					timedOut = outcome.timedOut;
				}
				const result = textResult(formatJson(data, config.output), {
					tool: "exa_batch",
					action: params.action,
					...(compactDetails({ ...response, data }) as object),
				});
				if (timedOut && batchId) {
					result.content[0].text += `\n\n[wait timed out after ${config.wait.batch.timeoutMs / 1000}s; call exa_batch action=get batchId=${batchId} to continue]`;
				}
				return result;
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_batch", error: true });
			}
		},
	});
}
