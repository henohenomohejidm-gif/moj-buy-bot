import {
  getRecentMojBuyTransactions,
  getMojReceivedAmount,
  getSuiSpentMist,
  isSuccessfulTransaction,
} from "../lib/graphql.mjs";

import { hasSeen } from "../lib/redis.mjs";

export default async function handler(req, res) {
  try {
    const transactions =
      await getRecentMojBuyTransactions();

    const results = [];

    for (const transaction of transactions) {
      const successful =
        isSuccessfulTransaction(transaction);

      const mojRaw =
        getMojReceivedAmount(transaction);

      const suiSpentMist =
        getSuiSpentMist(transaction);

      const key =
        `moj-buy:${transaction.digest}`;

      const seen =
        await hasSeen(key);

      results.push({
        digest: transaction.digest,

        sender:
          transaction.sender?.address,

        checkpoint:
          transaction.effects
            ?.checkpoint
            ?.sequenceNumber ?? null,

        successful,

        mojRaw:
          mojRaw.toString(),

        mojAmount:
          Number(mojRaw) / 1_000_000,

        suiSpentMist:
          suiSpentMist.toString(),

        suiAmount:
          Number(suiSpentMist) / 1_000_000_000,

        redisSeen: seen,

        wouldPass:
          successful &&
          mojRaw > 0n &&
          suiSpentMist > 0n &&
          !seen,
      });
    }

    return res.status(200).json({
      ok: true,
      count: results.length,
      results,
      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message,
      timestamp:
        new Date().toISOString(),
    });
  }
}
