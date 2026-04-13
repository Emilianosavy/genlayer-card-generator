const { Redis } = require("@upstash/redis");

const DAILY_CARD_LIMIT = 2;
const DAILY_TTL_SECONDS = 60 * 60 * 36;
const memoryQuotaStore = globalThis.__genlayerQuotaStore || new Map();
globalThis.__genlayerQuotaStore = memoryQuotaStore;
let redisClient;

module.exports = async function handler(req, res) {
  if (!["POST", "GET"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.method === "GET") {
    const ip = getClientIp(req);
    const quota = await getDailyQuotaStatus(ip);
    return res.status(200).json({ quota });
  }

  const name = String(req.body?.name || "").trim();
  const thoughts = String(req.body?.thoughts || "").trim();

  if (!name || thoughts.length < 10) {
    return res.status(400).json({ error: "Invalid input." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model1 = process.env.GEMINI_MODEL_1 || "gemini-2.5-flash-lite";
  const model2 = process.env.GEMINI_MODEL_2 || "gemini-2.5-flash";
  if (!apiKey) {
    return res.status(503).json({ error: "Server is missing GEMINI_API_KEY." });
  }

  const ip = getClientIp(req);
  const quotaReservation = await reserveDailySlot(ip);

  if (!quotaReservation.allowed) {
    return res.status(429).json({
      error: quotaReservation.message,
      limit: DAILY_CARD_LIMIT,
      current: quotaReservation.current,
      remaining: Math.max(0, DAILY_CARD_LIMIT - quotaReservation.current),
    });
  }

  const prompt = `You are a poet and philosopher writing for the GenLayer blockchain community - a project building the world's first intelligent blockchain where AI and smart contracts merge to create trustless decision-making.\n\nA community member named "${name}" shared this about GenLayer:\n"${thoughts}"\n\nWrite a SHORT, poetic 2-3 line statement (between 10-25 words) that:\n- Captures the essence of their perspective in beautiful, evocative language\n- References the spirit of GenLayer (intelligence, trust, the future, decentralized minds, contracts that think)\n- Feels personal yet universal - like a mantra or a vision\n- Has a slightly mysterious, forward-looking tone\n- Does NOT use cliches like "unleashing potential" or "changing the world"\n\nReply with ONLY the poetic statement. No quotes, no attribution, no explanation.`;

  let keepReservation = false;

  try {
    const firstAttempt = await generateWithModel(model1, apiKey, prompt);

    if (firstAttempt.ok) {
      keepReservation = true;
      return res.status(200).json({
        poem: firstAttempt.poem,
        modelUsed: firstAttempt.model,
        quota: {
          limit: DAILY_CARD_LIMIT,
          current: quotaReservation.current,
          remaining: Math.max(0, DAILY_CARD_LIMIT - quotaReservation.current),
        },
      });
    }

    // Fail over to model 2 only when model 1 is rate-limited.
    if (firstAttempt.status === 429) {
      const secondAttempt = await generateWithModel(model2, apiKey, prompt);

      if (secondAttempt.ok) {
        keepReservation = true;
        return res.status(200).json({
          poem: secondAttempt.poem,
          modelUsed: secondAttempt.model,
          quota: {
            limit: DAILY_CARD_LIMIT,
            current: quotaReservation.current,
            remaining: Math.max(0, DAILY_CARD_LIMIT - quotaReservation.current),
          },
        });
      }

      if (secondAttempt.status === 429) {
        return res.status(429).json({
          error:
            "Daily limit not reached, but Gemini rate-limited both configured models. Your request did not count toward your 2-card daily limit. Please wait a moment and try again.",
          limit: DAILY_CARD_LIMIT,
          current: quotaReservation.current,
          remaining: Math.max(0, DAILY_CARD_LIMIT - quotaReservation.current),
        });
      }

      return res
        .status(secondAttempt.status === 401 ? 502 : secondAttempt.status)
        .json({ error: secondAttempt.message });
    }

    return res
      .status(firstAttempt.status === 401 ? 502 : firstAttempt.status)
      .json({
        error: firstAttempt.message,
        limit: DAILY_CARD_LIMIT,
        current: quotaReservation.current,
        remaining: Math.max(0, DAILY_CARD_LIMIT - quotaReservation.current),
      });
  } catch (error) {
    console.error("Poem generation failed:", error);
    return res.status(500).json({ error: "Failed to generate poem." });
  } finally {
    if (!keepReservation) {
      await refundDailySlot(quotaReservation).catch((refundError) => {
        console.error("Failed to refund daily quota reservation:", refundError);
      });
    }
  }
};

function getClientIp(req) {
  const forwardedFor =
    req.headers["x-forwarded-for"] || req.headers["x-vercel-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const rawIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || realIp || req.socket?.remoteAddress || "unknown");

  return rawIp.split(",")[0].trim() || "unknown";
}

function getDailyQuotaKey(ip) {
  const day = new Date().toISOString().slice(0, 10);
  return `genlayer:daily-card-limit:${day}:${encodeURIComponent(ip)}`;
}

function getRedisClient() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }

  if (!redisClient) {
    redisClient = Redis.fromEnv();
  }

  return redisClient;
}

function isVercelProduction() {
  return process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "development";
}

function buildDailyLimitMessage() {
  return `Daily limit reached: this IP has already generated ${DAILY_CARD_LIMIT} cards today. Each IP is limited to ${DAILY_CARD_LIMIT} cards per day. Please try again after midnight UTC.`;
}

async function reserveDailySlot(ip) {
  const key = getDailyQuotaKey(ip);
  const redis = getRedisClient();

  if (redis) {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, DAILY_TTL_SECONDS);
    }

    if (current > DAILY_CARD_LIMIT) {
      await redis.decr(key);
      return {
        allowed: false,
        current: DAILY_CARD_LIMIT,
        message: buildDailyLimitMessage(),
      };
    }

    return { allowed: true, current, key, store: "redis" };
  }

  if (isVercelProduction()) {
    return {
      allowed: false,
      current: 0,
      message:
        "Daily rate limiting is not configured for production yet. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable the 2-cards-per-day IP quota.",
    };
  }

  const now = Date.now();
  const entry = memoryQuotaStore.get(key);

  if (!entry || entry.expiresAt <= now) {
    memoryQuotaStore.set(key, {
      count: 1,
      expiresAt: now + DAILY_TTL_SECONDS * 1000,
    });
    return { allowed: true, current: 1, key, store: "memory" };
  }

  entry.count += 1;

  if (entry.count > DAILY_CARD_LIMIT) {
    entry.count -= 1;
    return {
      allowed: false,
      current: DAILY_CARD_LIMIT,
      message: buildDailyLimitMessage(),
    };
  }

  return { allowed: true, current: entry.count, key, store: "memory" };
}

async function getDailyQuotaStatus(ip) {
  const key = getDailyQuotaKey(ip);
  const redis = getRedisClient();

  if (redis) {
    const raw = await redis.get(key);
    const current = Math.max(0, Number(raw || 0));
    return {
      limit: DAILY_CARD_LIMIT,
      current: Math.min(current, DAILY_CARD_LIMIT),
      remaining: Math.max(0, DAILY_CARD_LIMIT - current),
      message:
        current >= DAILY_CARD_LIMIT ? buildDailyLimitMessage() : undefined,
    };
  }

  const entry = memoryQuotaStore.get(key);
  const now = Date.now();
  const current = !entry || entry.expiresAt <= now ? 0 : entry.count;

  return {
    limit: DAILY_CARD_LIMIT,
    current: Math.min(current, DAILY_CARD_LIMIT),
    remaining: Math.max(0, DAILY_CARD_LIMIT - current),
    message: current >= DAILY_CARD_LIMIT ? buildDailyLimitMessage() : undefined,
  };
}

async function refundDailySlot(reservation) {
  if (!reservation?.allowed) {
    return;
  }

  if (reservation.store === "redis") {
    const redis = getRedisClient();
    if (redis) {
      await redis.decr(reservation.key);
    }
    return;
  }

  if (reservation.store === "memory") {
    const entry = memoryQuotaStore.get(reservation.key);
    if (!entry) {
      return;
    }

    entry.count = Math.max(0, entry.count - 1);
    if (entry.count === 0) {
      memoryQuotaStore.delete(reservation.key);
    }
  }
}

async function generateWithModel(model, apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationConfig: {
          maxOutputTokens: 120,
          temperature: 0.8,
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 404) {
      return {
        ok: false,
        status: 502,
        message: `Configured Gemini model "${model}" is unavailable for this API version.`,
      };
    }

    return {
      ok: false,
      status: response.status,
      message: data?.error?.message || `Gemini API error ${response.status}`,
    };
  }

  const poem = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || "")
    .join("\n")
    .trim();

  if (!poem) {
    return {
      ok: false,
      status: 502,
      message: "No poem returned by model.",
    };
  }

  return { ok: true, status: 200, poem, model };
}
