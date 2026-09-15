# storage 能力族

具体存储技术的可复用原语；不冒充完整持久提供者。

本目录只组织相关职责，不是 workspace 包、统一服务或部署单元。
完整规则见 [workspace](../../docs/maintenance/workspace.md)。

| 职责包 | 当前源码范围 |
|---|---|
| [records](records/README.md) | 已验证的记录端口与严格单行 codec；不提供真实 writer 或耐久恢复 |
| [jsonl](jsonl/README.md) | Ordinary JSONL file read, sync, append and rollback primitives |
