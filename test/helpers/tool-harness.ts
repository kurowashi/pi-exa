/**
 * Test harness for pi-exa tools.
 *
 * Tool factories depend on the `Runtime` interface, not on Pi internals, so a
 * fake runtime drives the real handlers with scripted HTTP results. The
 * extension-level contract test separately loads the real entry through Pi's
 * loader; this harness is about behavior, not wiring.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ExaClient, ExaRequest, ExaResponse } from "../../src/client.ts";
import { resolveConfig } from "../../src/config.ts";
import { GROUP_NAMES } from "../../src/registry.ts";
import type { Runtime, ToolResult } from "../../src/tools/common.ts";
import type { ExaConfigFile, ResolvedConfig } from "../../src/types.ts";

/** The subset of a tool definition this harness drives. */
export interface ExecutableTool {
	name: string;
	description: string;
	parameters: unknown;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: { signal?: AbortSignal },
	): Promise<ToolResult>;
}

export interface ToolHarness {
	tools: Map<string, ExecutableTool>;
	sent: ExaRequest[];
	config: ResolvedConfig;
	/** Groups passed to runtime.activate(), in call order. */
	activated: string[][];
	/** Queue results for successive send() calls. Default: an empty 200 response. */
	queue(...results: Array<ExaResponse | Error>): void;
	/** Call a captured tool by name with `params`. */
	call(name: string, params: unknown): Promise<ToolResult>;
}

export function responseOf(data: unknown, notes: string[] = []): ExaResponse {
	return { status: 200, data, notes };
}

export function createToolHarness(
	register: (pi: ExtensionAPI, runtime: Runtime) => void,
	configFile: ExaConfigFile = {},
): ToolHarness {
	const config = resolveConfig(
		{ globalFile: "", projectFile: "", configs: [configFile], warnings: [] },
		{ knownGroups: GROUP_NAMES },
	);
	const sent: ExaRequest[] = [];
	const pending: Array<ExaResponse | Error> = [];
	const client = {
		async send(request: ExaRequest): Promise<ExaResponse> {
			sent.push(request);
			const next = pending.shift();
			if (next instanceof Error) throw next;
			return next ?? responseOf({});
		},
	} as unknown as ExaClient;
	const activated: string[][] = [];
	const runtime: Runtime = {
		config: () => config,
		client: () => client,
		activate: (groups) => {
			activated.push(groups);
			return groups;
		},
		activeGroups: () => [],
	};
	const tools = new Map<string, ExecutableTool>();
	const pi = {
		registerTool(tool: ExecutableTool) {
			tools.set(tool.name, tool);
		},
	} as unknown as ExtensionAPI;
	register(pi, runtime);
	return {
		tools,
		sent,
		config,
		activated,
		queue: (...results) => pending.push(...results),
		call: (name, params) => {
			const tool = tools.get(name);
			if (!tool) throw new Error(`tool ${name} is not registered`);
			return tool.execute("call-1", params, undefined, undefined, {});
		},
	};
}

/** The first text block of a tool result. */
export function toolText(result: ToolResult): string {
	return result.content[0]?.text ?? "";
}

/** The `details` record of a tool result, for assertions. */
export function toolDetails(result: ToolResult): Record<string, unknown> {
	return (result.details ?? {}) as Record<string, unknown>;
}
