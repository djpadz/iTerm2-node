/**
 * Selection — port of `iterm2/selection.py`. Wraps the proto SubSelection /
 * Selection messages with helpers for fetching the underlying text and
 * enumerating ranges across multi-line selections.
 */

import type { Connection } from './connection';
import { Api } from './api';
import type { iterm2 } from './generated/api';
import {
  CoordRange,
  Point,
  Range,
  WindowedCoordRange,
} from './util';
import { RPCException } from './session';
import { ScreenContents } from './screen';

const GET_BUFFER_STATUS_OK = 0;

/** Modes for selecting text. Values match `iterm2.SelectionMode` in the proto. */
export enum SelectionMode {
  /** character-by-character selection */
  CHARACTER = 0,
  /** word-by-word selection */
  WORD = 1,
  /** row-by-row selection */
  LINE = 2,
  /** smart selection */
  SMART = 3,
  /** rectangular region */
  BOX = 4,
  /** entire wrapped lines, which could occupy many rows */
  WHOLE_LINE = 5,
}

/** Convert a proto value to a `SelectionMode`. */
export function selectionModeFromProto(value: number): SelectionMode {
  return value as SelectionMode;
}

/** Convert a `SelectionMode` to its proto value. */
export function selectionModeToProto(mode: SelectionMode): number {
  return mode as number;
}

/** Internal helper to fetch the text in a WindowedCoordRange. */
async function fetchStringInRange(
  connection: Connection,
  sessionId: string,
  range: WindowedCoordRange
): Promise<string> {
  const api = new Api(connection);
  const res = await api.getBuffer({
    session: sessionId,
    lineRange: { windowedCoordRange: range.proto },
  });
  if ((res.status ?? 0) !== GET_BUFFER_STATUS_OK) {
    throw new RPCException(`getBuffer failed status=${res.status}`);
  }
  const contents = new ScreenContents(res);
  let built = '';
  const n = contents.numberOfLines;
  for (let i = 0; i < n; i++) {
    const line = contents.line(i);
    built += line.string;
    if (line.hardEol) built += '\n';
  }
  return built;
}

/** Callback signature for `SubSelection.enumerateRanges`. */
type SubRangeCallback = (
  range: CoordRange,
  sub?: SubSelection
) => void;

/**
 * A contiguous block of selected characters.
 *
 * @param windowedCoordRange The range spanned by this sub-selection.
 * @param mode How the selection is interpreted and extended.
 * @param connected If true, no newline exists between this and the next
 *   sub-selection.
 */
export class SubSelection {
  constructor(
    private readonly _windowedCoordRange: WindowedCoordRange,
    private readonly _mode: SelectionMode,
    private readonly _connected: boolean
  ) {}

  get windowedCoordRange(): WindowedCoordRange {
    return this._windowedCoordRange;
  }

  get mode(): SelectionMode {
    return this._mode;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** Build the proto representation of this sub-selection. */
  get proto(): iterm2.SubSelection.$Properties {
    return {
      windowedCoordRange: this._windowedCoordRange.proto,
      selectionMode: selectionModeToProto(this._mode) as unknown as iterm2.SelectionMode,
    };
  }

  /** Fetch the text belonging to this sub-selection. */
  async getString(
    connection: Connection,
    sessionId: string
  ): Promise<string> {
    return fetchStringInRange(connection, sessionId, this._windowedCoordRange);
  }

  /**
   * Invoke `callback` for each underlying `CoordRange` of this sub-selection.
   * If the sub-selection is windowed (rectangular over multiple rows), each
   * row produces a separate range.
   */
  enumerateRanges(callback: SubRangeCallback): void {
    const wcr = this._windowedCoordRange;
    if (wcr.hasWindow) {
      const right = wcr.right;
      let startX = wcr.start.x;
      let y = wcr.coordRange.start.y;
      while (y < wcr.coordRange.end.y) {
        callback(
          new CoordRange(new Point(startX, y), new Point(right, y))
        );
        startX = wcr.left;
        y += 1;
      }
      callback(
        new CoordRange(
          new Point(startX, wcr.coordRange.end.y),
          new Point(wcr.end.x, wcr.coordRange.end.y)
        )
      );
    } else {
      callback(wcr.coordRange, this);
    }
  }
}

/** Callback for `Selection.enumerateRanges`. Return `true` to stop iteration. */
type SelectionRangeCallback = (
  range: WindowedCoordRange,
  eol: boolean
) => Promise<boolean | void> | boolean | void;

/**
 * A collection of `SubSelection`s describing all selections in a session.
 */
export class Selection {
  constructor(private readonly _subSelections: SubSelection[]) {}

