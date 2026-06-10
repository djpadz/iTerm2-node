/**
 * Session — port of `iterm2/session.py`. Represents one iTerm2 pane.
 *
 * For methods not directly ported, drop down to `session.api` (typed RPC) or
 * `session.conn` (raw `Connection`).
 */

import type { Connection } from './connection';
import { Api } from './api';
import { Size, Frame, Point } from './util';
import type { iterm2 } from './generated/api';
import {
  subscribeToKeystrokeNotification,
  subscribeToScreenUpdateNotification,
  subscribeToCustomEscapeSequenceNotification,
  subscribeToPromptNotification,
  subscribeToVariableChangeNotification,
  type KeystrokeCallback,
  type ScreenUpdateCallback,
  type CustomEscapeSequenceCallback,
  type PromptCallback,
  type VariableChangedCallback,
} from './notifications';
import { invocationString } from './util';
import {
  STATUS_OK,
  checkStatus,
  setScopedVariable,
  getScopedVariable,
  closeTarget,
  invokeFunctionFor,
} from './_internal';

export class RPCException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RPCException';
  }
}

export class SplitPaneException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitPaneException';
  }
}

export class InvalidSessionId extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSessionId';
  }
}

export class SessionLineInfo {
  constructor(
    public readonly mutableAreaHeight: number,
    public readonly scrollbackBufferHeight: number,
    public readonly overflow: number,
    public readonly firstVisibleLineNumber: number
  ) {}
}

export interface SessionDelegate {
  sessionDelegateGetTab(session: Session): unknown;
  sessionDelegateGetWindow(session: Session): unknown;
  sessionDelegateCreateSession(sessionId: string): Promise<Session | null>;
}

/**
 * Splitter — internal tree node grouping sessions along a single divider.
 */
export class Splitter {
  private _children: Array<Splitter | Session> = [];

  constructor(public readonly vertical: boolean = false) {}

  addChild(child: Splitter | Session): void {
    this._children.push(child);
  }

  get children(): ReadonlyArray<Splitter | Session> {
    return this._children;
  }

  get sessions(): Session[] {
    const out: Session[] = [];
    for (const c of this._children) {
      if (c instanceof Session) out.push(c);
      else out.push(...c.sessions);
    }
    return out;
  }

  prettyStr(indent = ''): string {
    const lines = [`${indent}Splitter ${this.vertical ? '|' : '-'}`];
    for (const c of this._children) lines.push(c.prettyStr(indent + '  '));
    return lines.join('\n');
  }

  updateSession(session: Session): boolean {
    for (let i = 0; i < this._children.length; i++) {
      const c = this._children[i]!;
      if (c instanceof Session && c.sessionId === session.sessionId) {
        this._children[i] = session;
        return true;
      }
      if (c instanceof Splitter && c.updateSession(session)) return true;
    }
    return false;
  }

  static fromNode(
    node: iterm2.SplitTreeNode.$Properties,
    conn: Connection
  ): Splitter {
    const splitter = new Splitter(!!node.vertical);
    for (const link of node.links ?? []) {
      if (link.session) {
        splitter.addChild(Session.fromLink(conn, link));
      } else if (link.node) {
        splitter.addChild(Splitter.fromNode(link.node, conn));
      }
    }
    return splitter;
  }

  toProto(): iterm2.SplitTreeNode.$Properties {
    const links: iterm2.SplitTreeNode.SplitTreeLink.$Properties[] = [];
    for (const c of this._children) {
      if (c instanceof Session) {
        links.push({ session: c.toSessionSummaryProto() });
      } else {
        links.push({ node: c.toProto() });
      }
    }
    return { vertical: this.vertical, links };
  }
}

export class Session {
  readonly api: Api;
  private _sessionId: string;
  private _gridSize: Size | null;
  private _frame: Frame | null;
  private _preferredSize: Size;
  name: string;
  buried: boolean;

  /** Delegate set by App to wire tab/window lookups. */
  static delegate: SessionDelegate | null = null;

