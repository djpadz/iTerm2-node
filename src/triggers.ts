/**
 * Triggers — port of `iterm2/triggers.py`.
 *
 * Triggers are stored in the profile under the "Triggers" key. Each trigger
 * is encoded as a dictionary with `regex`, `action`, `parameter`, `partial`,
 * and `disabled` fields. Use {@link decodeTrigger} / {@link Trigger.encode}
 * to round-trip through the wire representation.
 */

import { Color } from './color';

export interface EncodedTrigger {
  regex: string;
  action: string;
  parameter: unknown;
  partial: boolean;
  disabled: boolean;
}

function _hex(color: Color | null | undefined): string {
  if (!color) return '';
  return color.hex;
}

/**
 * Sets the unparsed parameter in a trigger so it can round-trip through
 * deserialize/encode unchanged. Mirrors the Python `_futureproof` helper.
 */
function _futureproof<T extends Trigger>(param: unknown, obj: T): T {
  obj.param = param;
  return obj;
}

/**
 * Create a trigger from its encoded dictionary form (as found in the
 * profile's "Triggers" property).
 *
 * Unknown trigger types are returned as a bare {@link Trigger}, preserving
 * their fields so they round-trip cleanly.
 */
export function decodeTrigger(encoded: Record<string, unknown>): Trigger {
  const classes: Record<string, { deserialize: (regex: string, param: any, instant: boolean, enabled: boolean) => Trigger }> = {
    [AlertTrigger._name()]: AlertTrigger,
    [AnnotateTrigger._name()]: AnnotateTrigger,
    [BellTrigger._name()]: BellTrigger,
    [BounceTrigger._name()]: BounceTrigger,
    [CaptureTrigger._name()]: CaptureTrigger,
    [CoprocessTrigger._name()]: CoprocessTrigger,
    [HighlightLineTrigger._name()]: HighlightLineTrigger,
    [HighlightTrigger._name()]: HighlightTrigger,
    [HyperlinkTrigger._name()]: HyperlinkTrigger,
    [InjectTrigger._name()]: InjectTrigger,
    [MarkTrigger._name()]: MarkTrigger,
    [MuteCoprocessTrigger._name()]: MuteCoprocessTrigger,
    [PasswordTrigger._name()]: PasswordTrigger,
    [RPCTrigger._name()]: RPCTrigger,
    [RunCommandTrigger._name()]: RunCommandTrigger,
    [SendTextTrigger._name()]: SendTextTrigger,
    [SetDirectoryTrigger._name()]: SetDirectoryTrigger,
    [SetHostnameTrigger._name()]: SetHostnameTrigger,
    [SetTitleTrigger._name()]: SetTitleTrigger,
    [SetUserVariableTrigger._name()]: SetUserVariableTrigger,
    [ShellPromptTrigger._name()]: ShellPromptTrigger,
    [StopTrigger._name()]: StopTrigger,
    [UserNotificationTrigger._name()]: UserNotificationTrigger,
    [SetNamedMarkTrigger._name()]: SetNamedMarkTrigger,
    [FoldTrigger._name()]: FoldTrigger,
    [SGRTrigger._name()]: SGRTrigger,
  };

  const name = String(encoded['action'] ?? '');
  const regex = String(encoded['regex'] ?? '');
  const param = encoded['parameter'] ?? '';
  const instant = Boolean(encoded['partial'] ?? false);
  const enabled = !Boolean(encoded['disabled'] ?? false);

  const cls = classes[name];
  if (!cls) {
    // Futureproof unrecognized trigger types so they round-trip through
    // the Trigger representation.
    const t = new Trigger(regex, param, instant, enabled);
    // Preserve the original action name so encode() reproduces it.
    (t as Trigger & { _futureName: string })._futureName = name;
    return t;
  }
  return cls.deserialize(regex, param as string, instant, enabled);
}

/**
 * Base class for triggers.
 *
 * Do not instantiate this directly. Use one of the concrete subclasses (e.g.
 * {@link AlertTrigger}). You may receive a bare Trigger for unrecognized
 * trigger types from future versions of iTerm2.
 */
