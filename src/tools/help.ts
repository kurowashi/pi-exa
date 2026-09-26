/**
 * exa_help - the progressive-disclosure entry point.
 *
 * Returns the full parameter reference for a topic and enables the tool group
 * that topic needs. This is how advanced arguments reach the model only when
 * they are actually requested.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { helpText, TOPICS, topicNames } from "../reference.ts";
import { GROUP_NAMES, signaturesForTools, toolsInGroup } from "../registry.ts";
import { errorText, type Runtime, textResult } from "./common.ts";

const TOPIC_NAMES = topicNames();

export function registerHelpTool(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerTool({
		name: "exa_help",
		label: "Exa Help",
		description:
			"Show the full Exa API reference for one topic and enable the tools it needs. Call this before using the advanced `options` argument " +
			"or when an Exa call needs a parameter not shown in the tool schema. " +
			`Topics: ${TOPIC_NAMES.join(", ")}.`,
		promptSnippet: "Reveal Exa API details (and enable the matching tools) for a topic",
		promptGuidelines: [
			"Prefer typed tools (exa_search, exa_agent_run, exa_websets, ...) over exa_request; use exa_request only for uncovered endpoints.",
		],
		parameters: Type.Object({
			topic: Type.Union(
				TOPIC_NAMES.map((value) => Type.Literal(value)),
				{ description: "Which reference to return. `overview` and `config` are safe starting points." },
			),
			activate: Type.Optional(
				Type.Array(
					Type.Union(
						GROUP_NAMES.map((value) => Type.Literal(value)),
						{ description: "Tool group name." },
					),
					{
						description:
							"Enable extra tool groups without reading their docs (core, similar, agent, monitors, websets, webhooks, batches, raw).",
					},
				),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const topic = TOPICS[params.topic];
				const groups = new Set<string>(topic?.groups ?? []);
				for (const group of params.activate ?? []) groups.add(group);
				const activated = runtime.activate([...groups]);
				const activeNow = new Set([...runtime.activeGroups()]);
				const alreadyActiveTools = [...groups].flatMap((group) => toolsInGroup(group));

				const lines: string[] = [helpText(params.topic)];
				if (activated.length > 0) {
					lines.push("", "Enabled tools (now callable):", ...signaturesForTools(activated));
				} else if (alreadyActiveTools.length > 0) {
					lines.push("", `Tools for this topic are already active: ${alreadyActiveTools.join(", ")}`);
				}
				lines.push(
					"",
					`Active groups: ${[...activeNow].sort().join(", ")}. Use exa_help topic "overview" for the endpoint index and topic list.`,
				);
				return textResult(lines.join("\n"), {
					tool: "exa_help",
					topic: params.topic,
					activated,
				});
			} catch (error) {
				return textResult(errorText(error), { tool: "exa_help", error: true });
			}
		},
	});
}