  private constructor(
    public readonly conn: Connection,
    init: {
      sessionId: string;
      name?: string;
      gridSize?: Size | null;
      frame?: Frame | null;
      buried?: boolean;
    }
  ) {
    this.api = new Api(conn);
    this._sessionId = init.sessionId;
    this.name = init.name ?? '';
    this._gridSize = init.gridSize ?? null;
    this._frame = init.frame ?? null;
    this.buried = init.buried ?? false;
    this._preferredSize = this._gridSize ?? new Size(80, 25);
  }

  toString(): string {
    return `<Session name=${this.name} id=${this._sessionId}>`;
  }

  static fromLink(
    conn: Connection,
    link: iterm2.SplitTreeNode.SplitTreeLink.$Properties
  ): Session {
    const s = link.session!;
    const gridSize =
      s.gridSize ? new Size(s.gridSize.width ?? 0, s.gridSize.height ?? 0) : null;
    const frame =
      s.frame
        ? new Frame(
            new Point(s.frame.origin?.x ?? 0, s.frame.origin?.y ?? 0),
            new Size(s.frame.size?.width ?? 0, s.frame.size?.height ?? 0)
          )
        : null;
    return new Session(conn, {
      sessionId: s.uniqueIdentifier ?? '',
      name: s.title ?? '',
      gridSize,
      frame,
      buried: false,
    });
  }

  static fromSummary(
    conn: Connection,
    summary: iterm2.SessionSummary.$Properties
  ): Session {
    return new Session(conn, {
      sessionId: summary.uniqueIdentifier ?? '',
      name: summary.title ?? '',
      buried: true,
    });
  }

  /** Builds a proxy session — pass session IDs like "active" or "all". */
  static proxy(conn: Connection, sessionId: 'active' | 'all' | string): Session {
    return new Session(conn, { sessionId, name: sessionId, buried: false });
  }

  static activeProxy(conn: Connection): Session {
    return Session.proxy(conn, 'active');
  }

