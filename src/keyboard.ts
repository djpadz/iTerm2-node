/**
 * Keyboard monitoring and key filtering — port of `iterm2/keyboard.py`.
 *
 * Provides:
 *  - `Modifier` enum with Cocoa modifier-mask conversion helpers.
 *  - `Keycode` enum of virtual keycodes (physical-key codes).
 *  - `Keystroke` value-object wrapping a `KeystrokeNotification`.
 *  - `KeystrokePattern` describing which keystrokes a filter affects.
 *  - `KeystrokeMonitor` async iterator over keystroke events.
 *  - `KeystrokeFilter` to suppress iTerm2's handling of matching keystrokes.
 */

import type { Connection } from './connection';
import type { iterm2 } from './generated/api';
import {
  subscribeToKeystrokeNotification,
  unsubscribe,
  type KeystrokeCallback,
  type SubscriptionToken,
} from './notifications';

// ---------------------------------------------------------------------------
// Modifier
// ---------------------------------------------------------------------------

/**
 * Modifier keys. Numeric values match the wire `iterm2.Modifiers` enum.
 */
export enum Modifier {
  CONTROL = 1,
  OPTION = 2,
  COMMAND = 3,
  SHIFT = 4,
  FUNCTION = 5,
  NUMPAD = 6,
}

// Cocoa NSEventModifierFlags bit positions.
const MOD_BITS: Record<Modifier, number> = {
  [Modifier.CONTROL]: 1 << 18,
  [Modifier.OPTION]: 1 << 19,
  [Modifier.COMMAND]: 1 << 20,
  [Modifier.SHIFT]: 1 << 17,
  [Modifier.FUNCTION]: 1 << 23,
  [Modifier.NUMPAD]: 1 << 21,
};

export const ModifierUtil = {
  /** Decode a Cocoa modifier mask into a list of `Modifier`s. */
  fromCocoa(value: number): Modifier[] {
    const out: Modifier[] = [];
    if (value & MOD_BITS[Modifier.CONTROL]) out.push(Modifier.CONTROL);
    if (value & MOD_BITS[Modifier.OPTION]) out.push(Modifier.OPTION);
    if (value & MOD_BITS[Modifier.COMMAND]) out.push(Modifier.COMMAND);
    if (value & MOD_BITS[Modifier.SHIFT]) out.push(Modifier.SHIFT);
    if (value & MOD_BITS[Modifier.FUNCTION]) out.push(Modifier.FUNCTION);
    if (value & MOD_BITS[Modifier.NUMPAD]) out.push(Modifier.NUMPAD);
    return out;
  },

  /** Encode a single `Modifier` into its Cocoa bit. */
  toCocoa(m: Modifier): number {
    return MOD_BITS[m] ?? 0;
  },

  /** OR together Cocoa bits for a list of modifiers. */
  toCocoaMask(mods: Modifier[]): number {
    let mask = 0;
    for (const m of mods) mask |= MOD_BITS[m] ?? 0;
    return mask;
  },
};

// ---------------------------------------------------------------------------
// Keycode
// ---------------------------------------------------------------------------

/**
 * Virtual keycodes — physical-key codes from Apple's `Events.h`.
 * Independent of the active keyboard layout.
 */
