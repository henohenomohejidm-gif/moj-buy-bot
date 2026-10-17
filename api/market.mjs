// Trigger fresh Vercel deployment
import { getConfig } from "../lib/config.mjs";
import { getSuiUsdPrice } from "../lib/price.mjs";
import { sendTelegramText } from "../lib/telegram.mjs";

const DEFAULT_POOL_ID =
  "0xe2834b740618ee4bf267a18635cc4d56b250f33d6c618ad10cae9fe796dcd3cd";

function formatUsd(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 10,
  });
}

async function getPoolFields(poolId, graphqlUrl) {
  const query = `
    query {
      object(address: "${poolId}") {
        address
        asMoveObject {
          contents {
            json
          }
        }
      }
    }
  `;

  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Sui GraphQL failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(
      `Sui GraphQL error: ${result.errors
        .map((item) => item.message)
        .join("; ")}`
    );
  }

  const fields = result.data?.object?.asMoveObject?.contents?.json;

  if (!fields) {
    throw new Error("MOJ pool fields not found in GraphQL response");
  }

  return fields;
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

  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const poolId = process.env.MOJ_POOL_ID || DEFAULT_POOL_ID;
    const graphqlUrl =
      config.suiGraphqlUrl ||
      "https://graphql.mainnet.sui.io/graphql";

    if (!/^0x[a-fA-F0-9]{64}$/.test(poolId)) {
      throw new Error("Invalid MOJ_POOL_ID");
    }

    const fields = await getPoolFields(poolId, graphqlUrl);

    const virtualSui =
      Number(fields.virtual_sui_reserves) / 1e9;
    const virtualMoj =
      Number(fields.virtual_token_reserves) / 1e6;

    if (
      !Number.isFinite(virtualSui) ||
      !Number.isFinite(virtualMoj) ||
      virtualSui <= 0 ||
      virtualMoj <= 0
    ) {
      throw new Error("Invalid MOJ pool reserves");
    }

    const suiUsd = await getSuiUsdPrice();
    const mojUsd = (virtualSui / virtualMoj) * suiUsd;
    const fdvUsd = mojUsd * config.mojTotalSupply;

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
