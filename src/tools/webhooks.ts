/**
 * exa_webhooks - webset webhooks and the system event feed (`/websets/v0`).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ExaClient, ExaResponse } from "../client.ts";
import { formatJson } from "../format.ts";
import { buildBody, compactDetails, errorText, optionsSchema, queryFrom, type Runtime, textResult } from "./common.ts";

const ACTIONS = ["create", "list", "get", "update", "delete", "attempts", "events", "event"] as const;

/** Send the request for one webhook action; every action produces a response. */
async function sendWebhookAction(
	client: ExaClient,
	action: string,
	base: string,
	webhookPath: string,
	query: Record<string, unknown>,
	options: unknown,
	id: string | undefined,
	signal: AbortSignal | undefined,
): Promise<ExaResponse> {
	switch (action) {
		case "create":
			return client.send({ method: "POST", path: base, body: buildBody({}, {}, options), signal });
		case "list":
			return client.send({ method: "GET", path: base, query, signal });
		case "get":
			return client.send({ method: "GET", path: webhookPath, signal });
		case "update":
			return client.send({ method: "PATCH", path: webhookPath, body: buildBody({}, {}, options), signal });
		case "delete":
			return client.send({ method: "DELETE", path: webhookPath, signal });
		case "attempts":
			return client.send({ method: "GET", path: `${webhookPath}/attempts`, query, signal });
		case "events":
			return client.send({ method: "GET", path: "/websets/v0/events", query, signal });
		default:
			return client.send({ method: "GET", path: `/websets/v0/events/${encodeURIComponent(id ?? "")}`, signal });
	}
}

export function registerWebhooksTool(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_webhooks",
		label: "Exa Webhooks",
		description:
			"Manage Exa webhooks and read the event feed: create/list/get/update/delete webhooks, list delivery attempts, " +
			"and list or fetch system events. " +
			'Call exa_help with topic "webhooks" for payloads and the event type list.',
		promptSnippet: "Manage Exa webhooks and read the Exa event feed",
		parameters: Type.Object({
			action: Type.Union(
				ACTIONS.map((value) => Type.Literal(value)),
				{ description: "Operation to perform." },
			),
			webhookId: Type.Optional(Type.String({ description: "Webhook id (required for get/update/delete/attempts)." })),
			id: Type.Optional(Type.String({ description: "Event id (required for action=event)." })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Page size (default 25)." })),
			cursor: Type.Optional(Type.String({ description: "Pagination cursor from a previous call." })),
			options: optionsSchema(
				'Body fields for create/update ({ events: [...], url: "...", metadata: {...} }) or { query: {...} } for filters, e.g. { query: { types: ["webset.item.created"] } }. Call exa_help with topic "webhooks".',
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				const abort = signal ?? ctx.signal;
				const query = { limit: params.limit, cursor: params.cursor, ...queryFrom(params.options) };
				const base = "/websets/v0/webhooks";
				const webhookPath = params.webhookId ? `${base}/${encodeURIComponent(params.webhookId)}` : base;
				const needsWebhookId = ["get", "update", "delete", "attempts"].includes(params.action);
				if (needsWebhookId && !params.webhookId) {
					return textResult(`Error: webhookId is required for action "${params.action}"`, { error: true });
				}
				if (params.action === "event" && !params.id) {
					return textResult('Error: id is required for action "event"', { error: true });
				}
				const response = await sendWebhookAction(
					runtime.client(),
					params.action,
					base,
					webhookPath,
					query,
					params.options,
					params.id,
					abort,
				);
				return textResult(formatJson(response.data, config.output), {
					tool: "exa_webhooks",
					action: params.action,
					...(compactDetails(response) as object),
				});
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_webhooks", error: true });
			}
		},
	});
}
