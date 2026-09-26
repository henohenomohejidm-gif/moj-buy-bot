import { config } from './config.mjs';

const SUI_TYPE = '0x2::sui::SUI';

function shortAddress(a) {
  if (!a) return 'unknown';
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function fmt(n, max = 6) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: max,
    useGrouping: true
  }).format(n);
}

export function analyzeBuy(tx) {
  if (!tx?.effects || tx.effects.status?.__typename === 'Failure') return null;
  const changes = tx.effects.balanceChanges?.nodes || [];
  const byOwner = new Map();

  for (const c of changes) {
    const owner = c.owner?.address;
    const type = c.coinType?.repr;
    if (!owner || !type) continue;
    if (!byOwner.has(owner)) byOwner.set(owner, { sui: 0, moj: 0 });
    const value = Number(c.amount);
    if (!Number.isFinite(value)) continue;
    if (type === SUI_TYPE) byOwner.get(owner).sui += value / 1e9;
    if (type === config.coinType) byOwner.get(owner).moj += value;
  }

  // A buy is inferred when the same address loses SUI and gains MOJ.
  // This is deliberately conservative; it avoids treating a plain MOJ transfer as a buy.
  const candidates = [...byOwner.entries()]
    .map(([address, v]) => ({ address, sui: v.sui, moj: v.moj }))
    .filter(x => x.sui < 0 && x.moj > 0 && x.moj >= config.minMoj && Math.abs(x.sui) >= config.minSui)
    .sort((a, b) => b.moj - a.moj);

  if (!candidates.length) return null;
  const buyer = candidates[0];
  const suiSpent = Math.abs(buyer.sui);
  const mojReceived = buyer.moj;
  const priceSui = mojReceived > 0 ? suiSpent / mojReceived : 0;

  return {
    digest: tx.digest,
    buyer: buyer.address,
    suiSpent,
    mojReceived,
    priceSui,
    timestamp: tx.effects.timestamp || null
  };
}

export async function getSuiUsd() {
  if (config.suiUsdPrice > 0) return config.suiUsdPrice;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd');
    if (!res.ok) return null;
    const json = await res.json();
    return Number(json?.sui?.usd) || null;
  } catch {
    return null;
  }
}

export async function buildMessage(buy) {
  const suiUsd = await getSuiUsd();
  const priceUsd = suiUsd ? buy.priceSui * suiUsd : null;
  const marketCap = priceUsd && config.totalSupply > 0 ? priceUsd * config.totalSupply : null;

  const txUrl = `https://suiscan.xyz/mainnet/tx/${encodeURIComponent(buy.digest)}`;
  const walletUrl = `https://suiscan.xyz/mainnet/account/${encodeURIComponent(buy.buyer)}`;

  const lines = [
    '🎭 HENOHENOMOHEJI Buy!',
    '',
    '🫶🫶🫶🫶🫶🫶🫶🫶🫶🫶🫶🫶🫶🫶🫶🫶',
    '',
    `🔀 Spent: ${fmt(buy.suiSpent, 6)} SUI`,
    `🔀 Got: ${fmt(buy.mojReceived, 3)} MOJ`,
    `👤 [Buyer](${walletUrl}) / [TX](${txUrl})`,
    '🪙 Holder',
    `🏷 Price: ${priceUsd ? `$${priceUsd.toFixed(9)}` : `${buy.priceSui.toExponential(6)} SUI/MOJ`}`,
    marketCap ? `💸 Market Cap: $${fmt(marketCap, 2)}` : '💸 Market Cap: —',
    '',
    `[WEB](${config.webUrl})｜[X](${config.xUrl})｜[TG](${config.tgUrl})`,
    'MOJ • OFFICIAL BUY'
  ];
  return lines.join('\n');
}
