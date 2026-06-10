/**
 * BaseMonitor — shared mechanics behind every iTerm2 notification-driven
 * monitor (VariableMonitor, KeystrokeMonitor, PromptMonitor, FocusMonitor,
 * CustomControlSequenceMonitor, ScreenStreamer, lifecycle monitors, …).
 *
 * Each concrete monitor only has to:
 *   - call super(conn) in its constructor (after any extra fields)
 *   - implement `_subscribe()` to register with the right notification
 *     helper. Inside the registered callback, call `this._deliver(value)`
 *     to enqueue a decoded value of type T. Return the SubscriptionToken.
 *
 * Optionally:
 *   - override `_onStart()` for one-time setup that runs after the
 *     subscription is in place (e.g. seeding a queue from app state).
 */

import type { Connection } from './connection';
import { unsubscribe, type SubscriptionToken } from './notifications';

export abstract class BaseMonitor<T> {
  /** Subscription, set by start() and cleared by stop(). */
  // The wire shape is hidden — `unsubscribe` only cares about the key.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _token: SubscriptionToken<any> | null = null;
  /**
   * FIFO of pending values. Protected so subclasses can implement
   * coalescing semantics (e.g. ScreenStreamer: drop older updates before
   * pushing a new one).
   */
  protected _queue: T[] = [];
  private _waiters: Array<(value: T) => void> = [];

  constructor(protected readonly conn: Connection) {}

  /**
   * Concrete monitors implement this to register with the appropriate
   * `subscribeTo*Notification` helper. The registered callback should call
   * `this._deliver(value)` to push values of type T into the queue.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract _subscribe(): Promise<SubscriptionToken<any>>;

  /** Hook for one-time setup after the subscription is active. */
  protected async _onStart(): Promise<void> {
    /* default no-op */
  }

  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await this._subscribe();
    await this._onStart();
    return this;
  }

  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.conn, this._token);
    } catch {
      /* ignore — best-effort cleanup */
    }
    this._token = null;
  }

  /** Resolve with the next decoded value. */
  get(): Promise<T> {
    return this._next();
  }

  /** Yields decoded values forever. Calls stop() when the iterator returns. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  /**
   * Push a decoded value into the queue (or hand it directly to a pending
   * `get()` caller). Called from the subscription callback in `_subscribe`,
   * or from `_onStart` to seed pre-existing state.
   */
  protected _deliver(value: T): void {
    const waiter = this._waiters.shift();
    if (waiter) waiter(value);
    else this._queue.push(value);
  }

  private _next(): Promise<T> {
    const next = this._queue.shift();
    if (next !== undefined) return Promise.resolve(next);
    return new Promise((resolve) => this._waiters.push(resolve));
  }
}

/**
 * Run `fn(monitor)` between `monitor.start()` and `monitor.stop()`.
 *
 * Each concrete monitor's `static with(...)` should be a one-liner that
 * constructs the monitor and forwards to this helper.
 */
export async function withMonitor<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  M extends BaseMonitor<any>,
  T,
>(monitor: M, fn: (m: M) => Promise<T>): Promise<T> {
  await monitor.start();
  try {
    return await fn(monitor);
  } finally {
    await monitor.stop();
  }
}
