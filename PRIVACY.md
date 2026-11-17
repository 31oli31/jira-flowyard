# Privacy Policy — Jira Flowyard

**Last updated: 2026-11-17**

Jira Flowyard is a local browser extension for visualizing Jira tickets in 3D.
The developer operates no servers, collects no analytics, and receives no data
from you.

## What the extension stores

- **Jira base URL, account email and API token** — entered by you in the
  extension options page and stored only in your browser's
  `chrome.storage.local`. The storage area is restricted to trusted extension
  contexts. You can remove everything at any time with the **Reset** button in
  the options page.
- **Theme and panel preferences** — stored locally in `localStorage` so the
  visualizer remembers your settings.

## What the extension transmits

When you configure a Jira instance and switch to live mode, the extension
sends requests **directly from your browser to the Jira REST API of the host
you configured** (`/rest/api/3/...`). This includes your credentials and the
ticket data needed to render the board. No data is sent to the developer or to
any other third party. Without configuration the extension runs entirely in
mock mode and makes no network requests to Jira.

## Permissions

- `storage` — to keep your settings locally.
- `optional_host_permissions` for `https://*/*` — only used if you configure a
  Jira host; access is granted by you in the browser prompt.

## Third-party components

The extension bundles [three.js 0.128.0](https://github.com/mrdoob/three.js/tree/r128)
(MIT), used for 3D rendering. It runs locally and does not contact any server.

## Contact

Questions about this policy can be opened as an issue in the
[GitHub repository](https://github.com/31oli31/jira-flowyard).
