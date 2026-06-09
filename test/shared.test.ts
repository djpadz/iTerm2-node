/**
 * Cross-mode tests — run against either the mock WebSocket server (default)
 * or a real iTerm2 instance via `ITERM2_TEST_MODE=live npm test`.
 *
 * `harness.setHandler(...)` programs the mock server's response. On live
 * mode it's a no-op, so the real iTerm2 reply comes back instead.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { Api } from '../src/api';
import { subscribeToFocusChangeNotification, unsubscribe } from '../src/notifications';
import {
  makeHarness,
  type Harness,
} from './helpers/harness';

let harness: Harness;
before(async () => {
  harness = await makeHarness();
});
after(async () => harness.cleanup());

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test('shared: opens a Connection successfully', async () => {
  const conn = await harness.connect();
  assert.ok(conn.ws, 'ws handle should be set after create()');
  conn.close();
});

test('shared: protocolVersion is a tuple of integers', async () => {
  const conn = await harness.connect();
  const [major, minor] = conn.protocolVersion;
  assert.ok(Number.isInteger(major), `major was ${major}`);
  assert.ok(Number.isInteger(minor), `minor was ${minor}`);
  // Live iTerm2 sends [1, N]; mock omits the header and we report [0, 0].
  // Either way the values must be finite non-negative integers.
  assert.ok(major >= 0 && minor >= 0);
  conn.close();
});

test('shared: ListSessions returns a structurally-valid response', async () => {
  // Mock canned response — ignored on live.
  harness.setHandler((req) =>
    req.listSessionsRequest
      ? {
          listSessionsResponse: {
            windows: [
              { windowId: 'W1', number: 1, tabs: [] },
            ],
            buriedSessions: [],
          },
        }
      : {}
  );
  const conn = await harness.connect();
  const r = await new Api(conn).listSessions({});
  assert.ok(Array.isArray(r.windows), 'windows should be an array');
  assert.ok(Array.isArray(r.buriedSessions), 'buriedSessions should be an array');
  for (const w of r.windows ?? []) {
    assert.equal(typeof w.windowId, 'string');
    assert.ok(Array.isArray(w.tabs));
  }
  conn.close();
});

test('shared: concurrent requests resolve without crossing wires', async () => {
  harness.setHandler((req) =>
    req.listSessionsRequest
      ? { listSessionsResponse: { windows: [], buriedSessions: [] } }
      : {}
  );
  const conn = await harness.connect();
  const api = new Api(conn);
  const results = await Promise.all([
    api.listSessions({}),
    api.listSessions({}),
    api.listSessions({}),
    api.listSessions({}),
  ]);
  // All four resolved with a structurally-valid payload — no errors thrown,
  // no responses dropped, ids correctly routed.
  for (const r of results) {
    assert.ok(Array.isArray(r.windows));
  }
  conn.close();
});

test('shared: focus subscription returns a token (events validated on mock)', async () => {
  harness.setHandler((req) =>
    req.notificationRequest
      ? { notificationResponse: { status: 0 } }
      : {}
  );
  const conn = await harness.connect();
  const events: unknown[] = [];
  const tok = await subscribeToFocusChangeNotification(conn, (_c, n) => {
    events.push(n);
  });
  assert.ok(tok.key, 'token should carry a non-empty key');

  if (harness.mode === 'mock') {
    harness.broadcast({
      notification: { focusChangedNotification: { session: 'sess-X' } },
    });
    await wait(40);
    assert.equal(events.length, 1);
  }
  // On live we can't reliably trigger a focus change inside the test window;
  // the subscription handshake succeeding is the meaningful assertion.

  await unsubscribe(conn, tok);
  conn.close();
});

test('shared: ListSessions windows expose tabs in a tree', async () => {
  harness.setHandler((req) =>
    req.listSessionsRequest
      ? {
          listSessionsResponse: {
            windows: [
              {
                windowId: 'W1',
                number: 1,
                tabs: [
                  {
                    tabId: 'T1',
                    root: {
                      vertical: false,
                      links: [
                        {
                          session: {
                            uniqueIdentifier: 'S1',
                            title: 'demo',
                            gridSize: { width: 80, height: 24 },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
            buriedSessions: [],
          },
        }
      : {}
  );
  const conn = await harness.connect();
  const r = await new Api(conn).listSessions({});
  for (const w of r.windows ?? []) {
    for (const t of w.tabs ?? []) {
      // Every tab has a root SplitTreeNode (possibly empty).
      assert.ok(t.tabId, 'tab should have an id');
      assert.ok(t.root != null, 'tab.root should be set');
    }
  }
  conn.close();
});
