/**
 * exa_batch - the Batch API (`/batches`).
 *
 * The batch endpoints currently require the `Exa-Beta: batches-2026-06-06`
 * header, which this tool sends automatically.
 */

import { Type } from "typebox";
import type { AgentToolUpdateCallback, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatJson } from "../format.ts";
import { isJsonObject } from "../types.ts";
import {
	compactDetails,
	errorText,
	optionsSchema,
	pollUntil,
	progressReporter,
	buildBody,
	requireResponse,
	type Runtime,
	textResult,
	type ToolResult,
} from "./common.ts";

const ACTIONS = ["create", "get", "list", "delete", "cancel"] as const;
const BETA = "batches-2026-06-06";
const TERMINAL = new Set(["completed", "cancelled", "expired"]);

function statusOf(value: unknown): string {
	return isJsonObject(value) && typeof value.status === "string" ? value.status : "unknown";
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
								Type.Object({}, { additionalProperties: true, description: "Request body for the target route (stream is not allowed)." }),
							),
						},
						{ additionalProperties: true },
					),
					{ description: "Requests to enqueue (action=create)." },
				),
			),
			batchId: Type.Optional(Type.String({ description: "Batch id, e.g. batch_01j... (required for get/delete/cancel)." })),
			status: Type.Optional(
				Type.Union(
					["in_progress", "completed", "cancelling", "cancelled", "expired"].map((value) => Type.Literal(value)),
					{ description: "Filter for action=list." },
				),
			),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Page size for action=list." })),
			cursor: Type.Optional(Type.String({ description: "Pagination cursor from a previous list call." })),
			wait: Type.Optional(Type.Boolean({ description: "For get: wait until the batch reaches a terminal status (default true)." })),
			options: optionsSchema("Extra body fields, e.g. { metadata: { team: \"research\" } }."),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = runtime.config();
				const client = runtime.client();
				const abort = signal ?? ctx.signal;
				if ((params.action === "get" || params.action === "delete" || params.action === "cancel") && !params.batchId) {
					return textResult(`Error: batchId is required for action "${params.action}"`, { error: true });
				}
				let response;
				let result: ToolResult | undefined;
				switch (params.action) {
					case "create": {
						const requests = params.requests ?? (isJsonObject(params.options) ? params.options.requests : undefined);
						if (!Array.isArray(requests) || requests.length === 0) {
							return textResult("Error: requests is required for action=create", { error: true });
						}
						const body = buildBody(runtime.config().defaults.batchRequest, { requests }, params.options);
						response = await client.send({ method: "POST", path: "/batches", body, beta: BETA, signal: abort });
						break;
					}
					case "get":
						response = await client.send({
							method: "GET",
							path: `/batches/${encodeURIComponent(params.batchId as string)}`,
							beta: BETA,
							signal: abort,
						});
						break;
					case "list":
						response = await client.send({
							method: "GET",
							path: "/batches",
							query: { limit: params.limit, cursor: params.cursor, status: params.status },
							beta: BETA,
							signal: abort,
						});
						break;
					case "delete":
						response = await client.send({
							method: "DELETE",
							path: `/batches/${encodeURIComponent(params.batchId as string)}`,
							beta: BETA,
							signal: abort,
						});
						break;
					case "cancel":
						response = await client.send({
							method: "POST",
							path: `/batches/${encodeURIComponent(params.batchId as string)}/cancel`,
							beta: BETA,
							signal: abort,
						});
						break;
				}

				const settled = requireResponse(response, params.action);
				let data = settled.data;
				let timedOut = false;
				const batchId = params.batchId ?? (isJsonObject(data) && typeof data.id === "string" ? data.id : undefined);
				const shouldWait =
					params.action === "get" &&
					(params.wait ?? config.wait.batch.enabled) &&
					!TERMINAL.has(statusOf(data));
				if (shouldWait && batchId) {
					const report = progressReporter(onUpdate as AgentToolUpdateCallback<unknown> | undefined, `Waiting for batch ${batchId}:`);
					const outcome = await pollUntil<unknown>({
						timeoutMs: config.wait.batch.timeoutMs,
						intervalMs: config.wait.batch.pollIntervalMs,
						signal: abort,
						isDone: (value) => TERMINAL.has(statusOf(value)),
						onProgress: (value) => report(`status ${statusOf(value)}`),
						poll: async () => {
							const polled = await client.send({
								method: "GET",
								path: `/batches/${encodeURIComponent(batchId)}`,
								beta: BETA,
								signal: abort,
							});
							return polled.data;
						},
					});
					data = outcome.value;
					timedOut = outcome.timedOut;
				}
				result = textResult(formatJson(data, config.output), {
					tool: "exa_batch",
					action: params.action,
					...(compactDetails({ ...settled, data }) as object),
				});
				if (timedOut && batchId) {
					result.content[0].text += `\n\n[wait timed out after ${config.wait.batch.timeoutMs}ms; call exa_batch action=get batchId=${batchId} to continue]`;
				}
				return result;
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_batch", error: true });
			}
		},
	});
}