  /** Returns the set of subselections. */
  get subSelections(): SubSelection[] {
    return this._subSelections;
  }

  private async _getContentInRange(
    connection: Connection,
    sessionId: string,
    coordRange: WindowedCoordRange
  ): Promise<string> {
    return fetchStringInRange(connection, sessionId, coordRange);
  }

  /**
   * Returns the concatenated selected text.
   *
   * @param width The width (in columns) of the session.
   */
  async getString(
    connection: Connection,
    sessionId: string,
    width: number
  ): Promise<string> {
    if (this._subSelections.length === 1) {
      return this._subSelections[0]!.getString(connection, sessionId);
    }
    let result = '';
    await this.enumerateRanges(width, async (coordRange, eol) => {
      const content = await this._getContentInRange(
        connection,
        sessionId,
        coordRange
      );
      result += content;
      if (eol && !content.endsWith('\n')) {
        result += '\n';
      }
    });
    return result;
  }

  /**
   * Enumerates the underlying ranges that make up this selection in
   * top-to-bottom order, calling `callback` for each. Coalesces overlapping
   * sub-selections so each cell is visited once. The boolean argument is true
   * when there is a hard EOL at the end of the range.
   */
  async enumerateRanges(
    width: number,
    callback: SelectionRangeCallback
  ): Promise<void> {
    if (this._subSelections.length === 0) return;

    // Ranges ending at connectors don't get a newline following.
    const connectors = new Set<number>();
    const indexes = new Set<number>();

    for (const outer of this._subSelections) {
      if (outer.connected) {
        const wcr = outer.windowedCoordRange;
        const thePosition =
          wcr.coordRange.end.x + wcr.coordRange.end.y * width;
        connectors.add(thePosition);
      }

      outer.enumerateRanges((outerRange) => {
        const theRange = new Range(
          outerRange.start.x + outerRange.start.y * width,
          outerRange.length(width)
        );

        // Track which indexes are added (start with all in this range).
        const indexesToAdd = theRange.toSet;
        const indexesToRemove = new Set<number>();
        for (const i of indexesToAdd) {
          if (indexes.has(i)) {
            indexesToRemove.add(i);
          }
        }
        // Remove overlap from both: we then keep what was in `indexes` only.
        for (const i of indexesToRemove) {
          indexesToAdd.delete(i);
        }
        for (const i of indexesToRemove) {
          indexes.delete(i);
        }
        for (const i of indexesToAdd) {
          indexes.add(i);
        }

        // In multipart windowed ranges, add connectors for the endpoint of
        // all but the last range. Each enumerated range is on its own line.
        const wcr = outer.windowedCoordRange;
        if (
          wcr.hasWindow &&
          outerRange.end.x === wcr.coordRange.end.x &&
          outerRange.end.y === wcr.coordRange.end.y &&
          theRange.length > 0
        ) {
          connectors.add(theRange.max);
        }
      });
    }

    // Build contiguous coord ranges from the surviving indexes.
    const sortedIndexes = Array.from(indexes).sort((a, b) => a - b);
    const allRanges: CoordRange[] = [];
    let runStart = -1;
    let runPrev = -1;
    const flush = (): void => {
      if (runStart < 0) return;
      allRanges.push(
        new CoordRange(
          new Point(runStart % width, Math.floor(runStart / width)),
          new Point(runPrev % width, Math.floor(runPrev / width))
        )
      );
      runStart = -1;
      runPrev = -1;
    };
    for (const idx of sortedIndexes) {
      if (runStart < 0) {
        runStart = idx;
        runPrev = idx;
      } else if (idx === runPrev + 1) {
        runPrev = idx;
      } else {
        flush();
        runStart = idx;
        runPrev = idx;
      }
    }
    flush();

    // Sort by linear position (already in order, but mirror Python).
    allRanges.sort(
      (a, b) => a.start.y * width + a.start.x - (b.start.y * width + b.start.x)
    );

    for (let idx = 0; idx < allRanges.length; idx++) {
      const theRange = allRanges[idx]!;
      const endIndex =
        theRange.start.x + theRange.start.y * width + theRange.length(width);
      const eol =
        !connectors.has(endIndex) && idx + 1 < allRanges.length;
      // Python mutates: the_range.end.x += 1 then wraps in WindowedCoordRange.
      const adjustedEnd = new Point(theRange.end.x + 1, theRange.end.y);
      const adjusted = new CoordRange(theRange.start, adjustedEnd);
      const stop = await callback(new WindowedCoordRange(adjusted), eol);
      if (stop) break;
    }
  }
}
