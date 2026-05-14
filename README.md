# Smart Search MCP Adapter

将 [smartsearch](https://github.com/konbakuyomu/smartsearch) CLI 工具包装为标准 MCP (Model Context Protocol) STDIO 服务器，方便在 Cherry Studio 等支持 MCP 协议的客户端中使用。

## 功能特性

- **标准 MCP 协议**：完全兼容 MCP STDIO 传输协议（NDJSON 格式）
- **多工具支持**：提供 5 个功能强大的搜索工具
- **跨平台兼容**：支持 Windows、Linux 和 macOS
- **错误处理**：完善的错误处理和日志记录机制
- **超时保护**：5 分钟超时保护，防止长时间运行的搜索阻塞

## 工具说明

### 1. `smart_search`
多来源智能网页搜索，调用 smart-search search 命令。

**参数：**
- `query` (必需)：搜索查询内容
- `extra_sources` (可选)：补充来源数（0=不补充，1-5=额外调用 Tavily/Firecrawl）
- `validation` (可选)：交叉验证强度（fast/balanced/strict）
- `format` (可选)：输出格式（json/markdown）
- `model` (可选)：指定模型 ID

### 2. `smart_fetch`
抓取指定 URL 的网页正文，转换为 Markdown 格式。

**参数：**
- `url` (必需)：要抓取的网页 URL
- `format` (可选)：输出格式（json/markdown）

### 3. `smart_map`
查看文档站点的页面结构（站点地图）。

**参数：**
- `url` (必需)：目标站点根 URL
- `instructions` (可选)：过滤指令（如"只看文档页"）
- `max_depth` (可选)：最大深度（默认：1）
- `max_breadth` (可选)：最大宽度（默认：20）
- `limit` (可选)：结果限制（默认：50）

### 4. `smart_exa_search`
使用 Exa 搜索官方文档、API、论文、产品页等高质量内容。

**参数：**
- `query` (必需)：搜索查询
- `num_results` (可选)：结果数量（默认：5）
- `search_type` (可选)：搜索类型（neural/keyword/auto）
- `include_domains` (可选)：限定域名（逗号分隔）
- `exclude_domains` (可选)：排除域名（逗号分隔）

### 5. `smart_doctor`
检查 smart-search 配置、API 连通性和能力状态。

**参数：** 无

## 安装与使用

### 前提条件
1. 安装 Node.js (v14 或更高版本)
2. 安装 smart-search CLI：`npm install -g smart-search`
3. 配置所需的 API 密钥（如 Tavily、Firecrawl、Exa 等）

### 安装适配器

```bash
# 克隆仓库
git clone https://github.com/your-username/smart-search-mcp-adapter.git
cd smart-search-mcp-adapter

# 安装依赖（无需额外依赖）
npm install
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

### 示例 1：智能搜索
```
帮我搜索"最新的人工智能技术趋势"，并提供详细的分析报告
```

### 示例 2：抓取网页内容
```
抓取 https://example.com/article 这个页面的正文内容
```

### 示例 3：查看站点地图
```
查看 https://docs.example.com 这个文档站点的页面结构
```

### 示例 4：高质量搜索
```
使用 Exa 搜索关于"机器学习最佳实践"的官方文档和学术论文
```

### 示例 5：检查配置
```
检查 smart-search 的配置状态和 API 连通性
```

## 配置说明

### 环境变量
适配器依赖 smart-search CLI 的功能，需要配置相应的 API 密钥：

- `TAVILY_API_KEY`：Tavily 搜索 API 密钥
- `FIRECRAWL_API_KEY`：Firecrawl 抓取 API 密钥
- `EXA_API_KEY`：Exa 搜索 API 密钥

### 高级配置
可以通过修改 `smart-search-mcp.js` 文件中的配置来调整：
- 超时时间（默认 5 分钟）
- 日志级别
- 工具描述

## 调试与日志

适配器会将调试日志输出到 stderr，可以在 Cherry Studio 的 MCP 日志面板中查看：

```
[smart-search-mcp] Starting smart-search MCP server...
[smart-search-mcp] Node v18.17.0 | PID 12345
[smart-search-mcp] INIT: protocolVersion=2024-11-05
[smart-search-mcp] Client initialized
```

## 故障排除

### 常见问题

1. **"smart-search not found" 错误**
   - 确保 smart-search CLI 已全局安装：`npm install -g smart-search`
   - 检查 PATH 环境变量是否包含 smart-search 的安装路径

2. **API 密钥错误**
   - 确保所有必需的 API 密钥已正确配置
   - 检查密钥是否有效且未过期

3. **超时错误**
   - 某些搜索查询可能需要较长时间
   - 可以尝试简化查询或增加超时时间

4. **连接问题**
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
- **错误处理**：全局异常捕获和 Promise 错误处理
- **超时保护**：5 分钟超时防止进程阻塞

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