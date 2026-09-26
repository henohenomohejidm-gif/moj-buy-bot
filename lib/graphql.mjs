import { getConfig } from "./config.mjs";

async function graphqlRequest(query, variables = {}) {
  const config = getConfig();

  const response = await fetch(config.suiGraphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      `Sui GraphQL request failed: ${response.status} ${response.statusText}`
    );
  }

  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message).join("; ")
    );
  }

  return json.data;
}

/**
 * Get recent successful Turbos Pump buy transactions
 * affecting the known MOJ pool.
 */
export async function getRecentMojBuyTransactions() {
  const config = getConfig();

  const query = `
    query RecentMojBuys(
      $limit: Int!
      $function: String!
      $pool: SuiAddress!
    ) {
      transactions(
        last: $limit
        filter: {
          function: $function
          affectedObject: $pool
        }
      ) {
        nodes {
          digest
          sender

          effects {
            status

            checkpoint {
              sequenceNumber
            }

            timestamp

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

            events(first: 20) {
              nodes {
                type {
                  repr
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphqlRequest(query, {
    limit: config.scanLimit,
    function: config.turbosBuyFunction,
    pool: config.mojPoolId,
  });

  return data?.transactions?.nodes || [];
}

/**
 * Check whether a transaction contains the MOJ TradedEvent.
 */
export function hasTurbosTradeEvent(transaction) {
  const events =
    transaction?.effects?.events?.nodes || [];

  return events.some((event) => {
    const type = event?.type?.repr || "";

    return (
      type ===
      `${getConfig().turbosPackage}::turbospump::TradedEvent`
    );
  });
}

/**
 * Get the sender's MOJ balance change.
 */
export function getMojReceivedAmount(transaction) {
  const config = getConfig();

  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  const change = changes.find((item) => {
    return (
      item?.coinType?.repr === config.mojCoinType &&
      item?.owner?.address === transaction.sender &&
      BigInt(item?.amount || "0") > 0n
    );
  });

  if (!change) {
    return 0n;
  }

  return BigInt(change.amount);
}

/**
 * Get the sender's SUI balance change.
 */
export function getSenderSuiBalanceChange(transaction) {
  const config = getConfig();

  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  const change = changes.find((item) => {
    return (
      item?.coinType?.repr === config.suiCoinType &&
      item?.owner?.address === transaction.sender
    );
  });

  if (!change) {
    return 0n;
  }

  return BigInt(change.amount);
}

/**
 * Calculate actual SUI spent on the swap,
 * excluding the transaction gas fee.
 *
 * Example:
 * - SUI balance change: -0.537786232 SUI
 * - gas:                0.001467468 SUI
 * - actual buy amount:  0.536318764 SUI
 */
export function getGasFeeMist(transaction) {
  const summary =
    transaction?.effects?.gasEffects?.gasSummary;

  if (!summary) {
    return 0n;
  }

  const computation =
    BigInt(summary.computationCost || "0");

  const storage =
    BigInt(summary.storageCost || "0");

  const rebate =
    BigInt(summary.storageRebate || "0");

  return computation + storage - rebate;
}

export function getSuiSpentMist(transaction) {
  const balanceChange =
    getSenderSuiBalanceChange(transaction);

  const gasFee =
    getGasFeeMist(transaction);

  const spent = -balanceChange - gasFee;

  return spent > 0n ? spent : 0n;
}

export function isSuccessfulTransaction(transaction) {
  return transaction?.effects?.status === "SUCCESS";
}
