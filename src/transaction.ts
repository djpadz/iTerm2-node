/**
 * Transaction — `iterm2/transaction.py`. While a transaction is open, iTerm2
 * processes no other events until you end it. Use it to group reads + writes
 * into an atomic sequence.
 */

import { Api } from './api';
import type { Connection } from './connection';

let CURRENT: Transaction | null = null;

export class Transaction {
  private _api: Api;

  constructor(public readonly conn: Connection) {
    this._api = new Api(conn);
  }

  static current(): Transaction | null {
    return CURRENT;
  }

  /** `with(conn, async () => { ... })` — open/close a transaction around fn. */
  static async with<T>(
    conn: Connection,
    fn: () => Promise<T>
  ): Promise<T> {
    const t = new Transaction(conn);
    await t.begin();
    try {
      return await fn();
    } finally {
      await t.end();
    }
  }

  async begin(): Promise<void> {
    if (CURRENT == null) CURRENT = this;
    await this._api.transaction({ begin: true });
  }

  async end(): Promise<void> {
    await this._api.transaction({ begin: false });
    if (CURRENT === this) CURRENT = null;
  }
}
