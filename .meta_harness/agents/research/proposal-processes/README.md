---
kind: research
id: R-proposal-processes
scope: 15 个成熟开源流程、ADR 家族与 AI agent 生态项目怎样要求与表达"提案 → 备选方案 → 决策"，含模板原文、阶段门、决定记录形态、机器可核对范围与三次填充率统计
---

# 提案、备选方案与决策：15 个上游流程的模板、门与实际兑现

[研究索引](../README.md) · [来源与固定版本](sources.md)

本文比较上游如何表达候选、选择和理由，以及规则实际兑现的范围。
它不批准本项目的任何政策；当前方法由 canonical handbook 拥有。

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

## 5. 未覆盖与局限

- **实践填充率只统计了三个项目**（Semantic Kernel 77、MCP 42、DSH 抽样 45）。Rust、Nix、Swift、K8s、EIP、PEP 的实际填充率**全部未覆盖**——因此"模板要求 vs 实际兑现"的对比只在 ADR 家族与 AI 生态内成立，不能外推到语言演进流程。
- **统计方法是机械的标题与关键词匹配**，会低估把备选写成散文、写在别的小节里的情况，也会把"提了一句 we considered X"算作"有"。三处统计只支持"结构上找得到/找不到备选"，不支持"作者考虑过/没考虑过备选"。DSH 的"每候选计数"启发式不可靠，本文只引用其字数与存在性。
- **被拒绝的提案几乎完全未覆盖。** MCP 的 `seps/` 里 42 份全是 `Final`；Rust/Nix 的被拒 RFC 是关闭的 PR，不在仓库里；只有 DSH 的 `rejected/`（14 份）保留了被否决提案的正文，且本轮只抽到 1 份。**本项目最关心的"被否决的候选如何留档"，证据最薄。**
- **Q3 的"社区批评与改进提案"覆盖不足。** 本轮只找到一份实证论文（arXiv v1，未经同行评审，且只读了摘要与 §4.3 的定向提取，**没有精确百分比**）。明确提出"至少两个备选 + 不做的选项""决策矩阵""反对意见记录"的批评文献或社区讨论**没有找到**；《Architecture Decision Records in Practice: An Action Research Study》（ECSA 2024）**未读**，它可能是"为什么备选写不出来"的更好来源。
- **机器检查的覆盖不均**：K8s 与 DSH 读了校验源码；Rust、Swift、TC39、EIP、PEP、MCP 的 CI 实现**未读**，因此它们"机器检查什么"一列多为未覆盖或推断。
- **页面类来源多为定向提取**：RFC 2026 与 RFC 7322 未通读（且 RFC 2026 已被后续 BCP 部分更新，如标准轨三级压到两级，本轮**未核对**）；Nygard 原文、adr.github.io、tc39.es/process-document 均为抓取摘要。tc39.es 的流程页**没有版本或日期标记**，只能用源仓库 HEAD 定位。
- **两家公司的内部惯例无法核对**：Anthropic 与 OpenAI 的内部设计文档流程不公开；本文只能观察它们主导的公开产物（MCP SEP、`PLANS.md`）。

## 6. 来源

逐来源笔记（含原文引用、commit 与统计细节）：
[Rust RFC](notes/rust-rfc.md) · [Python PEP](notes/python-pep.md) · [Kubernetes KEP](notes/kubernetes-kep.md) · [Swift Evolution](notes/swift-evolution.md) · [TC39](notes/tc39-stages.md) · [Nix RFC](notes/nix-rfc.md) · [Ethereum EIP](notes/ethereum-eip.md) · [IETF](notes/ietf-rfc.md) · [ADR：Nygard 与 MADR](notes/adr-nygard-madr.md) · [W3C TAG Explainer](notes/w3c-tag-explainer.md) · [MCP SEP](notes/mcp-sep.md) · [Semantic Kernel ADR](notes/semantic-kernel-adr.md) · [DeepSeek Harness Agent Notes](notes/deepseek-harness-agent-notes.md) · [八个 AI 框架横扫](notes/agent-frameworks-survey.md) · [ADR 实证研究](notes/adr-empirical-study.md)

URL、固定 commit / 版本、读取方式与核对日期：[sources.md](sources.md)。
