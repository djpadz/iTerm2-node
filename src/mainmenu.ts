/**
 * Main menu access — port of `iterm2/mainmenu.py`. Selects iTerm2 menu items
 * and queries their state, plus a catalog of known menu identifiers.
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';

export class MenuItemException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MenuItemException';
  }
}

/** Current checked/enabled state of a menu item. */
export class MenuItemState {
  constructor(
    public readonly checked: boolean,
    public readonly enabled: boolean
  ) {}
}

/** Pair of (title, identifier) describing a menu item; identifier is what iTerm2 wants. */
export class MenuItemIdentifier {
  constructor(
    public readonly title: string,
    public readonly identifier: string | null
  ) {}

  toString(): string {
    return `[MenuItemIdentifier title=${this.title} id=${this.identifier}]`;
  }

  /** Encodes to the keybinding parameter form: `title\nidentifier`. */
  encode(): string {
    if (this.identifier == null) return this.title;
    return `${this.title}\n${this.identifier}`;
  }
}

// MenuItemResponse.Status values mirror api.proto: OK=0, BAD_IDENTIFIER=1, DISABLED=2.
const STATUS_NAMES: Record<number, string> = {
  0: 'OK',
  1: 'BAD_IDENTIFIER',
  2: 'DISABLED',
};

function statusName(status: number): string {
  return STATUS_NAMES[status] ?? `UNKNOWN(${status})`;
}

/**
 * Static entry-point for menu operations. Mirrors Python's `MainMenu`.
 */
export class MainMenu {
  /**
   * Select a menu item by identifier. See iTerm2 docs for the list of menu IDs.
   * @throws MenuItemException on failure.
   */
  static async selectMenuItem(conn: Connection, identifier: string): Promise<void> {
    const api = new Api(conn);
    const res = await api.menuItem({ identifier, queryOnly: false });
    const status = (res.status ?? 0) as number;
    if (status !== 0) {
      throw new MenuItemException(statusName(status));
    }
  }

  /**
   * Query the current state of a menu item.
   * @throws MenuItemException on failure.
   */
  static async getMenuItemState(
    conn: Connection,
    identifier: string
  ): Promise<MenuItemState> {
    const api = new Api(conn);
    const res = await api.menuItem({ identifier, queryOnly: true });
    const status = (res.status ?? 0) as number;
    if (status !== 0) {
      throw new MenuItemException(statusName(status));
    }
    return new MenuItemState(!!res.checked, !!res.enabled);
  }
}

// ---------------------------------------------------------------------------
// Menu identifier catalog.
//
// Python uses nested enums for namespacing. In TS we model each leaf as a
// `MenuItemIdentifier` constant grouped inside namespaces — same lookup syntax
// (e.g. `MenuIds.iTerm2.PREFERENCES.identifier`) and the values are real
// `MenuItemIdentifier` instances rather than enum members.
// ---------------------------------------------------------------------------

const M = (title: string, identifier: string): MenuItemIdentifier =>
  new MenuItemIdentifier(title, identifier);

export namespace MenuIds {
  export const iTerm2 = {
    ABOUT_ITERM2: M('About iTerm2', 'About iTerm2'),
    SHOW_TIP_OF_THE_DAY: M('Show Tip of the Day', 'Show Tip of the Day'),
    CHECK_FOR_UPDATES: M('Check for Updates…', 'Check For Updates…'),
    TOGGLE_DEBUG_LOGGING: M('Toggle Debug Logging', 'Toggle Debug Logging'),
    COPY_PERFORMANCE_STATS: M('Copy Performance Stats', 'Copy Performance Stats'),
    CAPTURE_GPU_FRAME: M('Capture GPU Frame', 'Capture Metal Frame'),
    PREFERENCES: M('Preferences...', 'Preferences...'),
    HIDE_ITERM2: M('Hide iTerm2', 'Hide iTerm2'),
    HIDE_OTHERS: M('Hide Others', 'Hide Others'),
    SHOW_ALL: M('Show All', 'Show All'),
    SECURE_KEYBOARD_ENTRY: M('Secure Keyboard Entry', 'Secure Keyboard Entry'),
    MAKE_ITERM2_DEFAULT_TERM: M('Make iTerm2 Default Term', 'Make iTerm2 Default Term'),
    MAKE_TERMINAL_DEFAULT_TERM: M('Make Terminal Default Term', 'Make Terminal Default Term'),
    INSTALL_SHELL_INTEGRATION: M('Install Shell Integration', 'Install Shell Integration'),
    QUIT_ITERM2: M('Quit iTerm2', 'Quit iTerm2'),
  } as const;

