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

  if (!response.ok) {
    throw new Error(
      `Sui GraphQL request failed: ${response.status} ${response.statusText}`
    );
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message).join("; ")
    );
  }

  return json.data;
}

export async function getRecentTransactions() {
  const config = getConfig();

  const query = `
    query RecentTransactions($limit: Int!) {
      transactions(
        last: $limit
      ) {
        nodes {
          digest
          sender {
            address
          }
          effects {
            status
          }
          balanceChanges {
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
        }
      }
    }
  `;

  const data = await graphqlRequest(query, {
    limit: config.scanLimit,
  });

  return data?.transactions?.nodes || [];
}

export function isMojBalanceChange(balanceChange) {
  const config = getConfig();

  return balanceChange?.coinType?.repr === config.mojCoinType;
}

export function getMojBalanceChanges(transaction) {
  return (transaction?.balanceChanges?.nodes || []).filter(
    isMojBalanceChange
  );
}
