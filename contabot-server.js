const express = require("express");
const { Pool } = require("pg");
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

async function guardarTransaccion(chatId, tipo, descripcion, monto, ubicacion) {
  await pool.query(
    `INSERT INTO transacciones (chat_id, tipo, descripcion, monto, ubicacion) VALUES ($1,$2,$3,$4,$5)`,
    [chatId, tipo, descripcion, monto, ubicacion]
  );
}

async function getResumenMes(chatId) {
  const res = await pool.query(`
    SELECT tipo, SUM(monto) as total FROM transacciones
    WHERE chat_id=$1 AND DATE_TRUNC('month',fecha)=DATE_TRUNC('month',CURRENT_DATE)
    GROUP BY tipo
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
  await pool.query(
    `INSERT INTO historial_chat (chat_id, role, content) VALUES ($1,$2,$3)`,
    [chatId, role, content]
  );
  await pool.query(`
    DELETE FROM historial_chat WHERE id IN (
      SELECT id FROM historial_chat WHERE chat_id=$1
      ORDER BY created_at DESC OFFSET 40
    )
  `, [chatId]);
}

const SYSTEM_PROMPT = `Eres ContaBot, contador experto en negocios de ropa de segunda mano.
Registra ventas, compras y gastos. Genera reportes financieros claros.
El negocio tiene ubicaciones: Victoria, San Luis, Santa, Misión.
Usa formato Markdown de Telegram. Usa emojis. Sé empático y directo.
Cuando tengas datos de la base de datos úsalos para cálculos exactos.
REPORTES incluyen: Ingresos, Costo mercancía, Utilidad Bruta, Gastos, Utilidad Neta, Margen %.`;

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

async function askClaude(chatId, userMessage, contexto = "") {
  const historial = await getHistorial(chatId);
  await guardarMensaje(chatId, "user", userMessage);
  const mensajes = [
    ...historial,
    { role: "user", content: contexto ? `${contexto}\n\nMensaje: ${userMessage}` : userMessage }
  ];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: mensajes,
    }),
  });
  const data = await response.json();
  const reply = data.content?.map(b => b.text || "").join("") || "No pude procesar eso 😅";
  await guardarMensaje(chatId, "assistant", reply);
  return reply;
}

async function detectarYGuardar(chatId, texto) {
  const t = texto.toLowerCase();
  const montos = texto.match(/\$?([\d,]+)/g)?.map(n => parseFloat(n.replace(/[$,]/g,""))) || [];
  const monto = montos[montos.length - 1] || 0;
  let ubicacion = null;
  if (/victoria/i.test(t)) ubicacion = "Victoria";
  else if (/san luis/i.test(t)) ubicacion = "San Luis";
  else if (/santa/i.test(t)) ubicacion = "Santa";
  else if (/misión|mision/i.test(t)) ubicacion = "Misión";
  if (/(vendí|vendi|venta|vendido|ventas)/.test(t) && monto > 0)
    await guardarTransaccion(chatId, "venta", texto, monto, ubicacion);
  else if (/(compré|compre|paca|inventario)/.test(t) && monto > 0)
    await guardarTransaccion(chatId, "compra", texto, monto, ubicacion);
  else if (/(pagué|pague|gasto|gastos|renta|luz|agua|sueldo|empleada)/.test(t) && monto > 0)
    await guardarTransaccion(chatId, "gasto", texto, monto, ubicacion);
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const { message } = req.body;
    if (!message || !message.text) return;
    const chatId = String(message.chat.id);
    const text = message.text;

    if (text === "/start") {
      await sendMessage(chatId,
        `¡Hola Chris! 👋 Soy *ContaBot v2* 🧾\n\n` +
        `Ahora tengo *memoria permanente* 🧠\n\n` +
        `💰 _"Vendí 8 prendas por $1,200 en Victoria"_\n` +
        `🛍️ _"Compré paca por $500"_\n` +
        `📝 _"Pagué renta $800"_\n` +
        `📊 _"Dame el reporte del mes"_\n` +
        `📋 Ver registros: /misregistros\n` +
        `🗑️ Limpiar chat: /reset\n\n` +
        `¿Con qué empezamos? 😊`
      );
      return;
    }

    if (text === "/reset") {
      await pool.query(`DELETE FROM historial_chat WHERE chat_id=$1`, [chatId]);
      await sendMessage(chatId, "✅ Chat limpiado. Tus transacciones siguen guardadas.");
      return;
    }

    if (text === "/misregistros") {
      const res = await pool.query(`
        SELECT tipo, monto, ubicacion, fecha FROM transacciones
        WHERE chat_id=$1 ORDER BY created_at DESC LIMIT 10
      `, [chatId]);
      if (res.rows.length === 0) {
        await sendMessage(chatId, "Sin registros aún. ¡Dime tus ventas de hoy! 💰");
        return;
      }
      let msg = "📋 *Últimos 10 registros:*\n\n";
      res.rows.forEach(r => {
        const icon = r.tipo==="venta"?"💰":r.tipo==="compra"?"🛍️":"📝";
        msg += `${icon} *${r.tipo.toUpperCase()}* $${r.monto} — ${r.fecha}\n`;
        if (r.ubicacion) msg += `   📍 ${r.ubicacion}\n`;
      });
      await sendMessage(chatId, msg);
      return;
    }

    await detectarYGuardar(chatId, text);
    const resumen = await getResumenMes(chatId);
    let contexto = "";
    if (resumen.length > 0) {
      contexto = "Datos este mes en DB:\n";
      resumen.forEach(r => { contexto += `- ${r.tipo}: $${r.total}\n`; });
    }
    const reply = await askClaude(chatId, text, contexto);
    await sendMessage(chatId, reply);

  } catch (err) {
    console.error("Error:", err);
  }
});

app.get("/", (req, res) => res.send("ContaBot v2 corriendo 🧾"));

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log(`Puerto ${PORT}`)));
