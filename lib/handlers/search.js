// handlers/search.js - smart_search 处理器

const { runSmartSearch } = require("../cli-executor");

async function handleSmartSearch(args) {
  const a = ["search", args.query, "--format", args.format || "markdown"];

  if (args.extra_sources > 0)
    a.push("--extra-sources", String(args.extra_sources));

  if (args.validation) a.push("--validation", args.validation);

  if (args.model) a.push("--model", args.model);

  return await runSmartSearch(a);
}

module.exports = { handleSmartSearch };
