// provider-policy.js - adapter-level provider routing policy

const SEARCH_PROVIDER_ALLOWLIST = [
  "xai-responses",
  "openai-compatible",
  "tavily",
  "firecrawl",
  "exa",
];

const SEARCH_PROVIDER_CSV = SEARCH_PROVIDER_ALLOWLIST.join(",");
const DEFAULT_EXTRA_SOURCES = 3;

const CONTEXT7_TOOLS = new Set(["context7-library", "context7-docs"]);
const BLOCKED_TOOLS = new Set(["zhipu-search", ...CONTEXT7_TOOLS]);
const PUBLIC_ALLOWED_TOOLS = [
  "exa-search",
  "exa-similar",
  "fetch",
  "map",
  "search",
];

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

function normalizeStepTool(tool) {
  if (!tool || typeof tool !== "string") return undefined;
  return tool.replace(/^smart_/, "").replace(/_/g, "-");
}

function hasOption(args, longName) {
  return args.some((arg) => arg === longName || arg.startsWith(longName + "="));
}

function setOrAppendOption(args, longName, value) {
  const updated = [...args];
  for (let i = 0; i < updated.length; i += 1) {
    if (updated[i] === longName) {
      if (i + 1 < updated.length) updated[i + 1] = value;
      else updated.push(value);
      return updated;
    }
    if (updated[i].startsWith(longName + "=")) {
      updated[i] = longName + "=" + value;
      return updated;
    }
  }
  updated.push(longName, value);
  return updated;
}

function appendOptionIfMissing(args, longName, value) {
  return hasOption(args, longName) ? args : [...args, longName, value];
}

function ensureSearchProviderPolicy(args, options = {}) {
  let updated = [...args];
  if (updated[0] !== "search") return updated;

  updated = setOrAppendOption(updated, "--providers", SEARCH_PROVIDER_CSV);

  const defaultExtraSources =
    options.defaultExtraSources === undefined
      ? DEFAULT_EXTRA_SOURCES
      : options.defaultExtraSources;

  if (defaultExtraSources > 0 && !hasOption(updated, "--extra-sources")) {
    updated.push("--extra-sources", String(defaultExtraSources));
  }

  return updated;
}

function ensureJsonFormat(args, format) {
  return hasOption(args, "--format")
    ? args
    : [...args, "--format", format || "json"];
}

