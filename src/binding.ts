/**
 * Key binding model + global key-binding RPCs — port of `iterm2/binding.py`.
 *
 * Exposes:
 *  - `BindingAction` enum of all known actions.
 *  - `PasteConfiguration`, `MoveSelectionUnit`, `SnippetIdentifier`: parameter
 *    types for the various actions.
 *  - `KeyBinding`: a complete (key, modifiers, action, param) tuple.
 *  - `decodeKeyBinding` / `parseBindingParam`: helpers used when reading a
 *    profile's `Keyboard Map`.
 *  - `getGlobalKeyBindings` / `setGlobalKeyBindings`: read and write the
 *    global Preferences > Keys map.
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import { Keycode, Modifier, ModifierUtil } from './keyboard';
import { MenuItemIdentifier } from './mainmenu';
import { RPCException } from './session';

// ---------------------------------------------------------------------------
// PasteConfiguration
// ---------------------------------------------------------------------------

export enum PasteTabTransform {
  NONE = 0,
  CONVERT_TO_SPACES = 1,
  ESCAPE_WITH_CONTROL_V = 2,
}

/** Configuration parameters for a paste-special action. */
export class PasteConfiguration {
  base64: boolean;
  waitForPrompts: boolean;
  tabTransform: PasteTabTransform;
  tabStopSize: number;
  delay: number;
  chunkSize: number;
  convertNewlines: boolean;
  removeNewlines: boolean;
  convertUnicodePunctuation: boolean;
  escapeForShell: boolean;
  removeControls: boolean;
  bracketAllowed: boolean;
  useRegexSubstitution: boolean;
  regex: string;
  substitution: string;

  constructor(init: Partial<PasteConfiguration> = {}) {
    this.base64 = init.base64 ?? false;
    this.waitForPrompts = init.waitForPrompts ?? false;
    this.tabTransform = init.tabTransform ?? PasteTabTransform.NONE;
    // Note: python uses `False` here, which evaluates to 0. Mirror that.
    this.tabStopSize = init.tabStopSize ?? 0;
    this.delay = init.delay ?? 0.01;
    this.chunkSize = init.chunkSize ?? 1024;
    this.convertNewlines = init.convertNewlines ?? false;
    this.removeNewlines = init.removeNewlines ?? false;
    this.convertUnicodePunctuation = init.convertUnicodePunctuation ?? false;
    this.escapeForShell = init.escapeForShell ?? false;
    this.removeControls = init.removeControls ?? false;
    this.bracketAllowed = init.bracketAllowed ?? true;
    this.useRegexSubstitution = init.useRegexSubstitution ?? false;
    this.regex = init.regex ?? '';
    this.substitution = init.substitution ?? '';
  }

  /** Decode the JSON payload stored in a key binding's "Text" field. */
  static decode(param: string | null | undefined): PasteConfiguration {
    if (!param) return new PasteConfiguration();
    const root = JSON.parse(param) as Record<string, unknown>;
    return new PasteConfiguration({
      base64: !!root['Base64'],
      waitForPrompts: !!root['WaitForPrompts'],
      tabTransform: (root['TabTransform'] as number) ?? PasteTabTransform.NONE,
      tabStopSize: (root['TabStopSize'] as number) ?? 0,
      delay: (root['Delay'] as number) ?? 0.01,
      chunkSize: (root['ChunkSize'] as number) ?? 1024,
      convertNewlines: !!root['ConvertNewlines'],
      removeNewlines: !!root['RemoveNewlines'],
      convertUnicodePunctuation: !!root['ConvertUnicodePunctuation'],
      escapeForShell: !!root['EscapeForShell'],
      removeControls: !!root['RemoveControls'],
      bracketAllowed: root['BracketAllowed'] == null ? true : !!root['BracketAllowed'],
      useRegexSubstitution: !!root['UseRegexSubstitution'],
      regex: (root['Regex'] as string) ?? '',
      substitution: (root['Substitution'] as string) ?? '',
    });
  }

  /** JSON-encode for storage as a binding's "Text" field. */
  encode(): string {
    return JSON.stringify({
      Base64: this.base64,
      WaitForPrompts: this.waitForPrompts,
      TabTransform: this.tabTransform,
      TabStopSize: this.tabStopSize,
      Delay: this.delay,
      ChunkSize: this.chunkSize,
      ConvertNewlines: this.convertNewlines,
      RemoveNewlines: this.removeNewlines,
      ConvertUnicodePunctuation: this.convertUnicodePunctuation,
      EscapeForShell: this.escapeForShell,
      RemoveControls: this.removeControls,
      BracketAllowed: this.bracketAllowed,
      UseRegexSubstitution: this.useRegexSubstitution,
      Regex: this.regex,
      Substitution: this.substitution,
    });
  }
}

