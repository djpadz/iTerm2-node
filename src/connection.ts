import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import WebSocket, { type ClientOptions } from 'ws';

import { authenticate, getScriptName, removeAuth } from './auth';
import {
  ClientOriginatedMessage,
  ServerOriginatedMessage,
  type ServerOriginatedMessageProps,
} from './proto';

export const UDS_PATH = path.join(
  os.homedir(),
  'Library/Application Support/iTerm2/private/socket'
);
export const TCP_URL = 'ws://localhost:1912';
export const SUBPROTOCOL = 'api.iterm2.com';

const pkg = require('../package.json') as { version: string };

export class ConnectionRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionRefusedError';
  }
}

export class ProtocolVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolVersionError';
  }
}

export interface ConnectionOptions {
  /** Keep retrying on connection refused / 401. */
  retry?: boolean;
  /** Launch iTerm2 if it isn't running. */
  launchIfNeeded?: boolean;
}

/** A decoded ServerOriginatedMessage. */
export type ServerMessage = ServerOriginatedMessageProps;

/** Submessage payload for a request — e.g. `{ listSessionsRequest: {} }`. */
export type Submessage = Record<string, unknown>;

export type HelperFn = (
  conn: Connection,
  message: ServerMessage
) => boolean | Promise<boolean>;

interface Receiver {
  matchFn: (m: ServerMessage) => boolean;
  resolve: (m: ServerMessage) => void;
  reject: (e: Error) => void;
}

interface HandshakeError extends Error {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  code?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    origin: 'ws://localhost/',
    'x-iterm2-library-version': `node ${pkg.version}`,
    'x-iterm2-disable-auth-ui': 'true',
    'x-iterm2-advisory-name': String(getScriptName()),
  };
  if (process.env.ITERM2_COOKIE) {
    headers['x-iterm2-cookie'] = process.env.ITERM2_COOKIE;
  }
  if (process.env.ITERM2_KEY) {
    headers['x-iterm2-key'] = process.env.ITERM2_KEY;
  }
  return headers;
}

export interface Connection {
  on(event: 'message', listener: (msg: ServerMessage) => void): this;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;

  once(event: 'message', listener: (msg: ServerMessage) => void): this;
  once(event: 'close', listener: (code: number, reason: Buffer) => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  once(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

/**
 * Loopback WebSocket connection to iTerm2.
 *
 * Emits:
 *   - `message` for incoming messages not matched by a pending request
 *      (typically notifications).
 *   - `close` when the websocket closes.
 *   - `error` for transport / decode errors.
 */
export class Connection extends EventEmitter {
  ws: WebSocket | null = null;

  private _receivers: Receiver[] = [];
  private _helpers: HelperFn[] = [];
  private _nextId = 1;
  private _responseHeaders: Record<string, string | string[] | undefined> = {};
  private _closed = false;

  /** Open and return a ready-to-use Connection. */
  static async create(opts: ConnectionOptions = {}): Promise<Connection> {
    const conn = new Connection();
    await conn._connectWithRetry(opts);
    return conn;
  }

  private async _connectWithRetry({
    retry = false,
    launchIfNeeded = false,
  }: ConnectionOptions): Promise<void> {
    let haveFreshCookie = await authenticate({ launchIfNeeded }).catch(
      () => false
    );

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this._openWebSocket();
        this._attachReadLoop();
        return;
      } catch (raw) {
        const err = raw as HandshakeError;
        const status = err.statusCode;

        if (status === 401) {
          if (retry) {
            while (!haveFreshCookie) {
              await sleep(500);
              haveFreshCookie = await authenticate({
                launchIfNeeded: true,
              }).catch(() => false);
            }
            continue;
          }
          if (haveFreshCookie) throw err;
          removeAuth();
          haveFreshCookie = await authenticate({
            launchIfNeeded: true,
          }).catch(() => false);
          if (!haveFreshCookie) throw err;
          continue;
        }

        if (status === 406) {
          throw new ProtocolVersionError(
            'iterm2-node is too old for this version of iTerm2; please upgrade.'
          );
        }

        if (
          retry &&
          (err.code === 'ECONNREFUSED' ||
            err.code === 'ENOENT' ||
            err.code === 'EAGAIN' ||
            err.code === 'ETIMEDOUT')
        ) {
          await sleep(500);
          continue;
        }

        if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT') {
          const hint = fs.existsSync(UDS_PATH)
            ? `\nA stale iTerm2 socket exists at ${UDS_PATH}. If you have ` +
              'downgraded from iTerm2 3.3.12+ to an older version, you must ' +
              'manually delete that file.\n'
            : '';
          throw new ConnectionRefusedError(
            'Problem connecting to iTerm2. Ensure the Python API is enabled ' +
              'in iTerm2 preferences and that iTerm2 is running.' +
              hint
          );
        }

        throw err;
      } finally {
        // Cookies/keys are single-use; clear after a connect attempt.
        removeAuth();
      }
    }
  }

  private _openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsOpts: ClientOptions = {
        headers: buildHeaders(),
        perMessageDeflate: false,
        maxPayload: 0,
        followRedirects: false,
      };

      let ws: WebSocket;
      if (fs.existsSync(UDS_PATH)) {
        // ws@8 strips a user-provided `socketPath` from its options object
        // (see `initAsClient` defaults in node_modules/ws/lib/websocket.js).
        // The supported escape hatch is a custom `createConnection`. We can't
        // use `ws+unix://path:/` because URL parsing percent-encodes spaces
        // in the socket path.
        ws = new WebSocket('ws://localhost/', [SUBPROTOCOL], {
          ...wsOpts,
          createConnection: ((opts: net.NetConnectOpts) =>
            net.connect({ ...opts, path: UDS_PATH })) as ClientOptions['createConnection'],
        });
      } else {
        ws = new WebSocket(TCP_URL, [SUBPROTOCOL], wsOpts);
      }

