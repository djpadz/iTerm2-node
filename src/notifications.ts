/**
 * Subscribe/unsubscribe from async notifications — port of
 * `iterm2/notifications.py`. Keys for the handler registry are JSON-encoded
 * tuples so structural equality works with `Map`.
 */

import type { Connection } from './connection';
import type { iterm2 } from './generated/api';

type N = iterm2.NotificationType;
const NT = {
  KEYSTROKE: 1 as N,
  SCREEN_UPDATE: 2 as N,
  PROMPT: 3 as N,
  LOCATION_CHANGE: 4 as N,
  CUSTOM_ESCAPE_SEQUENCE: 5 as N,
  NEW_SESSION: 6 as N,
  TERMINATE_SESSION: 7 as N,
  LAYOUT_CHANGE: 8 as N,
  FOCUS_CHANGE: 9 as N,
  SERVER_ORIGINATED_RPC: 10 as N,
  BROADCAST_CHANGE: 11 as N,
  VARIABLE_CHANGE: 12 as N,
  PROFILE_CHANGE: 13 as N,
  KEYSTROKE_FILTER: 14 as N,
} as const;

export const NotificationType = NT;

export enum RpcRole {
  GENERIC = 0,
  SESSION_TITLE = 1,
  STATUS_BAR_COMPONENT = 2,
  CONTEXT_MENU = 3,
}

export class SubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/** Opaque-ish handle returned from subscribe; pass to `unsubscribe`. */
export interface SubscriptionToken<T = unknown> {
  readonly key: string;
  readonly callback: NotificationCallback<T>;
}

export type NotificationCallback<T = unknown> = (
  conn: Connection,
  notif: T
) => void | Promise<void>;

type AnyNotification = iterm2.Notification.$Properties;

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

function rpcSignature(
  rpc: iterm2.ServerOriginatedRPC.$Properties | null | undefined
): string | null {
  if (!rpc) return null;
  const args = (rpc.arguments ?? [])
    .map((a) => a.name ?? '')
    .sort();
  return `${rpc.name ?? ''}(${args.join(',')})`;
}

function rpcSignatureFromRequest(
  req: iterm2.RPCRegistrationRequest.$Properties | null | undefined
): string | null {
  if (!req) return null;
  const args = (req.arguments ?? [])
    .map((a) => a.name ?? '')
    .sort();
  return `${req.name ?? ''}(${args.join(',')})`;
}

function makeKey(parts: unknown[]): string {
  return JSON.stringify(parts);
}

/**
 * Returns `[key, subNotification]` for a given Notification envelope.
 * Matches the dispatch table in `_get_handler_key_from_notification`.
 */
function keyForNotification(
  n: AnyNotification
): [string | null, unknown] {
  if (n.keystrokeNotification) {
    return [
      makeKey([n.keystrokeNotification.session ?? null, NT.KEYSTROKE]),
      n.keystrokeNotification,
    ];
  }
  if (n.screenUpdateNotification) {
    return [
      makeKey([n.screenUpdateNotification.session ?? null, NT.SCREEN_UPDATE]),
      n.screenUpdateNotification,
    ];
  }
  if (n.promptNotification) {
    return [
      makeKey([n.promptNotification.session ?? null, NT.PROMPT]),
      n.promptNotification,
    ];
  }
  if (n.locationChangeNotification) {
    return [
      makeKey([n.locationChangeNotification.session ?? null, NT.LOCATION_CHANGE]),
      n.locationChangeNotification,
    ];
  }
  if (n.customEscapeSequenceNotification) {
    return [
      makeKey([
        n.customEscapeSequenceNotification.session ?? null,
        NT.CUSTOM_ESCAPE_SEQUENCE,
      ]),
      n.customEscapeSequenceNotification,
    ];
  }
  if (n.newSessionNotification) {
    return [makeKey([null, NT.NEW_SESSION]), n.newSessionNotification];
  }
  if (n.terminateSessionNotification) {
    return [makeKey([null, NT.TERMINATE_SESSION]), n.terminateSessionNotification];
  }
  if (n.layoutChangedNotification) {
    return [makeKey([null, NT.LAYOUT_CHANGE]), n.layoutChangedNotification];
  }
  if (n.focusChangedNotification) {
    return [makeKey([null, NT.FOCUS_CHANGE]), n.focusChangedNotification];
  }
  if (n.serverOriginatedRpcNotification) {
    return [
      makeKey([
        null,
        NT.SERVER_ORIGINATED_RPC,
        rpcSignature(n.serverOriginatedRpcNotification.rpc),
      ]),
      n.serverOriginatedRpcNotification,
    ];
  }
  if (n.broadcastDomainsChanged) {
    return [makeKey([null, NT.BROADCAST_CHANGE]), n.broadcastDomainsChanged];
  }
  if (n.variableChangedNotification) {
    const v = n.variableChangedNotification;
    return [
      makeKey([v.scope ?? 0, v.identifier ?? '', v.name ?? '', NT.VARIABLE_CHANGE]),
      v,
    ];
  }
  if (n.profileChangedNotification) {
    return [
      makeKey([n.profileChangedNotification.guid ?? '', NT.PROFILE_CHANGE]),
      n.profileChangedNotification,
    ];
  }
  return [null, null];
}