  export const Shell = {
    NEW_WINDOW: M('New Window', 'New Window'),
    NEW_WINDOW_WITH_CURRENT_PROFILE: M(
      'New Window with Current Profile',
      'New Window with Current Profile'
    ),
    NEW_TAB: M('New Tab', 'New Tab'),
    NEW_TAB_WITH_CURRENT_PROFILE: M(
      'New Tab with Current Profile',
      'New Tab with Current Profile'
    ),
    DUPLICATE_TAB: M('Duplicate Tab', 'Duplicate Tab'),
    SPLIT_HORIZONTALLY_WITH_CURRENT_PROFILE: M(
      'Split Horizontally with Current Profile',
      'Split Horizontally with Current Profile'
    ),
    SPLIT_VERTICALLY_WITH_CURRENT_PROFILE: M(
      'Split Vertically with Current Profile',
      'Split Vertically with Current Profile'
    ),
    SPLIT_HORIZONTALLY: M('Split Horizontally…', 'Split Horizontally…'),
    SPLIT_VERTICALLY: M('Split Vertically…', 'Split Vertically…'),
    SAVE_CONTENTS: M('Save Contents…', 'Log.SaveContents'),
    SAVE_SELECTED_TEXT: M('Save Selected Text…', 'Save Selected Text…'),
    CLOSE: M('Close', 'Close'),
    CLOSE_TERMINAL_WINDOW: M('Close Terminal Window', 'Close Terminal Window'),
    CLOSE_ALL_PANES_IN_TAB: M('Close All Panes in Tab', 'Close All Panes in Tab'),
    UNDO_CLOSE: M('Undo Close', 'Undo Close'),

    BroadcastInput: {
      SEND_INPUT_TO_CURRENT_SESSION_ONLY: M(
        'Send Input to Current Session Only',
        'Broadcast Input.Send Input to Current Session Only'
      ),
      BROADCAST_INPUT_TO_ALL_PANES_IN_ALL_TABS: M(
        'Broadcast Input to All Panes in All Tabs',
        'Broadcast Input.Broadcast Input to All Panes in All Tabs'
      ),
      BROADCAST_INPUT_TO_ALL_PANES_IN_CURRENT_TAB: M(
        'Broadcast Input to All Panes in Current Tab',
        'Broadcast Input.Broadcast Input to All Panes in Current Tab'
      ),
      TOGGLE_BROADCAST_INPUT_TO_CURRENT_SESSION: M(
        'Toggle Broadcast Input to Current Session',
        'Broadcast Input.Toggle Broadcast Input to Current Session'
      ),
      SHOW_BACKGROUND_PATTERN_INDICATOR: M(
        'Show Background Pattern Indicator',
        'Broadcast Input.Show Background Pattern Indicator'
      ),
    },

    tmux: {
      DETACH: M('Detach', 'tmux.Detach'),
      FORCE_DETACH: M('Force Detach', 'tmux.Force Detach'),
      NEW_TMUX_WINDOW: M('New Tmux Window', 'tmux.New Tmux Window'),
      NEW_TMUX_TAB: M('New Tmux Tab', 'tmux.New Tmux Tab'),
      PAUSE_PANE: M('Pause Pane', 'trmux.Pause Pane'),
      DASHBOARD: M('Dashboard', 'tmux.Dashboard'),
    },

    ssh: {
      DISCONNECT: M('Disconnect', 'ssh.Disconnect'),
      REMOVE_FILE_PROVIDER: M('Remove File Provider', 'ssh.Remove File Provider'),
      ADD_FILE_PROVIDER: M('Add File Provider', 'ssh.Add File Provider'),
    },

    PAGE_SETUP: M('Page Setup...', 'Page Setup...'),

    Print: {
      SCREEN: M('Screen', 'Print.Screen'),
      SELECTION: M('Selection', 'Print.Selection'),
      BUFFER: M('Buffer', 'Print.Buffer'),
    },
  } as const;

