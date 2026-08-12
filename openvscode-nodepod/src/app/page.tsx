const FEATURES = [
  {
    title: "Filesystem",
    body: "An in-memory volume backs VS Code's file:// scheme, so the explorer, search, and every extension that assumes real files keep working.",
  },
  {
    title: "Processes",
    body: "node, npm, and git run in Web Workers. Scripts really execute; they are not simulated.",
  },
  {
    title: "Sockets",
    body: "A server that calls listen() is registered in-process and reached through a service worker, so localhost URLs resolve from the tab.",
  },
  {
    title: "Shell",
    body: "The integrated terminal drives a real shell with line editing, history, and job control — in this tab, or in a container.",
  },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <h1>OpenVSCode on Nodepod</h1>
        <p>
          The VS Code workbench with no backend. Nodepod supplies the pieces an
          editor normally gets from an operating system.
        </p>
        <a className="cta" href="/ide">
          Open the IDE
        </a>
      </section>

      <section className="grid">
        {FEATURES.map((feature) => (
          <article key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="note">
        <h2>Terminals can run somewhere else</h2>
        <p>
          The default terminal runs in this browser tab. Pick{" "}
          <strong>Cloudflare Sandbox</strong> from the terminal dropdown and the
          workspace is cloned into a Linux container, where bash runs with a
          real toolchain — files created there sync back to the editor.
        </p>
        <p className="muted">
          No container is created until you ask for one. Editing, browsing,
          searching, and running Node in the tab never touch a server.
        </p>
      </section>
    </main>
  );
}
