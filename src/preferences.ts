/**
 * Preferences API — port of `iterm2/preferences.py`.
 *
 * Read and write iTerm2 application preferences (non per-profile; use
 * Profile for those).
 */

import type { Connection } from './connection';
import { Api } from './api';
import { RPCException } from './session';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- preference values are arbitrary JSON
type PrefValue = any;

/** Keys identifying particular preference settings. */
export enum PreferenceKey {
  /** Open the profiles window at startup? Boolean. */
  OPEN_PROFILES_WINDOW_AT_START = 'OpenBookmark',
  /** Open default arrangement at startup? Boolean. */
  OPEN_DEFAULT_ARRANGEMENT_AT_START = 'OpenArrangementAtStartup',
  /** Restore only hotkey window at startup? Boolean. */
  RESTORE_ONLY_HOTKEY_AT_START = 'OpenNoWindowsAtStartup',
  /** Quit automatically when all terminal windows are closed? Boolean. */
  QUIT_WHEN_ALL_WINDOWS_CLOSED = 'QuitWhenAllWindowsClosed',
  /** Confirm close window when there are multiple tabs? Boolean. */
  ONLY_WHEN_MORE_TABS = 'OnlyWhenMoreTabs',
  /** Prompt before quitting? Boolean. */
  PROMPT_ON_QUIT = 'PromptOnQuit',
  /** Memory (in MB) per session for instant replay. Float. */
  INSTANT_REPLAY_MEMORY_MB = 'IRMemory',
  /** Save paste/command history to disk? Boolean. */
  SAVE_PASTE_HISTORY = 'SavePasteHistory',
  /** Discover hosts with bonjour? Boolean. */
  ENABLE_BONJOUR_DISCOVERY = 'EnableRendezvous',
  /** Auto-check for new iTerm2 versions? Boolean. */
  SOFTWARE_UPDATE_ENABLE_AUTOMATIC_CHECKS = 'SUEnableAutomaticChecks',
  /** Check for beta versions? Boolean. */
  SOFTWARE_UPDATE_ENABLE_TEST_RELEASES = 'CheckTestRelease',
  /** Load prefs from a custom folder? Boolean. */
  LOAD_PREFS_FROM_CUSTOM_FOLDER = 'LoadPrefsFromCustomFolder',
  /** If LOAD_PREFS_FROM_CUSTOM_FOLDER, the folder or URL to load from. String. */
  CUSTOM_FOLDER_TO_LOAD_PREFS_FROM = 'PrefsCustomFolder',
  /** Copy to pasteboard on selection? Boolean. */
  COPY_TO_PASTEBOARD_ON_SELECTION = 'CopySelection',
  /** Include trailing newline when copying? Boolean. */
  INCLUDE_TRAILING_NEWLINE_WHEN_COPYING = 'CopyLastNewline',
  /** Allow terminal apps to access the pasteboard? Boolean. */
  APPS_MAY_ACCESS_PASTEBOARD = 'AllowClipboardAccess',
  /** Characters considered part of a word for selection. String. */
  WORD_CHARACTERS = 'WordCharacters',
  /** Enable smart window placement? Boolean. */
  ENABLE_SMART_WINDOW_PLACEMENT = 'SmartPlacement',
  /** Change window size when font size changes? Boolean. */
  ADJUST_WINDOW_FOR_FONT_SIZE_CHANGE = 'AdjustWindowForFontSizeChange',
  /** When maximizing a window, grow vertically only? Boolean. */
  MAX_VERTICALLY = 'MaxVertically',
  /** Use native full screen window? Boolean. */
  NATIVE_FULL_SCREEN_WINDOWS = 'UseLionStyleFullscreen',
  /** How to open tmux windows. Int. 0=native, 1=new window, 2=tabs. */
  OPEN_TMUX_WINDOWS_IN = 'OpenTmuxWindowsIn',
  /** Open tmux dashboard if more than this many windows. Int. */
  TMUX_DASHBOARD_LIMIT = 'TmuxDashboardLimit',
  /** Automatically bury the tmux client session? Boolean. */
  AUTO_HIDE_TMUX_CLIENT_SESSION = 'AutoHideTmuxClientSession',
  /** Use dedicated tmux profile? Boolean. */
  USE_TMUX_PROFILE = 'TmuxUsesDedicatedProfile',
  /** Use the GPU renderer? Boolean. */
  USE_METAL = 'UseMetal',
  /** Disable GPU renderer when not on power? Boolean. */
  DISABLE_METAL_WHEN_UNPLUGGED = 'disableMetalWhenUnplugged',
  /** Prefer integrated GPU? Boolean. */
  PREFER_INTEGRATED_GPU = 'preferIntegratedGPU',
  /** Deprecated. Use MAXIMIZE_THROUGHPUT. */
  METAL_MAXIMIZE_THROUGHPUT = 'metalMaximizeThroughput',
  /** Maximize throughput vs framerate? Boolean. */
  MAXIMIZE_THROUGHPUT = 'metalMaximizeThroughput',
  /** Theme. Int. 0=Light, 1=Dark, 2=Light HC, 3=Dark HC, 4=Auto, 5=Minimal. */
  THEME = 'TabStyleWithAutomaticOption',
  /** Tab bar position. Int. 0=Top, 1=Bottom, 2=Left. */
  TAP_BAR_POSTIION = 'TabViewType',
  /** Hide tab bar when only one tab? Boolean. */
  HIDE_TAB_BAR_WHEN_ONLY_ONE_TAB = 'HideTab',
  /** Hide the tab number? Boolean. */
  HIDE_TAB_NUMBER = 'HideTabNumber',
  /** Hide the tab close button? Boolean. */
  HIDE_TAB_CLOSE_BUTTON = 'HideTabCloseButton',
  /** Hide the tab activity indicator? Boolean. */
  HIDE_TAB_ACTIVITY_INDICATOR = 'HideActivityIndicator',
  /** Show a "new output" indicator in tabs? Boolean. */
  SHOW_TAB_NEW_OUTPUT_INDICATOR = 'ShowNewOutputIndicator',
  /** Show a per-pane title bar? Boolean. */
  SHOW_PANE_TITLES = 'ShowPaneTitles',
  /** Stretch tabs horizontally to fill the tab bar? Boolean. */
  STRETCH_TABS_TO_FILL_BAR = 'StretchTabsToFillBar',
  /** Hide menu bar in full screen? Boolean. */
  HIDE_MENU_BAR_IN_FULLSCREEN = 'HideMenuBarInFullscreen',
  /** Exclude iTerm2 from dock and app switcher? Boolean. */
  HIDE_FROM_DOCK_AND_APP_SWITCHER = 'HideFromDockAndAppSwitcher',
  /** Flash tab bar in full screen? Boolean. */
  FLASH_TAB_BAR_IN_FULLSCREEN = 'FlashTabBarInFullscreen',
  /** Show window number in title bar? Boolean. */
  WINDOW_NUMBER = 'WindowNumber',
  /** Dim only text when indicating inactive sessions? Boolean. */
  DIM_ONLY_TEXT = 'DimOnlyText',
  /** How much to dim inactive split panes. Float in [0,1]. */
  SPLIT_PANE_DIMMING_AMOUNT = 'SplitPaneDimmingAmount',
  /** Dim inactive split panes? Boolean. */
  DIM_INACTIVE_SPLIT_PANES = 'DimInactiveSplitPanes',
  /** Show a border around windows? Boolean. */
  DRAW_WINDOW_BORDER = 'UseBorder',
  /** Hide scroll bars? Boolean. */
  HIDE_SCROLLBAR = 'HideScrollbar',
  /** Disable transparency for full-screen windows? Boolean. */
  DISABLE_FULLSCREEN_TRANSPARENCY = 'DisableFullscreenTransparency',
  /** Draw a line under the tab bar? Boolean. */
  ENABLE_DIVISION_VIEW = 'EnableDivisionView',
  /** Show proxy icon in title bar? Boolean. */
  ENABLE_PROXY_ICON = 'EnableProxyIcon',
  /** Dim inactive windows? Boolean. */
  DIM_BACKGROUND_WINDOWS = 'DimBackgroundWindows',
  /** Remap control key. Int. 1=Control 2=LOpt 3=ROpt 7=LCmd 8=RCmd. */
  CONTROL_REMAPPING = 'Control',
  /** Remap left option key. Int. */
  LEFT_OPTION_REMAPPING = 'LeftOption',
  /** Remap right option key. Int. */
  RIGHT_OPTION_REMAPPING = 'RightOption',
  /** Remap left cmd key. Int. */
  LEFT_COMMAND_REMAPPING = 'LeftCommand',
  /** Remap right cmd key. Int. */
  RIGHT_COMMAND_REMAPPING = 'RightCommand',
  /** Modifiers to switch split pane by number. Int. 3=Cmd 6=Cmd+Opt 5=Opt 9=Off. */
  SWITCH_PANE_MODIFIER = 'SwitchPaneModifier',
  /** Modifiers to switch tab by number. Int. */
  SWITCH_TAB_MODIFIER = 'SwitchTabModifier',
  /** Modifiers to switch window by number. Int. */
  SWITCH_WINDOW_MODIFIER = 'SwitchWindowModifier',
  /** Enable semantic history? Boolean. */
  ENABLE_SEMANTIC_HISTORY = 'CommandSelection',
  /** Pass control-click to mouse reporting? Boolean. */
  PASS_ON_CONTROL_CLICK = 'PassOnControlClick',
  /** Opt-click moves cursor? Boolean. */
  OPTION_CLICK_MOVES_CURSOR = 'OptionClickMovesCursor',
  /** Three-finger tap emulates middle click? Boolean. */
  THREE_FINGER_EMULATES = 'ThreeFingerEmulates',
  /** Focus follows mouse? Boolean. */
  FOCUS_FOLLOWS_MOUSE = 'FocusFollowsMouse',
  /** Triple click selects full wrapped lines? Boolean. */
  TRIPLE_CLICK_SELECTS_FULL_WRAPPED_LINES = 'TripleClickSelectsFullWrappedLines',
  /** Double click performs smart selection? Boolean. */
  DOUBLE_CLICK_PERFORMS_SMART_SELECTION = 'DoubleClickPerformsSmartSelection',
  /** Last-used iTerm2 version. Do not set. String. */
  ITERM_VERSION = 'iTerm Version',
  /** Enable autocomplete with command history? Boolean. */
  AUTO_COMMAND_HISTORY = 'AutoCommandHistory',
  /** Default paste chunk size. Positive int. */
  PASTE_SPECIAL_CHUNK_SIZE = 'PasteSpecialChunkSize',
  /** Default delay between paste chunks. Float. */
  PASTE_SPECIAL_CHUNK_DELAY = 'PasteSpecialChunkDelay',
  /** Default spaces per tab when converting on paste. Positive int. */
  NUMBER_OF_SPACES_PER_TAB = 'NumberOfSpacesPerTab',
  /** How to transform tabs on paste. Int. 0=None, 1=Spaces, 2=Escape C-V. */
  TAB_TRANSFORM = 'TabTransform',
  /** Escape shell chars with backslash on advanced paste? Boolean. */
  ESCAPE_SHELL_CHARS_WITH_BACKSLASH = 'EscapeShellCharsWithBackslash',
  /** Convert unicode punctuation to ascii on advanced paste? Boolean. */
  CONVERT_UNICODE_PUNCTUATION = 'ConvertUnicodePunctuation',
  /** Convert DOS newlines to Unix on advanced paste? Boolean. */
  CONVERT_DOS_NEWLINES = 'ConvertDosNewlines',
  /** Remove control codes on advanced paste? Boolean. */
  REMOVE_CONTROL_CODES = 'RemoveControlCodes',
  /** Allow bracketed paste mode on advanced paste? Boolean. */
  BRACKETED_PASTE_MODE = 'BracketedPasteMode',
  /** Enable regex substitution on advanced paste? Boolean. */
  PASTE_SPECIAL_USE_REGEX_SUBSTITUTION = 'PasteSpecialUseRegexSubstitution',
  /** Regex pattern for advanced paste substitution. String. */
  PASTE_SPECIAL_REGEX = 'PasteSpecialRegex',
  /** Substitution value for advanced paste. String. */
  PASTE_SPECIAL_SUBSTITUTION = 'PasteSpecialSubstitution',
  /** Width of left-side tab bar. Float. */
  LEFT_TAB_BAR_WIDTH = 'LeftTabBarWidth',
  /** Spaces to use when converting tabs to spaces. Non-negative int. */
  PASTE_TAB_TO_STRING_TAB_STOP_SIZE = 'PasteTabToStringTabStopSize',
  /** Show tab bar in full screen? Boolean. */
  SHOW_FULL_SCREEN_TAB_BAR = 'ShowFullScreenTabBar',
  /** Default toolbelt width. Non-negative int. */
  DEFAULT_TOOLBELT_WIDTH = 'Default Toolbelt Width',
  /** DEPRECATED — use TEXT_SIZE_CHANGES_AFFECT_PROFILE. */
  SIZE_CHANGES_AFFECT_PROFILE = 'Size Changes Affect Profile',
  /** Status bar position. Int. 0=top, 1=bottom. */
  STATUS_BAR_POSITION = 'StatusBarPosition',
  /** Keep window size the same when tabbar visibility changes? Boolean. */
  PRESERVE_WINDOW_SIZE_WHEN_TAB_BAR_VISIBILITY_CHANGES = 'PreserveWindowSizeWhenTabBarVisibilityChanges',
  /** Per-pane bg image, or one for the whole window? Boolean. */
  PER_PANE_BACKGROUND_IMAGE = 'PerPaneBackgroundImage',
  /** Per-pane status bar, or one for the whole window? Boolean. */
  PER_PANE_STATUS_BAR = 'SeparateStatusBarsPerPane',
  /** Emulate US keyboard for switching tabs/panes/windows? Boolean. */
  EMULATE_US_KEYBOARD = 'UseVirtualKeyCodesForDetectingDigits',
  /** Does increasing/decreasing text size update the profile? Boolean. */
  TEXT_SIZE_CHANGES_AFFECT_PROFILE = 'Size Changes Affect Profile',
  /** Array of dictionaries defining actions. */
  ACTIONS = 'Actions',
  /** Support basic HTML tags in tab titles. */
  HTML_TAB_TITLES = 'HTMLTabTitles',
  /** Force key window to be opaque? */
  DISABLE_TRANSPARENCY_FOR_KEY_WINDOW = 'DisableTransparencyForKeyWindow',
}

