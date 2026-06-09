/**
 * Prompt — port of `iterm2/prompt.py`. Wraps the GetPrompt RPC and provides a
 * monitor that yields successive prompt/command-start/command-end events.
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import { CoordRange } from './util';
import { RPCException } from './session';
import {
  subscribeToPromptNotification,
  unsubscribe,
  type SubscriptionToken,
} from './notifications';

export enum PromptState {
  /** This version of iTerm2 does not report prompt state. */
  UNKNOWN = -1,
  /** User is editing the command at the prompt. */
  EDITING = 0,
  /** The last entered command is still executing. */
  RUNNING = 1,
  /**
   * The last entered command has finished but there hasn't been a new prompt
   * yet (rare).
   */
  FINISHED = 3,
}

// Status enum mirrors iterm2.GetPromptResponse.Status
const GET_PROMPT_STATUS_OK = 0;
const GET_PROMPT_STATUS_PROMPT_UNAVAILABLE = 3;

/**
 * Describes a command prompt.
 *
 * Shell Integration must be installed for this to work properly. Do not
 * construct this directly — use `getLastPrompt()` / `getPromptById()`.
 */
export class Prompt {
  constructor(private readonly _proto: iterm2.GetPromptResponse.$Properties) {}

  /** The `CoordRange` of the shell prompt itself. */
  get promptRange(): CoordRange {
    return CoordRange.fromProto(this._proto.promptRange ?? {});
  }

  /** The `CoordRange` of the command following the shell prompt. */
  get commandRange(): CoordRange {
    return CoordRange.fromProto(this._proto.commandRange ?? {});
  }

  /** The `CoordRange` of the output of the command following the prompt. */
  get outputRange(): CoordRange {
    return CoordRange.fromProto(this._proto.outputRange ?? {});
  }

  /** Working directory at the time the prompt was printed. */
  get workingDirectory(): string | null {
    return this._proto.workingDirectory ?? null;
  }

  /** Command entered at the prompt. */
  get command(): string | null {
    return this._proto.command ?? null;
  }

  /** State of this command prompt. */
  get state(): PromptState {
    if (this._proto.promptState == null) return PromptState.UNKNOWN;
    return this._proto.promptState as unknown as PromptState;
  }

  /**
   * Unique ID of this command prompt, or `null` if the iTerm2 version is too
   * old to report it.
   */
  get uniqueId(): string | null {
    return this._proto.uniquePromptId ?? null;
  }
}

/**
 * Fetches info about the last prompt in a session.
 *
 * @returns The prompt if one exists, or `null`.
 * @throws {RPCException} on unexpected errors.
 */
export async function getLastPrompt(
  connection: Connection,
  sessionId: string
): Promise<Prompt | null> {
  const api = new Api(connection);
  const res = await api.getPrompt({ session: sessionId });
  const status = res.status ?? GET_PROMPT_STATUS_OK;
  if (status === GET_PROMPT_STATUS_OK) {
    return new Prompt(res);
  }
  if (status === GET_PROMPT_STATUS_PROMPT_UNAVAILABLE) {
    return null;
  }
  throw new RPCException(`getLastPrompt failed status=${status}`);
}

/**
 * Fetches a `Prompt` by its unique ID.
 *
 * @returns The prompt if one exists, or `null`.
 * @throws {RPCException} on unexpected errors.
 */
export async function getPromptById(
  connection: Connection,
  sessionId: string,
  promptUniqueId: string
): Promise<Prompt | null> {
  const api = new Api(connection);
  const res = await api.getPrompt({
    session: sessionId,
    uniquePromptId: promptUniqueId,
  });
  const status = res.status ?? GET_PROMPT_STATUS_OK;
  if (status === GET_PROMPT_STATUS_OK) {
    return new Prompt(res);
  }
  if (status === GET_PROMPT_STATUS_PROMPT_UNAVAILABLE) {
    return null;
  }
  throw new RPCException(`getPromptById failed status=${status}`);
}

/**
 * Fetches a list of prompt unique IDs in a session.
 *
 * @throws {RPCException} on unexpected errors.
 */
export async function listPrompts(
  connection: Connection,
  sessionId: string,
  first: string | null = null,
  last: string | null = null
): Promise<string[]> {
  const api = new Api(connection);
  const req: iterm2.ListPromptsRequest.$Properties = { session: sessionId };
  if (first != null) req.firstUniqueId = first;
  if (last != null) req.lastUniqueId = last;
  const res = await api.listPrompts(req);
  if ((res.status ?? 0) !== 0) {
    throw new RPCException(`listPrompts failed status=${res.status}`);
  }
  return res.uniquePromptId ?? [];
}

