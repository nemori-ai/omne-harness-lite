# agent 能力族

可替换的执行驱动与编排辅助；与活体 agent 原语分开演化。

本目录只组织相关职责，不是 workspace 包、统一服务或部署单元。
完整规则见 [workspace](../../docs/maintenance/workspace.md)。

| 职责包 | 当前源码范围 |
|---|---|
| [loop](loop/README.md) | Source loop context and assistant-stream projections |
| [run-driver](run-driver/README.md) | 仅[提供者设计](run-driver/design.md)；Factory 贡献、`decide` 与驱动位置 reducer，D-013/D-014 接受，尚无源码 |
