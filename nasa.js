import { json, fail, getUser, SS } from "../_lib/util.js";

// Прокси к NASA POWER: климатология по координатам поля. Ответ кэшируется на 30 дней.
export async function onRequestGet({ request, env, waitUntil }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  const q = new URL(request.url).searchParams;
  const lat = Math.round(Number(q.get("lat")) * 100) / 100;
  const lon = Math.round(Number(q.get("lon")) * 100) / 100;
  if (!(lat > 40 && lat < 56 && lon > 46 && lon < 88)) return fail("invalid");

  const cacheKey = new Request(`https://cache.steppeshield/nasa/${lat}/${lon}`);
  const cache = caches.default;
  if (q.get("fresh") !== "1") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let data;
  try {
    const r = await fetch(SS.apiUrl(lat, lon), { headers: { accept: "application/json" } });
    if (!r.ok) return fail("nasa_unavailable", 502);
    data = await r.json();
  } catch {
    return fail("nasa_unavailable", 502);
  }

  let climate;
  try { climate = SS.parseNasa(data); } catch { return fail("nasa_format", 502); }
  climate.lat = lat; climate.lon = lon;

  const res = new Response(JSON.stringify({ climate, source: "NASA POWER climatology (community AG)" }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=2592000" }
  });
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
