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
