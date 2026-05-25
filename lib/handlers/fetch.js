// handlers/fetch.js - smart_fetch 处理器

const { runSmartSearch } = require("../cli-executor");

async function handleSmartFetch(args) {
  const a = ["fetch", args.url, "--format", args.format || "markdown"];
  return await runSmartSearch(a);
}

module.exports = { handleSmartFetch };
