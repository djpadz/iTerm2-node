// ----- Connection / transport ------------------------------------------

export {
  Connection,
  ConnectionRefusedError,
  ProtocolVersionError,
  UDS_PATH,
  TCP_URL,
  SUBPROTOCOL,
} from './connection';
export type {
  ConnectionOptions,
  HelperFn,
  ServerMessage,
  Submessage,
} from './connection';

export {
  AuthenticationError,
  authenticate,
  authDisabled,
  getScriptName,
  removeAuth,
  requestCookieAndKey,
} from './auth';
export type { AuthOptions } from './auth';

// ----- Proto / typed RPC -----------------------------------------------

export {
  loadProto,
  ClientOriginatedMessage,
  ServerOriginatedMessage,
  Notification,
} from './proto';
export type {
  ProtoBundle,
  ClientOriginatedMessageProps,
  ServerOriginatedMessageProps,
  NotificationProps,
  iterm2,
} from './proto';

export { Api } from './api';

// ----- Value types -----------------------------------------------------

export {
  Size,
  Point,
  Frame,
  Range,
  CoordRange,
  WindowedCoordRange,
  frameStr,
  sizeStr,
  pointStr,
  distance,
  waitForever,
  iterm2Encode,
  iterm2EncodeStr,
  iterm2EncodeList,
  invocationString,
} from './util';

export { Color, ColorSpace } from './color';
export type { ColorDict } from './color';

// ----- Notifications & subscriptions -----------------------------------

export {
  NotificationType,
  RpcRole,
  SubscriptionError,
  unsubscribe,
  subscribeToNewSessionNotification,
  subscribeToTerminateSessionNotification,
  subscribeToLayoutChangeNotification,
  subscribeToFocusChangeNotification,
  subscribeToBroadcastDomainsChangeNotification,
  subscribeToKeystrokeNotification,
  subscribeToScreenUpdateNotification,
  subscribeToCustomEscapeSequenceNotification,
  subscribeToPromptNotification,
  subscribeToVariableChangeNotification,
  subscribeToProfileChangeNotification,
  subscribeToServerOriginatedRpcNotification,
} from './notifications';
export type {
  SubscriptionToken,
  NotificationCallback,
  NewSessionCallback,
  TerminateSessionCallback,
  LayoutChangedCallback,
  FocusChangedCallback,
  BroadcastDomainsChangedCallback,
  KeystrokeCallback,
  ScreenUpdateCallback,
  CustomEscapeSequenceCallback,
  PromptCallback,
  VariableChangedCallback,
  ProfileChangedCallback,
  ServerOriginatedRpcCallback,
} from './notifications';

// ----- Monitor base class ----------------------------------------------

export { BaseMonitor, withMonitor } from './monitor';

// ----- Core hierarchy --------------------------------------------------

export { VariableScopes, VariableMonitor } from './variables';
export { Transaction } from './transaction';

export {
  Session,
  Splitter,
  SessionLineInfo,
  RPCException,
  SplitPaneException,
  InvalidSessionId,
} from './session';
export type { SessionDelegate } from './session';

export { Tab, NavigationDirection } from './tab';
export type { TabDelegate } from './tab';

export {
  Window,
  CreateTabException,
  CreateWindowException,
  SetPropertyException,
  GetPropertyException,
} from './window';
export type { WindowDelegate } from './window';

export { App, getApp } from './app';

// ----- Profile ---------------------------------------------------------

export {
  Profile,
  LocalWriteOnlyProfile,
  BackgroundImageMode,
  CursorType,
  ThinStrokes,
  UnicodeNormalization,
  CharacterEncoding,
  OptionKeySends,
  InitialWorkingDirectory,
  IconMode,
  TitleComponents,
  BadGUIDException,
} from './profile';

// ----- Leaf modules ----------------------------------------------------

export * as alert from './alert';
export * as arrangement from './arrangement';
export * as binding from './binding';
export * as broadcast from './broadcast';
export * as capabilities from './capabilities';
export * as colorpresets from './colorpresets';
export * as customcontrol from './customcontrol';
export * as filepanel from './filepanel';
export * as focus from './focus';
export * as keyboard from './keyboard';
export * as lifecycle from './lifecycle';
export * as mainmenu from './mainmenu';
export * as preferences from './preferences';
export * as prompt from './prompt';
export * as registration from './registration';
export * as rpc from './rpc';
export * as screen from './screen';
export * as selection from './selection';
export * as statusbar from './statusbar';
export * as tmux from './tmux';
export * as tool from './tool';
export * as triggers from './triggers';

// ----- Convenience runners ---------------------------------------------

import { Connection, type ConnectionOptions } from './connection';

/** Open a connection, run `fn(connection)`, close on completion. */
export async function runUntilComplete<T>(
  fn: (conn: Connection) => Promise<T>,
  opts: ConnectionOptions = {}
): Promise<T> {
  const connection = await Connection.create(opts);
  try {
    return await fn(connection);
  } finally {
    connection.close();
  }
}

/**
 * Open a connection, run `fn(connection)`, then keep the event loop alive
 * until the websocket closes. Useful for notification listeners.
 */
export async function runForever(
  fn: (conn: Connection) => Promise<void> | void,
  opts: ConnectionOptions = {}
): Promise<void> {
  const connection = await Connection.create(opts);
  const closed = new Promise<void>((resolve) =>
    connection.once('close', () => resolve())
  );
  await Promise.resolve(fn(connection));
  await closed;
}
