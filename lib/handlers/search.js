// handlers/search.js - smart_search 处理器

const { runSmartSearch } = require("../cli-executor");
const { ensureSearchProviderPolicy } = require("../provider-policy");

const DEFAULT_SMART_SEARCH_EXTRA_SOURCES = 1;

function hasExplicitExtraSources(args) {
  return (
    Object.prototype.hasOwnProperty.call(args, "extra_sources") &&
    args.extra_sources !== undefined &&
    args.extra_sources !== null
  );
}

function normalizeExtraSources(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 5) {
    throw new Error("extra_sources must be an integer from 0 to 5");
  }
  return numeric;
}

function buildSmartSearchArgs(args) {
  let a = ["search", args.query, "--format", args.format || "markdown"];
  const hasExtraSources = hasExplicitExtraSources(args);

  if (hasExtraSources) {
    a.push("--extra-sources", String(normalizeExtraSources(args.extra_sources)));
  }

  if (args.validation) a.push("--validation", args.validation);

  if (args.model) a.push("--model", args.model);

  a = ensureSearchProviderPolicy(a, {
    defaultExtraSources: hasExtraSources ? 0 : DEFAULT_SMART_SEARCH_EXTRA_SOURCES,
  });

  return a;
}

async function handleSmartSearch(args) {
  const a = buildSmartSearchArgs(args);

  return await runSmartSearch(a, { timezone: args.timezone });
}

module.exports = {
  DEFAULT_SMART_SEARCH_EXTRA_SOURCES,
  buildSmartSearchArgs,
  handleSmartSearch,
};
