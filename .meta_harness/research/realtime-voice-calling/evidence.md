# 证据索引

本页只做索引。证据条目按子主题分在 `notes/` 下，每份文件内逐条标注来源、精确版本与立场。
取证日统一为 2026-09-19，除非条目另有标注。

| 子主题 | 覆盖的来源与立场 | 关联结论 | 阅读入口 |
|---|---|---|---|
| OpenAI `gpt-live-1` 规格与主张 | 官方文档页（一手·直连）、三篇官方长文（一手·经代理）、cookbook 评测指南（一手）、两家有利益相关的二手评测 | C1、C6、C8 | [gpt-live.md](notes/gpt-live.md) |
| 架构与延迟、轮次控制 | 厂商技术博客（仅搜索摘要）+ OpenAI 工程稿（一手·经代理）+ GitHub issue（一手） | C2、C3 | [architecture.md](notes/architecture.md) |
| 产品版图与自托管 | 竞争者互评（无中立来源）+ Google 官方文档（一手·直连）+ GitHub issue（一手） | C4、C9、C10 | [platforms.md](notes/platforms.md) |
| 电话接入与法规 | OpenAI SIP 指南（一手）+ FCC/CFR/USC/加州法条原文 + CRS 报告 + RCFP | C5 | [telephony-compliance.md](notes/telephony-compliance.md) |
| 评测基准 | 四篇论文全文（一手，仅 FDB v1 过同行评审）+ 商业榜单 + PNAS 人类基线 | C6、C7 | [evaluation.md](notes/evaluation.md) |
| 开发者实测与失败模式 | HN 与 OpenAI 官方论坛（一手，个人经验）+ GitHub issue（一手）+ 数字溯源 | C3、C8、C9、C10、C11 | [field-reports.md](notes/field-reports.md) |

## 可信度分级（本包使用的口径）

| 档位 | 含义 |
|---|---|
| 一手·直连 | WebFetch 直取目标页，内容经工具内置摘要模型抽取 |
| 一手·经代理 | 目标站拒绝直连，经第三方反向代理取得，再经摘要抽取——**多一层转换，非原始字节** |
| 一手·个人经验 | HN、官方论坛、GitHub issue 的开发者自述，非厂商亦非竞品，但环境与方法未经验证 |
| 二手·利益相关 | 厂商、竞品、分销方发布的评测与对比，按"说对手的短处可参考、说自己最好不采信"处理 |
| 引用链断裂 | 转引自不可溯源的出处，**不作为证据使用**（见 C11） |

## 批量核对对象换版本

上游升级时，grep `notes/` 下该对象的旧版本 token 找需要重新核对的条目：

```bash
grep -rn "gpt-live-1\|gpt-realtime-2.1\|Gemini 3.8 Live\|v0.0.85\|v0.0.97" research/realtime-voice-calling/notes/
```

本包涉及的对象版本：OpenAI `gpt-live-1`（知识截止 2025-07-31）、`gpt-realtime-2.1`、
Google Gemini 3.8 Live、Pipecat v0.0.65/0.0.85/0.0.97、LiveKit Agents（issue 编号见 notes）、
FCC 24-17、FCC 24-84（NPRM）、EU AI Act Art. 50(1)。

## 本轮取证失败与未闭合项

- `openai.com` 两篇长文对 WebFetch 直连返回 **403**，改经反代取得；`web.archive.org` 本环境不可达，无法交叉验证。
- `platform.openai.com/docs/guides/realtime-sip` 301 后目标页 **404**，真实现址为 `.../guides/voice-sip`。
- `pnas.org` 直链 403，Stivers et al. 2009 经 PMC 官方镜像取得。
- EU AI Act 的 EUR-Lex 官方页未能直接抓取，用了准一手镜像。
- **「75.7% 盲测偏好」**：多家二手引为 OpenAI 自述，两次抓原文（含要求逐字输出的重试）均未见该数字，
  来源未闭合——**在闭合前不要引用**。
- **「每 10 万通 340 起客户可见事件」「60% 部署 90 天内失败」**：引用链断裂，见 C11，**不可用**。
