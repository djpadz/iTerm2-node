/**
 * Shared internals used by Session/Tab/Window/App and the monitor classes.
 *
 * The underscore-prefixed filename keeps these out of the public surface
 * (they're re-exported sparingly from index.ts when needed).
 */

import type { Api } from './api';
import { RPCException } from './session';
import type { iterm2 } from './generated/api';

export const STATUS_OK = 0;

/**
 * Throws an RPCException if `status` is anything but OK (treated as 0).
 * Use the standard "<label> failed (status=N)" format so error messages
 * are consistent across modules.
 */
export function checkStatus(
  status: number | null | undefined,
  label: string
): void {
  if ((status ?? STATUS_OK) !== STATUS_OK) {
    throw new RPCException(`${label} failed (status=${status})`);
  }
}

/**
 * Parse a JSON-encoded variable value the same way every consumer does.
 * iTerm2 returns "" for unset variables; we surface that as `null`.
 */
export function decodeVariableValue(raw: string | undefined | null): unknown {
  return raw == null || raw === '' ? null : JSON.parse(raw);
}

/** Discriminator selecting which oneof field on VariableRequest to set. */
export type VariableScope =
  | { sessionId: string }
  | { tabId: string }
  | { windowId: string }
  | { app: true };

/**
 * Write a single scoped user variable. Names destined for read-back must
 * begin with `user.`.
 */
export async function setScopedVariable(
  api: Api,
  scope: VariableScope,
  name: string,
  value: unknown,
  label = 'setVariable'
): Promise<void> {
  const res = await api.variable({
    ...scope,
    set: [{ name, value: JSON.stringify(value) }],
  });
  checkStatus(res.status, label);
}

/** Read a single scoped variable, JSON-decoded. */
export async function getScopedVariable(
  api: Api,
  scope: VariableScope,
  name: string,
  label = 'getVariable'
): Promise<unknown> {
  const res = await api.variable({ ...scope, get: [name] });
  checkStatus(res.status, label);
  return decodeVariableValue(res.values?.[0]);
}

/** Discriminator selecting which CloseRequest oneof field to set. */
export type CloseTarget =
  | { sessions: iterm2.CloseRequest.CloseSessions.$Properties }
  | { tabs: iterm2.CloseRequest.CloseTabs.$Properties }
  | { windows: iterm2.CloseRequest.CloseWindows.$Properties };

/** Close a session/tab/window; throws on first non-OK status. */
export async function closeTarget(
  api: Api,
  target: CloseTarget,
  force: boolean,
  label = 'close'
): Promise<void> {
  const res = await api.closeRequest({ ...target, force });
  const status = res.statuses?.[0] ?? STATUS_OK;
  checkStatus(status, label);
}

/** Discriminator selecting which InvokeFunction oneof field to set. */
export type InvokeContext =
  | { session: iterm2.InvokeFunctionRequest.Session.$Properties }
  | { tab: iterm2.InvokeFunctionRequest.Tab.$Properties }
  | { window: iterm2.InvokeFunctionRequest.Window.$Properties }
  | { app: iterm2.InvokeFunctionRequest.App.$Properties };

/**
 * Run an iTerm2 expression-language invocation in the given context. The
 * JSON result (if any) is parsed and returned; an error response surfaces
 * as an RPCException.
 */
export async function invokeFunctionFor(
  api: Api,
  ctx: InvokeContext,
  invocation: string,
  timeoutSeconds = -1
): Promise<unknown> {
  const res = await api.invokeFunction({
    invocation,
    ...ctx,
    timeout: timeoutSeconds,
  });
  if (res.error) {
    throw new RPCException(
      `invokeFunction: status=${res.error.status} ${res.error.errorReason ?? ''}`
    );
  }
  return res.success?.jsonResult ? JSON.parse(res.success.jsonResult) : null;
}