  static allProxy(conn: Connection): Session {
    return Session.proxy(conn, 'all');
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get gridSize(): Size | null {
    return this._gridSize;
  }

  get frame(): Frame | null {
    return this._frame;
  }

  get preferredSize(): Size {
    return this._preferredSize;
  }

  set preferredSize(value: Size) {
    this._preferredSize = value;
  }

  /** Replace internal state from another Session. */
  updateFrom(other: Session): void {
    this._frame = other._frame;
    this._gridSize = other._gridSize;
    this.name = other.name;
  }

  toSessionSummaryProto(): iterm2.SessionSummary.$Properties {
    return {
      uniqueIdentifier: this._sessionId,
      gridSize: {
        width: this._preferredSize.width,
        height: this._preferredSize.height,
      },
    };
  }

  prettyStr(indent = ''): string {
    return `${indent}Session "${this.name}" id=${this._sessionId}`;
  }

  // ----- core RPCs -------------------------------------------------------

  async sendText(text: string, suppressBroadcast = false): Promise<void> {
    await this.api.sendText({
      session: this._sessionId,
      text,
      suppressBroadcast,
    });
  }

  async inject(data: Uint8Array | string): Promise<void> {
    const bytes =
      typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const res = await this.api.inject({
      data: bytes,
      sessionId: [this._sessionId],
    });
    const status = res.status?.[0] ?? STATUS_OK;
    checkStatus(status, 'inject');
  }

  async activate(selectTab = true, orderWindowFront = true): Promise<void> {
    await this.api.activate({
      sessionId: this._sessionId,
      activateApp: {},
      selectSession: true,
      selectTab,
      orderWindowFront,
    });
  }

  async restart(onlyIfExited = false): Promise<void> {
    const res = await this.api.restartSession({
      sessionId: this._sessionId,
      onlyIfExited,
    });
    checkStatus(res.status, 'restart');
  }

  async close(force = false): Promise<void> {
    await closeTarget(
      this.api,
      { sessions: { sessionIds: [this._sessionId] } },
      force
    );
  }

  /** Set or get a session-scoped user variable (`user.foo`). */
  setVariable(name: string, value: unknown): Promise<void> {
    return setScopedVariable(this.api, { sessionId: this._sessionId }, name, value);
  }

  getVariable(name: string): Promise<unknown> {
    return getScopedVariable(this.api, { sessionId: this._sessionId }, name);
  }

  /** Resize via SetProperty — only meaningful for single-pane tabs. */
  async setGridSize(size: Size): Promise<void> {
    await this._setProperty('grid_size', size.json);
  }

  async setBuried(buried: boolean): Promise<void> {
    await this._setProperty('buried', JSON.stringify(buried));
  }

  async setName(name: string): Promise<void> {
    const invocation = invocationString('iterm2.set_name', { name });
    await this._invokeMethod(invocation);
  }

  async getLineInfo(): Promise<SessionLineInfo> {
    const res = await this.api.getProperty({
      name: 'number_of_lines',
      sessionId: this._sessionId,
    });
    checkStatus(res.status, 'getLineInfo');
    const dict = JSON.parse(res.jsonValue ?? '{}') as Record<string, number>;
    return new SessionLineInfo(
      dict.grid ?? 0,
      dict.history ?? 0,
      dict.overflow ?? 0,
      dict.first_visible ?? 0
    );
  }

  /** Returns raw GetBufferResponse — see `iterm2.GetBufferResponse`. */
  async getScreenContents(): Promise<iterm2.GetBufferResponse.$Properties> {
    const res = await this.api.getBuffer({
      session: this._sessionId,
      lineRange: { screenContentsOnly: true },
    });
    checkStatus(res.status, 'getScreenContents');
    return res;
  }

  // ----- profile ---------------------------------------------------------

  /** Returns the raw GetProfilePropertyResponse — wrap via Profile yourself. */
  async getProfile(): Promise<iterm2.GetProfilePropertyResponse.$Properties> {
    const res = await this.api.getProfileProperty({
      session: this._sessionId,
    });
    checkStatus(res.status, 'getProfile');
    return res;
  }

  /**
   * Pass an array of `[key, jsonValue]` assignments. Mirrors Python's
   * `async_set_profile_properties` (we always use the bulk endpoint).
   */
  async setProfileProperties(
    assignments: Array<[string, string]>
  ): Promise<void> {
    const res = await this.api.setProfileProperty({
      session: this._sessionId,
      assignments: assignments.map(([key, jsonValue]) => ({
        key,
        jsonValue,
      })),
    });
    checkStatus(res.status, 'setProfileProperties');
  }

  // ----- function invocation --------------------------------------------

  invokeFunction(invocation: string, timeoutSeconds = -1): Promise<unknown> {
    return invokeFunctionFor(
      this.api,
      { session: { sessionId: this._sessionId } },
      invocation,
      timeoutSeconds
    );
  }

  // ----- notifications --------------------------------------------------

  subscribeKeystroke(cb: KeystrokeCallback, opts: { advanced?: boolean } = {}) {
    return subscribeToKeystrokeNotification(this.conn, cb, {
      session: this._sessionId,
      advanced: opts.advanced ?? false,
    });
  }

  subscribeScreenUpdate(cb: ScreenUpdateCallback) {
    return subscribeToScreenUpdateNotification(this.conn, cb, {
      session: this._sessionId,
    });
  }

  subscribeCustomEscapeSequence(cb: CustomEscapeSequenceCallback) {
    return subscribeToCustomEscapeSequenceNotification(this.conn, cb, {
      session: this._sessionId,
    });
  }

  subscribePrompt(cb: PromptCallback, modes?: iterm2.PromptMonitorMode[]) {
    return subscribeToPromptNotification(this.conn, cb, {
      session: this._sessionId,
      modes,
    });
  }

  subscribeVariableChange(
    cb: VariableChangedCallback,
    name: string,
    scope: iterm2.VariableScope = 1 /* SESSION */ as iterm2.VariableScope
  ) {
    return subscribeToVariableChangeNotification(this.conn, cb, {
      scope,
      name,
      identifier: this._sessionId,
    });
  }

  // ----- internals -------------------------------------------------------

  private async _setProperty(key: string, jsonValue: string): Promise<void> {
    const res = await this.api.setProperty({
      sessionId: this._sessionId,
      name: key,
      jsonValue,
    });
    checkStatus(res.status, `setProperty(${key})`);
  }

  private async _invokeMethod(invocation: string, timeoutSeconds = -1): Promise<unknown> {
    return this.invokeFunction(invocation, timeoutSeconds);
  }
}
