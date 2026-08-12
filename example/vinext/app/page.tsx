import Link from "next/link";

/**
 * A server component, rendered by vinext in the same Worker that serves the
 * editor routes. Nothing about the editor is imported here — the ~MB browser
 * runtime is only pulled in by the client component on /editor.
 */
export default function Home() {
  return (
    <main style={{ font: "14px/1.6 system-ui", padding: "48px 24px", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>OpenDS Code on vinext</h1>
      <p>
        The workbench, the filesystem, the shell and npm all run on the page.
        This Worker only answers storage calls and, if you open a cloud
        terminal, boots a container.
      </p>
      <p>
        <Link href="/editor" style={{ color: "#4daafc" }}>
          Open the editor →
        </Link>
      </p>
    </main>
  );
}
