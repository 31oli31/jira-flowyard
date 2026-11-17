import { createStatusMapper } from "./js/lib/status.js";
import { JiraClient, JiraError } from "./js/lib/jira-client.js";
import {
  readJiraConfig,
  writeJiraConfig,
  jiraDefaults,
  resolveAuthMode,
  hasOriginPermission,
  requestOriginPermission
} from "./js/lib/storage.js";

const $ = (selector) => document.querySelector(selector);

function parseStatusMap(raw) {
  if (!raw.trim()) {
    return {};
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Status map is not valid JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Status map must be a JSON object");
  }

  createStatusMapper(parsed);

  return parsed;
}

function readForm() {
  return {
    baseUrl: $("#jiraBaseUrl").value.trim().replace(/\/+$/, ""),
    authMode: $("#jiraAuthMode").value,
    email: $("#jiraEmail").value.trim(),
    token: $("#jiraToken").value,
    issueType: $("#jiraIssueType").value.trim() || "Task",
    statusMapRaw: $("#jiraStatusMap").value
  };
}

function applyForm(config) {
  $("#jiraBaseUrl").value = config.baseUrl || "";
  $("#jiraAuthMode").value = config.authMode || "auto";
  $("#jiraEmail").value = config.email || "";
  $("#jiraToken").value = config.token || "";
  $("#jiraIssueType").value = config.issueType || "Task";
  $("#jiraStatusMap").value =
    config.statusMap && Object.keys(config.statusMap).length
      ? JSON.stringify(config.statusMap, null, 0)
      : "";
}

function showError(message) {
  const box = $("#formError");

  box.textContent = message;
  box.hidden = false;
}

function hideError() {
  $("#formError").hidden = true;
}

function showResult(type, title, details = "") {
  const box = $("#connectionResult");

  box.className = `result ${type}`;
  $("#resultTitle").textContent = title;
  $("#resultDetails").textContent = details;
  box.hidden = false;
}

async function updatePermissionHint(baseUrl) {
  const hint = $("#permissionHint");

  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    hint.textContent =
      "Jira Cloud (…atlassian.net) and self-hosted Jira (Server/Data Center) are supported.";
    hint.className = "field-hint";
    return;
  }

  try {
    const granted = await hasOriginPermission(baseUrl);

    if (granted) {
      hint.textContent = `Access to ${new URL(baseUrl).host} is granted for this extension.`;
      hint.className = "field-hint ok";
    } else {
      hint.textContent = `Access to ${new URL(baseUrl).host} is still missing. Save while the URL is filled in to request it.`;
      hint.className = "field-hint warn";
    }
  } catch {
    hint.textContent = "Permission status could not be checked.";
    hint.className = "field-hint";
  }
}

async function saveConfig(event) {
  event.preventDefault();
  hideError();

  const form = readForm();
  let statusMap = {};

  try {
    statusMap = parseStatusMap(form.statusMapRaw);
  } catch (error) {
    showError(error.message);
    return;
  }

  if (form.baseUrl && !/^https?:\/\//i.test(form.baseUrl)) {
    showError("The Jira base URL must start with http:// or https://");
    return;
  }

  if (form.issueType.length > 64) {
    showError("Issue type must be at most 64 characters");
    return;
  }

  /*
   * chrome.permissions.request() only shows its prompt while a user gesture
   * is active, and Chrome does not carry gestures across awaits. Issue the
   * request synchronously — before any storage access — and await the result
   * later.
   */
  const permissionPromise = form.baseUrl
    ? requestOriginPermission(form.baseUrl).catch(() => false)
    : null;

  const current = await readJiraConfig();

  const next = {
    ...current,
    baseUrl: form.baseUrl,
    authMode: form.authMode,
    email: form.email,
    token: form.token || current.token,
    issueType: form.issueType,
    statusMap
  };

  await writeJiraConfig(next);

  if (permissionPromise) {
    const granted = await permissionPromise;

    if (!granted) {
      showResult(
        "error",
        "Saved, but host access was not granted",
        `The campus cannot reach ${new URL(form.baseUrl).host} without the host permission. Click Save again and confirm the browser prompt.`
      );
      await updatePermissionHint(form.baseUrl);
      return;
    }
  }

  showResult(
    "ok",
    form.baseUrl ? "Settings saved" : "Settings cleared",
    form.baseUrl
      ? `Credentials stored locally for ${new URL(form.baseUrl).host}`
      : "The campus will run in mock mode"
  );

  await updatePermissionHint(form.baseUrl);
}

async function testConnection() {
  hideError();

  const form = readForm();
  const baseUrl = form.baseUrl;

  if (!baseUrl) {
    showError("Enter a Jira base URL first.");
    return;
  }

  /*
   * Testing before saving is the common flow, so the test requests host
   * access as well. The request must start synchronously within the click
   * gesture — Chrome does not keep gestures alive across awaits.
   */
  const permissionPromise = requestOriginPermission(baseUrl).catch(
    () => false
  );

  const button = $("#testButton");

  button.disabled = true;
  button.textContent = "Testing…";
  showResult("", "Testing connection…", baseUrl);

  try {
    const granted = await permissionPromise;

    if (!granted) {
      showResult(
        "error",
        "Host access was not granted",
        `The browser denied access to ${new URL(baseUrl).host}. Click Test connection (or Save) again and confirm the prompt.`
      );
      await updatePermissionHint(baseUrl);
      return;
    }

    const stored = await readJiraConfig();
    const client = new JiraClient({
      baseUrl,
      authMode: form.authMode === "auto" ? resolveAuthMode({ ...stored, ...form, baseUrl }) : form.authMode,
      email: form.email,
      token: form.token || stored.token,
      timeoutMs: stored.timeoutMs,
      retries: 0
    });

    const myself = await client.getMyself();

    showResult(
      "ok",
      myself?.displayName
        ? `Connected as ${myself.displayName}`
        : "Connection OK",
      myself?.emailAddress || client.site
    );
  } catch (error) {
    let message =
      error instanceof JiraError ? error.message : String(error?.message || error);

    if (error instanceof JiraError && error.retryable) {
      message +=
        " — check the base URL; proxies and VPNs can also block the request.";
    }

    showResult("error", "Connection failed", message);
  } finally {
    button.disabled = false;
    button.textContent = "Test connection";
  }
}

async function resetConfig() {
  hideError();

  if (!window.confirm("Remove the stored Jira credentials and defaults?")) {
    return;
  }

  await writeJiraConfig(jiraDefaults());
  applyForm(jiraDefaults());

  showResult("ok", "Credentials removed", "The campus will run in mock mode");
  await updatePermissionHint("");
}

async function init() {
  $("#openCampus").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
  });

  $("#connectionForm").addEventListener("submit", saveConfig);
  $("#testButton").addEventListener("click", testConnection);
  $("#resetButton").addEventListener("click", resetConfig);

  $("#jiraBaseUrl").addEventListener("input", (event) => {
    updatePermissionHint(event.target.value.trim().replace(/\/+$/, ""));
  });

  const config = await readJiraConfig();

  applyForm(config);
  await updatePermissionHint(config.baseUrl);
}

init().catch((error) => {
  console.error(error);
  showError(String(error?.message || error));
});
