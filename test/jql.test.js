import test from "node:test";
import assert from "node:assert/strict";
import { buildFields, buildJql, escapeJqlString } from "../server/lib/jql.js";

test("escapes quotes and backslashes", () => {
  assert.equal(escapeJqlString('a"b'), 'a\\"b');
  assert.equal(escapeJqlString("a\\b"), "a\\\\b");
  assert.equal(escapeJqlString("line\nbreak"), "line break");
});

test("builds project and label clauses", () => {
  assert.equal(
    buildJql({ projectKey: "DEMO", label: "christmas-2026" }),
    'project = "DEMO" AND labels = "christmas-2026" ORDER BY updated DESC'
  );
});

test("builds a key lookup without order clause", () => {
  assert.equal(buildJql({ issueKey: "DEMO-1" }), 'key = "DEMO-1"');
});

test("returns a plain ordered query without filters", () => {
  assert.equal(buildJql({}), "ORDER BY updated DESC");
});

test("blocks JQL injection through labels", () => {
  const jql = buildJql({ label: 'x" OR key = "DEMO-1' });

  assert.equal(
    jql,
    'labels = "x\\" OR key = \\"DEMO-1" ORDER BY updated DESC'
  );
});

test("requests only the fields the campus renders", () => {
  assert.equal(
    buildFields({ quantityField: "customfield_10042" }),
    "summary,status,labels,updated,priority,assignee,customfield_10042"
  );

  assert.equal(
    buildFields({}),
    "summary,status,labels,updated,priority,assignee"
  );
});
