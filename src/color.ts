/**
 * Color class — ports `iterm2/color.py`. Cocoa-archive decoding is omitted
 * (it requires PyObjC; not applicable to Node).
 */

export enum ColorSpace {
  SRGB = 'sRGB',
  Calibrated = 'Calibrated',
  P3 = 'P3',
}

export interface ColorDict {
  'Red Component': number;
  'Green Component': number;
  'Blue Component': number;
  'Alpha Component'?: number;
  'Color Space'?: string;
}

const HEX2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

export class Color {
  constructor(
    public red = 0,
    public green = 0,
    public blue = 0,
    public alpha = 255,
    public colorSpace: ColorSpace = ColorSpace.SRGB
  ) {}

  toString(): string {
    return `(${Math.round(this.red)},${Math.round(this.green)},${Math.round(this.blue)},${Math.round(this.alpha)} ${this.colorSpace})`;
  }

  /** Decode `#rrggbb`, `#rrrrggggbbbb`, or `p3#rrggbb` (returns null on parse failure). */
  static fromHex(s: string): Color | null {
    if (s.startsWith('p3#')) {
      const inner = Color.fromHex(s.slice(2));
      if (!inner) return null;
      return new Color(inner.red, inner.green, inner.blue, inner.alpha, ColorSpace.P3);
    }
    if (s[0] !== '#') return null;
    if (s.length === 7) {
      const r = parseInt(s.slice(1, 3), 16);
      const g = parseInt(s.slice(3, 5), 16);
      const b = parseInt(s.slice(5, 7), 16);
      if ([r, g, b].some(Number.isNaN)) return null;
      return new Color(r, g, b, 255);
    }
    if (s.length === 13) {
      const r = Math.floor(parseInt(s.slice(1, 5), 16) / 257);
      const g = Math.floor(parseInt(s.slice(5, 9), 16) / 257);
      const b = Math.floor(parseInt(s.slice(9, 13), 16) / 257);
      if ([r, g, b].some(Number.isNaN)) return null;
      return new Color(r, g, b, 255);
    }
    return null;
  }

  /** Decode either `#rrggbb` or a Cocoa archive (Cocoa unsupported in Node). */
  static fromTrigger(s: string): Color | null {
    return Color.fromHex(s);
  }

  /** Dictionary representation matching iTerm2's plist format. */
  getDict(): ColorDict {
    return {
      'Red Component': this.red / 255,
      'Green Component': this.green / 255,
      'Blue Component': this.blue / 255,
      'Alpha Component': this.alpha / 255,
      'Color Space': this.colorSpace,
    };
  }

  /** In-place update from a dict (matches Python `from_dict`). */
  fromDict(input: ColorDict): void {
    this.red = Number(input['Red Component']) * 255;
    this.green = Number(input['Green Component']) * 255;
    this.blue = Number(input['Blue Component']) * 255;
    this.alpha = input['Alpha Component'] != null ? Number(input['Alpha Component']) * 255 : 255;
    this.colorSpace = (input['Color Space'] as ColorSpace) ?? ColorSpace.Calibrated;
  }

  get json(): string {
    return JSON.stringify(this.getDict());
  }

  /** `#rrggbb`, or `p3#rrggbb` for P3 color space. */
  get hex(): string {
    const code = '#' + HEX2(this.red) + HEX2(this.green) + HEX2(this.blue);
    return this.colorSpace === ColorSpace.P3 ? 'p3' + code : code;
  }
}
