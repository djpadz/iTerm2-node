/**
 * FocusMonitor + FocusUpdate value types — port of `iterm2/focus.py`.
 *
 * Subscribe to focus-change notifications and consume them as
 * `FocusUpdate` objects with the queue/await pattern from variables.ts.
 */

import type { Connection } from './connection';
import {
  subscribeToFocusChangeNotification,
  unsubscribe,
  type SubscriptionToken,
} from './notifications';
import type { iterm2 } from './generated/api';

type FocusNotif = iterm2.FocusChangedNotification.$Properties;

/** Describes a change in whether the application is active. */
export class FocusUpdateApplicationActive {
  constructor(public readonly applicationActive: boolean) {}
}

/** Reason a window's focus changed. Matches iTerm2's WindowStatus enum. */
export enum FocusUpdateWindowReason {
  /** A terminal window received keyboard focus. */
  TERMINAL_WINDOW_BECAME_KEY = 0,
  /** A terminal window is current but some non-terminal window has keyboard focus. */
  TERMINAL_WINDOW_IS_CURRENT = 1,
  /** A terminal window no longer has keyboard focus. */
  TERMINAL_WINDOW_RESIGNED_KEY = 2,
}

/** Describes a change in which window is focused. */
export class FocusUpdateWindowChanged {
  constructor(
    public readonly windowId: string,
    public readonly event: FocusUpdateWindowReason
  ) {}

  toString(): string {
    return `Window ${this.windowId}: ${FocusUpdateWindowReason[this.event]}`;
  }
}

/** Describes a change in the selected tab. */
export class FocusUpdateSelectedTabChanged {
  constructor(public readonly tabId: string) {}

  toString(): string {
    return `Tab selected: ${this.tabId}`;
  }
}

/** Describes a change to the active session within a tab. */
export class FocusUpdateActiveSessionChanged {
  constructor(public readonly sessionId: string) {}

  toString(): string {
    return `Session activated: ${this.sessionId}`;
  }
}

/**
 * Describes a change to keyboard focus. Up to one of `applicationActive`,
 * `windowChanged`, `selectedTabChanged`, or `activeSessionChanged` will be
 * non-null.
 */
export class FocusUpdate {
  constructor(
    public readonly applicationActive: FocusUpdateApplicationActive | null = null,
    public readonly windowChanged: FocusUpdateWindowChanged | null = null,
    public readonly selectedTabChanged: FocusUpdateSelectedTabChanged | null = null,
    public readonly activeSessionChanged: FocusUpdateActiveSessionChanged | null = null
  ) {}

  toString(): string {
    if (this.applicationActive) {
      return `app active=${this.applicationActive.applicationActive}`;
    }
    if (this.windowChanged) return this.windowChanged.toString();
    if (this.selectedTabChanged) return this.selectedTabChanged.toString();
    if (this.activeSessionChanged) return this.activeSessionChanged.toString();
    return 'No Event';
  }
}

/** Decode a FocusChangedNotification proto into a FocusUpdate. */
export function focusUpdateFromProto(proto: FocusNotif): FocusUpdate {
  if (proto.applicationActive != null && proto.event === 'applicationActive') {
    return new FocusUpdate(
      new FocusUpdateApplicationActive(!!proto.applicationActive)
    );
  }
  if (proto.window && proto.event === 'window') {
    const status = (proto.window.windowStatus ?? 0) as number;
    return new FocusUpdate(
      null,
      new FocusUpdateWindowChanged(
        proto.window.windowId ?? '',
        status as FocusUpdateWindowReason
      )
    );
  }
  if (proto.selectedTab != null && proto.event === 'selectedTab') {
    return new FocusUpdate(
      null,
      null,
      new FocusUpdateSelectedTabChanged(proto.selectedTab ?? '')
    );
  }
  if (proto.session != null && proto.event === 'session') {
    return new FocusUpdate(
      null,
      null,
      null,
      new FocusUpdateActiveSessionChanged(proto.session ?? '')
    );
  }
  return new FocusUpdate();
}

/** Monitors keyboard-focus changes. */
export class FocusMonitor {
  private _token: SubscriptionToken<FocusNotif> | null = null;
  private _queue: FocusNotif[] = [];
  private _waiters: Array<(value: FocusNotif) => void> = [];

  constructor(private readonly conn: Connection) {}

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToFocusChangeNotification(
      this.conn,
      async (_c, message) => this._enqueue(message)
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

  /** Resolves with the next FocusUpdate. */
  async getNextUpdate(): Promise<FocusUpdate> {
    const proto = await this._next();
    return focusUpdateFromProto(proto);
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<FocusUpdate> {
    await this.start();
    try {
      while (true) {
        yield await this.getNextUpdate();
      }
    } finally {
      await this.stop();
    }
  }

  static async with<T>(
    conn: Connection,
    fn: (mon: FocusMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new FocusMonitor(conn).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }

  private _enqueue(notif: FocusNotif): void {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(notif);
    } else {
      this._queue.push(notif);
    }
  }

  private _next(): Promise<FocusNotif> {
    const next = this._queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => this._waiters.push(resolve));
  }
}
