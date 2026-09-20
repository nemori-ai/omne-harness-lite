---
kind: research
id: R-proposal-processes
scope: 15 个成熟开源流程、ADR 家族与 AI agent 生态项目怎样要求与表达"提案 → 备选方案 → 决策"，含模板原文、阶段门、决定记录形态、机器可核对范围与三次填充率统计
---

# 提案、备选方案与决策：15 个上游流程的模板、门与实际兑现

[研究索引](../README.md) · [知识流转](../../maintenance/knowledge-flow.md) · [持久化准入](../../maintenance/organization.md#持久化知识的准入) · [来源与固定版本](sources.md)

本文回答一个具体问题：**别人是怎么把"有哪些可选形状、为什么选了这个、为什么没选那些"写进流程的，以及写进去之后有没有被兑现。** 它是[提案框架](../../proposals/README.md)重做前的事实依据，不批准本项目的任何政策——[有效决定在没有新观测时仍具最终权威](../../maintenance/knowledge-flow.md)，本文只提供观测。

带「推断」标记的判断只从跨来源比较或结构得出，未经上游文字直述；带「未覆盖」的是本轮没有读到的部分。逐来源的原文引用、commit 与统计细节在 [notes/](notes/) 的 15 份笔记里，正文只保留支持判断所需的事实。

## 0. 结论先行

1. **"备选方案"在上游普遍是一个小节，不是一个约束。** 15 个来源里，把它列为必需小节的只有 6 个（PEP 的 `Rejected Ideas`、MADR 的 `Considered Options`、Nix 的 `Alternatives`、Swift 的 `Alternatives considered`、W3C TAG 的 `Alternatives considered`、DeepSeek Harness 的 `## Alternatives considered`）；把它标为可选或折进 `Rationale` 的有 6 个（TC39、EIP、MCP、K8s、Rust、ADR-Nygard 原型根本没有）；IETF 完全不提。**没有任何一个来源规定候选数量下限，也没有任何一个要求"必须含一个不做/基线候选"。**

2. **兑现率与模板措辞几乎无关，与"有没有一个会失败的门"强相关。** 三次独立统计指向同一结论：

   | 项目 | 规则 | 结构上有备选的比例 |
   |---|---|---|
   | Semantic Kernel（77 份 ADR） | MADR + 明文"每个选项列 good/neutral/bad"，无 CI | 55% 有标题，**24%** 枚举 ≥3 选项，12% 有 pros/cons |
   | MCP SEP（42 份 Final） | `Alternatives Considered` 列在"可选附加小节" | **29%** 有 Alternatives 标题；**48%** 连 Rationale 里都无备选语汇 |
   | DeepSeek Harness（抽样 45 份） | `## Alternatives considered` 由 `verify-agent-note-format.ts` 强制 | **100%**，中位数 147 词，仅 1 份短于 40 词 |

   4316 份 ADR 的大样本实证（arXiv 2609.07375v1）给出同向结论：`Considered Options` 是 MADR 里**最成问题的一节**——"在多数 ADR 里缺失或错位；存在时也常常没达到本来的目的"。

3. **最极端的反面证据是模板自己写的。** Ethereum 的 `eip-template.md` 在 `Rationale`（唯一承载备选的小节）下写着占位符 `TBD`，并注明 `The current placeholder is acceptable for a draft.`；同一份模板里 Security Considerations 配的是 `EIP submissions missing the "Security Considerations" section will be rejected.` **同一份模板中，有拒绝条款的小节被兑现，没有拒绝条款的小节被占位。** Semantic Kernel 定义自身 ADR 流程的那份 ADR（`0001`）只列了一个 `Considered Options`，且 `Chosen option:` 后面是空的。

4. **上游把严格性放在"实现与测试"上，不放在"论证"上。** IETF 要两个独立可互操作实现；TC39 要两个实现 + Test262 + editor 签字；Swift 要"没有实现就不能评审"；MCP 要可运行原型（明文排除伪代码与"相信我能跑"）+ 一份把每条 MUST/SHOULD 映射到检查 ID 或**记录在案的豁免**的 `sep-NNNN.yaml`；K8s 要 PRR 问卷通过才能进 `implementable`。**这些流程能容忍备选缺失，是因为它们有一个外部的、可验证的终局裁决。设计与规格建模阶段没有这种裁决，候选比较是唯一的筛子**（推断）。

5. **机器实际守住的东西高度一致：身份、状态、所有权、结构骨架、链接可达性——不是论证质量。** Kubernetes 校验 `title/kep-number/authors/owning-sig/approvers/status` 必填、`stage`/`status` 封闭枚举、跨字段规则 `status:implemented ⇒ stage:stable`、TOC 与模板比对；DSH 校验前三行 header、lifecycle 文件夹 ↔ Status 行 ↔ 必需标题骨架三者一致、`implemented/` 里禁用 proposal 期标题、`## Alternatives considered` 存在性、跨引用必须是相对 markdown 链接。**没有任何来源尝试检查"候选是不是真的"。**

6. **对"由 AI agent 撰写提案"，上游没有支持性先例，只有四种防御姿态。** TC39 **禁止**：`Prose contributions and comments must be your own writing, not the product of large language models`；Letta **强制披露 + 自动关闭**不合规 issue，并要求"人类必须完全理解，解释不了就别提交"；AG2 要求"被追问时用自己的话回答，贴 AI 回复不算"；MCP 要求披露并写明目的是"决定施加多少审查强度"。四家的共同点是：机器可以参与，**论证的所有权必须落在能被追问的人身上**（推断）。

7. **对本项目骨架最有分量的三条**（推断，详见 §3.5）：(a) 骨架第 1 条（提案 = 一组决定点，每个决定点有候选）在 Nix RFC 有先例——`For each design decision made, discuss possible alternatives and compare them to the chosen solution.`；(b) 骨架第 2 条（≥3 真候选 + 基线候选）**全无上游先例**，且更宽松的版本在大样本上已被证明兑现不了，采用它必须自带失败机制；(c) 最可机器核对的备选形状是 W3C TAG 的 `### 候选` + `#### Pros` / `#### Cons` / `#### Reason for rejection` 三格嵌套——候选数 = 子标题数，每个候选是否完整 = 三格是否齐。

## 1. 证据基线

15 个来源，全部在 **2026-09-15** 核对。URL、commit/版本、读取方式（逐行 / 定向提取 / 页面抓取）在 [sources.md](sources.md)。

| 来源 | 类型 | 笔记 |
|---|---|---|
| Rust RFC | 语言演进流程 | [rust-rfc](notes/rust-rfc.md) |
| Python PEP | 语言演进流程 | [python-pep](notes/python-pep.md) |
| Kubernetes KEP | 大型基础设施项目 | [kubernetes-kep](notes/kubernetes-kep.md) |
| Swift Evolution | 语言演进流程 | [swift-evolution](notes/swift-evolution.md) |
| TC39（process-document + how-we-work） | 标准委员会阶段制 | [tc39-stages](notes/tc39-stages.md) |
| Nix RFC | 发行版/包管理流程 | [nix-rfc](notes/nix-rfc.md) |
| Ethereum EIP | 协议标准流程 | [ethereum-eip](notes/ethereum-eip.md) |
| IETF（RFC 2026 / RFC 7322） | 最老的标准流程 | [ietf-rfc](notes/ietf-rfc.md) |
| ADR：Nygard 原型 + MADR 4.0.0 + adr.github.io | 决定记录格式 | [adr-nygard-madr](notes/adr-nygard-madr.md) |
| W3C TAG Explainer Explainer | 提案写作指南 | [w3c-tag-explainer](notes/w3c-tag-explainer.md) |
| MCP SEP | AI 生态的协议提案流程 | [mcp-sep](notes/mcp-sep.md) |
| Microsoft Semantic Kernel `docs/decisions` | AI 框架的 ADR 库 | [semantic-kernel-adr](notes/semantic-kernel-adr.md) |
| DeepSeek Harness Agent Notes | AI harness 的决定记录 + CI 门 | [deepseek-harness-agent-notes](notes/deepseek-harness-agent-notes.md) |
| AutoGen/AG2、LangChain、LangGraph、Letta、Dify、Mastra、CrewAI、OpenAI Agents SDK | AI 框架横扫（八家） | [agent-frameworks-survey](notes/agent-frameworks-survey.md) |
| arXiv 2609.07375v1：4316 份 ADR 的文本挖掘分析 | 实证文献 | [adr-empirical-study](notes/adr-empirical-study.md) |

全部为静态阅读，**未运行任何上游流程、未参与任何评审、未访问需凭据的站点**。三处填充率统计（Semantic Kernel、MCP、DSH）是本轮自己跑的机械匹配，偏差写在各笔记的局限节。

## 2. 观察总表

「强制力」一列按上游自身的措辞分级：**门**（不满足则流程失败）> **必需**（模板标为必需但无失败机制）> **可选**（模板明标 optional 或折进别的小节）> **无**。

| 来源 | 备选方案的落点 | 强制力 | 数量 / 基线要求 | 决定记录在哪 | 决定者 | 阶段门与退出条件 | 机器检查什么 |
|---|---|---|---|---|---|---|---|
| Rust RFC | `Rationale and alternatives`（四个问句）+ 独立 `Drawbacks` | 必需（模板固定小节，无检查） | 无 / 「不做的影响」是问句 | 合入 `text/` 即接受；理由在 PR 线程 | 相关 sub-team | FCP 10 日历日；进入前 sub-team **全员 sign-off** | 未覆盖（未读 rfcbot） |
| Python PEP | `Rationale` + **独立的 `Rejected Ideas`** | 必需 | 无 | PEP 文件自身（`Status` 头 + `Change History`） | Steering Council 或 PEP-Delegate；editor 只做形式准入 | Draft → 正式评审由 SC issue 发起；实现须在 `Final` 前完成 | header 字段（推断；未读 CI） |
| Kubernetes KEP | `Alternatives`（模板倒数第二节，三句话） | 必需（但无检查） | 无 | KEP 目录（`kep.yaml` + `Implementation History`） | owning SIG 的 `approvers` + PRR approver | **PRR 问卷通过才能进 `implementable`**；`status`/`stage` 双轴 | 必填字段、封闭枚举、SIG 名有效性、`implemented ⇒ stable`、TOC vs 模板 |
| Swift Evolution | `Alternatives considered`（指令最长：fair but not neutral） | 必需 | 无 | 提案文件 `Status` + 论坛线程（`Review` 字段封闭词表） | evolution workgroup；review manager 主持 | **无实现不得评审**；公开评审 ≥10 天且覆盖两个周末；实质修改需再评审 | 未覆盖 |
| TC39 | `Comparison` + `Q&A`（explainer 模板全体可选） | 可选 | 无 | 会议纪要 + 提案仓库 stage 标签 | 委员会共识；spec reviewer **由委员会指派** | 阶段 0–4，进入条件全为客观事实（champion / 完整 spec / 两个实现 + Test262 / editor 签字） | 未覆盖 |
| Nix RFC | `Alternatives` —— **"对每个设计决定逐条讨论备选并与所选方案比较"** | 必需 | 无 / 「不做的影响」是问句 | 合入 `rfcs/`；Shepherd Team 名单写在文件头 | 每份 RFC 单独组建的 3–4 人 Shepherd Team（**作者不得参加**） | FCP 10 日历日；全员签字才进；「无共识则关闭并注明什么情况变了可重提」 | 未覆盖 |
| Ethereum EIP | 折进 `Rationale`；**无独立小节** | 可选（模板占位 `TBD` 被明文允许） | 无 | EIP 文件 `status`；`Final` 后不可实质修改 | Core Developers / 客户端团队；editor 明确不判断价值 | Draft → Review → Last Call(14d) → Final；Security Considerations 缺失**直接拒绝** | 前置元数据格式（推断） |
| IETF | **无任何要求** | 无 | 无 | RFC 编号 + `Obsoletes`/`Updates`；理由在邮件列表 | IESG 批准 | 两个独立可互操作实现方可进阶；IETF Last Call | 未覆盖 |
| ADR — Nygard 原型 | **无**（备选建模为 `Context` 里的 forces） | 无 | 无 | ADR 文件 `Status` | 未定义 | 未定义 | 无 |
| ADR — MADR 4.0.0 | `Considered Options`（必需）+ `Pros and Cons of the Options`（可选） | 必需 | 无；`Decision Outcome` 明确允许 `only option` | ADR 文件；`decision-makers`/`consulted`/`informed` 三字段（整块可选） | 未定义（格式不是流程） | 未定义；`Confirmation` 节问"如何确认实现符合本 ADR" | 无 |
| W3C TAG Explainer | `Alternatives considered`，**每候选强制 Pros / Cons / Reason for rejection** | 必需 | `as many as you can`（上不封顶，下不封底） | 未定义（这是写作指南）；另设独立的 `Stakeholder Feedback / Opposition` 节 | 未定义 | 未定义 | 无（但结构最可核对） |
| MCP SEP | `Rationale` 指令含备选；`Alternatives Considered` 在 **`Additional Optional Sections`** | 可选 | 无 | `seps/{PR号}-{slug}.md`（markdown status 为 canonical，PR label 为副本）；`Final` 后冻结 | Core Maintainers 每两周评审；**状态只能由 sponsor 改** | 接受需**可运行原型**；`Final` 需参考实现 + 一致性场景 + `sep-NNNN.yaml` 把每条 MUST/SHOULD 映射到 check ID 或记录在案的豁免 | 一致性测试与 traceability（在 conformance 仓库） |
| Semantic Kernel ADR | `Considered Options` + `Pros and Cons`（沿用 MADR） | 必需（明文"每选项列 good/neutral/bad"，无检查） | 无 | `docs/decisions/NNNN-*.md`；**批准载体是 PR approval** | `deciders` 字段列出的人 + 必须含相关 EM 与 `dluc` | 无阶段门；status 由作者手改 | **无**（证据：8 份 status 带模板花括号、6 组编号重复） |
| DeepSeek Harness Agent Notes | `## Alternatives considered` | **门** | 无；但明文 `Alternatives are recorded, never invented` | `.agents/notes/{lifecycle}/{class}/日期-标题.md`，lifecycle 即状态 | 未覆盖（README 只规定格式） | 生命周期迁移必须同时改 Status 行并重写骨架，否则 gate 失败 | header 三行、Status ↔ 文件夹一致、各 lifecycle 必需标题、`implemented/` 禁用 proposal 期标题、Alternatives 存在性（或精确的 grandfather 注释）、封闭 class 树、归档三件套与冻结哈希 |
| 八个 AI 框架 | 仅 CrewAI / Mastra 的 issue 表单有 `Alternatives Considered`，两者均 `required: false` | 无 | 无 | 无提案/决定目录；Mastra 有无 status 的 `explorations/`，AutoGen 有现状式 `docs/design/` | — | — | LangChain 把必填复选框全投在去重与归位上 |

## 3. 按问题的回答

### 3.1 通用流程怎样要求与表达备选方案（观察）

**小节名称与位置。** 四种形态：
- 独立的 `Alternatives` / `Alternatives considered`：Nix、Swift、K8s、W3C TAG、DSH。
- 与 rationale 合并（`Rationale and alternatives`）：Rust。
- 折进 `Rationale`，无独立小节：PEP（但另设 `Rejected Ideas`）、EIP、MCP。
- 不要求：IETF、Nygard 原型、TC39（分散在 `Comparison` 与 `Q&A`）。

**数量与基线。** 全部 15 个来源：**无一规定数量下限，无一强制基线候选**。最接近基线的是三处问句式表达——Rust 与 Nix 的 `What is the impact of not doing this?`，以及 MADR `Decision Outcome` 里把 `only option` 列为合法理由（即明确允许只有一个候选）。

**唯一按"决定点"组织的**是 Nix RFC 模板：`For each design decision made, discuss possible alternatives and compare them to the chosen solution. The reader should be convinced that this is indeed the best possible solution for the problem at hand.`

**结构化程度最高的**是 W3C TAG：每个候选一个 `###` 子标题，下设 `#### Pros`、`#### Cons`、`#### Reason for rejection`；覆盖粒度写明 `from high level architectural decisions down to alternative naming choices`；并为"还没决定的候选"留了合法位置（`You may not have decided about some alternatives. Describe them as open questions here`）。

**对"公平陈述"写得最清楚的**是 Swift：

> You should be fair about other proposals, but you do not have to be neutral; after all, you are specifically proposing something else. Describe any advantages these alternatives might have, but also be sure to explain the disadvantages that led you to prefer the approach in this proposal.

以及一条本项目正需要的规则：换了主方案后，**旧方案要被写进备选并解释为什么新的更好**。

**对"不要编造候选"写得最清楚的**是 DeepSeek Harness：`Alternatives are recorded, never invented.` 配一条 CI 认得的精确注释供无法重建的历史文件使用。

**Drawbacks 与 Alternatives 的分工。** Rust、Nix、K8s 都把 `Drawbacks`（"为什么**不**该做这件事"）与 `Alternatives`（"为什么不是**别的**形状"）分成两节。这是两类不同的反对意见，本项目骨架目前把它们合在"失败模式"里（推断：值得拆开）。

**决定记录在哪、由谁做。** 两种归档形态：
- **决定在文件里**：PEP（`Status` 头 + `Rejected Ideas` + `Change History`）、K8s（`kep.yaml`）、EIP、MCP、Swift（`Status` + `Review` 链接词表）、ADR/MADR、DSH（lifecycle 文件夹）。
- **决定在合并动作里，理由在线程里**：Rust、Nix。Rust 有一条补丁——`if the reasoning is not clear from the discussion in thread, the sub-team will add a comment describing the rationale for the decision.`

决定者一律是**与作者分离的小团体**：Rust sub-team、Nix Shepherd Team（明文 `The author cannot be part of the Shepherd Team`，且至多一半来自 Steering Committee）、Swift evolution workgroup、PEP Steering Council / delegate、K8s SIG approvers + PRR approver、MCP Core Maintainers、EIP Core Developers、IETF IESG。

**阶段门与退出条件。** 三类门：
- **时间门**：Rust / Nix 的 FCP 十个日历日（Nix 要求全员签字才进）、Swift 的 ≥10 天且覆盖两个周末、EIP 的 Last Call 14 天。
- **人门**：全员 sign-off（Rust、Nix）、sponsor 指派与状态更新权（MCP）、`deciders` 必须是 required reviewers（Semantic Kernel）、spec reviewer 由委员会指派（TC39）。
- **证据门**：两个可互操作实现（IETF、TC39）、可运行原型（MCP，明文排除伪代码）、无实现不得评审（Swift）、PRR 问卷通过（K8s）、一致性场景 + traceability 文件（MCP 进 `Final`）。

**退出/复议。** 三个值得记的形状：Rust 的 `postponed`（已过"我们会不会考虑这件事"的一轮筛，但无成文复议流程）；MCP 的 `dormant ≠ rejected`（只是没找到 sponsor，可复活）与"不同意方向就提交竞争性 SEP"；Nix 的"无共识则关闭，并**注明什么情况变了可以重提**"——最接近本项目要的"复议条件"。EIP 的 `Withdrawn` 反向严格：编号作废，重提算新提案。

**评审清单看什么。** **没有一个来源提供成文的评审 checklist。** 能提取的最接近物：Rust 的四条隐含判据（动机是否有说服力、是否理解设计影响、drawbacks 与 alternatives 是否**诚实**——原文用词 `disingenuous`、tradeoffs 是否已讨论到可决定）；K8s 的 PRR 问卷（但问的是上生产的准备度，不是设计质量）；MCP 的三条接受判据（原型、生态收益、社区共识）。

### 3.2 AI agent 框架与 harness（观察）

**十一个项目里只有三个有正式机制**：

| 项目 | 机制 | 备选是真实存在还是形式化占位 |
|---|---|---|
| MCP | SEP：文件即 PR 号、8 种状态、sponsor 制、原型门、一致性测试 + traceability 门 | **形式化偏多**：42 份 Final SEP 里 29% 有 Alternatives 标题，48% 连 Rationale 里都无备选语汇，4 份连 `Rationale` 都没有（其中 `990` 的结构是 PR 描述而非 SEP 模板） |
| Semantic Kernel | MADR，`docs/decisions/` 77 份 | **大面积形式化**：55% 有 `Considered Options` 标题，其中 9 份完全为空；只有 24% 枚举 ≥3 选项、12% 写了 pros/cons；22 份长期停在 `proposed`；8 份 status 带模板花括号；6 组编号重复 |
| DeepSeek Harness | Agent Notes：lifecycle/class 路径编码 + CI 强制格式 | **真实**：抽样 45 份全部有 `## Alternatives considered`，中位数 147 词，最长一份列了 8 个候选，每个带形状描述 + 否决理由 |

**另外八个框架（AutoGen/AG2、LangChain、LangGraph、Letta、Dify、Mastra、CrewAI、OpenAI Agents SDK）全部没有** `rfcs/` / `proposals/` / `decisions/` / `adr/` 或等价目录。近似物三种：AutoGen 的 `docs/design/`（现状说明书，无 status 无备选）、Mastra 的 `explorations/`（自由格式探索稿，无 status，不入流程）、OpenAI Agents SDK 的 `PLANS.md`（面向 agent 的施工计划规范）。

**值得单独记的两点：**

- **Mastra 的 `explorations/agent-network-vs-ralph-wiggum.md`（492 行）实际上是一份质量不低的候选比较**——七维度并排对照表、逐一分析两种形态的弱点、三个 Option、分三期的推荐实现。但它没有 status、不进任何流程、不产生可追溯的决定。推断：**真实的候选比较在这些项目里是存在的，只是不以"提案"的身份存在，因此半年后无法判断哪个 Option 被选了、为什么。**
- **OpenAI Agents SDK 的 `PLANS.md`** 是本轮唯一一份专为 AI agent 撰写而写的长文档规范。它强制四个"活"小节：`Progress`（带时间戳的复选框）、`Surprises & Discoveries`（意外发现，**须带证据**）、`Decision Log`（每个决定 + 理由 + 日期/作者）、`Outcomes & Retrospective`。**它要求决定与理由，不要求备选**；它对应的是施工计划，不是提案。

issue 层面：只有 CrewAI 与 Mastra 的 feature request 表单有 `Alternatives Considered` 字段，两者均 `validations: required: false`，措辞继承自 GitHub 默认模板。LangChain 的五个必填复选框全部关于去重与归位，一个都不关于论证。

**Anthropic / OpenAI 的公开设计文档惯例**：能找到的最接近物是 MCP 的 SEP（Anthropic 发起）与 OpenAI Agents SDK 的 `PLANS.md`；两家公司内部的设计文档流程不公开，**本轮无法核对**。

### 3.3 反面证据：哪些流程的备选方案形同虚设（观察）

**三类失效，各有直接证据：**

**(a) 模板自己允许占位。** Ethereum `eip-template.md`：

```markdown
## Rationale

<!--  … The current placeholder is acceptable for a draft. … -->

TBD
```

同一手法用在 `Backwards Compatibility`（占位 `No backward compatibility issues found.`）与 `Security Considerations`（占位 `Needs discussion.`）。但后两者另有拒绝条款，前者没有。

**(b) 标为"可选"。** MCP 把 `Alternatives Considered` 放进 `## Additional Optional Sections`，结果 29% 兑现率。

**(c) 有明文要求但无失败机制。** Semantic Kernel `0001` 第 3 步写明"每个选项列 good/neutral/bad"，实际 12% 有 pros/cons。最有说服力的一处是：**定义这套 ADR 流程的那份 ADR 自己**只有一个 `Considered Options`，且 `Chosen option:` 后面空着。同一份文件里，没有机器兜底的"检查已有 PR 以确保编号正确"在 77 份规模上已失效（6 组重号）。

**大样本证据。** arXiv 2609.07375v1 对 547 个仓库的 4316 份 ADR 做文本挖掘 + LLM 分类 + 模板合规检查，§4.3 结论：

> The most problematic section was Considered Options, which is mandatory in the MADR template … This section was absent or misplaced in most ADRs and, when present, often failed to fulfill its intended purpose.

> the low quality and frequent omission of Decision Drivers and Considered Options point to a limited documentation of rationale and alternatives

论文还观察到一类纯人工评审不敏感、机器检查敏感的失败：**内容写了但放错小节**（`recurring mismatches between ADR contents and template sections`）。

**社区的改进要求（覆盖不足）。** 本轮**没有**找到明确提出"至少两个备选 + 不做的选项""决策矩阵""反对意见记录"的批评文献或社区讨论。找到的改进形状全部来自模板本身，不是来自批评：

- W3C TAG：每候选强制 `Pros` / `Cons` / `Reason for rejection` 三格。
- MADR：`Good, because` / `Neutral, because` / `Bad, because` 固定词法前缀；`Decision Drivers` → `Decision Outcome` 的引用关系（选择必须援引已声明的尺）。
- W3C TAG：把 `Stakeholder Feedback / Opposition` 从 alternatives 里**分出来独立成节**——这是本轮见到的唯一一处"反对意见单独记录"。
- DSH：CI 强制 + `Alternatives are recorded, never invented`。
- PEP：`Rejected Ideas` 的目的被写明为 `preventing people from bringing up the same rejected idea again`。
- Swift：项目级的 `commonly_proposed.md`（跨提案的"常被提出且已被否决"清单）。

这一节的覆盖缺口见 §5。

### 3.4 对「由 AI agent 撰写与维护提案」的适用性（**本节全部为推断**）

**可被机器核对的（有上游实现为证）：**

| 可核对的性质 | 上游实现 |
|---|---|
| 字段齐全 | K8s `validate:"required"`（title/kep-number/authors/owning-sig/approvers/status） |
| 状态取值合法 | K8s `ValidStages`/`ValidStatuses` 封闭枚举；DSH 三条 Status 正则 |
| 状态与位置一致 | DSH lifecycle 文件夹 ↔ Status 行交叉校验；K8s `status:implemented ⇒ stage:stable` |
| 必需小节存在 | DSH 按 lifecycle 分别要求 `## Problem` + 骨架标题 |
| 禁用小节不存在 | DSH `implemented/` 里禁 `## Proposal` / `## Plan` / `## Migration plan` / `## Acceptance criteria` |
| 备选小节存在（或有精确的豁免记号） | DSH `## Alternatives considered` 或 grandfather 注释，二者必居其一且不可并存 |
| 候选数量 | **无上游实现**；但 W3C TAG 的 `###` 子标题结构使它可数 |
| 每候选是否有代价与否决理由 | **无上游实现**；W3C TAG 的 `#### Pros`/`#### Cons`/`#### Reason for rejection` 使它可数；MADR 的 `Good/Neutral/Bad, because` 前缀使它可粗筛 |
| 规范条款 ↔ 证据的映射 | MCP `sep-NNNN.yaml`：每条 MUST/SHOULD → check ID 或**记录在案的豁免 + 跟踪 issue** |
| 引用可定位 | DSH 要求跨引用必须是相对 markdown 链接（`so they are mechanically checkable`）；EIP 要求外链锚定到具体 commit；本项目 `make docs-check` 已校验链接与锚点 |
| 结构与模板一致 | K8s `verify-toc-vs-template.sh` |

**依赖人类隐性共识、机器核对不了的：**

- **候选是不是"真"的**（形状不同 vs 同一形状调参）。DSH 用规则回避而非解决：`Alternatives are recorded, never invented`——把判断推给"是否有记录",而不是"是否合理"。
- **否决理由是否成立**。Rust 用 `disingenuous`（不诚实）一词把它交给 sub-team 的主观判断。
- **尺是不是同一把**（骨架第 3 条）。MADR 的 `Decision Drivers` → `Decision Outcome` 引用只能查"有没有援引",查不了"援引得对不对"。
- **"足够的 tradeoff 已被讨论"**——Rust/Nix 进入 FCP 的条件，原文即为判断句。
- **证据与主张是否匹配**。MCP 的 traceability 只能查"每条 MUST 有没有对应物",查不了那个检查是否真的覆盖该条款。

**最可机器核对的三种模板形状**（推断，按可核对强度排序）：

1. **W3C TAG 的嵌套候选**：`### <候选名>` + `#### Pros` + `#### Cons` + `#### Reason for rejection`。候选数 = `###` 计数；每候选完整性 = 三个 `####` 是否齐；"未决候选"有合法位置（`Reason for rejection` 下写成 open question）。**加一条本项目需要的格（成本 / 触及的消费者 / 证据义务）即可直接用。**
2. **DSH 的 lifecycle 路径编码 + Status 交叉校验 + 必需/禁用标题骨架**。它把"新头旧身"这类失败变成 gate 失败而不是人工提醒；`rejected` 状态强制带一行理由（`Status: rejected — <why>`）是本轮唯一"否决理由被机器强制"的实例。
3. **MCP 的 traceability 文件**（`sep-NNNN.yaml`：条款 → check ID | 记录在案的豁免 + 跟踪 issue）。它是"证据两级"第二级的可机器化形态，且**把豁免也变成一等记录**——这正是本项目"缺口、失败、未执行分别保留"想要的东西。

**必须正视的一条（观察，不是推断）**：TC39 的 `AI_POLICY.md` **禁止**用 LLM 代写散文贡献；Letta 把 AI 披露做成自动关闭门；AG2 要求"被追问时用自己的话回答"；MCP 要求披露并写明目的是决定审查强度。**"由 AI agent 撰写与维护提案"在上游没有先例支持**——本项目要走这条路，"谁为论证负责、被追问时由谁解释"必须由本项目自己的裁决分层承担，不能引用上游惯例作依据。

### 3.5 与本项目骨架的对照（**本节全部为推断**）

骨架六条来自主检出的 `tmp/next-design-prep/proposal-framework-sketch.md`（前台草案，不是政策）。

| # | 骨架条 | 上游先例 | 判断 |
|---|---|---|---|
| 1 | 提案 = 一组决定点，每个决定点是一条轴；第一个决定点是"对能力基是哪种关系" | **部分有**：Nix RFC 的 `For each design decision made, discuss possible alternatives…` 是唯一按决定点组织备选的模板。"第一个决定点是关系类型"**本项目独有**，无先例 | 前半有先例可引；后半是本项目在能力基模型上的自创，需要自证 |
| 2 | 每个决定点 ≥ 3 真候选，含一个基线候选（最小改动/不做/延后） | **全无先例**。15 个来源无一规定数量下限或强制基线；MADR 明确允许 `only option`；更宽松的 MADR `Considered Options` 在 4316 份样本上已是"最成问题的一节" | **最危险的一条**。要么配一个会失败的门，要么改成"必须说明为何只有 N 个"这类可核对的弱形式 |
| 3 | 比较用同一把尺，尺先于矩阵 | **有先例**：MADR 的 `Decision Drivers` → `Decision Outcome` 引用（`which meets k.o. criterion decision driver`）。但该节在 MADR 里是 optional，实证研究里"经常错位、缺乏实质内容" | 形状可用，但它是实证里第二差的一节；本项目若采用应把尺**绑到已确认需求条款与不变量的具体编号**，使"援引了什么"可机器核对 |
| 4 | 决定 = 选择 + 否决理由 + 复议条件；作者裁决 / 用户裁决分层 | **分别有**：否决理由 → DSH `Status: rejected — <why>`（机器强制）、Swift "fair but not neutral"、W3C TAG `Reason for rejection`；复议条件 → Nix"注明什么情况变了可重提"、MCP `dormant ≠ rejected`、PEP `Rejected Ideas` 的防重提目的；裁决分层 → MCP"状态只能由 sponsor 改"、Nix"作者不得进评审团" | 三个组成部分各有先例，**组合起来是本项目独有**。"用户裁决"这一层无对应物（上游都是委员会） |
| 5 | 证据两级：候选阶段证"能否成立"（只对前一两名做），决定后证"实现是否符合" | **只有第二级有先例**：MADR `Confirmation`、MCP 的一致性测试 + traceability、K8s PRR、TC39/IETF 的两实现门。**第一级（候选阶段的可行性证据）无先例**——上游要么不要求（ADR 家族），要么要求所有候选都不用证、只证最终方案（MCP 原型门在 accept 时才生效） | 第二级可直接借 MCP 的 traceability 形状。第一级"只对前一两名做"是本项目独有，也是它最有价值的一条：上游的证据门都在"已经选定之后"，因此都无法阻止选错 |
| 6 | 评审清单（≥3 真候选？有基线？矩阵同尺？否决方公平？证据与主张匹配？Cordis 投影？） | **无先例**：15 个来源无一提供成文评审 checklist。最接近的是 Rust 的四条隐含判据与 K8s 的 PRR 问卷（但后者问的是上生产准备度） | 本项目独有。可行性来自本项目已有的独立 reviewer 角色；但清单里的六问只有前两问可机器核对，后四问仍是人工判断——**应把清单显式分成"机器筛"与"人工判"两段**，不要让它看起来比实际更硬 |

**值得引入的（各一句理由）：**

- **W3C TAG 的候选三格结构**（`Pros` / `Cons` / `Reason for rejection`）：把"否决方是否被公平陈述"从判断题变成结构题。
- **DSH 的 lifecycle 路径 ↔ Status ↔ 必需标题三重交叉校验**：把"新头旧身"从人工提醒变成 gate 失败，正对本项目已经踩过的坑。
- **DSH 的 `Alternatives are recorded, never invented` + 精确豁免注释**：唯一一条同时管住"缺失"与"编造"的规则，且两端都可核对——这对 AI 撰写场景尤其重要，因为机器编造候选比人省力得多。
- **MCP 的 `sep-NNNN.yaml` traceability**：把"证据齐不齐"变成"每条条款有没有对应物或一条记录在案的豁免",且豁免必须带跟踪项。
- **Nix 的"关闭时注明什么情况变了可以重提"**：本项目"复议条件"的现成措辞。
- **Swift 的 `Review` 封闭词表 + `Previous Revision` 指向被评审过的确切 commit**：使"这次决定的对象是哪一版正文"可定位，与本项目"已发布规格不可原地覆盖"同构。
- **Swift 的项目级 `commonly_proposed.md`**：比每份提案各记一遍 `Rejected Ideas` 更省，且正对"防止同一候选被反复提出"。
- **PEP 把 `Rejected Ideas` 独立成节**（而不是塞进 rationale）：它记录的是**讨论中实际出现过并被否决**的想法，与"作者构造的候选集"是两类东西，分开更诚实。
- **K8s 把 `status` 与 `stage` 分离并做跨字段校验**：本项目"接受 ≠ 实现 ≠ 验证"的三段区分正需要这种双轴表达。
- **Rust / Nix 把 `Drawbacks` 与 `Alternatives` 分成两节**：前者是"为什么不该做这件事"，后者是"为什么不是别的形状"，本项目骨架目前把它们合在"失败模式"里。

**不适合引入的（各一句理由）：**

- **一切日历门**（FCP 十天、Last Call 14 天、评审覆盖两个周末、6 个月自动 Stagnant/Dormant）：它们服务于"让分散的利益相关者有时间发声"，本项目是单作者 + 用户裁决，时间窗对应不到任何真实约束。
- **"无实现不得评审"（Swift）与"接受前须有可运行原型"（MCP）**：本项目在设计与规格建模阶段，这条门会把候选阶段压死，与骨架第 5 条"三个候选 ≠ 三个原型"直接冲突。
- **K8s 的 `Merge early and iterate` + Alternatives 放文末三句话**：它的重心是"已经决定要做、只是要保证能上生产"，与本项目"还要选形状"的重心相反。
- **MADR 的开放 status 取值域**（`{proposed | rejected | accepted | deprecated | … }`）：Semantic Kernel 用它长出了 `approved`、`experimental`、`{ accepted }`；本项目需要封闭词表才能做跨文档校验。
- **把决定理由留在讨论线程**（Rust、Nix、IETF）：本项目的裁决发生在会话里，会话不是可长期检索的档案；理由必须落进文件。
- **Semantic Kernel"把批准绑定到 PR approval"**：它使"是否接受"不可从文件本身读出，与本项目"从 catalog 查当前可采用的契约与精确版本"的做法冲突。

## 4. 跨来源的规律（推断）

1. **强制力的唯一有效形式是"会失败的动作"。** 三处填充率统计 + EIP 的 `TBD` 占位 + 4316 份 ADR 的实证指向同一条：模板措辞（必需 / 可选 / 明文要求）对兑现率的影响远小于"有没有一个 CI 或评审动作会因此失败"。DSH 是唯一有 CI 门的来源，也是唯一接近 100% 兑现的来源。
2. **成熟流程把严格性投在可外部验证的终局事实上**（两个实现、一致性测试、生产就绪问卷），因此能容忍论证质量的参差。**没有终局事实可用的阶段（架构设计、规格建模），必须自己承担筛选——这正是本项目所处的位置。**
3. **机器守身份，人守论证。** 所有来源的机器检查都落在身份、状态、所有权、结构骨架、链接可达性上；论证质量一律交给人。本项目要在 AI 撰写的前提下提高论证质量，**唯一可机器化的抓手是把论证的结构切细到可计数**（候选数、每候选的格数、每条条款的证据对应物），而不是试图检查论证本身。
4. **"备选方案"承载了两件被混在一起的事**：作者构造的候选集（Rust、Nix、TAG、MADR）与讨论中实际出现并被否决的想法（PEP `Rejected Ideas`、Swift 的"pitch 阶段更新此节"、MCP `Rationale` 的 `Document important objections`）。前者是设计动作，后者是过程留痕；对 AI 撰写而言，前者容易编造、后者不可能编造。**本项目若要防"形式化占位",应当把后者做成独立且必需的记录。**
5. **备选与反对是两回事。** 只有 W3C TAG 把 `Stakeholder Feedback / Opposition` 独立成节。本项目的裁决表里"另一边"一列其实同时承担了这两件事（见[工具执行提案](../../proposals/tool-execution/README.md)），值得考虑拆开。

## 5. 未覆盖与局限

- **实践填充率只统计了三个项目**（Semantic Kernel 77、MCP 42、DSH 抽样 45）。Rust、Nix、Swift、K8s、EIP、PEP 的实际填充率**全部未覆盖**——因此"模板要求 vs 实际兑现"的对比只在 ADR 家族与 AI 生态内成立，不能外推到语言演进流程。
- **统计方法是机械的标题与关键词匹配**，会低估把备选写成散文、写在别的小节里的情况，也会把"提了一句 we considered X"算作"有"。三处统计只支持"结构上找得到/找不到备选"，不支持"作者考虑过/没考虑过备选"。DSH 的"每候选计数"启发式不可靠，本文只引用其字数与存在性。
- **被拒绝的提案几乎完全未覆盖。** MCP 的 `seps/` 里 42 份全是 `Final`；Rust/Nix 的被拒 RFC 是关闭的 PR，不在仓库里；只有 DSH 的 `rejected/`（14 份）保留了被否决提案的正文，且本轮只抽到 1 份。**本项目最关心的"被否决的候选如何留档"，证据最薄。**
- **Q3 的"社区批评与改进提案"覆盖不足。** 本轮只找到一份实证论文（arXiv v1，未经同行评审，且只读了摘要与 §4.3 的定向提取，**没有精确百分比**）。明确提出"至少两个备选 + 不做的选项""决策矩阵""反对意见记录"的批评文献或社区讨论**没有找到**；《Architecture Decision Records in Practice: An Action Research Study》（ECSA 2024）**未读**，它可能是"为什么备选写不出来"的更好来源。
- **机器检查的覆盖不均**：K8s 与 DSH 读了校验源码；Rust、Swift、TC39、EIP、PEP、MCP 的 CI 实现**未读**，因此它们"机器检查什么"一列多为未覆盖或推断。
- **页面类来源多为定向提取**：RFC 2026 与 RFC 7322 未通读（且 RFC 2026 已被后续 BCP 部分更新，如标准轨三级压到两级，本轮**未核对**）；Nygard 原文、adr.github.io、tc39.es/process-document 均为抓取摘要。tc39.es 的流程页**没有版本或日期标记**，只能用源仓库 HEAD 定位。
- **两家公司的内部惯例无法核对**：Anthropic 与 OpenAI 的内部设计文档流程不公开；本文只能观察它们主导的公开产物（MCP SEP、`PLANS.md`）。
- **§3.4、§3.5、§4 全部是本文作者的归纳**，不是上游声明。它们用于帮助后续提案定位问题，**不构成接受依据**；本项目要采用其中任何一条，都需要经[提案 → 决定](../../maintenance/knowledge-flow.md)的正常路径。

## 6. 来源

逐来源笔记（含原文引用、commit 与统计细节）：
[Rust RFC](notes/rust-rfc.md) · [Python PEP](notes/python-pep.md) · [Kubernetes KEP](notes/kubernetes-kep.md) · [Swift Evolution](notes/swift-evolution.md) · [TC39](notes/tc39-stages.md) · [Nix RFC](notes/nix-rfc.md) · [Ethereum EIP](notes/ethereum-eip.md) · [IETF](notes/ietf-rfc.md) · [ADR：Nygard 与 MADR](notes/adr-nygard-madr.md) · [W3C TAG Explainer](notes/w3c-tag-explainer.md) · [MCP SEP](notes/mcp-sep.md) · [Semantic Kernel ADR](notes/semantic-kernel-adr.md) · [DeepSeek Harness Agent Notes](notes/deepseek-harness-agent-notes.md) · [八个 AI 框架横扫](notes/agent-frameworks-survey.md) · [ADR 实证研究](notes/adr-empirical-study.md)

URL、固定 commit / 版本、读取方式与核对日期：[sources.md](sources.md)。

本项目内部对照：[知识流转](../../maintenance/knowledge-flow.md)、[持久化与提案准入](../../maintenance/organization.md#提案的持久化准入)、[版本规范](../../maintenance/versioning.md)、[提案入口](../../proposals/README.md)、[工具执行提案的裁决表](../../proposals/tool-execution/README.md)、[决定权 D-002](../../decisions/D-002-decision-authority.md)、[Agent Loop、事件与 hooks 研究](../agent-loop-events-and-hooks/README.md)。
