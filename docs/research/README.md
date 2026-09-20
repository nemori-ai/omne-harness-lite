# 研究证据

研究支持事实判断，不直接批准项目政策。有效决定在没有新观测时仍具有最终权威。

- [完全动态系统定义：omne-next 原文与 Git 历史](fully-dynamic-system/README.md)
- [产品特性：omne-next Harness 与个人版的来源核对](product-feature-sources.md)
- [Connector 接入、信源供给及感知响应的来源核对](connector-environment-source-sources.md)
- [运行时与持久状态、恢复接续及环境适配的来源核对](runtime-state-continuity-sources.md)
- [工具执行状态、过程帧、中断与后台运行的来源核对](tool-execution-sources.md)
- [多命令工具定义的来源核对](multi-command-tool-sources.md)
- [Cordis 生命周期与工具组合的来源核对](cordis-lifecycle-and-tool-composition.md)
- [Sub-agent 要求的完整继承来源与范围](subagent-requirement-sources.md)
- [Agent 主动提问、批准与耐久 HITL 流程的来源核对](agent-initiated-hitl-sources.md)
- [用户设置、定义级授权、系统 HITL 与统一决策池的来源核对](user-governance-and-decision-pool-sources.md)
- [多模态输入、附件、键盘与 slash 命令的来源核对](user-input-and-command-sources.md)
- [组织/个人资产、权益与 official/customized 来源的核对](tenant-asset-and-permission-sources.md)
- [个人与组织的管理操作及 PF-006/PF-010 职责整理](tenant-management-sources.md)
- [租户与授权的旧系统不变量、源码反例及当前差异](tenant-authorization-invariants.md)
- [复杂未来规划、多地日历、闹钟与通知的来源核对](future-planning-calendar-and-notification-sources.md)
- [Computer、Browser、Shell 与沙盒/本机执行环境的来源核对](computer-browser-shell-environment-sources.md)
- [Session、Run 生命周期与排队输入控制的来源核对](session-run-and-pending-input-sources.md)
- [DSH 动态能力研究](dsh-cordis-dynamic/README.md)
- [DSH 与 TS/JS Agent Harness 的日志和 trace 证据](harness-observability.md)
- [运行时工具/技能装载与独立制品管理的跨系统来源](dynamic-loading-and-artifact-sources.md)
- [Agent 开发及在线装载 Cordis 插件：DSH 与 Raven 机制研究](agent-developed-cordis-plugin-sources.md)
- [个人版产品要求本质比对与 GAP 处置](personal-edition-requirement-gap-audit.md)
- [GAP 取舍与跨会话、selfound、租户财务、Cordis、输出及工程观测的来源核对](requirements-gap-resolution-sources.md)
- [端到端多模态 Harness：2026 年系统设计与工程实践](multimodal-harness-2026/README.md)
- [六个 Agent 系统的循环、事件与 hooks：DSH、Claude Code、Codex、pi、OpenCode、LangChain/deepagents](agent-loop-events-and-hooks/README.md)
- [客户端消息流：消息模型、增量协议与断线后的同一事实](client-message-stream/README.md)：DSH、OpenRouter、Codex、OpenCode、pi 与 omne-next 的流层核对

使用方法见[知识流转](../maintenance/knowledge-flow.md)。

## 已搬出本目录

2026-09-20，**调查对象是我们自己工作方法**的六份搬去了
[`.meta_harness/agents/research/`](../../.meta_harness/agents/research/README.md)：
它们的失效事件是「我们的规矩变了」，而本目录其余各份失效于「上游变了」。

| 原条目 | 现在在哪 |
|---|---|
| 框架知识治理与防御演化 | [agents/research/framework-governance](../../.meta_harness/agents/research/framework-governance/README.md) |
| 项目既有方向与迁移前记录 | [agents/research/project-baseline](../../.meta_harness/agents/research/project-baseline/README.md) |
| Cordis 形式结果与组件责任 | [agents/research/cordis-proof-boundaries.md](../../.meta_harness/agents/research/cordis-proof-boundaries.md) |
| 架构、规格与提供者设计的维护交接 | [agents/research/design-spec-maintenance](../../.meta_harness/agents/research/design-spec-maintenance/README.md) |
| Agent 系统评测与 benchmark 驱动迭代 | [agents/research/agent-system-evaluation](../../.meta_harness/agents/research/agent-system-evaluation/README.md) |
| 提案、备选方案与决策流程：15 个开源与 agent 框架的做法 | [agents/research/proposal-processes](../../.meta_harness/agents/research/proposal-processes/README.md) |

**需求基线保留与恢复**不是研究，是一次恢复验证留下的对象与结果，去了
[`design/record/evidence/legacy-requirements-baseline/`](../../.meta_harness/design/record/evidence/legacy-requirements-baseline/RETAINED.md)；
那里也记下了它**不**保全哪些基线。

各份原件未改，**其中指向 `docs/` 的相对链接在新位置不成立**，理由见目标目录的入口。
