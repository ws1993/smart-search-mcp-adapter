// handlers/deep-execute.js - smart_deep_execute 处理器

const { runSmartSearch } = require("../cli-executor");
const { log, logResearchEvent } = require("../logger");
const { RESEARCH_SESSIONS } = require("./deep-research");
const {
  getPlanSteps,
  normalizeStep,
  buildStepArgs,
} = require("../utils/step-utils");
const {
  buildExecutionPayload,
  renderMarkdownResponse,
} = require("../utils/session-utils");
const { getAutoSelectedUrls, extractCandidateUrls } = require("../utils/url-utils");

function logArgs(args) {
  return args
    .map((arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg))
    .join(" ");
}

async function handleDeepExecute(args) {
  const session = RESEARCH_SESSIONS.get(args.research_id);
  if (!session)
    throw new Error("Unknown or expired research_id: " + args.research_id);

  const format = args.format || "json";
  const maxSteps = Math.max(1, Number(args.max_steps || 1));
  const autoSelectUrls = args.auto_select_urls !== false;

  const steps = getPlanSteps(session.plan);
  const completedNow = [];
  let lastStepResult = null;

  session.required_inputs = [];
  session.status = session.stepResults.length > 0 ? "in_progress" : "planned";

  const selectedUrlState = autoSelectUrls
    ? getAutoSelectedUrls(session, args.selected_urls)
    : {
        selected_urls: { ...(args.selected_urls || {}) },
        candidate_urls: extractCandidateUrls(session),
      };

  logResearchEvent(args.research_id, "EXECUTE max_steps=" + maxSteps, {
    event: "execute_requested",
    max_steps: maxSteps,
    auto_select_urls: autoSelectUrls,
  });

  for (let i = 0; i < steps.length && completedNow.length < maxSteps; i += 1) {
    const step = normalizeStep(steps[i], i);

    if (
      session.progress.completed.has(step.id) ||
      session.progress.failed.has(step.id)
    )
      continue;

    logResearchEvent(
      args.research_id,
      "STEP " + step.id + " START " + step.tool,
      {
        event: "step_started",
        step_id: step.id,
        tool: step.tool,
        question: step.question,
      },
    );

    if (selectedUrlState.selected_urls[step.id]) {
      logResearchEvent(
        args.research_id,
        "STEP " +
          step.id +
          " AUTO_URL " +
          selectedUrlState.selected_urls[step.id],
        {
          event: "auto_selected_url",
          step_id: step.id,
          tool: step.tool,
          url: selectedUrlState.selected_urls[step.id],
        },
      );
    }

    const built = buildStepArgs(
      steps[i],
      i,
      selectedUrlState.selected_urls,
      format,
    );

    if (built.needsInput) {
      const requiredInputs = [
        {
          step_id: step.id,
          tool: step.tool,
          reason:
            'This step contains <key-url>; provide selected_urls["' +
            step.id +
            '"] before continuing.',
          candidate_hint:
            "Use URLs found in earlier search/exa-search results, then call smart_deep_execute again.",
          candidate_urls: selectedUrlState.candidate_urls,
        },
      ];

      session.status = "needs_input";
      session.required_inputs = requiredInputs;

      logResearchEvent(args.research_id, "STEP " + step.id + " NEEDS_INPUT", {
        event: "needs_input",
        step_id: step.id,
        tool: step.tool,
        candidate_count: selectedUrlState.candidate_urls.length,
      });

      const payload = buildExecutionPayload(
        args.research_id,
        session,
        steps,
        "needs_input",
        lastStepResult,
        requiredInputs,
      );

      return format === "markdown"
        ? renderMarkdownResponse(payload)
        : JSON.stringify(payload, null, 2);
    }

    logResearchEvent(
      args.research_id,
      "STEP " + step.id + " CMD smart-search " + logArgs(built.args),
      {
        event: "step_command",
        step_id: step.id,
        tool: step.tool,
        command: "smart-search " + logArgs(built.args),
      },
    );

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
    session.status = "in_progress";

    logResearchEvent(args.research_id, "STEP " + step.id + " DONE", {
      event: "step_completed",
      step_id: step.id,
      tool: step.tool,
      completed_at: lastStepResult.completed_at,
      output_bytes: Buffer.byteLength(String(output), "utf8"),
    });
  }

  const ready =
    session.progress.completed.size + session.progress.failed.size >=
    steps.length;

  session.status = ready ? "completed" : "in_progress";
  session.required_inputs = [];

  logResearchEvent(args.research_id, "STATUS " + session.status, {
    event: "execution_result",
    status: session.status,
    completed_count: session.progress.completed.size,
    pending_count:
      steps.length -
      session.progress.completed.size -
      session.progress.failed.size,
    ready_for_answer: ready,
  });

  const payload = buildExecutionPayload(
    args.research_id,
    session,
    steps,
    session.status,
    lastStepResult,
    [],
  );

  payload.completed_steps_delta = completedNow.map(({ output, ...rest }) => ({
    ...rest,
    output_preview: String(output).slice(0, 1000),
  }));

  return format === "markdown"
    ? renderMarkdownResponse(payload)
    : JSON.stringify(payload, null, 2);
}

module.exports = { handleDeepExecute };
