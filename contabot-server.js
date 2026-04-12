const express = require("express");
const app = express();
app.use(express.json());

const TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const KEY = process.env.ANTHROPIC_API_KEY;
const TG = "https://api.telegram.org/bot" + TOKEN;
const datos = {};
const hist = {};
const inventario = {};
const CHAT_ID = "5786549088";

async function send(id, text) {
  await fetch(TG + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: id, text: text, parse_mode: "Markdown" }),
  });
}

async function sendCSV(id, periodo) {
  const registros = datos[id] || [];
  if (registros.length === 0) { await send(id, "No hay registros aun!"); return; }
  let csv = "Fecha,Tipo,Descripcion,Monto\n";
  let ventas = 0, compras = 0, gastos = 0;
  registros.forEach(function(r) {
    csv += r.fecha + "," + r.tipo + "," + r.desc.replace(/,/g, " ") + "," + r.monto + "\n";
    if (r.tipo === "venta") ventas += r.monto;
    else if (r.tipo === "compra") compras += r.monto;
    else gastos += r.monto;
  });
  csv += "\nRESUMEN,,\nTotal Ventas,," + ventas + "\nTotal Compras,," + compras + "\nTotal Gastos,," + gastos + "\nUtilidad Neta,," + (ventas - compras - gastos);
  const boundary = "----FormBoundary";
  const label = periodo || new Date().toLocaleDateString("es").replace(/\//g, "-");
  const filename = "ContaBot_" + label + ".csv";
  const body = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n" + id + "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"document\"; filename=\"" + filename + "\"\r\nContent-Type: text/csv\r\n\r\n" + csv + "\r\n--" + boundary + "--";
  await fetch(TG + "/sendDocument", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=" + boundary },
    body: body,
  });
}

function detectarFecha(msg) {
  const low = msg.toLowerCase();
  const fecha = new Date();
  if (low.indexOf("ayer") >= 0) { fecha.setDate(fecha.getDate() - 1); }
  else if (low.indexOf("lunes") >= 0) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 6) % 7)); }
  else if (low.indexOf("martes") >= 0) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 5) % 7)); }
  else if (low.indexOf("miercoles") >= 0) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 4) % 7)); }
  else if (low.indexOf("jueves") >= 0) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 3) % 7)); }
  else if (low.indexOf("viernes") >= 0) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 2) % 7)); }
  else if (low.indexOf("sabado") >= 0) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 1) % 7)); }
  else if (low.indexOf("domingo") >= 0) { fecha.setDate(fecha.getDate() - (fecha.getDay() % 7)); }
  return fecha.toLocaleDateString("es");
}

function detectarMonto(msg) {
  const matches = msg.match(/\$\s*([\d,]+)|([\d]{3,})/g);
  if (!matches) return 0;
  const nums = matches.map(function(n) { return parseInt(n.replace(/[$,\s]/g, "")); });
  return Math.max.apply(null, nums);
}

function detectarPiezas(msg) {
  const match = msg.match(/(\d+)\s*(piez|prend|ropa|camis|pantal|blus|vestid)/i);
  return match ? parseInt(match[1]) : 0;
}

function verificarAlerta(chatId) {
  const registros = datos[chatId] || [];
  let ventas = 0, gastos = 0, compras = 0;
  registros.forEach(function(r) {
    if (r.tipo === "venta") ventas += r.monto;
    else if (r.tipo === "compra") compras += r.monto;
    else gastos += r.monto;
  });
  if ((gastos + compras) > ventas && ventas > 0) {
    send(chatId, "ALERTA: Tus gastos ($" + (gastos + compras) + ") superan tus ventas ($" + ventas + "). Cuidado con los gastos este mes!");
  }
}

async function claude(chatId, msg) {
  if (!hist[chatId]) hist[chatId] = [];
  if (!datos[chatId]) datos[chatId] = [];
  if (!inventario[chatId]) inventario[chatId] = 0;
  hist[chatId].push({ role: "user", content: msg });
  if (hist[chatId].length > 30) hist[chatId] = hist[chatId].slice(-30);
  const resumen = datos[chatId].slice(-50).map(function(r) {
    return r.fecha + " " + r.tipo + ": " + r.desc + " $" + r.monto;
  }).join("\n");
  const system = "Eres ContaBot, contador para negocio de ropa de segunda mano. Registra ventas, compras y gastos. Genera reportes mensuales, estado de resultados y balance. Inventario actual: " + inventario[chatId] + " piezas. Usa emojis y Markdown de Telegram.\n\nREGISTROS:\n" + (resumen || "Sin registros");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: system, messages: hist[chatId] }),
  });
  const d = await r.json();
  const reply = d.content.map(function(b) { return b.text || ""; }).join("") || "Error";
  hist[chatId].push({ role: "assistant", content: reply });
  const low = msg.toLowerCase();
  const monto = detectarMonto(msg);
  const now = detectarFecha(msg);
  const piezas = detectarPiezas(msg);
  if ((low.indexOf("vend") >= 0 || low.indexOf("venta") >= 0) && monto > 0) {
    datos[chatId].push({ fecha: now, tipo: "venta", desc: msg, monto: monto });
    if (piezas > 0) inventario[chatId] = Math.max(0, inventario[chatId] - piezas);
    verificarAlerta(chatId);
  } else if ((low.indexOf("compr") >= 0 || low.indexOf("paca") >= 0 || low.indexOf("inventario") >= 0) && monto > 0) {
    datos[chatId].push({ fecha: now, tipo: "compra", desc: msg, monto: monto });
    if (piezas > 0) inventario[chatId] += piezas;
    verificarAlerta(chatId);
  } else if ((low.indexOf("pagu") >= 0 || low.indexOf("gasto") >= 0 || low.indexOf("renta") >= 0 || low.indexOf("luz") >= 0 || low.indexOf("agua") >= 0) && monto > 0) {
    datos[chatId].push({ fecha: now, tipo: "gasto", desc: msg, monto: monto });
    verificarAlerta(chatId);
  }
  return reply;
}

