/**
 * Exa Agent runs (`/agent/runs`): async deep research, list building, and
 * structured row enrichment.
 */

import type { AgentToolUpdateCallback, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ExaResponse } from "../client.ts";
import { formatAgentRun, formatJson, withNotes } from "../format.ts";
import { isJsonObject } from "../types.ts";
import {
	buildBody,
	compactDetails,
	errorText,
	optionsSchema,
	pollUntil,
	progressReporter,
	type Runtime,
	type ToolResult,
	textResult,
} from "./common.ts";

const EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "auto", "ultra"] as const;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function statusOf(value: unknown): string {
	return isJsonObject(value) && typeof value["status"] === "string" ? value["status"] : "unknown";
}

function idOf(value: unknown): string | undefined {
	return isJsonObject(value) && typeof value["id"] === "string" ? value["id"] : undefined;
}

interface WaitOutcome {
	run: unknown;
	timedOut: boolean;
	polls: number;
}

async function pollRun(
	runtime: Runtime,
	runId: string,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<unknown> | undefined,
): Promise<WaitOutcome> {
	const config = runtime.config();
	const report = progressReporter(onUpdate, `Waiting for agent run ${runId}:`);
	const outcome = await pollUntil<unknown>({
		timeoutMs: config.wait.agent.timeoutMs,
		intervalMs: config.wait.agent.pollIntervalMs,
		signal,
		isDone: (value) => TERMINAL.has(statusOf(value)),
		onProgress: (value) => report(`status ${statusOf(value)}`),
		poll: async () => {
			const response = await runtime
				.client()
				.send({ method: "GET", path: `/agent/runs/${encodeURIComponent(runId)}`, signal });
			return response.data;
		},
	});
	return { run: outcome.value, timedOut: outcome.timedOut, polls: outcome.polls };
}

function runResult(runtime: Runtime, run: unknown, extra: Record<string, unknown> = {}): ToolResult {
	const text = formatAgentRun(run, runtime.config().output);
	const runId = idOf(run);
	return textResult(text, { tool: "exa_agent", runId, run, ...extra });
}

/** Send the control request for one action; every action produces a response. */
async function sendControl(
	runtime: Runtime,
	action: string,
	runId: string | undefined,
	limit: number | undefined,
	cursor: string | undefined,
	signal: AbortSignal | undefined,
): Promise<ExaResponse> {
	const runPath = runId ? `/agent/runs/${encodeURIComponent(runId)}` : "/agent/runs";
	switch (action) {
		case "list":
			return runtime.client().send({ method: "GET", path: "/agent/runs", query: { limit, cursor }, signal });
		case "cancel":
		case "stop":
			return runtime.client().send({ method: "POST", path: `${runPath}/${action}`, signal });
		case "delete":
			return runtime.client().send({ method: "DELETE", path: runPath, signal });
		default:
			return runtime.client().send({ method: "GET", path: `${runPath}/events`, query: { limit, cursor }, signal });
	}
}

