# 🎄 Flowyard — 3D Jira Logistics Campus

An interactive 3D visualization of a Jira board: tickets travel as parcels along
four conveyor belts (To Do → In Progress → In Review → In Testing). The UI runs
entirely in the browser; **all Jira communication goes through the Node backend
proxy** — no CORS issues, no credentials in the frontend.

```
Browser ──HTTP──▶ Express (server/) ──Basic/Bearer──▶ Jira Cloud REST API
   │                    │
   │                    └─ data/settings.json (non-secret UI settings)
   └─ Three.js (local, from node_modules/three)
```

## Features

- **3D campus** with conveyor belts, forklifts and five themes (Corporate,
  Christmas, Halloween, Summer, Night Shift), built with Three.js 0.128. Each
  theme brings its own colors, lighting, decorations and weather particles
  (snow, embers, petals, neon sparks).
- **Live KPIs**: the top bar counts active parcels, tickets in progress
  (`In Progress`, `In Review`, `In Testing`) and already delivered parcels
  (`Released`) directly from the loaded tickets — no estimated values.
- **Animate mode** (`A` or ▶ in the top bar): a scripted demo run sends parcels
  through the lanes, starts the release animation and moves the truck back and
  forth. Purely visual, with no write access to Jira; in live mode the button
  stays disabled with a hint.
- **Theme picker** as an accessible dropdown (button + `listbox` with keyboard
  navigation). The selection is stored in `localStorage` and in the URL.
- **More readable tickets**: the Jira key is printed as a label on every parcel;
  hovering shows the ticket title in a tooltip (plus status/meta).
- **Lively decorations (Christmas)**: elves, Santa, gingerbread men, snowmen,
  nutcrackers and standing reindeer react to clicks with random animations
  (jumping, dancing or running in circles).
- **Sleigh release (Christmas)**: on a release, the sleigh with reindeer (instead
  of the driving truck) takes off from gate 4, builds up speed, circles above
  the warehouse at varying altitude, drops the parcel over the warehouse and
  lands again. The route is regenerated for every flight as a random closed
  spline (centripetal Catmull-Rom, arc-length parameterized) — takeoff and
  landing always sit on the straight road, while the loop in between is
  different every time. The team always moves forward (heading follows the
  actual direction of travel) and the sleigh bends like a trailer according to
  the curve. User driving interrupts the flight.
- **Driver's view (cockpit)**: `C` or 🎥 in the scene tools puts the camera in the
  driver's seat — in the sleigh while flying, in the truck while driving. The
  camera follows the vehicle and looks in the direction of travel, including
  yaw, pitch and (damped) roll; a real perspective camera is used instead of
  the orthographic overview. Hold the mouse button to turn your head (limited
  viewing angle, double-click re-centers); turning it off restores the previous
  view exactly.
- **Easter egg**: clicking the truck (or the sleigh in the Christmas theme) makes
  it drivable — `WASD`/arrow keys steer, `Esc` leaves it standing, a double-click
  resets it to the loading area. Animate and release animations take over the
  vehicle and end driving mode.
- **Tidy UI**: the ticket panel is collapsed by default (`P` or ☰ opens it) and
  the Jira settings live in their own drawer (⚙). The panel state is remembered
  locally.
- **Parcel context menu**: right-clicking a parcel opens actions for workflow
  status, release, camera focus, "Open in Jira" and "Copy ticket key" — with
  keyboard navigation and `Esc` to close.
- **Parcel browser**: `/` or 📦 opens a searchable parcel list with status filters
  and live counters. Matches are highlighted in the 3D campus, non-matching
  parcels are dimmed; clicking selects a parcel, Enter additionally opens the
  detail panel.
- **Deep links**: `?theme=christmas` starts directly in Christmas mode,
  `#DEMO-1026` (or `?ticket=DEMO-1026`) selects a parcel, zooms to it and opens
  the detail panel. Selection and theme are kept in the URL so states can be
  linked.
- **Sync feedback**: loading state with skeletons in the parcel list, a
  retry/settings banner on errors and a hint when Jira returns no tickets;
  status changes are announced via a live region.
- **Mock mode** without Jira access: 40 sample parcels, workflow buttons and
  ticket creation work locally.
- **Live mode** against Jira Cloud: load tickets by JQL/label/project, automatic
  polling, change workflow status via Jira transitions, create tickets in a
  modal, test the connection.
- **Status mapping**: arbitrary Jira workflow names map to six lanes
  (`To Do`, `In Progress`, `In Review`, `In Testing`, `Release`,
  `Released`) — including aliases for common names and overrides via
  `JIRA_STATUS_MAP`.
- **Security**: credentials only server-side, rate limiting, CSP/security
  headers, JQL injection protection, validated settings, timeouts and retries.

## Quick Start