function quoteCommandArg(value) {
  const text = String(value || "");
  if (text && !/[\s"&|<>^]/.test(text)) return text;
  return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function commandFromArgs(args) {
  return "smart-search " + args.map(quoteCommandArg).join(" ");
}

function queryFromStep(step, fallbackQuestion) {
  if (step.query) return step.query;
  if (step.question) return step.question;
  if (step.command) {
    const args = parseCommandArgs(step.command);
    const offset = args[0] === "smart-search" ? 1 : 0;
    const tool = normalizeStepTool(args[offset]);

    if (tool === "zhipu-search") return args[offset + 1] || fallbackQuestion;
    if (tool === "context7-library")
      return args[offset + 2] || args[offset + 1] || fallbackQuestion;
    if (tool === "context7-docs")
      return args[offset + 2] || args[offset + 1] || fallbackQuestion;
    if (tool === "search" || tool === "exa-search")
      return args[offset + 1] || fallbackQuestion;
  }
  return fallbackQuestion || "";
}

function outputPathForReplacement(step, replacementName) {
  const outputPath = step.output_path || "";
  if (!outputPath) return outputPath;
  return outputPath
    .replace(/zhipu/gi, replacementName)
    .replace(/context7-library/gi, replacementName)
    .replace(/context7-docs/gi, replacementName)
    .replace(/context7/gi, replacementName);
}

function makeSearchReplacementStep(step, fallbackQuestion) {
  const query = queryFromStep(step, fallbackQuestion);
  const outputPath = outputPathForReplacement(step, "web-search");
  const args = ensureSearchProviderPolicy(
    ensureJsonFormat(["search", query, "--validation", "balanced"], "json"),
    { defaultExtraSources: DEFAULT_EXTRA_SOURCES },
  );

  return {
    ...step,
    tool: "search",
    purpose:
      step.purpose ||
      "web source discovery via Tavily with Firecrawl fallback",
    command: outputPath
      ? commandFromArgs([...args, "--output", outputPath])
      : commandFromArgs(args),
    output_path: outputPath || step.output_path,
    provider_policy_note:
      "rewritten from zhipu-search; adapter allows Tavily first and Firecrawl fallback for web search",
  };
}

function normalizeCapabilityTools(tools) {
  const normalized = [];
  for (const item of tools || []) {
    const tool = normalizeStepTool(item);
    if (!tool || CONTEXT7_TOOLS.has(tool)) continue;
    const replacement = tool === "zhipu-search" ? "search" : tool;
    if (PUBLIC_ALLOWED_TOOLS.includes(replacement) && !normalized.includes(replacement)) {
      normalized.push(replacement);
    }
  }
  return normalized;
}

function applyProviderPolicyToPlan(plan) {
  const outer =
    plan && plan.research_plan && typeof plan.research_plan === "object"
      ? { ...plan, research_plan: { ...plan.research_plan } }
      : { ...plan };
  const target = outer.research_plan || outer;
  const question = target.question || outer.question || "";
  const adjustments = [];

  if (Array.isArray(target.capability_plan)) {
    target.capability_plan = target.capability_plan
      .map((item) => ({
        ...item,
        tools: normalizeCapabilityTools(item.tools),
      }))
      .filter((item) => item.tools.length > 0);
  }

  if (Array.isArray(target.steps)) {
    const nextSteps = [];
    for (const step of target.steps) {
      const tool = normalizeStepTool(step.tool || "");

      if (tool === "zhipu-search") {
        const replacement = makeSearchReplacementStep(step, question);
        nextSteps.push(replacement);
        adjustments.push({
          step_id: step.id,
          from: "zhipu-search",
          to: "search",
          reason: "web search is pinned to Tavily first, Firecrawl fallback",
        });
        continue;
      }

      if (CONTEXT7_TOOLS.has(tool)) {
        adjustments.push({
          step_id: step.id,
          from: tool,
          to: null,
          reason: "documentation search is pinned to Exa only",
        });
        continue;
      }

      let nextStep = { ...step };
    if (tool === "search" && nextStep.command) {
      let args = parseCommandArgs(nextStep.command);
      if (args[0] === "smart-search") args = args.slice(1);
      args = ensureSearchProviderPolicy(args, {
        defaultExtraSources: DEFAULT_EXTRA_SOURCES,
      });
      nextStep.command = commandFromArgs(args);
    }
      nextSteps.push(nextStep);
    }
    target.steps = nextSteps;
  }

  target.allowed_tools = PUBLIC_ALLOWED_TOOLS;
  target.provider_policy = {
    web_search: "tavily-first-firecrawl-fallback",
    docs_search: "exa-only",
    search_provider_allowlist: SEARCH_PROVIDER_ALLOWLIST,
  };
  target.provider_policy_adjustments = adjustments;

  return outer.research_plan ? outer : target;
}

function normalizeStepArgsForProviderPolicy(args, options = {}) {
  let updated = [...args];
  const tool = normalizeStepTool(updated[0]);

  if (tool === "zhipu-search") {
    updated = ["search", updated[1] || "", "--validation", "balanced"];
    updated = ensureSearchProviderPolicy(updated, {
      defaultExtraSources: options.defaultExtraSources || DEFAULT_EXTRA_SOURCES,
    });
    return ensureJsonFormat(updated, options.format);
  }

  if (CONTEXT7_TOOLS.has(tool)) {
    const query = tool === "context7-docs"
      ? updated[2] || updated[1] || ""
      : updated[2] || updated[1] || "";
    return ensureJsonFormat(["exa-search", query, "--num-results", "5"], options.format);
  }

  if (tool === "search") {
    updated = ensureSearchProviderPolicy(updated, {
      defaultExtraSources:
        options.defaultExtraSources === undefined ? 0 : options.defaultExtraSources,
    });
  }

  return updated;
}

module.exports = {
  SEARCH_PROVIDER_ALLOWLIST,
  SEARCH_PROVIDER_CSV,
  DEFAULT_EXTRA_SOURCES,
  BLOCKED_TOOLS,
  PUBLIC_ALLOWED_TOOLS,
  ensureSearchProviderPolicy,
  applyProviderPolicyToPlan,
  normalizeStepArgsForProviderPolicy,
};
