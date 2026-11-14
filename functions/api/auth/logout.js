import { json, getUser, sessionCookie } from "../../_lib/util.js";

export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (u) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(u._token).run();
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}