Requires Node.js ≥ 20.12 (developed with Node 24).

```bash
npm install
cp .env.example .env      # fill in values
npm start                 # http://127.0.0.1:3000
```

For development with auto-reload:

```bash
npm run dev
```

Without a `.env` the app starts in mock mode. On startup the server reports
whether a `.env` was loaded and whether the Jira proxy is active.

## Controls

| Input | Action |
|-------|--------|
| Left-click parcel | Select parcel |
| Right-click parcel | Context menu: details, status change, release, Jira link, copy key |
| Double-click parcel | Next workflow status |
| Click truck/sleigh | Easter egg: take over the vehicle (`WASD` or arrow keys) |
| Click decoration (Christmas) | Random animation: jump, dance or run in circles |
| Double-click truck/sleigh | Reset vehicle to the loading area |
| `Esc` (in vehicle) | Leave the vehicle standing |
| `A` | Start/stop animate mode |
| `C` | Toggle driver's view/cockpit |
| `/` | Open parcel browser with search and status filters |
| `P` | Show/hide ticket panel |
| `Esc` | Close theme menu, context menu, parcel browser, settings, panel or modal |
| 📦 in the top bar | Open parcel browser |
| ⚙ in the top bar | Open Jira settings as a drawer |
| ▶ in the top bar | Start/stop animate mode |
| 🎥 in the scene tools | Toggle driver's view/cockpit |

### Themes

| ID | Name | Mood |
|----|------|------|
| `corporate` | Corporate | Daylight campus, no weather |
| `christmas` | Christmas | Snow, workshop decorations, pink sky, sleigh flight with parcel drop on release |
| `halloween` | Halloween | Pumpkins, bats, fog, embers |
| `summer` | Summer | Harbor, palm trees, petals |
| `neon` | Night Shift | Night shift, neon rings, sparks |

The theme changes the palette, lighting, decorations and weather particles of
the scene. Particles are rendered in three depth layers; the frontmost layer
ignores the depth buffer so snowflakes are always visible even with the
orthographic camera.

### URL State

| Parameter | Example | Effect |
|-----------|---------|--------|
| `theme` | `?theme=christmas` | Starts in Christmas mode (`corporate` is the default and is not written) |
| `ticket` | `?ticket=DEMO-1026` | Selects a parcel and opens the panel |
| Hash | `#DEMO-1026` | Same as `?ticket=`, good for Slack and review links |

The app writes the current selection and theme back to the URL via
`history.replaceState`. Switching themes sets or removes the theme parameter
accordingly.

## Configuration (`.env`)

`.env` is read server-side only (`process.loadEnvFile`) and excluded via
`.gitignore`.

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Listen address. In the container use `HOST=0.0.0.0`. |
| `JIRA_BASE_URL` | – | e.g. `https://your-domain.atlassian.net` |
| `JIRA_AUTH_MODE` | automatic | `basic` (email + API token), `bearer` (PAT), `none` |
| `JIRA_EMAIL` | – | Atlassian account for basic auth |
| `JIRA_API_TOKEN` | – | API token or PAT |
| `JIRA_LABEL` | – | Initial value for the label filter |
| `JIRA_PROJECT_KEY` | – | Initial value for the project filter |
| `JIRA_ISSUE_KEY` | – | Load a single ticket |
| `JIRA_QUANTITY_FIELD` | – | optional Jira field for the parcel quantity |
| `JIRA_POLL_INTERVAL_MS` | `15000` | Polling interval |
| `JIRA_AUTO_REFRESH` | `true` | Auto-refresh on start |
| `JIRA_MAX_RESULTS` | `200` | Upper limit per search |
| `JIRA_ISSUE_TYPE` | `Task` | Issue type when creating tickets |
| `JIRA_STATUS_MAP` | `{}` | JSON overrides, e.g. `{"Peer Review":"In Review"}` |
| `JIRA_TIMEOUT_MS` | `12000` | HTTP timeout per Jira call |
| `JIRA_RETRIES` | `2` | Retries on 429/5xx |
| `JIRA_CACHE_TTL_MS` | `5000` | Server cache for search results |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `240` | API rate limit |
| `SETTINGS_FILE` | `data/settings.json` | Path of the UI settings |

Non-secret UI settings (label, project, interval, …) are saved via
`PUT /api/config` to `data/settings.json`. The file is written atomically and
validated against the defaults on startup.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Production start (`server/index.js`) |
| `npm run dev` | Start with `--watch` |
| `npm test` | All unit/API tests (`node --test test/*.test.js`) |
| `npm run test:e2e` | Headless-Chrome smoke test of the UI |
| `npm run check` | Syntax check of server and frontend modules |
| `npm run build:extension` | Build extension to `dist/extension` |
| `npm run dist` | Build extension plus store archives and checksums |
| `npm run icons` | Regenerate extension icons |