      const onError = (err: Error & { code?: string }) => {
        teardown();
        reject(err);
      };
      const onUnexpected = (
        _req: unknown,
        res: {
          statusCode?: number;
          headers: Record<string, string | string[] | undefined>;
          resume: () => void;
        }
      ) => {
        teardown();
        const e: HandshakeError = new Error(
          `iTerm2 handshake returned HTTP ${res.statusCode}`
        );
        e.statusCode = res.statusCode;
        e.headers = res.headers;
        res.resume();
        reject(e);
      };
      const onUpgrade = (res: {
        headers: Record<string, string | string[] | undefined>;
      }) => {
        this._responseHeaders = res.headers || {};
      };
      const onOpen = () => {
        teardown();
        this.ws = ws;
        ws.on('close', (code: number, reason: Buffer) => {
          this._closed = true;
          const reasonStr = reason && reason.length ? ': ' + reason.toString('utf8') : '';
          const err = new Error(
            `iTerm2 connection closed (code ${code}${reasonStr})`
          );
          for (const r of this._receivers.splice(0)) {
            r.reject(err);
          }
          this.emit('close', code, reason);
        });
        ws.on('error', (e: Error) => this.emit('error', e));
        resolve();
      };

      function teardown() {
        ws.off('error', onError);
        ws.off('open', onOpen);
        ws.off('unexpected-response', onUnexpected);
        ws.off('upgrade', onUpgrade);
      }

      ws.on('error', onError);
      ws.on('open', onOpen);
      ws.on('unexpected-response', onUnexpected);
      ws.on('upgrade', onUpgrade);
    });
  }

  private _attachReadLoop(): void {
    const ws = this.ws;
    if (!ws) throw new Error('not connected');

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      const bytes = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : isBinary
            ? Buffer.from(data as ArrayBuffer)
            : Buffer.from(String(data), 'utf8');

      let message: ServerMessage;
      try {
        message = ServerOriginatedMessage.decode(bytes) as ServerMessage;
      } catch (err) {
        this.emit('error', err as Error);
        return;
      }
      const idx = this._findReceiver(message);
      if (idx !== -1) {
        const receiver = this._receivers[idx]!;
        this._receivers.splice(idx, 1);
        receiver.resolve(message);
      } else {
        this._dispatchToHelpers(message).catch((e: Error) =>
          this.emit('error', e)
        );
      }
    });
  }

  private _findReceiver(message: ServerMessage): number {
    for (let i = 0; i < this._receivers.length; i++) {
      if (this._receivers[i]!.matchFn(message)) return i;
    }
    return -1;
  }

  private async _dispatchToHelpers(message: ServerMessage): Promise<void> {
    this.emit('message', message);
    for (const helper of this._helpers) {
      if (await helper(this, message)) return;
    }
  }

  /**
   * Register a callback to receive messages not matched by a pending
   * request (typically notifications). Returning truthy stops the chain.
   */
  registerHelper(fn: HelperFn): void {
    if (typeof fn !== 'function') {
      throw new TypeError('helper must be a function');
    }
    this._helpers.push(fn);
  }

  /**
   * Send a fully-formed ClientOriginatedMessage. Caller is responsible for
   * assigning `id`.
   */
  sendMessage(message: Record<string, unknown>): Promise<void> {
    if (!this.ws) return Promise.reject(new Error('not connected'));
    const verifyErr = ClientOriginatedMessage.verify(message);
    if (verifyErr) return Promise.reject(new TypeError(verifyErr));
    const payload = ClientOriginatedMessage.encode(
      ClientOriginatedMessage.create(message)
    ).finish();
    const ws = this.ws;
    return new Promise((resolve, reject) => {
      ws.send(payload, { binary: true }, (sendErr) => {
        if (sendErr) reject(sendErr); else resolve();
      });
    });
  }

  /** Resolves with the next incoming message whose `id` matches. */
  dispatchUntilId(id: number | string | bigint): Promise<ServerMessage> {
    const want = String(id);
    return new Promise((resolve, reject) => {
      this._receivers.push({
        matchFn: (m) => m.id != null && String(m.id) === want,
        resolve,
        reject,
      });
    });
  }

  /**
   * Assigns the next request id, sends a `ClientOriginatedMessage` carrying
   * `submessage`, and resolves with the matching response. Example:
   *
   * ```ts
   * const res = await conn.request({ listSessionsRequest: {} });
   * ```
   */
  async request(submessage: Submessage): Promise<ServerMessage> {
    const id = this._nextId++;
    const waiter = this.dispatchUntilId(id);
    await this.sendMessage({ id, ...submessage });
    return waiter;
  }

  /**
   * `[major, minor]` from the `X-iTerm2-Protocol-Version` response header,
   * or `[0, 0]` if absent / unparseable.
   */
  get protocolVersion(): [number, number] {
    const raw = this._responseHeaders['x-iterm2-protocol-version'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return [0, 0];
    const parts = String(value).split('.');
    if (parts.length !== 2) return [0, 0];
    const major = parseInt(parts[0]!, 10);
    const minor = parseInt(parts[1]!, 10);
    if (Number.isNaN(major) || Number.isNaN(minor)) return [0, 0];
    return [major, minor];
  }

  /** Close the websocket. Idempotent. */
  close(code = 1000, reason = ''): void {
    if (this.ws && !this._closed) {
      this.ws.close(code, reason);
    }
  }
}
