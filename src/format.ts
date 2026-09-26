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
	const cost = data.costDollars;
	if (!isJsonObject(cost)) return undefined;
	const total = numberOf(cost.total);
	if (total === undefined) return undefined;
	return `cost $${total.toFixed(4)}`;
}

export function groundingLines(grounding: unknown, limit = 12): string[] {
	const lines: string[] = [];
	for (const entry of arrayOf(grounding).slice(0, limit)) {
		if (!isJsonObject(entry)) continue;
		const field = stringOf(entry.field);
		const citations = arrayOf(entry.citations)
			.map((citation) => (isJsonObject(citation) ? stringOf(citation.url) : undefined))
			.filter((url): url is string => Boolean(url));
		const confidence = stringOf(entry.confidence);
		if (!field) continue;
		const suffix = confidence ? ` [${confidence}]` : "";
		lines.push(`${field}${suffix} → ${citations.slice(0, 4).join(", ") || "(no citations)"}`);
	}
	if (arrayOf(grounding).length > limit) lines.push(`…${arrayOf(grounding).length - limit} more grounding fields`);
	return lines;
}

/** Render one search result under the given per-result budget. */
function searchResultBlock(result: unknown, index: number, output: OutputSettings, statusText = ""): string {
	if (!isJsonObject(result)) return `${index}. ${JSON.stringify(result)}`;
	const lines: string[] = [];
	const title = stringOf(result.title) ?? "(untitled)";
	const url = stringOf(result.url) ?? stringOf(result.id) ?? "(no url)";
	lines.push(`${index}. ${title}`);
	lines.push(`   ${url}${statusText}`);
	const meta: string[] = [];
	const published = stringOf(result.publishedDate);
	if (published) meta.push(`published ${published}`);
	const author = stringOf(result.author);
	if (author) meta.push(`author ${author}`);
	if (meta.length > 0) lines.push(`   ${meta.join(" · ")}`);

	const highlights = arrayOf(result.highlights)
		.map((value) => stringOf(value))
		.filter((value): value is string => Boolean(value));
	if (highlights.length > 0) {
		lines.push("   highlights:");
		let budget = output.maxCharsPerResult;
		for (const highlight of highlights) {
			if (budget <= 0) {
				lines.push("   - …");
				break;
			}
			const text = highlight.length > budget ? `${highlight.slice(0, budget)}…` : highlight;
			budget -= text.length;
			lines.push(`   - ${text.replace(/\n+/g, " ")}`);
		}
	}
	const summary = stringOf(result.summary);
	if (summary) {
		lines.push("   summary:");
		lines.push(indentBlock(truncate(summary, output.maxCharsPerResult), "   "));
	}
	const text = stringOf(result.text);
	if (text) {
		lines.push(`   text (${text.length} chars):`);
		lines.push(indentBlock(truncate(text, output.maxCharsPerResult), "   "));
	}
	const subpages = arrayOf(result.subpages);
	if (subpages.length > 0) {
		lines.push(`   subpages: ${subpages.length}`);
		for (const subpage of subpages.slice(0, 5)) {
			if (!isJsonObject(subpage)) continue;
			lines.push(`   - ${stringOf(subpage.url) ?? "?"}`);
		}
	}
	const extras = isJsonObject(result.extras) ? result.extras : undefined;
	if (extras) {
		const allLinks = arrayOf(extras.links).map(String);
		if (allLinks.length > 0) {
			const shown = allLinks.slice(0, 10);
			lines.push(
				`   links (${allLinks.length}): ${shown.join(" ")}${allLinks.length > shown.length ? ` …+${allLinks.length - shown.length}` : ""}`,
			);
		}
		const allImageLinks = arrayOf(extras.imageLinks).map(String);
		if (allImageLinks.length > 0) {
			const shown = allImageLinks.slice(0, 10);
			lines.push(
				`   images (${allImageLinks.length}): ${shown.join(" ")}${allImageLinks.length > shown.length ? ` …+${allImageLinks.length - shown.length}` : ""}`,
			);
		}
	}
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
	query?: string;
	type?: string;
	count?: number;
	requestId?: string;
	/** Header label, defaults to "Exa search". */
	label?: string;
}

