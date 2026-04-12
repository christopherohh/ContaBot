const express = require("express");
const ExcelJS = require("exceljs");
const FormData = require("form-data");
const XLSX = require("xlsx");
const app = express();
app.use(express.json());

const TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const KEY = process.env.ANTHROPIC_API_KEY;
const TG = "https://api.telegram.org/bot" + TOKEN;
const CHAT_ID = "5786549088";
const EMPLEADA_ID = null;

// Memoria temporal (respaldo si DB falla)
var dbOk = false;
var memDatos = {};
var memInventario = {};
var memHist = {};

// Base de datos
var pool = null;
try {
  var pg = require("pg");
  pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30000,
    max: 3,
    connectionTimeoutMillis: 8000,
  });
  pool.on("error", function(err) { console.log("Pool error:", err.message); dbOk = false; });
} catch(e) { console.log("pg no disponible:", e.message); }

async function initDB() {
  if (!pool) { dbOk = false; return; }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registros (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        fecha TEXT, mes TEXT, tipo TEXT,
        descripcion TEXT, monto NUMERIC,
        pago TEXT, lugar TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS inventario_tbl (
        chat_id TEXT PRIMARY KEY,
        piezas INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS historial (
        id SERIAL PRIMARY KEY,
        chat_id TEXT, role TEXT, content TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    dbOk = true;
    console.log("DB lista");
  } catch(e) {
    dbOk = false;
    console.log("DB no disponible, usando memoria");
  }
}

async function getRegistros(chatId) {
  if (dbOk) {
    try {
      var r = await pool.query("SELECT * FROM registros WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 200", [String(chatId)]);
      return r.rows.map(function(row) { return { fecha:row.fecha, mes:row.mes, tipo:row.tipo, desc:row.descripcion, monto:parseFloat(row.monto)||0, pago:row.pago, lugar:row.lugar }; });
    } catch(e) { dbOk = false; }
  }
  return memDatos[chatId] || [];
}

async function saveRegistro(chatId, reg) {
  if (dbOk) {
    try {
      await pool.query("INSERT INTO registros (chat_id,fecha,mes,tipo,descripcion,monto,pago,lugar) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [String(chatId), reg.fecha, reg.mes, reg.tipo, reg.desc, reg.monto, reg.pago, reg.lugar]);
      return;
    } catch(e) { dbOk = false; }
  }
  if (!memDatos[chatId]) memDatos[chatId] = [];
  memDatos[chatId].unshift(reg);
}

async function getInventario(chatId) {
  if (dbOk) {
    try {
      var r = await pool.query("SELECT piezas FROM inventario_tbl WHERE chat_id=$1", [String(chatId)]);
      return r.rows.length > 0 ? parseInt(r.rows[0].piezas) : 0;
    } catch(e) { dbOk = false; }
  }
  return memInventario[chatId] || 0;
}

async function setInventario(chatId, piezas) {
  if (dbOk) {
    try {
      await pool.query("INSERT INTO inventario_tbl (chat_id,piezas) VALUES ($1,$2) ON CONFLICT (chat_id) DO UPDATE SET piezas=$2", [String(chatId), piezas]);
      return;
    } catch(e) { dbOk = false; }
  }
  memInventario[chatId] = piezas;
}

async function getHistorial(chatId) {
  if (dbOk) {
    try {
      var r = await pool.query("SELECT role,content FROM historial WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 20", [String(chatId)]);
      return r.rows.reverse();
    } catch(e) { dbOk = false; }
  }
  return memHist[chatId] || [];
}

async function saveHistorial(chatId, role, content) {
  if (dbOk) {
    try {
      await pool.query("INSERT INTO historial (chat_id,role,content) VALUES ($1,$2,$3)", [String(chatId), role, content]);
      await pool.query("DELETE FROM historial WHERE chat_id=$1 AND id NOT IN (SELECT id FROM historial WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 20)", [String(chatId)]);
      return;
    } catch(e) { dbOk = false; }
  }
  if (!memHist[chatId]) memHist[chatId] = [];
  memHist[chatId].push({ role: role, content: content });
  if (memHist[chatId].length > 20) memHist[chatId] = memHist[chatId].slice(-20);
}

async function deleteHistorial(chatId) {
  if (dbOk) { try { await pool.query("DELETE FROM historial WHERE chat_id=$1", [String(chatId)]); return; } catch(e) {} }
  memHist[chatId] = [];
}

async function getRegistrosMes(chatId, mes) {
  var regs = await getRegistros(chatId);
  return regs.filter(function(r) { return r.mes === mes; });
}

const sesion = {};

async function send(id, text, keyboard) {
  var body = { chat_id: id, text: text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(TG + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function editMsg(chatId, msgId, text, keyboard) {
  var body = { chat_id: chatId, message_id: msgId, text: text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(TG + "/editMessageText", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function answerCallback(id, text) {
  await fetch(TG + "/answerCallbackQuery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: id, text: text || "" }) });
}

function menuPrincipal() {
  return { inline_keyboard: [
    [{ text: "📝 Registrar", callback_data: "menu_registrar" }, { text: "📦 Inventario", callback_data: "menu_inventario" }],
    [{ text: "📊 Ver Excel", callback_data: "menu_excel" }, { text: "📈 Resumen mes", callback_data: "menu_resumen" }],
    [{ text: "🗓 Reporte semanal", callback_data: "menu_semanal" }, { text: "📅 Comparar meses", callback_data: "menu_comparar" }],
    [{ text: "🔮 Prediccion", callback_data: "menu_prediccion" }, { text: "👤 Mi empleada", callback_data: "menu_empleada" }],
    [{ text: "🗑 Eliminar ultimo registro", callback_data: "menu_eliminar" }]
  ]};
}

function btnTipo() {
  return { inline_keyboard: [
    [{ text: "💰 Ingreso", callback_data: "tipo_ingreso" }, { text: "💸 Gasto", callback_data: "tipo_gasto" }],
    [{ text: "🔙 Menu", callback_data: "menu_inicio" }]
  ]};
}

function btnConceptoIngreso() {
  return { inline_keyboard: [
    [{ text: "🛍 Venta San Luis", callback_data: "concepto_Venta San Luis" }],
    [{ text: "🛍 Venta Victoria", callback_data: "concepto_Venta Victoria" }],
    [{ text: "🛍 Venta Santa", callback_data: "concepto_Venta Santa" }],
    [{ text: "🛍 Venta Mision", callback_data: "concepto_Venta Mision" }],
    [{ text: "💵 Prestamo", callback_data: "concepto_Prestamo" }],
    [{ text: "🔙 Atras", callback_data: "atras_tipo" }]
  ]};
}

function btnConceptoGasto() {
  return { inline_keyboard: [
    [{ text: "⛽ Gasolina", callback_data: "concepto_Gasolina" }],
    [{ text: "👗 Compra mercancia", callback_data: "concepto_Compra mercancia" }],
    [{ text: "🏠 Renta", callback_data: "concepto_Renta" }],
    [{ text: "💼 Sueldo propio", callback_data: "concepto_Sueldo propio" }],
    [{ text: "👤 Sueldo empleado", callback_data: "concepto_Sueldo empleado" }],
    [{ text: "💳 Abono prestamo", callback_data: "concepto_Abono prestamo" }],
    [{ text: "🔙 Atras", callback_data: "atras_tipo" }]
  ]};
}

function btnPago() {
  return { inline_keyboard: [
    [{ text: "💵 Efectivo", callback_data: "pago_efectivo" }, { text: "📲 Transferencia", callback_data: "pago_transferencia" }],
    [{ text: "🔙 Atras", callback_data: "atras_concepto" }]
  ]};
}

function btnInventario() {
  return { inline_keyboard: [
    [{ text: "➕ Agregar piezas", callback_data: "inv_agregar" }],
    [{ text: "📋 Ver inventario", callback_data: "inv_ver" }],
    [{ text: "🔙 Menu", callback_data: "menu_inicio" }]
  ]};
}

function getFecha() { return new Date().toLocaleDateString("es"); }
function getMes() {
  var m = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return m[new Date().getMonth()];
}

async function calcResumen(chatId, regs) {
  if (!regs) regs = await getRegistros(chatId);
  var v=0,c=0,g=0,ef=0,tr=0; var lug={};
  regs.forEach(function(r) {
    var m=parseFloat(r.monto)||0;
    if(r.tipo==="venta"){v+=m;if(r.pago==="transferencia")tr+=m;else ef+=m;if(r.lugar)lug[r.lugar]=(lug[r.lugar]||0)+m;}
    else if(r.tipo==="compra")c+=m;
    else g+=m;
  });
  var util=v-c-g;
  var top=Object.keys(lug).sort(function(a,b){return lug[b]-lug[a];})[0];
  return { ventas:v, compras:c, gastos:g, efectivo:ef, transferencia:tr, utilidad:util, topLugar:top, topMonto:top?lug[top]:0 };
}

async function textoResumenMes(chatId) {
  var regs=await getRegistros(chatId); var inv=await getInventario(chatId); var s=await calcResumen(chatId,regs);
  var msg="*Resumen de "+getMes()+"*\n\nIngresos: $"+s.ventas.toLocaleString("es")+"\n  Efectivo: $"+s.efectivo.toLocaleString("es")+"\n  Transferencia: $"+s.transferencia.toLocaleString("es")+"\nCompras: $"+s.compras.toLocaleString("es")+"\nGastos: $"+s.gastos.toLocaleString("es")+"\nUtilidad: *$"+s.utilidad.toLocaleString("es")+"*\nInventario: "+inv+" piezas\n";
  if(s.topLugar)msg+="Mejor lugar: "+s.topLugar+" ($"+s.topMonto.toLocaleString("es")+")\n";
  msg+="\n"+(s.utilidad>0?"Vas positivo este mes!":"Cuidado, revisa tus gastos.");
  return msg;
}

async function textoResumenSemanal(chatId) {
  var regs=await getRegistros(chatId); var inv=await getInventario(chatId); var s=await calcResumen(chatId,regs);
  return "*Reporte semanal*\n\nVentas: $"+s.ventas.toLocaleString("es")+"\n  Efectivo: $"+s.efectivo.toLocaleString("es")+"\n  Transferencia: $"+s.transferencia.toLocaleString("es")+"\nCompras: $"+s.compras.toLocaleString("es")+"\nGastos: $"+s.gastos.toLocaleString("es")+"\nUtilidad: *$"+s.utilidad.toLocaleString("es")+"*\nInventario: "+inv+" piezas\n\n"+(s.utilidad>0?"Buena semana! Vas positivo.":"Cuidado, revisa tus gastos.");
}

async function textoComparacion(chatId) {
  var meses=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  var mesActual=getMes(); var idxActual=meses.indexOf(mesActual); var mesAnterior=meses[idxActual>0?idxActual-1:11];
  var rA=await getRegistrosMes(chatId,mesActual); var rB=await getRegistrosMes(chatId,mesAnterior);
  var sA=await calcResumen(chatId,rA); var sB=await calcResumen(chatId,rB);
  var diff=sA.utilidad-sB.utilidad;
  var msg="*Comparacion de meses*\n\n*"+mesAnterior+":*\n  Ventas: $"+sB.ventas.toLocaleString("es")+"\n  Gastos: $"+(sB.compras+sB.gastos).toLocaleString("es")+"\n  Utilidad: $"+sB.utilidad.toLocaleString("es")+"\n\n*"+mesActual+":*\n  Ventas: $"+sA.ventas.toLocaleString("es")+"\n  Gastos: $"+(sA.compras+sA.gastos).toLocaleString("es")+"\n  Utilidad: $"+sA.utilidad.toLocaleString("es")+"\n\n";
  if(rB.length===0)msg+="Aun no hay datos de "+mesAnterior+" para comparar.";
  else msg+=diff>=0?"Mejoraste $"+diff.toLocaleString("es")+" vs el mes pasado!":"Bajaste $"+Math.abs(diff).toLocaleString("es")+" vs el mes pasado.";
  return msg;
}

async function textoPrediccion(chatId) {
  var regs=await getRegistros(chatId);
  if(regs.length===0)return "Aun no hay datos suficientes. Registra tus ventas primero!";
  var s=await calcResumen(chatId,regs);
  var diaActual=new Date().getDate(); var diasEnMes=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate();
  var diasRestantes=diasEnMes-diaActual;
  var vd=diaActual>0?s.ventas/diaActual:0; var gd=diaActual>0?(s.compras+s.gastos)/diaActual:0;
  var vP=Math.round(s.ventas+vd*diasRestantes); var gP=Math.round(s.compras+s.gastos+gd*diasRestantes); var uP=vP-gP;
  return "*Prediccion para "+getMes()+"*\n\nDias: "+diaActual+" de "+diasEnMes+"\nVenta diaria promedio: $"+Math.round(vd).toLocaleString("es")+"\n\n*Proyeccion al fin de mes:*\nVentas: $"+vP.toLocaleString("es")+"\nGastos: $"+gP.toLocaleString("es")+"\nUtilidad estimada: *$"+uP.toLocaleString("es")+"*\n\n"+(uP>0?"Va a ser un buen mes! Sigue asi.":"Cuidado, los gastos van a superar las ventas.");
}

async function analizarArchivo(chatId, fileId, caption) {
  try {
    await send(chatId, "Descargando y analizando tu archivo...");
    var fileRes = await fetch(TG + "/getFile?file_id=" + fileId);
    var fileData = await fileRes.json();
    if (!fileData.ok) { await send(chatId, "No pude obtener el archivo.", menuPrincipal()); return; }
    var fileUrl = "https://api.telegram.org/file/bot" + TOKEN + "/" + fileData.result.file_path;
    var downloadRes = await fetch(fileUrl);
    var buffer = Buffer.from(await downloadRes.arrayBuffer());
    var wb = XLSX.read(buffer, { type: "buffer" });
    var texto = "";
    wb.SheetNames.forEach(function(sheetName) {
      var ws = wb.Sheets[sheetName];
      var csv = XLSX.utils.sheet_to_csv(ws);
      if (csv.trim().length > 0) texto += "Hoja: " + sheetName + "\n" + csv.substring(0, 3000) + "\n\n";
    });
    if (!texto.trim()) { await send(chatId, "El archivo esta vacio.", menuPrincipal()); return; }
    var pregunta = caption || "Analiza este archivo financiero y dame un reporte completo.";
    var system = "Eres ContaBot, experto financiero para negocio de ropa de segunda mano en Mexico. Analiza los datos del archivo Excel en espanol con emojis. Incluye: totales de ingresos, gastos, utilidad neta, mes mas rentable, lugar con mas ventas, y 3 consejos para mejorar el negocio.";
    var r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: system, messages: [{ role: "user", content: pregunta + "\n\nDATOS:\n" + texto }] })
    });
    var d = await r.json();
    var reply = d.content.map(function(b) { return b.text || ""; }).join("") || "No pude analizar el archivo.";
    await send(chatId, reply, menuPrincipal());
  } catch(e) {
    console.error("Error archivo:", e.message);
    await send(chatId, "Error al analizar. Manda un archivo .xlsx o .csv", menuPrincipal());
  }
}

async function handleCallback(query) {
  var chatId=query.message.chat.id; var msgId=query.message.message_id; var data=query.data;
  await answerCallback(query.id);
  if(!sesion[chatId])sesion[chatId]={};
  var ses=sesion[chatId];
  if(data==="menu_inicio"){sesion[chatId]={};await editMsg(chatId,msgId,"Que deseas hacer?",menuPrincipal());return;}
  if(data==="menu_registrar"){ses.paso=null;await editMsg(chatId,msgId,"Que vas a registrar?",btnTipo());return;}
  if(data==="menu_inventario"){var inv=await getInventario(chatId);await editMsg(chatId,msgId,"Inventario: *"+inv+" piezas*\n\nQue deseas hacer?",btnInventario());return;}
  if(data==="menu_excel"){await editMsg(chatId,msgId,"Generando tu Excel...");await generarExcel(chatId);await send(chatId,"Que deseas hacer?",menuPrincipal());return;}
  if(data==="menu_resumen"){var txt=await textoResumenMes(chatId);await editMsg(chatId,msgId,txt,menuPrincipal());return;}
  if(data==="menu_semanal"){var txt=await textoResumenSemanal(chatId);await editMsg(chatId,msgId,txt,menuPrincipal());return;}
  if(data==="menu_comparar"){var txt=await textoComparacion(chatId);await editMsg(chatId,msgId,txt,menuPrincipal());return;}
  if(data==="menu_prediccion"){var txt=await textoPrediccion(chatId);await editMsg(chatId,msgId,txt,menuPrincipal());return;}
  if(data==="menu_empleada"){await editMsg(chatId,msgId,EMPLEADA_ID?"Tu empleada esta conectada.":"Tu empleada aun no esta conectada.\n\nPide que le escriba /start al bot y mandame su Chat ID.",menuPrincipal());return;}
  if(data==="menu_eliminar"){
    var regs=await getRegistros(chatId);
    if(regs.length===0){await editMsg(chatId,msgId,"No hay registros para eliminar.",menuPrincipal());return;}
    var ultimo=regs[0];
    var emoji=ultimo.tipo==="venta"?"💰":ultimo.tipo==="compra"?"🛍":"💸";
    var msg=emoji+" *Ultimo registro:*\n\nConcepto: "+ultimo.desc+"\nMonto: $"+(parseFloat(ultimo.monto)||0).toLocaleString("es")+"\nFecha: "+ultimo.fecha+"\nMes: "+ultimo.mes+"\n\n*Quieres eliminarlo?*";
    await editMsg(chatId,msgId,msg,{inline_keyboard:[[{text:"✅ Si, eliminar",callback_data:"confirmar_eliminar"},{text:"❌ No, cancelar",callback_data:"menu_inicio"}]]});
    return;
  }
  if(data==="confirmar_eliminar"){
    var regs=await getRegistros(chatId);
    if(regs.length===0){await editMsg(chatId,msgId,"No hay registros.",menuPrincipal());return;}
    var ultimo=regs[0];
    if(dbOk){
      try{
        await pool.query("DELETE FROM registros WHERE chat_id=$1 AND id=(SELECT id FROM registros WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 1)",[String(chatId)]);
      }catch(e){
        // Si falla DB, eliminar de memoria
        if(memDatos[chatId]&&memDatos[chatId].length>0) memDatos[chatId].shift();
      }
    } else {
      if(memDatos[chatId]&&memDatos[chatId].length>0) memDatos[chatId].shift();
    }
    var emoji=ultimo.tipo==="venta"?"💰":ultimo.tipo==="compra"?"🛍":"💸";
    await editMsg(chatId,msgId,emoji+" *Registro eliminado!*\n\n"+ultimo.desc+" - $"+(parseFloat(ultimo.monto)||0).toLocaleString("es"),menuPrincipal());
    return;
  }
  if(data==="inv_ver"){var inv=await getInventario(chatId);await editMsg(chatId,msgId,"Tienes *"+inv+" piezas* en inventario.",btnInventario());return;}
  if(data==="inv_agregar"){ses.paso="inv_piezas";await editMsg(chatId,msgId,"Cuantas piezas vas a agregar?");return;}
  if(data==="atras_tipo"){ses.tipo=null;ses.concepto=null;ses.monto=null;ses.pago=null;ses.paso=null;await editMsg(chatId,msgId,"Que vas a registrar?",btnTipo());return;}
  if(data==="atras_concepto"){ses.concepto=null;ses.monto=null;ses.pago=null;ses.paso=null;var kb=ses.tipo==="ingreso"?btnConceptoIngreso():btnConceptoGasto();await editMsg(chatId,msgId,"Selecciona el concepto:",kb);return;}
  if(data==="tipo_ingreso"){ses.tipo="ingreso";ses.paso="concepto";await editMsg(chatId,msgId,"Tipo de ingreso:",btnConceptoIngreso());return;}
  if(data==="tipo_gasto"){ses.tipo="gasto";ses.paso="concepto";await editMsg(chatId,msgId,"Tipo de gasto:",btnConceptoGasto());return;}
  if(data.indexOf("concepto_")===0){ses.concepto=data.replace("concepto_","");ses.paso="monto";await editMsg(chatId,msgId,"Concepto: *"+ses.concepto+"*\n\nCuanto es el monto?");return;}
  if(data==="pago_efectivo"||data==="pago_transferencia"){
    ses.pago=data.replace("pago_","");
    var reg={fecha:getFecha(),mes:getMes(),tipo:ses.tipo==="ingreso"?"venta":"gasto",desc:ses.concepto,monto:ses.monto,pago:ses.pago,lugar:null};
    await saveRegistro(chatId,reg);
    var regs=await getRegistros(chatId);var s=await calcResumen(chatId,regs);
    if((s.compras+s.gastos)>s.ventas&&s.ventas>0)await send(chatId,"ALERTA: Tus gastos superan tus ventas!");
    var emoji=ses.tipo==="ingreso"?"💰":"💸";
    var confirmMsg=emoji+" *Registrado!*\n\nConcepto: "+ses.concepto+"\nMonto: $"+ses.monto.toLocaleString("es")+"\nPago: "+ses.pago+"\nFecha: "+getFecha()+"\nMes: "+getMes();
    sesion[chatId]={};await editMsg(chatId,msgId,confirmMsg,menuPrincipal());return;
  }
}

async function handleTexto(chatId, text) {
  var ses=sesion[chatId]||{};
  if(ses.paso==="monto"){
    var num=parseFloat(text.replace(/[$,\s]/g,""));
    if(isNaN(num)||num<=0){await send(chatId,"Escribe solo el numero. Ejemplo: 3500");return true;}
    ses.monto=num;ses.paso="pago";await send(chatId,"Monto: *$"+num.toLocaleString("es")+"*\n\nComo fue el pago?",btnPago());return true;
  }
  if(ses.paso==="inv_piezas"){
    var piezas=parseInt(text.replace(/[,\s]/g,""));
    if(isNaN(piezas)||piezas<=0){await send(chatId,"Escribe solo el numero. Ejemplo: 50");return true;}
    ses.piezas=piezas;ses.paso="inv_costo";await send(chatId,"Piezas: *"+piezas+"*\n\nCuanto costaron en total?");return true;
  }
  if(ses.paso==="inv_costo"){
    var costo=parseFloat(text.replace(/[$,\s]/g,""));
    if(isNaN(costo)||costo<=0){await send(chatId,"Escribe solo el monto. Ejemplo: 4500");return true;}
    var invActual=await getInventario(chatId);
    await setInventario(chatId,invActual+ses.piezas);
    await saveRegistro(chatId,{fecha:getFecha(),mes:getMes(),tipo:"compra",desc:"Compra mercancia "+ses.piezas+" piezas",monto:costo,pago:"efectivo",lugar:null});
    sesion[chatId]={};await send(chatId,"Inventario actualizado!\n\nPiezas agregadas: "+ses.piezas+"\nCosto: $"+costo.toLocaleString("es")+"\nInventario total: "+(invActual+ses.piezas)+" piezas",menuPrincipal());return true;
  }
  return false;
}

async function claude(chatId, msg) {
  var regs=await getRegistros(chatId); var inv=await getInventario(chatId); var historial=await getHistorial(chatId);
  var s=await calcResumen(chatId,regs);
  var resumen=regs.slice(0,30).map(function(r){return r.fecha+"|"+r.tipo+"|"+r.desc+"|$"+r.monto+"|"+(r.pago||"");}).join("\n");
  var system="Eres ContaBot, asistente financiero para negocio de ropa de segunda mano en Mexico. Hablas en espanol mexicano casual con emojis.\n\nNEGOCIO:\n- Inventario: "+inv+" piezas\n- Ventas mes: $"+s.ventas.toLocaleString("es")+"\n- Gastos mes: $"+(s.compras+s.gastos).toLocaleString("es")+"\n- Utilidad: $"+s.utilidad.toLocaleString("es")+"\n- Mes: "+getMes()+"\n\nREGISTROS:\n"+(resumen||"Sin registros")+"\n\nCuando detectes un registro natural (gaste X, vendi X, me depositaron X), confirma y agrega al final exactamente: REGISTRO:{\"tipo\":\"gasto\",\"desc\":\"descripcion\",\"monto\":numero,\"pago\":\"efectivo\"}\n\nResponde preguntas financieras con analisis y consejos practicos.";
  var messages=historial.concat([{role:"user",content:msg}]);
  var r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:system,messages:messages})});
  var d=await r.json();
  var reply=d.content.map(function(b){return b.text||"";}).join("")||"Error";
  await saveHistorial(chatId,"user",msg);
  await saveHistorial(chatId,"assistant",reply);
  var match=reply.match(/REGISTRO:\s*(\{[^}]+\})/);
  if(match){
    try{
      var reg=JSON.parse(match[1]);
      await saveRegistro(chatId,{fecha:getFecha(),mes:getMes(),tipo:reg.tipo==="venta"?"venta":reg.tipo==="ingreso"?"venta":"gasto",desc:reg.desc,monto:reg.monto,pago:reg.pago||"efectivo",lugar:reg.lugar||null});
    }catch(e){}
    reply=reply.replace(/REGISTRO:\s*\{[^}]+\}/,"").trim();
  }
  return reply;
}

