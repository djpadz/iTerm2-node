import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { Connection } from '../src/connection';
import { Api } from '../src/api';
import {
  startMockServer,
  type MockServer,
  type RequestHandler,
} from './helpers/mock-server';

let server: MockServer;

before(async () => {
  server = await startMockServer();
});

after(async () => {
  await server.close();
});

async function withConn<T>(
  handler: RequestHandler,
  fn: (api: Api) => Promise<T>
): Promise<T> {
  server.setHandler(handler);
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });
  try {
    return await fn(new Api(conn));
  } finally {
    conn.close();
  }
}

test('Api.sendText sends a SendTextRequest with given fields', async () => {
  let captured: {
    session?: string | null;
    text?: string | null;
    suppressBroadcast?: boolean | null;
  } = {};
  const res = await withConn(
    (req) => {
      captured = req.sendTextRequest ?? {};
      return { sendTextResponse: { status: 0 } };
    },
    (api) =>
      api.sendText({
        session: 'sid',
        text: 'hello\n',
        suppressBroadcast: true,
      })
  );

  assert.equal(captured.session, 'sid');
  assert.equal(captured.text, 'hello\n');
  assert.equal(captured.suppressBroadcast, true);
  assert.equal(res.status, 0);
});

test('Api.listSessions unwraps the response submessage', async () => {
  const res = await withConn(
    () => ({
      listSessionsResponse: {
        windows: [{ windowId: 'W' }],
        buriedSessions: [],
      },
    }),
    (api) => api.listSessions({})
  );
  assert.equal(res.windows?.[0]?.windowId, 'W');
});

test('Api throws when the server returns ServerOriginatedMessage.error', async () => {
  await assert.rejects(
    withConn(
      () => ({ error: 'malformed' }),
      (api) => api.listSessions({})
    ),
    /malformed/
  );
});

test('Api throws when the expected response submessage is missing', async () => {
  await assert.rejects(
    withConn(
      () => ({ /* nothing */ }),
      (api) => api.listSessions({})
    ),
    /no listSessionsResponse/
  );
});

test('Api.variable round-trips set + get assignments', async () => {
  let lastReq: {
    app?: boolean | null;
    set?: unknown[] | null;
    get?: string[] | null;
  } = {};
  await withConn(
    (req) => {
      lastReq = req.variableRequest ?? {};
      return { variableResponse: { status: 0, values: ['"hi"'] } };
    },
    async (api) => {
      const setRes = await api.variable({
        sessionId: 'sid',
        set: [{ name: 'user.greet', value: '"hi"' }],
      });
      assert.equal(setRes.status, 0);
      const getRes = await api.variable({
        sessionId: 'sid',
        get: ['user.greet'],
      });
      assert.equal(getRes.values?.[0], '"hi"');
    }
  );

  // Final captured request was the get.
  assert.deepEqual(lastReq.get, ['user.greet']);
});
