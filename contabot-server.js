const express = require("express");
const ExcelJS = require("exceljs");
const FormData = require("form-data");
const app = express();
app.use(express.json());

const TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const KEY = process.env.ANTHROPIC_API_KEY;
const TG = "https://api.telegram.org/bot" + TOKEN;
const datos = {};
const hist = {};
const inventario = {};
const sesion = {};
const CHAT_ID = "5786549088";

async function send(id, text, keyboard) {
  var body = { chat_id: id, text: text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(TG + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function editMsg(chatId, msgId, text, keyboard) {
  var body = { chat_id: chatId, message_id: msgId, text: text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(TG + "/editMessageText", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallback(callbackId, text) {
  await fetch(TG + "/answerCallbackQuery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: text || "" }),
  });
}

function btnTipo() {
  return {
    inline_keyboard: [
      [
        { text: "💰 Ingreso", callback_data: "tipo_ingreso" },
        { text: "💸 Gasto", callback_data: "tipo_gasto" }
      ]
    ]
  };
}

function btnConceptoIngreso() {
  return {
    inline_keyboard: [
      [{ text: "🛍 Venta San Luis", callback_data: "concepto_Venta San Luis" }],
      [{ text: "🛍 Venta Victoria", callback_data: "concepto_Venta Victoria" }],
      [{ text: "🛍 Venta Santa", callback_data: "concepto_Venta Santa" }],
      [{ text: "🛍 Venta Mision", callback_data: "concepto_Venta Mision" }],
      [{ text: "💵 Prestamo", callback_data: "concepto_Prestamo" }],
      [{ text: "🔙 Atras", callback_data: "atras_tipo" }]
    ]
  };
}

function btnConceptoGasto() {
  return {
    inline_keyboard: [
      [{ text: "⛽ Gasolina", callback_data: "concepto_Gasolina" }],
      [{ text: "👗 Compra mercancia", callback_data: "concepto_Compra mercancia" }],
      [{ text: "🏠 Renta", callback_data: "concepto_Renta" }],
      [{ text: "💼 Sueldo propio", callback_data: "concepto_Sueldo propio" }],
      [{ text: "👤 Sueldo empleado", callback_data: "concepto_Sueldo empleado" }],
      [{ text: "💳 Abono prestamo", callback_data: "concepto_Abono prestamo" }],
      [{ text: "🔙 Atras", callback_data: "atras_tipo" }]
    ]
  };
}

function btnPago() {
  return {
    inline_keyboard: [
      [
        { text: "💵 Efectivo", callback_data: "pago_efectivo" },
        { text: "📲 Transferencia", callback_data: "pago_transferencia" }
      ],
      [{ text: "🔙 Atras", callback_data: "atras_concepto" }]
    ]
  };
}

function getFecha() {
  return new Date().toLocaleDateString("es");
}

function getMes() {
  var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return meses[new Date().getMonth()];
}

function guardarRegistro(chatId, ses) {
  if (!datos[chatId]) datos[chatId] = [];
  var tipo = ses.tipo === "ingreso" ? "venta" : "gasto";
  datos[chatId].push({
    fecha: getFecha(),
    mes: getMes(),
    tipo: tipo,
    desc: ses.concepto,
    monto: ses.monto,
    pago: ses.pago,
    lugar: null,
  });
  var v = 0, g = 0;
  datos[chatId].forEach(function(r) {
    if (r.tipo === "venta") v += r.monto; else g += r.monto;
  });
  if (g > v && v > 0) send(chatId, "⚠️ ALERTA: Tus gastos ($" + g + ") superan tus ventas ($" + v + ")!");
}

async function handleCallback(query) {
  var chatId = query.message.chat.id;
  var msgId = query.message.message_id;
  var data = query.data;
  await answerCallback(query.id);

  if (!sesion[chatId]) sesion[chatId] = {};
  var ses = sesion[chatId];

  if (data === "atras_tipo") {
    ses.tipo = null; ses.concepto = null; ses.monto = null; ses.pago = null; ses.paso = null;
    await editMsg(chatId, msgId, "Que vas a registrar hoy?", btnTipo());
    return;
  }

  if (data === "atras_concepto") {
    ses.concepto = null; ses.monto = null; ses.pago = null; ses.paso = null;
    var kb = ses.tipo === "ingreso" ? btnConceptoIngreso() : btnConceptoGasto();
    await editMsg(chatId, msgId, "Selecciona el concepto:", kb);
    return;
  }

  if (data === "tipo_ingreso") {
    ses.tipo = "ingreso"; ses.paso = "concepto";
    await editMsg(chatId, msgId, "Selecciona el tipo de ingreso:", btnConceptoIngreso());
    return;
  }

  if (data === "tipo_gasto") {
    ses.tipo = "gasto"; ses.paso = "concepto";
    await editMsg(chatId, msgId, "Selecciona el tipo de gasto:", btnConceptoGasto());
    return;
  }

  if (data.indexOf("concepto_") === 0) {
    ses.concepto = data.replace("concepto_", "");
    ses.paso = "monto";
    await editMsg(chatId, msgId, "Concepto: *" + ses.concepto + "*\n\nCuanto es el monto? Escribe el numero:");
    return;
  }

  if (data === "pago_efectivo" || data === "pago_transferencia") {
    ses.pago = data.replace("pago_", "");
    guardarRegistro(chatId, ses);
    var emoji = ses.tipo === "ingreso" ? "💰" : "💸";
    var msg = emoji + " *Registrado!*\n\n" +
      "Concepto: " + ses.concepto + "\n" +
      "Monto: $" + ses.monto.toLocaleString("es") + "\n" +
      "Pago: " + ses.pago + "\n" +
      "Fecha: " + getFecha() + "\n" +
      "Mes: " + getMes() + "\n\n" +
      "Usa /registrar para agregar otro registro.";
    sesion[chatId] = {};
    await editMsg(chatId, msgId, msg);
    return;
  }
}

async function handleMonto(chatId, text) {
  var ses = sesion[chatId];
  if (!ses || ses.paso !== "monto") return false;
  var num = parseFloat(text.replace(/[$,\s]/g, ""));
  if (isNaN(num) || num <= 0) {
    await send(chatId, "Por favor escribe solo el numero. Ejemplo: 3500");
    return true;
  }
  ses.monto = num;
  ses.paso = "pago";
  await send(chatId, "Monto: *$" + num.toLocaleString("es") + "*\n\nComo fue el pago?", btnPago());
  return true;
}

async function generarExcel(id) {
  var registros = datos[id] || [];
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet("Ingresos y Gastos");

  var GREEN_MED = "217346"; var GREEN_DARK = "1A5C38"; var RED_DARK = "8B0000";
  var BLUE_DARK = "1F3864"; var BLUE_MED = "2E75B6"; var BLUE_LIGHT = "DEEAF1";
  var DARK_GRAY = "2D2D2D"; var WHITE = "FFFFFF"; var BORDER_CLR = "BFBFBF";

  ws.columns = [
    {key:"a",width:14},{key:"b",width:10},{key:"c",width:18},{key:"d",width:13},
    {key:"e",width:2},{key:"f",width:12},{key:"g",width:13},{key:"h",width:13},
    {key:"i",width:13},{key:"j",width:2},{key:"k",width:14},{key:"l",width:10},
    {key:"m",width:22},{key:"n",width:13},
  ];

  function thin(){var s={style:"thin",color:{argb:"FF"+BORDER_CLR}};return{top:s,bottom:s,left:s,right:s};}
  function thick(c){var s={style:"medium",color:{argb:"FF"+(c||DARK_GRAY)}};return{top:s,bottom:s,left:s,right:s};}
  function solid(h){return{type:"pattern",pattern:"solid",fgColor:{argb:"FF"+h}};}
  function ctr(){return{horizontal:"center",vertical:"middle"};}
  function lft(){return{horizontal:"left",vertical:"middle"};}
  function rgt(){return{horizontal:"right",vertical:"middle"};}
  function hf(c){return{name:"Arial",bold:true,size:10,color:{argb:"FF"+(c||WHITE)}};}
  function df(){return{name:"Arial",size:10};}

  ws.getRow(2).height=36;ws.getRow(3).height=18;ws.getRow(4).height=34;
  ws.getRow(5).height=28;ws.getRow(6).height=28;
  for(var r=7;r<=206;r++)ws.getRow(r).height=20;

  ws.mergeCells("A2:N2");
  var t=ws.getCell("A2");
  t.value="TABLA DE INGRESOS Y GASTOS";
  t.font={name:"Arial",bold:true,size:16,color:{argb:"FF"+WHITE}};
  t.fill=solid(DARK_GRAY);t.alignment=ctr();t.border=thick(DARK_GRAY);

  var ingresos=registros.filter(function(r){return r.tipo==="venta";}).reduce(function(s,r){return s+r.monto;},0);
  var gastos=registros.filter(function(r){return r.tipo!=="venta";}).reduce(function(s,r){return s+r.monto;},0);
  var ganancia=ingresos-gastos;

  ws.mergeCells("A3:D3");var lI=ws.getCell("A3");lI.value="TOTAL INGRESOS";lI.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+GREEN_DARK}};lI.fill=solid("EBF5EB");lI.alignment=ctr();lI.border=thin();
  ws.mergeCells("F3:I3");var lG=ws.getCell("F3");lG.value="GANANCIA / PERDIDA";lG.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+BLUE_DARK}};lG.fill=solid("EBF3FB");lG.alignment=ctr();lG.border=thin();
  ws.mergeCells("K3:N3");var lE=ws.getCell("K3");lE.value="TOTAL GASTOS";lE.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+RED_DARK}};lE.fill=solid("FCEAEA");lE.alignment=ctr();lE.border=thin();

  ws.mergeCells("A4:D4");var tI=ws.getCell("A4");tI.value=ingresos;tI.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+WHITE}};tI.fill=solid(GREEN_MED);tI.alignment=ctr();tI.numFmt="$#,##0.00";tI.border=thick(GREEN_DARK);
  ws.mergeCells("F4:I4");var tG=ws.getCell("F4");tG.value=ganancia;tG.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+WHITE}};tG.fill=solid(BLUE_MED);tG.alignment=ctr();tG.numFmt="$#,##0.00";tG.border=thick(BLUE_DARK);
  ws.mergeCells("K4:N4");var tE=ws.getCell("K4");tE.value=gastos;tE.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+WHITE}};tE.fill=solid(RED_DARK);tE.alignment=ctr();tE.numFmt="$#,##0.00";tE.border=thick(RED_DARK);

  ws.mergeCells("A5:D5");var sI=ws.getCell("A5");sI.value="INGRESOS";sI.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};sI.fill=solid(GREEN_DARK);sI.alignment=ctr();sI.border=thick(GREEN_DARK);
  ws.mergeCells("F5:I5");var sR=ws.getCell("F5");sR.value="RESUMEN SEMANAL";sR.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};sR.fill=solid(BLUE_DARK);sR.alignment=ctr();sR.border=thick(BLUE_DARK);
  ws.mergeCells("K5:N5");var sE=ws.getCell("K5");sE.value="GASTOS";sE.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};sE.fill=solid(RED_DARK);sE.alignment=ctr();sE.border=thick(RED_DARK);

  [["A","Fecha"],["B","Mes"],["C","Concepto"],["D","Valor"]].forEach(function(h){var c=ws.getCell(h[0]+"6");c.value=h[1];c.font=hf(WHITE);c.fill=solid(GREEN_MED);c.alignment=ctr();c.border=thin();});
  [["F","Semana"],["G","Ingresos"],["H","Gastos"],["I","Resultado"]].forEach(function(h){var c=ws.getCell(h[0]+"6");c.value=h[1];c.font=hf(WHITE);c.fill=solid(BLUE_MED);c.alignment=ctr();c.border=thin();});
  [["K","Fecha"],["L","Mes"],["M","Descripcion"],["N","Valor"]].forEach(function(h){var c=ws.getCell(h[0]+"6");c.value=h[1];c.font=hf(WHITE);c.fill=solid("C00000");c.alignment=ctr();c.border=thin();});

  var ventas=registros.filter(function(r){return r.tipo==="venta";});
  var gasts=registros.filter(function(r){return r.tipo!=="venta";});
  var maxR=Math.max(ventas.length,gasts.length,30);

  for(var ri=0;ri<maxR;ri++){
    var er=ri+7;var even=ri%2===0;
    var fg=even?"F5FBF5":"FFFFFF";var fr=even?"FEF5F5":"FFFFFF";
    if(ri<ventas.length){
      var v=ventas[ri];
      var c1=ws.getRow(er).getCell(1);c1.value=v.fecha;c1.font=df();c1.fill=solid(fg);c1.alignment=ctr();c1.border=thin();
      var c2=ws.getRow(er).getCell(2);c2.value=v.mes||"";c2.font=df();c2.fill=solid(fg);c2.alignment=ctr();c2.border=thin();
      var c3=ws.getRow(er).getCell(3);c3.value=v.desc;c3.font=df();c3.fill=solid(fg);c3.alignment=lft();c3.border=thin();
      var c4=ws.getRow(er).getCell(4);c4.value=v.monto;c4.font=df();c4.fill=solid(fg);c4.alignment=rgt();c4.numFmt="$#,##0.00";c4.border=thin();
    }else{for(var cc=1;cc<=4;cc++){var ec=ws.getRow(er).getCell(cc);ec.fill=solid(fg);ec.border=thin();}}
    if(ri<gasts.length){
      var g=gasts[ri];
      var g1=ws.getRow(er).getCell(11);g1.value=g.fecha;g1.font=df();g1.fill=solid(fr);g1.alignment=ctr();g1.border=thin();
      var g2=ws.getRow(er).getCell(12);g2.value=g.mes||"";g2.font=df();g2.fill=solid(fr);g2.alignment=ctr();g2.border=thin();
      var g3=ws.getRow(er).getCell(13);g3.value=g.desc;g3.font=df();g3.fill=solid(fr);g3.alignment=lft();g3.border=thin();
      var g4=ws.getRow(er).getCell(14);g4.value=g.monto;g4.font=df();g4.fill=solid(fr);g4.alignment=rgt();g4.numFmt="$#,##0.00";g4.border=thin();
    }else{for(var cc=11;cc<=14;cc++){var ec=ws.getRow(er).getCell(cc);ec.fill=solid(fr);ec.border=thin();}}
  }

  [{label:"1a Semana",ini:1,fin:7,row:7},{label:"2a Semana",ini:8,fin:14,row:10},
   {label:"3a Semana",ini:15,fin:21,row:13},{label:"4a Semana",ini:22,fin:31,row:16}].forEach(function(sem){
    var sIng=ventas.filter(function(r){try{var d=new Date(r.fecha.split("/").reverse().join("-"));return d.getDate()>=sem.ini&&d.getDate()<=sem.fin;}catch(e){return false;}}).reduce(function(s,r){return s+r.monto;},0);
    var sGas=gasts.filter(function(r){try{var d=new Date(r.fecha.split("/").reverse().join("-"));return d.getDate()>=sem.ini&&d.getDate()<=sem.fin;}catch(e){return false;}}).reduce(function(s,r){return s+r.monto;},0);
    var sRes=sIng-sGas;
    ws.mergeCells("F"+sem.row+":F"+(sem.row+2));
    var sL=ws.getCell("F"+sem.row);sL.value=sem.label;sL.font={name:"Arial",bold:true,size:10,color:{argb:"FF"+BLUE_DARK}};sL.fill=solid(BLUE_LIGHT);sL.alignment=ctr();sL.border=thin();
    var sI2=ws.getCell("G"+sem.row);sI2.value=sIng;sI2.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+GREEN_DARK}};sI2.fill=solid(BLUE_LIGHT);sI2.alignment=ctr();sI2.numFmt="$#,##0.00";sI2.border=thin();
    var sG2=ws.getCell("H"+sem.row);sG2.value=sGas;sG2.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+RED_DARK}};sG2.fill=solid(BLUE_LIGHT);sG2.alignment=ctr();sG2.numFmt="$#,##0.00";sG2.border=thin();
    var sR2=ws.getCell("I"+sem.row);sR2.value=sRes;sR2.font={name:"Arial",bold:true,size:11,color:{argb:sRes>=0?"FF"+GREEN_DARK:"FF"+RED_DARK}};sR2.fill=solid(BLUE_LIGHT);sR2.alignment=ctr();sR2.numFmt="$#,##0.00";sR2.border=thin();
    for(var ex=sem.row+1;ex<=sem.row+2;ex++){for(var col=7;col<=9;col++){var ec=ws.getRow(ex).getCell(col);ec.fill=solid(BLUE_LIGHT);ec.border=thin();}}
  });

  var tr=ws.getRow(20);
  var tf=tr.getCell(6);tf.value="TOTAL MES";tf.font={name:"Arial",bold:true,size:10,color:{argb:"FF"+WHITE}};tf.fill=solid(BLUE_DARK);tf.alignment=ctr();tf.border=thin();
  var tg=tr.getCell(7);tg.value=ingresos;tg.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};tg.fill=solid(GREEN_DARK);tg.alignment=ctr();tg.numFmt="$#,##0.00";tg.border=thin();
  var th=tr.getCell(8);th.value=gastos;th.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};th.fill=solid(RED_DARK);th.alignment=ctr();th.numFmt="$#,##0.00";th.border=thin();
  var ti=tr.getCell(9);ti.value=ganancia;ti.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};ti.fill=solid(BLUE_MED);ti.alignment=ctr();ti.numFmt="$#,##0.00";ti.border=thin();

  ws.views=[{state:"frozen",ySplit:6}];

  var buffer=await wb.xlsx.writeBuffer();
  var now2=new Date().toLocaleDateString("es").replace(/\//g,"-");
  var filename="ContaBot_"+now2+".xlsx";
  var fd=new FormData();
  fd.append("chat_id",String(id));
  fd.append("document",buffer,{filename:filename,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});

  return new Promise(function(resolve,reject){
    var https=require("https");
    var req=https.request({hostname:"api.telegram.org",path:"/bot"+TOKEN+"/sendDocument",method:"POST",headers:fd.getHeaders()},function(res){
      res.on("data",function(){});res.on("end",resolve);
    });
    req.on("error",reject);
    fd.pipe(req);
  });
}

