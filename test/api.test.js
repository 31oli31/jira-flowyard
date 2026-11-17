import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { JiraClient } from "../server/lib/jira-client.js";
import { SettingsStore } from "../server/lib/settings-store.js";
import { TtlCache } from "../server/lib/cache.js";

const issue = (key, status, extra = {}) => ({
  key,
  fields: {
    summary: `Summary ${key}`,
    status: { name: status },
    labels: ["christmas-2026"],
    updated: "2026-01-01T10:00:00.000+0000",
    priority: { name: "Major" },
    assignee: { displayName: "Ada Lovelace" },
    ...extra
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function jiraFetch(requestLog = []) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    requestLog.push({ path, method: init.method || "GET", search: parsed.search });

    if (path === "/rest/api/3/myself") {
      return json({ displayName: "Test User", emailAddress: "test@example.com" });
    }

    if (path === "/rest/api/3/project/search") {
      return json({ values: [{ key: "DEMO", name: "Payment" }] });
    }

    if (path === "/rest/api/3/search/jql") {
      return json({
        issues: [
          issue("DEMO-1", "In Test PM", { customfield_10042: 42 }),
          issue("DEMO-2", "In Code Review")
        ],
        isLast: true
      });
    }

    if (path === "/rest/api/3/search") {
      return json({
        issues: [issue("OLD-1", "To Do")],
        total: 1
      });
    }

    if (path === "/rest/api/3/issue" && init.method === "POST") {
      return json({ key: "DEMO-3" }, 201);
    }

    if (path === "/rest/api/3/issue/DEMO-3") {
      return json(issue("DEMO-3", "To Do", { customfield_10042: 7 }));
    }

    if (path === "/rest/api/3/issue/DEMO-1/transitions") {
      if (init.method === "POST") {
        return new Response(null, { status: 204 });
      }

      return json({
        transitions: [
          {
            id: "11",
            name: "Start progress",
            isAvailable: true,
            to: { name: "In Progress" }
          },
          {
            id: "21",
            name: "Ready for release",
            isAvailable: true,
            to: { name: "Ready For Release" }
          },
          {
            id: "31",
            name: "Resolved",
            isAvailable: true,
            to: { name: "Released" }
          },
          {
            id: "41",
            name: "Hidden",
            isAvailable: false,
            to: { name: "In Review" }
          }
        ]
      });
    }

    if (path.startsWith("/rest/api/3/issue/")) {
      return json(issue("DEMO-1", "In Test PM"));
    }

    return json({ errorMessages: [`Unhandled ${path}`] }, 500);
  };
}

async function startServer({ fetchImpl = jiraFetch(), rateLimit } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "campus-api-"));
  const settingsStore = new SettingsStore({
    file: join(directory, "settings.json"),
    defaults: { label: "christmas-2026", projectKey: "DEMO" }
  });

  const jira = new JiraClient({
    baseUrl: "https://jira.test",
    authMode: "bearer",
    token: "token",
    retries: 0,
    fetchImpl
  });

  const config = {
    isProduction: false,
    publicDir: new URL("../public", import.meta.url).pathname,
    vendorDir: new URL("../node_modules/three", import.meta.url).pathname,
    rateLimit: rateLimit || { windowMs: 60000, max: 1000 },
    cacheTtlMs: 0,
    jira: { statusMap: {}, issueType: "Task" }
  };

  const app = createApp({
    config,
    jira,
    settingsStore,
    cache: new TtlCache(0),
    version: "test",
    logger: { info() {}, error() {} }
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    server,
    settingsStore
  };
}

