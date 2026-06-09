/**
 * Tool — port of `iterm2/tool.py`. Register toolbelt webview tools.
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import { RPCException } from './session';

// RegisterToolResponse.Status.OK
const STATUS_OK = 0;
// RegisterToolRequest.ToolType.WEB_VIEW_TOOL
const TOOL_TYPE_WEB_VIEW = 1 as iterm2.RegisterToolRequest.ToolType;

/**
 * Register a toolbelt tool that shows a webview.
 *
 * Throws RPCException on failure.
 */
export async function registerWebViewTool(
  connection: Connection,
  displayName: string,
  identifier: string,
  revealIfAlreadyRegistered: boolean,
  url: string
): Promise<void> {
  const api = new Api(connection);
  const res = await api.registerTool({
    name: displayName,
    identifier,
    revealIfAlreadyRegistered,
    toolType: TOOL_TYPE_WEB_VIEW,
    URL: url,
  });
  if ((res.status ?? 0) !== STATUS_OK) {
    throw new RPCException(`registerWebViewTool failed status=${res.status ?? 0}`);
  }
}