function detectarFecha(msg){
  var low=msg.toLowerCase();var fecha=new Date();
  if(low.indexOf("ayer")>=0){fecha.setDate(fecha.getDate()-1);}
  else if(low.indexOf("lunes")>=0){fecha.setDate(fecha.getDate()-((fecha.getDay()+6)%7));}
  else if(low.indexOf("martes")>=0){fecha.setDate(fecha.getDate()-((fecha.getDay()+5)%7));}
  else if(low.indexOf("miercoles")>=0){fecha.setDate(fecha.getDate()-((fecha.getDay()+4)%7));}
  else if(low.indexOf("jueves")>=0){fecha.setDate(fecha.getDate()-((fecha.getDay()+3)%7));}
  else if(low.indexOf("viernes")>=0){fecha.setDate(fecha.getDate()-((fecha.getDay()+2)%7));}
  else if(low.indexOf("sabado")>=0){fecha.setDate(fecha.getDate()-((fecha.getDay()+1)%7));}
  else if(low.indexOf("domingo")>=0){fecha.setDate(fecha.getDate()-(fecha.getDay()%7));}
  return fecha.toLocaleDateString("es");
}

function detectarMonto(msg){
  var matches=msg.match(/\$\s*([\d,]+)|([\d]{3,})/g);
  if(!matches)return 0;
  var nums=matches.map(function(n){return parseInt(n.replace(/[$,\s]/g,""));});
  return Math.max.apply(null,nums);
}

