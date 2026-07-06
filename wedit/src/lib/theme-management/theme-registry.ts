// Dynamic registry combining built-in and extension-contributed themes
/**
 * Dynamic theme registry that combines built-in and extension themes
 */

import { themes as builtInThemes, type Theme } from "./themes";

// Extension themes registry
let extensionThemes: Theme[] = [];
let themeChangeListeners: Array<() => void> = [];

/**
 * Get all available themes (built-in + extensions)
 */
export function getAllThemes(): Theme[] {
  return [...builtInThemes, ...extensionThemes];
}

/**
 * Get theme by name
 */
export function getThemeByName(name: string): Theme | undefined {
  return getAllThemes().find((t) => t.name === name);
}

/**
 * Register themes from an extension
 */
export function registerExtensionThemes(themes: Theme[]): void {
  // Filter out duplicates by name
  const newThemes = themes.filter(
    (theme) => !extensionThemes.some((t) => t.name === theme.name)
  );

  extensionThemes.push(...newThemes);
  notifyThemeChange();
}

/**
 * Unregister themes from an extension
 */
export function unregisterExtensionThemes(themeNames: string[]): void {
  extensionThemes = extensionThemes.filter(
    (theme) => !themeNames.includes(theme.name)
  );
  notifyThemeChange();
}

/**
 * Get all extension themes
 */
export function getExtensionThemes(): Theme[] {
  return extensionThemes;
}

/**
 * Clear all extension themes
 */
export function clearExtensionThemes(): void {
  extensionThemes = [];
  notifyThemeChange();
}

/**
 * Listen for theme registry changes
 */
export function onThemeRegistryChange(callback: () => void): () => void {
  themeChangeListeners.push(callback);

  // Return unsubscribe function
  return () => {
    const index = themeChangeListeners.indexOf(callback);
    if (index >= 0) {
      themeChangeListeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of theme registry changes
 */
function notifyThemeChange(): void {
  themeChangeListeners.forEach((listener) => listener());
}

/**
 * Get themes grouped by appearance
 */
export function getThemesByAppearance() {
  const allThemes = getAllThemes();
  return {
    dark: allThemes.filter((t) => t.appearance === "dark"),
    light: allThemes.filter((t) => t.appearance === "light"),
  };
}
