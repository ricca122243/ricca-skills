import { askJSON, aiReady, aiError } from '../lib/ai.mjs';

// POST /api/food — оценить приём пищи: калории, БЖУ, полезно/вредно, совет.
const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'integer' },
          kcal: { type: 'integer' },
          protein: { type: 'integer' },
          fat: { type: 'integer' },
          carbs: { type: 'integer' },
          verdict: { type: 'string', enum: ['good', 'ok', 'bad'] },
          why: { type: 'string' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'fat', 'carbs', 'verdict', 'why'],
        additionalProperties: false,
      },
    },
    score: { type: 'integer' },
    comment: { type: 'string' },
  },
  required: ['items', 'score', 'comment'],
  additionalProperties: false,
};

const SYSTEM = `Ты — нутрициолог в приложении привычек. Человек живёт в Казахстане, пишет по-русски, может писать с ошибками и на смеси русского и казахского.
По описанию приёма пищи разбей его на отдельные блюда и напитки и оцени каждое: вес порции в граммах, калории, белки, жиры, углеводы (в граммах, целые числа).
Учитывай типичные местные порции (плов, бешбармак, лагман, манты, самса, баурсаки, казы и т.д.), размер порции (s — маленькая, m — обычная, l — большая) и место (кафе и фастфуд обычно жирнее и порции больше, чем дома).
verdict: good — полезно, ok — нормально, bad — вредно (фастфуд, жареное во фритюре, сладкие напитки, много сахара, переработанное мясо). why — до 6 слов, почему.
score — оценка всего приёма пищи от 1 до 10 с учётом цели человека.
comment — 1–2 коротких предложения: дружеский практичный совет, без морали. Пиши «ты».
Если в тексте нет еды, верни пустой items, score 0 и comment с просьбой описать еду.`;

export default async (req) => {
  if (!aiReady()) return Response.json({ error: 'no-ai' }, { status: 503 });
  let b;
  try { b = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const text = String(b?.text || '').trim().slice(0, 500);
  if (!text) return Response.json({ error: 'empty' }, { status: 400 });
  const meal = { breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин', snack: 'перекус' }[b.meal] || 'приём пищи';
  const place = { home: 'дома', cafe: 'в кафе/ресторане', delivery: 'доставка', street: 'фастфуд/на улице' }[b.place] || 'дома';
  const body = b.body || {};
  const goal = { lose: 'похудеть', keep: 'держать вес', gain: 'набрать массу' }[body.goal] || 'держать вес';
  const user = `Приём пищи: ${meal}, ${place}, порция: ${['s', 'm', 'l'].includes(b.portion) ? b.portion : 'm'}.
Что ел: ${text}
О человеке: ${body.sex === 'f' ? 'женщина' : 'мужчина'}${body.age ? ', ' + (+body.age) + ' лет' : ''}${body.weight ? ', ' + (+body.weight) + ' кг' : ''}${body.height ? ', рост ' + (+body.height) : ''}; цель — ${goal}; дневная норма ~${+body.norm || 2200} ккал.`;
  try {
    const out = await askJSON({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 3000 });
    out.items = (out.items || []).slice(0, 15);
    out.score = Math.max(0, Math.min(10, out.score | 0));
    return Response.json(out);
  } catch (e) { return aiError(e); }
};

export const config = {
  path: '/api/food',
  method: 'POST',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