function detectarPiezas(msg){var match=msg.match(/(\d+)\s*(piez|prend|ropa|camis|pantal|blus|vestid)/i);return match?parseInt(match[1]):0;}
function detectarLugar(msg){var low=msg.toLowerCase();var lugares=["victoria","juarez","reforma","centro","mercado","tianguis","plaza","bodega","salon","expo","santa","mision","san luis"];for(var i=0;i<lugares.length;i++){if(low.indexOf(lugares[i])>=0)return lugares[i];}return null;}
function detectarPago(msg){var low=msg.toLowerCase();if(low.indexOf("transfer")>=0||low.indexOf("deposi")>=0||low.indexOf("oxxo")>=0)return "transferencia";return "efectivo";}
function detectarMes(msg){var meses=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];var low=msg.toLowerCase();for(var i=0;i<meses.length;i++){if(low.indexOf(meses[i])>=0)return meses[i];}return meses[new Date().getMonth()];}

async function claude(chatId,msg){
  if(!hist[chatId])hist[chatId]=[];
  if(!datos[chatId])datos[chatId]=[];
  if(!inventario[chatId])inventario[chatId]=0;
  hist[chatId].push({role:"user",content:msg});
  if(hist[chatId].length>30)hist[chatId]=hist[chatId].slice(-30);
  var resumen=datos[chatId].slice(-50).map(function(r){return r.fecha+" "+r.tipo+" "+(r.lugar||"")+" "+(r.pago||"")+": $"+r.monto;}).join("\n");
  var system="Eres ContaBot, contador para negocio de ropa de segunda mano. Registra ventas por lugar y tipo de pago. Inventario: "+inventario[chatId]+" piezas. Usa emojis y Markdown de Telegram.\n\nREGISTROS:\n"+(resumen||"Sin registros");
  var r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:system,messages:hist[chatId]})});
  var d=await r.json();
  var reply=d.content.map(function(b){return b.text||"";}).join("")||"Error";
  hist[chatId].push({role:"assistant",content:reply});
  var low=msg.toLowerCase();var monto=detectarMonto(msg);var now=detectarFecha(msg);
  var piezas=detectarPiezas(msg);var lugar=detectarLugar(msg);var pago=detectarPago(msg);var mes=detectarMes(msg);
  if((low.indexOf("vend")>=0||low.indexOf("venta")>=0)&&monto>0){datos[chatId].push({fecha:now,tipo:"venta",desc:msg,monto:monto,lugar:lugar,pago:pago,mes:mes});if(piezas>0)inventario[chatId]=Math.max(0,inventario[chatId]-piezas);}
  else if((low.indexOf("compr")>=0||low.indexOf("paca")>=0)&&monto>0){datos[chatId].push({fecha:now,tipo:"compra",desc:msg,monto:monto,lugar:lugar,pago:pago,mes:mes});if(piezas>0)inventario[chatId]+=piezas;}
  else if((low.indexOf("pagu")>=0||low.indexOf("gasto")>=0||low.indexOf("renta")>=0||low.indexOf("luz")>=0||low.indexOf("agua")>=0)&&monto>0){datos[chatId].push({fecha:now,tipo:"gasto",desc:msg,monto:monto,lugar:lugar,pago:pago,mes:mes});}
  return reply;
}

