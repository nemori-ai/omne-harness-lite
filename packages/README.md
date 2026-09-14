# 产品包

从第一天起按 `packages/<能力族>/<职责包>/` 组织。第一层是导航分组，第二层才是实际
workspace 成员，拥有源码、依赖、公开入口、测试、许可与来源记录。组织规则归
[workspace 规范](../docs/maintenance/workspace.md)，选择依据归 [D-009](../docs/decisions/D-009-package-organization.md)。

实验来源基线沿各包的 `/baseline` 入口消费；
[work-data](core/work-data/README.md) 与 [records](storage/records/README.md)
已交付共享数据及记录端口/单行 codec 的目标默认入口；
[diagnostics](observation/diagnostics/README.md) 的 D1 共享诊断实现已按
[成员证据](observation/diagnostics/evidence/directory-owner/README.md)接受。
[JSONL](storage/jsonl/README.md) 与 [admission](coordination/admission/README.md)
已提供真实默认 factory，与 D1 的
[P1 组合及独立五包消费者](../apps/local-harness/evidence/storage-admission/README.md)
已在固定 `31197742905a3c66fc3e650c153d65d014372c21` 接受。五包消费者的实际提交、
关闭与重开证据，与该端点全体产物的通用隔离消费检查分别记录。
[agent 默认入口](core/agent/README.md)目前提供协议声明；
[tenant](governance/tenant/README.md)提供共享值、身份消费协议及纯成员记录解码与
fold。这些交付尚不包含目标 host、完整租户治理或 Agent/Session/工具运行闭环。
源码来源及迁移见
[布局方案](../docs/proposals/core-capabilities/fork/package-layout.md)与
[交付记录](../docs/proposals/core-capabilities/fork/package-layout-delivery.md)。
真实 Agent/Session/工具 allow 闭环及必要共享设施的当前装配归
[local-harness 设计](../apps/local-harness/design.md)；
[首批实施来源](../docs/proposals/core-capabilities/implementation/README.md)保留选择与接受历史。
完整 HITL 与模型流程留待后续规划。

| 能力族 | 职责包 |
|---|---|
| [core](core/README.md) | [agent](core/agent/README.md)、[scope](core/scope/README.md)、[work-data](core/work-data/README.md) |
| [util](util/README.md) | [brand](util/brand/README.md)、[values](util/values/README.md)、[timeout](util/timeout/README.md) |
| [media](media/README.md) | [content](media/content/README.md) |
| [model](model/README.md) | [llm](model/llm/README.md) |
| [session](session/README.md) | [session](session/session/README.md)、[projection](session/projection/README.md)、[persistence](session/persistence/README.md)、[run](session/run/README.md)（仅设计） |
| [storage](storage/README.md) | [records](storage/records/README.md)、[jsonl](storage/jsonl/README.md) |
| [context](context/README.md) | [system-prompt](context/system-prompt/README.md) |
| [tools](tools/README.md) | [tools](tools/tools/README.md) |
| [agent](agent/README.md) | [loop](agent/loop/README.md)、[run-driver](agent/run-driver/README.md)（仅设计） |
| coordination | [admission](coordination/admission/README.md)、[提供者设计](coordination/admission/design.md) |
| governance | [tenant](governance/tenant/README.md)、[提供者设计](governance/tenant/design.md) |
| observation | [diagnostics](observation/diagnostics/README.md)、[目录与提供者设计](observation/diagnostics/design.md) |

尚未建立 workspace 成员的设计正文也随未来所属包维护：
[authorization](governance/authorization/design.md)、[budget](governance/budget/design.md)、
[local-execution](tools/local-execution/design.md)、[run](session/run/design.md)、
[run-driver](agent/run-driver/design.md)；
[human-decisions](governance/human-decisions/design.md) 保留后续候选。目录与设计
出现不等于目标包已经实现，现有 fork 的当前设计从各包 README 进入。

应用装配见 [apps](../apps/README.md)，开发与产物检查见 [tools](../tools/README.md)。
