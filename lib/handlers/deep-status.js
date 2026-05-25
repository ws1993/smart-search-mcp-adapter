// handlers/deep-status.js - smart_deep_status 处理器

const { logResearchEvent } = require("../logger");
const { RESEARCH_SESSIONS } = require("./deep-research");
const { summarizeSession, renderMarkdownResponse } = require("../utils/session-utils");

function handleDeepStatus(args) {
  const session = RESEARCH_SESSIONS.get(args.research_id);

  if (!session)
    throw new Error("Unknown or expired research_id: " + args.research_id);

  const format = args.format || "json";
  const payload = summarizeSession(session);

  logResearchEvent(args.research_id, "STATUS_QUERY " + payload.status, {
    event: "status_query",
    status: payload.status,
    completed_count: payload.completed_steps.length,
    pending_count: payload.pending_steps.length,
  });

  return format === "markdown"
    ? renderMarkdownResponse(payload)
    : JSON.stringify(payload, null, 2);
}

module.exports = { handleDeepStatus };
