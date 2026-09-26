import { config } from './config.mjs';

const QUERY = `
query LatestTransactions($limit: Int!) {
  transactions(last: $limit, filter: { kind: PROGRAMMABLE_TX }) {
    nodes {
      digest
      sender { address }
      effects {
        status
        timestamp
        balanceChanges(first: 100) {
          nodes {
            amount
            owner { address }
            coinType { repr }
          }
        }
      }
    }
  }
}`;

export async function graphql(query, variables = {}) {
  const res = await fetch(config.suiGraphqlUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`Sui GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

export async function getLatestTransactions() {
  const data = await graphql(QUERY, { limit: config.scanLimit });
  return data.transactions.nodes || [];
}

export async function getTransaction(digest) {
  const query = `
  query Tx($digest: String!) {
    transaction(digest: $digest) {
      digest
      sender { address }
      effects {
        status
        timestamp
        balanceChanges(first: 100) {
          nodes {
            amount
            owner { address }
            coinType { repr }
          }
        }
      }
    }
  }`;
  const data = await graphql(query, { digest });
  return data.transaction;
}
