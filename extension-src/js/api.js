/*
 * Drop-in replacement for public/js/api.js inside the extension. It exposes
 * the exact same interface (ApiError + api) so app.js works unchanged, but
 * implements the routes locally against the Jira REST API instead of the
 * Node proxy. Logic mirrors server/routes/api.js.
 */
import { buildFields, buildJql } from "./lib/jql.js";
import { toTicket } from "./lib/normalize.js";
import { createStatusMapper, isCanonicalStatus } from "./lib/status.js";
import { JiraClient, JiraError } from "./lib/jira-client.js";
import { readSettings, updateSettings } from "./lib/settings.js";
import {
  readJiraConfig,
  resolveAuthMode,
  hasOriginPermission
} from "./lib/storage.js";

const VERSION = "1.0.0";
const CACHE_TTL_MS = 5000;
const MAX_DESCRIPTION_LENGTH = 4000;

export class ApiError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

class TtlCache {
  #entries = new Map();
  #ttlMs;

  constructor(ttlMs) {
    this.#ttlMs = ttlMs;
  }

  get(key) {
    const entry = this.#entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.createdAt > this.#ttlMs) {
      this.#entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key, value) {
    this.#entries.set(key, { value, createdAt: Date.now() });

    if (this.#entries.size > 200) {
      const oldest = this.#entries.keys().next().value;
      this.#entries.delete(oldest);
    }

    return value;
  }

  clear() {
    this.#entries.clear();
  }
}

const cache = new TtlCache(CACHE_TTL_MS);

const ALLOWED_SETTINGS = [
  "label",
  "projectKey",
  "quantityField",
  "issueKey",
  "pollIntervalMs",
  "autoRefresh",
  "maxResults"
];

/* ------------------------------------------------------------------
 * Validation helpers (ported from server/routes/api.js)
 * ------------------------------------------------------------------ */

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "");
}

function readString(value, field, { max = 255, required = false } = {}) {
  const text = String(value ?? "").trim();

  if (required && !text) {
    throw new ApiError(`${field} is required`, { status: 400 });
  }

  if (text.length > max) {
    throw new ApiError(`${field} must be at most ${max} characters`, {
      status: 400
    });
  }

  return text;
}

function readIssueKey(value, { required = true } = {}) {
  const key = readString(value, "issue key", { max: 64, required });

  if (
    key &&
    !/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(key) &&
    !/^\d+$/.test(key)
  ) {
    throw new ApiError("issue key must look like PROJECT-123", { status: 400 });
  }

  return key.toUpperCase();
}

function readQuantity(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }

  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
    throw new ApiError("quantity must be a positive number", { status: 400 });
  }

  return Math.round(quantity);
}

function paragraphDocument(text) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : []
      }
    ]
  };
}

