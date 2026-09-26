/**
 * Model-facing result formatting.
 *
 * Exa responses are verbose JSON. Tools return compact text: one block per
 * result with the requested content mode, bounded by the configured output
 * budget. The complete response stays available in the tool `details` for
 * renderers and later turns.
 */

import type { JsonObject, OutputSettings } from "./types.ts";
import { isJsonObject } from "./types.ts";

export function truncate(text: string, maxChars: number): string {
	if (maxChars <= 0) return "";
	if (text.length <= maxChars) return text;
	const cut = Math.max(0, maxChars);
	return `${text.slice(0, cut)}\n…[truncated ${text.length - cut} chars]`;
}

function stringOf(value: unknown): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	// Undecodable page content would fill the context with mojibake; drop it instead.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional C0 filter; tab, LF, and CR are allowed
	if (/[\u0000-\u0008\u000E-\u001F]/.test(value)) return undefined;
	if ((value.match(/\uFFFD/g)?.length ?? 0) > 20) return undefined;
	return value;
}

function numberOf(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function indentBlock(text: string, prefix = "   "): string {
	return text
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n");
}

export function costLine(data: unknown, output: OutputSettings): string | undefined {
	if (!output.includeCost || !isJsonObject(data)) return undefined;
	const cost = data["costDollars"];
	if (!isJsonObject(cost)) return undefined;
	const total = numberOf(cost["total"]);
	if (total === undefined) return undefined;
	return `cost $${total.toFixed(4)}`;
}

/** One grounding entry as a line, or undefined when it cannot be rendered. */
function groundingLine(entry: unknown): string | undefined {
	if (!isJsonObject(entry)) return undefined;
	const field = stringOf(entry["field"]);
	if (!field) return undefined;
	const citations = arrayOf(entry["citations"])
		.map((citation) => (isJsonObject(citation) ? stringOf(citation["url"]) : undefined))
		.filter((url): url is string => Boolean(url));
	const confidence = stringOf(entry["confidence"]);
	const suffix = confidence ? ` [${confidence}]` : "";
	return `${field}${suffix} → ${citations.slice(0, 4).join(", ") || "(no citations)"}`;
}

export function groundingLines(grounding: unknown, limit = 12): string[] {
	const entries = arrayOf(grounding);
	const lines: string[] = [];
	for (const entry of entries.slice(0, limit)) {
		const line = groundingLine(entry);
		if (line) lines.push(line);
	}
	if (entries.length > limit) lines.push(`…${entries.length - limit} more grounding fields`);
	return lines;
}

/** `published … · author …`, or undefined when neither exists. */
function publishedAuthorLine(result: JsonObject): string | undefined {
	const meta: string[] = [];
	const published = stringOf(result["publishedDate"]);
	if (published) meta.push(`published ${published}`);
	const author = stringOf(result["author"]);
	if (author) meta.push(`author ${author}`);
	return meta.length > 0 ? meta.join(" · ") : undefined;
}

/** Rendered highlights, each capped and kept inside the per-result budget. */
function highlightLines(highlights: unknown, maxChars: number): string[] {
	const texts = arrayOf(highlights)
		.map((value) => stringOf(value))
		.filter((value): value is string => Boolean(value));
	if (texts.length === 0) return [];
	const lines = ["   highlights:"];
	let budget = maxChars;
	for (const text of texts) {
		if (budget <= 0) {
			lines.push("   - …");
			break;
		}
		const shown = text.length > budget ? `${text.slice(0, budget)}…` : text;
		budget -= shown.length;
		lines.push(`   - ${shown.replace(/\n+/g, " ")}`);
	}
	return lines;
}

function subpageLines(subpages: unknown): string[] {
	const entries = arrayOf(subpages);
	if (entries.length === 0) return [];
	const lines = [`   subpages: ${entries.length}`];
	for (const subpage of entries.slice(0, 5)) {
		if (!isJsonObject(subpage)) continue;
		lines.push(`   - ${stringOf(subpage["url"]) ?? "?"}`);
	}
	return lines;
}

/** `links (12): url … …+2` style line for one extras list. */
function extrasLinkLine(label: string, links: unknown): string | undefined {
	const all = arrayOf(links).map(String);
	if (all.length === 0) return undefined;
	const shown = all.slice(0, 10);
	const rest = all.length > shown.length ? ` …+${all.length - shown.length}` : "";
	return `   ${label} (${all.length}): ${shown.join(" ")}${rest}`;
}

function extrasLines(extras: unknown): string[] {
	if (!isJsonObject(extras)) return [];
	const lines: string[] = [];
	const links = extrasLinkLine("links", extras["links"]);
	if (links) lines.push(links);
	const images = extrasLinkLine("images", extras["imageLinks"]);
	if (images) lines.push(images);
	return lines;
}

/** Render one search result under the given per-result budget. */
function searchResultBlock(result: unknown, index: number, output: OutputSettings, statusText = ""): string {
	if (!isJsonObject(result)) return `${index}. ${JSON.stringify(result)}`;
	const title = stringOf(result["title"]) ?? "(untitled)";
	const url = stringOf(result["url"]) ?? stringOf(result["id"]) ?? "(no url)";
	const lines = [`${index}. ${title}`, `   ${url}${statusText}`];
	const meta = publishedAuthorLine(result);
	if (meta) lines.push(`   ${meta}`);
	lines.push(...highlightLines(result["highlights"], output.maxCharsPerResult));
	const summary = stringOf(result["summary"]);
	if (summary) lines.push("   summary:", indentBlock(truncate(summary, output.maxCharsPerResult), "   "));
	const text = stringOf(result["text"]);
	if (text) lines.push(`   text (${text.length} chars):`, indentBlock(truncate(text, output.maxCharsPerResult), "   "));
	lines.push(...subpageLines(result["subpages"]));
	lines.push(...extrasLines(result["extras"]));
	return lines.join("\n");
}

class Budget {
	private readonly parts: string[] = [];
	private used = 0;
	private readonly maxChars: number;

	constructor(maxChars: number) {
		this.maxChars = maxChars;
	}

	/** Append `text` if it fits; return false instead of cutting it, so the caller can stop. */
	push(text: string): boolean {
		const separator = this.parts.length > 0 ? "\n\n" : "";
		const next = `${separator}${text}`;
		if (this.used + next.length > this.maxChars) return false;
		this.parts.push(text);
		this.used += next.length;
		return true;
	}

	pushNotice(text: string): void {
		const separator = this.parts.length > 0 ? "\n\n" : "";
		this.parts.push(text);
		this.used += separator.length + text.length;
	}

	/** Append `text`, cutting it to the remaining budget instead of dropping it silently. */
	pushTruncated(text: string): void {
		const separator = this.parts.length > 0 ? "\n\n" : "";
		const room = this.maxChars - this.used - separator.length;
		if (text.length <= room) {
			this.push(text);
			return;
		}
		const notice = `\n…[truncated ${text.length} chars by the output budget]`;
		this.pushNotice(`${text.slice(0, Math.max(0, room - notice.length))}${notice}`);
	}

	toString(): string {
		return this.parts.join("\n\n");
	}
}

export interface SearchSummary {
	query?: string | undefined;
	type?: string | undefined;
	count?: number | undefined;
	requestId?: string | undefined;
	/** Header label, defaults to "Exa search". */
	label?: string | undefined;
}

/** One-line summary header shared by every search-shaped result. */
function searchHeader(summary: SearchSummary, resultCount: number, cost: string | undefined): string {
	const label = summary.label ?? "Exa search";
	const header = summary.query ? [`${label}: ${JSON.stringify(summary.query)}`] : [label];
	if (summary.type) header.push(`type=${summary.type}`);
	header.push(`${resultCount} result${resultCount === 1 ? "" : "s"}`);
	if (cost) header.push(cost);
	if (summary.requestId) header.push(`requestId=${summary.requestId}`);
	return header.join(" · ");
}

/** The synthesized `output` block some Exa responses carry. */
function pushSynthesizedOutput(data: JsonObject, output: OutputSettings, budget: Budget): void {
	const outputObject = data["output"];
	if (!isJsonObject(outputObject)) return;
	const content = outputObject["content"];
	const rendered =
		typeof content === "string" ? content : content === undefined ? undefined : JSON.stringify(content, null, 2);
	if (rendered) {
		budget.pushTruncated(`Synthesized output:\n${indentBlock(truncate(rendered, output.maxTotalChars), "   ")}`);
	}
	const grounding = groundingLines(outputObject["grounding"]);
	if (grounding.length > 0) budget.pushTruncated(`Grounding:\n${indentBlock(grounding.join("\n"), "   ")}`);
}

/** Push result blocks until the budget refuses one; returns how many were shown. */
function pushSearchResults(results: unknown[], output: OutputSettings, budget: Budget): number {
	const limit = Math.min(results.length, output.maxResults);
	let shown = 0;
	for (let index = 0; index < limit; index += 1) {
		if (!budget.push(searchResultBlock(results[index], index + 1, output))) break;
		shown += 1;
	}
	return shown;
}

export function formatSearch(data: unknown, output: OutputSettings, summary: SearchSummary): string {
	const budget = new Budget(output.maxTotalChars);
	const results = isJsonObject(data) ? arrayOf(data["results"]) : [];
	budget.push(searchHeader(summary, results.length, costLine(data, output)));
	if (isJsonObject(data)) pushSynthesizedOutput(data, output, budget);

	const shown = pushSearchResults(results, output, budget);
	const omitted = results.length - shown;
	if (omitted > 0) {
		budget.pushNotice(
			`[${omitted} result${omitted === 1 ? "" : "s"} omitted by the output budget (` +
				`shown=${shown}, output.maxResults=${output.maxResults}, output.maxTotalChars=${output.maxTotalChars}); ` +
				`lower numResults so you do not pay for results that cannot be shown.]`,
		);
	}
	return budget.toString();
}

/** Contents responses report per-URL statuses in a separate array. */
function statusByUrl(statuses: unknown[]): Map<string, JsonObject> {
	const map = new Map<string, JsonObject>();
	for (const status of statuses) {
		if (!isJsonObject(status)) continue;
		const id = stringOf(status["id"]);
		if (id) map.set(id, status);
	}
	return map;
}

function statusSuffix(status: JsonObject | undefined): string {
	if (!status) return "";
	const name = stringOf(status["status"]) ?? "?";
	const source = stringOf(status["source"]);
	return ` [${name}${source ? `/${source}` : ""}]`;
}

function failedStatusLine(url: string, status: JsonObject): string | undefined {
	if (stringOf(status["status"]) !== "error") return undefined;
	const error = isJsonObject(status["error"]) ? status["error"] : undefined;
	const tag = error ? stringOf(error["tag"]) : undefined;
	const httpStatusCode = error ? numberOf(error["httpStatusCode"]) : undefined;
	const detail = tag ? ` (${tag}${httpStatusCode ? ` HTTP ${httpStatusCode}` : ""})` : "";
	return `failed: ${url}${detail}`;
}

function failedStatusLines(statuses: Map<string, JsonObject>): string[] {
	const lines: string[] = [];
	for (const [url, status] of statuses) {
		const line = failedStatusLine(url, status);
		if (line) lines.push(line);
	}
	return lines;
}

/** Push content blocks until the budget refuses one; returns how many were shown. */
function pushContentResults(
	results: unknown[],
	byUrl: Map<string, JsonObject>,
	output: OutputSettings,
	budget: Budget,
): number {
	const limit = Math.min(results.length, output.maxResults);
	let shown = 0;
	for (let index = 0; index < limit; index += 1) {
		const result = results[index];
		if (!isJsonObject(result)) continue;
		const url = stringOf(result["url"]) ?? stringOf(result["id"]) ?? "(no url)";
		if (!budget.push(searchResultBlock(result, index + 1, output, statusSuffix(byUrl.get(url))))) break;
		shown += 1;
	}
	return shown;
}

export function formatContents(data: unknown, output: OutputSettings): string {
	const budget = new Budget(output.maxTotalChars);
	const results = isJsonObject(data) ? arrayOf(data["results"]) : [];
	const statuses = isJsonObject(data) ? arrayOf(data["statuses"]) : [];
	const header = [`Exa contents: ${results.length} page${results.length === 1 ? "" : "s"}`];
	const cost = costLine(data, output);
	if (cost) header.push(cost);
	budget.push(header.join(" · "));

	const byUrl = statusByUrl(statuses);
	const shown = pushContentResults(results, byUrl, output, budget);
	for (const line of failedStatusLines(byUrl)) budget.pushNotice(line);
	const omitted = results.length - shown;
	if (omitted > 0) {
		budget.pushNotice(`[${omitted} page${omitted === 1 ? "" : "s"} omitted by the output budget]`);
	}
	return budget.toString();
}

/** Numbered citation lines, capped by the output budget. */
function citationLines(citations: unknown[], maxResults: number): string[] {
	const lines: string[] = [];
	for (const [index, citation] of citations.slice(0, maxResults).entries()) {
		if (!isJsonObject(citation)) continue;
		const title = stringOf(citation["title"]) ?? "(untitled)";
		const url = stringOf(citation["url"]) ?? "?";
		const published = stringOf(citation["publishedDate"]);
		lines.push(`${index + 1}. ${title}\n   ${url}${published ? `\n   published ${published}` : ""}`);
	}
	if (citations.length > maxResults) lines.push(`[${citations.length - maxResults} more citations omitted]`);
	return lines;
}

export function formatAnswer(data: unknown, output: OutputSettings, query: string): string {
	const budget = new Budget(output.maxTotalChars);
	const header = [`Exa answer: ${JSON.stringify(query)}`];
	const cost = costLine(data, output);
	if (cost) header.push(cost);
	budget.push(header.join(" · "));
	if (!isJsonObject(data)) return budget.toString();

	const answer = data["answer"];
	const rendered =
		typeof answer === "string" ? answer : answer === undefined ? "(no answer)" : JSON.stringify(answer, null, 2);
	budget.pushTruncated(truncate(rendered, output.maxTotalChars));
	const citations = arrayOf(data["citations"]);
	if (citations.length > 0) {
		budget.pushTruncated(`Citations:\n${indentBlock(citationLines(citations, output.maxResults).join("\n"), "   ")}`);
	}
	return budget.toString();
}

/** The usage line of an agent run, or undefined when nothing is reported. */
function usageLine(usage: JsonObject): string | undefined {
	const parts: string[] = [];
	const acu = numberOf(usage["agentComputeUnits"]);
	if (acu !== undefined) parts.push(`${acu} ACU`);
	const searches = numberOf(usage["searches"]);
	if (searches !== undefined) parts.push(`${searches} searches`);
	const emails = numberOf(usage["emails"]);
	if (emails) parts.push(`${emails} emails`);
	const phoneNumbers = numberOf(usage["phoneNumbers"]);
	if (phoneNumbers) parts.push(`${phoneNumbers} phone numbers`);
	return parts.length > 0 ? `   usage: ${parts.join(", ")}` : undefined;
}

/** The answer / structured / grounding block of a completed run. */
function agentOutputLines(outputObject: JsonObject, output: OutputSettings): string[] {
	const lines: string[] = [];
	const text = stringOf(outputObject["text"]);
	if (text) lines.push(`\nAnswer:\n${indentBlock(truncate(text, output.maxTotalChars), "   ")}`);
	const structured = outputObject["structured"];
	if (structured !== undefined && structured !== null) {
		lines.push(
			`\nStructured output:\n${indentBlock(truncate(JSON.stringify(structured, null, 2), output.maxTotalChars), "   ")}`,
		);
	}
	const grounding = groundingLines(outputObject["grounding"]);
	if (grounding.length > 0) lines.push(`\nGrounding:\n${indentBlock(grounding.join("\n"), "   ")}`);
	return lines;
}

/** How to continue a run that has not completed, or undefined when it has. */
function runStatusHint(status: string, id: string): string | undefined {
	if (status === "completed") return undefined;
	if (status === "queued" || status === "running")
		return `\nRun is still ${status}. Call exa_agent_get with runId=${id} later.`;
	return `\nRun did not complete; inspect with exa_agent_control action=events runId=${id}.`;
}

/** Header lines: id, status, and timestamps. */
function agentHeaderLines(run: JsonObject): string[] {
	const id = stringOf(run["id"]) ?? "?";
	const status = stringOf(run["status"]) ?? "?";
	const stopReason = stringOf(run["stopReason"]);
	const lines = [`Agent run ${id}: status=${status}${stopReason ? ` stopReason=${stopReason}` : ""}`];
	const createdAt = stringOf(run["createdAt"]);
	const completedAt = stringOf(run["completedAt"]);
	if (createdAt) lines.push(`   created ${createdAt}${completedAt ? ` · completed ${completedAt}` : ""}`);
	return lines;
}

export function formatAgentRun(run: unknown, output: OutputSettings): string {
	if (!isJsonObject(run)) return formatJson(run, output);
	const id = stringOf(run["id"]) ?? "?";
	const status = stringOf(run["status"]) ?? "?";
	const lines = agentHeaderLines(run);
	const usageObject = isJsonObject(run["usage"]) ? run["usage"] : undefined;
	const usage = usageObject ? usageLine(usageObject) : undefined;
	if (usage) lines.push(usage);
	const cost = costLine(run, output);
	if (cost) lines.push(`   ${cost}`);
	const outputObject = isJsonObject(run["output"]) ? run["output"] : undefined;
	if (outputObject) lines.push(...agentOutputLines(outputObject, output));
	const hint = runStatusHint(status, id);
	if (hint) lines.push(hint);
	return truncate(lines.join("\n"), output.maxTotalChars);
}

export function formatJson(data: unknown, output: OutputSettings): string {
	if (data === undefined || data === null) return "(empty response)";
	if (typeof data === "string") return truncate(data, output.maxTotalChars);
	return truncate(JSON.stringify(data, null, 2), output.maxTotalChars);
}

export function withNotes(text: string, notes: string[]): string {
	if (notes.length === 0) return text;
	return `note: ${notes.join("; ")}\n\n${text}`;
}
