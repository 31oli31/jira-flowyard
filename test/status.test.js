import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_STATUSES,
  createStatusMapper,
  mapJiraStatus
} from "../server/lib/status.js";

test("canonical statuses are the four conveyor lanes", () => {
  assert.deepEqual(CANONICAL_STATUSES, [
    "To Do",
    "In Progress",
    "In Review",
    "In Testing"
  ]);
});

test("maps common Jira workflow names", () => {
  assert.equal(mapJiraStatus("To Do"), "To Do");
  assert.equal(mapJiraStatus("Backlog"), "To Do");
  assert.equal(mapJiraStatus("In Progress"), "In Progress");
  assert.equal(mapJiraStatus("In Code Review"), "In Review");
  assert.equal(mapJiraStatus("Code Reviewed"), "In Testing");
  assert.equal(mapJiraStatus("In Test PM"), "In Testing");
  assert.equal(mapJiraStatus("Ready For Release"), "Release");
  assert.equal(mapJiraStatus("Resolved"), "Released");
  assert.equal(mapJiraStatus("Closed"), "Released");
});

test("unknown and empty statuses fall back to To Do", () => {
  assert.equal(mapJiraStatus("Some Brand New State"), "To Do");
  assert.equal(mapJiraStatus(""), "To Do");
  assert.equal(mapJiraStatus(null), "To Do");
});

test("supports per-instance overrides", () => {
  const mapper = createStatusMapper({ "Peer Review": "In Review" });

  assert.equal(mapper("peer review"), "In Review");
  assert.equal(mapper("Peer Review"), "In Review");
  assert.equal(mapper("In Progress"), "In Progress");
});

test("rejects unknown override targets", () => {
  assert.throws(
    () => createStatusMapper({ Anything: "Nope" }),
    /Unknown canonical status/
  );
});
