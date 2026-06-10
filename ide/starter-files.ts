// Starter workspace seeded into Nodepod's virtual filesystem on first
// boot. server.js uses only polyfilled core modules so ▶ Run works
// before any npm install; express-server.js shows the install flow.

export const STARTER_FILES: Record<string, string> = {
  "/server.js": `// Plain Node http server — runs without installing anything.
// Press ▶ Run (or type \`node server.js\` in the terminal) and the
// preview pane loads this page automatically.
const http = require('http');

const page = \`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hello from Nodepod</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3;
             display: grid; place-items: center; min-height: 90vh; margin: 0; }
      .card { text-align: center; padding: 32px 40px; border: 1px solid #30363d;
              border-radius: 12px; background: #161b22; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { color: #8b949e; margin: 4px 0; }
      code { background: #21262d; padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>⚡ Node.js, in your browser</h1>
      <p>This page is served by <code>server.js</code> running inside Nodepod.</p>
      <p>Try <a href="/api/time" style="color:#58a6ff">/api/time</a>, then edit the file and run again.</p>
    </div>
  </body>
</html>\`;

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/time')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ now: new Date().toISOString(), pid: process.pid }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(page);
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
`,

  "/index.js": `// Quick sanity check: \`node index.js\` in the terminal.
const os = require('os');
console.log('Hello from Nodepod!');
console.log('platform:', os.platform(), '| node:', process.version);
console.log('cwd:', process.cwd());
`,

  "/express-server.js": `// Express variant — click "npm install" first, then
// run with: node express-server.js
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('<h1>Express, running in your browser tab 🚀</h1>');
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from express in Nodepod' });
});

app.listen(3001, () => console.log('Express listening on port 3001'));
`,

  "/package.json": `${JSON.stringify(
    {
      name: "nodepod-workspace",
      version: "1.0.0",
      private: true,
      main: "server.js",
      dependencies: {
        express: "^4.18.2",
      },
    },
    null,
    2,
  )}\n`,

  "/README.md": `# Nodepod workspace

Everything here lives in an in-browser virtual filesystem — no backend.

## Things to try

1. **▶ Run** starts \`server.js\`; the preview pane picks up port 3000.
2. Open the **Terminal** tab and run \`ls\`, \`cat README.md\`, \`node index.js\`.
3. Click **npm install**, then run \`node express-server.js\` for port 3001.
4. **Save workspace** persists a snapshot to browser storage; reload to restore.

Files are loaded exclusively from the Nodepod filesystem — edits you make
in the editor are immediately visible to spawned processes, and files
written by processes show up in the explorer.
`,
};
