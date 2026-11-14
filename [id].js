import { json, fail, readBody, getUser, validId, SS } from "../../_lib/util.js";

const str = (s, n) => String(s == null ? "" : s).slice(0, n);

export async function onRequestPut({ request, env, params }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  if (!validId(params.id)) return fail("invalid");
  const b = await readBody(request);

  const field = await env.DB.prepare("SELECT id FROM fields WHERE id = ? AND user_id = ?").bind(String(b.fieldId), u.id).first();
  if (!field) return fail("invalid");
  const strategies = (Array.isArray(b.strategies) ? b.strategies : []).slice(0, 3).map((s) => ({
    name: str(s.name, 60), idea: str(s.idea, 260), crops: SS.toKeys(s.crops).slice(0, 4)
  })).filter((s) => s.crops.length === 4 && s.crops.every((k) => SS.CROPS[k]));
  if (!strategies.length) return fail("invalid");

  const num = (x, d) => (typeof x === "number" && isFinite(x) ? x : d);
  const a = {
    id: params.id, fieldId: field.id, fieldName: str(b.fieldName, 80), date: num(b.date, Date.now()),
    source: b.source === "ai" ? "ai" : "local", lang: str(b.lang, 4), climateSource: str(b.climateSource, 10),
    w: { income: num(b.w?.income, 50), water: num(b.w?.water, 50), soil: num(b.w?.soil, 50), risk: num(b.w?.risk, 50) },
    opt: { dryPct: num(b.opt?.dryPct, 25), heatC: num(b.opt?.heatC, 2) },
    strategies, verdict: str(b.verdict, 1200),
    risks: (Array.isArray(b.risks) ? b.risks : []).slice(0, 4).map((x) => str(x, 300)),
    actions: (Array.isArray(b.actions) ? b.actions : []).slice(0, 5).map((x) => str(x, 300)),
    best: str(b.best, 60), bestScore: num(b.bestScore, 0)
  };
  await env.DB.prepare(
    "INSERT INTO analyses (id, user_id, field_id, data, created_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE analyses.user_id = excluded.user_id"
  ).bind(a.id, u.id, a.fieldId, JSON.stringify(a), Date.now()).run();
  return json({ analysis: a });
}

export async function onRequestDelete({ request, env, params }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  await env.DB.prepare("DELETE FROM analyses WHERE id = ? AND user_id = ?").bind(params.id, u.id).run();
  return json({ ok: true });
}
