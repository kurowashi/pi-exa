/**
 * Core tools: the small always-on surface (search, contents, answer).
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatAnswer, formatContents, formatSearch, withNotes } from "../format.ts";
import { isJsonObject } from "../types.ts";
import {
	applyContentMode,
	buildBody,
	compactDetails,
	errorText,
	hasContentMode,
	optionsSchema,
	withContentMode,
	type Runtime,
	textResult,
} from "./common.ts";

const SEARCH_TYPES = ["instant", "fast", "auto", "deep-lite", "deep", "deep-reasoning"] as const;
const SEARCH_CATEGORIES = [
	"company",
	"publication",
	"news",
	"personal site",
	"financial report",
	"people",
	"research paper",
	"pdf",
	"github",
] as const;

function stringEnum(values: readonly string[], description: string) {
	return Type.Optional(
		Type.Union(
			values.map((value) => Type.Literal(value)),
			{ description },
		),
	);
}

function searchParams() {
	return {
		query: Type.String({
			description:
				"Natural-language search query. Include the subject, the kind of source, and a time period when they matter.",
		}),
		type: stringEnum(
			SEARCH_TYPES,
			'Search mode. "auto" (default) balances quality and latency; "deep-lite"/"deep"/"deep-reasoning" run multi-step research with synthesis (slower, more expensive); "fast"/"instant" reduce latency.',
		),
		numResults: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 100,
				description: "Number of results to return (default: from the config, 10 at the API). Results above 10 are billed extra.",
			}),
		),
		category: stringEnum(
			SEARCH_CATEGORIES,
			"Focus the search on a content category. Some categories only support a limited set of filters.",
		),
		includeDomains: Type.Optional(
			Type.Array(Type.String(), { description: 'Restrict results to these domains or paths, e.g. ["arxiv.org", "exa.ai/blog"].' }),
		),
		excludeDomains: Type.Optional(
			Type.Array(Type.String(), { description: "Exclude results from these domains or paths." }),
		),
		startPublishedDate: Type.Optional(
			Type.String({ description: "Only pages published after this ISO 8601 date, e.g. 2025-01-01." }),
		),
		endPublishedDate: Type.Optional(
			Type.String({ description: "Only pages published before this ISO 8601 date." }),
		),
		content: stringEnum(
			["highlights", "text", "summary", "none"],
			'What to return for each result. "highlights" (default) returns query-relevant excerpts; "text" returns the full page; "summary" adds an LLM summary; "none" returns metadata only. Requests for text and highlights together bill two views.',
		),
		options: optionsSchema(
			'Examples: { additionalQueries: ["..."], outputSchema: {...}, systemPrompt: "...", numResults: 20, contents: { text: { maxCharacters: 8000 } }, moderation: true }. Call exa_help with topic "search" for the complete list.',
		),
	};
}

export function registerCoreTools(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_search",
		label: "Exa Search",
		description:
			"Search the web with Exa and return ranked pages with query-relevant highlights (default), full text, or summaries. " +
			"Use it for factual lookups, current events, source discovery, and any task that needs fresh web information. " +
			'Call exa_help with topic "search" before using the advanced `options` argument or deep-research modes. ' +
			'For structured multi-source research or list building, prefer exa_agent_run (exa_help topic "agent").',
		promptSnippet: "Search the web with Exa and get page contents (highlights, text, or summary)",
		promptGuidelines: [
			"Use exa_search instead of guessing web content; cite the returned URLs in the answer.",
		],
		parameters: Type.Object(searchParams()),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				const body = buildBody(
					withContentMode(config.defaults.search, params.content),
					{
						query: params.query,
						type: params.type,
						numResults: params.numResults,
						category: params.category,
						includeDomains: params.includeDomains,
						excludeDomains: params.excludeDomains,
						startPublishedDate: params.startPublishedDate,
						endPublishedDate: params.endPublishedDate,
					},
					params.options,
				);
				if (!params.content && !hasContentMode(body)) applyContentMode(body, "highlights");

				const response = await runtime.client().send({ method: "POST", path: "/search", body, signal: signal ?? ctx.signal });
				const data = response.data;
				const results = isJsonObject(data) && Array.isArray(data.results) ? data.results : [];
				const resolvedType =
					(isJsonObject(data) && (data.resolvedSearchType || data.searchType)) || body.type || "auto";
				const text = withNotes(
					formatSearch(data, config.output, {
						query: params.query,
						type: typeof resolvedType === "string" ? resolvedType : String(resolvedType),
						count: results.length,
						requestId: response.requestId,
					}),
					response.notes,
				);
				return textResult(text, { tool: "exa_search", request: body, ...(compactDetails(response) as object) });
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_search", error: true });
			}
		},
	});

	pi.registerTool({
		name: "exa_contents",
		label: "Exa Contents",
		description:
			"Extract clean text, query-relevant highlights, or LLM summaries from URLs you already have. " +
			"Also returns page links and image URLs via options { extras: { links, imageLinks } }. " +
			"Use it to read pages found by exa_search or given by the user. " +
			'Call exa_help with topic "contents" for subpage crawling and freshness controls.',
		promptSnippet: "Extract text, highlights, summaries, links, or image URLs from specific URLs with Exa",
		parameters: Type.Object({
			urls: Type.Array(Type.String(), {
				minItems: 1,
				description: "URLs to extract content from (or Exa document ids returned by a search).",
			}),
			content: stringEnum(
				["text", "highlights", "summary", "text+highlights"],
				'What to return for each page: "text" (default), "highlights", "summary", or both text and highlights.',
			),
			options: optionsSchema(
				'Examples: { text: { maxCharacters: 20000 }, maxAgeHours: 0, subpages: 5, extras: { links: 3 } }. Call exa_help with topic "contents" for the complete list.',
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				const body = buildBody(
					withContentMode(config.defaults.contents, params.content, false),
					{ urls: params.urls },
					params.options,
				);
				if (!params.content && !hasContentMode(body, false)) applyContentMode(body, "text", false);
				const response = await runtime.client().send({ method: "POST", path: "/contents", body, signal: signal ?? ctx.signal });
				const text = withNotes(formatContents(response.data, config.output), response.notes);
				return textResult(text, { tool: "exa_contents", request: { path: "/contents", urls: body.urls }, ...(compactDetails(response) as object) });
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_contents", error: true });
			}
		},
	});

	pi.registerTool({
		name: "exa_answer",
		label: "Exa Answer",
		description:
			"Ask a question and get one grounded answer with citations, generated from an Exa search. " +
			"Use it for direct factual questions where a single cited answer is more useful than a result list. " +
			'Call exa_help with topic "answer" to use outputSchema or choose a different model.',
		promptSnippet: "Get a grounded answer with citations from Exa",
		parameters: Type.Object({
			query: Type.String({ description: "The question or instruction to answer." }),
			options: optionsSchema(
				'Examples: { model: "exa-pro", outputSchema: { type: "object", properties: {...} }, systemPrompt: "Prefer official sources" }. Call exa_help with topic "answer" for the complete list.',
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const config = runtime.config();
				const body = buildBody(config.defaults.answer, { query: params.query }, params.options);
				const response = await runtime.client().send({ method: "POST", path: "/answer", body, signal: signal ?? ctx.signal });
				const text = withNotes(formatAnswer(response.data, config.output, params.query), response.notes);
				return textResult(text, { tool: "exa_answer", request: body, ...(compactDetails(response) as object) });
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_answer", error: true });
			}
		},
	});
}
