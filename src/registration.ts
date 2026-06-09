/**
 * RPC handler registration — port of `iterm2/registration.py`.
 *
 * Python uses decorators (`@iterm2.RPC`, `@iterm2.TitleProviderRPC`, …) to
 * declare callbacks that iTerm2 can invoke. In TypeScript we expose the
 * same capability as methods on a single `Registration` class.
 *
 * The user-supplied callback receives a plain object whose keys are the
 * named RPC arguments (already JSON-decoded). Its return value is JSON-
 * encoded and sent back as the RPC result; thrown errors become exception
 * results.
 */

import type { Connection } from './connection';
import type { iterm2 } from './generated/api';
import {
  subscribeToServerOriginatedRpcNotification,
  unsubscribe,
  RpcRole,
  type SubscriptionToken,
} from './notifications';
import { sendRpcResult } from './rpc';
import {
  StatusBarComponent,
} from './statusbar';
import { checkSupportsContextMenuProvider } from './capabilities';

/**
 * A reference to a variable in the invocation context. Pass these as
 * `defaults` when registering an RPC handler; at invocation time iTerm2
 * will substitute the current value of the referenced variable for the
 * argument with the given name.
 */
export class Reference {
  constructor(public readonly name: string) {}
  toString(): string {
    return this.name;
  }
}

/** A user RPC callback: takes JSON-decoded args, returns a JSON-encodable value. */
export type RpcHandler = (
  args: Record<string, unknown>
) => unknown | Promise<unknown>;

/**
 * A status-bar callback: same shape as `RpcHandler` but receives a
 * pre-parsed `knobs` object (the wire form is a JSON-encoded string).
 */
export type StatusBarRpcHandler = (
  args: Record<string, unknown>
) => string | string[] | Promise<string | string[]>;

/** A context-menu / on-click handler — only the session id is meaningful. */
export type ContextMenuRpcHandler = RpcHandler;

/**
 * The subset of options shared by `register*` methods. `defaults` maps
 * argument-name → variable path (e.g. `id` for the current session id);
 * use `Reference` to construct these in a more readable form.
 */
export interface BaseRegisterOptions {
  /** Argument names — order doesn't matter; only the names form the signature. */
  arguments: string[];
  /**
   * Variable references for arguments that should be filled in by iTerm2.
   * Either pass a plain map (`{ id: 'id' }`) or use `Reference` instances
   * (`{ id: new Reference('id') }`).
   */
  defaults?: Record<string, string | Reference>;
  /** Timeout in seconds (`null` / undefined uses iTerm2's default). */
  timeoutSeconds?: number;
}

/** Opaque handle returned from registration; pass to `Registration.unregister`. */
export interface RegistrationToken {
  readonly token: SubscriptionToken<iterm2.ServerOriginatedRPCNotification.$Properties>;
  readonly cleanup?: () => Promise<void> | void;
}

function normalizeDefaults(
  defaults: Record<string, string | Reference> | undefined
): Record<string, string> {
  if (!defaults) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(defaults)) {
    out[k] = v instanceof Reference ? v.name : v;
  }
  return out;
}

async function dispatchRpc(
  conn: Connection,
  notif: iterm2.ServerOriginatedRPCNotification.$Properties,
  handler: RpcHandler
): Promise<void> {
  const requestId = notif.requestId ?? '';
  const args: Record<string, unknown> = {};
  for (const arg of notif.rpc?.arguments ?? []) {
    const name = arg.name ?? '';
    if (arg.jsonValue != null && arg.jsonValue !== '') {
      try {
        args[name] = JSON.parse(arg.jsonValue);
      } catch (e) {
        // Match Python — bail with an exception result.
        await sendRpcResult(conn, requestId, true, {
          reason: `Argument ${name}: ${(e as Error).message}`,
          traceback: '',
        });
        return;
      }
    } else {
      args[name] = null;
    }
  }

  try {
    const result = await handler(args);
    await sendRpcResult(conn, requestId, false, result);
  } catch (e) {
    const err = e as Error;
    await sendRpcResult(conn, requestId, true, {
      reason: String(err && err.message ? err.message : err),
      traceback: err && err.stack ? err.stack : '',
    });
  }
}

/**
 * Factory of registration helpers, scoped to a single `Connection`.
 *
 * Each `register*` method returns a `RegistrationToken` you can pass to
 * `unregister()` to tear it down.
 */
export class Registration {
  constructor(public readonly conn: Connection) {}

