# BW-Assist (Etappe 1 – ohne RAG)

Zweck: Texte für dienstlichen Schriftverkehr (Bundeswehr) formal, präzise, fehlerfrei überarbeiten.
Optional Rolle "Disziplinar-/Beschwerderecht": ohne RAG – fordert konkrete Rechtsgrundlagen an, statt zu raten.

## Start
1. OpenAI API Key anlegen.
2. Vercel: Projekt aus diesem Repo importieren; Env Var `OPENAI_API_KEY` setzen.
3. Deployen. Test:
   - GET https://<dein-projekt>.vercel.app/api/chat → "Method not allowed"
   - Seite öffnen → Text eingeben → Senden.
