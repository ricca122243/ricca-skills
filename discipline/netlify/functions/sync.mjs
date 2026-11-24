import { getStore } from '@netlify/blobs';
import { mergeState, hashKey, validKey } from '../lib/merge.mjs';

// GET  /api/sync  (заголовок X-Sync-Key) — получить данные
// PUT  /api/sync  — отправить свои данные, сервер сливает и возвращает итог
export default async (req) => {
  const key = req.headers.get('x-sync-key');
  if (!validKey(key)) return Response.json({ error: 'bad key' }, { status: 400 });
  const store = getStore({ name: 'istiqama', consistency: 'strong' });
  const id = 'data/' + await hashKey(key);
  const existing = await store.get(id, { type: 'json' });

  if (req.method === 'GET') return Response.json({ data: existing || null });

  if (req.method === 'PUT') {
    let incoming;
    try { incoming = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    if (!incoming || typeof incoming !== 'object' || incoming.v !== 1) return Response.json({ error: 'bad data' }, { status: 400 });
    const merged = mergeState(existing, incoming);
    const body = JSON.stringify(merged);
    if (body.length > 4_000_000) return Response.json({ error: 'too big' }, { status: 413 });
    await store.set(id, body);
    return Response.json({ data: merged });
  }
  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/sync', method: ['GET', 'PUT'] };
