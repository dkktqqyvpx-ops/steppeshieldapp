import { json, fail, readBody, getUser, publicUser, sessionCookie, SS } from "../_lib/util.js";

export async function onRequestGet({ request, env }) {
  const u = await getUser(request, env);
  return u ? json({ user: publicUser(u) }) : fail("auth", 401);
}

export async function onRequestPatch({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  const b = await readBody(request);
  const name = b.name != null ? String(b.name).trim().slice(0, 80) : u.name;
  const farm = b.farm != null ? String(b.farm).trim().slice(0, 80) : u.farm;
  const region = b.region != null && SS.REGIONS[b.region] ? b.region : u.region;
  const lang = ["ru", "kk", "en"].includes(b.lang) ? b.lang : u.lang;
  if (name.length < 3) return fail("invalid");
  await env.DB.prepare("UPDATE users SET name = ?, farm = ?, region = ?, lang = ? WHERE id = ?").bind(name, farm, region, lang, u.id).run();
  return json({ user: publicUser({ ...u, name, farm, region, lang }) });
}

export async function onRequestDelete({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM analyses WHERE user_id = ?").bind(u.id),
    env.DB.prepare("DELETE FROM fields WHERE user_id = ?").bind(u.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id)
  ]);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}
