"use client";

import { OpenDSCode } from "@opensourceagi/opends-code/react";
import { createHttpStorage } from "@opensourceagi/opends-code/storage";
import { useMemo, useState } from "react";

/**
 * The whole editor page.
 *
 * `userId` comes from whatever authentication the host app already has —
 * NextAuth, Clerk, better-auth, a proxy header. This package never logs anyone
 * in; it just needs a stable id so the workspace lands in the right place.
 */
export default function EditorPage({ userId }: { userId: string }) {
  const [status, setStatus] = useState("starting…");

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
        "/README.md": "# Hello\n\nEdit me, then run `npm start` in the terminal.\n",
      },

      // Opt in to cloud terminals. The container is not created until someone
      // actually opens one.
      sandbox: { enabled: true },
    }),
    [userId],
  );

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <header
        style={{
          padding: "6px 12px",
          font: "12px system-ui",
          background: "#181818",
          color: "#ccc",
        }}
      >
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
          onPreview={(preview) => console.log("server ready", preview.url)}
          onError={(error) => setStatus(`error: ${error.message}`)}
        />
      </div>
    </main>
  );
}
