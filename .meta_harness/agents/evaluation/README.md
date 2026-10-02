# 研发 Agent 评估

这里保存研发 agent 的评估输入与证据。编译器单元测试归 `tooling/tests/`；
资产生成、普通 agent 试用、原生宿主加载与精确模型行为分别报告。

**常设的**——改了角色、换了模型之后拿来重跑的：

- [常设用例集](suites/README.md)：按流（一个角色做一种事）组织的用例、判定依据与基线；每个流的用例与判定方法各经负责人签字。
  现有 design-reviewer 的三种判断，以及 developer 与 tui-developer 补完模块、qa 独立验收、implementation-reviewer 评审交付、
  verification-developer 为模块写测试。八个流都已签字，基线一次都还没跑（[#72](https://github.com/nemori-ai/omne-harness-lite/issues/72) 跟踪）。
- [运行器](harness/README.md)：跑用例集的那一套——一次性工作副本（待审材料，或装好依赖的整仓检出）、统一的结果形状、失败另记、带区间的汇总。
  它自己不起模型：角色与判官都由主会话派 subagent，运行器只在派发前写简报、派发后收录记录；要程序判定的流在收录时判定。

**还只是提议的**——除标明已定的两节外，没有一条已经采用：

- [其余角色的评估：提案](remaining-role-evals-proposal-2026-10-01.md)：起草类、产品设计类与取证角色各自的用例来源与判定方法、
  整仓检出一类的流怎样派发；每一节末尾列着要负责人定的事。加载探针（已定：不做）与 Codex 一端（已定：`codex exec` 不在禁令之内）两节负责人 2026-10-02 答复过。

**已发生的**——某一天为某个决定做的评估，写完不再改：

- [TUI 开发角色引入](tui-developer-introduction.md)：职责、两端生成与静态验证；未做模型行为评估。

- [角色迁移记录](role-migration.md)：本轮源包映射、静态验证及 reviewer 试用。
- [公开试用输入](role-migration-cases.json)：能力覆盖、规格信息包与交付依赖场景，不是留出集。
- [工作区入口重写](meta-agents-rewrite.md)：常驻心智、权威导航与五类只读任务试用。
- [独立迁移复核](migration-review.md)：资源、权限、自包含及方法对齐的发现和处置。
- [根宿主入口退役与接入](host-entry-retirement/README.md)：原件归档、相对软链接、源维护导航与检查集成。
- [历史角色证据](legacy-roles/README.md)：旧版本原始记录，只支持其原修订与范围。
- [开发 agent 防御辅助评估](developer-model/README.md)：自包含协议、格式与公开任务包；证据完整不授权采用。
- [角色模型复评（Opus 5.5 / GPT-6 Sol）](role-model-reeval/README.md)：各角色的换模依据、提示审计与宿主验证；任务质量对照尚未跑。
- [角色模型对照（Sonnet 5.5 / Fable 5.1 对 Opus 5.5）](role-model-sonnet55/README.md)：四个开发侧角色的留出任务对照、Fable 在实现任务上的对照、采用结果与回滚条件。
- [共享研发品味单源化](shared-engineering-taste/README.md)：品味从根 AGENTS.md 迁为角色共享正文后的去向、分发覆盖与两端加载验证。
- [Developer 输入契约强化](developer-input-contract-2026-09-26/README.md)：明确规格与 realization 输入、实施自主范围及五项只读行为试用的有界观察。
- [角色合一与架构起草角色退役](role-merge-2026-10-01.md)：四个开发角色并成 developer、architecture-drafter 退役的依据、模型选法的出处与验证范围；未重跑任务对照。
- [Codex 一端 GPT-6 Sol 升为 GPT-6.1 Sol](codex-sol-6.1-upgrade-2026-10-01.md)：四个角色的钉值替换、宿主支持证据与未验证项；未跑任务质量对照。
- [三个设计评审角色合成 design-reviewer](design-reviewer-merge-2026-10-01/README.md)：预先写定的分析计划、三份带预置缺陷的材料、新旧各跑的十次对照与逐条判定；只支持「没有看到退化」。
- [实现评审与独立验收](implementation-review-and-qa-2026-10-01/README.md)：tui-qa 泛化为 qa 后在原三项留出验收任务上的重跑；新设 implementation-reviewer 在一份种入已知问题的交付上的一次试派。
- [工作树纪律重构成「一个会话一棵工作树」](worktree-single-session-2026-10-02.md)：去掉 HUB 与 spoke 的依据与对应关系、五种情形各一次的试派；宿主加载与真实会话里的拒绝未验证。

角色迁移试用与开发模型采用评估是不同证据面。需要采用评估时明确基线、判据与接受权限；
需要评估 handbook 或角色修改时只建立覆盖本次变化的任务，不把公开样例称作留出集。
返回 [Agent 源资产](../README.md)。
