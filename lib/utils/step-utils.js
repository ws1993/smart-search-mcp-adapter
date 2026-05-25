// utils/step-utils.js - 步骤处理工具函数

const crypto = require("crypto");
const { STEP_TOOL_WHITELIST, SEARCH_LIKE_STEP_TOOLS } = require("../constants");

function makeResearchId() {
  return "research_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
}

function parseJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch (_err) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start)
      return JSON.parse(text.slice(start, end + 1));

    throw new Error("smart-search deep did not return valid JSON");
  }
}

function getPlanSteps(plan) {
  if (Array.isArray(plan.steps)) return plan.steps;
  if (Array.isArray(plan.plan)) return plan.plan;
  if (Array.isArray(plan.research_plan && plan.research_plan.steps))
    return plan.research_plan.steps;
  return [];
}

function parseCommandArgs(command) {
  const tokens = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    const next = command[i + 1];

    if (
      ch === "\\" &&
      quote !== "'" &&
      (next === quote || next === '"' || next === "\\")
    ) {
      current += next;
      i += 1;
      continue;
    }

    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

function inferToolFromCommand(command) {
  if (!command || typeof command !== "string") return undefined;
  const tokens = parseCommandArgs(command);
  const first = tokens[0] === "smart-search" ? tokens[1] : tokens[0];
  return first;
}

function normalizeStepTool(tool) {
  if (!tool || typeof tool !== "string") return undefined;
  return tool.replace(/^smart_/, "").replace(/_/g, "-");
}

function normalizeStep(step, index) {
  return {
    id: String(step.id || step.step_id || "step_" + (index + 1)),
    question: step.question || step.query || step.objective || step.title || "",
    tool:
      normalizeStepTool(step.tool || inferToolFromCommand(step.command)) ||
      "search",
    reason: step.reason || step.rationale || "",
    command: step.command,
    query: step.query,
    url: step.url,
    raw: step,
  };
}

function publicStep(step, index) {
  const normalized = normalizeStep(step, index);
  return {
    id: normalized.id,
    question: normalized.question,
    tool: normalized.tool,
    reason: normalized.reason,
  };
}

function validateResearchPlan(plan) {
  const normalizedPlan =
    plan.research_plan && typeof plan.research_plan === "object"
      ? plan.research_plan
      : plan;

  if (normalizedPlan.mode !== "deep_research") {
    throw new Error(
      'Invalid deep research plan: expected mode "deep_research"',
    );
  }

  const steps = getPlanSteps(normalizedPlan);

  for (const step of steps) {
    const tool = normalizeStepTool(
      step.tool || inferToolFromCommand(step.command),
    );

    if (!tool) continue;

    if (tool === "doctor")
      throw new Error(
        "Invalid deep research plan: doctor can only be used for preflight, not research steps",
      );

    if (!STEP_TOOL_WHITELIST.has(tool))
      throw new Error(
        "Invalid deep research plan: unsupported step tool " + tool,
      );
  }

  return normalizedPlan;
}

function stripOutputArgs(args) {
  const stripped = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--output=")) continue;
    stripped.push(arg);
  }
  return stripped;
}

function hasFormatArg(args) {
  return args.some((arg) => arg === "--format" || arg.startsWith("--format="));
}

function selectedUrlForStep(selectedUrls, stepId) {
  if (!selectedUrls || typeof selectedUrls !== "object") return undefined;
  return (
    selectedUrls[stepId] || selectedUrls["<key-url>"] || selectedUrls.key_url
  );
}

function replacePlaceholders(args, stepId, selectedUrls) {
  const selectedUrl = selectedUrlForStep(selectedUrls, stepId);
  const hasPlaceholder = args.some(
    (arg) => typeof arg === "string" && arg.includes("<key-url>"),
  );

  if (hasPlaceholder && !selectedUrl) {
    return { needsInput: true, args };
  }

  return {
    needsInput: false,
    args: args.map((arg) =>
      typeof arg === "string"
        ? arg.replace(/<key-url>/g, selectedUrl || "")
        : arg,
    ),
  };
}

function stepArgsFromCommand(command, stepId, selectedUrls, format) {
  let args = parseCommandArgs(command);
  if (args[0] === "smart-search") args = args.slice(1);
  args = stripOutputArgs(args);

  const replaced = replacePlaceholders(args, stepId, selectedUrls);
  if (replaced.needsInput) return replaced;

  args = replaced.args;
  const tool = normalizeStepTool(args[0]);

  if (tool === "doctor")
    throw new Error(
      "doctor can only be used for preflight, not research steps",
    );

  if (!STEP_TOOL_WHITELIST.has(tool))
    throw new Error("Unsupported deep research step tool: " + tool);

  if ((tool === "search" || tool === "fetch") && !hasFormatArg(args))
    args.push("--format", format || "json");

  return { needsInput: false, args };
}

function buildStepArgs(step, index, selectedUrls, format) {
  const normalized = normalizeStep(step, index);

  if (normalized.command)
    return stepArgsFromCommand(
      normalized.command,
      normalized.id,
      selectedUrls,
      format,
    );

  if (normalized.tool === "doctor")
    throw new Error(
      "doctor can only be used for preflight, not research steps",
    );

  if (!STEP_TOOL_WHITELIST.has(normalized.tool))
    throw new Error("Unsupported deep research step tool: " + normalized.tool);

  if (normalized.tool === "fetch") {
    const url =
      normalized.url || selectedUrlForStep(selectedUrls, normalized.id);
    if (!url || url === "<key-url>")
      return { needsInput: true, args: ["fetch", "<key-url>"] };
    return {
      needsInput: false,
      args: ["fetch", url, "--format", format || "json"],
    };
  }

  if (normalized.tool === "map") {
    const url =
      normalized.url || selectedUrlForStep(selectedUrls, normalized.id);
    if (!url || url === "<key-url>")
      return { needsInput: true, args: ["map", "<key-url>"] };
    return { needsInput: false, args: ["map", url] };
  }

  if (normalized.tool === "exa-search") {
    return {
      needsInput: false,
      args: ["exa-search", normalized.query || normalized.question],
    };
  }

  if (SEARCH_LIKE_STEP_TOOLS.has(normalized.tool)) {
    return {
      needsInput: false,
      args: [normalized.tool, normalized.query || normalized.question],
    };
  }

  return {
    needsInput: false,
    args: [
      "search",
      normalized.query || normalized.question,
      "--format",
      format || "json",
    ],
  };
}

module.exports = {
  makeResearchId,
  parseJsonOutput,
  getPlanSteps,
  parseCommandArgs,
  inferToolFromCommand,
  normalizeStepTool,
  normalizeStep,
  publicStep,
  validateResearchPlan,
  buildStepArgs,
  selectedUrlForStep,
};
