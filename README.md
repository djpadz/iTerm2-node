# iterm2-node

TypeScript client for the iTerm2 WebSocket API. Faithful port of the official
Python `iterm2` package — protobuf messages over a WebSocket, Unix-domain-socket
preferred with TCP fallback, AppleScript cookie auth, full high-level class
hierarchy (App / Window / Tab / Session / Profile / Triggers / …).

## Install

Requires Node ≥ 18 and macOS (iTerm2 only runs on macOS). In iTerm2 itself,
enable **Settings → General → Magic → Enable Python API**.

### From a git URL

```sh
npm install git+https://github.com/djpadz/iterm2-node.git
# or a specific tag / branch / commit:
npm install git+https://github.com/djpadz/iterm2-node.git#v0.1.0
```

npm clones the repo, runs `npm install` to fetch the build toolchain, then
runs the `prepare` script (codegen + `tsc`) to populate `dist/`. The full
install takes a few seconds.

### From a packed tarball

```sh
# In this repo:
npm pack                    # produces iterm2-node-0.1.0.tgz

# In the consumer project:
npm install /path/to/iterm2-node-0.1.0.tgz
```

The tarball ships `dist/`, `src/`, `proto/`, `LICENSE`, and `README.md`. No
build step on the consumer side.

### Build / develop locally

```sh
npm install            # installs deps; `prepare` runs codegen + tsc
npm run codegen        # regenerate src/generated/api.{js,d.ts} after editing proto/api.proto
npm run build          # tsc + copy generated proto bundle to dist/
```

`src/generated/api.{js,d.ts}` are committed to the repo so `prepare` can
skip codegen on fresh installs. Re-run `npm run codegen` whenever
`proto/api.proto` changes.

## Quick start

```ts
import { runUntilComplete, getApp } from 'iterm2-node';

await runUntilComplete(async (conn) => {
  const app = await getApp(conn);
  const cur = app!.currentWindow?.currentTab?.currentSession;
  await cur?.sendText('echo hi\n');
});
```

The first invocation of each new script name pops an AppleScript dialog to
authorize the script; after that the cookie is minted per launch.

## Layers

The package is organized as three layers — pick the one that fits your task:

1. **Wire layer** — `Connection`, `ClientOriginatedMessage`,
   `ServerOriginatedMessage`. Send/receive protobufs directly.
2. **Typed RPC layer** — `Api` exposes one typed method per submessage
   (`api.listSessions()`, `api.sendText({...})`, `api.createTab({...})`, …).
   This is the layer to reach for if a high-level wrapper doesn't fit.
3. **High-level classes** — `App`, `Window`, `Tab`, `Session`, `Profile`,
   monitors (`KeystrokeMonitor`, `PromptMonitor`, `VariableMonitor`,
   `FocusMonitor`, …), and registration helpers. Mirror the Python API.

## Layer 1 — Connection

```ts
import { Connection } from 'iterm2-node';
const conn = await Connection.create({ retry: false, launchIfNeeded: false });
```

- Tries `~/Library/Application Support/iTerm2/private/socket` first; falls back
  to `ws://localhost:1912`.
- Auth via `osascript`: `tell application "iTerm2" to request cookie and key
  for app named "<name>"`. Result is stashed in `ITERM2_COOKIE` / `ITERM2_KEY`
  and sent as `x-iterm2-cookie` / `x-iterm2-key` headers. On HTTP 401 it
  retries once with a fresh cookie (or forever with `retry: true`). HTTP 406
  signals the client is too old for the running iTerm2.
- Outgoing requests get monotonically increasing ids; the read loop matches
  incoming messages by id and resolves the pending promise, or emits unmatched
  ones as `'message'` events for notification dispatch.

Useful methods: `conn.request(submessage)`, `conn.sendMessage(msg)`,
`conn.dispatchUntilId(id)`, `conn.registerHelper(fn)`,
`conn.protocolVersion`, `conn.close()`. EventEmitter: `'message'`, `'close'`,
`'error'`.

## Layer 2 — typed RPC (`Api`)

```ts
import { Api } from 'iterm2-node';
const api = new Api(conn);
const r = await api.listSessions({});
const s = await api.sendText({ session: 'active', text: 'echo hi\n' });
```

One method per `ClientOriginatedMessage` submessage (34 total). Request and
response types are generated from `proto/api.proto` via `pbjs` + `pbts`.

## Layer 3 — high-level classes

