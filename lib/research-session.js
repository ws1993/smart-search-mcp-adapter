// research-session.js - 研究会话管理

const crypto = require("crypto");
const { log, logResearchEvent } = require("./logger");
const { STEP_TOOL_WHITELIST, SEARCH_LIKE_STEP_TOOLS } = require("./constants");

const RESEARCH_SESSIONS = new Map();

function createResearchSession(planData) {
  const researchId = "research_" + crypto.randomBytes(8).toString("hex");
  
  const session = {
    id: researchId,
    query: planData.query || "",
    budget: planData.budget || "standard",
    plan: planData.plan || [],
    steps: planData.plan || [],
    completed: [],
    evidence: [],
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };

  RESEARCH_SESSIONS.set(researchId, session);
  logResearchEvent(researchId, "SESSION CREATED", {
    event: "session_created",
    query: session.query,
    budget: session.budget,
    step_count: session.steps.length,
  });

  return session;
}

function getResearchSession(researchId) {
  return RESEARCH_SESSIONS.get(researchId);
}

function updateResearchSession(researchId, updates) {
  const session = RESEARCH_SESSIONS.get(researchId);
  if (!session) return null;

  Object.assign(session, updates, {
    lastUpdatedAt: new Date().toISOString(),
  });

  return session;
}

function addStepResult(researchId, stepId, result) {
  const session = RESEARCH_SESSIONS.get(researchId);
  if (!session) return null;

  session.completed.push({
    step_id: stepId,
    result: result,
    completedAt: new Date().toISOString(),
  });

  if (result && typeof result === "object") {
    if (result.results || result.sources) {
      session.evidence.push({
        step_id: stepId,
        data: result,
        addedAt: new Date().toISOString(),
      });
    }
  }

  session.lastUpdatedAt = new Date().toISOString();
  return session;
}

function getNextExecutableStep(session) {
  const completedIds = new Set(session.completed.map((c) => c.step_id));

  for (const step of session.steps) {
    if (completedIds.has(step.id)) continue;

    const tool = step.tool || step.action;
    if (!STEP_TOOL_WHITELIST.has(tool)) {
      log("SKIP non-whitelisted tool: " + tool);
      continue;
    }

    if (step.query && step.query.includes("<key-url>")) {
      return { step, needsInput: true };
    }

    return { step, needsInput: false };
  }

  return null;
}

function isResearchComplete(session) {
  const completedIds = new Set(session.completed.map((c) => c.step_id));
  const executableSteps = session.steps.filter((s) =>
    STEP_TOOL_WHITELIST.has(s.tool || s.action),
  );
  return executableSteps.every((s) => completedIds.has(s.id));
}

function selectBestUrlFromEvidence(session, step) {
  if (!session.evidence || session.evidence.length === 0) return null;

  const allUrls = [];
  
  for (const ev of session.evidence) {
    const data = ev.data;
    
    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        if (item.url) {
          allUrls.push({
            url: item.url,
            title: item.title || "",
            score: item.score || 0,
            source: ev.step_id,
          });
        }
      }
    }
    
    if (data.sources && Array.isArray(data.sources)) {
      for (const item of data.sources) {
        if (item.url) {
          allUrls.push({
            url: item.url,
            title: item.title || "",
            score: item.score || 0,
            source: ev.step_id,
          });
        }
      }
    }
  }

  if (allUrls.length === 0) return null;

  allUrls.sort((a, b) => b.score - a.score);

  const stepQuery = (step.query || "").toLowerCase();
  const stepRationale = (step.rationale || "").toLowerCase();
  const searchTerms = (stepQuery + " " + stepRationale).split(/\s+/);

  for (const candidate of allUrls) {
    const candidateText = (candidate.title + " " + candidate.url).toLowerCase();
    const matchCount = searchTerms.filter((term) =>
      candidateText.includes(term),
    ).length;

    if (matchCount > 0) {
      log(
        "AUTO-SELECT: " +
          candidate.url +
          " (score=" +
          candidate.score +
          ", matches=" +
          matchCount +
          ")",
      );
      return candidate.url;
    }
  }

  log("AUTO-SELECT: " + allUrls[0].url + " (highest score, no keyword match)");
  return allUrls[0].url;
}

module.exports = {
  RESEARCH_SESSIONS,
  createResearchSession,
  getResearchSession,
  updateResearchSession,
  addStepResult,
  getNextExecutableStep,
  isResearchComplete,
  selectBestUrlFromEvidence,
};
