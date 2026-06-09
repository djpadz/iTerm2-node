/**
 * Static proto bundle — values come from the pbjs codegen, types come from
 * the matching pbts `.d.ts`. Regenerate both via `npm run codegen`.
 */

// Decode int64 fields (notably `id`) as plain numbers. iTerm2's request ids
// are small integers; we don't want JS callers to deal with `Long` objects.
// Must run BEFORE the static module is required.
//
// Setting `util.Long = null` alone is insufficient: the generated reader
// calls `reader.int64()` which returns the underlying LongBits triple
// (`{ low, high, unsigned }`) when Long is unset. We additionally wrap the
// reader's 64-bit varint methods so they collapse to a JS number.
{
  type LongLike = { low: number; high: number; unsigned?: boolean };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const $protobuf = require('protobufjs/minimal') as {
    util: { Long: unknown };
    Reader: { prototype: Record<string, () => unknown> };
  };
  $protobuf.util.Long = null;
  const proto = $protobuf.Reader.prototype;
  const wrap = (name: string, signed: boolean) => {
    const original = proto[name]!;
    proto[name] = function wrapped(this: unknown): number {
      const raw = original.call(this) as LongLike | number;
      if (typeof raw === 'number') return raw;
      const hi = raw.high | 0;
      const lo = raw.low | 0;
      if (signed && hi >>> 31) {
        const nlo = (~lo + 1) >>> 0;
        const nhi = (~hi + (nlo === 0 ? 1 : 0)) >>> 0;
        return -(nlo + nhi * 4294967296);
      }
      return (lo >>> 0) + hi * 4294967296;
    };
  };
  wrap('int64', true);
  wrap('uint64', false);
  wrap('sint64', true);
  wrap('fixed64', false);
  wrap('sfixed64', true);
}

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
