const express = require("express");
const app = express();
app.use(express.json());

const TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const KEY = process.env.ANTHROPIC_API_KEY;
const TG = "https://api.telegram.org/bot" + TOKEN;
const hist = {};

async function send(id, text) {
  await fetch(TG + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: id, text: text, parse_mode: "Markdown" }),
  });
}

async function claude(id, msg) {
  if (!hist[id]) hist[id] = [];
  hist[id].push({ role: "user", content: msg });
  if (hist[id].length > 20) hist[id] = hist[id].slice(-20);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: "Eres ContaBot, contador experto para negocio de ropa de segunda mano. Registra ventas, compras y gastos. Genera reportes, estado de resultados y balance. Usa emojis. Confirma con ok.",
      messages: hist[id],
    }),
  });
  const d = await r.json();
  const reply = d.content.map((b) => b.text || "").join("") || "Error";
  hist[id].push({ role: "assistant", content: reply });
  return reply;
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const m = req.body.message;
    if (!m || !m.text) return;
    const id = m.chat.id;
    if (m.text === "/start") {
      await send(id, "Hola! Soy ContaBot tu contador. Dime tus ventas, gastos o compras y te ayudo con tus finanzas.");
      return;
    }
    const reply = await claude(id, m.text);
    await send(id, reply);
  } catch (e) {
    console.error(e);
  }
});

app.get("/", (req, res) => res.send("ContaBot OK"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Puerto " + PORT));
