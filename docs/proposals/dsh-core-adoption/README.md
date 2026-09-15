---
kind: proposal
id: P-dsh-core-adoption
status: accepted
scope: 本批 DSH 源码来源集合、依赖处理与后续设计验收门槛，不接受子系统完整契约
---

# DSH 核心能力源码采用范围

2026-09-13 用户要求重新梳理并正式确定本批核心能力的 fork 和二次开发集合，
并明确 tools、LLM 纳入时必须完成新的项目架构设计；已有 tools 工作树草案可作输入。

本轮先固定输入，再接受源码集合与设计门槛。包的选中不等于上游契约的采用，
也不等于这些能力已经完成设计、导入或实现。

- [源码集合与依赖处理](selection.md)：10 个主体来源、4 个限定支撑来源及排除范围。
- [设计与施工计划](design-plan.md)：Cordis 边界、tools/LLM 新设计及逐阶段门槛。
- [需求消费与基线恢复](requirements.md)：确认条款、覆盖和仍缺的产品能力。
- [必要来源](sources.md)：固定上游、依赖事实及许可边界。
- [独立评审](review.md)：评审对象、发现处置和验证范围。

## 已有工具设计输入

[工具候选](../tool-system/README.md)从 `docs/multi-command-tool-requirement` 工作树保存。
[快照清单](evidence/tools-input.json)记录源 HEAD、未提交状态及逐文件 SHA-256。
本任务没有修改源工作树。已确认的 PF-024.C1/C2、PF-014.C6 和 SYS-DYNAMIC.C2
澄清沿原正文保留确认范围；工具方案和其历史评审继续保持候选身份。

已有候选提及的 jobs、shell 等复用建议不自动成为本轮集合。正式采用范围由
[D-006](../../decisions/D-006-dsh-core-adoption.md) 固定，不通过复制草案接受未完成的子系统设计。

## 接受记录

2026-09-13，任务作者依据用户“再次梳理并正式确定”本批集合的授权、已确认维护
边界、[独立评审](review.md)和输入/基线核对结果，接受本提案的来源范围与阶段门槛，
登记 [D-006](../../decisions/D-006-dsh-core-adoption.md)。具体包与裁剪选择由作者在
任务边界内形成，不声称用户此前已经逐项指定，也不把评审结论当作评审者批准。

接受对象是 [selection.md](selection.md) 中的 10 个主体来源、4 个限定支撑来源、
集合外依赖处理与排除范围，以及 [design-plan.md](design-plan.md) 的设计工作和
验收先后边界。共同契约与各专题中的具体新接口、状态机、后端保证仍须独立完成
设计、评审和接受；没有整体接受保存的 tools 草案或模型历史候选。

需求基线 `dae2df36491c0ab4b8b9a3d16db639dab5ea88b0` 及消费条款由
[需求记录](requirements.md)拥有。D-005 和已发布精确规格保持有效，本次没有发布
新业务规格，没有导入新的产品源码、执行二次开发或授权主分支合并/推送。
当前架构投影见[本批复用边界](../../architecture/dsh-core-adoption.md)。
