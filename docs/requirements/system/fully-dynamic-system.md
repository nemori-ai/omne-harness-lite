---
kind: system-requirement
ids: [SYS-DYNAMIC]
---

# SYS-DYNAMIC：完全动态系统

[系统要求](README.md)

## 已确认要求

**C1（最终目标）：** omne-harness-lite 的目标是实现一个真正意义上的「完全动态系统」。
2026-09-12 用户明确此目标，并指定 omne-next 对应文档为定义来源，要求复制原文并
尽可能保留 Git history，以保留其存在的时间线。

定义、演化公式与最小判定标准引用原样保存的[中文原文](../../research/fully-dynamic-system/fully-dynamic-system.zh.md)。
采用快照 `5d6322d85652f17b72cf97043b6300926c41083a`、早期原稿、Git 历史包及
时间证据局限归[来源记录](../../research/fully-dynamic-system/README.md)。

**C2（建模方向）：** 从动态能力、依赖、生命周期、作用域与所有权建模，显式约束
结构演化；能力的定义、实现、绑定和组合关系应能动态演化。此项保留既有
SYS-DYNAMIC 的确认范围，依据[项目基线](../../research/project-baseline/README.md)
与根开发约定。具体方法见[能力建模](../../architecture-guide/modeling/capabilities.md)。

## 待澄清

原定义中“任一结构维度可演化”与“满足全部 MVC-4”的判定关系，以及本项目的
具体覆盖范围与边界仍需展开。原文保持不变；依赖此量词的精确验收不定稿。
这不取消完全动态目标，也不表示已有机制满足目标。

产品持续进化目标见 [SYS-LONG-RUNNING](long-running-and-evolving.md)；内核采用
与自建边界见 [SYS-KERNEL](constraints.md#sys-kernel)。
