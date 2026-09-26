export function formatNumber(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "$0";
  }

  if (number === 0) {
    return "$0";
  }

  if (number < 0.000001) {
    return `$${number.toExponential(4)}`;
  }

  return `$${number.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function formatBuyMessage({
  suiAmount,
  mojAmount,
  buyer,
  txDigest,
  priceUsd = 0,
  marketCapUsd = 0,
}) {
  const buyerUrl = `https://suivision.xyz/account/${buyer}`;
  const txUrl = `https://suivision.xyz/txblock/${txDigest}`;

  return [
    "🎭 <b>Henohenomoheji Buy!</b>",
    "",
    "🫶🫶🫶🫶🫶🫶🫶",
    "",
    `🔀 Spent: <b>${formatNumber(suiAmount, 4)} SUI</b>`,
    `🔀 Got: <b>${formatNumber(mojAmount, 2)} MOJ</b>`,
    "",
    `👤 <a href="${buyerUrl}">Buyer</a> / <a href="${txUrl}">TX</a>`,
    "🪙 Holder",
    "",
    `🏷 Price: <b>${formatPrice(priceUsd)}</b>`,
    `💸 Market Cap: <b>$${formatNumber(marketCapUsd, 2)}</b>`,
    "",
    "🌐 <a href=\"https://moheji-website.vercel.app/\">WEB</a> ｜ <a href=\"https://x.com/MOHEJI_MOJ\">X</a> ｜ <a href=\"https://t.me/heno_henomoheji\">TG</a>",
    "",
    "<b>MOJ • OFFICIAL BUY</b>",
  ].join("\n");
}
