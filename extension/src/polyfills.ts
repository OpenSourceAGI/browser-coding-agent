import { Buffer } from "buffer";

/**
 * Best-effort Node-global shims for the shared web extension host worker.
 *
 * vscode-web's extension host is a Web Worker with no Node built-ins. Some
 * marketplace "browser"-target bundles are otherwise web-safe but still
 * reference `process.platform`, `process.env`, `Buffer` or `global` ambiently
 * — not through `require` — and throw at activation for lack of them instead
 * of failing at bundle time. Every extension loaded into vscode-web shares
 * this one worker realm, so installing the shim once, before anything else
 * activates, helps every extension in the session, not just this one.
 *
 * This cannot make real Node extensions (native bindings, `child_process`,
 * `net`, a `main` entry point) work — that needs a real Node extension host
 * process. See `opends.openFullEditor`, which opens one.
 */
export function installNodeCompatPolyfills(): void {
  const target = globalThis as Record<string, unknown>;
  if (target.__opendsPolyfilled) return;
  target.__opendsPolyfilled = true;

  if (!target.Buffer) target.Buffer = Buffer;
  if (!target.global) target.global = globalThis;

  const nextTick = (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    queueMicrotask(() => fn(...args));

  if (!target.process) {
    target.process = {
      platform: "browser",
      env: {},
      version: "v20.0.0",
      versions: { node: "20.0.0" },
      argv: [],
      cwd: () => "/",
      nextTick,
      on: () => {},
      off: () => {},
      emit: () => false,
      browser: true,
    };
    return;
  }

  // A partial shim may already exist (another extension's polyfill, or a
  // future host change) — fill only what's missing rather than overwrite it.
  const proc = target.process as Record<string, unknown>;
  proc.env ??= {};
  proc.platform ??= "browser";
  proc.nextTick ??= nextTick;
}
