<!-- 单来源核对笔记：W3C TAG Explainer Explainer。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# W3C TAG：结构化最强的备选方案模板——每个候选各有 Pros / Cons / Reason for rejection

- 来源：`https://w3ctag.github.io/explainer-explainer/`（页面标注 last updated **2026-04-29**；旧地址 `tag.w3.org/explainers/` 现为跳转页）
- 源仓库：`github.com/w3ctag/explainer-explainer`，HEAD `853418960ccfcc11744f5d7b0b2da4d9810a071c`（2026-04-29）
- 读到的文件：`template.md`（163 行，逐行读）；正文 `index.bs` 经页面抓取提取
- 核对日期：2026-09-15
- 相关性：TC39 的 `how-we-work/explainer.md` 把这份指南列为提案作者的前置阅读（见 [tc39-stages](tc39-stages.md)）

## 1. 模板结构（观察）

`template.md` 的小节：

`Authors` → `Participate` → `Table of Contents` → `Introduction` → `User-Facing Problem`（含 `Goals` / `Non-goals`）→ `User research` → `Proposed Approach`（含 `Dependencies on non-stable features`、`Solving [goal N] with this approach`）→ **`Alternatives considered`** → `Accessibility, Internationalization, Privacy, and Security Considerations` → `Stakeholder Feedback / Opposition` → `References & acknowledgements`。

## 2. `Alternatives considered` 的形状（观察，逐字）

小节导语：

```markdown
## Alternatives considered

[This should include as many alternatives as you can,
from high level architectural decisions down to alternative naming choices.
If you capture your alternatives as Architectural Decision Records,
use this section to link to the ADRs.]
```

每个候选的固定骨架（模板给了三个占位候选）：

```markdown
### [Alternative 1]

[Describe an alternative which was considered.
This alternative may have been part of a prior proposal in the same area,
or it may be new.
If you did any research in evaluating this alternative, discuss it here.]

#### Pros

* [List]

#### Cons

* [List]

#### Reason for rejection

[Why do you feel the cons outweigh the pros?]
```

第三个占位候选的 `Reason for rejection` 下写的是**未决**的处理方式：

```markdown
[You may not have decided about some alternatives.
Describe them as open questions here, and adjust the description once you make a decision.]
```

**观察**：这是本轮 15 个来源中唯一同时具备以下四点的模板：

1. 每个候选是一个**独立的子标题**（可枚举、可计数）；
2. 每个候选强制 `Pros` / `Cons` / `Reason for rejection` 三格；
3. 覆盖粒度明确从"高层架构决定"到"命名选择"（`from high level architectural decisions down to alternative naming choices`）；
4. 为"还没决定的候选"留了合法位置（作为 open question 留在原地，定了再改）。

仍然**没有**数量下限（`as many alternatives as you can` 是上不封顶而非下有底），也**没有**强制基线候选。

## 3. 为什么要写备选（观察）

页面正文给出的理由是评审成本，不是决定质量：

> Keep track of and make a note of alternatives which have been considered
>
> Explain what makes them worse for the web than your primary proposal

并指出：写清楚之后评审者不会反复问 "what about [已排除的备选]"；`reviewers and other stakeholders may not have that context` 关于设计决定的上下文。

另有一个独立小节 `Stakeholder Feedback / Opposition`——**观察**：把"谁反对、反对什么"从 alternatives 里分出来单列，是本轮唯一这么做的模板。

## 4. 与本项目骨架的对照（推断）

| 骨架条 | TAG 的对应 | 判断 |
|---|---|---|
| 提案 = 一组决定点，每个决定点是一条轴 | `from high level architectural decisions down to alternative naming choices`（粒度覆盖，但不组织成"决定点"） | 半个先例 |
| 每个候选写：形状、成本、失败模式 | `[描述]` + `Pros` + `Cons` + `Reason for rejection` | **最强先例**，缺"成本"与"证据义务"两格 |
| 否决方公平陈述 | `Pros` 是强制格，必须写出备选的优点 | **有先例**（与 Swift 的 "fair but not neutral" 同向，且更结构化） |
| 决定 = 选择 + 否决理由 + 复议条件 | `Reason for rejection` = 否决理由；未决候选作为 open question 留在原地 | 有先例（复议条件仍缺） |
| ≥ 3 真候选 / 基线候选 | 无下限、无基线 | 无先例 |
| 评审清单 | 无（但 TAG 另有 security/privacy questionnaire，本轮未读） | — |

- **值得引入**：`### 候选` + `#### Pros/Cons/Reason for rejection` 这套嵌套结构。它把「每个候选是否被公平陈述、是否给了否决理由」变成**纯结构问题**：候选数 = `###` 数；每个候选是否完整 = 三个 `####` 是否齐。这是本轮找到的最可机器核对的备选方案形状。
- **值得引入**：把"未决的候选"表达为留在原地的 open question，而不是删掉或假装已决——正对本项目"初审可有未知"的现状。
- **可考虑**：`Stakeholder Feedback / Opposition` 独立成节。本项目当前把评审意见与裁决放在提案 README 的裁决表里（见[工具执行提案](../../../proposals/tool-execution/README.md)），与之同向。

## 5. 局限与未覆盖

- `index.bs`（指南正文）只经页面抓取定向提取，**未逐行读**；`template.md` 已逐行读。
- 未统计实际 W3C/WHATWG explainer 对该模板的兑现率——因此"结构强 ⇒ 实际被填满"这一推断**没有证据支持**，不能当结论。
- 未读 TAG 的 security/privacy self-review questionnaire（仓库 `w3ctag/w3ctag.github.io/security-questionnaire`），它可能是"评审清单"问题的更好来源。
- 未覆盖 TAG design review 的实际决定记录形态（TAG 的 review 结论写在 `w3ctag/design-reviews` 的 issue 里，本轮未读）。
