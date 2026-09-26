export function getSenderSuiBalanceChange(transaction) {
  const changes =
    transaction?.effects?.balanceChanges?.nodes || [];

  const sender =
    transaction?.sender?.address?.toLowerCase();

  const change = changes.find((item) => {
    const coinType =
      item?.coinType?.repr?.toLowerCase() || "";

    const owner =
      item?.owner?.address?.toLowerCase() || "";

    const amount =
      BigInt(item?.amount || "0");

    return (
      coinType.endsWith("::sui::sui") &&
      owner === sender &&
      amount < 0n
    );
  });

  return change
    ? BigInt(change.amount)
    : 0n;
}
