import { Router } from "express";
import { buildFields, buildJql } from "../lib/jql.js";
import { toTicket } from "../lib/normalize.js";
import { HttpError, asyncHandler } from "../lib/http.js";
import { createStatusMapper, isCanonicalStatus } from "../lib/status.js";

const MAX_DESCRIPTION_LENGTH = 4000;

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "");
}

function readString(value, field, { max = 255, required = false } = {}) {
  const text = String(value ?? "").trim();

  if (required && !text) {
    throw new HttpError(400, `${field} is required`);
  }

  if (text.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters`);
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
    throw new HttpError(
      400,
      "issue key must look like PROJECT-123"
    );
  }

  return key.toUpperCase();
}

function readQuantity(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }

  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
    throw new HttpError(400, "quantity must be a positive number");
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

export function createApiRouter({ jira, settingsStore, cache, config, version }) {
  const router = Router();
  const mapStatus = createStatusMapper(config.jira.statusMap);

  async function currentSettings() {
    return settingsStore.read();
  }

  function normalizeOptions(settings, query = {}) {
    const quantityField = readString(
      query.quantityField ?? settings.quantityField,
      "quantityField",
      { max: 64 }
    );

    if (quantityField && !/^customfield_\d+$/.test(quantityField)) {
      throw new HttpError(
        400,
        "quantityField must look like customfield_12345"
      );
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

  function describeJira(settings) {
    return {
      configured: jira.configured,
      site: jira.site || null,
      authMode: jira.authMode,
      account: jira.email || null,
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
        createIssue: jira.configured,
        transitions: jira.configured,
        search: jira.configured
      }
    };
  }

  router.get(
    "/config",
    asyncHandler(async (req, res) => {
      const settings = await currentSettings();

      res.json({
        app: {
          name: "Christmas Logistics Campus",
          version,
          mode: config.isProduction ? "production" : "development"
        },
        jira: describeJira(settings)
      });
    })
  );

  router.put(
    "/config",
    asyncHandler(async (req, res) => {
      const patch = req.body || {};
      const allowed = [
        "label",
        "projectKey",
        "quantityField",
        "issueKey",
        "pollIntervalMs",
        "autoRefresh",
        "maxResults"
      ];

      const unknown = Object.keys(patch).filter(
        (key) => !allowed.includes(key)
      );

      if (unknown.length) {
        throw new HttpError(
          400,
          `Unknown settings: ${unknown.join(", ")}`
        );
      }

      const settings = await settingsStore.update(patch);
      cache.clear();

      res.json({ jira: describeJira(settings) });
    })
  );

  router.get(
    "/jira/connection",
    asyncHandler(async (req, res) => {
      if (!jira.configured) {
        throw new HttpError(
          503,
          "Jira is not configured on the server",
          "Copy .env.example to .env and set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN."
        );
      }

      const myself = await jira.getMyself();

      res.json({
        ok: true,
        site: jira.site,
        account: myself?.emailAddress || jira.email || null,
        displayName: myself?.displayName || null,
        authMode: jira.authMode
      });
    })
  );

  router.get(
    "/jira/projects",
    asyncHandler(async (req, res) => {
      const projects = await jira.getProjects();

      res.json({ projects });
    })
  );

  router.get(
    "/jira/tickets",
    asyncHandler(async (req, res) => {
      const settings = await currentSettings();
      const options = normalizeOptions(settings, req.query);
      const fields = buildFields(options);
      const jql = buildJql(options);
      const cacheKey = `${jql}|${fields}|${options.maxResults}`;
      const cached = cache.get(cacheKey);

      if (cached) {
        res.json({
          tickets: cached,
          meta: {
            count: cached.length,
            jql,
            cached: true,
            fetchedAt: new Date().toISOString()
          }
        });
        return;
      }

      let issues;

      if (options.issueKey) {
        const issue = await jira.getIssue(options.issueKey, fields);
        issues = [issue];
      } else {
        issues = await jira.search({
          jql,
          fields,
          maxResults: options.maxResults
        });
      }

      if (!Array.isArray(issues)) {
        issues = [];
      }

      const tickets = issues.map((issue) =>
        toTicket(issue, {
          mapStatus,
          quantityField: options.quantityField,
          label: options.label
        })
      );

      if (!options.issueKey) {
        cache.set(cacheKey, tickets);
      }

      res.json({
        tickets,
        meta: {
          count: tickets.length,
          jql,
          cached: false,
          fetchedAt: new Date().toISOString()
        }
      });
    })
  );

  router.get(
    "/jira/tickets/:key",
    asyncHandler(async (req, res) => {
      const settings = await currentSettings();
      const options = normalizeOptions(settings, req.query);
      const key = readIssueKey(req.params.key);

      const issue = await jira.getIssue(key, buildFields(options));

      res.json({
        ticket: toTicket(issue, {
          mapStatus,
          quantityField: options.quantityField,
          label: options.label
        })
      });
    })
  );

  router.post(
    "/jira/tickets",
    asyncHandler(async (req, res) => {
      const settings = await currentSettings();
      const body = req.body || {};

      const summary = readString(body.summary, "summary", {
        required: true,
        max: 254
      });

      const projectKey = readString(
        body.projectKey ?? settings.projectKey,
        "projectKey",
        { required: true, max: 32 }
      ).toUpperCase();

      const label = normalizeLabel(body.label ?? settings.label);
      const quantityField = readString(
        body.quantityField ?? settings.quantityField,
        "quantityField",
        { max: 64 }
      );
      const quantity = readQuantity(body.quantity);
      const description = readString(body.description, "description", {
        max: MAX_DESCRIPTION_LENGTH
      });
      const issueType = readString(
        body.issueType || config.jira.issueType || "Task",
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

      const created = await jira.createIssue(fields);
      const key = created?.key;

      if (!key) {
        throw new HttpError(502, "Jira did not return a ticket key");
      }

      const issue = await jira.getIssue(key, buildFields({ quantityField }));
      const ticket = toTicket(issue, {
        mapStatus,
        quantityField,
        label
      });

      cache.clear();

      res.status(201).json({ ticket, key });
    })
  );

  router.get(
    "/jira/tickets/:key/transitions",
    asyncHandler(async (req, res) => {
      const key = readIssueKey(req.params.key);

      const transitions = await jira.getTransitions(key);

      res.json({
        key,
        transitions: transitions.map((transition) => ({
          id: transition.id,
          name: transition.name,
          available: transition.isAvailable !== false,
          to: {
            name: transition.to?.name || null,
            status: mapStatus(transition.to?.name || transition.name)
          }
        }))
      });
    })
  );

  router.post(
    "/jira/tickets/:key/transitions",
    asyncHandler(async (req, res) => {
      const key = readIssueKey(req.params.key);

      const body = req.body || {};
      const targetStatus = body.targetStatus;
      const transitionId = body.transitionId
        ? String(body.transitionId)
        : null;

      if (!transitionId && !targetStatus) {
        throw new HttpError(
          400,
          "Either transitionId or targetStatus is required"
        );
      }

      if (targetStatus && !isCanonicalStatus(targetStatus)) {
        throw new HttpError(
          400,
          `targetStatus must be one of: To Do, In Progress, In Review, In Testing, Release, Released`
        );
      }

      const transitions = await jira.getTransitions(key);
      const transition = transitionId
        ? transitions.find((entry) => String(entry.id) === transitionId)
        : pickTransition(transitions, targetStatus, mapStatus);

      if (!transition) {
        throw new HttpError(
          409,
          `No available Jira transition leads to ${targetStatus || transitionId}`,
          transitions.map((entry) => ({
            id: entry.id,
            name: entry.name,
            to: entry.to?.name
          }))
        );
      }

      await jira.transition(key, { transitionId: transition.id });
      cache.clear();

      res.json({
        ok: true,
        key,
        transition: {
          id: transition.id,
          name: transition.name,
          to: transition.to?.name || null,
          status: mapStatus(transition.to?.name || transition.name)
        }
      });
    })
  );

  return router;
}
