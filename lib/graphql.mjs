import { getConfig } from "./config.mjs";

async function graphqlRequest(query, variables = {}) {
  const config = getConfig();

  const response = await fetch(config.suiGraphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const responseText = await response.text();
  let json;

  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Sui GraphQL returned invalid JSON (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Sui GraphQL request failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message).join("; ")
    );
  }

  if (!json.data) {
    throw new Error("Sui GraphQL response contains no data.");
  }

  return json.data;
}

export async function getRecentMojBuyTransactions() {
  const config = getConfig();

  const query = `
    query RecentMojBuys(
      $limit: Int!
      $pool: SuiAddress!
      $before: String
    ) {
      transactions(
        last: $limit
        before: $before
        filter: {
          affectedObject: $pool
        }
      ) {
        pageInfo {
          hasPreviousPage
          startCursor
        }
        nodes {
          digest
          sender {
            address
          }
          effects {
            status
            checkpoint {
              sequenceNumber
            }
            balanceChanges(first: 50) {
              nodes {
                amount
                coinType {
                  repr
                }
                owner {
                  address
                }
              }
            }
            gasEffects {
              gasSummary {
                computationCost
                storageCost
                storageRebate
                nonRefundableStorageFee
              }
            }
          }
        }
      }
    }
  `;

  const limit = Math.max(
    1,
    Math.min(50, Math.floor(config.scanLimit || 50))
  );

  const maxPages = Math.max(
    1,
    Math.min(5, Math.floor(config.scanPages || 5))
  );

  const pages = [];
  const usedCursors = new Set();
  let before = null;

  for (let page = 0; page < maxPages; page++) {
    const data = await graphqlRequest(query, {
      limit,
      pool: config.mojPoolId,
      before,
    });

    const connection = data?.transactions;

    if (!connection) {
      throw new Error(
        "Sui GraphQL returned no transactions connection."
      );
    }

    pages.push(connection.nodes || []);

    const pageInfo = connection.pageInfo;

    if (
      !pageInfo?.hasPreviousPage ||
      !pageInfo.startCursor ||
      usedCursors.has(pageInfo.startCursor)
    ) {
      break;
    }

    usedCursors.add(pageInfo.startCursor);
    before = pageInfo.startCursor;
  }

  return pages.reverse().flat();
}

export function getMojReceivedAmount(transaction) {
  const config = getConfig();
  const sender = transaction?.sender?.address?.toLowerCase();

  if (!sender) return 0n;

  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  return changes.reduce((total, item) => {
    const owner = item?.owner?.address?.toLowerCase();
    const coinType = item?.coinType?.repr;

    if (owner !== sender || coinType !== config.mojCoinType) {
      return total;
    }

    const amount = BigInt(item?.amount || "0");
    return total + (amount > 0n ? amount : 0n);
  }, 0n);
}

export function getSenderSuiBalanceChange(transaction) {
  const config = getConfig();
  const sender = transaction?.sender?.address?.toLowerCase();

  if (!sender) return 0n;

  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  return changes.reduce((total, item) => {
    const owner = item?.owner?.address?.toLowerCase();
    const coinType = item?.coinType?.repr?.toLowerCase();

    if (
      owner !== sender ||
      coinType !== config.suiCoinType.toLowerCase()
    ) {
      return total;
    }

    return total + BigInt(item?.amount || "0");
  }, 0n);
}

export function getGasFeeMist(transaction) {
  const summary =
    transaction?.effects?.gasEffects?.gasSummary;

  if (!summary) return 0n;

  const computation = BigInt(summary.computationCost || "0");
  const storage = BigInt(summary.storageCost || "0");
  const rebate = BigInt(summary.storageRebate || "0");

  return computation + storage - rebate;
}

export function getSuiSpentMist(transaction) {
  const balanceChange =
    getSenderSuiBalanceChange(transaction);

  const gasFee = getGasFeeMist(transaction);
  const spent = -balanceChange - gasFee;

  return spent > 0n ? spent : 0n;
}

export function isSuccessfulTransaction(transaction) {
  return transaction?.effects?.status === "SUCCESS";
}
