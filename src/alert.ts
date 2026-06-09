/**
 * Alert — port of `iterm2/alert.py`. Modal alert dialogs and text-input
 * prompts.
 */

import type { Connection } from './connection';
import { Api } from './api';
import { RPCException } from './session';

/**
 * Invoke a top-level (app-scoped) iTerm2 function. Mirrors Python's
 * `iterm2.async_invoke_function` with no session/tab/window receiver.
 */
async function invokeAppFunction(
  connection: Connection,
  invocation: string,
  timeoutSeconds = -1
): Promise<unknown> {
  const api = new Api(connection);
  const res = await api.invokeFunction({
    invocation,
    app: {},
    timeout: timeoutSeconds,
  });
  if (res.error) {
    throw new RPCException(
      `invokeFunction: status=${res.error.status} ${res.error.errorReason ?? ''}`
    );
  }
  if (res.success) {
    return res.success.jsonResult ? JSON.parse(res.success.jsonResult) : null;
  }
  return null;
}

/**
 * A modal alert.
 *
 * - `title`    — shown in bold at the top.
 * - `subtitle` — informative text (may be multi-line).
 * - `windowId` — window to attach to. If null, the alert is app-modal.
 */
export class Alert {
  private _buttons: string[] = [];

  constructor(
    private _title: string,
    private _subtitle: string,
    private _windowId: string | null = null
  ) {}

  get title(): string {
    return this._title;
  }

  get subtitle(): string {
    return this._subtitle;
  }

  get windowId(): string | null {
    return this._windowId;
  }

  /** Append a button to the alert. */
  addButton(title: string): void {
    this._buttons.push(title);
  }

  /**
   * Show the modal alert.
   *
   * Returns the (1000 + index) of the selected button. If no buttons were
   * added, iTerm2 will show a default "OK" button.
   */
  async run(connection: Connection): Promise<number> {
    const title = JSON.stringify(this._title);
    const subtitle = JSON.stringify(this._subtitle);
    const buttons = JSON.stringify(this._buttons);
    const windowId = JSON.stringify(this._windowId);
    const invocation =
      `iterm2.alert(title: ${title}, ` +
      `subtitle: ${subtitle}, ` +
      `buttons: ${buttons}, ` +
      `window_id: ${windowId})`;
    const result = await invokeAppFunction(connection, invocation);
    return result as number;
  }
}

/**
 * A modal alert with a text input accessory.
 */
export class TextInputAlert {
  constructor(
    private _title: string,
    private _subtitle: string,
    private _placeholder: string,
    private _defaultValue: string,
    private _windowId: string | null = null
  ) {}

  get title(): string {
    return this._title;
  }

  get subtitle(): string {
    return this._subtitle;
  }

  get placeholder(): string {
    return this._placeholder;
  }

  get defaultValue(): string {
    return this._defaultValue;
  }

  get windowId(): string | null {
    return this._windowId;
  }

  /**
   * Show the modal alert.
   *
   * Returns the string entered, or null if the alert was canceled.
   */
  async run(connection: Connection): Promise<string | null> {
    const title = JSON.stringify(this._title);
    const subtitle = JSON.stringify(this._subtitle);
    const placeholder = JSON.stringify(this._placeholder);
    const defaultValue = JSON.stringify(this._defaultValue);
    const windowId = JSON.stringify(this._windowId);
    const invocation =
      `iterm2.get_string(title: ${title}, ` +
      `subtitle: ${subtitle}, ` +
      `placeholder: ${placeholder}, ` +
      `defaultValue: ${defaultValue}, ` +
      `window_id: ${windowId})`;
    const result = await invokeAppFunction(connection, invocation);
    return result == null ? null : (result as string);
  }
}
