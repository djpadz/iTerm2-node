import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { Connection } from '../src/connection';
import { startMockServer, type MockServer } from './helpers/mock-server';

let server: MockServer;

before(async () => {
  server = await startMockServer();
});

after(async () => {
  await server.close();
});

test('Connection.create opens a WebSocket to the given endpoint', async () => {
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });
  assert.ok(conn.ws);
  conn.close();
});

test('request() round-trips a ListSessions response by id', async () => {
  server.setHandler((req) => {
    if (req.listSessionsRequest) {
      return {
        listSessionsResponse: {
          windows: [
            {
              windowId: 'W1',
              number: 1,
              tabs: [{ tabId: 'T1', root: { vertical: false, links: [] } }],
            },
          ],
          buriedSessions: [],
        },
      };
    }
    return {};
  });

  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });
  const res = (await conn.request({ listSessionsRequest: {} })) as {
    listSessionsResponse?: { windows?: Array<{ windowId?: string }> };
  };
  assert.equal(res.listSessionsResponse?.windows?.[0]?.windowId, 'W1');
  conn.close();
});

test('concurrent requests resolve to the matching ids', async () => {
  // Echo the request count back via SendTextResponse.status (re-using a field).
  server.setHandler((req) => {
    // We'll encode the request id into the response so the test verifies
    // that the connection routes responses to the right awaiter.
    return req.listSessionsRequest
      ? { listSessionsResponse: { windows: [{ windowId: `id-${req.id}` }] } }
      : {};
  });

  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });
  const a = conn.request({ listSessionsRequest: {} });
  const b = conn.request({ listSessionsRequest: {} });
  const c = conn.request({ listSessionsRequest: {} });
  const results = (await Promise.all([a, b, c])) as Array<{
    listSessionsResponse: { windows: Array<{ windowId: string }> };
  }>;
  // Each response's payload encodes the id of the originating request.
  assert.equal(results[0]!.listSessionsResponse.windows[0]!.windowId, 'id-1');
  assert.equal(results[1]!.listSessionsResponse.windows[0]!.windowId, 'id-2');
  assert.equal(results[2]!.listSessionsResponse.windows[0]!.windowId, 'id-3');
  conn.close();
});

test("notifications without an id are emitted as 'message' events", async () => {
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });

  const received: unknown[] = [];
  conn.on('message', (m) => received.push(m));

  // Push a focus-changed notification (no matching request id).
  server.broadcast({
    notification: {
      focusChangedNotification: { session: 'sess-X' },
    },
  });

  // Allow one event-loop tick for the read pump.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(received.length, 1);
  const msg = received[0] as {
    notification?: { focusChangedNotification?: { session?: string } };
  };
  assert.equal(msg.notification?.focusChangedNotification?.session, 'sess-X');
  conn.close();
});

test("close() resolves the 'close' event and rejects pending receivers", async () => {
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });

  // Issue a request the server will never answer.
  server.setHandler(() => new Promise(() => { /* never */ }));
  const pending = conn.request({ listSessionsRequest: {} });

  const closed = new Promise<void>((resolve) => conn.once('close', () => resolve()));
  // Give the request a tick to be sent.
  await new Promise((r) => setTimeout(r, 20));
  conn.close();

  await closed;
  await assert.rejects(pending, /closed/);
});

test('protocolVersion is [0,0] when the server omits the header', async () => {
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });
  assert.deepEqual(conn.protocolVersion, [0, 0]);
  conn.close();
});

test('Connection.create throws ProtocolVersionError on HTTP 406', async () => {
  // Spin up a transient HTTP server that always responds 406 to the upgrade.
  const http = await import('node:http');
  const srv = http.createServer((_req, res) => {
    res.writeHead(406, { 'Content-Type': 'text/plain' });
    res.end('too old');
  });
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const addr = srv.address() as { port: number };
  const url = `ws://127.0.0.1:${addr.port}/`;

  await assert.rejects(
    Connection.create({ endpoint: url, skipAuth: true }),
    /too old/i
  );
  await new Promise<void>((resolve) => srv.close(() => resolve()));
});
