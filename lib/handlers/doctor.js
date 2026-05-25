// handlers/doctor.js - smart_doctor 处理器

const { runSmartSearch } = require("../cli-executor");

async function handleSmartDoctor(args) {
  return await runSmartSearch(["doctor", "--format", "json"]);
}

module.exports = { handleSmartDoctor };