  export const Edit = {
    UNDO: M('Undo', 'Undo'),
    REDO: M('Redo', 'Redo'),
    CUT: M('Cut', 'Cut'),
    COPY: M('Copy', 'Copy'),
    COPY_WITH_STYLES: M('Copy with Styles', 'Copy with Styles'),
    COPY_WITH_CONTROL_SEQUENCES: M(
      'Copy with Control Sequences',
      'Copy with Control Sequences'
    ),
    COPY_MODE: M('Copy Mode', 'Copy Mode'),
    PASTE: M('Paste', 'Paste'),

    PasteSpecial: {
      ADVANCED_PASTE: M('Advanced Paste…', 'Paste Special.Advanced Paste…'),
      PASTE_SELECTION: M('Paste Selection', 'Paste Special.Paste Selection'),
      PASTE_FILE_BASE64ENCODED: M(
        'Paste File Base64-Encoded',
        'Paste Special.Paste File Base64-Encoded'
      ),
      PASTE_SLOWLY: M('Paste Slowly', 'Paste Special.Paste Slowly'),
      PASTE_FASTER: M('Paste Faster', 'Paste Special.Paste Faster'),
      PASTE_SLOWLY_FASTER: M('Paste Slowly Faster', 'Paste Special.Paste Slowly Faster'),
      PASTE_SLOWER: M('Paste Slower', 'Paste Special.Paste Slower'),
      PASTE_SLOWLY_SLOWER: M('Paste Slowly Slower', 'Paste Special.Paste Slowly Slower'),
      WARN_BEFORE_MULTILINE_PASTE: M(
        'Warn Before Multi-Line Paste',
        'Paste Special.Warn Before Multi-Line Paste'
      ),
      PROMPT_TO_CONVERT_TABS_TO_SPACES_WHEN_PASTING: M(
        'Prompt to Convert Tabs to Spaces when Pasting',
        'Paste Special.Prompt to Convert Tabs to Spaces when Pasting'
      ),
      LIMIT_MULTILINE_PASTE_WARNING_TO_SHELL_PROMPT: M(
        'Limit Multi-Line Paste Warning to Shell Prompt',
        'Paste Special.Limit Multi-Line Paste Warning to Shell Prompt'
      ),
      WARN_BEFORE_PASTING_ONE_LINE_ENDING_IN_A_NEWLINE_AT_SHELL_PROMPT: M(
        'Warn Before Pasting One Line Ending in a Newline at Shell Prompt',
        'Paste Special.Warn Before Pasting One Line Ending in a Newline at Shell Prompt'
      ),
    },

    RENDER_SELECTION: M('Render Selection', 'Render Selection Natively'),
    OPEN_SELECTION: M('Open Selection', 'Open Selection'),
    JUMP_TO_SELECTION: M('Jump to Selection', 'Find.Jump to Selection'),
    SELECT_ALL: M('Select All', 'Select All'),
    SELECTION_RESPECTS_SOFT_BOUNDARIES: M(
      'Selection Respects Soft Boundaries',
      'Selection Respects Soft Boundaries'
    ),
    SELECT_OUTPUT_OF_LAST_COMMAND: M(
      'Select Output of Last Command',
      'Select Output of Last Command'
    ),
    SELECT_CURRENT_COMMAND: M('Select Current Command', 'Select Current Command'),

    Find: {
      FIND: M('Find…', 'Find.Find...'),
      FIND_NEXT: M('Find Next', 'Find.Find Next'),
      FIND_PREVIOUS: M('Find Previous', 'Find.Find Previous'),
      USE_SELECTION_FOR_FIND: M('Use Selection for Find', 'Find.Use Selection for Find'),
      FIND_GLOBALLY: M('Find Globally...', 'Find.Find Globally...'),
      SELECT_MATCHES: M('Select Matches', 'Find.ConvertMatchesToSelections'),
      FIND_URLS: M('Find URLs', 'Find.Find URLs'),
      PICK_RESULT_TO_OPEN: M('Pick Result to Open', 'Find.Pick Result To Open'),
      FILTER: M('Filter', 'Find.Filter'),
    },

    MarksandAnnotations: {
      SET_MARK: M('Set Mark', 'Marks and Annotations.Set Mark'),
      JUMP_TO_MARK: M('Jump to Mark', 'Marks and Annotations.Jump to Mark'),
      NEXT_MARK: M('Next Mark', 'Marks and Annotations.Next Mark'),
      PREVIOUS_MARK: M('Previous Mark', 'Marks and Annotations.Previous Mark'),
      ADD_ANNOTATION_AT_CURSOR: M(
        'Add Annotation at Cursor',
        'Marks and Annotations.Add Annotation at Cursor'
      ),
      NEXT_ANNOTATION: M('Next Annotation', 'Marks and Annotations.Next  Annotation'),
      PREVIOUS_ANNOTATION: M(
        'Previous Annotation',
        'Marks and Annotations.Previous  Annotation'
      ),

      Alerts: {
        ALERT_ON_NEXT_MARK: M(
          'Alert on Next Mark',
          'Marks and Annotations.Alerts.Alert on Next Mark'
        ),
        SHOW_MODAL_ALERT_BOX: M(
          'Show Modal Alert Box',
          'Marks and Annotations.Alerts.Show Modal Alert Box'
        ),
        POST_NOTIFICATION: M(
          'Post Notification',
          'Marks and Annotations.Alerts.Post Notification'
        ),
      },
    },

    CLEAR_BUFFER: M('Clear Buffer', 'Clear Buffer'),
    CLEAR_SCROLLBACK_BUFFER: M('Clear Scrollback Buffer', 'Clear Scrollback Buffer'),
    CLEAR_TO_START_OF_SELECTION: M(
      'Clear to Start of Selection',
      'Clear to Start of Selection'
    ),
    CLEAR_TO_LAST_MARK: M('Clear to Last Mark', 'Clear to Last Mark'),
  } as const;

