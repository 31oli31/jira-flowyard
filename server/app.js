import express from "express";
import { join } from "node:path";
import { createApiRouter } from "./routes/api.js";
import {
  createRateLimiter,
  errorHandler,
  notFound
} from "./lib/http.js";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    // The import map that resolves the bare "three" specifier is inline.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ")
};

export function createApp({
  config,
  jira,
  settingsStore,
  version = "1.0.0",
  logger = console,
  cache
}) {
  const app = express();

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set(SECURITY_HEADERS);
    next();
  });

  app.use(express.json({ limit: "64kb" }));

  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.info?.(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`
      );
    });

    next();
  });

  app.get(
    "/api/health",
    (req, res) => {
      res.json({
        status: "ok",
        version,
        uptimeSeconds: Math.round(process.uptime()),
        jiraConfigured: jira.configured
      });
    }
  );

  app.use(
    "/api",
    createRateLimiter(config.rateLimit),
    createApiRouter({ jira, settingsStore, cache, config, version })
  );

  app.use(
    "/vendor/three",
    express.static(config.vendorDir, {
      immutable: true,
      maxAge: "30d",
      fallthrough: false
    })
  );

  app.use(
    express.static(config.publicDir, {
      extensions: ["html"],
      maxAge: config.isProduction ? "1h" : 0,
      setHeaders(res, path) {
        if (path.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store");
        }
      }
    })
  );

  app.all("/api/*", notFound);

  app.get("*", (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }

    res.sendFile(join(config.publicDir, "index.html"));
  });

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
