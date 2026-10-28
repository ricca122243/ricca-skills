// API сайта «Рассылка Damillion»: вход, очередь, статусы, дожим, присутствие, отчёт, импорт/экспорт.
import { getStore } from "@netlify/blobs";
import { createHash, createHmac, createDecipheriv, timingSafeEqual } from "node:crypto";
import seed from "./seed-data.mjs";

export const STATUSES = ["new", "sent", "followup", "noreply", "interested", "refused", "skip"];
const LABEL = { new: "Новый", sent: "Написал", followup: "Напомнил", noreply: "Не ответил", interested: "Интерес", refused: "Отказал", skip: "Нет WhatsApp" };
const SESSION_DAYS = 30;
const EVENTS_CAP = 4000;

export const DEFAULT_SETTINGS = {
  dailyPlan: 60,
  autoSent: true,
  followupHours: 48,
  templates: {
    furniture: "Здравствуйте! Меня зовут {manager}, я из Damillion, делаем сайты для мебельных компаний Алматы. {hook} Люди сейчас сначала смотрят каталог и работы в интернете, и без сайта до вас многие не доходят. Сделаем сайт с каталогом, фото работ и заявкой в WhatsApp. Скинуть пример?",
    massage: "Здравствуйте! Меня зовут {manager}, я из Damillion, делаем сайты для массажных кабинетов. {hook} На массаж выбирают по отзывам и записываются сразу. Сделаем сайт с ценами, отзывами и кнопкой записи в WhatsApp. Скинуть пример?",
    default: "Здравствуйте! Меня зовут {manager}, я из Damillion, делаем сайты для местного бизнеса в Алматы. {hook} Сделаем сайт с заявкой в WhatsApp, без лишнего. Скинуть пример?",
    followup: "Здравствуйте ещё раз! Это {manager} из Damillion. Писал вам про сайт для «{name}». Если тема интересна, скину пример и цену, это 2 минуты. Если нет, просто напишите «нет», больше не побеспокою.",
  },
  hooks: {
    withReviews: "У «{name}» в 2ГИС {rating} и {reviews} отзывов, а сайта нет.",
    withoutReviews: "Нашёл «{name}» в 2ГИС, сайта у вас нет.",
  },
};

