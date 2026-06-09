import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const DISABLE_AUTH_PATH = path.join(
  os.homedir(),
  'Library/Application Support/iTerm2/disable-automation-auth'
);
const DISABLE_AUTH_MAGIC = '61DF88DC-3423-4823-B725-22570E01C027';

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface AuthOptions {
  /** If iTerm2 isn't running, attempt to launch it. */
  launchIfNeeded?: boolean;
  /** Override the advisory name sent in the cookie request. */
  name?: string;
}

export function getScriptName(): string {
  const argv1 = process.argv[1];
  if (argv1) {
    const base = path.basename(argv1);
    if (base) return base;
  }
  return 'NodeScript';
}

export function authDisabled(): boolean {
  try {
    const expected =
      Buffer.from(DISABLE_AUTH_PATH, 'utf8').toString('hex') +
      ' ' +
      DISABLE_AUTH_MAGIC;
    const st = fs.lstatSync(DISABLE_AUTH_PATH);
    if (st.uid !== 0) return false;
    if (st.size !== expected.length) return false;
    return fs.readFileSync(DISABLE_AUTH_PATH, 'utf8') === expected;
  } catch {
    return false;
  }
}

interface OsaResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runOsascript(script: string): Promise<OsaResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/osascript', ['-']);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        code: code ?? -1,
        stdout: stdout.replace(/\s+$/u, ''),
        stderr: stderr.replace(/\s+$/u, ''),
      })
    );
    child.stdin.end(script);
  });
}

function parseOsaErrorCode(stderr: string): number | null {
  const m = stderr.match(/\((-?\d+)\)\s*$/u);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

function parseOsaErrorReason(stderr: string): string {
  const m = stderr.match(/^[^:]+:[^:]+:\s*(.*)\s*\(-?\d+\)\s*$/mu);
  return m && m[1] ? m[1] : stderr;
}

export async function requestCookieAndKey(
  opts: AuthOptions = {}
): Promise<string> {
  const { launchIfNeeded = false, name } = opts;
  const scriptName = name || getScriptName();

  if (!launchIfNeeded) {
    const probe = await runOsascript(
      'set appName to "iTerm2"\n' +
        'if application appName is running then\n' +
        '  return "yes"\n' +
        'else\n' +
        '  return "no"\n' +
        'end if\n'
    );
    if (probe.code !== 0) {
      throw new AuthenticationError(parseOsaErrorReason(probe.stderr));
    }
    if (probe.stdout.trim() !== 'yes') {
      throw new AuthenticationError('iTerm2 not running');
    }
  }

  const result = await runOsascript(
    `tell application "iTerm2" to request cookie and key for app named "${scriptName.replace(/"/gu, '\\"')}"`
  );
  if (result.code !== 0) {
    const code = parseOsaErrorCode(result.stderr);
    if (code === -2740 || code === -2741) {
      throw new AuthenticationError('iTerm2 version too old');
    }
    throw new AuthenticationError(parseOsaErrorReason(result.stderr));
  }
  return result.stdout.trim();
}

/**
 * Populate `ITERM2_COOKIE` / `ITERM2_KEY` in process.env via AppleScript.
 *
 * Resolves true when a fresh cookie was fetched, false when an existing env
 * var was reused (or authentication is disabled by the magic file).
 */
export async function authenticate(opts: AuthOptions = {}): Promise<boolean> {
  if (authDisabled()) return true;
  if (process.env.ITERM2_COOKIE) return false;

  const pair = await requestCookieAndKey(opts);
  const parts = pair.split(' ');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new AuthenticationError(`Unexpected cookie/key response: ${pair}`);
  }
  process.env.ITERM2_COOKIE = parts[0];
  process.env.ITERM2_KEY = parts[1];
  return true;
}

export function removeAuth(): void {
  delete process.env.ITERM2_COOKIE;
  delete process.env.ITERM2_KEY;
}
