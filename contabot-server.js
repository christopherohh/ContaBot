const express = require("express");
const app = express();
app.use(express.json());

const TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const KEY = process.env.ANTHROPIC_API_KEY;
const TG = "https://api.telegram.org/bot" + TOKEN;
const datos = {};
const hist = {};
const CHAT_ID = "5786549088";

async function send(id, text) {
  await fetch(TG + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: id, text: text, parse_mode: "Markdown" }),
  });
}

async function sendCSV(id) {
  const registros = datos[id] || [];
  if (registros.length === 0) { await send(id, "No hay registros aun!"); return; }
  let csv = "Fecha,Tipo,Descripcion,Monto\n";
  let ventas = 0, compras = 0, gastos = 0;
  registros.forEach(r => {
    csv += r.fecha + "," + r.tipo + "," + r.desc.replace(/,/g, " ") + "," + r.monto + "\n";
    if (r.tipo === "venta") ventas += r.monto;
    else if (r.tipo === "compra") compras += r.monto;
    else gastos += r.monto;
  });
  csv += "\nRESUMEN,,\nTotal Ventas,," + ventas + "\nTotal Compras,," + compras + "\nTotal Gastos,," + gastos + "\nUtilidad Neta,," + (ventas - compras - gastos);
  const boundary = "----FormBoundary";
  const filename = "ContaBot_" + new Date().toLocaleDateString("es").replace(/\//g, "-") + ".csv";
  const body = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n" + id + "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"document\"; filename=\"" + filename + "\"\r\nContent-Type: text/csv\r\n\r\n" + csv + "\r\n--" + boundary + "--";
  await fetch(TG + "/sendDocument", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=" + boundary },
    body: body,
  });
}

async function claude(chatId, msg) {
  if (!hist[chatId]) hist[chatId] = [];
  if (!datos[chatId]) datos[chatId] = [];
  hist[chatId].push({ role: "user", content: msg });
  if (hist[chatId].length > 30) hist[chatId] = hist[chatId].slice(-30);
  const resumen = datos[chatId].slice(-50).map(r => r.fecha + " " + r.tipo + ": " + r.desc + " $" + r.monto).join("\n");
  const system = "Eres ContaBot, contador para negocio de ropa de segunda mano. Registra ventas, compras y gastos. Genera reportes mensuales, estado de resultados y balance general. Usa emojis y Markdown de Telegram.\n\nREGISTROS:\n" + (resumen || "Sin registros");
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

async function reporteMensual() {
  if (!datos[CHAT_ID] || datos[CHAT_ID].length === 0) return;
  await send(CHAT_ID, "Reporte mensual automatico! Aqui va tu archivo:");
  await sendCSV(CHAT_ID);
  datos[CHAT_ID] = [];
  hist[CHAT_ID] = [];
}

function programarReporte() {
  const ahora = new Date();
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1, 8, 0, 0);
  const diff = finMes - ahora;
  setTimeout(async () => { await reporteMensual(); programarReporte(); }, diff);
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const m = req.body.message;
    if (!m || !m.text) return;
    const id = m.chat.id;
    const text = m.text;
    if (text === "/start") { await send(id, "Hola! Soy ContaBot tu contador. Dime tus ventas, gastos o compras. Usa /excel para descargar tu reporte!"); return; }
    if (text === "/reset") { hist[id] = []; datos[id] = []; await send(id, "Historial limpiado!"); return; }
    if (text === "/excel") { await send(id, "Generando tu archivo..."); await sendCSV(id); return; }
    const reply = await claude(id, text);
    await send(id, reply);
  } catch (e) { console.error(e); }
});

app.get("/", (req, res) => res.send("ContaBot OK"));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => { console.log("Puerto " + PORT); programarReporte(); });
