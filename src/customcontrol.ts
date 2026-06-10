/**
 * CustomControlSequenceMonitor — port of `iterm2/customcontrol.py`.
 *
 * Registers a handler for a custom control sequence (OSC 1337 with a
 * `Custom=id:payload` payload). Use `start()` / `stop()` (or the static
 * `with()` helper) to manage the subscription lifetime, then await `get()`
 * to receive each matching payload as a `RegExpMatchArray`.
 */

import type { Connection } from './connection';
import { BaseMonitor, withMonitor } from './monitor';
import { subscribeToCustomEscapeSequenceNotification } from './notifications';

export class CustomControlSequenceMonitor extends BaseMonitor<RegExpMatchArray> {
  private readonly _regex: RegExp;

  constructor(
    conn: Connection,
    private readonly identity: string,
    regex: string | RegExp,
    private readonly sessionId: string | null = null
  ) {
    super(conn);
    this._regex = typeof regex === 'string' ? new RegExp(regex) : regex;
  }

  protected _subscribe() {
    return subscribeToCustomEscapeSequenceNotification(
      this.conn,
      async (_c, notif) => {
        if (notif.senderIdentity !== this.identity) return;
        const payload = notif.payload ?? '';
        const match = payload.match(this._regex);
        if (match) this._deliver(match);
      },
      { session: this.sessionId }
    );
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
  static with<T>(
    conn: Connection,
    identity: string,
    regex: string | RegExp,
    sessionId: string | null,
    fn: (mon: CustomControlSequenceMonitor) => Promise<T>
  ): Promise<T> {
    return withMonitor(
      new CustomControlSequenceMonitor(conn, identity, regex, sessionId),
      fn
    );
  }
}
