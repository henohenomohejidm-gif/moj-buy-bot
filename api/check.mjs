
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

// 初回の監視開始済みフラグ
const BASELINE_KEY = "moj-buy:baseline:v1";

// TXの重複防止記録を長期間保持する
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

  const priceUsd =
    (suiAmount * suiUsdPrice) / mojAmount;

  const marketCapUsd =
    config.mojTotalSupply > 0
      ? priceUsd * config.mojTotalSupply
      : 0;

  return { priceUsd, marketCapUsd };
}

function validateCronSecret(req) {
  const config = getConfig();

  if (!config.cronSecret) {
    return true;
  }

  return (
    (req.headers.authorization || "") ===
    `Bearer ${config.cronSecret}`
  );
}

// 実際の購入候補に該当するかを判定する。
// これは既存ロジックと同じ条件であり、
// DEX上の購入を完全に証明するものではない。
function getBuyCandidate(transaction) {
  if (!isSuccessfulTransaction(transaction)) {
    return null;
  }

  const mojRaw = getMojReceivedAmount(transaction);

  if (mojRaw <= 0n) {
    return null;
  }

  const suiSpentMist = getSuiSpentMist(transaction);

  if (suiSpentMist <= 0n) {
    return null;
  }

  return { mojRaw, suiSpentMist };
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

    const transactions =
      await getRecentMojBuyTransactions();

    // 初回起動では、取得済みの履歴を通知せず、
    // 購入候補のTXを処理済みとして登録する。
    const baselineInitialized =
      await hasSeen(BASELINE_KEY);

    if (!baselineInitialized) {
      let baselined = 0;

      for (const transaction of transactions) {
        if (!transaction?.digest) {
          continue;
        }

        const candidate = getBuyCandidate(transaction);

        if (!candidate) {
          continue;
        }

        await markSeen(
          `moj-buy:${transaction.digest}`,
          SEEN_TTL_SECONDS
        );

        baselined++;
      }

      // すべての履歴登録が成功してから初回完了を記録する。
      await markSeen(
        BASELINE_KEY,
        SEEN_TTL_SECONDS
      );

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
      console.warn(
        "SUI price unavailable:",
        error.message
      );
    }

    const results = [];

    for (const transaction of transactions) {
      if (!transaction?.digest) {
        continue;
      }

      const key = `moj-buy:${transaction.digest}`;

      if (await hasSeen(key)) {
        continue;
      }

      const candidate = getBuyCandidate(transaction);

      if (!candidate) {
        continue;
      }

      const suiAmount =
        mistToSui(candidate.suiSpentMist);

      const mojAmount =
        rawMojToMoj(candidate.mojRaw);

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

      // 既存動作を維持：通知成功後にTXを記録する。
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
