import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { Connection } from '../src/connection';
import {
  NotificationType,
  subscribeToFocusChangeNotification,
  subscribeToKeystrokeNotification,
  subscribeToVariableChangeNotification,
  unsubscribe,
} from '../src/notifications';
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

const okSubscribeHandler: RequestHandler = (req) =>
  req.notificationRequest
    ? { notificationResponse: { status: 0 /* OK */ } }
    : {};

async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

test('subscribeToFocusChangeNotification + broadcast routes to callback', async () => {
  server.setHandler(okSubscribeHandler);
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });

  const seen: Array<{ session?: string | null }> = [];
  const tok = await subscribeToFocusChangeNotification(conn, (_c, n) => {
    seen.push({ session: n.session });
  });
  assert.ok(tok.key);

  server.broadcast({
    notification: { focusChangedNotification: { session: 'sess-A' } },
  });
  await wait(40);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.session, 'sess-A');

  conn.close();
});

test('STATUS_ALREADY_SUBSCRIBED (4) is treated as success', async () => {
  server.setHandler((req) =>
    req.notificationRequest
      ? { notificationResponse: { status: 4 /* ALREADY_SUBSCRIBED */ } }
      : {}
  );
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });

  const tok = await subscribeToFocusChangeNotification(conn, () => {});
  assert.ok(tok.key);
  conn.close();
});

test('non-OK status raises SubscriptionError', async () => {
  server.setHandler((req) =>
    req.notificationRequest
      ? { notificationResponse: { status: 2 /* REQUEST_MALFORMED */ } }
      : {}
  );
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });

  await assert.rejects(
    subscribeToFocusChangeNotification(conn, () => {}),
    /subscribe failed/i
  );
  conn.close();
});

test('keystroke notifications route to per-session subscribers', async () => {
  server.setHandler(okSubscribeHandler);
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });

  const a: string[] = [];
  const b: string[] = [];
  const tokA = await subscribeToKeystrokeNotification(
    conn,
    (_c, n) => { a.push(n.characters ?? ''); },
    { session: 'A' }
  );
  const tokB = await subscribeToKeystrokeNotification(
    conn,
    (_c, n) => { b.push(n.characters ?? ''); },
    { session: 'B' }
  );

  server.broadcast({
    notification: { keystrokeNotification: { session: 'A', characters: 'x' } },
  });
  server.broadcast({
    notification: { keystrokeNotification: { session: 'B', characters: 'y' } },
  });
  await wait(40);

  assert.deepEqual(a, ['x']);
  assert.deepEqual(b, ['y']);

  await unsubscribe(conn, tokA);
  await unsubscribe(conn, tokB);
  conn.close();
});

test('variable change subscribers are keyed by (scope, identifier, name)', async () => {
  server.setHandler(okSubscribeHandler);
  const conn = await Connection.create({
    endpoint: server.url,
    skipAuth: true,
  });

  const seenA: string[] = [];
  const seenB: string[] = [];
  await subscribeToVariableChangeNotification(
    conn,
    (_c, n) => { seenA.push(n.jsonNewValue ?? ''); },
    {
      scope: 1 as never /* SESSION */,
      name: 'jobName',
      identifier: 'sess-A',
    }
  );
  await subscribeToVariableChangeNotification(
    conn,
    (_c, n) => { seenB.push(n.jsonNewValue ?? ''); },
    {
      scope: 1 as never /* SESSION */,
      name: 'jobName',
      identifier: 'sess-B',
    }
  );

  server.broadcast({
    notification: {
      variableChangedNotification: {
        scope: 1,
        identifier: 'sess-A',
        name: 'jobName',
        jsonNewValue: '"vim"',
      },
    },
  });
  server.broadcast({
    notification: {
      variableChangedNotification: {
        scope: 1,
        identifier: 'sess-B',
        name: 'jobName',
        jsonNewValue: '"git"',
      },
    },
  });
  await wait(40);

  assert.deepEqual(seenA, ['"vim"']);
  assert.deepEqual(seenB, ['"git"']);
  conn.close();
});

test('NotificationType numeric values match the proto', () => {
  // Smoke check that the const map agrees with the proto's documented values.
  assert.equal(NotificationType.KEYSTROKE, 1);
  assert.equal(NotificationType.SCREEN_UPDATE, 2);
  assert.equal(NotificationType.NEW_SESSION, 6);
  assert.equal(NotificationType.FOCUS_CHANGE, 9);
  assert.equal(NotificationType.VARIABLE_CHANGE, 12);
});
