export function getSenderSuiBalanceChange(transaction) {
  const sender = transaction?.sender?.address;

  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  const change = changes.find(
    (item) =>
      item?.coinType?.repr?.endsWith("::sui::SUI") &&
      item?.owner?.address === sender &&
      BigInt(item?.amount || "0") < 0n
  );

  return change
    ? BigInt(change.amount)
    : 0n;
}
