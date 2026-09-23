# Skill 规格采用：以哪一份为起点

**选择对象**：本项目 Skill 的**规格形状**（载体、frontmatter 字段、资源目录、校验规则、版本化）以哪一份为起点——
移植 omne-next 的 `omne_skill_spec`、直接采用 Agent Skills 开放格式（`SKILL.md`）再加本项目扩展、
fork DSH 的 `skill/*` 子系统，还是自研一份最小规格、让导入器把外部格式映射进来。
这份规格会被 Skill 的数据契约、导入器、`Skills()` 的读取与跑脚本、Slash Command ② 型展开同时消费，
所以值得作为提案并排比较。

**作者推荐 B：采用开放格式作载体与核心字段，本项目的规则层自持**；扩展字段里，
**属性类（调用面开关、预批准、谁可以用）一律出内容、走资产属性**，这是主线已定的前提；
**内容类扩展（依赖声明、执行环境需求、设置项声明、正文变体）推荐放 `SKILL.md` 之外、包内保留路径的一份定义记录（B-2b）**，
不进 frontmatter。**推荐不是接受。**B 的接受被一项证据挡着：开放格式原文尚未钉存（见[证据义务](design.md#证据义务与受阻消费)）。

- **当前状态：候选**。尚未记录实际评审，没有决定文件。
- **本次终点与范围**：完整候选比较与推荐；不起草契约、不写导入器设计、不改产品正文。
- **输入基线**（2026-09-23）：
  研究 [skill-spec-sources](../../../../research/skill-spec-sources/README.md)（首轮，2026-09-23；omne-next `6263fed5`、DSH `c291e796`、Claude Code `2.1.280` 与本机 122 份 `SKILL.md`）、
  [slash-command-parsing-sources](../../../../research/slash-command-parsing-sources/README.md)（2026-09-23，含钉存的 Claude Code 官方文档字节）、
  [connector-and-slash-command-sources](../../../../research/connector-and-slash-command-sources/README.md)；
  产品正文 [PF-002](../../../product/PF-002-assets-settings-and-permissions/design.md#skill) rev 13、
  [PF-006](../../../product/PF-006-tools-and-skills/design.md#常驻) rev 16、
  [PF-007](../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能) rev 16（含其 [decisions 登记的 `read` 需读资源](../../../product/PF-007-meta-capabilities/decisions.md)）、
  [PF-001 §6.7](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) rev 15、
  [PF-003 §6.7](../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) rev 4、
  [PF-014 §5.10](../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) rev 4；
  词条 [UL-skill](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill)、
  对象 [UL-asset-version](../../../domain_objects/objects.md#ul-asset-version--资产版本)；
  约束 [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)、
  [SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)；
  主线本程两条自定（name 语法归规格、产品只要求同类别内唯一；调用面开关不进 `SKILL.md` 内容、走资产属性）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：Skill 规格形状以哪份为起点；八条必要性质见 [alternatives.md](alternatives.md#选择对象与必要约束) |
| 现有能力覆盖 | 没有已起草的 Skill 契约；产品正文与三源的逐条承载见 [design.md](design.md#现有能力如何承载) |
| 剩余责任 | 见 [design.md](design.md#剩余责任与能力演化)：三源都没有、任何候选都得本项目自己定的那一层 |
| 三个实质候选 | **齐，四条外加 B 的三条子路径**：A 移植 omne-next、B 采用开放格式、C fork DSH、D 自研最小规格；A 与 C 被必要性质排除，排除依据保留 |
| 接受权限 | **本包不产生接受。**推荐、模板齐全、将来的评审通过都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要选的是什么、产品正文要求什么、三源各能承载多少、剩下哪些必须自定 | [设计正文](design.md) |
| 四条候选差在哪、扩展字段放哪、为什么推荐 B-2b、什么证据会翻盘 | [候选与取舍](alternatives.md) |
| 评审了哪个修订 | [评审记录](review.md)（尚未记录实际评审） |

## 后续消费

- **尚无决定、尚无契约。**下游是本程将起草的 Skill 包数据契约（JSON Schema + 有限规则表）、
  外部格式导入器的提供者设计，以及 `Skills()` 的 `read` / `exec_script` 契约；它们在本提案被接受之前只能按候选消费。
- 接受之前要先闭合的证据与交接缺口，见 [design.md](design.md#证据义务与受阻消费)。
