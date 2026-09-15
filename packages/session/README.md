# session 能力族

会话历史、派生投影及存储接口；具体存储提供者按实际实现另行加入。

本目录只组织相关职责，不是 workspace 包、统一服务或部署单元。
完整规则见 [workspace](../../docs/maintenance/workspace.md)。

| 职责包 | 当前源码范围 |
|---|---|
| [session](session/README.md) | In-memory source session history and lifecycle |
| [projection](projection/README.md) | Session projection registration and folding |
| [persistence](persistence/README.md) | Source session storage contracts and handles |
| [run](run/README.md) | 仅[提供者设计](run/design.md)；`omneRun` 插件与 run 流，D-014 接受，尚无源码 |
