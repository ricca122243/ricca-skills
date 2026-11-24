import { askJSON, aiReady, aiError } from '../lib/ai.mjs';

// POST /api/review — разбор последних недель: что получается, что мешает, на чём сосредоточиться.
const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['good', 'warn', 'bad'] }, title: { type: 'string' }, text: { type: 'string' } },
        required: ['kind', 'title', 'text'],
        additionalProperties: false,
      },
    },
    focus: { type: 'string' },
  },
  required: ['summary', 'points', 'focus'],
  additionalProperties: false,
};

const SYSTEM = `Ты — личный наставник по дисциплине в приложении привычек. Человек — мусульманин из Казахстана, хочет укрепить иман, правильно питаться, читать книгу в месяц, копить на отдых и хорошо работать.
Тебе дают статистику за период. Найди в цифрах закономерности (что связано с хорошими и плохими днями, где утекают деньги, что с едой, водой, намазом, сном, чтением).
summary — 1–2 предложения общий итог. points — 4–7 пунктов: kind good (получается), warn (внимание), bad (мешает); title — 2–5 слов; text — 1–2 предложения с конкретными цифрами из данных и конкретным действием.
focus — одна главная цель на следующую неделю, конкретная и измеримая.
Пиши по-русски, на «ты», просто и по делу, без воды и без морали. Не выдумывай цифры, которых нет в данных.`;

export default async (req) => {
  if (!aiReady()) return Response.json({ error: 'no-ai' }, { status: 503 });
  let b;
  try { b = await req.text(); } catch { return Response.json({ error: 'bad' }, { status: 400 }); }
  if (!b || b.length > 30000) return Response.json({ error: 'size' }, { status: 400 });
  try {
    const out = await askJSON({ system: SYSTEM, user: 'Статистика (JSON):\n' + b, schema: SCHEMA, maxTokens: 6000 });
    return Response.json(out);
  } catch (e) { return aiError(e); }
};

export const config = {
  path: '/api/review',
  method: 'POST',
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
