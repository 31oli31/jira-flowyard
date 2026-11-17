/*
 * Builds the extension (dist/extension) and packages it as upload-ready
 * archives for the Chrome Web Store and Mozilla Add-ons:
 *
 *   dist/
 *     extension/                                 load-unpacked folder
 *     jira-flowyard-<v>-chrome.zip   CWS upload (no gecko keys)
 *     jira-flowyard-<v>-firefox.zip  AMO upload (with gecko id)
 *     SHA256SUMS.txt                              checksums for both archives
 *
 * The Chrome variant strips browser_specific_settings so the manifest stays
 * clean of Firefox-only keys; the Firefox variant is packaged as built.
 * Archives are deterministic (see scripts/lib/zip.mjs).
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtension, extensionDir } from "./build-extension.mjs";
import { createZip } from "./lib/zip.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

function log(step) {
  console.log(`▸ ${step}`);
}

function prettySize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function collectFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, base)));
    } else if (entry.isFile()) {
      files.push({
        path: relative(base, full).split("\\").join("/"),
        data: await readFile(full)
      });
    }
  }

  return files;
}

function chromeVariant(files) {
  const manifestEntry = files.find((entry) => entry.path === "manifest.json");

  if (!manifestEntry) {
    throw new Error("manifest.json is missing from the build output");
  }

  const manifest = JSON.parse(manifestEntry.data.toString("utf8"));

  if (!("browser_specific_settings" in manifest)) {
    throw new Error(
      "manifest.json lost browser_specific_settings — the Firefox build would be broken"
    );
  }

  const chromeManifest = {
    ...manifest,
    browser_specific_settings: undefined
  };

  delete chromeManifest.browser_specific_settings;

  return [
    ...files.filter((entry) => entry.path !== "manifest.json"),
    {
      path: "manifest.json",
      data: Buffer.from(`${JSON.stringify(chromeManifest, null, 2)}\n`, "utf8")
    }
  ];
}

async function cleanDistArtifacts() {
  await mkdir(distDir, { recursive: true });

  for (const entry of await readdir(distDir)) {
    if (entry.endsWith(".zip") || entry === "SHA256SUMS.txt") {
      await rm(join(distDir, entry), { force: true });
    }
  }
}

async function main() {
  log("Building dist/extension");
  await buildExtension();

  log("Collecting build output");
  const files = await collectFiles(extensionDir);
  const { version, name } = JSON.parse(
    await readFile(join(root, "package.json"), "utf8")
  );

  log("Writing archives");
  await cleanDistArtifacts();

  const slug = `${name}-${version}`;
  const archives = [
    { file: join(distDir, `${slug}-chrome.zip`), entries: chromeVariant(files) },
    { file: join(distDir, `${slug}-firefox.zip`), entries: files }
  ];

  const checksums = [];

  for (const archive of archives) {
    const zip = createZip(archive.entries);
    await writeFile(archive.file, zip);
    checksums.push(`${createHash("sha256").update(zip).digest("hex")}  ${relative(distDir, archive.file)}`);
    console.log(
      `  ${relative(root, archive.file)} (${prettySize(zip.length)}, ${archive.entries.length} files)`
    );
  }

  await writeFile(
    join(distDir, "SHA256SUMS.txt"),
    `${checksums.join("\n")}\n`,
    "utf8"
  );

  console.log(
    `\n✓ Distribution ready in ${relative(root, distDir)}/\n` +
      `  Load unpacked:    dist/extension (Chrome, Firefox)\n` +
      `  Chrome Web Store: upload ${slug}-chrome.zip\n` +
      `  Firefox AMO:      upload ${slug}-firefox.zip (or rename to .xpi)\n` +
      `  Checksums:        dist/SHA256SUMS.txt`
  );
}

main().catch((error) => {
  console.error(`\n✗ Packaging failed: ${error.message}`);
  process.exitCode = 1;
});
