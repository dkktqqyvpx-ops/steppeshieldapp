// Общие функции API STEPPESHIELD (Cloudflare Pages Functions).
import SS from "./model.js";

export const SESSION_DAYS = 30;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
export const fail = (code, status = 400) => json({ error: code }, status);

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d.length === 11 && d[0] === "7" ? d : "";
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export function randHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

// PBKDF2-SHA256, 100 000 итераций (максимум, который разрешает Workers).
export async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return toHex(bits);
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function sessionCookie(token, maxAgeSec) {
  return `ss_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}

export async function createSession(env, userId) {
  const token = randHex(32);
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(token, userId, expires).run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}

function tokenFrom(request) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(/(?:^|;\s*)ss_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

export async function getUser(request, env) {
  const token = tokenFrom(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?"
  ).bind(token, Date.now()).first();
  return row ? { ...row, _token: token } : null;
}

export function publicUser(u) {
  return { phone: u.phone, name: u.name, farm: u.farm || "", region: u.region, lang: u.lang || null, demo: !!u.demo };
}

const clampStr = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
const isNum = (x) => typeof x === "number" && isFinite(x);

// Проверка поля, которое пришло от клиента. Возвращает чистый объект или null.
export function cleanField(f, id) {
  if (!f || typeof f !== "object") return null;
  const out = {
    id,
    name: clampStr(f.name, 80),
    area: Number(f.area),
    region: String(f.region),
    soil: String(f.soil),
    irrType: ["none", "drip", "canal"].includes(f.irrType) ? f.irrType : (f.irr ? "canal" : "none"),
    lat: Math.round(Number(f.lat) * 100) / 100,
    lon: Math.round(Number(f.lon) * 100) / 100,
    h0: String(f.h0),
    h1: String(f.h1)
  };
  out.irr = out.irrType !== "none";
  if (out.name.length < 2 || !(out.area > 0 && out.area < 1e6)) return null;
  if (!SS.REGIONS[out.region] || !SS.SOILS[out.soil] || !SS.CROPS[out.h0] || !SS.CROPS[out.h1]) return null;
  if (!(out.lat > 40 && out.lat < 56 && out.lon > 46 && out.lon < 88)) return null;
  if (f.nasa) {
    const n = f.nasa;
    if (Array.isArray(n.T) && Array.isArray(n.P) && n.T.length === 12 && n.P.length === 12 && n.T.every(isNum) && n.P.every(isNum) && isNum(n.tmaxJul)) {
      out.nasa = { T: n.T, P: n.P, tmaxJul: n.tmaxJul, lat: isNum(n.lat) ? n.lat : out.lat, lon: isNum(n.lon) ? n.lon : out.lon };
    }
  }
  return out;
}

export const validId = (id) => typeof id === "string" && /^[a-z0-9]{6,40}$/i.test(id);

export { SS };
