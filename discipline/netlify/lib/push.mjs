import webpush from 'web-push';

export function vapid() {
  const pub = Netlify.env.get('VAPID_PUBLIC');
  const priv = Netlify.env.get('VAPID_PRIVATE');
  if (!pub || !priv) return null;
  webpush.setVapidDetails('mailto:reminders@istiqama.app', pub, priv);
  return { pub };
}

export async function send(sub, payload) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
    return { ok: true };
  } catch (e) {
    return { ok: false, gone: e.statusCode === 404 || e.statusCode === 410, status: e.statusCode, msg: String(e.body || e.message).slice(0, 200) };
  }
}
