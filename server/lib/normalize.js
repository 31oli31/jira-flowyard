function readQuantity(fields, quantityField) {
  if (!quantityField) {
    return 1;
  }

  const raw = fields[quantityField];

  if (raw === null || raw === undefined) {
    return 1;
  }

  if (typeof raw === "object") {
    const candidate = raw.value ?? raw.number ?? raw.id;
    const parsed = Number(candidate);

    return Number.isFinite(parsed) ? parsed : 1;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : 1;
}

export function toTicket(issue, { mapStatus, quantityField, label } = {}) {
  const fields = issue?.fields || {};
  const labels = Array.isArray(fields.labels) ? fields.labels : [];
  const jiraStatus = fields.status?.name || "Unknown";

  return {
    id: issue?.key || String(issue?.id ?? "unknown"),
    title: fields.summary || issue?.key || "Jira issue",
    status: mapStatus ? mapStatus(jiraStatus) : jiraStatus,
    jiraStatus,
    quantity: readQuantity(fields, quantityField),
    tag: labels.length
      ? `#${labels[0]}`
      : label
        ? `#${label}`
        : "#jira",
    labels,
    updated: fields.updated || null,
    priority: fields.priority?.name || "None",
    assignee: fields.assignee?.displayName || "Unassigned",
    issueType: fields.issuetype?.name || "Task"
  };
}
