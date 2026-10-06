<!-- 单来源核对笔记：Python PEP。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Python PEP：把「被否决的想法」做成独立的必需小节

- 仓库：`github.com/python/peps`
- 固定版本：仓库 HEAD `94a7775f23fd6eb7c527cf8180dab4542c5da622`（2026-09-11）；`peps/pep-0001.rst` 最后改动 `74fc18d540c2ea9d2a6f1ba852d0a56e10e1057d`（2026-08-07）；`peps/pep-0012.rst` 最后改动 `76b2b6a2aba25f827c0f76a7492b1cf666b46243`（2026-03-04）
- 核对日期：2026-09-15

## 1. 必需小节（观察）

PEP 1 §`What belongs in a successful PEP?` 原文列 13 项。与备选方案直接相关的是第 5 项和第 10 项：

> 5. Rationale -- The rationale fleshes out the specification by describing why particular design decisions were made. It should describe alternate designs that were considered and related work, e.g. how the feature is supported in other languages.
>
>    The rationale should provide evidence of consensus within the community and discuss important objections or concerns raised during discussion.

> 10. Rejected Ideas -- Throughout the discussion of a PEP, various ideas will be proposed which are not accepted. Those rejected ideas should be recorded along with the reasoning as to why they were rejected. This both helps record the thought process behind the final version of the PEP as well as preventing people from bringing up the same rejected idea again in subsequent discussions.
>
>     In a way this section can be thought of as a breakout section of the Rationale section that is focused specifically on why certain ideas were not ultimately pursued.

这是本轮 15 个来源里**唯一**把「被否决的想法 + 否决理由」独立成小节、并给出明确目的（防止重复提出）的通用流程。注意它记录的是**讨论中实际出现过的**想法，不是要求作者去构造候选集。

第 11 项 `Open Issues` 是未决项的容器，措辞是「记录下来让人知道正在想，但还没有具体结论」。

两条硬拒绝条款（观察）：

> PEP submissions without sufficient motivation may be rejected.（第 3 项）

> PEP submissions without a sufficient backwards compatibility treatise may be rejected outright.（第 6 项）

**观察**：动机与向后兼容有「可被拒绝」的措辞；`Rejected Ideas` 没有。

## 2. 阶段、角色与决定权（观察）

- **Sponsor**：非 core developer 的作者必须先找到 sponsor（`The sponsor's job is to provide guidance to the PEP author to help them through the logistics of the PEP process (somewhat acting like a mentor).`）。
- **PEP editors**：做形式准入，明确**不判断可接受性**——`editors do not consider whether they seem likely to be accepted.`；拒绝分配 PEP 号的理由是「重复劳动、技术上不成立、不符合 Python 哲学」等。
- **Steering Council**：最终权威（`the final authorities on whether or not PEPs will be accepted or rejected`）。
- **PEP-Delegate**：Steering Council 可批准某人代为裁决单份 PEP；`BDFL-Delegate` 是已弃用的旧称。
- **状态**：`Draft` 起步；最终评审由作者/sponsor 开一个 Steering Council issue 正式发起。

## 3. 决定记录在哪（观察）

决定写回 PEP 自身的 `Status` 头字段（PEP 1 §`PEP Header Preamble`），PEP 文件本身长期保留在仓库里。理由与讨论沉淀在两处：PEP 正文的 `Rationale` / `Rejected Ideas`，以及 `Post-History` 头指向的讨论线程。PEP 1 另要求 `Change History`（「PEP 的 changelog」）。

**推断**：PEP 是本轮来源里少数把「候选 + 否决理由 + 决定 + 变更史」压在同一份文件里的形态；Rust、Nix、Swift 都把决定理由留在仓库外的讨论线程。

## 4. PEP 12（模板）（观察）

`pep-0012.rst` 是 reStructuredText 的**写作与格式**模板，不是内容 checklist：它示范 header、章节写法与 RST 标记。必需小节的权威在 PEP 1，不在 PEP 12。PEP 12 的变更记录里有一条与结构有关：`The `Rationale` section now comes after the `Specification` section.`

## 5. 可机器核对性（观察 + 推断）

- **观察**：`python/peps` 有 header 校验（`Status`、`Type`、`Created`、`Post-History` 等字段的取值域与格式）；本轮未读该校验的实现源码，只从 PEP 1 对 header 字段取值域的封闭枚举推断它可被校验。
- **推断**：`Rejected Ideas` 的**存在性**可以机器检查（小节名固定），但「记录的是否是真实出现过的想法」不可以——PEP 1 的措辞（`Throughout the discussion… various ideas will be proposed`）把它绑定到讨论历史，机器无从核对。这一点与 DeepSeek Harness 的 `Alternatives are recorded, never invented` 是同一个困难。
