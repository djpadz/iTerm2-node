/**
 * Static proto bundle — values come from the pbjs codegen, types come from
 * the matching pbts `.d.ts`. Regenerate both via `npm run codegen`.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const generated = require('./generated/api.js') as typeof import('./generated/api');

export type { iterm2 } from './generated/api';

export const ClientOriginatedMessage = generated.iterm2.ClientOriginatedMessage;
export const ServerOriginatedMessage = generated.iterm2.ServerOriginatedMessage;
export const Notification = generated.iterm2.Notification;

import type { iterm2 } from './generated/api';

export type ClientOriginatedMessageProps =
  iterm2.ClientOriginatedMessage.$Properties;
export type ServerOriginatedMessageProps =
  iterm2.ServerOriginatedMessage.$Properties;
export type NotificationProps = iterm2.Notification.$Properties;

/** Async shim retained for backward compatibility with v0.1. */
export async function loadProto(): Promise<{
  ClientOriginatedMessage: typeof ClientOriginatedMessage;
  ServerOriginatedMessage: typeof ServerOriginatedMessage;
  Notification: typeof Notification;
}> {
  return { ClientOriginatedMessage, ServerOriginatedMessage, Notification };
}

export type ProtoBundle = Awaited<ReturnType<typeof loadProto>>;
