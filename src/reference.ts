/**
 * On-demand API reference.
 *
 * These topics are never part of the system prompt. The model gets them by
 * calling `exa_help`, which also activates the matching tool group. This keeps
 * the always-on tool list small while still covering every Exa endpoint.
 *
 * Content is derived from the public Exa OpenAPI specs
 * (https://exa.ai/docs/exa-spec.yaml, https://exa.ai/docs/skill.md) and
 * https://exa.ai/docs/skill.md. Anything marked deprecated is kept for
 * completeness but should not be used for new work.
 */

export interface HelpTopic {
	title: string;
	summary: string;
	/** Tool groups enabled when this topic is requested. */
	groups: string[];
	body: string;
}

export interface EndpointDoc {
	method: string;
	path: string;
	summary: string;
	/** Topic that documents this endpoint. */
	topic: string;
}

export const ENDPOINTS: EndpointDoc[] = [
	{
		method: "POST",
		path: "/search",
		summary: "Web search with optional contents and synthesized output",
		topic: "search",
	},
	{
		method: "POST",
		path: "/contents",
		summary: "Extract text, highlights, or summaries from known URLs",
		topic: "contents",
	},
	{ method: "POST", path: "/answer", summary: "Grounded answer with citations from a search", topic: "answer" },
	{ method: "POST", path: "/findSimilar", summary: "Find pages similar to a URL", topic: "similar" },
	{ method: "POST", path: "/monitors", summary: "Create an Exa Agent Monitor", topic: "monitors" },
	{ method: "GET", path: "/monitors", summary: "List monitors", topic: "monitors" },
	{ method: "POST", path: "/monitors/batch", summary: "Pause, unpause, or delete many monitors", topic: "monitors" },
	{ method: "GET", path: "/monitors/{id}", summary: "Get a monitor", topic: "monitors" },
	{ method: "PATCH", path: "/monitors/{id}", summary: "Update a monitor", topic: "monitors" },
	{ method: "DELETE", path: "/monitors/{id}", summary: "Delete a monitor", topic: "monitors" },
	{ method: "POST", path: "/monitors/{id}/trigger", summary: "Run a monitor immediately", topic: "monitors" },
	{ method: "GET", path: "/monitors/{id}/runs", summary: "List monitor runs", topic: "monitors" },
	{ method: "GET", path: "/monitors/{id}/runs/{runId}", summary: "Get a monitor run", topic: "monitors" },
	{
		method: "POST",
		path: "/agent/runs",
		summary: "Create an Exa Agent run (deep research / list building)",
		topic: "agent",
	},
	{ method: "GET", path: "/agent/runs", summary: "List agent runs", topic: "agent" },
	{ method: "GET", path: "/agent/runs/{id}", summary: "Get an agent run", topic: "agent" },
	{ method: "DELETE", path: "/agent/runs/{id}", summary: "Delete an agent run", topic: "agent" },
	{ method: "POST", path: "/agent/runs/{id}/cancel", summary: "Cancel an agent run immediately", topic: "agent" },
	{
		method: "POST",
		path: "/agent/runs/{id}/stop",
		summary: "Stop an ultra run and keep partial results",
		topic: "agent",
	},
	{ method: "GET", path: "/agent/runs/{id}/events", summary: "Replay stored agent run events", topic: "agent" },
	{ method: "POST", path: "/batches", summary: "Create a batch of /search or /agent/runs requests", topic: "batches" },
	{ method: "GET", path: "/batches", summary: "List batches", topic: "batches" },
	{ method: "GET", path: "/batches/{id}", summary: "Get a batch", topic: "batches" },
	{ method: "DELETE", path: "/batches/{id}", summary: "Delete a batch", topic: "batches" },
	{ method: "POST", path: "/batches/{id}/cancel", summary: "Cancel a batch", topic: "batches" },
	{ method: "POST", path: "/websets/v0/websets", summary: "Create a Webset", topic: "websets" },
	{ method: "GET", path: "/websets/v0/websets", summary: "List Websets", topic: "websets" },
	{ method: "GET", path: "/websets/v0/websets/{id}", summary: "Get a Webset (add ?expand=items)", topic: "websets" },
	{ method: "POST", path: "/websets/v0/websets/{id}", summary: "Update a Webset title or metadata", topic: "websets" },
	{ method: "DELETE", path: "/websets/v0/websets/{id}", summary: "Delete a Webset", topic: "websets" },
	{ method: "POST", path: "/websets/v0/websets/{id}/cancel", summary: "Cancel all Webset work", topic: "websets" },
	{
		method: "POST",
		path: "/websets/v0/websets/preview",
		summary: "Preview how a Webset query is interpreted",
		topic: "websets",
	},
	{
		method: "POST",
		path: "/websets/v0/websets/{webset}/searches",
		summary: "Add a search to a Webset",
		topic: "websets",
	},
	{
		method: "GET",
		path: "/websets/v0/websets/{webset}/searches/{id}",
		summary: "Get Webset search status",
		topic: "websets",
	},
	{
		method: "POST",
		path: "/websets/v0/websets/{webset}/searches/{id}/cancel",
		summary: "Cancel a Webset search",
		topic: "websets",
	},
	{
		method: "POST",
		path: "/websets/v0/websets/{webset}/enrichments",
		summary: "Add an enrichment column",
		topic: "websets",
	},
	{
		method: "GET",
		path: "/websets/v0/websets/{webset}/enrichments/{id}",
		summary: "Get enrichment status",
		topic: "websets",
	},
	{
		method: "PATCH",
		path: "/websets/v0/websets/{webset}/enrichments/{id}",
		summary: "Update an enrichment",
		topic: "websets",
	},
	{
		method: "DELETE",
		path: "/websets/v0/websets/{webset}/enrichments/{id}",
		summary: "Delete an enrichment",
		topic: "websets",
	},
	{
		method: "POST",
		path: "/websets/v0/websets/{webset}/enrichments/{id}/cancel",
		summary: "Cancel an enrichment",
		topic: "websets",
	},
	{ method: "GET", path: "/websets/v0/websets/{webset}/items", summary: "List Webset items", topic: "websets" },
	{ method: "GET", path: "/websets/v0/websets/{webset}/items/{id}", summary: "Get a Webset item", topic: "websets" },
	{
		method: "DELETE",
		path: "/websets/v0/websets/{webset}/items/{id}",
		summary: "Delete a Webset item",
		topic: "websets",
	},
	{ method: "POST", path: "/websets/v0/imports", summary: "Create an import from a CSV/s3 source", topic: "websets" },
	{ method: "GET", path: "/websets/v0/imports", summary: "List imports", topic: "websets" },
	{ method: "GET", path: "/websets/v0/imports/{id}", summary: "Get an import", topic: "websets" },
	{ method: "PATCH", path: "/websets/v0/imports/{id}", summary: "Update an import", topic: "websets" },
	{ method: "DELETE", path: "/websets/v0/imports/{id}", summary: "Delete an import", topic: "websets" },
	{ method: "POST", path: "/websets/v0/monitors", summary: "Create a Webset refresh monitor", topic: "websets" },
	{ method: "GET", path: "/websets/v0/monitors", summary: "List Webset monitors", topic: "websets" },
	{ method: "GET", path: "/websets/v0/monitors/{id}", summary: "Get a Webset monitor", topic: "websets" },
	{ method: "PATCH", path: "/websets/v0/monitors/{id}", summary: "Update a Webset monitor", topic: "websets" },
	{ method: "DELETE", path: "/websets/v0/monitors/{id}", summary: "Delete a Webset monitor", topic: "websets" },
	{ method: "GET", path: "/websets/v0/monitors/{monitor}/runs", summary: "List Webset monitor runs", topic: "websets" },
	{
		method: "GET",
		path: "/websets/v0/monitors/{monitor}/runs/{id}",
		summary: "Get a Webset monitor run",
		topic: "websets",
	},
	{ method: "POST", path: "/websets/v0/webhooks", summary: "Create a webhook", topic: "webhooks" },
	{ method: "GET", path: "/websets/v0/webhooks", summary: "List webhooks", topic: "webhooks" },
	{ method: "GET", path: "/websets/v0/webhooks/{id}", summary: "Get a webhook", topic: "webhooks" },
	{ method: "PATCH", path: "/websets/v0/webhooks/{id}", summary: "Update a webhook", topic: "webhooks" },
	{ method: "DELETE", path: "/websets/v0/webhooks/{id}", summary: "Delete a webhook", topic: "webhooks" },
	{
		method: "GET",
		path: "/websets/v0/webhooks/{id}/attempts",
		summary: "List webhook delivery attempts",
		topic: "webhooks",
	},
	{ method: "GET", path: "/websets/v0/events", summary: "List system events", topic: "webhooks" },
	{ method: "GET", path: "/websets/v0/events/{id}", summary: "Get a system event", topic: "webhooks" },
	{ method: "GET", path: "/websets/v0/teams/me", summary: "Team info and concurrency limits", topic: "teams" },
	{
		method: "POST",
		path: "/research/v0/tasks",
		summary: "Create a legacy Research task (deprecated)",
		topic: "research",
	},
	{ method: "GET", path: "/research/v0/tasks", summary: "List legacy Research tasks (deprecated)", topic: "research" },
	{
		method: "GET",
		path: "/research/v0/tasks/{id}",
		summary: "Get a legacy Research task (deprecated)",
		topic: "research",
	},
];

