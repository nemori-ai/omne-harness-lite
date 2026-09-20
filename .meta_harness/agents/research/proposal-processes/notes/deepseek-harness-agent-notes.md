<!-- 单来源核对笔记：DeepSeek Harness 的 Agent Notes。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# DeepSeek Harness：把「Alternatives considered」做成 CI 强制项，并明写「备选是被记录的，不是被发明的」

- 仓库：`github.com/deepseek-ai/deepseek-harness`，HEAD `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`（2026-09-15）
- 读到的文件：`.agents/notes/README.md`（125 行，逐行读）、`scripts/verify-agent-note-format.ts`（94 行，逐行读）、`docs/AGENTS.md`；另抽样 45 份 Agent Note 正文
- 核对日期：2026-09-15
- 本项目关系：DSH 是本项目的复用来源之一，但[上游约定不自动成为本项目约定](../../../../AGENTS.md)。

## 1. Agent Note 是什么（观察）

> An **Agent Note** records a decision or proposal that affects this codebase — the *why* and *what we gave up*, the parts code and docs can't carry.

两条轴全部编码在**路径**里：`{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`。

- **lifecycle**（= 状态，文件随状态在文件夹间移动）：`proposed/`（评审过但未实现）、`implemented/`（已发布，且**与实际发布保持一致**）、`rejected/`（考虑过并否决）、另有冻结的 `archived/`。
- **class**（= 决定的种类，封闭集，由 `scripts/agent-note-tree.ts` 定义，分类门拒绝其他文件夹）：`feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing`。（原文注明 `refactor` 被故意排除，因为它与 `simplification` 重叠。）

规模（该 commit，按 git tree 统计，去掉 `.zh.md` 与 README/AGENTS）：`proposed` 27、`implemented` 356、`rejected` 14、`archived` 629，合计 1026 份。

强制写作规则（原文）：

> Every non-trivial change MUST add or update at least one Agent Note in the same PR. A change is non-trivial when it alters behavior, architecture, a contract shared across files or packages, process or tooling, testing strategy, an on-disk, wire, or configuration format, or another decision a maintainer may reasonably revisit.

## 2. 备选方案的规则（观察，逐字）

> ### Alternatives considered — mandatory
>
> Every Agent Note carries an `## Alternatives considered` section: each genuine alternative and why it lost, one bold-led paragraph per alternative or a `### Why not <X>?` subsection per contested one. A decision recorded without what it beat invites re-litigation — the failure Agent Notes exist to prevent.
>
> Alternatives are recorded, never invented. An Agent Note dated before 2026-07-05 whose alternatives are not reconstructible from the record carries this exact comment in place of the section, which the gate accepts for pre-format files only:
>
> ```markdown
> <!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
> ```

三点值得单独记：

1. **强制**，但**不定数量**——"each genuine alternative"，没有 ≥N。
2. **`Alternatives are recorded, never invented.`** —— 明确禁止为了填满字段而构造候选。这是本轮唯一一条正面处理"形式化占位"风险的上游规则。
3. 历史遗留有**唯一合法的逃生口**，而且它是一条 CI 认得的精确注释，不是"可以留空"——即"无法重建备选"这件事本身被记录为一个可查询的事实。

## 3. 机器强制的范围（观察，读 `verify-agent-note-format.ts`）

该脚本（属于 `doc-sync` 检查）实际强制：

| 规则 | 实现 |
|---|---|
| 前三行必须是 `# Agent Note: <title>` / 空行 / `Status: <status>` | 逐行比对 |
| Status 语法按 lifecycle 文件夹分别校验，且必须与文件夹一致 | `proposed: /^Status: proposed$/`、`implemented: /^Status: implemented$/`、`rejected: /^Status: rejected — .+$/` |
| 每个 lifecycle 的必需 `##` 标题 | `proposed: ['## Proposal','## Acceptance criteria','## Risks']`；`implemented: ['## Decision','## Consequences']`；`rejected: ['## Proposal']`；外加所有 lifecycle 共有的 `## Problem` 开篇 |
| `implemented/` 里禁用的标题 | `/^## (?:Proposal\b\|Plan\b\|Migration plan\b\|Acceptance criteria\b)/i` |
| `## Alternatives considered` 存在性 | 必须有该标题**或**那条精确的 grandfather 注释；两者同时出现也报错 |
| 围栏内的格式记号不算文档结构 | 脚本显式剔除 fenced 示例 |

**观察**：`rejected` 状态是三种状态里**唯一带内容的**——`Status: rejected — <why, in one line>`，正则要求破折号后必须非空。README 给的理由：`The rejection reason is the one status with content, because a rejected Agent Note's verdict is the fact readers come for.`

**观察**：跨引用被要求成可机器核对的形式——`Cross-references between Agent Notes use relative markdown links … never bare prose or numbers — so they are mechanically checkable and survive moves between folders.`（本项目的 `make docs-check` 已校验 Markdown 链接与锚点，形态同向。）

另有配套的 `verify-archived-agent-notes.ts`，强制封闭 class 树、完整的英/中/sidecar 三件套、归档元数据、sidecar 哈希与**append-only 的冻结内容 manifest**。