// ---------------------------------------------------------------------------
// MoveSelectionUnit
// ---------------------------------------------------------------------------

/** Units by which the cursor can move when modifying a selection. */
export enum MoveSelectionUnit {
  /** One cell (or two for double-width chars). */
  CHAR = 0,
  /** Jump over alphanumerics. */
  WORD = 1,
  LINE = 2,
  /** Mark (manual or shell-integration-set). */
  MARK = 3,
  /** Like WORD but includes punctuation. */
  BIG_WORD = 4,
}

export const MoveSelectionUnitCodec = {
  encode(value: MoveSelectionUnit): string {
    return String(value);
  },
  decode(value: string): MoveSelectionUnit {
    return Number.parseInt(value, 10) as MoveSelectionUnit;
  },
};

// ---------------------------------------------------------------------------
// SnippetIdentifier
// ---------------------------------------------------------------------------

/**
 * Selects a snippet for `SEND_SNIPPET`. Legacy prefs identify by title;
 * new identifiers use `{ guid: '...' }`.
 */
export class SnippetIdentifier {
  readonly title: string | null;
  readonly guid: string | null;

  constructor(value: string | { guid: string }) {
    if (typeof value === 'string') {
      this.title = value;
      this.guid = null;
    } else {
      this.title = null;
      this.guid = value.guid;
    }
  }

  /** Encode to the binding's "Text" field — either a title string or a JSON object. */
  encode(): string {
    if (this.title == null) {
      return JSON.stringify({ guid: this.guid });
    }
    return this.title;
  }
}

// ---------------------------------------------------------------------------
// BindingAction
// ---------------------------------------------------------------------------

export enum BindingAction {
  NEXT_SESSION = 0,
  NEXT_WINDOW = 1,
  PREVIOUS_SESSION = 2,
  PREVIOUS_WINDOW = 3,
  SCROLL_END = 4,
  SCROLL_HOME = 5,
  SCROLL_LINE_DOWN = 6,
  SCROLL_LINE_UP = 7,
  SCROLL_PAGE_DOWN = 8,
  SCROLL_PAGE_UP = 9,
  ESCAPE_SEQUENCE = 10,
  HEX_CODE = 11,
  TEXT = 12,
  IGNORE = 13,
  IR_BACKWARD = 15,
  SEND_C_H_BACKSPACE = 16,
  SEND_C_QM_BACKSPACE = 17,
  SELECT_PANE_LEFT = 18,
  SELECT_PANE_RIGHT = 19,
  SELECT_PANE_ABOVE = 20,
  SELECT_PANE_BELOW = 21,
  DO_NOT_REMAP_MODIFIERS = 22,
  TOGGLE_FULLSCREEN = 23,
  REMAP_LOCALLY = 24,
  SELECT_MENU_ITEM = 25,
  NEW_WINDOW_WITH_PROFILE = 26,
  NEW_TAB_WITH_PROFILE = 27,
  SPLIT_HORIZONTALLY_WITH_PROFILE = 28,
  SPLIT_VERTICALLY_WITH_PROFILE = 29,
  NEXT_PANE = 30,
  PREVIOUS_PANE = 31,
  NEXT_MRU_TAB = 32,
  MOVE_TAB_LEFT = 33,
  MOVE_TAB_RIGHT = 34,
  RUN_COPROCESS = 35,
  FIND_REGEX = 36,
  SET_PROFILE = 37,
  VIM_TEXT = 38,
  PREVIOUS_MRU_TAB = 39,
  LOAD_COLOR_PRESET = 40,
  PASTE_SPECIAL = 41,
  PASTE_SPECIAL_FROM_SELECTION = 42,
  TOGGLE_HOTKEY_WINDOW_PINNING = 43,
  UNDO = 44,
  MOVE_END_OF_SELECTION_LEFT = 45,
  MOVE_END_OF_SELECTION_RIGHT = 46,
  MOVE_START_OF_SELECTION_LEFT = 47,
  MOVE_START_OF_SELECTION_RIGHT = 48,
  DECREASE_HEIGHT = 49,
  INCREASE_HEIGHT = 50,
  DECREASE_WIDTH = 51,
  INCREASE_WIDTH = 52,
  SWAP_PANE_LEFT = 53,
  SWAP_PANE_RIGHT = 54,
  SWAP_PANE_ABOVE = 55,
  SWAP_PANE_BELOW = 56,
  FIND_AGAIN_DOWN = 57,
  FIND_AGAIN_UP = 58,
  TOGGLE_MOUSE_REPORTING = 59,
  INVOKE_SCRIPT_FUNCTION = 60,
  DUPLICATE_TAB = 61,
  MOVE_TO_SPLIT_PANE = 62,
  SEND_SNIPPET = 63,
}

