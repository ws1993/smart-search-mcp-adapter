const assert = require("assert");

const {
  SEARCH_PROVIDER_CSV,
  applyProviderPolicyToPlan,
  normalizeStepArgsForProviderPolicy,
} = require("../lib/provider-policy");

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

console.log("provider policy tests passed");
