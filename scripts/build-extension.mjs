/*
 * Assembles the Chrome/Firefox extension into ./dist/extension.
 *
 * Sources:
 *  - public/          campus UI (index.html, app.js, engine.js, layout.js, styles.css)
 *  - extension-src/   extension-only modules (manifest, options page, api)
 *  - node_modules/     vendored three.js (patched to relative imports)
 *
 * The campus page keeps its original file layout so js/app.js can keep
 * importing "./api.js" — inside the extension that path resolves to the
 * local Jira client instead of the fetch wrapper for the Node proxy.
 *
 * All patches use exact string matching and fail the build when the source
 * changes, so drift between the web app and the extension is detected
 * immediately instead of silently producing a broken build.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateIconSet } from "./generate-icons.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist", "extension");
const publicDir = join(root, "public");
const sourceDir = join(root, "extension-src");
const threeModule = join(root, "node_modules", "three", "build", "three.module.js");
const orbitControls = join(
  root,
  "node_modules",
  "three",
  "examples",
  "jsm",
  "controls",
  "OrbitControls.js"
);

function log(step) {
  console.log(`▸ ${step}`);
}

function replaceExact(content, from, to, label, { all = false } = {}) {
  const occurrences = content.split(from).length - 1;

  if (occurrences === 0) {
    throw new Error(`Patch target not found: ${label}`);
  }

  if (!all && occurrences > 1) {
    throw new Error(
      `Patch target "${label}" is ambiguous (${occurrences} occurrences)`
    );
  }

  return content.split(from).join(to);
}

async function readText(file) {
  return readFile(file, "utf8");
}

async function writeText(file, content) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

/* ------------------------------------------------------------------
 * Patchers
 * ------------------------------------------------------------------ */

async function buildCampusHtml() {
  const source = await readText(join(publicDir, "index.html"));

  let html = source;

  html = replaceExact(
    html,
    `content="Jira Flowyard is an interactive 3D visualizer that shows Jira tickets as parcels moving through a campus. The Node app uses a server-side Jira proxy."`,
    `content="Jira Flowyard is an interactive 3D visualizer that shows Jira tickets as parcels moving through a campus. The browser extension talks to the Jira REST API directly."`,
    "meta description"
  );

  html = replaceExact(
    html,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    `<link rel="icon" href="favicon.svg" type="image/svg+xml" />`,
    "favicon link"
  );

  html = replaceExact(
    html,
    `<link rel="stylesheet" href="/css/styles.css" />`,
    `<link rel="stylesheet" href="css/styles.css" />`,
    "stylesheet link"
  );

  html = replaceExact(
    html,
    `    <!--
      The import map lets the browser resolve the bare "three" specifier that
      three.js addons such as OrbitControls use internally.
    -->
    <script type="importmap">
      {
        "imports": {
          "three": "/vendor/three/build/three.module.js",
          "three/addons/": "/vendor/three/examples/jsm/"
        }
      }
    </script>`,
    `    <!--
      Extension pages run under a strict CSP without inline scripts, so there
      is no import map: engine.js and OrbitControls.js use relative imports
      patched in by scripts/build-extension.mjs.
    -->`,
    "import map"
  );

  html = replaceExact(
    html,
    `              <small>
                Server-side REST proxy · credentials stay on the backend
              </small>`,
    `              <small>
                Direct Jira REST · credentials stay in this browser
              </small>`,
    "api panel heading"
  );

  html = replaceExact(
    html,
    `            <span id="apiModeBadge">Mock</span>
          </div>`,
    `            <span id="apiModeBadge">Mock</span>

            <button
              id="openOptions"
              class="small-button"
              type="button"
              title="Open the Jira settings"
            >
              ⚙
            </button>
          </div>`,
    "options button"
  );

  html = replaceExact(
    html,
    `<small id="connectionDetails">Waiting for /api/config</small>`,
    `<small id="connectionDetails">Waiting for settings</small>`,
    "connection details placeholder"
  );

  html = replaceExact(
    html,
    `          <p class="api-warning">
            The browser only calls <code>/api/jira/*</code>. Credentials live in
            <code>.env</code> on the server, which also resolves CORS.
          </p>`,
    `          <p class="api-warning">
            This page talks to <code>/rest/api/3</code> of your Jira directly.
            Credentials are stored locally by the extension and never leave
            this browser.
          </p>`,
    "api warning paragraph"
  );

  html = replaceExact(
    html,
    `<script type="module" src="/js/app.js"></script>`,
    `<script type="module" src="js/app.js"></script>`,
    "app script tag"
  );

  await writeText(join(outDir, "index.html"), html);
}

