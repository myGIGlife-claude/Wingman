import { initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { listDevices, removeDevice } from './store.ts';
import type { Widget } from './model.ts';

initializeApp();

// Always sends the widget model as a high-priority data message; alerts also carry a visible notification.
export async function push(model: Widget, alerts: { text: string; url: string | null }[]) {
  const tokens = await listDevices();
  const msgs = tokens.flatMap(token => {
    const base = { token, android: { priority: 'high' as const } };
    const list = [{ ...base, data: { model: JSON.stringify(model) } }];
    for (const a of alerts) list.push({ ...base, data: { alert: a.text, url: a.url ?? '' } } as any);
    return list;
  });
  if (!msgs.length) return;
  const res = await getMessaging().sendEach(msgs);
  res.responses.forEach((r, i) => {
    if (r.error) console.error('fcm send failed', r.error.code);
    if (r.error?.code === 'messaging/registration-token-not-registered') removeDevice((msgs[i] as any).token).catch(() => {});
  });
}
