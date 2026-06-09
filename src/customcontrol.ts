/**
 * CustomControlSequenceMonitor — port of `iterm2/customcontrol.py`.
 *
 * Registers a handler for a custom control sequence (OSC 1337 with a
 * `Custom=id:payload` payload). Use `start()` / `stop()` (or the static
 * `with()` helper) to manage the subscription lifetime, then await `get()`
 * to receive each matching payload as a `RegExpMatchArray`.
 */

import type { Connection } from './connection';
import {
  subscribeToCustomEscapeSequenceNotification,
  unsubscribe,
  type SubscriptionToken,
} from './notifications';
import type { iterm2 } from './generated/api';

type CustomNotif = iterm2.CustomEscapeSequenceNotification.$Properties;

export class CustomControlSequenceMonitor {
  private _token: SubscriptionToken<CustomNotif> | null = null;
  private _queue: RegExpMatchArray[] = [];
  private _waiters: Array<(value: RegExpMatchArray) => void> = [];
  private readonly _regex: RegExp;

  constructor(
    private readonly conn: Connection,
    private readonly identity: string,
    regex: string | RegExp,
    private readonly sessionId: string | null = null
  ) {
    this._regex = typeof regex === 'string' ? new RegExp(regex) : regex;
  }

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToCustomEscapeSequenceNotification(
      this.conn,
      async (_c, notif) => this._handle(notif),
      { session: this.sessionId }
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

  /**
   * Blocks until a matching control sequence arrives, returning the
   * `RegExpMatchArray` produced by matching the payload.
   */
  async get(): Promise<RegExpMatchArray> {
    const next = this._queue.shift();
    if (next) return next;
    return new Promise((resolve) => this._waiters.push(resolve));
  }

  /** Async iterator yielding successive matches forever. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<RegExpMatchArray> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  /**
   * Convenience: run `fn(mon)` between start and stop.
   *
   * ```ts
   * await CustomControlSequenceMonitor.with(conn, 'secret', /^do$/, null, async (mon) => {
   *   const m = await mon.get();
   * });
   * ```
   */
  static async with<T>(
    conn: Connection,
    identity: string,
    regex: string | RegExp,
    sessionId: string | null,
    fn: (mon: CustomControlSequenceMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new CustomControlSequenceMonitor(
      conn,
      identity,
      regex,
      sessionId
    ).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }

  private _handle(notif: CustomNotif): void {
    if (notif.senderIdentity !== this.identity) return;
    const payload = notif.payload ?? '';
    const match = payload.match(this._regex);
    if (!match) return;
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(match);
    } else {
      this._queue.push(match);
    }
  }
}
