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
| Cordis | 直接使用官方 `@deepseek-ai/cordis@4.0.2`，复用 Context、依赖解析、服务、事件和受管生命周期；发行物与源码身份见[来源记录](../proposals/runtime-composition/sources.md) |
| DSH `agent` | fork 后作为本项目维护的 registry、handle 与运行时原语基础，按本项目目标契约演化；固定上游来源并记录差异 |
| Agent Loop | 本项目定义并维护工作驱动、模型与工具交互、终止和结果归属；按 D-006 定向复用适合的上游驱动源码 |
| Harness 及其他子系统 | 由本项目定义和实现工具协议、治理、持久化、证据及演化能力；按契约复用适合的成熟实现 |

上述维护边界来自 [SYS-KERNEL](../requirements/system/constraints.md#sys-kernel)。其他选定
复用的 DSH 组件同样由本项目 fork 维护；本批来源已由 [D-006](../decisions/D-006-dsh-core-adoption.md)
确定，逐包范围与后续设计见[复用边界](dsh-core-adoption.md)。DSH 的
Agent Loop、Profile/Bundle 装配和应用策略不自动成为本项目契约。内核 API 与复用边界
需核对实际采用版本，[Cordis 映射](../architecture-guide/reference/cordis-mapping.md)提供研究入口。

运行时专题见 [Agent 运行时](agent-runtime.md)，目标契约、源差异和本轮正式化状态由其入口导航；
Agent Loop 已由 [D-012](../decisions/D-012-run-driver-and-inbound.md) 定义为 Run 驱动器，见
[Run 驱动器与 Inbound](run-driver.md)。[D-014](../decisions/D-014-session-run-agent-lifecycles.md)
把 Session、Run 与 Agent 实例定为三台各有权威的状态机，见 [Session](session.md)、
[Run](run.md) 与三者的[生命周期组合](../../spec/compositions/session-run-agent-lifecycles/README.md)。
跨提供者交接与状态归属见[运行时共同边界](runtime-composition.md)，已由 D-007
正式化 Agent/Session 附着组合 v1；不代表完整 Session 或产品闭环已实现。

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
| 租户和模型的具体数据与管理行为 | [D-008 核心能力](core-capabilities.md)及精确规格拥有本批已接受范围；旧[租户](../proposals/tenant-contracts/README.md)、[模型](../proposals/model-contracts/README.md)候选只保留其历史与未覆盖部分 |
| 提示词、工具、Session/Run/Step | [D-008 核心能力](core-capabilities.md)拥有本批目标契约；[Agent 核心候选](../proposals/agent-core/README.md)中的其它语义仍未接受 |
| 活体 Agent 身份、装配、授权与退出 | [运行时专题](agent-runtime.md)、[D-005](../decisions/D-005-agent-runtime.md)及精确规格 |
| Agent Loop 的推进、异步到达的裁决、占位与恢复 | [Run 驱动器与 Inbound](run-driver.md)、[D-012](../decisions/D-012-run-driver-and-inbound.md)及 run-driver v2 / session v1 / run v1；通知命名空间、PF-004 完整派发协议与多进程 epoch 活性仍未定 |
| Session、Run 与 Agent 实例的状态机、三条关系与级联，三者作为独立插件 | [Session](session.md)、[Run](run.md)、[D-014](../decisions/D-014-session-run-agent-lifecycles.md)及 session v1 / run v1 / 生命周期组合 v1 / CC v2；事件与 envelope 的 Schema、跨协调域协议与归档后后台调用政策仍未定 |
| 共同能力归属、四类提供者与 Session 附着 | [共同边界](runtime-composition.md)、[D-007](../decisions/D-007-runtime-composition.md)及组合 v1 |
| 本批 DSH 来源集合与依赖裁剪 | [复用边界](dsh-core-adoption.md)与 [D-006](../decisions/D-006-dsh-core-adoption.md)；只接受来源和阶段门槛 |
| 本批 Session/Run、工具、授权/HITL、模型/媒体及相邻能力 | [核心能力](core-capabilities.md)与 D-008 已接受目标契约；真实提供者和应用仍待实现验收 |
| 其它能力的提供者切换政策与行为模型 | 按具体能力继续设计；指南示例不构成批准 |

`spec/catalog.json` 是正式接受版本的登记入口，实际覆盖以[规格索引](../../spec/README.md)为准。空白或未形式化部分如实保留，不能靠目录骨架宣称系统设计已经完成。

## 需求覆盖与缺口

运行时 v1 的范围见 [D-005](../decisions/D-005-agent-runtime.md)，本批新增核心能力范围见
[D-008](../decisions/D-008-core-capabilities.md)；其它产品设计及实际实现继续推进。
下表保留整体产品缺口；运行时本轮的逐项覆盖由[消费记录](../proposals/agent-runtime/v1/requirements.md)拥有。候选自身拥有
需求对应关系，不能将链接或治理检查通过当作产品能力已交付。

| 上游要求 | 当前对应与尚缺内容 |
|---|---|
| [SYS-DYNAMIC](../requirements/system/fully-dynamic-system.md)、[SYS-LONG-RUNNING](../requirements/system/long-running-and-evolving.md) | [Agent 核心候选](../proposals/agent-core/README.md#当前需求对应与缺口)仅覆盖部分执行语义；长期稳定与动态达成判断尚未形成精确承诺 |
| [SYS-RUNTIME-CONTINUITY](../requirements/system/runtime-state-and-continuity.md) | 新增已确认系统目标；[状态与存储](../architecture-guide/modeling/state-and-storage.md)、[部署边界](../architecture-guide/runtime/distribution.md)提供方法，[运行时 v1](agent-runtime.md)明确了活体与持久状态的职责分工；同构恢复和异构装配仍缺完整规格与兑现证据 |
| [SYS-OBSERVABILITY](../requirements/system/observability-and-logging.md) | 工程全链路及日志完备已确立；[约束落实](constraints.md)投影尚缺的关联、采集、缺口处理及验证责任，不代表已选定观测技术栈 |
| [SYS-ALIGNMENT](../requirements/system/interest-alignment.md) | 目标已确认，利益对齐含义、冲突处理与验证方式待展开 |
| [SYS-CONTINUITY](../requirements/system/omne-next-continuity.md) | 已有来源核对，完整继承清单、截止范围和未来承诺处理仍待明确 |
| [PF-001](../requirements/product/user/PF-001-tenant-organization-context.md) | [D-008 核心能力](core-capabilities.md)已接受租户／成员与定义资产的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-002](../requirements/product/environment/PF-002-external-change-response.md) | [当前候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚缺 Connector 安装授权、供给与生命周期、被动感知及主动响应的完整设计；[租户候选](../proposals/tenant-contracts/README.md#当前需求对应与缺口)也未覆盖信源准入与组织要求安装 |
| [PF-003](../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) | [D-008 核心能力](core-capabilities.md)已接受独立调用、后台控制及帧披露的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-004](../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md) | 已确认完整继承 sub-agent 相关要求；[Agent 核心候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚无完整派发、实时委托授权、监督与定时回流设计；继承范围按[来源有效修订](../research/subagent-requirement-sources.md#来源差异与未决范围)解释 |
| [PF-005](../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md) | [D-008 核心能力](core-capabilities.md)已接受耐久人类请求与独立接续的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-006](../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md) | [D-008 核心能力](core-capabilities.md)已接受逐字段设置、持续授权及当前判定的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-007](../requirements/product/user/PF-007-system-initiated-hitl.md) | [D-008 核心能力](core-capabilities.md)已接受声明驱动系统审批及合格暂行协议的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-008](../requirements/product/user/PF-008-unified-decision-pool.md) | [D-008 核心能力](core-capabilities.md)已接受统一请求池读写与后果交付的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-009](../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md) | [D-008 核心能力](core-capabilities.md)已接受内容／媒体、slash 及控制入口的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付。待处理（2026-09-15 [需求扩展](../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#变更记录)）：快捷键可触发显式绑定的命令与流程，[command-input v1 IN-02](../../spec/capabilities/command-input/v1/contract.md) 与 [session v1](../../spec/capabilities/session/v1/contract.md) 的"键盘即控制"措辞待下一版对齐；command-input v1 仍引用已取代的 session-run v1，一并升版 |
| [PF-010](../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) | [D-008 核心能力](core-capabilities.md)已接受租户、资产引用和必要管理接口的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-011](../requirements/product/agent/PF-011-future-planning-calendars-and-reminders.md) | [当前候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚缺复杂未来规划、多地日历、耐久闹钟与推送的完整设计；执行和/或通知按本轮要求可组合，源旧互斥限制不作为本项目约束 |
| [PF-012](../requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md) | [当前候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚缺三类 use、沙盒/本机目标授权及共享环境控制的完整定义；部署有效范围由模型能力等级、装配配置、部署默认权限与用户授权共同决定，精确作用规则待设计 |
| [PF-013](../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) | [D-008 核心能力](core-capabilities.md)已接受会话／Run、队列和精确控制的本轮契约，[D-014](../decisions/D-014-session-run-agent-lifecycles.md) 将其拆入 session v1 与 run v1 并补齐三台状态机的关系与级联（[覆盖记录](../proposals/session-run-agent-lifecycles/requirements.md)）；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-014](../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md) | [D-008 核心能力](core-capabilities.md)已接受工具和独立 skill 的发现装载的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-015](../requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md) | [当前候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚缺独立于运行时及宿主机的制品存储、本机/沙盒加载、隔离工作副本和并发保存模型；Git worktree 仅是可选示例 |
| [PF-016](../requirements/product/agent/PF-016-agent-developed-cordis-plugins-and-live-deployment.md) | [当前候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚缺 Agent 在权限策略下开发、验证、在线部署与管理 Cordis 插件的完整模型；已扩展旧官方实现来源边界，内核 HMR 不自动提供租户安全、在途迁移或持久部署 |
| [PF-017](../requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md) | [Agent 核心候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚缺跨会话历史检索、后台通信、目标受理及恢复接续的完整模型，父子监督不覆盖全部对等协作 |
| [PF-018](../requirements/product/agent/PF-018-selfound-knowledge-and-cognition-use.md) | [Agent 核心候选](../proposals/agent-core/README.md#当前需求对应与缺口)尚缺 selfound 公开能力接入、身份/租户映射、认知与执行事实的契约；不重建同义知识或认知权威 |
| [PF-019](../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md) | [D-008 核心能力](core-capabilities.md)已接受预算计量、额度与供应方账务关联的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-020](../requirements/product/environment/PF-020-dependency-availability-and-degradation.md) | 待定义各装配的必要/可选依赖、实际就绪、断连操作边界与恢复；Cordis 服务注册不证明远端可用，OpenRouter 路径保持 |
| [PF-021](../requirements/product/environment/PF-021-multi-machine-deployment-and-assembly.md) | 待定义多机接入/撤回、逻辑装配与物理部署、实际落点及独占执行所有权；[部署方法](../architecture-guide/runtime/distribution.md)不等于已有集群方案，首版仍为单机 |
| [PF-022](../requirements/product/agent/PF-022-multimodal-response-and-output.md) | [D-008 核心能力](core-capabilities.md)已接受多模态流和持久内容的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-023](../requirements/product/user/PF-023-session-model-selection-and-continuity.md) | [D-008 核心能力](core-capabilities.md)已接受模型切换、模态连续性与一次压缩的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| [PF-024](../requirements/product/agent/PF-024-multi-command-tool-definition.md) | [D-008 核心能力](core-capabilities.md)已接受多命令单槽位与命令级声明的本轮契约；实际提供者、应用及[相邻范围](../proposals/core-capabilities/requirements.md#相邻边界与未覆盖部分)继续验收，不代表整个特性已交付 |
| 已有 SYS-* 全局要求 | [约束落实索引](constraints.md)逐项导航 |

2026-09-12 迁移核对：D-001、D-002 由 D-004 补充，D-003 保持适用；没有已接受
业务设计或规格需要因这次整理撤回。未决要求继续限制依赖它们的定稿，新叙述时按
[需求变更规则](../maintenance/requirements.md#变更与适用性)更新冲突范围及处置。

## 决定与证据

当前系统要求正文归[requirements](../requirements/README.md)，本页与[落实索引](constraints.md)仅投影。历史讨论和上游事实见[项目基线记录](../research/project-baseline/README.md)与[研究索引](../research/README.md)。改变既有选择须遵循[知识流转](../maintenance/knowledge-flow.md)，无新观测时沿用有效决定。
