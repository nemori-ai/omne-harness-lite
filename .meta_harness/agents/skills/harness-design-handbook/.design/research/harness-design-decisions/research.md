# Agent 与 harness 项目的设计治理发现

## 问题与方法

本研究考察 DeepSeek Harness（DSH）、Pi、LangChain、Deep Agents、OpenCode 与
Hermes 是否建立如下可追溯链：

问题 → 提案与候选 → 已接受决定 → 规格或交付契约 → 实现 → 验证 → 消费者知道所采用版本

所核对的材料是面向贡献者的治理材料和已检入的设计/架构来源。运行时计划是
agent 工作时生成的行动清单；运行时批准决定一个工具调用能否执行。两者都不
说明维护者为未来设计接受了什么，因此本研究不把它们计作 proposal、candidate、
ADR 或 specification 机制。

## 比较结果

| 项目与选定官方对象 | 观察到的设计治理机制 | 交付/消费连接 | 候选或替代方案规则 | 结论的适用范围 |
|---|---|---|---|---|
| DSH，deepseek-ai/DeepSeek-Harness | 受检的 Agent Notes 在 proposed、implemented、rejected 间流转。 | 非平凡改动须在同一 PR 有 note；implemented note 保持与已交付事实一致；proposed note 有 acceptance criteria。 | 每个 active note 都须有真实 alternatives；未见数值下限。 | 最接近 proposal-to-decision 台账；没有独立的 formal-spec catalog。 |
| Pi，badlogic/pi-mono 与其官方链接的 Earendil RFC | 简短 issue proposal、maintainer approval，以及外部 RFC 的 Draft/Discussion/Published/Accepted/Abandoned 过程。 | RFC 可成为已接受方向；仓库要求 approved issue/PR 与测试。所核对规则没有强制 RFC 到代码、验证或 consumer baseline 的链接。 | RFC 指引建议比较 viable options 或最现实 alternatives 及其利弊；不设数量，且明确不同 RFC 可有不同严格度。 | 可复用的外部 proposal-to-acceptance 过程；实现闭环尚未由所核对入口确立。 |
| LangChain，langchain-ai/langchain | feature issue 及 external PR 前的 maintainer-approved solution/assignment。 | PR 模板要求关联批准、release note、检查与验证。 | alternatives 可选；没有数量。 | 贡献流程，不是 ADR/RFC/spec 生命周期。 |
| Deep Agents，langchain-ai/deepagents | issue-first、maintainer assignment；已检入 architecture 解释运行时。 | AGENTS 把 source/tests 作为权威，并要求 PR 说明理由和验证。 | proposed solution 可选；没有 alternatives 字段或数量。 | issue-to-code 流程，不是 proposal/decision/spec 生命周期。 |
| OpenCode，anomalyco/opencode | core/UI feature 实现前须 core-team design review；所有 PR 需要 issue。 | 规则要求聚焦 PR 与验证；API/SDK 改动触发生成更新。 | 表单要求请求和收益；没有 alternatives 字段或数量。 | 强 design-review gate，但没有公开 ADR 生命周期。 |
| Hermes，NousResearch/hermes-agent | 贡献指引给出不变量与优先实现位置的 ladder。 | PR 模板要求说明为何方案正确、测试及架构/流程文档更新。 | alternatives 字段可选；没有数量。 | 有用的成本排序指引，没有公开的 proposal-to-decision-to-spec 生命周期。 |

### 关于“三个候选”规则的直接回答

**事实：**在本次核对的官方仓库修订与入口中，包括 Pi 官方贡献说明指向的
Earendil RFC 过程入口，未发现任何一个项目明确要求每个设计 proposal 至少有
三个 candidate 或 alternative。最接近的要求是 DSH 对真实 alternatives 的必填
章节，以及 Pi RFC 指引对 viable options 或最现实 alternatives 的建议；Hermes
的 alternatives 字段可选，LangChain 的字段同样可选。对于 Deep Agents 与
OpenCode，本次查看的 feature intake 中没有此类字段要求。

**推断：**至少三个候选是一个刻意的本地质量门槛，不能诚实地归因于这些项目的
惯例。它应当继续保留，因为这是明确的用户要求。DSH 提供了关键制衡：数值规则
不能诱发虚构的 alternatives。

**未知：**本次聚焦核对不能确立私下维护者实践、未合并的设计讨论，或 Pi 外部
RFC 中未公开、私有或不在过程页面上的细节；它也不能证明 accepted RFC 如何在
所有情形下变为实现与消费基线。

