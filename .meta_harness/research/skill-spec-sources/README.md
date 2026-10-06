# Skill 规格的三个参考来源：技能由什么构成、怎么写、怎么加载

这项调查把三个参考来源——omne-next 的 skill 规格代码、DeepSeek Harness 的 skill 子系统、本机 Claude Code 里实际存在的 Agent Skills（`SKILL.md`）实例——
逐字段拆开，对照本项目产品正文里 Skill 的定义与规则（PF-002 §4 Skill、PF-006 技能相关各节、PF-007 `Skills()`、PF-003 版本与覆盖）。

要区分的是：**三源一致、能直接承载产品定义的部分**（SKILL.md 载体、name 与 description 必填、三级渐进披露、读正文不跑脚本），
**三源各有做法、承载要改的部分**（同名判定、工具声明、调用面开关、版本），以及**三源都没有的部分**（正文变体、同名替换件、常驻挂在引用上、依赖决定可用性、脚本执行权随 skill 走、已发布版本不可变）。
当前观察**不支持**任何「该采用哪一源」的结论——那归提案。

- 调查对象与基线：omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（`omne_skill_spec` 0.1.0、`omne_core_v1` `agentic/skill`、`omne_agent_skills` 0.3.1、`omne_skill_import` 0.1.0）；
  DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）`packages/skill/*` 与作者笔记；
  Claude Code `2.1.280` 与本机 `SKILL.md`（本仓库 canonical 7 个、`~/.claude/plugins/` 下 115 个）。取证 2026-09-23
- 第二轮新增对象：Agent Skills 开放格式 agentskills/agentskills `69ef37e9424c0a7ea9dd2293b559e43ec8176379`（规格无版本号；原文与参考库 skills-ref 0.1.0 钉存于 [sources/](sources/provenance.json)）；
  Codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f` 的 skill 子系统（所读源码钉存）；omne-next `omne_agent_capabilities` 的 skill 聚合（domain 层）；本机 Codex CLI `0.156.1` 的 562 份 `SKILL.md` 与 538 份 `agents/openai.yaml`
- 消费者：proposal「Skill 规格采用」（第二轮补的是它的「接受前必须补的一项」与扩展盘点）
- 最近核对：2026-09-23 第二轮（补充，见 [changelog](changelog.md)）；首轮结论未重核、正文未改

## 准入核对

三源的精确钉法、取得方式与每条观察的「支持范围」在 [证据记录](evidence.md)。本轮需要随结论一起传下去的局限：

- **omne-next 走的是本机仓库**，路径不钉、会失效；DSH 走的是本仓库 `tmp/sources/` 下有 SHA256 的 tarball。
- **首轮 Agent Skills 只看本机一手实例，不引网络规格原文**（派发约束）；第二轮已钉存原文，首轮这一局限对第二轮各条不适用。插件作者对字段的说明是厂商或社区自述；
  宿主是否识别 `tools:`、`user_invocable`、`version`，`allowed-tools` 是否真的预批准，**本轮都没有探针**。
- **omne-next 的 `omne_agent_capabilities` 不在派发清单里**，为回答版本问题只做了文件级观察，结论里标为线索（第二轮补读了 domain 层的字段与不变式，application 与 agentic 层仍未读）。
- **第二轮的 Codex 源码取自本机另一会话 scratchpad 里的同 SHA 克隆**，所读路径已 `git archive` 钉存；Codex 部分未编译运行，MCP skill 导入一条只有文档。本机实例统计是规格规则的机械套用，不是宿主实际加载结果。
- 对产品正文的引用以 HUB `assets-runtimes` 当前版本为准：PF-001 rev 15、PF-002 rev 10、PF-003 rev 4、PF-004 rev 9、PF-006 rev 14、PF-007 rev 16。

本家族不拥有方案选择：结论只写到「这条事实让什么变得不可能、什么要额外付出代价」为止。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么 | [研究正文](research.md) |
| 来源、实验或反例是否可复核 | [证据记录](evidence.md) |
| PF 条款逐行对三源的承载情况、omne-next 两套校验的逐字段比对、对照时发现的产品正文张力 | [2026-09-23 报告](reports/2026-09-23-skill-spec-sources.md) |
| 开放格式原文的四问（字段与必填、name、`metadata` 值类型、未知键）与 `allowed-tools`；omne-next、Codex、Claude Code 扩展逐条的分类与 P1–P8 相容性 | [第二轮报告](reports/2026-09-23-round2-open-format-and-extensions.md)；结论在 [research.md 第二轮](research.md#第二轮开放格式原文与三家扩展) |
| 开放格式原文、参考库与 Codex 源码的字节与哈希 | [sources/provenance.json](sources/provenance.json) 与 [SHA256SUMS](sources/SHA256SUMS) |
| 哪些结论是第二轮新增的、为什么 | [演进记录](changelog.md) |

只读研究正文就知道当前该信什么；要看 21 行对照表的判据与每一格的依据时，展开报告。
