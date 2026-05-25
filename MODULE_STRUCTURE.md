# Smart Search MCP Adapter - 模块结构说明

## 概述

已将原来的 3700+ 行单文件重构为模块化结构，便于维护和扩展。

## 目录结构

```
smart-search-mcp-adapter/
├── smart-search-mcp.js          # 主入口文件 (~100 行)
├── smart-search-mcp.js.backup   # 原始文件备份
├── lib/
│   ├── constants.js             # 常量定义（白名单、工具集合）
│   ├── logger.js                # 日志和审计功能
│   ├── tools.js                 # MCP 工具定义
│   ├── cli-executor.js          # smart-search CLI 调用封装
│   ├── temporal.js              # 时间上下文处理
│   ├── mcp-protocol.js          # MCP 协议层（send/receive）
│   ├── research-session.js      # 研究会话管理（已创建但未使用）
│   ├── handlers/                # 工具处理器
│   │   ├── index.js             # 统一导出所有 handlers
│   │   ├── search.js            # smart_search 处理
│   │   ├── deep-research.js     # smart_deep_research 处理
│   │   ├── deep-execute.js      # smart_deep_execute 处理
│   │   ├── deep-run.js          # smart_deep_run 处理
│   │   ├── deep-status.js       # smart_deep_status 处理
│   │   ├── fetch.js             # smart_fetch 处理
│   │   ├── map.js               # smart_map 处理
│   │   ├── exa-search.js        # smart_exa_search 处理
│   │   └── doctor.js            # smart_doctor 处理
│   └── utils/                   # 工具函数
│       ├── step-utils.js        # 步骤处理工具
│       ├── session-utils.js     # 会话摘要和渲染
│       └── url-utils.js         # URL 提取和选择
```

## 模块说明

### 核心模块

- **smart-search-mcp.js**: 主入口，处理 MCP 协议消息和路由
- **lib/constants.js**: 定义工具白名单和搜索类工具集合
- **lib/logger.js**: 统一的日志和审计功能
- **lib/tools.js**: MCP 工具定义（9 个工具）
- **lib/mcp-protocol.js**: MCP 协议层，负责 JSON-RPC 消息发送

### 执行层

- **lib/cli-executor.js**: 封装 smart-search CLI 调用，处理跨平台参数、超时、时间上下文
- **lib/temporal.js**: 处理中文时间表达（今天、昨天、本月等）并转换为数值格式

### 处理器层 (handlers/)

每个 MCP 工具对应一个独立的处理器模块：

- **search.js**: 快速搜索
- **deep-research.js**: 创建深度研究会话
- **deep-execute.js**: 执行研究步骤
- **deep-run.js**: 自动执行研究直到完成
- **deep-status.js**: 查询研究状态
- **fetch.js**: 抓取网页
- **map.js**: 站点地图
- **exa-search.js**: Exa 搜索
- **doctor.js**: 配置检查

### 工具函数层 (utils/)

- **step-utils.js**: 步骤解析、验证、参数构建
- **session-utils.js**: 会话摘要、Markdown 渲染
- **url-utils.js**: URL 提取、评分、自动选择

## 优势

1. **可维护性**: 每个模块职责单一，易于理解和修改
2. **可扩展性**: 添加新工具只需创建新的 handler 文件
3. **可测试性**: 每个模块可以独立测试
4. **代码复用**: 工具函数可以在多个 handler 中复用
5. **清晰的依赖**: 模块间依赖关系明确

## 如何添加新工具

1. 在 `lib/tools.js` 中添加工具定义
2. 在 `lib/handlers/` 中创建新的处理器文件
3. 在 `lib/handlers/index.js` 中导入并注册新处理器
4. 如需要，在 `lib/constants.js` 中更新白名单

## 测试

```bash
# 启动服务器
node smart-search-mcp.js

# 应该看到：
# [smart-search-mcp] Starting smart-search MCP server...
# [smart-search-mcp] Node v22.22.0 | PID xxxxx
```

## 回滚

如果遇到问题，可以恢复原始文件：

```bash
cp smart-search-mcp.js.backup smart-search-mcp.js
```
