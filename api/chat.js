// api/chat.js
// Zweck: Eine einfache POST-Route /api/chat für deine Web-App.
// Modus: Kein RAG. Zwei Rollen:
//  - "sprach_experte" (Standard): überarbeitet Texte für dienstlichen Schriftverkehr (Bundeswehr-Stil).
//  - "disziplinar_experte": beantwortet nur, wenn du im Text eine konkrete Rechtsgrundlage nennst;
//    sonst fordert die Antwort dich auf, eine Quelle/Norm zu nennen (damit nichts „erfunden“ wird).

const fetch = require("node-fetch");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Modell: klein, schnell, günstig – gut fürs tägliche Schreiben
const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function systemPrompt(role) {
  if (role === "disziplinar_experte") {
    return (
      "Du bist Disziplinar- und Beschwerderecht-Experte (Bundeswehr). " +
      "Wichtig: Es ist KEIN externer Rechtsdatenzugriff aktiv. " +
      "Antworte nur auf Grundlage der vom Nutzer genannten Rechtsquellen (z. B. §/Abs.). " +
      "Wenn keine Quelle angegeben ist, fordere präzise §-Angaben an (keine Mutmaßungen). " +
      "Stil: formal, präzise, fehlerfrei, gut verständlich, leicht militärisch, nicht akademisch. " +
      "Struktur: (1) Kurzbewertung, (2) Begründung mit Bezug auf die genannte Norm, (3) Empfehlung."
    );
  }
  // Standardrolle
  return (
    "Du bist Sprach- und Stilberater für dienstlichen E-Mail- und Schriftverkehr in der Bundeswehr. " +
    "Ziel: formal, präzise, fehlerfrei, klar und gut verständlich. " +
    "Kein Marketing-Sprech, kein Umgangston, kein unnötiger Zierrat. " +
    "Verbessere Grammatik, Rechtschreibung, Zeichensetzung und Struktur. " +
    "Liefere das Ergebnis als finalen Text und nenne optional 2–3 knappe Verbesserungshinweise."
  );
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
    throw new Error(`OpenAI error: ${resp.status} ${detail}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Server misconfigured: OPENAI_API_KEY is missing" });
  }

  try {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const role = body.role === "disziplinar_experte" ? "disziplinar_experte" : "sprach_experte";

    if (!message) {
      return res.status(400).json({ error: 'Missing "message" (string)' });
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
    console.error(err);
    return res
      .status(500)
      .json({ error: "Server error", detail: String(err.message || err) });
  }
};
