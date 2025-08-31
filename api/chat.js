// api/chat.js
// Vercel Serverless Function (Node 18).
// Robuste Body-Parsing-Logik + klare Fehlermeldungen.
// Etappe 1: KEIN RAG. Zwei Rollen: "sprach_experte" (Standard) & "disziplinar_experte".

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// --- Hilfsfunktionen ---------------------------------------------------------

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function systemPrompt(role) {
  if (role === "disziplinar_experte") {
    return (
      "Du bist Disziplinar- und Beschwerderecht-Experte (Bundeswehr). " +
      "Achtung: Es ist KEIN externer Rechtsdatenzugriff aktiv. " +
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

// Body sicher einlesen (Vercel setzt req.body nicht immer)
async function readJsonBody(req) {
  try {
    // Falls Vercel/Framework bereits geparst hat:
    if (req.body && typeof req.body === "object") return req.body;

    // Sonst Stream lesen:
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) return {};
    if (req.headers["content-type"]?.includes("application/json")) {
      return JSON.parse(raw);
    }
    // Fallback: versuchen zu parsen, sonst leeres Objekt
    try { return JSON.parse(raw); } catch { return {}; }
  } catch {
    return {};
  }
}

async function chatCompletion(messages) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.2,
      messages,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    // Kompakte, lesbare Fehlerweitergabe:
    throw new Error(`OpenAI ${resp.status}: ${detail}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// --- Handler -----------------------------------------------------------------

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Server misconfigured: OPENAI_API_KEY missing",
      hint: "In Vercel -> Project Settings -> Environment Variables setzen und redeployen.",
    });
  }

  try {
    const body = await readJsonBody(req);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const role = body.role === "disziplinar_experte" ? "disziplinar_experte" : "sprach_experte";

    if (!message) {
      return res.status(400).json({ error: 'Missing "message" (string) in JSON body.' });
    }

    const sys = systemPrompt(role);
    const userMsg =
      role === "disziplinar_experte"
        ? `Sachverhalt/Frage:\n${message}\n\nHinweis: Bitte nur antworten, wenn konkrete Rechtsgrundlagen (z. B. §/Abs.) genannt wurden.`
        : message;

    const messages = [
      { role: "system", content: sys },
      { role: "user", content: userMsg },
    ];

    const reply = await chatCompletion(messages);
    return res.status(200).json({ reply });
  } catch (err) {
    // Log für Vercel-Logs, kurze, verständliche Antwort zum Client
    console.error("[/api/chat] Error:", err);
    return res.status(502).json({
      error: "Upstream error (OpenAI oder Body-Parsing)",
      detail: String(err?.message || err),
    });
  }
};
