import { json, randHex, hashPassword, createSession, publicUser } from "../../_lib/util.js";

// Демо-вход без пароля: общий демо-аккаунт для показа жюри.
export async function onRequestPost({ env }) {
  const phone = "77000000000";
  let u = await env.DB.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
  if (!u) {
    const salt = randHex(16);
    u = { id: randHex(12), phone, name: "Демо фермер", farm: "КХ «Жер-Ана»", region: "kos", lang: "ru", demo: 1 };
    await env.DB.prepare(
      "INSERT INTO users (id, phone, name, farm, region, lang, pw_salt, pw_hash, demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)"
    ).bind(u.id, phone, u.name, u.farm, u.region, u.lang, salt, await hashPassword(randHex(16), salt), Date.now()).run();
  }
  const cookie = await createSession(env, u.id);
  return json({ user: publicUser(u) }, 200, { "set-cookie": cookie });
}
