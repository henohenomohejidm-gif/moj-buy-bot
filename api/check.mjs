import { getConfig } from "../lib/config.mjs";

export default async function handler(req, res) {
  try {
    const config = getConfig();

    return res.status(200).json({
      ok: true,
      bot: "MOJ Buy Bot",
      network: "Sui Mainnet",
      coinType: config.mojCoinType,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
