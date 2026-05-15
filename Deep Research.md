Deep Research 深度搜索
普通问题用：

smart-search search "React useEffect cleanup 文档" --format json
需要深度搜索、拆解、核验、选型、严肃评测、多来源交叉验证时用：

smart-search deep "OpenAI Responses API web_search 和 Chat Completions 联网搜索怎么选" --budget deep --format json
smart-search dr "https://example.com/source" --format json
Deep Research 不是固定题材配方。行情、选型、技术文档、新闻政策、真假核验、用户给 URL 这些只是用户语言示例，不是 schema 枚举。它会先抽取 intent_signals，再生成 decomposition 和 capability_plan。

计划里会包含：

mode="deep_research" 和 query_mode="deep"；
intent_signals：是否强时效、是否 docs/API、是否给 URL、是否高风险、是否需要权威来源、是否需要交叉验证；
decomposition：复杂问题拆成 1-6 个子问题；
capability_plan：选择需要的能力；
steps[]：每一步的 tool、purpose、command、output_path、subquestion_id；
evidence_policy="fetch_before_claim"；
gap_check：关键结论没有正文证据就继续抓，或者降级成未验证候选。
usage_boundary：说明 search 是直接联网，deep 是离线规划，真正执行发生在计划命令里。
Deep Research 只允许组合现有 CLI 积木：

search, exa-search, exa-similar, zhipu-search, context7-library, context7-docs, fetch, map
doctor 是 preflight 配置预检，不是 research step。smart-search deep 这一步本身是离线 planner；后续执行计划里的 steps[].command 时才会联网。

换句话说，doctor 只是配置预检；它帮助 AI 判断当前 provider 是否可用，但不算 Deep Research 的取证步骤。

可以用这些标准问题测试是否进入深搜模式：

smart-search deep "深度搜索一下最近的比特币行情" --format json
smart-search deep "OpenAI Responses API web_search 和 Chat Completions 联网搜索怎么选" --budget deep --format json
smart-search deep "帮我核验这个说法是真是假：某某工具已经完全替代 Tavily 做 AI 搜索了" --format json
smart-search deep "https://example.com/source" --format json
看到输出里有 mode=deep_research、decomposition、多步 steps、evidence_policy=fetch_before_claim、preflight.executed_by_deep_command=false，就说明已经进入 Deep Research 计划模式。