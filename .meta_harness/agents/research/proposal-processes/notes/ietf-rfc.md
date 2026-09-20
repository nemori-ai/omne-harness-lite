<!-- 单来源核对笔记：IETF Internet-Draft → RFC。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# IETF：最老的一套流程，没有任何「备选方案」要求；门是两个可互操作实现与 IESG 批准

- 来源：RFC 2026《The Internet Standards Process -- Revision 3》（1996-10，BCP 9）；RFC 7322《RFC Style Guide》（2014-09）
- 核对方式：`rfc-editor.org` 的 HTML 版，2026-09-15 抓取并就具体问题提取；**未逐字通读全文**
- 核对日期：2026-09-15

## 1. 成熟度级别与决定权（观察）

标准轨：`Proposed Standard` → `Draft Standard` → `Internet Standard`。非标准轨：`Experimental`、`Informational`、`Historic`。

RFC 2026 §4.1 原文：

> Internet specifications go through stages of development, testing, and acceptance. Within the Internet Standards Process, these stages are formally labeled "maturity levels."

决定权（§6.1）：`A "standards action" … must be approved by the IESG.`

进阶硬门（§4.1.2）：

> A specification from which at least two independent and interoperable implementations … have been developed, and for which sufficient successful operational experience has been obtained, may be elevated to the "Draft Standard" level.

Last Call（§6.1.2）：IESG 通过 IETF Announce 邮件列表发出，`Comments on a Last-Call shall be accepted from anyone…`

## 2. 强制小节（观察）

RFC 7322《RFC Style Guide》§4 标 `[Required]` 的：First-Page Header、Title、Abstract、Status of This Memo、Copyright Notice、Table of Contents、Introduction、**Security Considerations**、Author's Address。IANA Considerations 标 `[Required in I-D]`，发布时若无适用内容可省。

Security Considerations 的措辞（§4.8.5）：

> All RFCs must contain a section that discusses the security considerations relevant to the specification.

**观察**：RFC 2026 与 RFC 7322 都**没有**关于设计备选方案、rationale 或被否决设计的任何强制或建议小节。

## 3. 决定记录在哪（观察 + 推断）

- **观察**：决定的载体是 RFC 编号与其 `Status of This Memo`（标准轨级别）；取代关系用 `Obsoletes` / `Updates` 头字段表达。
- **观察**：Internet-Draft 是**有期限的草稿**，RFC 一经发布不可修改，修订只能发新编号（这是 EIP 的 `Final` 不可原地改、以及本项目「已发布规格不可原地覆盖」的共同祖先）。
- **推断**：IETF 把「为什么不是别的设计」放在工作组邮件列表与会议纪要里，不放在规范文本里。规范只承载"是什么"；"为什么不是别的"由过程留痕（mailing list archive、datatracker 的 ballot 记录）承担。这与 Rust / Nix 把理由留在 PR 线程是同一个形态，只是 IETF 的档案更正式。

## 4. 与本项目骨架的对照（推断）

- **反面证据**：一套运行了三十年、产出了大量长期有效规范的流程，在文档层面对备选方案**零要求**。这说明「备选方案入档」不是"成熟流程的必要条件"，而是针对某类失败（决定被反复重开、理由丢失）的**针对性**措施。本项目要引入它，应当说明自己面对的正是这类失败，而不是诉诸"成熟项目都这么做"。
- **值得注意的对照**：IETF 靠「两个独立可互操作实现」做终局裁决，TC39 靠「两个实现 + Test262」，Swift 靠「先有实现才能评审」。三者都用**外部可验证的实现事实**代替了"论证质量"的审查。本项目在设计与规格建模阶段没有这类终局证据，这正是骨架第 5 条（候选阶段证"能否成立"）想补的位置。
- **不适合**：IETF 的 Last Call / IESG ballot 结构依赖一个常设的、与作者独立的技术指导组，本项目没有对应物。

## 5. 局限与未覆盖

- 两份 RFC 都**未逐字通读**；结论基于针对具体问题的定向提取，可能遗漏个别条款。特别是 RFC 2026 §12 的原文是 `Security issues are not discussed in this memo.`，说明该文件本身不承载安全规则——安全小节的强制来自 RFC 7322 与 RFC 3552 一线，本轮未读 RFC 3552。
- RFC 2026 已被多份后续 BCP 部分更新（如 RFC 6410 把标准轨从三级压到两级），本轮**未核对**这些更新，因此"三级成熟度"的描述可能落后于当前实践。
- 未读 IETF datatracker 的 ballot / 状态机实现，因此「哪些字段被机器校验」未覆盖。
- 未覆盖 IETF 近年对 AI 生成内容的政策（若有）。
