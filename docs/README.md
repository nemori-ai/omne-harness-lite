# 项目开发文档

`docs/` 承载**项目开发文档**——怎么准备环境、源码放哪、改完跑什么检查、
写代码时要防住什么。

> **本区只维护开发文档。**产品、系统级架构预期与 research 归 `.meta_harness/`；模块承诺随成员拥有者维护。
> 归属见[架构维护入口](../.meta_harness/design/architecture/README.md)，边界见[根 AGENTS.md](../AGENTS.md)。

| 要做什么 | 读哪份 |
|---|---|
| **你是指导 agent 并对结果负责的人**：该在哪出手、看什么信号、怎样算尽责 | [给人看的开发指南](development_human.md) |
| 从零准备检出、装工具链、把检查跑起来 | [开发指南](development.md) |
| 源码该放进哪个成员、workspace 怎么组织 | [源码布局](workspace.md) |
| 改完该跑什么检查，结果能说明什么 | [验证与证据](verification.md) |
| 写代码时要防住的十类风险 | [防御性研发模式](defensive-patterns.md) |
| 整洁靠什么守住：哪些量、哪些评审时问、哪些归人，偏了之后谁动 | [整洁回路](clean-loop.md) |

贡献范围与交付要求见 [CONTRIBUTING.md](../CONTRIBUTING.md)；
命令的准确目标由 [Makefile](../Makefile) 与 [scripts/](../scripts/README.md) 维护，
本目录只解释含义与选择，不复制命令表。
