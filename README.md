# omne-harness-lite

**为组织和个人构建能够长期运行、持续进化的智能体系统。**

`omne-harness-lite` 以 DeepSeek 提出的 Cordis 为内核，延续
`omne-next/omne_harness` 的核心设计理念与最佳实践，面向更轻量、更高性能的
OMNE harness 演进。它的目标是让智能体持续感知环境、协作完成工作、积累知识，
并在运行中发展自身能力，始终与所服务的组织或个人保持利益对齐。

> **当前阶段：设计、规格建模与实验。** 仓库已有系统目标、产品需求、候选设计和
> 验证工具，尚无可运行的智能体产品。下文介绍已确认的目标与能力方向；具体交付
> 范围、实现和验证将逐步落实。第一版完整交付为单机系统。

[系统目标与要求](docs/requirements/README.md) ·
[当前架构](docs/architecture/README.md) ·
[开发指南](docs/development.md) ·
[参与贡献](CONTRIBUTING.md)

## 系统目标

长期协作需要保留已经完成的工作、等待中的决定和未来的安排，也需要随着环境
与需求变化调整能力。项目围绕以下目标展开：

- **完全动态。** 能力的定义、实现、绑定和组合关系能够在运行期演化，结构变化
  具有明确的依赖、作用域、所有权和生命周期约束。见[完全动态系统](docs/requirements/system/fully-dynamic-system.md)。
- **超长期待机、稳定运行、持续进化。** 智能体能够长期服务，并根据工作需要
  发展能力；等待用户或未来时刻的工作可以持久保留，释放对应执行资源。
  见[长期运行目标](docs/requirements/system/long-running-and-evolving.md)。
- **状态持久，工作可接续。** Agent 运行时与持久状态解耦，在同构资源下恢复并
  接续工作；针对不同物理环境与操作系统采用合适的装配策略或部署版本。
  见[恢复与异构适配](docs/requirements/system/runtime-state-and-continuity.md)。
- **与服务对象保持利益对齐。** 以所服务的组织或个人的利益为持续目标；对齐的
  判断方式、维持机制及多方利益冲突规则仍待进一步明确。
  见[利益对齐](docs/requirements/system/interest-alignment.md)。

功能上[继承并进一步发展 omne-next 现有或已承诺的机制与功能](docs/requirements/system/omne-next-continuity.md)。
已确认范围与待展开问题由需求正文维护，作为后续建模、设计和产品化的依据。

## 产品能力

产品从**环境、用户、智能体**三个维度组织。以下是主要能力概览，完整要求与
适用边界见[产品需求](docs/requirements/product/README.md)。

### 环境：感知变化，进入实际工作环境

| 能力 | 预期体验 |
|---|---|
| [Connector 与环境响应](docs/requirements/product/environment/PF-002-external-change-response.md) | 连接外部账号、数据源与信息通道，支持推送和拉取；Agent 在工作中感知新信息，系统也可按获准条件主动触发工作。各连接的授权、暂停、撤销和供给状态独立可见。 |
| [Computer、Browser、Shell use](docs/requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md) | 操作桌面、浏览器和终端，支持沙盒及运行时所在操作系统的真实环境，包括与用户共享的电脑。实际开放范围由模型能力、部署装配、默认权限和用户授权共同决定。 |
| [依赖故障与局部离线](docs/requirements/product/environment/PF-020-dependency-availability-and-degradation.md) | 某个远端依赖失效时，具备完整条件的本地能力继续工作；受影响的操作明确显示等待、降级或失败，恢复后接续已受理工作。 |
| [多机器与异构装配](docs/requirements/product/environment/PF-021-multi-machine-deployment-and-assembly.md) | 后续可接入和管理多台机器，按实际环境装配能力，查看工作落点、依赖与就绪状态。首版单机，关键边界为后续扩展保留一致的领域语义。 |

### 用户：持续协作，掌握决定与控制权

| 能力 | 预期体验 |
|---|---|
| [个人与多组织上下文](docs/requirements/product/user/PF-001-tenant-organization-context.md) | 同一用户可以属于多个组织；协作所用的数据、权限、行动空间和流程随当前上下文生效，各租户保持隔离。 |
| [资产管理](docs/requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)与[设置授权](docs/requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md) | 在个人或组织范围管理资产、版本、设置及权限；可对 Agent 定义授权，在有权配置的范围覆盖出厂默认，并查看实际生效依据。 |
| [多模态输入与命令](docs/requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md) | 组合文本、图片、音频、视频及附件，辨认模型实际接收的内容；通过快捷键和 slash command 操作，手动调用 Skill 使用 slash 入口。 |
| [会话与运行控制](docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) | 查找和管理长期会话，中断、接续、取消或紧急停止具体工作；运行中可追加输入，对尚未取用的排队项编辑、调序和移除。 |
| [会话模型切换](docs/requirements/product/user/PF-023-session-model-selection-and-continuity.md) | 在同一会话选择另一合法模型继续下一轮，保留历史和工作关联；切换检查模态与上下文窗口条件，每条回复记录实际生成模型。 |
| [人类参与与统一决策池](docs/requirements/product/user/PF-008-unified-decision-pool.md) | [Agent 主动提问或请求批准](docs/requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md)，[系统按策略发起授权确认](docs/requirements/product/user/PF-007-system-initiated-hitl.md)；用户在跨会话决策池直接答复，驱动对应工作接续。待答请求可跨运行时重建保留。 |
| [订阅、用量与预算](docs/requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md) | 管理租户订阅、额度、账单与预算，精细查询每个 Agent Step 的费用及构成，并沿会话与派发关系汇总；实际金额、估算和未知分别可辨。 |

