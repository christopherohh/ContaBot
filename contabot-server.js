const express = require("express");
const app = express();
app.use(express.json());

const TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const KEY = process.env.ANTHROPIC_API_KEY;
const TG = "https://api.telegram.org/bot" + TOKEN;
const datos = {};
const hist = {};

async function send(id, text) {
  await fetch(TG + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: id, text: text, parse_mode: "Markdown" }),
  });
}

async function claude(chatId, msg) {
  if (!hist[chatId]) hist[chatId] = [];
  if (!datos[chatId]) datos[chatId] = [];
  hist[chatId].push({ role: "user", content: msg });
  if (hist[chatId].length > 30) hist[chatId] = hist[chatId].slice(-30);
  const resumen = datos[chatId].slice(-50).map(r => r.fecha + " " + r.tipo + ": " + r.desc + " $" + r.monto).join("\n");
  const system = "Eres ContaBot, contador para negocio de ropa de segunda mano. Registra ventas, compras y gastos. Genera reportes mensuales, estado de resultados y balance general. Usa emojis y Markdown de Telegram. Confirma registros con ok.\n\nREGISTROS GUARDADOS:\n" + (resumen || "Sin registros aun");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages: hist[chatId] }),
  });
  const d = await r.json();
  const reply = d.content.map(b => b.text || "").join("") || "Error";
  hist[chatId].push({ role: "assistant", content: reply });
  const low = msg.toLowerCase();
  const nums = msg.match(/[\d]+/g);
  const monto = nums ? parseInt(nums[nums.length - 1]) : 0;
  const now = new Date().toLocaleDateString("es");
  if (/(vend|venta)/.test(low) && monto > 0) datos[chatId].push({ fecha: now, tipo: "venta", desc: msg, monto });
  else if (/(compr|paca|inventario)/.test(low) && monto > 0) datos[chatId].push({ fecha: now, tipo: "compra", desc: msg, monto });
  else if (/(pagu|gasto|renta|luz|agua)/.test(low) && monto > 0) datos[chatId].push({ fecha: now, tipo: "gasto", desc: msg, monto });
  return reply;
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const m = req.body.message;
    if (!m || !m.text) return;
    const id = m.chat.id;
    if (m.text === "/start") { await send(id, "Hola! Soy ContaBot tu contador de ropa de segunda. Dime tus ventas, gastos o compras!"); return; }
    if (m.text === "/reset") { hist[id] = []; datos[id] = []; await send(id, "Historial limpiado!"); return; }
    const reply = await claude(id, m.text);
    await send(id, reply);
  } catch (e) { console.error(e); }
});

app.get("/", (req, res) => res.send("ContaBot OK"));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Puerto " + PORT));