/**
 * Decoded parameter of a binding — exactly one of:
 *  - `null`            — no parameter
 *  - `string`          — text actions (e.g. ESCAPE_SEQUENCE, HEX_CODE, SET_PROFILE)
 *  - `MenuItemIdentifier`
 *  - `PasteConfiguration`
 *  - `MoveSelectionUnit` (numeric enum)
 *  - `SnippetIdentifier`
 */
export type BindingParam =
  | null
  | string
  | MenuItemIdentifier
  | PasteConfiguration
  | MoveSelectionUnit
  | SnippetIdentifier;

// ---------------------------------------------------------------------------
// Parameter constructors / parsing
// ---------------------------------------------------------------------------

type ParamConstructor = (param: string | null | undefined) => BindingParam;

const noParam: ParamConstructor = () => '';

const stringParam: ParamConstructor = (param) => param ?? '';

const menuItemConstructor: ParamConstructor = (param) => {
  const lines = (param ?? '').split('\n');
  const title = lines[0] ?? '';
  const identifier = lines.length > 1 ? lines[1] ?? null : null;
  return new MenuItemIdentifier(title, identifier);
};

const pasteConfigurationConstructor: ParamConstructor = (param) =>
  PasteConfiguration.decode(param);

const moveSelectionUnitConstructor: ParamConstructor = (param) =>
  MoveSelectionUnitCodec.decode(param ?? '0');

const snippetIdentifierConstructor: ParamConstructor = (param) => {
  const s = param ?? '';
  // Try JSON-decode; fall back to treating it as a title.
  try {
    const obj = JSON.parse(s) as unknown;
    if (obj && typeof obj === 'object' && 'guid' in obj) {
      return new SnippetIdentifier({ guid: String((obj as { guid: unknown }).guid) });
    }
  } catch {
    /* not JSON */
  }
  return new SnippetIdentifier(s);
};

function getConstructor(action: BindingAction): ParamConstructor | null {
  switch (action) {
    case BindingAction.NEXT_SESSION:
    case BindingAction.NEXT_WINDOW:
    case BindingAction.PREVIOUS_SESSION:
    case BindingAction.PREVIOUS_WINDOW:
    case BindingAction.SCROLL_END:
    case BindingAction.SCROLL_HOME:
    case BindingAction.SCROLL_LINE_DOWN:
    case BindingAction.SCROLL_LINE_UP:
    case BindingAction.SCROLL_PAGE_DOWN:
    case BindingAction.SCROLL_PAGE_UP:
    case BindingAction.IGNORE:
    case BindingAction.IR_BACKWARD:
    case BindingAction.SEND_C_H_BACKSPACE:
    case BindingAction.SEND_C_QM_BACKSPACE:
    case BindingAction.SELECT_PANE_LEFT:
    case BindingAction.SELECT_PANE_RIGHT:
    case BindingAction.SELECT_PANE_ABOVE:
    case BindingAction.SELECT_PANE_BELOW:
    case BindingAction.DO_NOT_REMAP_MODIFIERS:
    case BindingAction.TOGGLE_FULLSCREEN:
    case BindingAction.REMAP_LOCALLY:
    case BindingAction.NEXT_PANE:
    case BindingAction.PREVIOUS_PANE:
    case BindingAction.NEXT_MRU_TAB:
    case BindingAction.MOVE_TAB_LEFT:
    case BindingAction.MOVE_TAB_RIGHT:
    case BindingAction.PREVIOUS_MRU_TAB:
    case BindingAction.TOGGLE_HOTKEY_WINDOW_PINNING:
    case BindingAction.UNDO:
    case BindingAction.DECREASE_HEIGHT:
    case BindingAction.INCREASE_HEIGHT:
    case BindingAction.DECREASE_WIDTH:
    case BindingAction.INCREASE_WIDTH:
    case BindingAction.SWAP_PANE_LEFT:
    case BindingAction.SWAP_PANE_RIGHT:
    case BindingAction.SWAP_PANE_ABOVE:
    case BindingAction.SWAP_PANE_BELOW:
    case BindingAction.FIND_AGAIN_DOWN:
    case BindingAction.FIND_AGAIN_UP:
    case BindingAction.TOGGLE_MOUSE_REPORTING:
    case BindingAction.DUPLICATE_TAB:
    case BindingAction.MOVE_TO_SPLIT_PANE:
      return noParam;

    case BindingAction.ESCAPE_SEQUENCE:
    case BindingAction.HEX_CODE:
    case BindingAction.TEXT:
    case BindingAction.NEW_WINDOW_WITH_PROFILE:
    case BindingAction.NEW_TAB_WITH_PROFILE:
    case BindingAction.SPLIT_HORIZONTALLY_WITH_PROFILE:
    case BindingAction.SPLIT_VERTICALLY_WITH_PROFILE:
    case BindingAction.RUN_COPROCESS:
    case BindingAction.FIND_REGEX:
    case BindingAction.SET_PROFILE:
    case BindingAction.VIM_TEXT:
    case BindingAction.LOAD_COLOR_PRESET:
    case BindingAction.INVOKE_SCRIPT_FUNCTION:
      return stringParam;

    case BindingAction.SELECT_MENU_ITEM:
      return menuItemConstructor;

    case BindingAction.PASTE_SPECIAL:
    case BindingAction.PASTE_SPECIAL_FROM_SELECTION:
      return pasteConfigurationConstructor;

    case BindingAction.MOVE_END_OF_SELECTION_LEFT:
    case BindingAction.MOVE_END_OF_SELECTION_RIGHT:
    case BindingAction.MOVE_START_OF_SELECTION_LEFT:
    case BindingAction.MOVE_START_OF_SELECTION_RIGHT:
      return moveSelectionUnitConstructor;

    case BindingAction.SEND_SNIPPET:
      return snippetIdentifierConstructor;

    default:
      return null;
  }
}

