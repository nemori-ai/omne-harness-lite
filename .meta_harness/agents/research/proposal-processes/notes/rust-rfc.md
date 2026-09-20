<!-- 单来源核对笔记：Rust RFC。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Rust RFC：模板问句化的「Rationale and alternatives」，决定权在 sub-team

- 仓库：`github.com/rust-lang/rfcs`
- 固定版本：仓库 HEAD `51783df9a76c355de7ceebeae101cba47f8ca463`（2026-09-10）；`README.md` 最后一次改动 `895324ee01f0c579ae1de46ddddd55967aff6c5e`（2025-12-11）；`0000-template.md` 最后一次改动 `f17e8623ee2e2854570dcdb936a9f4ab08c0fcd4`（2025-11-29）
- 核对日期：2026-09-15（通过 GitHub contents API 读原文，未克隆）

## 1. 模板结构（观察）

`0000-template.md` 的顶层小节，顺序固定：

`Summary` → `Motivation` → `Guide-level explanation` → `Reference-level explanation` → `Drawbacks` → `Rationale and alternatives` → `Prior art` → `Unresolved questions` → `Future possibilities`。

前置元数据是四行：`Feature Name`、`Start Date`、`RFC PR`、`Rust Issue`。没有 status 字段——状态由「文件是否已合入 `text/`」表达。

备选方案的原文只有四个问句，没有数量要求、没有基线候选的强制项：

> ## Rationale and alternatives
> - Why is this design the best in the space of possible designs?
> - What other designs have been considered and what is the rationale for not choosing them?
> - What is the impact of not doing this?
> - If this is a language proposal, could this be done in a library or macro instead? …

「不做的代价」在这里是第三个问句（`What is the impact of not doing this?`），不是一个必须单独立项的候选。`Drawbacks` 是独立小节，只有一句指令：`Why should we *not* do this?`

`Future possibilities` 末尾有一条反滥用规则（观察）：

> Note that having something written down in the future-possibilities section is not a reason to accept the current or a future RFC; such notes should be in the section on motivation or rationale in this or subsequent RFCs.

## 2. 流程与阶段门（观察）

`README.md` 的 `What the process is` 给出的步骤：fork → 复制模板到 `text/0000-my-feature.md` → 提 PR → 用 PR 号重命名 → 打 sub-team 标签 → 讨论 → 某位 sub-team 成员发起 **motion for final comment period (FCP)** 并给出 disposition（`merge`/`close`/`postpone`）→ FCP 十个日历日 → 合入或关闭。

关键约束（原文）：

> Fill in the RFC. Put care into the details: RFCs that do not present convincing motivation, demonstrate lack of understanding of the design's impact, or are disingenuous about the drawbacks or alternatives tend to be poorly-received.

> Before actually entering FCP, *all* members of the subteam must sign off; this is often the point at which many subteam members first review the RFC in full depth.

> The FCP lasts ten calendar days, so that it is open for at least 5 business days.

FCP 进入条件是一个判断而非清单：

> This step is taken when enough of the tradeoffs have been discussed that the subteam is in a position to make a decision. That does not require consensus amongst all participants in the RFC thread (which is usually impossible). However, the argument supporting the disposition on the RFC needs to have already been clearly articulated, and there should not be a strong consensus *against* that position outside of the subteam.

长讨论的 RFC 另有一条惯例：

> For RFCs with lengthy discussion, the motion to FCP is usually preceded by a *summary comment* trying to lay out the current state of the discussion and major tradeoffs/points of disagreement.

## 3. 决定记录在哪、由谁做（观察）

- **决定的载体就是合并本身**：合入 `text/` 即 active，关闭即拒绝。没有独立的「决定文件」。
- **决定者**：相关 sub-team（`README.md` 的 `A sub-team makes final decisions about RFCs after the benefits and drawbacks are well understood.`）。
- **理由的落点**：不在 RFC 正文，而在 PR 评论线程——`if the reasoning is not clear from the discussion in thread, the sub-team will add a comment describing the rationale for the decision.`
- **三态处置**：`merge` / `close` / `postpone`。`postponed` 是被关闭但保留复议可能的一类，且已通过一轮非正式筛（原文："do we think we would ever possibly consider making this change… When the answer to the latter question is 'no', then the appropriate response is to close the RFC, not postpone it."）。没有正式的复议流程：`We don't have any formal process for that, you should ask members of the relevant sub-team.`
- **接受 ≠ 实现**：`Being "active" is not a rubber stamp… implies nothing about what priority is assigned to its implementation`。

另有一条与「记录的可追溯性」直接相关的操作纪律（观察）：

> **Specifically, do not squash or rebase commits after they are visible on the pull request.**

## 4. 评审清单看什么（观察 + 推断）

仓库没有成文的评审 checklist。README 里可提取的隐含判据只有四条：动机是否有说服力、是否理解设计影响、drawbacks 与 alternatives 是否**诚实**（`disingenuous` 一词是原文）、tradeoffs 是否已经充分讨论到可以做决定。

**推断**：Rust 把「备选方案的质量」交给社区对抗式讨论，而不是交给模板字段——模板只提供问句，是否被认真回答由 sub-team 在 FCP 前的全员 sign-off 里判断。这是一套依赖人类隐性共识的机制，没有任何自动检查。

## 5. 与本项目骨架的对照（推断）

| 本项目骨架条 | Rust 的对应 | 差异 |
|---|---|---|
| 每个决定点 ≥ 3 真候选 | 无数量要求，一个 `Rationale and alternatives` 小节覆盖整份 RFC | Rust 不把 RFC 分解为「决定点」，备选是整体层面的 |
| 必须含基线候选（不做 / 最小改动） | `What is the impact of not doing this?` 是问句，非必填候选 | 弱一档 |
| 决定 = 选择 + 否决理由 + 复议条件 | 否决理由在线程评论里；复议条件只有 `postponed` 标签，无成文条件 | 本项目要求更强 |
| 评审清单 | 无成文 checklist | 本项目独有 |
| 阶段门 | FCP（十天 + 全员 sign-off）是唯一的门 | Rust 的门是**时间 + 人**，不是证据 |

## 6. 局限与未覆盖

- 只读了 `README.md` 与 `0000-template.md` 两份文件，未统计已合入 RFC 中 `Rationale and alternatives` 的实际填充率（与本轮对 Semantic Kernel / MCP 做的统计不同，这里没有量化证据）。
- 未读 sub-team 各自的补充指南（`Sub-team specific guidelines` 指向 rust-lang 各团队页），其中可能有更具体的要求。
- 未核对 `rfcbot` 的实现（FCP 的 sign-off 计票机器人），因此「全员 sign-off 是否有自动检查」未覆盖。
- 未覆盖 Rust 的 AI 撰写政策（本轮未在该仓库找到 `AI_POLICY.md`，但未穷举 `.github/` 与 rust-lang 的其他治理仓库）。
