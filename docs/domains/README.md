# 领域与能力责任

本区说明业务、治理与执行责任怎样分工，逻辑模块怎样协作，以及精确承诺由谁维护。先从任务找到责任，再展开成员接口、行为规格和验证。它面向开发者、集成者与设计维护者；系统使用者从[使用入口](../guides/README.md)开始。

## 责任入口

| 阅读组 | 入口 |
| --- | --- |
| 治理与资源 | [身份与授权](identity-and-authorization/README.md)、[资产与规则](assets-and-rules/README.md)、[工作区](workspaces/README.md) |
| 专有类别知识 | [Slash Command](slash-commands/README.md)、[Skill](skills/README.md)、[MCP](mcp/README.md) |
| 工作、装配与执行 | [会话与工作](sessions-and-work/README.md)、[装配交接](assembly-and-handoff/README.md)、[Agent推进](agent-progression/README.md)、[模型调用](model-invocation/README.md)、[工具执行](tool-execution/README.md)、[Context](runtime-context/README.md)、[HITL](human-intervention/README.md) |
| 执行资源 | [执行环境](execution-environments/README.md) |
| 业务服务 | [日历](calendars/README.md)、[日程与Job](schedules-and-jobs/README.md)、[通知](notifications/README.md) |

这些是初始责任入口，包含业务领域、通用能力与系统集成责任，不是固定DDD上下文或固定数量的包、服务、进程。新责任按知识与维护需要增加，不能为了维持现有清单，把新责任归入并不适合的共同资产治理或通用执行。

## 向下阅读与唯一源

系统架构拥有全系统约束，本区细化到逻辑模块的角色、事实归属、允许依赖、公开协作、关键交接和组合验证责任。一个包内也可以有多个需解释的模块；是否跨包不能单独决定本区粒度。公开类型、精确失败、状态转移、事务、并发、取消和恢复协议随实际成员或协调者；跨包协议也随其拥有者。产品规则和统一语言保持原源。

能力组的工程分解、组内成员关系与共同维护归`packages/<domain>/`，单包公开使用、契约、内部设计和维护归实际成员。按[两层成员文档](../member-documentation.md)展开；本区不复制包群依赖图或包内机制。

责任页说明设计要承接的契约，不推测当前实现已满足。尚未确定成员时继续具名模块设计和交接，不造空包或中央SPEC。简单成员已能解释整项责任时直接导航过去，不强制拆领域architecture页。