## API

All routes live under `/api`, respond with JSON and are rate-limited. Errors have
the form `{ "error": { "message": "...", "hint"?: "..." } }`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Status, version, `jiraConfigured` |
| `GET` | `/api/config` | App and Jira configuration (without secrets) + capabilities |
| `PUT` | `/api/config` | Change allowed settings: `label`, `projectKey`, `quantityField`, `issueKey`, `pollIntervalMs`, `autoRefresh`, `maxResults` |
| `GET` | `/api/jira/connection` | Connection test (`/myself`) |
| `GET` | `/api/jira/projects` | Visible projects (key/name) |
| `GET` | `/api/jira/tickets` | Search; query parameters `label`, `project`, `issueKey`, `maxResults` |
| `GET` | `/api/jira/tickets/:key` | Single ticket |
| `POST` | `/api/jira/tickets` | Create ticket (`summary` required; optional `projectKey`, `label`, `description`, `quantity`, `quantityField`, `issueType`) |
| `GET` | `/api/jira/tickets/:key/transitions` | Available transitions |
| `POST` | `/api/jira/tickets/:key/transitions` | Run a transition (`transitionId` or `targetStatus`) |

Normalized ticket:

```json
{
  "tickets": [
    {
      "id": "DEMO-2219",
      "title": "Improve client decorator logging",
      "status": "In Progress",
      "jiraStatus": "In Progress",
      "quantity": 1,
      "tag": "#christmas-2026",
      "labels": ["christmas-2026"],
      "updated": "2026-11-09T23:06:01.316+0100",
      "priority": "Major",
      "assignee": "Alex Example",
      "issueType": "Task"
    }
  ],
  "meta": { "count": 1, "jql": "…", "cached": false, "fetchedAt": "…" }
}
```

## Status Mapping

Canonical lanes: `To Do`, `In Progress`, `In Review`, `In Testing` — plus
`Release` and `Released` for completed workflows. The mapping happens in
`server/lib/status.js`:

1. exact match on a canonical name,
2. alias table (e.g. `Code Reviewed`, `In Test PM`, `Ready For Integration`
   → `In Testing`; `In Code Review`, `Feedback` → `In Review`),
3. override from `JIRA_STATUS_MAP`,
4. fallback `To Do`.

Workflow buttons send the desired target status; the backend fetches the
available transitions and picks the matching one. If no transition is available
(e.g. because the workflow does not allow it), the API answers with an
explanatory error and the UI shows a toast.

## Project Structure

```
server/
  index.js            Bootstrap, load .env, start server
  app.js              Express app, security headers, static hosting
  config.js           Environment parsing and defaults
  routes/api.js       REST endpoints, validation, transition selection
  lib/jira-client.js  Jira REST (Basic/Bearer, retries, timeout, pagination)
  lib/status.js       Status mapping and overrides
  lib/jql.js          JQL builder with escaping
  lib/normalize.js    Jira issue → campus ticket
  lib/settings-store.js  Validated, atomic JSON persistence
  lib/cache.js        TTL cache
  lib/http.js         asyncHandler, errors, rate limiting
public/
  index.html          Markup, import map for Three.js
  css/styles.css      Layout, themes, modal, toasts
  js/engine.js        Three.js scene (campus, tickets, themes, weather, demo animation)
  js/app.js           UI state, workflow, modal, polling
  js/api.js           Fetch wrapper for /api
test/                 node:test suites (API, Jira client, JQL, status, settings, extension)
extension-src/        Extension sources: manifest.json, options page, ported Jira modules
scripts/              Build scripts (extension build, packaging, icon generation)
dist/                 Build output: extension/ + store archives (gitignored)
data/settings.json    Runtime settings (gitignored)
```

Three.js is not loaded from a CDN but served from `node_modules/three` under
`/vendor/three` and resolved in the browser via an inline import map as `three`
/ `three/addons/`. That's why the CSP allows `'unsafe-inline'` for `script-src`.

## Tests

```bash
npm test          # Unit/API tests
npm run test:e2e  # Headless-Chrome smoke test of the UI
```

The unit suites cover API routes including rate limiting and error responses,
the Jira client (auth, pagination, retry, fallback to offset search), JQL
escaping and injection protection, status mapping/aliases/overrides and the
atomic settings-store behavior including a corrupt file.

`npm run test:e2e` starts its own server on port `3311` (changeable via
`E2E_PORT`) and checks panel state, the parcel browser including search,
the context menu, deep links, the theme menu including URL updates, animate
mode, the data-driven KPIs and the narrow viewport. Snow visibility is
measured: the same frame is captured with and without the weather layer and the
differing pixels are counted. Requires an installed Chrome/Chromium; the path
can be set via `CHROME_PATH`. If the browser is missing, the test is skipped
rather than failed.

