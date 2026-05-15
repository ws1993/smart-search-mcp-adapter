#!/usr/bin/env node

// smart-search-mcp.js

// 把 smart-search CLI 包装成标准 MCP STDIO 服务器，供 Cherry Studio 等客户端使用

// MCP STDIO 传输协议：换行分隔的 JSON-RPC 2.0（NDJSON）

const { spawn } = require("child_process");

const readline = require("readline");

const crypto = require("crypto");

const RESEARCH_SESSIONS = new Map();

const STEP_TOOL_WHITELIST = new Set(["search", "fetch", "map", "exa-search", "exa_search"]);

// ─── stderr 调试日志（Cherry Studio 的 MCP 日志面板可以看到）───

function log(msg) {

  process.stderr.write("[smart-search-mcp] " + msg + "\n");

}

process.on("uncaughtException", (e) => {

  log("UNCAUGHT: " + e.message + "\n" + e.stack);

  process.exit(1);

});

process.on("unhandledRejection", (e) => {

  log("UNHANDLED REJECTION: " + e);

});

// ─── MCP 协议：往 stdout 写一行 JSON ───

function send(obj) {

  process.stdout.write(JSON.stringify(obj) + "\n");

}

// ─── 工具定义 ───

const TOOLS = [

  {

    name: "smart_search",

    description:

      "一次性快速搜索，调用 smart-search search 命令。适合简单查询，不适合深度调研、核验、多步取证等复杂任务；这些任务应优先使用 smart_deep_research。",

    inputSchema: {

      type: "object",

      properties: {

        query: { type: "string", description: "搜索查询内容" },

        extra_sources: {

          type: "number",

          description: "补充来源数（0=不补充，1-5=额外调用 Tavily/Firecrawl）",

          default: 0,

        },

        validation: {

          type: "string",

          enum: ["fast", "balanced", "strict"],

          description: "交叉验证强度",

          default: "balanced",

        },

        format: {

          type: "string",

          enum: ["json", "markdown"],

          default: "markdown",

        },

        model: { type: "string", description: "指定模型 ID（可选）" },

      },

      required: ["query"],

    },

  },

  {

    name: "smart_deep_research",

    description:

      "深度搜索/深度调研规划入口。当用户提到深度搜索、深度调研、核验、对比、选型、多来源、serious review、deep research 时优先调用此工具，而不是 smart_search。只生成计划并创建研究会话，不会隐式执行全部步骤。",

    inputSchema: {

      type: "object",

      properties: {

        query: { type: "string", description: "研究主题或问题" },

        budget: {

          type: "string",

          enum: ["quick", "standard", "deep"],

          description: "研究预算/深度；旧调用中的 balanced 会兼容映射为 standard",

          default: "standard",

        },

        format: {

          type: "string",

          enum: ["json", "markdown"],

          description: "计划输出格式；建议使用 json 以便后续执行",

          default: "json",

        },

        model: { type: "string", description: "指定模型 ID（可选）" },

      },

      required: ["query"],

    },

  },

  {

    name: "smart_deep_execute",

    description:

      "按 research_id 执行 Deep Research 会话中的下一个可执行步骤。常在 smart_deep_research 返回 planned 后连续调用，直到 ready_for_answer 为 true 或 status 为 needs_input。",

    inputSchema: {

      type: "object",

      properties: {

        research_id: { type: "string", description: "smart_deep_research 返回的研究会话 ID" },

        max_steps: { type: "number", description: "本次最多执行的步骤数", default: 1 },

        selected_urls: {

          type: "object",

          description: "为包含 <key-url> 占位符的 fetch 步骤提供 URL，例如 {\"step_3\": \"https://example.com\"}",

          additionalProperties: { type: "string" },

        },

        format: { type: "string", enum: ["json", "markdown"], default: "json" },

      },

      required: ["research_id"],

    },

  },

  {

    name: "smart_fetch",

    description:

      "抓取指定 URL 的网页正文，转换为 Markdown。优先用 Tavily，失败则用 Firecrawl 兜底。常作为 Deep Research 的后续步骤。",

    inputSchema: {

      type: "object",

      properties: {

        url: { type: "string", description: "要抓取的网页 URL" },

        format: { type: "string", enum: ["json", "markdown"], default: "markdown" },

      },

      required: ["url"],

    },

  },

  {

    name: "smart_map",

    description: "查看一个文档站点的页面结构（站点地图），当前使用 Tavily。常作为 Deep Research 的后续步骤。",

    inputSchema: {

      type: "object",

      properties: {

        url: { type: "string", description: "目标站点根 URL" },

        instructions: { type: "string", description: "过滤指令（如 '只看文档页'）" },

        max_depth: { type: "number", default: 1 },

        max_breadth: { type: "number", default: 20 },

        limit: { type: "number", default: 50 },

      },

      required: ["url"],

    },

  },

  {

    name: "smart_exa_search",

    description: "使用 Exa 搜索官方文档、API、论文、产品页等高质量内容。常作为 Deep Research 的后续步骤。",

    inputSchema: {

      type: "object",

      properties: {

        query: { type: "string", description: "搜索查询" },

        num_results: { type: "number", default: 5 },

        search_type: { type: "string", enum: ["neural", "keyword", "auto"] },

        include_domains: { type: "string", description: "限定域名（逗号分隔）" },

        exclude_domains: { type: "string", description: "排除域名（逗号分隔）" },

      },

      required: ["query"],

    },

  },

  {

    name: "smart_doctor",

    description: "仅用于检查 smart-search 配置、API 连通性和能力状态；不是研究取证步骤。",

    inputSchema: { type: "object", properties: {} },

  },

];

