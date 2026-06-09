import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LocalWriteOnlyProfile,
  Profile,
  CursorType,
  BackgroundImageMode,
} from '../src/profile';
import { Color } from '../src/color';

test('LocalWriteOnlyProfile starts empty', () => {
  const lwop = new LocalWriteOnlyProfile();
  assert.deepEqual(lwop.values(), {});
  assert.deepEqual(lwop.assignments(), []);
});

test('LocalWriteOnlyProfile accepts initial overrides', () => {
  const lwop = new LocalWriteOnlyProfile({ Foo: '"bar"' });
  assert.equal(lwop.values()['Foo'], '"bar"');
});

test('setForegroundColor JSON-encodes the Color dict', () => {
  const lwop = new LocalWriteOnlyProfile();
  lwop.setForegroundColor(new Color(255, 0, 0));
  const parsed = JSON.parse(lwop.values()['Foreground Color']!);
  assert.equal(parsed['Red Component'], 1);
  assert.equal(parsed['Green Component'], 0);
  assert.equal(parsed['Blue Component'], 0);
});

test('setBackgroundColor / setBackgroundColorLight target different keys', () => {
  const lwop = new LocalWriteOnlyProfile();
  lwop.setBackgroundColor(new Color(1, 2, 3));
  lwop.setBackgroundColorLight(new Color(4, 5, 6));
  assert.ok(lwop.values()['Background Color']);
  assert.ok(lwop.values()['Background Color (Light)']);
  assert.notEqual(
    lwop.values()['Background Color'],
    lwop.values()['Background Color (Light)']
  );
});

test('Enum setters use the enum.toJSON if defined, else JSON.stringify', () => {
  const lwop = new LocalWriteOnlyProfile();
  lwop.setCursorType(CursorType.VERTICAL);
  // CursorType is a TS numeric enum (no .toJSON), so JSON-encoded as 1.
  assert.equal(lwop.values()['Cursor Type'], '1');

  lwop.setBackgroundImageMode(BackgroundImageMode.ASPECT_FILL);
  assert.equal(lwop.values()['Background Image Mode'], '2');
});

test('assignments() returns key/jsonValue pairs', () => {
  const lwop = new LocalWriteOnlyProfile();
  lwop.setCommand('/bin/bash');
  const a = lwop.assignments();
  const cmd = a.find((p) => p.key === 'Command');
  assert.ok(cmd);
  assert.equal(cmd!.jsonValue, '"/bin/bash"');
});

test('_colorSet null stores literal "null"', () => {
  const lwop = new LocalWriteOnlyProfile();
  lwop.setForegroundColor(null as unknown as Color);
  assert.equal(lwop.values()['Foreground Color'], 'null');
});

test('Profile decodes ProfileProperty list and exposes GUID', () => {
  const fakeConn = {} as never;
  const props = [
    { key: 'Guid', jsonValue: '"ABC-123"' },
    { key: 'Name', jsonValue: '"Default"' },
    { key: 'Foreground Color', jsonValue: '{"Red Component":1,"Green Component":0,"Blue Component":0}' },
  ];
  const p = new Profile(fakeConn, 'session-1', props);
  assert.equal(p.guid, 'ABC-123');
  assert.equal(p.getProperty('Name'), 'Default');
  assert.equal(p.has('Foreground Color'), true);
  assert.equal(p.has('Missing'), false);
  assert.equal(p.getProperty('Missing'), null);
});

test('Profile.localWriteOnlyCopy preserves values for re-set', () => {
  const fakeConn = {} as never;
  const p = new Profile(fakeConn, null, [
    { key: 'Name', jsonValue: '"X"' },
  ]);
  const lwop = p.localWriteOnlyCopy();
  assert.equal(lwop.values()['Name'], '"X"');
});

test('Profile tolerates non-JSON values without throwing', () => {
  const fakeConn = {} as never;
  const p = new Profile(fakeConn, null, [
    { key: 'WeirdKey', jsonValue: 'not-json' },
  ]);
  assert.equal(p.getProperty('WeirdKey'), 'not-json');
});
