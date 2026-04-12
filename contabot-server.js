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

  const GREEN_MED = "217346";
  const GREEN_DARK = "1A5C38";
  const RED_DARK = "8B0000";
  const BLUE_DARK = "1F3864";
  const BLUE_MED = "2E75B6";
  const BLUE_LIGHT = "DEEAF1";
  const DARK_GRAY = "2D2D2D";
  const WHITE = "FFFFFF";
  const BORDER_CLR = "BFBFBF";

  ws.columns = [
    { key:"a", width:14 }, { key:"b", width:10 }, { key:"c", width:18 }, { key:"d", width:13 },
    { key:"e", width:2  }, { key:"f", width:12 }, { key:"g", width:13 }, { key:"h", width:13 },
    { key:"i", width:13 }, { key:"j", width:2  }, { key:"k", width:14 }, { key:"l", width:10 },
    { key:"m", width:22 }, { key:"n", width:13 },
  ];

  function thin() { var s={style:"thin",color:{argb:"FF"+BORDER_CLR}}; return {top:s,bottom:s,left:s,right:s}; }
  function thick(c) { var s={style:"medium",color:{argb:"FF"+(c||DARK_GRAY)}}; return {top:s,bottom:s,left:s,right:s}; }
  function solid(h) { return {type:"pattern",pattern:"solid",fgColor:{argb:"FF"+h}}; }
  function ctr(w) { return {horizontal:"center",vertical:"middle",wrapText:w||false}; }
  function lft() { return {horizontal:"left",vertical:"middle"}; }
  function rgt() { return {horizontal:"right",vertical:"middle"}; }
  function hf(c) { return {name:"Arial",bold:true,size:10,color:{argb:"FF"+(c||WHITE)}}; }
  function df(b) { return {name:"Arial",size:10,bold:b||false}; }

  ws.getRow(2).height=36; ws.getRow(3).height=18; ws.getRow(4).height=34;
  ws.getRow(5).height=28; ws.getRow(6).height=28;
  for(var r=7;r<=206;r++) ws.getRow(r).height=20;

  // Titulo
  ws.mergeCells("A2:N2");
  var t=ws.getCell("A2");
  t.value="TABLA DE INGRESOS Y GASTOS";
  t.font={name:"Arial",bold:true,size:16,color:{argb:"FF"+WHITE}};
  t.fill=solid(DARK_GRAY); t.alignment=ctr(); t.border=thick(DARK_GRAY);

  // Labels row3
  var ingresos=registros.filter(function(r){return r.tipo==="venta";}).reduce(function(s,r){return s+r.monto;},0);
  var gastos=registros.filter(function(r){return r.tipo!=="venta";}).reduce(function(s,r){return s+r.monto;},0);
  var ganancia=ingresos-gastos;

  ws.mergeCells("A3:D3"); var lI=ws.getCell("A3");
  lI.value="TOTAL INGRESOS"; lI.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+GREEN_DARK}};
  lI.fill=solid("EBF5EB"); lI.alignment=ctr(); lI.border=thin();

  ws.mergeCells("F3:I3"); var lG=ws.getCell("F3");
  lG.value="GANANCIA / PERDIDA"; lG.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+BLUE_DARK}};
  lG.fill=solid("EBF3FB"); lG.alignment=ctr(); lG.border=thin();

  ws.mergeCells("K3:N3"); var lE=ws.getCell("K3");
  lE.value="TOTAL GASTOS"; lE.font={name:"Arial",bold:true,size:9,color:{argb:"FF"+RED_DARK}};
  lE.fill=solid("FCEAEA"); lE.alignment=ctr(); lE.border=thin();

  // Totales row4
  ws.mergeCells("A4:D4"); var tI=ws.getCell("A4");
  tI.value=ingresos; tI.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+WHITE}};
  tI.fill=solid(GREEN_MED); tI.alignment=ctr(); tI.numFmt="$#,##0.00"; tI.border=thick(GREEN_DARK);

  ws.mergeCells("F4:I4"); var tG=ws.getCell("F4");
  tG.value=ganancia; tG.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+WHITE}};
  tG.fill=solid(BLUE_MED); tG.alignment=ctr(); tG.numFmt="$#,##0.00"; tG.border=thick(BLUE_DARK);

  ws.mergeCells("K4:N4"); var tE=ws.getCell("K4");
  tE.value=gastos; tE.font={name:"Arial",bold:true,size:18,color:{argb:"FF"+WHITE}};
  tE.fill=solid(RED_DARK); tE.alignment=ctr(); tE.numFmt="$#,##0.00"; tE.border=thick(RED_DARK);

  // Secciones row5
  ws.mergeCells("A5:D5"); var sI=ws.getCell("A5");
  sI.value="INGRESOS"; sI.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};
  sI.fill=solid(GREEN_DARK); sI.alignment=ctr(); sI.border=thick(GREEN_DARK);

  ws.mergeCells("F5:I5"); var sR=ws.getCell("F5");
  sR.value="RESUMEN SEMANAL"; sR.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};
  sR.fill=solid(BLUE_DARK); sR.alignment=ctr(); sR.border=thick(BLUE_DARK);

  ws.mergeCells("K5:N5"); var sE=ws.getCell("K5");
  sE.value="GASTOS"; sE.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}};
  sE.fill=solid(RED_DARK); sE.alignment=ctr(); sE.border=thick(RED_DARK);

  // Encabezados row6
  [["A","Fecha"],["B","Mes"],["C","Concepto"],["D","Valor"]].forEach(function(h){
    var c=ws.getCell(h[0]+"6"); c.value=h[1]; c.font=hf(WHITE); c.fill=solid(GREEN_MED); c.alignment=ctr(); c.border=thin();
  });
  [["F","Semana"],["G","Ingresos"],["H","Gastos"],["I","Resultado"]].forEach(function(h){
    var c=ws.getCell(h[0]+"6"); c.value=h[1]; c.font=hf(WHITE); c.fill=solid(BLUE_MED); c.alignment=ctr(); c.border=thin();
  });
  [["K","Fecha"],["L","Mes"],["M","Descripcion"],["N","Valor"]].forEach(function(h){
    var c=ws.getCell(h[0]+"6"); c.value=h[1]; c.font=hf(WHITE); c.fill=solid("C00000"); c.alignment=ctr(); c.border=thin();
  });

  // Datos
  var ventas=registros.filter(function(r){return r.tipo==="venta";});
  var gasts=registros.filter(function(r){return r.tipo!=="venta";});
  var maxR=Math.max(ventas.length,gasts.length,30);

  for(var ri=0;ri<maxR;ri++){
    var er=ri+7; var even=ri%2===0;
    var fg=even?"F5FBF5":"FFFFFF"; var fr=even?"FEF5F5":"FFFFFF";

    if(ri<ventas.length){
      var v=ventas[ri];
      var c1=ws.getRow(er).getCell(1); c1.value=v.fecha; c1.font=df(); c1.fill=solid(fg); c1.alignment=ctr(); c1.border=thin();
      var c2=ws.getRow(er).getCell(2); c2.value=v.mes||""; c2.font=df(); c2.fill=solid(fg); c2.alignment=ctr(); c2.border=thin();
      var c3=ws.getRow(er).getCell(3); c3.value=v.lugar?("Venta "+v.lugar):v.desc.substring(0,30); c3.font=df(); c3.fill=solid(fg); c3.alignment=lft(); c3.border=thin();
      var c4=ws.getRow(er).getCell(4); c4.value=v.monto; c4.font=df(); c4.fill=solid(fg); c4.alignment=rgt(); c4.numFmt="$#,##0.00"; c4.border=thin();
    } else {
      for(var cc=1;cc<=4;cc++){var ec=ws.getRow(er).getCell(cc); ec.fill=solid(fg); ec.border=thin();}
    }

    if(ri<gasts.length){
      var g=gasts[ri];
      var g1=ws.getRow(er).getCell(11); g1.value=g.fecha; g1.font=df(); g1.fill=solid(fr); g1.alignment=ctr(); g1.border=thin();
      var g2=ws.getRow(er).getCell(12); g2.value=g.mes||""; g2.font=df(); g2.fill=solid(fr); g2.alignment=ctr(); g2.border=thin();
      var g3=ws.getRow(er).getCell(13); g3.value=g.desc.substring(0,30); g3.font=df(); g3.fill=solid(fr); g3.alignment=lft(); g3.border=thin();
      var g4=ws.getRow(er).getCell(14); g4.value=g.monto; g4.font=df(); g4.fill=solid(fr); g4.alignment=rgt(); g4.numFmt="$#,##0.00"; g4.border=thin();
    } else {
      for(var cc=11;cc<=14;cc++){var ec=ws.getRow(er).getCell(cc); ec.fill=solid(fr); ec.border=thin();}
    }
  }

  // Resumen semanal
  [{label:"1a Semana",ini:1,fin:7,row:7},{label:"2a Semana",ini:8,fin:14,row:10},
   {label:"3a Semana",ini:15,fin:21,row:13},{label:"4a Semana",ini:22,fin:31,row:16}].forEach(function(sem){
    var sIng=ventas.filter(function(r){
      try{var d=new Date(r.fecha.split("/").reverse().join("-")); return d.getDate()>=sem.ini&&d.getDate()<=sem.fin;}catch(e){return false;}
    }).reduce(function(s,r){return s+r.monto;},0);
    var sGas=gasts.filter(function(r){
      try{var d=new Date(r.fecha.split("/").reverse().join("-")); return d.getDate()>=sem.ini&&d.getDate()<=sem.fin;}catch(e){return false;}
    }).reduce(function(s,r){return s+r.monto;},0);
    var sRes=sIng-sGas;

    ws.mergeCells("F"+sem.row+":F"+(sem.row+2));
    var sL=ws.getCell("F"+sem.row);
    sL.value=sem.label; sL.font={name:"Arial",bold:true,size:10,color:{argb:"FF"+BLUE_DARK}};
    sL.fill=solid(BLUE_LIGHT); sL.alignment=ctr(); sL.border=thin();

    var sI2=ws.getCell("G"+sem.row);
    sI2.value=sIng; sI2.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+GREEN_DARK}};
    sI2.fill=solid(BLUE_LIGHT); sI2.alignment=ctr(); sI2.numFmt="$#,##0.00"; sI2.border=thin();

    var sG2=ws.getCell("H"+sem.row);
    sG2.value=sGas; sG2.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+RED_DARK}};
    sG2.fill=solid(BLUE_LIGHT); sG2.alignment=ctr(); sG2.numFmt="$#,##0.00"; sG2.border=thin();

    var sR2=ws.getCell("I"+sem.row);
    sR2.value=sRes; sR2.font={name:"Arial",bold:true,size:11,color:{argb:sRes>=0?"FF"+GREEN_DARK:"FF"+RED_DARK}};
    sR2.fill=solid(BLUE_LIGHT); sR2.alignment=ctr(); sR2.numFmt="$#,##0.00"; sR2.border=thin();

    for(var ex=sem.row+1;ex<=sem.row+2;ex++){
      for(var col=7;col<=9;col++){var ec=ws.getRow(ex).getCell(col); ec.fill=solid(BLUE_LIGHT); ec.border=thin();}
    }
  });

  // Total mes row20
  var tr=ws.getRow(20);
  var tf=tr.getCell(6); tf.value="TOTAL MES"; tf.font={name:"Arial",bold:true,size:10,color:{argb:"FF"+WHITE}}; tf.fill=solid(BLUE_DARK); tf.alignment=ctr(); tf.border=thin();
  var tg=tr.getCell(7); tg.value=ingresos; tg.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}}; tg.fill=solid(GREEN_DARK); tg.alignment=ctr(); tg.numFmt="$#,##0.00"; tg.border=thin();
  var th=tr.getCell(8); th.value=gastos; th.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}}; th.fill=solid(RED_DARK); th.alignment=ctr(); th.numFmt="$#,##0.00"; th.border=thin();
  var ti=tr.getCell(9); ti.value=ganancia; ti.font={name:"Arial",bold:true,size:11,color:{argb:"FF"+WHITE}}; ti.fill=solid(BLUE_MED); ti.alignment=ctr(); ti.numFmt="$#,##0.00"; ti.border=thin();

  ws.views=[{state:"frozen",ySplit:6}];

  // Enviar a Telegram
  var buffer=await wb.xlsx.writeBuffer();
  var now2=new Date().toLocaleDateString("es").replace(/\//g,"-");
  var filename="ContaBot_"+now2+".xlsx";
  var fd=new FormData();
  fd.append("chat_id",String(id));
  fd.append("document",buffer,{filename:filename,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});

  return new Promise(function(resolve,reject){
    var https=require("https");
    var req=https.request({hostname:"api.telegram.org",path:"/bot"+TOKEN+"/sendDocument",method:"POST",headers:fd.getHeaders()},function(res){
      res.on("data",function(){}); res.on("end",resolve);
    });
    req.on("error",reject);
    fd.pipe(req);
  });
}

