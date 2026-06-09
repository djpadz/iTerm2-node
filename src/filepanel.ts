/**
 * OpenPanel / SavePanel — port of `iterm2/filepanel.py`. Shows NSOpenPanel /
 * NSSavePanel dialogs by invoking the built-in `iterm2.open_panel` and
 * `iterm2.save_panel` functions on the app.
 */

import type { Connection } from './connection';
import { Api } from './api';
import { RPCException } from './session';

/**
 * Result of a successful Open panel — array of selected file paths.
 */
export class OpenPanelResult {
  constructor(public readonly files: string[]) {}
}

/**
 * Result of a successful Save panel — the selected destination path.
 */
export class SavePanelResult {
  constructor(public readonly file: string) {}
}

function bitmap(options: number[]): number {
  // Sum (rather than OR) so flags above bit 30 work — JS bitwise ops are 32-bit.
  return options.reduce((acc, v) => acc + v, 0);
}

async function invokeAppFunction(
  conn: Connection,
  invocation: string
): Promise<unknown> {
  const api = new Api(conn);
  const res = await api.invokeFunction({
    invocation,
    app: {},
    timeout: -1,
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
 * Shows an NSOpenPanel via iTerm2. Requires iTerm2 3.5.0beta6 or later.
 *
 * Configure via the public fields, then call `run(conn)`. Returns an
 * `OpenPanelResult` on OK, or `null` if the user cancelled.
 */
export class OpenPanel {
  /** Initial directory. */
  path: string | null = null;
  /** Bit flags from `OpenPanel.Options`. Defaults to `[CAN_CHOOSE_FILES]`. */
  options: OpenPanel.Options[] = [OpenPanel.Options.CAN_CHOOSE_FILES];
  /** Allowed file extensions (e.g. ["txt", "rtf"]). */
  extensions: string[] | null = null;
  /** Text for the OK button. */
  prompt: string | null = null;
  /** Panel title text. */
  message: string | null = null;

  /**
   * Show the panel.
   * @returns An `OpenPanel.Result` on success, or `null` if cancelled.
   */
  async run(conn: Connection): Promise<OpenPanel.Result | null> {
    const bits = bitmap(this.options as number[]);
    const invocation =
      `iterm2.open_panel(path: ${JSON.stringify(this.path)}, ` +
      `options: ${bits},` +
      `extensions: ${JSON.stringify(this.extensions)},` +
      `prompt: ${JSON.stringify(this.prompt)},` +
      `message: ${JSON.stringify(this.message)})`;
    const response = await invokeAppFunction(conn, invocation);
    if (response) {
      return new OpenPanelResult(response as string[]);
    }
    return null;
  }
}

export namespace OpenPanel {
  /** Bit flags controlling the Open panel. Combine multiple in `options`. */
  export enum Options {
    CAN_CREATE_DIRECTORIES = 1,
    TREATS_FILE_PACKAGES_AS_DIRECTORIES = 1 << 1,
    SHOWS_HIDDEN_FILES = 1 << 2,
    // Bits 32+ exceed the 32-bit JS bitwise range, so encode as numbers.
    RESOLVES_ALIASES = 0x100000000,
    CAN_CHOOSE_DIRECTORIES = 0x200000000,
    ALLOWS_MULTIPLE_SELECTION = 0x400000000,
    CAN_CHOOSE_FILES = 0x800000000,
  }

  export type Result = OpenPanelResult;
}

/**
 * Shows an NSSavePanel via iTerm2. Requires iTerm2 3.5.0beta6 or later.
 *
 * Configure via the public fields, then call `run(conn)`. Returns a
 * `SavePanelResult` on OK, or `null` if the user cancelled.
 */
export class SavePanel {
  /** Initial directory. */
  path: string | null = null;
  /** Bit flags from `SavePanel.Options`. Defaults to `[]`. */
  options: SavePanel.Options[] = [];
  /** Allowed file extensions. */
  extensions: string[] | null = null;
  /** Text for the OK button. */
  prompt: string | null = null;
  /** Panel title text. */
  title: string | null = null;
  /** Subtitle text. */
  message: string | null = null;
  /** Text before the filename field. */
  nameFieldLabel: string | null = null;
  /** Pre-fill the filename field with this value. */
  defaultFilename: string | null = null;

  /**
   * Show the panel.
   * @returns A `SavePanel.Result` on success, or `null` if cancelled.
   */
  async run(conn: Connection): Promise<SavePanel.Result | null> {
    const bits = bitmap(this.options as number[]);
    const invocation =
      `iterm2.save_panel(path: ${JSON.stringify(this.path)}, ` +
      `options: ${bits},` +
      `extensions: ${JSON.stringify(this.extensions)},` +
      `prompt: ${JSON.stringify(this.prompt)},` +
      `title: ${JSON.stringify(this.title)},` +
      `message: ${JSON.stringify(this.message)},` +
      `name_field_label: ${JSON.stringify(this.nameFieldLabel)},` +
      `default_filename: ${JSON.stringify(this.defaultFilename)})`;
    const response = await invokeAppFunction(conn, invocation);
    if (response) {
      return new SavePanelResult(response as string);
    }
    return null;
  }
}

export namespace SavePanel {
  /** Bit flags controlling the Save panel. Combine multiple in `options`. */
  export enum Options {
    CAN_CREATE_DIRECTORIES = 1,
    TREATS_FILE_PACKAGES_AS_DIRECTORIES = 1 << 1,
    SHOWS_HIDDEN_FILES = 1 << 2,
    ALLOWS_OTHER_FILE_TYPES = 1 << 3,
    CAN_SELECT_HIDDEN_EXTENSION = 1 << 4,
    EXTENSION_HIDDEN = 1 << 5,
  }

  export type Result = SavePanelResult;
}
