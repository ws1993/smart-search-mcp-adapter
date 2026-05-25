// handlers/exa-search.js - smart_exa_search 处理器

const { runSmartSearch } = require("../cli-executor");

async function handleSmartExaSearch(args) {
  const a = ["exa-search", args.query];

  if (args.num_results) a.push("--num-results", String(args.num_results));
  if (args.search_type) a.push("--search-type", args.search_type);
  if (args.include_domains) a.push("--include-domains", args.include_domains);
  if (args.exclude_domains) a.push("--exclude-domains", args.exclude_domains);

  return await runSmartSearch(a);
}

module.exports = { handleSmartExaSearch };
