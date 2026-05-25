// temporal.js - 时间上下文处理

const https = require("https");
const { log, writeAuditEvent } = require("./logger");

const TIME_API_BASE = "https://gateway.timeapi.world/timezone";
const TIME_API_CACHE_TTL_MS = 60 * 1000;
const temporalClockCache = new Map();

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeToolName(tool) {
  return String(tool || "")
    .replace(/^smart_/, "")
    .replace(/_/g, "-");
}

function resolveTimezone(timezone) {
  const explicit = typeof timezone === "string" ? timezone.trim() : "";
  if (explicit) return explicit;

  const envTimezone =
    (process.env.SMART_SEARCH_TIMEZONE || process.env.TZ || "").trim();
  if (envTimezone) return envTimezone;

  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved || "UTC";
}

function isSafeTimezone(timezone) {
  return (
    timezone === "UTC" ||
    timezone === "Etc/UTC" ||
    /^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+$/.test(timezone)
  );
}

function normalizeTimezone(timezone) {
  const candidate = resolveTimezone(timezone);
  return isSafeTimezone(candidate) ? candidate : "UTC";
}

function encodeTimezonePath(timezone) {
  return timezone
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function requestJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          accept: "application/json",
          "user-agent": "smart-search-mcp-adapter/1.0",
        },
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                "Time API request failed with HTTP " +
                  res.statusCode +
                  ": " +
                  body.slice(0, 200),
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error("Invalid JSON from time API: " + err.message));
          }
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Time API request timed out"));
    });
  });
}

function extractDatePartsFromDatetime(datetime, timezone) {
  if (typeof datetime === "string") {
    const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }
  }

  return extractDatePartsFromDate(new Date(), timezone);
}

function extractDatePartsFromDate(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(date);
    const map = {};

    for (const part of parts) {
      if (part.type !== "literal") map[part.type] = part.value;
    }

    const year = Number(map.year);
    const month = Number(map.month);
    const day = Number(map.day);

    if (!year || !month || !day) throw new Error("Incomplete date parts");

    return { year, month, day };
  } catch (_err) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const map = {};

    for (const part of parts) {
      if (part.type !== "literal") map[part.type] = part.value;
    }

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
    };
  }
}

function buildTemporalClock(parts, timezone, source) {
  return {
    timezone,
    source,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    dateLabel: parts.year + "年" + parts.month + "月" + parts.day + "日",
    dateNumericLabel:
      parts.year + "-" + pad2(parts.month) + "-" + pad2(parts.day),
    monthLabel: parts.year + "年" + parts.month + "月",
    monthNumericLabel: parts.year + "-" + pad2(parts.month),
    yearLabel: parts.year + "年",
    yearNumericLabel: String(parts.year),
  };
}

async function resolveTemporalClock(timezone) {
  const resolvedTimezone = normalizeTimezone(timezone);
  const cached = temporalClockCache.get(resolvedTimezone);

  if (cached && Date.now() - cached.fetchedAt < TIME_API_CACHE_TTL_MS) {
    return cached.value;
  }

  const url = TIME_API_BASE + "/" + encodeTimezonePath(resolvedTimezone);

  try {
    const payload = await requestJson(url);
    const parts = extractDatePartsFromDatetime(payload && payload.datetime, resolvedTimezone);
    const value = buildTemporalClock(parts, resolvedTimezone, "timeapi.world");

    temporalClockCache.set(resolvedTimezone, {
      fetchedAt: Date.now(),
      value,
    });

    return value;
  } catch (err) {
    const fallbackParts = extractDatePartsFromDate(new Date(), resolvedTimezone);
    const fallback = buildTemporalClock(fallbackParts, resolvedTimezone, "local-intl");

    temporalClockCache.set(resolvedTimezone, {
      fetchedAt: Date.now(),
      value: fallback,
    });

    log(
      "TEMPORAL CLOCK FALLBACK: " +
        resolvedTimezone +
        " -> " +
        err.message,
    );

    return fallback;
  }
}

function containsTemporalLabel(query, context) {
  return (
    query.includes(context.label) ||
    query.includes(context.numericLabel)
  );
}

function replaceTrailingTemporalSuffix(query, context) {
  const label = context.label;

  const prefix = "(?:\\s+|[，,；;、])(?:截至\\s*|截止到\\s*|截至到\\s*|截止于\\s*)?";
  const suffixPatterns = [
    new RegExp(prefix + "(?:\\d{4}年\\d{1,2}月\\d{1,2}[日号])\\s*$"),
    new RegExp(prefix + "(?:\\d{4}年\\d{1,2}月)\\s*$"),
    new RegExp(prefix + "(?:\\d{4}[-/]\\d{1,2}[-/]\\d{1,2})\\s*$"),
    new RegExp(prefix + "(?:\\d{4}[-/]\\d{1,2})\\s*$"),
    new RegExp(prefix + "(?:\\d{1,2}月\\d{1,2}[日号])\\s*$"),
    new RegExp(prefix + "(?:\\d{4}年)\\s*$"),
    new RegExp(prefix + "(?:\\d{4})\\s*$"),
  ];

  for (const pattern of suffixPatterns) {
    if (pattern.test(query)) {
      return query.replace(pattern, " " + label);
    }
  }

  return query;
}

