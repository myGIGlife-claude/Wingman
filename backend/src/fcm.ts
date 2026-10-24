import './firebase.ts';
import { getApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { listDevices, removeDevice } from './store.ts';
import type { Widget } from './model.ts';

// Sends the widget model as a high-priority data message; alerts go as their own data messages.
// Throws when nothing could be delivered, so the caller can retry on the next tick.
export async function push(model: Widget | undefined, alerts: { text: string; url: string | null }[]) {
  const tokens = await listDevices();
  const msgs = tokens.flatMap(token => {
    const base = { token, android: { priority: 'high' as const } };
    const list: any[] = model ? [{ ...base, data: { model: JSON.stringify(model) } }] : [];
    for (const a of alerts) list.push({ ...base, data: { alert: a.text, url: a.url ?? '' } });
    return list;
  });
  if (!msgs.length) return;
  const res = await getMessaging().sendEach(msgs);
  let failed = 0;
  res.responses.forEach((r, i) => {
    if (!r.error) return;
    console.error('fcm send failed', r.error.code, r.error.message, 'project=', getApp().options.projectId);
    if (r.error.code === 'messaging/registration-token-not-registered') removeDevice(msgs[i].token).catch(() => {});
    else failed++;
  });
  if (failed === msgs.length) throw new Error('all pushes failed');
}
