# omne-harness-lite

`omne-harness-lite` 是一个更轻量化、更高性能的 OMNE harness 系统，以
DeepSeek 提出的 Cordis 为内核，同时保留和遵循原 `omne-next/omne_harness`
的核心设计理念和最佳实践，旨在提供一个能够超长期待机、稳定运行、持续进化的
个人智能助手所需的全部能力。

Cordis 承载动态内核机制；Agent Loop、Harness 层、工具协议、治理和其他子系统
由本项目自行实现。系统的能力、定义、绑定和组合能够动态演化，并受到明确的
身份、所有权、生命周期和不变量约束。

## 当前状态

项目处于架构设计、规格建模与实验阶段，尚未上线或对外提供生产服务。当前仓库
提供设计资料、维护规范与验证脚手架；它尚不是可运行的个人助手产品。
现有租户、模型及 agent-core 设计仍以提案身份供 review；有效契约以
[`spec/catalog.json`](spec/catalog.json) 为准，目录迁移不会自动批准业务设计。

第一版完整交付是单机系统；设计中确保关键边界未来可以独立扩展为分布式、
异构物理节点和微服务部署，而不改变领域语义。从第一天起支持租户隔离，
所有模型请求统一经 OpenRouter 发送。允许有依据的大胆重构，不保留未经要求的
旧版本实现兼容层。详细方向见[当前架构](docs/architecture/README.md)。

## 从这里进入

| 任务 | 入口 |
|---|---|
| 了解项目约定与研发品味 | [AGENTS.md](AGENTS.md) |
| 定位设计材料 | [文档总索引](docs/README.md) |
| 做架构设计、能力或服务边界判断 | [架构指南](docs/architecture-guide/README.md)、[architecture-design skill](.agents/skills/architecture-design/SKILL.md) |
| 查看已接受的选择及其依据 | [决定](docs/decisions/README.md) |
| 审阅候选设计、回查研究 | [提案](docs/proposals/README.md)、[研究](docs/research/README.md) |
| 查找精确版本的行为与数据契约 | [规格](spec/README.md) |
| 维护、发布、复议和迁移资料 | [维护规范](docs/maintenance/README.md) |
| 调整防御辅助或切换开发主力模型 | [防御模式](docs/defensive-patterns.md)、[开发模型评估](docs/evaluation/README.md) |

Codex 与 Claude Code 的项目 skills 分别位于 `.agents/skills/` 与
`.claude/skills/`，内容保持一致，按需导航到同一份权威文档。

## 仓库验证

安装 `uv` 后，在仓库根目录运行；依赖与 Python 环境由 `uv.lock` 和
`pyproject.toml` 管理，Python 仅用于仓库工具，不决定产品实现语言。

```sh
make docs-check
make spec-check
make test
```

文档结构、引用和 Schema 校验不等于行为证明。TLA+/TLC 与 Alloy 的模型任务
及 Java/JAR 环境单独声明和检查；`make spec-tools` 报告工具是否齐备。
环境缺失与未建立模型覆盖必须显式报告，详见[验证规范](docs/maintenance/verification.md)。
