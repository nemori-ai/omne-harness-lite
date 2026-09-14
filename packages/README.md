# 产品包

从第一天起按 `packages/<能力族>/<职责包>/` 组织。第一层是导航分组，第二层才是实际
workspace 成员，拥有源码、依赖、公开入口、测试、许可与来源记录。组织规则归
[workspace 规范](../docs/maintenance/workspace.md)，选择依据归 [D-009](../docs/decisions/D-009-package-organization.md)。

当前 14 个包均为可独立构建和消费的实验来源基线，公开入口统一为各 npm 包的
`/baseline`；尚未实现完整目标能力。源码来源及迁移见
[布局方案](../docs/proposals/core-capabilities/fork/package-layout.md)与
[交付记录](../docs/proposals/core-capabilities/fork/package-layout-delivery.md)。
接下来的[第一批二次开发](../docs/proposals/core-capabilities/implementation/README.md)
以可恢复工具审批和 OpenRouter 文本流程组织；其中的新成员路径仍是计划，尚未创建。

| 能力族 | 职责包 |
|---|---|
| [core](core/README.md) | [agent](core/agent/README.md)、[scope](core/scope/README.md) |
| [util](util/README.md) | [brand](util/brand/README.md)、[values](util/values/README.md)、[timeout](util/timeout/README.md) |
| [media](media/README.md) | [content](media/content/README.md) |
| [model](model/README.md) | [llm](model/llm/README.md) |
| [session](session/README.md) | [session](session/session/README.md)、[projection](session/projection/README.md)、[persistence](session/persistence/README.md) |
| [storage](storage/README.md) | [jsonl](storage/jsonl/README.md) |
| [context](context/README.md) | [system-prompt](context/system-prompt/README.md) |
| [tools](tools/README.md) | [tools](tools/tools/README.md) |
| [agent](agent/README.md) | [loop](agent/loop/README.md) |

应用装配见 [apps](../apps/README.md)，开发与产物检查见 [tools](../tools/README.md)。
