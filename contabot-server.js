const express = require("express");
const { Pool } = require("pg");
const XLSX = require("xlsx");
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id SERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      monto NUMERIC(10,2),
      ubicacion TEXT,
      mes INTEGER,
      anio INTEGER,
      fecha DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS historial_chat (
      id SERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("DB lista");
}

async function guardarTransaccion(chatId, tipo, descripcion, monto, ubicacion, fecha) {
  const d = fecha ? new Date(fecha) : new Date();
  await pool.query(
    `INSERT INTO transacciones (chat_id, tipo, descripcion, monto, ubicacion, mes, anio, fecha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [chatId, tipo, descripcion, monto, ubicacion, d.getMonth() + 1, d.getFullYear(), d.toISOString().split("T")[0]]
  );
}

async function eliminarUltima(chatId) {
  const res = await pool.query(
    `DELETE FROM transacciones WHERE id = (SELECT id FROM transacciones WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 1) RETURNING *`,
    [chatId]
  );
  return res.rows[0];
}

async function getResumenMes(chatId, mes, anio) {
  const res = await pool.query(`
    SELECT tipo, ubicacion, SUM(monto) as total, COUNT(*) as cantidad
    FROM transacciones WHERE chat_id=$1 AND mes=$2 AND anio=$3
    GROUP BY tipo, ubicacion ORDER BY tipo, ubicacion
  `, [chatId, mes, anio]);
  return res.rows;
}

async function getResumenSemana(chatId) {
  const res = await pool.query(`
    SELECT tipo, SUM(monto) as total FROM transacciones
    WHERE chat_id=$1 AND fecha >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY tipo
  `, [chatId]);
  return res.rows;
}

async function getMesesDisponibles(chatId) {
  const res = await pool.query(`
    SELECT DISTINCT mes, anio FROM transacciones
    WHERE chat_id=$1 ORDER BY anio DESC, mes DESC LIMIT 6
  `, [chatId]);
  return res.rows;
}

async function getHistorial(chatId) {
  const res = await pool.query(`
    SELECT role, content FROM historial_chat
    WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 20
  `, [chatId]);
  return res.rows.reverse();
}

async function guardarMensaje(chatId, role, content) {
  await pool.query(`INSERT INTO historial_chat (chat_id, role, content) VALUES ($1,$2,$3)`, [chatId, role, content]);
  await pool.query(`DELETE FROM historial_chat WHERE id IN (SELECT id FROM historial_chat WHERE chat_id=$1 ORDER BY created_at DESC OFFSET 40)`, [chatId]);
}

async function getContextoFinanciero(chatId) {
  const ahora = new Date();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  const datos = await getResumenMes(chatId, mes, anio);
  const semana = await getResumenSemana(chatId);
  const mesesDisp = await getMesesDisponibles(chatId);
  const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  let v = 0, c = 0, g = 0;
  const ventasPorUb = {};
  datos.forEach(r => {
    if (r.tipo === "venta") { v += parseFloat(r.total); if (r.ubicacion) ventasPorUb[r.ubicacion] = (ventasPorUb[r.ubicacion] || 0) + parseFloat(r.total); }
    else if (r.tipo === "compra") c += parseFloat(r.total);
    else if (r.tipo === "gasto") g += parseFloat(r.total);
  });

  let vs = 0, cs = 0, gs = 0;
  semana.forEach(r => {
    if (r.tipo === "venta") vs += parseFloat(r.total);
    else if (r.tipo === "compra") cs += parseFloat(r.total);
    else if (r.tipo === "gasto") gs += parseFloat(r.total);
  });

  let ctx = `=== DATOS FINANCIEROS ===\n`;
  ctx += `Fecha: ${ahora.toLocaleDateString("es-MX", { weekday:"long", day:"numeric", month:"long" })}\n\n`;
  ctx += `MES ACTUAL (${MESES[mes]} ${anio}):\n`;
  ctx += `  Ventas: $${v.toLocaleString("es")}\n`;
  Object.entries(ventasPorUb).forEach(([ub, t]) => { ctx += `    - ${ub}: $${parseFloat(t).toLocaleString("es")}\n`; });
  ctx += `  Compras: $${c.toLocaleString("es")}\n`;
  ctx += `  Gastos: $${g.toLocaleString("es")}\n`;
  ctx += `  Utilidad Neta: $${(v-c-g).toLocaleString("es")}\n`;
  if (v > 0) ctx += `  Margen: ${(((v-c-g)/v)*100).toFixed(1)}%\n`;
  ctx += `\nSEMANA: Ventas $${vs}, Utilidad $${vs-cs-gs}\n`;
  if (mesesDisp.length > 0) ctx += `MESES CON DATOS: ${mesesDisp.map(m => `${MESES[m.mes]} ${m.anio}`).join(", ")}\n`;
  return ctx;
}

// ── LEER EXCEL ──────────────────────────────────────────────────
async function descargarArchivo(fileId) {
  const res = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const data = await res.json();
  const filePath = data.result?.file_path;
  if (!filePath) return null;
  const url = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
  const fileRes = await fetch(url);
  const buffer = await fileRes.arrayBuffer();
  return Buffer.from(buffer);
}

async function procesarExcel(chatId, buffer, fileName) {
  await sendMessage(chatId, `📊 Leyendo *${fileName}*... Dame un momento 🔍`);

  try {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    let textoCompleto = "";

    wb.SheetNames.forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_csv(ws);
      textoCompleto += `\n=== HOJA: ${sheetName} ===\n${json}\n`;
    });

    // Limitar a 8000 caracteres para no exceder tokens
    if (textoCompleto.length > 8000) textoCompleto = textoCompleto.substring(0, 8000) + "\n...(archivo truncado)";

    // Pedir a Claude que interprete y extraiga transacciones
    const prompt = `Analiza este archivo Excel de operaciones pasadas del negocio de ropa de segunda mano de Chris.

DATOS DEL ARCHIVO:
${textoCompleto}

Tu tarea:
1. Identifica TODAS las transacciones: ventas, compras de inventario/pacas, gastos
2. Extrae: tipo, monto, ubicación (Victoria/San Luis/Santa/Misión), fecha si existe
3. Responde SOLO en este formato JSON (sin texto extra, sin markdown):
{
  "resumen": "descripción breve de lo que encontraste",
  "transacciones": [
    {"tipo": "venta", "monto": 1500, "ubicacion": "Victoria", "fecha": "2026-03-15", "descripcion": "descripción"},
    {"tipo": "compra", "monto": 800, "ubicacion": null, "fecha": "2026-03-10", "descripcion": "descripción"},
    {"tipo": "gasto", "monto": 200, "ubicacion": null, "fecha": "2026-03-01", "descripcion": "descripción"}
  ]
}

Si no puedes identificar una fecha exacta, usa la fecha más probable basada en el contexto.
Si no hay ubicación clara, usa null.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const rawText = data.content?.map(b => b.text || "").join("") || "";

    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      await sendMessage(chatId, `No pude leer el formato del archivo 😅\n\nEscríbeme los datos manualmente:\n_"Ventas Victoria marzo: $4,500"_`, MAIN_KEYBOARD);
      return;
    }

    const transacciones = parsed.transacciones || [];
    let registradas = 0;

    for (const t of transacciones) {
      if (!t.monto || t.monto <= 0) continue;
      await guardarTransaccion(chatId, t.tipo, t.descripcion || fileName, t.monto, t.ubicacion, t.fecha);
      registradas++;
    }

    // Resumen de lo registrado
    const ventas = transacciones.filter(t => t.tipo === "venta");
    const compras = transacciones.filter(t => t.tipo === "compra");
    const gastos = transacciones.filter(t => t.tipo === "gasto");
    const totalVentas = ventas.reduce((a, t) => a + t.monto, 0);
    const totalCompras = compras.reduce((a, t) => a + t.monto, 0);
    const totalGastos = gastos.reduce((a, t) => a + t.monto, 0);

    let msg = `✅ *Archivo procesado exitosamente*\n\n`;
    msg += `📋 *${parsed.resumen}*\n\n`;
    msg += `📊 *Registros guardados: ${registradas}*\n\n`;
    if (ventas.length > 0) msg += `💰 Ventas: ${ventas.length} registros → *$${totalVentas.toLocaleString("es")}*\n`;
    if (compras.length > 0) msg += `📦 Compras: ${compras.length} registros → *$${totalCompras.toLocaleString("es")}*\n`;
    if (gastos.length > 0) msg += `📝 Gastos: ${gastos.length} registros → *$${totalGastos.toLocaleString("es")}*\n`;
    msg += `\n_Todos los datos ya están en tu base de datos_ 🧠`;

    await sendMessage(chatId, msg, MAIN_KEYBOARD);

    // Análisis automático
    const analisis = await askClaude(chatId, `Acabo de importar datos históricos del archivo ${fileName}. Dame un análisis rápido de lo que encontraste y si hay algo importante que deba saber.`);
    await sendMessage(chatId, analisis, MAIN_KEYBOARD);

  } catch (err) {
    console.error("Error procesando Excel:", err);
    await sendMessage(chatId, `Hubo un error leyendo el archivo 😕\n\nIntenta mandarlo de nuevo o escríbeme los datos manualmente.`, MAIN_KEYBOARD);
  }
}

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📝 Registrar venta" }, { text: "📦 Registrar compra" }],
    [{ text: "📊 Reporte del mes" }, { text: "📅 Reporte semanal" }],
    [{ text: "📋 Comparar meses" }, { text: "🔮 Predicción" }],
    [{ text: "👤 Mi empleada" }, { text: "📈 Mis registros" }],
    [{ text: "🗑️ Borrar último registro" }],
  ],
  resize_keyboard: true,
  persistent: true,
};

