<!-- 单来源核对笔记：Microsoft Semantic Kernel 的 docs/decisions ADR。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# Semantic Kernel：AI 框架里体量最大的 ADR 库，也是「Considered Options 形同虚设」最完整的量化样本

- 仓库：`github.com/microsoft/semantic-kernel`，HEAD `ca40aa7226531d28a721d0ca0e451d0aaf86dafc`（2026-09-11）
- 统计对象：`docs/decisions/` 下 80 个 `.md`，去掉 `README.md`、`adr-template.md`、`adr-short-template.md` 后 **77 份 ADR**（按该 commit 的 raw 内容逐份下载）
- 核对日期：2026-09-15

## 1. 流程是怎么定义的（观察）

流程写在 `0001-madr-architecture-decisions.md`（status: accepted，date: 2023-05-29）里。它采用 MADR 并给出操作步骤：

> 1. Copy docs/decisions/adr-template.md to docs/decisions/NNNN-title-with-dashes.md, where NNNN indicates the next number in sequence.
>    1. Check for existing PR's to make sure you use the correct sequence number.
> 2. Edit NNNN-title-with-dashes.md.
>    1. Status must initially be `proposed`
>    2. List of `deciders` must include the aliases of the people who will sign off on the decision.
>    3. The relevant EM and `dluc` must be listed as deciders or informed of all decisions.
> 3. **For each option list the good, neutral and bad aspects of each considered alternative.**
> 4. Share your PR with the deciders and other interested parties.
>    1. Deciders must be listed as required reviewers.
>    2. The status must be updated to `accepted` once a decision is agreed and the date must also be updated.
>    3. Approval of the decision is captured using PR approval.
> 5. Decisions can be changed later and superseded by a new ADR. In this case it is useful to record any negative outcomes in the original ADR.

**观察**：第 3 步明确要求"每个选项都列出 good / neutral / bad"。**决定的批准载体是 PR approval**，不是文件里的字段。

采纳这套流程的动机（原文）：`We have multiple different language versions of the Semantic Kernel under active development i.e., C#, Python, Java and Typescript. We need a way to keep the implementations aligned with regard to key architectural decisions…`

**讽刺性的观察**：这份**定义 ADR 流程的 ADR 自己**只有一个 `Considered Options`（`- Use MADR format and store decision documents in the repository.`），而且 `## Decision Outcome` 下的 `Chosen option:` **是空的**。

## 2. 量化结果（观察，本轮统计）

对 77 份 ADR 做机械统计（"选项数" = `Considered Options` 小节下的一级列表项或编号项，取与 `Pros and Cons of the Options` 下 `###` 子标题数的较大值）：

| 指标 | 数 | 占 77 |
|---|---|---|
| 有 `## Considered Options` 标题 | 42 | 55% |
| 完全没有该标题 | 35 | 45% |
| 有该标题但小节**完全为空** | 9 | 12% |
| 枚举出 ≥ 2 个选项 | 23 | **29%** |
| 枚举出 ≥ 3 个选项 | 19 | **24%** |
| 有 `Pros and Cons of the Options` 且其下有 ≥1 个子标题 | 9 | 12% |

状态字段的实际取值（77 份）：`accepted` 35、`proposed` 22、`approved` 5、`{ accepted }` 5、缺失 3、`superseded by [ADR-00xx]` 3、`{proposed}` 1、`experimental` 1、`{ in-progress }` 1、`{ proposed }` 1。

**观察**：
- `{ accepted }`、`{proposed}`、`{ in-progress }` 是**模板占位大括号没删**——即 8 份 ADR 的 status 字段带着模板花括号被合入。
- `approved` 与 `experimental` 不在 MADR 的建议取值里，是本地自造。
- **22 份（29%）长期停在 `proposed`**——即近三成 ADR 从未解析出决定。
- 编号重复：`0021` ×2、`0023` ×2、`0025` ×2、`0046` ×3、`0051` ×2、`0072` ×2。`0001` 第 1 步要求的"检查已有 PR 以确保编号正确"没有机器兜底。

## 3. 空到什么程度（观察，抽样）

- `0034-rag-in-sk.md`：`## Considered Options` 后直接是下一个标题，一个字都没有。
- `0053-dotnet-structured-outputs.md`：整节只有一句 `**Note**: All of the options presented in this ADR are not mutually exclusive - they can be implemented and supported simultaneously.`（即该节不含任何选项）。
- `0011-function-and-kernel-result-types.md`：两个编号选项，第二个直接写 `- chosen approach`（这一份是**填得合格**的样本，说明流程可用，只是没被强制）。

## 4. 为什么会这样（推断）

`0001` 把"批准"绑定到 PR approval，把"内容质量"交给 reviewer 的人工判断。仓库里**没有**任何针对 `docs/decisions/` 的校验（本轮在该 commit 下未找到对应的 CI 脚本，见"局限"）。于是：

- 会失败的东西：PR 没人 approve → 合不进去。
- 不会失败的东西：`Considered Options` 空着、status 带花括号、编号撞车。

结果与 EIP（`Rationale: TBD` 被模板允许）、MCP（`Alternatives Considered` 列为可选，29% 兑现）完全一致。三个来源、三种不同的宽松方式、几乎相同的兑现率。