function detectarFecha(msg) {
  const low=msg.toLowerCase(); const fecha=new Date();
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

function detectarMonto(msg) {
  const matches=msg.match(/\$\s*([\d,]+)|([\d]{3,})/g);
  if(!matches) return 0;
  const nums=matches.map(function(n){return parseInt(n.replace(/[$,\s]/g,""));});
  return Math.max.apply(null,nums);
}

function detectarPiezas(msg) {
  const match=msg.match(/(\d+)\s*(piez|prend|ropa|camis|pantal|blus|vestid)/i);
  return match?parseInt(match[1]):0;
}

function detectarLugar(msg) {
  const low=msg.toLowerCase();
  const lugares=["victoria","juarez","reforma","centro","mercado","tianguis","plaza","bodega","salon","expo","santa","mision","san luis"];
  for(var i=0;i<lugares.length;i++){if(low.indexOf(lugares[i])>=0) return lugares[i];}
  return null;
}

function detectarPago(msg) {
  const low=msg.toLowerCase();
  if(low.indexOf("transfer")>=0||low.indexOf("deposi")>=0||low.indexOf("oxxo")>=0||low.indexOf("spin")>=0||low.indexOf("clip")>=0) return "transferencia";
  return "efectivo";
}

function detectarMes(msg) {
  const meses=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const low=msg.toLowerCase();
  for(var i=0;i<meses.length;i++){if(low.indexOf(meses[i])>=0) return meses[i];}
  return meses[new Date().getMonth()];
}

function verificarAlerta(chatId) {
  const registros=datos[chatId]||[];
  let v=0,g=0,c=0;
  registros.forEach(function(r){if(r.tipo==="venta")v+=r.monto;else if(r.tipo==="compra")c+=r.monto;else g+=r.monto;});
  if((g+c)>v&&v>0) send(chatId,"ALERTA: Tus gastos ($"+(g+c)+") superan tus ventas ($"+v+"). Revisa tus gastos!");
}

async function claude(chatId, msg) {
  if(!hist[chatId])hist[chatId]=[];
  if(!datos[chatId])datos[chatId]=[];
  if(!inventario[chatId])inventario[chatId]=0;
  hist[chatId].push({role:"user",content:msg});
  if(hist[chatId].length>30)hist[chatId]=hist[chatId].slice(-30);
  const resumen=datos[chatId].slice(-50).map(function(r){return r.fecha+" "+r.tipo+" "+(r.lugar||"")+" "+(r.pago||"")+": $"+r.monto;}).join("\n");
  const system="Eres ContaBot, contador para negocio de ropa de segunda mano. Registra ventas por lugar y tipo de pago. Inventario: "+inventario[chatId]+" piezas. Usa emojis y Markdown de Telegram.\n\nREGISTROS:\n"+(resumen||"Sin registros");
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:system,messages:hist[chatId]}),
  });
  const d=await r.json();
  const reply=d.content.map(function(b){return b.text||"";}).join("")||"Error";
  hist[chatId].push({role:"assistant",content:reply});
  const low=msg.toLowerCase(); const monto=detectarMonto(msg); const now=detectarFecha(msg);
  const piezas=detectarPiezas(msg); const lugar=detectarLugar(msg); const pago=detectarPago(msg); const mes=detectarMes(msg);
  if((low.indexOf("vend")>=0||low.indexOf("venta")>=0)&&monto>0){
    datos[chatId].push({fecha:now,tipo:"venta",desc:msg,monto:monto,lugar:lugar,pago:pago,mes:mes});
    if(piezas>0)inventario[chatId]=Math.max(0,inventario[chatId]-piezas);
    verificarAlerta(chatId);
  }else if((low.indexOf("compr")>=0||low.indexOf("paca")>=0||low.indexOf("inventario")>=0)&&monto>0){
    datos[chatId].push({fecha:now,tipo:"compra",desc:msg,monto:monto,lugar:lugar,pago:pago,mes:mes});
    if(piezas>0)inventario[chatId]+=piezas;
    verificarAlerta(chatId);
  }else if((low.indexOf("pagu")>=0||low.indexOf("gasto")>=0||low.indexOf("renta")>=0||low.indexOf("luz")>=0||low.indexOf("agua")>=0)&&monto>0){
    datos[chatId].push({fecha:now,tipo:"gasto",desc:msg,monto:monto,lugar:lugar,pago:pago,mes:mes});
    verificarAlerta(chatId);
  }
  return reply;
}

