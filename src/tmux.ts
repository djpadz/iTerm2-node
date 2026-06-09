/**
 * Tmux integration — port of `iterm2/tmux.py`. Represents iTerm2's connection
 * to a tmux server (started via `tmux -CC`).
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import { Transaction } from './transaction';
import type { Session } from './session';
import type { Window } from './window';

const TMUX_STATUS_OK = 0; /* iterm2.TmuxResponse.Status.OK */

function tmuxStatusName(status: number | null | undefined): string {
  switch (status) {
    case 0:
      return 'OK';
    case 1:
      return 'INVALID_REQUEST';
    case 2:
      return 'INVALID_CONNECTION_ID';
    case 3:
      return 'INVALID_WINDOW_ID';
    default:
      return `UNKNOWN(${status ?? 'null'})`;
  }
}

function assertNotInTransaction(): void {
  if (Transaction.current() != null) {
    throw new TmuxException('Cannot use tmux methods from within a Transaction');
  }
}

/**
 * Delegate interface used by {@link TmuxConnection} to resolve sessions and
 * windows without taking a hard dependency on App. Implemented by App.
 */
export interface TmuxDelegate {
  /** Refreshes and returns the window owning the given tab id. */
  tmuxDelegateGetWindowForTabId(tabId: string): Promise<Window | null>;
  /** Looks up a session by id (no refresh). */
  tmuxDelegateGetSessionById(sessionId: string): Session | null;
  /** Returns the underlying iTerm2 connection. */
  tmuxDelegateGetConnection(): Connection;
}

let DELEGATE: TmuxDelegate | null = null;
let DELEGATE_FACTORY:
  | ((conn: Connection) => Promise<TmuxDelegate>)
  | null = null;

/** Install the delegate factory used to lazily create the delegate. */
export function setTmuxDelegateFactory(
  factory: ((conn: Connection) => Promise<TmuxDelegate>) | null
): void {
  DELEGATE_FACTORY = factory;
}

/** Install the delegate directly (mostly for tests). */
export function setTmuxDelegate(delegate: TmuxDelegate | null): void {
  DELEGATE = delegate;
}

export class TmuxException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TmuxException';
  }
}

/**
 * A tmux integration connection.
 *
 * Do not construct this yourself. Use {@link getTmuxConnections}.
 */
export class TmuxConnection {
  constructor(
    private readonly __connectionId: string,
    private readonly __owningSessionId: string,
    private readonly __delegate: TmuxDelegate
  ) {}

  /** The unique identifier (and human-readable description) of the connection. */
  get connectionId(): string {
    return this.__connectionId;
  }

  /** The "gateway" session where `tmux -CC` was run, or null if not found. */
  get owningSession(): Session | null {
    return this.__delegate.tmuxDelegateGetSessionById(this.__owningSessionId);
  }

  /**
   * Sends a command to the tmux server.
   *
   * May not be called from within a {@link Transaction}.
   *
   * @param command - The command to send (e.g., "list-sessions").
   * @returns The command's output.
   * @throws {TmuxException} if the command fails or the RPC fails.
   */
  async sendCommand(command: string): Promise<string> {
    assertNotInTransaction();
    const api = new Api(this.__delegate.tmuxDelegateGetConnection());
    const response = await api.tmux({
      sendCommand: {
        connectionId: this.__connectionId,
        command,
      },
    });
    if ((response.status ?? 0) === TMUX_STATUS_OK) {
      const sendCommand = response.sendCommand;
      if (sendCommand && sendCommand.output != null) {
        return sendCommand.output;
      }
      throw new TmuxException('Tmux reported an error');
    }
    throw new TmuxException(tmuxStatusName(response.status ?? 0));
  }

  /**
   * Hides or shows a tmux window. Tmux windows are represented as iTerm2 tabs;
   * get a tmuxWindowId from `Tab.tmuxWindowId`.
   *
   * May not be called from within a {@link Transaction}.
   */
  async setTmuxWindowVisible(tmuxWindowId: string, visible: boolean): Promise<void> {
    assertNotInTransaction();
    const api = new Api(this.__delegate.tmuxDelegateGetConnection());
    const response = await api.tmux({
      setWindowVisible: {
        connectionId: this.__connectionId,
        windowId: tmuxWindowId,
        visible,
      },
    });
    if ((response.status ?? 0) !== TMUX_STATUS_OK) {
      throw new TmuxException(tmuxStatusName(response.status ?? 0));
    }
  }

  /**
   * Creates a new tmux window.
   *
   * May not be called from within a {@link Transaction}.
   *
   * @returns A new {@link Window}.
   */
  async createWindow(): Promise<Window | null> {
    assertNotInTransaction();
    const api = new Api(this.__delegate.tmuxDelegateGetConnection());
    const response = await api.tmux({
      createWindow: {
        connectionId: this.__connectionId,
      },
    });
    if ((response.status ?? 0) !== TMUX_STATUS_OK) {
      throw new TmuxException(tmuxStatusName(response.status ?? 0));
    }
    const tabId = response.createWindow?.tabId ?? '';
    return this.__delegate.tmuxDelegateGetWindowForTabId(tabId);
  }
}

/**
 * Fetches a list of tmux connections.
 *
 * May not be called from within a {@link Transaction}.
 */
export async function getTmuxConnections(
  connection: Connection
): Promise<TmuxConnection[]> {
  // Work around a bad design we're stuck with because this is a public API.
  // Before, tmux depended on app — that was cyclic. The cycle was broken by
  // introducing a delegate, but this function can be called before App is
  // created. Resolve via the factory so we can make the delegate just in time.
  if (!DELEGATE) {
    if (!DELEGATE_FACTORY) {
      throw new TmuxException(
        'No tmux delegate factory installed. Construct an App first, or call setTmuxDelegateFactory().'
      );
    }
    DELEGATE = await DELEGATE_FACTORY(connection);
  }
  const delegate = DELEGATE;

  const api = new Api(connection);
  const response = await api.tmux({
    listConnections: {},
  });
  if ((response.status ?? 0) === TMUX_STATUS_OK) {
    const connections =
      response.listConnections?.connections ?? [];
    return connections.map(
      (proto: iterm2.TmuxResponse.ListConnections.Connection.$Properties) =>
        new TmuxConnection(
          proto.connectionId ?? '',
          proto.owningSessionId ?? '',
          delegate
        )
    );
  }
  throw new TmuxException(tmuxStatusName(response.status ?? 0));
}

/** Find a tmux connection by its ID, or null if none exists. */
export async function getTmuxConnectionByConnectionId(
  connection: Connection,
  connectionId: string
): Promise<TmuxConnection | null> {
  const connections = await getTmuxConnections(connection);
  for (const candidate of connections) {
    if (candidate.connectionId === connectionId) {
      return candidate;
    }
  }
  return null;
}
