import { getConfig } from "../lib/config.mjs";

import {
  getRecentMojBuyTransactions,
  getMojReceivedAmount,
  getSuiSpentMist,
  isSuccessfulTransaction,
} from "../lib/graphql.mjs";

import {
  hasSeen,
  markSeen,
  isRedisConfigured,
} from "../lib/redis.mjs";

import { formatBuyMessage } from "../lib/format.mjs";

import { sendTelegramMessage } from "../lib/telegram.mjs";

import { getSuiUsdPrice } from "../lib/price.mjs";


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
  suiUsdPrice,
}) {
  const config = getConfig();

  if (
    !Number.isFinite(suiUsdPrice) ||
    suiUsdPrice <= 0 ||
    !Number.isFinite(mojAmount) ||
    mojAmount <= 0
  ) {
    return {
      priceUsd: 0,
      marketCapUsd: 0,
    };
  }

  const priceUsd =
    (suiAmount * suiUsdPrice) / mojAmount;

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
  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {

    // Optional cron authentication
    if (!validateCronSecret(req)) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }


    // Redis is required to prevent duplicate notifications
    if (!isRedisConfigured()) {
      return res.status(503).json({
        ok: false,
        error:
          "Upstash Redis is required before enabling buy notifications. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      });
    }


    // Get recent Turbos MOJ buy transactions
    const transactions =
      await getRecentMojBuyTransactions();


    // Get current SUI/USD price
    const suiUsdPrice =
      await getSuiUsdPrice();


    const results = [];


    for (const transaction of transactions) {

      // Only successful transactions
      if (
        !isSuccessfulTransaction(transaction)
      ) {
        continue;
      }


      // MOJ received by buyer
      const mojRaw =
        getMojReceivedAmount(transaction);

      if (mojRaw <= 0n) {
        continue;
      }


      // SUI spent by buyer
      const suiSpentMist =
        getSuiSpentMist(transaction);

      if (suiSpentMist <= 0n) {
        continue;
      }


      // Prevent duplicate Telegram notifications
      const key =
        `moj-buy:${transaction.digest}`;

      if (await hasSeen(key)) {
        continue;
      }


      const suiAmount =
        mistToSui(suiSpentMist);

      const mojAmount =
        rawMojToMoj(mojRaw);


      // Calculate MOJ price and market cap
      const {
        priceUsd,
        marketCapUsd,
      } =
        calculatePriceAndMarketCap({
          suiAmount,
          mojAmount,
          suiUsdPrice,
        });


      // Create Telegram message
      const message =
        formatBuyMessage({
          suiAmount,
          mojAmount,
          buyer:
            transaction.sender.address,
          txDigest:
            transaction.digest,
          priceUsd,
          marketCapUsd,
          suiUsdPrice,
        });


      // Send Telegram notification
      await sendTelegramMessage(
        message
      );


      // Mark transaction as already announced
      await markSeen(
        key,
        7 * 24 * 60 * 60
      );


      results.push({
        digest:
          transaction.digest,

        buyer:
          transaction.sender.address,

        suiAmount,

        mojAmount,

        suiUsdPrice,

        checkpoint:
          transaction.effects
            ?.checkpoint
            ?.sequenceNumber ?? null,
      });
    }


    return res.status(200).json({
      ok: true,

      bot: "MOJ Buy Bot",

      network: "Sui Mainnet",

      detected:
        results.length,

      results,

      timestamp:
        new Date().toISOString(),
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,

      error:
        error.message,

      timestamp:
        new Date().toISOString(),
    });
  }
}