export class Trigger {
  private __regex: string;
  private __param: unknown;
  private __instant: boolean;
  private __enabled: boolean;
  /** @internal Preserves the action name of an unrecognized trigger. */
  _futureName?: string;

  constructor(regex: string, param: unknown, instant: boolean, enabled: boolean) {
    this.__regex = regex;
    this.__param = param;
    this.__instant = instant;
    this.__enabled = enabled;
  }

  toString(): string {
    return `<${this.constructor.name}: regex=${this.__regex} instant=${this.__instant} enabled=${this.__enabled} param=${this._param}>`;
  }

  equals(other: Trigger): boolean {
    return (
      this.__regex === other.__regex &&
      this.__param === other.__param &&
      this.__instant === other.__instant &&
      this.__enabled === other.__enabled
    );
  }

  get param(): unknown {
    return this.__param;
  }

  set param(value: unknown) {
    this.__param = value;
  }

  get regex(): string {
    return this.__regex;
  }

  set regex(value: string) {
    this.__regex = value;
  }

  get instant(): boolean {
    return this.__instant;
  }

  set instant(value: boolean) {
    this.__instant = value;
  }

  get enabled(): boolean {
    return this.__enabled;
  }

  set enabled(value: boolean) {
    this.__enabled = value;
  }

  /** Encoded dictionary representation matching iTerm2's wire format. */
  get encode(): EncodedTrigger {
    return {
      regex: this.regex,
      action: this._futureName ?? (this.constructor as typeof Trigger)._name(),
      parameter: this.param,
      partial: this.instant,
      disabled: !this.enabled,
    };
  }

  toJSON(): string {
    return JSON.stringify(this.encode);
  }

  /** Subclass-derived parameter — base form is always the empty string. */
  protected get _param(): unknown {
    return '';
  }

  /** Action name as it appears in the encoded trigger dictionary. */
  static _name(): string {
    return '';
  }
}

export class AlertTrigger extends Trigger {
  private __message: string;

  constructor(regex: string, message: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__message = message;
    this.param = this._param;
  }

  static _name(): string {
    return 'AlertTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): AlertTrigger {
    return _futureproof(param, new AlertTrigger(regex, param, instant, enabled));
  }

  get message(): string {
    return this.__message;
  }

  set message(value: string) {
    this.__message = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__message;
  }
}

export class AnnotateTrigger extends Trigger {
  private __annotation: string;

  constructor(regex: string, annotation: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__annotation = annotation;
    this.param = this._param;
  }

  static _name(): string {
    return 'AnnotateTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): AnnotateTrigger {
    return _futureproof(param, new AnnotateTrigger(regex, param, instant, enabled));
  }

  get annotation(): string {
    return this.__annotation;
  }

  set annotation(value: string) {
    this.__annotation = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__annotation;
  }
}

export class BellTrigger extends Trigger {
  constructor(regex: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.param = this._param;
  }

  static _name(): string {
    return 'BellTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): BellTrigger {
    return _futureproof(param, new BellTrigger(regex, instant, enabled));
  }

  protected get _param(): string {
    return '';
  }
}

export class BounceTrigger extends Trigger {
  private __action: BounceTrigger.Action;

  constructor(regex: string, action: BounceTrigger.Action, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__action = action;
    this.param = this._param;
  }

  static _name(): string {
    return 'BounceTrigger';
  }

  static deserialize(regex: string, param: string | number, instant: boolean, enabled: boolean): BounceTrigger {
    return _futureproof(param, new BounceTrigger(regex, Number(param) as BounceTrigger.Action, instant, enabled));
  }

  get action(): BounceTrigger.Action {
    return this.__action;
  }

  set action(value: BounceTrigger.Action) {
    this.__action = value;
    this.param = this._param;
  }

  protected get _param(): number {
    return this.__action as number;
  }
}

export namespace BounceTrigger {
  export enum Action {
    BOUNCE_UNTIL_ACTIVATED = 0,
    BOUNCE_ONCE = 1,
  }
}

export class RPCTrigger extends Trigger {
  private __invocation: string;

  constructor(regex: string, invocation: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__invocation = invocation;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermRPCTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): RPCTrigger {
    return _futureproof(param, new RPCTrigger(regex, param, instant, enabled));
  }

