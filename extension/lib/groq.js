// Client Groq : essaie chaque modèle tour à tour, sur plusieurs tours (3 par défaut).
const Groq = (() => {
  const CoreRef = typeof Core !== "undefined" ? Core : require("./core.js");
  const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";
  const RETRY = new Set([429, 500, 502, 503, 504]);
  const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function callGroq(prompt, { apiKey, models, fetchFn = fetch, sleep = defaultSleep,
                                    rounds = 3, maxWaitS = 30 }) {
    let lastError = null;
    let wait = 5;
    for (let round = 0; round < rounds; round++) {
      for (const model of models) {
        const body = { model, temperature: 0, max_tokens: 600,
                       messages: [{ role: "user", content: prompt }] };
        if (model.includes("gpt-oss")) body.reasoning_effort = "low";  // plus rapide
        let r;
        try {
          r = await fetchFn(URL_GROQ, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch (e) {
          lastError = e.message;
          continue;
        }
        if (RETRY.has(r.status)) {
          lastError = await r.text();
          const ra = parseFloat(r.headers.get("retry-after") ?? "5");
          if (!Number.isNaN(ra)) wait = Math.max(wait, Math.min(ra, maxWaitS));
          continue;
        }
        let out;
        try {
          out = (await r.json()).choices[0].message.content || "";
        } catch {
          lastError = `réponse inutilisable (${r.status})`;
          continue;
        }
        out = out.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        if (out) return out;
      }
      if (round < rounds - 1) await sleep(Math.min(wait, maxWaitS) * 1000);
    }
    throw new Error(`Erreur API Groq : ${lastError}`);
  }

  async function llmExtract(url, meta, text, labelNames, opts) {
    const out = await callGroq(CoreRef.buildPrompt(url, meta, text, labelNames), opts);
    return CoreRef.parseLlm(out, labelNames);
  }

  return { callGroq, llmExtract };
})();

if (typeof module === "object") module.exports = Groq;
