/**
 * Behavior of the webset, webhook, and monitor tools: the full action surface,
 * argument validation, and the webset polling contract.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { registerMonitorTool } from "../../src/tools/monitors.ts";
import { registerWebhooksTool } from "../../src/tools/webhooks.ts";
import { registerWebsetsTool } from "../../src/tools/websets.ts";
import { createToolHarness, responseOf, toolDetails, toolText } from "../helpers/tool-harness.ts";

/** Actions the websets tool exposes. Adding one is a decision, not an accident. */
const WEBSET_ACTIONS = [
	"create",
	"get",
	"list",
	"update",
	"delete",
	"cancel",
	"preview",
	"items",
	"item",
	"delete_item",
	"add_search",
	"get_search",
	"cancel_search",
	"add_enrichment",
	"get_enrichment",
	"update_enrichment",
	"delete_enrichment",
	"cancel_enrichment",
	"create_import",
	"list_imports",
	"get_import",
	"update_import",
	"delete_import",
	"create_monitor",
	"list_monitors",
	"get_monitor",
	"update_monitor",
	"delete_monitor",
	"monitor_runs",
	"monitor_run",
];

const WEBSET_PARAMS = { websetId: "ws_1", id: "id_1", runId: "run_1", query: "q", count: 1, wait: false };

test("every webset action reaches the client without an error result", async () => {
	const h = createToolHarness(registerWebsetsTool);
	for (const action of WEBSET_ACTIONS) {
		const result = await h.call("exa_websets", { action, ...WEBSET_PARAMS });
		assert.notEqual(toolDetails(result)["error"], true, `action ${action} failed: ${toolText(result)}`);
		assert.ok(toolText(result).length > 0, `action ${action} returned no text`);
	}
	assert.equal(h.sent.length, WEBSET_ACTIONS.length);
});

test("webset paths and bodies follow the v0 API", async () => {
	const h = createToolHarness(registerWebsetsTool);
	await h.call("exa_websets", { action: "create", query: "q", count: 3, wait: false });
	assert.equal(h.sent[0]?.path, "/websets/v0/websets");
	const create = h.sent[0];
	assert.ok(create);
	assert.deepEqual((create.body as Record<string, unknown>)["search"], { query: "q", count: 3 });

	await h.call("exa_websets", { action: "add_search", websetId: "ws_1", query: "more", wait: false });
	assert.equal(h.sent[1]?.path, "/websets/v0/websets/ws_1/searches");

	await h.call("exa_websets", { action: "item", websetId: "ws_1", id: "item_1", wait: false });
	assert.equal(h.sent[2]?.path, "/websets/v0/websets/ws_1/items/item_1");

	await h.call("exa_websets", { action: "create_import", wait: false });
	assert.equal(h.sent[3]?.path, "/websets/v0/imports");

	await h.call("exa_websets", { action: "create_monitor", websetId: "ws_1", wait: false });
	assert.equal(h.sent[4]?.path, "/websets/v0/monitors");
	const monitor = h.sent[4];
	assert.ok(monitor);
	assert.equal((monitor.body as Record<string, unknown>)["websetId"], "ws_1");

	await h.call("exa_websets", { action: "monitor_run", websetId: "ws_1", id: "mon_1", runId: "run_1", wait: false });
	assert.equal(h.sent[5]?.path, "/websets/v0/monitors/mon_1/runs/run_1");
});

test("websets validates required arguments before sending", async () => {
	const h = createToolHarness(registerWebsetsTool);
	const cases: Array<Record<string, unknown>> = [
		{ action: "create" },
		{ action: "item", websetId: "ws_1" },
		{ action: "create_monitor" },
		{ action: "monitor_run", websetId: "ws_1", id: "mon_1" },
	];
	for (const params of cases) {
		const result = await h.call("exa_websets", params);
		assert.equal(toolDetails(result)["error"], true, `${JSON.stringify(params)} should be rejected`);
	}
	assert.equal(h.sent.length, 0);
});

test("webset get waits until the webset is idle", async () => {
	const h = createToolHarness(registerWebsetsTool, {
		wait: { webset: { enabled: true, timeoutSeconds: 10, pollIntervalSeconds: 1 } },
	});
	h.queue(responseOf({ id: "ws_1", status: "running" }), responseOf({ id: "ws_1", status: "idle" }));
	const result = await h.call("exa_websets", { action: "get", websetId: "ws_1" });

	assert.equal(h.sent[0]?.path, "/websets/v0/websets/ws_1");
	assert.equal(h.sent[1]?.path, "/websets/v0/websets/ws_1");
	assert.match(toolText(result), /idle/);
});

test("every webhook action reaches the client", async () => {
	const h = createToolHarness(registerWebhooksTool);
	const actions = ["create", "list", "get", "update", "delete", "attempts", "events", "event"];
	for (const action of actions) {
		const result = await h.call("exa_webhooks", { action, webhookId: "wh_1", id: "ev_1" });
		assert.notEqual(toolDetails(result)["error"], true, `action ${action}: ${toolText(result)}`);
	}
	assert.equal(h.sent[0]?.path, "/websets/v0/webhooks");
	assert.equal(h.sent[2]?.path, "/websets/v0/webhooks/wh_1");
	assert.equal(h.sent[5]?.path, "/websets/v0/webhooks/wh_1/attempts");
	assert.equal(h.sent[6]?.path, "/websets/v0/events");
	assert.equal(h.sent[7]?.path, "/websets/v0/events/ev_1");
});

test("webhooks validate their ids", async () => {
	const h = createToolHarness(registerWebhooksTool);
	const noWebhook = await h.call("exa_webhooks", { action: "get" });
	assert.match(toolText(noWebhook), /webhookId is required/);
	const noEvent = await h.call("exa_webhooks", { action: "event" });
	assert.match(toolText(noEvent), /id is required/);
	assert.equal(h.sent.length, 0);
});

test("every monitor action reaches the client", async () => {
	const h = createToolHarness(registerMonitorTool);
	const actions = ["create", "list", "get", "update", "delete", "trigger", "runs", "run", "batch"];
	for (const action of actions) {
		const result = await h.call("exa_monitor", {
			action,
			monitorId: "mon_1",
			runId: "run_1",
			query: "q",
			options: action === "batch" ? { action: "pause" } : undefined,
		});
		assert.notEqual(toolDetails(result)["error"], true, `action ${action}: ${toolText(result)}`);
	}
	assert.equal(h.sent[0]?.path, "/monitors");
	assert.equal(h.sent[5]?.path, "/monitors/mon_1/trigger");
	assert.equal(h.sent[6]?.path, "/monitors/mon_1/runs");
	assert.equal(h.sent[7]?.path, "/monitors/mon_1/runs/run_1");
	assert.equal(h.sent[8]?.path, "/monitors/batch");
});

test("monitors validate their required arguments", async () => {
	const h = createToolHarness(registerMonitorTool);
	const cases: Array<Record<string, unknown>> = [
		{ action: "get" },
		{ action: "create" },
		{ action: "run", monitorId: "mon_1" },
		{ action: "batch" },
	];
	for (const params of cases) {
		const result = await h.call("exa_monitor", params);
		assert.equal(toolDetails(result)["error"], true, `${JSON.stringify(params)} should be rejected`);
	}
	assert.equal(h.sent.length, 0);
});