function pickTransition(transitions, targetStatus, mapStatus) {
  const available = transitions.filter(
    (transition) => transition.isAvailable !== false
  );

  const ranked = available
    .map((transition) => {
      const canonical = mapStatus.resolve(transition.to?.name);
      const byName = mapStatus.resolve(transition.name);
      const score =
        canonical === targetStatus
          ? 3
          : byName === targetStatus
            ? 1
            : 0;

      return { transition, score, canonical };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.transition || null;
}

/* ------------------------------------------------------------------
 * Client construction
 * ------------------------------------------------------------------ */

async function createContext() {
  const [jiraConfig, settings] = await Promise.all([
    readJiraConfig(),
    readSettings()
  ]);

  let mapStatus;

  try {
    mapStatus = createStatusMapper(jiraConfig.statusMap);
  } catch (error) {
    throw new ApiError(error.message, {
      status: 400,
      details: "Fix the status map in the extension options"
    });
  }

  const authMode = resolveAuthMode(jiraConfig);
  const client = new JiraClient({
    baseUrl: jiraConfig.baseUrl,
    authMode,
    email: jiraConfig.email,
    token: jiraConfig.token,
    timeoutMs: jiraConfig.timeoutMs,
    retries: jiraConfig.retries
  });

  return { jiraConfig, settings, mapStatus, client };
}

/*
 * Without host access, fetches to Jira fail as opaque CORS errors
 * ("Failed to fetch" / strict-origin-when-cross-origin), which is impossible
 * to debug from the campus UI. Access is therefore verified up front and
 * reported with an instruction that actually fixes it.
 */
async function requireConfigured(context) {
  if (!context.client.configured) {
    throw new ApiError("Jira is not configured", {
      status: 503,
      details: "Open the extension options and set the Jira base URL and credentials"
    });
  }

  const { baseUrl } = context.jiraConfig;

  if (baseUrl && !(await hasOriginPermission(baseUrl))) {
    let host = baseUrl;

    try {
      host = new URL(baseUrl).host;
    } catch {
      /* keep the raw value when the stored URL is malformed */
    }

    throw new ApiError(`Missing host access for ${host}`, {
      status: 503,
      details:
        "Open the extension options (⚙) and click Save with the Jira base URL filled in — the browser will ask for permission to reach it."
    });
  }
}

function wrapJiraError(error) {
  if (!(error instanceof JiraError)) {
    return error;
  }

  let message = error.message;

  if (
    error.httpStatus === 401 ||
    error.httpStatus === 403 ||
    (error.status === 502 && /HTTP 401|HTTP 403/.test(message))
  ) {
    message =
      "Jira rejected the stored credentials. Check the settings in the extension options.";
  }

  if (error.name === "AbortError") {
    return error;
  }

  return new ApiError(message, {
    status: error.status,
    details: error.details
  });
}

function normalizeOptions(settings, query = {}) {
  const quantityField = readString(
    query.quantityField ?? settings.quantityField,
    "quantityField",
    { max: 64 }
  );

  if (quantityField && !/^customfield_\d+$/.test(quantityField)) {
    throw new ApiError("quantityField must look like customfield_12345", {
      status: 400
    });
  }

  const maxResults = Number(query.maxResults ?? settings.maxResults);

  return {
    label: normalizeLabel(query.label ?? settings.label),
    projectKey: readString(
      query.project ?? settings.projectKey,
      "project",
      { max: 32 }
    ).toUpperCase(),
    issueKey: readIssueKey(
      query.issueKey ?? settings.issueKey,
      { required: false }
    ),
    quantityField,
    maxResults: Number.isFinite(maxResults)
      ? Math.min(Math.max(Math.round(maxResults), 1), 500)
      : 200
  };
}

function describeJira(settings, jiraConfig) {
  const authMode = resolveAuthMode(jiraConfig);
  const configured =
    Boolean(jiraConfig.baseUrl) &&
    new JiraClient({
      baseUrl: jiraConfig.baseUrl,
      authMode,
      email: jiraConfig.email,
      token: jiraConfig.token
    }).configured;

  return {
    configured,
    site: jiraConfig.baseUrl || null,
    authMode,
    account: jiraConfig.email || null,
    settings: {
      label: settings.label,
      projectKey: settings.projectKey,
      quantityField: settings.quantityField,
      issueKey: settings.issueKey,
      pollIntervalMs: settings.pollIntervalMs,
      autoRefresh: settings.autoRefresh,
      maxResults: settings.maxResults
    },
    capabilities: {
      createIssue: configured,
      transitions: configured,
      search: configured
    }
  };
}

/* ------------------------------------------------------------------
 * Public API (mirrors the /api routes)
 * ------------------------------------------------------------------ */

export const api = {
  async getConfig() {
    const [settings, jiraConfig] = await Promise.all([
      readSettings(),
      readJiraConfig()
    ]);

    return {
      app: {
        name: "Christmas Logistics Campus",
        version: VERSION,
        mode: "extension"
      },
      jira: describeJira(settings, jiraConfig)
    };
  },

  async saveConfig(patch) {
    const body = patch || {};
    const unknown = Object.keys(body).filter(
      (key) => !ALLOWED_SETTINGS.includes(key)
    );

    if (unknown.length) {
      throw new ApiError(`Unknown settings: ${unknown.join(", ")}`, {
        status: 400
      });
    }

    const [settings, jiraConfig] = await Promise.all([
      updateSettings(body),
      readJiraConfig()
    ]);

    cache.clear();

    return { jira: describeJira(settings, jiraConfig) };
  },

  async checkConnection() {
    const context = await createContext();

    await requireConfigured(context);

    try {
      const myself = await context.client.getMyself();

      return {
        ok: true,
        site: context.client.site,
        account: myself?.emailAddress || context.jiraConfig.email || null,
        displayName: myself?.displayName || null,
        authMode: context.client.authMode
      };
    } catch (error) {
      throw wrapJiraError(error);
    }
  },

  async listProjects() {
    const context = await createContext();

    await requireConfigured(context);

    try {
      return { projects: await context.client.getProjects() };
    } catch (error) {
      throw wrapJiraError(error);
    }
  },

  async listTickets(params, signal) {
    const context = await createContext();

    const options = normalizeOptions(context.settings, params);
    const fields = buildFields(options);
    const jql = buildJql(options);
    const cacheKey = `${jql}|${fields}|${options.maxResults}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      return {
        tickets: cached,
        meta: {
          count: cached.length,
          jql,
          cached: true,
          fetchedAt: new Date().toISOString()
        }
      };
    }

    let issues;

    try {
      await requireConfigured(context);

      if (options.issueKey) {
        issues = [await context.client.getIssue(options.issueKey, fields)];
      } else {
        issues = await context.client.search({
          jql,
          fields,
          maxResults: options.maxResults,
          signal
        });
      }
    } catch (error) {
      throw wrapJiraError(error);
    }

    if (!Array.isArray(issues)) {
      issues = [];
    }

    const tickets = issues.map((issue) =>
      toTicket(issue, {
        mapStatus: context.mapStatus,
        quantityField: options.quantityField,
        label: options.label
      })
    );

    if (!options.issueKey) {
      cache.set(cacheKey, tickets);
    }

    return {
      tickets,
      meta: {
        count: tickets.length,
        jql,
        cached: false,
        fetchedAt: new Date().toISOString()
      }
    };
  },

  async getTicket(key, params, signal) {
    const context = await createContext();

    const options = normalizeOptions(context.settings, params);
    const issueKey = readIssueKey(key);

    try {
      await requireConfigured(context);

      const issue = await context.client.getIssue(
        issueKey,
        buildFields(options),
        signal
      );

      return {
        ticket: toTicket(issue, {
          mapStatus: context.mapStatus,
          quantityField: options.quantityField,
          label: options.label
        })
      };
    } catch (error) {
      throw wrapJiraError(error);
    }
  },

  async createTicket(ticket) {
    const context = await createContext();

    const body = ticket || {};

    const summary = readString(body.summary, "summary", {
      required: true,
      max: 254
    });

    const projectKey = readString(
      body.projectKey ?? context.settings.projectKey,
      "projectKey",
      { required: true, max: 32 }
    ).toUpperCase();

    const label = normalizeLabel(body.label ?? context.settings.label);
    const quantityField = readString(
      body.quantityField ?? context.settings.quantityField,
      "quantityField",
      { max: 64 }
    );

    if (quantityField && !/^customfield_\d+$/.test(quantityField)) {
      throw new ApiError("quantityField must look like customfield_12345", {
        status: 400
      });
    }

    const quantity = readQuantity(body.quantity);
    const description = readString(body.description, "description", {
      max: MAX_DESCRIPTION_LENGTH
    });
    const issueType = readString(
      body.issueType || context.jiraConfig.issueType || "Task",
      "issueType",
      { max: 64 }
    );

    const fields = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType }
    };

    if (label) {
      fields.labels = [label];
    }

    if (description) {
      fields.description = paragraphDocument(description);
    }

    if (quantityField) {
      fields[quantityField] = quantity;
    }

    try {
      await requireConfigured(context);

      const created = await context.client.createIssue(fields);
      const key = created?.key;

      if (!key) {
        throw new ApiError("Jira did not return a ticket key", { status: 502 });
      }

      const issue = await context.client.getIssue(
        key,
        buildFields({ quantityField })
      );
      const normalized = toTicket(issue, {
        mapStatus: context.mapStatus,
        quantityField,
        label
      });

      cache.clear();

      return { ticket: normalized, key };
    } catch (error) {
      throw wrapJiraError(error);
    }
  },

  async getTransitions(key, signal) {
    const context = await createContext();

    const issueKey = readIssueKey(key);

    try {
      await requireConfigured(context);

      const transitions = await context.client.getTransitions(issueKey, signal);

      return {
        key: issueKey,
        transitions: transitions.map((transition) => ({
          id: transition.id,
          name: transition.name,
          available: transition.isAvailable !== false,
          to: {
            name: transition.to?.name || null,
            status: context.mapStatus(transition.to?.name || transition.name)
          }
        }))
      };
    } catch (error) {
      throw wrapJiraError(error);
    }
  },

  async transition(key, payload) {
    const context = await createContext();

    const issueKey = readIssueKey(key);

    const body = payload || {};
    const targetStatus = body.targetStatus;
    const transitionId = body.transitionId
      ? String(body.transitionId)
      : null;

    if (!transitionId && !targetStatus) {
      throw new ApiError("Either transitionId or targetStatus is required", {
        status: 400
      });
    }

    if (targetStatus && !isCanonicalStatus(targetStatus)) {
      throw new ApiError(
        "targetStatus must be one of: To Do, In Progress, In Review, In Testing, Release, Released",
        { status: 400 }
      );
    }

    try {
      await requireConfigured(context);

      const transitions = await context.client.getTransitions(issueKey);
      const transition = transitionId
        ? transitions.find((entry) => String(entry.id) === transitionId)
        : pickTransition(transitions, targetStatus, context.mapStatus);

      if (!transition) {
        throw new ApiError(
          `No available Jira transition leads to ${targetStatus || transitionId}`,
          {
            status: 409,
            details: transitions.map((entry) => ({
              id: entry.id,
              name: entry.name,
              to: entry.to?.name
            }))
          }
        );
      }

      await context.client.transition(issueKey, {
        transitionId: transition.id
      });

      cache.clear();

      return {
        ok: true,
        key: issueKey,
        transition: {
          id: transition.id,
          name: transition.name,
          to: transition.to?.name || null,
          status: context.mapStatus(transition.to?.name || transition.name)
        }
      };
    } catch (error) {
      throw wrapJiraError(error);
    }
  }
};

/* Exposed for tests. */
export { pickTransition, normalizeOptions };
