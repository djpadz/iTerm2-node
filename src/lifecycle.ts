/**
 * Session-lifecycle monitors — port of `iterm2/lifecycle.py`.
 *
 * Each monitor wraps a notification subscription using the BaseMonitor
 * queue/await machinery in src/monitor.ts.
 */

import type { Connection } from './connection';
import type { App } from './app';
import { BaseMonitor, withMonitor } from './monitor';
import {
  subscribeToNewSessionNotification,
  subscribeToTerminateSessionNotification,
  subscribeToLayoutChangeNotification,
} from './notifications';
import type { iterm2 } from './generated/api';

type LayoutNotif = iterm2.LayoutChangedNotification.$Properties;

/**
 * Convenient way to do something to all sessions exactly once, including
 * those created in the future. Use `start()`/`stop()` or `with()`.
 */
export class EachSessionOnceMonitor extends BaseMonitor<string> {
  constructor(private readonly app: App) {
    super(app.conn);
  }

  protected _subscribe() {
    return subscribeToNewSessionNotification(this.conn, async (_c, m) =>
      this._deliver(m.sessionId ?? '')
    );
  }

  /** Seed the queue with currently-existing sessions before the live stream. */
  protected async _onStart(): Promise<void> {
    for (const window of this.app.terminalWindows) {
      for (const tab of window.tabs) {
        for (const session of tab.allSessions) {
          this._deliver(session.sessionId);
        }
      }
    }
  }

  static with<T>(
    app: App,
    fn: (mon: EachSessionOnceMonitor) => Promise<T>
  ): Promise<T> {
    return withMonitor(new EachSessionOnceMonitor(app), fn);
  }

  /**
   * Run `task(sessionId)` for each session — including future ones — and
   * cancel the task when its session terminates. Resolves when both
   * internal monitors complete (effectively never; await as a background
   * task).
   *
   * Cancellation is implemented via AbortController: `task` receives the
   * session ID and an `AbortSignal` that fires on termination.
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
 * Watches for session termination. A session terminates when its command
 * (typically `login`) exits; if the user closes a window, tab, or split
 * pane the notification is delayed until the close is no longer undoable.
 */
export class SessionTerminationMonitor extends BaseMonitor<string> {
  constructor(conn: Connection) {
    super(conn);
  }

  protected _subscribe() {
    return subscribeToTerminateSessionNotification(this.conn, async (_c, m) =>
      this._deliver(m.sessionId ?? '')
    );
  }

  static with<T>(
    conn: Connection,
    fn: (mon: SessionTerminationMonitor) => Promise<T>
  ): Promise<T> {
    return withMonitor(new SessionTerminationMonitor(conn), fn);
  }
}

/** Watches for changes to the composition of sessions, tabs, and windows. */
export class LayoutChangeMonitor extends BaseMonitor<LayoutNotif> {
  constructor(conn: Connection) {
    super(conn);
  }

  protected _subscribe() {
    return subscribeToLayoutChangeNotification(this.conn, async (_c, m) =>
      this._deliver(m)
    );
  }

  static with<T>(
    conn: Connection,
    fn: (mon: LayoutChangeMonitor) => Promise<T>
  ): Promise<T> {
    return withMonitor(new LayoutChangeMonitor(conn), fn);
  }
}

/** Watches for the creation of new sessions. */
export class NewSessionMonitor extends BaseMonitor<string> {
  constructor(conn: Connection) {
    super(conn);
  }

  protected _subscribe() {
    return subscribeToNewSessionNotification(this.conn, async (_c, m) =>
      this._deliver(m.sessionId ?? '')
    );
  }

  static with<T>(
    conn: Connection,
    fn: (mon: NewSessionMonitor) => Promise<T>
  ): Promise<T> {
    return withMonitor(new NewSessionMonitor(conn), fn);
  }
}
