/**
 * App — port of `iterm2/app.py`. Singleton root that holds all Windows,
 * keeps itself in sync via notification subscriptions, and serves as the
 * delegate for Session/Tab/Window lookups.
 */

import type { Connection } from './connection';
import { Api } from './api';
import { Session, type SessionDelegate, RPCException } from './session';
import { Tab, type TabDelegate } from './tab';
import { Window, type WindowDelegate } from './window';
import type { iterm2 } from './generated/api';
import {
  subscribeToNewSessionNotification,
  subscribeToTerminateSessionNotification,
  subscribeToLayoutChangeNotification,
  subscribeToFocusChangeNotification,
  subscribeToBroadcastDomainsChangeNotification,
  type SubscriptionToken,
} from './notifications';

let instance: App | null = null;

/**
 * The classic entry point. Returns the singleton App for `connection`,
 * creating it (and starting layout/focus tracking) on first call.
 */
export async function getApp(
  connection: Connection,
  createIfNeeded = true
): Promise<App | null> {
  if (instance == null) {
    if (!createIfNeeded) return null;
    instance = await App._construct(connection);
    connection.once('close', () => {
      instance = null;
    });
  } else {
    await instance.refresh();
  }
  return instance;
}

export class App
  implements SessionDelegate, TabDelegate, WindowDelegate
{
  readonly api: Api;
  private _windows: Window[];
  private _buriedSessions: Session[];
  private _broadcastDomains: iterm2.BroadcastDomain.$Properties[] = [];
  private _tokens: SubscriptionToken<unknown>[] = [];

  appActive: boolean | null = null;
  currentTerminalWindowId: string | null = null;

  private constructor(
    public readonly conn: Connection,
    windows: Window[],
    buriedSessions: Session[]
  ) {
    this.api = new Api(conn);
    this._windows = windows;
    this._buriedSessions = buriedSessions;
  }

  /** Don't call directly — use `getApp(conn)`. */
  static async _construct(conn: Connection): Promise<App> {
    const api = new Api(conn);
    const res = await api.listSessions({});
    const windows = App._windowsFromListSessions(conn, res);
    const buried = App._buriedFromListSessions(conn, res);
    const app = new App(conn, windows, buried);

    Session.delegate = app;
    Tab.delegate = app;
    Window.delegate = app;
    Window.delegateFactory = async () => app;

    await app._listen();
    await app.refreshFocus();
    await app.refreshBroadcastDomains();
    return app;
  }

  // ----- public API ------------------------------------------------------

  get windows(): Window[] {
    return this._windows;
  }
  get terminalWindows(): Window[] {
    return this._windows;
  }
  get buriedSessions(): Session[] {
    return this._buriedSessions;
  }
  get broadcastDomains(): iterm2.BroadcastDomain.$Properties[] {
    return this._broadcastDomains;
  }

  get currentWindow(): Window | null {
    if (this.currentTerminalWindowId == null) return null;
    return this.getWindowById(this.currentTerminalWindowId);
  }

  prettyStr(): string {
    return this._windows.map((w) => w.prettyStr('')).join('\n');
  }

  /** Re-list and reconcile. Usually unnecessary — kept fresh by notifs. */
  async refresh(): Promise<void> {
    const res = await this.api.listSessions({});
    await this._handleLayoutChange(res);
  }

  async refreshFocus(): Promise<void> {
    const res = await this.api.focus({});
    for (const notif of res.notifications ?? []) {
      await this._focusChange(notif);
    }
  }

  async refreshBroadcastDomains(): Promise<void> {
    const res = await this.api.getBroadcastDomains({});
    this._broadcastDomains = res.broadcastDomains ?? [];
  }

  async activate(raiseAllWindows = true, ignoringOtherApps = false): Promise<void> {
    await this.api.activate({
      activateApp: {
        raiseAllWindows,
        ignoringOtherApps,
      },
    });
  }

  getSessionById(sessionId: string, includeBuried = true): Session | null {
    if (sessionId === 'active') return Session.activeProxy(this.conn);
    if (sessionId === 'all') return Session.allProxy(this.conn);
    for (const w of this._windows) {
      for (const t of w.tabs) {
        for (const s of t.allSessions) {
          if (s.sessionId === sessionId) return s;
        }
      }
    }
    if (includeBuried) {
      for (const s of this._buriedSessions) {
        if (s.sessionId === sessionId) return s;
      }
    }
    return null;
  }

  getTabById(tabId: string): Tab | null {
    for (const w of this._windows) {
      for (const t of w.tabs) {
        if (t.tabId === tabId) return t;
      }
    }
    return null;
  }

  getWindowById(windowId: string): Window | null {
    return this._windows.find((w) => w.windowId === windowId) ?? null;
  }

  getWindowForTab(tabId: string): Window | null {
    for (const w of this._windows) {
      if (w.tabs.some((t) => t.tabId === tabId)) return w;
    }
    return null;
  }

  getWindowAndTabForSession(session: Session): [Window | null, Tab | null] {
    for (const w of this._windows) {
      for (const t of w.tabs) {
        if (t.allSessions.some((s) => s.sessionId === session.sessionId)) {
          return [w, t];
        }
      }
    }
    return [null, null];
  }

  async setVariable(name: string, value: unknown): Promise<void> {
    const res = await this.api.variable({
      app: true,
      set: [{ name, value: JSON.stringify(value) }],
    });
    if ((res.status ?? 0) !== 0) {
      throw new RPCException(`setVariable failed (status=${res.status})`);
    }
  }

  async getVariable(name: string): Promise<unknown> {
    const res = await this.api.variable({ app: true, get: [name] });
    if ((res.status ?? 0) !== 0) {
      throw new RPCException(`getVariable failed (status=${res.status})`);
    }
    const raw = res.values?.[0];
    return raw == null || raw === '' ? null : JSON.parse(raw);
  }

  async getTheme(): Promise<string[]> {
    const v = (await this.getVariable('effectiveTheme')) as string;
    return v ? v.split(' ') : [];
  }

  // ----- SessionDelegate -------------------------------------------------

  sessionDelegateGetTab(session: Session): Tab | null {
    const [, tab] = this.getWindowAndTabForSession(session);
    return tab;
  }
  sessionDelegateGetWindow(session: Session): Window | null {
    const [win] = this.getWindowAndTabForSession(session);
    return win;
  }
  async sessionDelegateCreateSession(sessionId: string): Promise<Session | null> {
    await this.refresh();
    return this.getSessionById(sessionId);
  }

  // ----- TabDelegate -----------------------------------------------------

  tabDelegateGetWindow(tab: Tab): Window | null {
    return this.getWindowForTab(tab.tabId);
  }
  async tabDelegateGetWindowById(windowId: string): Promise<Window | null> {
    await this.refresh();
    return this.getWindowById(windowId);
  }

  // ----- WindowDelegate --------------------------------------------------

  async windowDelegateGetWindowBySessionId(sessionId: string): Promise<Window | null> {
    await this.refresh();
    const s = this.getSessionById(sessionId);
    if (!s) return null;
    const [w] = this.getWindowAndTabForSession(s);
    return w;
  }

  async windowDelegateGetTabById(tabId: string): Promise<Tab | null> {
    await this.refresh();
    return this.getTabById(tabId);
  }

  async windowDelegateGetTabBySessionId(sessionId: string): Promise<Tab | null> {
    await this.refresh();
    const s = this.getSessionById(sessionId);
    if (!s) return null;
    const [, t] = this.getWindowAndTabForSession(s);
    return t;
  }

  // ----- internal --------------------------------------------------------

  private async _listen(): Promise<void> {
    const c = this.conn;
    const refresh = async () => { await this.refresh(); };
    this._tokens.push((await subscribeToNewSessionNotification(c, refresh)) as SubscriptionToken<unknown>);
    this._tokens.push(
      (await subscribeToTerminateSessionNotification(c, refresh)) as SubscriptionToken<unknown>
    );
    this._tokens.push(
      (await subscribeToLayoutChangeNotification(c, refresh)) as SubscriptionToken<unknown>
    );
    this._tokens.push(
      (await subscribeToFocusChangeNotification(c, async (_conn, notif) =>
        this._focusChange(notif)
      )) as SubscriptionToken<unknown>
    );
    this._tokens.push(
      (await subscribeToBroadcastDomainsChangeNotification(c, async (_conn, notif) => {
        this._broadcastDomains = notif.broadcastDomains ?? [];
      })) as SubscriptionToken<unknown>
    );
  }

  private static _windowsFromListSessions(
    conn: Connection,
    response: iterm2.ListSessionsResponse.$Properties
  ): Window[] {
    return (response.windows ?? [])
      .map((w) => Window.createFromProto(conn, w))
      .filter((w): w is Window => w != null);
  }

  private static _buriedFromListSessions(
    conn: Connection,
    response: iterm2.ListSessionsResponse.$Properties
  ): Session[] {
    return (response.buriedSessions ?? []).map((s) =>
      Session.fromSummary(conn, s)
    );
  }

  private async _handleLayoutChange(
    response: iterm2.ListSessionsResponse.$Properties
  ): Promise<void> {
    const newWindows = App._windowsFromListSessions(this.conn, response);

    const windows: Window[] = [];
    const seenWindowIds = new Set<string>();
    for (const nw of newWindows) {
      for (const nt of nw.tabs) {
        for (const ns of nt.allSessions) {
          const old = this.getSessionById(ns.sessionId);
          if (old) {
            old.updateFrom(ns);
            nt.updateSession(old);
          }
        }
        const oldTab = this.getTabById(nt.tabId);
        if (oldTab) {
          oldTab.updateFrom(nt);
          nw.updateTab(oldTab);
        }
      }
      if (!seenWindowIds.has(nw.windowId)) {
        seenWindowIds.add(nw.windowId);
        const oldWindow = this.getWindowById(nw.windowId);
        if (oldWindow) {
          oldWindow.updateFrom(nw);
          windows.push(oldWindow);
        } else {
          windows.push(nw);
        }
      }
    }

    const allNewSessions: Session[] = [];
    for (const w of windows) for (const t of w.tabs) allNewSessions.push(...t.allSessions);

    const buriedSummaries = response.buriedSessions ?? [];
    this._buriedSessions = buriedSummaries.map((summary) => {
      const id = summary.uniqueIdentifier ?? '';
      const fromNew = allNewSessions.find((s) => s.sessionId === id);
      if (fromNew) return fromNew;
      const fromOld = this._buriedSessions.find((s) => s.sessionId === id);
      if (fromOld) return fromOld;
      return Session.fromSummary(this.conn, summary);
    });

    this._windows = windows;
    await this.refreshFocus();
  }

  private async _focusChange(
    notif: iterm2.FocusChangedNotification.$Properties
  ): Promise<void> {
    if (notif.applicationActive != null) {
      this.appActive = !!notif.applicationActive;
    } else if (notif.window) {
      const TERMINAL_WINDOW_RESIGNED_KEY = 2;
      if (notif.window.windowStatus !== TERMINAL_WINDOW_RESIGNED_KEY) {
        this.currentTerminalWindowId = notif.window.windowId ?? null;
      }
    } else if (notif.selectedTab) {
      const window = this.getWindowForTab(notif.selectedTab);
      if (!window) {
        await this.refresh();
      } else {
        window.selectedTabId = notif.selectedTab;
      }
    } else if (notif.session) {
      const session = this.getSessionById(notif.session);
      if (!session) {
        await this.refresh();
      } else {
        const [, tab] = this.getWindowAndTabForSession(session);
        if (!tab) await this.refresh();
        else tab.activeSessionId = notif.session;
      }
    }
  }
}
