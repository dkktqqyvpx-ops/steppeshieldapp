import { json, fail, readBody, normPhone, randHex, hashPassword, createSession, publicUser, SS } from "../../_lib/util.js";

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const phone = normPhone(b.phone);
  const name = String(b.name || "").trim().slice(0, 80);
  const farm = String(b.farm || "").trim().slice(0, 80);
  const region = SS.REGIONS[b.region] ? b.region : "akm";
  const lang = ["ru", "kk", "en"].includes(b.lang) ? b.lang : "ru";
  const password = String(b.password || "");
  if (name.length < 3 || !phone || password.length < 6 || password.length > 200) return fail("invalid");

  const exists = await env.DB.prepare("SELECT id FROM users WHERE phone = ?").bind(phone).first();
  if (exists) return fail("exists", 409);

  const id = randHex(12);
  const salt = randHex(16);
  const hash = await hashPassword(password, salt);
  const demo = phone === "77000000000" ? 1 : 0;
  await env.DB.prepare(
    "INSERT INTO users (id, phone, name, farm, region, lang, pw_salt, pw_hash, demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, phone, name, farm, region, lang, salt, hash, demo, Date.now()).run();

  const cookie = await createSession(env, id);
  return json({ user: publicUser({ phone, name, farm, region, lang, demo }) }, 201, { "set-cookie": cookie });
}