async function generarExcel(id) {
  var registros=await getRegistros(id);
  var wb=new ExcelJS.Workbook(); var ws=wb.addWorksheet("Ingresos y Gastos");
  var GM="217346";var GD="1A5C38";var RD="8B0000";var BD="1F3864";var BM="2E75B6";var BL="DEEAF1";var DG="2D2D2D";var W="FFFFFF";var BC="BFBFBF";
  ws.columns=[{key:"a",width:14},{key:"b",width:10},{key:"c",width:18},{key:"d",width:13},{key:"e",width:2},{key:"f",width:12},{key:"g",width:13},{key:"h",width:13},{key:"i",width:13},{key:"j",width:2},{key:"k",width:14},{key:"l",width:10},{key:"m",width:22},{key:"n",width:13}];
  function thin(){var s={style:"thin",color:{argb:"FF"+BC}};return{top:s,bottom:s,left:s,right:s};}
  function thick(c){var s={style:"medium",color:{argb:"FF"+(c||DG)}};return{top:s,bottom:s,left:s,right:s};}
  function solid(h){return{type:"pattern",pattern:"solid",fgColor:{argb:"FF"+h}};}
  function ctr(){return{horizontal:"center",vertical:"middle"};}
  function lft(){return{horizontal:"left",vertical:"middle"};}
  function rgt(){return{horizontal:"right",vertical:"middle"};}
  function hf(c){return{name:"Arial",bold:true,size:10,color:{argb:"FF"+(c||W)}};}
  function df(){return{name:"Arial",size:10};}
  ws.getRow(2).height=36;ws.getRow(3).height=18;ws.getRow(4).height=34;ws.getRow(5).height=28;ws.getRow(6).height=28;
  for(var r=7;r<=206;r++)ws.getRow(r).height=20;
  ws.mergeCells("A2:N2");var t=ws.getCell("A2");t.value="TABLA DE INGRESOS Y GASTOS - "+getMes().toUpperCase();t.font={name:"Arial",bold:true,size:16,color:{argb:"FF"+W}};t.fill=solid(DG);t.alignment=ctr();t.border=thick(DG);
  var s=await calcResumen(id,registros);
  ws.mergeCells("A3:D3");var lI=ws.getCell("A3");lI.value="TOTAL INGRESOS";lI.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+GD}};lI.fill=solid("EBF5EB");lI.alignment=ctr();lI.border=thin();
  ws.mergeCells("F3:I3");var lG=ws.getCell("F3");lG.value="GANANCIA / PERDIDA";lG.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+BD}};lG.fill=solid("EBF3FB");lG.alignment=ctr();lG.border=thin();
  ws.mergeCells("K3:N3");var lE=ws.getCell("K3");lE.value="TOTAL GASTOS";lE.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+RD}};lE.fill=solid("FCEAEA");lE.alignment=ctr();lE.border=thin();
  ws.mergeCells("A4:D4");var tI=ws.getCell("A4");tI.value=s.ventas;tI.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+W}};tI.fill=solid(GM);tI.alignment=ctr();tI.numFmt="$#,##0.00";tI.border=thick(GD);
  ws.mergeCells("F4:I4");var tG=ws.getCell("F4");tG.value=s.utilidad;tG.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+W}};tG.fill=solid(BM);tG.alignment=ctr();tG.numFmt="$#,##0.00";tG.border=thick(BD);
  ws.mergeCells("K4:N4");var tE=ws.getCell("K4");tE.value=s.compras+s.gastos;tE.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+W}};tE.fill=solid(RD);tE.alignment=ctr();tE.numFmt="$#,##0.00";tE.border=thick(RD);
  ws.mergeCells("A5:D5");var sI=ws.getCell("A5");sI.value="INGRESOS";sI.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+W}};sI.fill=solid(GD);sI.alignment=ctr();sI.border=thick(GD);
  ws.mergeCells("F5:I5");var sR=ws.getCell("F5");sR.value="RESUMEN SEMANAL";sR.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+W}};sR.fill=solid(BD);sR.alignment=ctr();sR.border=thick(BD);
  ws.mergeCells("K5:N5");var sE=ws.getCell("K5");sE.value="GASTOS";sE.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+W}};sE.fill=solid(RD);sE.alignment=ctr();sE.border=thick(RD);
  [["A","Fecha"],["B","Mes"],["C","Concepto"],["D","Valor"]].forEach(function(h){var c=ws.getCell(h[0]+"6");c.value=h[1];c.font=hf(W);c.fill=solid(GM);c.alignment=ctr();c.border=thin();});
  [["F","Semana"],["G","Ingresos"],["H","Gastos"],["I","Resultado"]].forEach(function(h){var c=ws.getCell(h[0]+"6");c.value=h[1];c.font=hf(W);c.fill=solid(BM);c.alignment=ctr();c.border=thin();});
  [["K","Fecha"],["L","Mes"],["M","Descripcion"],["N","Valor"]].forEach(function(h){var c=ws.getCell(h[0]+"6");c.value=h[1];c.font=hf(W);c.fill=solid("C00000");c.alignment=ctr();c.border=thin();});
  var ventas=registros.filter(function(r){return r.tipo==="venta";});
  var gasts=registros.filter(function(r){return r.tipo!=="venta";});
  var maxR=Math.max(ventas.length,gasts.length,30);
  for(var ri=0;ri<maxR;ri++){
    var er=ri+7;var even=ri%2===0;var fg=even?"F5FBF5":"FFFFFF";var fr=even?"FEF5F5":"FFFFFF";
    if(ri<ventas.length){var v=ventas[ri];var c1=ws.getRow(er).getCell(1);c1.value=v.fecha;c1.font=df();c1.fill=solid(fg);c1.alignment=ctr();c1.border=thin();var c2=ws.getRow(er).getCell(2);c2.value=v.mes||"";c2.font=df();c2.fill=solid(fg);c2.alignment=ctr();c2.border=thin();var c3=ws.getRow(er).getCell(3);c3.value=v.desc;c3.font=df();c3.fill=solid(fg);c3.alignment=lft();c3.border=thin();var c4=ws.getRow(er).getCell(4);c4.value=parseFloat(v.monto)||0;c4.font=df();c4.fill=solid(fg);c4.alignment=rgt();c4.numFmt="$#,##0.00";c4.border=thin();}
    else{for(var cc=1;cc<=4;cc++){var ec=ws.getRow(er).getCell(cc);ec.fill=solid(fg);ec.border=thin();}}
    if(ri<gasts.length){var g=gasts[ri];var g1=ws.getRow(er).getCell(11);g1.value=g.fecha;g1.font=df();g1.fill=solid(fr);g1.alignment=ctr();g1.border=thin();var g2=ws.getRow(er).getCell(12);g2.value=g.mes||"";g2.font=df();g2.fill=solid(fr);g2.alignment=ctr();g2.border=thin();var g3=ws.getRow(er).getCell(13);g3.value=g.desc;g3.font=df();g3.fill=solid(fr);g3.alignment=lft();g3.border=thin();var g4=ws.getRow(er).getCell(14);g4.value=parseFloat(g.monto)||0;g4.font=df();g4.fill=solid(fr);g4.alignment=rgt();g4.numFmt="$#,##0.00";g4.border=thin();}
    else{for(var cc=11;cc<=14;cc++){var ec=ws.getRow(er).getCell(cc);ec.fill=solid(fr);ec.border=thin();}}
  }
  [{label:"1a Semana",ini:1,fin:7,row:7},{label:"2a Semana",ini:8,fin:14,row:10},{label:"3a Semana",ini:15,fin:21,row:13},{label:"4a Semana",ini:22,fin:31,row:16}].forEach(function(sem){
    var sIng=ventas.filter(function(r){try{var d=new Date(r.fecha.split("/").reverse().join("-"));return d.getDate()>=sem.ini&&d.getDate()<=sem.fin;}catch(e){return false;}}).reduce(function(s,r){return s+(parseFloat(r.monto)||0);},0);
    var sGas=gasts.filter(function(r){try{var d=new Date(r.fecha.split("/").reverse().join("-"));return d.getDate()>=sem.ini&&d.getDate()<=sem.fin;}catch(e){return false;}}).reduce(function(s,r){return s+(parseFloat(r.monto)||0);},0);
    var sRes=sIng-sGas;
    ws.mergeCells("F"+sem.row+":F"+(sem.row+2));
    var sL=ws.getCell("F"+sem.row);sL.value=sem.label;sL.font={name:"Arial",bold:true,size:10,color:{argb:"FF"+BD}};sL.fill=solid(BL);sL.alignment=ctr();sL.border=thin();
    var sI2=ws.getCell("G"+sem.row);sI2.value=sIng;sI2.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+GD}};sI2.fill=solid(BL);sI2.alignment=ctr();sI2.numFmt="$#,##0.00";sI2.border=thin();
    var sG2=ws.getCell("H"+sem.row);sG2.value=sGas;sG2.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+RD}};sG2.fill=solid(BL);sG2.alignment=ctr();sG2.numFmt="$#,##0.00";sG2.border=thin();
    var sR2=ws.getCell("I"+sem.row);sR2.value=sRes;sR2.font={name:"Arial",bold:true,size:11,color:{argb:sRes>=0?"FF"+GD:"FF"+RD}};sR2.fill=solid(BL);sR2.alignment=ctr();sR2.numFmt="$#,##0.00";sR2.border=thin();
    for(var ex=sem.row+1;ex<=sem.row+2;ex++){for(var col=7;col<=9;col++){var ec=ws.getRow(ex).getCell(col);ec.fill=solid(BL);ec.border=thin();}}
  });
  var tr=ws.getRow(20);
  var tf=tr.getCell(6);tf.value="TOTAL MES";tf.font={name:"Arial",bold:true,size:10,color:{argb:"FF"+W}};tf.fill=solid(BD);tf.alignment=ctr();tf.border=thin();
  var tg=tr.getCell(7);tg.value=s.ventas;tg.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+W}};tg.fill=solid(GD);tg.alignment=ctr();tg.numFmt="$#,##0.00";tg.border=thin();
  var th=tr.getCell(8);th.value=s.compras+s.gastos;th.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+W}};th.fill=solid(RD);th.alignment=ctr();th.numFmt="$#,##0.00";th.border=thin();
  var ti=tr.getCell(9);ti.value=s.utilidad;ti.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+W}};ti.fill=solid(BM);ti.alignment=ctr();ti.numFmt="$#,##0.00";ti.border=thin();
  ws.views=[{state:"frozen",ySplit:6}];
  var buffer=await wb.xlsx.writeBuffer();
  var now2=new Date().toLocaleDateString("es").replace(/\//g,"-");
  var filename="ContaBot_"+now2+".xlsx";
  var fd=new FormData();
  fd.append("chat_id",String(id));
  fd.append("document",buffer,{filename:filename,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  return new Promise(function(resolve,reject){
    var https=require("https");
    var req=https.request({hostname:"api.telegram.org",path:"/bot"+TOKEN+"/sendDocument",method:"POST",headers:fd.getHeaders()},function(res){res.on("data",function(){});res.on("end",resolve);});
    req.on("error",reject);fd.pipe(req);
  });
}

function programarTareas() {
  var ahora=new Date();
  var finMes=new Date(ahora.getFullYear(),ahora.getMonth()+1,1,8,0,0);
  setTimeout(function(){send(CHAT_ID,"Reporte mensual! Generando tu Excel...").then(function(){return generarExcel(CHAT_ID);}).then(function(){programarTareas();});},finMes-ahora);
  var diasLunes=(8-ahora.getDay())%7||7;
  var lunes=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate()+diasLunes,8,0,0);
  setTimeout(function(){textoResumenSemanal(CHAT_ID).then(function(txt){send(CHAT_ID,txt,menuPrincipal());});setInterval(function(){textoResumenSemanal(CHAT_ID).then(function(txt){send(CHAT_ID,txt,menuPrincipal());});},7*24*60*60*1000);},lunes-ahora);
  var pm7=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate(),19,0,0);
  var d7=pm7>ahora?pm7-ahora:(24*60*60*1000)-(ahora-pm7);
  setTimeout(function(){send(CHAT_ID,"Hola! No olvides registrar tus ventas de hoy.",menuPrincipal());setInterval(function(){send(CHAT_ID,"Hola! No olvides registrar tus ventas de hoy.",menuPrincipal());},24*60*60*1000);},d7);
}

