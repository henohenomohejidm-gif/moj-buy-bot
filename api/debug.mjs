import { getRecentMojBuyTransactions } from "../lib/graphql.mjs";

export default async function handler(req, res) {
  try {
    const transactions =
      await getRecentMojBuyTransactions();

    return res.status(200).json({
      ok: true,
      count: transactions.length,
      transactions: transactions.map((tx) => ({
        digest: tx.digest,
        sender: tx.sender?.address,
        status: tx.effects?.status,
        checkpoint:
          tx.effects?.checkpoint?.sequenceNumber ?? null,

        balanceChanges:
          tx.effects?.balanceChanges?.nodes || [],
      })),
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
