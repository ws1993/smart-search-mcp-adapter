// handlers/deep-run.js - smart_deep_run 处理器

const { handleDeepExecute } = require("./deep-execute");

async function handleDeepRun(args) {
  const mergedArgs = {
    ...args,
    max_steps: args.max_steps || 20,
    auto_select_urls: args.auto_select_urls !== false,
  };

  return await handleDeepExecute(mergedArgs);
}

module.exports = { handleDeepRun };
