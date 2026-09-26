/**
 * exa_webhooks - webset webhooks and the system event feed (`/websets/v0`).
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatJson } from "../format.ts";
import {
	buildBody,
	compactDetails,
	errorText,
	optionsSchema,
	queryFrom,
	requireResponse,
	type Runtime,
	textResult,
} from "./common.ts";

const ACTIONS = ["create", "list", "get", "update", "delete", "attempts", "events", "event"] as const;

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
				const client = runtime.client();
				const abort = signal ?? ctx.signal;
				const query = { limit: params.limit, cursor: params.cursor, ...queryFrom(params.options) };
				const base = "/websets/v0/webhooks";
				const webhookPath = params.webhookId ? `${base}/${encodeURIComponent(params.webhookId)}` : base;
				if (params.action !== "create" && params.action !== "list" && params.action !== "events" && !params.webhookId && params.action !== "event") {
					return textResult(`Error: webhookId is required for action "${params.action}"`, { error: true });
				}
				if (params.action === "event" && !params.id) {
					return textResult('Error: id is required for action "event"', { error: true });
				}

				let response;
				switch (params.action) {
					case "create": {
						const body = buildBody({}, {}, params.options);
						response = await client.send({ method: "POST", path: base, body, signal: abort });
						break;
					}
					case "list":
						response = await client.send({ method: "GET", path: base, query, signal: abort });
						break;
					case "get":
						response = await client.send({ method: "GET", path: webhookPath, signal: abort });
						break;
					case "update": {
						const body = buildBody({}, {}, params.options);
						response = await client.send({ method: "PATCH", path: webhookPath, body, signal: abort });
						break;
					}
					case "delete":
						response = await client.send({ method: "DELETE", path: webhookPath, signal: abort });
						break;
					case "attempts":
						response = await client.send({ method: "GET", path: `${webhookPath}/attempts`, query, signal: abort });
						break;
					case "events":
						response = await client.send({ method: "GET", path: "/websets/v0/events", query, signal: abort });
						break;
					case "event":
						response = await client.send({
							method: "GET",
							path: `/websets/v0/events/${encodeURIComponent(params.id as string)}`,
							signal: abort,
						});
						break;
				}
				const settled = requireResponse(response, params.action);
				return textResult(formatJson(settled.data, config.output), {
					tool: "exa_webhooks",
					action: params.action,
					...(compactDetails(settled) as object),
				});
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_webhooks", error: true });
			}
		},
	});
}
