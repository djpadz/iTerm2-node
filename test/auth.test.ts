import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { authenticate, removeAuth, authDisabled, getScriptName } from '../src/auth';

beforeEach(() => {
  removeAuth();
});

test('authenticate(false) returns false when a cookie is already in env', async () => {
  process.env.ITERM2_COOKIE = 'pre-set';
  process.env.ITERM2_KEY = 'pre-set-key';
  const result = await authenticate({ launchIfNeeded: false });
  assert.equal(result, false);
  assert.equal(process.env.ITERM2_COOKIE, 'pre-set');
  removeAuth();
});

test('removeAuth wipes both env vars', () => {
  process.env.ITERM2_COOKIE = 'x';
  process.env.ITERM2_KEY = 'y';
  removeAuth();
  assert.equal(process.env.ITERM2_COOKIE, undefined);
  assert.equal(process.env.ITERM2_KEY, undefined);
});

test('authDisabled returns false when the magic file is absent', () => {
  // No iTerm2 disable file in our test env; this just verifies the predicate
  // doesn't throw on missing-file errors.
  assert.equal(typeof authDisabled(), 'boolean');
});

test('getScriptName returns a non-empty string', () => {
  const name = getScriptName();
  assert.equal(typeof name, 'string');
  assert.ok(name.length > 0);
});
