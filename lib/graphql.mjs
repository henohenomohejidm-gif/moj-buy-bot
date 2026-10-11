
function normalizeCoinType(value) {
  if (typeof value !== "string") return "";

  const type = value.trim().toLowerCase();
  const separator = type.indexOf("::");

  if (separator === -1) return type;

  const address = type.slice(0, separator);
  const rest = type.slice(separator);

  if (!/^0x[0-9a-f]+$/.test(address)) return type;

  return `0x${address.slice(2).padStart(64, "0")}${rest}`;
}

export function getMojReceivedAmount(transaction) {
  const config = getConfig();
  const sender = transaction?.sender?.address?.toLowerCase();

  if (!sender) return 0n;

  const expectedCoinType = normalizeCoinType(config.mojCoinType);
  const changes = transaction?.effects?.balanceChanges?.nodes || [];

  return changes.reduce((total, item) => {
    const owner = item?.owner?.address?.toLowerCase();
    const coinType = normalizeCoinType(item?.coinType?.repr);

    if (owner !== sender || coinType !== expectedCoinType) {
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

  const expectedCoinType = normalizeCoinType(config.suiCoinType);
  const changes = transaction?.effects?.balanceChanges?.nodes || [];

  return changes.reduce((total, item) => {
    const owner = item?.owner?.address?.toLowerCase();
    const coinType = normalizeCoinType(item?.coinType?.repr);

    if (owner !== sender || coinType !== expectedCoinType) {
      return total;
    }

    return total + BigInt(item?.amount || "0");
  }, 0n);
}
