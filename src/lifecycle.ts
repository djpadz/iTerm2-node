/**
 * Session-lifecycle monitors — port of `iterm2/lifecycle.py`.
 *
 * Each monitor wraps a notification subscription in a queue/await pattern
 * (mirroring the VariableMonitor approach in src/variables.ts).
 */

import type { Connection } from './connection';
import type { App } from './app';
import {
  subscribeToNewSessionNotification,
  subscribeToTerminateSessionNotification,
  subscribeToLayoutChangeNotification,
  unsubscribe,
  type SubscriptionToken,
} from './notifications';
import type { iterm2 } from './generated/api';

type NewSessionNotif = iterm2.NewSessionNotification.$Properties;
type TerminateNotif = iterm2.TerminateSessionNotification.$Properties;
type LayoutNotif = iterm2.LayoutChangedNotification.$Properties;

/** Internal queue + waiter helper (matches the pattern in variables.ts). */
class AsyncQueue<T> {
  private _items: T[] = [];
  private _waiters: Array<(value: T) => void> = [];

  put(item: T): void {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(item);
    } else {
      this._items.push(item);
    }
  }

  get(): Promise<T> {
    const next = this._items.shift();
    if (next !== undefined) return Promise.resolve(next);
    return new Promise((resolve) => this._waiters.push(resolve));
  }
}

/**
 * Convenient way to do something to all sessions exactly once, including
 * those created in the future. Use `start()`/`stop()` or `with()`.
 */
export class EachSessionOnceMonitor {
  private readonly conn: Connection;
  private _token: SubscriptionToken<NewSessionNotif> | null = null;
  private _queue = new AsyncQueue<NewSessionNotif | { sessionId: string }>();

  constructor(private readonly app: App) {
    this.conn = app.conn;
  }

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToNewSessionNotification(
      this.conn,
      async (_c, message) => this._queue.put(message)
    );
    // Seed the queue with currently-existing sessions.
    for (const window of this.app.terminalWindows) {
      for (const tab of window.tabs) {
        for (const session of tab.allSessions) {
          this._queue.put({ sessionId: session.sessionId });
        }
      }
    }
    return this;
  }

  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.conn, this._token);
    } catch {
      /* ignore */
    }
    this._token = null;
  }

  /** Returns the next session ID. */
  async get(): Promise<string> {
    const result = await this._queue.get();
    return result.sessionId ?? '';
  }

  /** Async iterator yielding session IDs forever. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  static async with<T>(
    app: App,
    fn: (mon: EachSessionOnceMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new EachSessionOnceMonitor(app).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }

  /**
   * Run `task(sessionId)` for each session — including future ones — and
   * cancel the task when its session terminates. The returned Promise
   * resolves when both internal monitors throw or are cancelled (i.e.,
   * effectively never; await it as a background task).
   *
   * Cancellation is implemented via AbortController: `task` receives both
   * the session ID and an `AbortSignal` that fires on termination.
   */
  static async foreachSessionCreateTask(
    app: App,
    task: (sessionId: string, signal: AbortSignal) => Promise<void>
  ): Promise<void> {
    const controllers = new Map<string, AbortController>();

    const eachLoop = async (): Promise<void> => {
      await EachSessionOnceMonitor.with(app, async (mon) => {
        while (true) {
          const sessionId = await mon.get();
          const ac = new AbortController();
          controllers.set(sessionId, ac);
          // Fire-and-forget; consumer can await internally if desired.
          void Promise.resolve()
            .then(() => task(sessionId, ac.signal))
            .catch(() => undefined);
        }
      });
    };

    const termLoop = async (): Promise<void> => {
      await SessionTerminationMonitor.with(app.conn, async (mon) => {
        while (true) {
          const sessionId = await mon.get();
          const ac = controllers.get(sessionId);
          if (ac) {
            controllers.delete(sessionId);
            ac.abort();
          }
        }
      });
    };

    await Promise.all([eachLoop(), termLoop()]);
  }
}

/**
 * Watches for session termination.
 *
 * A session is said to terminate when its command (typically `login`) has
 * exited. If the user closes a window, tab, or split pane they can still
 * undo closing it for some amount of time. Session termination will be
 * delayed until it is no longer undoable.
 */
export class SessionTerminationMonitor {
  private _token: SubscriptionToken<TerminateNotif> | null = null;
  private _queue = new AsyncQueue<string>();

  constructor(private readonly conn: Connection) {}

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToTerminateSessionNotification(
      this.conn,
      async (_c, message) => this._queue.put(message.sessionId ?? '')
    );
    return this;
  }

  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.conn, this._token);
    } catch {
      /* ignore */
    }
    this._token = null;
  }

  /** Returns the session_id of a just-terminated session. */
  async get(): Promise<string> {
    return this._queue.get();
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  static async with<T>(
    conn: Connection,
    fn: (mon: SessionTerminationMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new SessionTerminationMonitor(conn).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }
}

/** Watches for changes to the composition of sessions, tabs, and windows. */
export class LayoutChangeMonitor {
  private _token: SubscriptionToken<LayoutNotif> | null = null;
  private _queue = new AsyncQueue<LayoutNotif>();

  constructor(private readonly conn: Connection) {}

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToLayoutChangeNotification(
      this.conn,
      async (_c, message) => this._queue.put(message)
    );
    return this;
  }

  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.conn, this._token);
    } catch {
      /* ignore */
    }
    this._token = null;
  }

  /** Blocks until the layout changes. */
  async get(): Promise<void> {
    await this._queue.get();
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<void> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  static async with<T>(
    conn: Connection,
    fn: (mon: LayoutChangeMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new LayoutChangeMonitor(conn).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }
}

/** Watches for the creation of new sessions. */
export class NewSessionMonitor {
  private _token: SubscriptionToken<NewSessionNotif> | null = null;
  private _queue = new AsyncQueue<NewSessionNotif>();

  constructor(private readonly conn: Connection) {}

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToNewSessionNotification(
      this.conn,
      async (_c, message) => this._queue.put(message)
    );
    return this;
  }

  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.conn, this._token);
    } catch {
      /* ignore */
    }
    this._token = null;
  }

  /** Returns the new session ID. */
  async get(): Promise<string> {
    const result = await this._queue.get();
    return result.sessionId ?? '';
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  static async with<T>(
    conn: Connection,
    fn: (mon: NewSessionMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new NewSessionMonitor(conn).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }
}
