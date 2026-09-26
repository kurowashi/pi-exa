/**
 * Behavior of the agent and batch tools: request dispatch, the polling
 * contract (wait true/false/timeout), and the error paths.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { registerAgentTools } from "../../src/tools/agent.ts";
import { registerBatchTool } from "../../src/tools/batches.ts";
import { createToolHarness, responseOf, toolDetails, toolText } from "../helpers/tool-harness.ts";

test("exa_agent_run with wait=false returns immediately", async () => {
	const h = createToolHarness(registerAgentTools);
	h.queue(responseOf({ id: "run_1", status: "completed" }));
	const result = await h.call("exa_agent_run", { query: "find x", wait: false });

	assert.equal(h.sent.length, 1);
	assert.equal(h.sent[0]?.method, "POST");
	assert.equal(h.sent[0]?.path, "/agent/runs");
	assert.match(toolText(result), /Agent run run_1/);
	assert.equal(toolDetails(result)["tool"], "exa_agent");
});

test("exa_agent_run polls to completion when asked to wait", async () => {
	const h = createToolHarness(registerAgentTools, {
		wait: { agent: { enabled: true, timeoutMs: 500, pollIntervalMs: 1 } },
	});
	h.queue(responseOf({ id: "run_2", status: "running" }), responseOf({ id: "run_2", status: "completed" }));
	const result = await h.call("exa_agent_run", { query: "find y" });

	assert.equal(h.sent[0]?.path, "/agent/runs");
	assert.equal(h.sent[1]?.path, "/agent/runs/run_2");
	assert.match(toolText(result), /status=completed/);
});

test("exa_agent_run reports a timed-out wait with a resume hint", async () => {
	// The config reader clamps waits to >=1s / >=250ms, so the test spends one second here.
	const h = createToolHarness(registerAgentTools, {
		wait: { agent: { enabled: true, timeoutMs: 1000, pollIntervalMs: 250 } },
	});
	h.queue(responseOf({ id: "run_3", status: "running" }));
	const result = await h.call("exa_agent_run", { query: "find z" });

	assert.match(toolText(result), /timed out after 1000ms/);
	assert.match(toolText(result), /runId=run_3/);
});

test("exa_agent_get fetches a run and can wait for it", async () => {
	const h = createToolHarness(registerAgentTools, {
		wait: { agent: { enabled: true, timeoutMs: 500, pollIntervalMs: 1 } },
	});
	h.queue(responseOf({ id: "run_4", status: "running" }), responseOf({ id: "run_4", status: "completed" }));
	const result = await h.call("exa_agent_get", { runId: "run_4" });

	assert.equal(h.sent[0]?.path, "/agent/runs/run_4");
	assert.equal(h.sent[1]?.path, "/agent/runs/run_4");
	assert.match(toolText(result), /status=completed/);
});

test("exa_agent_control dispatches every action", async () => {
	const control = createToolHarness(registerAgentTools);
	await control.call("exa_agent_control", { action: "list" });
	assert.equal(control.sent[0]?.method, "GET");
	assert.equal(control.sent[0]?.path, "/agent/runs");

	await control.call("exa_agent_control", { action: "cancel", runId: "run_5" });
	assert.equal(control.sent[1]?.path, "/agent/runs/run_5/cancel");
	await control.call("exa_agent_control", { action: "stop", runId: "run_5" });
	assert.equal(control.sent[2]?.path, "/agent/runs/run_5/stop");
	await control.call("exa_agent_control", { action: "delete", runId: "run_5" });
	assert.equal(control.sent[3]?.method, "DELETE");
	await control.call("exa_agent_control", { action: "events", runId: "run_5" });
	assert.equal(control.sent[4]?.path, "/agent/runs/run_5/events");

	const missing = await control.call("exa_agent_control", { action: "cancel" });
	assert.match(toolText(missing), /runId is required/);
	assert.equal(toolDetails(missing)["error"], true);
});

test("exa_batch create sends the requests array with the beta header", async () => {
	const h = createToolHarness(registerBatchTool);
	h.queue(responseOf({ id: "batch_1" }));
	await h.call("exa_batch", { action: "create", requests: [{ customId: "one", url: "/search" }] });

	assert.equal(h.sent[0]?.path, "/batches");
	assert.equal(h.sent[0]?.beta, "batches-2026-06-06");
	const body = h.sent[0]?.body as Record<string, unknown>;
	assert.equal((body["requests"] as unknown[]).length, 1);
});

test("exa_batch validates required arguments before sending", async () => {
	const h = createToolHarness(registerBatchTool);
	const noRequests = await h.call("exa_batch", { action: "create" });
	assert.match(toolText(noRequests), /requests is required/);
	const noId = await h.call("exa_batch", { action: "get" });
	assert.match(toolText(noId), /batchId is required/);
	assert.equal(h.sent.length, 0);
});

test("exa_batch dispatches list, delete, and cancel", async () => {
	const h = createToolHarness(registerBatchTool);
	await h.call("exa_batch", { action: "list" });
	assert.equal(h.sent[0]?.path, "/batches");
	await h.call("exa_batch", { action: "delete", batchId: "batch_2" });
	assert.equal(h.sent[1]?.method, "DELETE");
	assert.equal(h.sent[1]?.path, "/batches/batch_2");
	await h.call("exa_batch", { action: "cancel", batchId: "batch_2" });
	assert.equal(h.sent[2]?.path, "/batches/batch_2/cancel");
});

test("exa_batch get waits for a terminal status", async () => {
	const h = createToolHarness(registerBatchTool, {
		wait: { batch: { enabled: true, timeoutMs: 500, pollIntervalMs: 1 } },
	});
	h.queue(responseOf({ id: "batch_3", status: "in_progress" }), responseOf({ id: "batch_3", status: "completed" }));
	const result = await h.call("exa_batch", { action: "get", batchId: "batch_3" });

	assert.equal(h.sent[0]?.path, "/batches/batch_3");
	assert.equal(h.sent[1]?.path, "/batches/batch_3");
	assert.match(toolText(result), /completed/);
});

test("exa_batch surfaces a client failure as an error result", async () => {
	const h = createToolHarness(registerBatchTool);
	h.queue(new Error("batches unavailable"));
	const result = await h.call("exa_batch", { action: "list" });
	assert.match(toolText(result), /Error: batches unavailable/);
	assert.equal(toolDetails(result)["error"], true);
});
