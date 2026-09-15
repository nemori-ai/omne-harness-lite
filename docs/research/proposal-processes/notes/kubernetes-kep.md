<!-- 单来源核对笔记：Kubernetes KEP。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Kubernetes KEP：备选最弱、阶段门最强、元数据被机器校验

- 仓库：`github.com/kubernetes/enhancements`
- 固定版本：仓库 HEAD `2f57ef9064946203f5b0e0f012a56a29159c85b3`（2026-09-14）
- 读到的文件：`keps/README.md`、`keps/NNNN-kep-template/README.md`（830 行）、`keps/NNNN-kep-template/kep.yaml`、`hack/verify-kep-metadata.sh`、`api/proposal.go`
- 核对日期：2026-09-15

## 1. 备选方案在模板里的位置（观察）

`Alternatives` 是模板的**倒数第二个**小节，紧跟在 `Drawbacks` 之后、`Infrastructure Needed (Optional)` 之前。全部指令是三句话：

> ## Alternatives
>
> <!--
> What other approaches did you consider, and why did you rule them out? These do
> not need to be as detailed as the proposal, but should include enough
> information to express the idea and why it was not acceptable.
> -->

`Drawbacks` 更短：`Why should this KEP _not_ be implemented?`

对照：同一份模板里 `Production Readiness Review Questionnaire`（§453–796，约 340 行）逐条问 feature gate、回滚、监控指标、依赖、扩展性、故障排查。**观察**：模板给「上生产的证据」的篇幅是给「备选方案」的百倍量级。

模板开头的作者指引还明确鼓励先合入再补细节：

> - [ ] **Merge early and iterate.**
>   Avoid getting hung up on specific details and instead aim to get the goals of
>   the KEP clarified and merged quickly.

## 2. 阶段门与退出条件（观察）

两套正交的阶段：

- **KEP 状态**（`kep.yaml` 的 `status`）：`provisional | implementable | implemented | deferred | rejected | withdrawn | replaced`。
- **成熟度**（`stage`）：`alpha | beta | stable`，配 `milestone.alpha/beta/stable`。

硬门（模板 §453 原文）：

> The production readiness review questionnaire must be completed and approved
> for the KEP to move to `implementable` status and be included in the release.

> The KEP must have a approver from the
> [`prod-readiness-approvers`](http://git.k8s.io/enhancements/OWNERS_ALIASES) team.

另一条（模板 §1 注释块原文）：

> **Note:** Any PRs to move a KEP to `implementable`, or significant changes once
> it is marked `implementable`, must be approved by each of the KEP approvers.

以及「合入 ≠ 批准」：

> Just because a KEP is merged does not mean it is complete or approved. Any KEP
> marked as `provisional` is a working document and subject to change.

模板给未决争议一个**行内标记**，而不是一个单独的小节：

```
<<[UNRESOLVED optional short context or usernames ]>>
Stuff that is being argued.
<<[/UNRESOLVED]>>
```

## 3. 决定记录在哪、由谁做（观察）

- 载体：KEP 目录自身（`keps/<sig>/NNNN-title/README.md` + `kep.yaml`），一份 KEP 覆盖一个 feature 的整个生命周期（`One KEP corresponds to one "feature" or "enhancement" for its whole lifecycle.`）。
- 决定者：owning SIG 的 `approvers`（`kep.yaml` 显式字段）+ PRR approver；跨切面 KEP 归 SIG Architecture。
- 记录方式：`status` 字段 + `Implementation History` 小节；`replaces` / `see-also` 字段做取代与关联。
- `keps/README.md` 自述其目标之一：`A clear process with approvers and reviewers for making decisions. This will lead to more structured decisions that stick as there is a discoverable record around the decisions.`
- 自述谱系：`We are inspired by IETF RFCs, Python PEPs and Rust RFCs.`

## 4. 机器校验（观察）

`hack/` 下有 `verify-kep-metadata.sh`、`verify-toc.sh`、`verify-toc-vs-template.sh`、`verify-spelling.sh`；校验逻辑在 `api/proposal.go`。实际被强制的是：

| 被校验的东西 | 规则 |
|---|---|
| `title`、`kep-number`、`authors`、`owning-sig`、`approvers`、`status` | `validate:"required"` 结构体标签 |
| `stage` | 必须属于 `ValidStages` 枚举 |
| `status` | 必须属于 `ValidStatuses` 枚举 |
| `owning-sig` / `participating-sigs` | 必须是真实存在的 SIG 名 |
| 跨字段 | `status:implemented implies stage:stable`，否则报错 |
| 目录结构 | TOC 与模板结构比对（`verify-toc-vs-template.sh`） |

**观察**：没有任何一条校验涉及 `Alternatives`、`Drawbacks` 的存在性或内容。被机器守住的是**身份、所有权、状态一致性**。

`keps/README.md` 的 FAQ 把「presubmit checks for KEPs around metadata format and markdown validity」列为 KEP 流程自身「毕业出 beta」的条件之一——即元数据校验本身是被当作流程成熟度指标的。

## 5. 与本项目骨架的对照（推断）

- **值得引入**：`status` 与 `stage` 分离、跨字段一致性校验（`implemented ⇒ stable`）、approver 名单写进元数据而不是靠记忆——这些是本项目「决定 = 选择 + 范围 + 接受依据」可以直接机器化的形状。
- **值得引入**：PRR 那种「把证据义务写成问卷、并把问卷的完成作为状态迁移的前提」的做法，与本项目「证据两级」（候选阶段证能否成立 / 决定后证实现是否符合）同向，但 K8s 只有后一级。
- **不适合**：`Merge early and iterate` + `Alternatives` 放在文末三句话——本项目的提案骨架把候选比较放在第一位，与 K8s 的重心正好相反；K8s 的重心适合「已经确定要做、只是要保证能上生产」的工程，不适合「还要选形状」的设计。

## 6. 局限与未覆盖

- 未读 `KEP-0000`（KEP 流程自身的 KEP）与 `keps/sig-architecture/1194-prod-readiness`，因此 PRR 的完整规则只从模板注释块观察。
- 未统计实际 KEP 中 `Alternatives` 小节的填充率（本轮只做了 Semantic Kernel 与 MCP 的统计）。
- 未读 `pkg/kepval`、`test/metadata_test.go` 的完整断言，`api/proposal.go` 之外可能还有校验。
- 未覆盖 enhancement freeze 的日历门（release 周期里的时间截止），只观察到 `latest-milestone` 字段的存在。
