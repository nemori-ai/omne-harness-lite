# util 能力族

独立的纯辅助机制；各叶子按实际消费与职责维护，避免形成杂项大包。

本目录只组织相关职责，不是 workspace 包、统一服务或部署单元。
完整规则见 [workspace](../../docs/maintenance/workspace.md)。

| 职责包 | 当前源码范围 |
|---|---|
| [brand](brand/README.md) | Nominal type brand helpers |
| [values](values/README.md) | JSON value validation, snapshots and freezing |
| [timeout](timeout/README.md) | Timer and AbortSignal cooperation primitives |
