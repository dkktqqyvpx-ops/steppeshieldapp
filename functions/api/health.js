import { json } from "../_lib/util.js";

// Фронтенд проверяет этот адрес, чтобы понять, что работает облачная версия.
export const onRequestGet = ({ env }) =>
  json({ ok: true, app: "steppeshield", db: !!env.DB, ai: !!env.ANTHROPIC_API_KEY });
