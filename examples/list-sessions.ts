import { runUntilComplete } from '../src';

interface SessionInfo {
  uniqueIdentifier?: string;
  gridSize?: { width: number; height: number };
  title?: string;
}

interface SplitNode {
  vertical?: boolean;
  links?: Array<{ session?: SessionInfo; node?: SplitNode }>;
}

function describeRoot(node: SplitNode | undefined, indent: string): void {
  if (!node || !node.links) return;
  for (const link of node.links) {
    if (link.session) {
      const s = link.session;
      const grid = s.gridSize ? `${s.gridSize.width}x${s.gridSize.height}` : '';
      console.log(`${indent}Session ${s.uniqueIdentifier}  ${grid}  ${s.title ?? ''}`);
    } else if (link.node) {
      console.log(`${indent}Split (${link.node.vertical ? 'vertical' : 'horizontal'})`);
      describeRoot(link.node, indent + '  ');
    }
  }
}

runUntilComplete(async (conn) => {
  console.log('iTerm2 protocol version:', conn.protocolVersion.join('.'));

  const response = await conn.request({ listSessionsRequest: {} });
  const r = (response as { listSessionsResponse?: { windows?: Array<{ windowId: string; tabs?: Array<{ tabId: string; root?: SplitNode }> }> } }).listSessionsResponse;
  if (!r) return;

  for (const window of r.windows ?? []) {
    console.log(`Window ${window.windowId}`);
    for (const tab of window.tabs ?? []) {
      console.log(`  Tab ${tab.tabId}`);
      describeRoot(tab.root, '    ');
    }
  }
}).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
