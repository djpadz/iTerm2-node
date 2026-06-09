import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Size,
  Point,
  Frame,
  Range,
  CoordRange,
  WindowedCoordRange,
  frameStr,
  sizeStr,
  pointStr,
  distance,
  iterm2Encode,
  iterm2EncodeStr,
  iterm2EncodeList,
  invocationString,
} from '../src/util';

test('Size.dict + json', () => {
  const s = new Size(80, 24);
  assert.deepEqual(s.dict, { width: 80, height: 24 });
  assert.equal(s.json, '{"width":80,"height":24}');
});

test('Size.fromDict round-trip', () => {
  const orig = new Size(132, 50);
  const round = Size.fromDict(orig.dict);
  assert.equal(round.width, orig.width);
  assert.equal(round.height, orig.height);
});

test('Point equality and proto shape', () => {
  const a = new Point(3, 5);
  const b = new Point(3, 5);
  const c = new Point(3, 6);
  assert.ok(a.equals(b));
  assert.ok(!a.equals(c));
  assert.deepEqual(a.proto, { x: 3, y: 5 });
});

test('Point.fromCoordProto tolerates missing fields', () => {
  assert.deepEqual(Point.fromCoordProto({}).dict, { x: 0, y: 0 });
  assert.deepEqual(Point.fromCoordProto({ x: 7 }).dict, { x: 7, y: 0 });
});

test('Frame defaults to origin (0,0) and size (0,0)', () => {
  const f = new Frame();
  assert.equal(f.origin.x, 0);
  assert.equal(f.size.width, 0);
});

test('frameStr / sizeStr / pointStr handle null', () => {
  assert.equal(frameStr(null), '[Undefined]');
  assert.equal(sizeStr(null), '[Undefined]');
  assert.equal(pointStr(null), '[Undefined]');
});

test('frameStr formats coordinates and size', () => {
  const f = new Frame(new Point(1, 2), new Size(80, 24));
  assert.equal(frameStr(f), '[(1, 2) (80 x 24)]');
});

test('distance is left-to-right top-to-bottom cell count', () => {
  // Same row: dx = 5
  assert.equal(distance(new Point(0, 1), new Point(5, 1), 80), 5);
  // Next row: width away
  assert.equal(distance(new Point(0, 0), new Point(0, 1), 80), 80);
  // Direction-independent
  assert.equal(distance(new Point(5, 1), new Point(0, 1), 80), 5);
});

test('Range.max and toSet', () => {
  const r = new Range(10, 3);
  assert.equal(r.max, 13);
  assert.deepEqual([...r.toSet].sort(), [10, 11, 12]);
});

test('CoordRange.length spans grid distance', () => {
  const cr = new CoordRange(new Point(0, 0), new Point(5, 1));
  assert.equal(cr.length(10), 15);
});

test('CoordRange.fromProto round-trip', () => {
  const cr = new CoordRange(new Point(1, 2), new Point(3, 4));
  const round = CoordRange.fromProto(cr.proto);
  assert.ok(round.start.equals(cr.start));
  assert.ok(round.end.equals(cr.end));
});

test('WindowedCoordRange hasWindow / start / end clamp to column window', () => {
  const cr = new CoordRange(new Point(0, 5), new Point(20, 5));
  const col = new Range(5, 10); // columns [5,15)

  const w = new WindowedCoordRange(cr, col);
  assert.ok(w.hasWindow);
  // start clamps x into [5, 15]
  assert.equal(w.start.x, 5);
  // end clamps x to right+1 = 16
  assert.equal(w.end.x, 16);
});

test('WindowedCoordRange with no column constraint is unwindowed', () => {
  const w = new WindowedCoordRange(
    new CoordRange(new Point(1, 0), new Point(2, 0))
  );
  assert.equal(w.hasWindow, false);
  assert.equal(w.left, 0);
});

test('iterm2EncodeStr quotes and escapes', () => {
  assert.equal(iterm2EncodeStr('hello'), '"hello"');
  assert.equal(iterm2EncodeStr('say "hi"'), '"say \\"hi\\""');
  assert.equal(iterm2EncodeStr('a\\b'), '"a\\\\b"');
});

test('iterm2EncodeList formats arrays', () => {
  assert.equal(iterm2EncodeList(['a', 1, 'b']), '["a", 1, "b"]');
  assert.equal(iterm2EncodeList([]), '[]');
});

test('iterm2Encode dispatches by type', () => {
  assert.equal(iterm2Encode('hi'), '"hi"');
  assert.equal(iterm2Encode(42), '42');
  assert.equal(iterm2Encode(true), 'true');
  assert.equal(iterm2Encode(['x', 1]), '["x", 1]');
});

test('invocationString assembles method calls', () => {
  assert.equal(
    invocationString('iterm2.set_title', { title: 'Hello' }),
    'iterm2.set_title(title: "Hello")'
  );
  assert.equal(invocationString('foo', { a: 1, b: 'two' }), 'foo(a: 1, b: "two")');
});