const TEMPORAL_PATTERNS = [
  {
    name: "year",
    granularity: "year",
    pattern:
      /(?:\b(?:this|last|next)\s+year\b|今(?:年)|本(?:年)|去(?:年)|明(?:年)|近(?:一|1|\d+)\s*年|最近(?:一|1)\s*年|过去\d+\s*年|未来\d+\s*年)/i,
  },
  {
    name: "month",
    granularity: "month",
    pattern:
      /(?:\b(?:this|last|next)\s+month\b|本(?:月|個月|个月)|这(?:月|個月|个月)|上(?:月|個月|个月)|下(?:月|個月|个月)|近(?:一|1|\d+)\s*(?:月|個月|个月)|最近(?:一|1)\s*(?:月|個月|个月)|过去\d+\s*(?:月|個月|个月)|未来\d+\s*(?:月|個月|个月))/i,
  },
  {
    name: "week",
    granularity: "date",
    pattern:
      /(?:\b(?:this|last|next)\s+week\b|本(?:周|週|星期)|这(?:周|週|星期)|上(?:周|週|星期)|下(?:周|週|星期)|近\d+\s*(?:天|日|周|週|星期)|最近(?:一|1)\s*(?:周|週|星期)|过去\d+\s*(?:天|日|周|週|星期)|未来\d+\s*(?:天|日|周|週|星期))/i,
  },
  {
    name: "day",
    granularity: "date",
    pattern:
      /(?:\b(?:today|yesterday|tomorrow|latest|recent|recently|breaking)\b|今(?:天|日|早|晚)|昨(?:天|日)|前天|明(?:天|日)|后天|最新|实时|近期|近况|最近(?!\s*(?:一|1|\d+)\s*(?:周|週|星期|月|個月|个月|年)))/i,
  },
];

function getTemporalContext(query) {
  if (!query || typeof query !== "string") return { matched: false };

  if (/搜索时当前日期|当前日期[:：]/.test(query)) {
    return { matched: false };
  }

  for (const rule of TEMPORAL_PATTERNS) {
    if (rule.pattern.test(query)) {
      return { matched: true, name: rule.name, granularity: rule.granularity };
    }
  }

  return { matched: false };
}

async function normalizeTemporalQuery(query, options = {}) {
  if (!query || typeof query !== "string") {
    return { query, changed: false };
  }

  const context = getTemporalContext(query);
  if (!context.matched) return { query, changed: false };

  const clock = await resolveTemporalClock(options.timezone);
  const normalizedContext = {
    ...context,
    timezone: clock.timezone,
    source: clock.source,
    label:
      context.granularity === "year"
        ? clock.yearLabel
        : context.granularity === "month"
          ? clock.monthLabel
          : clock.dateLabel,
    numericLabel:
      context.granularity === "year"
        ? clock.yearNumericLabel
        : context.granularity === "month"
          ? clock.monthNumericLabel
          : clock.dateNumericLabel,
  };

  const original = query;
  let normalized = replaceTrailingTemporalSuffix(query.trim(), normalizedContext);

  if (!containsTemporalLabel(normalized, normalizedContext)) {
    normalized = (normalized + " " + normalizedContext.label).trim();
  }

  normalized = normalized.replace(/\s+/g, " ");

  if (normalized !== original) {
    log(
      "TEMPORAL QUERY: " +
        JSON.stringify(original) +
        " -> " +
        JSON.stringify(normalized),
    );

    writeAuditEvent({
      event: "temporal_query_normalized",
      original_query: original,
      normalized_query: normalized,
      temporal_context: normalizedContext,
    });
  }

  return {
    query: normalized,
    changed: normalized !== original,
    context: normalizedContext,
  };
}

function primaryQueryArgIndex(tool) {
  switch (normalizeToolName(tool)) {
    case "deep":
    case "search":
    case "exa-search":
    case "zhipu-search":
      return 1;
    default:
      return -1;
  }
}

async function normalizeTemporalArgs(args, options = {}) {
  if (!Array.isArray(args) || args.length < 2) return args;

  const positionalIndex = primaryQueryArgIndex(args[0]);
  let queryIndex = -1;
  let queryValueIndex = -1;

  if (
    positionalIndex >= 0 &&
    typeof args[positionalIndex] === "string" &&
    !args[positionalIndex].startsWith("--")
  ) {
    queryIndex = positionalIndex;
    queryValueIndex = positionalIndex;
  } else {
    const flagIndex = args.indexOf("--query");
    if (flagIndex !== -1 && flagIndex + 1 < args.length) {
      queryIndex = flagIndex;
      queryValueIndex = flagIndex + 1;
    }
  }

  if (queryValueIndex === -1 || typeof args[queryValueIndex] !== "string") return args;

  const normalized = await normalizeTemporalQuery(args[queryValueIndex], options);
  if (!normalized.changed) return args;

  const nextArgs = args.slice();
  nextArgs[queryValueIndex] = normalized.query;

  return nextArgs;
}

module.exports = {
  getTemporalContext,
  normalizeTemporalArgs,
  normalizeTemporalQuery,
  resolveTemporalClock,
};
