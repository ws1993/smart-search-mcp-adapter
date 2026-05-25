// tools.js - MCP 工具定义

const TOOLS = [
  {
    name: "smart_search",
    description:
      "一次性快速搜索，调用 smart-search search 命令。适合简单查询，不适合深度调研、核验、多步取证等复杂任务；这些任务应优先使用 smart_deep_research。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索查询内容" },
        extra_sources: {
          type: "number",
          description: "补充来源数（0=不补充，1-5=额外调用 Tavily/Firecrawl）",
          default: 0,
        },
        validation: {
          type: "string",
          enum: ["fast", "balanced", "strict"],
          description: "交叉验证强度",
          default: "balanced",
        },
        timezone: {
          type: "string",
          description:
            "可选 IANA 时区名称，用于相对时间归一化；默认使用 SMART_SEARCH_TIMEZONE / 系统时区",
        },
        format: {
          type: "string",
          enum: ["json", "markdown"],
          default: "markdown",
        },
        model: { type: "string", description: "指定模型 ID（可选）" },
      },
      required: ["query"],
    },
  },
  {
    name: "smart_deep_research",
    description:
      "深度搜索/深度调研规划入口。当用户提到深度搜索、深度调研、核验、对比、选型、多来源、serious review、deep research 时优先调用此工具，而不是 smart_search。只生成计划并创建研究会话，不会隐式执行全部步骤。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "研究主题或问题" },
        budget: {
          type: "string",
          enum: ["quick", "standard", "deep"],
          description:
            "研究预算/深度；旧调用中的 balanced 会兼容映射为 standard",
          default: "standard",
        },
        timezone: {
          type: "string",
          description:
            "可选 IANA 时区名称，用于研究计划与后续步骤的相对时间归一化",
        },
        format: {
          type: "string",
          enum: ["json", "markdown"],
          description: "计划输出格式；建议使用 json 以便后续执行",
          default: "json",
        },
        model: { type: "string", description: "指定模型 ID（可选）" },
      },
      required: ["query"],
    },
  },
  {
    name: "smart_deep_execute",
    description:
      "按 research_id 执行 Deep Research 会话中的下一个可执行步骤。常在 smart_deep_research 返回 planned 后连续调用，直到 ready_for_answer 为 true 或 status 为 needs_input。",
    inputSchema: {
      type: "object",
      properties: {
        research_id: {
          type: "string",
          description: "smart_deep_research 返回的研究会话 ID",
        },
        max_steps: {
          type: "number",
          description: "本次最多执行的步骤数",
          default: 1,
        },
        selected_urls: {
          type: "object",
          description:
            '为包含 <key-url> 占位符的 fetch 步骤提供 URL，例如 {"step_3": "https://example.com"}',
          additionalProperties: { type: "string" },
        },
        timezone: {
          type: "string",
          description:
            "可选 IANA 时区名称，用于覆盖研究会话的相对时间归一化时区",
        },
        format: { type: "string", enum: ["json", "markdown"], default: "json" },
      },
      required: ["research_id"],
    },
  },
  {
    name: "smart_fetch",
    description:
      "抓取指定 URL 的网页正文，转换为 Markdown。优先用 Tavily，失败则用 Firecrawl 兜底。常作为 Deep Research 的后续步骤。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的网页 URL" },
        format: {
          type: "string",
          enum: ["json", "markdown"],
          default: "markdown",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "smart_map",
    description:
      "查看一个文档站点的页面结构（站点地图），当前使用 Tavily。常作为 Deep Research 的后续步骤。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "目标站点根 URL" },
        instructions: {
          type: "string",
          description: "过滤指令（如 '只看文档页'）",
        },
        max_depth: { type: "number", default: 1 },
        max_breadth: { type: "number", default: 20 },
        limit: { type: "number", default: 50 },
      },
      required: ["url"],
    },
  },
  {
    name: "smart_exa_search",
    description:
      "使用 Exa 搜索官方文档、API、论文、产品页等高质量内容。常作为 Deep Research 的后续步骤。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索查询" },
        num_results: { type: "number", default: 5 },
        search_type: { type: "string", enum: ["neural", "keyword", "auto"] },
        include_domains: {
          type: "string",
          description: "限定域名（逗号分隔）",
        },
        exclude_domains: {
          type: "string",
          description: "排除域名（逗号分隔）",
        },
        timezone: {
          type: "string",
          description:
            "可选 IANA 时区名称，用于相对时间归一化；默认使用 SMART_SEARCH_TIMEZONE / 系统时区",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "smart_deep_run",
    description:
      "自动继续执行 Deep Research 会话，直到研究完成、遇到 needs_input、或达到步骤上限。默认会尝试从已有搜索结果中自动选择最优候选 URL 继续 fetch 步骤，适合对话式 MCP 自动驾驶场景。",
    inputSchema: {
      type: "object",
      properties: {
        research_id: {
          type: "string",
          description: "smart_deep_research 返回的研究会话 ID",
        },
        max_steps: {
          type: "number",
          description: "本次自动执行的最大步骤数",
          default: 20,
        },
        selected_urls: {
          type: "object",
          description:
            '可选：手动指定某些步骤的 URL，格式如 {"step_3": "https://example.com"}',
          additionalProperties: { type: "string" },
        },
        auto_select_urls: {
          type: "boolean",
          description: "是否自动从已有证据中挑选候选 URL 继续执行 fetch 步骤",
          default: true,
        },
        timezone: {
          type: "string",
          description:
            "可选 IANA 时区名称，用于覆盖该研究会话的相对时间归一化时区",
        },
        format: { type: "string", enum: ["json", "markdown"], default: "json" },
      },
      required: ["research_id"],
    },
  },
  {
    name: "smart_deep_status",
    description:
      "查询某个 Deep Research 会话的当前状态，不执行新步骤。用于追踪 research_id 的已完成步骤、待执行步骤、最近一步结果，以及是否还需要继续执行或补充输入。",
    inputSchema: {
      type: "object",
      properties: {
        research_id: { type: "string", description: "要查询的研究会话 ID" },
        format: { type: "string", enum: ["json", "markdown"], default: "json" },
      },
      required: ["research_id"],
    },
  },
  {
    name: "smart_doctor",
    description:
      "仅用于检查 smart-search 配置、API 连通性和能力状态；不是研究取证步骤。",
    inputSchema: { type: "object", properties: {} },
  },
];

module.exports = { TOOLS };
