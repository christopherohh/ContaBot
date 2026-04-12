const express = require("express");
const ExcelJS = require("exceljs");
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

async function generarExcel(id) {
  const registros = datos[id] || [];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ingresos y Gastos");

  const DARK_GRAY = "2D2D2D";
  const GREEN_MED = "217346";
  const GREEN_DARK = "1A5C38";
  const RED_DARK = "8B0000";
  const BLUE_DARK = "1F3864";
  const BLUE_MED = "2E75B6";
  const BLUE_LIGHT = "DEEAF1";
  const BORDER_CLR = "BFBFBF";
  const WHITE = "FFFFFF";

  ws.columns = [
    { key: "a", width: 14 },
    { key: "b", width: 10 },
    { key: "c", width: 18 },
    { key: "d", width: 13 },
    { key: "e", width: 2 },
    { key: "f", width: 12 },
    { key: "g", width: 13 },
    { key: "h", width: 13 },
    { key: "i", width: 13 },
    { key: "j", width: 2 },
    { key: "k", width: 14 },
    { key: "l", width: 10 },
    { key: "m", width: 22 },
    { key: "n", width: 13 },
  ];

  function thinBorder() {
    const s = { style: "thin", color: { argb: "FF" + BORDER_CLR } };
    return { top: s, bottom: s, left: s, right: s };
  }

  function thickBorder(clr) {
    const c = clr || DARK_GRAY;
    const s = { style: "medium", color: { argb: "FF" + c } };
    return { top: s, bottom: s, left: s, right: s };
  }

  function fillSolid(hex) {
    return { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
  }

  function hdrFont(clr) {
    return { name: "Arial", bold: true, size: 10, color: { argb: "FF" + (clr || WHITE) } };
  }

  function dataFont(bold) {
    return { name: "Arial", size: 10, bold: bold || false };
  }

  function centerAlign(wrap) {
    return { horizontal: "center", vertical: "middle", wrapText: wrap || false };
  }

  function leftAlign() {
    return { horizontal: "left", vertical: "middle" };
  }

  function rightAlign() {
    return { horizontal: "right", vertical: "middle" };
  }

  ws.getRow(1).height = 14;
  ws.getRow(2).height = 36;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 34;
  ws.getRow(5).height = 28;
  ws.getRow(6).height = 28;
  for (var r = 7; r <= 206; r++) ws.getRow(r).height = 20;

  // Titulo
  ws.mergeCells("A2:N2");
  var titulo = ws.getCell("A2");
  titulo.value = "TABLA DE INGRESOS Y GASTOS";
  titulo.font = { name: "Arial", bold: true, size: 16, color: { argb: "FF" + WHITE } };
  titulo.fill = fillSolid(DARK_GRAY);
  titulo.alignment = centerAlign(false);
  titulo.border = thickBorder(DARK_GRAY);

  // Label totales row 3
  ws.mergeCells("A3:D3");
  var lI = ws.getCell("A3");
  lI.value = "TOTAL INGRESOS";
  lI.font = { name: "Arial", bold: true, size: 9, color: { argb: "FF" + GREEN_DARK } };
  lI.fill = fillSolid("EBF5EB");
  lI.alignment = centerAlign();
  lI.border = thinBorder();

  ws.mergeCells("F3:I3");
  var lG = ws.getCell("F3");
  lG.value = "GANANCIA / PERDIDA";
  lG.font = { name: "Arial", bold: true, size: 9, color: { argb: "FF" + BLUE_DARK } };
  lG.fill = fillSolid("EBF3FB");
  lG.alignment = centerAlign();
  lG.border = thinBorder();

  ws.mergeCells("K3:N3");
  var lE = ws.getCell("K3");
  lE.value = "TOTAL GASTOS";
  lE.font = { name: "Arial", bold: true, size: 9, color: { argb: "FF" + RED_DARK } };
  lE.fill = fillSolid("FCEAEA");
  lE.alignment = centerAlign();
  lE.border = thinBorder();

  // Totales row 4
  var ingresos = registros.filter(function(r) { return r.tipo === "venta"; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var gastos = registros.filter(function(r) { return r.tipo !== "venta"; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var ganancia = ingresos - gastos;

  ws.mergeCells("A4:D4");
  var tI = ws.getCell("A4");
  tI.value = ingresos;
  tI.font = { name: "Arial", bold: true, size: 18, color: { argb: "FF" + WHITE } };
  tI.fill = fillSolid(GREEN_MED);
  tI.alignment = centerAlign();
  tI.numFmt = "$#,##0.00";
  tI.border = thickBorder(GREEN_DARK);

  ws.mergeCells("F4:I4");
  var tG = ws.getCell("F4");
  tG.value = ganancia;
  tG.font = { name: "Arial", bold: true, size: 18, color: { argb: "FF" + WHITE } };
  tG.fill = fillSolid(BLUE_MED);
  tG.alignment = centerAlign();
  tG.numFmt = "$#,##0.00";
  tG.border = thickBorder(BLUE_DARK);

  ws.mergeCells("K4:N4");
  var tE = ws.getCell("K4");
  tE.value = gastos;
  tE.font = { name: "Arial", bold: true, size: 18, color: { argb: "FF" + WHITE } };
  tE.fill = fillSolid(RED_DARK);
  tE.alignment = centerAlign();
  tE.numFmt = "$#,##0.00";
  tE.border = thickBorder(RED_DARK);

  // Seccion labels row 5
  ws.mergeCells("A5:D5");
  var sI = ws.getCell("A5");
  sI.value = "INGRESOS";
  sI.font = hdrFont(WHITE);
  sI.font.size = 11;
  sI.fill = fillSolid(GREEN_DARK);
  sI.alignment = centerAlign();
  sI.border = thickBorder(GREEN_DARK);

  ws.mergeCells("F5:I5");
  var sR = ws.getCell("F5");
  sR.value = "RESUMEN SEMANAL";
  sR.font = hdrFont(WHITE);
  sR.font.size = 11;
  sR.fill = fillSolid(BLUE_DARK);
  sR.alignment = centerAlign();
  sR.border = thickBorder(BLUE_DARK);

  ws.mergeCells("K5:N5");
  var sE = ws.getCell("K5");
  sE.value = "GASTOS";
  sE.font = hdrFont(WHITE);
  sE.font.size = 11;
  sE.fill = fillSolid(RED_DARK);
  sE.alignment = centerAlign();
  sE.border = thickBorder(RED_DARK);

  // Encabezados columnas row 6
  var ingHdrs = ["Fecha", "Mes", "Concepto", "Valor"];
  var ingCols = [1, 2, 3, 4];
  for (var i = 0; i < ingHdrs.length; i++) {
    var c = ws.getRow(6).getCell(ingCols[i]);
    c.value = ingHdrs[i];
    c.font = hdrFont(WHITE);
    c.fill = fillSolid(GREEN_MED);
    c.alignment = centerAlign();
    c.border = thinBorder();
  }

  var resHdrs = ["Semana", "Ingresos", "Gastos", "Resultado"];
  var resCols = [6, 7, 8, 9];
  for (var i = 0; i < resHdrs.length; i++) {
    var c = ws.getRow(6).getCell(resCols[i]);
    c.value = resHdrs[i];
    c.font = hdrFont(WHITE);
    c.fill = fillSolid(BLUE_MED);
    c.alignment = centerAlign();
    c.border = thinBorder();
  }

  var gasHdrs = ["Fecha", "Mes", "Descripcion", "Valor"];
  var gasCols = [11, 12, 13, 14];
  for (var i = 0; i < gasHdrs.length; i++) {
    var c = ws.getRow(6).getCell(gasCols[i]);
    c.value = gasHdrs[i];
    c.font = hdrFont(WHITE);
    c.fill = fillSolid("C00000");
    c.alignment = centerAlign();
    c.border = thinBorder();
  }

  // Datos reales
  var ventas = registros.filter(function(r) { return r.tipo === "venta"; });
  var comprasGastos = registros.filter(function(r) { return r.tipo !== "venta"; });
  var maxRows = Math.max(ventas.length, comprasGastos.length, 50);

  for (var rowIdx = 0; rowIdx < maxRows; rowIdx++) {
    var excelRow = rowIdx + 7;
    var even = rowIdx % 2 === 0;
    var rowFillG = even ? "F5FBF5" : "FFFFFF";
    var rowFillR = even ? "FEF5F5" : "FFFFFF";

    // Ingresos
    if (rowIdx < ventas.length) {
      var v = ventas[rowIdx];
      var rA = ws.getRow(excelRow).getCell(1);
      rA.value = v.fecha;
      rA.font = dataFont();
      rA.fill = fillSolid(rowFillG);
      rA.alignment = centerAlign();
      rA.border = thinBorder();

      var rB = ws.getRow(excelRow).getCell(2);
      rB.value = v.mes || "";
      rB.font = dataFont();
      rB.fill = fillSolid(rowFillG);
      rB.alignment = centerAlign();
      rB.border = thinBorder();

      var rC = ws.getRow(excelRow).getCell(3);
      rC.value = v.lugar ? ("Venta " + v.lugar) : v.desc.substring(0, 30);
      rC.font = dataFont();
      rC.fill = fillSolid(rowFillG);
      rC.alignment = leftAlign();
      rC.border = thinBorder();

      var rD = ws.getRow(excelRow).getCell(4);
      rD.value = v.monto;
      rD.font = dataFont();
      rD.fill = fillSolid(rowFillG);
      rD.alignment = rightAlign();
      rD.numFmt = "$#,##0.00";
      rD.border = thinBorder();
    } else {
      for (var col = 1; col <= 4; col++) {
        var ec = ws.getRow(excelRow).getCell(col);
        ec.fill = fillSolid(rowFillG);
        ec.border = thinBorder();
      }
    }

    // Gastos
    if (rowIdx < comprasGastos.length) {
      var g = comprasGastos[rowIdx];
      var gK = ws.getRow(excelRow).getCell(11);
      gK.value = g.fecha;
      gK.font = dataFont();
      gK.fill = fillSolid(rowFillR);
      gK.alignment = centerAlign();
      gK.border = thinBorder();

      var gL = ws.getRow(excelRow).getCell(12);
      gL.value = g.mes || "";
      gL.font = dataFont();
      gL.fill = fillSolid(rowFillR);
      gL.alignment = centerAlign();
      gL.border = thinBorder();

      var gM = ws.getRow(excelRow).getCell(13);
      gM.value = g.desc.substring(0, 30);
      gM.font = dataFont();
      gM.fill = fillSolid(rowFillR);
      gM.alignment = leftAlign();
      gM.border = thinBorder();

      var gN = ws.getRow(excelRow).getCell(14);
      gN.value = g.monto;
      gN.font = dataFont();
      gN.fill = fillSolid(rowFillR);
      gN.alignment = rightAlign();
      gN.numFmt = "$#,##0.00";
      gN.border = thinBorder();
    } else {
      for (var col = 11; col <= 14; col++) {
        var ec = ws.getRow(excelRow).getCell(col);
        ec.fill = fillSolid(rowFillR);
        ec.border = thinBorder();
      }
    }
  }

  // Resumen semanal
  var semanas = [
    { label: "1a Semana", ini: 1, fin: 7, row: 7 },
    { label: "2a Semana", ini: 8, fin: 14, row: 10 },
    { label: "3a Semana", ini: 15, fin: 21, row: 13 },
    { label: "4a Semana", ini: 22, fin: 31, row: 16 },
  ];

  semanas.forEach(function(sem) {
    var semIngresos = ventas.filter(function(r) {
      var d = new Date(r.fecha.split("/").reverse().join("-"));
      return d.getDate() >= sem.ini && d.getDate() <= sem.fin;
    }).reduce(function(s, r) { return s + r.monto; }, 0);

    var semGastos = comprasGastos.filter(function(r) {
      var d = new Date(r.fecha.split("/").reverse().join("-"));
      return d.getDate() >= sem.ini && d.getDate() <= sem.fin;
    }).reduce(function(s, r) { return s + r.monto; }, 0);

    var semRes = semIngresos - semGastos;

    ws.mergeCells("F" + sem.row + ":F" + (sem.row + 2));
    var sL = ws.getCell("F" + sem.row);
    sL.value = sem.label;
    sL.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF" + BLUE_DARK } };
    sL.fill = fillSolid(BLUE_LIGHT);
    sL.alignment = centerAlign();
    sL.border = thinBorder();

    var sI = ws.getCell("G" + sem.row);
    sI.value = semIngresos;
    sI.font = { name: "Arial", bold: true, size: 11, color: { argb: "FF" + GREEN_DARK } };
    sI.fill = fillSolid(BLUE_LIGHT);
    sI.alignment = centerAlign();
    sI.numFmt = "$#,##0.00";
    sI.border = thinBorder();

    var sG = ws.getCell("H" + sem.row);
    sG.value = semGastos;
    sG.font = { name: "Arial", bold: true, size: 11, color: { argb: "FF" + RED_DARK } };
    sG.fill = fillSolid(BLUE_LIGHT);
    sG.alignment = centerAlign();
    sG.numFmt = "$#,##0.00";
    sG.border = thinBorder();

    var sR = ws.getCell("I" + sem.row);
    sR.value = semRes;
    sR.font = { name: "Arial", bold: true, size: 11, color: { argb: semRes >= 0 ? "FF" + GREEN_DARK : "FF" + RED_DARK } };
    sR.fill = fillSolid(BLUE_LIGHT);
    sR.alignment = centerAlign();
    sR.numFmt = "$#,##0.00";
    sR.border = thinBorder();

    for (var extra = sem.row + 1; extra <= sem.row + 2; extra++) {
      for (var col = 7; col <= 9; col++) {
        var ec = ws.getRow(extra).getCell(col);
        ec.fill = fillSolid(BLUE_LIGHT);
        ec.border = thinBorder();
      }
    }
  });

  // Total mes resumen row 20
  var tRow = ws.getRow(20);
  var tF = tRow.getCell(6);
  tF.value = "TOTAL MES";
  tF.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF" + WHITE } };
  tF.fill = fillSolid(BLUE_DARK);
  tF.alignment = centerAlign();
  tF.border = thinBorder();

  var tG2 = tRow.getCell(7);
  tG2.value = ingresos;
  tG2.font = { name: "Arial", bold: true, size: 11, color: { argb: "FF" + WHITE } };
  tG2.fill = fillSolid(GREEN_DARK);
  tG2.alignment = centerAlign();
  tG2.numFmt = "$#,##0.00";
  tG2.border = thinBorder();

  var tH = tRow.getCell(8);
  tH.value = gastos;
  tH.font = { name: "Arial", bold: true, size: 11, color: { argb: "FF" + WHITE } };
  tH.fill = fillSolid(RED_DARK);
  tH.alignment = centerAlign();
  tH.numFmt = "$#,##0.00";
  tH.border = thinBorder();

  var tI = tRow.getCell(9);
  tI.value = ganancia;
  tI.font = { name: "Arial", bold: true, size: 11, color: { argb: "FF" + WHITE } };
  tI.fill = fillSolid(BLUE_MED);
  tI.alignment = centerAlign();
  tI.numFmt = "$#,##0.00";
  tI.border = thinBorder();

  ws.views = [{ state: "frozen", ySplit: 6 }];

  // Generar buffer y enviar
  var buffer = await wb.xlsx.writeBuffer();
  var now = new Date().toLocaleDateString("es").replace(/\//g, "-");
  var filename = "ContaBot_" + now + ".xlsx";

  var FormData = require("form-data");
  var fd = new FormData();
  fd.append("chat_id", String(id));
  fd.append("document", buffer, { filename: filename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  var https = require("https");
  var botUrl = "api.telegram.org";
  var path = "/bot" + TOKEN + "/sendDocument";

  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: botUrl,
      path: path,
      method: "POST",
      headers: fd.getHeaders(),
    }, function(res) {
      res.on("data", function() {});
      res.on("end", resolve);
    });
    req.on("error", reject);
    fd.pipe(req);
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

function detectarLugar(msg) {
  const low = msg.toLowerCase();
  const lugares = ["victoria", "juarez", "reforma", "centro", "mercado", "tianguis", "plaza", "bodega", "salon", "expo", "santa", "mision", "san luis"];
  for (var i = 0; i < lugares.length; i++) {
    if (low.indexOf(lugares[i]) >= 0) return lugares[i];
  }
  return null;
}

function detectarPago(msg) {
  const low = msg.toLowerCase();
  if (low.indexOf("transfer") >= 0 || low.indexOf("deposi") >= 0 || low.indexOf("oxxo") >= 0 || low.indexOf("spin") >= 0 || low.indexOf("clip") >= 0) return "transferencia";
  return "efectivo";
}

function detectarMes(msg) {
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const low = msg.toLowerCase();
  for (var i = 0; i < meses.length; i++) {
    if (low.indexOf(meses[i]) >= 0) return meses[i];
  }
  const now = new Date();
  return meses[now.getMonth()];
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
    send(chatId, "ALERTA: Tus gastos ($" + (gastos + compras) + ") superan tus ventas ($" + ventas + "). Revisa tus gastos!");
  }
}

async function claude(chatId, msg) {
  if (!hist[chatId]) hist[chatId] = [];
  if (!datos[chatId]) datos[chatId] = [];
  if (!inventario[chatId]) inventario[chatId] = 0;
  hist[chatId].push({ role: "user", content: msg });
  if (hist[chatId].length > 30) hist[chatId] = hist[chatId].slice(-30);
  const resumen = datos[chatId].slice(-50).map(function(r) {
    return r.fecha + " " + r.tipo + " " + (r.lugar || "") + " " + (r.pago || "") + ": $" + r.monto;
  }).join("\n");
  const system = "Eres ContaBot, contador para negocio de ropa de segunda mano. Registra ventas por lugar y tipo de pago. Inventario: " + inventario[chatId] + " piezas. Genera reportes con desglose por lugar y forma de pago. Usa emojis y Markdown de Telegram.\n\nREGISTROS:\n" + (resumen || "Sin registros");
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
  const lugar = detectarLugar(msg);
  const pago = detectarPago(msg);
  const mes = detectarMes(msg);
  if ((low.indexOf("vend") >= 0 || low.indexOf("venta") >= 0) && monto > 0) {
    datos[chatId].push({ fecha: now, tipo: "venta", desc: msg, monto: monto, lugar: lugar, pago: pago, mes: mes });
    if (piezas > 0) inventario[chatId] = Math.max(0, inventario[chatId] - piezas);
    verificarAlerta(chatId);
  } else if ((low.indexOf("compr") >= 0 || low.indexOf("paca") >= 0 || low.indexOf("inventario") >= 0) && monto > 0) {
    datos[chatId].push({ fecha: now, tipo: "compra", desc: msg, monto: monto, lugar: lugar, pago: pago, mes: mes });
    if (piezas > 0) inventario[chatId] += piezas;
    verificarAlerta(chatId);
  } else if ((low.indexOf("pagu") >= 0 || low.indexOf("gasto") >= 0 || low.indexOf("renta") >= 0 || low.indexOf("luz") >= 0 || low.indexOf("agua") >= 0) && monto > 0) {
    datos[chatId].push({ fecha: now, tipo: "gasto", desc: msg, monto: monto, lugar: lugar, pago: pago, mes: mes });
    verificarAlerta(chatId);
  }
  return reply;
}

async function reporteMensual() {
  if (!datos[CHAT_ID] || datos[CHAT_ID].length === 0) return;
  await send(CHAT_ID, "Reporte mensual automatico! Generando tu Excel...");
  await generarExcel(CHAT_ID);
  datos[CHAT_ID] = [];
  hist[CHAT_ID] = [];
}

async function reporteSemanal() {
  if (!datos[CHAT_ID] || datos[CHAT_ID].length === 0) return;
  let ventas = 0, compras = 0, gastos = 0, efectivo = 0, transferencia = 0;
  const lugares = {};
  datos[CHAT_ID].forEach(function(r) {
    if (r.tipo === "venta") {
      ventas += r.monto;
      if (r.pago === "transferencia") transferencia += r.monto;
      else efectivo += r.monto;
      if (r.lugar) lugares[r.lugar] = (lugares[r.lugar] || 0) + r.monto;
    } else if (r.tipo === "compra") compras += r.monto;
    else gastos += r.monto;
  });
  const utilidad = ventas - compras - gastos;
  const topLugar = Object.keys(lugares).sort(function(a, b) { return lugares[b] - lugares[a]; })[0];
  let msg = "Reporte semanal!\n\nVentas: $" + ventas + "\n  Efectivo: $" + efectivo + "\n  Transferencia: $" + transferencia + "\nCompras: $" + compras + "\nGastos: $" + gastos + "\nUtilidad: $" + utilidad + "\nInventario: " + (inventario[CHAT_ID] || 0) + " piezas";
  if (topLugar) msg += "\nMejor lugar: " + topLugar + " ($" + lugares[topLugar] + ")";
  msg += "\n\n" + (utilidad > 0 ? "Buena semana! Vas positivo." : "Cuidado, revisa tus gastos.");
  await send(CHAT_ID, msg);
}

async function recordatorioDiario() {
  await send(CHAT_ID, "Hola! No olvides registrar tus ventas de hoy. Ej: Ventas Victoria hoy $2500 efectivo");
}

function programarTareas() {
  const ahora = new Date();
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1, 8, 0, 0);
  setTimeout(function() { reporteMensual().then(function() { programarTareas(); }); }, finMes - ahora);
  const diasHastaLunes = (8 - ahora.getDay()) % 7 || 7;
  const lunesNext = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + diasHastaLunes, 8, 0, 0);
  setTimeout(function() { reporteSemanal(); setInterval(reporteSemanal, 7 * 24 * 60 * 60 * 1000); }, lunesNext - ahora);
  const hoy7pm = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 19, 0, 0);
  const diff7pm = hoy7pm > ahora ? hoy7pm - ahora : (24 * 60 * 60 * 1000) - (ahora - hoy7pm);
  setTimeout(function() { recordatorioDiario(); setInterval(recordatorioDiario, 24 * 60 * 60 * 1000); }, diff7pm);
}

app.post("/webhook", async function(req, res) {
  res.sendStatus(200);
  try {
    const m = req.body.message;
    if (!m || !m.text) return;
    const id = m.chat.id;
    const text = m.text;
    if (text === "/start") { await send(id, "Hola! Soy ContaBot. Comandos:\n/excel - Descargar Excel profesional\n/inventario - Ver piezas\n/lugares - Ver ventas por lugar\n/reset - Limpiar mes\n\nEjemplo:\nVentas Victoria hoy $3500 efectivo"); return; }
    if (text === "/reset") { hist[id] = []; datos[id] = []; await send(id, "Historial limpiado!"); return; }
    if (text === "/excel") { await send(id, "Generando tu Excel profesional..."); await generarExcel(id); return; }
    if (text === "/inventario") { await send(id, "Tienes " + (inventario[id] || 0) + " piezas en inventario."); return; }
    if (text === "/lugares") {
      const regs = datos[id] || [];
      const lug = {};
      regs.forEach(function(r) { if (r.tipo === "venta" && r.lugar) lug[r.lugar] = (lug[r.lugar] || 0) + r.monto; });
      if (Object.keys(lug).length === 0) { await send(id, "Sin datos de lugares aun."); return; }
      let msg = "Ventas por lugar:\n";
      Object.keys(lug).sort(function(a, b) { return lug[b] - lug[a]; }).forEach(function(l) { msg += l + ": $" + lug[l] + "\n"; });
      await send(id, msg);
      return;
    }
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
