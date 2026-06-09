import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';

import {
  ClientOriginatedMessage,
  ServerOriginatedMessage,
  type ClientOriginatedMessageProps,
  type ServerOriginatedMessageProps,
} from '../../src/proto';

export type RequestHandler = (
  req: ClientOriginatedMessageProps
) => ServerOriginatedMessageProps | Promise<ServerOriginatedMessageProps>;

export interface MockServer {
  url: string;
  /** Send a server-originated message (e.g. a notification) to all clients. */
  broadcast(msg: ServerOriginatedMessageProps): void;
  /** Override the per-request handler (defaults to {} echoes). */
  setHandler(h: RequestHandler): void;
  close(): Promise<void>;
  /** Currently-connected client sockets — useful for assertions. */
  readonly sockets: Set<WebSocket>;
}

/**
 * Start a small WebSocket server that speaks iTerm2's protobuf wire format.
 *
 * Each incoming `ClientOriginatedMessage` is decoded; the handler maps it to
 * a `ServerOriginatedMessage` (with the same `id` by default). Use
 * `broadcast()` to push notifications.
 */
export async function startMockServer(
  initialHandler?: RequestHandler
): Promise<MockServer> {
  let handler: RequestHandler =
    initialHandler ?? (() => ({ /* empty echo */ }));

  const httpServer: Server = createServer();
  const wss = new WebSocketServer({ server: httpServer });
  const sockets = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));

    ws.on('message', async (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const req = ClientOriginatedMessage.decode(bytes) as ClientOriginatedMessageProps;
      const respBody = await handler(req);
      const resp: ServerOriginatedMessageProps = {
        id: req.id ?? 0,
        ...respBody,
      };
      const payload = ServerOriginatedMessage.encode(
        ServerOriginatedMessage.create(resp)
      ).finish();
      ws.send(payload, { binary: true });
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  const url = `ws://127.0.0.1:${port}/`;

  return {
    url,
    sockets,
    setHandler(h) {
      handler = h;
    },
    broadcast(msg) {
      const payload = ServerOriginatedMessage.encode(
        ServerOriginatedMessage.create(msg)
      ).finish();
      for (const s of sockets) s.send(payload, { binary: true });
    },
    async close() {
      for (const s of sockets) s.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
