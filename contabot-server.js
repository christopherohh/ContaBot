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

function detectarFecha(msg) {
  const low = msg.toLowerCase();
  const fecha = new Date();
  if (/ayer/.test(low)) { fecha.setDate(fecha.getDate() - 1); }
  else if (/lunes/.test(low)) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 6) % 7)); }
  else if (/martes/.test(low)) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 5) % 7)); }
  else if (/mi[eé]rcoles/.test(low)) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 4) % 7)); }
  else if (/jueves/.test(low)) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 3) % 7)); }
  else if (/viernes/.test(low)) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 2) % 7)); }
  else if (/s[aá]bado/.test(low)) { fecha.setDate(fecha.getDate() - ((fecha.getDay() + 1) % 7)); }
  else if (/domingo/.test(low)) { fecha.setDate(fecha.getDate() - (fecha.getDay() % 7)); }
  const diaExplicito = msg.match(/\b(\d{1,2})\s*(de)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
  if (diaExplicito) {
    const meses = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11 };
    fecha.setDate(parseInt(diaExplicito[1]));​​​​​​​​​​​​​​​​
