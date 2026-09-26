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

export function hasTurbosTradeEvent(transaction) {
  const config = getConfig();

  const events =
    transaction?.effects?.events?.nodes || [];

  return events.some(
    (event) =>
      event?.type?.repr ===
      `${config.turbosPackage}::turbospump::TradedEvent`
  );
}

export function getMojReceivedAmount(transaction) {
  const config = getConfig();
  const sender = transaction?.sender?.address;

  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  const change = changes.find(
    (item) =>
      item?.coinType?.repr === config.mojCoinType &&
      item?.owner?.address === sender &&
      BigInt(item?.amount || "0") > 0n
  );

  return change
    ? BigInt(change.amount)
    : 0n;
}

export function getSenderSuiBalanceChange(transaction) {
  const config = getConfig();
  const sender = transaction?.sender?.address;

  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  const change = changes.find(
    (item) =>
      item?.coinType?.repr === config.suiCoinType &&
      item?.owner?.address === sender
  );

  return change
    ? BigInt(change.amount)
    : 0n;
}

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

  const spent =
    -balanceChange - gasFee;

  return spent > 0n
    ? spent
    : 0n;
}

export function isSuccessfulTransaction(transaction) {
  return transaction?.effects?.status === "SUCCESS";
}
