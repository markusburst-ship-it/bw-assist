// /api/chat.js
// Node/Vercel-API-Route für Chat, inkl. „frei“-Rolle (keine Stilvorgaben)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY fehlt auf Vercel." });
  }

  try {
    const { role = "sprach_experte", message = "", model = "gpt-4o-mini", temperature = 0.2, requestId } = req.body || {};
    if (!message.trim()) {
      return res.status(400).json({ error: "message fehlt/leer." });
    }

    // System-Prompts pro Rolle
    let systemPrompt = "";
    switch (role) {
      case "frei":
        // Minimal: keinerlei Stilvorgaben, klassischer Assistent
        systemPrompt = "You are a helpful assistant. Follow the user's instructions without adding style constraints.";
        break;

      case "disziplinar_experte":
        systemPrompt = [
          "Rolle: Berater für Disziplinar-/Beschwerderecht der Bundeswehr.",
          "Stil: formal, präzise, gut verständlich – kein unnötiger Jargon.",
          "WICHTIG: Nenne bei rechtlichen Aussagen stets konkrete Rechtsgrundlagen (z. B. §/Abs. WDO/WBO/WStG/SG).",
          "Kennzeichne Unsicherheiten; keine individuelle Rechtsberatung, nur fachliche Information.",
          "Wenn Quellen fehlen/unklar sind: Bitte um Präzisierung."
        ].join(" ");
        break;

      case "sprach_experte":
      default:
        systemPrompt = [
          "Rolle: Sprach- und Stil-Experte für dienstliche E-Mails/Schriftverkehr in der Bundeswehr.",
          "Ziel: formal, präzise, fehlerfrei, gut verständlich; leicht militärisch-sachlicher Ton.",
          "Vermeide überakademische Sprache; gliedere übersichtlich; nutze aktive Verben.",
          "Fasse auf Wunsch kurz zusammen; halte Kernaussagen unverändert."
        ].join(" ");
        break;
    }

    // OpenAI Chat API aufrufen
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: Number(temperature) || 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ]
      })
    });

    const data = await r.json();

    if (!r.ok) {
      // OpenAI-Fehler sauber durchreichen
      const msg = data?.error?.message || `OpenAI-Fehler (${r.status})`;
      return res.status(500).json({
        error: msg,
        detail: data,
        requestId: requestId || null
      });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({
      reply,
      model,
      temperature,
      role,
      requestId: requestId || null
    });

  } catch (err) {
    return res.status(500).json({
      error: "Interner Fehler in /api/chat",
      detail: String(err)
    });
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.config = { runtime: "nodejs18.x" };
