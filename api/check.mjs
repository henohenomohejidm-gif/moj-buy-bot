import { getConfig } from "../lib/config.mjs";
import {
  getRecentMojBuyTransactions,
  getMojReceivedAmount,
  getSuiSpentMist,
  hasTurbosTradeEvent,
  isSuccessfulTransaction,
} from "../lib/graphql.mjs";
import {
  hasSeen,
  markSeen,
} from "../lib/redis.mjs";
import {
  formatBuyMessage,
} from "../lib/format.mjs";
import {
  sendTelegramMessage,
} from "../lib/telegram.mjs";

const SUI_DECIMALS = 9;
const MOJ_DECIMALS = 6;

function mistToSui(mist) {
  return Number(mist) / 10 ** SUI_DECIMALS;
}

function rawMojToMoj(raw) {
  return Number(raw) / 10 ** MOJ_DECIMALS;
}

function calculatePriceAndMarketCap({
  suiAmount,
  mojAmount,
}) {
  const config = getConfig();

  if (
    !Number.isFinite(config.suiUsdPrice) ||
    config.suiUsdPrice <= 0 ||
    mojAmount <= 0
  ) {
    return {
      priceUsd: 0,
      marketCapUsd: 0,
    };
  }

  const spentUsd =
    suiAmount * config.suiUsdPrice;

  const priceUsd =
    spentUsd / mojAmount;

  const marketCapUsd =
    config.mojTotalSupply > 0
      ? priceUsd * config.mojTotalSupply
      : 0;

  return {
    priceUsd,
    marketCapUsd,
  };
}

function validateCronSecret(req) {
  const config = getConfig();

  if (!config.cronSecret) {
    return true;
  }

  const authorization =
    req.headers.authorization || "";

  return (
    authorization ===
    `Bearer ${config.cronSecret}`
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    if (!validateCronSecret(req)) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const config = getConfig();

    const transactions =
      await getRecentMojBuyTransactions();

    const results = [];

    for (const transaction of transactions) {
      if (!isSuccessfulTransaction(transaction)) {
        continue;
      }

      /*
       * We know this transaction:
       * - called Turbos turbospump::buy
       * - affected the configured MOJ pool
       *
       * The additional checks below make sure the sender
       * actually received MOJ.
       */

      const mojRaw =
        getMojReceivedAmount(transaction);

      if (mojRaw <= 0n) {
        continue;
      }

      /*
       * If TradedEvent data is available through GraphQL,
       * require it. If the indexer doesn't expose the event
       * on this transaction, we still accept the transaction
       * because function + pool + MOJ receipt are already
       * sufficient for this bot.
       */
      const hasTradeEvent =
        hasTurbosTradeEvent(transaction);

      const suiSpentMist =
        getSuiSpentMist(transaction);

      if (suiSpentMist <= 0n) {
        continue;
      }

      const key =
        `moj-buy:${transaction.digest}`;

      if (await hasSeen(key)) {
        continue;
      }

      const suiAmount =
        mistToSui(suiSpentMist);

      const mojAmount =
        rawMojToMoj(mojRaw);

      const {
        priceUsd,
        marketCapUsd,
      } = calculatePriceAndMarketCap({
        suiAmount,
        mojAmount,
      });

      const message =
        formatBuyMessage({
          suiAmount,
          mojAmount,
          buyer: transaction.sender,
          txDigest: transaction.digest,
          priceUsd,
          marketCapUsd,
        });

      await sendTelegramMessage(message);

      await markSeen(
        key,
        7 * 24 * 60 * 60
      );

      results.push({
        digest: transaction.digest,
        buyer: transaction.sender,
        suiAmount,
        mojAmount,
        hasTradeEvent,
        checkpoint:
          transaction?.effects?.checkpoint
            ?.sequenceNumber ?? null,
      });
    }

    return res.status(200).json({
      ok: true,
      bot: "MOJ Buy Bot",
      network: "Sui Mainnet",
      detected: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
