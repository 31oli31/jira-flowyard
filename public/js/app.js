import { campus } from "./engine.js";
import { api } from "./api.js";

const THEME_KEY = "jira-logistics-campus-theme";
const PANEL_KEY = "jira-logistics-campus-panel";
const STATUSES = campus.STATUSES;
const TRANSITION_CACHE_TTL_MS = 30_000;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  dataMode: "mock",
  config: null,
  settings: {
    label: "",
    projectKey: "",
    quantityField: "",
    issueKey: "",
    pollIntervalMs: 15_000,
    autoRefresh: true,
    maxResults: 200
  },
  pollTimer: null,
  requestController: null,
  requestRunning: false,
  syncQueued: false,
  busy: false,
  pendingRelease: null,
  transitions: new Map(),
  saveTimer: null,
  lastSyncError: null,
  panelOpen: false,
  packageDrawerOpen: false,
  packageQuery: "",
  packageFilter: "all",
  loading: false,
  syncBannerDismissed: false,
  syncBannerDismissedText: "",
  urlWritesEnabled: false,
  lastSyncText: "",
  demoRunning: false
};

/* ------------------------------------------------------------------
 * Formatting helpers
 * ------------------------------------------------------------------ */

function normalizeTag(value) {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "");
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function describeError(error) {
  const message = error?.message || "Unknown error";
  const details = error?.details;

  if (!details) {
    return message;
  }

  if (Array.isArray(details)) {
    const names = details
      .map((entry) => entry?.name || entry)
      .filter(Boolean)
      .slice(0, 6)
      .join(", ");

    return names ? `${message} (${names})` : message;
  }

  if (typeof details === "string") {
    return `${message} — ${details}`;
  }

  return message;
}

function notify({ type = "info", title, message = "", timeout = 6500 }) {
  const container = $("#toasts");
  const element = document.createElement("div");

  element.className = `toast ${type}`;

  const heading = document.createElement("strong");
  heading.textContent = title;
  element.append(heading);

  if (message) {
    const detail = document.createElement("small");
    detail.textContent = message;
    element.append(detail);
  }

  element.addEventListener("click", () => element.remove());
  container.append(element);

  while (container.children.length > 3) {
    container.firstElementChild.remove();
  }

  if (timeout) {
    window.setTimeout(() => element.remove(), timeout);
  }
}

/* ------------------------------------------------------------------
 * Theme
 * ------------------------------------------------------------------ */

const THEME_UI = {
  corporate: {
    title: "Global Logistics Campus",
    subtitle: "Corporate Zone A · Jira Logistics",
    brandIcon: "🏭",
    packageIcon: "📦",
    shipmentIcon: "🚚",
    packageKpiIcon: "📦",
    progressKpiIcon: "🚚",
    deliveredKpiIcon: "✅",
    inProgressLabel: "In progress",
    releaseLabel: "🚜 Release & start transport",
    hallLabel: "OPEN MAIN HALL",
    depotLabel: "CENTRAL LIVE DEPOT",
    documentTitle: "Global Logistics Campus · Jira"
  },

  christmas: {
    title: "Christmas Logistics Campus",
    subtitle: "North Pole Workshop · Jira Gift Sync",
    brandIcon: "🎄",
    packageIcon: "🎁",
    shipmentIcon: "🛷",
    packageKpiIcon: "🎁",
    progressKpiIcon: "🛷",
    deliveredKpiIcon: "🎅",
    inProgressLabel: "Gifts in transit",
    releaseLabel: "🛷 Release & start sleigh",
    hallLabel: "CHRISTMAS WORKSHOP",
    depotLabel: "NORTH POLE GIFT DEPOT",
    documentTitle: "Christmas Logistics Campus · Jira"
  },

  halloween: {
    title: "Halloween Logistics Campus",
    subtitle: "Pumpkin Yard · Jira Trick-or-Treat Sync",
    brandIcon: "🎃",
    packageIcon: "🍬",
    shipmentIcon: "🚚",
    packageKpiIcon: "🍬",
    progressKpiIcon: "🦇",
    deliveredKpiIcon: "🎃",
    inProgressLabel: "Hauled tonight",
    releaseLabel: "🚚 Release & start transport",
    hallLabel: "PUMPKIN WORKSHOP",
    depotLabel: "SPOOKY GIFT DEPOT",
    documentTitle: "Halloween Logistics Campus · Jira"
  },

  summer: {
    title: "Summer Logistics Campus",
    subtitle: "Harbour Bay · Jira Holiday Sync",
    brandIcon: "🏖",
    packageIcon: "🧳",
    shipmentIcon: "🚚",
    packageKpiIcon: "🧳",
    progressKpiIcon: "🌴",
    deliveredKpiIcon: "🌞",
    inProgressLabel: "On the road",
    releaseLabel: "🚚 Release & start transport",
    hallLabel: "HARBOUR WORKSHOP",
    depotLabel: "BEACH DEPOT",
    documentTitle: "Summer Logistics Campus · Jira"
  },

  neon: {
    title: "Night Shift Campus",
    subtitle: "Sector 7 · Jira After Dark",
    brandIcon: "🌃",
    packageIcon: "📦",
    shipmentIcon: "🚚",
    packageKpiIcon: "📦",
    progressKpiIcon: "⚡",
    deliveredKpiIcon: "🛰",
    inProgressLabel: "In transit",
    releaseLabel: "🚚 Release & start transport",
    hallLabel: "NIGHT WORKSHOP",
    depotLabel: "NEON DEPOT",
    documentTitle: "Night Shift Campus · Jira"
  }
};

function themeUi(theme) {
  return THEME_UI[theme] || THEME_UI.corporate;
}

function applyThemeUI(theme) {
  const christmas = theme === "christmas";
  const ui = themeUi(theme);

  document.body.classList.toggle("christmas", christmas);
  document.body.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;

  updateThemeButton(theme);

  $("#brandIcon").textContent = ui.brandIcon;
  $("#campusTitle").textContent = ui.title;
  $("#campusSubtitle").textContent = ui.subtitle;
  $("#packageKpiIcon").textContent = ui.packageKpiIcon;
  $("#inProgressKpiIcon").textContent = ui.progressKpiIcon;
  $("#deliveredKpiIcon").textContent = ui.deliveredKpiIcon;
  $("#inProgressKpiLabel").textContent = ui.inProgressLabel;
  $("#shipmentIcon").textContent = ui.shipmentIcon;
  $("#packageIcon").textContent = ui.packageIcon;
  $("#releaseButton").textContent = ui.releaseLabel;
  $("#hallLabel").textContent = ui.hallLabel;
  $("#depotLabel").textContent = ui.depotLabel;
  document.title = ui.documentTitle;

  localStorage.setItem(THEME_KEY, theme);
  writeThemeToUrl(theme);
}

function restoreTheme() {
  const fromUrl = urlTheme();
  const saved = localStorage.getItem(THEME_KEY);
  const theme =
    fromUrl || (VALID_THEMES.has(saved) ? saved : "corporate");

  campus.setTheme(theme);
}

/* ------------------------------------------------------------------
 * URL state (theme + deep links)
 * ------------------------------------------------------------------ */

const VALID_THEMES = new Set(campus.getThemes().map((theme) => theme.id));
const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

function urlTheme() {
  const value = new URLSearchParams(window.location.search).get("theme");

  return VALID_THEMES.has(value) ? value : null;
}

