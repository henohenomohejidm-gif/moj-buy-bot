import { config, assertConfig } from '../lib/config.mjs';
import { getLatestTransactions } from '../lib/graphql.mjs';
import { analyzeBuy, buildMessage } from '../lib/format.mjs';
import { sendTelegram } from '../lib/telegram.mjs';
import { wasSeen, markSeen } from '../lib/redis.mjs';

function authorized(req) {
  if (!config.cronSecret) return true;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${config.cronSecret}`;
}

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }
  if (!authorized(req)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    assertConfig();
    const txs = await getLatestTransactions();
    const buys = [];

    // Process oldest -> newest so notifications arrive in chain order.
    for (const tx of [...txs].reverse()) {
      if (await wasSeen(tx.digest)) continue;
      const buy = analyzeBuy(tx);
      await markSeen(tx.digest);
      if (!buy) continue;
      const message = await buildMessage(buy);
      await sendTelegram(message);
      buys.push({ digest: buy.digest, buyer: buy.buyer, sui: buy.suiSpent, moj: buy.mojReceived });
    }

    return Response.json({ ok: true, scanned: txs.length, buysSent: buys.length, buys });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
