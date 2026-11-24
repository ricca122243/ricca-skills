import Anthropic from '@anthropic-ai/sdk';

// Claude через Netlify AI Gateway: ключ и адрес подставляются автоматически.
export const MODEL = 'claude-opus-5-5';
export const aiReady = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL);

export async function askJSON({ system, user, schema, maxTokens = 4000 }) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { status: 422 });
  if (res.stop_reason === 'max_tokens') throw Object.assign(new Error('too long'), { status: 502 });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

export function aiError(e) {
  if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'rate' }, { status: 429 });
  if (e instanceof Anthropic.APIError) return Response.json({ error: 'api', status: e.status }, { status: 502 });
  return Response.json({ error: String(e.message || e).slice(0, 120) }, { status: e.status || 500 });
}
