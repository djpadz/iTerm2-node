/**
 * Broadcast — port of `iterm2/broadcast.py`. Manages keyboard input
 * broadcast domains.
 */

import type { Connection } from './connection';
import { Api } from './api';
import { Session, RPCException } from './session';

/**
 * Broadcast domains describe how keyboard input is broadcast.
 *
 * A user typing in a session belonging to one broadcast domain will result
 * in those keystrokes being sent to all sessions in that domain. Broadcast
 * domains are disjoint.
 */
export class BroadcastDomain {
  private _sessions: Session[] = [];
  private _unresolved: Array<() => Session | null> = [];

  /** Add a session to this broadcast domain. */
  addSession(session: Session): void {
    this._sessions.push(session);
  }

  /**
   * Add an unresolved domain — a thunk that, when invoked later, returns a
   * Session (or null if it can't be resolved). Mirrors Python's
   * `add_unresolved` weak-ref pattern.
   */
  addUnresolved(unresolved: () => Session | null): void {
    this._unresolved.push(unresolved);
  }

  /** Returns the sessions belonging to this broadcast domain (resolves thunks). */
  get sessions(): Session[] {
    const resolved = this._unresolved.map((fn) => fn());
    return [...this._sessions, ...resolved].filter(
      (s): s is Session => s != null
    );
  }
}

/**
 * Set the current set of broadcast domains.
 *
 * Throws RPCException on failure.
 */
export async function setBroadcastDomains(
  connection: Connection,
  broadcastDomains: BroadcastDomain[]
): Promise<void> {
  const api = new Api(connection);
  const protos = broadcastDomains.map((d) => ({
    sessionIds: d.sessions.map((s) => s.sessionId),
  }));
  const res = await api.setBroadcastDomains({ broadcastDomains: protos });
  if ((res.status ?? 0) !== 0) {
    throw new RPCException(
      `setBroadcastDomains failed status=${res.status ?? 0}`
    );
  }
}
