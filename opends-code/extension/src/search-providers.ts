import * as vscode from "vscode";
import type { BridgeClient } from "../../src/protocol/channel.js";

/**
 * Minimal shapes for VS Code's proposed search APIs.
 *
 * `@types/vscode` ships only stable declarations, so the proposal is described
 * here and reached through a cast. `product.json` grants this extension the
 * `fileSearchProvider` / `textSearchProvider` proposals; if a host boots a build
 * where they are unavailable, registration degrades to a warning rather than
 * failing activation and taking the filesystem down with it.
 */
interface FileSearchQueryLike {
  pattern: string;
}

interface SearchOptionsLike {
  folder: vscode.Uri;
  includes?: string[];
  excludes?: string[];
  maxResults?: number;
}

interface TextSearchQueryLike {
  pattern: string;
  isRegExp?: boolean;
  isCaseSensitive?: boolean;
  isWordMatch?: boolean;
}

interface TextSearchOptionsLike extends SearchOptionsLike {
  maxResults: number;
}

interface ProposedWorkspace {
  registerFileSearchProvider?(
    scheme: string,
    provider: {
      provideFileSearchResults(
        query: FileSearchQueryLike,
        options: SearchOptionsLike,
        token: vscode.CancellationToken,
      ): Promise<vscode.Uri[]>;
    },
  ): vscode.Disposable;
  registerTextSearchProvider?(
    scheme: string,
    provider: {
      provideTextSearchResults(
        query: TextSearchQueryLike,
        options: TextSearchOptionsLike,
        progress: vscode.Progress<unknown>,
        token: vscode.CancellationToken,
      ): Promise<{ limitHit: boolean }>;
    },
  ): vscode.Disposable;
}

export function registerSearchProviders(
  context: vscode.ExtensionContext,
  client: BridgeClient,
  scheme: string,
  authority: string,
  log: (message: string) => void,
): void {
  const workspace = vscode.workspace as unknown as ProposedWorkspace;
  const toUri = (path: string) => vscode.Uri.from({ scheme, authority, path });

  if (typeof workspace.registerFileSearchProvider === "function") {
    context.subscriptions.push(
      workspace.registerFileSearchProvider(scheme, {
        async provideFileSearchResults(query, options, token) {
          const paths = await client.request("search.file", {
            pattern: query.pattern ?? "",
            ...(options.includes?.length ? { includes: options.includes } : {}),
            ...(options.excludes?.length ? { excludes: options.excludes } : {}),
            ...(options.maxResults ? { maxResults: options.maxResults } : {}),
          });
          if (token.isCancellationRequested) return [];
          return paths.map(toUri);
        },
      }),
    );
  } else {
    log(
      "fileSearchProvider proposal unavailable — Quick Open (Ctrl+P) will not list workspace files",
    );
  }

  if (typeof workspace.registerTextSearchProvider === "function") {
    context.subscriptions.push(
      workspace.registerTextSearchProvider(scheme, {
        async provideTextSearchResults(query, options, progress, token) {
          const hits = await client.request(
            "search.text",
            {
              pattern: query.pattern,
              ...(query.isRegExp !== undefined ? { isRegExp: query.isRegExp } : {}),
              ...(query.isCaseSensitive !== undefined
                ? { isCaseSensitive: query.isCaseSensitive }
                : {}),
              ...(query.isWordMatch !== undefined
                ? { isWordMatch: query.isWordMatch }
                : {}),
              ...(options.includes?.length ? { includes: options.includes } : {}),
              ...(options.excludes?.length ? { excludes: options.excludes } : {}),
              ...(options.maxResults ? { maxResults: options.maxResults } : {}),
            },
            // Scanning a large workspace in the browser is slower than ripgrep;
            // give it room before the bridge gives up.
            { timeoutMs: 120_000 },
          );

          if (token.isCancellationRequested) return { limitHit: false };

          for (const hit of hits) {
            const ranges = hit.ranges.map(
              ([start, end]) =>
                new vscode.Range(hit.line, start, hit.line, end),
            );
            if (ranges.length === 0) continue;
            progress.report({
              uri: toUri(hit.path),
              ranges,
              preview: {
                text: hit.preview,
                matches: hit.ranges.map(
                  ([start, end]) => new vscode.Range(0, start, 0, end),
                ),
              },
            });
          }

          return { limitHit: hits.length >= (options.maxResults ?? Infinity) };
        },
      }),
    );
  } else {
    log(
      "textSearchProvider proposal unavailable — global search (Ctrl+Shift+F) will return no results",
    );
  }
}
