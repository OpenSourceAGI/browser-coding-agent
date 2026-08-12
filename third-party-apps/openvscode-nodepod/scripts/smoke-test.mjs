#!/usr/bin/env node
// Boots the built workbench in a real browser and asserts the parts that
// prove the wiring works: the workbench renders, the explorer sees the
// Nodepod filesystem, and a terminal runs a command through Nodepod's shell.

import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:4321";
const URL_ = `${BASE}/workbench/workbench.html`;

const failures = [];
const consoleErrors = [];

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--enable-features=SharedArrayBuffer"],
});
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

console.log(`> loading ${URL_}`);
await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60_000 });

// 1. The boot splash goes away only after services init and parts mount.
try {
  await page.waitForSelector("#ovn-workbench:not(.ovn-hidden)", { timeout: 90_000 });
  check("workbench mounted", true);
} catch {
  const status = await page
    .textContent("#ovn-boot-status")
    .catch(() => "(no status)");
  const error = await page.textContent("#ovn-boot .ovn-error").catch(() => "");
  check("workbench mounted", false, `stuck at "${status}" ${error}`);
}

// 2. VS Code's own DOM appears inside our containers. Report every part so a
//    failure says which one is missing instead of just "something is wrong".
const parts = await page.evaluate(() =>
  [
    "titlebar",
    "banner",
    "activitybar",
    "sidebar",
    "editor",
    "panel",
    "auxiliarybar",
    "statusbar",
  ].map((id) => ({
    id,
    children: document.querySelector(`#ovn-${id}`)?.childElementCount ?? -1,
  })),
);
console.log(
  `  parts: ${parts.map((p) => `${p.id}=${p.children}`).join(" ")}`,
);
// The status bar and title bar parts are not shipped by monaco-vscode-api v36,
// so they are expected to be absent — the point of checking is that their
// absence stays graceful instead of breaking the layout.
for (const id of ["activitybar", "sidebar", "editor", "panel"]) {
  const part = parts.find((p) => p.id === id);
  check(`${id} part attached`, (part?.children ?? 0) > 0);
}

// 3. A terminal, end to end: VS Code terminal -> backend -> headless xterm
//    -> Nodepod shell -> Nodepod VFS.
// xterm renders to a canvas when WebGL is available, so terminal text is not
// in the DOM to scrape. Assert on what the shell *did* instead: run a command
// that writes a file and check the file through the runtime's filesystem.
// That covers the whole chain — VS Code terminal, the backend, the headless
// xterm shim, Nodepod's shell, and the volume.
const PROOF = "/workspace/.terminal-proof";

// Tap the driver before the terminal is created so a failure can say whether
// the keystrokes ever reached the shell, rather than just "no file".
await page.evaluate(() => {
  const driver = window.openvscodeNodepod.runtime.terminals;
  const create = driver.createPty.bind(driver);
  window.__ovnTrace = { input: "", output: "" };
  driver.createPty = async (opts) => {
    const pty = await create(opts);
    const write = pty.write.bind(pty);
    pty.write = (data) => {
      window.__ovnTrace.input += data;
      write(data);
    };
    pty.onData((d) => {
      window.__ovnTrace.output += d;
    });
    return pty;
  };
});

try {
  // Ctrl+` toggles the panel and creates *and focuses* a single terminal.
  // Ctrl+Shift+` adds a second one, and then it is ambiguous which of them
  // holds focus.
  await page.keyboard.press("Control+`");
  await page.waitForSelector(".xterm", { timeout: 60_000 });

  // The workbench may have created this terminal before the trace hook was
  // installed, so the hook is diagnostics only — it cannot be used as a
  // readiness gate. Give the shell worker time to boot, then type.
  await page.waitForTimeout(10_000);
  await page.locator(".xterm").last().click({ force: true }).catch(() => {});

  await page.keyboard.type("echo nodepod-terminal-works > .terminal-proof");
  await page.keyboard.press("Enter");

  await page.waitForFunction(
    async (path) => {
      const runtime = window.openvscodeNodepod?.runtime;
      if (!runtime) return false;
      try {
        const bytes = await runtime.fs.readFile(path);
        return new TextDecoder().decode(bytes).includes("nodepod-terminal-works");
      } catch {
        return false;
      }
    },
    PROOF,
    { timeout: 90_000 },
  );
  check("terminal runs a command via Nodepod shell", true);
} catch {
  const trace = await page
    .evaluate(() => ({
      ...window.__ovnTrace,
      active: `${document.activeElement?.tagName}.${document.activeElement?.className}`.slice(
        0,
        80,
      ),
      terminals: document.querySelectorAll(".xterm").length,
    }))
    .catch(() => ({ input: "?", output: "?", active: "?", terminals: -1 }));
  check(
    "terminal runs a command via Nodepod shell",
    false,
    `${PROOF} not written; focus=${trace.active} terminals=${trace.terminals} pty input=${JSON.stringify(
      trace.input,
    )} output=${JSON.stringify((trace.output ?? "").slice(-120))}`,
  );
}

// 4. The explorer lists the seeded workspace — this is the filesystem
//    provider answering readdir over Nodepod's volume.
try {
  await page.keyboard.press("Control+Shift+E");
  await page.waitForSelector("text=server.js", { timeout: 30_000 });
  check("explorer lists Nodepod files", true);
} catch {
  check("explorer lists Nodepod files", false, "server.js never appeared");
}

// 5. Open a file: exercises readFile through the provider and the editor.
try {
  await page.click("text=server.js");
  await page.waitForSelector(".monaco-editor", { timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector(".monaco-editor")?.textContent?.includes("createServer"),
    { timeout: 30_000 },
  );
  check("file opens in editor", true);
} catch {
  check("file opens in editor", false, "editor never showed file contents");
}

await page.screenshot({ path: process.env.SMOKE_SHOT ?? "smoke.png", fullPage: false });

if (consoleErrors.length) {
  console.log("\n> console errors:");
  for (const err of consoleErrors.slice(0, 15)) console.log(`  - ${err.slice(0, 300)}`);
}

await browser.close();

console.log(
  failures.length === 0
    ? "\nall checks passed"
    : `\n${failures.length} check(s) failed: ${failures.join(", ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
