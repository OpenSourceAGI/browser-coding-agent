import type { TerminalMode } from "../protocol/messages.js";

export interface TerminalSessionCallbacks {
  onData: (id: string, data: string) => void;
  onExit: (id: string, code: number) => void;
}

/** What the terminal registry needs from a session, local or containerised. */
export interface TerminalSession {
  readonly id: string;
  readonly mode: TerminalMode;
  input(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}