async function reporteMensual() {
  if (!datos[CHAT_ID] || datos[CHAT_ID].length === 0) return;
  const fecha = new Date();
  const label = fecha.getMonth() + "-" + fecha.getFullYear();
  await send(CHAT_ID, "Reporte mensual automatico! Aqui va tu resumen del mes:");
  await sendCSV(CHAT_ID, label);
  datos[CHAT_ID] = [];
  hist[CHAT_ID] = [];
}

async function reporteSemanal() {
  if (!datos[CHAT_ID] || datos[CHAT_ID].length === 0) return;
  let ventas = 0, compras = 0, gastos = 0;
  const ahora = new Date();
  const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  datos[CHAT_ID].forEach(function(r) {
    if (r.tipo === "venta") ventas += r.monto;
    else if (r.tipo === "compra") compras += r.monto;
    else gastos += r.monto;
  });
  const utilidad = ventas - compras - gastos;
  const msg = "Reporte semanal de tu negocio!\n\nVentas: $" + ventas + "\nCompras: $" + compras + "\nGastos: $" + gastos + "\nUtilidad: $" + utilidad + "\nInventario: " + (inventario[CHAT_ID] || 0) + " piezas\n\n" + (utilidad > 0 ? "Buena semana! Vas positivo." : "Cuidado, los gastos superan ventas esta semana.");
  await send(CHAT_ID, msg);
}

async function recordatorioDiario() {
  const hora = new Date().getHours();
  if (hora >= 19) {
    await send(CHAT_ID, "Hola! No olvides registrar tus ventas de hoy. Escribe algo como: Ventas hoy $2500");
  }
}

function programarTareas() {
  const ahora = new Date();

  // Reporte mensual - primer dia del mes a las 8am
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1, 8, 0, 0);
  setTimeout(function() { reporteMensual().then(function() { programarTareas(); }); }, finMes - ahora);

  // Reporte semanal - cada lunes a las 8am
  const diasHastaLunes = (8 - ahora.getDay()) % 7 || 7;
  const lunesNext = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + diasHastaLunes, 8, 0, 0);
  setTimeout(function() {
    reporteSemanal();
    setInterval(reporteSemanal, 7 * 24 * 60 * 60 * 1000);
  }, lunesNext - ahora);

  // Recordatorio diario a las 7pm
  const hoy7pm = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 19, 0, 0);
  const diff7pm = hoy7pm > ahora ? hoy7pm - ahora : (24 * 60 * 60 * 1000) - (ahora - hoy7pm);
  setTimeout(function() {
    recordatorioDiario();
    setInterval(recordatorioDiario, 24 * 60 * 60 * 1000);
  }, diff7pm);
}

app.post("/webhook", async function(req, res) {
  res.sendStatus(200);
  try {
    const m = req.body.message;
    if (!m || !m.text) return;
    const id = m.chat.id;
    const text = m.text;
    if (text === "/start") { await send(id, "Hola! Soy ContaBot tu contador de ropa de segunda. Comandos:\n/excel - Descargar reporte\n/inventario - Ver piezas\n/reset - Limpiar mes"); return; }
    if (text === "/reset") { hist[id] = []; datos[id] = []; await send(id, "Historial limpiado!"); return; }
    if (text === "/excel") { await send(id, "Generando tu archivo..."); await sendCSV(id); return; }
    if (text === "/inventario") { await send(id, "Tienes " + (inventario[id] || 0) + " piezas en inventario."); return; }
    const reply = await claude(id, text);
    await send(id, reply);
  } catch (e) { console.error(e); }
});

app.get("/", function(req, res) { res.send("ContaBot OK"); });
const PORT = process.env.PORT || 8080;
app.listen(PORT, function() {
  console.log("Puerto " + PORT);
  programarTareas();
});
