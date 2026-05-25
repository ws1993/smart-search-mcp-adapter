// mcp-protocol.js - MCP 协议层

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

module.exports = { send };