  get invocation(): string {
    return this.__invocation;
  }

  set invocation(value: string) {
    this.__invocation = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__invocation;
  }
}

export class CaptureTrigger extends Trigger {
  private __command: string;

  constructor(regex: string, command: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__command = command;
    this.param = this._param;
  }

  static _name(): string {
    return 'CaptureTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): CaptureTrigger {
    return _futureproof(param, new CaptureTrigger(regex, param, instant, enabled));
  }

  get command(): string {
    return this.__command;
  }

  set command(value: string) {
    this.__command = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__command;
  }
}

export class SetNamedMarkTrigger extends Trigger {
  private __markname: string;

  constructor(regex: string, markname: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__markname = markname;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermSetNamedMarkTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): SetNamedMarkTrigger {
    return _futureproof(param, new SetNamedMarkTrigger(regex, param, instant, enabled));
  }

  get markname(): string {
    return this.__markname;
  }

  set markname(value: string) {
    this.__markname = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__markname;
  }
}

export class SGRTrigger extends Trigger {
  private __sgr: string;

  constructor(regex: string, sgr: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__sgr = sgr;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermSGRTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): SGRTrigger {
    return _futureproof(param, new SGRTrigger(regex, param, instant, enabled));
  }

  get sgr(): string {
    return this.__sgr;
  }

  set sgr(value: string) {
    this.__sgr = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__sgr;
  }
}

export class FoldTrigger extends Trigger {
  private __markname: string;

  constructor(regex: string, markname: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__markname = markname;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermFoldTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): FoldTrigger {
    return _futureproof(param, new FoldTrigger(regex, param, instant, enabled));
  }

  get markname(): string {
    return this.__markname;
  }

  set markname(value: string) {
    this.__markname = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__markname;
  }
}

export class InjectTrigger extends Trigger {
  private __injection: string;

  constructor(regex: string, injection: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__injection = injection;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermInjectTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): InjectTrigger {
    return _futureproof(param, new InjectTrigger(regex, param, instant, enabled));
  }

  get injection(): string {
    return this.__injection;
  }

  set injection(value: string) {
    this.__injection = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__injection;
  }
}

export class HighlightLineTrigger extends Trigger {
  private __textColor: Color | null;
  private __backgroundColor: Color | null;

  constructor(
    regex: string,
    textColor: Color | null,
    backgroundColor: Color | null,
    instant: boolean,
    enabled: boolean
  ) {
    super(regex, '', instant, enabled);
    this.__textColor = textColor;
    this.__backgroundColor = backgroundColor;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermHighlightLineTrigger';
  }

  /**
   * NOTE: Python `HighlightLineTrigger.deserialize` returns a `HighlightTrigger`
   * (likely a Python bug). We faithfully replicate that behavior here so that
   * round-tripping matches the upstream library.
   */
  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): HighlightTrigger {
    const inner = param.slice(1, -1).split(',');
    const textColor = Color.fromTrigger(inner[0] ?? '');
    const backgroundColor = Color.fromTrigger(inner[1] ?? '');
    return _futureproof(param, new HighlightTrigger(regex, textColor, backgroundColor, instant, enabled));
  }

  get textColor(): Color | null {
    return this.__textColor;
  }

  set textColor(value: Color | null) {
    this.__textColor = value;
    this.param = this._param;
  }

  get backgroundColor(): Color | null {
    return this.__backgroundColor;
  }

  set backgroundColor(value: Color | null) {
    this.__backgroundColor = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return '{' + _hex(this.__textColor) + ',' + _hex(this.__backgroundColor) + '}';
  }
}

export class UserNotificationTrigger extends Trigger {
  private __message: string;

  constructor(regex: string, message: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__message = message;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermUserNotificationTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): UserNotificationTrigger {
    return _futureproof(param, new UserNotificationTrigger(regex, param, instant, enabled));
  }

  get message(): string {
    return this.__message;
  }

  set message(value: string) {
    this.__message = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__message;
  }
}

export class SetUserVariableTrigger extends Trigger {
  private __name: string;
  private __jsonValue: string;

