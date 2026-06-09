/**
 * Dual-mode test harness — same shared test code runs against either a mock
 * WebSocket server (default, fast, deterministic) or a live iTerm2 instance.
 *
 * Pick the backend with `ITERM2_TEST_MODE`:
 *   - `mock` (default): per-file `MockServer` on a random localhost port
 *   - `live`: real `Connection.create()` against the running iTerm2 daemon
 *
 * Mutating tests (creating tabs, sending text, etc.) additionally require
 * `ITERM2_TEST_MUTATE=1` so a stray live run can't surprise the user.
 */

import type { TestContext } from 'node:test';

import { Connection } from '../../src/connection';
import type { ServerOriginatedMessageProps } from '../../src/proto';
import {
  startMockServer,
  type MockServer,
  type RequestHandler,
} from './mock-server';

export type HarnessMode = 'mock' | 'live';

export function getMode(): HarnessMode {
  return process.env.ITERM2_TEST_MODE === 'live' ? 'live' : 'mock';
}

export function mutateEnabled(): boolean {
  return process.env.ITERM2_TEST_MUTATE === '1';
}

/**
 * Skip a test unless the harness is in mock mode. Returns true if skipped so
 * the test body can early-return.
 */
export function mockOnly(
  t: TestContext,
  reason = 'requires mock harness'
): boolean {
  if (getMode() !== 'mock') {
    t.skip(reason);
    return true;
  }
  return false;
}

/** Skip unless ITERM2_TEST_MODE=live. */
export function liveOnly(
  t: TestContext,
  reason = 'requires ITERM2_TEST_MODE=live'
): boolean {
  if (getMode() !== 'live') {
    t.skip(reason);
    return true;
  }
  return false;
}

/** Skip unless ITERM2_TEST_MUTATE=1 (and live mode). */
export function requireMutate(t: TestContext): boolean {
  if (getMode() !== 'live') {
    t.skip('mutating tests only run in live mode');
    return true;
  }
  if (!mutateEnabled()) {
    t.skip('set ITERM2_TEST_MUTATE=1 to enable state-changing live tests');
    return true;
  }
  return false;
}

export interface Harness {
  readonly mode: HarnessMode;
  /** Open a Connection bound to this harness. Test owns close(). */
  connect(): Promise<Connection>;
  /**
   * Install a request handler. Mock-only — on live, this is a no-op (the
   * real iTerm2 server can't be programmed). Tests should still call it
   * unconditionally; on live mode, iTerm2's real response comes back.
   */
  setHandler(h: RequestHandler): void;
  /**
   * Push a server-originated notification. Mock-only — throws on live.
   * Tests that need notifications in live mode must trigger them via real
   * iTerm2 actions instead.
   */
  broadcast(msg: ServerOriginatedMessageProps): void;
  cleanup(): Promise<void>;
}

class MockHarness implements Harness {
  readonly mode = 'mock' as const;
  private connections: Connection[] = [];

  private constructor(private readonly server: MockServer) {}

  static async create(): Promise<MockHarness> {
    return new MockHarness(await startMockServer());
  }

  async connect(): Promise<Connection> {
    const conn = await Connection.create({
      endpoint: this.server.url,
      skipAuth: true,
    });
    this.connections.push(conn);
    return conn;
  }

  setHandler(h: RequestHandler): void {
    this.server.setHandler(h);
  }

  broadcast(msg: ServerOriginatedMessageProps): void {
    this.server.broadcast(msg);
  }

  async cleanup(): Promise<void> {
    for (const c of this.connections) c.close();
    await this.server.close();
  }
}

class LiveHarness implements Harness {
  readonly mode = 'live' as const;
  private connections: Connection[] = [];

  async connect(): Promise<Connection> {
    const conn = await Connection.create({});
    this.connections.push(conn);
    return conn;
  }

  setHandler(_h: RequestHandler): void {
    /* no-op: live iTerm2 produces its own responses */
  }

  broadcast(_msg: ServerOriginatedMessageProps): never {
    throw new Error('broadcast() is not available on the live harness');
  }

  async cleanup(): Promise<void> {
    for (const c of this.connections) c.close();
  }
}

/**
 * Per-file harness factory. Call from `before()`, store the result, and
 * `cleanup()` from `after()`.
 */
export async function makeHarness(): Promise<Harness> {
  return getMode() === 'live' ? new LiveHarness() : MockHarness.create();
}
