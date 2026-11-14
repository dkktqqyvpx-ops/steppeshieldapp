import { json, fail, readBody, getUser, cleanField, SS } from "../_lib/util.js";

// ИИ-агроном: Claude предлагает стратегии и сам проверяет их инструментом stress_test.
// Ключ хранится в секрете ANTHROPIC_API_KEY, модель задаётся переменной AI_MODEL.
const MAX_ROUNDS = 8;

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

export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  if (!env.ANTHROPIC_API_KEY) return fail("ai_not_configured", 501);

  const b = await readBody(request);
  const field = cleanField({ ...b.field, area: Number(b.field?.area) || 1 }, "x");
  const c = b.climate || {};
  const okArr = (a) => Array.isArray(a) && a.length === 12 && a.every((v) => typeof v === "number" && isFinite(v));
  if (!field || !okArr(c.T) || !okArr(c.P) || typeof c.tmaxJul !== "number") return fail("invalid");
  const clamp = (x, lo, hi, d) => (typeof x === "number" && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  const opt = { dryPct: clamp(b.opt?.dryPct, 5, 50, 25), heatC: clamp(b.opt?.heatC, 0.5, 5, 2) };
  const w = { income: clamp(b.w?.income, 0, 100, 50), water: clamp(b.w?.water, 0, 100, 50), soil: clamp(b.w?.soil, 0, 100, 50), risk: clamp(b.w?.risk, 0, 100, 50) };
  const lang = ["ru", "kk", "en"].includes(b.lang) ? b.lang : "ru";
  const want = [...new Set(SS.toKeys(Array.isArray(b.want) ? b.want : []))].filter((k) => SS.CROPS[k] && k !== "fallow").slice(0, 4);
  const climate = { T: c.T, P: c.P, tmaxJul: c.tmaxJul, label: String(c.label || "NASA POWER").slice(0, 160) };
  const mf = { region: field.region, soil: field.soil, irr: field.irr, irrType: field.irrType, hist: [field.h0, field.h1], nasa: { T: c.T, P: c.P, tmaxJul: c.tmaxJul } };
  if (SS.wantCheck(mf, want)) return fail("want_invalid");

  const messages = [{ role: "user", content: SS.buildPrompt(field, climate, opt, w, lang, true, want) }];
  const log = [];
  let text = "";
  try {
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
  } catch (e) {
    return fail(e.code || "ai_upstream", e.code === "rate_limited" ? 429 : 502);
  }

  const clean = SS.cleanAI(SS.extractJSON(text), mf);
  if (!clean) return fail("invalid_json", 502);
  // Оставляем только стратегии, которые проходят агроправила и содержат желаемые культуры.
  const ok = clean.strategies.filter((s) => !SS.agroCheck(s.crops, mf, want));
  if (!ok.length) return fail("invalid_json", 502);
  clean.strategies = ok;
  return json({ result: clean, log });
}
