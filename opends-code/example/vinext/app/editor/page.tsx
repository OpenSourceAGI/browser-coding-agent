"use client";

import { OpenDSCode } from "@opensourceagi/opends-code/react";
import { createHttpStorage } from "@opensourceagi/opends-code/storage";
import { useMemo, useState } from "react";

/**
 * The editor page.
 *
 * `"use client"` matters here beyond the usual reason: the whole runtime is
 * browser-only, and the Worker that renders this route has no DOM, no
 * `SharedArrayBuffer` and no service worker. The component mounts an iframe and
 * boots Nodepod on the client; the server never touches either.
 *
 * `userId` would come from the host app's session. This example reads it from
 * the query string to stay runnable without a login — see `authorize()` in
 * worker/index.ts for why that is demo-only.
 */
export default function EditorPage() {
  const [status, setStatus] = useState("starting…");

  const userId = useMemo(() => {
    if (typeof location === "undefined") return "demo";
    return new URLSearchParams(location.search).get("user") ?? "demo";
  }, []);

  const config = useMemo(
    () => ({
      sessionId: userId,
      apiBase: "/api/opends",
      workspaceName: "project",

      // Persistence. Drop this and the workspace is purely in-memory: still a
      // complete editor, just gone on reload.
      storage: createHttpStorage({
        apiBase: "/api/opends",
        workspaceId: userId,
      }),

      // Seeded only when storage comes back empty, i.e. on the first visit.
      initialFiles: {
        "/package.json": JSON.stringify(
          { name: "hello", type: "module", scripts: { start: "node index.js" } },
          null,
          2,
        ),
        "/index.js": 'console.log("hello from the browser");\n',
        "/README.md":
          "# Hello\n\nEdit me, then run `npm start` in the terminal.\n",
      },

      // Opt in to cloud terminals. No container is created until someone
      // actually opens one.
      sandbox: { enabled: true },
    }),
    [userId],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <header style={{ padding: "6px 12px", font: "12px system-ui", background: "#181818" }}>
        OpenDS Code — {status}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <OpenDSCode
          config={config}
          onReady={() => setStatus("ready")}
          onSyncStatus={(sync) =>
            setStatus(
              sync.phase === "idle"
                ? sync.pending
                  ? `${sync.pending} pending`
                  : "saved"
                : sync.phase,
            )
          }
          onError={(error) => setStatus(`error: ${error.message}`)}
        />
      </div>
    </div>
  );
}
