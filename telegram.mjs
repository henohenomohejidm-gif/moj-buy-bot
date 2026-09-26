import { config } from './config.mjs';

export async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Telegram error: ${json.description || res.status}`);
  return json;
}