export enum Keycode {
  ANSI_A = 0x00,
  ANSI_S = 0x01,
  ANSI_D = 0x02,
  ANSI_F = 0x03,
  ANSI_H = 0x04,
  ANSI_G = 0x05,
  ANSI_Z = 0x06,
  ANSI_X = 0x07,
  ANSI_C = 0x08,
  ANSI_V = 0x09,
  ANSI_B = 0x0b,
  ANSI_Q = 0x0c,
  ANSI_W = 0x0d,
  ANSI_E = 0x0e,
  ANSI_R = 0x0f,
  ANSI_Y = 0x10,
  ANSI_T = 0x11,
  ANSI_1 = 0x12,
  ANSI_2 = 0x13,
  ANSI_3 = 0x14,
  ANSI_4 = 0x15,
  ANSI_6 = 0x16,
  ANSI_5 = 0x17,
  ANSI_EQUAL = 0x18,
  ANSI_9 = 0x19,
  ANSI_7 = 0x1a,
  ANSI_MINUS = 0x1b,
  ANSI_8 = 0x1c,
  ANSI_0 = 0x1d,
  ANSI_RIGHT_BRACKET = 0x1e,
  ANSI_O = 0x1f,
  ANSI_U = 0x20,
  ANSI_LEFT_BRACKET = 0x21,
  ANSI_I = 0x22,
  ANSI_P = 0x23,
  ANSI_L = 0x25,
  ANSI_J = 0x26,
  ANSI_QUOTE = 0x27,
  ANSI_K = 0x28,
  ANSI_SEMICOLON = 0x29,
  ANSI_BACKSLASH = 0x2a,
  ANSI_COMMA = 0x2b,
  ANSI_SLASH = 0x2c,
  ANSI_N = 0x2d,
  ANSI_M = 0x2e,
  ANSI_PERIOD = 0x2f,
  ANSI_GRAVE = 0x32,
  ANSI_KEYPAD_DECIMAL = 0x41,
  ANSI_KEYPAD_MULTIPLY = 0x43,
  ANSI_KEYPAD_PLUS = 0x45,
  ANSI_KEYPAD_CLEAR = 0x47,
  ANSI_KEYPAD_DIVIDE = 0x4b,
  ANSI_KEYPAD_ENTER = 0x4c,
  ANSI_KEYPAD_MINUS = 0x4e,
  ANSI_KEYPAD_EQUALS = 0x51,
  ANSI_KEYPAD0 = 0x52,
  ANSI_KEYPAD1 = 0x53,
  ANSI_KEYPAD2 = 0x54,
  ANSI_KEYPAD3 = 0x55,
  ANSI_KEYPAD4 = 0x56,
  ANSI_KEYPAD5 = 0x57,
  ANSI_KEYPAD6 = 0x58,
  ANSI_KEYPAD7 = 0x59,
  ANSI_KEYPAD8 = 0x5b,
  ANSI_KEYPAD9 = 0x5c,
  RETURN = 0x24,
  TAB = 0x30,
  SPACE = 0x31,
  DELETE = 0x33,
  ESCAPE = 0x35,
  COMMAND = 0x37,
  SHIFT = 0x38,
  CAPS_LOCK = 0x39,
  OPTION = 0x3a,
  CONTROL = 0x3b,
  RIGHT_COMMAND = 0x36,
  RIGHT_SHIFT = 0x3c,
  RIGHT_OPTION = 0x3d,
  RIGHT_CONTROL = 0x3e,
  FUNCTION = 0x3f,
  F17 = 0x40,
  VOLUME_UP = 0x48,
  VOLUME_DOWN = 0x49,
  MUTE = 0x4a,
  F18 = 0x4f,
  F19 = 0x50,
  F20 = 0x5a,
  F5 = 0x60,
  F6 = 0x61,
  F7 = 0x62,
  F3 = 0x63,
  F8 = 0x64,
  F9 = 0x65,
  F11 = 0x67,
  F13 = 0x69,
  F16 = 0x6a,
  F14 = 0x6b,
  F10 = 0x6d,
  F12 = 0x6f,
  F15 = 0x71,
  HELP = 0x72,
  HOME = 0x73,
  PAGE_UP = 0x74,
  FORWARD_DELETE = 0x75,
  F4 = 0x76,
  END = 0x77,
  F2 = 0x78,
  PAGE_DOWN = 0x79,
  F1 = 0x7a,
  LEFT_ARROW = 0x7b,
  RIGHT_ARROW = 0x7c,
  DOWN_ARROW = 0x7d,
  UP_ARROW = 0x7e,
}

// ---------------------------------------------------------------------------
// Keystroke
// ---------------------------------------------------------------------------

/**
 * Type of keyboard event. Numeric values match the wire
 * `iterm2.KeystrokeNotification.Action` enum, plus `NA` (no advanced
 * monitoring) which the python API exposes as a distinct value.
 */
export enum KeystrokeAction {
  NA = -1,
  KEY_DOWN = 0,
  KEY_UP = 1,
  FLAGS_CHANGED = 2,
}

type KeystrokeNotif = iterm2.KeystrokeNotification.$Properties;

/**
 * Describes a single keystroke. Instances are produced by `KeystrokeMonitor`.
 */
