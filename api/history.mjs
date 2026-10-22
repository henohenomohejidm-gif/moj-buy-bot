
import { getConfig } from "../lib/config.mjs";

const MOJ_DECIMALS = 6;
const SUI_DECIMALS = 9;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

function formatUnits(value, decimals) {
  const amount = BigInt(value || "0");
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${
    fraction ? `.${fraction}` : ""
  }`;
}

function normalizeCoinType(value) {
  if (typeof value !== "string") return "";

  const type = value.trim().toLowerCase();
  const separator = type.indexOf("::");

  if (separator === -1) return type;

  const address = type.slice(0, separator);
  const rest = type.slice(separator);

  if (!/^0x[0-9a-f]+$/.test(address)) return type;

  return `0x${address.slice(2).padStart(64, "0")}${rest}`;
}

function getGasFee(transaction) {
  const gas = transaction?.effects?.gasEffects?.gasSummary;

  if (!gas) return 0n;

  return (
    BigInt(gas.computationCost || "0") +
    BigInt(gas.storageCost || "0") -
    BigInt(gas.storageRebate || "0")
  );
}

async function graphqlRequest(url, query, variables) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();

  if (!response.ok || json.errors?.length || !json.data) {
    throw new Error(
      json.errors?.map((error) => error.message).join("; ") ||
      `Sui GraphQL request failed: HTTP ${response.status}`
    );
  }

  return json.data;
}

function buildHistoryItem(transaction, config) {
  const sender = transaction?.sender?.address;
  const effects = transaction?.effects;

  if (!sender || effects?.status !== "SUCCESS") return null;

  const changes = effects?.balanceChanges?.nodes || [];
  const senderLower = sender.toLowerCase();
  const mojType = normalizeCoinType(config.mojCoinType);
  const suiType = normalizeCoinType(config.suiCoinType);

  let mojDelta = 0n;
  let suiDelta = 0n;

  for (const change of changes) {
    if (change?.owner?.address?.toLowerCase() !== senderLower) {
      continue;
    }

    const coinType = normalizeCoinType(change?.coinType?.repr);
    const amount = BigInt(change?.amount || "0");

    if (coinType === mojType) mojDelta += amount;
    if (coinType === suiType) suiDelta += amount;
  }

  if (mojDelta === 0n || suiDelta === 0n) return null;

  const gasFee = getGasFee(transaction);

  let side;
  let suiAmount;

  if (mojDelta > 0n && suiDelta < 0n) {
    // MOJ increased and SUI decreased: possible BUY.
    side = "BUY";
    const spent = -suiDelta - gasFee;
    if (spent <= 0n) return null;
    suiAmount = spent;
  } else if (mojDelta < 0n) {
    // MOJ decreased: possible SELL only when SUI proceeds
    // can be distinguished from the transaction's gas cost.
    side = "SELL";
    const received = suiDelta + gasFee;
    if (received <= 0n) return null;
    suiAmount = received;
  } else {
    return null;
  }

  const timestamp = effects.timestamp || null;

  return {
    digest: transaction.digest,
    sender,
    side,
    mojAmount: formatUnits(
      mojDelta < 0n ? -mojDelta : mojDelta,
      MOJ_DECIMALS
    ),
    suiAmount: formatUnits(suiAmount, SUI_DECIMALS),
    timestamp,
    checkpoint: effects.checkpoint?.sequenceNumber ?? null,
    explorerUrl: `https://suivision.xyz/txblock/${encodeURIComponent(
      transaction.digest
    )}`,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const config = getConfig();
    const requestedLimit = Number.parseInt(req.query?.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, requestedLimit))
      : DEFAULT_LIMIT;

    const query = `
      query MojPoolHistory($limit: Int!, $pool: SuiAddress!) {
        transactions(
          last: $limit
          filter: { affectedObject: $pool }
        ) {
          nodes {
            digest
            sender {
              address
            }
            effects {
              status
              timestamp
              checkpoint {
                sequenceNumber
              }
              balanceChanges(first: 50) {
                nodes {
                  amount
                  coinType {
                    repr
                  }
                  owner {
                    address
                  }
                }
              }
              gasEffects {
                gasSummary {
                  computationCost
                  storageCost
                  storageRebate
                }
              }
            }
          }
        }
      }
    `;

    const data = await graphqlRequest(
      config.suiGraphqlUrl,
      query,
      {
        limit,
        pool: config.mojPoolId,
      }
    );

    const transactions = data?.transactions?.nodes || [];

    const history = transactions
      .map((transaction) => buildHistoryItem(transaction, config))
      .filter(Boolean)
      .sort((a, b) => {
        const timeA = a.timestamp
          ? Date.parse(a.timestamp)
          : 0;
        const timeB = b.timestamp
          ? Date.parse(b.timestamp)
          : 0;
        return timeB - timeA;
      });

    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");

    return res.status(200).json({
      ok: true,
      source: "Sui GraphQL",
      count: history.length,
      history,
      updatedAt: new Date().toISOString(),
      note:
        "BUY/SELL is inferred from sender balance changes. " +
        "It is not definitive proof of a Turbos swap.",
    });
  } catch (error) {
    console.error("[api/history] Error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to fetch MOJ transaction history",
    });
  }
}
