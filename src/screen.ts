/**
 * Screen access — port of `iterm2/screen.py`. Provides the ScreenContents /
 * LineContents wrappers around a GetBufferResponse, plus per-cell styling
 * (CellStyle, RGBColor, URL) and ScreenStreamer for waiting on updates.
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import {
  CoordRange,
  Point,
  Range as UtilRange,
  WindowedCoordRange,
} from './util';
import { RPCException } from './session';
import {
  subscribeToScreenUpdateNotification,
  unsubscribe,
  type SubscriptionToken,
} from './notifications';

const GET_BUFFER_STATUS_OK = 0;

// ---------------------------------------------------------------------------
// Cell style helpers
// ---------------------------------------------------------------------------

/** RGB color in sRGB with 8-bit integer components. */
export class CellStyleRGBColor {
  constructor(private readonly _color: iterm2.RGBColor.$Properties) {}

  get red(): number {
    return this._color.red ?? 0;
  }

  get green(): number {
    return this._color.green ?? 0;
  }

  get blue(): number {
    return this._color.blue ?? 0;
  }
}

/** Hyperlink (OSC 8) URL with optional identifier. */
export class CellStyleURL {
  constructor(private readonly _url: iterm2.URL.$Properties) {}

  get url(): string {
    return this._url.url ?? '';
  }

  /** Optional identifier, or `null` if not set. */
  get identifier(): string | null {
    return this._url.identifier ?? null;
  }
}

/** Mirrors `iterm2.AlternateColor`. */
export enum CellStyleAlternateColor {
  /** Default text or background color. */
  DEFAULT = 0,
  /** Default text or background color with roles reversed. */
  REVERSED_DEFAULT = 3,
  /** A message from the terminal emulator itself (e.g. "session ended"). */
  SYSTEM_MESSAGE = 4,
}

/** Mirrors `iterm2.ImagePlaceholderType`. */
export enum CellStyleImagePlaceholderType {
  NONE = 0,
  ITERM2 = 1,
  KITTY = 2,
}

/**
 * A color that can be standard, alternate, RGB, or a graphics placement.
 *
 * - A standard color is part of the 256-color palette (0-15 ANSI, 16-231 RGB,
 *   232-255 grayscale).
 * - Alternate colors are listed in `CellStyleAlternateColor`.
 * - RGB colors are 24-bit sRGB.
 * - A placement gives the X or Y coordinate of an image in the Kitty
 *   graphics protocol.
 */
export class CellStyleColor {
  constructor(
    private readonly _standard: number | null = null,
    private readonly _alternate: CellStyleAlternateColor | null = null,
    private readonly _rgb: CellStyleRGBColor | null = null,
    private readonly _placement: number | null = null
  ) {}

  get isStandard(): boolean {
    return this._standard !== null;
  }

  get isAlternate(): boolean {
    return this._alternate !== null;
  }

  get isRgb(): boolean {
    return this._rgb !== null;
  }

  get standard(): number {
    if (this._standard === null) throw new Error('Not a standard color');
    return this._standard;
  }

  get alternate(): CellStyleAlternateColor {
    if (this._alternate === null) throw new Error('Not an alternate color');
    return this._alternate;
  }

  get rgb(): CellStyleRGBColor {
    if (this._rgb === null) throw new Error('Not an RGB color');
    return this._rgb;
  }

  get placement(): number {
    if (this._placement === null) throw new Error('Not an alternate placement');
    return this._placement;
  }
}

/** Describes the appearance of a single cell (color + text properties). */
export class CellStyle {
  constructor(private readonly _proto: iterm2.CellStyle.$Properties) {}

  /** Number of consecutive cells sharing this style. */
  get repeats(): number {
    return this._proto.repeats ?? 0;
  }

  /** Foreground color. */
  get fgColor(): CellStyleColor {
    const which = this._proto.fgColor;
    if (which === 'fgStandard') {
      return new CellStyleColor(this._proto.fgStandard ?? 0);
    }
    if (which === 'fgAlternate') {
      return new CellStyleColor(
        null,
        (this._proto.fgAlternate ?? 0) as unknown as CellStyleAlternateColor
      );
    }
    if (which === 'fgRgb') {
      return new CellStyleColor(
        null,
        null,
        new CellStyleRGBColor(this._proto.fgRgb ?? {})
      );
    }
    if (which === 'fgAlternatePlacementX') {
      return new CellStyleColor(
        null,
        null,
        null,
        this._proto.fgAlternatePlacementX ?? 0
      );
    }
    return new CellStyleColor();
  }

