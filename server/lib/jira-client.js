const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const DEFAULT_RETRIES = 2;

export class JiraError extends Error {
  constructor(message, { status = 502, details = null, retryable = false } = {}) {
    super(message);
    this.name = "JiraError";
    this.status = status;
    this.details = details;
    this.retryable = retryable;
  }
}

function basicAuthHeader(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 8000);
  }

  return Math.min(400 * 2 ** attempt, 4000);
}

function extractErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if (Array.isArray(payload.errorMessages) && payload.errorMessages.length) {
    return payload.errorMessages.join(" · ");
  }

  if (payload.message) {
    return String(payload.message);
  }

  if (payload.errors && typeof payload.errors === "object") {
    const joined = Object.entries(payload.errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(" · ");

    if (joined) {
      return joined;
    }
  }

  return fallback;
}

export class JiraClient {
  constructor({
    baseUrl,
    authMode = "basic",
    email = "",
    token = "",
    timeoutMs = 12000,
    retries = DEFAULT_RETRIES,
    fetchImpl = globalThis.fetch
  }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.authMode = authMode;
    this.email = email;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.fetchImpl = fetchImpl;
  }

  get configured() {
    if (!this.baseUrl) {
      return false;
    }

    if (this.authMode === "basic") {
      return Boolean(this.email && this.token);
    }

    if (this.authMode === "bearer") {
      return Boolean(this.token);
    }

    return true;
  }

  get site() {
    return this.baseUrl;
  }

  headers() {
    const headers = {
      Accept: "application/json",
      "User-Agent": "jira-flowyard/1.0"
    };

    if (this.authMode === "basic" && this.email && this.token) {
      headers.Authorization = basicAuthHeader(this.email, this.token);
    }

    if (this.authMode === "bearer" && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  async request(path, { method = "GET", query, body, signal } = {}) {
    if (!this.configured) {
      throw new JiraError("Jira is not configured on the server", {
        status: 503,
        details: "Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env"
      });
    }

    const url = new URL(`${this.baseUrl}${path}`);

    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    let lastError = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const combined = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;

      let response;

      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            ...this.headers(),
            ...(body === undefined ? {} : { "Content-Type": "application/json" })
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: combined
        });
      } catch (error) {
        if (error.name === "AbortError" || signal?.aborted) {
          throw new JiraError("Jira request was cancelled", { status: 499 });
        }

        lastError = new JiraError(
          error.name === "TimeoutError"
            ? `Jira did not respond within ${this.timeoutMs} ms`
            : `Jira is unreachable: ${error.message}`,
          { status: 502, retryable: true }
        );

        if (attempt < this.retries) {
          await sleep(retryDelay(attempt));
          continue;
        }

        throw lastError;
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.retries) {
        await sleep(retryDelay(attempt, response.headers.get("retry-after")));
        continue;
      }

      const text = await response.text();
      let payload = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }

      if (!response.ok) {
        throw new JiraError(
          extractErrorMessage(
            payload,
            `Jira responded with HTTP ${response.status}`
          ),
          {
            status:
              response.status === 401 || response.status === 403
                ? 502
                : response.status === 404
                  ? 404
                  : response.status === 400
                    ? 400
                    : 502,
            details: typeof payload === "string" ? payload.slice(0, 500) : payload
          }
        );
      }

      return payload;
    }

    throw lastError || new JiraError("Jira request failed");
  }

  async getMyself() {
    return this.request("/rest/api/3/myself");
  }

  async getIssue(issueKey, fields) {
    return this.request(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      query: { fields }
    });
  }

  /*
   * The enhanced search endpoint pages with nextPageToken. Older Jira
   * installations and some proxies still expose /search with startAt, so a
   * fallback keeps the integration usable on self-hosted instances.
   */
  async search({ jql, fields, maxResults = 200, signal } = {}) {
    try {
      return await this.#searchWithToken({ jql, fields, maxResults, signal });
    } catch (error) {
      const fallbackable =
        !(error instanceof JiraError) ||
        [400, 404, 405, 410].includes(error.status);

      if (!fallbackable) {
        throw error;
      }

      return this.#searchWithOffset({ jql, fields, maxResults, signal });
    }
  }

  async #searchWithToken({ jql, fields, maxResults, signal }) {
    const issues = [];
    let nextPageToken = null;
    let pages = 0;

    do {
      const payload = await this.request("/rest/api/3/search/jql", {
        query: {
          jql,
          fields,
          maxResults: Math.min(100, maxResults - issues.length),
          nextPageToken
        },
        signal
      });

      if (Array.isArray(payload?.issues)) {
        issues.push(...payload.issues);
      }

      nextPageToken =
        payload?.isLast === true ? null : payload?.nextPageToken || null;
      pages++;
    } while (nextPageToken && issues.length < maxResults && pages < 50);

    return issues.slice(0, maxResults);
  }

  async #searchWithOffset({ jql, fields, maxResults, signal }) {
    const issues = [];
    let startAt = 0;
    let pages = 0;

    while (issues.length < maxResults && pages < 50) {
      const payload = await this.request("/rest/api/3/search", {
        query: {
          jql,
          fields,
          startAt,
          maxResults: Math.min(100, maxResults - issues.length)
        },
        signal
      });

      if (!Array.isArray(payload?.issues) || payload.issues.length === 0) {
        break;
      }

      issues.push(...payload.issues);
      startAt += payload.issues.length;
      pages++;

      if (
        typeof payload.total === "number" &&
        startAt >= payload.total
      ) {
        break;
      }
    }

    return issues.slice(0, maxResults);
  }

  async getProjects(limit = 100) {
    const payload = await this.request("/rest/api/3/project/search", {
      query: { maxResults: limit, orderBy: "name" }
    });

    return (payload?.values || []).map((project) => ({
      key: project.key,
      name: project.name
    }));
  }

  async getTransitions(issueKey) {
    const payload = await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`
    );

    return Array.isArray(payload?.transitions) ? payload.transitions : [];
  }

  async transition(issueKey, { transitionId, fields }) {
    await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        method: "POST",
        body: { transition: { id: String(transitionId) }, ...(fields ? { fields } : {}) }
      }
    );
  }

  async createIssue(fields) {
    return this.request("/rest/api/3/issue", {
      method: "POST",
      body: { fields }
    });
  }
}