async function sendMessage(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) { console.error("sendMessage error:", e); }
}

const NOMBRES_MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const SYSTEM_PROMPT = `Eres ContaBot, el asistente financiero personal de Chris para su negocio de ropa de segunda mano en México.

=== SOBRE EL NEGOCIO ===
Dueño: Chris
Tipo: Tienda de ropa de segunda mano / vintage
Ubicaciones: Victoria, San Luis, Santa, Misión
Empleada: Atiende el local, entrega apartados a domicilio y vende en el local

=== CICLO DE VIDA DE PRENDAS ===
Etapa 1: Publicación Facebook precio variable
Etapa 2: Perchero en local mismo precio
Etapa 3: A los 15 días todo a $90 parejo
Etapa 4: Caja oferta: 3x$100 o 1x$40 (ganancia libre, no cuenta en inventario)

=== TU ROL ===
Eres contador experto, consejero de negocios y asistente conversacional inteligente.
No solo registras datos — eres el asesor financiero de Chris.

=== CÓMO RESPONDER ===
- NATURAL: Entiende español mexicano informal. "¿cómo voy?", "¿me fue bien?", "¿qué tal el mes?" → analiza y responde humanamente
- INTELIGENTE: Detecta intenciones aunque no use palabras exactas
- PROACTIVO: Alerta si algo va mal, celebra logros, sugiere mejoras
- BREVE: Corto para registros, detallado para análisis
- EMPÁTICO: Este es el negocio de la vida de Chris

=== FORMATO TELEGRAM ===
*negritas* para cifras y títulos, _cursiva_ para notas
Emojis relevantes, ✅ confirmaciones, ❌ alertas, 📍 ubicaciones

=== REPORTES ===
💰 VENTAS por ubicación → 📦 COSTO MERCANCÍA → 📊 UTILIDAD BRUTA → 📝 GASTOS → ✨ UTILIDAD NETA + MARGEN% → 📌 1 insight + 1 acción`;

