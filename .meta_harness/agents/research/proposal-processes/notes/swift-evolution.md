<!-- 单来源核对笔记：Swift Evolution。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Swift Evolution：备选方案被写成「说服评审者的第一次机会」，并要求在 pitch 阶段更新

- 仓库：`github.com/swiftlang/swift-evolution`
- 固定版本：仓库 HEAD `f91c861dfebbb53f0869e1035d502cbf34855714`（2026-09-15）
- 读到的文件：`process.md`、`proposal-templates/0000-swift-template.md`
- 核对日期：2026-09-15

## 1. 模板中的备选方案（观察）

`0000-swift-template.md` 的顶层小节：

`Summary of changes` → `Motivation` → `Proposed solution` → `Detailed design` → `Source compatibility` → `ABI compatibility` → `Implications on adoption` → `Future directions` → `Alternatives considered` → `Acknowledgments`。

`Alternatives considered` 的指令是本轮所有来源里**写得最长、最有态度**的一段：

> Describe alternative approaches to addressing the same problem.
> This is an important part of most proposal documents.  Reviewers
> are often familiar with other approaches prior to review and may
> have reasons to prefer them.  This section is your first opportunity
> to try to convince them that your approach is the right one, and
> even if you don't fully succeed, you can help set the terms of the
> conversation and make the review a much more productive exchange
> of ideas.
>
> You should be fair about other proposals, but you do not have to
> be neutral; after all, you are specifically proposing something
> else.  Describe any advantages these alternatives might have, but
> also be sure to explain the disadvantages that led you to prefer
> the approach in this proposal.
>
> You should update this section during the pitch phase to discuss
> any particularly interesting alternatives raised by the community.
> You do not need to list every idea raised during the pitch, just
> the ones you think raise points that are worth discussing.  Of course,
> if you decide the alternative is more compelling than what's in
> the current proposal, you should change the main proposal; be sure
> to then discuss your previous proposal in this section and explain
> why the new idea is better.

三条可以直接对照本项目「否决方公平陈述」的规则：**be fair but not neutral**；**必须写出备选的优点**；**换了主方案要把旧方案写进备选并解释为什么新的更好**。

没有数量要求，没有基线候选。`Future directions` 是与「延后」最接近的小节，但它是「未来可能扩展」而非「本轮不做」。

## 2. 阶段门与状态机（观察）

`process.md` 把流程定义为两步：`the creation of a proposal document`（在论坛 pitch 线程里发展）+ `an open review`。

状态（`process.md` §`Proposal states`，附 mermaid 图）：
`Awaiting review` → `Scheduled for review` → `Active review` → { `Returned for revision` | `Rejected` | `Accepted` / `Accepted with revisions` } → （`Previewing`）→ `Implemented (Swift X.Y)`；另有 `Withdrawn`。

硬约束（原文）：

> The proposal cannot be reviewed until an implementation is available…（模板对 `Status` 字段的说明）

> This thread will be kept open for a period of at least ten days, covering at minimum two consecutive weekends.

> If the proposal is revised in a substantially new way that has not been adequately discussed, the revised proposal must then undergo another round of open review.

两条绕过正常评审的口子，都写了适用边界：

- **Summary acceptance**：`generally only appropriate for small adjustments to recently-accepted proposals where the workgroup feels that there is no reasonable objection or alternative to the proposed change.`（注意这里用「没有合理的**备选**」作为跳过评审的判据。）
- **Summary rejection**：`if the workgroup believes that there's no possibility that further development or review of the proposal would lead to it being accepted… The workgroup should clearly communicate its decision and the reasons why.`

## 3. 决定权与「评审不是投票」（观察）

> Ultimately, open review is not a vote.
> The role of evolution reviewers is to provide feedback on the proposal, including arguments for or against it.
> The evolution workgroup will then consider these arguments and decide what is best for the Swift project.
> Neither the raw number of people making arguments on either side, nor the ferocity of their arguments, is a meaningful input to that decision.

还有一条给作者的、与「分歧如何入档」直接相关的指令：

> If, after a reasonable discussion, you find that you simply disagree with them about the design, that's okay… You may find it helpful, however, to write up the disagreement in the proposal document, perhaps as part of the motivation or in the Alternatives Considered section.

角色：**review manager**（由 workgroup 指派，作者不填该字段）负责开评审线程、更新状态、代为转达私下反馈。作者可以私下把意见发给 review manager，由他代表到 workgroup。

## 4. 版本与取代关系（观察）

模板头字段里有三个专为「同一决定的演化」设的字段：

- `Previous Proposal`：`Supersedes SE-1234` / `Extracted from SE-01234`，要求附一句关系说明。
- `Previous Revision`：链接到**上一次被评审过的那个 commit 的文件**（原文：`It links to the previously reviewed revision.`）。
- `Review`：按时间顺序列出全部讨论线程，且链接名是封闭词表——`pitch` `review` `revision` `acceptance` `rejection`，多于一条时写序数（`first pitch` `second review`）。

**观察**：`Review` 字段是本轮见到的、唯一把「决定过程的每一步各留一个可定位链接」做成封闭词表的形态。

另有 `commonly_proposed.md`（LSG 维护的「常被提出且已被否决」清单），作用与 PEP 的 `Rejected Ideas` 同向，但它是**跨提案的**、项目级的。
