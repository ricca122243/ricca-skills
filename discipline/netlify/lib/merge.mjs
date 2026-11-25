// Слияние данных двух устройств: по каждой записи побеждает более свежая (поле u).
export const SINGLE = ['profile', 'goals', 'settings', 'body', 'insight', 'prayer'];
export const LISTS = ['habits', 'money', 'rewards', 'purchases', 'reminders', 'books', 'meals', 'claims'];

export function mergeState(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { v: 1 };
  for (const k of SINGLE) { const v = ((a[k]?.u || 0) >= (b[k]?.u || 0)) ? a[k] : b[k]; if (v !== undefined) out[k] = v; }
  for (const k of LISTS) {
    const m = new Map();
    for (const it of [...(a[k] || []), ...(b[k] || [])]) {
      const cur = m.get(it.id);
      if (!cur || (it.u || 0) > (cur.u || 0)) m.set(it.id, it);
    }
    out[k] = [...m.values()];
  }
  out.days = {};
  const keys = new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})]);
  for (const d of keys) {
    const x = a.days?.[d], y = b.days?.[d];
    out.days[d] = !x ? y : !y ? x : ((x.u || 0) >= (y.u || 0) ? x : y);
  }
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

export async function hashKey(key) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('istiqama:' + key));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

export function validKey(k) {
  return typeof k === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(k);
}
