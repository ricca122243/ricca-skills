// Время намаза — официальные данные Духовного управления мусульман Казахстана (api.muftyat.kz)
const API = 'https://api.muftyat.kz';
export const PRAYERS = [['fajr', 'Фаджр'], ['dhuhr', 'Зухр'], ['asr', 'Аср'], ['maghrib', 'Магриб'], ['isha', 'Иша']];
// координаты передаём строкой ровно как в справочнике Муфтията — другие сервис не принимает
export const okCoord = x => typeof x === 'string' && /^\d{1,2}\.\d{1,8}$/.test(x);

// Фаджр: берём более позднее из fajr/imsak — у Муфтията одно из них время прекращения сухура (на 10 минут раньше)
export function normalizeDay(d) {
  const later = (a, b) => (a && b ? (a > b ? a : b) : a || b);
  return { date: d.Date, fajr: later(d.fajr, d.imsak), sunrise: d.sunrise, dhuhr: d.dhuhr, asr: d.asr, maghrib: d.maghrib || d.sunset, isha: d.isha };
}

export async function yearTimes(store, lat, lng, year) {
  if (!okCoord(lat) || !okCoord(lng)) throw new Error('bad coords');
  const key = `prayer/${lat}_${lng}_${year}`;
  const cached = await store.get(key, { type: 'json' });
  if (cached?.days?.length) return cached.days;
  const res = await fetch(`${API}/prayer-times/${year}/${lat}/${lng}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('muftyat ' + res.status);
  const j = await res.json();
  const days = (j.result || []).map(normalizeDay).filter(d => d.date);
  if (days.length > 300) await store.setJSON(key, { days, at: Date.now() });
  return days;
}

const city = c => ({ title: c.title, region: c.region || '', district: c.district || '', lat: String(c.lat), lng: String(c.lng), tz: +c.timezone || 5 });
export async function nearestCity(lat, lng) {
  const res = await fetch(`${API}/cities/?lat=${(+lat).toFixed(5)}&lng=${(+lng).toFixed(5)}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('muftyat ' + res.status);
  const j = await res.json(), c = j.results?.[0];
  return c && c.distance != null && c.distance < 80 ? city(c) : null;
}
export async function searchCities(q) {
  const res = await fetch(`${API}/cities/?search=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('muftyat ' + res.status);
  const j = await res.json();
  return (j.results || []).slice(0, 20).map(city);
}
