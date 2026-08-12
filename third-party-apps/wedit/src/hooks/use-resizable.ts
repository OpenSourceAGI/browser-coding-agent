"use client";
import { useCallback, useRef, useEffect } from "react";

export type ResizeDirection = "horizontal" | "vertical";

export function useResizable(
  direction: ResizeDirection,
  onDelta: (delta: number) => void,
) {
  const dragging = useRef(false);
  const lastPos = useRef(0);
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;
  const dirRef = useRef(direction);
  dirRef.current = direction;
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount to avoid stuck cursor/userSelect
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;

    const isTouch = "touches" in e;
    lastPos.current = dirRef.current === "horizontal"
      ? (isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX)
      : (isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY);

    document.body.style.cursor = dirRef.current === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const isTouchEv = "touches" in ev;
      const pos = dirRef.current === "horizontal"
        ? (isTouchEv ? ev.touches[0].clientX : (ev as MouseEvent).clientX)
        : (isTouchEv ? ev.touches[0].clientY : (ev as MouseEvent).clientY);
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      if (delta !== 0) onDeltaRef.current(delta);
    };
    const cleanup = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", cleanup);
      window.removeEventListener("touchcancel", cleanup);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", cleanup);
    window.addEventListener("touchcancel", cleanup);
  }, []);

  return onMouseDown;
}
