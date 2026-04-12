const express = require("express");
const { Pool } = require("pg");
const app = express();
app.use(express.json());

const TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const KEY = process.env.ANTHROPIC_API_KEY;
const DB = process.env.DATABASE_URL;
const TG = "https://api.telegram.org/bot" + TOKEN;

const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS registros (id SERIAL PRIMARY KEY, chat_id TEXT, tipo TEXT, descripcion TEXT, monto NUMERIC, fecha TIMESTAMP DEFAULT NOW(), mes INTEGER, anio INTEGER)`);
}

async function send(id, text) {
  await fetch(TG + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: id, text: text, parse_mode: "Markdown" }),
  });
}

async function guardar(chatId, tipo, desc, monto) {
  const now = new Date();
  await pool.query("INSERT INTO registros (chat_id, tipo, descripcion, monto, mes, anio) VALUES ($1,$2,$3,$4,$5,$6)", [String(chatId), tipo, desc, monto, now.getMonth() + 1, now.getFullYear()]);
}

async function claude(chatId, msg) {
  const hist = await pool.query("SELECT role, content FROM conversacion WHERE chat_id=$1 ORDER BY id DESC LIMIT 20", [String(chatId)]).catch(() => ({ rows: [] }));
  const messages = hist.rows.reverse().concat([{ role: "user", content: msg }]);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: "Eres ContaBot, contador para negocio de ropa de segunda. Registra ventas compras gastos. Genera reportes mensuales estado de resultados y balance. Usa emojis y Markdown de Telegram.", messages }),
  });
  const d = await r.json();
  return d.content.map(b => b.text || "").join("") || "Error";
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const m = req.body.message;
    if (!m || !m.text) return;
    const id = m.chat.id;
    const text = m.text;
    if (text === "/start") { await send(id, "Hola! Soy ContaBot tu contador de ropa de segunda. Dime tus ventas, gastos o compras!"); return; }
    const reply = await claude(id, text);
    await send(id, reply);
  } catch (e) { console.error(e); }
});

app.get("/", (req, res) => res.send("ContaBot OK"));
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => { await initDB(); console.log("Puerto " + PORT); });
