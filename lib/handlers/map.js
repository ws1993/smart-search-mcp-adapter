// handlers/map.js - smart_map 处理器

const { runSmartSearch } = require("../cli-executor");

async function handleSmartMap(args) {
  const a = ["map", args.url];

  if (args.instructions) a.push("--instructions", args.instructions);
  if (args.max_depth) a.push("--max-depth", String(args.max_depth));
  if (args.max_breadth) a.push("--max-breadth", String(args.max_breadth));
  if (args.limit) a.push("--limit", String(args.limit));

  return await runSmartSearch(a);
}

module.exports = { handleSmartMap };