  /**
   * Register a generic RPC handler. iTerm2 calls this whenever it invokes
   * the named function (e.g. from a keybinding or a trigger).
   *
   * `name` plus the (sorted) argument names form the RPC signature; it must
   * be unique within the connection.
   */
  async registerRpcHandler(
    name: string,
    opts: BaseRegisterOptions,
    handler: RpcHandler
  ): Promise<RegistrationToken> {
    const token = await subscribeToServerOriginatedRpcNotification(
      this.conn,
      (conn, notif) => dispatchRpc(conn, notif, handler),
      {
        name,
        arguments: opts.arguments,
        timeoutSeconds: opts.timeoutSeconds,
        defaults: normalizeDefaults(opts.defaults),
        role: RpcRole.GENERIC,
      }
    );
    return { token };
  }

  /**
   * Register a session title provider. iTerm2 calls the handler whenever
   * any referenced variable changes; the return value becomes the session
   * title. `uniqueIdentifier` should be a reverse-DNS string.
   */
  async registerSessionTitleProvider(
    displayName: string,
    uniqueIdentifier: string,
    name: string,
    opts: BaseRegisterOptions,
    handler: RpcHandler
  ): Promise<RegistrationToken> {
    if (!uniqueIdentifier) {
      throw new Error('uniqueIdentifier is required');
    }
    const token = await subscribeToServerOriginatedRpcNotification(
      this.conn,
      (conn, notif) => dispatchRpc(conn, notif, handler),
      {
        name,
        arguments: opts.arguments,
        timeoutSeconds: opts.timeoutSeconds,
        defaults: normalizeDefaults(opts.defaults),
        role: RpcRole.SESSION_TITLE,
        sessionTitleDisplayName: displayName,
        sessionTitleUniqueId: uniqueIdentifier,
      }
    );
    return { token };
  }

  /**
   * Register a context menu provider — the handler is called when the user
   * selects this entry from a right-click menu. Return value is ignored.
   */
  async registerContextMenuProvider(
    displayName: string,
    uniqueIdentifier: string,
    name: string,
    opts: BaseRegisterOptions,
    handler: ContextMenuRpcHandler
  ): Promise<RegistrationToken> {
    if (!uniqueIdentifier) {
      throw new Error('uniqueIdentifier is required');
    }
    checkSupportsContextMenuProvider(this.conn);
    const token = await subscribeToServerOriginatedRpcNotification(
      this.conn,
      (conn, notif) => dispatchRpc(conn, notif, handler),
      {
        name,
        arguments: opts.arguments,
        timeoutSeconds: opts.timeoutSeconds,
        defaults: normalizeDefaults(opts.defaults),
        role: RpcRole.CONTEXT_MENU,
        contextMenuDisplayName: displayName,
        contextMenuUniqueId: uniqueIdentifier,
      }
    );
    return { token };
  }

  /**
   * Register a status bar component. The handler must take a `knobs`
   * argument (a JSON-decoded object) along with any other arguments you've
   * declared. Return a string, or an array of strings (longest fitting
   * wins). Optionally provide an `onclick` handler invoked when the user
   * clicks the component; it receives the session id as a positional arg
   * named `session_id`.
   */
  async registerStatusBarComponent(
    component: StatusBarComponent,
    opts: BaseRegisterOptions & {
      /** The RPC name to register the status bar coro under. */
      name: string;
      /** Optional onclick handler taking a single `session_id` argument. */
      onclick?: (sessionId: string) => unknown | Promise<unknown>;
    },
    handler: StatusBarRpcHandler
  ): Promise<RegistrationToken> {
    component.connection = this.conn;

    // Wrap the user's handler so that `knobs` is parsed from JSON to an object
    // before being passed through.
    const wrapped: RpcHandler = async (args) => {
      if ('knobs' in args && typeof args['knobs'] === 'string') {
        try {
          args['knobs'] = JSON.parse(args['knobs'] as string);
        } catch {
          // leave as-is on parse error
        }
      }
      return handler(args);
    };

    const token = await subscribeStatusBarRpc(
      this.conn,
      {
        name: opts.name,
        arguments: opts.arguments,
        timeoutSeconds: opts.timeoutSeconds,
        defaults: normalizeDefaults(opts.defaults),
        component,
      },
      wrapped
    );

    // If the caller supplied an onclick handler, register a partner RPC
    // whose name is derived from the component identifier.
    let onclickToken: RegistrationToken | null = null;
    if (opts.onclick) {
      const magicName =
        '__' +
        component.identifier.replace(/\./g, '_').replace(/-/g, '_') +
        '__on_click';
      const onclick = opts.onclick;
      onclickToken = await this.registerRpcHandler(
        magicName,
        { arguments: ['session_id'], timeoutSeconds: opts.timeoutSeconds },
        async (a) => onclick(String(a['session_id'] ?? ''))
      );
    }

    return {
      token,
      cleanup: onclickToken
        ? () => this.unregister(onclickToken!)
        : undefined,
    };
  }