  export const View = {
    SHOW_TABS_IN_FULLSCREEN: M('Show Tabs in Fullscreen', 'Show Tabs in Fullscreen'),
    TOGGLE_FULL_SCREEN: M('Toggle Full Screen', 'Toggle Full Screen'),
    USE_TRANSPARENCY: M('Use Transparency', 'Use Transparency'),
    DISABLE_TRANSPARENCY_FOR_ACTIVE_WINDOW: M(
      'Disable Transparency for Active Window',
      'Disable Transparency for Active Window'
    ),
    ZOOM_IN_ON_SELECTION: M('Zoom In on Selection', 'Zoom In on Selection'),
    ZOOM_OUT: M('Zoom Out', 'Zoom Out'),
    FIND_CURSOR: M('Find Cursor', 'Find Cursor'),
    SHOW_CURSOR_GUIDE: M('Show Cursor Guide', 'Show Cursor Guide'),
    SHOW_TIMESTAMPS: M('Show Timestamps', 'Show Timestamps'),
    SHOW_ANNOTATIONS: M('Show Annotations', 'Show Annotations'),
    SHOW_COMPOSER: M('Show Composer', 'Composer'),
    AUTO_COMMAND_COMPLETION: M('Auto Command Completion', 'Auto Command Completion'),
    OPEN_QUICKLY: M('Open Quickly', 'Open Quickly'),
    MAXIMIZE_ACTIVE_PANE: M('Maximize Active Pane', 'Maximize Active Pane'),
    MAKE_TEXT_BIGGER: M('Make Text Bigger', 'Make Text Bigger'),
    MAKE_TEXT_NORMAL_SIZE: M('Make Text Normal Size', 'Make Text Normal Size'),
    RESTORE_TEXT_AND_SESSION_SIZE: M(
      'Restore Text and Session Size',
      'Restore Text and Session Size'
    ),
    MAKE_TEXT_SMALLER: M('Make Text Smaller', 'Make Text Smaller'),
    SIZE_CHANGES_UPDATE_PROFILE: M(
      'Size Changes Update Profile',
      'Size Changes Update Profile'
    ),
    START_INSTANT_REPLAY: M('Start Instant Replay', 'Start Instant Replay'),
  } as const;

