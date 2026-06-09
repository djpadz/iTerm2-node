/**
 * Profile + LocalWriteOnlyProfile + enums — port of `iterm2/profile.py`.
 *
 * The 200+ typed setters on LocalWriteOnlyProfile mirror Python and are
 * mechanically generated from the Python source. To re-generate them, see
 * `scripts/extract-profile-setters.mjs` (kept for maintenance).
 */

import type { Connection } from './connection';
import { Api } from './api';
import { Color } from './color';
import type { iterm2 } from './generated/api';
import { RPCException } from './session';

export class BadGUIDException extends Error {
  constructor(message: string) { super(message); this.name = 'BadGUIDException'; }
}

export enum BackgroundImageMode {
  STRETCH = 0,
  TILE = 1,
  ASPECT_FILL = 2,
  ASPECT_FIT = 3,
}

export enum CursorType {
  UNDERLINE = 0,
  VERTICAL = 1,
  BOX = 2,
}

export enum ThinStrokes {
  NEVER = 0,
  RETINA_DARK_BACKGROUNDS_ONLY = 1,
  DARK_BACKGROUNDS_ONLY = 2,
  ALWAYS = 3,
  RETINA_ONLY = 4,
}

export enum UnicodeNormalization {
  NONE = 0,
  NFC = 1,
  NFD = 2,
  HFSPLUS = 3,
}

export enum CharacterEncoding {
  UTF_8 = 4,
}

export enum OptionKeySends {
  NORMAL = 0,
  META = 1,
  ESC = 2,
}

export enum InitialWorkingDirectory {
  CUSTOM = 'Yes',
  HOME = 'No',
  RECYCLE = 'Recycle',
  ADVANCED = 'Advanced',
}

export enum IconMode {
  NONE = 0,
  AUTOMATIC = 1,
  CUSTOM = 2,
}

export enum TitleComponents {
  SESSION_NAME = 1 << 0,
  JOB = 1 << 1,
  WORKING_DIRECTORY = 1 << 2,
  TTY = 1 << 3,
  CUSTOM = 1 << 4,
  PROFILE_NAME = 1 << 5,
  PROFILE_AND_SESSION_NAME = 1 << 6,
  USER = 1 << 7,
  HOST = 1 << 8,
  COMMAND_LINE = 1 << 9,
  SIZE = 1 << 10,
}

function jsonStringify(value: unknown): string {
  if (
    value != null &&
    typeof value === 'object' &&
    'toJSON' in (value as object) &&
    typeof (value as { toJSON: unknown }).toJSON === 'function'
  ) {
    return (value as { toJSON(): string }).toJSON();
  }
  return JSON.stringify(value);
}

/**
 * Accumulates a set of `key -> jsonValue` overrides. Pass `.values()` to
 * APIs that take profile customizations (CreateTab, SplitPane, Session.setProfileProperties).
 */
export class LocalWriteOnlyProfile {
  private __values: Record<string, string> = {};

  constructor(initial?: Record<string, string>) {
    if (initial) this.__values = { ...initial };
  }

  values(): Record<string, string> {
    return { ...this.__values };
  }

  /** Pairs of [key, jsonValue] suitable for SetProfilePropertyRequest. */
  assignments(): Array<{ key: string; jsonValue: string }> {
    return Object.entries(this.__values).map(([key, jsonValue]) => ({
      key,
      jsonValue,
    }));
  }

  _simpleSet(key: string, value: unknown): void {
    this.__values[key] = jsonStringify(value);
  }

  _colorSet(key: string, value: Color | null): void {
    this.__values[key] = value == null ? 'null' : JSON.stringify(value.getDict());
  }

