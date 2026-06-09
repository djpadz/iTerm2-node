import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Color, ColorSpace } from '../src/color';

test('Color default constructor is opaque black', () => {
  const c = new Color();
  assert.equal(c.red, 0);
  assert.equal(c.green, 0);
  assert.equal(c.blue, 0);
  assert.equal(c.alpha, 255);
  assert.equal(c.colorSpace, ColorSpace.SRGB);
});

test('Color.fromHex parses #rrggbb', () => {
  const c = Color.fromHex('#1a2b3c');
  assert.ok(c);
  assert.equal(c!.red, 0x1a);
  assert.equal(c!.green, 0x2b);
  assert.equal(c!.blue, 0x3c);
  assert.equal(c!.alpha, 255);
});

test('Color.fromHex parses 13-char form via 257 division', () => {
  // ffff -> 65535 / 257 = 255
  const c = Color.fromHex('#ffffffff0000');
  assert.ok(c);
  assert.equal(c!.red, 255);
  assert.equal(c!.green, 255);
  assert.equal(c!.blue, 0);
});

test('Color.fromHex parses p3#rrggbb and sets P3 color space', () => {
  const c = Color.fromHex('p3#aabbcc');
  assert.ok(c);
  assert.equal(c!.colorSpace, ColorSpace.P3);
  assert.equal(c!.red, 0xaa);
  assert.equal(c!.green, 0xbb);
  assert.equal(c!.blue, 0xcc);
});

test('Color.fromHex rejects malformed input', () => {
  assert.equal(Color.fromHex(''), null);
  assert.equal(Color.fromHex('xyz'), null);
  assert.equal(Color.fromHex('#abc'), null); // not 7 chars, not 13 chars
});

test('Color.hex round-trip for sRGB', () => {
  const c = new Color(0x12, 0x34, 0x56);
  assert.equal(c.hex, '#123456');
});

test('Color.hex carries p3 prefix for P3 color space', () => {
  const c = new Color(0xff, 0x00, 0x00, 255, ColorSpace.P3);
  assert.equal(c.hex, 'p3#ff0000');
});

test('Color.hex pads sub-16 components', () => {
  const c = new Color(1, 2, 3);
  assert.equal(c.hex, '#010203');
});

test('Color.getDict matches iTerm2 plist key shape', () => {
  const c = new Color(255, 0, 128, 255);
  const d = c.getDict();
  assert.equal(d['Red Component'], 1);
  assert.equal(d['Green Component'], 0);
  assert.equal(d['Blue Component'], 128 / 255);
  assert.equal(d['Alpha Component'], 1);
  assert.equal(d['Color Space'], 'sRGB');
});

test('Color.fromDict updates components and infers calibrated space', () => {
  const c = new Color();
  c.fromDict({
    'Red Component': 0.5,
    'Green Component': 1,
    'Blue Component': 0,
  });
  assert.equal(c.red, 127.5);
  assert.equal(c.green, 255);
  assert.equal(c.blue, 0);
  // Profiles default to Calibrated when no Color Space key is present.
  assert.equal(c.colorSpace, ColorSpace.Calibrated);
});

test('Color.fromTrigger handles hex', () => {
  const c = Color.fromTrigger('#abcdef');
  assert.ok(c);
  assert.equal(c!.red, 0xab);
});
