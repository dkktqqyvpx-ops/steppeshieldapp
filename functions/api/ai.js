import { json, fail, readBody, getUser, cleanField, SS } from "../_lib/util.js";

// ИИ-агроном. Два режима:
//  1) Cloudflare Workers AI (бесплатный дневной лимит, binding AI в wrangler.toml) — по умолчанию;
//  2) Claude API, если задан секрет ANTHROPIC_API_KEY: Claude сам проверяет варианты инструментом stress_test.
// Цифры всегда считает наша модель (SS.stressTest), ИИ выбирает стратегии и объясняет выбор.

const WORKERS_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_ROUNDS = 8;

function clampNum(x, lo, hi, d) { return typeof x === "number" && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; }

function fmtTest(t) {
  const c = t.cells;
  return "итог " + Math.round(t.total) +
    "; маржа тыс. тг/га (норма/засуха/жара) " + c.map((x) => Math.round(x.res.margin / 1000)).join("/") +
    "; дефицит влаги % " + c.map((x) => Math.round(x.res.deficit * 100)).join("/") +
    "; полив мм/год " + Math.round(c[0].res.irrig) +
    "; почва " + c[0].res.soil0 + "→" + c[0].res.soil;
}

// ---------- Workers AI ----------
async function runWorkersAI(env, ctx) {
  const { field, climate, opt, w, lang, want, mf, candidates } = ctx;
  const tested = candidates.map((crops) => ({ crops, t: SS.stressTest(crops, mf, opt, w) }))
    .sort((a, b) => b.t.total - a.t.total);
  const log = tested.map((x) => ({ crops: x.crops, total: Math.round(x.t.total) }));

  const list = tested.map((x, i) => (i + 1) + ") " + x.crops.join(", ") + " — " + fmtTest(x.t)).join("\n");
  const prompt = SS.buildPrompt(field, climate, opt, w, lang, false, want) + "\n\n" +
    "ПРОВЕРЕННЫЕ ВАРИАНТЫ (наша модель уже прогнала их через стресс-тест, итог 0–100, чем выше, тем лучше):\n" + list + "\n\n" +
    "Выбери из этого списка 3 стратегии с разной логикой, первой поставь ту, у которой итог выше. " +
    "Ключи культур копируй из списка без изменений. В verdict опирайся на цифры из списка. Ответь только JSON, без пояснений вокруг.";

  const out = await env.AI.run(env.WORKERS_AI_MODEL || WORKERS_MODEL, {
    messages: [
      { role: "system", content: "Ты агроном-консультант по Казахстану. Отвечаешь только валидным JSON." },
      { role: "user", content: prompt }
    ],
    max_tokens: 1800,
    temperature: 0.3
  });
  const text = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? out ?? "");
  const clean = SS.cleanAI(SS.extractJSON(text), mf);
  if (!clean) return null;

  // Оставляем стратегии, которые проходят правила; новые (не из списка) тоже проверяем стресс-тестом.
  const seen = new Set(log.map((l) => l.crops.join()));
  clean.strategies = clean.strategies.filter((s) => {
    if (SS.agroCheck(s.crops, mf, want)) return false;
    if (!seen.has(s.crops.join())) {
      seen.add(s.crops.join());
      log.push({ crops: s.crops, total: Math.round(SS.stressTest(s.crops, mf, opt, w).total) });
    }
    return true;
  });
  if (!clean.strategies.length) return null;
  return { result: clean, log, engine: "workers-ai" };
}

// ---------- Claude API ----------
async function callClaude(env, messages, final) {
  const body = {
    model: env.AI_MODEL || "claude-sonnet-5-5",
    max_tokens: 4096,
    tools: [{ name: SS.stressToolSpec.name, description: SS.stressToolSpec.description, input_schema: SS.stressToolSpec.schema }],
    messages
  };
  if (final) body.tool_choice = { type: "none" };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (r.status === 429) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" });
  if (!r.ok) throw Object.assign(new Error("ai_upstream"), { code: "ai_upstream" });
  return r.json();
}

