/**
 * Capabilities — port of `iterm2/capabilities.py`.
 *
 * Helpers to determine which features are available on the currently
 * connected iTerm2 app, based on its API protocol version.
 */

import type { Connection } from './connection';

export class AppVersionTooOld extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppVersionTooOld';
  }
}

export type Version = [number, number];

/** Returns whether `a >= b` (compare major, then minor). */
export function ge(a: Version, b: Version): boolean {
  if (a[0] > b[0]) return true;
  if (a[0] < b[0]) return false;
  return a[1] >= b[1];
}

export function supportsMultipleSetProfileProperties(conn: Connection): boolean {
  return ge(conn.protocolVersion, [0, 69]);
}

export function supportsSelectPaneInDirection(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 0]);
}

export function supportsPromptMonitorModes(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 1]);
}

export function supportsStatusBarUnreadCount(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 2]);
}

export function supportsCoprocesses(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 3]);
}

export function checkSupportsCoprocesses(conn: Connection): void {
  if (!supportsCoprocesses(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to control coprocesses from a ' +
        'script. You should upgrade to run this script.'
    );
  }
}

export function supportsGetDefaultProfile(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 4]);
}

export function checkSupportsGetDefaultProfile(conn: Connection): void {
  if (!supportsGetDefaultProfile(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to get the default profile from ' +
        'a script. You should upgrade to run this script.'
    );
  }
}

export function supportsPromptId(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 5]);
}

export function checkSupportsPromptId(conn: Connection): void {
  if (!supportsPromptId(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to fetch a list of prompts or ' +
        'get a prompt by ID from a script. You should upgrade to run this script.'
    );
  }
}

export function supportsListSavedArrangements(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 6]);
}

export function checkSupportsListSavedArrangements(conn: Connection): void {
  if (!supportsListSavedArrangements(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to list saved arrangements from ' +
        'a script. You should upgrade to run this script.'
    );
  }
}

export function supportsContextMenuProviders(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 7]);
}

export function checkSupportsContextMenuProvider(conn: Connection): void {
  if (!supportsContextMenuProviders(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to register a context menu ' +
        'provider. You should upgrade to run this script.'
    );
  }
}

export function supportsAddAnnotation(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 8]);
}

export function checkSupportsAddAnnotation(conn: Connection): void {
  if (!supportsAddAnnotation(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to add an annotation. ' +
        'You should upgrade to run this script.'
    );
  }
}

export function supportsAdvancedKeyNotifications(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 9]);
}

export function checkSupportsAdvancedKeyNotifications(conn: Connection): void {
  if (!supportsAdvancedKeyNotifications(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to get advanced keystroke ' +
        'notifications. You should upgrade to run this script.'
    );
  }
}

export function supportsFilePanels(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 10]);
}

export function checkSupportsFilePanels(conn: Connection): void {
  if (!supportsFilePanels(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to use open/save panels. ' +
        'You should upgrade to run this script.'
    );
  }
}

export function supportsMoveSession(conn: Connection): boolean {
  return ge(conn.protocolVersion, [1, 11]);
}

export function checkSupportsMoveSession(conn: Connection): void {
  if (!supportsMoveSession(conn)) {
    throw new AppVersionTooOld(
      'This version of iTerm2 is too old to move sessions to split panes. ' +
        'You should upgrade to run this script.'
    );
  }
}
