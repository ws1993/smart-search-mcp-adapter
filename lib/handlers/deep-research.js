// handlers/deep-research.js - smart_deep_research 处理器

const { runSmartSearch, normalizeBudget } = require("../cli-executor");
const { logResearchEvent } = require("../logger");
const { applyProviderPolicyToPlan } = require("../provider-policy");
const {
  makeResearchId,
  parseJsonOutput,
  getPlanSteps,
  validateResearchPlan,
} = require("../utils/step-utils");
const { summarizeSession, renderMarkdownResponse } = require("../utils/session-utils");

const RESEARCH_SESSIONS = new Map();

async function handleDeepResearch(args) {
  const budget = normalizeBudget(args.budget);
  const format = args.format || "json";
  const timezone = args.timezone;

  const commandArgs = [
    "deep",
    args.query,
    "--budget",
    budget,
    "--format",
    "json",
  ];

  if (args.model) commandArgs.push("--model", args.model);

  const output = await runSmartSearch(commandArgs, { timezone });
  const plan = validateResearchPlan(
    applyProviderPolicyToPlan(parseJsonOutput(output)),
  );
  const steps = getPlanSteps(plan);
  const researchId = makeResearchId();

  RESEARCH_SESSIONS.set(researchId, {
    research_id: researchId,
    plan,
    progress: { completed: new Set(), failed: new Set() },
    stepResults: [],
    createdAt: new Date().toISOString(),
    query: args.query,
    budget,
    timezone,
    status: "planned",
    required_inputs: [],
  });

  logResearchEvent(researchId, "PLANNED " + steps.length + " steps", {
    event: "planned",
    query: args.query,
    budget,
    step_count: steps.length,
  });

  const payload = summarizeSession(
    RESEARCH_SESSIONS.get(researchId),
    "planned",
  );

  return format === "markdown"
    ? renderMarkdownResponse(payload)
    : JSON.stringify(payload, null, 2);
}

module.exports = {
  handleDeepResearch,
  RESEARCH_SESSIONS,
};