/** Convert a serialized binding parameter into a typed `BindingParam`. */
export function parseBindingParam(
  action: BindingAction,
  param: string | null | undefined
): BindingParam {
  const ctor = getConstructor(action);
  if (!ctor) return null;
  return ctor(param);
}

// ---------------------------------------------------------------------------
// KeyBinding
// ---------------------------------------------------------------------------

/** Serialized binding object as it appears in a profile's `Keyboard Map`. */
export interface SerializedKeyBinding {
  Action: number;
  Text: string;
  Version?: number;
  Label?: string;
}

function paramEncode(param: BindingParam): string {
  if (param == null) return '';
  if (typeof param === 'string') return param;
  if (typeof param === 'number') return MoveSelectionUnitCodec.encode(param);
  // Class instances all have an `encode()` method.
  return (param as { encode(): string }).encode();
}

/**
 * A keyboard shortcut paired with an action. Together with optional
 * action-parameter (`param`), version, and (touch-bar) label.
 */
export class KeyBinding {
  /** Cocoa modifier mask (bit-OR of `Modifier`s converted via `toCocoa`). */
  private _modifiersMask: number;
  private _encodedParam: string;

  constructor(
    /** Code point of the character produced by the keypress. */
    public character: number,
    modifiers: Modifier[],
    /** Physical key, or `null` for character-only bindings. */
    public keycode: Keycode | null,
    public action: BindingAction,
    public param: BindingParam,
    /** Set to 1 to get newer vim-style escape semantics. */
    public version: number | null = null,
    /** Touch-bar label (only relevant for touch-bar bindings). */
    public label: string | null = null
  ) {
    this._modifiersMask = ModifierUtil.toCocoaMask(modifiers);
    this._encodedParam = paramEncode(param);
  }

  /** Modifiers as a list (decoded from the internal Cocoa mask). */
  get modifiers(): Modifier[] {
    return ModifierUtil.fromCocoa(this._modifiersMask);
  }

  set modifiers(value: Modifier[]) {
    this._modifiersMask = ModifierUtil.toCocoaMask(value);
  }

  /** Re-encode the parameter — call if you mutated `param` in place. */
  refreshParam(): void {
    this._encodedParam = paramEncode(this.param);
  }

  equals(other: KeyBinding): boolean {
    return (
      this.keycode === other.keycode &&
      this.character === other.character &&
      this._modifiersMask === other._modifiersMask &&
      this.action === other.action &&
      this._encodedParam === other._encodedParam &&
      this.version === other.version &&
      this.label === other.label
    );
  }