  /** Unregister a previously-registered handler. */
  async unregister(reg: RegistrationToken): Promise<void> {
    if (reg.cleanup) {
      await reg.cleanup();
    }
    await unsubscribe(this.conn, reg.token);
  }
}

// ---------------------------------------------------------------------------
// Status-bar subscription (bespoke because notifications.ts doesn't expose
// the `statusBarComponentAttributes` slot of `RPCRegistrationRequest`).
// ---------------------------------------------------------------------------

const STATUS_OK = 0;
const STATUS_ALREADY_SUBSCRIBED = 2;
const NOTIF_TYPE_SERVER_ORIGINATED_RPC =
  10 as iterm2.NotificationType;

interface StatusBarSubscribeOpts {
  name: string;
  arguments: string[];
  defaults: Record<string, string>;
  timeoutSeconds?: number;
  component: StatusBarComponent;
}

async function subscribeStatusBarRpc(
  conn: Connection,
  opts: StatusBarSubscribeOpts,
  handler: RpcHandler
): Promise<
  SubscriptionToken<iterm2.ServerOriginatedRPCNotification.$Properties>
> {
  const wantedName = opts.name;
  const wantedArgs = [...opts.arguments].sort();
  const wantedSig = `${wantedName}(${wantedArgs.join(',')})`;

  // Install a connection helper that picks off matching RPC notifications
  // and dispatches to our handler. Returns true if it consumed the message
  // so that the rest of the helper chain knows to stop.
  let removed = false;
  const helper = async (
    c: Connection,
    msg: { notification?: iterm2.Notification.$Properties | null }
  ): Promise<boolean> => {
    if (removed) return false;
    const rpcNotif = msg.notification?.serverOriginatedRpcNotification;
    if (!rpcNotif?.rpc) return false;
    const name = rpcNotif.rpc.name ?? '';
    if (name !== wantedName) return false;
    const args = (rpcNotif.rpc.arguments ?? [])
      .map((a) => a.name ?? '')
      .sort();
    const sig = `${name}(${args.join(',')})`;
    if (sig !== wantedSig) return false;
    await dispatchRpc(c, rpcNotif, handler);
    return true;
  };
  conn.registerHelper(helper);

  // Build and send the registration request.
  const req: iterm2.RPCRegistrationRequest.$Properties = {
    name: wantedName,
    timeout: opts.timeoutSeconds ?? 5,
    arguments: opts.arguments.map((n) => ({ name: n })),
    role: RpcRole.STATUS_BAR_COMPONENT as unknown as iterm2.RPCRegistrationRequest.Role,
    statusBarComponentAttributes: opts.component.toAttributesProto(),
  };
  if (Object.keys(opts.defaults).length > 0) {
    req.defaults = Object.entries(opts.defaults).map(([name, path]) => ({
      name,
      path,
    }));
  }

  const response = (await conn.request({
    notificationRequest: {
      subscribe: true,
      notificationType: NOTIF_TYPE_SERVER_ORIGINATED_RPC,
      session: 'all',
      rpcRegistrationRequest: req,
    },
  })) as { notificationResponse?: iterm2.NotificationResponse.$Properties };
  const status = response.notificationResponse?.status ?? 0;
  if (status !== STATUS_OK && status !== STATUS_ALREADY_SUBSCRIBED) {
    removed = true;
    throw new Error(
      `Status bar component registration failed; status=${status}`
    );
  }

  // Fabricate a SubscriptionToken so the caller can hand it back to the
  // generic `unsubscribe` helper. We embed a closure on the helper for
  // teardown via the cleanup hook returned alongside.
  const key = JSON.stringify([null, NOTIF_TYPE_SERVER_ORIGINATED_RPC, wantedSig]);
  const callback = async (
    _c: Connection,
    _n: iterm2.ServerOriginatedRPCNotification.$Properties
  ) => {
    // The real dispatch happens via our helper above; the registry's
    // dispatcher would only ever see this if someone routed through it.
    removed = true;
  };
  return { key, callback };
}
