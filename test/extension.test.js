import test from "node:test";
import assert from "node:assert/strict";
import { JiraClient, JiraError } from "../extension-src/js/lib/jira-client.js";
import { buildJql } from "../extension-src/js/lib/jql.js";
import { createStatusMapper } from "../extension-src/js/lib/status.js";
import { defaultSettings, pickSettings } from "../extension-src/js/lib/settings.js";
import { api, ApiError } from "../extension-src/js/api.js";

/*
 * Minimal in-memory replacement for chrome.storage.local that resolves
 * promises like the real WebExtension API.
 */
function installChromeStorageStub() {
  const store = new Map();

  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys === null || keys === undefined) {
            return Object.fromEntries(store);
          }

          const requested = Array.isArray(keys) ? keys : [keys];
          const result = {};

          for (const key of requested) {
            if (store.has(key)) {
              result[key] = store.get(key);
            }
          }

          return result;
        },

        async set(items) {
          for (const [key, value] of Object.entries(items)) {
            store.set(key, JSON.parse(JSON.stringify(value)));
          }
        }
      }
    }
  };

  return {
    dump: () => Object.fromEntries(store),

    reset() {
      store.clear();
    }
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    text: async () => JSON.stringify(body)
  };
}

test.beforeEach(() => {
  installChromeStorageStub();
});

test("extension jql builder escapes user input like the server", () => {
  assert.equal(
    buildJql({ projectKey: 'PRO"J', label: "x\\y" }),
    'project = "PRO\\"J" AND labels = "x\\\\y" ORDER BY updated DESC'
  );
});

test("extension status mapper resolves overrides and aliases", () => {
  const mapper = createStatusMapper({ "Peer Review": "In Review" });

  assert.equal(mapper("peer review"), "In Review");
  assert.equal(mapper("In Test PM"), "In Testing");
  assert.equal(mapper("Some New State"), "To Do");
});

test("extension settings keep the server schema", () => {
  assert.deepEqual(defaultSettings(), {
    label: "",
    projectKey: "",
    quantityField: "",
    issueKey: "",
    pollIntervalMs: 15000,
    autoRefresh: true,
    maxResults: 200
  });

  const picked = pickSettings(
    { label: "christmas-2026", projectKey: "log", maxResults: "42" },
    defaultSettings()
  );

  assert.equal(picked.label, "christmas-2026");
  assert.equal(picked.projectKey, "LOG");
  assert.equal(picked.maxResults, 42);

  assert.throws(() => pickSettings({ quantityField: "text" }));
  assert.throws(() => pickSettings({ maxResults: 999999 }));
});

test("api.getConfig describes the unconfigured extension", async () => {
  const config = await api.getConfig();

  assert.equal(config.app.name, "Jira Flowyard");
  assert.equal(config.app.mode, "extension");
  assert.equal(config.jira.configured, false);
  assert.equal(config.jira.site, null);
  assert.equal(config.jira.authMode, "none");
  assert.equal(config.jira.settings.label, "");
});

test("api.saveConfig persists settings and rejects unknown keys", async () => {
  await assert.rejects(
    api.saveConfig({ unexpected: true }),
    (error) => error instanceof ApiError && /Unknown settings/.test(error.message)
  );

  const response = await api.saveConfig({ label: "christmas-2026" });
  assert.equal(response.jira.settings.label, "christmas-2026");

  const config = await api.getConfig();
  assert.equal(config.jira.settings.label, "christmas-2026");
});

test("api.transition validates its payload like the server route", async () => {
  await assert.rejects(
    api.transition("DEMO-1", {}),
    (error) => error instanceof ApiError && /transitionId or targetStatus/.test(error.message)
  );

  await assert.rejects(
    api.transition("DEMO-1", { targetStatus: "Frozen" }),
    (error) =>
      error instanceof ApiError && /targetStatus must be one of/.test(error.message)
  );

  await assert.rejects(
    api.transition("not a key", { targetStatus: "To Do" }),
    (error) => error instanceof ApiError && /PROJECT-123/.test(error.message)
  );
});

test("api.createTicket validates summary and project key", async () => {
  await assert.rejects(
    api.createTicket({ summary: "", projectKey: "LOG" }),
    (error) => error instanceof ApiError && /summary is required/.test(error.message)
  );

  await assert.rejects(
    api.createTicket({ summary: "Test" }),
    (error) => error instanceof ApiError && /projectKey is required/.test(error.message)
  );
});