  setTitleComponents(value: unknown): void { this._simpleSet("Title Components", value); }
  setUseSeparateColorsForLightAndDarkMode(value: unknown): void { this._simpleSet("Use Separate Colors for Light and Dark Mode", value); }
  setForegroundColor(value: Color): void { this._colorSet("Foreground Color", value); }
  setForegroundColorLight(value: Color): void { this._colorSet("Foreground Color (Light)", value); }
  setForegroundColorDark(value: Color): void { this._colorSet("Foreground Color (Dark)", value); }
  setBackgroundColor(value: Color): void { this._colorSet("Background Color", value); }
  setBackgroundColorLight(value: Color): void { this._colorSet("Background Color (Light)", value); }
  setBackgroundColorDark(value: Color): void { this._colorSet("Background Color (Dark)", value); }
  setBoldColor(value: Color): void { this._colorSet("Bold Color", value); }
  setBoldColorLight(value: Color): void { this._colorSet("Bold Color (Light)", value); }
  setBoldColorDark(value: Color): void { this._colorSet("Bold Color (Dark)", value); }
  setUseBrightBold(value: unknown): void { this._simpleSet("Use Bright Bold", value); }
  setUseBrightBoldLight(value: unknown): void { this._simpleSet("Use Bright Bold (Light)", value); }
  setUseBrightBoldDark(value: unknown): void { this._simpleSet("Use Bright Bold (Dark)", value); }
  setUseBoldColor(value: unknown): void { this._simpleSet("Use Bright Bold", value); }
  setUseBoldColorLight(value: unknown): void { this._simpleSet("Use Bright Bold (Light)", value); }
  setUseBoldColorDark(value: unknown): void { this._simpleSet("Use Bright Bold (Dark)", value); }
  setBrightenBoldText(value: unknown): void { this._simpleSet("Brighten Bold Text", value); }
  setBrightenBoldTextLight(value: unknown): void { this._simpleSet("Brighten Bold Text (Light)", value); }
  setBrightenBoldTextDark(value: unknown): void { this._simpleSet("Brighten Bold Text (Dark)", value); }
  setLinkColor(value: Color): void { this._colorSet("Link Color", value); }
  setLinkColorLight(value: Color): void { this._colorSet("Link Color (Light)", value); }
  setLinkColorDark(value: Color): void { this._colorSet("Link Color (Dark)", value); }
  setSelectionColor(value: Color): void { this._colorSet("Selection Color", value); }
  setSelectionColorLight(value: Color): void { this._colorSet("Selection Color (Light)", value); }
  setSelectionColorDark(value: Color): void { this._colorSet("Selection Color (Dark)", value); }
  setSelectedTextColor(value: Color): void { this._colorSet("Selected Text Color", value); }
  setSelectedTextColorLight(value: Color): void { this._colorSet("Selected Text Color (Light)", value); }
  setSelectedTextColorDark(value: Color): void { this._colorSet("Selected Text Color (Dark)", value); }
  setCursorColor(value: Color): void { this._colorSet("Cursor Color", value); }
  setCursorColorLight(value: Color): void { this._colorSet("Cursor Color (Light)", value); }
  setCursorColorDark(value: Color): void { this._colorSet("Cursor Color (Dark)", value); }
  setCursorTextColor(value: Color): void { this._colorSet("Cursor Text Color", value); }
  setCursorTextColorLight(value: Color): void { this._colorSet("Cursor Text Color (Light)", value); }
  setCursorTextColorDark(value: Color): void { this._colorSet("Cursor Text Color (Dark)", value); }
  setAnsi0Color(value: Color): void { this._colorSet("Ansi 0 Color", value); }
  setAnsi0ColorLight(value: Color): void { this._colorSet("Ansi 0 Color (Light)", value); }
  setAnsi0ColorDark(value: Color): void { this._colorSet("Ansi 0 Color (Dark)", value); }
  setAnsi1Color(value: Color): void { this._colorSet("Ansi 1 Color", value); }
  setAnsi1ColorLight(value: Color): void { this._colorSet("Ansi 1 Color (Light)", value); }
  setAnsi1ColorDark(value: Color): void { this._colorSet("Ansi 1 Color (Dark)", value); }
  setAnsi2Color(value: Color): void { this._colorSet("Ansi 2 Color", value); }
  setAnsi2ColorLight(value: Color): void { this._colorSet("Ansi 2 Color (Light)", value); }
  setAnsi2ColorDark(value: Color): void { this._colorSet("Ansi 2 Color (Dark)", value); }
  setAnsi3Color(value: Color): void { this._colorSet("Ansi 3 Color", value); }
  setAnsi3ColorLight(value: Color): void { this._colorSet("Ansi 3 Color (Light)", value); }
  setAnsi3ColorDark(value: Color): void { this._colorSet("Ansi 3 Color (Dark)", value); }
  setAnsi4Color(value: Color): void { this._colorSet("Ansi 4 Color", value); }
  setAnsi4ColorLight(value: Color): void { this._colorSet("Ansi 4 Color (Light)", value); }
  setAnsi4ColorDark(value: Color): void { this._colorSet("Ansi 4 Color (Dark)", value); }
  setAnsi5Color(value: Color): void { this._colorSet("Ansi 5 Color", value); }
  setAnsi5ColorLight(value: Color): void { this._colorSet("Ansi 5 Color (Light)", value); }
  setAnsi5ColorDark(value: Color): void { this._colorSet("Ansi 5 Color (Dark)", value); }
  setAnsi6Color(value: Color): void { this._colorSet("Ansi 6 Color", value); }
  setAnsi6ColorLight(value: Color): void { this._colorSet("Ansi 6 Color (Light)", value); }
  setAnsi6ColorDark(value: Color): void { this._colorSet("Ansi 6 Color (Dark)", value); }
  setAnsi7Color(value: Color): void { this._colorSet("Ansi 7 Color", value); }
  setAnsi7ColorLight(value: Color): void { this._colorSet("Ansi 7 Color (Light)", value); }
  setAnsi7ColorDark(value: Color): void { this._colorSet("Ansi 7 Color (Dark)", value); }
  setAnsi8Color(value: Color): void { this._colorSet("Ansi 8 Color", value); }
  setAnsi8ColorLight(value: Color): void { this._colorSet("Ansi 8 Color (Light)", value); }
  setAnsi8ColorDark(value: Color): void { this._colorSet("Ansi 8 Color (Dark)", value); }
  setAnsi9Color(value: Color): void { this._colorSet("Ansi 9 Color", value); }
  setAnsi9ColorLight(value: Color): void { this._colorSet("Ansi 9 Color (Light)", value); }
  setAnsi9ColorDark(value: Color): void { this._colorSet("Ansi 9 Color (Dark)", value); }
  setAnsi10Color(value: Color): void { this._colorSet("Ansi 10 Color", value); }
  setAnsi10ColorLight(value: Color): void { this._colorSet("Ansi 10 Color (Light)", value); }
  setAnsi10ColorDark(value: Color): void { this._colorSet("Ansi 10 Color (Dark)", value); }
  setAnsi11Color(value: Color): void { this._colorSet("Ansi 11 Color", value); }
  setAnsi11ColorLight(value: Color): void { this._colorSet("Ansi 11 Color (Light)", value); }
  setAnsi11ColorDark(value: Color): void { this._colorSet("Ansi 11 Color (Dark)", value); }
  setAnsi12Color(value: Color): void { this._colorSet("Ansi 12 Color", value); }
  setAnsi12ColorLight(value: Color): void { this._colorSet("Ansi 12 Color (Light)", value); }
  setAnsi12ColorDark(value: Color): void { this._colorSet("Ansi 12 Color (Dark)", value); }
  setAnsi13Color(value: Color): void { this._colorSet("Ansi 13 Color", value); }
  setAnsi13ColorLight(value: Color): void { this._colorSet("Ansi 13 Color (Light)", value); }
  setAnsi13ColorDark(value: Color): void { this._colorSet("Ansi 13 Color (Dark)", value); }
  setAnsi14Color(value: Color): void { this._colorSet("Ansi 14 Color", value); }
  setAnsi14ColorLight(value: Color): void { this._colorSet("Ansi 14 Color (Light)", value); }
  setAnsi14ColorDark(value: Color): void { this._colorSet("Ansi 14 Color (Dark)", value); }
  setAnsi15Color(value: Color): void { this._colorSet("Ansi 15 Color", value); }
  setAnsi15ColorLight(value: Color): void { this._colorSet("Ansi 15 Color (Light)", value); }
  setAnsi15ColorDark(value: Color): void { this._colorSet("Ansi 15 Color (Dark)", value); }
  setSmartCursorColor(value: unknown): void { this._simpleSet("Smart Cursor Color", value); }
  setSmartCursorColorLight(value: unknown): void { this._simpleSet("Smart Cursor Color (Light)", value); }
  setSmartCursorColorDark(value: unknown): void { this._simpleSet("Smart Cursor Color (Dark)", value); }
  setMinimumContrast(value: unknown): void { this._simpleSet("Minimum Contrast", value); }
  setMinimumContrastLight(value: unknown): void { this._simpleSet("Minimum Contrast (Light)", value); }
  setMinimumContrastDark(value: unknown): void { this._simpleSet("Minimum Contrast (Dark)", value); }
  setTabColor(value: Color): void { this._colorSet("Tab Color", value); }
  setTabColorLight(value: Color): void { this._colorSet("Tab Color (Light)", value); }
  setTabColorDark(value: Color): void { this._colorSet("Tab Color (Dark)", value); }
  setUseTabColor(value: unknown): void { this._simpleSet("Use Tab Color", value); }
  setUseTabColorLight(value: unknown): void { this._simpleSet("Use Tab Color (Light)", value); }
  setUseTabColorDark(value: unknown): void { this._simpleSet("Use Tab Color (Dark)", value); }
  setUnderlineColor(value: Color): void { this._colorSet("Underline Color", value); }
  setUnderlineColorLight(value: Color): void { this._colorSet("Underline Color (Light)", value); }
  setUnderlineColorDark(value: Color): void { this._colorSet("Underline Color (Dark)", value); }
  setUseUnderlineColor(value: unknown): void { this._simpleSet("Use Underline Color", value); }
  setUseUnderlineColorLight(value: unknown): void { this._simpleSet("Use Underline Color (Light)", value); }
  setUseUnderlineColorDark(value: unknown): void { this._simpleSet("Use Underline Color (Dark)", value); }
  setCursorBoost(value: unknown): void { this._simpleSet("Cursor Boost", value); }
  setCursorBoostLight(value: unknown): void { this._simpleSet("Cursor Boost (Light)", value); }
  setCursorBoostDark(value: unknown): void { this._simpleSet("Cursor Boost (Dark)", value); }
  setUseCursorGuide(value: unknown): void { this._simpleSet("Use Cursor Guide", value); }
  setUseCursorGuideLight(value: unknown): void { this._simpleSet("Use Cursor Guide (Light)", value); }
  setUseCursorGuideDark(value: unknown): void { this._simpleSet("Use Cursor Guide (Dark)", value); }
  setCursorGuideColor(value: Color): void { this._colorSet("Cursor Guide Color", value); }
  setCursorGuideColorLight(value: Color): void { this._colorSet("Cursor Guide Color (Light)", value); }
  setCursorGuideColorDark(value: Color): void { this._colorSet("Cursor Guide Color (Dark)", value); }
  setBadgeColor(value: Color): void { this._colorSet("Badge Color", value); }
  setBadgeColorLight(value: Color): void { this._colorSet("Badge Color (Light)", value); }
  setBadgeColorDark(value: Color): void { this._colorSet("Badge Color (Dark)", value); }
  setName(value: unknown): void { this._simpleSet("Name", value); }
  setBadgeText(value: unknown): void { this._simpleSet("Badge Text", value); }
  setSubtitle(value: unknown): void { this._simpleSet("Subtitle", value); }
  setAnswerbackString(value: unknown): void { this._simpleSet("Answerback String", value); }
  setBlinkingCursor(value: unknown): void { this._simpleSet("Blinking Cursor", value); }
  setCursorShadow(value: unknown): void { this._simpleSet("Cursor Shadow", value); }
  setUseBoldFont(value: unknown): void { this._simpleSet("Use Bold Font", value); }
  setAsciiLigatures(value: unknown): void { this._simpleSet("ASCII Ligatures", value); }
  setNonAsciiLigatures(value: unknown): void { this._simpleSet("Non-ASCII Ligatures", value); }
  setBlinkAllowed(value: unknown): void { this._simpleSet("Blink Allowed", value); }
  setUseItalicFont(value: unknown): void { this._simpleSet("Use Italic Font", value); }
  setAmbiguousDoubleWidth(value: unknown): void { this._simpleSet("Ambiguous Double Width", value); }
  setHorizontalSpacing(value: unknown): void { this._simpleSet("Horizontal Spacing", value); }
  setVerticalSpacing(value: unknown): void { this._simpleSet("Vertical Spacing", value); }
  setUseNonAsciiFont(value: unknown): void { this._simpleSet("Use Non-ASCII Font", value); }
  setTransparency(value: unknown): void { this._simpleSet("Transparency", value); }
  setBlur(value: unknown): void { this._simpleSet("Blur", value); }
  setBlurRadius(value: unknown): void { this._simpleSet("Blur Radius", value); }
  setBackgroundImageMode(value: unknown): void { this._simpleSet("Background Image Mode", value); }
  setBlend(value: unknown): void { this._simpleSet("Blend", value); }
  setSyncTitle(value: unknown): void { this._simpleSet("Sync Title", value); }
  setUseBuiltInPowerlineGlyphs(value: unknown): void { this._simpleSet("Draw Powerline Glyphs", value); }
  setDisableWindowResizing(value: unknown): void { this._simpleSet("Disable Window Resizing", value); }
  setAllowChangeCursorBlink(value: unknown): void { this._simpleSet("Allow Change Cursor Blink", value); }
  setOnlyTheDefaultBgColorUsesTransparency(value: unknown): void { this._simpleSet("Only The Default BG Color Uses Transparency", value); }
  setAsciiAntiAliased(value: unknown): void { this._simpleSet("ASCII Anti Aliased", value); }
  setNonAsciiAntiAliased(value: unknown): void { this._simpleSet("Non-ASCII Anti Aliased", value); }
  setScrollbackLines(value: unknown): void { this._simpleSet("Scrollback Lines", value); }
  setUnlimitedScrollback(value: unknown): void { this._simpleSet("Unlimited Scrollback", value); }
  setScrollbackWithStatusBar(value: unknown): void { this._simpleSet("Scrollback With Status Bar", value); }
  setScrollbackInAlternateScreen(value: unknown): void { this._simpleSet("Scrollback in Alternate Screen", value); }
  setMouseReporting(value: unknown): void { this._simpleSet("Mouse Reporting", value); }
  setMouseReportingAllowMouseWheel(value: unknown): void { this._simpleSet("Mouse Reporting allow mouse wheel", value); }
  setAllowTitleReporting(value: unknown): void { this._simpleSet("Allow Title Reporting", value); }
  setAllowTitleSetting(value: unknown): void { this._simpleSet("Allow Title Setting", value); }
  setDisablePrinting(value: unknown): void { this._simpleSet("Disable Printing", value); }
  setDisableSmcupRmcup(value: unknown): void { this._simpleSet("Disable Smcup Rmcup", value); }
  setSilenceBell(value: unknown): void { this._simpleSet("Silence Bell", value); }
  setBmGrowl(value: unknown): void { this._simpleSet("BM Growl", value); }
  setSendBellAlert(value: unknown): void { this._simpleSet("Send Bell Alert", value); }
  setSendIdleAlert(value: unknown): void { this._simpleSet("Send Idle Alert", value); }
  setSendNewOutputAlert(value: unknown): void { this._simpleSet("Send New Output Alert", value); }
  setSendSessionEndedAlert(value: unknown): void { this._simpleSet("Send Session Ended Alert", value); }
  setSendTerminalGeneratedAlerts(value: unknown): void { this._simpleSet("Send Terminal Generated Alerts", value); }
  setFlashingBell(value: unknown): void { this._simpleSet("Flashing Bell", value); }
  setVisualBell(value: unknown): void { this._simpleSet("Visual Bell", value); }
  setCloseSessionsOnEnd(value: unknown): void { this._simpleSet("Close Sessions On End", value); }
  setPromptBeforeClosing(value: unknown): void { this._simpleSet("Prompt Before Closing 2", value); }
  setSessionCloseUndoTimeout(value: unknown): void { this._simpleSet("Session Close Undo Timeout", value); }
  setReduceFlicker(value: unknown): void { this._simpleSet("Reduce Flicker", value); }
  setSendCodeWhenIdle(value: unknown): void { this._simpleSet("Send Code When Idle", value); }
  setApplicationKeypadAllowed(value: unknown): void { this._simpleSet("Application Keypad Allowed", value); }
  setPlacePromptAtFirstColumn(value: unknown): void { this._simpleSet("Place Prompt at First Column", value); }
  setShowMarkIndicators(value: unknown): void { this._simpleSet("Show Mark Indicators", value); }
  setIdleCode(value: unknown): void { this._simpleSet("Idle Code", value); }
  setIdlePeriod(value: unknown): void { this._simpleSet("Idle Period", value); }
  setUnicodeVersion(value: unknown): void { this._simpleSet("Unicode Version", value); }
  setCursorType(value: unknown): void { this._simpleSet("Cursor Type", value); }
  setThinStrokes(value: unknown): void { this._simpleSet("Thin Strokes", value); }
  setUnicodeNormalization(value: unknown): void { this._simpleSet("Unicode Normalization", value); }
  setCharacterEncoding(value: unknown): void { this._simpleSet("Character Encoding", value); }
  setLeftOptionKeySends(value: unknown): void { this._simpleSet("Option Key Sends", value); }
  setRightOptionKeySends(value: unknown): void { this._simpleSet("Right Option Key Sends", value); }
  setTriggers(value: unknown): void { this._simpleSet("Triggers", value); }
  setSmartSelectionRules(value: unknown): void { this._simpleSet("Smart Selection Rules", value); }
  setSmartSelectionActionsUseInterpolatedStrings(value: unknown): void { this._simpleSet("Smart Selection Actions Use Interpolated Strings", value); }
  setSemanticHistory(value: unknown): void { this._simpleSet("Semantic History", value); }
  setAutomaticProfileSwitchingRules(value: unknown): void { this._simpleSet("Bound Hosts", value); }
  setAdvancedWorkingDirectoryWindowSetting(value: unknown): void { this._simpleSet("AWDS Window Option", value); }
  setAdvancedWorkingDirectoryWindowDirectory(value: unknown): void { this._simpleSet("AWDS Window Directory", value); }
  setAdvancedWorkingDirectoryTabSetting(value: unknown): void { this._simpleSet("AWDS Tab Option", value); }
  setAdvancedWorkingDirectoryTabDirectory(value: unknown): void { this._simpleSet("AWDS Tab Directory", value); }
  setAdvancedWorkingDirectoryPaneSetting(value: unknown): void { this._simpleSet("AWDS Pane Option", value); }
  setAdvancedWorkingDirectoryPaneDirectory(value: unknown): void { this._simpleSet("AWDS Pane Directory", value); }
  setNormalFont(value: unknown): void { this._simpleSet("Normal Font", value); }
  setNonAsciiFont(value: unknown): void { this._simpleSet("Non Ascii Font", value); }
  setBackgroundImageLocation(value: unknown): void { this._simpleSet("Background Image Location", value); }
  setKeyMappings(value: unknown): void { this._simpleSet("Keyboard Map", value); }
  setTouchbarMappings(value: unknown): void { this._simpleSet("Touch Bar Map", value); }
  setUseCustomCommand(value: unknown): void { this._simpleSet("Custom Command", value); }
  setCommand(value: unknown): void { this._simpleSet("Command", value); }
  setInitialDirectoryMode(value: unknown): void { this._simpleSet("Custom Directory", value); }
  setCustomDirectory(value: unknown): void { this._simpleSet("Working Directory", value); }
  setIconMode(value: unknown): void { this._simpleSet("Icon", value); }
  setCustomIconPath(value: unknown): void { this._simpleSet("Custom Icon Path", value); }
  setBadgeTopMargin(value: unknown): void { this._simpleSet("Badge Top Margin", value); }
  setBadgeRightMargin(value: unknown): void { this._simpleSet("Badge Right Margin", value); }
  setBadgeMaxWidth(value: unknown): void { this._simpleSet("Badge Max Width", value); }
  setBadgeMaxHeight(value: unknown): void { this._simpleSet("Badge Max Height", value); }
  setBadgeFont(value: unknown): void { this._simpleSet("Badge Font", value); }
  setUseCustomWindowTitle(value: unknown): void { this._simpleSet("Use Custom Window Title", value); }
  setCustomWindowTitle(value: unknown): void { this._simpleSet("Custom Window Title", value); }
  setUseTransparencyInitially(value: unknown): void { this._simpleSet("Initial Use Transparency", value); }
  setStatusBarEnabled(value: unknown): void { this._simpleSet("Show Status Bar", value); }
  setUseCsiU(value: unknown): void { this._simpleSet("Use libtickit protocol", value); }
  setTriggersUseInterpolatedStrings(value: unknown): void { this._simpleSet("Triggers Use Interpolated Strings", value); }
  setLeftOptionKeyChangeable(value: unknown): void { this._simpleSet("Left Option Key Changeable", value); }
  setRightOptionKeyChangeable(value: unknown): void { this._simpleSet("Right Option Key Changeable", value); }
  setOpenPasswordManagerAutomatically(value: unknown): void { this._simpleSet("Open Password Manager Automatically", value); }}

