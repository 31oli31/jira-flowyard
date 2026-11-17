/*
 * Thin promisified wrapper around chrome.storage.local and
 * chrome.permissions. Works with both the callback style (older chrome.*
 * implementations) and the promise style (Chrome 88+, Firefox) of the
 * WebExtension APIs. Nothing here may access `chrome` at import time so the
 * modules stay importable in Node for tests.
 */

const SETTINGS_KEY = "settings";
const JIRA_KEY = "jiraConfig";

const JIRA_DEFAULTS = {
  baseUrl: "",
  /* auto | basic | bearer | none */
  authMode: "auto",
  email: "",
  token: "",
  statusMap: {},
  issueType: "Task",
  timeoutMs: 12000,
  retries: 2
};

function callWebExtension(object, method, ...args) {
  return new Promise((resolve, reject) => {
    if (!object || typeof object[method] !== "function") {
      reject(new Error(`${method} is unavailable on the extension API`));
      return;
    }

    let settled = false;
    const callback = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    let returned;

    try {
      returned = object[method](...args, callback);
    } catch (error) {
      reject(error);
      return;
    }

    if (returned && typeof returned.then === "function") {
      returned.then(
        (result) => {
          if (!settled) {
            settled = true;
            resolve(result);
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      );
    }
  });
}

function storageArea() {
  return globalThis.chrome?.storage?.local;
}

export async function readStorage(keys) {
  const area = storageArea();

  if (!area) {
    throw new Error("chrome.storage.local is unavailable");
  }

  return callWebExtension(area, "get", keys);
}

export async function writeStorage(items) {
  const area = storageArea();

  if (!area) {
    throw new Error("chrome.storage.local is unavailable");
  }

  return callWebExtension(area, "set", items);
}

export async function readSettingsRaw() {
  const stored = await readStorage(SETTINGS_KEY);
  return stored?.[SETTINGS_KEY];
}

export async function readJiraConfigRaw() {
  const stored = await readStorage(JIRA_KEY);
  return stored?.[JIRA_KEY];
}

export async function writeJiraConfig(config) {
  await writeStorage({ [JIRA_KEY]: config });
}

export async function clearJiraConfig() {
  await writeStorage({ [JIRA_KEY]: { ...JIRA_DEFAULTS } });
}

export function jiraDefaults() {
  return {
    ...JIRA_DEFAULTS,
    statusMap: { ...JIRA_DEFAULTS.statusMap }
  };
}

export async function readJiraConfig() {
  const raw = await readJiraConfigRaw();

  if (!raw || typeof raw !== "object") {
    return jiraDefaults();
  }

  return {
    ...jiraDefaults(),
    statusMap:
      raw.statusMap && typeof raw.statusMap === "object" && !Array.isArray(raw.statusMap)
        ? { ...raw.statusMap }
        : {},
    baseUrl: String(raw.baseUrl ?? ""),
    authMode: ["auto", "basic", "bearer", "none"].includes(raw.authMode)
      ? raw.authMode
      : "auto",
    email: String(raw.email ?? ""),
    token: String(raw.token ?? ""),
    issueType: String(raw.issueType || "Task"),
    timeoutMs: Number.isFinite(Number(raw.timeoutMs))
      ? Number(raw.timeoutMs)
      : JIRA_DEFAULTS.timeoutMs,
    retries: Number.isFinite(Number(raw.retries))
      ? Number(raw.retries)
      : JIRA_DEFAULTS.retries
  };
}

/*
 * "auto" mirrors the server behaviour: token + email -> basic,
 * token only -> bearer, otherwise none.
 */
export function resolveAuthMode(config) {
  const requested = config?.authMode === "auto" ? null : config?.authMode;

  if (requested) {
    return requested;
  }

  if (config?.token) {
    return config.email ? "basic" : "bearer";
  }

  return "none";
}

export function originPatternFor(baseUrl) {
  return `${new URL(baseUrl).origin}/*`;
}

export async function hasOriginPermission(baseUrl) {
  const api = globalThis.chrome?.permissions;

  if (!api?.contains) {
    return true;
  }

  try {
    return Boolean(
      await callWebExtension(api, "contains", {
        origins: [originPatternFor(baseUrl)]
      })
    );
  } catch {
    return false;
  }
}

/*
 * Must be called from a user gesture (options page button click) because
 * browsers only show permission prompts for user-initiated requests.
 */
export async function requestOriginPermission(baseUrl) {
  const api = globalThis.chrome?.permissions;

  if (!api?.request) {
    return true;
  }

  return Boolean(
    await callWebExtension(api, "request", {
      origins: [originPatternFor(baseUrl)]
    })
  );
}
