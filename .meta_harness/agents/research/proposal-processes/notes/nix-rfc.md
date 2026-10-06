<!-- 单来源核对笔记：Nix RFC。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Nix RFC：唯一明确要求「对每个设计决定逐条讨论备选」的上游模板

- 仓库：`github.com/NixOS/rfcs`
- 固定版本：仓库 HEAD `32c871cae67fec997c9af2bf15f4a9e41d885109`（2026-06-04）；`README.md` 最后改动同一 commit；`0000-template.md` 最后改动 `e364d5f0cddc03d164f0d7dfc8d6c4f1616364b7`（2023-06-13）
- 核对日期：2026-09-15

## 1. 模板（观察）

前置元数据把评审组织写进了文件头（与 Rust RFC 的四行元数据不同）：

```
feature / start-date / author /
co-authors: (find a buddy later to help out with the RFC)
shepherd-team: (names, to be nominated and accepted by RFC steering committee)
shepherd-leader: (name to be appointed by RFC steering committee)
related-issues: (will contain links to implementation PRs)
```

小节：`Summary` → `Motivation` → `Detailed design` → `Examples and Interactions` → `Drawbacks` → `Alternatives` → `Prior art` → `Unresolved questions` → `Future work`。

`Alternatives` 原文（四句，第三句是本轮的关键发现）：

> What other designs have been considered? What is the impact of not doing this?
> For each design decision made, discuss possible alternatives and compare them to the chosen solution.
> The reader should be convinced that this is indeed the best possible solution for the problem at hand.

**观察**：`For each design decision made, discuss possible alternatives and compare them to the chosen solution.` 是本轮 15 个来源中唯一把备选方案**绑定到"每个设计决定"这个粒度**的原文，与本项目骨架第 1 条（提案 = 一组决定点，每个决定点是一条轴）最接近。它仍然没有数量要求。

`Detailed design` 有一条少见的写作约束：`Yet, this section should also be terse, avoiding redundancy even at the cost of clarity.`，并把补偿放在 `Examples and Interactions`（`if you feel your detailed design is rudely short, consider making this section longer instead`）。

## 2. 角色与阶段门（观察）

三层角色：

- **RFC Steering Committee**：PR 开出后 **1 周内**从提名中组建 Shepherd Team 并指定 leader；负责合并已接受/已拒绝的 RFC；`selecting the Shepherds unanimously`。
- **Shepherd Team**：3–4 人，由 Steering Committee **一致**指定，从该 RFC 讨论中被提名的社区成员里选。硬约束（原文）：`The author cannot be part of the Shepherd Team. In addition, at most half of the Shepherd Team can be part of the RFC Steering Committee.` —— 负责接受或拒绝这一份 RFC。
- **Shepherd Leader**：确保流程按时推进；原文明确：`The Shepherd Leader has no special responsibility with regard to moving an undecided Shepherd Team to a decision.`

**FCP**（原文）：

> A period of ten calendar days, which will be called by the Shepherd Team after the RFC has received ample discussion and enough of the tradeoffs have been discussed. The Shepherd Team will propose to either accept or reject the RFC after the FCP.

进入 FCP 的条件与 Rust 几乎逐字相同（Nix 的流程明确改编自 Rust），差别在于：

> In order to actually enter FCP, it must be made clear that all members of the RFC Shepherd Team sign off the motion, e.g. through comments, reactions, approving reviews or a meeting protocol.

状态机（README 的 mermaid）额外有一个 Rust 没有的终态：`Discuss --> |Can't Find Shepherds| Closed - Lack of Interest`，且它可以被 `Renewed Interest` 拉回讨论。

关闭的第三种情形（原文）：

> If no consensus can be reached on the RFC but the idea in general is accepted, it gets closed, too. A note is added that is should be proposed again, when the circumstances, that are stopping the discussion to come to another decision, [改变]

**观察**：这是本轮见到的、最接近本项目「复议条件」的上游表述——关闭时写明「什么情况变了可以重提」。

## 3. 决定记录在哪（观察）

同 Rust：合入 `rfcs/` 即接受，关闭即拒绝；理由在 PR 线程。Nix 多一层：Shepherd Team 名单与 leader 写进 RFC 文件头，所以「谁做的决定」是文件自身的内容，不需要去查线程。
