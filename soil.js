import { json, fail, getUser } from "../_lib/util.js";

// Тип почвы по координатам: ISRIC SoilGrids (классы WRB) → типы почв, принятые в приложении.
function toLocal(wrb, lat) {
  const w = String(wrb || "");
  if (/Chernozem|Phaeozem/i.test(w)) return lat > 53.5 ? "chern_o" : "chern_s";
  if (/Kastanozem/i.test(w)) return lat > 50.5 ? "dkash" : "kash";
  if (/Solonetz/i.test(w)) return "lkash";
  if (/Calcisol|Gypsisol|Cambisol|Luvisol/i.test(w)) return lat < 46.5 ? "seroz" : "lkash";
  if (/Arenosol|Regosol|Leptosol/i.test(w)) return lat < 46.5 ? "seroz" : "lkash";
  if (/Fluvisol|Gleysol|Solonchak/i.test(w)) return "allu";
  return null;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const u = await getUser(request, env);
  if (!u) return fail("auth", 401);
  const q = new URL(request.url).searchParams;
  const lat = Math.round(Number(q.get("lat")) * 100) / 100;
  const lon = Math.round(Number(q.get("lon")) * 100) / 100;
  if (!(lat > 40 && lat < 56 && lon > 46 && lon < 88)) return fail("invalid");

  const key = new Request(`https://cache.steppeshield/soil/${lat}/${lon}`);
  const hit = await caches.default.match(key);
  if (hit) return hit;

  let data;
  try {
    const r = await fetch(`https://rest.isric.org/soilgrids/v2.0/classification/query?lon=${lon}&lat=${lat}&number_classes=3`, { headers: { accept: "application/json" } });
    if (!r.ok) return fail("soil_unavailable", 502);
    data = await r.json();
  } catch {
    return fail("soil_unavailable", 502);
  }
  const wrb = data && data.wrb_class_name;
  const soil = toLocal(wrb, lat);
  if (!soil) return json({ soil: null, wrb: wrb || null });

  const res = new Response(JSON.stringify({ soil, wrb }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=2592000" }
  });
  waitUntil(caches.default.put(key, res.clone()));
  return res;
}
