/**
 * Arrangement — port of `iterm2/arrangement.py`. Save/restore/list
 * named window arrangements.
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import { checkSupportsListSavedArrangements } from './capabilities';

export class SavedArrangementException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SavedArrangementException';
  }
}

// SavedArrangementResponse.Status.OK
const STATUS_OK = 0;

const ACTION_RESTORE = 0 as iterm2.SavedArrangementRequest.Action;
const ACTION_SAVE = 1 as iterm2.SavedArrangementRequest.Action;
const ACTION_LIST = 2 as iterm2.SavedArrangementRequest.Action;

function checkStatus(status: number | null | undefined): void {
  if ((status ?? 0) !== STATUS_OK) {
    throw new SavedArrangementException(`status=${status ?? 0}`);
  }
}

/**
 * Provides access to saved arrangements.
 */
export class Arrangement {
  /**
   * Save all windows as a new arrangement. Replaces an existing arrangement
   * with the same name.
   */
  static async save(connection: Connection, name: string): Promise<void> {
    const api = new Api(connection);
    const res = await api.savedArrangement({
      name,
      action: ACTION_SAVE,
    });
    checkStatus(res.status);
  }

  /**
   * Restore a saved window arrangement.
   *
   * If `windowId` is given, restore as tabs in that window; otherwise
   * restore as new windows.
   */
  static async restore(
    connection: Connection,
    name: string,
    windowId: string | null = null
  ): Promise<void> {
    const api = new Api(connection);
    const req: iterm2.SavedArrangementRequest.$Properties = {
      name,
      action: ACTION_RESTORE,
    };
    if (windowId != null) req.windowId = windowId;
    const res = await api.savedArrangement(req);
    checkStatus(res.status);
  }

  /**
   * Fetch a list of saved arrangement names.
   *
   * NOTE: requires iTerm2 version 3.4.0 or later.
   */
  static async list(connection: Connection): Promise<string[]> {
    checkSupportsListSavedArrangements(connection);
    const api = new Api(connection);
    const res = await api.savedArrangement({ action: ACTION_LIST });
    checkStatus(res.status);
    return res.names ?? [];
  }
}
