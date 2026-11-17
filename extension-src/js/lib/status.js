export const CANONICAL_STATUSES = [
  "To Do",
  "In Progress",
  "In Review",
  "In Testing"
];

/*
 * Jira workflows are configured per project, so status names differ between
 * teams. Every workflow state is folded into one of the four conveyor lanes,
 * "Release" or "Released". Overrides can be supplied through the extension
 * options as a JSON object: { "Peer Review": "In Review" }.
 *
 * Mirrors server/lib/status.js.
 */
const STATUS_ALIASES = {
  "To Do": [
    "to do",
    "todo",
    "open",
    "backlog",
    "new",
    "selected for development",
    "ready",
    "draft",
    "prioritize",
    "to do tv",
    "in concept"
  ],
  "In Progress": [
    "in progress",
    "progress",
    "development",
    "implementing",
    "in development",
    "doing",
    "coding"
  ],
  "In Review": [
    "in review",
    "review",
    "code review",
    "peer review",
    "pull request",
    "pr review",
    "in code review",
    "feedback"
  ],
  "In Testing": [
    "in testing",
    "testing",
    "qa",
    "quality assurance",
    "in qa",
    "verification",
    "test",
    "code reviewed",
    "ready for integration",
    "in test pm",
    "ready for testing"
  ],
  Release: [
    "release",
    "ready for release",
    "ready to release",
    "ready for deploy",
    "ready for deployment"
  ],
  Released: [
    "released",
    "done",
    "closed",
    "deployed",
    "resolved",
    "completed"
  ]
};

const ALIAS_LOOKUP = new Map(
  Object.entries(STATUS_ALIASES).flatMap(([target, aliases]) =>
    aliases.map((alias) => [alias, target])
  )
);

export function createStatusMapper(overrides = {}) {
  const normalizedOverrides = new Map();

  for (const [statusName, target] of Object.entries(overrides)) {
    const canonical = resolveCanonical(target);

    if (!canonical) {
      throw new Error(`Unknown canonical status in status map: ${target}`);
    }

    normalizedOverrides.set(statusName.trim().toLowerCase(), canonical);
  }

  function resolveStatus(value) {
    const status = String(value ?? "").trim().toLowerCase();

    if (!status) {
      return null;
    }

    return normalizedOverrides.get(status) || ALIAS_LOOKUP.get(status) || null;
  }

  function mapJiraStatus(value) {
    return resolveStatus(value) || "To Do";
  }

  mapJiraStatus.resolve = resolveStatus;

  return mapJiraStatus;
}

function resolveCanonical(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const direct = [...CANONICAL_STATUSES, "Release", "Released"].find(
    (status) => status.toLowerCase() === normalized
  );

  return direct || ALIAS_LOOKUP.get(normalized) || null;
}

export const mapJiraStatus = createStatusMapper();

export function isCanonicalStatus(value) {
  return (
    CANONICAL_STATUSES.includes(value) ||
    value === "Release" ||
    value === "Released"
  );
}
