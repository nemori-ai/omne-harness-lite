# Harness 设计决策治理：比较研究

本包是维护 `harness-design-handbook` 的取证材料，位于不分发的 `.design/` 中。
运行中的 agent 不需要读取它；已采用的方法由 canonical references 独立、完整地表达。

本研究包考察六个具名 agent/harness 项目如何把工程设计知识从提案推进到
接受与交付。它不把 agent 的运行时任务计划、工具调用批准或产品中的人在环
交互当作设计决策。

- 检索日期：2026-09-15（UTC）。
- 基线：在该日期以 git ls-remote 解析各仓库远程 HEAD；精确提交 ID 与永久
  链接见 [evidence.md](evidence.md)。Pi 的官方贡献说明所指向的外部 Earendil
  RFC 入口没有可用的 Git 修订；其页面日期和该局限也记录在证据中。
- 范围：官方仓库中已检入的贡献说明、issue/PR 模板、架构、设计记录和 agent
  指引，以及 Pi 官方说明明确链接的 RFC 过程入口；这是聚焦的材料核对，不是
  对全部 discussion、PR、历史或外部 RFC 的穷尽调查。
- 消费者：自包含的 harness-design-handbook，尤其是未来关于提案主题、候选、
  决定、规格、实现映射与消费的材料。

## 阅读顺序

| 需要 | 入口 |
|---|---|
| 比较结论与有边界的建议 | [research.md](research.md) |
| 仓库身份、修订、来源、观察与局限 | [evidence.md](evidence.md) |

## 状态与边界

这些是研究观察，不是已经接受的流程变更。当前每个 framework proposal topic
至少列出三个候选的明确要求，仍是后续 handbook 设计的输入；本研究包既不削弱、
替代该要求，也不声称上游项目支持它。

认识论标记是有意保留的：[evidence.md](evidence.md) 记录来源事实及其覆盖
范围；[research.md](research.md) 标记直接事实结论、推断与未知，并把 handbook
建议标为本地建议而不是上游规则。
