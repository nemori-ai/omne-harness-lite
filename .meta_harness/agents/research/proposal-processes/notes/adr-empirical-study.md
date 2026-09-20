<!-- 单来源核对笔记：ADR 实证研究。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# 实证研究：4316 份 ADR 里，`Considered Options` 是最成问题的一节

- 论文：Nicolás Miccio Palermo、Antonela Tommasel、J. Andrés Diaz-Pace，《A Text Mining and Classification Approach for Analyzing Architecture Decision Records》
- 版本：arXiv `2609.07375`，**v1**，提交于 2026-09-07
- 核对方式：2026-09-15 抓取 `arxiv.org/abs/2609.07375`（摘要与元数据）与 `arxiv.org/html/2609.07375`（正文，定向提取 §4.3 与 Figure 5 的结论）
- 核对日期：2026-09-15

## 1. 研究设计与规模（观察）

摘要原文：

> Architectural decision records (ADRs) have become a popular lightweight mechanism for documenting architectural knowledge in software projects. However, there is limited empirical evidence on the kinds of architectural concerns captured in ADRs and how well their contents align with established architectural knowledge concepts and documentation practices. In this paper, we propose an automated text-mining and classification approach for analyzing ADRs at scale. We apply this approach to a dataset of ADRs extracted from ~550 open-source repositories, combining topic modeling, LLM-based classification, and template compliance checks. Our analysis examines decision taxonomies and quality attributes, and the degree to which ADRs adhere to the MADR template. Our findings show that ADRs frequently capture existence, technology, and process-related decisions, while alternatives, decisions drivers, and some quality concerns remain under-documented. We also observe recurring mismatches between ADR contents and template sections.

规模：**4316 份 ADR，来自 547 个开源项目**（过滤后）。

## 2. 关于备选方案的结论（观察）

§4.3（`RQ#3 – Usage of ADR Template Sections`，配 Figure 5）原文：

> The most problematic section was Considered Options, which is mandatory in the MADR template … This section was absent or misplaced in most ADRs and, when present, often failed to fulfill its intended purpose.

以及：

> the low quality and frequent omission of Decision Drivers and Considered Options point to a limited documentation of rationale and alternatives

各节的相对表现（§4.3 的定性描述）：

| MADR 小节 | 论文的描述 |
|---|---|
| Context and Problem Statement | 最常出现，位置正确，内容相关 |
| Decision Outcome | 普遍存在，位置恰当 |
| Consequences | 出现较频繁，但内容质量较低 |
| Decision Drivers | 经常错位，缺乏实质内容 |
| **Considered Options** | **最成问题**：多数 ADR 里缺失或错位；存在时也常常没达到本来的目的 |

**观察**：这篇论文提供的是本轮唯一的**大样本**证据。它与本轮自己做的两次小样本统计（Semantic Kernel 77 份：55% 有标题、24% 枚举 ≥3 选项；MCP 42 份：29% 有 Alternatives 标题）方向完全一致。

**观察**：论文明确指出 `Considered Options` 在 MADR 里是 **mandatory** 的——即"写进模板并标为必需"这件事，在 4316 份样本的规模上被证明不足以保证兑现。

## 3. 与本项目的关系（推断）

- **对骨架第 2 条（每个决定点 ≥ 3 真候选）的意义**：这条要求比 MADR 的 `Considered Options` 严格得多。既然更宽松的要求在 4316 份样本里都是"最成问题的一节"，那么更严格的要求若没有配套的失败机制，失败得只会更彻底。本项目若采用数量下限，必须同时回答"谁在什么时候会因为候选不足而拒绝"。
- **对骨架第 6 条（评审清单）的意义**：论文观察到的另一类问题是"contents 与 template sections 反复错位"——内容写了但放错了小节。纯人工评审清单对这类错位不敏感（人读得懂内容就不会挑位置），机器检查对它敏感（标题在不在、下面有没有东西）。这两类检查覆盖的失败不同，**不能互相替代**（推断）。
- **一条不能从这篇论文得出的结论**：它没有证明"备选记录得好的项目决定质量更高"。它只测量了文档合规度。把它当作"必须强制备选"的因果依据是过度解读（推断）。

## 4. 局限与未覆盖

- **只读了摘要与 §4.3 的定向提取**，未通读全文、未看 Figure 5 的具体数值。因此本笔记**没有**"Considered Options 缺失率 = X%"这样的精确数字，只有论文的定性判断（"most ADRs"）。若后续需要精确数字，必须回去读原文的图表。
- 论文是 arXiv v1（2026-09-07），**未经同行评审**；其 LLM-based classification 的准确率与人工校验规模本轮未核对。
- 论文的样本是"使用 ADR 的开源项目"，对本项目（单一作者 + AI agent 撰写 + 有 CI 门）的外推有效性未知。
- 本轮**未读**另一份相关文献：《Architecture Decision Records in Practice: An Action Research Study》（ECSA 2024），它可能包含"为什么备选写不出来"的访谈证据，是这个问题更好的来源。
- 未检索"要求至少两个备选 + 不做的选项""决策矩阵""反对意见记录"这类**具体改进提案**的文献或社区讨论；本轮找到的改进形状全部来自模板本身（W3C TAG 的 Pros/Cons/Reason-for-rejection、MADR 的 Good/Neutral/Bad、DSH 的 CI 门），不是来自批评文献。这是本主题最明显的覆盖缺口。
