// api/chat.js
// Etappe 1 (ohne RAG) – stabile Serverless-Funktion für Vercel.
// Features: Request-ID Logging, Model-/Temperature-Override, saubere Fehler-UX.

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function systemPrompt(role) {
  if (role === "disziplinar_experte") {
    return (
      "Du bist Disziplinar- und Beschwerderecht-Experte (Bundeswehr). " +
      "Kein externer Rechtsdatenzugriff aktiv. " +
      "Antworte nur auf Grundlage der vom Nutzer genannten Rechtsquellen (z. B. §/Abs.). " +
      "Wenn keine Quelle angegeben ist, fordere präzise §-Angaben an (keine Mutmaßungen). " +
      "Stil: formal, präzise, fehlerfrei, gut verständlich, leicht militärisch, nicht akademisch. " +
      "Struktur: (1) Kurzbewertung, (2) Begründung mit Bezug auf die genannte Norm, (3) Empfehlung."
    );
  }
  return (
    "Du bist Sprach- und Stilberater für dienstlichen E-Mail- und Schriftverkehr in der Bundeswehr. " +
    "Ziel: formal, präzise, fehlerfrei, klar und gut verständlich. " +
    "Verbessere Grammatik, Rechtschreibung, Zeichensetzung und Struktur. " +
    "Liefere den finalen Text und nenne optional 2–3 knappe Verbesserungshinweise."
  );
}

async function readJsonBody(req) {
  try {
    if (req.body && typeof req.body === "object") return req.body;
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function callOpenAI({ apiKey, model, temperature, messages, signal }) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature, messages }),
    signal
  }).catch((e) => {
    throw new Error("Netzwerk/Timeout beim OpenAI-Aufruf: " + e.message);
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${resp.status}: ${detail}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Server misconfigured: OPENAI_API_KEY missing",
      hint: "Vercel → Project → Settings → Environment Variables → OPENAI_API_KEY setzen und redeployen."
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const started = Date.now();

  try {
    const b = await readJsonBody(req);
    const requestId = typeof b.requestId === "string" ? b.requestId : `srv-${Math.random().toString(36).slice(2,10)}`;
    const role = b.role === "disziplinar_experte" ? "disziplinar_experte" : "sprach_experte";
    const message = typeof b.message === "string" ? b.message.trim() : "";
    const model = typeof b.model === "string" && b.model ? b.model : DEFAULT_MODEL;
    const temperature = typeof b.temperature === "number" ? Math.max(0, Math.min(1, b.temperature)) : 0.2;

    if (!message) return res.status(400).json({ error: 'Missing "message" (string) in JSON body.', requestId });

    const sys = systemPrompt(role);
    const userMsg = role === "disziplinar_experte"
      ? `Sachverhalt/Frage:\n${message}\n\nHinweis: Bitte nur antworten, wenn konkrete Rechtsgrundlagen (z. B. §/Abs.) genannt wurden.`
      : message;

    const messages = [{ role: "system", content: sys }, { role: "user", content: userMsg }];

    const reply = await callOpenAI({
      apiKey: OPENAI_API_KEY, model, temperature, messages, signal: controller.signal
    });

    const ms = Date.now() - started;
    console.log(`[chat] OK ${requestId} · model=${model} · temp=${temperature} · ${ms}ms`);
    clearTimeout(timeout);
    return res.status(200).json({ reply, requestId });
  } catch (err) {
    clearTimeout(timeout);
    const ms = Date.now() - started;
    const msg = String(err?.message || err);
    console.error(`[chat] ERR · ${ms}ms · ${msg}`);
    return res.status(502).json({
      error: "Upstream error (OpenAI oder Body-Parsing)",
      detail: msg,
      requestId: `srv-${Math.random().toString(36).slice(2,10)}`
    });
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.config = { runtime: "nodejs18.x" };
