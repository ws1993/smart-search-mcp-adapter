// handlers/search.js - smart_search 处理器

const { runSmartSearch } = require("../cli-executor");
const { ensureSearchProviderPolicy } = require("../provider-policy");

async function handleSmartSearch(args) {
  let a = ["search", args.query, "--format", args.format || "markdown"];

  if (args.extra_sources > 0)
    a.push("--extra-sources", String(args.extra_sources));

  if (args.validation) a.push("--validation", args.validation);

  if (args.model) a.push("--model", args.model);

  a = ensureSearchProviderPolicy(a, {
    defaultExtraSources: args.extra_sources > 0 ? 0 : 3,
  });

  return await runSmartSearch(a, { timezone: args.timezone });
}

module.exports = { handleSmartSearch };