/**
 * Read-only Profile — wraps the `properties` array iTerm2 returns for a
 * given session or shared profile. Use `getProperty(name)` to inspect.
 */
export class Profile {
  static readonly USE_CUSTOM_COMMAND_ENABLED = 'Yes';
  static readonly USE_CUSTOM_COMMAND_DISABLED = 'No';

  private __props: Map<string, unknown>;
  readonly guid: string | null;

  constructor(
    public readonly conn: Connection,
    public readonly sessionId: string | null,
    properties: iterm2.ProfileProperty.$Properties[] | null | undefined
  ) {
    this.__props = new Map();
    for (const p of properties ?? []) {
      try {
        this.__props.set(p.key ?? '', p.jsonValue != null ? JSON.parse(p.jsonValue) : null);
      } catch {
        this.__props.set(p.key ?? '', p.jsonValue ?? null);
      }
    }
    const g = this.__props.get('Guid');
    this.guid = typeof g === 'string' ? g : null;
  }

  getProperty(key: string): unknown {
    return this.__props.has(key) ? this.__props.get(key) : null;
  }

  has(key: string): boolean {
    return this.__props.has(key);
  }

  get keys(): string[] {
    return [...this.__props.keys()];
  }

  /** Returns a LocalWriteOnlyProfile that, when written, restores this state. */
  localWriteOnlyCopy(): LocalWriteOnlyProfile {
    const lwop = new LocalWriteOnlyProfile();
    for (const [k, v] of this.__props) {
      lwop._simpleSet(k, v);
    }
    return lwop;
  }

  /** Fetch profiles by GUID, or all profiles if `guids` is omitted. */
  static async getAll(conn: Connection, guids?: string[]): Promise<Profile[]> {
    const api = new Api(conn);
    const res = await api.listProfiles({
      guids: guids ?? [],
      properties: [],
    });
    return (res.profiles ?? []).map(
      (p: iterm2.ListProfilesResponse.Profile.$Properties) =>
        new Profile(conn, null, p.properties)
    );
  }

  /** Fetches the user's default profile. */
  static async getDefault(conn: Connection): Promise<Profile> {
    const api = new Api(conn);
    const res = await api.preferences({
      requests: [{ getDefaultProfileRequest: {} }],
    });
    const guid = res.results?.[0]?.getDefaultProfileResult?.guid ?? '';
    if (!guid) throw new RPCException('No default profile GUID returned');
    const all = await Profile.getAll(conn, [guid]);
    if (all.length === 0) throw new RPCException(`Default profile ${guid} not found`);
    return all[0]!;
  }
}