  constructor(regex: string, name: string, jsonValue: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__name = name;
    this.__jsonValue = jsonValue;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermSetUserVariableTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): SetUserVariableTrigger {
    const parts = param.split(String.fromCharCode(1));
    return _futureproof(
      param,
      new SetUserVariableTrigger(regex, parts[0] ?? '', parts[1] ?? '', instant, enabled)
    );
  }

  get name(): string {
    return this.__name;
  }

  set name(value: string) {
    this.__name = value;
    this.param = this._param;
  }

  get jsonValue(): string {
    return this.__jsonValue;
  }

  set jsonValue(value: string) {
    this.__jsonValue = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__name + String.fromCharCode(1) + this.__jsonValue;
  }
}

export class ShellPromptTrigger extends Trigger {
  constructor(regex: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermShellPromptTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): ShellPromptTrigger {
    return _futureproof(param, new ShellPromptTrigger(regex, instant, enabled));
  }

  protected get _param(): string {
    return '';
  }
}

export class SetTitleTrigger extends Trigger {
  private __title: string;

  constructor(regex: string, title: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__title = title;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermSetTitleTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): SetTitleTrigger {
    return _futureproof(param, new SetTitleTrigger(regex, param, instant, enabled));
  }

  get title(): string {
    return this.__title;
  }

  set title(value: string) {
    this.__title = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__title;
  }
}

export class SendTextTrigger extends Trigger {
  private __text: string;

  constructor(regex: string, text: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__text = text;
    this.param = this._param;
  }

  static _name(): string {
    return 'SendTextTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): SendTextTrigger {
    return _futureproof(param, new SendTextTrigger(regex, param, instant, enabled));
  }

  get text(): string {
    return this.__text;
  }

  set text(value: string) {
    this.__text = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__text;
  }
}

export class RunCommandTrigger extends Trigger {
  private __command: string;

  constructor(regex: string, command: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__command = command;
    this.param = this._param;
  }

  static _name(): string {
    return 'ScriptTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): RunCommandTrigger {
    return _futureproof(param, new RunCommandTrigger(regex, param, instant, enabled));
  }

  get command(): string {
    return this.__command;
  }

  set command(value: string) {
    this.__command = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__command;
  }
}

export class CoprocessTrigger extends Trigger {
  private __command: string;

  constructor(regex: string, command: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__command = command;
    this.param = this._param;
  }

  static _name(): string {
    return 'CoprocessTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): CoprocessTrigger {
    return _futureproof(param, new CoprocessTrigger(regex, param, instant, enabled));
  }

  get command(): string {
    return this.__command;
  }

  set command(value: string) {
    this.__command = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__command;
  }
}

export class MuteCoprocessTrigger extends Trigger {
  private __command: string;

  constructor(regex: string, command: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__command = command;
    this.param = this._param;
  }

  static _name(): string {
    return 'MuteCoprocessTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): MuteCoprocessTrigger {
    return _futureproof(param, new MuteCoprocessTrigger(regex, param, instant, enabled));
  }

  get command(): string {
    return this.__command;
  }

  set command(value: string) {
    this.__command = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__command;
  }
}

export class HighlightTrigger extends Trigger {
  private __textColor: Color | null;
  private __backgroundColor: Color | null;

  constructor(
    regex: string,
    textColor: Color | null,
    backgroundColor: Color | null,
    instant: boolean,
    enabled: boolean
  ) {
    super(regex, '', instant, enabled);
    this.__textColor = textColor;
    this.__backgroundColor = backgroundColor;
    this.param = this._param;
  }

  static _name(): string {
    return 'HighlightTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): HighlightTrigger {
    const inner = param.slice(1, -1).split(',');
    const textColor = Color.fromTrigger(inner[0] ?? '');
    const backgroundColor = Color.fromTrigger(inner[1] ?? '');
    return _futureproof(param, new HighlightTrigger(regex, textColor, backgroundColor, instant, enabled));
  }

  get textColor(): Color | null {
    return this.__textColor;
  }

  set textColor(value: Color | null) {
    this.__textColor = value;
    this.param = this._param;
  }

  get backgroundColor(): Color | null {
    return this.__backgroundColor;
  }

  set backgroundColor(value: Color | null) {
    this.__backgroundColor = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return '{' + _hex(this.__textColor) + ',' + _hex(this.__backgroundColor) + '}';
  }
}

