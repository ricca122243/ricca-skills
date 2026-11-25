import Anthropic from "@anthropic-ai/sdk";

// AI teacher backend: streams Claude's answer as plain text through Netlify AI Gateway.
const MODELS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-sonnet-5-5" };

export default async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (!process.env.ANTHROPIC_BASE_URL && !process.env.ANTHROPIC_API_KEY)
    return new Response("AI Gateway is not active yet", { status: 503 });
  let body;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const messages = Array.isArray(body?.messages) ? body.messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
    .slice(-40) : [];
  if (!messages.length || messages[0].role !== "user" || messages[messages.length - 1].role !== "user")
    return new Response("messages must start and end with a user turn", { status: 400 });
  const total = messages.reduce((a, m) => a + m.content.length, 0);
  if (total > 120000) return new Response("prompt too large", { status: 413 });

  const model = MODELS[body.tier] || MODELS.default;
  const client = new Anthropic();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.messages.stream({ model, max_tokens: 4096, messages });
        s.on("text", (t) => controller.enqueue(enc.encode(t)));
        await s.finalMessage();
      } catch (e) {
        controller.enqueue(enc.encode("[[ERROR]] " + String(e?.message || e)));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
};

export const config = { path: "/api/ai" };
