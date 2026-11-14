import { json, fail, getUser } from "../../_lib/util.js";

export async function onRequestGet({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  const { results } = await env.DB.prepare("SELECT data FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(u.id).all();
  return json({ analyses: results.map((r) => JSON.parse(r.data)) });
}
