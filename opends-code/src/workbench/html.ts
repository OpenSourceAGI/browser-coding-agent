import {
  buildWorkbenchProduct,
  type WorkbenchProductOptions,
} from "./product.js";

export interface WorkbenchHtmlOptions extends WorkbenchProductOptions {
  /** Where the `vscode-web` (or openvscode) build is served from. */
  workbenchBaseUrl: string;
  /** Page title. Defaults to "OpenDS Code". */
  title?: string;
  /** Background painted before the workbench draws, to avoid a white flash. */
  background?: string;
}

/**
 * Renders the workbench host document.
 *
 * This is a rewrite of the upstream `workbench.html`, with one change: the
 * configuration is injected as `window.product` instead of being templated into
 * a `<meta data-settings>` blob by a server. That is the whole reason no backend
 * is required to run the editor — the page is static and the options are known
 * at request time.
 */
export function buildWorkbenchHtml(options: WorkbenchHtmlOptions): string {
  const base = options.workbenchBaseUrl.replace(/\/+$/, "");
  const product = buildWorkbenchProduct(options);
  const title = options.title ?? "OpenDS Code";
  const background = options.background ?? "#1f1f1f";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
  <meta name="mobile-web-app-capable" content="yes" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${base}/out/vs/workbench/workbench.web.main.css" />
  <style>
    html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: ${background}; }
  </style>
</head>
<body aria-label=""></body>

<script>
  // Consumed by out/vs/code/browser/workbench/workbench.js, which revives the
  // URIs and calls create(document.body, options).
  window.product = ${serializeJson(product)};
</script>

<script src="${base}/out/vs/loader.js"></script>
<script src="${base}/out/vs/webPackagePaths.js"></script>
<script>
  (function () {
    var baseUrl = new URL('${base}', window.location.origin).toString().replace(/\\/+$/, '');
    Object.keys(self.webPackagePaths).forEach(function (key) {
      self.webPackagePaths[key] = baseUrl + '/node_modules/' + key + '/' + self.webPackagePaths[key];
    });

    var nlsConfig = {};
    var locale = localStorage.getItem('vscode.nls.locale') || navigator.language.toLowerCase();
    if (!locale.startsWith('en')) {
      nlsConfig['vs/nls'] = { availableLanguages: { '*': locale } };
    }

    require.config(Object.assign({
      baseUrl: baseUrl + '/out',
      recordStats: true,
      trustedTypesPolicy: window.trustedTypes && window.trustedTypes.createPolicy('amdLoader', {
        createScriptURL: function (value) {
          if (value.startsWith(window.location.origin)) return value;
          throw new Error('Invalid script url: ' + value);
        }
      }),
      paths: self.webPackagePaths
    }, nlsConfig));
  })();
</script>

<script src="${base}/out/vs/workbench/workbench.web.main.nls.js"></script>
<script src="${base}/out/vs/workbench/workbench.web.main.js"></script>
<script src="${base}/out/vs/code/browser/workbench/workbench.js"></script>
</html>
`;
}

/**
 * Cross-origin isolation headers.
 *
 * Nodepod needs `SharedArrayBuffer` for synchronous fs access from worker
 * threads and for WASI modules, and that requires the document to be
 * cross-origin isolated. `credentialless` is used rather than `require-corp` so
 * third-party subresources (fonts, images in previews) keep loading without
 * every one of them needing a CORP header.
 */
export const CROSS_ORIGIN_ISOLATION_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export function workbenchResponseHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...CROSS_ORIGIN_ISOLATION_HEADERS,
    ...extra,
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

/**
 * `</script>` inside a JSON string would close the inline script tag early, and
 * U+2028/U+2029 are literal line terminators in JS source but legal in JSON.
 */
function serializeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
