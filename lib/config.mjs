export function getConfig() {
  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",

    mojCoinType:
      process.env.MOJ_COIN_TYPE ||
      "0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ",

    suiGraphqlUrl:
      process.env.SUI_GRAPHQL_URL ||
      "https://graphql.mainnet.sui.io/graphql",

    mojTotalSupply: Number(process.env.MOJ_TOTAL_SUPPLY || "0"),

    suiUsdPrice: Number(process.env.SUI_USD_PRICE || "0"),

    upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL || "",
    upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN || "",

    scanLimit: Number(process.env.SCAN_LIMIT || "50"),

    cronSecret: process.env.CRON_SECRET || "",
  };
}