/** Validate a user/model supplied path for exa_request. */
export function normalizeRequestPath(input: string): { path?: string; error?: string } {
	const trimmed = input.trim();
	if (!trimmed) return { error: "path is required" };
	if (trimmed.includes("://")) return { error: "pass only the path (e.g. /search), not a full URL" };
	if (trimmed.includes("..")) return { error: "path must not contain .." };
	const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	return { path };
}

/** Search defaults shared by exa_search and exa_similar. */
const SEARCH_OPTIONS_HELP = `Search filters and content options available through the \`options\` object:

  includeDomains        string[]  Domains or paths to include, e.g. ["arxiv.org", "exa.ai/blog", "*.substack.com"]
  excludeDomains        string[]  Domains or paths to exclude
  startPublishedDate    string    ISO 8601; only pages published after this date
  endPublishedDate      string    ISO 8601; only pages published before this date
  userLocation          string    Two-letter ISO country code, e.g. "US"
  additionalQueries     string[]  Extra query phrasings; only for deep-lite/deep/deep-reasoning
  outputSchema          object    JSON Schema for synthesized output; response gains \`output.content\` + \`output.grounding\`
  systemPrompt          string    Extra instructions for synthesis (source preferences, dedup rules)
  moderation            boolean   Filter unsafe results
  numResults            number    1-100 (default: config defaults.search.numResults; 10 at the API;
                                  results above 10 are billed extra)
  contents              object    Full content options (see below)

\`contents\` object (also used by /contents, but nested here):

  text          true | { maxCharacters, includeHtmlTags, verbosity: "compact"|"standard"|"full",
                          includeSections[], excludeSections[] }
                Full page text as markdown. maxCharacters bounds the cost and the context.
  highlights    true | { query, maxCharacters }
                Query-relevant excerpts; token-efficient and the recommended default for agents.
  summary       { query, schema }
                LLM summary of each page; \`schema\` returns a structured summary.
  extras        { links, imageLinks }   Extract N outbound links / image URLs per page
  subpages      number                  Also crawl N linked subpages per result
  subpageTarget string | string[]       Keywords that pick which subpages to crawl
  maxAgeHours   number                  Content freshness: >0 max cache age, 0 = always livecrawl, -1 = cache only
  livecrawlTimeout number               Livecrawl timeout in ms (default 10000)
  livecrawl     "never"|"fallback"|"preferred"|"always"   Deprecated; use maxAgeHours
  context       true | { maxCharacters }                  Deprecated; use highlights/text

Deprecated / ignored by the API: startCrawlDate, endCrawlDate, includeText, excludeText.

Cost and latency shape (approximate):
  type=instant   ~250ms, lowest quality       type=auto (default) ~1s
  type=fast      ~450ms                       type=deep-lite ~4s with synthesis
  type=deep      4-15s multi-step synthesis   type=deep-reasoning 12-40s
Search is billed per search + per returned page; synthesized output adds cost.
Requesting both \`text\` and \`highlights\` bills and returns two views of each page.`;

