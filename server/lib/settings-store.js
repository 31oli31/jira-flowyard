import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
    this.status = 400;
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
      result[key] = schema.type === "number" ? schema.default : schema.default;
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

export class SettingsStore {
  #file;
  #defaults;
  #cache = null;
  #writeQueue = Promise.resolve();

  constructor({ file, defaults = {} }) {
    this.#file = file;
    this.#defaults = defaultSettings(defaults);
  }

  get defaults() {
    return { ...this.#defaults };
  }

  async read() {
    if (this.#cache) {
      return { ...this.#cache };
    }

    try {
      const raw = await readFile(this.#file, "utf8");
      const parsed = JSON.parse(raw);
      this.#cache = pickSettings(parsed, this.#defaults);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`Settings file ${this.#file} is unreadable: ${error.message}`);
      }

      this.#cache = { ...this.#defaults };
    }

    return { ...this.#cache };
  }

  async update(patch) {
    const current = await this.read();
    const next = pickSettings(patch, current);

    this.#cache = next;
    this.#writeQueue = this.#writeQueue.then(() => this.#persist(next));

    await this.#writeQueue;

    return { ...next };
  }

  async #persist(settings) {
    await mkdir(dirname(this.#file), { recursive: true });

    const temporary = `${this.#file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporary, this.#file);
  }
}
