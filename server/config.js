import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON in environment variable: ${error.message}`);
  }
}

export function loadConfig(env = process.env) {
  const baseUrl = String(env.JIRA_BASE_URL || env.JIRA_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    throw new Error("JIRA_BASE_URL must start with http:// or https://");
  }

  const token = env.JIRA_API_TOKEN || "";
  const email = env.JIRA_EMAIL || env.JIRA_USERNAME || "";
  const authMode =
    env.JIRA_AUTH_MODE || (token ? (email ? "basic" : "bearer") : "none");

  if (!["basic", "bearer", "none"].includes(authMode)) {
    throw new Error("JIRA_AUTH_MODE must be one of: basic, bearer, none");
  }

  const isProduction = env.NODE_ENV === "production";

  return {
    projectRoot,
    publicDir: resolve(projectRoot, "public"),
    vendorDir: resolve(projectRoot, "node_modules/three"),
    dataFile:
      env.SETTINGS_FILE || resolve(projectRoot, "data", "settings.json"),
    isProduction,
    port: parseNumber(env.PORT, 3000),
    host: env.HOST || "127.0.0.1",
    rateLimit: {
      windowMs: parseNumber(env.RATE_LIMIT_WINDOW_MS, 60_000),
      max: parseNumber(env.RATE_LIMIT_MAX, 240)
    },
    cacheTtlMs: parseNumber(env.JIRA_CACHE_TTL_MS, 5_000),
    jira: {
      baseUrl,
      authMode,
      email,
      token,
      timeoutMs: parseNumber(env.JIRA_TIMEOUT_MS, 12_000),
      retries: parseNumber(env.JIRA_RETRIES, 2),
      statusMap: parseJson(env.JIRA_STATUS_MAP, {}),
      issueType: env.JIRA_ISSUE_TYPE || "Task",
      settings: {
        label: env.JIRA_LABEL || "",
        projectKey: env.JIRA_PROJECT_KEY || "",
        quantityField: env.JIRA_QUANTITY_FIELD || "",
        issueKey: env.JIRA_ISSUE_KEY || "",
        pollIntervalMs: parseNumber(env.JIRA_POLL_INTERVAL_MS, 15_000),
        autoRefresh: parseBoolean(env.JIRA_AUTO_REFRESH, true),
        maxResults: parseNumber(env.JIRA_MAX_RESULTS, 200)
      }
    }
  };
}
