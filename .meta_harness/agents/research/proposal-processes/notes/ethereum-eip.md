<!-- 单来源核对笔记：Ethereum EIP。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Ethereum EIP：没有 Alternatives 小节；`Rationale` 的模板占位符写着 `TBD` 且被明文允许

- 仓库：`github.com/ethereum/EIPs`
- 固定版本：仓库 HEAD `7c073a9d83c6e39f4ee14a71acbb513e2b987c12`（2026-09-14）；`EIPS/eip-1.md` 最后改动 `d7f6f26dd7b183e3f58143b966fc61ee152b062b`（2026-08-10），该 EIP 自身 `status: Living`，`created: 2015-10-27`
- 读到的文件：`EIPS/eip-1.md`、`eip-template.md`
- 核对日期：2026-09-15

## 1. 必需小节（观察）

EIP-1 §`What belongs in a successful EIP?`：Preamble、Abstract、Motivation *(optional)*、Specification、**Rationale**、Backwards Compatibility *(optional)*、Test Cases *(optional)*、Reference Implementation *(optional)*、**Security Considerations**、Copyright Waiver。

**没有 `Alternatives` 小节**。备选方案被折进 `Rationale`：

> Rationale - The rationale fleshes out the specification by describing what motivated the design and why particular design decisions were made. It should describe alternate designs that were considered and related work, e.g., how the feature is supported in other languages. The rationale should discuss important objections or concerns raised during the discussion around the EIP.

这段与 PEP 1 第 5 项措辞几乎一致——EIP-1 末尾自述谱系：`This document was derived heavily from Bitcoin's BIP-0001… which in turn was derived from Python's PEP-0001.`

## 2. 强制性的分布（观察，Q3 的直接证据）

对比两条措辞：

- Security Considerations（原文）：`EIP submissions missing the "Security Considerations" section will be rejected. An EIP cannot proceed to status "Final" without a Security Considerations discussion deemed sufficient by the reviewers.`
- Backwards Compatibility（原文）：`EIP submissions without a sufficient backwards compatibility treatise may be rejected outright.`
- Rationale：**没有任何拒绝条款**。

更直接的证据在 `eip-template.md` 里。`Rationale` 小节的模板注释与正文内容原样如下：

```markdown
## Rationale

<!--
  The rationale fleshes out the specification by describing what motivated the design and why particular design decisions were made. It should describe alternate designs that were considered and related work, e.g. how the feature is supported in other languages.

  The current placeholder is acceptable for a draft.

  TODO: Remove this comment before submitting
-->

TBD
```

**观察**：`The current placeholder is acceptable for a draft.` + 正文占位符 `TBD`。同样的手法用在 `Backwards Compatibility`（占位符 `No backward compatibility issues found.`）与 `Security Considerations`（占位符 `Needs discussion.`）。这就是「Alternatives considered 形同虚设」在上游被**写进模板**的一个实例：流程明确允许提案带着「TBD 的备选讨论」进入 Draft 状态。

## 3. 状态机（观察）

`Idea`（不入库）→ `Draft` → `Review` → `Last Call`（作者开 PR 附 `last-call-deadline`，通常 14 天）→ `Final`；旁支 `Stagnant`（Draft/Review/Last Call 停滞 6 个月自动进入，可复活）、`Withdrawn`（**终态，且 EIP 号作废**：`This state has finality and can no longer be resurrected using this EIP number. If the idea is pursued at a later date, it is considered a new proposal.`）、`Living`（EIP-1 自身）。

两条与「记录不可原地覆盖」相关的规则（观察）：

> **Final** - … A Final EIP exists in a state of finality and should only be updated to correct errata and add non-normative clarifications.

> A PR moving an EIP from Last Call to Final SHOULD contain no changes other than the status update. Any content or editorial proposed change SHOULD be separate from this status-updating PR and committed prior to it.

以及一条引用纪律，与本项目「引用要能定位」同构（观察）：

> Although not recommended by WHATWG, EIPs must anchor to a particular commit so that future readers can refer to the exact version of the living standard that existed at the time the EIP was finalized.

> Permitted IETF specification URLs MUST anchor to a specification with an assigned RFC number (meaning cannot reference internet drafts)

## 4. 谁做决定（观察）

EIP editors **明确不做价值判断**：

> - Read the EIP to check if it is ready: sound and complete. The ideas must make technical sense, even if they don't seem likely to get to final status.

实质决定权在 Ethereum Core Developers（AllCoreDevs 电话会）与客户端团队：

> For Core EIPs, given that they require client implementations to be considered **Final**… you will need to either provide an implementation for clients or convince clients to implement your EIP.

> Negative community feedback will be taken into consideration and may prevent your EIP from moving past the Draft stage.

## 5. 与本项目骨架的对照（推断）

- **反面教材**：EIP 是「有 Rationale 小节但强制力为零」的最清晰样本。可对照的规律：**同一份模板里，写了拒绝条款的小节（Security Considerations）被兑现，没写拒绝条款的小节（Rationale）被 `TBD` 占位。** 本项目若要求「每个决定点 ≥ 3 真候选」，光写进模板不够，必须配一个会失败的检查或一个会拒绝的评审动作。
- **值得引入**：`Withdrawn` 使编号作废、重提算新提案——这条给「复议」划了清楚的界：撤回不是暂停。本项目对「提案 → 决定」的取代关系已有[版本规范](../../../maintenance/versioning.md)，可对照这条的严格度。
- **值得引入**：状态迁移 PR 只改状态、内容变更必须先行独立提交——这使「决定的对象是哪一版正文」可机器定位。
- **不适合**：`Stagnant`（6 个月自动停滞）这类基于日历的自动降级，对单作者项目无意义。

## 6. 局限与未覆盖

- 未统计已发布 EIP 中 `Rationale` 的实际填充率（本轮只对 MCP SEP 与 Semantic Kernel ADR 做了统计）；因此「`TBD` 占位在实践中有多普遍」**未覆盖**。
- 未读 EIP-5069（EIP editor 的选任）与 `CONTRIBUTING.md`。
- 未覆盖 ERC（应用层）与 Core EIP 在流程上的差异细节，只读到「Core EIP 需要客户端实现」这一条。
- 未覆盖 Ethereum 社区对 AI 撰写 EIP 的政策。
