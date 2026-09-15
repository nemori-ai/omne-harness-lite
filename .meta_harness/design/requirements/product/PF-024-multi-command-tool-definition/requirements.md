---
kind: product-feature
id: PF-024
primary_dimension: agent
secondary_dimensions: []
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/agent/PF-024-multi-command-tool-definition.md
source_sha256: fc0f24d1f4e48287b836f1cbb2531bf37a984f873fb4aa9af8694c74e6d524ed
source_anchor: "heading:# PF-024：多命令工具定义与 CLI 式使用"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-024：多命令工具定义与 CLI 式使用

[智能体维度](../by-agent.md) · omne_core_v1 来源核对（迁移坐标：`.meta_harness/design/research/multi-command-tool-sources/research.md`）

2026-09-13，用户在工具定义与执行架构的准备讨论中明确：需要 multiple command
tool 这一工具定义范式，使 Agent 能“将一套工具集当作 unix CLI 那样来使用”，
并在上下文组装时“只占用一个工具的槽位”；同时指定 `omne-next/omne_core_v1`
作为参考与补充来源。主维度为智能体，关注其如何理解和调用一组相关能力。

## 已确认要求

- **PF-024.C1：支持多命令工具定义范式。** 一套工具集能通过统一工具入口
  提供多个可区分的命令，Agent 按类似 Unix CLI 的方式选择命令、提供相应参数
  并取得实际结果。工具定义和使用链路须支持这种范式。
- **PF-024.C2：整套命令在上下文组装时只占一个工具槽位。** 向模型组装
  可调用工具时，该多命令工具整体作为一个顶层工具条目提供；其子命令在这个
  入口内使用，不因命令数量增加而要求逐个增加模型工具条目。

这里的槽位指模型请求所暴露的顶层工具条目数量。单槽位本身不规定 Schema
和帮助文本的 token 数量，也不意味着一次调用必须批量执行所有命令。

## 来源补充与设计输入

固定版本来源中的 `BaseMultiCommandTool` 以单一工具表面路由子命令，提供命令
描述、参数声明、总览和逐命令帮助、可见集合与错误反馈。它支持紧凑参数入口
及较丰富的类型展开；这些机制有助于细化 CLI 式使用，但其 Python/LangChain
基类、字段、分派模式、已读帮助标志和文本信封尚未作为本项目协议采用。
具体证据、文档差异及接受状态见来源核对（迁移坐标：`.meta_harness/design/research/multi-command-tool-sources/research.md`）。

与 [PF-014](../PF-014-runtime-tool-and-skill-discovery-and-loading/requirements.md) 组合时，
Agent 应能先理解工具集用途，再按工作需要取得命令用法及必要资源；渐进装载
继续遵循该项要求。一个工具槽位可以承载多条命令，完整命令定义怎样进入
上下文仍需设计，不从来源的某一种 Schema 形状预选唯一方案。

## 产品场景

| 场景 | 应有表现 |
|---|---|
| 工作空间能力提供查询状态、加载和保存等操作 | Agent 从同一个工具入口选择所需命令，模型工具清单中该工具集占一个条目 |
| Agent 需要使用尚不熟悉的命令 | 能沿发现与按需装载能力取得用法，再通过同一多命令入口调用；帮助入口的具体形式待设计 |
| 同一入口下的读取获准，而写入尚未获准 | 实际写入沿相应授权规则拒绝或请求确认，不借读取资格放行 |

## 与执行、治理及动态演化的关系

单一入口保留各命令实际动作的含义。当前租户、Agent 定义授权和系统授权拦截
分别遵循 [PF-006](../PF-006-user-settings-and-agent-definition-authorization/requirements.md)、
[PF-007](../PF-007-system-initiated-hitl/requirements.md) 及 SYS-TENANT；
来源的“已读帮助/技能”标志不构成人类授权或动作批准。

工具调用仍适用 [PF-003](../PF-003-tool-execution-observation-and-control/requirements.md) 的
观察、控制及符合声明时的后台接续，调用事实须能辨认实际选择的命令与结果。
插件版本、命令变化和在途绑定沿 [PF-016](../PF-016-agent-developed-cordis-plugins-and-live-deployment/requirements.md)
处理，工程关联及费用分别沿 SYS-OBSERVABILITY 和 PF-019 保留。以上是既有
要求在多命令入口中的适用关系，不预设每条子命令成为独立资产或运行实例。

待设计：命令命名与层次、参数表示、帮助与 Schema 的披露方式、模型适配、
命令定义和实现的版本绑定、各命令执行声明如何求值。是否支持一次批量提交
多条命令，以及相应顺序、部分失败和控制粒度，仍需明确；Unix CLI 类比也
未预先确认任意 shell 代码、管道或重定向语法。用户 slash/keyboard 命令继续
归 PF-009，各自保留入口及效果。

Agent 核心候选（迁移坐标：`.meta_harness/design/proposals/agent-core/#当前需求对应与缺口`）
尚缺这种定义范式与完整执行链路的模型。本轮确认 C1/C2 并补充来源，未接受
具体架构或发布规格；当前没有已接受业务规格需因此取代。
