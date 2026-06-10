/**
 * Tab — port of `iterm2/tab.py`. A Tab owns a tree of sessions arranged via
 * split panes.
 */

import type { Connection } from './connection';
import { Api } from './api';
import { Session, Splitter, RPCException } from './session';
import { invocationString } from './util';
import {
  checkStatus,
  closeTarget,
  invokeFunctionFor,
  setScopedVariable,
  getScopedVariable,
} from './_internal';

export enum NavigationDirection {
  LEFT = 'left',
  RIGHT = 'right',
  ABOVE = 'above',
  BELOW = 'below',
}

export interface TabDelegate {
  tabDelegateGetWindow(tab: Tab): unknown;
  tabDelegateGetWindowById(windowId: string): Promise<unknown>;
}

export class Tab {
  readonly api: Api;
  private _root: Splitter;
  private _minimizedSessions: Session[];
  activeSessionId: string | null = null;

  static delegate: TabDelegate | null = null;

  constructor(
    public readonly conn: Connection,
    public readonly tabId: string,
    root: Splitter,
    public readonly tmuxWindowId: string | null = null,
    public readonly tmuxConnectionId: string | null = null,
    minimizedSessions: Session[] = []
  ) {
    this.api = new Api(conn);
    this._root = root;
    this._minimizedSessions = [...minimizedSessions];
  }

  toString(): string {
    return `<Tab id=${this.tabId} sessions=${this.sessions.length}>`;
  }

  get root(): Splitter {
    return this._root;
  }

  get sessions(): Session[] {
    return this._root.sessions;
  }

  get minimizedSessions(): Session[] {
    return [...this._minimizedSessions];
  }

  get allSessions(): Session[] {
    return [...this.sessions, ...this._minimizedSessions];
  }

  /** The active session in this tab, by id, or null. */
  get currentSession(): Session | null {
    return this.sessions.find((s) => s.sessionId === this.activeSessionId) ?? null;
  }

  updateFrom(other: Tab): void {
    this._root = other._root;
    this._minimizedSessions = [...other._minimizedSessions];
  }

  /** Replace a session reference if the id matches one in this tab. */
  updateSession(session: Session): void {
    if (this._root.updateSession(session)) return;
    const idx = this._minimizedSessions.findIndex(
      (s) => s.sessionId === session.sessionId
    );
    if (idx >= 0) this._minimizedSessions[idx] = session;
  }

  prettyStr(indent = ''): string {
    return `${indent}Tab id=${this.tabId}\n${this._root.prettyStr(indent + '  ')}`;
  }

  async activate(orderWindowFront = true): Promise<void> {
    await this.api.activate({
      tabId: this.tabId,
      selectTab: true,
      orderWindowFront,
    });
  }

  /** Alias kept for parity with the Python API. */
  async select(orderWindowFront = true): Promise<void> {
    return this.activate(orderWindowFront);
  }

  async selectPaneInDirection(direction: NavigationDirection): Promise<string | null> {
    const invocation = invocationString('iterm2.select_pane_in_direction', {
      direction,
    });
    const result = await this.invokeFunction(invocation);
    return typeof result === 'string' ? result : null;
  }

  /**
   * Push the current tree layout (after editing each Session's `preferredSize`).
   */
  async updateLayout(): Promise<void> {
    const res = await this.api.setTabLayout({
      tabId: this.tabId,
      root: this._root.toProto(),
    });
    checkStatus(res.status, 'updateLayout');
  }

  setVariable(name: string, value: unknown): Promise<void> {
    return setScopedVariable(this.api, { tabId: this.tabId }, name, value);
  }

  getVariable(name: string): Promise<unknown> {
    return getScopedVariable(this.api, { tabId: this.tabId }, name);
  }

  close(force = false): Promise<void> {
    return closeTarget(this.api, { tabs: { tabIds: [this.tabId] } }, force);
  }

  async setTitle(title: string): Promise<void> {
    const invocation = invocationString('iterm2.set_title', { title });
    await this.invokeFunction(invocation);
  }

  invokeFunction(invocation: string, timeoutSeconds = -1): Promise<unknown> {
    return invokeFunctionFor(
      this.api,
      { tab: { tabId: this.tabId } },
      invocation,
      timeoutSeconds
    );
  }

  async moveToWindow(): Promise<unknown> {
    const windowId = (await this.invokeFunction('iterm2.move_tab_to_window()')) as string;
    if (!Tab.delegate) throw new Error('Tab.delegate is not set; create an App first');
    const win = await Tab.delegate.tabDelegateGetWindowById(windowId);
    if (!win) throw new RPCException(`No such window ${windowId}`);
    return win;
  }
}
