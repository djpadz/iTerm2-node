/**
 * Value types — Size, Point, Frame, Range, CoordRange, WindowedCoordRange —
 * plus iTerm2 expression encoding. Ports `iterm2/util.py`.
 */

import type { iterm2 } from './generated/api';

export interface SizeProto {
  width: number;
  height: number;
}
export interface CoordProto {
  x: number;
  y: number;
}
export interface RangeProto {
  location: number;
  length: number;
}

export class Size {
  constructor(public width: number, public height: number) {}

  get dict(): SizeProto {
    return { width: this.width, height: this.height };
  }

  get json(): string {
    return JSON.stringify(this.dict);
  }

  get proto(): iterm2.Size.$Properties {
    return { width: this.width, height: this.height };
  }

  static fromDict(d: SizeProto): Size {
    return new Size(d.width, d.height);
  }
}

export class Point {
  constructor(public x: number, public y: number) {}

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }

  get dict(): CoordProto {
    return { x: this.x, y: this.y };
  }

  get json(): string {
    return JSON.stringify(this.dict);
  }

  get proto(): iterm2.Coord.$Properties {
    return { x: this.x, y: this.y };
  }

  static fromCoordProto(proto: iterm2.Coord.$Properties): Point {
    return new Point(proto.x ?? 0, proto.y ?? 0);
  }

  static fromDict(d: CoordProto): Point {
    return new Point(d.x, d.y);
  }

  equals(other: Point): boolean {
    return this.x === other.x && this.y === other.y;
  }
}

export class Frame {
  constructor(
    public origin: Point = new Point(0, 0),
    public size: Size = new Size(0, 0)
  ) {}

  toString(): string {
    return `<Frame origin=${this.origin} size=(${this.size.width} x ${this.size.height})>`;
  }

  get dict(): { origin: CoordProto; size: SizeProto } {
    return { origin: this.origin.dict, size: this.size.dict };
  }

  get json(): string {
    return JSON.stringify(this.dict);
  }
}

export function frameStr(frame: Frame | null | undefined): string {
  if (!frame) return '[Undefined]';
  return `[(${frame.origin.x}, ${frame.origin.y}) (${frame.size.width} x ${frame.size.height})]`;
}

export function sizeStr(size: Size | null | undefined): string {
  if (!size) return '[Undefined]';
  return `(${size.width} x ${size.height})`;
}

export function pointStr(point: Point | null | undefined): string {
  if (!point) return '[Undefined]';
  return `(${point.x}, ${point.y})`;
}

export function distance(a: Point, b: Point, gridWidth: number): number {
  const aPos = a.y * gridWidth + a.x;
  const bPos = b.y * gridWidth + b.x;
  return Math.abs(aPos - bPos);
}

export class CoordRange {
  constructor(public start: Point, public end: Point) {}

  toString(): string {
    return `CoordRange(${this.start} to ${this.end})`;
  }

  static fromProto(proto: iterm2.CoordRange.$Properties): CoordRange {
    return new CoordRange(
      Point.fromCoordProto(proto.start ?? { x: 0, y: 0 }),
      Point.fromCoordProto(proto.end ?? { x: 0, y: 0 })
    );
  }

  get proto(): iterm2.CoordRange.$Properties {
    return { start: this.start.proto, end: this.end.proto };
  }

  length(width: number): number {
    return distance(this.start, this.end, width);
  }
}

export class Range {
  constructor(public location: number, public length: number) {}

  toString(): string {
    return `[${this.location}, ${this.location + this.length})`;
  }

  get max(): number {
    return this.location + this.length;
  }

  get proto(): iterm2.Range.$Properties {
    return { location: this.location, length: this.length };
  }

  get toSet(): Set<number> {
    const out = new Set<number>();
    for (let i = this.location; i < this.max; i++) out.add(i);
    return out;
  }
}

export class WindowedCoordRange {
  private _coordRange: CoordRange;
  private _columnRange: Range;

  constructor(coordRange: CoordRange, columnRange?: Range | null) {
    this._coordRange = coordRange;
    this._columnRange = columnRange ?? new Range(0, 0);
  }

  toString(): string {
    return `WindowedCoordRange(coordRange=${this._coordRange} cols=${this._columnRange})`;
  }

  get coordRange(): CoordRange {
    return this._coordRange;
  }
  get columnRange(): Range {
    return this._columnRange;
  }

  get proto(): iterm2.WindowedCoordRange.$Properties {
    return {
      coordRange: this._coordRange.proto,
      columns: this._columnRange.proto,
    };
  }

  get start(): Point {
    let { x } = this._coordRange.start;
    const { y } = this._coordRange.start;
    if (this._columnRange.length) {
      const loc = this._columnRange.location;
      const end = loc + this._columnRange.length;
      x = Math.min(Math.max(x, loc), end);
    }
    return new Point(x, y);
  }

  get end(): Point {
    let { x } = this._coordRange.end;
    const { y } = this._coordRange.end;
    if (this.hasWindow) {
      x = Math.min(x, this.right + 1);
    }
    return new Point(x, y);
  }

  get right(): number {
    return this._columnRange.location + this._columnRange.length;
  }

  get left(): number {
    return this.hasWindow ? this._columnRange.location : 0;
  }

  get hasWindow(): boolean {
    return this._columnRange.length > 0;
  }
}

/** Resolves never. Useful when a script wants to stay subscribed forever. */
export function waitForever(): Promise<never> {
  return new Promise<never>(() => {
    /* never resolves */
  });
}

export function iterm2EncodeStr(s: string): string {
  return '"' + s.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"') + '"';
}

export function iterm2EncodeList(arr: unknown[]): string {
  return '[' + arr.map(iterm2Encode).join(', ') + ']';
}

/**
 * Encode an object into an iTerm2 expression:
 *   string -> "string", array -> [elt, ...], number/bool -> str(value).
 */
export function iterm2Encode(obj: unknown): string {
  if (typeof obj === 'string') return iterm2EncodeStr(obj);
  if (Array.isArray(obj)) return iterm2EncodeList(obj);
  return String(obj);
}

export function invocationString(
  methodName: string,
  args: Record<string, unknown>
): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(args)) {
    parts.push(`${name}: ${iterm2Encode(value)}`);
  }
  return `${methodName}(${parts.join(', ')})`;
}
