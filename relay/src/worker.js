// Relais StageToTrello : garde la clé Groq côté serveur.
// L'extension envoie le contenu de l'offre avec le jeton Trello de l'utilisateur ;
// le relais vérifie le jeton, applique la limite quotidienne, construit le prompt
// et appelle Groq. Rien n'est stocké à part des compteurs par compte Trello et par jour.
import Core from "../../extension/lib/core.js";

const TRELLO_API = "https://api.trello.com/1";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const RETRY = new Set([429, 500, 502, 503, 504]);
const TOKEN_CACHE_TTL = 3600; // s : un jeton vérifié est réutilisé pendant 1 h
const USAGE_TTL = 2 * 24 * 3600; // s : les compteurs disparaissent après 2 jours
const LIMITS = { url: 2000, title: 500, site: 200, text: 10000, labels: 50, label: 60 };

export const dayKey = (now) => new Date(now).toISOString().slice(0, 10);

export function nextReset(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

const json = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
const fail = (status, code, message, extra = {}) =>
  json(status, { ok: false, code, error: message, ...extra });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Renvoie l'ID du membre Trello, null si le jeton est refusé, ou lève une erreur si Trello est injoignable.
async function trelloMember(token, env) {
  const cacheKey = `tok:${await sha256(token)}`;
  const cached = await env.USAGE.get(cacheKey);
  if (cached) return cached;

  let r;
  try {
    r = await fetch(`${TRELLO_API}/members/me?fields=id`, {
      headers: {
        Authorization: `OAuth oauth_consumer_key="${env.TRELLO_KEY}", oauth_token="${token}"`,
      },
    });
  } catch {
    throw new Error("trello_unreachable");
  }
  if (r.status === 401 || r.status === 400) return null;
  if (!r.ok) throw new Error("trello_unreachable");
  const { id } = await r.json();
  if (!id) return null;
  await env.USAGE.put(cacheKey, id, { expirationTtl: TOKEN_CACHE_TTL });
  return id;
}

// Valide et borne les champs envoyés par l'extension.
export function parseBody(data) {
  if (!data || typeof data !== "object") return null;
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const url = str(data.url, LIMITS.url);
  if (!/^https?:\/\//.test(url)) return null;
  const text = str(data.text, LIMITS.text);
  if (!text.trim()) return null;
  const labels = (Array.isArray(data.labels) ? data.labels : [])
    .filter((l) => typeof l === "string" && l.trim())
    .slice(0, LIMITS.labels)
    .map((l) => l.slice(0, LIMITS.label));
  return {
    url,
    text,
    labels,
    meta: { title: str(data.title, LIMITS.title), site: str(data.site, LIMITS.site) },
  };
}

// Essaie chaque modèle dans l'ordre ; renvoie { content, model } ou { busy, retryAfter }.
async function callGroq(prompt, env) {
  const models = String(env.GROQ_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  let retryAfter = 0;
  for (const model of models) {
    const body = {
      model,
      temperature: 0,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    };
    if (model.includes("gpt-oss")) body.reasoning_effort = "low";
    let r;
    try {
      r = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      continue;
    }
    if (RETRY.has(r.status)) {
      const ra = parseFloat(r.headers.get("retry-after") ?? "");
      if (!Number.isNaN(ra)) retryAfter = Math.max(retryAfter, Math.ceil(ra));
      continue;
    }
    if (!r.ok) {
      console.warn(`Groq ${model} : HTTP ${r.status}`);
      continue;
    }
    let content;
    try {
      content = (await r.json()).choices[0].message.content || "";
    } catch {
      continue;
    }
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (content) return { content, model };
  }
  return { busy: true, retryAfter: retryAfter || 30 };
}

async function extract(request, env, now) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!/^[A-Za-z0-9]{32,256}$/.test(token)) {
    return fail(401, "unauthorized", "Connexion Trello requise.");
  }

  let member;
  try {
    member = await trelloMember(token, env);
  } catch {
    return fail(502, "trello_unreachable", "Trello injoignable, réessaie dans un instant.");
  }
  if (!member) return fail(401, "unauthorized", "Session Trello expirée, reconnecte-toi.");

  const limit = parseInt(env.DAILY_LIMIT, 10) || 40;
  const freeMisses = parseInt(env.FREE_MISSES, 10) || 20;
  const resetAt = nextReset(now);
  const usageKey = `use:${member}:${dayKey(now)}`;
  const missKey = `miss:${member}:${dayKey(now)}`;
  const used = parseInt(await env.USAGE.get(usageKey), 10) || 0;
  if (used >= limit) {
    return fail(429, "daily_limit", `Limite de ${limit} offres par jour atteinte.`, {
      used,
      limit,
      resetAt,
    });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return fail(400, "bad_request", "Requête invalide.");
  }
  const input = parseBody(data);
  if (!input) return fail(400, "bad_request", "Requête invalide.");

  const prompt = Core.buildPrompt(input.url, input.meta, input.text, input.labels);
  const result = await callGroq(prompt, env);
  if (result.busy) {
    return fail(503, "groq_busy", "Service d'analyse saturé, mode simple utilisé.", {
      retryAfter: result.retryAfter,
    });
  }

  // Seules les analyses qui trouvent une offre sont comptées. Les pages sans offre sont
  // gratuites dans la limite de FREE_MISSES par jour, puis comptent comme les autres :
  // le nombre d'appels à Groq par compte et par jour reste borné (limit + freeMisses).
  const found = Core.parseLlm(result.content, []).found;
  let counted = found;
  if (!found) {
    const missed = parseInt(await env.USAGE.get(missKey), 10) || 0;
    if (missed < freeMisses) {
      await env.USAGE.put(missKey, String(missed + 1), { expirationTtl: USAGE_TTL });
    } else counted = true;
  }
  const newUsed = counted ? used + 1 : used;
  if (counted) await env.USAGE.put(usageKey, String(newUsed), { expirationTtl: USAGE_TTL });
  return json(200, {
    ok: true,
    content: result.content,
    model: result.model,
    found,
    used: newUsed,
    limit,
    resetAt,
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/" && request.method === "GET") return json(200, { ok: true });
    if (pathname === "/extract" && request.method === "POST") {
      try {
        return await extract(request, env, Date.now());
      } catch (e) {
        console.error(`Erreur interne : ${e && e.name}`);
        return fail(500, "internal", "Erreur interne du relais.");
      }
    }
    return fail(404, "not_found", "Introuvable.");
  },
};
