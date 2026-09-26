/**
 * exa_similar - POST /findSimilar.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatSearch, withNotes } from "../format.ts";
import { isJsonObject } from "../types.ts";
import {
	applyContentMode,
	buildBody,
	compactDetails,
	errorText,
	hasContentMode,
	optionsSchema,
	type Runtime,
	textResult,
	withContentMode,
} from "./common.ts";

export function registerSimilarTool(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_similar",
		label: "Exa Find Similar",
		description:
			"Find pages similar to a source URL. Use it to expand from a known good page: competitors, related papers, or more pages on the same topic. " +
			'Call exa_help with topic "similar" for advanced filters.',
		promptSnippet: "Find pages similar to a given URL with Exa",
		parameters: Type.Object({
			url: Type.String({ description: "The source page whose neighbors you want." }),
			numResults: Type.Optional(
				Type.Integer({
					minimum: 1,
					maximum: 100,
					description:
						"Number of results (default: from the config, 10 at the API). Results above 10 are billed extra.",
				}),
			),
			content: Type.Optional(
				Type.Union(
					["highlights", "text", "summary", "none"].map((value) => Type.Literal(value)),
					{ description: 'What to return per result: "highlights" (default), "text", "summary", or "none".' },
				),
			),
			includeDomains: Type.Optional(
				Type.Array(Type.String(), { description: "Restrict results to these domains or paths." }),
			),
			excludeDomains: Type.Optional(Type.Array(Type.String(), { description: "Exclude these domains or paths." })),
			options: optionsSchema(
				'Examples: { excludeSourceDomain: true, category: "publication", maxAgeHours: 0 }. Call exa_help with topic "similar" for the complete list.',
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				const body = buildBody(
					withContentMode(config.defaults.similar, params.content),
					{
						url: params.url,
						numResults: params.numResults,
						includeDomains: params.includeDomains,
						excludeDomains: params.excludeDomains,
					},
					params.options,
				);
				if (!params.content && !hasContentMode(body)) applyContentMode(body, "highlights");
				const response = await runtime.client().send({
					method: "POST",
					path: "/findSimilar",
					body,
					signal: signal ?? ctx.signal,
				});
				const data = response.data;
				const results = isJsonObject(data) && Array.isArray(data["results"]) ? data["results"] : [];
				const text = withNotes(
					formatSearch(data, config.output, {
						query: `similar to ${params.url}`,
						type: "findSimilar",
						count: results.length,
						requestId: response.requestId,
						label: "Exa similar",
					}),
					response.notes,
				);
				return textResult(text, { tool: "exa_similar", request: body, ...(compactDetails(response) as object) });
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_similar", error: true });
			}
		},
	});
}