test("api routes reject while Jira is not configured", async () => {
  await assert.rejects(
    api.listTickets({ label: "x" }),
    (error) =>
      error instanceof ApiError &&
      error.status === 503 &&
      /not configured/.test(error.message)
  );
});

test("api reports missing host access instead of a CORS failure", async () => {
  await globalThis.chrome.storage.local.set({
    jiraConfig: {
      baseUrl: "https://example.atlassian.net",
      authMode: "bearer",
      token: "pat"
    }
  });

  globalThis.chrome.permissions = {
    contains: async () => false
  };

  await assert.rejects(
    api.checkConnection(),
    (error) =>
      error instanceof ApiError &&
      error.status === 503 &&
      /Missing host access for example\.atlassian\.net/.test(error.message) &&
      /options/.test(error.details)
  );
});

test("browser JiraClient sends basic auth and surfaces Jira errors", async () => {
  const calls = [];

  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net/",
    authMode: "basic",
    email: "elf@north.pole",
    token: "secret-token",
    retries: 0,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });

      return jsonResponse(
        { errorMessages: ["Nope"], errors: { summary: "bad" } },
        400
      );
    }
  });

  assert.equal(client.site, "https://example.atlassian.net");

  await assert.rejects(client.getMyself(), (error) => {
    assert.ok(error instanceof JiraError);
    assert.equal(error.status, 400);
    assert.match(error.message, /Nope/);
    return true;
  });

  const { url, options } = calls[0];
  assert.equal(url, "https://example.atlassian.net/rest/api/3/myself");
  assert.equal(
    options.headers.Authorization,
    `Basic ${btoa("elf@north.pole:secret-token")}`
  );
  assert.ok(!("User-Agent" in options.headers));
});

test("browser JiraClient retries rate limits and succeeds", async () => {
  let attempts = 0;

  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net",
    authMode: "bearer",
    token: "pat",
    retries: 1,
    fetchImpl: async () => {
      attempts++;

      if (attempts === 1) {
        const headers = new Map([["retry-after", "0"]]);
        return { ok: false, status: 429, headers, text: async () => "" };
      }

      return jsonResponse({ issues: [{ key: "LOG-1" }], isLast: true });
    }
  });

  const issues = await client.search({ jql: "", fields: "summary" });

  assert.equal(attempts, 2);
  assert.equal(issues.length, 1);
});

test("browser JiraClient reports cancelled requests as AbortError", async () => {
  const client = new JiraClient({
    baseUrl: "https://example.atlassian.net",
    authMode: "bearer",
    token: "pat",
    retries: 0,
    fetchImpl: async () => {
      throw new DOMException("Aborted", "AbortError");
    }
  });

  await assert.rejects(client.getMyself(), (error) => {
    assert.equal(error.name, "AbortError");
    assert.ok(error instanceof JiraError);
    return true;
  });
});

test("api.listTickets searches directly and maps issues to tickets", async () => {
  await globalThis.chrome.storage.local.set({
    jiraConfig: {
      baseUrl: "https://example.atlassian.net",
      authMode: "bearer",
      token: "pat"
    }
  });

  await api.saveConfig({ label: "christmas-2026", projectKey: "LOG" });

  const requests = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });

    if (String(url).includes("/rest/api/3/search/jql")) {
      return jsonResponse({
        issues: [
          {
            key: "LOG-7",
            fields: {
              summary: "Ship the gifts",
              status: { name: "In Test PM" },
              labels: ["christmas-2026"],
              priority: { name: "Major" },
              assignee: { displayName: "Rudolph" },
              issuetype: { name: "Task" }
            }
          }
        ],
        isLast: true
      });
    }

    return jsonResponse({}, 404);
  };

  try {
    const response = await api.listTickets({});

    assert.equal(response.tickets.length, 1);
    assert.equal(response.tickets[0].id, "LOG-7");
    assert.equal(response.tickets[0].status, "In Testing");
    assert.equal(response.tickets[0].assignee, "Rudolph");
    assert.match(response.meta.jql, /labels = "christmas-2026"/);

    const search = requests.find((entry) =>
      entry.url.includes("/rest/api/3/search/jql")
    );

    assert.ok(search);
    assert.equal(search.options.headers.Authorization, "Bearer pat");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