async function reporteMensual() {
  if(!datos[CHAT_ID]||datos[CHAT_ID].length===0) return;
  await send(CHAT_ID,"Reporte mensual! Generando tu Excel...");
  await generarExcel(CHAT_ID);
  datos[CHAT_ID]=[]; hist[CHAT_ID]=[];
}

async function reporteSemanal() {
  if(!datos[CHAT_ID]||datos[CHAT_ID].length===0) return;
  let v=0,c=0,g=0,ef=0,tr=0; const lug={};
  datos[CHAT_ID].forEach(function(r){
    if(r.tipo==="venta"){v+=r.monto; if(r.pago==="transferencia")tr+=r.monto; else ef+=r.monto; if(r.lugar)lug[r.lugar]=(lug[r.lugar]||0)+r.monto;}
    else if(r.tipo==="compra")c+=r.monto; else g+=r.monto;
  });
  const util=v-c-g;
  const top=Object.keys(lug).sort(function(a,b){return lug[b]-lug[a];})[0];
  let msg="Reporte semanal!\n\nVentas: $"+v+"\n  Efectivo: $"+ef+"\n  Transferencia: $"+tr+"\nCompras: $"+c+"\nGastos: $"+g+"\nUtilidad: $"+util+"\nInventario: "+(inventario[CHAT_ID]||0)+" piezas";
  if(top) msg+="\nMejor lugar: "+top+" ($"+lug[top]+")";
  msg+="\n\n"+(util>0?"Buena semana! Vas positivo.":"Cuidado, revisa tus gastos.");
  await send(CHAT_ID,msg);
}

