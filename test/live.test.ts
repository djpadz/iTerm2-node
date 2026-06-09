/**
 * Live-only tests. Skipped unless `ITERM2_TEST_MODE=live`.
 *
 * Mutating tests (create tab, send text, set variable) additionally require
 * `ITERM2_TEST_MUTATE=1` so a casual `npm test` can't surprise the user.
 *
 * Run with: `npm run test:live`
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { Api } from '../src/api';
import { getApp } from '../src/app';
import { Profile } from '../src/profile';
import {
  makeHarness,
  liveOnly,
  requireMutate,
  type Harness,
} from './helpers/harness';

let harness: Harness;
before(async () => {
  harness = await makeHarness();
});
after(async () => harness.cleanup());

test('live: protocolVersion is [1, N] from real iTerm2', async (t) => {
  if (liveOnly(t)) return;
  const conn = await harness.connect();
  const [major, minor] = conn.protocolVersion;
  assert.equal(major, 1, `expected protocol major=1, got ${major}.${minor}`);
  assert.ok(minor >= 0);
  conn.close();
});

test('live: App.getApp returns a populated tree', async (t) => {
  if (liveOnly(t)) return;
  const conn = await harness.connect();
  const app = await getApp(conn);
  assert.ok(app, 'getApp should not return null');
  assert.ok(Array.isArray(app!.windows));
  // iTerm2 has at least one window when the API is reachable from a script.
  assert.ok(app!.windows.length >= 1, 'expected at least one window');
  conn.close();
});

test('live: Profile.getAll returns at least the default profile', async (t) => {
  if (liveOnly(t)) return;
  const conn = await harness.connect();
  const profiles = await Profile.getAll(conn);
  assert.ok(profiles.length >= 1, 'expected at least one profile');
  // Every profile must carry a GUID.
  for (const p of profiles) {
    assert.equal(typeof p.guid, 'string');
    assert.ok(p.guid && p.guid.length > 0, `profile is missing GUID`);
  }
  conn.close();
});

test('live: Api.listSessions windows are well-formed', async (t) => {
  if (liveOnly(t)) return;
  const conn = await harness.connect();
  const r = await new Api(conn).listSessions({});
  assert.ok(Array.isArray(r.windows));
  for (const w of r.windows ?? []) {
    assert.match(w.windowId ?? '', /pty-/u);
    assert.ok(Array.isArray(w.tabs));
  }
  conn.close();
});

test('live: theme variable resolves to a non-empty token list', async (t) => {
  if (liveOnly(t)) return;
  const conn = await harness.connect();
  const app = await getApp(conn);
  const theme = await app!.getTheme();
  assert.ok(Array.isArray(theme));
  assert.ok(theme.length >= 1, 'expected at least one theme attribute');
  // Every theme always includes either "light" or "dark".
  assert.ok(
    theme.some((t2) => t2 === 'light' || t2 === 'dark'),
    `theme was ${JSON.stringify(theme)}`
  );
  conn.close();
});

// ---- mutating tests (require ITERM2_TEST_MUTATE=1) ------------------------

test('live+mutate: session variable round-trip on the active session', async (t) => {
  if (requireMutate(t)) return;
  const conn = await harness.connect();
  const app = await getApp(conn);
  const session = app!.currentWindow?.currentTab?.currentSession;
  assert.ok(session, 'no active session in iTerm2');

  const key = 'user.iterm2NodeHarnessTest';
  const value = { stamp: 'live-test', n: 42 };
  await session!.setVariable(key, value);
  const round = await session!.getVariable(key);
  assert.deepEqual(round, value);
  conn.close();
});
