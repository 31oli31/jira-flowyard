export class ApiError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  let response;

  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }

    throw new ApiError("The backend is unreachable. Is the server running?", {
      status: 0
    });
  }

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || `Request failed with HTTP ${response.status}`,
      {
        status: response.status,
        details: payload?.error?.details ?? null
      }
    );
  }

  return payload;
}

function query(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }

  const serialized = search.toString();

  return serialized ? `?${serialized}` : "";
}

export const api = {
  getConfig(signal) {
    return request("/api/config", { signal });
  },

  saveConfig(patch) {
    return request("/api/config", { method: "PUT", body: patch });
  },

  checkConnection() {
    return request("/api/jira/connection");
  },

  listProjects() {
    return request("/api/jira/projects");
  },

  listTickets(params, signal) {
    return request(`/api/jira/tickets${query(params)}`, { signal });
  },

  getTicket(key, params, signal) {
    return request(
      `/api/jira/tickets/${encodeURIComponent(key)}${query(params)}`,
      { signal }
    );
  },

  createTicket(ticket) {
    return request("/api/jira/tickets", { method: "POST", body: ticket });
  },

  getTransitions(key, signal) {
    return request(
      `/api/jira/tickets/${encodeURIComponent(key)}/transitions`,
      { signal }
    );
  },

  transition(key, payload) {
    return request(
      `/api/jira/tickets/${encodeURIComponent(key)}/transitions`,
      { method: "POST", body: payload }
    );
  }
};