/**
 * Keys that catch "all"-style subscriptions when a specific notification
 * arrives — mirrors `_get_all_sessions_handler_keys_from_notification`.
 */
function allObjectKeysForNotification(n: AnyNotification): string[] {
  if (n.variableChangedNotification) {
    return [
      makeKey([
        1 /* SESSION */,
        'all',
        n.variableChangedNotification.name ?? '',
        NT.VARIABLE_CHANGE,
      ]),
      makeKey([
        2 /* WINDOW */,
        'all',
        n.variableChangedNotification.name ?? '',
        NT.VARIABLE_CHANGE,
      ]),
    ];
  }
  const [specific] = keyForNotification(n);
  if (!specific) return [];
  // Convert (session, type) → (null, type)  to match all-sessions subscriptions.
  // Specific key parts: [session, type, ...rest]
  const parts = JSON.parse(specific) as unknown[];
  if (parts.length >= 2 && parts[0] !== null) {
    parts[0] = null;
    return [JSON.stringify(parts)];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Per-connection registry
// ---------------------------------------------------------------------------

const REGISTRY = new WeakMap<Connection, NotificationRegistry>();

class NotificationRegistry {
  private handlers = new Map<string, Set<NotificationCallback<unknown>>>();
  private installed = false;

  constructor(private conn: Connection) {}

  ensureHelper(): void {
    if (this.installed) return;
    this.installed = true;
    this.conn.registerHelper(async (_c, msg) => {
      const n = (msg as { notification?: AnyNotification }).notification;
      if (!n) return false;
      return this.dispatch(n);
    });
  }

  add(key: string, cb: NotificationCallback<unknown>): void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(cb);
  }

  remove(key: string, cb: NotificationCallback<unknown>): boolean {
    const set = this.handlers.get(key);
    if (!set) return false;
    const ok = set.delete(cb);
    if (set.size === 0) this.handlers.delete(key);
    return ok;
  }

  hasKey(key: string): boolean {
    return this.handlers.has(key);
  }

  private async dispatch(n: AnyNotification): Promise<boolean> {
    const [primaryKey, subNotif] = keyForNotification(n);
    if (!primaryKey) return false;

    let matched: Set<NotificationCallback<unknown>> | undefined;
    if (this.handlers.has(primaryKey)) {
      matched = this.handlers.get(primaryKey);
    } else {
      for (const allKey of allObjectKeysForNotification(n)) {
        if (this.handlers.has(allKey)) {
          matched = this.handlers.get(allKey);
          break;
        }
      }
    }

    if (matched && matched.size > 0) {
      for (const cb of [...matched]) {
        await cb(this.conn, subNotif);
      }
      return true;
    }
    return false;
  }
}

function registryFor(conn: Connection): NotificationRegistry {
  let reg = REGISTRY.get(conn);
  if (!reg) {
    reg = new NotificationRegistry(conn);
    REGISTRY.set(conn, reg);
  }
  reg.ensureHelper();
  return reg;
}

// ---------------------------------------------------------------------------
// Low-level subscribe (mirror of Python `_async_subscribe`)
// ---------------------------------------------------------------------------

interface SubscribeOptions {
  session?: string | null;
  rpcRegistrationRequest?: iterm2.RPCRegistrationRequest.$Properties;
  keystrokeMonitorRequest?: iterm2.KeystrokeMonitorRequest.$Properties;
  variableMonitorRequest?: iterm2.VariableMonitorRequest.$Properties;
  profileChangeRequest?: iterm2.ProfileChangeRequest.$Properties;
  promptMonitorModes?: iterm2.PromptMonitorMode[];
  keystrokeFilterRequest?: iterm2.KeystrokeFilterRequest.$Properties;
  /** Override the dispatch key if the default (session, type) doesn't fit. */
  customKey?: unknown[];
}

async function lowLevelSubscribe<T>(
  conn: Connection,
  subscribe: boolean,
  notificationType: iterm2.NotificationType,
  callback: NotificationCallback<T>,
  opts: SubscribeOptions = {}
): Promise<SubscriptionToken<T>> {
  const reg = registryFor(conn);
  const session = opts.session ?? null;
  const transformedSession = opts.session != null ? opts.session : 'all';

  // Build a default key (matches python `_register_notification_handler`).
  let keyParts: unknown[];
  if (opts.customKey) {
    keyParts = opts.customKey;
  } else if (opts.rpcRegistrationRequest) {
    keyParts = [
      session,
      notificationType,
      rpcSignatureFromRequest(opts.rpcRegistrationRequest),
    ];
  } else {
    keyParts = [session, notificationType];
  }
  const key = makeKey(keyParts);

  if (subscribe) {
    reg.add(key, callback as NotificationCallback<unknown>);
  }

  // Build the NotificationRequest proto.
  const req: iterm2.NotificationRequest.$Properties = {
    subscribe,
    notificationType,
  };
  if (transformedSession != null) req.session = transformedSession;
  if (opts.rpcRegistrationRequest) {
    req.rpcRegistrationRequest = opts.rpcRegistrationRequest;
  }
  if (opts.keystrokeMonitorRequest) {
    req.keystrokeMonitorRequest = opts.keystrokeMonitorRequest;
  }
  if (opts.variableMonitorRequest) {
    req.variableMonitorRequest = opts.variableMonitorRequest;
  }
  if (opts.profileChangeRequest) {
    req.profileChangeRequest = opts.profileChangeRequest;
  }
  if (opts.promptMonitorModes && opts.promptMonitorModes.length) {
    req.promptMonitorRequest = { modes: opts.promptMonitorModes };
  }
  if (opts.keystrokeFilterRequest) {
    req.keystrokeFilterRequest = opts.keystrokeFilterRequest;
  }

  const response = (await conn.request({ notificationRequest: req })) as {
    notificationResponse?: iterm2.NotificationResponse.$Properties;
  };
  const status = response.notificationResponse?.status ?? 0;
  const STATUS_OK = 0; // NotificationResponse.Status.OK
  const STATUS_ALREADY_SUBSCRIBED = 4;

  if (subscribe) {
    if (status === STATUS_OK || status === STATUS_ALREADY_SUBSCRIBED) {
      return { key, callback };
    }
    reg.remove(key, callback as NotificationCallback<unknown>);
  } else {
    if (status === STATUS_OK) return { key, callback };
  }

  throw new SubscriptionError(
    `Notification ${subscribe ? 'subscribe' : 'unsubscribe'} failed; status=${status}`
  );
}

export async function unsubscribe<T>(
  conn: Connection,
  token: SubscriptionToken<T>
): Promise<void> {
  const reg = registryFor(conn);
  reg.remove(token.key, token.callback as NotificationCallback<unknown>);
  // We don't always have enough info to re-emit the unsubscribe request to
  // iTerm2 (the original request payload is gone). For session/type keys we
  // can fabricate one; otherwise we just drop the local handler — iTerm2 will
  // continue sending the notification but it'll be ignored.
  const parts = JSON.parse(token.key) as unknown[];
  if (parts.length === 2) {
    const [session, type] = parts as [string | null, iterm2.NotificationType];
    const transformed = session ?? 'all';
    await conn
      .request({
        notificationRequest: {
          subscribe: false,
          notificationType: type,
          session: transformed,
        },
      })
      .catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// High-level helpers — one per notification type, mirroring Python.
// ---------------------------------------------------------------------------

export type NewSessionCallback = NotificationCallback<iterm2.NewSessionNotification.$Properties>;
export function subscribeToNewSessionNotification(
  conn: Connection,
  cb: NewSessionCallback
) {
  return lowLevelSubscribe(conn, true, NT.NEW_SESSION, cb);
}

export type TerminateSessionCallback = NotificationCallback<iterm2.TerminateSessionNotification.$Properties>;
export function subscribeToTerminateSessionNotification(
  conn: Connection,
  cb: TerminateSessionCallback
) {
  return lowLevelSubscribe(conn, true, NT.TERMINATE_SESSION, cb);
}

export type LayoutChangedCallback = NotificationCallback<iterm2.LayoutChangedNotification.$Properties>;
export function subscribeToLayoutChangeNotification(
  conn: Connection,
  cb: LayoutChangedCallback
) {
  return lowLevelSubscribe(conn, true, NT.LAYOUT_CHANGE, cb);
}

export type FocusChangedCallback = NotificationCallback<iterm2.FocusChangedNotification.$Properties>;
export function subscribeToFocusChangeNotification(
  conn: Connection,
  cb: FocusChangedCallback
) {
  return lowLevelSubscribe(conn, true, NT.FOCUS_CHANGE, cb);
}

export type BroadcastDomainsChangedCallback = NotificationCallback<iterm2.BroadcastDomainsChangedNotification.$Properties>;
export function subscribeToBroadcastDomainsChangeNotification(
  conn: Connection,
  cb: BroadcastDomainsChangedCallback
) {
  return lowLevelSubscribe(conn, true, NT.BROADCAST_CHANGE, cb);
}

export type KeystrokeCallback = NotificationCallback<iterm2.KeystrokeNotification.$Properties>;
export function subscribeToKeystrokeNotification(
  conn: Connection,
  cb: KeystrokeCallback,
  opts: { session?: string | null; advanced?: boolean } = {}
) {
  return lowLevelSubscribe(conn, true, NT.KEYSTROKE, cb, {
    session: opts.session ?? null,
    keystrokeMonitorRequest: { advanced: opts.advanced ?? false },
  });
}

export type ScreenUpdateCallback = NotificationCallback<iterm2.ScreenUpdateNotification.$Properties>;
export function subscribeToScreenUpdateNotification(
  conn: Connection,
  cb: ScreenUpdateCallback,
  opts: { session?: string | null } = {}
) {
  return lowLevelSubscribe(conn, true, NT.SCREEN_UPDATE, cb, {
    session: opts.session ?? null,
  });
}

export type CustomEscapeSequenceCallback = NotificationCallback<iterm2.CustomEscapeSequenceNotification.$Properties>;
export function subscribeToCustomEscapeSequenceNotification(
  conn: Connection,
  cb: CustomEscapeSequenceCallback,
  opts: { session?: string | null } = {}
) {
  return lowLevelSubscribe(conn, true, NT.CUSTOM_ESCAPE_SEQUENCE, cb, {
    session: opts.session ?? null,
  });
}

export type PromptCallback = NotificationCallback<iterm2.PromptNotification.$Properties>;
export function subscribeToPromptNotification(
  conn: Connection,
  cb: PromptCallback,
  opts: {
    session?: string | null;
    modes?: iterm2.PromptMonitorMode[];
  } = {}
) {
  return lowLevelSubscribe(conn, true, NT.PROMPT, cb, {
    session: opts.session ?? null,
    promptMonitorModes: opts.modes ?? [],
  });
}

export type VariableChangedCallback = NotificationCallback<iterm2.VariableChangedNotification.$Properties>;
export function subscribeToVariableChangeNotification(
  conn: Connection,
  cb: VariableChangedCallback,
  opts: {
    scope: iterm2.VariableScope;
    name: string;
    identifier?: string | null;
  }
) {
  const req: iterm2.VariableMonitorRequest.$Properties = {
    name: opts.name,
    scope: opts.scope,
    identifier: opts.identifier ?? '',
  };
  return lowLevelSubscribe(conn, true, NT.VARIABLE_CHANGE, cb, {
    variableMonitorRequest: req,
    customKey: [opts.scope, opts.identifier ?? '', opts.name, NT.VARIABLE_CHANGE],
  });
}

export type ProfileChangedCallback = NotificationCallback<iterm2.ProfileChangedNotification.$Properties>;
export function subscribeToProfileChangeNotification(
  conn: Connection,
  cb: ProfileChangedCallback,
  opts: { guid: string }
) {
  return lowLevelSubscribe(conn, true, NT.PROFILE_CHANGE, cb, {
    profileChangeRequest: { guid: opts.guid },
    customKey: [opts.guid, NT.PROFILE_CHANGE],
  });
}

export type ServerOriginatedRpcCallback = NotificationCallback<iterm2.ServerOriginatedRPCNotification.$Properties>;
export function subscribeToServerOriginatedRpcNotification(
  conn: Connection,
  cb: ServerOriginatedRpcCallback,
  opts: {
    name: string;
    arguments?: string[];
    timeoutSeconds?: number;
    defaults?: Record<string, string>;
    role?: RpcRole;
    sessionTitleDisplayName?: string;
    sessionTitleUniqueId?: string;
    contextMenuDisplayName?: string;
    contextMenuUniqueId?: string;
  }
) {
  const req: iterm2.RPCRegistrationRequest.$Properties = {
    name: opts.name,
    timeout: opts.timeoutSeconds ?? 5,
    arguments: (opts.arguments ?? []).map((n) => ({ name: n })),
    role: (opts.role ?? RpcRole.GENERIC) as unknown as iterm2.RPCRegistrationRequest.Role,
  };
  if (opts.defaults) {
    req.defaults = Object.entries(opts.defaults).map(([name, path]) => ({ name, path }));
  }
  if (opts.sessionTitleDisplayName) {
    req.sessionTitleAttributes = {
      displayName: opts.sessionTitleDisplayName,
      uniqueIdentifier: opts.sessionTitleUniqueId ?? '',
    };
  } else if (opts.contextMenuDisplayName) {
    req.contextMenuAttributes = {
      displayName: opts.contextMenuDisplayName,
      uniqueIdentifier: opts.contextMenuUniqueId ?? '',
    };
  }
  return lowLevelSubscribe(conn, true, NT.SERVER_ORIGINATED_RPC, cb, {
    rpcRegistrationRequest: req,
  });
}