  export const Session = {
    EDIT_SESSION: M('Edit Session…', 'Edit Session…'),
    RUN_COPROCESS: M('Run Coprocess…', 'Run Coprocess…'),
    STOP_COPROCESS: M('Stop Coprocess', 'Stop Coprocess'),
    RESTART_SESSION: M('Restart Session', 'Restart Session'),
    OPEN_AUTOCOMPLETE: M('Open Autocomplete…', 'Open Autocomplete…'),
    OPEN_COMMAND_HISTORY: M('Open Command History…', 'Open Command History…'),
    OPEN_RECENT_DIRECTORIES: M(
      'Open Recent Directories…',
      'Open Recent Directories…'
    ),
    OPEN_PASTE_HISTORY: M('Open Paste History…', 'Open Paste History…'),

    Triggers: {
      ADD_TRIGGER: M('Add Trigger…', 'Add Trigger'),
      EDIT_TRIGGERS: M('Edit Triggers', 'Edit Triggers'),
      ENABLE_TRIGGERS_IN_INTERACTIVE_APPS: M(
        'Enable Triggers in Interactive Apps',
        'Enable Triggers in Interactive Apps'
      ),
      ENABLE_ALL: M('Enable All', 'Triggers.Enable All'),
      DISABLE_ALL: M('Disable All', 'Triggers.Disable All'),
    },

    RESET: M('Reset', 'Reset'),
    RESET_CHARACTER_SET: M('Reset Character Set', 'Reset Character Set'),

    Log: {
      LOG_TO_FILE: M('Log to File', 'Log.Toggle'),
      IMPORT_RECORDING: M('Import Recording', 'Log.ImportRecording'),
      EXPORT_RECORDING: M('Export Recording', 'Log.ExportRecording'),
      /** @deprecated Moved elsewhere. */
      SAVE_CONTENTS: M('Save Contents…', 'Log.SaveContents'),
    },

    TerminalState: {
      ALTERNATE_SCREEN: M('Alternate Screen', 'Alternate Screen'),
      FOCUS_REPORTING: M('Focus Reporting', 'Focus Reporting'),
      MOUSE_REPORTING: M('Mouse Reporting', 'Mouse Reporting'),
      PASTE_BRACKETING: M('Paste Bracketing', 'Paste Bracketing'),
      APPLICATION_CURSOR: M('Application Cursor', 'Application Cursor'),
      APPLICATION_KEYPAD: M('Application Keypad', 'Application Keypad'),
      STANDARD_KEY_REPORTING_MODE: M(
        'Standard Key Reporting Mode',
        'Terminal State.Standard Key Reporting'
      ),
      MODIFYOTHERKEYS_MODE_1: M(
        'modifyOtherKeys Mode 1',
        'Terminal State.Report Modifiers like xterm 1'
      ),
      MODIFYOTHERKEYS_MODE_2: M(
        'modifyOtherKeys Mode 2',
        'Terminal State.Report Modifiers like xterm 2'
      ),
      CSI_U_MODE: M('CSI u Mode', 'Terminal State.Report Modifiers with CSI u'),
      RAW_KEY_REPORTING_MODE: M(
        'Raw Key Reporting Mode',
        'Terminal State.Raw Key Reporting'
      ),
      RESET: M('Reset', 'Reset Terminal State'),
    },

    BURY_SESSION: M('Bury Session', 'Bury Session'),
  } as const;

