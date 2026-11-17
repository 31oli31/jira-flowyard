/*
 * Settings validation for the extension. Mirrors the schema and semantics of
 * server/lib/settings-store.js, but persists through chrome.storage.local
 * instead of a JSON file.
 */
import { readSettingsRaw, writeStorage } from "./storage.js";

const SETTINGS_KEY = "settings";

export const SETTINGS_SCHEMA = {
  label: { type: "string", maxLength: 255, default: "" },
  projectKey: {
    type: "string",
    maxLength: 32,
    default: "",
    transform: (value) => value.toUpperCase()
  },
  quantityField: {
    type: "string",
    maxLength: 64,
    default: "",
    pattern: /^(customfield_\d+)?$/
  },
  issueKey: { type: "string", maxLength: 64, default: "" },
  pollIntervalMs: {
    type: "number",
    default: 15000,
    min: 5000,
    max: 300000
  },
  autoRefresh: { type: "boolean", default: true },
  maxResults: { type: "number", default: 200, min: 10, max: 500 }
};

export class SettingsValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "SettingsValidationError";
    this.field = field;
  }
}

export function pickSettings(input = {}, current = {}) {
  const result = {};

  for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
    if (!(key in input)) {
      continue;
    }

    let value = input[key];

    if (value === null || value === undefined || value === "") {
      result[key] = schema.default;
      continue;
    }

    if (schema.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new SettingsValidationError(`${key} must be a boolean`, key);
      }
    }

    if (schema.type === "number") {
      const parsed = Number(value);

      if (!Number.isFinite(parsed)) {
        throw new SettingsValidationError(`${key} must be a number`, key);
      }

      if (parsed < schema.min || parsed > schema.max) {
        throw new SettingsValidationError(
          `${key} must be between ${schema.min} and ${schema.max}`,
          key
        );
      }

      value = Math.round(parsed);
    }

    if (schema.type === "string") {
      if (typeof value !== "string") {
        throw new SettingsValidationError(`${key} must be a string`, key);
      }

      value = value.trim();

      if (value.length > schema.maxLength) {
        throw new SettingsValidationError(`${key} is too long`, key);
      }

      if (schema.pattern && value && !schema.pattern.test(value)) {
        throw new SettingsValidationError(
          `${key} must look like customfield_12345`,
          key
        );
      }

      value = schema.transform ? schema.transform(value) : value;
    }

    result[key] = value;
  }

  return { ...current, ...result };
}

export function defaultSettings(overrides = {}) {
  const defaults = Object.fromEntries(
    Object.entries(SETTINGS_SCHEMA).map(([key, schema]) => [
      key,
      schema.default
    ])
  );

  return pickSettings({ ...defaults, ...overrides }, defaults);
}

/*
 * Corrupt or partial stored settings fall back to the defaults, exactly like
 * an unreadable settings file on the server.
 */
export async function readSettings() {
  const base = defaultSettings();

  try {
    const raw = await readSettingsRaw();

    if (!raw || typeof raw !== "object") {
      return base;
    }

    return pickSettings(raw, base);
  } catch {
    return base;
  }
}

export async function updateSettings(patch) {
  const current = await readSettings();
  const next = pickSettings(patch, current);

  await writeStorage({ [SETTINGS_KEY]: next });

  return { ...next };
}