function writeThemeToUrl(theme) {
  const url = new URL(window.location.href);

  if (theme && theme !== "corporate") {
    url.searchParams.set("theme", theme);
  } else {
    url.searchParams.delete("theme");
  }

  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/* ------------------------------------------------------------------
 * Theme picker
 * ------------------------------------------------------------------ */

function renderThemeMenu() {
  const menu = $("#themeMenu");

  menu.replaceChildren();

  campus.getThemes().forEach((theme) => {
    const option = document.createElement("button");
    const icon = document.createElement("span");
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    const hint = document.createElement("small");

    option.type = "button";
    option.className = "theme-option";
    option.dataset.theme = theme.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(theme.id === campus.getTheme()));

    icon.className = "theme-option-icon";
    icon.textContent = theme.icon;

    copy.className = "theme-option-copy";
    label.textContent = theme.label;
    hint.textContent = theme.hint;

    copy.append(label, hint);
    option.append(icon, copy);

    option.addEventListener("click", () => {
      campus.setTheme(theme.id);
      setThemeMenuOpen(false, { restoreFocus: true });
    });

    menu.append(option);
  });
}

function updateThemeButton(theme) {
  const meta =
    campus.getThemes().find((entry) => entry.id === theme) ||
    campus.getThemes()[0];

  $("#themeButtonIcon").textContent = meta.icon;
  $("#themeButtonLabel").textContent = meta.label;
  $("#themeButton").title = `Campus theme: ${meta.label}`;

  $$("#themeMenu .theme-option").forEach((option) => {
    option.setAttribute(
      "aria-selected",
      String(option.dataset.theme === theme)
    );
  });
}

function setThemeMenuOpen(open, { restoreFocus = false } = {}) {
  const menu = $("#themeMenu");
  const button = $("#themeButton");

  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));

  if (open) {
    const selected = menu.querySelector('[aria-selected="true"]');

    (selected || menu.firstElementChild)?.focus();
  } else if (restoreFocus) {
    button.focus();
  }
}

function moveThemeMenuFocus(event) {
  const items = $$("#themeMenu .theme-option");

  if (!items.length) {
    return;
  }

  const current = items.indexOf(document.activeElement);
  let next = current;

  if (event.key === "Home") {
    next = 0;
  } else if (event.key === "End") {
    next = items.length - 1;
  } else if (event.key === "ArrowDown") {
    next = current < 0 ? 0 : (current + 1) % items.length;
  } else {
    next = current <= 0 ? items.length - 1 : current - 1;
  }

  event.preventDefault();
  items[next]?.focus();
}

/* ------------------------------------------------------------------
 * Animation mode
 * ------------------------------------------------------------------ */

function setAnimateButton(running) {
  const button = $("#animateToggle");

  button.setAttribute("aria-pressed", String(running));
  button.title = running
    ? "Stop the animated parcel flow (A)"
    : "Start the animated parcel flow (A)";
  button.setAttribute("aria-label", running ? "Stop animation" : "Start animation");

  $("#animateIcon").textContent = running ? "❚❚" : "▶";
  $("#animateLabel").textContent = running ? "Stop" : "Animate";
}

function updateChaseButton(active) {
  const button = $("#chaseCamera");

  button.setAttribute("aria-pressed", String(Boolean(active)));
  button.title = active
    ? "Back to the overview (C) – double-click the scene to recenter the head"
    : "Driver's view / cockpit (C) – drag in the scene to look around";
}

function toggleAnimate() {
  if (campus.isDemoRunning()) {
    campus.stopDemo();
    return;
  }

  if (state.dataMode === "live") {
    notify({
      type: "info",
      title: "Animation is a mock demo",
      message: "Switch to the mock workspace to watch parcels and trucks move.",
      timeout: 4500
    });
    return;
  }

  campus.startDemo();
}

function ticketKeyFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("ticket");

  if (param && TICKET_KEY_PATTERN.test(param.trim())) {
    return param.trim().toUpperCase();
  }

  const hash = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();

  if (hash && TICKET_KEY_PATTERN.test(hash)) {
    return hash.toUpperCase();
  }

  return null;
}

