---
kind: system-requirement
ids: [SYS-CONTINUITY]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/system/omne-next-continuity.md
source_sha256: aee6c0eee686bb0ae194dc686e5028e10fbf80cabbce850865b2ec2f8fb2cea5
source_anchor: "heading:# SYS-CONTINUITY：omne-next 功能继承与发展"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# SYS-CONTINUITY：omne-next 功能继承与发展

系统要求（迁移坐标：`.meta_harness/design/requirements/system/README.md`）

## 已确认要求

2026-09-12 用户明确：在产品功能上，继承并进一步发展 omne-next **现有的或已
承诺要交付的机制与功能**。继承方向具有约束力；具体机制与功能清单、承诺范围
和进一步发展的方向继续展开。

用户同时授权每项特性的整理可自行检索 `omne-next/omne_harness` 和
`omne-next/omne_harness_product_personal_edition`，选择有用内容补充并减少歧义。
这两个目录是发现入口，不自动界定全部继承范围。

## 来源映射

当前已查材料见[产品来源核对](../../../research/product-feature-sources/research.md)，核对提交为
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`。它是研究快照，尚不是用户确认的全部
功能继承基线。已查文件的接受状态不代表实现完成，旧系统代码结构和未接受设计
也不自动成为本项目的设计选择。

逐项来源和迁入范围见[来源、确认与变化](changes.md)；确认与存在歧义时的处理按
[需求归位](../../../../agents/skills/harness-design-handbook/canonical/references/intake.md#绑定当前系统而非历史设想)执行。
本页及各专项 requirement 的 front matter 固定实际产品来源与谱系，方法页不承担产品接受事实。
PF-002、PF-003 的直接要求和来源补充分开维护。

后续明确的 [PF-004](../../product/PF-004-subagent-delegation-and-supervision/requirements.md)
完整继承 `omne-next/omne_harness` 的 sub-agent 相关要求，包含已承诺的未来能力。
[该项来源清单](../../../research/subagent-requirement-sources/research.md)固定核心全文、相邻
适用条款和有效补充；它已获得专项继承授权，不再只是可选参考。清单不限定整体
功能继承范围，源文档中的冲突与后续新增承诺仍分别处理。

主动 HITL（迁移坐标：`.meta_harness/design/research/agent-initiated-hitl-sources/research.md`） 与
[用户治理及统一决策池](../../../research/user-governance-and-decision-pool-sources/research.md)
进一步映射 PF-005～PF-008 的直接要求与源有效条款，包括来源已承诺的未来
批准引用和暂行确认。各项保留自己的确认与来源范围，不把研究快照升级为全局
继承截止点，也不把源接受状态当作本项目的设计或实现证据。

## 待澄清

- 采用的来源提交或截止范围，以及现有与已承诺功能的完整清单、承诺依据。
- 是否持续继承未来新增的上游承诺；在范围明确前，新增承诺作为需求变更输入处理。
- 本项目对应含义、阶段交付及进一步发展的具体方向。

接受需求组织提案没有额外确认某个 omne-next 提交的全部内容。存在歧义的范围保持
待定，已经能追到用户明确要求的部分继续有效。
