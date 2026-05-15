# Deep Research Plan

**Question:** SAMSUNG MZVL41T0HBLB-00BTW thermal protection overheating throttling drive disconnect
**Mode:** deep_research
**Difficulty:** high
**Evidence policy:** fetch_before_claim

## Boundary
- **search:** smart-search search runs live fast/broad search immediately.
- **deep:** smart-search deep is an offline planner; it does not execute provider calls or fetch pages.
- **execution:** An AI agent or user executes the listed steps with existing CLI commands, then performs gap_check.

## Decomposition
- **sq1:** SAMSUNG MZVL41T0HBLB-00BTW thermal protection overheating throttling drive disconnect 的整体问题轮廓和候选来源是什么？
- **sq2:** SAMSUNG MZVL41T0HBLB-00BTW thermal protection overheating throttling drive disconnect 里有哪些主要选项、说法或路线需要分别验证？
- **sq3:** SAMSUNG MZVL41T0HBLB-00BTW thermal protection overheating throttling drive disconnect 的成本、风险、限制和适用边界是什么？
- **sq4:** 基于已抓取证据，SAMSUNG MZVL41T0HBLB-00BTW thermal protection overheating throttling drive disconnect 应该如何形成可执行结论？

## Steps
s1. `search` (sq1) - broad discovery and routing metadata
   ```powershell
   smart-search search "SAMSUNG MZVL41T0HBLB-00BTW thermal protection overheating throttling drive disconnect" --validation balanced --extra-sources 3 --format json --output "C:\tmp\smart-search-evidence\20260515-1100-samsung-mzvl41t0hblb-00btw-thermal-protection-ov\01-search.json"
   ```
s2. `exa-search` (sq3) - low-noise evidence for tradeoffs and risks
   ```powershell
   smart-search exa-search "SAMSUNG MZVL41T0HBLB-00BTW thermal protection overheating throttling drive disconnect risks limitations comparison" --num-results 5 --format json --output "C:\tmp\smart-search-evidence\20260515-1100-samsung-mzvl41t0hblb-00btw-thermal-protection-ov\02-exa.json"
   ```
s3. `fetch` (sq4) - fetch key URLs before final claims
   ```powershell
   smart-search fetch "<key-url>" --format markdown --output "C:\tmp\smart-search-evidence\20260515-1100-samsung-mzvl41t0hblb-00btw-thermal-protection-ov\03-fetch.md"
   ```

## Gap Check
fetch missing evidence for key claims or downgrade unsupported claims to unverified candidates