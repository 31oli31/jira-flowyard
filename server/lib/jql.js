/*
 * JQL is built exclusively on the server. User supplied values are escaped and
 * never interpolated into anything but quoted string literals.
 */
export function escapeJqlString(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
}

export function buildJql({ projectKey, label, issueKey } = {}) {
  if (issueKey) {
    return `key = "${escapeJqlString(issueKey)}"`;
  }

  const clauses = [];

  if (projectKey) {
    clauses.push(`project = "${escapeJqlString(projectKey)}"`);
  }

  if (label) {
    clauses.push(`labels = "${escapeJqlString(label)}"`);
  }

  return `${clauses.join(" AND ")}${clauses.length ? " " : ""}ORDER BY updated DESC`;
}

export function buildFields({ quantityField } = {}) {
  return [
    "summary",
    "status",
    "labels",
    "updated",
    "priority",
    "assignee",
    quantityField
  ]
    .filter(Boolean)
    .join(",");
}
