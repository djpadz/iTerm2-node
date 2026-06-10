/**
 * FocusMonitor + FocusUpdate value types — port of `iterm2/focus.py`.
 *
 * Subscribe to focus-change notifications and consume them as
 * `FocusUpdate` objects with the queue/await pattern from variables.ts.
 */

import type { Connection } from './connection';
import { BaseMonitor, withMonitor } from './monitor';
import { subscribeToFocusChangeNotification } from './notifications';
import type { iterm2 } from './generated/api';

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
export function focusUpdateFromProto(
  proto: iterm2.FocusChangedNotification.$Properties
): FocusUpdate {
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
export class FocusMonitor extends BaseMonitor<FocusUpdate> {
  constructor(conn: Connection) {
    super(conn);
  }

  protected _subscribe() {
    return subscribeToFocusChangeNotification(
      this.conn,
      async (_c, proto) => this._deliver(focusUpdateFromProto(proto))
    );
  }

  /** Resolves with the next FocusUpdate. Kept as an alias for `get()`. */
  getNextUpdate(): Promise<FocusUpdate> {
    return this.get();
  }

  static with<T>(
    conn: Connection,
    fn: (mon: FocusMonitor) => Promise<T>
  ): Promise<T> {
    return withMonitor(new FocusMonitor(conn), fn);
  }
}
