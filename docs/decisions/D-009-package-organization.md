---
kind: decision
id: D-009
status: accepted
scope: 产品 monorepo 的能力族、职责包及源码 fork 组织方式
date: 2026-09-14
sources:
  - ../proposals/core-capabilities/fork/package-layout.md
acceptance: ../proposals/core-capabilities/fork/package-layout.md#接受与验证
supersedes: []
---

# D-009：从第一天按能力族和职责分包

采用 `packages/<能力族>/<职责包>/`。能力族提供导航，叶子包拥有实际源码、
依赖、公开入口、测试及来源记录。依照能力定义、具体提供者、消费扩展的真实
职责与变化边界分包，应用装配负责选择提供者；不为每个插件或角色预建空包。
共享数据定义与运行时身份保持唯一语义拥有者，通过公开入口复用。

本决定直接落实用户 2026-09-14 对 `packages/` 的明确要求，取代原 fork 计划
中以迁移/构建方便暂用单一 `dsh-baseline`、以后拆分的组织选择。该理由没有
隔离实际职责，不能作为后续二次开发起点的长期布局。源基线状态及来源保留在
各职责包中。具体迁移与来源证据见[方案](../proposals/core-capabilities/fork/package-layout.md)。

日常规则由 [workspace 规范](../maintenance/workspace.md)维护，成员导航归
[packages](../../packages/README.md)。分组不等于内核、服务、进程或部署单元；
上游的能力族名称不直接决定本项目内核范围。本决定不改变 D-005～D-008 的
契约承诺，不发布新产品数据类型，也不把当前源码包视为目标能力已实现。