function writeSelectionToUrl(ticket) {
  if (!state.urlWritesEnabled) {
    return;
  }

  const url = new URL(window.location.href);

  url.searchParams.delete("ticket");

  if (ticket) {
    url.hash = ticket.id;
  } else if (TICKET_KEY_PATTERN.test(url.hash.slice(1))) {
    url.hash = "";
  }

  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function selectTicketFromUrl({ focus = true } = {}) {
  const key = ticketKeyFromUrl();

  if (!key) {
    return false;
  }

  const ticket = campus
    .getTickets()
    .find((entry) => entry.id.toUpperCase() === key);

  if (!ticket) {
    return false;
  }

  campus.setSelected(ticket);

  if (focus) {
    campus.focusSelected();
  }

  setPanelOpen(true);

  return true;
}

function handleHashChange() {
  const key = ticketKeyFromUrl();

  if (!key) {
    return;
  }

  const ticket = campus
    .getTickets()
    .find((entry) => entry.id.toUpperCase() === key);

  if (ticket && campus.getSelectedTicket()?.id !== ticket.id) {
    selectTicketFromUrl();
  }
}

function trapFocus(container, event) {
  if (event.key !== "Tab") {
    return;
  }

  const focusable = [
    ...container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ].filter((element) => element.offsetParent !== null);

  if (!focusable.length) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ------------------------------------------------------------------
 * Collapsible panels
 * ------------------------------------------------------------------ */

function isTypingTarget(target) {
  const tag = target?.tagName;

  return (
    tag === "INPUT" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    target?.isContentEditable === true
  );
}

function setPanelOpen(open, { persist = true } = {}) {
  state.panelOpen = Boolean(open);

  document.body.classList.toggle("panel-closed", !state.panelOpen);

  const toggle = $("#panelToggle");

  toggle.setAttribute("aria-expanded", String(state.panelOpen));
  toggle.title = state.panelOpen
    ? "Hide details panel (P)"
    : "Show details panel (P)";

  if (persist) {
    localStorage.setItem(PANEL_KEY, state.panelOpen ? "open" : "closed");
  }
}

function restorePanelState() {
  setPanelOpen(localStorage.getItem(PANEL_KEY) === "open", {
    persist: false
  });
}

function setSettingsOpen(open) {
  const drawer = $("#settingsDrawer");
  const backdrop = $("#settingsBackdrop");
  const button = $("#openSettings");

  drawer.hidden = !open;
  backdrop.hidden = !open;
  button.setAttribute("aria-expanded", String(open));

  if (open) {
    $("#closeSettings").focus({ preventScroll: true });
  } else if (drawer.dataset.wasOpen === "true") {
    button.focus({ preventScroll: true });
  }

  drawer.dataset.wasOpen = String(open);
}

/* ------------------------------------------------------------------
 * Package context menu
 * ------------------------------------------------------------------ */

const STATUS_DOT_CLASS = {
  "To Do": "todo",
  "In Progress": "progress",
  "In Review": "review",
  "In Testing": "testing"
};

function closePackageMenu() {
  $("#packageMenu").hidden = true;
}

function addMenuItem(container, options) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = `context-menu-item${options.danger ? " is-danger" : ""}`;
  button.setAttribute("role", "menuitem");
  button.disabled = Boolean(options.disabled);

  if (options.icon) {
    const icon = document.createElement("span");
    icon.className = "menu-icon";
    icon.textContent = options.icon;
    button.append(icon);
  }

  const label = document.createElement("span");
  label.textContent = options.label;
  button.append(label);

  if (options.hint) {
    const hint = document.createElement("span");
    hint.className = "menu-hint";
    hint.textContent = options.hint;
    button.append(hint);
  }

  button.addEventListener("click", () => {
    closePackageMenu();
    options.onSelect?.();
  });

  container.append(button);

  return button;
}

function addMenuSection(container, label) {
  const heading = document.createElement("span");

  heading.className = "context-menu-label";
  heading.textContent = label;
  container.append(heading);
}

function addMenuSeparator(container) {
  const separator = document.createElement("div");

  separator.className = "context-menu-separator";
  container.append(separator);
}

function jiraIssueUrl(ticket) {
  const jira = state.config?.jira;

  if (!jira?.configured || state.dataMode !== "live") {
    return null;
  }

  return `${jira.site}/browse/${encodeURIComponent(ticket.id)}`;
}

function openPackageMenu({ ticket, clientX, clientY }) {
  if (!ticket) {
    return;
  }

  const releasing = campus.isReleasing();
  const locked = state.busy || releasing;
  const menu = $("#packageMenu");
  const actions = $("#packageMenuActions");
  const statusIndex = STATUSES.indexOf(ticket.status);

  $("#packageMenuTitle").textContent = ticket.id;
  $("#packageMenuMeta").textContent = `${
    ticket.status
  } · ${ticket.quantity} unit${ticket.quantity === 1 ? "" : "s"} · ${
    ticket.assignee || "Unassigned"
  }`;

  actions.replaceChildren();

  addMenuSection(actions, "Package");

  addMenuItem(actions, {
    icon: "📄",
    label: "Open details",
    hint: "Enter",
    onSelect: () => setPanelOpen(true)
  });

  addMenuItem(actions, {
    icon: "◎",
    label: "Focus camera",
    onSelect: () => campus.focusSelected()
  });

  addMenuSeparator(actions);
  addMenuSection(actions, "Move to");

  STATUSES.forEach((status, index) => {
    const dot = document.createElement("span");

    dot.className = `menu-icon status-dot ${
      STATUS_DOT_CLASS[status] || ""
    }`;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "context-menu-item";
    button.setAttribute("role", "menuitem");
    button.disabled = locked || status === ticket.status;

    button.append(dot);

    const label = document.createElement("span");
    label.textContent = status;
    button.append(label);

    const hint = document.createElement("span");
    hint.className = "menu-hint";
    hint.textContent =
      status === ticket.status
        ? "current"
        : index === statusIndex + 1
          ? "next"
          : "";
    button.append(hint);

    button.addEventListener("click", () => {
      closePackageMenu();
      campus.setSelected(ticket);
      moveSelectedTo(status);
    });

    actions.append(button);
  });

  addMenuSeparator(actions);
  addMenuSection(actions, "Delivery");

  addMenuItem(actions, {
    icon: "🚜",
    label: "Release & start transport",
    disabled: locked || ticket.status !== "In Testing",
    onSelect: () => {
      campus.setSelected(ticket);
      releaseSelected();
    }
  });

  const issueUrl = jiraIssueUrl(ticket);

  addMenuItem(actions, {
    icon: "↗",
    label: "Open in Jira",
    disabled: !issueUrl,
    onSelect: () => window.open(issueUrl, "_blank", "noopener,noreferrer")
  });

  addMenuItem(actions, {
    icon: "⧉",
    label: "Copy ticket key",
    onSelect: () => copyTicketKey(ticket)
  });

  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";

  const bounds = menu.getBoundingClientRect();
  const left = Math.max(
    12,
    Math.min(clientX, window.innerWidth - bounds.width - 12)
  );
  const top = Math.max(
    12,
    Math.min(clientY, window.innerHeight - bounds.height - 12)
  );

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  actions.querySelector(".context-menu-item:not(:disabled)")?.focus();
}

async function copyTicketKey(ticket) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ticket.id);
    } else {
      const field = document.createElement("textarea");

      field.value = ticket.id;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();

      try {
        if (!document.execCommand("copy")) {
          throw new Error("Clipboard is not available");
        }
      } finally {
        field.remove();
      }
    }

    notify({
      type: "success",
      title: "Ticket key copied",
      message: ticket.id,
      timeout: 2500
    });
  } catch (error) {
    notify({
      type: "error",
      title: "Could not copy ticket key",
      message: describeError(error),
      timeout: 4000
    });
  }
}

/* ------------------------------------------------------------------
 * Package browser
 * ------------------------------------------------------------------ */

const STATUS_PILL_CLASS = {
  "To Do": "todo",
  "In Progress": "progress",
  "In Review": "review",
  "In Testing": "testing",
  Released: "released"
};

const PACKAGE_FILTER_IDS = {
  all: "#filterCountAll",
  "To Do": "#filterCountTodo",
  "In Progress": "#filterCountProgress",
  "In Review": "#filterCountReview",
  "In Testing": "#filterCountTesting"
};

function activeTickets() {
  return campus.getTickets().filter((ticket) => !ticket.released);
}

function matchesPackageQuery(ticket, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    ticket.id,
    ticket.title,
    ticket.assignee,
    ticket.tag,
    ticket.status,
    ...(ticket.labels || [])
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function visiblePackages() {
  const query = state.packageQuery.trim().toLowerCase();

  return activeTickets().filter(
    (ticket) =>
      (state.packageFilter === "all" ||
        ticket.status === state.packageFilter) &&
      matchesPackageQuery(ticket, query)
  );
}

function updateFilterCounts() {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const tickets = activeTickets();

  tickets.forEach((ticket) => {
    if (ticket.status in counts) {
      counts[ticket.status]++;
    }
  });

  $(PACKAGE_FILTER_IDS.all).textContent = tickets.length;

  STATUSES.forEach((status) => {
    $(PACKAGE_FILTER_IDS[status]).textContent = counts[status];
  });
}

function selectPackageFromDrawer(ticket, { openDetails = false } = {}) {
  campus.setSelected(ticket);
  campus.focusSelected();

  if (openDetails) {
    setPanelOpen(true);
  }

  if (window.matchMedia("(max-width: 720px)").matches) {
    setPackageDrawerOpen(false);
  }
}

function renderPackageSkeletons() {
  const list = $("#packageList");

  list.replaceChildren();

  for (let index = 0; index < 6; index++) {
    const row = document.createElement("div");

    row.className = "package-row skeleton";
    row.innerHTML =
      '<span class="skeleton-bar short"></span>' +
      '<span class="package-row-main">' +
      '<span class="skeleton-bar wide"></span>' +
      '</span>';

    list.append(row);
  }

  $("#packageEmpty").hidden = true;
}

function renderPackageRow(ticket, selectedId) {
  const row = document.createElement("button");
  const dot = document.createElement("span");
  const main = document.createElement("span");
  const title = document.createElement("strong");
  const subtitle = document.createElement("small");
  const meta = document.createElement("span");
  const pill = document.createElement("span");
  const quantity = document.createElement("small");

  row.type = "button";
  row.className = "package-row";
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", String(ticket.id === selectedId));
  row.dataset.ticketId = ticket.id;

  dot.className = `status-dot ${STATUS_DOT_CLASS[ticket.status] || ""}`;

  main.className = "package-row-main";
  title.textContent = ticket.id;
  subtitle.textContent = ticket.title;

  main.append(title, subtitle);

  meta.className = "package-row-meta";
  pill.className = `status-pill ${STATUS_PILL_CLASS[ticket.status] || ""}`;
  pill.textContent = ticket.status;
  quantity.textContent = `${ticket.quantity} unit${ticket.quantity === 1 ? "" : "s"}`;

  meta.append(pill, quantity);
  row.append(dot, main, meta);

  row.addEventListener("click", () => selectPackageFromDrawer(ticket));
  row.addEventListener("dblclick", () =>
    selectPackageFromDrawer(ticket, { openDetails: true })
  );
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      selectPackageFromDrawer(ticket, { openDetails: true });
    }

    if (event.key === " ") {
      event.preventDefault();
      selectPackageFromDrawer(ticket);
    }
  });

  return row;
}

