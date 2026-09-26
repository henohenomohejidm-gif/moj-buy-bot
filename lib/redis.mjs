import { getConfig } from "./config.mjs";

export async function redisGet(key) {
  const config = getConfig();

  if (!config.upstashRedisUrl || !config.upstashRedisToken) {
    return null;
  }

  const response = await fetch(
    `${config.upstashRedisUrl}/get/${encodeURIComponent(key)}`,
    {
      headers: {
        Authorization: `Bearer ${config.upstashRedisToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Redis GET failed: ${response.status}`);
  }

  const data = await response.json();

  return data.result ?? null;
}

export async function redisSet(key, value, expirationSeconds = 86400) {
  const config = getConfig();

  if (!config.upstashRedisUrl || !config.upstashRedisToken) {
    return false;
  }

  const response = await fetch(
    `${config.upstashRedisUrl}/set/${encodeURIComponent(
      key
    )}/${encodeURIComponent(value)}?ex=${expirationSeconds}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.upstashRedisToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Redis SET failed: ${response.status}`);
  }

  return true;
}

export async function hasSeen(key) {
  const value = await redisGet(key);

  return value !== null;
}

export async function markSeen(key, expirationSeconds = 86400) {
  return redisSet(key, "1", expirationSeconds);
}
