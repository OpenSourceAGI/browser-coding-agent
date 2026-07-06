"use client";
import { useEffect } from "react";

const STYLE_ID = "np-pulse-keyframes";

/**
 * Fullscreen loading overlay with "Nodepod" text that gently pulses.
 * Injects keyframes once via useEffect to avoid re-creating <style> on every render.
 */
export function LoadingOverlay() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `@keyframes np-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`;
    document.head.appendChild(style);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg0">
      <span
        className="text-[40px] font-semibold text-white select-none"
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          animation: "np-pulse 2s ease-in-out infinite",
        }}
      >
        Nodepod
      </span>

      <p
        className="fixed bottom-6 text-[11px] tracking-widest lowercase"
        style={{ color: "var(--text5)", opacity: 0.6 }}
      >
        booting...
      </p>
    </div>
  );
}