async function buildAppJs() {
  const source = await readText(join(publicDir, "js", "app.js"));

  let js = source;

  js = replaceExact(
    js,
    `"Start the Node server with npm start"`,
    `"Open the extension options (⚙) and configure Jira"`,
    "backend unavailable hint"
  );

  js = replaceExact(
    js,
    `"Jira proxy not configured"`,
    `"Jira is not configured"`,
    "not-configured title",
    { all: true }
  );

  js = replaceExact(
    js,
    `"Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env"`,
    `"Open the extension options (⚙) and add your Jira credentials"`,
    "env credentials hint",
    { all: true }
  );

  js = replaceExact(
    js,
    "`Server-side auth for ${jira.account}`",
    "`Direct REST auth for ${jira.account}`",
    "auth copy"
  );

  js = replaceExact(
    js,
    `"Server-side authentication"`,
    `"Direct REST authentication"`,
    "auth copy (fallback)"
  );

  js = replaceExact(
    js,
    `"The backend has no Jira credentials. Copy .env.example to .env and restart the server."`,
    `"Add your Jira credentials in the extension options (⚙)."`,
    "synchronize notify message"
  );

  js = replaceExact(
    js,
    `"GET /api/jira/tickets/{key}"`,
    `"GET /rest/api/3/issue/{key}"`,
    "single ticket hint"
  );

  js = replaceExact(
    js,
    `"GET /api/jira/tickets via backend proxy"`,
    `"Search via /rest/api/3/search/jql"`,
    "search hint"
  );

  js = replaceExact(
    js,
    `title: "Live mode needs a configured backend",`,
    `title: "Live mode needs Jira credentials",`,
    "live mode notify title"
  );

  js = replaceExact(
    js,
    `"Copy .env.example to .env, fill in the Jira credentials and restart the server."`,
    `"Open the extension options (⚙) and add your Jira credentials."`,
    "live mode notify message"
  );

  js = replaceExact(
    js,
    `setSyncState("loading", "Connecting to Jira…", "via backend proxy");`,
    `setSyncState("loading", "Connecting to Jira…", "directly from this browser");`,
    "connecting detail"
  );

  js = replaceExact(
    js,
    `"Backend running without Jira credentials"`,
    `"Running in mock mode without Jira credentials"`,
    "init mock hint"
  );

  js = replaceExact(
    js,
    `title: "Backend not reachable",`,
    `title: "Settings could not be loaded",`,
    "load backend notify title"
  );

  js = replaceExact(
    js,
    `  $("#mockModeButton").addEventListener("click", () => setDataMode("mock"));
  $("#liveModeButton").addEventListener("click", () => setDataMode("live"));`,
    `  $("#mockModeButton").addEventListener("click", () => setDataMode("mock"));
  $("#liveModeButton").addEventListener("click", () => setDataMode("live"));

  $("#openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage?.onChanged?.addListener?.(() => {
    loadBackend();
  });`,
    "extension event listeners"
  );

  await writeText(join(outDir, "js", "app.js"), js);
}

async function buildEngineJs() {
  const source = await readText(join(publicDir, "js", "engine.js"));

  let js = source;

  js = replaceExact(
    js,
    `import * as THREE from "three";`,
    `import * as THREE from "../vendor/three/build/three.module.js";`,
    "three import"
  );

  js = replaceExact(
    js,
    `import { OrbitControls } from "three/addons/controls/OrbitControls.js";`,
    `import { OrbitControls } from "../vendor/three/examples/jsm/controls/OrbitControls.js";`,
    "OrbitControls import"
  );

  await writeText(join(outDir, "js", "engine.js"), js);
}

