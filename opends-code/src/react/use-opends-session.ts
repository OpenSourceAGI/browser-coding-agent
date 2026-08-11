"use client";

import { useEffect, useMemo, useState } from "react";
import { OpenDSSession } from "../client/session.js";
import type { OpenDSCodeConfig } from "../client/config.js";
import type {
  PreviewPortDTO,
  RuntimeInfoDTO,
  SyncStatusDTO,
} from "../protocol/messages.js";

export interface UseOpenDSSessionResult {
  session: OpenDSSession;
  info: RuntimeInfoDTO | null;
  sync: SyncStatusDTO | null;
  previews: PreviewPortDTO[];
  error: Error | null;
}

/**
 * Creates and owns a session without rendering the workbench — for hosts that
 * want the runtime (file access, terminals, sync status in their own chrome)
 * and mount the editor separately, or not at all.
 */
export function useOpenDSSession(
  config: OpenDSCodeConfig,
): UseOpenDSSessionResult {
  const [info, setInfo] = useState<RuntimeInfoDTO | null>(null);
  const [sync, setSync] = useState<SyncStatusDTO | null>(null);
  const [previews, setPreviews] = useState<PreviewPortDTO[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Built once: a session owns a Nodepod runtime, so recreating it on every
  // render would thrash workers and lose the workspace.
  const session = useMemo(
    () =>
      new OpenDSSession(config, {
        onReady: setInfo,
        onSyncStatus: setSync,
        onPreview: (preview) =>
          setPreviews((current) =>
            current.some((entry) => entry.port === preview.port)
              ? current
              : [...current, preview],
          ),
        onError: setError,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    let cancelled = false;
    session.start().catch((bootError: unknown) => {
      if (!cancelled) {
        setError(bootError instanceof Error ? bootError : new Error(String(bootError)));
      }
    });
    return () => {
      cancelled = true;
      void session.dispose();
    };
  }, [session]);

  return { session, info, sync, previews, error };
}