async function reporteMensual(){if(!datos[CHAT_ID]||datos[CHAT_ID].length===0)return;await send(CHAT_ID,"Reporte mensual! Generando tu Excel...");await generarExcel(CHAT_ID);datos[CHAT_ID]=[];hist[CHAT_ID]=[];}
async function reporteSemanal(){
  if(!datos[CHAT_ID]||datos[CHAT_ID].length===0)return;
  var v=0,c=0,g=0,ef=0,tr=0;var lug={};
  datos[CHAT_ID].forEach(function(r){if(r.tipo==="venta"){v+=r.monto;if(r.pago==="transferencia")tr+=r.monto;else ef+=r.monto;if(r.lugar)lug[r.lugar]=(lug[r.lugar]||0)+r.monto;}else if(r.tipo==="compra")c+=r.monto;else g+=r.monto;});
  var util=v-c-g;var top=Object.keys(lug).sort(function(a,b){return lug[b]-lug[a];})[0];
  var msg="Reporte semanal!\n\nVentas: $"+v+"\n  Efectivo: $"+ef+"\n  Transferencia: $"+tr+"\nCompras: $"+c+"\nGastos: $"+g+"\nUtilidad: $"+util+"\nInventario: "+(inventario[CHAT_ID]||0)+" piezas";
  if(top)msg+="\nMejor lugar: "+top+" ($"+lug[top]+")";
  msg+="\n\n"+(util>0?"Buena semana! Vas positivo.":"Cuidado, revisa tus gastos.");
  await send(CHAT_ID,msg);
}
async function recordatorioDiario(){await send(CHAT_ID,"Hola! No olvides registrar tus ventas de hoy.",btnTipo());}

