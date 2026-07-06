export * from "@/lib/extension-system/extension-loader";
// Loads Zed extensions from URLs, file paths, and TOML manifests
/**
 * Loads Zed extensions from various sources
 */

import type { ZedExtensionManifest, ExtensionModule } from "./extension-types";
import { extensionHost } from "./extension-host";

/**
 * Parse TOML-like extension manifest
 * (Simplified parser for basic TOML structures)
 */
export function parseExtensionToml(toml: string): ZedExtensionManifest {
  const lines = toml.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

  const manifest: any = {};
  let currentSection: any = manifest;
  let currentPath: string[] = [];

  for (const line of lines) {
    // Section headers: [extension], [languages.rust], etc.
    if (line.startsWith("[") && line.endsWith("]")) {
      const section = line.slice(1, -1);
      const parts = section.split(".");

      currentPath = parts;
      currentSection = manifest;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!currentSection[part]) {
          currentSection[part] = {};
        }
        if (i === parts.length - 1) {
          currentSection = currentSection[part];
        } else {
          currentSection = currentSection[part];
        }
      }
      continue;
    }

    // Key-value pairs: key = "value" or key = 123
    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex).trim();
      let value: any = line.slice(eqIndex + 1).trim();

      // Parse value types
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1); // String
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Array
        const inner = value.slice(1, -1);
        value = inner.split(",").map((v: string) => {
          v = v.trim();
          if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
          if (!isNaN(Number(v))) return Number(v);
          if (v === "true") return true;
          if (v === "false") return false;
          return v;
        });
      } else if (!isNaN(Number(value))) {
        value = Number(value); // Number
      } else if (value === "true") {
        value = true; // Boolean
      } else if (value === "false") {
        value = false; // Boolean
      }

      currentSection[key] = value;
    }
  }

  // If there's an [extension] section, merge it with the rest of the manifest
  if (manifest.extension) {
    return { ...manifest, ...manifest.extension };
  }

  return manifest;
}

/**
 * Check if extension is manifest-only (no JavaScript required)
 */
function isManifestOnlyExtension(manifest: ZedExtensionManifest): boolean {
  // Check if extension name/id contains "theme" (most themes follow this pattern)
  const id = manifest.id?.toLowerCase() || "";
  const name = manifest.name?.toLowerCase() || "";
  if (id.includes("theme") || name.includes("theme")) {
    return true;
  }

  // Themes defined in manifest
  if (manifest.themes && Object.keys(manifest.themes).length > 0) {
    return true;
  }

  // Language server extensions (LSP) - these connect to external servers, no JS needed
  if (manifest.language_servers && Object.keys(manifest.language_servers).length > 0) {
    return true;
  }

  // Check if it only defines languages/grammars without commands
  const hasCode = manifest.commands && Object.keys(manifest.commands).length > 0;
  const hasOnlyDeclarative = (manifest.languages || manifest.grammars) && !hasCode;

  return hasOnlyDeclarative || false;
}

/**
 * Load extension from a directory in the virtual filesystem
 */
export async function loadExtensionFromPath(
  nodepod: any,
  extensionPath: string
): Promise<{ manifest: ZedExtensionManifest; module?: ExtensionModule }> {
  // Read extension.toml
  let manifestText: string;
  try {
    manifestText = await nodepod.fs.readFile(`${extensionPath}/extension.toml`, "utf-8");
  } catch (e) {
    throw new Error(`extension.toml not found in ${extensionPath}`);
  }

  const manifest = parseExtensionToml(manifestText);

  // Check if this is a manifest-only extension (e.g., theme)
  if (isManifestOnlyExtension(manifest)) {
    return { manifest, module: undefined };
  }

  // Try to read extension entry point (index.js or main.js)
  let moduleCode: string | undefined;
  const entryPoints = ["index.js", "main.js", "extension.js"];

  for (const entry of entryPoints) {
    try {
      moduleCode = await nodepod.fs.readFile(`${extensionPath}/${entry}`, "utf-8");
      break;
    } catch (e) {
      // Try next entry point
    }
  }

  // If no JavaScript found, treat as manifest-only extension
  if (!moduleCode) {
    console.log(`No JavaScript entry point found for ${manifest.id}, treating as manifest-only extension`);
    return { manifest, module: undefined };
  }

  // Create module from code
  const module = await loadModuleFromCode(moduleCode, extensionPath);

  return { manifest, module };
}