export class Keystroke {
  private readonly _characters: string;
  private readonly _charactersIgnoringModifiers: string;
  private readonly _modifiers: number[];
  private readonly _keyCode: number;
  private readonly _action: KeystrokeAction;

  constructor(notification: KeystrokeNotif) {
    this._characters = notification.characters ?? '';
    this._charactersIgnoringModifiers =
      notification.charactersIgnoringModifiers ?? '';
    this._modifiers = (notification.modifiers ?? []) as unknown as number[];
    this._keyCode = notification.keyCode ?? 0;
    if (notification.action == null) {
      this._action = KeystrokeAction.NA;
    } else {
      // The wire enum values map 1:1 to KeystrokeAction.
      this._action = notification.action as unknown as KeystrokeAction;
    }
  }

  /** Characters that would normally be produced by this keystroke. */
  get characters(): string {
    return this._characters;
  }

  /** Characters that would be produced ignoring modifiers (besides shift). */
  get charactersIgnoringModifiers(): string {
    return this._charactersIgnoringModifiers;
  }

  /** Modifiers that were pressed. */
  get modifiers(): Modifier[] {
    return this._modifiers.map((m) => m as Modifier);
  }

  /** ANSI keycode pressed. */
  get keycode(): Keycode {
    return this._keyCode as Keycode;
  }

  /** Kind of keystroke (only meaningful when advanced monitoring is on). */
  get action(): KeystrokeAction {
    return this._action;
  }

  toString(): string {
    let info =
      `chars=${this._characters}, ` +
      `charsIgnoringModifiers=${this._charactersIgnoringModifiers}, ` +
      `modifiers=${JSON.stringify(this.modifiers)}, ` +
      `keyCode=${this._keyCode}`;
    if (this._action === KeystrokeAction.KEY_DOWN) info += ', action=key-down';
    else if (this._action === KeystrokeAction.KEY_UP) info += ', action=key-up';
    else if (this._action === KeystrokeAction.FLAGS_CHANGED)
      info += ', action=flags-changed';
    return `Keystroke(${info})`;
  }
}

// ---------------------------------------------------------------------------
// KeystrokePattern
// ---------------------------------------------------------------------------

/**
 * Selects keystrokes by modifiers, keycodes, characters, or characters-
 * ignoring-modifiers. Used by `KeystrokeFilter`.
 */
export class KeystrokePattern {
  requiredModifiers: Modifier[] = [];
  forbiddenModifiers: Modifier[] = [];
  keycodes: Keycode[] = [];
  characters: string[] = [];
  charactersIgnoringModifiers: string[] = [];

  /** Build the wire protobuf for this pattern. */
  toProto(): iterm2.KeystrokePattern.$Properties {
    return {
      requiredModifiers: this.requiredModifiers.map(
        (m) => m as unknown as iterm2.Modifiers
      ),
      forbiddenModifiers: this.forbiddenModifiers.map(
        (m) => m as unknown as iterm2.Modifiers
      ),
      keycodes: this.keycodes.map((k) => k as number),
      characters: [...this.characters],
      charactersIgnoringModifiers: [...this.charactersIgnoringModifiers],
    };
  }
}

// ---------------------------------------------------------------------------
// KeystrokeMonitor
// ---------------------------------------------------------------------------

/**
 * Watches keystrokes for one session (or all, if `session` is null). Use:
 *
 * ```ts
 * const mon = await new KeystrokeMonitor(conn).start();
 * try {
 *   for await (const stroke of mon) handle(stroke);
 * } finally {
 *   await mon.stop();
 * }
 * ```
 *
 * If `advanced` is true, key-up and flags-changed events are also reported
 * (in addition to key-down).
 */
export class KeystrokeMonitor {
  private _token: SubscriptionToken<KeystrokeNotif> | null = null;
  private _queue: KeystrokeNotif[] = [];
  private _waiters: Array<(value: KeystrokeNotif) => void> = [];

  constructor(
    private readonly conn: Connection,
    private readonly session: string | null = null,
    private readonly advanced: boolean = false
  ) {}

  /** Subscribe to keystroke notifications. Idempotent. */
  async start(): Promise<this> {
    if (this._token) return this;
    const callback: KeystrokeCallback = async (_c, notif) => this._enqueue(notif);
    this._token = await subscribeToKeystrokeNotification(this.conn, callback, {
      session: this.session,
      advanced: this.advanced,
    });
    return this;
  }

