#!/usr/bin/env node
// smart-search-mcp.js
// 把 smart-search CLI 包装成标准 MCP STDIO 服务器，供 Cherry Studio 等客户端使用
// MCP STDIO 传输协议：换行分隔的 JSON-RPC 2.0（NDJSON）

const { spawn } = require("child_process");
const readline = require("readline");

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
      "多来源智能网页搜索。调用 smart-search search，搜索网页并生成带来源引用的结构化回答。",
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
    name: "smart_fetch",
    description:
      "抓取指定 URL 的网页正文，转换为 Markdown。优先用 Tavily，失败则用 Firecrawl 兜底。",
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
    description: "查看一个文档站点的页面结构（站点地图），当前使用 Tavily。",
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
    description: "使用 Exa 搜索官方文档、API、论文、产品页等高质量内容。",
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
    description: "检查 smart-search 配置、API 连通性和能力状态。",
    inputSchema: { type: "object", properties: {} },
  },
];

// ─── 调用 smart-search CLI ───
function runSmartSearch(args) {
  return new Promise((resolve, reject) => {
    log("EXEC: smart-search " + args.join(" "));
    
    // Windows 下需要对包含空格的参数进行引号包裹
    let spawnArgs = args;
    let useShell = false;
    
    if (process.platform === "win32") {
      // 在 Windows 下，对包含空格的参数加引号
      spawnArgs = args.map(arg => {
        if (typeof arg === 'string' && arg.includes(' ')) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      });
      useShell = true;
    }
    
    const proc = spawn("smart-search", spawnArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: useShell,
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {
      log("EXIT " + code + " (stdout " + stdout.length + " bytes)");
      if (stdout.length > 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error("Exit code " + code + ": " + stderr.trim().slice(0, 500)));
      }
    });

    proc.on("error", (e) => {
      log("SPAWN ERROR: " + e.message);
      reject(new Error("Failed to spawn smart-search: " + e.message));
    });

    // 5 分钟超时（搜索可能很慢）
    setTimeout(() => {
      proc.kill();
      reject(new Error("smart-search timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
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