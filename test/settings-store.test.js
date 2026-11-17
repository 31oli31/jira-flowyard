import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultSettings,
  pickSettings,
  SettingsStore,
  SettingsValidationError
} from "../server/lib/settings-store.js";

test("default settings mirror the environment defaults", () => {
  const settings = defaultSettings({ label: "christmas-2026" });

  assert.equal(settings.label, "christmas-2026");
  assert.equal(settings.pollIntervalMs, 15000);
  assert.equal(settings.autoRefresh, true);
});

test("project keys are upper-cased and trimmed", () => {
  const settings = pickSettings({ projectKey: " demo ", label: "#jira" });

  assert.equal(settings.projectKey, "DEMO");
  assert.equal(settings.label, "#jira");
});

test("invalid values are rejected", () => {
  assert.throws(
    () => pickSettings({ pollIntervalMs: 100 }),
    SettingsValidationError
  );
  assert.throws(
    () => pickSettings({ quantityField: "summary" }),
    /customfield/
  );
  assert.throws(
    () => pickSettings({ autoRefresh: "yes" }),
    /boolean/
  );
});

test("empty values reset to defaults", () => {
  const settings = pickSettings(
    { label: "" },
    { label: "christmas-2026", projectKey: "DEMO" }
  );

  assert.equal(settings.label, "");
  assert.equal(settings.projectKey, "DEMO");
});

test("store persists settings atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "campus-settings-"));
  const file = join(directory, "settings.json");
  const store = new SettingsStore({ file, defaults: { label: "initial" } });

  assert.equal((await store.read()).label, "initial");

  const updated = await store.update({ label: "release", maxResults: 50 });
  assert.equal(updated.label, "release");

  const raw = JSON.parse(await readFile(file, "utf8"));
  assert.equal(raw.label, "release");
  assert.equal(raw.maxResults, 50);

  const reopened = new SettingsStore({ file });
  assert.equal((await reopened.read()).label, "release");
});

test("store survives a corrupted settings file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "campus-settings-"));
  const file = join(directory, "settings.json");
  await writeFile(file, "{not json");

  const store = new SettingsStore({ file, defaults: { label: "fallback" } });

  assert.equal((await store.read()).label, "fallback");
});