async function buildVendor() {
  if (!existsSync(threeModule) || !existsSync(orbitControls)) {
    throw new Error(
      "three.js is missing from node_modules. Run npm install first."
    );
  }

  const controls = (await readText(orbitControls)).replace(
    /} from 'three';/,
    "} from '../../../build/three.module.js';"
  );

  if (controls.includes("from 'three'")) {
    throw new Error(
      "OrbitControls.js still contains a bare 'three' import after patching"
    );
  }

  await writeText(
    join(outDir, "vendor", "three", "examples", "jsm", "controls", "OrbitControls.js"),
    controls
  );
  await writeText(
    join(outDir, "vendor", "three", "build", "three.module.js"),
    await readText(threeModule)
  );
}

async function buildManifest() {
  const { version } = JSON.parse(await readText(join(root, "package.json")));
  const manifest = await readText(join(sourceDir, "manifest.json"));

  await writeText(
    join(outDir, "manifest.json"),
    replaceExact(
      manifest,
      `"version": "1.0.0"`,
      `"version": "${version}"`,
      "manifest version"
    )
  );
}

async function validateRelativeImports() {
  async function jsFiles(directory) {
    const files = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await jsFiles(path)));
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(path);
      }
    }

    return files;
  }

  const pattern = /(?:from\s+|import\s*\()["'](\.[^"']+)["']/g;
  const missing = [];

  for (const file of await jsFiles(outDir)) {
    const source = await readText(file);

    for (const match of source.matchAll(pattern)) {
      const target = resolve(dirname(file), match[1]);

      if (!existsSync(target)) {
        missing.push(`${relative(outDir, file)} → ${match[1]}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Unresolved relative imports:\n  ${missing.join("\n  ")}`);
  }
}

async function syntaxCheck() {
  const files = [
    "background.js",
    "options.js",
    "js/app.js",
    "js/engine.js",
    "js/layout.js",
    "js/api.js",
    "js/lib/jira-client.js",
    "js/lib/jql.js",
    "js/lib/normalize.js",
    "js/lib/settings.js",
    "js/lib/status.js",
    "js/lib/storage.js",
    "vendor/three/build/three.module.js",
    "vendor/three/examples/jsm/controls/OrbitControls.js"
  ];

  for (const file of files) {
    execFileSync(process.execPath, ["--check", join(outDir, file)], {
      stdio: "inherit"
    });
  }
}

async function main() {
  await buildExtension();

  console.log(
    `\n✓ Extension built into ${relative(root, outDir)}/\n` +
      `  Chrome:    chrome://extensions → Developer mode → Load unpacked\n` +
      `  Firefox:   about:debugging → This Firefox → Load Temporary Add-on\n` +
      `            (or build a zip and sign it via web-ext for permanent use)`
  );
}

export const extensionDir = outDir;

export async function buildExtension() {
  log("Cleaning previous build output");
  await rm(outDir, { recursive: true, force: true });

  log("Copying extension sources");
  await cp(sourceDir, join(outDir), { recursive: true });

  log("Patching manifest with the package version");
  await buildManifest();

  log("Building campus page, app and engine");
  await cp(join(publicDir, "css"), join(outDir, "css"), { recursive: true });
  await cp(join(publicDir, "favicon.svg"), join(outDir, "favicon.svg"));
  await cp(join(publicDir, "js", "layout.js"), join(outDir, "js", "layout.js"));
  await buildCampusHtml();
  await buildAppJs();
  await buildEngineJs();

  log("Vendoring three.js with relative imports");
  await buildVendor();

  log("Generating icons");
  const icons = await generateIconSet(join(outDir, "icons"));
  for (const icon of icons) {
    console.log(`  ${relative(root, icon)}`);
  }

  log("Syntax-checking all scripts");
  await syntaxCheck();

  log("Validating relative imports");
  await validateRelativeImports();
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(`\n✗ Build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
