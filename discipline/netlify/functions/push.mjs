import { getStore } from '@netlify/blobs';
import { hashKey, validKey } from '../lib/merge.mjs';
import { vapid, send } from '../lib/push.mjs';

// GET  /api/push            — публичный VAPID-ключ
// POST /api/push {action:'save', device, sub, tz, reminders} — сохранить подписку и расписание
// POST /api/push {action:'test', device}                      — тестовое уведомление
// POST /api/push {action:'off',  device}                      — отключить
export default async (req) => {
  const v = vapid();
  if (req.method === 'GET') return Response.json({ key: v?.pub || null });
  if (!v) return Response.json({ error: 'push not configured' }, { status: 503 });

  let b;
  try { b = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  if (!b || !/^[A-Za-z0-9-]{8,64}$/.test(b.device || '')) return Response.json({ error: 'bad device' }, { status: 400 });
  const store = getStore({ name: 'istiqama', consistency: 'strong' });
  const id = 'subs/' + b.device;

  if (b.action === 'save') {
    if (!b.sub?.endpoint || !/^https:\/\//.test(b.sub.endpoint)) return Response.json({ error: 'bad sub' }, { status: 400 });
    const reminders = (Array.isArray(b.reminders) ? b.reminders : []).slice(0, 40)
      .filter(r => /^\d{2}:\d{2}$/.test(r.time))
      .map(r => ({ id: String(r.id).slice(0, 40), time: r.time, title: String(r.title || '').slice(0, 80), body: String(r.body || '').slice(0, 200), onlyIfNoReport: !!r.onlyIfNoReport, open: ['food', 'report', 'money'].includes(r.open) ? r.open : null, days: Array.isArray(r.days) ? r.days.slice(0, 7) : null }));
    let tz = 'Asia/Almaty';
    try { if (b.tz) { new Intl.DateTimeFormat('en', { timeZone: b.tz }); tz = b.tz; } } catch {}
    const doc = { sub: b.sub, tz, reminders, keyHash: validKey(b.key) ? await hashKey(b.key) : null, saved: Date.now() };
    await store.setJSON(id, doc);
    return Response.json({ ok: true, count: reminders.length });
  }
  if (b.action === 'test') {
    const doc = await store.get(id, { type: 'json' });
    if (!doc) return Response.json({ error: 'not subscribed' }, { status: 404 });
    const r = await send(doc.sub, { title: 'Истикама 🔥', body: 'Уведомления работают! Дисциплина — это свобода.', url: '/' });
    return Response.json(r, { status: r.ok ? 200 : 502 });
  }
  if (b.action === 'off') {
    await store.delete(id);
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'bad action' }, { status: 400 });
};

export const config = { path: '/api/push', method: ['GET', 'POST'] };
