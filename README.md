# Smart Search MCP Adapter

将 [smartsearch](https://github.com/konbakuyomu/smartsearch) CLI 工具包装为标准 MCP (Model Context Protocol) STDIO 服务器，方便在 Cherry Studio 等支持 MCP 协议的客户端中使用。

## 功能特性

- **标准 MCP 协议**：完全兼容 MCP STDIO 传输协议（NDJSON 格式）

- **多工具支持**：提供 8 个搜索与研究工具

- **深度研究模式**：先规划后执行的多步骤研究工作流

- **会话状态管理**：支持分步执行和断点续传

- **跨平台兼容**：支持 Windows、Linux 和 macOS

- **相对时间校正**：当 query 中出现“今天 / 昨天 / 最新 / 本月”等相对时间词时，适配器会先按时区从在线时间服务获取当前日期，再补齐或修正日期，降低上层模型生成过期年月的概率

- **错误处理**：完善的错误处理和日志记录机制

- **超时保护**：5 分钟超时保护，防止长时间运行的搜索阻塞

## 工具说明

### 1. `smart_search`

一次性快速搜索，调用 smart-search search 命令。本适配器会固定 provider 策略：网页补强只允许 Tavily -> Firecrawl，文档补强只允许 Exa，避免误走未配置的 Zhipu / Context7。适合简单查询，不适合深度调研、核验、多步取证等复杂任务（这些应使用 `smart_deep_research`）。

**参数：**

- `query` (必需)：搜索查询内容

- `extra_sources` (可选)：补充来源数（0=不补充，1-5=额外调用 Tavily/Firecrawl，默认 3）

- `validation` (可选)：交叉验证强度（fast/balanced/strict）

- `timezone` (可选)：IANA 时区名称，用于相对时间归一化；默认使用 `SMART_SEARCH_TIMEZONE` 或系统时区

- `format` (可选)：输出格式（json/markdown）

- `model` (可选)：指定模型 ID

### 2. `smart_deep_research` ⭐ 深度研究规划器

深度搜索规划器。当用户提到"深度搜索/深度调研/核验/对比/选型/多来源/serious review/deep research"时优先调用此工具。生成多步骤研究计划并创建研究会话，返回 `research_id` 和待执行步骤。

**重要**：此工具只生成计划，不会自动执行所有步骤。需要后续调用 `smart_deep_execute` 来执行。

**Provider 策略**：适配器会在计划入库前清洗 CLI 生成的步骤，删除 `context7-library` / `context7-docs`，并把 `zhipu-search` 改写为带 allowlist 的 `search` 步骤。最终执行时，网页补强只走 Tavily -> Firecrawl，文档检索只走 Exa。

**参数：**

- `query` (必需)：研究主题或问题

- `budget` (可选)：研究深度（quick/standard/deep，默认：standard）

  - `quick`：2-3步快速验证

  - `standard`：5-8步标准调研

  - `deep`：10+步深度分析

- `format` (可选)：计划输出格式（json/markdown，推荐 json）

- `model` (可选)：指定模型 ID

- `timezone` (可选)：IANA 时区名称，用于研究计划与后续步骤的相对时间归一化

**返回结构：**

```json

{

  "research_id": "research_1234567890_abc123",

  "status": "planned",

  "research_plan": {

    "query": "研究主题",

    "budget": "standard",

    "mode": "deep_research",

    "decomposition": [...]

  },

  "pending_steps": [

    {

      "id": "step_1",

      "question": "步骤问题",

      "tool": "search",

      "reason": "执行原因"

    }

  ],

  "next_action": "call smart_deep_execute with this research_id",

  "not_final": true

}

```

### 3. `smart_deep_execute` ⭐ 深度研究执行器

执行深度研究步骤。根据 `research_id` 执行研究计划中的下一个或多个步骤。常作为 `smart_deep_research` 的后续步骤。

**参数：**

- `research_id` (必需)：研究会话 ID（由 smart_deep_research 返回）

- `max_steps` (可选)：本次最多执行几个步骤（默认 1，避免超时）

- `selected_urls` (可选)：为需要 `<key-url>` 的步骤提供 URL，格式：`{ "step_id": "url" }`

- `timezone` (可选)：IANA 时区名称，用于覆盖该研究会话的相对时间归一化时区

- `format` (可选)：结果输出格式（json/markdown）

**返回结构：**

```json

{

  "research_id": "research_1234567890_abc123",

  "status": "in_progress",

  "completed_steps": [...],

  "completed_steps_delta": [...],

  "completed_count": 2,

  "failed_steps": [...],

  "pending_steps": [...],

  "pending_count": 1,

  "evidence_summary": "Completed 3/8 steps",

  "ready_for_answer": false,

  "not_final": true,

  "next_action": "call smart_deep_execute again to continue"

}

```

### 4. `smart_deep_run` ⭐ 自动执行到阻塞/完成

自动继续执行 Deep Research，会一直向后推进，直到：

- 所有步骤完成
- 遇到 `needs_input`
- 达到 `max_steps`

它会优先尝试从已完成的搜索/抓取结果里自动提取候选 URL，并自动填充后续 `fetch <key-url>` 步骤，减少对对话模型多轮编排的依赖。

**参数：**

- `research_id` (必需)：研究会话 ID

- `max_steps` (可选)：本次自动执行的最大步骤数，默认 20

- `selected_urls` (可选)：手动覆盖某些步骤的 URL

- `auto_select_urls` (可选)：是否自动从已有结果中选择候选 URL，默认 `true`

- `timezone` (可选)：IANA 时区名称，用于覆盖该研究会话的相对时间归一化时区

- `format` (可选)：结果输出格式（json/markdown）

**典型用途：**

- 在 Cherry Studio 这类对话式 MCP 中，减少“只规划不执行”或“执行两步就停”的情况

- 在遇到 `fetch <key-url>` 时尽量自动继续，而不是立即阻塞

### 5. `smart_deep_status` ⭐ 深度研究状态查询

查询某个 `research_id` 的当前状态，不执行新步骤。适合用来确认是否真的执行过、执行到了哪一步、还剩哪些步骤、是否卡在 `needs_input`。

**参数：**

- `research_id` (必需)：研究会话 ID

- `format` (可选)：结果输出格式（json/markdown）

**返回重点字段：**

- `status`

- `completed_steps`

- `pending_steps`

- `last_step_result`

- `required_inputs`

- `ready_for_answer`

### 6. `smart_fetch`

抓取指定 URL 的网页正文，转换为 Markdown 格式。优先用 Tavily，失败则用 Firecrawl 兜底。常作为 Deep Research 的后续步骤。

**参数：**

- `url` (必需)：要抓取的网页 URL

- `format` (可选)：输出格式（json/markdown）

### 7. `smart_map`

查看文档站点的页面结构（站点地图），当前使用 Tavily。常作为 Deep Research 的后续步骤。

**参数：**

- `url` (必需)：目标站点根 URL

- `instructions` (可选)：过滤指令（如"只看文档页"）

- `max_depth` (可选)：最大深度（默认：1）

- `max_breadth` (可选)：最大宽度（默认：20）

- `limit` (可选)：结果限制（默认：50）

### 8. `smart_exa_search`

使用 Exa 搜索官方文档、API、论文、产品页等高质量内容。常作为 Deep Research 的后续步骤；本适配器不会把文档检索兜底到 Context7。

**参数：**

- `query` (必需)：搜索查询

- `num_results` (可选)：结果数量（默认：5）

- `search_type` (可选)：搜索类型（neural/keyword/auto）

- `include_domains` (可选)：限定域名（逗号分隔）

- `exclude_domains` (可选)：排除域名（逗号分隔）

- `timezone` (可选)：IANA 时区名称，用于相对时间归一化；默认使用 `SMART_SEARCH_TIMEZONE` 或系统时区

### 9. `smart_doctor`

检查 smart-search 配置、API 连通性和能力状态。仅用于配置/连通性预检，不是研究取证步骤。

**参数：** 无

## 安装与使用

### 前提条件

1. 安装 Node.js (v14 或更高版本)

2. 安装 smart-search CLI：`npm install -g smart-search`（版本 0.1.12 或更高）

3. 配置所需的 API 密钥（推荐 Tavily、Firecrawl、Exa；本适配器不会依赖 Zhipu / Context7）

### 安装适配器

```bash

# 克隆仓库

git clone https://github.com/your-username/smart-search-mcp-adapter.git

cd smart-search-mcp-adapter

# 无需额外依赖

```

### 在 Cherry Studio 中配置

1. 打开 Cherry Studio 的 MCP 服务器配置

2. 添加新的 MCP 服务器，配置如下：

```json

{

  "name": "smart-search",

  "command": "node",

  "args": ["path/to/smart-search-mcp.js"],

  "env": {

    "TAVILY_API_KEY": "your-tavily-api-key",

    "FIRECRAWL_API_KEY": "your-firecrawl-api-key",

    "EXA_API_KEY": "your-exa-api-key"

  }

}

```

或者使用 npm 全局安装后直接运行：

```bash

# 将适配器添加到 PATH

npm link

# 在 Cherry Studio 中配置

{

  "name": "smart-search",

  "command": "smart-search-mcp",

  "env": {

    "TAVILY_API_KEY": "your-tavily-api-key",

    "FIRECRAWL_API_KEY": "your-firecrawl-api-key",

    "EXA_API_KEY": "your-exa-api-key"

  }

}

```

### 测试连接

运行以下命令测试 MCP 服务器是否正常工作：

```bash

# 手动测试（发送 JSON-RPC 消息）

echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | node smart-search-mcp.js

```

## 使用示例

在 Cherry Studio 中配置好 MCP 服务器后，你可以使用自然语言与智能搜索工具交互：

### 示例 1：快速搜索

```

帮我搜索"最新的人工智能技术趋势"

```

### 示例 2：深度研究（推荐工作流）

```

深度调研一下"Rust vs Go 性能对比"

# 模型会自动：

# 1. 调用 smart_deep_research 生成研究计划

# 2. 多次调用 smart_deep_execute 执行各个步骤

# 3. 基于所有证据生成综合报告

```

### 示例 3：抓取网页内容

```

抓取 https://example.com/article 这个页面的正文内容

```

### 示例 4：查看站点地图

```

查看 https://docs.example.com 这个文档站点的页面结构

```

### 示例 5：高质量搜索

```

使用 Exa 搜索关于"机器学习最佳实践"的官方文档和学术论文

```

### 示例 6：检查配置

```

检查 smart-search 的配置状态和 API 连通性

```

## Deep Research 工作流详解

### 为什么要分离规划和执行？

1. **避免提前收敛**：如果一次性返回所有结果，模型可能误以为研究已完成

2. **支持交互式输入**：某些步骤需要用户选择 URL（如 `fetch <key-url>`）

3. **更好的进度可见性**：用户可以看到每个步骤的执行情况

4. **超时控制**：避免单次调用时间过长

### 推荐调度顺序

```

用户查询 → smart_deep_research → smart_deep_execute (多次) → 最终答案

```

### 会话状态管理

- 会话存储在内存中（进程内 Map）

- 会话 ID 格式：`research_<timestamp>_<random>`

- MCP 进程结束或重启后会话失效，不做磁盘持久化

- 可通过 `smart_deep_status(research_id)` 查询当前累计进度，不必触发新的执行

- 每次 `smart_deep_execute` 会记录 step 级状态，便于确认执行到了哪一步

- 审计日志默认写入系统临时目录下的 `smart-search-mcp-audit.jsonl`，也可通过环境变量 `SMART_SEARCH_MCP_AUDIT_LOG` 自定义路径

## 配置说明

### 环境变量

适配器依赖 smart-search CLI 的功能，需要配置相应的 API 密钥：

- `TAVILY_API_KEY`：Tavily 搜索 API 密钥

- `FIRECRAWL_API_KEY`：Firecrawl 抓取 API 密钥

- `EXA_API_KEY`：Exa 搜索 API 密钥

### Budget 参数映射

为了兼容性，适配器会自动将旧的 `balanced` 映射到 `standard`：

- `quick` → `quick`（2-3步）

- `balanced` → `standard`（5-8步，推荐）

- `standard` → `standard`（5-8步）

- `deep` → `deep`（10+步）

## 调试与日志

适配器会将调试日志输出到 stderr，可以在 Cherry Studio 的 MCP 日志面板中查看：

```

[smart-search-mcp] Starting smart-search MCP server...

[smart-search-mcp] Node v18.17.0 | PID 12345

[smart-search-mcp] INIT: protocolVersion=2024-11-05

[smart-search-mcp] Client initialized

[smart-search-mcp] TOOL CALL: smart_deep_research

[smart-search-mcp] [research_1234567890_abc123] PLANNED 3 steps

[smart-search-mcp] TOOL CALL: smart_deep_execute

[smart-search-mcp] [research_1234567890_abc123] STEP step_1 START search

[smart-search-mcp] [research_1234567890_abc123] STEP step_1 CMD smart-search search "Rust vs Go 性能对比" --format json

[smart-search-mcp] EXIT 0 (stdout 18234 bytes)

[smart-search-mcp] [research_1234567890_abc123] STEP step_1 DONE

```

如果需要事后分析完整链路：

- 用 `smart_deep_status` 查询某个 `research_id` 的累计状态

- 查看 stderr 中按 `research_id` 打印的 step 级日志

- 查看 JSONL 审计日志，默认路径为系统临时目录下的 `smart-search-mcp-audit.jsonl`

- 如需自定义审计日志路径，可设置环境变量 `SMART_SEARCH_MCP_AUDIT_LOG`

- 如果 query 里包含“今天 / 昨天 / 最新 / 本月”等相对时间词，适配器会先向在线时区服务获取当前日期，再在调用 CLI 前做时间归一化，并写入 `temporal_query_normalized` 审计事件。例如模型传入 `今日最新新闻 2025年7月`，在 2026 年 5 月 21 日运行时会修正为 `今日最新新闻 2026年5月21日`

## 故障排除

### 常见问题

1. **"smart-search not found" 错误**

   - 确保 smart-search CLI 已全局安装：`npm install -g smart-search`

   - 检查版本：`smart-search --version`（需要 0.1.12 或更高）

   - 检查 PATH 环境变量是否包含 smart-search 的安装路径

2. **API 密钥错误**

   - 确保所有必需的 API 密钥已正确配置

   - 检查密钥是否有效且未过期

   - 使用 `smart_doctor` 工具检查连通性

3. **"Research session not found" 错误**

   - 会话只保存在当前 MCP 进程内存中

   - MCP 服务器可能已重启

   - 重新调用 `smart_deep_research` 创建新会话

4. **超时错误**

   - 某些搜索查询可能需要较长时间

   - 减少 `max_steps` 参数，分多次执行

   - 可以尝试简化查询或增加超时时间

5. **连接问题**

   - 检查网络连接是否正常

   - 确保防火墙未阻止 MCP 通信

### 日志分析

查看 stderr 输出的日志信息，通常可以定位问题所在。

## 技术实现

### MCP 协议

适配器实现了完整的 MCP STDIO 传输协议：

- 协议版本：2024-11-05

- 使用换行分隔的 JSON-RPC 2.0 (NDJSON) 格式

- 支持 `initialize`、`tools/list`、`tools/call` 等标准方法

- 完善的错误处理和响应格式

### 架构设计

- **进程管理**：使用 Node.js 的 `child_process` 模块调用 smart-search CLI

- **协议解析**：使用 `readline` 模块逐行读取 stdin 的 JSON 消息

- **会话管理**：进程内 Map 存储研究会话状态

- **参数解析**：稳健的命令行参数解析器，正确处理引号和空格

- **错误处理**：全局异常捕获和 Promise 错误处理

- **超时保护**：5 分钟超时防止进程阻塞

### 关键改进（v2.0）

1. **分离规划和执行**：`smart_deep_research` 只生成计划，`smart_deep_execute` 负责执行

2. **会话状态管理**：支持分步执行和断点续传

3. **占位符支持**：正确处理 `<key-url>` 占位符，返回 `needs_input` 状态

4. **参数验证**：严格验证研究计划结构和工具白名单

5. **退出码检查**：只在 `exit code === 0` 时判定成功

6. **工具描述优化**：明确各工具的使用场景和边界

## 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 项目

2. 创建功能分支：`git checkout -b feature/your-feature`

3. 提交更改：`git commit -m 'Add some feature'`

4. 推送到分支：`git push origin feature/your-feature`

5. 创建 Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。

## 致谢

- [smartsearch](https://github.com/konbakuyomu/smartsearch) - 原始的智能搜索工具

- [MCP 协议](https://modelcontextprotocol.io/) - 模型上下文协议标准

- Cherry Studio - 支持 MCP 协议的客户端

---

**注意**：本适配器仅封装了 smart-search CLI 的功能，所有搜索结果和内容的准确性依赖于原始工具的实现。