export const TOPICS: Record<string, HelpTopic> = {
	overview: {
		title: "Exa extension overview",
		summary: "Tool groups, progressive disclosure, endpoint index, and configuration",
		groups: [],
		body: `pi-exa exposes the Exa API in two layers.

Layer 1 - always available (group "core"):
  exa_search     POST /search      web search with highlights/text/summary
  exa_contents   POST /contents    extract content from URLs you already have
  exa_answer     POST /answer      one grounded answer with citations
  exa_help       this reference; calling it also enables the tools a topic needs

Layer 2 - enabled on demand by exa_help(topic) (or at session start via config):
  exa_similar       group "similar"    POST /findSimilar
  exa_agent_*       group "agent"      POST/GET /agent/runs (+ cancel, stop, events)
  exa_monitor       group "monitors"   /monitors (Exa Agent Monitors)
  exa_websets       group "websets"    /websets/v0/websets, items, searches, enrichments, imports, v0 monitors
  exa_webhooks      group "webhooks"   /websets/v0/webhooks and /events
  exa_batch         group "batches"    /batches
  exa_request       group "raw"        any documented endpoint, verbatim

Every Exa endpoint is reachable. Typed tools cover the common flows; exa_request
covers the rest with the exact paths and bodies documented in the topics below.
Requesting a topic returns its full parameter reference and enables its tools,
so advanced arguments only enter the context when they are actually needed.

Endpoint index (use exa_request for anything without a typed tool):
${ENDPOINTS.map((endpoint) => `  ${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(48)} ${endpoint.summary}`).join("\n")}

Config: ~/.pi/agent/exa.json (global) and <cwd>/.pi/exa.json (project, trusted
projects only). Set EXA_API_KEY, or apiKey/apiKeyEnv in the config. Run
/exa config to see the effective settings. Topic "config" documents every key.

Notable defaults: every tool merges \`defaults.<op>\` from the config into the
request body, then applies the explicit tool arguments on top.`,
	},

	config: {
		title: "pi-exa configuration",
		summary: "Config file keys, precedence, and examples",
		groups: [],
		body: `Files (later wins): ~/.pi/agent/exa.json, then <cwd>/.pi/exa.json when the project is trusted.
Environment variables win over the file: apiKeyEnv (default EXA_API_KEY), EXA_BASE_URL.

Keys:
  apiKey       string    Literal key. Prefer env vars when possible.
  apiKeyEnv    string    Env var that holds the key (default "EXA_API_KEY").
  baseUrl      string    Default "https://api.exa.ai".
  timeoutMs    number    Per-request timeout, default 60000.
  groups       string[]  Tool groups active at session start. Default ["core"].
                         Values: core, similar, agent, monitors, websets, webhooks,
                         batches, raw, or the single string "all".
  headers      object    Extra HTTP headers.
  defaults.search / defaults.contents / defaults.answer / defaults.similar /
  defaults.agentRun / defaults.websetSearch / defaults.batchRequest
                         Partial request bodies merged into every call of that
                         operation. Tool arguments override these values.
  wait.agent / wait.webset / wait.batch
                         { enabled: boolean, timeoutMs, pollIntervalMs } that
                         controls how the extension polls asynchronous work.
  output       object    Model-facing budget:
                         { maxResults: 10, maxCharsPerResult: 4000,
                           maxTotalChars: 24000, includeCost: true }

Example ~/.pi/agent/exa.json:
{
  "apiKeyEnv": "EXA_API_KEY",
  "groups": ["core", "agent"],
  "defaults": {
    "search": { "type": "auto", "numResults": 8, "contents": { "highlights": true } },
    "contents": { "text": { "maxCharacters": 12000 }, "maxAgeHours": 24 },
    "agentRun": { "effort": "medium" }
  },
  "wait": { "agent": { "timeoutMs": 900000, "pollIntervalMs": 3000 } },
  "output": { "maxResults": 8, "maxCharsPerResult": 6000, "maxTotalChars": 30000 }
}`,
	},

	search: {
		title: "exa_search - POST /search",
		summary: "Web search with highlights, text, summaries, filters, and deep research modes",
		groups: ["core"],
		body: `Curated arguments (always available):
  query                string   required. Natural-language query; include the subject,
                                source type, and time period when they matter.
  type                 enum     instant | fast | auto (default) | deep-lite | deep | deep-reasoning
  numResults           number   1-100
  category             enum     company | publication | news | personal site | financial report
                                | people | research paper | pdf | github
                                (other strings are accepted as hints; company/people use
                                 dedicated indexes and reject date/domain exclude filters)
  includeDomains       string[] restrict to domains or path prefixes
  excludeDomains       string[] drop these domains or path prefixes
  startPublishedDate   string   ISO 8601
  endPublishedDate     string   ISO 8601
  content              enum     highlights (default) | text | summary | none
  options              object   any advanced /search field (merged last, overrides the above)

${SEARCH_OPTIONS_HELP}

Typical calls:
  exa_search({ query: "latest EU battery regulation news", type: "auto", numResults: 5 })
  exa_search({ query: "Series A AI infra startups", category: "company", content: "highlights" })
  exa_search({ query: "LLM benchmark comparisons", options: {
      additionalQueries: ["LLM evals", "language model benchmarks"],
      outputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      systemPrompt: "Prefer peer-reviewed and official sources." } })

Deep modes (deep-lite, deep, deep-reasoning) run multi-step search and can
return synthesized output. They are slower and cost more; use them when a
single retrieval pass is not enough. For long-running, schema-validated list
building prefer the Agent API (exa_help topic "agent").`,
	},

	contents: {
		title: "exa_contents - POST /contents",
		summary: "Extract text, highlights, summaries, or subpages from known URLs",
		groups: ["core"],
		body: `Curated arguments:
  urls      string[]  required. 1-100 URLs (or Exa document ids from a search result).
  content   enum      text | highlights | summary | text+highlights  (default text)
  options   object    advanced /contents fields, merged last

Advanced fields (options):
  ids             string[]  Deprecated alias for urls.
  text            true | { maxCharacters, includeHtmlTags,
                           verbosity: "compact"|"standard"|"full",
                           includeSections[], excludeSections[] }
  highlights      true | { query, maxCharacters, numSentences (deprecated),
                           highlightsPerUrl (deprecated) }
  summary         { query, schema }   schema yields JSON per page
  extras          { links, imageLinks }   N outbound links / image URLs per URL
                                         (e.g. extras: { imageLinks: 10 })
  subpages        number              also crawl N linked subpages per URL
  subpageTarget   string | string[]   keywords that select subpages
  maxAgeHours     number              0 = always livecrawl (required for verbosity/-
                                      section options to apply), -1 = cache only
  snapshotAsOf    string              ISO 8601; return content as of this time
  livecrawlTimeout number             ms, default 10000
  livecrawl       string              Deprecated: never | fallback | preferred | always
  context         true | { maxCharacters }   Deprecated
  compliance      "hipaa"             Enterprise-only cache-only mode

Per-URL failures are reported in the response \`statuses\` array
({ id, status: success|error, source: cached|crawled, error: { tag, httpStatusCode } });
the HTTP call itself still succeeds.

Example:
  exa_contents({ urls: ["https://example.com/a", "https://example.com/b"],
                 content: "highlights", options: { maxAgeHours: 0 } })

Use /search instead when you do not have the URLs yet: the same content options
are available nested under \`contents\` and cost less up to 10 results.`,
	},

	answer: {
		title: "exa_answer - POST /answer",
		summary: "One grounded answer with citations",
		groups: ["core"],
		body: `Curated arguments:
  query     string  required. The question or instruction.
  options   object  advanced fields, merged last

Advanced fields (options):
  model         enum    exa (default) | exa-pro | exa-research | exa-fast
  text          boolean include full page text in the returned citations
  systemPrompt  string  source preferences or output guidance
  userLocation  string  two-letter ISO country code
  outputSchema  object  JSON Schema; answer becomes a structured object
  stream        boolean ignored by this extension (always non-streaming)

The response contains \`answer\` plus \`citations\` (title, url, publishedDate,
author, id) and \`costDollars\`.

Example:
  exa_answer({ query: "What did the EU AI Act change about GPAI obligations?" })
  exa_answer({ query: "Compare the M2 vs M4 MacBook Air", options: {
      outputSchema: { type: "object", properties: {
        winner: { type: "string" }, reasons: { type: "array", items: { type: "string" } } },
        required: ["winner", "reasons"] } } })`,
	},

	similar: {
		title: "exa_similar - POST /findSimilar",
		summary: "Find pages similar to a source URL",
		groups: ["similar"],
		body: `Curated arguments:
  url             string    required. The source page.
  numResults      number    max 100 (default: config defaults.similar.numResults; 10 at the API)
  content         enum      highlights (default) | text | summary | none
  includeDomains  string[]  restrict results
  excludeDomains  string[]  drop results
  options         object    advanced fields, merged last

Advanced fields (options): excludeSourceDomain (boolean), category, startPublishedDate,
  endPublishedDate, userLocation, moderation, contents (see topic "search").
  startCrawlDate/endCrawlDate/includeText/excludeText are deprecated.

Example:
  exa_similar({ url: "https://arxiv.org/abs/2307.06435", numResults: 5,
                options: { excludeSourceDomain: true } })`,
	},

	agent: {
		title: "Exa Agent runs - /agent/runs",
		summary: "Async deep research, list building, and row enrichment with structured output",
		groups: ["agent"],
		body: `Tools: exa_agent_run (create + optional wait), exa_agent_get (fetch/poll),
exa_agent_control (list | cancel | stop | delete | events).

Create body (POST /agent/runs):
  query          string   required. Describe the data you want, not just the topic.
  effort         enum     minimal | low | medium | high | xhigh | auto (default) | ultra
                          Fixed efforts have fixed per-request prices:
                          minimal $0.012, low $0.025, medium $0.10, high $0.50, xhigh $1.00.
                          auto meters usage up to budget.maxCostDollars (default $5);
                          ultra meters up to $20 by default and supports stop.
  outputSchema   object   JSON Schema (draft-07/2019-09/2020-12). Result arrives in
                          output.structured; unsupported fields come back as null.
                          Bound arrays with maxItems: cost scales with the entity count.
  systemPrompt   string   source preferences, novelty/duplication constraints
  previousRunId  string   continue from a completed run (follow-ups, "find 10 more")
  input          object   { data: [{...}], exclusion: [{...}] } rows to enrich /
                          entries the agent must not return
  dataSources    array    [{ provider: "similarweb" | "fiber" | "financial_datasets" |
                          "baselayer" | "affiliate" | "particle" | "jinko" | "polymarket" |
                          "macrobond" }] - Exa Connect partners
  metadata       object   string key/value pairs stored with the run
  budget         object   { maxCostDollars: 1-100 } (auto/ultra), { maxDurationSeconds:
                          300-10800 } (ultra only)

Run object: id, status (queued|running|completed|failed|cancelled),
stopReason (schema_satisfied|budget_reached|time_limit_reached|stopped|error|cancelled),
output.text, output.structured, output.grounding[], usage { agentComputeUnits, searches,
emails, phoneNumbers }, costDollars.

Other endpoints (use exa_agent_control or exa_request):
  GET    /agent/runs                    ?limit=1-100&cursor=  (list, newest first)
  GET    /agent/runs/{id}               single run
  DELETE /agent/runs/{id}               delete a run
  POST   /agent/runs/{id}/cancel        cancel immediately, no output
  POST   /agent/runs/{id}/stop          ultra only: finish early and keep partial results
  GET    /agent/runs/{id}/events        ?limit=1-100&cursor= replay stored events
                                        (header Accept: text/event-stream replays as SSE;
                                         ZDR runs keep no events)

The create endpoint accepts Accept: text/event-stream to stream lifecycle events.
This extension does not stream: it creates the run, then polls get with the
configured wait.agent settings (default 600s timeout, 2s interval).

Cost notes: 1 ACU = $0.10, searches $0.005 each. Complex queries with large
input.data consume more ACUs. Prefer low/medium effort for single-entity
lookups and auto/ultra for variable-scope list building.`,
	},

	monitors: {
		title: "Exa Agent Monitors - /monitors",
		summary: "Scheduled searches that emit new results to a webhook",
		groups: ["monitors"],
		body: `Tool: exa_monitor (action: create | list | get | update | delete | trigger | runs | run | batch).

Monitors re-run a search on an interval and publish new or changed results.

Create body (POST /monitors):
  name          string
  search        object  { query (required), numResults, includeDomains, excludeDomains,
                          contents }
  trigger       object  { type: "interval" (only supported value),
                          period: "1h"|"6h"|"1d"|"7d" ... }  minimum 1 hour, single unit
  outputSchema  object  Controls run output. { "type": "text" } (default) returns a plain
                        summary; an object schema returns structured output.
  webhook       object  { url: https://..., events: [...] }  HTTPS only, no localhost/private IPs
  metadata      object  echoed in webhook deliveries

Endpoints:
  POST   /monitors                 create (201)
  GET    /monitors                 ?status=active|paused&cursor=&limit=&name=&metadata=
  GET    /monitors/{id}
  PATCH  /monitors/{id}            { name, status: active|paused, search, trigger,
                                     outputSchema, metadata, webhook }
  DELETE /monitors/{id}
  POST   /monitors/{id}/trigger    run now
  GET    /monitors/{id}/runs       ?cursor=&limit=1-100
  GET    /monitors/{id}/runs/{runId}
  POST   /monitors/batch           { action: delete|pause|unpause, filter, dry_run (default true),
                                     limit (default 50, max 500) }

Note: /websets/v0/monitors is a different, older Webset-monitor API; see topic "websets".`,
	},

	batches: {
		title: "Batch API - /batches",
		summary: "Queue many /search or /agent/runs requests in one call",
		groups: ["batches"],
		body: `Tool: exa_batch. The Batch API currently requires the beta header
Exa-Beta: batches-2026-06-06, which the tool sends automatically.

Create body (POST /batches):
  requests  array  [{ customId: "unique-in-batch", method: "POST",
                      url: "/search" | "/agent/runs", body: {...} }]
                   stream: true is not allowed inside a batched body.
  metadata  object

Endpoints:
  GET    /batches          ?cursor=&limit=&status=
  GET    /batches/{id}     includes per-request status and results
  DELETE /batches/{id}
  POST   /batches/{id}/cancel

Use batches for fan-out workloads (many independent searches or agent runs)
where a single tool result is enough. For a single search, call exa_search.`,
	},

	websets: {
		title: "Websets API - /websets/v0",
		summary: "Persistent, async sets of entities with enrichment columns, imports, and monitors",
		groups: ["websets"],
		body: `Tool: exa_websets (action-based) plus exa_request for full control.
Websets is asynchronous: create a Webset, poll it until idle/completed, then read
items. Exa recommends the Agent API for new list-building work; Websets remains
useful for maintaining persistent, enrichable sets. Websets, imports, webhooks,
and /websets/v0/teams/me require a plan with Websets access; a 401 with
"Your team does not have access to the API" means the key's plan lacks it.

Websets:
  POST   /websets/v0/websets                  create
    body: { title, search: { query, count, entity?, criteria?, maxPeoplePerCompany?,
                             exclude?, scope?, recall?, behavior: override|append,
                             metadata }, import?, enrichments: [{ description,
                             format: text|date|number|options|email|phone|url,
                             options: [{label}], metadata }], exclude?, externalId,
            metadata }
  GET    /websets/v0/websets                  ?cursor=&limit=1-100&search=
  GET    /websets/v0/websets/{id}             ?expand=items
  POST   /websets/v0/websets/{id}             { title, metadata }
  DELETE /websets/v0/websets/{id}
  POST   /websets/v0/websets/{id}/cancel      cancel all running work
  POST   /websets/v0/websets/preview          { search: { query, count, ... } } or ?search=true

  GET    /websets/v0/websets/{webset}/items            ?cursor=&limit=&sourceId=
  GET    /websets/v0/websets/{webset}/items/{id}
  DELETE /websets/v0/websets/{webset}/items/{id}

  POST   /websets/v0/websets/{webset}/searches         add a search (same fields as create.search)
  GET    /websets/v0/websets/{webset}/searches/{id}
  POST   /websets/v0/websets/{webset}/searches/{id}/cancel

  POST   /websets/v0/websets/{webset}/enrichments      { description, format, options, metadata }
  GET    /websets/v0/websets/{webset}/enrichments/{id}
  PATCH  /websets/v0/websets/{webset}/enrichments/{id}
  DELETE /websets/v0/websets/{webset}/enrichments/{id}
  POST   /websets/v0/websets/{webset}/enrichments/{id}/cancel

Imports:
  POST   /websets/v0/imports        create (csv or s3 source; see the OpenAPI discriminator)
  GET    /websets/v0/imports        ?cursor=&limit=
  GET    /websets/v0/imports/{id}
  PATCH  /websets/v0/imports/{id}   { title, metadata }
  DELETE /websets/v0/imports/{id}

Webset monitors (independent of /monitors):
  POST   /websets/v0/monitors       { websetId, cadence: { cron, timezone }, behavior, metadata }
  GET    /websets/v0/monitors       ?cursor=&limit=&websetId=
  GET    /websets/v0/monitors/{id}
  PATCH  /websets/v0/monitors/{id}  { status: enabled|disabled, cadence, behavior, metadata }
  DELETE /websets/v0/monitors/{id}
  GET    /websets/v0/monitors/{monitor}/runs
  GET    /websets/v0/monitors/{monitor}/runs/{id}

Item fields support { id, object, status, name, entity, enrichments, properties,
createdAt, updatedAt }. Enrichment results live under item.enrichments with
{ enrichmentId, status, format, result }.

Typical flow with the typed tool:
  exa_websets({ action: "create", query: "AI infrastructure companies in the US",
                count: 10, wait: true })
  exa_websets({ action: "items", websetId: "webset_...", options: { limit: 50 } })
  exa_websets({ action: "add_enrichment", websetId: "webset_...", query: "Find the CEO name",
                options: { format: "text" } })`,
	},

	webhooks: {
		title: "Webhooks and events - /websets/v0",
		summary: "Notification delivery and the system event feed",
		groups: ["webhooks"],
		body: `Tool: exa_webhooks.

  POST   /websets/v0/webhooks            { events: [...], url, metadata }
  GET    /websets/v0/webhooks            ?cursor=&limit=
  GET    /websets/v0/webhooks/{id}
  PATCH  /websets/v0/webhooks/{id}       { events, url, metadata }
  DELETE /websets/v0/webhooks/{id}
  GET    /websets/v0/webhooks/{id}/attempts   ?cursor=&limit=&eventType=&successful=
  GET    /websets/v0/events              ?cursor=&limit=&types=&createdBefore=&createdAfter=
  GET    /websets/v0/events/{id}

Event types: webset.created, webset.deleted, webset.paused, webset.idle,
webset.search.created, webset.search.canceled, webset.search.completed,
webset.search.updated, import.created, import.completed, webset.item.created,
webset.item.enriched, monitor.created, monitor.updated, monitor.deleted,
monitor.run.created, monitor.run.completed, webset.export.created,
webset.export.completed.`,
	},

	teams: {
		title: "Team info - /websets/v0/teams/me",
		summary: "Team details, plan, and concurrency limits",
		groups: ["raw"],
		body: `  GET /websets/v0/teams/me

Returns the current team, its plan, and the concurrency limits that apply to
agent runs and websets. Call it when a run fails with CONCURRENCY_LIMIT_REACHED
or before starting many parallel runs. Requires a plan with API access; a 401
means the key's team cannot use this endpoint.

  exa_request({ method: "GET", path: "/websets/v0/teams/me" })`,
	},

	research: {
		title: "Legacy Research API - /research/v0/tasks (deprecated)",
		summary: "Deprecated task API; prefer deep search or Agent runs",
		groups: ["raw"],
		body: `Exa's docs mark the Research API as legacy/deprecated. For new work use
exa_search with type "deep-reasoning" plus outputSchema, or the Agent API
(topic "agent"). The endpoints still work and are covered here for completeness:

  POST /research/v0/tasks          { instructions (required), model:
                                     exa-research | exa-research-pro,
                                     output: { schema, inferSchema } }
  GET  /research/v0/tasks          ?cursor=&limit=1-200
  GET  /research/v0/tasks/{id}

  exa_request({ method: "POST", path: "/research/v0/tasks",
                body: { instructions: "What species of ant are similar to honeypot ants?",
                        model: "exa-research" } })`,
	},

	raw: {
		title: "exa_request - any documented endpoint",
		summary: "Verbatim access to every Exa endpoint, with the full path index",
		groups: ["raw"],
		body: `Use exa_request when no typed tool covers what you need, or when the
documented body does not fit the curated arguments.

Arguments:
  method   "GET" | "POST" | "PATCH" | "DELETE"
  path     Path below https://api.exa.ai, e.g. "/search" or
           "/websets/v0/websets/{id}" with real ids substituted.
  body     JSON request body (POST/PATCH)
  query    Query string parameters as an object (arrays repeat the key)
  beta     Optional Exa-Beta header token, e.g. "batches-2026-06-06"

The path must be one of the documented endpoints (index below) or a subpath of
one with {placeholders} replaced by real ids. Unknown paths are rejected with
the closest matches, so a typo cannot silently hit the wrong resource.

Examples:
  exa_request({ method: "GET", path: "/websets/v0/teams/me" })
  exa_request({ method: "GET", path: "/agent/runs", query: { limit: 5 } })
  exa_request({ method: "POST", path: "/websets/v0/websets/webset_abc/cancel" })
  exa_request({ method: "PATCH", path: "/websets/v0/monitors/mon_123",
                body: { status: "disabled" } })

Path index:
${ENDPOINTS.map((endpoint) => `  ${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(48)} ${endpoint.summary}`).join("\n")}`,
	},

	all: {
		title: "Exa API topics",
		summary: "Every topic available through exa_help",
		groups: ["similar", "agent", "monitors", "websets", "webhooks", "batches", "raw"],
		body: "",
	},
};