function renderPackageDrawer() {
  const list = $("#packageList");
  const empty = $("#packageEmpty");

  updateFilterCounts();

  if (state.loading && !activeTickets().length) {
    campus.setSearchFilter(null);
    renderPackageSkeletons();
    return;
  }

  const tickets = visiblePackages();
  const selectedId = campus.getSelectedTicket()?.id ?? null;
  const filtering =
    Boolean(state.packageQuery.trim()) || state.packageFilter !== "all";

  campus.setSearchFilter(
    filtering ? tickets.map((ticket) => ticket.id) : null
  );

  list.replaceChildren();

  tickets.forEach((ticket) => {
    list.append(renderPackageRow(ticket, selectedId));
  });

  if (!tickets.length) {
    empty.textContent = activeTickets().length
      ? "No packages match this search or filter."
      : "No packages loaded yet. Sync Jira or switch to the mock workspace.";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
}

function refreshPackageSelection() {
  const selectedId = campus.getSelectedTicket()?.id ?? null;

  $$("#packageList .package-row").forEach((row) => {
    row.setAttribute(
      "aria-selected",
      String(row.dataset.ticketId === selectedId)
    );
  });
}

function setPackageDrawerOpen(open) {
  state.packageDrawerOpen = Boolean(open);

  const drawer = $("#packageDrawer");
  const button = $("#openPackages");

  drawer.hidden = !state.packageDrawerOpen;
  button.setAttribute("aria-expanded", String(state.packageDrawerOpen));

  if (state.packageDrawerOpen) {
    renderPackageDrawer();
    $("#packageSearch").focus({ preventScroll: true });
  } else if (drawer.dataset.wasOpen === "true") {
    campus.setSearchFilter(null);
    button.focus({ preventScroll: true });
  }

  drawer.dataset.wasOpen = String(state.packageDrawerOpen);
}

function clearPackageSearch() {
  state.packageQuery = "";
  $("#packageSearch").value = "";
  $("#clearPackageSearch").hidden = true;
  renderPackageDrawer();
}

function renderCounters() {
  const tickets = campus.getTickets();
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));

  tickets.forEach((ticket) => {
    if (!ticket.released && ticket.status in counts) {
      counts[ticket.status]++;
    }
  });

  $("#countTodo").textContent = counts["To Do"];
  $("#countProgress").textContent = counts["In Progress"];
  $("#countReview").textContent = counts["In Review"];
  $("#countTesting").textContent = counts["In Testing"];

  const inProgress = tickets.filter(
    (ticket) =>
      !ticket.released &&
      (ticket.status === "In Progress" ||
        ticket.status === "In Review" ||
        ticket.status === "In Testing")
  ).length;

  $("#totalPackages").textContent = tickets.filter(
    (ticket) => !ticket.released
  ).length;
  $("#inProgressPackages").textContent = inProgress;
  $("#deliveredPackages").textContent = tickets.filter(
    (ticket) => ticket.released
  ).length;
}

function setStatusBadge(status) {
  const badge = $("#statusBadge");

  badge.className = "status-badge";

  if (status === "To Do") badge.classList.add("todo");
  if (status === "In Review") badge.classList.add("review");
  if (status === "In Testing") badge.classList.add("testing");
  if (status === "Release") badge.classList.add("release");
  if (status === "Released") badge.classList.add("released");

  badge.textContent = status;
}

function updateReleaseButton() {
  const ticket = campus.getSelectedTicket();
  const releasing = campus.isReleasing();
  const live = state.dataMode === "live";
  const blocked =
    state.busy ||
    releasing ||
    !ticket ||
    ticket.released ||
    ticket.status !== "In Testing";

  $("#releaseButton").disabled = blocked;

  if (!blocked && live) {
    $("#releaseButton").disabled = !hasAvailableTarget("Released");
  }
}

function renderTracker() {
  const ticket = campus.getSelectedTicket();

  if (!ticket || campus.isReleasing()) {
    return;
  }

  let step = STATUSES.indexOf(ticket.status);
  let progress = [8, 28, 48, 68][step] || 0;

  if (ticket.status === "Release") {
    step = 4;
    progress = 82;
  }

  if (ticket.status === "Released") {
    step = 5;
    progress = 100;
  }

  $("#progressValue").style.width = `${progress}%`;

  for (let index = 0; index < 6; index++) {
    $(`#step${index}`).classList.toggle("done", index <= step);
  }
}

function renderSelection(ticketOverride) {
  const ticket = ticketOverride ?? campus.getSelectedTicket();

  if (!ticket) {
    $("#ticketId").textContent = "No tickets";
    $("#ticketTitle").textContent = "Waiting for data";
    $("#ticketQuantity").textContent = "0 units";
    $("#ticketTag").textContent = "—";
    $("#ticketAssignee").textContent = "—";
    $("#ticketZone").textContent = "—";
    $("#shipmentStatus").textContent = "Empty";
    $("#shipmentId").textContent = "—";
    $("#shipmentDestination").textContent = "No package selected";
    $("#jiraIssueLink").hidden = true;
    setStatusBadge("Empty");

    $$(".workflow-button").forEach((button) =>
      button.classList.remove("active")
    );

    $("#releaseButton").disabled = true;
    return;
  }

  $("#ticketId").textContent = ticket.id;
  $("#ticketTitle").textContent = ticket.title;
  $("#ticketQuantity").textContent = `${ticket.quantity} units`;
  $("#ticketTag").textContent = ticket.tag || "#jira";
  $("#ticketAssignee").textContent = ticket.assignee || "Unassigned";
  $("#shipmentStatus").textContent = ticket.status;
  $("#shipmentId").textContent = `#${ticket.id}`;
  $("#shipmentDestination").textContent = `${ticket.priority || "None"} priority · ${
    ticket.assignee || "Unassigned"
  }`;

  const lane = STATUSES.indexOf(ticket.status);

  $("#ticketZone").textContent =
    lane >= 0
      ? `Lane ${lane + 1} · Main Hall`
      : ticket.status === "Released"
        ? "Central Live Depot"
        : "Bay 1 · Loading";

  setStatusBadge(ticket.status);

  $$(".workflow-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.status === ticket.status);
  });

  const jira = state.config?.jira;

  if (jira?.configured && state.dataMode === "live") {
    $("#jiraIssueLink").hidden = false;
    $("#jiraIssueLink").href = `${jira.site}/browse/${encodeURIComponent(
      ticket.id
    )}`;
  } else {
    $("#jiraIssueLink").hidden = true;
  }

  updateReleaseButton();
  renderTracker();

  if (state.dataMode === "live") {
    refreshWorkflowAvailability(ticket);
  }
}

function renderState() {
  renderCounters();

  if (campus.getSelectedTicket()) {
    renderSelection();
  } else {
    updateReleaseButton();
  }

  if (state.packageDrawerOpen) {
    renderPackageDrawer();
  }
}

