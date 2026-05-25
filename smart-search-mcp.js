#!/usr/bin/env node

// smart-search-mcp.js - 主入口文件
// 把 smart-search CLI 包装成标准 MCP STDIO 服务器

const readline = require("readline");
const { log } = require("./lib/logger");
const { send } = require("./lib/mcp-protocol");
const { TOOLS } = require("./lib/tools");
const { handleTool } = require("./lib/handlers");

// 全局错误处理
process.on("uncaughtException", (e) => {
  log("UNCAUGHT: " + e.message + "\n" + e.stack);
  process.exit(1);
});

process.on("unhandledRejection", (e) => {
  log("UNHANDLED REJECTION: " + e);
});

// MCP 消息处理
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
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: "Method not found: " + msg.method },
    });
  }
}

// 主入口：readline 逐行读取 stdin（NDJSON 协议）
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
