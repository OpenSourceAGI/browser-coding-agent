/**
 * Files a brand-new workspace starts with.
 *
 * Deliberately runnable: `node server.js` in the terminal starts a real HTTP
 * server inside the tab, and the port that opens is forwarded through the
 * service worker so it can be opened in another tab.
 */
export function seedFiles(root: string): Record<string, string> {
  const prefix = root.replace(/\/$/, "");
  return {
    [`${prefix}/README.md`]: `# OpenVSCode on Nodepod

This whole IDE is running in your browser. There is no backend.

- **Files** live in an in-memory volume, not on a disk.
- **Terminals** run a real shell in a Web Worker — or, if you pick the
  *Cloudflare Sandbox* profile, in a Linux container with your files cloned in.
- **Processes** are Web Workers. \`node server.js\` really runs Node code.
- **Ports** opened by a server are routed back through a service worker, so
  \`http://localhost:3000\` works from this tab.

## Try it

\`\`\`sh
node server.js       # then open the forwarded port
npm install express  # a real npm install, in the browser
\`\`\`

## Terminal profiles

Open the terminal dropdown (the \`v\` next to \`+\`) to choose where a shell
runs. "Nodepod (in-browser)" needs no server at all. "Cloudflare Sandbox"
boots a container, clones this workspace into it, and gives you bash — useful
when you need a real toolchain the browser cannot provide.
`,
    [`${prefix}/package.json`]: `${JSON.stringify(
      {
        name: "nodepod-workspace",
        version: "1.0.0",
        private: true,
        type: "commonjs",
        scripts: {
          start: "node server.js",
        },
      },
      null,
      2,
    )}\n`,
    [`${prefix}/server.js`]: `const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(\`<!doctype html>
    <title>Hello from Nodepod</title>
    <h1>It works</h1>
    <p>Served by Node running in a browser tab.</p>
    <p>You asked for <code>\${req.url}</code>.</p>\`);
});

server.listen(3000, () => {
  console.log("listening on http://localhost:3000");
});
`,
    [`${prefix}/main.ts`]: `type Greeting = { name: string };

export function greet({ name }: Greeting): string {
  return \`Hello, \${name}\`;
}

console.log(greet({ name: "Nodepod" }));
`,
  };
}