test("serves runtime config without leaking credentials", async (t) => {
  const { base, server } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${base}/api/config`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.app.name, "Jira Flowyard");
  assert.equal(body.jira.configured, true);
  assert.equal(body.jira.authMode, "bearer");
  assert.equal(body.jira.settings.projectKey, "DEMO");
  assert.equal(JSON.stringify(body).includes("token"), false);
  assert.equal(JSON.stringify(body).includes("jira.test"), true);
});

test("returns normalized tickets with mapped statuses", async (t) => {
  const requests = [];
  const { base, server } = await startServer({
    fetchImpl: jiraFetch(requests)
  });
  t.after(() => server.close());

  const response = await fetch(`${base}/api/jira/tickets`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.tickets.length, 2);

  const first = body.tickets[0];
  assert.equal(first.id, "DEMO-1");
  assert.equal(first.status, "In Testing");
  assert.equal(first.jiraStatus, "In Test PM");
  assert.equal(first.tag, "#christmas-2026");
  assert.equal(first.assignee, "Ada Lovelace");

  assert.equal(body.tickets[1].status, "In Review");
  assert.equal(body.meta.count, 2);
  assert.equal(body.meta.cached, false);

  const search = requests.find((entry) => entry.path.endsWith("/search/jql"));
  assert.match(
    new URLSearchParams(search.search).get("jql") ?? "",
    /project = "DEMO" AND labels = "christmas-2026"/
  );
});

test("reads a single ticket and validates the key", async (t) => {
  const { base, server } = await startServer();
  t.after(() => server.close());

  const ok = await fetch(`${base}/api/jira/tickets/DEMO-1`);
  assert.equal(ok.status, 200);

  const invalid = await fetch(
    `${base}/api/jira/tickets/${encodeURIComponent("bad key!")}`
  );
  assert.equal(invalid.status, 400);
});

test("updates only allowed settings", async (t) => {
  const { base, server, settingsStore } = await startServer();
  t.after(() => server.close());

  const updated = await fetch(`${base}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "release", pollIntervalMs: 30000 })
  });

  assert.equal(updated.status, 200);
  assert.equal((await settingsStore.read()).label, "release");

  const rejected = await fetch(`${base}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiToken: "hunter2" })
  });

  assert.equal(rejected.status, 400);
});

test("resolves transitions by canonical status", async (t) => {
  const { base, server } = await startServer();
  t.after(() => server.close());

  const list = await fetch(`${base}/api/jira/tickets/DEMO-1/transitions`);
  const body = await list.json();

  assert.equal(list.status, 200);
  assert.deepEqual(
    body.transitions.map((transition) => transition.to.status),
    ["In Progress", "Release", "Released", "In Review"]
  );

  const moved = await fetch(
    `${base}/api/jira/tickets/DEMO-1/transitions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStatus: "Release" })
    }
  );

  const movedBody = await moved.json();
  assert.equal(moved.status, 200);
  assert.equal(movedBody.transition.name, "Ready for release");

  const missing = await fetch(
    `${base}/api/jira/tickets/DEMO-1/transitions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStatus: "To Do" })
    }
  );

  assert.equal(missing.status, 409);
});

test("creates a ticket and returns the normalized result", async (t) => {
  const requests = [];
  const { base, server } = await startServer({
    fetchImpl: jiraFetch(requests)
  });
  t.after(() => server.close());

  const response = await fetch(`${base}/api/jira/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: "Build a snowman",
      projectKey: "demo",
      description: "With a carrot",
      quantity: 7,
      quantityField: "customfield_10042"
    })
  });

  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.key, "DEMO-3");
  assert.equal(body.ticket.quantity, 7);

  const createCall = requests.find(
    (entry) => entry.path === "/rest/api/3/issue" && entry.method === "POST"
  );
  assert.ok(createCall);
});

test("rejects incomplete ticket payloads", async (t) => {
  const { base, server } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${base}/api/jira/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary: "" })
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { message: "summary is required", details: null }
  });
});

test("checks the Jira connection", async (t) => {
  const { base, server } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${base}/api/jira/connection`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.displayName, "Test User");
});

test("answers unknown API routes with JSON 404", async (t) => {
  const { base, server } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${base}/api/nope`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.message, "Not found");
});

test("rate limits API traffic", async (t) => {
  const { base, server } = await startServer({
    rateLimit: { windowMs: 60000, max: 2 }
  });
  t.after(() => server.close());

  assert.equal((await fetch(`${base}/api/config`)).status, 200);
  assert.equal((await fetch(`${base}/api/config`)).status, 200);
  assert.equal((await fetch(`${base}/api/config`)).status, 429);
});