function updateReleaseProgress(value) {
  const progress = Math.max(0, Math.min(1, value));

  $("#progressValue").style.width = `${80 + progress * 20}%`;

  for (let index = 0; index < 6; index++) {
    $(`#step${index}`).classList.toggle(
      "done",
      index <= (progress < 0.55 ? 4 : 5)
    );
  }
}

/* ------------------------------------------------------------------
 * Sync state and connection card
 * ------------------------------------------------------------------ */

function setSyncState(type, text, details = "", options = {}) {
  const badge = $("#apiModeBadge");
  const indicator = $("#syncIndicator");

  state.loading = type === "loading";
  state.lastSyncText = text;

  badge.className = "";
  indicator.className = "sync-indicator";

  if (type) {
    badge.classList.add(type);
    indicator.classList.add(type);
  }

  badge.textContent =
    type === "live"
      ? "Live"
      : type === "loading"
        ? "Sync"
        : type === "error"
          ? "Error"
          : "Idle";

  $("#syncText").textContent = text;
  $("#syncDetails").textContent = details;

  updateSyncBanner(type, text, details, options);

  if (state.packageDrawerOpen) {
    renderPackageDrawer();
  }
}

function announce(message) {
  const region = $("#liveStatus");

  if (region) {
    region.textContent = "";
    region.textContent = message;
  }
}

function updateSyncBanner(type, text, details, options = {}) {
  const banner = $("#syncBanner");

  if (!banner) {
    return;
  }

  const actionable = type === "error" || options.tone === "warning";

  if (!actionable) {
    banner.hidden = true;
    state.syncBannerDismissed = false;
    state.syncBannerDismissedText = "";
    return;
  }

  if (
    state.syncBannerDismissed &&
    state.syncBannerDismissedText === text &&
    !options.force
  ) {
    return;
  }

  state.syncBannerDismissed = false;

  const tone = type === "error" ? "error" : "warning";

  banner.className = `sync-banner glass ${tone}`;
  banner.hidden = false;

  $("#syncBannerDot").className = `sync-indicator ${tone}`;
  $("#syncBannerTitle").textContent = text;
  $("#syncBannerDetails").textContent = details;

  const action = $("#syncBannerAction");

  action.textContent = options.actionLabel || "Retry";
  action.dataset.action = options.action || "retry";
  action.hidden = options.action === "none";

  announce(`${text}. ${details}`.trim());
}

function renderBackend(jiraOverride) {
  const jira = jiraOverride || state.config?.jira;
  const dot = $("#connectionDot");
  const testButton = $("#testConnection");

  if (!jira) {
    dot.className = "sync-indicator error";
    $("#connectionTitle").textContent = "Backend unavailable";
    $("#connectionDetails").textContent =
      "Start the Node server with npm start";
    testButton.disabled = true;
    return;
  }

  if (!jira.configured) {
    dot.className = "sync-indicator error";
    $("#connectionTitle").textContent = "Jira proxy not configured";
    $("#connectionDetails").textContent =
      "Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env";
    testButton.disabled = true;
    $("#liveModeButton").title = "Configure Jira in .env first";
    return;
  }

  dot.className = "sync-indicator live";
  $("#connectionTitle").textContent = `${jira.site.replace(
    /^https?:\/\//,
    ""
  )} · ${jira.authMode}`;
  $("#connectionDetails").textContent = jira.account
    ? `Server-side auth for ${jira.account}`
    : "Server-side authentication";

  testButton.disabled = false;
  $("#liveModeButton").removeAttribute("title");
}

function updateActiveTag(value) {
  const label = normalizeTag(value);

  $("#activeJiraTag").textContent = label ? `#${label}` : "All tickets";
}

/* ------------------------------------------------------------------
 * Settings
 * ------------------------------------------------------------------ */

function readFormSettings() {
  return {
    label: normalizeTag($("#jiraTicketTag").value),
    projectKey: $("#jiraProjectKey").value.trim().toUpperCase(),
    quantityField: $("#jiraQuantityField").value.trim(),
    issueKey: $("#jiraIssueKey").value.trim().toUpperCase(),
    pollIntervalMs: Number($("#jiraPollInterval").value),
    autoRefresh: $("#jiraAutoRefresh").checked,
    maxResults: state.settings.maxResults
  };
}

function applyServerSettings(settings) {
  state.settings = { ...state.settings, ...settings };

  $("#jiraTicketTag").value = settings.label || "";
  $("#jiraProjectKey").value = settings.projectKey || "";
  $("#jiraQuantityField").value = settings.quantityField || "";
  $("#jiraIssueKey").value = settings.issueKey || "";
  $("#jiraPollInterval").value = String(settings.pollIntervalMs || 15_000);
  $("#jiraAutoRefresh").checked = settings.autoRefresh !== false;

  updateActiveTag(settings.label);
}

async function loadBackend() {
  try {
    const config = await api.getConfig();

    state.config = config;
    applyServerSettings(config.jira.settings);
    renderBackend();
  } catch (error) {
    state.config = null;
    renderBackend(null);
    notify({
      type: "error",
      title: "Backend not reachable",
      message: describeError(error)
    });
  }
}

function scheduleSaveSettings({ restartSync = false } = {}) {
  window.clearTimeout(state.saveTimer);

  state.saveTimer = window.setTimeout(async () => {
    const payload = readFormSettings();

    try {
      const response = await api.saveConfig(payload);

      state.settings = { ...state.settings, ...response.jira.settings };
      state.config = {
        ...(state.config || {}),
        jira: response.jira
      };
      renderBackend(response.jira);
      state.transitions.clear();
    } catch (error) {
      notify({
        type: "error",
        title: "Settings were not saved",
        message: describeError(error)
      });
    }

    if (restartSync && state.dataMode === "live") {
      startLiveSync();
    }
  }, 450);
}

/* ------------------------------------------------------------------
 * Jira synchronisation
 * ------------------------------------------------------------------ */

function stopLiveSync(resetState = true) {
  window.clearInterval(state.pollTimer);
  state.pollTimer = null;

  state.requestController?.abort();
  state.requestController = null;
  state.requestRunning = false;

  if (resetState) {
    setSyncState(
      "",
      "Live synchronization stopped",
      `${campus.getTickets().length} tickets remain visible`
    );
  }
}

