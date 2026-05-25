// constants.js - 常量定义

const STEP_TOOL_WHITELIST = new Set([
  "search",
  "fetch",
  "map",
  "exa-search",
  "exa_search",
  "exa-similar",
  "exa_similar",
  "zhipu-search",
  "zhipu_search",
  "context7-library",
  "context7_library",
  "context7-docs",
  "context7_docs",
]);

const SEARCH_LIKE_STEP_TOOLS = new Set([
  "search",
  "exa-search",
  "exa_search",
  "exa-similar",
  "exa_similar",
  "zhipu-search",
  "zhipu_search",
  "context7-library",
  "context7_library",
  "context7-docs",
  "context7_docs",
]);

module.exports = {
  STEP_TOOL_WHITELIST,
  SEARCH_LIKE_STEP_TOOLS,
};