export class MarkTrigger extends Trigger {
  private __stopScrolling: boolean;

  constructor(regex: string, stopScrolling: boolean, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__stopScrolling = stopScrolling;
    this.param = this._param;
  }

  static _name(): string {
    return 'MarkTrigger';
  }

  static deserialize(regex: string, param: string | number, instant: boolean, enabled: boolean): MarkTrigger {
    return _futureproof(param, new MarkTrigger(regex, Number(param) === 1, instant, enabled));
  }

  get stopScrolling(): boolean {
    return this.__stopScrolling;
  }

  set stopScrolling(value: boolean) {
    this.__stopScrolling = value;
    this.param = this._param;
  }

  protected get _param(): number {
    return this.__stopScrolling ? 1 : 0;
  }
}

export class PasswordTrigger extends Trigger {
  static readonly SEPARATOR = ' — ';

  private __accountName: string;
  private __userName: string;

  constructor(
    regex: string,
    accountName: string,
    userName: string | null,
    instant: boolean,
    enabled: boolean
  ) {
    super(regex, '', instant, enabled);
    this.__accountName = accountName;
    this.__userName = userName ?? '';
    this.param = this._param;
  }

  static _name(): string {
    return 'PasswordTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): PasswordTrigger {
    let accountName: string;
    let userName: string;
    if (param.includes(PasswordTrigger.SEPARATOR)) {
      const parts = param.split(PasswordTrigger.SEPARATOR);
      accountName = parts[0] ?? '';
      userName = parts[1] ?? '';
    } else {
      accountName = param;
      userName = '';
    }
    return _futureproof(param, new PasswordTrigger(regex, accountName, userName, instant, enabled));
  }

  get accountName(): string {
    return this.__accountName;
  }

  set accountName(value: string) {
    this.__accountName = value;
    this.param = this._param;
  }

  get userName(): string {
    return this.__userName;
  }

  set userName(value: string) {
    this.__userName = value;
    this.param = this._param;
  }

  protected get _param(): string {
    if (this.__userName.length > 0) {
      return this.__accountName + PasswordTrigger.SEPARATOR + this.__userName;
    }
    return this.__accountName;
  }
}

export class HyperlinkTrigger extends Trigger {
  private __url: string;

  constructor(regex: string, url: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__url = url;
    this.param = this._param;
  }

  static _name(): string {
    return 'iTermHyperlinkTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): HyperlinkTrigger {
    return _futureproof(param, new HyperlinkTrigger(regex, param, instant, enabled));
  }

  get url(): string {
    return this.__url;
  }

  set url(value: string) {
    this.__url = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__url;
  }
}

export class SetDirectoryTrigger extends Trigger {
  private __directory: string;

  constructor(regex: string, directory: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__directory = directory;
    this.param = this._param;
  }

  static _name(): string {
    return 'SetDirectoryTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): SetDirectoryTrigger {
    return _futureproof(param, new SetDirectoryTrigger(regex, param, instant, enabled));
  }

  get directory(): string {
    return this.__directory;
  }

  set directory(value: string) {
    this.__directory = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__directory;
  }
}

export class SetHostnameTrigger extends Trigger {
  private __hostname: string;

  constructor(regex: string, hostname: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.__hostname = hostname;
    this.param = this._param;
  }

  static _name(): string {
    return 'SetHostnameTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): SetHostnameTrigger {
    return _futureproof(param, new SetHostnameTrigger(regex, param, instant, enabled));
  }

  get hostname(): string {
    return this.__hostname;
  }

  set hostname(value: string) {
    this.__hostname = value;
    this.param = this._param;
  }

  protected get _param(): string {
    return this.__hostname;
  }
}

export class StopTrigger extends Trigger {
  constructor(regex: string, instant: boolean, enabled: boolean) {
    super(regex, '', instant, enabled);
    this.param = this._param;
  }

  static _name(): string {
    return 'StopTrigger';
  }

  static deserialize(regex: string, param: string, instant: boolean, enabled: boolean): StopTrigger {
    return _futureproof(param, new StopTrigger(regex, instant, enabled));
  }

  protected get _param(): string {
    return '';
  }
}
