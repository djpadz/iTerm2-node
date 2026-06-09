import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ClientOriginatedMessage,
  ServerOriginatedMessage,
  Notification,
} from '../src/proto';

test('ClientOriginatedMessage encode + decode round-trip', () => {
  const msg = ClientOriginatedMessage.create({
    id: 42,
    listSessionsRequest: {},
  });
  const bytes = ClientOriginatedMessage.encode(msg).finish();
  const decoded = ClientOriginatedMessage.decode(bytes);
  assert.equal(decoded.id, 42);
  assert.ok(decoded.listSessionsRequest);
});

test('ClientOriginatedMessage carries SendTextRequest correctly', () => {
  const bytes = ClientOriginatedMessage.encode(
    ClientOriginatedMessage.create({
      id: 7,
      sendTextRequest: {
        session: 'active',
        text: 'echo hi\n',
        suppressBroadcast: true,
      },
    })
  ).finish();
  const decoded = ClientOriginatedMessage.decode(bytes);
  assert.equal(decoded.id, 7);
  assert.equal(decoded.sendTextRequest!.session, 'active');
  assert.equal(decoded.sendTextRequest!.text, 'echo hi\n');
  assert.equal(decoded.sendTextRequest!.suppressBroadcast, true);
});

test('ServerOriginatedMessage carries a Notification', () => {
  const bytes = ServerOriginatedMessage.encode(
    ServerOriginatedMessage.create({
      id: 99,
      notification: {
        focusChangedNotification: { session: 'sess-id' },
      },
    })
  ).finish();
  const decoded = ServerOriginatedMessage.decode(bytes);
  assert.equal(decoded.id, 99);
  assert.equal(
    decoded.notification!.focusChangedNotification!.session,
    'sess-id'
  );
});

test('Notification distinguishes its oneof variants', () => {
  const n = Notification.create({
    keystrokeNotification: { session: 's', characters: 'a' },
  });
  assert.ok(n.keystrokeNotification);
  // Codegen uses --null-defaults, so unset fields are null (not undefined).
  assert.equal(n.focusChangedNotification, null);
});

test('ClientOriginatedMessage verify catches a wrong-type field', () => {
  // session must be string; pass a number to trigger verify failure.
  const err = ClientOriginatedMessage.verify({
    id: 1,
    sendTextRequest: { session: 123 as unknown as string, text: 'x' },
  });
  assert.ok(err, 'verify should return a non-null error string');
});

test('NotificationRequest with numeric enum encodes', () => {
  const NOTIFY_ON_FOCUS_CHANGE = 9;
  const bytes = ClientOriginatedMessage.encode(
    ClientOriginatedMessage.create({
      id: 1,
      notificationRequest: {
        subscribe: true,
        notificationType: NOTIFY_ON_FOCUS_CHANGE,
        session: 'all',
      },
    })
  ).finish();
  const decoded = ClientOriginatedMessage.decode(bytes);
  assert.equal(decoded.notificationRequest!.notificationType, 9);
  assert.equal(decoded.notificationRequest!.session, 'all');
});
