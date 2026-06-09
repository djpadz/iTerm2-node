/**
 * Status bar customization — port of `iterm2/statusbar.py`.
 *
 * Defines `StatusBarComponent` and the various `Knob` subclasses used to
 * describe script-provided status bar components. The actual handler
 * registration lives in `registration.ts` / `Registration`.
 */

import type { Connection } from './connection';
import { Color } from './color';
import { Size, invocationString } from './util';
import type { iterm2 } from './generated/api';
import { Api } from './api';
import {
  AppVersionTooOld,
  supportsStatusBarUnreadCount,
} from './capabilities';

type KnobProto = iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Knob.$Properties;
type IconProto = iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Icon.$Properties;
type AttrsProto = iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.$Properties;

const KNOB_TYPE_CHECKBOX = 1 as iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Knob.Type;
const KNOB_TYPE_STRING = 2 as iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Knob.Type;
const KNOB_TYPE_POS_FLOAT = 3 as iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Knob.Type;
const KNOB_TYPE_COLOR = 4 as iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Knob.Type;

/** Represents a configuration setting on a status bar. */
export class Knob {
  protected readonly knobType: iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Knob.Type;
  protected readonly name: string;
  protected readonly placeholder: string;
  protected readonly jsonDefaultValue: string;
  protected readonly key: string;

  constructor(
    knobType: iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Knob.Type,
    name: string,
    placeholder: string,
    jsonDefaultValue: string,
    key: string
  ) {
    this.knobType = knobType;
    this.name = name;
    this.placeholder = placeholder;
    this.jsonDefaultValue = jsonDefaultValue;
    this.key = key;
  }

  /** Returns a protobuf-shaped representation. */
  toProto(): KnobProto {
    return {
      name: this.name,
      type: this.knobType,
      placeholder: this.placeholder,
      jsonDefaultValue: this.jsonDefaultValue,
      key: this.key,
    };
  }
}

/** A status bar configuration knob that toggles a boolean. */
export class CheckboxKnob extends Knob {
  constructor(name: string, defaultValue: boolean, key: string) {
    super(KNOB_TYPE_CHECKBOX, name, '', JSON.stringify(defaultValue), key);
  }
}

/** A status bar configuration knob that holds a string. */
export class StringKnob extends Knob {
  constructor(name: string, placeholder: string, defaultValue: string, key: string) {
    super(KNOB_TYPE_STRING, name, placeholder, JSON.stringify(defaultValue), key);
  }
}

/** A status bar configuration knob that holds a positive floating-point value. */
export class PositiveFloatingPointKnob extends Knob {
  constructor(name: string, defaultValue: number, key: string) {
    super(KNOB_TYPE_POS_FLOAT, name, '', JSON.stringify(defaultValue), key);
  }
}

/** A status bar configuration knob that holds a color. */
export class ColorKnob extends Knob {
  constructor(name: string, defaultValue: Color, key: string) {
    super(KNOB_TYPE_COLOR, name, '', defaultValue.json, key);
  }
}

/** Format describing how the component's output is rendered. */
export enum StatusBarComponentFormat {
  PLAIN_TEXT = 0,
  HTML = 1,
}

/**
 * A status bar icon. The scale gives the ratio between pixels and points;
 * for example, a 32x34 image with scale 2 is 16x17 points.
 */
export class StatusBarIcon {
  private readonly scale: number;
  private readonly data: Uint8Array;

  /**
   * @param scale 2 for retina, 1 for low-DPI.
   * @param base64Data Base64-encoded PNG bytes.
   */
  constructor(scale: number, base64Data: string) {
    this.scale = scale;
    this.data = new Uint8Array(Buffer.from(base64Data, 'base64'));
  }

  /** Returns a protobuf-shaped representation. */
  toStatusBarIcon(): IconProto {
    return {
      data: this.data,
      scale: this.scale,
    };
  }
}

export interface StatusBarComponentOptions {
  shortDescription: string;
  detailedDescription: string;
  knobs: Knob[];
  exemplar: string;
  /** How frequently to reload the value, in seconds. `null` disables timer. */
  updateCadence: number | null;
  /** Reverse-DNS unique identifier, e.g. `com.example.calculator`. */
  identifier: string;
  /** Optional icons (should include scale-1 and scale-2). */
  icons?: StatusBarIcon[];
  format?: StatusBarComponentFormat;
}

/**
 * Describes a script-provided status bar component whose text value comes
 * from a user-supplied callback registered with
 * `Registration.registerStatusBarComponent`.
 */
export class StatusBarComponent {
  readonly shortDescription: string;
  readonly detailedDescription: string;
  readonly knobs: Knob[];
  readonly exemplar: string;
  readonly updateCadence: number | null;
  readonly identifier: string;
  readonly icons: StatusBarIcon[];
  readonly format: StatusBarComponentFormat;
  /** Set by `Registration.registerStatusBarComponent` after registration. */
  connection: Connection | null = null;

  constructor(opts: StatusBarComponentOptions) {
    this.shortDescription = opts.shortDescription;
    this.detailedDescription = opts.detailedDescription;
    this.knobs = opts.knobs;
    this.exemplar = opts.exemplar;
    this.updateCadence = opts.updateCadence;
    this.identifier = opts.identifier;
    this.icons = opts.icons ?? [];
    this.format = opts.format ?? StatusBarComponentFormat.PLAIN_TEXT;
  }

  /** Builds a `StatusBarComponentAttributes` proto for registration. */
  toAttributesProto(): AttrsProto {
    const proto: AttrsProto = {
      shortDescription: this.shortDescription,
      detailedDescription: this.detailedDescription,
      knobs: this.knobs.map((k) => k.toProto()),
      exemplar: this.exemplar,
      uniqueIdentifier: this.identifier,
      icons: this.icons.map((i) => i.toStatusBarIcon()),
      format: this.format as unknown as iterm2.RPCRegistrationRequest.StatusBarComponentAttributes.Format,
    };
    if (this.updateCadence != null) {
      proto.updateCadence = this.updateCadence;
    }
    return proto;
  }

  /**
   * Open a popover with a webview anchored to this component in the given
   * session.
   */
  async openPopover(sessionId: string, html: string, size: Size): Promise<void> {
    if (!this.connection) {
      throw new Error('StatusBarComponent is not registered to a connection');
    }
    const api = new Api(this.connection);
    await api.statusBarComponent({
      identifier: this.identifier,
      openPopover: {
        sessionId,
        html,
        size: size.proto,
      },
    });
  }

  /**
   * Sets the unread count shown on the component. Pass `null` for `sessionId`
   * to update every instance. Requires iTerm2 protocol 1.2+.
   */
  async setUnreadCount(sessionId: string | null, count: number): Promise<void> {
    if (!this.connection) {
      throw new Error('StatusBarComponent is not registered to a connection');
    }
    if (!supportsStatusBarUnreadCount(this.connection)) {
      throw new AppVersionTooOld(
        'Unread count in status bar components is not supported in this ' +
          'version of iTerm2. Please upgrade to use this script.'
      );
    }
    const invocation = invocationString(
      'iterm2.set_status_bar_component_unread_count',
      { identifier: this.identifier, count }
    );
    const api = new Api(this.connection);
    if (sessionId) {
      await api.invokeFunction({
        invocation,
        method: { receiver: sessionId },
        timeout: -1,
      });
    } else {
      await api.invokeFunction({
        invocation,
        app: {},
        timeout: -1,
      });
    }
  }
}
