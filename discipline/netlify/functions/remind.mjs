import { getStore } from '@netlify/blobs';
import { vapid, send } from '../lib/push.mjs';
import { yearTimes, PRAYERS } from '../lib/prayer.mjs';

// Каждые 5 минут: смотрим расписание каждого устройства в его часовом поясе и шлём напоминания.
function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }[p.weekday];
  const offset = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(Date.now() / 60000) * 60000) / 60000);
  return { date: `${p.year}-${p.month}-${p.day}`, year: +p.year, min: (+p.hour) * 60 + (+p.minute), wd, offset };
}
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

export default async () => {
  if (!vapid()) return;
  const store = getStore({ name: 'istiqama', consistency: 'strong' });
  const { blobs } = await store.list({ prefix: 'subs/' });
  for (const { key } of blobs) {
    const doc = await store.get(key, { type: 'json' });
    if (!doc) continue;
    const now = localNow(doc.tz || 'Asia/Almaty');
    const sentKey = 'sent/' + key.slice(5);
    const sent = (await store.get(sentKey, { type: 'json' })) || {};
    let changed = false, dataCache;
    for (const r of doc.reminders || []) {
      const [h, m] = r.time.split(':').map(Number);
      const t = h * 60 + m;
      const diff = now.min - t;
      if (diff < 0 || diff > 9) continue;               // окно 10 минут — запас на задержки крона
      if (r.days && r.days.length && !r.days.includes(now.wd)) continue;
      if (sent[r.id] === now.date) continue;
      if (r.onlyIfNoReport && doc.keyHash) {
        if (dataCache === undefined) dataCache = await store.get('data/' + doc.keyHash, { type: 'json' });
        if (dataCache?.days?.[now.date]?.r?.closed) { sent[r.id] = now.date; changed = true; continue; }
      }
      const res = await send(doc.sub, { title: r.title, body: r.body, url: r.open ? '/?open=' + r.open : r.onlyIfNoReport ? '/?open=report' : '/' });
      if (res.gone) { await store.delete(key); await store.delete(sentKey); changed = false; break; }
      sent[r.id] = now.date; changed = true;
    }
    // намазы по времени Муфтията
    if (doc.prayer?.on && store) {
      try {
        const days = await yearTimes(store, doc.prayer.lat, doc.prayer.lng, now.year);
        const day = days.find(x => x.date === now.date);
        if (day) for (const [k, name] of PRAYERS) {
          if (!day[k]) continue;
          // время Муфтията в часовом поясе города → в часовой пояс телефона
          const t = toMin(day[k]) - doc.prayer.tz * 60 + now.offset - (doc.prayer.before || 0);
          const diff = now.min - t, id = 'p-' + k;
          if (diff < 0 || diff > 9 || sent[id] === now.date) continue;
          const res = await send(doc.sub, { title: `🕌 ${name} — ${day[k]}`, body: doc.prayer.before ? `Через ${doc.prayer.before} мин время намаза ${name}.` : `Наступило время намаза ${name}.`, url: '/', tag: id });
          if (res.gone) break;
          sent[id] = now.date; changed = true;
        }
      } catch (e) { console.log('prayer', e.message); }
    }
    if (changed) await store.setJSON(sentKey, sent);
  }
};

export const config = { schedule: '*/5 * * * *' };
