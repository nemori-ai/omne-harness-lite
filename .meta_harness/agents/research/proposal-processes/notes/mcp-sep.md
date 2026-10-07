<!-- 单来源核对笔记：Model Context Protocol SEP。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# MCP SEP：AI 生态里最完整的提案流程——备选是可选小节，但原型与一致性测试是硬门

- 仓库：`github.com/modelcontextprotocol/modelcontextprotocol`，HEAD `cd0623765886c8cc282e3e5e1a03ab7469055fab`（2026-09-14）
- 流程正文：`https://modelcontextprotocol.io/community/sep-guidelines`（2026-09-15 抓取）；仓库内对应的流程 SEP 是 `seps/1850-pr-based-sep-workflow.md`（Status: Final，Created 2025-11-20，Accepted 2025-11-28，记有 `8 Yes, 0 No, 0 Absent per vote in Discord`）
- 统计对象：`seps/` 目录下 44 个 `.md`，其中 `README.md` 与 `TEMPLATE.md` 除外，实际 SEP **42 份**（全部 `Status: Final`）
- 核对日期：2026-09-15

## 1. 流程与状态（观察）

`Idea` → `Awaiting Sponsor`（最多 6 个月）→ `Draft`（有 sponsor，非正式评审）→ `In-Review`（正式评审，Core Maintainer 每两周开会）→ `Accepted` / `Rejected` → `Final`（参考实现完成 + 一致性测试合入）。旁支：`Withdrawn`、`Dormant`（6 个月找不到 sponsor；明确 `dormant` is not the same as `rejected`，可复活）、`Superseded`。

编号即 PR 号；文件位置 `seps/{PR号}-{slug}.md` 是唯一事实源。

**接受判据（原文，三条）**：

> * A prototype implementation demonstrating the proposal
> * Clear benefit to the MCP ecosystem
> * Community support and consensus

**原型不是纸面（原文）**：

> **Not sufficient:**
> * Pseudocode alone
> * A design document without code
> * "Trust me, it works" - reviewers need to see it

**进入 Final 的门（原文）**：

> For **Standards Track SEPs** that introduce or modify observable protocol behavior, a conformance scenario must be merged into the conformance repository before the SEP can reach `Final` status.
>
> * A structured traceability file (`sep-NNNN.yaml`) mapping each MUST/MUST NOT and SHOULD/SHOULD NOT in the SEP's Specification section to either a check ID or a documented exclusion (with a tracking issue if it's a framework gap)

**观察**：这是本轮见到的、唯一把「规范里每一条规范性措辞 ↔ 一个检查 ID 或一条记录在案的豁免」做成机器可读文件的门。它与本项目「条款覆盖 / 验证范围」的做法同构。

状态由 **sponsor** 更新，不由作者更新（`Authors should request status changes through their sponsor rather than modifying the status field themselves.`）；markdown 里的 status 是 canonical，PR label 是索引用的副本。

`Final` 后的规则（原文）：`Final SEPs are preserved as historical records of the design as accepted. They are not updated after finalization. If the specification changes after a SEP reaches Final status, the current specification is authoritative.`

拒绝之后（原文四条）：修改后重提、去 Discord 问清理由、**提交一份竞争性 SEP**、或等时机。转让所有权的"坏理由"里明确写着 `You disagree with the direction (submit a competing SEP instead)`。

## 2. 模板里备选方案的地位（观察）

`seps/TEMPLATE.md` 的必需小节：`Abstract` → `Motivation` → `Specification` → `Rationale` → `Backward Compatibility` → `Security Implications` → `Reference Implementation`。

`Rationale` 的指令包含备选：

> - Describe alternate designs that were considered
> - Explain why the proposed approach was chosen
> - Reference related work or prior art
> - Document important objections or concerns raised during discussion
> - Provide evidence of consensus within the community

而 `Alternatives Considered` 出现在模板末尾的 **`## Additional Optional Sections`** 里：

> ### Alternatives Considered
>
> Detailed discussion of alternative approaches that were rejected and why.

模板顶部还有一句总的放宽：`You may adapt sections based on the specific needs of your proposal.`

## 3. 实际填充率（观察，本轮统计）

对 42 份 Final SEP 的机械统计（去掉代码围栏后按标题匹配）：

| 指标 | 数 | 占比 |
|---|---|---|
| 有 `## Rationale` | 37 | 88% |
| 有任意层级的 `Alternative*` 标题（`##`–`####`） | 12 | 29% |
| 其中标题在 `##` 层级 | 3 | 7% |
| `Rationale` 正文里出现 alternativ/rejected/instead of/why not/considered 之一 | 21 | 50% |
| **既无 Alternatives 标题、Rationale 里也无备选语汇** | **20** | **48%** |
| 既无 `Rationale` 也无 `Alternative*` 标题 | 4 | 10% |

`Rationale` 字数：最少 24 词，中位数 214 词，最多 2767 词；4 份少于 60 词。

四份连 `Rationale` 都没有的 Final SEP：`990-enable-enterprise-idp-policy-controls…`、`1046-support-oauth-client-credentials-flow…`、`1303-input-validation-errors-as-tool-execution-errors`、`1577--sampling-with-tools`。其中 `990` 的小节结构完全不是 SEP 模板，而是 PR 描述的形状：`Abstract` / `How Has This Been Tested?` / `Breaking Changes` / `Additional Context`。

**观察**：近半数已定稿（Final）的 SEP 里找不到任何"考虑过别的方案"的痕迹，尽管 `Rationale` 是模板的必需小节且其指令第一条就是描述备选。

**推断**：MCP 的门守的是"这个设计能不能跑通、能不能被测出来"，不是"这个设计是不是候选集里最好的"。备选缺失不影响一份 SEP 进入 Final，因为流程里没有任何一步会因此失败。

## 4. AI 撰写政策（观察）

`AI_POLICY.md`（与 TC39 的禁止相反，MCP 是**必须披露**）：

> If you are using **any kind of AI assistance** to contribute to Model Context Protocol, it must be disclosed in the pull request or issue.

> Failure to disclose this is first and foremost rude to the human operators on the other end of the pull request, but it also makes it difficult to determine how much scrutiny to apply to the contribution.

> In a perfect world, AI assistance would produce equal or higher quality work than any human. That isn't the world we live in today, and in most cases where human supervision or expertise is not in the loop, it's generating code or changes that cannot be reasonably maintained or evolved.

**观察**：披露的**目的被写明**——决定施加多少审查强度。这与"禁止"（TC39）和"必须有人类完全理解"（Letta、AG2，见 [agent-frameworks-survey](agent-frameworks-survey.md)）构成 AI 生态的三种态度。