function quoteWindowsArg(arg) {

  if (arg === "") return '""';

  if (!/[\s"&|<>^]/.test(arg)) return arg;

  return '"' + arg.replace(/\\(?=")/g, "\\\\").replace(/"/g, '\\"') + '"';

}

function logArgs(args) {

  return args.map((arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");

}

// ─── 调用 smart-search CLI ───

function runSmartSearch(args) {

  return new Promise((resolve, reject) => {

    log("EXEC: smart-search " + logArgs(args));

    const command = process.platform === "win32" ? "smart-search " + args.map(quoteWindowsArg).join(" ") : "smart-search";

    const spawnArgs = process.platform === "win32" ? [] : args;

    const useShell = process.platform === "win32";

    const proc = spawn(command, spawnArgs, {

      stdio: ["ignore", "pipe", "pipe"],

      env: process.env,

      shell: useShell,

    });

    let stdout = "";

    let stderr = "";

    let settled = false;

    const timer = setTimeout(() => {

      if (settled) return;

      settled = true;

      proc.kill();

      reject(new Error("smart-search timed out after 5 minutes"));

    }, 5 * 60 * 1000);

    proc.stdout.on("data", (d) => (stdout += d));

    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {

      if (settled) return;

      settled = true;

      clearTimeout(timer);

      log("EXIT " + code + " (stdout " + stdout.length + " bytes)");

      if (code === 0) {

        resolve(stdout.trim());

      } else {

        const detail = (stderr || stdout).trim().slice(0, 1000);

        reject(new Error("Exit code " + code + (detail ? ": " + detail : "")));

      }

    });

    proc.on("error", (e) => {

      if (settled) return;

      settled = true;

      clearTimeout(timer);

      log("SPAWN ERROR: " + e.message);

      reject(new Error("Failed to spawn smart-search: " + e.message));

    });

  });

}

function normalizeBudget(budget) {

  return budget === "balanced" ? "standard" : budget || "standard";

}

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

    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));

    throw new Error("smart-search deep did not return valid JSON");

  }

}

function getPlanSteps(plan) {

  if (Array.isArray(plan.steps)) return plan.steps;

  if (Array.isArray(plan.plan)) return plan.plan;

  if (Array.isArray(plan.research_plan && plan.research_plan.steps)) return plan.research_plan.steps;

  return [];

}