## 逐项目观察

### DeepSeek Harness：受检的设计记录

DSH 把该记录称为 Agent Note。其官方指引说明 proposed record 在实现前接受
评审，implemented record 随交付内容保持更新，rejected record 在其理由仍能
避免可能错误时保留被拒绝的 proposal。它要求 proposed、implemented、rejected
note 都含 alternatives 章节，并明确要求记录真实 alternatives，不能编造。
同一指引规定，对非平凡代码、契约、结构、流程、格式和测试策略改动，要在同一
PR 中新增或更新 note。proposed note 包含 acceptance criteria 与 risks；
implemented note 包含 decision 与 consequences。

这是最强的可复用例子：它保留有意义的拒绝结果，并为不同的 decision 要求新增
关联 note。它的限制也重要：Agent Note 是源项目的 decision record，不是有
版本 catalog 和具名 consumer adoption 的语言无关行为 specification。当前
CONTRIBUTING 说明不接受外部 PR，因此此处体现的是内部仓库纪律，而不是公开
贡献者流程。

### Pi：官方链接的外部 RFC 过程与仓库评审门槛

选定仓库是 badlogic/pi-mono：其 README 称自己是 Pi Agent Harness，并列出
pi-agent-core 与 coding-agent package，因此区别于其他同名 Pi 项目。其
CONTRIBUTING 要求简洁 issue proposal，以及 PR 前的 maintainer lgtm approval；
contribution form 收集 what 与 why，technical approach 可选。该指引还明确把
larger changes 指向 Earendil RFC，因而该外部入口是 Pi 已声明的设计机制，不能因
不在 Git 仓库内而忽略。

Earendil 的公开 RFC 0001 说明，该过程用于 software/system architecture 或
design decision、API/interface/tool 变更、testing/rollout/migration/reliability
design 等。它由 Earendil 以 Google Docs 作为 draft、review 与 revision 的工作
空间维护；页面作者为 Armin Ronacher（armin@earendil.com），创建及更新日期均为
2026-03-07。它要求 RFC 元数据有 owner、state、visibility、created、last updated
与 tags；reviewer、approver、target decision date 等可选。该页面没有可核对的
Git commit 或不可变版本标识，故本研究以 URL、页面元数据和检索日期记录该来源。

该过程建议 RFC 写明问题、背景、viable options 或最现实 alternatives、每个选项
的 benefits/drawbacks、recommendation 的 reasoning、proposed decision、风险与
影响。用词是有用的内容建议而非每项都强制的 schema，且过程明确并非每份 RFC
都需相同严格度，因此不能导出三候选要求。RFC 可为 Draft、Discussion、Published、
Accepted、Abandoned；其中 Accepted 表示公司已选择并遵循的 direction/decision，
Abandoned 保留历史而非删除。生命周期文字还说 draft 经 review、discussion/revision
后可 Published，若是已同意方向可 Accepted。

一个 Pi 例子是公开 RFC 0047 New Locked Pi Install：作者 Armin Ronacher，
创建/更新均为 2026-06-24，状态仍为 Discussion。它提出取消 shrinkwrap，并明确
把 bundled dependencies 作为已考虑且暂时拒绝的 alternative，展示真实比较而非
数量模板。公开索引还显示 Pi Telemetry RFC 0019 的状态为 Implemented，并有
替代 RFC 的链接；但 RFC 0001 定义的状态表并没有 Implemented，且该示例没有从
RFC 指向代码修订、验证证据或 consumer adoption 的强制链接。因此所核对入口能
证明 proposal/candidate 到 Accepted 的过程和已实现状态的公开呈现，不能建立
对所有 Pi RFC 的“候选必然变成接受、实施和消费”的完整机制。

### LangChain：已批准 issue 加 PR 证据

选定对象是官方 Python monorepo langchain-ai/langchain，而不是 LangGraph 或
独立的文档仓库。其 README 将它描述为用于 agent 与 LLM application 的 framework，
因此它是可比较的工程基础设施，不是 end-user harness。PR 模板要求 external PR
关联一个 maintainer 已批准 solution 且已分配 contributor 的 issue 或 discussion。
feature form 要求 description 和 use case，而 proposed solution 与 alternatives
明确为可选。

这是有用的准入控制与交付证据，但没有建立 proposal → decision → versioned-spec
链。本次核对的完整仓库树也未出现已检入的 ADR/RFC/proposals/decisions 目录。

### Deep Agents：具有 issue-first 治理的 harness

