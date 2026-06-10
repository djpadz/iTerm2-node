/**
 * Variable scopes + VariableMonitor — port of `iterm2/variables.py`.
 *
 * Use VariableMonitor to await successive values of an iTerm2 variable.
 */

import type { Connection } from './connection';
import { BaseMonitor, withMonitor } from './monitor';
import { subscribeToVariableChangeNotification } from './notifications';
import type { iterm2 } from './generated/api';

export enum VariableScopes {
  SESSION = 1,
  TAB = 2,
  WINDOW = 3,
  APP = 4,
}

export class VariableMonitor extends BaseMonitor<unknown> {
  constructor(
    conn: Connection,
    private readonly scope: VariableScopes,
    private readonly name: string,
    private readonly identifier: string | null
  ) {
    super(conn);
  }

  protected _subscribe() {
    return subscribeToVariableChangeNotification(
      this.conn,
      async (_c, n) => {
        const value =
          n.jsonNewValue == null ? null : JSON.parse(n.jsonNewValue);
        this._deliver(value);
      },
      {
        scope: this.scope as unknown as iterm2.VariableScope,
        name: this.name,
        identifier: this.identifier,
      }
    );
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
  static with<T>(
    conn: Connection,
    scope: VariableScopes,
    name: string,
    identifier: string | null,
    fn: (mon: VariableMonitor) => Promise<T>
  ): Promise<T> {
    return withMonitor(new VariableMonitor(conn, scope, name, identifier), fn);
  }
}
