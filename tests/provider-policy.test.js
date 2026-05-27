const assert = require("assert");

const {
  SEARCH_PROVIDER_CSV,
  applyProviderPolicyToPlan,
  normalizeStepArgsForProviderPolicy,
} = require("../lib/provider-policy");
const {
  buildSmartSearchArgs,
  DEFAULT_SMART_SEARCH_EXTRA_SOURCES,
} = require("../lib/handlers/search");
const {
  DEFAULT_SMART_SEARCH_TIMEOUT_MS,
  resolveSmartSearchTimeoutMs,
} = require("../lib/cli-executor");

const rawPlan = {
  mode: "deep_research",
  question: "React useEffect 最新文档",
  capability_plan: [
    {
      capability: "docs_source_discovery",
      tools: ["exa-search", "context7-library", "context7-docs"],
    },
    {
      capability: "current_or_locale_source_discovery",
      tools: ["zhipu-search"],
    },
  ],
  steps: [
    {
      id: "s1",
      tool: "search",
      command:
        'smart-search search "React useEffect 最新文档" --validation balanced --format json',
      output_path: "C:\\tmp\\01-search.json",
    },
    {
      id: "s2",
      tool: "exa-search",
      command:
        'smart-search exa-search "React useEffect 最新文档" --num-results 5 --format json',
      output_path: "C:\\tmp\\02-exa.json",
    },
    {
      id: "s3",
      tool: "context7-library",
      command:
        'smart-search context7-library "React" "React useEffect 最新文档" --format json',
      output_path: "C:\\tmp\\03-context7-library.json",
    },
    {
      id: "s4",
      tool: "zhipu-search",
      command:
        'smart-search zhipu-search "React useEffect 最新文档" --count 5 --format json',
      output_path: "C:\\tmp\\04-zhipu.json",
    },
  ],
};

const plan = applyProviderPolicyToPlan(rawPlan);
assert.deepStrictEqual(plan.allowed_tools, [
  "exa-search",
  "exa-similar",
  "fetch",
  "map",
  "search",
]);

assert(!plan.steps.some((step) => /^context7/.test(step.tool)));
assert(!plan.steps.some((step) => step.tool === "zhipu-search"));

const searchSteps = plan.steps.filter((step) => step.tool === "search");
assert.strictEqual(searchSteps.length, 2);
for (const step of searchSteps) {
  assert(step.command.includes("--providers"));
  assert(step.command.includes(SEARCH_PROVIDER_CSV));
  assert(step.command.includes("--extra-sources"));
}

const capabilityTools = plan.capability_plan.flatMap((item) => item.tools);
assert(!capabilityTools.includes("context7-library"));
assert(!capabilityTools.includes("context7-docs"));
assert(!capabilityTools.includes("zhipu-search"));
assert(capabilityTools.includes("search"));
assert(capabilityTools.includes("exa-search"));

assert.deepStrictEqual(
  normalizeStepArgsForProviderPolicy(["context7-docs", "/react/react", "hooks"], {
    format: "json",
  }),
  ["exa-search", "hooks", "--num-results", "5", "--format", "json"],
);

const zhipuArgs = normalizeStepArgsForProviderPolicy(
  ["zhipu-search", "今天 AI 新闻"],
  { format: "json" },
);
assert.strictEqual(zhipuArgs[0], "search");
assert(zhipuArgs.includes("--providers"));
assert(zhipuArgs.includes(SEARCH_PROVIDER_CSV));
assert(zhipuArgs.includes("--extra-sources"));

const defaultSearchArgs = buildSmartSearchArgs({ query: "MCP timeout" });
const defaultExtraIndex = defaultSearchArgs.indexOf("--extra-sources");
assert(defaultExtraIndex !== -1);
assert.strictEqual(
  defaultSearchArgs[defaultExtraIndex + 1],
  String(DEFAULT_SMART_SEARCH_EXTRA_SOURCES),
);

const zeroExtraArgs = buildSmartSearchArgs({
  query: "MCP timeout",
  extra_sources: 0,
});
const zeroExtraIndexes = zeroExtraArgs
  .map((arg, index) => (arg === "--extra-sources" ? index : -1))
  .filter((index) => index !== -1);
assert.strictEqual(zeroExtraIndexes.length, 1);
assert.strictEqual(zeroExtraArgs[zeroExtraIndexes[0] + 1], "0");

assert.throws(
  () => buildSmartSearchArgs({ query: "MCP timeout", extra_sources: 6 }),
  /extra_sources must be an integer from 0 to 5/,
);

const originalTimeoutEnv = process.env.SMART_SEARCH_MCP_TIMEOUT_MS;
try {
  delete process.env.SMART_SEARCH_MCP_TIMEOUT_MS;
  assert.strictEqual(
    resolveSmartSearchTimeoutMs(),
    DEFAULT_SMART_SEARCH_TIMEOUT_MS,
  );

  process.env.SMART_SEARCH_MCP_TIMEOUT_MS = "90000";
  assert.strictEqual(resolveSmartSearchTimeoutMs(), 90000);

  process.env.SMART_SEARCH_MCP_TIMEOUT_MS = "invalid";
  assert.strictEqual(
    resolveSmartSearchTimeoutMs(),
    DEFAULT_SMART_SEARCH_TIMEOUT_MS,
  );
} finally {
  if (originalTimeoutEnv === undefined) {
    delete process.env.SMART_SEARCH_MCP_TIMEOUT_MS;
  } else {
    process.env.SMART_SEARCH_MCP_TIMEOUT_MS = originalTimeoutEnv;
  }
}

console.log("provider policy tests passed");
