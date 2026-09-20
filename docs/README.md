# 项目开发文档

`docs/` 只承载**项目开发文档**——怎么准备环境、源码放哪、改完跑什么检查、
写代码时要防住什么。四份正文，没有子目录。

> **产品设计、系统架构与规格设计，以及产品/系统/算法的 research 都不在这里。**
> 它们归 [`.meta_harness/`](../.meta_harness/AGENTS.md)，边界见[根 AGENTS.md](../AGENTS.md)。

| 要做什么 | 读哪份 |
|---|---|
| 从零准备检出、装工具链、把检查跑起来 | [开发指南](development.md) |
| 源码该放进哪个成员、workspace 怎么组织 | [源码布局](workspace.md) |
| 改完该跑什么检查，结果能说明什么 | [验证与证据](verification.md) |
| 写代码时要防住的十类风险 | [防御性研发模式](defensive-patterns.md) |

贡献范围与交付要求见 [CONTRIBUTING.md](../CONTRIBUTING.md)；
命令的准确目标由 [Makefile](../Makefile) 与 [scripts/](../scripts/README.md) 维护，
本目录只解释含义与选择，不复制命令表。
