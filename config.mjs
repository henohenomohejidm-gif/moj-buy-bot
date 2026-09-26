export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  suiGraphqlUrl: process.env.SUI_GRAPHQL_URL || 'https://graphql.mainnet.sui.io/graphql',
  coinType: process.env.MOJ_COIN_TYPE || '0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ',
  scanLimit: Math.min(Math.max(Number(process.env.SCAN_LIMIT || 100), 10), 500),
  minMoj: Number(process.env.MIN_MOJ_AMOUNT || 0),
  minSui: Number(process.env.MIN_SUI_AMOUNT || 0),
  totalSupply: Number(process.env.MOJ_TOTAL_SUPPLY || 0),
  suiUsdPrice: Number(process.env.SUI_USD_PRICE || 0),
  webUrl: process.env.MOJ_WEB_URL || 'https://henohenomoheji.tok.best/',
  xUrl: process.env.MOJ_X_URL || 'https://x.com/MOHEJI_MOJ',
  tgUrl: process.env.MOJ_TG_URL || 'https://t.me/heno_henomoheji',
  cronSecret: process.env.CRON_SECRET || ''
};

export function assertConfig() {
  const missing = [];
  if (!config.telegramToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}
