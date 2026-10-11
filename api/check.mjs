
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
const BASELINE_KEY = "moj-buy:baseline:v1";
const SEEN_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;

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
    return { priceUsd: 0, marketCapUsd: 0 };
  }

  const priceUsd = (suiAmount * suiUsdPrice) / mojAmount;
  const marketCapUsd =
    config.mojTotalSupply > 0
      ? priceUsd * config.mojTotalSupply
      : 0;

  return { priceUsd, marketCapUsd };
}

function validateCronSecret(req) {
  const config = getConfig();

  if (!config.cronSecret) return true;

  return (
    (req.headers.authorization || "") ===
    `Bearer ${config.cronSecret}`
  );
}

function getBuyCandidate(transaction) {
  if (!isSuccessfulTransaction(transaction)) {
    return { candidate: null, reason: "transaction_not_successful" };
  }

  let mojRaw;
  let suiSpentMist;

  try {
    mojRaw = getMojReceivedAmount(transaction);
    suiSpentMist = getSuiSpentMist(transaction);
  } catch (error) {
    return {
      candidate: null,
      reason: "balance_parse_error",
      detail: error.message,
    };
  }

  if (mojRaw <= 0n) {
    return { candidate: null, reason: "no_moj_received_by_sender" };
  }

  if (suiSpentMist <= 0n) {
    return { candidate: null, reason: "no_net_sui_spent" };
  }

  return {
    candidate: { mojRaw, suiSpentMist },
    reason: "candidate",
  };
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

    if (!isRedisConfigured()) {
      return res.status(503).json({
        ok: false,
        error: "Upstash Redis is required before enabling buy notifications.",
      });
    }

    const transactions = await getRecentMojBuyTransactions();
    const baselineInitialized = await hasSeen(BASELINE_KEY);

    if (!baselineInitialized) {
      let baselined = 0;

      for (const transaction of transactions) {
        if (!transaction?.digest) continue;

        const { candidate } = getBuyCandidate(transaction);
        if (!candidate) continue;

        await markSeen(
          `moj-buy:${transaction.digest}`,
          SEEN_TTL_SECONDS
        );

        baselined++;
      }

      await markSeen(BASELINE_KEY, SEEN_TTL_SECONDS);

      return res.status(200).json({
        ok: true,
        bot: "MOJ Buy Bot",
        network: "Sui Mainnet",
        mode: "baseline_initialized",
        detected: 0,
        historicalBuyCandidatesSkipped: baselined,
        timestamp: new Date().toISOString(),
      });
    }

    let suiUsdPrice = 0;

    try {
      suiUsdPrice = await getSuiUsdPrice();
    } catch (error) {
      console.warn("SUI price unavailable:", error.message);
    }

    const results = [];
    const skipped = {
      alreadySeen: 0,
      unsuccessful: 0,
      noMojReceived: 0,
      noSuiSpent: 0,
      other: 0,
    };

    for (const transaction of transactions) {
      if (!transaction?.digest) continue;

      const key = `moj-buy:${transaction.digest}`;

      if (await hasSeen(key)) {
        skipped.alreadySeen++;
        continue;
      }

      const { candidate, reason, detail } =
        getBuyCandidate(transaction);

      if (!candidate) {
        if (reason === "transaction_not_successful") {
          skipped.unsuccessful++;
        } else if (reason === "no_moj_received_by_sender") {
          skipped.noMojReceived++;
        } else if (reason === "no_net_sui_spent") {
          skipped.noSuiSpent++;
        } else {
          skipped.other++;
          console.warn("MOJ candidate evaluation failed:", {
            digest: transaction.digest,
            reason,
            detail,
          });
        }

        continue;
      }

      const suiAmount = mistToSui(candidate.suiSpentMist);
      const mojAmount = rawMojToMoj(candidate.mojRaw);

      const { priceUsd, marketCapUsd } =
        calculatePriceAndMarketCap({
          suiAmount,
          mojAmount,
          suiUsdPrice,
        });

      const message = formatBuyMessage({
        suiAmount,
        mojAmount,
        buyer: transaction.sender.address,
        txDigest: transaction.digest,
        priceUsd,
        marketCapUsd,
        suiUsdPrice,
      });

      // 通知に成功した後でのみ処理済みにする。
      await sendTelegramMessage(message);
      await markSeen(key, SEEN_TTL_SECONDS);

      results.push({
        digest: transaction.digest,
        buyer: transaction.sender.address,
        suiAmount,
        mojAmount,
        suiUsdPrice,
        checkpoint:
          transaction.effects?.checkpoint?.sequenceNumber ?? null,
      });
    }

    return res.status(200).json({
      ok: true,
      bot: "MOJ Buy Bot",
      network: "Sui Mainnet",
      scanned: transactions.length,
      detected: results.length,
      skipped,
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