  toString(): string {
    return (
      `[KeyBinding keycode=${this.keycode} character=${this.character} ` +
      `modifiers=${JSON.stringify(this.modifiers)} action=${this.action} ` +
      `param=${JSON.stringify(this.param)}] version=${this.version} ` +
      `label=${this.label}]`
    );
  }

  /** Dictionary key used inside a profile's `Keyboard Map`. */
  get key(): string {
    const base = `${hex(this.character)}-${hex(this._modifiersMask)}`;
    if (this.keycode == null) return base;
    return `${base}-${hex(this.keycode as number)}`;
  }

  /** Serialized binding value (matches `_value` in Python). */
  get value(): SerializedKeyBinding {
    const result: SerializedKeyBinding = {
      Action: this.action,
      Text: this._encodedParam,
    };
    if (this.version != null) result.Version = this.version;
    if (this.label != null) result.Label = this.label;
    return result;
  }

  /** Alias mirroring the Python `encode` property — same as `value`. */
  encode(): SerializedKeyBinding {
    return this.value;
  }

  /** Construct from a `(key, entry)` pair as stored in a profile's `Keyboard Map`. */
  static make(key: string, entry: SerializedKeyBinding): KeyBinding {
    // Key forms:  0xcharacter-0xmodifiers  or  0xcharacter-0xmodifiers-0xkeycode
    const keyParts = key.split('-');
    const action = entry.Action as BindingAction;
    const keycode =
      keyParts.length >= 3 ? (Number.parseInt(keyParts[2]!, 16) as Keycode) : null;
    const character = Number.parseInt(keyParts[0] ?? '0', 16);
    const modifiers = ModifierUtil.fromCocoa(Number.parseInt(keyParts[1] ?? '0', 16));
    const param = parseBindingParam(action, entry.Text);
    return new KeyBinding(
      character,
      modifiers,
      keycode,
      action,
      param,
      entry.Version ?? null,
      entry.Label ?? null
    );
  }
}

function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

/** Convenience wrapper for `KeyBinding.make`. */
export function decodeKeyBinding(
  key: string,
  obj: SerializedKeyBinding
): KeyBinding {
  return KeyBinding.make(key, obj);
}

// ---------------------------------------------------------------------------
// Global key bindings
// ---------------------------------------------------------------------------

export const GLOBAL_KEY_MAP_USER_DEFAULTS_KEY = 'GlobalKeyMap';

// PreferencesResponse.Result.SetPreferenceResult.Status: OK=0, BAD_JSON=1, INVALID_VALUE=2.
const SET_PREF_STATUS_NAMES: Record<number, string> = {
  0: 'OK',
  1: 'BAD_JSON',
  2: 'INVALID_VALUE',
};

/** Fetch the global key bindings (Preferences > Keys). */
export async function getGlobalKeyBindings(
  conn: Connection
): Promise<KeyBinding[]> {
  const api = new Api(conn);
  const res = await api.preferences({
    requests: [
      { getPreferenceRequest: { key: GLOBAL_KEY_MAP_USER_DEFAULTS_KEY } },
    ],
  } as unknown as iterm2.PreferencesRequest.$Properties);
  const j = res.results?.[0]?.getPreferenceResult?.jsonValue ?? '{}';
  const raw = JSON.parse(j) as Record<string, SerializedKeyBinding>;
  const out: KeyBinding[] = [];
  for (const [k, entry] of Object.entries(raw)) {
    out.push(decodeKeyBinding(k, entry));
  }
  return out;
}

/** Replace the global key bindings (Preferences > Keys). */
export async function setGlobalKeyBindings(
  conn: Connection,
  bindings: KeyBinding[]
): Promise<void> {
  const api = new Api(conn);
  const replacement: Record<string, SerializedKeyBinding> = {};
  for (const b of bindings) {
    replacement[b.key] = b.value;
  }
  const res = await api.preferences({
    requests: [
      {
        setPreferenceRequest: {
          key: GLOBAL_KEY_MAP_USER_DEFAULTS_KEY,
          jsonValue: JSON.stringify(replacement),
        },
      },
    ],
  } as unknown as iterm2.PreferencesRequest.$Properties);
  const status = res.results?.[0]?.setPreferenceResult?.status ?? 0;
  if (status === 0) return;
  const name = SET_PREF_STATUS_NAMES[status as number] ?? `status=${status}`;
  throw new RPCException(`setGlobalKeyBindings failed: ${name}`);
}
