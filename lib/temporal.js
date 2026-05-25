// temporal.js - 时间上下文处理

function pad2(value) {
  return String(value).padStart(2, "0");
}

function makeLocalDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function makeLocalMonth(offsetMonths = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
}

function makeLocalYear(offsetYears = 0) {
  const now = new Date();
  return now.getFullYear() + offsetYears;
}

function formatChineseDate(date) {
  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}

function formatNumericDate(date) {
  return (
    date.getFullYear() +
    "-" +
    pad2(date.getMonth() + 1) +
    "-" +
    pad2(date.getDate())
  );
}

function formatChineseMonth(date) {
  return date.getFullYear() + "年" + (date.getMonth() + 1) + "月";
}

function formatChineseYear(year) {
  return year + "年";
}

function getTemporalContext(query) {
  const rules = [
    {
      name: "day_before_yesterday",
      pattern: /前天/,
      label: () => formatChineseDate(makeLocalDate(-2)),
      numericLabel: () => formatNumericDate(makeLocalDate(-2)),
      granularity: "date",
    },
    {
      name: "yesterday",
      pattern: /昨天|昨日/,
      label: () => formatChineseDate(makeLocalDate(-1)),
      numericLabel: () => formatNumericDate(makeLocalDate(-1)),
      granularity: "date",
    },
    {
      name: "tomorrow",
      pattern: /明天|明日/,
      label: () => formatChineseDate(makeLocalDate(1)),
      numericLabel: () => formatNumericDate(makeLocalDate(1)),
      granularity: "date",
    },
    {
      name: "today",
      pattern: /今天|今日/,
      label: () => formatChineseDate(makeLocalDate(0)),
      numericLabel: () => formatNumericDate(makeLocalDate(0)),
      granularity: "date",
    },
    {
      name: "last_month",
      pattern: /上个?月/,
      label: () => formatChineseMonth(makeLocalMonth(-1)),
      numericLabel: () => {
        const d = makeLocalMonth(-1);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
      },
      granularity: "month",
    },
    {
      name: "this_month",
      pattern: /这个?月|本月/,
      label: () => formatChineseMonth(makeLocalMonth(0)),
      numericLabel: () => {
        const d = makeLocalMonth(0);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
      },
      granularity: "month",
    },
    {
      name: "next_month",
      pattern: /下个?月/,
      label: () => formatChineseMonth(makeLocalMonth(1)),
      numericLabel: () => {
        const d = makeLocalMonth(1);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
      },
      granularity: "month",
    },
    {
      name: "last_year",
      pattern: /去年/,
      label: () => formatChineseYear(makeLocalYear(-1)),
      numericLabel: () => String(makeLocalYear(-1)),
      granularity: "year",
    },
    {
      name: "this_year",
      pattern: /今年/,
      label: () => formatChineseYear(makeLocalYear(0)),
      numericLabel: () => String(makeLocalYear(0)),
      granularity: "year",
    },
    {
      name: "next_year",
      pattern: /明年/,
      label: () => formatChineseYear(makeLocalYear(1)),
      numericLabel: () => String(makeLocalYear(1)),
      granularity: "year",
    },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(query)) {
      return {
        matched: true,
        name: rule.name,
        label: rule.label(),
        numericLabel: rule.numericLabel(),
        granularity: rule.granularity,
      };
    }
  }

  return { matched: false };
}

function normalizeTemporalArgs(args) {
  const queryIndex = args.indexOf("--query");
  if (queryIndex === -1 || queryIndex + 1 >= args.length) return args;

  const query = args[queryIndex + 1];
  const ctx = getTemporalContext(query);

  if (!ctx.matched) return args;

  const newArgs = [...args];
  newArgs.push("--temporal-context", ctx.numericLabel);

  return newArgs;
}

module.exports = {
  getTemporalContext,
  normalizeTemporalArgs,
};