  /** Background color. */
  get bgColor(): CellStyleColor {
    const which = this._proto.bgColor;
    if (which === 'bgStandard') {
      return new CellStyleColor(this._proto.bgStandard ?? 0);
    }
    if (which === 'bgAlternate') {
      return new CellStyleColor(
        null,
        (this._proto.bgAlternate ?? 0) as unknown as CellStyleAlternateColor
      );
    }
    if (which === 'bgRgb') {
      return new CellStyleColor(
        null,
        null,
        new CellStyleRGBColor(this._proto.bgRgb ?? {})
      );
    }
    if (which === 'bgAlternatePlacementY') {
      return new CellStyleColor(
        null,
        null,
        null,
        this._proto.bgAlternatePlacementY ?? 0
      );
    }
    return new CellStyleColor();
  }

  get bold(): boolean {
    return this._proto.bold ?? false;
  }

  get faint(): boolean {
    return this._proto.faint ?? false;
  }

  get italic(): boolean {
    return this._proto.italic ?? false;
  }

  get blink(): boolean {
    return this._proto.blink ?? false;
  }

  get underline(): boolean {
    return this._proto.underline ?? false;
  }

  get strikethrough(): boolean {
    return this._proto.strikethrough ?? false;
  }

  get invisible(): boolean {
    return this._proto.invisible ?? false;
  }

  get inverse(): boolean {
    return this._proto.inverse ?? false;
  }

  /**
   * Whether the cell is guarded. Guarded cells can't be erased when the
   * screen is in protected mode (see DECSCA, SPA, EPA).
   */
  get guarded(): boolean {
    return this._proto.guarded ?? false;
  }

  /** Image placeholder type, or `null` if this cell isn't an image cell. */
  get image(): CellStyleImagePlaceholderType | null {
    if (this._proto.image == null) return null;
    return this._proto.image as unknown as CellStyleImagePlaceholderType;
  }

  /** Underline color, or `null` if not set. */
  get underlineColor(): CellStyleRGBColor | null {
    return this._proto.underlineColor
      ? new CellStyleRGBColor(this._proto.underlineColor)
      : null;
  }

  /** Block ID (set by OSC 1337 ; Block), or `null`. */
  get blockId(): string | null {
    return this._proto.blockID ?? null;
  }

  /** OSC 8 URL, or `null`. */
  get url(): CellStyleURL | null {
    return this._proto.url ? new CellStyleURL(this._proto.url) : null;
  }
}

// ---------------------------------------------------------------------------
// LineContents
// ---------------------------------------------------------------------------

// Continuation enum values (iterm2.LineContents.Continuation)
const CONTINUATION_HARD_EOL = 1;

/** Describes the contents of a single line, including per-cell styles. */
export class LineContents {
  private readonly _proto: iterm2.LineContents.$Properties;
  private readonly _offsetOfCell: number[] = [0];
  private readonly _lengthOfCell: number[] = [];
  private readonly _styles: CellStyle[] = [];

  constructor(proto: iterm2.LineContents.$Properties) {
    this._proto = proto;
    let offset = 0;
    for (const cppc of proto.codePointsPerCell ?? []) {
      const repeats = cppc.repeats ?? 0;
      const num = cppc.numCodePoints ?? 0;
      for (let i = 0; i < repeats; i++) {
        offset += num;
        this._offsetOfCell.push(offset);
        this._lengthOfCell.push(num);
      }
    }
    for (const style of proto.style ?? []) {
      const cs = new CellStyle(style);
      const repeats = style.repeats ?? 0;
      for (let i = 0; i < repeats; i++) {
        this._styles.push(cs);
      }
    }
  }

  /** The line's contents as a string. */
  get string(): string {
    return this._proto.text ?? '';
  }

  /**
   * The string of the cell at index `x`, or empty string if none.
   */
  stringAt(x: number): string {
    if (x < 0 || x >= this._lengthOfCell.length) return '';
    const offset = this._offsetOfCell[x]!;
    const limit = offset + this._lengthOfCell[x]!;
    return (this._proto.text ?? '').slice(offset, limit);
  }

  /**
   * The style of the cell at index `x`, or `null` if out of range
   * (uninitialized cells are also considered out of range).
   */
  styleAt(x: number): CellStyle | null {
    if (x >= 0 && x < this._styles.length) {
      return this._styles[x]!;
    }
    return null;
  }

  /**
   * `true` if the line has a hard newline. If `false`, the text wraps onto
   * the next line.
   */
  get hardEol(): boolean {
    return (this._proto.continuation ?? 0) === CONTINUATION_HARD_EOL;
  }
}

// ---------------------------------------------------------------------------
// ScreenContents
// ---------------------------------------------------------------------------

/** Describes the contents of the visible screen + optional scrollback range. */
export class ScreenContents {
  constructor(private readonly _proto: iterm2.GetBufferResponse.$Properties) {}

