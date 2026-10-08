<!-- 来源清单：URL、固定版本与核对日期。主稿见 README.md。 -->

# 来源、固定版本与核对日期

全部来源在 **2026-09-15** 核对。GitHub 来源通过 contents / commits / git-trees API 按 commit 读取原文；网页来源通过抓取并就具体问题提取，标注为"页面抓取"的**未逐字通读全文**。

版本只是本次研究的基线，不是本项目的依赖声明或采用承诺。

## 1. 通用开源流程

| 来源 | URL | 固定版本 | 读取方式 | 笔记 |
|---|---|---|---|---|
| Rust RFC | `https://github.com/rust-lang/rfcs` | 仓库 HEAD `51783df9a76c355de7ceebeae101cba47f8ca463`（2026-09-10）；`README.md` @ `895324ee01f0c579ae1de46ddddd55967aff6c5e`（2025-12-11）；`0000-template.md` @ `f17e8623ee2e2854570dcdb936a9f4ab08c0fcd4`（2025-11-29） | API 读原文，逐行 | [rust-rfc](notes/rust-rfc.md) |
| Python PEP | `https://github.com/python/peps` | 仓库 HEAD `94a7775f23fd6eb7c527cf8180dab4542c5da622`（2026-09-11）；`peps/pep-0001.rst` @ `74fc18d540c2ea9d2a6f1ba852d0a56e10e1057d`（2026-08-07）；`peps/pep-0012.rst` @ `76b2b6a2aba25f827c0f76a7492b1cf666b46243`（2026-03-04） | API 读原文，定向 grep + §`What belongs in a successful PEP?` 逐行 | [python-pep](notes/python-pep.md) |
| Kubernetes KEP | `https://github.com/kubernetes/enhancements` | HEAD `2f57ef9064946203f5b0e0f012a56a29159c85b3`（2026-09-14） | `keps/README.md`、`keps/NNNN-kep-template/{README.md,kep.yaml}`、`hack/verify-kep-metadata.sh`、`api/proposal.go` | [kubernetes-kep](notes/kubernetes-kep.md) |
| Swift Evolution | `https://github.com/swiftlang/swift-evolution` | HEAD `f91c861dfebbb53f0869e1035d502cbf34855714`（2026-09-15） | `process.md`、`proposal-templates/0000-swift-template.md` | [swift-evolution](notes/swift-evolution.md) |
| TC39 流程 | `https://tc39.es/process-document/` | **页面无版本/日期标记**；源仓库 `github.com/tc39/process-document` HEAD `1d498bdfb3e0dce10c69f63d8d12f881345d435f`（2025-01-22） | 页面抓取（定向提取阶段表） | [tc39-stages](notes/tc39-stages.md) |
| TC39 写作与政策 | `https://github.com/tc39/how-we-work` | HEAD `68d1201c1afb4a4155d1ff572d41bb8028f82b3e`（2026-04-10）；`AI_POLICY.md` @ `fd63799260374107bbcc22c205409b6f9265fea1`（2026-03-20） | API 读原文；`explainer.md` 逐行、`AI_POLICY.md` 全文 | [tc39-stages](notes/tc39-stages.md) |
| Nix RFC | `https://github.com/NixOS/rfcs` | HEAD `32c871cae67fec997c9af2bf15f4a9e41d885109`（2026-06-04，`README.md` 同）；`0000-template.md` @ `e364d5f0cddc03d164f0d7dfc8d6c4f1616364b7`（2023-06-13） | API 读原文，模板逐行 | [nix-rfc](notes/nix-rfc.md) |
| Ethereum EIP | `https://github.com/ethereum/EIPs` | HEAD `7c073a9d83c6e39f4ee14a71acbb513e2b987c12`（2026-09-14）；`EIPS/eip-1.md` @ `d7f6f26dd7b183e3f58143b966fc61ee152b062b`（2026-08-10，该 EIP `status: Living`、`created: 2015-10-27`） | API 读原文；`eip-1.md`、`eip-template.md` | [ethereum-eip](notes/ethereum-eip.md) |
| IETF 标准流程 | `https://www.rfc-editor.org/rfc/rfc2026.html` | RFC 2026，1996-10，BCP 9 | 页面抓取（定向提取，**未通读**） | [ietf-rfc](notes/ietf-rfc.md) |
| IETF 文档格式 | `https://www.rfc-editor.org/rfc/rfc7322.html` | RFC 7322，2014-09 | 页面抓取（定向提取，**未通读**） | [ietf-rfc](notes/ietf-rfc.md) |
| ADR 原型（Nygard） | `https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions` | 发表日 2011-11-15 | 页面抓取（定向提取） | [adr-nygard-madr](notes/adr-nygard-madr.md) |
| MADR | `https://github.com/adr/madr` | HEAD `ba75bb1b20d42af5746b246ad348c202419ae681`（2026-08-28）；`package.json` 版本 **4.0.0**；`template/adr-template.md` @ `8135ed2e01503be852769402ec3eeb585bfe75a2`（2026-04-17） | API 读原文，模板逐行 | [adr-nygard-madr](notes/adr-nygard-madr.md) |
| ADR 目录站 | `https://adr.github.io/` | 无版本标记，页脚 © 2026 | 页面抓取（结果稀薄） | [adr-nygard-madr](notes/adr-nygard-madr.md) |
| W3C TAG Explainer | `https://w3ctag.github.io/explainer-explainer/` | 页面标注 last updated **2026-04-29**；源仓库 `github.com/w3ctag/explainer-explainer` HEAD `853418960ccfcc11744f5d7b0b2da4d9810a071c`（2026-04-29） | `template.md` API 读原文逐行；正文页面抓取 | [w3c-tag-explainer](notes/w3c-tag-explainer.md) |

