import test from "node:test";
import assert from "node:assert/strict";
import { JiraClient, JiraError } from "../server/lib/jira-client.js";

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

test("builds basic auth and requests the enhanced search endpoint", async () => {
  const calls = [];
  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net/",
    authMode: "basic",
    email: "user@example.com",
    token: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        issues: [{ key: "DEMO-1", fields: { summary: "One" } }],
        isLast: true
      });
    }
  });

  const issues = await client.search({
    jql: 'project = "DEMO"',
    fields: "summary",
    maxResults: 10
  });

  assert.equal(issues.length, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/api\/3\/search\/jql\?/);
  assert.equal(
    calls[0].init.headers.Authorization,
    `Basic ${Buffer.from("user@example.com:secret").toString("base64")}`
  );
});

test("paginates with nextPageToken", async () => {
  const tokens = [];
  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net",
    authMode: "bearer",
    token: "pat",
    fetchImpl: async (url) => {
      const token = new URL(url).searchParams.get("nextPageToken");
      tokens.push(token);

      if (!token) {
        return jsonResponse({
          issues: [{ key: "A-1" }],
          nextPageToken: "next-1",
          isLast: false
        });
      }

      return jsonResponse({
        issues: [{ key: "A-2" }],
        isLast: true
      });
    }
  });

  const issues = await client.search({ jql: "ORDER BY created", fields: "summary" });

  assert.deepEqual(tokens, [null, "next-1"]);
  assert.deepEqual(
    issues.map((issue) => issue.key),
    ["A-1", "A-2"]
  );
});

test("falls back to offset search when the enhanced endpoint is missing", async () => {
  const paths = [];
  const client = new JiraClient({
    baseUrl: "https://jira.internal",
    authMode: "none",
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      paths.push(path);

      if (path.endsWith("/search/jql")) {
        return new Response("not found", { status: 404 });
      }

      return jsonResponse({
        issues: [{ key: "OLD-1" }],
        total: 1
      });
    }
  });

  const issues = await client.search({ jql: "ORDER BY created", fields: "summary" });

  assert.deepEqual(paths, [
    "/rest/api/3/search/jql",
    "/rest/api/3/search"
  ]);
  assert.equal(issues[0].key, "OLD-1");
});

test("retries on 503 and returns the successful response", async () => {
  let attempts = 0;
  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net",
    authMode: "bearer",
    token: "pat",
    fetchImpl: async () => {
      attempts++;

      if (attempts === 1) {
        return new Response("busy", { status: 503 });
      }

      return jsonResponse({ displayName: "Test User" });
    }
  });

  const myself = await client.getMyself();

  assert.equal(attempts, 2);
  assert.equal(myself.displayName, "Test User");
});

test("surfaces Jira error messages", async () => {
  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net",
    authMode: "bearer",
    token: "pat",
    fetchImpl: async () =>
      jsonResponse(
        { errorMessages: ["Issue does not exist or you do not have permission"] },
        { status: 404 }
      )
  });

  await assert.rejects(
    () => client.getIssue("NOPE-1", "summary"),
    (error) => {
      assert.ok(error instanceof JiraError);
      assert.equal(error.status, 404);
      assert.match(error.message, /does not exist/);
      return true;
    }
  );
});

test("fails fast when credentials are missing", async () => {
  const client = new JiraClient({ baseUrl: "" });

  assert.equal(client.configured, false);
  await assert.rejects(() => client.getMyself(), /not configured/);
});

test("posts transitions and creates issues", async () => {
  const calls = [];
  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net",
    authMode: "bearer",
    token: "pat",
    fetchImpl: async (url, init) => {
      calls.push({ path: new URL(url).pathname, body: init.body, method: init.method });

      if (init.method === "POST" && new URL(url).pathname.endsWith("/issue")) {
        return jsonResponse({ key: "DEMO-99" }, { status: 201 });
      }

      return jsonResponse({});
    }
  });

  await client.transition("DEMO-1", { transitionId: 31 });
  const created = await client.createIssue({ summary: "Hello" });

  assert.equal(created.key, "DEMO-99");
  assert.deepEqual(JSON.parse(calls[0].body), { transition: { id: "31" } });
  assert.deepEqual(JSON.parse(calls[1].body), {
    fields: { summary: "Hello" }
  });
});
