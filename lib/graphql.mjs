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
