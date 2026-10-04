/**
 * Config discovery and resolution.
 *
 * Files are merged nearest-last: the global config at
 * `~/.pi/agent/exa.json` (or `$PI_CODING_AGENT_DIR/exa.json`) is read first and
 * the project config at `<cwd>/.pi/exa.json` overrides it. Project configs are
 * ignored when the project is not trusted. Environment variables win for the
 * API key and base URL.
 *
 * Everything in the config is a default: a tool call argument always wins over
 * the configured value.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ExaConfigFile,
	JsonObject,
	LoadedConfigs,
	OutputSettings,
	ResolvedConfig,
	WaitSettings,
} from "./types.ts";
import { isJsonObject } from "./types.ts";

const CONFIG_FILE_NAME = "exa.json";
const DEFAULT_BASE_URL = "https://api.exa.ai";
const DEFAULT_TIMEOUT_MS = 60_000;

export const DEFAULT_OUTPUT: OutputSettings = {
	maxResults: 10,
	maxCharsPerResult: 4_000,
	maxTotalChars: 24_000,
	includeCost: true,
};

const DEFAULT_WAIT: WaitSettings = {
	enabled: true,
	timeoutMs: 600_000,
	pollIntervalMs: 2_000,
};

function agentDir(): string {
	const override = process.env["PI_CODING_AGENT_DIR"]?.trim();
	return override && override.length > 0 ? override : path.join(os.homedir(), ".pi", "agent");
}

export function globalConfigPath(): string {
	return path.join(agentDir(), CONFIG_FILE_NAME);
}

function projectConfigPath(cwd: string): string {
	return path.join(cwd, ".pi", CONFIG_FILE_NAME);
}

/** Read one config file. Returns a warning instead of throwing on bad input. */
function readConfigFile(file: string): { config?: ExaConfigFile; warning?: string } {
	if (!fs.existsSync(file)) return {};
	let text: string;
	try {
		text = fs.readFileSync(file, "utf8");
	} catch (error) {
		return { warning: `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}` };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return { warning: `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
	}
	if (!isJsonObject(parsed)) {
		return { warning: `${file} must contain a JSON object` };
	}
	return { config: parsed as ExaConfigFile };
}

export function loadConfigs(cwd: string, trusted: boolean): LoadedConfigs {
	const globalFile = globalConfigPath();
	const projectFile = projectConfigPath(cwd);
	const configs: ExaConfigFile[] = [];
	const warnings: string[] = [];

	const globalRead = readConfigFile(globalFile);
	if (globalRead.warning) warnings.push(globalRead.warning);
	if (globalRead.config) configs.push(globalRead.config);

	if (fs.existsSync(projectFile)) {
		if (trusted) {
			const projectRead = readConfigFile(projectFile);
			if (projectRead.warning) warnings.push(projectRead.warning);
			if (projectRead.config) configs.push(projectRead.config);
		} else {
			warnings.push(`ignoring ${projectFile}: project is not trusted (use /trust to enable project config)`);
		}
	}

	return { globalFile, projectFile, configs, warnings };
}

/** Deep merge of JSON objects; arrays and scalars replace. */
export function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
	const out: JsonObject = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) continue;
		const previous = out[key];
		if (isJsonObject(previous) && isJsonObject(value)) {
			out[key] = deepMerge(previous, value);
		} else {
			out[key] = value;
		}
	}
	return out;
}

function objectOrEmpty(value: unknown): JsonObject {
	return isJsonObject(value) ? value : {};
}

function positiveInt(value: unknown, fallback: number, min = 1): number {
	if (typeof value === "number" && Number.isFinite(value) && value >= min) return Math.floor(value);
	return fallback;
}

function stringSetting(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function mergeOutput(configs: ExaConfigFile[]): OutputSettings {
	const merged: OutputSettings = { ...DEFAULT_OUTPUT };
	for (const config of configs) {
		const output = objectOrEmpty(config.output);
		if (output["maxResults"] !== undefined) merged.maxResults = positiveInt(output["maxResults"], merged.maxResults, 1);
		if (output["maxCharsPerResult"] !== undefined) {
			merged.maxCharsPerResult = positiveInt(output["maxCharsPerResult"], merged.maxCharsPerResult, 200);
		}
		if (output["maxTotalChars"] !== undefined) {
			merged.maxTotalChars = positiveInt(output["maxTotalChars"], merged.maxTotalChars, 1_000);
		}
		if (typeof output["includeCost"] === "boolean") merged.includeCost = output["includeCost"];
	}
	return merged;
}

function mergeWait(configs: ExaConfigFile[], key: "agent" | "webset" | "batch"): WaitSettings {
	const merged: WaitSettings = { ...DEFAULT_WAIT };
	for (const config of configs) {
		const wait = objectOrEmpty(objectOrEmpty(config.wait)[key]);
		if (typeof wait["enabled"] === "boolean") merged.enabled = wait["enabled"];
		if (wait["timeoutSeconds"] !== undefined) {
			merged.timeoutMs = positiveInt(wait["timeoutSeconds"], merged.timeoutMs / 1000, 1) * 1000;
		}
		if (wait["pollIntervalSeconds"] !== undefined) {
			merged.pollIntervalMs = positiveInt(wait["pollIntervalSeconds"], merged.pollIntervalMs / 1000, 1) * 1000;
		}
	}
	return merged;
}

/** Resolve the API key: configured env var, then EXA_API_KEY, then a literal key. */
export function resolveApiKey(configs: ExaConfigFile[]): { apiKey?: string; source?: string; warning?: string } {
	const envNames: string[] = [];
	for (const config of configs) {
		const name = stringSetting(config.apiKeyEnv);
		if (name && !envNames.includes(name)) envNames.push(name);
	}
	if (!envNames.includes("EXA_API_KEY")) envNames.push("EXA_API_KEY");

	for (const name of envNames) {
		const value = process.env[name]?.trim();
		if (value) return { apiKey: value, source: `env:${name}` };
	}
	for (let index = configs.length - 1; index >= 0; index -= 1) {
		const value = stringSetting(configs[index]?.apiKey);
		if (value) return { apiKey: value, source: "config" };
	}
	const wanted = envNames.join(" / ");
	return { warning: `no Exa API key found: set ${wanted} or add {"apiKey": "..."} to the config` };
}

/** One config entry to a group name, or undefined with a warning. */
function normalizeGroup(entry: unknown, known: string[], warnings: string[]): string | undefined {
	if (typeof entry !== "string") return undefined;
	const name = entry.trim().toLowerCase();
	if (!name) return undefined;
	if (!known.includes(name)) {
		warnings.push(
			`unknown tool group "${entry}" (known: core, similar, agent, monitors, websets, webhooks, batches, raw)`,
		);
		return undefined;
	}
	return name;
}

function validGroups(value: unknown, known: string[], warnings: string[]): string[] {
	if (!Array.isArray(value)) return [];
	const groups: string[] = [];
	for (const entry of value) {
		const name = normalizeGroup(entry, known, warnings);
		if (name !== undefined && !groups.includes(name)) groups.push(name);
	}
	return groups;
}

function mergeGroups(configs: ExaConfigFile[], warnings: string[], known: string[]): string[] {
	let value: unknown;
	for (const config of configs) {
		if (config.groups !== undefined) value = config.groups;
	}
	if (value === "all") return ["all"];
	const groups = validGroups(value, known, warnings);
	return groups.length > 0 ? groups : ["core"];
}

/** Environment first, then the nearest config file that sets a base URL. */
function resolveBaseUrl(configs: ExaConfigFile[]): string {
	const fromEnv = stringSetting(process.env["EXA_BASE_URL"]);
	if (fromEnv) return fromEnv;
	for (let index = configs.length - 1; index >= 0; index -= 1) {
		const value = stringSetting(configs[index]?.baseUrl);
		if (value) return value;
	}
	return DEFAULT_BASE_URL;
}

function resolveTimeout(configs: ExaConfigFile[]): number {
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	for (const config of configs) {
		if (config.timeoutSeconds !== undefined) {
			timeoutMs = positiveInt(config.timeoutSeconds, timeoutMs / 1000, 1) * 1000;
		}
	}
	return timeoutMs;
}

function resolveHeaders(configs: ExaConfigFile[]): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const config of configs) {
		if (!isJsonObject(config.headers)) continue;
		for (const [key, value] of Object.entries(config.headers)) {
			if (typeof value === "string") headers[key] = value;
		}
	}
	return headers;
}

/** Merge each tool's request-body defaults nearest-last. */
function resolveDefaults(configs: ExaConfigFile[]): ResolvedConfig["defaults"] {
	const first = configs[0]?.defaults;
	const defaults = {
		search: objectOrEmpty(first?.search),
		contents: objectOrEmpty(first?.contents),
		answer: objectOrEmpty(first?.answer),
		similar: objectOrEmpty(first?.similar),
		agentRun: objectOrEmpty(first?.agentRun),
		websetSearch: objectOrEmpty(first?.websetSearch),
		batchRequest: objectOrEmpty(first?.batchRequest),
	};
	for (let index = 1; index < configs.length; index += 1) {
		const next = configs[index]?.defaults;
		defaults.search = deepMerge(defaults.search, objectOrEmpty(next?.search));
		defaults.contents = deepMerge(defaults.contents, objectOrEmpty(next?.contents));
		defaults.answer = deepMerge(defaults.answer, objectOrEmpty(next?.answer));
		defaults.similar = deepMerge(defaults.similar, objectOrEmpty(next?.similar));
		defaults.agentRun = deepMerge(defaults.agentRun, objectOrEmpty(next?.agentRun));
		defaults.websetSearch = deepMerge(defaults.websetSearch, objectOrEmpty(next?.websetSearch));
		defaults.batchRequest = deepMerge(defaults.batchRequest, objectOrEmpty(next?.batchRequest));
	}
	return defaults;
}

export interface ResolveOptions {
	/** Known group names, used to validate `groups`. */
	knownGroups: string[];
}

export function resolveConfig(loaded: LoadedConfigs, options: ResolveOptions): ResolvedConfig {
	const configs = loaded.configs;
	const warnings = loaded.warnings;
	const credential = resolveApiKey(configs);
	if (credential.warning) warnings.push(credential.warning);

	return {
		apiKey: credential.apiKey,
		apiKeySource: credential.source,
		baseUrl: resolveBaseUrl(configs).replace(/\/+$/, ""),
		timeoutMs: resolveTimeout(configs),
		groups: mergeGroups(configs, warnings, options.knownGroups),
		headers: resolveHeaders(configs),
		defaults: resolveDefaults(configs),
		wait: {
			agent: mergeWait(configs, "agent"),
			webset: mergeWait(configs, "webset"),
			batch: mergeWait(configs, "batch"),
		},
		output: mergeOutput(configs),
	};
}

/** Build the default config file contents written by `/exa init`. */
export function exampleConfig(): ExaConfigFile {
	return {
		apiKeyEnv: "EXA_API_KEY",
		baseUrl: DEFAULT_BASE_URL,
		timeoutSeconds: DEFAULT_TIMEOUT_MS / 1000,
		groups: ["core"],
		defaults: {
			search: { type: "auto", numResults: 8, contents: { highlights: true } },
			contents: { text: { maxCharacters: 12_000 } },
			answer: { model: "exa" },
			similar: { numResults: 8, contents: { highlights: true } },
			agentRun: { effort: "medium" },
		},
		output: { ...DEFAULT_OUTPUT },
	};
}