async function recordatorioDiario() {
  await send(CHAT_ID,"Hola! No olvides registrar tus ventas de hoy. Ej: Ventas Victoria hoy $2500 efectivo");
}

function programarTareas() {
  const ahora=new Date();
  const finMes=new Date(ahora.getFullYear(),ahora.getMonth()+1,1,8,0,0);
  setTimeout(function(){reporteMensual().then(function(){programarTareas();});},finMes-ahora);
  const diasLunes=(8-ahora.getDay())%7||7;
  const lunes=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate()+diasLunes,8,0,0);
  setTimeout(function(){reporteSemanal();setInterval(reporteSemanal,7*24*60*60*1000);},lunes-ahora);
  const pm7=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate(),19,0,0);
  const d7=pm7>ahora?pm7-ahora:(24*60*60*1000)-(ahora-pm7);
  setTimeout(function(){recordatorioDiario();setInterval(recordatorioDiario,24*60*60*1000);},d7);
}

app.post("/webhook",async function(req,res){
  res.sendStatus(200);
  try{
    const m=req.body.message;
    if(!m||!m.text) return;
    const id=m.chat.id; const text=m.text;
    if(text==="/start"){await send(id,"Hola! Soy ContaBot. Comandos:\n/excel - Excel profesional\n/inventario - Ver piezas\n/lugares - Ventas por lugar\n/reset - Limpiar mes\n\nEj: Ventas Victoria hoy $3500 efectivo");return;}
    if(text==="/reset"){hist[id]=[];datos[id]=[];await send(id,"Historial limpiado!");return;}
    if(text==="/excel"){await send(id,"Generando tu Excel profesional...");await generarExcel(id);return;}
    if(text==="/inventario"){await send(id,"Tienes "+(inventario[id]||0)+" piezas en inventario.");return;}
    if(text==="/lugares"){
      const regs=datos[id]||[]; const lug={};
      regs.forEach(function(r){if(r.tipo==="venta"&&r.lugar)lug[r.lugar]=(lug[r.lugar]||0)+r.monto;});
      if(Object.keys(lug).length===0){await send(id,"Sin datos de lugares aun.");return;}
      let msg="Ventas por lugar:\n";
      Object.keys(lug).sort(function(a,b){return lug[b]-lug[a];}).forEach(function(l){msg+=l+": $"+lug[l]+"\n";});
      await send(id,msg); return;
    }
    const reply=await claude(id,text);
    await send(id,reply);
  }catch(e){console.error(e);}
});

app.get("/",function(req,res){res.send("ContaBot OK");});
const PORT=process.env.PORT||8080;
app.listen(PORT,function(){console.log("Puerto "+PORT);programarTareas();});