async function askClaude(chatId, userMessage) {
  const historial = await getHistorial(chatId);
  await guardarMensaje(chatId, "user", userMessage);
  const contexto = await getContextoFinanciero(chatId);
  const mensajes = [
    ...historial,
    { role: "user", content: `${contexto}\n\n=== MENSAJE DE CHRIS ===\n${userMessage}` }
  ];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: SYSTEM_PROMPT, messages: mensajes }),
  });
  const data = await response.json();
  const reply = data.content?.map(b => b.text || "").join("") || "No pude procesar eso 😅";
  await guardarMensaje(chatId, "assistant", reply);
  return reply;
}

async function detectarYGuardar(chatId, texto) {
  const t = texto.toLowerCase();
  const montos = texto.match(/\$?([\d,]+)/g)?.map(n => parseFloat(n.replace(/[$,]/g, ""))) || [];
  const monto = montos[montos.length - 1] || 0;
  let ubicacion = null;
  if (/victoria/i.test(t)) ubicacion = "Victoria";
  else if (/san luis/i.test(t)) ubicacion = "San Luis";
  else if (/santa/i.test(t)) ubicacion = "Santa";
  else if (/misi[oó]n/i.test(t)) ubicacion = "Misión";
  if (/(vendí|vendi|venta|vendido|ventas|ingres|cobr)/.test(t) && monto > 0) { await guardarTransaccion(chatId, "venta", texto, monto, ubicacion, null); return "venta"; }
  else if (/(compré|compre|paca|inventario|mercanc|surtí|surti)/.test(t) && monto > 0) { await guardarTransaccion(chatId, "compra", texto, monto, ubicacion, null); return "compra"; }
  else if (/(pagué|pague|gasto|gastos|renta|luz|agua|sueldo|empleada|bolsas|transporte|gasolina)/.test(t) && monto > 0) { await guardarTransaccion(chatId, "gasto", texto, monto, ubicacion, null); return "gasto"; }
  return null;
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body.message || req.body.edited_message;
    if (!message) return;
    const chatId = String(message.chat.id);
    const text = message.text || "";
    const doc = message.document;
    const photo = message.photo;

    // ── Archivo Excel ──
    if (doc) {
      const nombre = doc.file_name || "";
      if (nombre.match(/\.(xlsx|xls|csv)$/i)) {
        const buffer = await descargarArchivo(doc.file_id);
        if (buffer) await procesarExcel(chatId, buffer, nombre);
        else await sendMessage(chatId, "No pude descargar el archivo 😕 Intenta de nuevo.", MAIN_KEYBOARD);
      } else {
        await sendMessage(chatId, `Solo acepto archivos Excel (.xlsx, .xls) o CSV 📊\n\nMándame el archivo ContaBot en formato Excel.`, MAIN_KEYBOARD);
      }
      return;
    }

    // ── Foto ──
    if (photo) {
      await sendMessage(chatId, `📸 Vi tu foto pero aún no puedo leer imágenes.\n\nEscríbeme los datos y los registro al instante 📝`, MAIN_KEYBOARD);
      return;
    }

    if (!text) return;

    if (text === "/start") {
      await sendMessage(chatId,
        `¡Hola Chris! 👋 Soy *ContaBot v3* 🧾\n\n*IA + Memoria permanente + Lector de Excel* 🧠\n\n` +
        `Puedes:\n✅ Mandarme tu archivo Excel y lo registro automáticamente\n✅ Escribirme como quieras en español\n✅ Usar los botones de abajo\n\n` +
        `_Ejemplo: "¿Cómo voy este mes?" o "Vendí $1,200 en Victoria"_\n\n¿Empezamos? 😊`,
        MAIN_KEYBOARD);
      return;
    }

    if (text === "📝 Registrar venta") { await sendMessage(chatId, `💰 ¿Cuánto vendiste y dónde?\n\n_"$1,500 en Victoria"_ o _"Vendí 8 prendas $960 San Luis"_`, MAIN_KEYBOARD); return; }
    if (text === "📦 Registrar compra") { await sendMessage(chatId, `📦 ¿Cuánto en inventario?\n\n_"Compré paca $1,200"_`, MAIN_KEYBOARD); return; }

    if (text === "📊 Reporte del mes") {
      await sendMessage(chatId, "⏳ Analizando...");
      const reply = await askClaude(chatId, "Dame el estado de resultados completo de este mes con análisis y consejo.");
      await sendMessage(chatId, reply, MAIN_KEYBOARD);
      return;
    }

    if (text === "📅 Reporte semanal") {
      const reply = await askClaude(chatId, "Dame el reporte de esta semana y si hay algo que deba atender.");
      await sendMessage(chatId, reply, MAIN_KEYBOARD);
      return;
    }

    if (text === "📋 Comparar meses") {
      await sendMessage(chatId, "⏳ Comparando...");
      const mesesDisp = await getMesesDisponibles(chatId);
      if (mesesDisp.length < 2) { await sendMessage(chatId, "Necesitas al menos 2 meses de datos 📅\n\n¡Sigue registrando! 💪", MAIN_KEYBOARD); return; }
      const reply = await askClaude(chatId, "Compara los últimos meses disponibles. ¿Cuál fue mejor y por qué? Dame un consejo concreto.");
      await sendMessage(chatId, reply, MAIN_KEYBOARD);
      return;
    }

    if (text === "🔮 Predicción") {
      await sendMessage(chatId, "🔮 Calculando...");
      const reply = await askClaude(chatId, "Con mis datos históricos, predice las ventas del próximo mes y dame 3 estrategias concretas para mejorar.");
      await sendMessage(chatId, reply, MAIN_KEYBOARD);
      return;
    }

    if (text === "👤 Mi empleada") {
      const reply = await askClaude(chatId, "Dame análisis del rendimiento de mi empleada este mes. Ella atiende el local, entrega apartados y vende. ¿Cómo optimizo su trabajo?");
      await sendMessage(chatId, reply, MAIN_KEYBOARD);
      return;
    }

    if (text === "📈 Mis registros") {
      const res = await pool.query(`SELECT tipo, monto, ubicacion, fecha FROM transacciones WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 10`, [chatId]);
      if (res.rows.length === 0) { await sendMessage(chatId, "Sin registros aún 💰", MAIN_KEYBOARD); return; }
      let msg = "📋 *Últimos 10 registros:*\n\n";
      res.rows.forEach(r => {
        const icon = r.tipo === "venta" ? "💰" : r.tipo === "compra" ? "📦" : "📝";
        msg += `${icon} *${r.tipo.toUpperCase()}* $${r.monto}`;
        if (r.ubicacion) msg += ` 📍${r.ubicacion}`;
        msg += ` _(${r.fecha})_\n`;
      });
      await sendMessage(chatId, msg, MAIN_KEYBOARD);
      return;
    }

    if (text === "🗑️ Borrar último registro") {
      const eliminado = await eliminarUltima(chatId);
      await sendMessage(chatId, eliminado ? `🗑️ Eliminado: *${eliminado.tipo.toUpperCase()}* $${eliminado.monto} _(${eliminado.fecha})_\n\n✅ Listo.` : "No hay registros.", MAIN_KEYBOARD);
      return;
    }

    if (text === "/reset") {
      await pool.query(`DELETE FROM historial_chat WHERE chat_id=$1`, [chatId]);
      await sendMessage(chatId, "✅ Chat reiniciado. Datos financieros intactos.", MAIN_KEYBOARD);
      return;
    }

    // Mensaje libre
    await detectarYGuardar(chatId, text);
    const reply = await askClaude(chatId, text);
    await sendMessage(chatId, reply, MAIN_KEYBOARD);

  } catch (err) {
    console.error("Error:", err);
  }
});

app.get("/", (req, res) => res.send("ContaBot v3 IA + Excel corriendo 🧾"));
const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log(`Puerto ${PORT}`)));