export function topicNames(): string[] {
	return Object.keys(TOPICS);
}

export function nearestPaths(path: string, limit = 5): string[] {
	const normalized = path.startsWith("/") ? path : `/${path}`;
	const clean = normalized.split("?")[0] ?? normalized;
	const score = (template: string): number => {
		const prefix = template.split("{")[0] ?? template;
		let common = 0;
		const max = Math.min(prefix.length, clean.length);
		while (common < max && prefix[common] === clean[common]) common += 1;
		const boundary = common === clean.length || template[common] === "/" || template[common] === "{" ? 20 : 0;
		return common * 2 + boundary;
	};
	const scored = ENDPOINTS.map((endpoint) => ({ path: endpoint.path, score: score(endpoint.path) }));
	scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
	const seen = new Set<string>();
	const out: string[] = [];
	for (const entry of scored) {
		if (seen.has(entry.path)) continue;
		seen.add(entry.path);
		out.push(entry.path);
		if (out.length >= limit) break;
	}
	return out;
}

/** True when `path` is a documented endpoint or a subpath with ids filled in. */
export function isKnownPath(path: string): boolean {
	const normalized = path.startsWith("/") ? path : `/${path}`;
	const clean = normalized.split("?")[0] ?? normalized;
	return ENDPOINTS.some((endpoint) => {
		const template = endpoint.path;
		const pattern = new RegExp(
			`^${template
				.split("/")
				.map((segment) => (segment.startsWith("{") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
				.join("/")}/?$`,
		);
		return pattern.test(clean);
	});
}

function allTopicsText(): string {
	const lines = [
		"Available exa_help topics (request one to get its full parameter reference and enable its tools):",
		"",
	];
	for (const [name, entry] of Object.entries(TOPICS)) {
		if (name === "all") continue;
		lines.push(`  ${name.padEnd(12)} ${entry.summary}`);
	}
	lines.push("", "Group activation: topic -> tools", "");
	for (const [name, entry] of Object.entries(TOPICS)) {
		if (name === "all" || entry.groups.length === 0) continue;
		lines.push(`  ${name.padEnd(12)} ${entry.groups.join(", ")}`);
	}
	return lines.join("\n");
}

export function helpText(topic: string): string {
	const selected = TOPICS[topic];
	if (!selected) {
		return `Unknown topic "${topic}". Available topics: ${topicNames().join(", ")}`;
	}
	if (topic === "all") return allTopicsText();
	return `${selected.title}\n${"-".repeat(selected.title.length)}\n\n${selected.body}`;
}