  export const Scripts = {
    Manage: {
      NEW_PYTHON_SCRIPT: M('New Python Script', 'New Python Script'),
      OPEN_PYTHON_REPL: M('Open Python REPL', 'Open Interactive Window'),
      MANAGE_DEPENDENCIES: M('Manage Dependencies…', 'Manage Dependencies'),
      INSTALL_PYTHON_RUNTIME: M('Install Python Runtime', 'Install Python Runtime'),
      REVEAL_SCRIPTS_IN_FINDER: M('Reveal Scripts in Finder', 'Reveal in Finder'),
      IMPORT: M('Import…', 'Import Script'),
      EXPORT: M('Export…', 'Export Script'),
      CONSOLE: M('Console', 'Script Console'),
    },
  } as const;

  export const Profiles = {
    OPEN_PROFILES: M('Open Profiles…', 'Open Profiles…'),
    PRESS_OPTION_FOR_NEW_WINDOW: M(
      'Press Option for New Window',
      'Press Option for New Window'
    ),
    OPEN_IN_NEW_WINDOW: M('Open In New Window', 'Open In New Window'),
  } as const;

  export const Toolbelt = {
    SHOW_TOOLBELT: M('Show Toolbelt', 'Show Toolbelt'),
    SET_DEFAULT_WIDTH: M('Set Default Width', 'Set Default Width'),
  } as const;

