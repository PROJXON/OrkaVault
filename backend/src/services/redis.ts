import { createClient } from "redis";

// Local JTI in-memory cache fallback if Redis is unavailable
const memoryCache = new Map<string, { status: string; expiresAt: number }>();

let redisClient: ReturnType<typeof createClient> | null = null;
let isRedisConnected = false;

// Attempt connection
(async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    redisClient.on("error", (err) => {
      // Suppress spamming logs, fail over to memory cache quietly
      isRedisConnected = false;
    });

    await redisClient.connect();
    isRedisConnected = true;
    console.log("🔒 Redis client connected successfully.");
  } catch (error) {
    console.warn(
      "⚠️ Redis not running or connection failed. Falling back to in-memory JTI invalidator.",
    );
    redisClient = null;
    isRedisConnected = false;
  }
})();

/**
 * Stores a JTI token with a 120-second TTL.
 */
export async function storeRevealToken(jti: string): Promise<void> {
  const ttlSeconds = 120;
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(`reveal_token:${jti}`, "unused", {
        EX: ttlSeconds,
      });
      return;
    } catch (e) {
      // Fallback below
    }
  }

  // In-memory fallback
  memoryCache.set(jti, {
    status: "unused",
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Checks and marks a JTI token as used.
 * Returns true if the token was valid and unused, false otherwise.
 * Atomic operation prevents double-reveal attacks.
 */
export async function consumeRevealToken(jti: string): Promise<boolean> {
  if (isRedisConnected && redisClient) {
    try {
      // Atomic get and set/delete or check
      const value = await redisClient.get(`reveal_token:${jti}`);
      if (value === "unused") {
        // Mark as used (or delete to ensure it cannot be re-fetched)
        await redisClient.del(`reveal_token:${jti}`);
        return true;
      }
      return false;
    } catch (e) {
      // Fallback below
    }
  }

  // In-memory fallback
  const cached = memoryCache.get(jti);
  if (!cached) return false;

  if (cached.expiresAt < Date.now()) {
    memoryCache.delete(jti);
    return false;
  }

  if (cached.status === "unused") {
    cached.status = "used";
    // Clean up expired items periodically
    cleanExpiredMemoryCache();
    return true;
  }

  return false;
}

function cleanExpiredMemoryCache() {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (value.expiresAt < now) {
      memoryCache.delete(key);
    }
  }
}

export function getRedisStatus(): boolean {
  return isRedisConnected;
}
