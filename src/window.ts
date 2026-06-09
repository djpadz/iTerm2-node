/**
 * Window — port of `iterm2/window.py`. Owns a list of Tabs.
 */

import type { Connection } from './connection';
import { Api } from './api';
import { Session, Splitter, RPCException } from './session';
import { Tab } from './tab';
import { Frame, Point, Size, invocationString } from './util';
import type { iterm2 } from './generated/api';

export class CreateTabException extends Error {
  constructor(message: string) { super(message); this.name = 'CreateTabException'; }
}
export class CreateWindowException extends Error {
  constructor(message: string) { super(message); this.name = 'CreateWindowException'; }
}
export class SetPropertyException extends Error {
  constructor(message: string) { super(message); this.name = 'SetPropertyException'; }
}
export class GetPropertyException extends Error {
  constructor(message: string) { super(message); this.name = 'GetPropertyException'; }
}

const STATUS_OK = 0;
function checkStatus(status: number | null | undefined, label: string): void {
  if ((status ?? 0) !== STATUS_OK) {
    throw new RPCException(`${label} failed (status=${status})`);
  }
}

export interface WindowDelegate {
  windowDelegateGetWindowBySessionId(sessionId: string): Promise<Window | null>;
  windowDelegateGetTabById(tabId: string): Promise<Tab | null>;
  windowDelegateGetTabBySessionId(sessionId: string): Promise<Tab | null>;
}

export class Window {
  readonly api: Api;
  private _tabs: Tab[];
  private _frame: Frame | null;

  static delegate: WindowDelegate | null = null;

  /** Lazy factory installed by App so create() works even before App init. */
  static delegateFactory: ((conn: Connection) => Promise<WindowDelegate>) | null = null;

  selectedTabId: string | null = null;

  constructor(
    public readonly conn: Connection,
    public readonly windowId: string,
    tabs: Tab[],
    frame: iterm2.Frame.$Properties | Frame | null,
    public readonly windowNumber: number
  ) {
    this.api = new Api(conn);
    this._tabs = [...tabs];
    if (frame instanceof Frame || frame == null) {
      this._frame = frame ?? null;
    } else {
      this._frame = new Frame(
        new Point(frame.origin?.x ?? 0, frame.origin?.y ?? 0),
        new Size(frame.size?.width ?? 0, frame.size?.height ?? 0)
      );
    }
  }

  toString(): string {
    return `<Window id=${this.windowId} tabs=${this._tabs.length}>`;
  }

  get tabs(): Tab[] {
    return [...this._tabs];
  }

  get frame(): Frame | null {
    return this._frame;
  }

  get currentTab(): Tab | null {
    return this._tabs.find((t) => t.tabId === this.selectedTabId) ?? null;
  }

  updateFrom(other: Window): void {
    this._tabs = [...other._tabs];
    this._frame = other._frame;
  }

  updateTab(tab: Tab): void {
    const i = this._tabs.findIndex((t) => t.tabId === tab.tabId);
    if (i >= 0) this._tabs[i] = tab;
  }

  prettyStr(indent = ''): string {
    const lines = [`${indent}Window id=${this.windowId}`];
    for (const t of this._tabs) lines.push(t.prettyStr(indent + '  '));
    return lines.join('\n');
  }

  // ----- construction --------------------------------------------------

  static createFromProto(conn: Connection, proto: iterm2.ListSessionsResponse.Window.$Properties): Window | null {
    const tabs: Tab[] = [];
    for (const tab of proto.tabs ?? []) {
      const root = tab.root ? Splitter.fromNode(tab.root, conn) : new Splitter(false);
      const minimized = (tab.minimizedSessions ?? []).map((s: iterm2.SessionSummary.$Properties) =>
        Session.fromSummary(conn, s)
      );
      tabs.push(
        new Tab(
          conn,
          tab.tabId ?? '',
          root,
          tab.tmuxWindowId ?? null,
          tab.tmuxConnectionId ?? null,
          minimized
        )
      );
    }
    if (tabs.length === 0) return null;
    return new Window(conn, proto.windowId ?? '', tabs, proto.frame ?? null, proto.number ?? 0);
  }

  static async create(
    conn: Connection,
    opts: {
      profile?: string;
      command?: string;
      profileCustomizations?: Record<string, string>;
    } = {}
  ): Promise<Window | null> {
    let customizations: Record<string, string> | undefined;
    if (opts.command != null) {
      customizations = {
        'Custom Command': '"Yes"',
        Command: JSON.stringify(opts.command),
      };
    } else if (opts.profileCustomizations) {
      customizations = opts.profileCustomizations;
    }

    const api = new Api(conn);
    const res = await api.createTab({
      profileName: opts.profile ?? '',
      customProfileProperties: customizations
        ? Object.entries(customizations).map(([key, jsonValue]) => ({ key, jsonValue }))
        : [],
    });
    checkStatus(res.status, 'createWindow');

    if (!Window.delegate && Window.delegateFactory) {
      Window.delegate = await Window.delegateFactory(conn);
    }
    if (Window.delegate) {
      return Window.delegate.windowDelegateGetWindowBySessionId(res.sessionId ?? '');
    }
    return Window._loadById(conn, res.windowId ?? '');
  }

