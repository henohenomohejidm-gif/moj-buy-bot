# 🌀 HENOHENOMOHEJI (MOJ) Buy Bot

Telegram Buy Bot for MOJ on Sui Mainnet.

It periodically queries Sui GraphQL, looks at the latest programmable transactions, and announces transactions where the same address has a negative SUI balance change and a positive MOJ balance change.

## Important

This bot is an inference-based buy detector. It does **not** know every DEX's internal routing. A transaction is announced when its balance changes look like:

- buyer loses SUI
- buyer receives MOJ

That makes it useful as a community Buy Bot without hard-coding one DEX. If you want 100% DEX-specific classification, add the DEX package/function filters for the venue you use.

## Files

```text
moj-buy-bot/
├─ api/
│  ├─ check.mjs       # Vercel Cron endpoint
│  └─ health.mjs      # health check
├─ lib/
│  ├─ config.mjs
│  ├─ graphql.mjs
│  ├─ redis.mjs
│  ├─ format.mjs
│  └─ telegram.mjs
├─ .env.example
├─ .gitignore
├─ package.json
├─ vercel.json
└─ README.md
```

## 1. Create Telegram bot

Use BotFather and copy the bot token.

Add the bot to your MOJ group/channel and give it permission to post messages.

Set:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=@your_group_or_channel
```

Telegram Bot API `sendMessage` accepts a numeric chat ID or a public username such as `@channelusername`.

## 2. Sui / MOJ settings

The default Coin Type is already set to:

```text
0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ
```

The default GraphQL endpoint is:

```text
https://graphql.mainnet.sui.io/graphql
```

For heavier production traffic, use a managed Sui GraphQL provider and put its endpoint into `SUI_GRAPHQL_URL`.

## 3. Optional Market Cap

Set the total MOJ supply:

```env
MOJ_TOTAL_SUPPLY=1000000000
```

The bot estimates USD price from the transaction's SUI/MOJ ratio and SUI/USD. If `SUI_USD_PRICE` is blank it attempts CoinGecko's public SUI price endpoint.

If `MOJ_TOTAL_SUPPLY` is blank, Market Cap is shown as `—`.

## 4. Duplicate protection

For reliable duplicate protection across Vercel invocations, connect an Upstash Redis database to the Vercel project and set:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Without Redis the bot still works, but the in-memory fallback does not survive a new serverless invocation.

## 5. Deploy to Vercel

```bash
npm install
npx vercel login
npx vercel
npx vercel --prod
```

Then add the environment variables in Vercel Project Settings → Environment Variables and redeploy.

The cron is:

```text
* * * * *
```

So Vercel calls `/api/check` once per minute.

## 6. Test manually

Open:

```text
https://YOUR-DOMAIN.vercel.app/api/health
```

Then test the checker:

```text
https://YOUR-DOMAIN.vercel.app/api/check
```

If `CRON_SECRET` is set, call it with:

```bash
curl -H "Authorization: Bearer YOUR_SECRET" https://YOUR-DOMAIN.vercel.app/api/check
```

## 7. Change the visual message

The notification layout is in:

```text
lib/format.mjs
```

Change the emojis, text, links, and spacing there without touching the blockchain scanner.

## Reliability notes

The bot scans the latest `SCAN_LIMIT` programmable transactions each run. The default is 100. Increase it if your target market is active, but respect your GraphQL provider's rate/complexity limits.

For very high-volume monitoring, replace periodic polling with a Sui gRPC streaming/indexer architecture. Sui's current data stack recommends gRPC for low-latency backend/indexer workloads and GraphQL for flexible query workloads.
