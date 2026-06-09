import { runUntilComplete, getApp } from '../src';

runUntilComplete(async (conn) => {
  const app = await getApp(conn);
  if (!app) throw new Error('no App');

  console.log(`iTerm2 protocol ${conn.protocolVersion.join('.')}\n`);
  console.log(`theme: ${(await app.getTheme()).join(', ')}`);
  console.log(`windows: ${app.windows.length}  buried: ${app.buriedSessions.length}\n`);
  console.log(app.prettyStr());

  const cur = app.currentWindow?.currentTab?.currentSession;
  if (cur) {
    console.log(`\nactive session: ${cur.sessionId}`);
    console.log(`  grid: ${cur.gridSize?.width}x${cur.gridSize?.height}`);
    console.log(`  title: ${cur.name}`);
  }
}).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