  private static async _loadById(conn: Connection, windowId: string): Promise<Window | null> {
    const api = new Api(conn);
    const res = await api.listSessions({});
    for (const win of res.windows ?? []) {
      if (win.windowId === windowId) {
        return Window.createFromProto(conn, win);
      }
    }
    return null;
  }

  // ----- RPCs ----------------------------------------------------------

  async setTabs(tabs: Tab[]): Promise<void> {
    await this.api.reorderTabs({
      assignments: [{ windowId: this.windowId, tabIds: tabs.map((t) => t.tabId) }],
    });
  }

  async createTab(
    opts: {
      profile?: string;
      command?: string;
      index?: number;
      profileCustomizations?: Record<string, string>;
    } = {}
  ): Promise<Tab | null> {
    let customizations: Record<string, string> | undefined;
    if (opts.command != null) {
      customizations = {
        'Custom Command': '"Yes"',
        Command: JSON.stringify(opts.command),
      };
    } else if (opts.profileCustomizations) {
      customizations = opts.profileCustomizations;
    }
    const res = await this.api.createTab({
      windowId: this.windowId,
      profileName: opts.profile ?? '',
      tabIndex: opts.index,
      customProfileProperties: customizations
        ? Object.entries(customizations).map(([key, jsonValue]) => ({ key, jsonValue }))
        : [],
    });
    checkStatus(res.status, 'createTab');
    if (!Window.delegate) throw new Error('Window.delegate not set; create an App first');
    return Window.delegate.windowDelegateGetTabBySessionId(res.sessionId ?? '');
  }

  async getFrame(): Promise<Frame> {
    const res = await this.api.getProperty({
      name: 'frame',
      windowId: this.windowId,
    });
    checkStatus(res.status, 'getFrame');
    const dict = JSON.parse(res.jsonValue ?? '{}') as {
      origin: { x: number; y: number };
      size: { width: number; height: number };
    };
    return new Frame(
      new Point(dict.origin.x, dict.origin.y),
      new Size(dict.size.width, dict.size.height)
    );
  }

  async setFrame(frame: Frame): Promise<void> {
    const res = await this.api.setProperty({
      name: 'frame',
      jsonValue: frame.json,
      windowId: this.windowId,
    });
    checkStatus(res.status, 'setFrame');
  }

  async getFullscreen(): Promise<boolean> {
    const res = await this.api.getProperty({
      name: 'fullscreen',
      windowId: this.windowId,
    });
    checkStatus(res.status, 'getFullscreen');
    return JSON.parse(res.jsonValue ?? 'false') as boolean;
  }

  async setFullscreen(fullscreen: boolean): Promise<void> {
    const res = await this.api.setProperty({
      name: 'fullscreen',
      jsonValue: JSON.stringify(fullscreen),
      windowId: this.windowId,
    });
    checkStatus(res.status, 'setFullscreen');
  }

  async activate(): Promise<void> {
    await this.api.activate({
      windowId: this.windowId,
      orderWindowFront: true,
    });
  }

  async close(force = false): Promise<void> {
    const res = await this.api.closeRequest({
      windows: { windowIds: [this.windowId] },
      force,
    });
    const status = res.statuses?.[0] ?? STATUS_OK;
    checkStatus(status, 'close');
  }

  async setVariable(name: string, value: unknown): Promise<void> {
    const res = await this.api.variable({
      windowId: this.windowId,
      set: [{ name, value: JSON.stringify(value) }],
    });
    checkStatus(res.status, 'setVariable');
  }

  async getVariable(name: string): Promise<unknown> {
    const res = await this.api.variable({
      windowId: this.windowId,
      get: [name],
    });
    checkStatus(res.status, 'getVariable');
    const raw = res.values?.[0];
    return raw == null || raw === '' ? null : JSON.parse(raw);
  }

  async setTitle(title: string): Promise<void> {
    const invocation = invocationString('iterm2.set_title', { title });
    await this.invokeFunction(invocation);
  }

  async invokeFunction(invocation: string, timeoutSeconds = -1): Promise<unknown> {
    const res = await this.api.invokeFunction({
      invocation,
      window: { windowId: this.windowId },
      timeout: timeoutSeconds,
    });
    if (res.error) {
      throw new RPCException(
        `invokeFunction: status=${res.error.status} ${res.error.errorReason ?? ''}`
      );
    }
    return res.success?.jsonResult ? JSON.parse(res.success.jsonResult) : null;
  }

  async saveWindowAsArrangement(name: string): Promise<void> {
    const res = await this.api.savedArrangement({
      action: 1 /* SAVE */ as iterm2.SavedArrangementRequest.Action,
      name,
      windowId: this.windowId,
    });
    checkStatus(res.status, 'saveArrangement');
  }

  async restoreWindowArrangement(name: string): Promise<void> {
    const res = await this.api.savedArrangement({
      action: 2 /* RESTORE */ as iterm2.SavedArrangementRequest.Action,
      name,
      windowId: this.windowId,
    });
    checkStatus(res.status, 'restoreArrangement');
  }
}
