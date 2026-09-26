/**
 * Shared types for pi-exa.
 *
 * Two layers exist:
 *  - `ExaConfigFile` is the on-disk JSON shape (`~/.pi/agent/exa.json` and
 *    `<cwd>/.pi/exa.json`).
 *  - `ResolvedConfig` is the merged, validated shape the runtime uses.
 */

export type JsonObject = Record<string, unknown>;

export interface WaitSettings {
	/** Wait for the operation to reach a terminal state before returning. */
	enabled: boolean;
	/** Give up waiting after this many milliseconds and return the current state. */
	timeoutMs: number;
	/** Delay between polls. */
	pollIntervalMs: number;
}

/** `wait` settings as written in a config file: same fields, but in seconds. */
export interface WaitConfig {
	enabled?: boolean;
	/** Give up waiting after this many seconds. */
	timeoutSeconds?: number;
	/** Delay between polls, in seconds. */
	pollIntervalSeconds?: number;
}

export interface OutputSettings {
	/** Maximum number of search results rendered for the model. Extra results are omitted. */
	maxResults: number;
	/** Maximum characters rendered per result (text/highlights). */
	maxCharsPerResult: number;
	/** Hard cap for the whole model-facing tool result. */
	maxTotalChars: number;
	/** Include Exa cost information in tool results. */
	includeCost: boolean;
}

export interface ExaConfigFile {
	/** Literal API key. Prefer `apiKeyEnv` or the `EXA_API_KEY` environment variable. */
	apiKey?: string;
	/** Environment variable holding the API key. Defaults to `EXA_API_KEY`. */
	apiKeyEnv?: string;
	/** Exa API base URL. Defaults to `https://api.exa.ai`. */
	baseUrl?: string;
	/** Per-request timeout in seconds. */
	timeoutSeconds?: number;
	/**
	 * Tool groups active at session start. Defaults to `["core"]`.
	 * Use `"all"` to load every tool immediately (uses more context).
	 */
	groups?: string[] | "all";
	/** Extra HTTP headers, e.g. for a proxy that requires them. */
	headers?: Record<string, string>;
	/** Request body defaults merged into each call (tool arguments override them). */
	defaults?: {
		/** Extra `/search` body fields, e.g. { "contents": { "highlights": true }, "numResults": 8 }. */
		search?: JsonObject;
		/** Extra `/contents` body fields, e.g. { "text": { "maxCharacters": 12000 } }. */
		contents?: JsonObject;
		/** Extra `/answer` body fields, e.g. { "model": "exa-pro" }. */
		answer?: JsonObject;
		/** Extra `/findSimilar` body fields. */
		similar?: JsonObject;
		/** Extra `/agent/runs` body fields, e.g. { "effort": "medium" }. */
		agentRun?: JsonObject;
		/** Extra `/websets/v0/websets/{id}/searches` body fields. */
		websetSearch?: JsonObject;
		/** Extra `/batches` request fields. */
		batchRequest?: JsonObject;
	};
	/** Waiting behavior for asynchronous agents. */
	wait?: {
		agent?: WaitConfig;
		webset?: WaitConfig;
		batch?: WaitConfig;
	};
	/** Model-facing output budget. */
	output?: Partial<OutputSettings>;
}

export interface ResolvedConfig {
	apiKey?: string | undefined;
	/** Where the key came from, for diagnostics: "env:EXA_API_KEY", "config", ... */
	apiKeySource?: string | undefined;
	baseUrl: string;
	timeoutMs: number;
	/** Tool groups active at session start; `["core"]` unless configured otherwise. */
	groups: string[];
	headers: Record<string, string>;
	defaults: {
		search: JsonObject;
		contents: JsonObject;
		answer: JsonObject;
		similar: JsonObject;
		agentRun: JsonObject;
		websetSearch: JsonObject;
		batchRequest: JsonObject;
	};
	wait: {
		agent: WaitSettings;
		webset: WaitSettings;
		batch: WaitSettings;
	};
	output: OutputSettings;
}

/** Result of loading and merging the config files. */
export interface LoadedConfigs {
	globalFile: string;
	projectFile: string;
	configs: ExaConfigFile[];
	warnings: string[];
}

/** Narrowing helper used across the code base. */
export function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