## Browser Extension (Chrome & Firefox)

The campus also runs as a standalone browser extension (Manifest V3) — no Node
server needed. The Jira REST API is called **directly from the browser**; the
proxy logic (JQL builder, status mapping, normalization, transition selection,
validation) was ported 1:1 into browser modules.

```
Toolbar icon ──▶ extension/index.html (campus page)
                     │
                     ├─ js/api.js          same interface as /api/*
                     │    └─ js/lib/*      ported server logic
                     └─ chrome.storage.local  credentials + settings (local)
```

### Build and install

```bash
npm install
npm run build:extension      # creates ./dist/extension
```

- **Chrome**: `chrome://extensions` → *Developer mode* → *Load unpacked* →
  select the `dist/extension` folder. The toolbar icon opens the campus in a tab.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary
  Add-on* → `dist/extension/manifest.json`.

### Distribution (`npm run dist`)

`npm run dist` builds the extension and additionally creates upload-ready
archives under `dist/`:

| Artifact | Purpose |
|----------|---------|
| `jira-flowyard-<version>-chrome.zip` | Chrome Web Store (manifest without Firefox keys) |
| `jira-flowyard-<version>-firefox.zip` | Mozilla Add-ons (with Gecko ID; rename to `.xpi` if needed) |
| `SHA256SUMS.txt` | SHA-256 checksums of both archives |

The archives are deterministic (fixed timestamps, sorted entries) and are
created directly in Node without external tools.

### Configuration

Credentials are maintained exclusively in the extension's options page
(⚙ in the Jira panel or right-click → Options):

- **Jira base URL** – Cloud (`…atlassian.net`) or self-hosted Jira
- **Auth** – automatic (email + API token → Basic, token only → Bearer),
  explicit Basic/Bearer or `none` for reverse-proxy setups
- **Status map** – JSON overrides like the server's `JIRA_STATUS_MAP`
- **Issue type** – default when creating tickets

On save **and** on the connection test, the extension requests **host
permission** for the Jira instance (once, via a browser dialog — the request
must happen synchronously within the click gesture; Chrome does not preserve
gestures across `await`s). If access is missing later, the Jira calls report a
clear error with instructions instead of a cryptic CORS log. Credentials live
only in `chrome.storage.local` — no sync, no server. `npm test` covers the
ported modules (JQL escaping, status mapping, settings schema, transition
selection, browser Jira client) with dedicated suites.

### Architecture notes

- `extension-src/` contains the extension sources; `scripts/build-extension.mjs`
  assembles `dist/extension` from those plus `public/` (campus page) and
  `node_modules/three` (patched to relative imports, since extension CSPs do
  not allow inline import maps).
- `scripts/package-extension.mjs` (`npm run dist`) additionally packs
  `dist/extension` as store archives and writes checksums.
- `js/api.js` implements the same interface as the old `/api` fetch wrapper;
  therefore `app.js` is identical apart from texts.
- All patches in the build script match exactly and deliberately fail the build
  on deviations.

## Docker

```bash
docker build -t jira-flowyard .
docker run --rm -p 3000:3000 --env-file .env \
  -e HOST=0.0.0.0 -e NODE_ENV=production \
  -v "$PWD/data:/app/data" jira-flowyard
```

Or with Compose:

```bash
docker compose up --build
```

The volume for `/app/data` keeps UI settings across container restarts. `.env`
is never copied into the image.

## Security

- Credentials exist only in `.env` or the process environment; `/api/config`
  returns only `configured`, `authMode`, site and filter values.
- `.env`, `data/settings.json`, `tmp/` and logs are gitignored.
- JQL values are escaped/validated; issue keys must match the pattern
  `PROJECT-123`.
- Security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`.
- Rate limiting applies to all `/api` routes; request bodies are limited to 64 kB.
- For public hosting: run behind a reverse proxy with TLS and authentication,
  set `HOST` deliberately and use a read-only API token if no write access is
  needed.

## Known Limitations

- No user management — the app is intended for local/internal use.
- Jira Cloud workflows differ per project; not every desired lane is reachable
  via a transition. The backend then returns an error instead of silently
  setting something else.
- The campus is a visualization, not a replacement for the Jira board; only the
  filters set in the UI are loaded.
- **Extension token**: the extension stores credentials in
  `chrome.storage.local`. For stronger security, `chrome.storage.session` or an
  OS keychain would be preferable; token scopes should be documented in the
  extension README.
- **i18n**: UI texts are English, this documentation is English as well. An
  `Intl`-based localization would cleanly separate the two.
- **Very large boards**: every parcel is rendered. For significantly more than
  the current ~200 tickets, clustering or LOD would be the next step.
