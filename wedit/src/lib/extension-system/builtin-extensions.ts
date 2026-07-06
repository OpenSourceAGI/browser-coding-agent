// Built-in extensions that ship with Wedit by default
import { registerBuiltInExtension } from "./extension-loader";
import type { ExtensionContext } from "./extension-types";

/**
 * Line counter extension - example of a simple extension
 */
export async function registerLineCounterExtension() {
  await registerBuiltInExtension(
    {
      id: "weditor.line-counter",
      name: "Line Counter",
      version: "1.0.0",
      description: "Shows line count in the status bar",
      commands: {
        "line-counter.count": {
          label: "Count Lines",
          description: "Count lines in active file",
        },
      },
    },
    (context: ExtensionContext) => {
      // Register command
      context.subscriptions.push(
        context.commands.registerCommand("line-counter.count", async () => {
          const editor = context.editor.getActiveEditor();
          if (editor) {
            const model = editor.getModel();
            if (model) {
              const lineCount = model.getLineCount();
              alert(`This file has ${lineCount} lines`);
            }
          }
        })
      );

      console.log("Line Counter extension activated");
    }
  );
}

/**
 * Bracket highlighter extension
 */
export async function registerBracketHighlighterExtension() {
  await registerBuiltInExtension(
    {
      id: "weditor.bracket-highlighter",
      name: "Bracket Highlighter",
      version: "1.0.0",
      description: "Highlights matching brackets",
    },
    (context: ExtensionContext) => {
      // Register editor decorator
      context.subscriptions.push(
        context.editor.registerDecorator({
          id: "bracket-highlighter",
          provide: (editor) => {
            const decorations: any[] = [];
            const model = editor.getModel();
            const position = editor.getPosition();

            if (!model || !position) return decorations;

            const lineContent = model.getLineContent(position.lineNumber);
            const brackets = ["(", ")", "[", "]", "{", "}"];

            for (let col = 1; col <= lineContent.length; col++) {
              const char = lineContent[col - 1];
              if (brackets.includes(char)) {
                decorations.push({
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: col,
                    endLineNumber: position.lineNumber,
                    endColumn: col + 1,
                  },
                  options: {
                    inlineClassName: "bracket-highlight",
                    isWholeLine: false,
                  },
                });
              }
            }

            return decorations;
          },
        })
      );

      console.log("Bracket Highlighter extension activated");
    }
  );
}

/**
 * Word count extension
 */
export async function registerWordCountExtension() {
  await registerBuiltInExtension(
    {
      id: "weditor.word-count",
      name: "Word Count",
      version: "1.0.0",
      description: "Counts words in the active file",
      commands: {
        "word-count.count": {
          label: "Count Words",
          description: "Count words in active file",
          keybinding: "Ctrl+Shift+W",
        },
      },
    },
    (context: ExtensionContext) => {
      context.subscriptions.push(
        context.commands.registerCommand("word-count.count", async () => {
          const editor = context.editor.getActiveEditor();
          if (editor) {
            const model = editor.getModel();
            if (model) {
              const text = model.getValue();
              const words = text.split(/\s+/).filter((w) => w.length > 0);
              const chars = text.length;
              alert(`Words: ${words.length}\nCharacters: ${chars}`);
            }
          }
        })
      );

      console.log("Word Count extension activated");
    }
  );
}

/**
 * Initialize all built-in extensions
 */
export async function initializeBuiltInExtensions() {
  try {
    await registerLineCounterExtension();
    await registerBracketHighlighterExtension();
    await registerWordCountExtension();
    console.log("Built-in extensions registered");
  } catch (e) {
    console.error("Failed to register built-in extensions:", e);
  }
}