export function registerAgentTools(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_agent_run",
		label: "Exa Agent Run",
		description:
			"Start an asynchronous Exa Agent run for high-compute research: open-ended list building, entity enrichment, multi-hop research, " +
			"or any task that needs many parallel searches and a schema-validated JSON result. " +
			"Runs are billed by effort (fixed price for minimal/low/medium/high/xhigh; metered for auto/ultra). " +
			'By default the tool waits for completion. Requires the agent tool group: call exa_help with topic "agent" if you need the full parameter reference.',
		promptSnippet: "Run a deep-research / list-building Agent task and get grounded structured output",
		promptGuidelines: [
			"Use exa_agent_run when a task needs several searches or schema-validated structured output; use exa_search for a single lookup.",
			"Bound list sizes in outputSchema with maxItems: cost scales with the number of entities.",
		],
		parameters: Type.Object({
			query: Type.String({
				description:
					"What to find or produce, described as data: entities, fields, and constraints. Not just the topic.",
			}),
			effort: Type.Optional(
				Type.Union(
					EFFORTS.map((value) => Type.Literal(value)),
					{
						description:
							'Cost/reasoning level. Fixed per request: minimal $0.012, low $0.025, medium $0.10 (default), high $0.50, xhigh $1.00. "auto" meters usage up to $5 by default and suits variable-scope list building; "ultra" meters up to $20 and supports stop.',
					},
				),
			),
			outputSchema: Type.Optional(
				Type.Object(
					{},
					{
						additionalProperties: true,
						description:
							"JSON Schema for the answer. The result arrives in output.structured; unsupported fields come back as null. Array items are bounded by maxItems.",
					},
				),
			),
			wait: Type.Optional(
				Type.Boolean({
					description:
						"Wait for the run to finish before returning (default: from config, normally true). Set false to return the run id immediately and poll with exa_agent_get.",
				}),
			),
			options: optionsSchema(
				'Examples: { systemPrompt: "...", previousRunId: "agent_run_...", input: { data: [...], exclusion: [...] }, budget: { maxCostDollars: 10 }, dataSources: [{ provider: "similarweb" }], metadata: {...} }. Call exa_help with topic "agent" for the complete list.',
			),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = runtime.config();
				const body = buildBody(
					config.defaults.agentRun,
					{ query: params.query, effort: params.effort, outputSchema: params.outputSchema },
					params.options,
				);
				const create = await runtime.client().send({
					method: "POST",
					path: "/agent/runs",
					body,
					signal: signal ?? ctx.signal,
				});
				let run = create.data;
				const runId = idOf(run);
				const shouldWait = params.wait ?? config.wait.agent.enabled;
				let timedOut = false;
				if (shouldWait && runId && !TERMINAL.has(statusOf(run))) {
					const outcome = await pollRun(runtime, runId, signal ?? ctx.signal, onUpdate);
					run = outcome.run;
					timedOut = outcome.timedOut;
				}
				const result = runResult(runtime, run, { request: body, notes: create.notes });
				if (timedOut && runId) {
					result.content[0].text += `\n\n[wait timed out after ${config.wait.agent.timeoutMs}ms; call exa_agent_get with runId=${runId} to continue polling]`;
				}
				return result;
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_agent_run", error: true });
			}
		},
	});

	pi.registerTool({
		name: "exa_agent_get",
		label: "Exa Agent Get",
		description:
			"Fetch an Exa Agent run by id, optionally waiting for it to finish. Use it to poll a run created with exa_agent_run wait=false, " +
			"or to retrieve a completed run later (runs are stored server-side).",
		promptSnippet: "Fetch an Exa Agent run by id",
		parameters: Type.Object({
			runId: Type.String({ description: "Agent run id, e.g. agent_run_01j7x9v0m2n4p6q8r0s2t4v6w8." }),
			wait: Type.Optional(
				Type.Boolean({
					description: "Wait for the run to finish before returning (default: from config, normally true).",
				}),
			),
			options: optionsSchema("Reserved for future query parameters; currently unused."),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const config = runtime.config();
				const fetchRun = async (): Promise<unknown> => {
					const response = await runtime.client().send({
						method: "GET",
						path: `/agent/runs/${encodeURIComponent(params.runId)}`,
						signal: signal ?? ctx.signal,
					});
					return response.data;
				};
				let run = await fetchRun();
				const shouldWait = (params.wait ?? config.wait.agent.enabled) && !TERMINAL.has(statusOf(run));
				let timedOut = false;
				if (shouldWait) {
					const outcome = await pollRun(runtime, params.runId, signal ?? ctx.signal, onUpdate);
					run = outcome.run;
					timedOut = outcome.timedOut;
				}
				const result = runResult(runtime, run);
				if (timedOut) {
					result.content[0].text += `\n\n[wait timed out after ${config.wait.agent.timeoutMs}ms; call exa_agent_get again with runId=${params.runId}]`;
				}
				return result;
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_agent_get", error: true });
			}
		},
	});

	pi.registerTool({
		name: "exa_agent_control",
		label: "Exa Agent Control",
		description:
			"Manage Exa Agent runs: list recent runs, cancel a run (discards output), stop an ultra run (keeps partial results), " +
			"delete a run, or replay a run's stored events for debugging.",
		promptSnippet: "List, cancel, stop, delete, or inspect Exa Agent runs",
		parameters: Type.Object({
			action: Type.Union(
				["list", "cancel", "stop", "delete", "events"].map((value) => Type.Literal(value)),
				{ description: "Operation to perform. cancel/stop/delete/events require runId; list accepts limit/cursor." },
			),
			runId: Type.Optional(Type.String({ description: "Agent run id (required for cancel, stop, delete, events)." })),
			limit: Type.Optional(
				Type.Integer({ minimum: 1, maximum: 100, description: "Page size for list and events (default 25)." }),
			),
			cursor: Type.Optional(Type.String({ description: "Pagination cursor returned by a previous list/events call." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				if (params.action !== "list" && !params.runId) {
					return textResult(`Error: runId is required for action "${params.action}"`, { error: true });
				}
				const response = await sendControl(
					runtime,
					params.action,
					params.runId,
					params.limit,
					params.cursor,
					signal ?? ctx.signal,
				);
				const details = { tool: "exa_agent_control", action: params.action, ...(compactDetails(response) as object) };
				if (params.action === "list") {
					return textResult(formatJson(response.data, config.output), details);
				}
				const text =
					params.action === "events"
						? withNotes(formatJson(response.data, config.output), response.notes)
						: withNotes(formatAgentRun(response.data, config.output), response.notes);
				return textResult(text, details);
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_agent_control", error: true });
			}
		},
	});
}
