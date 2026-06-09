/**
 * Typed RPC layer: one method per ClientOriginatedMessage submessage.
 *
 * Each method builds a `ClientOriginatedMessage` with the given submessage,
 * sends it via `Connection.request`, and returns the typed response
 * submessage (throwing if iTerm2 returned no payload of the expected kind).
 */

import type { Connection } from './connection';
import type { iterm2 } from './generated/api';

type COMProps = iterm2.ClientOriginatedMessage.$Properties;
type SOMProps = iterm2.ServerOriginatedMessage.$Properties;

function getOrThrow<K extends keyof SOMProps>(
  res: SOMProps,
  key: K
): NonNullable<SOMProps[K]> {
  if (res.error) {
    throw new Error(`iTerm2 API error: ${res.error}`);
  }
  const value = res[key];
  if (value == null) {
    throw new Error(`iTerm2 returned no ${String(key)} in response`);
  }
  return value as NonNullable<SOMProps[K]>;
}

/**
 * Strongly-typed wrappers for every request submessage in `api.proto`.
 *
 * Construct via `new Api(conn)`; most users will reach for higher-level
 * classes (App, Session, …) that build on top of these.
 */
export class Api {
  constructor(public readonly conn: Connection) {}

  private async _send<K extends keyof SOMProps>(
    field: keyof COMProps,
    payload: object,
    responseField: K
  ): Promise<NonNullable<SOMProps[K]>> {
    const submessage = { [field]: payload } as Partial<COMProps>;
    const res = (await this.conn.request(submessage as Record<string, unknown>)) as SOMProps;
    return getOrThrow(res, responseField);
  }

  getBuffer(req: iterm2.GetBufferRequest.$Properties) {
    return this._send('getBufferRequest', req, 'getBufferResponse');
  }

  getPrompt(req: iterm2.GetPromptRequest.$Properties) {
    return this._send('getPromptRequest', req, 'getPromptResponse');
  }

  transaction(req: iterm2.TransactionRequest.$Properties) {
    return this._send('transactionRequest', req, 'transactionResponse');
  }

  notification(req: iterm2.NotificationRequest.$Properties) {
    return this._send('notificationRequest', req, 'notificationResponse');
  }

  registerTool(req: iterm2.RegisterToolRequest.$Properties) {
    return this._send('registerToolRequest', req, 'registerToolResponse');
  }

  setProfileProperty(req: iterm2.SetProfilePropertyRequest.$Properties) {
    return this._send('setProfilePropertyRequest', req, 'setProfilePropertyResponse');
  }

  listSessions(req: iterm2.ListSessionsRequest.$Properties = {}) {
    return this._send('listSessionsRequest', req, 'listSessionsResponse');
  }

  sendText(req: iterm2.SendTextRequest.$Properties) {
    return this._send('sendTextRequest', req, 'sendTextResponse');
  }

  createTab(req: iterm2.CreateTabRequest.$Properties) {
    return this._send('createTabRequest', req, 'createTabResponse');
  }

  splitPane(req: iterm2.SplitPaneRequest.$Properties) {
    return this._send('splitPaneRequest', req, 'splitPaneResponse');
  }

  getProfileProperty(req: iterm2.GetProfilePropertyRequest.$Properties) {
    return this._send('getProfilePropertyRequest', req, 'getProfilePropertyResponse');
  }

  setProperty(req: iterm2.SetPropertyRequest.$Properties) {
    return this._send('setPropertyRequest', req, 'setPropertyResponse');
  }

  getProperty(req: iterm2.GetPropertyRequest.$Properties) {
    return this._send('getPropertyRequest', req, 'getPropertyResponse');
  }

  inject(req: iterm2.InjectRequest.$Properties) {
    return this._send('injectRequest', req, 'injectResponse');
  }

  activate(req: iterm2.ActivateRequest.$Properties) {
    return this._send('activateRequest', req, 'activateResponse');
  }

  variable(req: iterm2.VariableRequest.$Properties) {
    return this._send('variableRequest', req, 'variableResponse');
  }

  savedArrangement(req: iterm2.SavedArrangementRequest.$Properties) {
    return this._send('savedArrangementRequest', req, 'savedArrangementResponse');
  }

  focus(req: iterm2.FocusRequest.$Properties = {}) {
    return this._send('focusRequest', req, 'focusResponse');
  }

  listProfiles(req: iterm2.ListProfilesRequest.$Properties = {}) {
    return this._send('listProfilesRequest', req, 'listProfilesResponse');
  }

  serverOriginatedRpcResult(req: iterm2.ServerOriginatedRPCResultRequest.$Properties) {
    return this._send(
      'serverOriginatedRpcResultRequest',
      req,
      'serverOriginatedRpcResultResponse'
    );
  }

  restartSession(req: iterm2.RestartSessionRequest.$Properties) {
    return this._send('restartSessionRequest', req, 'restartSessionResponse');
  }

  menuItem(req: iterm2.MenuItemRequest.$Properties) {
    return this._send('menuItemRequest', req, 'menuItemResponse');
  }

  setTabLayout(req: iterm2.SetTabLayoutRequest.$Properties) {
    return this._send('setTabLayoutRequest', req, 'setTabLayoutResponse');
  }

  getBroadcastDomains(req: iterm2.GetBroadcastDomainsRequest.$Properties = {}) {
    return this._send('getBroadcastDomainsRequest', req, 'getBroadcastDomainsResponse');
  }

  tmux(req: iterm2.TmuxRequest.$Properties) {
    return this._send('tmuxRequest', req, 'tmuxResponse');
  }

  reorderTabs(req: iterm2.ReorderTabsRequest.$Properties) {
    return this._send('reorderTabsRequest', req, 'reorderTabsResponse');
  }

  preferences(req: iterm2.PreferencesRequest.$Properties) {
    return this._send('preferencesRequest', req, 'preferencesResponse');
  }

  colorPreset(req: iterm2.ColorPresetRequest.$Properties) {
    return this._send('colorPresetRequest', req, 'colorPresetResponse');
  }

  selection(req: iterm2.SelectionRequest.$Properties) {
    return this._send('selectionRequest', req, 'selectionResponse');
  }

  statusBarComponent(req: iterm2.StatusBarComponentRequest.$Properties) {
    return this._send('statusBarComponentRequest', req, 'statusBarComponentResponse');
  }

  setBroadcastDomains(req: iterm2.SetBroadcastDomainsRequest.$Properties) {
    return this._send('setBroadcastDomainsRequest', req, 'setBroadcastDomainsResponse');
  }

  closeRequest(req: iterm2.CloseRequest.$Properties) {
    return this._send('closeRequest', req, 'closeResponse');
  }

  invokeFunction(req: iterm2.InvokeFunctionRequest.$Properties) {
    return this._send('invokeFunctionRequest', req, 'invokeFunctionResponse');
  }

  listPrompts(req: iterm2.ListPromptsRequest.$Properties) {
    return this._send('listPromptsRequest', req, 'listPromptsResponse');
  }
}
