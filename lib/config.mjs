export function getConfig() {
  return {
    telegramBotToken:
      process.env.TELEGRAM_BOT_TOKEN || "",

    telegramChatId:
      process.env.TELEGRAM_CHAT_ID || "",

    mojCoinType:
      process.env.MOJ_COIN_TYPE ||
      "0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ",

    suiCoinType:
      process.env.SUI_COIN_TYPE ||
      "0x2::sui::SUI",

    turbosPackage:
      process.env.TURBOS_PACKAGE ||
      "0x96e1396c8a771c8ae404b86328dc27e7b66af39847a31926980c96dbc1096a15",

    turbosBuyFunction:
      process.env.TURBOS_BUY_FUNCTION ||
      "0x96e1396c8a771c8ae404b86328dc27e7b66af39847a31926980c96dbc1096a15::turbospump::buy",

    mojPoolId:
      process.env.MOJ_POOL_ID ||
      "0xe2834b740618ee4bf267a18635cc4d56b250f33d6c618ad10cae9fe796dcd3cd",

    suiGraphqlUrl:
      process.env.SUI_GRAPHQL_URL ||
      "https://graphql.mainnet.sui.io/graphql",

    mojTotalSupply:
      Number(process.env.MOJ_TOTAL_SUPPLY || "10000000000"),

    scanLimit:
      Number(process.env.SCAN_LIMIT || "50"),

    upstashRedisUrl:
      process.env.UPSTASH_REDIS_REST_URL || "",

    upstashRedisToken:
      process.env.UPSTASH_REDIS_REST_TOKEN || "",

    cronSecret:
      process.env.CRON_SECRET || "",
  };
}