const SET_PREFERENCE_STATUS_OK = 0;

function keyValue(key: PreferenceKey | string): string {
  return typeof key === 'string' ? key : (key as string);
}

/**
 * Get a preference by key. Returns `null` if unset and no default exists.
 */
export async function getPreference(
  conn: Connection,
  key: PreferenceKey | string
): Promise<PrefValue | null> {
  const api = new Api(conn);
  const res = await api.preferences({
    requests: [{ getPreferenceRequest: { key: keyValue(key) } }],
  });
  const first = res.results?.[0];
  const json = first?.getPreferenceResult?.jsonValue;
  if (json == null || json === '') return null;
  return JSON.parse(json);
}

/**
 * Set a preference by key. Pass `null` to unset.
 */
export async function setPreference(
  conn: Connection,
  key: PreferenceKey | string,
  value: PrefValue | null
): Promise<void> {
  const api = new Api(conn);
  const res = await api.preferences({
    requests: [
      {
        setPreferenceRequest: {
          key: keyValue(key),
          jsonValue: JSON.stringify(value),
        },
      },
    ],
  });
  const status = (res.results?.[0]?.setPreferenceResult?.status ??
    SET_PREFERENCE_STATUS_OK) as number;
  if (status !== SET_PREFERENCE_STATUS_OK) {
    throw new RPCException(`setPreference failed status=${status}`);
  }
}