/**
 * Modes for a `PromptMonitor`. Note older iTerm2 versions only support
 * `PROMPT`.
 *
 * Values match `iterm2.PromptMonitorMode` in the proto.
 */
export enum PromptMonitorMode {
  /** Notify when prompt detected. */
  PROMPT = 0,
  /** Notify when a command begins execution. */
  COMMAND_START = 1,
  /** Notify when a command finishes execution. */
  COMMAND_END = 2,
}

type PromptNotif = iterm2.PromptNotification.$Properties;

/** Tuple yielded by `PromptMonitor.get()`. */
export interface PromptMonitorEvent {
  mode: PromptMonitorMode;
  /**
   * - For `PROMPT`: a `Prompt | null` (null on older iTerm2 that doesn't
   *   send the prompt payload).
   * - For `COMMAND_START`: the command string.
   * - For `COMMAND_END`: the exit status.
   */
  value: Prompt | string | number | null;
  /** Unique prompt ID, or `null` if unavailable. */
  uniquePromptId: string | null;
}

/**
 * Async wrapper around the prompt notification. Subscribe via `start()` /
 * iterate by calling `get()`, then `stop()` (or use `with()` helper).
 *
 * Example:
 * ```ts
 * const mon = await new PromptMonitor(conn, sessionId).start();
 * try {
 *   while (true) {
 *     const evt = await mon.get();
 *     // ...
 *   }
 * } finally {
 *   await mon.stop();
 * }
 * ```
 */
export class PromptMonitor {
  private readonly _modes: PromptMonitorMode[];
  private _token: SubscriptionToken<PromptNotif> | null = null;
  private readonly _queue: PromptNotif[] = [];
  private readonly _waiters: Array<(notif: PromptNotif) => void> = [];

  constructor(
    public readonly connection: Connection,
    public readonly sessionId: string,
    modes?: PromptMonitorMode[] | null
  ) {
    this._modes = modes && modes.length > 0 ? modes : [PromptMonitorMode.PROMPT];
  }

  /** Subscribe to prompt notifications. Resolves to `this`. */
  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToPromptNotification(
      this.connection,
      async (_c, notif) => this._enqueue(notif),
      {
        session: this.sessionId,
        modes: this._modes as unknown as iterm2.PromptMonitorMode[],
      }
    );
    return this;
  }

  /** Unsubscribe. Safe to call multiple times. */
  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.connection, this._token);
    } catch {
      /* ignore */
    }
    this._token = null;
  }

  /**
   * Block until the next prompt event. Returns a `PromptMonitorEvent`
   * describing it.
   *
   * @throws {RPCException} if the notification has an unexpected shape.
   */
  async get(): Promise<PromptMonitorEvent> {
    const message = await this._next();
    const which = message.event;
    if (which === 'prompt' || which == null) {
      const promptProto = message.prompt?.prompt ?? null;
      const value = promptProto ? new Prompt(promptProto) : null;
      return {
        mode: PromptMonitorMode.PROMPT,
        value,
        uniquePromptId: message.uniquePromptId ?? null,
      };
    }
    if (which === 'commandStart') {
      return {
        mode: PromptMonitorMode.COMMAND_START,
        value: message.commandStart?.command ?? '',
        uniquePromptId: message.uniquePromptId ?? null,
      };
    }
    if (which === 'commandEnd') {
      return {
        mode: PromptMonitorMode.COMMAND_END,
        value: message.commandEnd?.status ?? 0,
        uniquePromptId: message.uniquePromptId ?? null,
      };
    }
    throw new RPCException(`Unexpected oneof in prompt notification: ${which}`);
  }

  /** Async iterator yielding successive `PromptMonitorEvent`s forever. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<PromptMonitorEvent> {
    await this.start();
    try {
      while (true) {
        yield await this.get();
      }
    } finally {
      await this.stop();
    }
  }

  private _enqueue(notif: PromptNotif): void {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(notif);
    } else {
      this._queue.push(notif);
    }
  }

  private _next(): Promise<PromptNotif> {
    const next = this._queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => this._waiters.push(resolve));
  }

  /** Convenience: run `fn(monitor)` between start and stop. */
  static async with<T>(
    connection: Connection,
    sessionId: string,
    modes: PromptMonitorMode[] | null,
    fn: (mon: PromptMonitor) => Promise<T>
  ): Promise<T> {
    const mon = await new PromptMonitor(connection, sessionId, modes).start();
    try {
      return await fn(mon);
    } finally {
      await mon.stop();
    }
  }
}