function validateResearchPlan(plan) {

  const normalizedPlan = plan.research_plan && typeof plan.research_plan === "object" ? plan.research_plan : plan;

  if (normalizedPlan.mode !== "deep_research") {

    throw new Error('Invalid deep research plan: expected mode "deep_research"');

  }

  const steps = getPlanSteps(normalizedPlan);

  for (const step of steps) {

    const tool = normalizeStepTool(step.tool || inferToolFromCommand(step.command));

    if (!tool) continue;

    if (tool === "doctor") throw new Error("Invalid deep research plan: doctor can only be used for preflight, not research steps");

    if (!STEP_TOOL_WHITELIST.has(tool)) throw new Error("Invalid deep research plan: unsupported step tool " + tool);

  }

  return normalizedPlan;

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

    tool: normalizeStepTool(step.tool || inferToolFromCommand(step.command)) || "search",

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

function parseCommandArgs(command) {

  const tokens = [];

  let current = "";

  let quote = null;

  for (let i = 0; i < command.length; i += 1) {

    const ch = command[i];

    const next = command[i + 1];

    if (ch === "\\" && quote !== "'" && (next === quote || next === '"' || next === "\\")) {

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

  return selectedUrls[stepId] || selectedUrls["<key-url>"] || selectedUrls.key_url;

}

function replacePlaceholders(args, stepId, selectedUrls) {

  const selectedUrl = selectedUrlForStep(selectedUrls, stepId);

  const hasPlaceholder = args.some((arg) => typeof arg === "string" && arg.includes("<key-url>"));

  if (hasPlaceholder && !selectedUrl) {

    return { needsInput: true, args };

  }

  return {

    needsInput: false,

    args: args.map((arg) => (typeof arg === "string" ? arg.replace(/<key-url>/g, selectedUrl || "") : arg)),

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

  if (tool === "doctor") throw new Error("doctor can only be used for preflight, not research steps");

  if (!STEP_TOOL_WHITELIST.has(tool)) throw new Error("Unsupported deep research step tool: " + tool);

  if ((tool === "search" || tool === "fetch") && !hasFormatArg(args)) args.push("--format", format || "json");

  return { needsInput: false, args };

}

function buildStepArgs(step, index, selectedUrls, format) {

  const normalized = normalizeStep(step, index);

  if (normalized.command) return stepArgsFromCommand(normalized.command, normalized.id, selectedUrls, format);

  if (normalized.tool === "doctor") throw new Error("doctor can only be used for preflight, not research steps");

  if (!STEP_TOOL_WHITELIST.has(normalized.tool)) throw new Error("Unsupported deep research step tool: " + normalized.tool);

  if (normalized.tool === "fetch") {

    const url = normalized.url || selectedUrlForStep(selectedUrls, normalized.id);

    if (!url || url === "<key-url>") return { needsInput: true, args: ["fetch", "<key-url>"] };

    return { needsInput: false, args: ["fetch", url, "--format", format || "json"] };

  }

  if (normalized.tool === "map") {

    const url = normalized.url || selectedUrlForStep(selectedUrls, normalized.id);

    if (!url || url === "<key-url>") return { needsInput: true, args: ["map", "<key-url>"] };

    return { needsInput: false, args: ["map", url] };

  }

  if (normalized.tool === "exa-search") {

    return { needsInput: false, args: ["exa-search", normalized.query || normalized.question] };

  }

  return { needsInput: false, args: ["search", normalized.query || normalized.question, "--format", format || "json"] };

}

function summarizeEvidence(stepResults) {

  if (stepResults.length === 0) return "No evidence collected yet.";

  return stepResults

    .map((result, index) => {

      const text = String(result.output || "").replace(/\s+/g, " ").trim();

      return index + 1 + ". " + result.step_id + " (" + result.tool + "): " + text.slice(0, 240);

    })

    .join("\n");

}

function renderMarkdownResponse(payload) {

  const lines = [

    "# Deep Research Execution",

    "",

    "- research_id: `" + payload.research_id + "`",

    "- status: `" + payload.status + "`",

    "- ready_for_answer: `" + payload.ready_for_answer + "`",

    "- next_action: " + payload.next_action,

    "",

    "## Evidence Summary",

    "",

    payload.evidence_summary || "No evidence collected yet.",

  ];

  if (payload.required_inputs && payload.required_inputs.length > 0) {

    lines.push("", "## Required Inputs", "");

    for (const item of payload.required_inputs) {

      lines.push("- `" + item.step_id + "`: " + item.reason);

    }

  }

  return lines.join("\n");

}

async function createDeepResearch(args) {

  const budget = normalizeBudget(args.budget);

  const format = args.format || "json";

  const commandArgs = ["deep", args.query, "--budget", budget, "--format", "json"];

  if (args.model) commandArgs.push("--model", args.model);

  const output = await runSmartSearch(commandArgs);

  const plan = validateResearchPlan(parseJsonOutput(output));

  const steps = getPlanSteps(plan);

  const researchId = makeResearchId();

  RESEARCH_SESSIONS.set(researchId, {

    plan,

    progress: { completed: new Set(), failed: new Set() },

    stepResults: [],

    createdAt: new Date().toISOString(),

    query: args.query,

    budget,

  });

  const payload = {

    research_id: researchId,

    status: "planned",

    research_plan: plan,

    pending_steps: steps.map(publicStep),

    next_action: "call smart_deep_execute with this research_id",

    not_final: true,

  };

  return format === "markdown" ? renderMarkdownResponse({ ...payload, ready_for_answer: false, evidence_summary: "Plan created. No evidence collected yet." }) : JSON.stringify(payload, null, 2);

}

async function executeDeepResearch(args) {

  const session = RESEARCH_SESSIONS.get(args.research_id);

  if (!session) throw new Error("Unknown or expired research_id: " + args.research_id);

  const format = args.format || "json";

  const maxSteps = Math.max(1, Number(args.max_steps || 1));

  const steps = getPlanSteps(session.plan);

  const completedNow = [];

  let lastStepResult = null;

  for (let i = 0; i < steps.length && completedNow.length < maxSteps; i += 1) {

    const step = normalizeStep(steps[i], i);

    if (session.progress.completed.has(step.id) || session.progress.failed.has(step.id)) continue;

    const built = buildStepArgs(steps[i], i, args.selected_urls, format);

    if (built.needsInput) {

      const payload = buildExecutionPayload(args.research_id, session, steps, "needs_input", lastStepResult, [

        {

          step_id: step.id,

          tool: step.tool,

          reason: "This step contains <key-url>; provide selected_urls[\"" + step.id + "\"] before continuing.",

          candidate_hint: "Use URLs found in earlier search/exa-search results, then call smart_deep_execute again.",

        },

      ]);

      return format === "markdown" ? renderMarkdownResponse(payload) : JSON.stringify(payload, null, 2);

    }

    const output = await runSmartSearch(built.args);

    lastStepResult = {

      step_id: step.id,

      question: step.question,

      tool: step.tool,

      command: "smart-search " + logArgs(built.args),

      output,

      completed_at: new Date().toISOString(),

    };

    session.progress.completed.add(step.id);

    session.stepResults.push(lastStepResult);

    completedNow.push(lastStepResult);

  }

  const ready = session.progress.completed.size + session.progress.failed.size >= steps.length;

  const payload = buildExecutionPayload(args.research_id, session, steps, ready ? "completed" : "in_progress", lastStepResult, []);

  payload.completed_steps = completedNow;

  return format === "markdown" ? renderMarkdownResponse(payload) : JSON.stringify(payload, null, 2);

}

function buildExecutionPayload(researchId, session, steps, status, lastStepResult, requiredInputs) {

  const completedIds = session.progress.completed;

  const failedIds = session.progress.failed;

  const pendingSteps = steps

    .map(publicStep)

    .filter((step) => !completedIds.has(step.id) && !failedIds.has(step.id));

  const readyForAnswer = status === "completed";

  return {

    research_id: researchId,

    status,

    completed_steps: session.stepResults.map(({ output, ...rest }) => ({ ...rest, output_preview: String(output).slice(0, 1000) })),

    failed_steps: Array.from(failedIds),

    pending_steps: pendingSteps,

    last_step_result: lastStepResult,

    evidence_summary: summarizeEvidence(session.stepResults),

    required_inputs: requiredInputs,

    next_action: readyForAnswer

      ? "ready for final answer based on collected evidence"

      : status === "needs_input"

        ? "provide required selected_urls and call smart_deep_execute again"

        : "call smart_deep_execute again to continue",

    ready_for_answer: readyForAnswer,

    not_final: !readyForAnswer,

  };

}

// ─── 工具执行路由 ───

async function handleTool(name, args) {

  switch (name) {

    case "smart_search": {

      const a = ["search", args.query, "--format", args.format || "markdown"];

      if (args.extra_sources > 0) a.push("--extra-sources", String(args.extra_sources));

      if (args.validation) a.push("--validation", args.validation);

      if (args.model) a.push("--model", args.model);

      return await runSmartSearch(a);

    }

    case "smart_deep_research": {

      return await createDeepResearch(args);

    }

    case "smart_deep_execute": {

      return await executeDeepResearch(args);

    }

    case "smart_fetch": {

      const a = ["fetch", args.url, "--format", args.format || "markdown"];

      return await runSmartSearch(a);

    }

    case "smart_map": {

      const a = ["map", args.url];

      if (args.instructions) a.push("--instructions", args.instructions);

      if (args.max_depth) a.push("--max-depth", String(args.max_depth));

      if (args.max_breadth) a.push("--max-breadth", String(args.max_breadth));

      if (args.limit) a.push("--limit", String(args.limit));

      return await runSmartSearch(a);

    }

    case "smart_exa_search": {

      const a = ["exa-search", args.query];

      if (args.num_results) a.push("--num-results", String(args.num_results));

      if (args.search_type) a.push("--search-type", args.search_type);

      if (args.include_domains) a.push("--include-domains", args.include_domains);

      if (args.exclude_domains) a.push("--exclude-domains", args.exclude_domains);

      return await runSmartSearch(a);

    }

    case "smart_doctor": {

      return await runSmartSearch(["doctor", "--format", "json"]);

    }

    default:

      throw new Error("Unknown tool: " + name);

  }

}

// ─── MCP 消息处理 ───

async function processMessage(msg) {

  if (msg.method === "initialize") {

    log("INIT: protocolVersion=" + (msg.params && msg.params.protocolVersion));

    send({

      jsonrpc: "2.0",

      id: msg.id,

      result: {

        protocolVersion: "2024-11-05",

        capabilities: { tools: {} },

        serverInfo: { name: "smart-search-mcp", version: "1.0.0" },

      },

    });

  } else if (msg.method === "notifications/initialized") {

    log("Client initialized");

  } else if (msg.method === "tools/list") {

    send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });

  } else if (msg.method === "tools/call") {

    const { name, arguments: args } = msg.params;

    log("TOOL CALL: " + name);

    try {

      const result = await handleTool(name, args || {});

      send({

        jsonrpc: "2.0",

        id: msg.id,

        result: {

          content: [{ type: "text", text: result }],

        },

      });

    } catch (err) {

      log("TOOL ERROR: " + err.message);

      send({

        jsonrpc: "2.0",

        id: msg.id,

        result: {

          content: [{ type: "text", text: "Error: " + err.message }],

          isError: true,

        },

      });

    }

  } else if (msg.method === "ping") {

    send({ jsonrpc: "2.0", id: msg.id, result: {} });

  } else if (msg.id !== undefined) {

    // 未知方法但有 id，返回 method not found

    send({

      jsonrpc: "2.0",

      id: msg.id,

      error: { code: -32601, message: "Method not found: " + msg.method },

    });

  }

  // notifications（无 id）静默忽略

}

// ─── 主入口：readline 逐行读取 stdin（NDJSON 协议）───

log("Starting smart-search MCP server...");

log("Node " + process.version + " | PID " + process.pid);

const rl = readline.createInterface({

  input: process.stdin,

  terminal: false,

});

rl.on("line", (line) => {

  const trimmed = line.trim();

  if (!trimmed) return;

  try {

    const msg = JSON.parse(trimmed);

    log("RECV: " + (msg.method || "response#" + msg.id));

    processMessage(msg);

  } catch (e) {

    log("PARSE ERROR: " + e.message + " | raw: " + trimmed.slice(0, 200));

  }

});

rl.on("close", () => {

  log("stdin closed, exiting");

  process.exit(0);

});