```ts
import { getApp, Transaction, VariableMonitor, VariableScopes } from 'iterm2-node';

const app = await getApp(conn);
const session = app!.currentWindow?.currentTab?.currentSession;
if (session) {
  // Transaction
  await Transaction.with(conn, async () => {
    const info = await session.getLineInfo();
    const buf = await session.getScreenContents();
    console.log(buf.numberOfLinesAboveScreen, info.firstVisibleLineNumber);
  });

  // Variable monitor (async iterator)
  await VariableMonitor.with(
    conn, VariableScopes.SESSION, 'jobName', session.sessionId,
    async (mon) => {
      const next = await mon.get();
      console.log('jobName ->', next);
    });
}
```

Equivalents to the Python classes you'll find here:

| Python module       | TS export                              |
|---------------------|----------------------------------------|
| `app`               | `App`, `getApp(conn)`                  |
| `window`            | `Window`                               |
| `tab`               | `Tab`, `NavigationDirection`           |
| `session`           | `Session`, `Splitter`, `SessionLineInfo` |
| `profile`           | `Profile`, `LocalWriteOnlyProfile` + 200+ typed setters, enums |
| `variables`         | `VariableMonitor`, `VariableScopes`    |
| `transaction`       | `Transaction`                          |
| `notifications`     | `subscribeTo*` functions, `unsubscribe`, `NotificationType`, `RpcRole` |
| `util`              | `Size`, `Point`, `Frame`, `Range`, `CoordRange`, `WindowedCoordRange`, `invocationString` |
| `color`             | `Color`, `ColorSpace`                  |
| `alert`             | `alert.Alert`, `alert.TextInputAlert`  |
| `arrangement`       | `arrangement.Arrangement`              |
| `binding`           | `binding.KeyBinding`, `binding.BindingAction`, … |
| `broadcast`         | `broadcast.BroadcastDomain`, `broadcast.setBroadcastDomains` |
| `capabilities`      | `capabilities.supports*` / `checkSupports*` |
| `colorpresets`      | `colorpresets.ColorPreset`             |
| `customcontrol`     | `customcontrol.CustomControlSequenceMonitor` |
| `filepanel`         | `filepanel.OpenPanel`, `filepanel.SavePanel` |
| `focus`             | `focus.FocusMonitor`, `focus.FocusUpdate*` |
| `keyboard`          | `keyboard.Keystroke*`, `keyboard.Modifier`, `keyboard.Keycode` |
| `lifecycle`         | `lifecycle.NewSessionMonitor`, `…TerminationMonitor`, `LayoutChangeMonitor`, `EachSessionOnceMonitor` |
| `mainmenu`          | `mainmenu.MainMenu`, `mainmenu.MenuIds` |
| `preferences`       | `preferences.getPreference`, `preferences.setPreference`, `PreferenceKey` |
| `prompt`            | `prompt.Prompt`, `prompt.PromptMonitor`, `prompt.listPrompts` |
| `registration`      | `registration.Registration`            |
| `rpc`               | `rpc.RPCException`, `rpc.invokeMethod`, `rpc.sendRpcResult` |
| `screen`            | `screen.ScreenContents`, `screen.LineContents`, `screen.ScreenStreamer`, `screen.CellStyle*` |
| `selection`         | `selection.Selection`, `selection.SubSelection`, `selection.SelectionMode` |
| `statusbar`         | `statusbar.StatusBarComponent`, `statusbar.Knob*` |
| `tmux`              | `tmux.TmuxConnection`, `tmux.getTmuxConnections` |
| `tool`              | `tool.registerWebViewTool`             |
| `triggers`          | `triggers.Trigger` + 26 subclasses     |

## Examples

```sh
npm run example:app-tree        # walk the App/Window/Tab/Session tree
npm run example:list-sessions   # low-level: ListSessionsRequest
npm run example:notifications   # subscribe to focus changes
```

Examples are TypeScript and run via `tsx` (no rebuild needed).

## Tests

```sh
npm test                 # mock mode (default) — fast, deterministic, CI-friendly
npm run test:live        # shared + live tests against a running iTerm2
npm run test:live:mutate # live + mutating tests (set/get user variable, etc.)
npm run typecheck        # tsc --noEmit over src + examples + test
```

Tests live in `test/`. Coverage:

- **Pure logic** — `util` (Size/Point/Frame/Range/CoordRange/encoding helpers),
  `color`, `profile` (LocalWriteOnlyProfile + Profile property decode), `auth`.
