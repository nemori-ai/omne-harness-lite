# D-034：Skill 规格形状的起点——采用 Agent Skills 开放格式、规则层自持，扩展声明走包内定义记录

产品负责人 2026-09-23 裁定：本项目 [Skill](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill) 的规格形状
**以 Agent Skills 开放格式（`SKILL.md`）为载体与核心字段，本项目的规则层自持**（提案候选 B）；
内容类扩展声明**走包内一份定义记录，不放进 `SKILL.md` frontmatter 的 `metadata`**（子路径 B-2b）；
本项目扩展的内容**叠加参考或借鉴 omne-next 与 Codex 各自与本项目需求兼容的扩展**。
**接受的是规格起草的起点方向，不是契约**——Skill 包数据契约、导入器设计、`Skills()` 契约都还没有。

- **输入与下游**：来源提案 [`proposals/skill-spec-adoption`](../../proposals/skill-spec-adoption/README.md)（四个候选加 B 的三条子路径，作者推荐 B + B-2b）；
  研究 [skill-spec-sources](../../../../research/skill-spec-sources/README.md) 首轮与[第二轮（rev 1–2）](../../../../research/skill-spec-sources/changelog.md)——第二轮钉存了开放格式原文 `69ef37e`，补上提案列为「接受前必须补的一项」的证据，并盘点了 omne-next、Codex、Claude Code 的扩展。
  下游是 Skill 包数据契约（JSON Schema + 有限规则表）、外部格式导入器的提供者设计、`Skills()` 的 `read`／`exec_script` 契约，**都未起草**。
- **范围定位**：只解决「Skill 规格以哪份为起点、扩展声明放哪、参考谁的扩展」。
  **不解决**：定义记录的保留路径名、name 字符集、键分类表的最终内容、正文变体放在包的哪里、② 型斜杠命令的参数（同日另有产品裁决，归产品正文，见 [D-036](../slash-command-parsing-baseline/README.md)）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 对 G1 七份复用提案逐项裁决，对本提案原话：**「B + 叠加参考或借鉴 omne-next 与我们的需求兼容的拓展、codex 与我们需求兼容的拓展」**；同日就子路径补裁：**「走包内定义记录，也就是不放在 SKILL.md 的 frontmatter metadata」**。逐字摘自当日裁决台账（主检出 `tmp/assets-runtimes/g1-rulings.md` 第 5、5a 行；台账是过程材料，本处逐字引用是长期记录） |
| 精确修订 | 提案包在 HUB 分支 `panqiwei/assets-runtimes` 提交 `b12d927` 的内容（此后到本决定落地未再改动）；接受前补的证据是研究 `skill-spec-sources` [rev 1–2](../../../../research/skill-spec-sources/changelog.md)（提交 `9ab1e36`，开放格式原文与哈希见其 [sources/](../../../../research/skill-spec-sources/sources/provenance.json)） |
| 接受范围 | B、B-2b、叠加参考两家兼容扩展这一方向；逐项见[决定正文](decision.md#选择与范围) |
| 保留前提 | 提案「会改变选择的证据」四行按第二轮研究逐行核对，**翻向 D 与翻向 B-1 的条件都未触发**；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 提案[未记录任何独立评审](../../proposals/skill-spec-adoption/review.md)；接受不以评审为前提 |
| 取代关系 | 不取代任何决定 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、翻盘条件为什么没触发、**不表示**什么 | [决定正文](decision.md) |
| 四个候选、键分四类、B 的三条子路径 | [提案候选与取舍](../../proposals/skill-spec-adoption/alternatives.md) |
| 开放格式原文四问、三家扩展 42 行盘点 | [研究第二轮](../../../../research/skill-spec-sources/research.md#第二轮开放格式原文与三家扩展) |

返回[决定](../README.md)。
