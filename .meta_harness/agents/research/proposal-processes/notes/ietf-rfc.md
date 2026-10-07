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
