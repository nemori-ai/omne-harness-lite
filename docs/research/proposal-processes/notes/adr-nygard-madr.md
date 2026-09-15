<!-- 单来源核对笔记：ADR（Nygard 原型与 MADR）。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# ADR：Nygard 原型里没有备选；MADR 把 `Considered Options` 提为必需，但不定数量、pros/cons 仍可选

- Nygard 原文：《Documenting Architecture Decisions》，2011-11-15，`cognitect.com/blog/2011/11/15/documenting-architecture-decisions`（2026-09-15 抓取）
- MADR：`github.com/adr/madr`，仓库 HEAD `ba75bb1b20d42af5746b246ad348c202419ae681`（2026-08-28）；`package.json` 版本 `4.0.0`；`template/adr-template.md` 最后改动 `8135ed2e01503be852769402ec3eeb585bfe75a2`（2026-04-17）
- 目录站：`adr.github.io`（2026-09-15 抓取，页脚 © 2026，无具体更新时间戳）
- 核对日期：2026-09-15

## 1. Nygard 原型（2011）（观察）

五个小节：**Title**、**Context**、**Decision**、**Status**、**Consequences**。

- Title：`short noun phrases. For example, "ADR 1: Deployment on Ruby on Rails 3.0.10"`
- Context：`the forces at play, including technological, political, social, and project factors. The language in this section is value-neutral. It is simply describing facts.`
- Decision：`This section describes our response to these forces. It is stated in full sentences, with active voice. "We will …"`
- Status：`A decision may be "proposed" if the project stakeholders haven't agreed with it yet, or "accepted" once it is agreed.`
- Consequences：`the resulting context, after applying the decision. All consequences should be listed here, not just the "positive" ones.`

**观察**：原型里**没有** alternatives / options 小节。备选被建模成 `Context` 里的"forces"——即"有哪些力在拉扯"，而不是"有哪些可选形状"。

**推断**：这一点解释了后续大量 ADR 实践中备选缺失的结构性来源——最广为流传的原始模板本来就没有这一格。

## 2. MADR 4.0.0 模板（观察）

`template/adr-template.md` 的结构，括号内为模板自带的可选性注释：

```
---
status / date / decision-makers / consulted / informed   （整块标 "optional metadata elements"）
---

# {short title}

## Context and Problem Statement          （无可选注释 ⇒ 必需）
## Decision Drivers                       （"This is an optional element."）
## Considered Options                     （无可选注释 ⇒ 必需）
## Decision Outcome                       （无可选注释 ⇒ 必需）
### Consequences                          （"This is an optional element."）
### Confirmation                          （"This is an optional element."，但注释说 "it is included in many ADRs"）
## Pros and Cons of the Options           （"This is an optional element."）
## More Information                       （"This is an optional element."）
```

`Considered Options` 的全部指令：

```
* {title of option 1}
* {title of option 2}
* {title of option 3}
* … <!-- numbers of options can vary -->
```

**观察**：三个占位项 + `numbers of options can vary`。**没有最低数量要求**，也没有"必须含不做/基线"的要求。

`Decision Outcome` 的措辞给了一条重要线索：

> Chosen option: "{title of option 1}", because {justification. e.g., only option, which meets k.o. criterion decision driver | which resolves force {force} | … | comes out best (see below)}.

**观察**：`only option` 是模板给出的合法理由之一——MADR 明确允许"只有一个选项"的 ADR。

`Pros and Cons of the Options` 用 `Good, because` / `Neutral, because` / `Bad, because` 的固定前缀逐项写——这是本轮见到的、备选比较里**唯一有固定词法前缀**的模板（因此是少数可被机器粗筛的形状）。

`Confirmation` 的指令与本项目「证据两级」的第二级同构：

> Describe how the implementation / compliance of the ADR can/will be confirmed. Is there any automated or manual fitness function? … E.g., a design/code review or a test with a library such as ArchUnit can help validate this.

status 的取值域是开放列表：`{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123}`——注意 `…`，取值域**不封闭**。

## 3. 谁做决定（观察）

MADR 用三段式元数据表达角色：`decision-makers`（参与决定的人）、`consulted`（双向沟通的专家）、`informed`（单向知会）。这三个字段整块被标为 optional。

**推断**：MADR 把"谁决定"当元数据而非流程——它不定义评审、不定义阶段门、不定义谁有权把 status 从 proposed 改成 accepted。ADR 是一种**记录格式**，不是一套流程；把它当流程用时，阶段门必须由采用方自己补（Semantic Kernel 的做法见 [semantic-kernel-adr](semantic-kernel-adr.md)）。

## 4. 与本项目骨架的对照（推断）

| 骨架条 | ADR/MADR 的对应 | 判断 |
|---|---|---|
| 每个决定点 ≥ 3 真候选 | `Considered Options` 必需但数量不限，模板允许 `only option` | 部分先例：必需是有的，数量不是 |
| 基线候选（不做 / 最小改动） | 无 | 无先例 |
| 比较用同一把尺，尺先于矩阵 | `Decision Drivers` + `Decision Outcome` 引用 driver 作为理由（`which meets k.o. criterion decision driver`） | **有先例**，且逻辑与本项目一致：尺（driver）先于选择 |
| 决定 = 选择 + 否决理由 | `Pros and Cons` 承载否决理由，但整块可选 | 弱先例 |
| 复议条件 | `More Information` 提到 `if/when it should be re-visited` | 弱先例 |
| 证据两级的第二级 | `Confirmation`（fitness function / ArchUnit） | **有先例** |

- **值得引入**：`Decision Drivers` → `Decision Outcome` 的引用关系（选择必须援引已声明的尺）。这是本项目骨架第 3 条"尺先于矩阵"在上游最接近的实现。
- **值得引入**：`Good/Neutral/Bad, because` 的固定前缀——它让"每个候选是否写了代价"变成可粗筛的结构。
- **不适合**：MADR 的 status 开放取值域。本项目需要封闭词表才能做跨文档一致性检查（对照 Kubernetes KEP 把 status/stage 做成封闭枚举并跨字段校验）。

## 5. 局限与未覆盖

- Nygard 原文经 WebFetch 提取，**未逐字通读**；`cognitect.com` 域名在 Cognitect 并入 Nubank 后的长期可达性未知。
- 未读 MADR 的 `docs/`、`CHANGELOG.md` 与另外三个模板（`adr-template-bare.md`、`adr-template-minimal.md`、`adr-template-bare-minimal.md`）；"minimal"系列很可能连 `Considered Options` 都去掉，本轮**未核对**。
- `adr.github.io` 的抓取结果较稀薄（其 `/adr-templates/` 子页未读），因此"还有哪些 ADR 模板、各自如何处理备选"（Tyree & Akerman、Y-statements）**未覆盖**。
- MADR 在实践中的兑现率见 [adr-empirical-study](adr-empirical-study.md) 与 [semantic-kernel-adr](semantic-kernel-adr.md)。
