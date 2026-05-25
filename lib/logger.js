// logger.js - 日志和审计功能

const fs = require("fs");
const path = require("path");
const os = require("os");

// stderr 调试日志（Cherry Studio 的 MCP 日志面板可以看到）
function log(msg) {
  process.stderr.write("[smart-search-mcp] " + msg + "\n");
}

function getAuditLogPath() {
  const configured = process.env.SMART_SEARCH_MCP_AUDIT_LOG;
  if (configured && configured.trim()) return configured.trim();
  return path.join(os.tmpdir(), "smart-search-mcp-audit.jsonl");
}

function writeAuditEvent(event) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      ...event,
    };
    fs.appendFileSync(getAuditLogPath(), JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    log("AUDIT ERROR: " + err.message);
  }
}

function logResearchEvent(researchId, message, extra) {
  log("[" + researchId + "] " + message);
  if (extra) {
    writeAuditEvent({ research_id: researchId, ...extra });
  }
}

module.exports = {
  log,
  getAuditLogPath,
  writeAuditEvent,
  logResearchEvent,
};
