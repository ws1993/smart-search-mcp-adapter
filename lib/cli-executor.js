// cli-executor.js - smart-search CLI 调用封装

const { spawn } = require("child_process");
const { log } = require("./logger");
const { normalizeTemporalArgs } = require("./temporal");

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

function runSmartSearch(args) {
  return new Promise((resolve, reject) => {
    args = normalizeTemporalArgs(args);
    log("EXEC: smart-search " + logArgs(args));

    const command =
      process.platform === "win32"
        ? "smart-search " + args.map(quoteWindowsArg).join(" ")
        : "smart-search";

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

    const timer = setTimeout(
      () => {
        if (settled) return;
        settled = true;
        proc.kill();
        reject(new Error("smart-search timed out after 5 minutes"));
      },
      5 * 60 * 1000,
    );

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

module.exports = {
  runSmartSearch,
  normalizeBudget,
};
