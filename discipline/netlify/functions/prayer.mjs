import { getStore } from '@netlify/blobs';
import { yearTimes, searchCities, nearestCity, okCoord } from '../lib/prayer.mjs';

// GET /api/prayer?q=Алматы                — поиск населённого пункта
// GET /api/prayer?near=lat,lng            — ближайший населённый пункт (геолокация)
// GET /api/prayer?lat=..&lng=..&year=2026 — время намаза на год (координаты из справочника)
export default async (req) => {
  const u = new URL(req.url);
  try {
    const q = (u.searchParams.get('q') || '').trim();
    if (q) {
      if (q.length < 2 || q.length > 60) return Response.json({ results: [] });
      return Response.json({ results: await searchCities(q) }, { headers: { 'cache-control': 'public, max-age=86400' } });
    }
    const near = (u.searchParams.get('near') || '').split(',').map(Number);
    if (near.length === 2 && near.every(Number.isFinite)) return Response.json({ city: await nearestCity(near[0], near[1]) });
    const lat = u.searchParams.get('lat'), lng = u.searchParams.get('lng'), year = +u.searchParams.get('year') || new Date().getFullYear();
    if (!okCoord(lat) || !okCoord(lng) || year < 2024 || year > 2040) return Response.json({ error: 'bad params' }, { status: 400 });
    const days = await yearTimes(getStore({ name: 'istiqama', consistency: 'strong' }), lat, lng, year);
    return Response.json({ days }, { headers: { 'cache-control': 'public, max-age=86400' } });
  } catch (e) {
    return Response.json({ error: String(e.message || e).slice(0, 120) }, { status: 502 });
  }
};

export const config = { path: '/api/prayer', method: 'GET', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
