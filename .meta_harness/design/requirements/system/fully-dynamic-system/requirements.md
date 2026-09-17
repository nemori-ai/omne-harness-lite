---
kind: system-requirement
ids: [SYS-DYNAMIC]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/system/fully-dynamic-system.md
source_sha256: 2334233d17ea3234f42c9efe2635d21bd1828d8d82273a353244e73cecf59b69
source_anchor: "heading:# SYS-DYNAMIC：完全动态系统"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# SYS-DYNAMIC：完全动态系统

系统要求（迁移坐标：`.meta_harness/design/requirements/system/README.md`）

## 已确认要求

**SYS-DYNAMIC.C1（最终目标）：** omne-harness-lite 的目标是实现一个真正意义上的「完全动态系统」。
2026-09-12 用户明确此目标，并指定 omne-next 对应文档为定义来源，要求复制原文并
尽可能保留 Git history，以保留其存在的时间线。

定义、演化公式与最小判定标准引用迁移后的[中文阅读副本](../../../research/fully-dynamic-system/fully-dynamic-system.zh.md)。
采用快照 `5d6322d85652f17b72cf97043b6300926c41083a` 的原始 blob 可从
[Git 历史包](../../../research/fully-dynamic-system/omne-next-history.bundle)恢复；
[早期原稿](../../../research/fully-dynamic-system/fully_dynamic_system_intro.md)、
[历史日志](../../../research/fully-dynamic-system/history.log)与
[时间证据局限](../../../research/fully-dynamic-system/evidence.md#内容身份与局限)在当前包中直接保留。

**SYS-DYNAMIC.C2（建模方向）：** 从动态能力、依赖、生命周期、作用域与所有权建模，显式约束
结构演化；能力的定义、实现、绑定和组合关系应能动态演化。此项保留既有
SYS-DYNAMIC 的确认范围；可恢复来源由[来源、确认与变化](changes.md)及本页 front matter 的来源提交、文件、哈希和锚点固定，
并由当前根开发约定提供项目语境。需求变化按[需求归位](../../../../agents/skills/harness-design-handbook/canonical/references/intake.md#绑定当前系统而非历史设想)处理，
具体方法见[能力建模](../../../../agents/skills/harness-design-handbook/canonical/references/architecture/modeling/capabilities.md)。

2026-09-13 用户进一步澄清 C2 的设计含义：从 Cordis 视角考虑能力绑定和依赖，
应同时考虑相关生命周期、激活产生的效用及卸载后的逆效用撤回；tool–skill
关系是其中一个例子，同样适用于其它能力关系。具体效用范围、撤回条件与
在途工作的处置由设计明确，不能仅登记依赖字段或只做一次加载前检查。

## 待澄清

原定义中“任一结构维度可演化”与“满足全部 MVC-4”的判定关系，以及本项目的
具体覆盖范围与边界仍需展开。原文保持不变；依赖此量词的精确验收不定稿。
这不取消完全动态目标，也不表示已有机制满足目标。

产品持续进化目标见 [SYS-LONG-RUNNING](../long-running-and-evolving/requirements.md)；内核采用
与自建边界见 [SYS-KERNEL](../constraints/requirements.md#sys-kernel)。