function programarTareas(){
  var ahora=new Date();
  var finMes=new Date(ahora.getFullYear(),ahora.getMonth()+1,1,8,0,0);
  setTimeout(function(){reporteMensual().then(function(){programarTareas();});},finMes-ahora);
  var diasLunes=(8-ahora.getDay())%7||7;
  var lunes=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate()+diasLunes,8,0,0);
  setTimeout(function(){reporteSemanal();setInterval(reporteSemanal,7*24*60*60*1000);},lunes-ahora);
  var pm7=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate(),19,0,0);
  var d7=pm7>ahora?pm7-ahora:(24*60*60*1000)-(ahora-pm7);
  setTimeout(function(){recordatorioDiario();setInterval(recordatorioDiario,24*60*60*1000);},d7);
}

app.post("/webhook",async function(req,res){
  res.sendStatus(200);
  try{
    var body=req.body;
    if(body.callback_query){await handleCallback(body.callback_query);return;}
    var m=body.message;
    if(!m||!m.text)return;
    var id=m.chat.id;var text=m.text;
    if(text==="/start"){await send(id,"Hola! Soy *ContaBot* tu contador de ropa de segunda.\n\nComandos:\n/registrar - Agregar ingreso o gasto\n/excel - Excel profesional\n/inventario - Ver piezas\n/lugares - Ventas por lugar\n/reset - Limpiar mes");return;}
    if(text==="/registrar"){sesion[id]={};await send(id,"Que vas a registrar hoy?",btnTipo());return;}
    if(text==="/reset"){hist[id]=[];datos[id]=[];sesion[id]={};await send(id,"Historial limpiado!");return;}
    if(text==="/excel"){await send(id,"Generando tu Excel profesional...");await generarExcel(id);return;}
    if(text==="/inventario"){await send(id,"Tienes "+(inventario[id]||0)+" piezas en inventario.");return;}
    if(text==="/lugares"){
      var regs=datos[id]||[];var lug={};
      regs.forEach(function(r){if(r.tipo==="venta"&&r.lugar)lug[r.lugar]=(lug[r.lugar]||0)+r.monto;});
      if(Object.keys(lug).length===0){await send(id,"Sin datos de lugares aun.");return;}
      var msg="Ventas por lugar:\n";
      Object.keys(lug).sort(function(a,b){return lug[b]-lug[a];}).forEach(function(l){msg+=l+": $"+lug[l]+"\n";});
      await send(id,msg);return;
    }
    var handled=await handleMonto(id,text);
    if(!handled){var reply=await claude(id,text);await send(id,reply);await send(id,"Que mas deseas registrar?",btnTipo());}
  }catch(e){console.error(e);}
});

app.get("/",function(req,res){res.send("ContaBot OK");});
var PORT=process.env.PORT||8080;
app.listen(PORT,function(){console.log("Puerto "+PORT);programarTareas();});
