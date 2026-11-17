import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { JiraClient } from "./lib/jira-client.js";
import { SettingsStore } from "./lib/settings-store.js";
import { TtlCache } from "./lib/cache.js";

function loadEnvironment() {
  try {
    process.loadEnvFile(".env");
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return false;
  }
}

async function readVersion(projectRoot) {
  try {
    const raw = await readFile(join(projectRoot, "package.json"), "utf8");
    return JSON.parse(raw).version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

async function main() {
  const envLoaded = loadEnvironment();
  const config = loadConfig();
  const version = await readVersion(config.projectRoot);

  const settingsStore = new SettingsStore({
    file: config.dataFile,
    defaults: config.jira.settings
  });

  const jira = new JiraClient({
    baseUrl: config.jira.baseUrl,
    authMode: config.jira.authMode,
    email: config.jira.email,
    token: config.jira.token,
    timeoutMs: config.jira.timeoutMs,
    retries: config.jira.retries
  });

  const cache = new TtlCache(config.cacheTtlMs);

  const app = createApp({
    config,
    jira,
    settingsStore,
    cache,
    version
  });

  const server = app.listen(config.port, config.host, () => {
    console.log(
      `🎄 Christmas Logistics Campus listening on http://${config.host}:${config.port}`
    );
    console.log(
      envLoaded ? "   .env loaded" : "   no .env file found (mock mode only)"
    );
    console.log(
      jira.configured
        ? `   Jira proxy ready for ${jira.site} (${jira.authMode} auth)`
        : "   Jira proxy disabled: set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN"
    );
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => process.exit(0));

    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
