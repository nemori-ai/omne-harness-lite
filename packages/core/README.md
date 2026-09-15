# core 能力族

内核复用原语与共享数据：agent、唯一 scope 和 work-data；不收纳业务 Loop 或全部核心能力。

本目录只组织相关职责，不是 workspace 包、统一服务或部署单元。
完整规则见 [workspace](../../docs/maintenance/workspace.md)。

| 职责包 | 当前源码范围 |
|---|---|
| [agent](agent/README.md) | Agent registry, factory delegation and initiator primitives |
| [scope](scope/README.md) | Shared scope identity, routing and managed contributions |
| [work-data](work-data/README.md) | Accepted identity/core-work v1 DTOs, strict JSON and exact Schema validation; default public entry |
