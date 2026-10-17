
import { getConfig } from "../lib/config.mjs";
import { getSuiUsdPrice } from "../lib/price.mjs";
import { sendTelegramText } from "../lib/telegram.mjs";

const DEFAULT_POOL_ID =
  "0xe2834b740618ee4bf267a18635cc4d56b250f33d6c618ad10cae9fe796dcd3cd";

function formatUsd(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const config = getConfig();
  const secret = config.cronSecret;

  if (!secret) {
    return res.status(500).json({
      error: "CRON_SECRET is not configured",
    });
  }

  const authorization = req.headers.authorization || "";

  if (authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const poolId = process.env.MOJ_POOL_ID || DEFAULT_POOL_ID;

    const rpcResponse = await fetch(
      process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_getObject",
          params: [
            poolId,
            { showContent: true },
          ],
        }),
      }
    );

    if (!rpcResponse.ok) {
      throw new Error(`Sui RPC failed: ${rpcResponse.status}`);
    }

    const rpcData = await rpcResponse.json();

    if (rpcData.error) {
      throw new Error(rpcData.error.message || "Sui RPC error");
    }

    const fields = rpcData.result?.data?.content?.fields;

    if (!fields) {
      throw new Error("Could not read MOJ pool fields");
    }

    const virtualSui = Number(fields.virtual_sui_reserves) / 1e9;
    const virtualMoj = Number(fields.virtual_token_reserves) / 1e6;

    if (
      !Number.isFinite(virtualSui) ||
      !Number.isFinite(virtualMoj) ||
      virtualSui <= 0 ||
      virtualMoj <= 0
    ) {
      throw new Error("Invalid MOJ pool reserves");
    }

    const suiPerMoj = virtualSui / virtualMoj;
    const suiUsd = await getSuiUsdPrice();
    const mojUsd = suiPerMoj * suiUsd;
    const totalSupply = config.mojTotalSupply;
    const fdvUsd = mojUsd * totalSupply;

    const message = [
      "📊 <b>MOJ MARKET</b>",
      "",
      `💰 Price: $${formatUsd(mojUsd)}`,
      `📈 FDV (estimate): $${formatUsd(fdvUsd)}`,
      "📊 24H Volume: Not available yet",
      "🔄 24H Change: Not available yet",
      "",
      "MOJ • OFFICIAL MARKET DATA",
    ].join("\n");

    const result = await sendTelegramText(message);

    return res.status(200).json({
      ok: true,
      message: "MOJ market update sent",
      telegramMessageId: result.message_id,
      priceUsd: mojUsd,
      fdvUsd,
    });
  } catch (error) {
    console.error("MOJ market update failed:", error);

    return res.status(500).json({
      error: "Market update failed",
      details: error.message,
    });
  }
}
