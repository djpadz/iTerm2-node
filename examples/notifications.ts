import {
  runForever,
  subscribeToFocusChangeNotification,
  subscribeToKeystrokeNotification,
  unsubscribe,
} from '../src';

// Subscribe to focus changes (app-wide) and keystrokes on the active
// session. Logs each event until you Ctrl-C.
runForever(async (conn) => {
  const focusTok = await subscribeToFocusChangeNotification(conn, (_c, n) => {
    if (n.applicationActive != null) {
      console.log(`app active: ${n.applicationActive}`);
    } else if (n.window) {
      console.log(`window: id=${n.window.windowId} status=${n.window.windowStatus}`);
    } else if (n.selectedTab) {
      console.log(`selected tab: ${n.selectedTab}`);
    } else if (n.session) {
      console.log(`active session: ${n.session}`);
    }
  });

  const keyTok = await subscribeToKeystrokeNotification(
    conn,
    (_c, n) => {
      console.log(
        `keystroke: keyCode=${n.keyCode} chars=${JSON.stringify(n.characters)}`
      );
    },
    { session: 'active' }
  );

  console.log('subscribed; press Ctrl-C to exit.');

  const cleanup = async () => {
    await unsubscribe(conn, focusTok).catch(() => undefined);
    await unsubscribe(conn, keyTok).catch(() => undefined);
    conn.close();
  };
  process.on('SIGINT', () => { void cleanup(); });
  process.on('SIGTERM', () => { void cleanup(); });
}).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
