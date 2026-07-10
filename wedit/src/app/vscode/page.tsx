"use client";

export default function VSCodePage() {
  return (
    <iframe
      src="/vscode-app"
      style={{
        width: "100vw",
        height: "100vh",
        border: "none",
        display: "block",
        overflow: "hidden",
      }}
      allow="cross-origin-isolated"
      title="OpenVSCode IDE"
    />
  );
}
