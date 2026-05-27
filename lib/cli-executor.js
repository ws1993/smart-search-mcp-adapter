// cli-executor.js - smart-search CLI 调用封装

const { spawn } = require("child_process");
const { log } = require("./logger");
const { normalizeTemporalArgs } = require("./temporal");

const DEFAULT_SMART_SEARCH_TIMEOUT_MS = 45 * 1000;
const MIN_SMART_SEARCH_TIMEOUT_MS = 1000;

function quoteWindowsArg(arg) {
  if (arg === "") return '""';
  if (!/[\s"&|<>^]/.test(arg)) return arg;
  return '"' + arg.replace(/\\(?=")/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function logArgs(args) {
  return args
    .map((arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg))
    .join(" ");
}

function resolveSmartSearchTimeoutMs(value) {
  const raw =
    value !== undefined && value !== null && value !== ""
      ? value
      : process.env.SMART_SEARCH_MCP_TIMEOUT_MS;

  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_SMART_SEARCH_TIMEOUT_MS;
  }

  const timeoutMs = Number(raw);
  if (!Number.isFinite(timeoutMs) || timeoutMs < MIN_SMART_SEARCH_TIMEOUT_MS) {
    log(
      "INVALID TIMEOUT: SMART_SEARCH_MCP_TIMEOUT_MS=" +
        JSON.stringify(String(raw)) +
        ", using " +
        DEFAULT_SMART_SEARCH_TIMEOUT_MS +
        "ms",
    );
    return DEFAULT_SMART_SEARCH_TIMEOUT_MS;
  }

  return Math.floor(timeoutMs);
}

function elapsedMs(startedAt) {
  return Date.now() - startedAt;
}

async function runSmartSearch(args, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = resolveSmartSearchTimeoutMs(options.timeoutMs);

  args = await normalizeTemporalArgs(args, options);

  log("EXEC: smart-search " + logArgs(args) + " (timeout " + timeoutMs + "ms)");

  const command =
    process.platform === "win32"
      ? "smart-search " + args.map(quoteWindowsArg).join(" ")
      : "smart-search";

  const spawnArgs = process.platform === "win32" ? [] : args;
  const useShell = process.platform === "win32";

  return await new Promise((resolve, reject) => {
    const proc = spawn(command, spawnArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: useShell,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(
      () => {
        if (settled) return;
        settled = true;
        log(
          "TIMEOUT after " +
            elapsedMs(startedAt) +
            "ms (limit " +
            timeoutMs +
            "ms, stdout " +
            stdout.length +
            " bytes, stderr " +
            stderr.length +
            " bytes)",
        );
        proc.kill();
        reject(
          new Error(
            "smart-search timed out after " +
              timeoutMs +
              "ms; set SMART_SEARCH_MCP_TIMEOUT_MS to adjust",
          ),
        );
      },
      timeoutMs,
    );

    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log(
        "EXIT " +
          code +
          " after " +
          elapsedMs(startedAt) +
          "ms (stdout " +
          stdout.length +
          " bytes, stderr " +
          stderr.length +
          " bytes)",
      );

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
      log("SPAWN ERROR after " + elapsedMs(startedAt) + "ms: " + e.message);
      reject(new Error("Failed to spawn smart-search: " + e.message));
    });
  });
}

function normalizeBudget(budget) {
  return budget === "balanced" ? "standard" : budget || "standard";
}

module.exports = {
  DEFAULT_SMART_SEARCH_TIMEOUT_MS,
  runSmartSearch,
  resolveSmartSearchTimeoutMs,
  normalizeBudget,
};
