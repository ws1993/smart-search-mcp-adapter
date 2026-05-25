// handlers/index.js - 统一导出所有 handlers

const { handleSmartSearch } = require("./search");
const { handleDeepResearch } = require("./deep-research");
const { handleDeepExecute } = require("./deep-execute");
const { handleDeepRun } = require("./deep-run");
const { handleDeepStatus } = require("./deep-status");
const { handleSmartFetch } = require("./fetch");
const { handleSmartMap } = require("./map");
const { handleSmartExaSearch } = require("./exa-search");
const { handleSmartDoctor } = require("./doctor");

async function handleTool(name, args) {
  switch (name) {
    case "smart_search":
      return await handleSmartSearch(args);

    case "smart_deep_research":
      return await handleDeepResearch(args);

    case "smart_deep_execute":
      return await handleDeepExecute(args);

    case "smart_deep_run":
      return await handleDeepRun(args);

    case "smart_deep_status":
      return handleDeepStatus(args);

    case "smart_fetch":
      return await handleSmartFetch(args);

    case "smart_map":
      return await handleSmartMap(args);

    case "smart_exa_search":
      return await handleSmartExaSearch(args);

    case "smart_doctor":
      return await handleSmartDoctor(args);

    default:
      throw new Error("Unknown tool: " + name);
  }
}

module.exports = { handleTool };