  /** The coordinate range the lines in this object span. */
  get windowedCoordRange(): WindowedCoordRange {
    const wcr = this._proto.windowedCoordRange ?? {};
    const cr = wcr.coordRange ?? {};
    const cols = wcr.columns ?? {};
    return new WindowedCoordRange(
      new CoordRange(
        new Point(cr.start?.x ?? 0, cr.start?.y ?? 0),
        new Point(cr.end?.x ?? 0, cr.end?.y ?? 0)
      ),
      new UtilRange(cols.location ?? 0, cols.length ?? 0)
    );
  }

  /** Number of lines in this object. */
  get numberOfLines(): number {
    return (this._proto.contents ?? []).length;
  }

  /**
   * The `LineContents` at the given index. `index` must be in
   * `[0, numberOfLines)`.
   */
  line(index: number): LineContents {
    const c = (this._proto.contents ?? [])[index];
    if (!c) throw new RangeError(`line index out of range: ${index}`);
    return new LineContents(c);
  }

  /** Cursor location. */
  get cursorCoord(): Point {
    const c = this._proto.cursor ?? {};
    return new Point(c.x ?? 0, c.y ?? 0);
  }

  /**
   * Number of lines before the screen including scrollback history and
   * lines lost from the head of scrollback history.
   */
  get numberOfLinesAboveScreen(): number {
    return this._proto.numLinesAboveScreen ?? 0;
  }
}

// ---------------------------------------------------------------------------
// ScreenStreamer
// ---------------------------------------------------------------------------

type ScreenUpdateNotif = iterm2.ScreenUpdateNotification.$Properties;

/**
 * Wraps screen-update notifications so callers can `await` the next change.
 *
 * Don't construct this directly — use `Session.getScreenStreamer()`. Always
 * `start()` before calling `get()` and `stop()` when done (or use
 * `ScreenStreamer.with()`).
 */
export class ScreenStreamer {
  private _token: SubscriptionToken<ScreenUpdateNotif> | null = null;
  private _waiter: ((notif: ScreenUpdateNotif) => void) | null = null;
  private _pending: ScreenUpdateNotif | null = null;

  constructor(
    public readonly connection: Connection,
    public readonly sessionId: string,
    public readonly wantContents: boolean = true
  ) {
    if (sessionId === 'all') {
      throw new Error('ScreenStreamer requires a specific session ID');
    }
  }

  /** Subscribe to screen-update notifications. */
  async start(): Promise<this> {
    if (this._token) return this;
    this._token = await subscribeToScreenUpdateNotification(
      this.connection,
      async (_c, notif) => this._onUpdate(notif),
      { session: this.sessionId }
    );
    return this;
  }

  /** Unsubscribe. Safe to call multiple times. */
  async stop(): Promise<void> {
    if (!this._token) return;
    try {
      await unsubscribe(this.connection, this._token);
    } catch {
      /* ignore */
    }
    this._token = null;
  }

  private _onUpdate(notif: ScreenUpdateNotif): void {
    // Match the Python "ignore reentrant" semantics: only one waiter at a time.
    if (this._waiter) {
      const w = this._waiter;
      this._waiter = null;
      w(notif);
    } else {
      // Coalesce — only remember the most recent update if no waiter present.
      this._pending = notif;
    }
  }

  private _next(): Promise<ScreenUpdateNotif> {
    if (this._pending) {
      const n = this._pending;
      this._pending = null;
      return Promise.resolve(n);
    }
    return new Promise((resolve) => {
      this._waiter = resolve;
    });
  }

  /**
   * Block until the screen contents change.
   *
   * If this streamer was configured with `wantContents=true` (the default),
   * the new screen contents are fetched and returned. Otherwise resolves to
   * `null`.
   *
   * @throws {RPCException} on RPC failure.
   */
  async get(style: boolean = false): Promise<ScreenContents | null> {
    await this._next();
    if (!this.wantContents) return null;
    const api = new Api(this.connection);
    const res = await api.getBuffer({
      session: this.sessionId,
      lineRange: { screenContentsOnly: true },
      includeStyles: style,
    });
    if ((res.status ?? 0) !== GET_BUFFER_STATUS_OK) {
      throw new RPCException(`getBuffer failed status=${res.status}`);
    }
    return new ScreenContents(res);
  }

  /** Convenience: run `fn(streamer)` between start and stop. */
  static async with<T>(
    connection: Connection,
    sessionId: string,
    wantContents: boolean,
    fn: (streamer: ScreenStreamer) => Promise<T>
  ): Promise<T> {
    const streamer = await new ScreenStreamer(
      connection,
      sessionId,
      wantContents
    ).start();
    try {
      return await fn(streamer);
    } finally {
      await streamer.stop();
    }
  }
}
