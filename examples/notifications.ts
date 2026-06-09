import { runForever, type ServerMessage } from '../src';

interface NotificationEnvelope {
  notification?: {
    focusChangedNotification?: unknown;
    keystrokeNotification?: unknown;
    [key: string]: unknown;
  };
}

runForever(async (conn) => {
  conn.on('message', (msg: ServerMessage) => {
    const n = (msg as NotificationEnvelope).notification;
    if (!n) return;
    if (n.focusChangedNotification) {
      console.log('focus changed:', JSON.stringify(n.focusChangedNotification));
    } else if (n.keystrokeNotification) {
      console.log('keystroke:', JSON.stringify(n.keystrokeNotification));
    } else {
      console.log('notification:', JSON.stringify(n));
    }
  });

  const sub = await conn.request({
    notificationRequest: {
      subscribe: true,
      notificationType: 'NOTIFY_ON_FOCUS_CHANGE',
    },
  });
  console.log(
    'subscription response:',
    JSON.stringify((sub as { notificationResponse?: unknown }).notificationResponse)
  );
}).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