  export const Window = {
    MINIMIZE: M('Minimize', 'Minimize'),
    ZOOM: M('Zoom', 'Zoom'),
    EDIT_TAB_TITLE: M('Edit Tab Title', 'Edit Tab Title'),
    EDIT_WINDOW_TITLE: M('Edit Window Title', 'Edit Window Title'),

    WindowStyle: {
      NORMAL: M('Normal', 'Window Style.Normal'),
      FULL_SCREEN: M('Full Screen', 'Window Style.Full Screen'),
      MAXIMIZED: M('Maximized', 'Window Style.Maximized'),
      NO_TITLE_BAR: M('No Title Bar', 'Window Style.No Title Bar'),
      FULLWIDTH_BOTTOM_OF_SCREEN: M(
        'Full-Width Bottom of Screen',
        'Window Style.FullWidth Bottom of Screen'
      ),
      FULLWIDTH_TOP_OF_SCREEN: M(
        'Full-Width Top of Screen',
        'Window Style.FullWidth Top of Screen'
      ),
      FULLHEIGHT_LEFT_OF_SCREEN: M(
        'Full-Height Left of Screen',
        'Window Style..FullHeight Left of Screen'
      ),
      FULLHEIGHT_RIGHT_OF_SCREEN: M(
        'Full-Height Right of Screen',
        'Window Style.FullHeight Right of Screen'
      ),
      BOTTOM_OF_SCREEN: M('Bottom of Screen', 'Window Style.Bottom of Screen'),
      TOP_OF_SCREEN: M('Top of Screen', 'Window Style.Top of Screen'),
      LEFT_OF_SCREEN: M('Left of Screen', 'Window Style.Left of Screen'),
      RIGHT_OF_SCREEN: M('Right of Screen', 'Window Style.Right of Screen'),
    },

    MERGE_ALL_WINDOWS: M('Merge All Windows', 'Merge All Windows'),
    ARRANGE_WINDOWS_HORIZONTALLY: M(
      'Arrange Windows Horizontally',
      'Arrange Windows Horizontally'
    ),
    ARRANGE_SPLIT_PANES_EVENLY: M(
      'Arrange Split Panes Evenly',
      'Arrange Split Panes Evenly'
    ),
    MOVE_SESSION_TO_WINDOW: M('Move Session to Window', 'Move Session to Window'),
    SAVE_WINDOW_ARRANGEMENT: M('Save Window Arrangement', 'Save Window Arrangement'),
    SAVE_CURRENT_WINDOW_AS_ARRANGEMENT: M(
      'Save Current Window as Arrangement',
      'Save Current Window as Arrangement'
    ),

    SelectSplitPane: {
      SELECT_PANE_ABOVE: M('Select Pane Above', 'Select Split Pane.Select Pane Above'),
      SELECT_PANE_BELOW: M('Select Pane Below', 'Select Split Pane.Select Pane Below'),
      SELECT_PANE_LEFT: M('Select Pane Left', 'Select Split Pane.Select Pane Left'),
      SELECT_PANE_RIGHT: M('Select Pane Right', 'Select Split Pane.Select Pane Right'),
      NEXT_PANE: M('Next Pane', 'Select Split Pane.Next Pane'),
      PREVIOUS_PANE: M('Previous Pane', 'Select Split Pane.Previous Pane'),
    },

    ResizeSplitPane: {
      MOVE_DIVIDER_UP: M('Move Divider Up', 'Resize Split Pane.Move Divider Up'),
      MOVE_DIVIDER_DOWN: M('Move Divider Down', 'Resize Split Pane.Move Divider Down'),
      MOVE_DIVIDER_LEFT: M('Move Divider Left', 'Resize Split Pane.Move Divider Left'),
      MOVE_DIVIDER_RIGHT: M('Move Divider Right', 'Resize Split Pane.Move Divider Right'),
    },

    ResizeWindow: {
      DECREASE_HEIGHT: M('Decrease Height', 'Resize Window.Decrease Height'),
      INCREASE_HEIGHT: M('Increase Height', 'Resize Window.Increase Height'),
      DECREASE_WIDTH: M('Decrease Width', 'Resize Window.Decrease Width'),
      INCREASE_WIDTH: M('Increase Width', 'Resize Window.Increase Width'),
    },

    SELECT_NEXT_TAB: M('Select Next Tab', 'Select Next Tab'),
    SELECT_PREVIOUS_TAB: M('Select Previous Tab', 'Select Previous Tab'),
    MOVE_TAB_LEFT: M('Move Tab Left', 'Move Tab Left'),
    MOVE_TAB_RIGHT: M('Move Tab Right', 'Move Tab Right'),
    PASSWORD_MANAGER: M('Password Manager', 'Password Manager'),
    PIN_HOTKEY_WINDOW: M('Pin Hotkey Window', 'Pin Hotkey Window'),
    BRING_ALL_TO_FRONT: M('Bring All To Front', 'Bring All To Front'),
  } as const;

  export const Help = {
    ITERM2_HELP: M('iTerm2 Help', 'iTerm2 Help'),
    COPY_MODE_SHORTCUTS: M('Copy Mode Shortcuts', 'Copy Mode Shortcuts'),
    OPEN_SOURCE_LICENSES: M('Open Source Licenses', 'Open Source Licenses'),
    GPU_RENDERER_AVAILABILITY: M('GPU Renderer Availability', 'GPU Renderer Availability'),
  } as const;
}

// Re-exported solely so consumers can type fields as `iterm2.MenuItemResponse.Status`
// without importing the proto module directly. Not used internally.
export type _MenuItemStatus = iterm2.MenuItemResponse.Status;
