/**
 * exa_request - verbatim access to any documented Exa endpoint.
 *
 * The path is validated against the endpoint index so a typo cannot silently
 * hit the wrong resource.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatJson, withNotes } from "../format.ts";
import { isKnownPath, nearestPaths, normalizeRequestPath } from "../reference.ts";
import { compactDetails, errorText, optionsSchema, type Runtime, textResult } from "./common.ts";

export function registerRequestTool(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_request",
		label: "Exa Request",
		description:
			"Call any documented Exa endpoint directly. Use it for endpoints without a typed tool, or when a request needs fields the curated " +
			"arguments do not expose. The path is checked against the documented endpoint index. " +
			'Call exa_help with topic "raw" for the full path index and examples.',
		promptSnippet: "Call any documented Exa API endpoint with an explicit method and path",
		parameters: Type.Object({
			method: Type.Union(
				["GET", "POST", "PATCH", "DELETE"].map((value) => Type.Literal(value)),
				{ description: "HTTP method to use." },
			),
			path: Type.String({
				description:
					'Path below https://api.exa.ai with real ids substituted, e.g. "/search", "/agent/runs", "/websets/v0/websets/{id}".',
			}),
			body: optionsSchema("JSON request body for POST/PATCH."),
			query: Type.Optional(
				Type.Object({}, { additionalProperties: true, description: "Query-string parameters; arrays repeat the key." }),
			),
			beta: Type.Optional(Type.String({ description: 'Optional Exa-Beta header token, e.g. "batches-2026-06-06".' })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				const normalized = normalizeRequestPath(params.path);
				if (normalized.error || !normalized.path) {
					return textResult(`Error: ${normalized.error ?? "invalid path"}`, { tool: "exa_request", error: true });
				}
				const path = normalized.path;
				if (!isKnownPath(path)) {
					return textResult(
						`Error: "${path}" is not a documented Exa endpoint. Closest paths: ${nearestPaths(path).join(", ")}. ` +
							'Call exa_help with topic "raw" for the complete index.',
						{ tool: "exa_request", error: true },
					);
				}
				const response = await runtime.client().send({
					method: params.method,
					path,
					body: params.body as Record<string, unknown> | undefined,
					query: params.query as Record<string, unknown> | undefined,
					beta: params.beta,
					signal: signal ?? ctx.signal,
				});
				return textResult(withNotes(formatJson(response.data, config.output), response.notes), {
					tool: "exa_request",
					method: params.method,
					path,
					...(compactDetails(response) as object),
				});
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_request", error: true });
			}
		},
	});
}
