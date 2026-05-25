// utils/url-utils.js - URL 提取和选择工具

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

function normalizeCandidateUrl(url, meta = {}) {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  let hostname = "";
  try {
    hostname = new URL(trimmed).hostname.toLowerCase();
  } catch (_err) {
    return null;
  }

  const score =
    (/(^|\.)samsung\.com$/i.test(hostname) ? 100 : 0) +
    (/nvme|ssd|pm9|mzvl|semiconductor|support/i.test(trimmed) ? 20 : 0) +
    (/forum|reddit|community/i.test(hostname) ? 5 : 0);

  return {
    url: trimmed,
    title: meta.title || meta.name || meta.text || "",
    source_step: meta.source_step || "",
    score,
  };
}

function collectUrlsFromValue(value, sourceStep, candidates) {
  if (!value) return;

  if (typeof value === "string") {
    const matches = value.match(/https?:\/\/[^\s)\]>"]+/g) || [];
    for (const match of matches) {
      const candidate = normalizeCandidateUrl(match, {
        source_step: sourceStep,
      });
      if (candidate) candidates.push(candidate);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value)
      collectUrlsFromValue(item, sourceStep, candidates);
    return;
  }

  if (typeof value === "object") {
    const directUrl = value.url || value.link || value.href;
    if (typeof directUrl === "string") {
      const candidate = normalizeCandidateUrl(directUrl, {
        title: value.title || value.name || value.text,
        source_step: sourceStep,
      });
      if (candidate) candidates.push(candidate);
    }

    for (const nested of Object.values(value))
      collectUrlsFromValue(nested, sourceStep, candidates);
  }
}

function extractCandidateUrls(session) {
  const deduped = new Map();

  for (const result of session.stepResults) {
    const sourceStep = result.step_id;
    const parsed = safeParseJson(result.output);
    const candidates = [];

    collectUrlsFromValue(parsed || result.output, sourceStep, candidates);

    for (const candidate of candidates) {
      const existing = deduped.get(candidate.url);
      if (!existing || candidate.score > existing.score)
        deduped.set(candidate.url, candidate);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function getAutoSelectedUrls(session, selectedUrls = {}) {
  const { normalizeStep } = require("./step-utils");
  const { getPlanSteps } = require("./step-utils");
  
  const merged = { ...(selectedUrls || {}) };
  const candidates = extractCandidateUrls(session);
  const steps = getPlanSteps(session.plan);

  for (let i = 0; i < steps.length; i += 1) {
    const step = normalizeStep(steps[i], i);
    if (merged[step.id]) continue;

    const needsUrlPlaceholder =
      (typeof step.command === "string" &&
        step.command.includes("<key-url>")) ||
      (step.tool === "fetch" && (!step.url || step.url === "<key-url>")) ||
      (step.tool === "map" && (!step.url || step.url === "<key-url>"));

    if (!needsUrlPlaceholder) continue;
    if (candidates[0]) merged[step.id] = candidates[0].url;
  }

  return { selected_urls: merged, candidate_urls: candidates };
}

module.exports = {
  safeParseJson,
  normalizeCandidateUrl,
  collectUrlsFromValue,
  extractCandidateUrls,
  getAutoSelectedUrls,
};