### 智能体：组织工作，积累知识，发展能力

| 能力 | 预期体验 |
|---|---|
| [工具观察与后台接续](docs/requirements/product/agent/PF-003-tool-execution-observation-and-control.md) | 查看调用状态及按需披露的流式过程，单独中断某次调用；声明支持的工具可手动或自动转后台，运行时恢复后重新关联既有调用。 |
| [Sub-agent 协作与监督](docs/requirements/product/agent/PF-004-subagent-delegation-and-supervision.md) | 发现可派发目标，以 delegate、spawn、handoff 等关系组织工作，接收进展和结果；用户能查看完整后代树，终止可取消的后代。权限和成本沿派发关系受约束。 |
| [未来规划、日历与提醒](docs/requirements/product/agent/PF-011-future-planning-calendars-and-reminders.md) | 根据任务、环境信号和自身维护需要规划未来工作，查询多地节假日与工作日，表达周期及复杂日程；到期可执行、通知或二者组合，纯提醒无需启动模型。 |
| [跨会话协作](docs/requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md)与[知识认知](docs/requirements/product/agent/PF-018-selfound-knowledge-and-cognition-use.md) | 检索获准会话的历史状态，与其他会话后台通信；使用 omne-selfound 的 Engram 与 Cognition 能力，跨会话读取和修订获准知识与认知，保留来源、依据和不确定性。 |
| [持久制品与隔离工作副本](docs/requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md) | 将代码、文档、数据和媒体独立于运行时及宿主机保存，加载到本机或沙盒工作；多个会话可同时处理同一制品，保存时明确整合结果或冲突。 |
| [多模态回复](docs/requirements/product/agent/PF-022-multimodal-response-and-output.md) | 逐步交付文本、图片、音频与文件，接纳模型原生输出和工具产物；用户能取得实际内容，并在有效保留期内从历史读回原件。 |
| [按需装载](docs/requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md)与[在线扩展](docs/requirements/product/agent/PF-016-agent-developed-cordis-plugins-and-live-deployment.md) | 运行时发现并装载工具、技能；在权限策略允许时，Agent 可开发、验证、部署和装载新的 Cordis 插件，使工具、技能或服务在系统持续运行期间生效。 |

## 技术基础

内核层复用 Cordis 与 DSH `agent` 原语；Agent Loop、Harness 层、工具协议、治理
及其他子系统由本项目定义和实现。具体复用边界与采用状态见[当前架构](docs/architecture/README.md#内核与自建边界)。

- **动态组合。** 可替换能力以具有生命周期、作用域和所有权的插件或服务组合；
  定义、运行实例、持久状态与物理部署分别建模。
- **语言无关的契约。** TLA+ 表达行为权威规格，Alloy 辅助验证结构约束，JSON Schema
  定义数据契约；产品实现以 TypeScript 为主。正式接受的契约版本从
  [规格清单](spec/catalog.json)查找。
- **从第一天起落实租户隔离。** 自然人全局身份与租户成员关系分别表达；受租户
  所有权约束的对象和跨边界操作显式携带租户身份，跨租户访问默认拒绝。
- **统一模型请求入口。** 所有模型请求经 OpenRouter 发送。
- **全链路可观测。** 工作从触发、授权、执行到恢复和交付均应有可关联的状态与
  日志依据，失败、部分完成和未知结果如实可见。见[可观测性要求](docs/requirements/system/observability-and-logging.md)。

在线演化须遵守已有工作的生命周期、当前权限和状态契约。恢复执行、切回旧版本、
补偿外部效果各有明确含义；动态能力的具体保证由相应规格与验证证据落实。

## 仓库与开发

仓库按 monorepo 组织，当前主要内容是需求、设计资料与验证工具。

| 位置 | 内容 |
|---|---|
| [docs/requirements/](docs/requirements/README.md) | 系统目标、产品要求与全局约束 |
| [docs/](docs/README.md) | 当前架构、研究、提案、决定与维护指南 |
| [spec/](spec/README.md) | 语言无关契约与形式模型入口；当前正式契约清单为空 |
| [packages/](packages/README.md)、[apps/](apps/README.md) | 产品包与应用装配位置，尚无产品实现成员 |
| [tools/spec-tools/](tools/spec-tools/README.md)、[scripts/](scripts/README.md) | Python 开发检查器与仓库自动化 |

当前可以运行仓库检查。按[开发指南](docs/development.md#准备可用的检出)准备 Git、
Bash、Make 和 uv，在实际工作的检出根目录执行：

```sh
uv sync --locked
make check
```

`make check` 执行文档、规格与离线测试检查组合，不调用真实模型。日常文档修改
可运行 `make docs-check`；形式模型的覆盖、执行与工具环境按[验证规范](docs/maintenance/verification.md)
分别报告。产品启动入口将在相应应用落地后提供。

参与研发从 [CONTRIBUTING.md](CONTRIBUTING.md) 开始；coding agents 遵循
[AGENTS.md](AGENTS.md)。完整阅读地图见[文档索引](docs/README.md)。