app.post("/webhook",async function(req,res){
  res.sendStatus(200);
  try{
    var body=req.body;
    if(body.callback_query){await handleCallback(body.callback_query);return;}
    var m=body.message;
    if(!m)return;
    // Manejar archivos
    if(m.document) {
      var id=m.chat.id;
      var autorizado=String(id)===String(CHAT_ID)||(EMPLEADA_ID&&String(id)===String(EMPLEADA_ID));
      if(!autorizado){await send(id,"No tienes acceso.");return;}
      var doc=m.document;
      var nombre=doc.file_name||"";
      if(nombre.endsWith(".xlsx")||nombre.endsWith(".xls")||nombre.endsWith(".csv")) {
        await analizarArchivo(id, doc.file_id, m.caption);
      } else {
        await send(id,"Solo puedo analizar archivos .xlsx o .csv. Exporta tu archivo Numbers como Excel primero.",menuPrincipal());
      }
      return;
    }
    if(!m.text)return;
    var id=m.chat.id;var text=m.text;
    var autorizado=String(id)===String(CHAT_ID)||(EMPLEADA_ID&&String(id)===String(EMPLEADA_ID));
    if(!autorizado){await send(id,"No tienes acceso a este bot.");return;}
    if(text==="/start"||text==="/menu"){await send(id,"Hola! Soy *ContaBot* tu contador inteligente. Que deseas hacer?",menuPrincipal());return;}
    if(text==="/reset"){await deleteHistorial(id);sesion[id]={};await send(id,"Historial limpiado!",menuPrincipal());return;}
    var handled=await handleTexto(id,text);
    if(!handled){var reply=await claude(id,text);await send(id,reply,menuPrincipal());}
  }catch(e){console.error(e);}
});

app.get("/",function(req,res){res.send("ContaBot OK - DB:"+(dbOk?"conectada":"memoria"));});
var PORT=process.env.PORT||8080;
app.listen(PORT,async function(){
  console.log("Puerto "+PORT);
  await initDB();
  programarTareas();
});
