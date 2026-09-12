# 当前架构

[文档地图](../README.md) · [设计方法](../architecture-guide/README.md) · [规格入口](../../spec/README.md)

架构设计以[系统目标与最终状态](../requirements/README.md)为前提。这些要求随用户介绍逐步
完善；本页维护已确认的架构方向及缺口，全局约束正文见[系统要求](../requirements/system/constraints.md)，落实导航见[约束投影](constraints.md)。

## 目录

- [系统定位](#系统定位)
- [内核与自建边界](#内核与自建边界)
- [动态能力与契约](#动态能力与契约)
- [部署身份与模型请求](#部署身份与模型请求)
- [当前设计与未决事项](#当前设计与未决事项)
- [需求覆盖与缺口](#需求覆盖与缺口)
- [决定与证据](#决定与证据)

## 系统定位

`omne-harness-lite` 是一个更轻量化、更高性能的 OMNE harness 系统，以 DeepSeek 提出的 Cordis 为内核，保留原 `omne-next/omne_harness` 的核心设计理念和最佳实践。它以完全动态系统为目标，为服务于组织或个人的智能体系统提供能力；产品最终状态、持续利益对齐及功能继承方向以[系统目标](../requirements/README.md)为依据。

当前处于设计和实验性演进阶段，没有正式生产部署。本文描述已确认的设计方向及明确列出的缺口，不将目标当作已经实现的能力。设计保持语言无关，可作为严格验证和跨语言复现的规格依据。

产品实现以 TypeScript 为主，Python 当前用于开发工具；产品包、应用装配和工具
依各自职责组织，详见[源码布局与 workspace](../maintenance/workspace.md)。具体运行时、
包管理器版本和产品成员随实现任务确定，目录骨架不代表已实现相应子系统。

## 内核与自建边界

| 部分 | 复用或实现边界 |
|---|---|
| Cordis | 复用动态运行时内核机制：Context、依赖解析、服务、事件和受管生命周期 |
| DSH `agent` | 作为可复用的 Agent 契约、registry 与 handle 所有权基础；具体采用版本和分发方式在实现前固定 |
| Agent Loop | 由本项目实现工作驱动、模型与工具交互、终止和结果归属等具体行为 |
| Harness 及其他子系统 | 由本项目定义和实现工具协议、治理、持久化、证据及演化能力；按契约复用适合的成熟实现 |

DSH 的具体 Agent Loop、Profile/Bundle 装配和应用策略是参考资料，不直接成为本项目实现。内核 API 与复用边界需核对实际采用版本，[Cordis 映射](../architecture-guide/reference/cordis-mapping.md)提供研究入口。

## 动态能力与契约

系统需要解释能力、提供者、依赖、作用域和政策在运行中增减与替换，以及这些变化对已有工作、状态和资源的影响。建模从消费者可依赖的保证、所有权、生命周期和组合关系出发，不预设聚合、实体或数据库事务作为所有边界的分类。

精确规格分为[能力](../../spec/capabilities/README.md)、[数据](../../spec/data/README.md)和[组合](../../spec/compositions/README.md)。记录可以拥有持久身份，枚举可以表达真正封闭的词表，但持久化不自动要求聚合或独立插件；插件实例和部署单元也不与契约目录一一对应。

不变量与状态迁移由所属契约定义。操作负责执行约束，运行时检查器提供独立观察，测试和形式模型提供有范围的验证证据。卸载检查器不撤销规则；Context 可见性不等于租户授权，资源释放不等于回滚外部副作用。具体方法见[不变量](../architecture-guide/assurance/invariants.md)和[动态演化](../architecture-guide/runtime/evolution.md)。

## 部署身份与模型请求

第一版完整交付是单机系统。关键能力必须有可独立扩展为多进程、分布式、异构节点或微服务的边界，并保持消费者可观察的领域语义。身份、状态权威、并发、失败和取消需要显式表达，具体网络基础设施按真实需求引入。[部署边界](../architecture-guide/runtime/distribution.md)说明设计方法。

从第一天支持租户隔离。受租户所有权约束的关键对象和跨边界操作显式携带租户身份，跨租户访问默认拒绝；全局自然人身份与成员关系按双层租户模型分别表达。当前候选见[租户契约](../proposals/tenant-contracts/README.md)，其 review 状态不因本页引用而改变。

产品要求进一步明确：同一用户可以归属多个组织，组织上下文影响其与 agent
协作时的数据、权限、行动空间和流程规范等效用（effect）。具体要求统一维护于
[原生租户隔离与多组织上下文](../requirements/product/user/PF-001-tenant-organization-context.md)。

所有模型请求统一经 OpenRouter。模型档案、一次工作的模型选择和实际请求分别有自己的语义归属；档案数据的存在不证明调用已授权或已准备就绪。[模型契约候选](../proposals/model-contracts/README.md)保留现有定义及缺口。

## 当前设计与未决事项

| 事项 | 当前归属 |
|---|---|
| 需求正文、确认、基线及变更适用性 | [D-004](../decisions/D-004-requirements-foundation.md)及[需求维护](../maintenance/requirements.md) |
| 组织、身份、版本及接受规则 | [D-001](../decisions/D-001-documentation-system.md)及[维护规范](../maintenance/README.md) |
| 决定最终权威及有证据的复议 | [D-002](../decisions/D-002-decision-authority.md) |
| 防御模式适用、退出与开发模型切换前评估 | [D-003](../decisions/D-003-defensive-evaluation.md)及[评估体系](../evaluation/README.md) |
| 租户和模型的具体数据与管理行为 | [租户](../proposals/tenant-contracts/README.md)、[模型](../proposals/model-contracts/README.md)候选，保留原始语义和待确认项 |
| 提示词、工具、Session/Turn/Run/Step | [Agent 核心提案](../proposals/agent-core/README.md)，尚未接受完整契约 |
| 不变量注册方式、提供者切换政策与正式行为模型 | 按具体能力继续设计；指南示例不构成批准 |

`spec/catalog.json` 是正式接受版本的登记入口，实际覆盖以[规格索引](../../spec/README.md)为准。空白或未形式化部分如实保留，不能靠目录骨架宣称系统设计已经完成。

## 需求覆盖与缺口

当前产品设计仍为候选，正式 catalog 为空。下表是发现缺口的投影；候选自身拥有
需求对应关系，不能将链接或治理检查通过当作产品能力已交付。

| 上游要求 | 当前对应与尚缺内容 |
|---|---|
| [SYS-DYNAMIC](../requirements/system/fully-dynamic-system.md)、[SYS-LONG-RUNNING](../requirements/system/long-running-and-evolving.md) | [Agent 核心候选](../proposals/agent-core/README.md#当前需求对应与缺口)仅覆盖部分执行语义；长期稳定与动态达成判断尚未形成精确承诺 |
| [SYS-RUNTIME-CONTINUITY](../requirements/system/runtime-state-and-continuity.md) | 新增已确认系统目标；[状态与存储](../architecture-guide/modeling/state-and-storage.md)、[部署边界](../architecture-guide/runtime/distribution.md)提供方法，运行时/持久状态分工、同构恢复和异构装配仍缺完整规格与兑现证据 |
| [SYS-ALIGNMENT](../requirements/system/interest-alignment.md) | 目标已确认，利益对齐含义、冲突处理与验证方式待展开 |
| [SYS-CONTINUITY](../requirements/system/omne-next-continuity.md) | 已有来源核对，完整继承清单、截止范围和未来承诺处理仍待明确 |
| [PF-001](../requirements/product/user/PF-001-tenant-organization-context.md) | [租户候选](../proposals/tenant-contracts/README.md#当前需求对应与缺口)有身份输入，协作上下文与四类效用尚需定义 |
| [PF-002.C1](../requirements/product/environment/PF-002-external-change-response.md#已确认要求) | [Agent 核心候选](../proposals/agent-core/README.md#当前需求对应与缺口)不代表完整环境感知、响应与行动；还没有对应的已接受端到端设计 |
| [PF-003](../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) | [工具候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚未完整定义调用状态、按需过程帧、单次中断、手动及自动转后台，以及运行时恢复后的后台调用关联 |
| 已有 SYS-* 全局要求 | [约束落实索引](constraints.md)逐项导航 |

2026-09-12 迁移核对：D-001、D-002 由 D-004 补充，D-003 保持适用；没有已接受
业务设计或规格需要因这次整理撤回。未决要求继续限制依赖它们的定稿，新叙述时按
[需求变更规则](../maintenance/requirements.md#变更与适用性)更新冲突范围及处置。

## 决定与证据

当前系统要求正文归[requirements](../requirements/README.md)，本页与[落实索引](constraints.md)仅投影。历史讨论和上游事实见[项目基线记录](../research/project-baseline/README.md)与[研究索引](../research/README.md)。改变既有选择须遵循[知识流转](../maintenance/knowledge-flow.md)，无新观测时沿用有效决定。