async function runClaude(env, ctx) {
  const { field, climate, opt, w, lang, want, mf } = ctx;
  const messages = [{ role: "user", content: SS.buildPrompt(field, climate, opt, w, lang, true, want) }];
  const log = [];
  let text = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await callClaude(env, messages, round === MAX_ROUNDS - 1);
    messages.push({ role: "assistant", content: resp.content });
    const uses = (resp.content || []).filter((x) => x.type === "tool_use");
    if (resp.stop_reason === "tool_use" && uses.length) {
      messages.push({
        role: "user",
        content: uses.map((x) => {
          try {
            const r = SS.runStressTool(x.input, mf, opt, w, want);
            log.push({ crops: r.crops, total: r.total });
            return { type: "tool_result", tool_use_id: x.id, content: JSON.stringify(r.result) };
          } catch (e) {
            return { type: "tool_result", tool_use_id: x.id, content: "Error: " + e.message, is_error: true };
          }
        })
      });
      continue;
    }
    text = (resp.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n");
    break;
  }
  const clean = SS.cleanAI(SS.extractJSON(text), mf);
  if (!clean) return null;
  clean.strategies = clean.strategies.filter((s) => !SS.agroCheck(s.crops, mf, want));
  if (!clean.strategies.length) return null;
  return { result: clean, log, engine: "claude" };
}

export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  if (!env.ANTHROPIC_API_KEY && !env.AI) return fail("ai_not_configured", 501);

  const b = await readBody(request);
  const field = cleanField({ ...b.field, area: Number(b.field?.area) || 1 }, "x");
  const c = b.climate || {};
  const okArr = (a) => Array.isArray(a) && a.length === 12 && a.every((v) => typeof v === "number" && isFinite(v));
  if (!field || !okArr(c.T) || !okArr(c.P) || typeof c.tmaxJul !== "number") return fail("invalid");
  const opt = { dryPct: clampNum(b.opt?.dryPct, 5, 50, 25), heatC: clampNum(b.opt?.heatC, 0.5, 5, 2) };
  const w = { income: clampNum(b.w?.income, 0, 100, 50), water: clampNum(b.w?.water, 0, 100, 50), soil: clampNum(b.w?.soil, 0, 100, 50), risk: clampNum(b.w?.risk, 0, 100, 50) };
  const lang = ["ru", "kk", "en"].includes(b.lang) ? b.lang : "ru";
  const want = [...new Set(SS.toKeys(Array.isArray(b.want) ? b.want : []))].filter((k) => SS.CROPS[k] && k !== "fallow").slice(0, 4);
  const climate = { T: c.T, P: c.P, tmaxJul: c.tmaxJul, label: String(c.label || "NASA POWER").slice(0, 160) };
  const mf = { region: field.region, soil: field.soil, irr: field.irr, irrType: field.irrType, hist: [field.h0, field.h1], nasa: { T: c.T, P: c.P, tmaxJul: c.tmaxJul } };
  if (SS.wantCheck(mf, want)) return fail("want_invalid");

  // Варианты, подготовленные браузером: перепроверяем правила, не больше 12.
  const seen = new Set();
  const candidates = (Array.isArray(b.candidates) ? b.candidates : []).map((x) => SS.toKeys(x).slice(0, 4))
    .filter((x) => { const k = x.join(); if (seen.has(k) || SS.agroCheck(x, mf, want)) return false; seen.add(k); return true; })
    .slice(0, 12);

  const ctx = { field, climate, opt, w, lang, want, mf, candidates };
  try {
    let out = null;
    if (env.ANTHROPIC_API_KEY) out = await runClaude(env, ctx);
    else if (candidates.length) out = await runWorkersAI(env, ctx);
    else return fail("no_candidates");
    if (!out) return fail("invalid_json", 502);
    return json(out);
  } catch (e) {
    const code = e.code || "ai_upstream";
    return fail(code, code === "rate_limited" ? 429 : 502);
  }
}
