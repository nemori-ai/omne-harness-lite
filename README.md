# omne-harness-lite

**为组织和个人构建能够长期运行、持续进化的智能体系统。**

`omne-harness-lite` 以 DeepSeek 提出的 Cordis 为内核，延续 `omne-next/omne_harness`
的核心设计理念与最佳实践，面向更轻量、更高性能的 OMNE harness 演进。它的目标是让智能体
持续感知环境、协作完成工作、积累知识，并在运行中发展自身能力，始终与所服务的组织或个人
保持利益对齐。

> 产品设计、规格与实验实现并行推进。已接受的契约从
> [身份清单](.meta_harness/design/registry/README.md)查找，实现及验证范围从
> [实现映射](.meta_harness/design/realization/README.md)查找。
> 治理中心的启动与配置见 [tenancy-host](apps/tenancy-host/README.md)；
> 可运行不等于已经满足生产准入。第一版完整交付为单机系统。

[系统目标与全局约束](.meta_harness/design/foundation/README.md) ·
[产品设计](.meta_harness/design/product/README.md) ·
[开发指南](docs/development.md) ·
[参与贡献](CONTRIBUTING.md)

## 系统目标

长期协作需要保留已经完成的工作、等待中的决定和未来的安排，也需要随着环境与需求变化
调整能力。项目围绕以下目标展开：

- **完全动态。** 能力的定义、实现、绑定和组合关系能够在运行期演化，结构变化具有明确的
  依赖、作用域、所有权和生命周期约束。见[完全动态系统](.meta_harness/design/foundation/fully-dynamic-system/requirements.md)。
- **超长期待机、稳定运行、持续进化。** 智能体能够长期服务，并根据工作需要发展能力；
  等待用户或未来时刻的工作可以持久保留，释放对应执行资源。
  见[长期运行目标](.meta_harness/design/foundation/long-running-and-evolving/requirements.md)。
- **状态持久，工作可接续。** Agent 运行时与持久状态解耦，在同构资源下恢复并接续工作；
  针对不同物理环境与操作系统采用合适的装配策略或部署版本。
  见[恢复与异构适配](.meta_harness/design/foundation/runtime-state-and-continuity/requirements.md)。
- **与服务对象保持利益对齐。** 以所服务的组织或个人的利益为持续目标；对齐的判断方式、
  维持机制及多方利益冲突规则仍待进一步明确。
  见[利益对齐](.meta_harness/design/foundation/interest-alignment/requirements.md)。
- **全链路可观测。** 工作从触发、授权、执行到恢复和交付均应有可关联的状态与日志依据，
  失败、部分完成和未知结果如实可见。
  见[可观测性要求](.meta_harness/design/foundation/observability-and-logging/requirements.md)。

功能上[继承并进一步发展 omne-next 现有或已承诺的机制与功能](.meta_harness/design/foundation/omne-next-continuity/requirements.md)。

## 产品设计

产品正文按**主题**组织，每个主题一个信息包：概念定义、模型、产品规则、拍板记录与未决项
各有其位。当前覆盖发生的事与记录条目、身份与范围、设置权限与资产、资产的转移与分享、
Agent 定义与装配、执行环境与沙箱、工具与技能、Meta Capabilities、Human in the Loop、
上下文的消息类型与组装、非常态的分层处置、Agent Loop 与 Run、模型档案与调用、
输入的受理与排队，以及会话的生命周期与归属。

这些主题目前**全部属于[架构内核](.meta_harness/design/product/architecture-core.md)**——
它们立的是彼此赖以成立的前提，**改其中一个，代价落在别的主题身上**。

完整清单、状态与修订次数见[产品设计入口](.meta_harness/design/product/README.md)；
概念的精确所指归[统一语言](.meta_harness/design/ubiquitous_language/README.md)——
**同一个概念在整个系统里只有一个词。**

## 技术基础

内核层复用 Cordis 与 DSH `agent` 原语；Agent Loop、Harness 层、工具协议、治理及其他
子系统由本项目定义和实现。

- **动态组合。** 可替换能力以具有生命周期、作用域和所有权的插件或服务组合；
  定义、运行实例、持久状态与物理部署分别建模。
- **语言无关的契约。** TLA+ 表达行为权威规格，Alloy 辅助验证结构约束，JSON Schema
  定义数据契约；产品实现以 TypeScript 为主。
  已登记的契约身份见[身份清单](.meta_harness/design/registry/README.md)。
- **从第一天起落实租户隔离。** 自然人全局身份与租户成员关系分别表达；受租户所有权
  约束的对象和跨边界操作显式携带租户身份，跨租户访问默认拒绝。
- **统一模型请求入口。** 所有模型请求经 OpenRouter 发送。

在线演化须遵守已有工作的生命周期、当前权限和状态契约。恢复执行、切回旧版本、
补偿外部效果各有明确含义；动态能力的具体保证由相应规格与验证证据落实。

## 仓库与开发

仓库按 monorepo 组织，当前主要内容是设计正文与开发工具。

| 位置 | 内容 |
|---|---|
| [.meta_harness/](.meta_harness/README.md) | **设计工作区**：需求、产品设计、统一语言、规格、研究、已发生的事、agent 能力 |
| [docs/](docs/README.md) | **项目开发文档**：环境、源码布局、检查含义、防御指导 |
| [packages/](packages/README.md)、[apps/](apps/README.md) | 产品包与应用装配；采用范围与验证状态见实现映射 |
| [tools/spec-tools/](tools/spec-tools/README.md)、[scripts/](scripts/README.md) | 开发检查器与仓库自动化 |

当前可以运行仓库检查。按[开发指南](docs/development.md#准备可用的检出)准备 Python 与
Node/pnpm 两套环境，在实际工作的检出根目录执行：

```sh
uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
make check
```

`make check` 执行 agent 产物与链接、文档导航、设计链登记、工具测试与格式检查，
**不调用真实模型**。日常文档修改可单跑 `make docs-check`；形式模型的覆盖、执行与工具环境
按[验证与证据](docs/verification.md)分别报告。应用启动入口、配置与运行边界由所属应用的 README 维护。

参与研发从 [CONTRIBUTING.md](CONTRIBUTING.md) 开始；coding agents 遵循 [AGENTS.md](AGENTS.md)。
