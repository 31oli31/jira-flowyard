import { JiraError } from "./jira-client.js";
import { SettingsValidationError } from "./settings-store.js";

export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFound(req, res) {
  res.status(404).json({
    error: {
      message: "Not found"
    }
  });
}

export function errorHandler(logger = console) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    let status = 500;
    let message = "Unexpected server error";
    let details = null;

    if (error instanceof JiraError) {
      status = error.status;
      message = error.message;
      details = error.details;

      if (status === 502 && /HTTP 401|HTTP 403/.test(message)) {
        message =
          "Jira rejected the configured credentials. Check JIRA_EMAIL and JIRA_API_TOKEN.";
      }
    } else if (error instanceof SettingsValidationError) {
      status = 400;
      message = error.message;
      details = error.field;
    } else if (error instanceof HttpError) {
      status = error.status;
      message = error.message;
      details = error.details;
    } else if (error.type === "entity.parse.failed") {
      status = 400;
      message = "Request body must be valid JSON";
    } else if (error.type === "entity.too.large") {
      status = 413;
      message = "Request body is too large";
    } else if (error.message) {
      message = error.message;
    }

    if (status >= 500) {
      logger.error?.(`${req.method} ${req.originalUrl} failed:`, error);
    }

    res.status(status).json({
      error: {
        message,
        details
      }
    });
  };
}

export function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();

  const timer = setInterval(() => {
    const now = Date.now();

    for (const [key, bucket] of buckets) {
      if (now - bucket.startedAt > windowMs) {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 30_000));

  timer.unref?.();

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.startedAt > windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      next();
      return;
    }

    bucket.count++;

    if (bucket.count > max) {
      res.status(429).json({
        error: {
          message: "Too many API requests. Try again shortly."
        }
      });
      return;
    }

    next();
  };
}
