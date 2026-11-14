import { json, fail, readBody, getUser, cleanField, validId } from "../../_lib/util.js";

// Создать или обновить поле.
export async function onRequestPut({ request, env, params }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  if (!validId(params.id)) return fail("invalid");
  const f = cleanField(await readBody(request), params.id);
  if (!f) return fail("invalid");

  const own = await env.DB.prepare("SELECT user_id FROM fields WHERE id = ?").bind(f.id).first();
  if (own && own.user_id !== u.id) return fail("forbidden", 403);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM fields WHERE user_id = ?").bind(u.id).first();
  if (!own && count.n >= 200) return fail("limit", 409);

  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO fields (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind(f.id, u.id, JSON.stringify(f), now, now).run();
  return json({ field: f });
}

export async function onRequestDelete({ request, env, params }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM analyses WHERE field_id = ? AND user_id = ?").bind(params.id, u.id),
    env.DB.prepare("DELETE FROM fields WHERE id = ? AND user_id = ?").bind(params.id, u.id)
  ]);
  return json({ ok: true });
}
