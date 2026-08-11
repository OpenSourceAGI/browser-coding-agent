import type { Disposable } from "./types";

/**
 * Minimal listener set. Deliberately not VS Code's `Emitter` — the runtime
 * layer stays free of workbench imports so it can be unit-tested and reused
 * outside the workbench bundle.
 */
export class Emitter<T> {
  private _listeners = new Set<(value: T) => void>();

  on = (listener: (value: T) => void): Disposable => {
    this._listeners.add(listener);
    return {
      dispose: () => {
        this._listeners.delete(listener);
      },
    };
  };

  fire(value: T): void {
    // Copy first: a listener may dispose itself while we iterate.
    for (const listener of [...this._listeners]) {
      try {
        listener(value);
      } catch (err) {
        console.error("[openvscode-nodepod] listener threw", err);
      }
    }
  }

  get size(): number {
    return this._listeners.size;
  }

  clear(): void {
    this._listeners.clear();
  }
}

/**
 * An emitter that holds on to values fired before anyone was listening.
 *
 * Terminals need this: a shell writes its prompt as soon as it starts, but
 * VS Code only subscribes to the process after `start()` resolves. Without a
 * replay buffer that first prompt is fired into an empty listener set and the
 * terminal opens blank.
 */
export class ReplayEmitter<T> {
  private _listeners = new Set<(value: T) => void>();
  private _backlog: T[] = [];

  on = (listener: (value: T) => void): Disposable => {
    this._listeners.add(listener);
    if (this._backlog.length > 0) {
      const pending = this._backlog;
      this._backlog = [];
      for (const value of pending) listener(value);
    }
    return {
      dispose: () => {
        this._listeners.delete(listener);
      },
    };
  };

  fire(value: T): void {
    if (this._listeners.size === 0) {
      this._backlog.push(value);
      return;
    }
    for (const listener of [...this._listeners]) {
      try {
        listener(value);
      } catch (err) {
        console.error("[openvscode-nodepod] listener threw", err);
      }
    }
  }

  clear(): void {
    this._listeners.clear();
    this._backlog = [];
  }
}

export function toDisposable(fn: () => void): Disposable {
  let done = false;
  return {
    dispose: () => {
      if (done) return;
      done = true;
      fn();
    },
  };
}

export function combinedDisposable(...items: Disposable[]): Disposable {
  return toDisposable(() => {
    for (const item of items) item.dispose();
  });
}