- **Proto round-trip** — encode → decode of every shape the wire layer touches.
- **Mock-only** (`connection.test.ts`, `api.test.ts`, `notifications.test.ts`)
  — request-payload assertions, error/status-code edge cases (e.g.
  `ALREADY_SUBSCRIBED` is treated as success), behaviors that need a hung
  server, HTTP 406 handling.
- **Shared dual-mode** (`shared.test.ts`) — open Connection, round-trip
  `ListSessions`, concurrent requests resolve to the right ids, subscription
  handshake, well-formed window/tab tree. Each test programs a mock canned
  response via `harness.setHandler(...)`; on live mode that call is a no-op
  and iTerm2's real reply comes back, so the same assertions hold.
- **Live-only** (`live.test.ts`) — `App.getApp` populates the tree,
  `Profile.getAll` returns at least the default profile, `protocolVersion`
  is `[1, N]`, theme variable resolves. Gated on
  `ITERM2_TEST_MODE=live`. State-changing tests further require
  `ITERM2_TEST_MUTATE=1`.

The harness (`test/helpers/harness.ts`) picks the backend at startup. The
mock backend uses a `ws`-backed `WebSocketServer` on a random localhost port
(`test/helpers/mock-server.ts`) that speaks the real protobuf wire format,
so request ids, oneof dispatch, and subscribe/broadcast semantics are
exercised end-to-end. The same `Connection.create({ endpoint, skipAuth })`
options the harness uses are public — point the client at your own record /
replay server the same way.

## Notes

- **Async + cancellation** — Python uses `async with`/`async for` and
  `asyncio.Task.cancel()`. The TS port uses `.start()`/`.stop()` pairs (or
  `Class.with(...)` helpers that wrap them) plus `AsyncIterator` where the
  Python class supported `__aiter__`. `lifecycle.EachSessionOnceMonitor`
  exposes `AbortController` for cancellation.
- **Delegate naming** — `Session.delegate`, `Tab.delegate`, `Window.delegate`,
  and `TmuxConnection`'s delegate use distinctive prefixed method names
  (`sessionDelegateGetTab`, `tabDelegateGetWindow`, `windowDelegateGetTabById`,
  `tmuxDelegateGetConnection`, …) so a single `App` instance can implement all
  four interfaces without name collisions.
- **Profile setters** — `LocalWriteOnlyProfile` exposes ~210 typed setters
  mechanically extracted from `profile.py`. Re-extract via
  `node scripts/extract-profile-setters.mjs > /tmp/setters.ts` if the upstream
  Python adds properties.
- **Cocoa-only features** — Color decoding from Cocoa's `NSKeyedArchiver`
  format (`Color.from_cocoa` in Python) requires PyObjC and is not ported.
  `Color.fromHex` and the regular Color API work as expected.
- **`ws` and Unix sockets** — `ws@8` explicitly strips a user-provided
  `socketPath` from its options. The supported escape hatch is a custom
  `createConnection` callback, which `src/connection.ts` uses. The
  `ws+unix://path:/` URL scheme isn't viable because URL parsing percent-
  encodes the spaces in `~/Library/Application Support/...`.

## Files

```
proto/api.proto                  iTerm2 wire schema (downloaded from upstream)
src/generated/api.{js,d.ts}      pbjs/pbts output (regen via npm run codegen)
src/connection.ts                Connection — WebSocket transport, dispatch
src/auth.ts                      AppleScript cookie acquisition
src/proto.ts                     proto re-exports & type aliases
src/api.ts                       Api — typed RPC wrappers (one per submessage)
src/util.ts                      Size, Point, Frame, Range, ...
src/color.ts                     Color
src/notifications.ts             Notification dispatcher + subscribe helpers
src/variables.ts                 VariableMonitor / VariableScopes
src/transaction.ts               Transaction
src/profile.ts                   Profile + LocalWriteOnlyProfile + enums
src/session.ts                   Session, Splitter, SessionLineInfo
src/tab.ts                       Tab, NavigationDirection
src/window.ts                    Window
src/app.ts                       App + getApp
src/{alert,arrangement,binding,broadcast,capabilities,colorpresets,
     customcontrol,filepanel,focus,keyboard,lifecycle,mainmenu,
     preferences,prompt,registration,rpc,screen,selection,statusbar,
     tmux,tool,triggers}.ts      leaf modules
src/index.ts                     public entry
examples/                        runnable demos
scripts/copy-generated.js        post-build step: copy generated proto to dist/
scripts/extract-profile-setters.mjs   regen the LocalWriteOnlyProfile setters
```