选定对象是 langchain-ai/deepagents，其 README 称它为 batteries-included agent
harness。这使它虽与 LangChain 同属一个组织，仍是不同对象。其 feature request
要求事先搜索与 PR 前的 maintainer assignment；它要求具体 request，并把
proposed solution 作为可选。根 AGENTS 将贡献者指向已检入的 architecture 文档，
并说明 source/tests 是权威。

其 README 宣传 human-in-the-loop tool approval。这是对 tool call 的运行时控制，
不是工程设计接受规则，因此有意排除。基线中的完整仓库树有 architecture 文档，
但没有传统命名的已检入 ADR/RFC/proposal/decision 家族。

### OpenCode：把 design review 作为门槛

选定 anomalyco/opencode 的 README 将其标识为 open-source AI coding agent。
CONTRIBUTING 规定 UI 或 core product feature 在实现前须经过 core-team design
review。它要求每个 PR 关联 issue，要求聚焦的理由与可复现验证，并要求 net-new
feature 作者先发起 design conversation、等待 core-team approval 后再开 feature PR。

这清楚地区分了 product/design approval 与 agent 的 runtime approval。但已检入
feature template 只要求所请求 enhancement 及其 benefits；它既不要求 options，
也没有定义 approval 何处成为持久的 decision/ADR。匹配的 DESIGN.md 只在
packages/llm 中，是 package-local，不是全仓库 decision system。

### Hermes：选项排序，不是 proposal record

选定 NousResearch/hermes-agent 的 README 将其标识为 Nous Research 的
self-improving personal agent，而不是无关的 Hermes model 或软件项目。其 feature
form 请求 contributor 说明 alternatives 及其方案为何更好，但该字段非必填。根
AGENTS 提供 Footprint Ladder：extend existing code、CLI/skill、service-gated
tool、plugin、MCP server，最后是 core tool；它还要求保护诸如 per-conversation
prompt caching 的不变量。

这是强而可复用的比较内容，因为它比较永久 surface 与 maintenance cost。它不要求
每个 proposal 穷举全部 ladder，不设三选项规则，也不把选定 rung 记录为带具名
consumer 的 accepted ADR/spec。它的“3+ open PRs”表述关乎一个类别中多个存活
实现的收敛，不是 candidate count。

## 对自包含 harness-design handbook 的建议

以下均是依据证据和既定本地要求作出的建议，不是上游强制规则。

1. **保持工件归属分离。** research 记录来源与局限；proposal 比较 candidates；
   decision 记录接受；versioned specification 拥有稳定语义；implementation
   mapping 与 consumers 说明 adoption。DSH 是有用的紧凑 record 模型，但在
   formal semantics 与 consumer baseline 很重要时，不能取代全部五种职责。

2. **保留至少三个 candidates 的本地 proposal-template 规则。** 每个 candidate
   要记录 applicability、满足的 required properties、决定性 unknowns/
   counterexamples、ownership/cost 以及胜负理由。要求真实：若约束只留下一个
   viable route，应记录被排除路径及证据，不能填充凑数。

3. **把 rejection 与 supersession 作为一等结果。** 借鉴 DSH 的持久 rejected
   outcome 与关联 supersession。decision 应标识 accepted proposal revision、
   scope、authority、assumptions、rejected candidates 以及可重新开启它的条件。

4. **明确闭合交付。** 借鉴 DSH 的 same-change linkage 与 acceptance criteria，
   并让链接可审计：decision → spec version → provider 或 implementation mapping
   → verification evidence → consumer adoption baseline。接受不能默默声称代码、
   验证或全部 consumer 已完成。

5. **把 cost ladder 用作一个比较轴。** Hermes 展现了有用的
   least-permanent-surface 排序。它适用于 core-versus-extension 的选择，但须与
   invariants、ownership、lifecycle、failure/recovery、compatibility 和 evidence
   一同评价；不能替代竞争 candidates。

6. **单独命名运行时治理。** runtime plans、tool permissions、human approvals 和
   delegation 都是产品行为。它们可以需要自己的 specification，却永远不能授权
   或取代 design acceptance。

## 局限

以上没有任何结论声称这些项目的治理系统已被穷尽。这是对指定日期、指定修订中
官方已检入文档、模板与路径，以及 Pi 官方贡献说明明确链接的公开 RFC 入口的
核对。GitHub Discussions、private RFC、maintainer chat、issue label 和历史 PR
实践可能包含更多流程。“未发现”仅表示在本次核对的入口与完整树路径扫描中未
发现，绝不表示任何地方都不存在。
