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

  if (!Number.isFinite(number) || number <= 0) {
    return "N/A";
  }

  if (number < 0.000001) {
    return `$${number.toExponential(4)}`;
  }

  return `$${number
    .toFixed(8)
    .replace(/0+$/, "")
    .replace(/\.$/, "")}`;
}

function createBuyBalls({
  suiAmount,
  suiUsdPrice,
}) {
  const usdAmount =
    Number(suiAmount) * Number(suiUsdPrice);

  if (
    !Number.isFinite(usdAmount) ||
    usdAmount <= 0
  ) {
    return "🟢";
  }

  // $0.10 = 🟢 1個
  // 最大100個
  const ballCount = Math.min(
    100,
    Math.max(
      1,
      Math.floor(usdAmount / 0.1)
    )
  );

  const balls = "🟢".repeat(ballCount);

  const lines = [];

  // 横10個で改行
  for (let i = 0; i < balls.length; i += 10) {
    lines.push(
      balls.slice(i, i + 10)
    );
  }

  return lines.join("\n");
}

export function formatBuyMessage({
  suiAmount,
  mojAmount,
  buyer,
  txDigest,
  priceUsd = 0,
  marketCapUsd = 0,
  suiUsdPrice = 0,
}) {
  const buyerUrl =
    `https://suivision.xyz/account/${buyer}`;

  const txUrl =
    `https://suivision.xyz/txblock/${txDigest}`;

  const marketCapText =
    Number.isFinite(Number(marketCapUsd)) &&
    Number(marketCapUsd) > 0
      ? `$${formatNumber(marketCapUsd, 2)}`
      : "N/A";

  const buyBalls =
    createBuyBalls({
      suiAmount,
      suiUsdPrice,
    });

  return [
    "🎭 <b>Henohenomoheji Buy!</b>",
    buyBalls,
    `🔀 Spent: <b>${formatNumber(suiAmount, 4)} SUI</b>`,
    `🔀 Got: <b>${formatNumber(mojAmount, 2)} MOJ</b>`,
    `👤 <a href="${buyerUrl}">Buyer</a> / <a href="${txUrl}">TX</a>`,
    `🏷 Price: <b>${formatPrice(priceUsd)}</b>`,
    `💸 Market Cap: <b>${marketCapText}</b>`,
    `💱 SUI: <b>$${formatNumber(suiUsdPrice, 4)}</b>`,
    '🌐 <a href="https://moheji-website.vercel.app/">WEB</a> ｜ <a href="https://x.com/MOHEJI_MOJ">X</a> ｜ <a href="https://t.me/heno_henomoheji">TG</a>',
    "<b>MOJ • OFFICIAL BUY</b>",
  ].join("\n");
}