旧地址 `https://tag.w3.org/explainers/` 现为跳转页，不再承载内容。

## 2. AI agent 生态

| 来源 | URL | 固定版本 | 读取方式 | 笔记 |
|---|---|---|---|---|
| MCP SEP 流程 | `https://modelcontextprotocol.io/community/sep-guidelines` | 页面无版本标记 | 页面抓取（该页内容较完整） | [mcp-sep](notes/mcp-sep.md) |
| MCP 仓库 | `https://github.com/modelcontextprotocol/modelcontextprotocol` | HEAD `cd0623765886c8cc282e3e5e1a03ab7469055fab`（2026-09-14） | `seps/` 全部 44 个 `.md` 按该 commit 下载统计；`CONTRIBUTING.md`、`AI_POLICY.md`、`seps/TEMPLATE.md`、`seps/1850-pr-based-sep-workflow.md` 逐行 | [mcp-sep](notes/mcp-sep.md) |
| Semantic Kernel ADR | `https://github.com/microsoft/semantic-kernel` | HEAD `ca40aa7226531d28a721d0ca0e451d0aaf86dafc`（2026-09-11） | `docs/decisions/` 全部 80 个 `.md` 按该 commit 下载统计；`0001-madr-architecture-decisions.md` 逐行 | [semantic-kernel-adr](notes/semantic-kernel-adr.md) |
| DeepSeek Harness | `https://github.com/deepseek-ai/deepseek-harness` | HEAD `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`（2026-09-15） | `.agents/notes/README.md`、`scripts/verify-agent-note-format.ts`、`docs/AGENTS.md` 逐行；git tree 全量列出 1026 份 note；随机抽 45 份正文统计 | [deepseek-harness-agent-notes](notes/deepseek-harness-agent-notes.md) |
| AG2 | `https://github.com/ag2ai/ag2` | HEAD `362d487`（2026-09-14） | 目录列举 + `.github/AI_POLICY.md`、`.github/ISSUE_TEMPLATE/feature_request.yml` | [agent-frameworks-survey](notes/agent-frameworks-survey.md) |
| AutoGen | `https://github.com/microsoft/autogen` | HEAD `027ecf0`（2026-04-06） | 目录列举 + `docs/design/` 文件名 | 同上 |
| LangChain | `https://github.com/langchain-ai/langchain` | HEAD `41d3572`（2026-09-14） | 目录列举 + `.github/ISSUE_TEMPLATE/feature-request.yml`、`openwiki/INSTRUCTIONS.md` | 同上 |
| LangGraph | `https://github.com/langchain-ai/langgraph` | HEAD `230927f`（2026-09-14） | 目录列举 + `.github/ISSUE_TEMPLATE/` 文件名 | 同上 |
| Letta | `https://github.com/letta-ai/letta` | HEAD `5bcdd17`（2026-09-10） | `AI_POLICY.md` 逐行 | 同上 |
| Dify | `https://github.com/langgenius/dify` | HEAD `07dc8eb`（2026-09-15） | 目录列举 + `.github/DISCUSSION_TEMPLATE/suggestion.yml` | 同上 |
| Mastra | `https://github.com/mastra-ai/mastra` | HEAD `f4a0091`（2026-09-15） | 目录列举 + `explorations/agent-network-vs-ralph-wiggum.md`、`.github/ISSUE_TEMPLATE/feature_request.yml` | 同上 |
| CrewAI | `https://github.com/crewAIInc/crewAI` | HEAD `66ef97c`（2026-09-14） | 目录列举 + `.github/ISSUE_TEMPLATE/feature_request.yml` | 同上 |
| OpenAI Agents SDK | `https://github.com/openai/openai-agents-python` | HEAD `fbf59a4`（2026-09-14） | 目录列举 + `PLANS.md` | 同上 |

## 3. 实证文献

| 来源 | URL | 固定版本 | 读取方式 | 笔记 |
|---|---|---|---|---|
| ADR 大样本分析 | `https://arxiv.org/abs/2609.07375` | arXiv 2609.07375 **v1**，2026-09-07 提交；未经同行评审 | 摘要页 + `arxiv.org/html/2609.07375` 定向提取 §4.3 与 Figure 5 的结论；**未通读全文、未读图表数值** | [adr-empirical-study](notes/adr-empirical-study.md) |

## 5. 本轮的统计脚本与可复现性

三处量化结论（Semantic Kernel 77 份、MCP 42 份、DSH 抽样 45 份）由本轮临时的 Python 脚本在固定 commit 的 raw 内容上跑出，脚本未入库。复现方法：按上表的 commit 下载对应目录的 `.md`，去掉 fenced 代码块后按标题匹配统计。计数启发式的已知偏差写在各笔记的"局限与未覆盖"里。
