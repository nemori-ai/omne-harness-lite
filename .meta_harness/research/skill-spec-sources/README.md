# Skill 规格的三个参考来源：技能由什么构成、怎么写、怎么加载

这项调查把三个参考来源——omne-next 的 skill 规格代码、DeepSeek Harness 的 skill 子系统、本机 Claude Code 里实际存在的 Agent Skills（`SKILL.md`）实例——
逐字段拆开，对照本项目产品正文里 Skill 的定义与规则（PF-002 §4 Skill、PF-006 技能相关各节、PF-007 `Skills()`、PF-003 版本与覆盖）。

要区分的是：**三源一致、能直接承载产品定义的部分**（SKILL.md 载体、name 与 description 必填、三级渐进披露、读正文不跑脚本），
**三源各有做法、承载要改的部分**（同名判定、工具声明、调用面开关、版本），以及**三源都没有的部分**（正文变体、同名替换件、常驻挂在引用上、依赖决定可用性、脚本执行权随 skill 走、已发布版本不可变）。
当前观察**不支持**任何「该采用哪一源」的结论——那归提案。

- 调查对象与基线：omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（`omne_skill_spec` 0.1.0、`omne_core_v1` `agentic/skill`、`omne_agent_skills` 0.3.1、`omne_skill_import` 0.1.0）；
  DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）`packages/skill/*` 与作者笔记；
  Claude Code `2.1.280` 与本机 `SKILL.md`（本仓库 canonical 7 个、`~/.claude/plugins/` 下 115 个）。取证 2026-09-23
- 消费者：本程 proposal「Skill 规格采用」（待出现）
- 最近核对：2026-09-23 / 上列版本（首轮）

## 准入核对

三源的精确钉法、取得方式与每条观察的「支持范围」在 [证据记录](evidence.md)。本轮需要随结论一起传下去的局限：

- **omne-next 走的是本机仓库**，路径不钉、会失效；DSH 走的是本仓库 `tmp/sources/` 下有 SHA256 的 tarball。
- **Agent Skills 只看本机一手实例，不引网络规格原文**（派发约束）。插件作者对字段的说明是厂商或社区自述；
  宿主是否识别 `tools:`、`user_invocable`、`version`，`allowed-tools` 是否真的预批准，**本轮都没有探针**。
- **omne-next 的 `omne_agent_capabilities` 不在派发清单里**，为回答版本问题只做了文件级观察，结论里标为线索。
- 对产品正文的引用以 HUB `assets-runtimes` 当前版本为准：PF-001 rev 15、PF-002 rev 10、PF-003 rev 4、PF-004 rev 9、PF-006 rev 14、PF-007 rev 16。

本家族不拥有方案选择：结论只写到「这条事实让什么变得不可能、什么要额外付出代价」为止。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么 | [研究正文](research.md) |
| 来源、实验或反例是否可复核 | [证据记录](evidence.md) |
| PF 条款逐行对三源的承载情况、omne-next 两套校验的逐字段比对、对照时发现的产品正文张力 | [2026-09-23 报告](reports/2026-09-23-skill-spec-sources.md) |

只读研究正文就知道当前该信什么；要看 21 行对照表的判据与每一格的依据时，展开报告。
