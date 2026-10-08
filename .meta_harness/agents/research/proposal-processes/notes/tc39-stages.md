<!-- 单来源核对笔记：TC39。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# TC39：模板全可选，严格性全在阶段门；并且明文禁止 LLM 代写散文

- 来源：`https://tc39.es/process-document/`（页面无版本/日期标记）；源仓库 `github.com/tc39/process-document` HEAD `1d498bdfb3e0dce10c69f63d8d12f881345d435f`（2025-01-22）
- 另读：`github.com/tc39/how-we-work` HEAD `68d1201c1afb4a4155d1ff572d41bb8028f82b3e`（2026-04-10），其中 `explainer.md`、`AI_POLICY.md`（最后改动 `fd63799260374107bbcc22c205409b6f9265fea1`，2026-03-20）
- 核对日期：2026-09-15

## 1. 阶段与进入条件（观察）

| 阶段 | Purpose | 进入条件（摘） |
|---|---|---|
| 0 Strawperson | Ideation and exploration | 无；作者自行标记 |
| 1 | 设计解法 | 有 champion、有问题陈述散文、讨论关键算法与语义、识别交叉关切、有公开仓库 |
| 2 | Refining the solution | 委员会已选定一个首选解法方向；设计仍是草案 |
| 2.7 | Testing and validation | 完整 spec 文本，全部语义写清；指派 reviewer 与 editor group 签字 |
| 3 | Gaining implementation experience… | 充分测试与实现前经验 |
| 4 | 并入标准 | 两个兼容实现通过 Test262、有显著上线经验、已向 spec 仓库提 PR、editor 签字 |

**观察**：整条线上没有任何一个门要求「列出并比较备选方案」。门全部落在**实现、测试、审阅者签字**上。Stage 2 的进入条件 `The committee has selected a preferred solution direction` 是唯一隐含「曾经有多个方向」的表述。

**观察**：Spec review 的审阅者**由委员会选，不由 champion 选**（`reviewers chosen by committee (not champions)`）。

## 2. 「模板」的地位（观察）

`how-we-work/explainer.md` 是 TC39 对提案 README 的写作建议。它开宗明义：

> The rest of this page can be used as a template, to put in your README.md. Not all sections need to be included: This is just a series of optional suggestions.

建议的小节：`Status`（Champion(s) / Author(s) / Stage）→ `Motivation` → `Use cases` → `Description` → `Comparison` → `Implementations`（Polyfill / Native）→ `Q&A`。

**没有 `Alternatives` 小节**。备选方案分散在两处：

- `Comparison`：`A comparison across various related programming languages and/or libraries. If this is the first sort of language or library to do this thing, explain why that is the case.` —— 这是横向先例比较，不是本提案的候选集。
- `Q&A`：示例里给出的三条正是「为什么不这样做」的形状，例如 `**Q**: Is it really necessary to create such a high-level built-in construct, rather than using lower-level primitives?` 后跟一段说明为什么低层原语会成为 footgun。

**推断**：TC39 把「为什么不是别的形状」建模成**预期问题的问答**，而不是一张候选表。这在「作者已经知道会被问什么」时有效，在「作者还没想到有哪些形状」时无效。

`explainer.md` 还把 W3C TAG 的 explainer 指南列为前置阅读（`This guide by the W3C TAG has a good introduction for web specifications`）——TAG 的版本恰好有强制的结构化 `Alternatives considered`，见 [w3c-tag-explainer](w3c-tag-explainer.md)。

## 3. AI 撰写政策（观察）

`tc39/how-we-work/AI_POLICY.md` 全文（该文件很短，此处引全，因为它是 Q4 的直接证据）：

> # Use of LLMs and similar tools
>
> This policy applies to prose contributions (e.g., ideas, comments, issues, etc.). It does not apply to code contributions, which are evaluated through our review processes.
>
> Prose contributions and comments must be your own writing, not the product of large language models (LLMs) or other tools. Do not prompt an LLM to expand on or explain your idea and then post the output; just provide the idea itself.
>
> Machine translation is permissible, including translation by an LLM, but your use of translation should not introduce any new content.
>
> Similarly, you may use an LLM for proofreading as long as this doesn't add any new content.

**观察**：这是本轮见到的**最严格**的一条 AI 政策——散文贡献（提案正文、issue、评论）必须是人自己写的，禁止「把想法交给 LLM 展开再贴出来」。代码不在此政策范围内，理由是代码另有评审流程。

**推断**：TC39 的判断是「散文的价值在于它是一个人的判断的真实表达；评审流程能验证代码，验证不了被润饰过的论证」。这条与本项目「由 AI agent 撰写与维护提案」的设定直接对立，是一个必须正视的上游反例——它说明「机器写提案」在成熟标准组织里不是被默认接受的前提。
