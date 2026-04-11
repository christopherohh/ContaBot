const fetch = require("node-fetch");
const express = require("express");
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = "8796958947:AAHODxzpnoyzvr4L5LnezRyxvFKVPMuDsOw";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const histories = {};

const SYSTEM_PROMPT = `Eres ContaBot, experto en finanzas para negocios de ropa de segunda mano. Registra ventas, compras y gastos. Genera reportes mensuales, estado de resultados y balance general. Usa emojis y formato Markdown de Telegram. Confirma registros con ✅. Sé empático.`;

async function sendMessage(chatId, text) {
  await​​​​​​​​​​​​​​​​