const env = (k) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "").trim();
const store = () => globalThis.__rassylkaStore || getStore({ name: "rassylka", consistency: "strong" });
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- сессии ---------- */
function secret() {
  return createHash("sha256").update(["OWNER_LOGIN", "OWNER_PASS", "WORKER_LOGIN", "WORKER_PASS"].map(env).join("|") + "|rassylka").digest();
}
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");
function makeCookie(session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `rs=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
function readSession(req) {
  const m = /(?:^|;\s*)rs=([^;]+)/.exec(req.headers.get("cookie") || "");
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload)), given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return s && s.role && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
function same(given, expected) {
  if (!expected) return false;
  const a = Buffer.from(String(given || "")), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- стартовый список (зашифрован, ключ SEED_KEY на Netlify) ---------- */
export function decryptSeed() {
  const key = env("SEED_KEY");
  if (!key || !seed?.ct) return { rows: [], error: key ? null : "no_key" };
  try {
    const d = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(seed.iv, "base64"));
    d.setAuthTag(Buffer.from(seed.tag, "base64"));
    const text = Buffer.concat([d.update(Buffer.from(seed.ct, "base64")), d.final()]).toString("utf8");
    return { rows: JSON.parse(text), error: null, version: seed.version || 1 };
  } catch (e) {
    console.error("seed decrypt failed", e.message);
    return { rows: [], error: "bad_key" };
  }
}
function fresh(r, ord) {
  return { name: r.name, phone: r.phone, niche: r.niche || "", address: r.address || "", rating: r.rating || "", reviews: r.reviews || 0, instagram: r.instagram || "", hours: r.hours || "", category: r.category || "", firmId: r.firmId || "", status: "new", ord, by: null, at: null, sentBy: null, sentAt: null, followAt: null, note: "" };
}
// Добавляет новых клиентов из стартового списка и дополняет карточки (рейтинг, Instagram...), статусы не трогает.
function applySeed(s) {
  const { rows, error, version } = decryptSeed();
  s.seedError = error;
  if (error || !rows.length || s.seedVersion === version) return false;
  let ord = Math.max(0, ...Object.values(s.contacts).map((c) => c.ord || 0));
  for (const r of rows) {
    const phone = normPhone(r.phone);
    if (!phone) continue;
    const c = s.contacts[phone];
    if (!c) s.contacts[phone] = fresh({ ...r, phone }, ++ord);
    else for (const k of ["rating", "reviews", "instagram", "hours", "category", "firmId", "address", "niche"]) if (r[k] && !c[k]) c[k] = r[k];
  }
  s.seedVersion = version;
  return true;
}

/* ---------- хранилище ---------- */
function normalize(data) {
  data.contacts ||= {};
  data.events ||= [];
  const d = DEFAULT_SETTINGS, st = data.settings || {};
  data.settings = { ...d, ...st, templates: { ...d.templates, ...(st.templates || {}) }, hooks: { ...d.hooks, ...(st.hooks || {}) } };
  return data;
}
async function readState() {
  const r = await store().getWithMetadata("state", { type: "json" });
  if (!r || !r.data) {
    const data = normalize({ contacts: {}, events: [] });
    applySeed(data);
    const res = await store().setJSON("state", data, { onlyIfNew: true });
    if (res && res.modified === false) return readState();
    return { data, etag: (res && res.etag) || null };
  }
  const data = normalize(r.data);
  let etag = r.etag || null;
  if (applySeed(data)) {
    const res = await store().setJSON("state", data, etag ? { onlyIfMatch: etag } : {});
    if (res && res.modified === false) return readState();
    etag = (res && res.etag) || etag;
  }
  return { data, etag };
}
// Одна запись за раз: читаем, меняем, пишем только если никто не успел раньше; иначе повторяем.
async function mutate(fn) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await readState();
    const next = fn(data);
    if (next === false) return data;
    if (next.events.length > EVENTS_CAP) next.events = next.events.slice(-EVENTS_CAP);
    const res = await store().setJSON("state", next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return next;
    await sleep(60 + Math.random() * 200);
  }
  throw new Error("busy");
}
async function readPresence() {
  const out = {};
  const { blobs } = await store().list({ prefix: "p/" });
  await Promise.all((blobs || []).map(async (b) => { const v = await store().get(b.key, { type: "json" }); if (v) out[b.key.slice(2)] = v; }));
  return out;
}

/* ---------- утилиты ---------- */
export function normPhone(s) {
  let d = String(s || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return /^7\d{10}$/.test(d) ? d : null;
}
function parseCsv(text) {
  const rows = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let p = line.split(/[;\t]/);
    if (p.length < 2) p = line.split(",");
    p = p.map((x) => x.trim().replace(/^"|"$/g, ""));
    if (/^(название|name|компания)/i.test(p[0])) continue;
    const phone = normPhone(p[1]);
    if (!phone || !p[0]) continue;
    rows.push({ name: p[0], phone, niche: p[2] || "", address: p[3] || "", instagram: p[4] || "" });
  }
  return rows;
}
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const sorted = (state) => Object.values(state.contacts).sort((a, b) => (a.ord || 0) - (b.ord || 0));
const fmtAlmaty = (t) => (t ? new Date(t + 5 * 3600000).toISOString().replace("T", " ").slice(0, 16) : "");

/* ---------- обработчик ---------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = req.method;

  if (["OWNER_LOGIN", "OWNER_PASS", "WORKER_LOGIN", "WORKER_PASS"].some((k) => !env(k))) {
    return json({ error: "no_passwords", message: "На Netlify не заданы OWNER_LOGIN, OWNER_PASS, WORKER_LOGIN, WORKER_PASS (Site configuration → Environment variables). Задай их и сделай Deploy заново." }, 503);
  }

  const body = method === "POST" ? await req.json().catch(() => ({})) : {};

  if (path === "/login" && method === "POST") {
    const login = String(body.login || "").trim().toLowerCase();
    const name = String(body.name || "").trim().slice(0, 40);
    let role = null;
    if (same(login, env("OWNER_LOGIN").toLowerCase()) && same(body.pass, env("OWNER_PASS"))) role = "owner";
    else if (same(login, env("WORKER_LOGIN").toLowerCase()) && same(body.pass, env("WORKER_PASS"))) role = "worker";
    if (!role) return json({ error: "pass", message: "Неверный логин или пароль" }, 401);
    if (role === "worker" && !name) return json({ error: "name", message: "Введи своё имя" }, 400);
    const session = { role, name: role === "owner" ? name || "Владелец" : name, exp: Date.now() + SESSION_DAYS * 86400000 };
    return json({ ok: true, me: { role, name: session.name } }, 200, { "set-cookie": makeCookie(session) });
  }
  if (path === "/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": "rs=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });

  const me = readSession(req);
  if (!me) return json({ error: "auth" }, 401);
  const isOwner = me.role === "owner", who = me.name;

  try {
    if (path === "/me" && method === "GET") return json({ me: { role: me.role, name: who } });

    if (path === "/state" && method === "GET") {
      const [{ data }, presence] = await Promise.all([readState(), readPresence()]);
      return json({ me: { role: me.role, name: who }, contacts: sorted(data), settings: data.settings, presence, events: isOwner ? data.events : [], seedError: isOwner ? data.seedError || null : null, now: Date.now() });
    }

    if (path === "/heartbeat" && method === "POST") {
      await store().setJSON("p/" + who, { t: Date.now(), role: me.role, visible: body.visible !== false });
      return json({ ok: true });
    }

    if (path === "/claim" && method === "POST") {
      const phone = normPhone(body.phone);
      await mutate((s) => { const c = s.contacts[phone]; if (!c) return false; c.claimedBy = who; c.claimedAt = Date.now(); return s; });
      return json({ ok: true });
    }

    if (path === "/status" && method === "POST") {
      const phone = normPhone(body.phone);
      const status = STATUSES.includes(body.status) ? body.status : null;
      if (!phone || !status) return json({ error: "bad" }, 400);
      const state = await mutate((s) => {
        const c = s.contacts[phone];
        if (!c) return false;
        const now = Date.now();
        c.status = status; c.by = who; c.at = now; c.claimedBy = null; c.claimedAt = null;
        if (status === "new") { c.sentBy = null; c.sentAt = null; c.followAt = null; }
        else if (!c.sentBy) { c.sentBy = who; c.sentAt = now; }
        if (status === "followup") c.followAt = now;
        s.events.push({ t: now, who, phone, status });
        return s;
      });
      return json({ ok: true, contact: state.contacts[phone] });
    }

    if (path === "/note" && method === "POST") {
      const phone = normPhone(body.phone);
      await mutate((s) => { const c = s.contacts[phone]; if (!c) return false; c.note = String(body.note || "").slice(0, 300); return s; });
      return json({ ok: true });
    }

    if (!isOwner) return json({ error: "forbidden" }, 403);

    if (path === "/import" && method === "POST") {
      const rows = parseCsv(body.csv);
      let added = 0;
      await mutate((s) => {
        let ord = Math.max(0, ...Object.values(s.contacts).map((c) => c.ord || 0));
        for (const r of rows) { if (s.contacts[r.phone]) continue; s.contacts[r.phone] = fresh(r, ++ord); added++; }
        return s;
      });
      return json({ ok: true, parsed: rows.length, added });
    }

    if (path === "/remove" && method === "POST") {
      const phone = normPhone(body.phone);
      await mutate((s) => { if (!s.contacts[phone]) return false; delete s.contacts[phone]; return s; });
      return json({ ok: true });
    }

    if (path === "/settings" && method === "POST") {
      await mutate((s) => {
        const t = body.templates || {}, h = body.hooks || {}, cur = s.settings;
        const pick = (v, old) => (String(v || "").trim() || old).slice(0, 1500);
        s.settings = {
          dailyPlan: Math.max(1, parseInt(body.dailyPlan) || cur.dailyPlan),
          autoSent: body.autoSent === undefined ? cur.autoSent : !!body.autoSent,
          followupHours: Math.max(1, parseInt(body.followupHours) || cur.followupHours),
          templates: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.templates).map((k) => [k, pick(t[k], cur.templates[k])])),
          hooks: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.hooks).map((k) => [k, pick(h[k], cur.hooks[k])])),
        };
        return s;
      });
      return json({ ok: true });
    }

    if (path === "/export" && method === "GET") {
      const { data } = await readState();
      const lines = ["Название;Телефон;Ниша;Адрес;Рейтинг;Отзывы;Instagram;Часы;Статус;Кто отметил;Когда (Алматы);Кто написал первым;Когда написал;Напомнил;Заметка"];
      for (const c of sorted(data)) {
        lines.push([c.name, "+" + c.phone, c.niche, c.address, c.rating, c.reviews || "", c.instagram, c.hours, LABEL[c.status || "new"], c.by || "", c.status !== "new" ? fmtAlmaty(c.at) : "", c.sentBy || "", fmtAlmaty(c.sentAt), fmtAlmaty(c.followAt), c.note || ""].map(csvCell).join(";"));
      }
      return new Response("﻿" + lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="rassylka-damillion.csv"', "cache-control": "no-store" } });
    }

    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "server", message: e.message === "busy" ? "Занято, нажми ещё раз" : "Ошибка сервера" }, 500);
  }
};

export const config = { path: "/api/*" };
