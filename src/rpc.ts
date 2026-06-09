/**
 * RPC helpers — port of the public surface of `iterm2/rpc.py`.
 *
 * Most per-RPC wrappers in the Python module are subsumed by the typed
 * `Api` class (see `./api`). This module re-exports `RPCException` and
 * defines the small helpers that don't fit neatly into `Api`:
 *
 *   - `ACTIVATE_RAISE_ALL_WINDOWS`, `ACTIVATE_IGNORING_OTHER_APPS` flags
 *   - `sendRpcResult` — replies to a server-originated RPC notification
 *   - `invokeMethod` — invokes a method on a receiver and unwraps the result
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import { RPCException } from './session';

export { RPCException } from './session';

/** Flag for `activate(..., activateAppOpts)` — bring every window forward. */
export const ACTIVATE_RAISE_ALL_WINDOWS = 1;
/** Flag for `activate(..., activateAppOpts)` — steal focus from other apps. */
export const ACTIVATE_IGNORING_OTHER_APPS = 2;

/**
 * Sends a response to a server-originated RPC. Mirrors Python
 * `async_send_rpc_result`.
 *
 * @param connection  An open iTerm2 connection.
 * @param requestId   The `requestId` from the inbound RPC notification.
 * @param isException If true, `value` is encoded as `jsonException`.
 * @param value       The result value (JSON-encodable) — or, for an
 *                    exception, an object describing it (e.g.
 *                    `{ reason, traceback }`).
 */
export async function sendRpcResult(
  connection: Connection,
  requestId: string,
  isException: boolean,
  value: unknown
): Promise<void> {
  const api = new Api(connection);
  const req: iterm2.ServerOriginatedRPCResultRequest.$Properties = {
    requestId,
  };
  if (isException) {
    req.jsonException = JSON.stringify(value);
  } else {
    req.jsonValue = JSON.stringify(value);
  }
  await api.serverOriginatedRpcResult(req);
}

/**
 * Convenience wrapper around `Api.invokeFunction` for methods. Mirrors
 * Python `async_invoke_method` — invokes `invocation` on `receiver` and
 * returns the parsed JSON result, throwing `RPCException` on error.
 */
export async function invokeMethod(
  connection: Connection,
  receiver: string,
  invocation: string,
  timeoutSeconds = -1
): Promise<unknown> {
  const api = new Api(connection);
  const res = await api.invokeFunction({
    invocation,
    method: { receiver },
    timeout: timeoutSeconds,
  });
  if (res.error) {
    // Status 4 = TIMEOUT in the InvokeFunctionResponse.Status enum.
    if (res.error.status === 4) {
      throw new RPCException('Timeout');
    }
    throw new RPCException(
      `status=${res.error.status ?? 0}: ${res.error.errorReason ?? ''}`
    );
  }
  if (res.success && res.success.jsonResult) {
    return JSON.parse(res.success.jsonResult);
  }
  return null;
}