## 4. 实际填充率（观察，本轮抽样 45 份）

从 `proposed`/`implemented`/`rejected` 三个 lifecycle 中随机抽 45 份（42 implemented、2 proposed、1 rejected）逐份下载并统计 `## Alternatives considered` 小节：

| 指标 | 结果 |
|---|---|
| 有该小节 | **45 / 45（100%）** |
| 用 grandfather 注释替代 | 0 |
| 小节字数 | 最少 29，中位数 **147**，最多 556 |
| 少于 40 词（约一两句话） | **1 / 45** |

最短的一份（`implemented/architecture/2026-06-11-event-sourced-sessions.md`，29 词）仍是一个完整论证：

> **A mutable message array with events fired as notifications** — simpler, but state and log can diverge; with event-sourcing the log IS the state, so divergence is structurally impossible.

较长的一份（`implemented/architecture/2026-07-05-reconstructable-requests.md`）列了 **8 个** bold-led 候选，每个带形状描述 + 否决理由，例如：

> - **Detect-and-report** (compare consecutive requests, warn on divergence): catches violations after the fact; a violating request is still constructible and ships. Rejected for interface-level unrepresentability.

**对照**：同一时期的 Semantic Kernel 是 55% 有标题、24% 枚举 ≥3 选项；MCP 是 29% 有 Alternatives 标题。DSH 是抽样 100% 有、中位 147 词。三者的差别不在模板措辞，在**有没有一个会失败的 CI 门**。

## 5. 生命周期迁移的强制重写（观察）

> Moving a file between lifecycle folders means updating the `Status:` line and re-satisfying that folder's skeleton in the same change — the gate fails the move otherwise. Concretely, `proposed/` → `implemented/` rewrites `## Proposal` into a present-tense `## Decision`, folds `## Acceptance criteria` and `## Risks` into `## Consequences` … and drops plans in favor of what shipped.

> `proposed/` → `rejected/` only adds the reason to the `Status:` line and freezes the file.

**观察**：这解决了本项目已经遇到的"新头旧身"问题——不是靠人记得改，是**门不让过**。

删除/合并的规则也写得很硬（原文摘）：`Before deletion, the owner must preserve every unique rationale, alternative, consequence, required verification, and named coverage gap; repair every inbound link… Consolidation must not rewrite the old file into its opposite or rely on git history as the only copy of rationale.`

## 6. 与本项目骨架的对照（推断）

| 骨架条 | DSH 的对应 | 判断 |
|---|---|---|
| 每个决定点 ≥ 3 真候选 | 强制小节，**不定数量** | 无先例支持数量下限 |
| 「真」候选，不是同形状调参 | `each genuine alternative`；`Alternatives are recorded, never invented` | **有先例**，且是最相关的一条 |
| 基线候选（不做 / 最小改动） | 无 | 无先例 |
| 决定 = 选择 + 否决理由 + 复议条件 | `Status: rejected — <why>` 强制；`## Consequences` 记"代价与买到了什么"；归档判据里提到 `reintroduction condition` | 大部分有先例 |
| 评审清单 | 无成文 checklist，替代物是 CI 门 + `slop checklist`（在 `docs/AGENTS.md`） | 形态不同 |
| 每个决定点的 Cordis 投影 | 无（DSH 不做这件事） | 本项目独有 |

- **值得引入**：`Alternatives are recorded, never invented` + 精确的 grandfather 注释。这是唯一一条同时管住"缺失"和"编造"的规则，并且两者都可机器核对（有没有标题 / 有没有那条注释）。
- **值得引入**：lifecycle 文件夹 ↔ Status 行 ↔ 必需标题骨架三者互相交叉校验，迁移时强制重写。
- **值得引入**：跨引用必须是相对 markdown 链接（本项目的 `make docs-check` 已经校验链接与锚点，形态一致）。
- **需注意的差异**：DSH 的 Agent Note 是**每个非平凡变更一份**的高频记录，颗粒度接近"一次提交的决定"；本项目的 proposal 是"一组决定点"的长期正文，颗粒度更大。直接照搬 DSH 的骨架（`Problem/Decision/Alternatives/Consequences`）会把本项目的多决定点提案压成单决定点。

## 7. 局限与未覆盖

- 45 份是随机抽样（`shuf` 固定随机源），不是全量 397 份（proposed+implemented+rejected）的普查；字数中位数有抽样误差。
- "每个候选"的计数用了 bold-led 段落 / `###` 子标题的启发式，不可靠；本笔记只引用**字数**与**存在性**两个指标作为结论依据。
- 未读 `scripts/agent-note-tree.ts`（分类门）与 `verify-archived-agent-notes.ts` 的实现，只读了 README 对它们的描述。
- 未读 `docs/AGENTS.md` 里被引用的 "slop checklist" 正文。
- 未覆盖 `archived/` 的 629 份（它们保留封存时的格式，不受当前 gate 约束）。
- 未覆盖 DSH 内部**谁**批准一份 `proposed/` → `implemented/` 的迁移；README 只规定格式，不规定评审权。