  /** Unsubscribe. Safe to call multiple times. */
  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.conn, this._token);
    } catch {
      /* ignore */
    }
    this._token = null;
  }

  /** Resolve with the next `Keystroke`. */
  async get(): Promise<Keystroke> {
    const notif = await this._next();
    return new Keystroke(notif);
  }

  /** Async iterator yielding keystrokes forever. Starts/stops automatically. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<Keystroke> {
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
   * Convenience: run `fn(monitor)` between start and stop.
   */
  static async with<T>(
    conn: Connection,
    opts: {
      session?: string | null;
      advanced?: boolean;
    },
    fn: (mon: KeystrokeMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new KeystrokeMonitor(
      conn,
      opts.session ?? null,
      opts.advanced ?? false
    ).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }

  private _enqueue(notif: KeystrokeNotif): void {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(notif);
    } else {
      this._queue.push(notif);
    }
  }

  private _next(): Promise<KeystrokeNotif> {
    const next = this._queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => this._waiters.push(resolve));
  }
}

// ---------------------------------------------------------------------------
// KeystrokeFilter
// ---------------------------------------------------------------------------

const NT_KEYSTROKE_FILTER = 14 as iterm2.NotificationType;
const NOTIF_OK = 0;
const NOTIF_ALREADY_SUBSCRIBED = 2;

export class FilterSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterSubscriptionError';
  }
}

/**
 * Suppresses iTerm2's normal handling of keystrokes that match `patterns`
 * for as long as the filter is `start()`ed. Pair with a `KeystrokeMonitor`
 * if you want to *see* the suppressed keystrokes.
 *
 * ```ts
 * const ctrl = new KeystrokePattern();
 * ctrl.requiredModifiers = [Modifier.CONTROL];
 * ctrl.keycodes = [Keycode.ANSI_C, Keycode.ANSI_D];
 * const filter = await new KeystrokeFilter(conn, [ctrl]).start();
 * try {
 *   // ...
 * } finally {
 *   await filter.stop();
 * }
 * ```
 *
 * The Python API used the KEYSTROKE_FILTER notification subscription as an
 * RPC: it returns OK/ALREADY_SUBSCRIBED on success but never delivers a
 * payload. We replicate that here by talking directly to `conn.request`
 * (the existing high-level notification helpers don't expose this).
 */
export class KeystrokeFilter {
  private _active = false;

  constructor(
    private readonly conn: Connection,
    private readonly patterns: KeystrokePattern[],
    private readonly session: string | null = null
  ) {}

  async start(): Promise<this> {
    if (this._active) return this;
    await this._send(true);
    this._active = true;
    return this;
  }

  async stop(): Promise<void> {
    if (!this._active) return;
    try {
      await this._send(false);
    } catch {
      /* ignore */
    }
    this._active = false;
  }

  /** Run `fn` while the filter is active. */
  static async with<T>(
    conn: Connection,
    patterns: KeystrokePattern[],
    session: string | null,
    fn: (filter: KeystrokeFilter) => Promise<T>
  ): Promise<T> {
    const f = await new KeystrokeFilter(conn, patterns, session).start();
    try {
      return await fn(f);
    } finally {
      await f.stop();
    }
  }

  private async _send(subscribe: boolean): Promise<void> {
    const req: iterm2.NotificationRequest.$Properties = {
      subscribe,
      notificationType: NT_KEYSTROKE_FILTER,
      session: this.session ?? 'all',
      keystrokeFilterRequest: {
        patternsToIgnore: this.patterns.map((p) => p.toProto()),
      },
    };
    const response = (await this.conn.request({
      notificationRequest: req,
    })) as { notificationResponse?: iterm2.NotificationResponse.$Properties };
    const status = response.notificationResponse?.status ?? 0;
    if (subscribe) {
      if (status === NOTIF_OK || status === NOTIF_ALREADY_SUBSCRIBED) return;
    } else if (status === NOTIF_OK) {
      return;
    }
    throw new FilterSubscriptionError(
      `KeystrokeFilter ${subscribe ? 'subscribe' : 'unsubscribe'} failed; status=${status}`
    );
  }
}
