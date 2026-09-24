// Starts a fresh Chrome with the Stagehand runtime extension loaded, and
// connects Stagehand to it.
//
// Stagehand 4 runs its page logic inside a Chrome extension. Its own
// localBrowser.launch() installs that extension with the DevTools command
// Extensions.loadUnpacked, which the Chromium build in the Playwright image
// rejects ("Method not available"). Loading the extension with the
// --load-extension flag at startup works on any Chromium build, so this file
// starts Chrome itself and hands it to Stagehand with localBrowser.connect().

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localBrowser } from "@browserbasehq/stagehand";

// The extension ships inside the Stagehand package, next to its entry file.
const EXTENSION_DIR = realpathSync(
  join(dirname(fileURLToPath(import.meta.resolve("@browserbasehq/stagehand"))), "extension"),
);

// Chrome gives an unpacked extension an id derived from its folder path:
// the first 32 hex characters of sha256(path), with 0-f mapped to a-p.
const EXTENSION_ID = [...createHash("sha256").update(EXTENSION_DIR).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");

// CHROME_PATH wins. Otherwise use the Chromium that ships with the Playwright
// image (PLAYWRIGHT_BROWSERS_PATH, /ms-playwright in the official image).
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/ms-playwright";
  const builds = existsSync(root)
    ? readdirSync(root).filter((name) => name.startsWith("chromium-")).sort().reverse()
    : [];
  for (const build of builds) {
    for (const folder of ["chrome-linux64", "chrome-linux"]) {
      const candidate = join(root, build, folder, "chrome");
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`No Chromium found under ${root}. Set CHROME_PATH to a Chromium binary.`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForChrome(cdpUrl, chrome, stderrTail) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited with code ${chrome.exitCode}.\n${stderrTail()}`);
    }
    try {
      if ((await fetch(`${cdpUrl}/json/version`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome did not open its DevTools port within 20s.\n${stderrTail()}`);
}

export async function startBrowser() {
  const chromePath = findChrome();
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "stagehand-chrome-"));

  const chrome = spawn(
    chromePath,
    [
      "--headless",
      "--no-sandbox", // the container runs as root
      "--disable-dev-shm-usage", // pods get a small /dev/shm
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--enable-unsafe-extension-debugging",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--load-extension=${EXTENSION_DIR}`,
      `--disable-extensions-except=${EXTENSION_DIR}`,
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });

  const cdpUrl = `http://127.0.0.1:${port}`;
  const stop = () => {
    chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  };

  try {
    await waitForChrome(cdpUrl, chrome, () => stderr);
    const browser = await localBrowser.connect({ cdpUrl, extensionId: EXTENSION_ID });
    return { browser, stop, chromePath };
  } catch (error) {
    stop();
    throw error;
  }
}