async function synchronizeJira({ silent = false } = {}) {
  if (state.dataMode !== "live") {
    return;
  }

  if (state.requestRunning) {
    state.syncQueued = true;
    return;
  }

  const settings = readFormSettings();

  if (!state.config?.jira.configured) {
    setSyncState(
      "error",
      "Jira proxy not configured",
      "Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env"
    );

    if (!silent) {
      notify({
        type: "error",
        title: "Jira is not configured",
        message:
          "The backend has no Jira credentials. Copy .env.example to .env and restart the server."
      });
    }

    return;
  }

  state.requestRunning = true;
  state.requestController = new AbortController();

  const signal = state.requestController.signal;
  const params = {
    label: settings.label,
    project: settings.projectKey,
    quantityField: settings.quantityField,
    maxResults: state.settings.maxResults
  };

  setSyncState(
    "loading",
    settings.issueKey ? `Loading ${settings.issueKey}…` : "Loading Jira tickets…",
    settings.issueKey
      ? "GET /api/jira/tickets/{key}"
      : "GET /api/jira/tickets via backend proxy"
  );

  try {
    let tickets;
    let meta = null;

    if (settings.issueKey) {
      const response = await api.getTicket(settings.issueKey, params, signal);
      tickets = response.ticket ? [response.ticket] : [];
    } else {
      const response = await api.listTickets(params, signal);
      tickets = Array.isArray(response.tickets) ? response.tickets : [];
      meta = response.meta;
    }

    if (state.dataMode !== "live") {
      return;
    }

    campus.applyTickets(tickets);
    state.lastSyncError = null;

    setSyncState(
      "live",
      tickets.length
        ? `${tickets.length} Jira ticket${tickets.length === 1 ? "" : "s"} loaded`
        : "No Jira tickets found",
      `${meta?.cached ? "Cached · " : ""}Updated ${formatTime()}`,
      tickets.length
        ? {}
        : {
            tone: "warning",
            action: "settings",
            actionLabel: "Settings",
            force: true
          }
    );

    if (!silent) {
      notify({
        type: "success",
        title: `${tickets.length} Jira ticket${
          tickets.length === 1 ? "" : "s"
        } loaded`,
        message: meta?.jql ? `JQL: ${meta.jql}` : undefined,
        timeout: 4000
      });
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    const message = describeError(error);

    setSyncState("error", "Jira synchronization failed", message, {
      force: !silent
    });

    if (!silent || state.lastSyncError !== message) {
      notify({
        type: "error",
        title: "Jira synchronization failed",
        message,
        timeout: 8000
      });
    }

    state.lastSyncError = message;
  } finally {
    state.requestRunning = false;
    state.requestController = null;

    if (state.syncQueued) {
      state.syncQueued = false;
      window.setTimeout(() => synchronizeJira({ silent: true }), 0);
    }
  }
}

function startLiveSync() {
  stopLiveSync(false);

  if (state.dataMode !== "live") {
    return;
  }

  const settings = readFormSettings();

  synchronizeJira();

  if (settings.autoRefresh) {
    state.pollTimer = window.setInterval(
      () => synchronizeJira({ silent: true }),
      Math.max(5000, settings.pollIntervalMs)
    );
  }
}

/* ------------------------------------------------------------------
 * Transitions
 * ------------------------------------------------------------------ */

function hasAvailableTarget(status) {
  const ticket = campus.getSelectedTicket();
  const cached = ticket ? state.transitions.get(ticket.id) : null;

  if (!cached || Date.now() - cached.fetchedAt > TRANSITION_CACHE_TTL_MS) {
    return true;
  }

  return cached.targets.has(status);
}

async function fetchTransitions(ticket, { force = false } = {}) {
  const cached = state.transitions.get(ticket.id);

  if (
    !force &&
    cached &&
    Date.now() - cached.fetchedAt <= TRANSITION_CACHE_TTL_MS
  ) {
    return cached;
  }

  const response = await api.getTransitions(ticket.id);
  const available = response.transitions.filter(
    (transition) => transition.available
  );

  const entry = {
    fetchedAt: Date.now(),
    transitions: available,
    targets: new Set(available.map((transition) => transition.to.status))
  };

  state.transitions.set(ticket.id, entry);

  return entry;
}

async function refreshWorkflowAvailability(ticket) {
  if (state.dataMode !== "live" || !ticket || ticket.released) {
    return;
  }

  try {
    const entry = await fetchTransitions(ticket);

    if (campus.getSelectedTicket()?.id !== ticket.id) {
      return;
    }

    $$(".workflow-button").forEach((button) => {
      button.disabled =
        state.busy || !entry.targets.has(button.dataset.status);
    });

    $("#releaseButton").disabled =
      state.busy ||
      campus.isReleasing() ||
      ticket.status !== "In Testing" ||
      !entry.targets.has("Released");

    if (campus.isReleasing()) {
      $("#releaseButton").disabled = true;
    }
  } catch {
    $$(".workflow-button").forEach((button) => {
      button.disabled = state.busy;
    });
  }
}

async function moveSelectedTo(status) {
  const ticket = campus.getSelectedTicket();

  if (!ticket) {
    return;
  }

  if (state.dataMode === "mock") {
    campus.moveTicket(ticket, status);
    return;
  }

  if (state.busy) {
    return;
  }

  state.busy = true;
  $$(".workflow-button").forEach((button) => (button.disabled = true));
  $("#releaseButton").disabled = true;

  try {
    await api.transition(ticket.id, { targetStatus: status });
    state.transitions.delete(ticket.id);

    notify({
      type: "success",
      title: `${ticket.id} → ${status}`,
      message: "Jira transition applied",
      timeout: 4000
    });

    await synchronizeJira({ silent: true });
  } catch (error) {
    notify({
      type: "error",
      title: `Transition to ${status} failed`,
      message: describeError(error),
      timeout: 9000
    });
  } finally {
    state.busy = false;
    renderSelection(campus.getSelectedTicket());
  }
}

async function releaseSelected() {
  const ticket = campus.getSelectedTicket();

  if (!ticket) {
    return;
  }

  if (state.dataMode === "mock") {
    campus.startRelease(ticket);
    return;
  }

  if (state.busy) {
    return;
  }

  state.busy = true;
  $("#releaseButton").disabled = true;

  try {
    const entry = await fetchTransitions(ticket, { force: true });

    if (ticket.status === "In Testing" && entry.targets.has("Release")) {
      await api.transition(ticket.id, { targetStatus: "Release" });
      state.transitions.delete(ticket.id);
      state.pendingRelease = ticket;
      campus.startRelease(ticket);

      notify({
        type: "success",
        title: `${ticket.id} → Release`,
        message: "Campus forklift is loading the parcel",
        timeout: 4000
      });
      return;
    }

    if (entry.targets.has("Released")) {
      await api.transition(ticket.id, { targetStatus: "Released" });
      state.transitions.delete(ticket.id);

      notify({
        type: "success",
        title: `${ticket.id} released`,
        message: "The package left the campus",
        timeout: 4000
      });

      await synchronizeJira({ silent: true });
      return;
    }

    notify({
      type: "error",
      title: "No release transition available",
      message: `Available targets: ${[
        ...entry.targets
      ].join(", ") || "none"}`
    });
  } catch (error) {
    notify({
      type: "error",
      title: "Release failed",
      message: describeError(error),
      timeout: 9000
    });
  } finally {
    state.busy = false;
    updateReleaseButton();
  }
}

async function finishRelease(ticket) {
  if (state.dataMode !== "live" || state.pendingRelease?.id !== ticket.id) {
    return;
  }

  state.pendingRelease = null;

  try {
    await api.transition(ticket.id, { targetStatus: "Released" });
    state.transitions.delete(ticket.id);

    notify({
      type: "success",
      title: `${ticket.id} marked as released`,
      message: "Jira workflow updated to Done/Released"
    });
  } catch (error) {
    notify({
      type: "error",
      title: "Parcel released locally only",
      message: `Jira could not be updated: ${describeError(error)}`,
      timeout: 9000
    });
  }

  await synchronizeJira({ silent: true });
}

/* ------------------------------------------------------------------
 * Data mode
 * ------------------------------------------------------------------ */

function setDataMode(mode) {
  if (campus.isDemoRunning()) {
    campus.stopDemo();
  }

  state.dataMode = mode === "live" ? "live" : "mock";

  const live = state.dataMode === "live";

  $("#mockModeButton").classList.toggle("active", !live);
  $("#liveModeButton").classList.toggle("active", live);
  $("#liveSettings").hidden = !live;
  $("#workflowHint").textContent = live
    ? "Jira workflow"
    : "Mock workspace";

  $$(".workflow-button").forEach((button) => (button.disabled = false));

  if (!live) {
    stopLiveSync(false);
    campus.clearTickets();
    campus.seedMockTickets();

    setSyncState(
      "",
      "Mock data loaded",
      `${campus.getTickets().length} local tickets`
    );

    setSettingsOpen(false);
    return;
  }

  stopLiveSync(false);
  campus.clearTickets();

  if (!state.config?.jira.configured) {
    setSyncState(
      "error",
      "Jira proxy not configured",
      "Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env"
    );

    notify({
      type: "error",
      title: "Live mode needs a configured backend",
      message:
        "Copy .env.example to .env, fill in the Jira credentials and restart the server."
    });

    return;
  }

  setSettingsOpen(false);
  setSyncState("loading", "Connecting to Jira…", "via backend proxy");
  startLiveSync();
}

/* ------------------------------------------------------------------
 * Ticket creation
 * ------------------------------------------------------------------ */

function createMockTicket() {
  const id = campus.nextMockTicketId();
  const christmas = document.body.classList.contains("christmas");

  const ticket = campus.createTicket(id, "To Do", {
    title: christmas ? "New Christmas Gift" : "New Logistics Ticket",
    quantity: 1 + Math.floor(Math.random() * 90),
    tag: christmas ? "#christmas-2026" : "#new-shipment"
  });

  campus.layoutTickets(false);
  campus.setSelected(ticket);
}

function openTicketModal() {
  if (state.dataMode === "mock") {
    createMockTicket();
    return;
  }

  const form = $("#ticketForm");

  form.reset();
  $("#newTicketQuantity").value = "1";
  $("#newTicketProject").value = state.settings.projectKey || "";
  $("#newTicketSummary").value = "";
  $("#newTicketDescription").value = "";
  $("#ticketFormError").hidden = true;
  $("#ticketModal").hidden = false;
  $("#newTicketSummary").focus();

  if (!state.settings.projectKey) {
    notify({
      type: "info",
      title: "No default project",
      message: "Fill in the project key before creating a ticket."
    });
  }
}

function closeTicketModal() {
  $("#ticketModal").hidden = true;
}

function showFormError(message) {
  const box = $("#ticketFormError");

  box.textContent = message;
  box.hidden = false;
}

async function submitTicketForm(event) {
  event.preventDefault();

  const summary = $("#newTicketSummary").value.trim();
  const projectKey = $("#newTicketProject").value.trim().toUpperCase();
  const quantity = Number($("#newTicketQuantity").value);
  const description = $("#newTicketDescription").value.trim();
  const button = $("#submitTicket");

  if (!summary) {
    showFormError("Summary is required.");
    return;
  }

  if (!projectKey) {
    showFormError("Project key is required.");
    return;
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    showFormError("Quantity must be a positive number.");
    return;
  }

  $("#ticketFormError").hidden = true;
  button.disabled = true;
  button.textContent = "Creating…";

  try {
    const response = await api.createTicket({
      summary,
      projectKey,
      description,
      quantity,
      label: normalizeTag(state.settings.label),
      quantityField: state.settings.quantityField
    });

    closeTicketModal();

    notify({
      type: "success",
      title: `Created ${response.key}`,
      message: summary
    });

    await loadBackend();
    await synchronizeJira({ silent: true });
  } catch (error) {
    showFormError(describeError(error));
  } finally {
    button.disabled = false;
    button.textContent = "Create in Jira";
  }
}

/* ------------------------------------------------------------------
 * Events
 * ------------------------------------------------------------------ */

function wireEvents() {
  campus.on("theme", applyThemeUI);
  campus.on("state", renderState);
  campus.on("selection", (ticket) => {
    renderSelection(ticket);
    refreshPackageSelection();
    writeSelectionToUrl(ticket);
  });
  campus.on("progress", updateReleaseProgress);
  campus.on("release-end", finishRelease);
  campus.on("next-request", (ticket) => {
    if (state.dataMode === "mock") {
      campus.moveNext(ticket);
      return;
    }

    const index = STATUSES.indexOf(ticket.status);

    if (index >= 0 && index < STATUSES.length - 1) {
      moveSelectedTo(STATUSES[index + 1]);
    }
  });

  campus.on("demo", ({ running, message }) => {
    if (Boolean(running) === state.demoRunning) {
      return;
    }

    state.demoRunning = Boolean(running);
    setAnimateButton(state.demoRunning);

    notify({
      type: "info",
      title: message || (state.demoRunning ? "Animation started" : "Animation stopped"),
      timeout: state.demoRunning ? 3200 : 2400
    });
  });

  campus.on("vehicle", ({ driving, reset, label }) => {
    if (driving) {
      notify({
        type: "success",
        title: `🚚 ${label} unlocked`,
        message:
          "W/A/S/D or arrow keys to drive · double-click the vehicle to park it",
        timeout: 5200
      });

      return;
    }

    notify({
      type: "info",
      title: reset ? `${label} parked` : `${label} stopped`,
      message: reset
        ? "Back at the loading dock"
        : "Click the vehicle to take control again",
      timeout: 2600
    });
  });

  $("#themeButton").addEventListener("click", () => {
    setThemeMenuOpen($("#themeMenu").hidden);
  });

  $("#themeButton").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setThemeMenuOpen(true);
    }
  });

  $("#themeMenu").addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setThemeMenuOpen(false, { restoreFocus: true });
      return;
    }

    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      moveThemeMenuFocus(event);
    }
  });

  $(".theme-control").addEventListener("focusout", (event) => {
    if (!$(".theme-control").contains(event.relatedTarget)) {
      setThemeMenuOpen(false);
    }
  });

  $("#animateToggle").addEventListener("click", toggleAnimate);

  $("#resetCamera").addEventListener("click", campus.resetCamera);
  $("#topCamera").addEventListener("click", campus.topCamera);
  $("#focusSelected").addEventListener("click", campus.focusSelected);

  $("#chaseCamera").addEventListener("click", () => {
    updateChaseButton(campus.toggleChaseView());
  });

  campus.on("chase", ({ active }) => updateChaseButton(active));

  $("#panelToggle").addEventListener("click", () =>
    setPanelOpen(!state.panelOpen)
  );
  $("#closePanel").addEventListener("click", () => setPanelOpen(false));
  $("#openSettings").addEventListener("click", () => setSettingsOpen(true));
  $("#closeSettings").addEventListener("click", () => setSettingsOpen(false));
  $("#settingsBackdrop").addEventListener("click", () => setSettingsOpen(false));

  $("#openPackages").addEventListener("click", () =>
    setPackageDrawerOpen(!state.packageDrawerOpen)
  );
  $("#closePackages").addEventListener("click", () =>
    setPackageDrawerOpen(false)
  );

  $("#packageSearch").addEventListener("input", (event) => {
    state.packageQuery = event.target.value;
    $("#clearPackageSearch").hidden = !state.packageQuery;
    renderPackageDrawer();
  });

  $("#clearPackageSearch").addEventListener("click", () => {
    clearPackageSearch();
    $("#packageSearch").focus();
  });

  $$("#packageFilters .filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.packageFilter = chip.dataset.filter;

      $$("#packageFilters .filter-chip").forEach((entry) =>
        entry.classList.toggle("active", entry === chip)
      );

      renderPackageDrawer();
    });
  });

  $("#settingsDrawer").addEventListener("keydown", (event) =>
    trapFocus($("#settingsDrawer"), event)
  );

  $("#syncBannerAction").addEventListener("click", () => {
    const action = $("#syncBannerAction").dataset.action;

    if (action === "settings") {
      setSettingsOpen(true);
      return;
    }

    state.syncBannerDismissed = false;

    if (state.dataMode === "live") {
      synchronizeJira();
    } else {
      setDataMode("live");
    }
  });

  $("#dismissSyncBanner").addEventListener("click", () => {
    state.syncBannerDismissed = true;
    state.syncBannerDismissedText = state.lastSyncText;
    $("#syncBanner").hidden = true;
  });

  window.addEventListener("hashchange", handleHashChange);

  campus.on("context-request", openPackageMenu);

  $("#packageMenu").addEventListener("keydown", (event) => {
    if (
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();

    const items = [
      ...$$("#packageMenuActions .context-menu-item:not(:disabled)")
    ];

    if (!items.length) {
      return;
    }

    const current = items.indexOf(document.activeElement);
    let next = current;

    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = items.length - 1;
    } else if (event.key === "ArrowDown") {
      next = current < 0 ? 0 : (current + 1) % items.length;
    } else {
      next = current <= 0 ? items.length - 1 : current - 1;
    }

    items[next]?.focus();
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !$("#packageMenu").hidden &&
        !$("#packageMenu").contains(event.target)
      ) {
        closePackageMenu();
      }

      if (
        !$("#themeMenu").hidden &&
        !$(".theme-control").contains(event.target)
      ) {
        setThemeMenuOpen(false);
      }
    },
    true
  );

  window.addEventListener("resize", closePackageMenu);
  window.addEventListener("blur", closePackageMenu);

  $$(".workflow-button").forEach((button) => {
    button.addEventListener("click", () =>
      moveSelectedTo(button.dataset.status)
    );
  });

  $("#releaseButton").addEventListener("click", () =>
    releaseSelected().catch((error) =>
      notify({
        type: "error",
        title: "Release failed",
        message: describeError(error)
      })
    )
  );

  $("#newTicket").addEventListener("click", openTicketModal);
  $("#closeTicketModal").addEventListener("click", closeTicketModal);
  $("#cancelTicketModal").addEventListener("click", closeTicketModal);
  $("#ticketForm").addEventListener("submit", submitTicketForm);

  $("#ticketModal").addEventListener("click", (event) => {
    if (event.target === $("#ticketModal")) {
      closeTicketModal();
    }
  });

  /*
   * Drive mode owns W/A/S/D and the arrow keys; Esc leaves the driver's seat.
   * Menus and drawers take precedence and hand the vehicle back.
   */
  const overlayOpen = () =>
    !$("#themeMenu").hidden ||
    !$("#packageMenu").hidden ||
    state.packageDrawerOpen ||
    !$("#settingsDrawer").hidden ||
    !$("#ticketModal").hidden;

  document.addEventListener("keydown", (event) => {
    if (campus.isDriving()) {
      if (!overlayOpen()) {
        if (event.key === "Escape") {
          campus.stopDriving();
          return;
        }

        if (event.key === "c" || event.key === "C") {
          event.preventDefault();
          updateChaseButton(campus.toggleChaseView());
        }

        return;
      }

      campus.stopDriving();
    }

    if (event.key === "Escape") {
      if (!$("#themeMenu").hidden) {
        setThemeMenuOpen(false, { restoreFocus: true });
        return;
      }

      if (!$("#packageMenu").hidden) {
        closePackageMenu();
        return;
      }

      if (state.packageDrawerOpen) {
        setPackageDrawerOpen(false);
        return;
      }

      if (!$("#settingsDrawer").hidden) {
        setSettingsOpen(false);
        return;
      }

      if (!$("#ticketModal").hidden) {
        closeTicketModal();
        return;
      }

      if (state.panelOpen) {
        setPanelOpen(false);
      }

      return;
    }

    if (
      event.key === "/" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingTarget(event.target) &&
      $("#ticketModal").hidden &&
      $("#settingsDrawer").hidden
    ) {
      event.preventDefault();
      setPackageDrawerOpen(true);
      return;
    }

    if (
      (event.key === "p" || event.key === "P") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingTarget(event.target)
    ) {
      event.preventDefault();
      setPanelOpen(!state.panelOpen);
      return;
    }

    if (
      (event.key === "a" || event.key === "A") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingTarget(event.target) &&
      $("#ticketModal").hidden &&
      $("#settingsDrawer").hidden
    ) {
      event.preventDefault();
      toggleAnimate();
      return;
    }

    if (
      (event.key === "c" || event.key === "C") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingTarget(event.target) &&
      $("#ticketModal").hidden &&
      $("#settingsDrawer").hidden
    ) {
      event.preventDefault();
      updateChaseButton(campus.toggleChaseView());
    }
  });

  $("#mockModeButton").addEventListener("click", () => setDataMode("mock"));
  $("#liveModeButton").addEventListener("click", () => setDataMode("live"));

  $("#loadJiraButton").addEventListener("click", () => {
    if (state.dataMode !== "live") {
      setDataMode("live");
      return;
    }

    synchronizeJira();
  });

  $("#stopJiraButton").addEventListener("click", () => {
    stopLiveSync();
  });

  $("#testConnection").addEventListener("click", async () => {
    const button = $("#testConnection");

    button.disabled = true;
    button.textContent = "…";

    try {
      const result = await api.checkConnection();

      $("#connectionDetails").textContent = result.displayName
        ? `Connected as ${result.displayName}`
        : "Connection OK";

      notify({
        type: "success",
        title: "Jira connection OK",
        message: result.site,
        timeout: 4000
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Jira connection failed",
        message: describeError(error)
      });
    } finally {
      button.disabled = false;
      button.textContent = "Test";
    }
  });

  $("#jiraTicketTag").addEventListener("input", (event) => {
    updateActiveTag(event.target.value);
    scheduleSaveSettings();
  });

  $("#jiraTicketTag").addEventListener("change", () => {
    if (state.dataMode === "live") {
      startLiveSync();
    }
  });

  for (const id of [
    "jiraProjectKey",
    "jiraQuantityField",
    "jiraIssueKey"
  ]) {
    $(`#${id}`).addEventListener("change", () => {
      scheduleSaveSettings({ restartSync: state.dataMode === "live" });
    });
  }

  $("#jiraPollInterval").addEventListener("change", () => {
    scheduleSaveSettings();
    state.transitions.clear();

    if (state.dataMode === "live") {
      startLiveSync();
    }
  });

  $("#jiraAutoRefresh").addEventListener("change", () => {
    scheduleSaveSettings();

    if (state.dataMode === "live") {
      startLiveSync();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      state.dataMode === "live" &&
      !state.pollTimer
    ) {
      startLiveSync();
    }
  });
}

/* ------------------------------------------------------------------
 * Bootstrap
 * ------------------------------------------------------------------ */

async function init() {
  window.christmasCampus = campus;

  wireEvents();
  renderThemeMenu();
  restorePanelState();
  restoreTheme();
  setAnimateButton(campus.isDemoRunning());
  setDataMode("mock");
  await loadBackend();
  renderState();

  state.urlWritesEnabled = true;

  if (!selectTicketFromUrl() && ticketKeyFromUrl()) {
    notify({
      type: "info",
      title: "Ticket not found",
      message: `${ticketKeyFromUrl()} is not part of the current workspace.`,
      timeout: 5000
    });
  }

  if (!state.config?.jira.configured) {
    setSyncState(
      "",
      "Mock data loaded",
      "Backend running without Jira credentials"
    );
  }
}

init().catch((error) => {
  console.error(error);
  notify({
    type: "error",
    title: "Startup failed",
    message: describeError(error)
  });
});
