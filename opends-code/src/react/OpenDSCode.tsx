"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { OpenDSCodeConfig } from "../client/config.js";
import type { OpenDSSession } from "../client/session.js";
import type {
  PreviewPortDTO,
  RuntimeInfoDTO,
  SyncStatusDTO,
} from "../protocol/messages.js";
import { mountOpenDSCode, type OpenDSCodeInstance } from "../workbench/mount.js";

export interface OpenDSCodeProps {
  config: OpenDSCodeConfig;
  /** Overrides the default `${apiBase}/workbench` route. */
  workbenchUrl?: string;
  className?: string;
  style?: CSSProperties;
  onReady?: (info: RuntimeInfoDTO, session: OpenDSSession) => void;
  onSyncStatus?: (status: SyncStatusDTO) => void;
  onPreview?: (preview: PreviewPortDTO) => void;
  onError?: (error: Error) => void;
}

/**
 * Drop-in editor.
 *
 * ```tsx
 * <OpenDSCode config={{ sessionId: user.id, apiBase: "/api/opends" }} />
 * ```
 *
 * The component mounts once and is deliberately not reactive to `config`
 * changes: rebooting a runtime mid-session would discard the workspace. Change
 * `key` to start a new session.
 */
export function OpenDSCode(props: OpenDSCodeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<OpenDSCodeInstance | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Read the latest callbacks without re-mounting when a parent re-renders with
  // fresh closures.
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || instanceRef.current) return;

    const instance = mountOpenDSCode({
      container,
      config: props.config,
      ...(props.workbenchUrl ? { workbenchUrl: props.workbenchUrl } : {}),
      onReady: (info) => handlers.current.onReady?.(info, instance.session),
      onSyncStatus: (status) => handlers.current.onSyncStatus?.(status),
      onPreview: (preview) => handlers.current.onPreview?.(preview),
      onError: (bootError) => {
        setError(bootError);
        handlers.current.onError?.(bootError);
      },
    });
    instanceRef.current = instance;

    // `start()` rejects on boot failure; `onError` has already reported it.
    instance.ready.catch(() => undefined);

    return () => {
      instanceRef.current = null;
      void instance.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#1f1f1f",
        ...props.style,
      }}
    >
      {error ? <BootError error={error} /> : null}
    </div>
  );
}

function BootError({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "#f85149",
        background: "#1f1f1f",
        font: '13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
        textAlign: "center",
        zIndex: 2,
      }}
    >
      <div>
        <strong>OpenDS Code failed to start</strong>
        <div style={{ marginTop: 8, color: "#c9d1d9" }}>{error.message}</div>
      </div>
    </div>
  );
}