export function formatSearch(data: unknown, output: OutputSettings, summary: SearchSummary): string {
	const budget = new Budget(output.maxTotalChars);
	const results = isJsonObject(data) ? arrayOf(data.results) : [];
	const header: string[] = [];
	const label = summary.label ?? "Exa search";
	if (summary.query) header.push(`${label}: ${JSON.stringify(summary.query)}`);
	else header.push(label);
	if (summary.type) header.push(`type=${summary.type}`);
	header.push(`${results.length} result${results.length === 1 ? "" : "s"}`);
	const cost = costLine(data, output);
	if (cost) header.push(cost);
	if (summary.requestId) header.push(`requestId=${summary.requestId}`);
	budget.push(header.join(" · "));

	if (isJsonObject(data) && isJsonObject(data.output)) {
		const content = data.output.content;
		const rendered =
			typeof content === "string" ? content : content === undefined ? undefined : JSON.stringify(content, null, 2);
		if (rendered) {
			budget.pushTruncated(`Synthesized output:\n${indentBlock(truncate(rendered, output.maxTotalChars), "   ")}`);
		}
		const grounding = groundingLines(data.output.grounding);
		if (grounding.length > 0) budget.pushTruncated(`Grounding:\n${indentBlock(grounding.join("\n"), "   ")}`);
	}

	const limit = Math.min(results.length, output.maxResults);
	let shown = 0;
	for (let index = 0; index < limit; index += 1) {
		if (!budget.push(searchResultBlock(results[index], index + 1, output))) break;
		shown += 1;
	}
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

export function formatContents(data: unknown, output: OutputSettings): string {
	const budget = new Budget(output.maxTotalChars);
	const results = isJsonObject(data) ? arrayOf(data.results) : [];
	const statuses = isJsonObject(data) ? arrayOf(data.statuses) : [];
	const header: string[] = [`Exa contents: ${results.length} page${results.length === 1 ? "" : "s"}`];
	const cost = costLine(data, output);
	if (cost) header.push(cost);
	budget.push(header.join(" · "));

	const statusByUrl = new Map<string, JsonObject>();
	for (const status of statuses) {
		if (!isJsonObject(status)) continue;
		const id = stringOf(status.id);
		if (id) statusByUrl.set(id, status);
	}
	const limit = Math.min(results.length, output.maxResults);
	let shown = 0;
	for (let index = 0; index < limit; index += 1) {
		const result = results[index];
		if (!isJsonObject(result)) continue;
		const url = stringOf(result.url) ?? stringOf(result.id) ?? "(no url)";
		const status = statusByUrl.get(url);
		const statusText = status
			? ` [${stringOf(status.status) ?? "?"}${stringOf(status.source) ? `/${stringOf(status.source)}` : ""}]`
			: "";
		if (!budget.push(searchResultBlock(result, index + 1, output, statusText))) break;
		shown += 1;
	}
	for (const [url, status] of statusByUrl) {
		if (stringOf(status.status) !== "error") continue;
		const error = isJsonObject(status.error) ? status.error : undefined;
		const tag = error ? stringOf(error.tag) : undefined;
		const httpStatusCode = error ? numberOf(error.httpStatusCode) : undefined;
		budget.pushNotice(`failed: ${url}${tag ? ` (${tag}${httpStatusCode ? ` HTTP ${httpStatusCode}` : ""})` : ""}`);
	}
	const omitted = results.length - shown;
	if (omitted > 0) {
		budget.pushNotice(`[${omitted} page${omitted === 1 ? "" : "s"} omitted by the output budget]`);
	}
	return budget.toString();
}

export function formatAnswer(data: unknown, output: OutputSettings, query: string): string {
	const budget = new Budget(output.maxTotalChars);
	const header: string[] = [`Exa answer: ${JSON.stringify(query)}`];
	const cost = costLine(data, output);
	if (cost) header.push(cost);
	budget.push(header.join(" · "));

	if (isJsonObject(data)) {
		const answer = data.answer;
		const rendered =
			typeof answer === "string" ? answer : answer === undefined ? "(no answer)" : JSON.stringify(answer, null, 2);
		budget.pushTruncated(truncate(rendered, output.maxTotalChars));
		const citations = arrayOf(data.citations);
		if (citations.length > 0) {
			const lines: string[] = [];
			for (const [index, citation] of citations.slice(0, output.maxResults).entries()) {
				if (!isJsonObject(citation)) continue;
				const title = stringOf(citation.title) ?? "(untitled)";
				const url = stringOf(citation.url) ?? "?";
				const published = stringOf(citation.publishedDate);
				lines.push(`${index + 1}. ${title}\n   ${url}${published ? `\n   published ${published}` : ""}`);
			}
			if (citations.length > output.maxResults) {
				lines.push(`[${citations.length - output.maxResults} more citations omitted]`);
			}
			budget.pushTruncated(`Citations:\n${indentBlock(lines.join("\n"), "   ")}`);
		}
	}
	return budget.toString();
}

export function formatAgentRun(run: unknown, output: OutputSettings): string {
	if (!isJsonObject(run)) return formatJson(run, output);
	const lines: string[] = [];
	const id = stringOf(run.id) ?? "?";
	const status = stringOf(run.status) ?? "?";
	const stopReason = stringOf(run.stopReason);
	lines.push(`Agent run ${id}: status=${status}${stopReason ? ` stopReason=${stopReason}` : ""}`);
	const createdAt = stringOf(run.createdAt);
	const completedAt = stringOf(run.completedAt);
	if (createdAt) lines.push(`   created ${createdAt}${completedAt ? ` · completed ${completedAt}` : ""}`);
	const usage = isJsonObject(run.usage) ? run.usage : undefined;
	if (usage) {
		const parts: string[] = [];
		const acu = numberOf(usage.agentComputeUnits);
		if (acu !== undefined) parts.push(`${acu} ACU`);
		const searches = numberOf(usage.searches);
		if (searches !== undefined) parts.push(`${searches} searches`);
		const emails = numberOf(usage.emails);
		if (emails) parts.push(`${emails} emails`);
		const phoneNumbers = numberOf(usage.phoneNumbers);
		if (phoneNumbers) parts.push(`${phoneNumbers} phone numbers`);
		if (parts.length > 0) lines.push(`   usage: ${parts.join(", ")}`);
	}
	const cost = costLine(run, output);
	if (cost) lines.push(`   ${cost}`);
	const outputObject = isJsonObject(run.output) ? run.output : undefined;
	if (outputObject) {
		const text = stringOf(outputObject.text);
		if (text) lines.push(`\nAnswer:\n${indentBlock(truncate(text, output.maxTotalChars), "   ")}`);
		if (outputObject.structured !== undefined && outputObject.structured !== null) {
			lines.push(`\nStructured output:\n${indentBlock(truncate(JSON.stringify(outputObject.structured, null, 2), output.maxTotalChars), "   ")}`);
		}
		const grounding = groundingLines(outputObject.grounding);
		if (grounding.length > 0) lines.push(`\nGrounding:\n${indentBlock(grounding.join("\n"), "   ")}`);
	}
	if (status !== "completed") {
		lines.push(
			status === "queued" || status === "running"
				? `\nRun is still ${status}. Call exa_agent_get with runId=${id} later.`
				: `\nRun did not complete; inspect with exa_agent_control action=events runId=${id}.`,
		);
	}
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
