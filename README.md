# omne-harness-lite

`omne-harness-lite` 是一个更轻量化、更高性能的 OMNE harness 系统，以
DeepSeek 提出的 Cordis 为内核，同时保留和遵循原
`omne-next/omne_harness` 的核心设计理念和最佳实践。

项目旨在提供一个能够超长期待机、稳定运行、持续进化的个人智能助手所需的
全部能力。Cordis 提供动态运行时内核机制；Agent Loop、Harness 层、工具协议、
治理、证据和其他子系统由本项目自行实现。本项目不把 DeepSeek Harness 当作
自身实现，也不称为 Cordis Harness。

## 当前状态

项目处于设计、规格建模和内核验证阶段，尚未正式上线或对外提供生产服务。
当前优先建立语言无关的领域契约和可验证的不变量，再逐步实现单机版本。
在有明确设计和验证依据时，可以进行面向正确性的大胆重构，不为旧版本保留
未经要求的兼容层。

第一版完整交付是单机系统；设计阶段必须确保关键机制、模块和子系统具备清晰
边界，使它们未来可以独立扩展为分布式、异构物理节点和微服务化部署，而不改变
领域语义。从第一天起支持租户隔离，关键聚合根显式携带租户身份，所有模型请求
统一经 OpenRouter 发送。

## 设计原则

- 站在 DSH Cordis 的视角建模：可替换能力通过插件、服务、Context、依赖和事件组合。
- 领域语义保持语言无关；Cordis 运行时对象是承载机制，不是领域模型本身。
- 全系统共享同一套领域建模；同一事物只有一个权威定义，跨 bounded context 不无理由重定义。
- 先保护不变量和所有权，再选择最小的正确抽象；让生命周期、失败和副作用显式可见。
- 优先复用满足要求的成熟实现或第三方库，只有现有实现无法满足要求时才从零构建。

## 文档入口

- [`AGENTS.md`](AGENTS.md)：项目约束、研发品味和导航。
- [架构设计指南](docs/architecture-guide/README.md)：分层组织的概念、建模原则、动态演化与验证指导。
- [`docs/architecture.md`](docs/architecture.md)：总体架构、边界和演进目标。
- [`docs/defensive-patterns.md`](docs/defensive-patterns.md)：运行时和并发防御原则。
- [`spec/`](spec/)：领域模型、TLA+、Alloy、JSON Schema 和验收场景。
- [Cordis 权威资料 skill](.agents/skills/cordis-authoritative-docs/SKILL.md)：查阅 DSH 官方资料的约定。

## 规格工具

规格工具链包括 TLA+/TLC、Alloy Analyzer 和 JSON Schema Draft 2020-12。工具只在
本地具备时运行检查：

```text
make spec-check
```

工具安装、模型文件和各类规格的职责见 [`spec/README.md`](spec/README.md)。
