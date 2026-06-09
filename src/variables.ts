/**
 * Variable scopes + VariableMonitor — port of `iterm2/variables.py`.
 *
 * Use VariableMonitor to await successive values of an iTerm2 variable.
 */

import type { Connection } from './connection';
import {
  subscribeToVariableChangeNotification,
  unsubscribe,
  type SubscriptionToken,
} from './notifications';
import type { iterm2 } from './generated/api';

export enum VariableScopes {
  SESSION = 1,
  TAB = 2,
  WINDOW = 3,
  APP = 4,
}

type VarNotif = iterm2.VariableChangedNotification.$Properties;

export class VariableMonitor {
  private _token: SubscriptionToken<VarNotif> | null = null;
  private _queue: VarNotif[] = [];
  private _waiters: Array<(value: VarNotif) => void> = [];

  constructor(
    private readonly conn: Connection,
    private readonly scope: VariableScopes,
    private readonly name: string,
    private readonly identifier: string | null
  ) {}

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToVariableChangeNotification(
      this.conn,
      async (_c, notif) => this._enqueue(notif),
      { scope: this.scope as unknown as iterm2.VariableScope, name: this.name, identifier: this.identifier }
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

  /** Async iterator yielding decoded variable values forever. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  /** Resolve with the next variable value (decoded from JSON). */
  async get(): Promise<unknown> {
    const next = await this._next();
    const raw = next.jsonNewValue;
    return raw == null ? null : JSON.parse(raw);
  }

  private _enqueue(notif: VarNotif): void {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(notif);
    } else {
      this._queue.push(notif);
    }
  }

  private _next(): Promise<VarNotif> {
    const next = this._queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => this._waiters.push(resolve));
  }

  /**
   * Convenience: run `fn(monitor)` between start and stop.
   *
   * ```ts
   * await VariableMonitor.with(conn, scope, name, id, async (mon) => {
   *   const v = await mon.get();
   * });
   * ```
   */
  static async with<T>(
    conn: Connection,
    scope: VariableScopes,
    name: string,
    identifier: string | null,
    fn: (mon: VariableMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new VariableMonitor(conn, scope, name, identifier).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }
}
