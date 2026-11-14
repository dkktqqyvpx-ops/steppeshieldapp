import { json, fail, readBody, normPhone, hashPassword, safeEqual, createSession, publicUser } from "../../_lib/util.js";

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const phone = normPhone(b.phone);
  const password = String(b.password || "");
  if (!phone || !password) return fail("login", 401);

  const u = await env.DB.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
  // Хеш считаем и для несуществующего номера, чтобы время ответа не выдавало, зарегистрирован ли он.
  const hash = await hashPassword(password, u ? u.pw_salt : "00000000000000000000000000000000");
  if (!u || !safeEqual(hash, u.pw_hash)) return fail("login", 401);

  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(u.id, Date.now()).run();
  const cookie = await createSession(env, u.id);
  return json({ user: publicUser(u) }, 200, { "set-cookie": cookie });
}
