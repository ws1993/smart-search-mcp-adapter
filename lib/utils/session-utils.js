// utils/session-utils.js - 会话摘要和渲染工具

const { getPlanSteps, publicStep } = require("./step-utils");

function summarizeEvidence(stepResults) {
  if (stepResults.length === 0) return "No evidence collected yet.";

  return stepResults
    .map((result, index) => {
      const text = String(result.output || "")
        .replace(/\s+/g, " ")
        .trim();
      return (
        index +
        1 +
        ". " +
        result.step_id +
        " (" +
        result.tool +
        "): " +
        text.slice(0, 240)
      );
    })
    .join("\n");
}

function summarizeSession(session, statusOverride) {
  const steps = getPlanSteps(session.plan);
  const completedIds = session.progress.completed;
  const failedIds = session.progress.failed;

  const pendingSteps = steps
    .map(publicStep)
    .filter((step) => !completedIds.has(step.id) && !failedIds.has(step.id));

  const status =
    statusOverride ||
    session.status ||
    (pendingSteps.length === 0
      ? "completed"
      : session.stepResults.length > 0
        ? "in_progress"
        : "planned");

  return {
    research_id: session.research_id,
    status,
    research_plan: session.plan,
    timezone: session.timezone || null,
    completed_steps: session.stepResults.map(({ output, ...rest }) => ({
      ...rest,
      output_preview: String(output).slice(0, 1000),
    })),
    completed_count: session.progress.completed.size,
    failed_steps: Array.from(failedIds),
    pending_steps: pendingSteps,
    pending_count: pendingSteps.length,
    last_step_result: session.stepResults.at(-1) || null,
    evidence_summary: summarizeEvidence(session.stepResults),
    required_inputs: session.required_inputs || [],
    ready_for_answer: status === "completed",
    not_final: status !== "completed",
    next_action:
      status === "completed"
        ? "ready for final answer based on collected evidence"
        : status === "needs_input"
          ? "provide required selected_urls and call smart_deep_execute again"
          : status === "planned"
            ? "call smart_deep_execute with this research_id"
            : "call smart_deep_execute again to continue",
  };
}

function renderMarkdownResponse(payload) {
  const lines = [
    "# Deep Research Execution",
    "",
    "- research_id: `" + payload.research_id + "`",
    "- status: `" + payload.status + "`",
    "- completed_count: `" + payload.completed_count + "`",
    "- pending_count: `" + payload.pending_count + "`",
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
      if (item.candidate_urls && item.candidate_urls.length > 0) {
        for (const candidate of item.candidate_urls) {
          lines.push(
            "  - [" +
              (candidate.title || candidate.url) +
              "](" +
              candidate.url +
              ")",
          );
        }
      }
    }
  }

  return lines.join("\n");
}

function buildExecutionPayload(
  researchId,
  session,
  steps,
  status,
  lastStepResult,
  requiredInputs,
) {
  session.status = status;
  session.required_inputs = requiredInputs;

  const payload = summarizeSession(session, status);
  payload.last_step_result = lastStepResult || payload.last_step_result;
  payload.required_inputs = requiredInputs;

  return payload;
}

module.exports = {
  summarizeEvidence,
  summarizeSession,
  renderMarkdownResponse,
  buildExecutionPayload,
};
