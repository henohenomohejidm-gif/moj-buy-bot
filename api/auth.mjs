import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig } from "../lib/config.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const config = getConfig();
    const botToken = config.telegramBotToken;

    if (!botToken) {
      return res.status(500).json({
        ok: false,
        error: "Bot token is not configured",
      });
    }

    const initData = req.body?.initData;

    if (
      typeof initData !== "string" ||
      !initData ||
      initData.length > 10000
    ) {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid initData",
      });
    }

    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");
    const authDateText = params.get("auth_date");
    const userText = params.get("user");

    if (
      !receivedHash ||
      !/^[a-f0-9]{64}$/i.test(receivedHash) ||
      !authDateText ||
      !/^\d+$/.test(authDateText) ||
      !userText
    ) {
      return res.status(401).json({
        ok: false,
        error: "Invalid Telegram authentication data",
      });
    }

    const authDate = Number(authDateText);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(authDate) ||
      authDate > now + 60 ||
      now - authDate > 3600
    ) {
      return res.status(401).json({
        ok: false,
        error: "Telegram authentication data expired",
      });
    }

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== "hash")
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const expectedHash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest();

    const actualHash = Buffer.from(receivedHash, "hex");

    if (
      actualHash.length !== expectedHash.length ||
      !timingSafeEqual(actualHash, expectedHash)
    ) {
      return res.status(401).json({
        ok: false,
        error: "Telegram signature verification failed",
      });
    }

    let user;

    try {
      user = JSON.parse(userText);
    } catch {
      return res.status(401).json({
        ok: false,
        error: "Invalid Telegram user data",
      });
    }

    if (
      !user ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0 ||
      typeof user.first_name !== "string"
    ) {
      return res.status(401).json({
        ok: false,
        error: "Invalid Telegram user",
      });
    }

    return res.status(200).json({
      ok: true,
      authenticated: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        username:
          typeof user.username === "string"
            ? user.username
            : null,
      },
    });
  } catch (error) {
    console.error("Telegram auth error:", error.message);

    return res.status(500).json({
      ok: false,
      error: "Authentication failed",
    });
  }
}
