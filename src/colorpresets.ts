/**
 * ColorPreset — port of `iterm2/colorpresets.py`. A color preset is a named
 * collection of colors attached to terminal attributes (e.g., default
 * background color).
 */

import type { Connection } from './connection';
import { Api } from './api';
import { Color, ColorSpace } from './color';
import type { iterm2 } from './generated/api';

export class ListPresetsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ListPresetsException';
  }
}

export class GetPresetException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GetPresetException';
  }
}

const STATUS_OK = 0;

/** A single color within a ColorPreset, tagged with the key it affects. */
export class ColorPresetColor extends Color {
  constructor(
    red: number,
    green: number,
    blue: number,
    alpha: number,
    colorSpace: ColorSpace,
    public readonly key: string
  ) {
    super(red, green, blue, alpha, colorSpace);
  }

  override toString(): string {
    return `(${this.key},${Math.round(this.red)},${Math.round(this.green)},${Math.round(this.blue)},${Math.round(this.alpha)} ${this.colorSpace})`;
  }
}

export class ColorPreset {
  private readonly _values: ColorPresetColor[] = [];

  /**
   * Don't call directly. Use `ColorPreset.get(conn, name)`.
   */
  constructor(proto: iterm2.ColorPresetResponse.GetPreset.ColorSetting.$Properties[]) {
    for (const setting of proto) {
      this._values.push(
        new ColorPresetColor(
          (setting.red ?? 0) * 255,
          (setting.green ?? 0) * 255,
          (setting.blue ?? 0) * 255,
          (setting.alpha ?? 0) * 255,
          (setting.colorSpace as ColorSpace) ?? ColorSpace.Calibrated,
          setting.key ?? ''
        )
      );
    }
  }

  /** Returns the colors belonging to the preset. */
  get values(): ColorPresetColor[] {
    return this._values;
  }

  /** Fetches the names of all available color presets. */
  static async getList(conn: Connection): Promise<string[]> {
    const api = new Api(conn);
    const res = await api.colorPreset({ listPresets: {} });
    const status = (res.status ?? STATUS_OK) as number;
    if (status !== STATUS_OK) {
      throw new GetPresetException(`getList failed status=${status}`);
    }
    return [...(res.listPresets?.name ?? [])];
  }

  /**
   * Fetches a color preset by name. Throws ListPresetsException if iTerm2
   * reports an error (mirrors Python's quirky error mapping).
   */
  static async get(conn: Connection, name: string): Promise<ColorPreset | null> {
    const api = new Api(conn);
    const res = await api.colorPreset({ getPreset: { name } });
    const status = (res.status ?? STATUS_OK) as number;
    if (status !== STATUS_OK) {
      throw new ListPresetsException(`get failed status=${status}`);
    }
    const settings = res.getPreset?.colorSettings ?? [];
    return new ColorPreset(settings);
  }
}