/**
 * Load extension module from JavaScript code
 */
async function loadModuleFromCode(code: string, path: string): Promise<ExtensionModule> {
  // Create a module wrapper with exports
  const moduleExports: any = {};
  const moduleObject = { exports: moduleExports };

  // Create a sandboxed function to execute the module code
  const moduleFunction = new Function(
    "module",
    "exports",
    "require",
    "console",
    "extensionHost",
    code
  );

  // Simple require implementation for common modules
  const requireFn = (moduleName: string) => {
    if (moduleName === "extension-host") {
      return { extensionHost };
    }
    throw new Error(`Module ${moduleName} not available in extension sandbox`);
  };

  try {
    moduleFunction(
      moduleObject,
      moduleExports,
      requireFn,
      console,
      extensionHost
    );
  } catch (e) {
    console.error(`Error loading extension module from ${path}:`, e);
    throw e;
  }

  // Return the exported module
  const exports = moduleObject.exports.default || moduleObject.exports;

  if (!exports.activate) {
    throw new Error(`Extension module must export an 'activate' function`);
  }

  return exports as ExtensionModule;
}

/**
 * Load extension from a remote URL
 */
export async function loadExtensionFromUrl(url: string): Promise<{ manifest: ZedExtensionManifest; module?: ExtensionModule }> {
  // Fetch extension.toml
  const manifestUrl = url.endsWith("/") ? `${url}extension.toml` : `${url}/extension.toml`;
  const manifestResponse = await fetch(manifestUrl);

  if (!manifestResponse.ok) {
    throw new Error(`Failed to fetch extension manifest from ${manifestUrl}`);
  }

  const manifestText = await manifestResponse.text();
  const manifest = parseExtensionToml(manifestText);

  // Check if this is a manifest-only extension (e.g., theme)
  if (isManifestOnlyExtension(manifest)) {
    return { manifest, module: undefined };
  }

  // Try to fetch entry point
  const entryPoints = ["index.js", "main.js", "extension.js"];
  let moduleCode: string | undefined;

  for (const entry of entryPoints) {
    const entryUrl = url.endsWith("/") ? `${url}${entry}` : `${url}/${entry}`;
    try {
      const response = await fetch(entryUrl);
      if (response.ok) {
        moduleCode = await response.text();
        break;
      }
    } catch (e) {
      // Try next entry point
    }
  }

  // If no JavaScript found, treat as manifest-only extension
  if (!moduleCode) {
    console.log(`No JavaScript entry point found for ${manifest.id}, treating as manifest-only extension`);
    return { manifest, module: undefined };
  }

  const module = await loadModuleFromCode(moduleCode, url);

  return { manifest, module };
}

/**
 * Register a built-in extension
 */
export function registerBuiltInExtension(
  manifest: ZedExtensionManifest,
  activateFn: (context: any) => void | Promise<void>,
  deactivateFn?: () => void | Promise<void>
) {
  const module: ExtensionModule = {
    activate: activateFn,
    deactivate: deactivateFn,
  };

  return extensionHost.loadExtension(manifest, module, "<built-in>");
}

/**
 * Auto-discover and load extensions from /project/.weditor/extensions/
 */
export async function autoLoadExtensions(nodepod: any): Promise<void> {
  const extensionsDir = "/project/.weditor/extensions";

  try {
    const entries = await nodepod.fs.readdir(extensionsDir);

    for (const entry of entries) {
      const fullPath = `${extensionsDir}/${entry}`;

      try {
        const stat = await nodepod.fs.stat(fullPath);
        if (stat.isDirectory) {
          console.log(`Loading extension from ${fullPath}...`);
          const { manifest, module } = await loadExtensionFromPath(nodepod, fullPath);
          await extensionHost.loadExtension(manifest, module, fullPath);
        }
      } catch (e) {
        console.error(`Failed to load extension from ${fullPath}:`, e);
      }
    }
  } catch (e) {
    // Extensions directory doesn't exist - that's okay
    console.log("No extensions directory found");
  }
}
