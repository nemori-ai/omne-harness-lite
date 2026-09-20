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

## 5. 与本项目骨架的对照（推断）

- **反面证据的核心**：本项目骨架第 2 条要求"每个决定点 ≥ 3 个真候选，含一个基线候选"。Semantic Kernel 有明文要求（"每个选项列 good/neutral/bad"）、有模板、有必填的 `deciders` 名单，实际兑现是 24% 达到 ≥3 个选项、12% 写了 pros/cons。**要求写进模板对兑现率的贡献接近于零。**
- **可迁移的教训（三条，均为推断）**：
  1. 凡是希望被兑现的字段，必须有一个"不满足就失败"的动作（CI 检查、或评审者的明确拒绝动作），否则它等于注释。
  2. status 必须是封闭词表并被校验，否则会长出 `approved`、`{ accepted }`、`experimental`。
  3. 编号/身份唯一性必须机器保证——人工"check for existing PR's"在 77 份规模上就已经失效（6 组重号）。
- **值得注意的正面做法**：`0001` 第 5 步"被取代时，在原 ADR 里记录负面结果"——即取代不是删除，而是把新观测写回旧记录。这与本项目「新观测挑战有效决定时记录因果影响」同向。

## 6. 局限与未覆盖

- 选项计数是机械的（列表项 / 编号项 / pros-cons 子标题），会**低估**把选项写成散文段落的情况。因此 "24% 有 ≥3 选项"应读作"24% 的 ADR 把选项**结构化地**枚举了出来"，不等于"只有 24% 考虑过多个方案"。
- 本轮**未检索** `semantic-kernel` 仓库的 CI 配置，因此"没有针对 `docs/decisions/` 的校验"是从缺乏任何 lint 迹象（花括号占位、重号长期存在）得出的**推断**，不是直接观察。
- 未读 `adr-short-template.md` 与 `docs/decisions/README.md`。
- 未区分 ADR 的类型（有些是纯流程类，如 `0030-branching-strategy`、`0042-samples-restructure`，它们没有备选可能是合理的）；本轮统计把所有 77 份一视同仁。
- 未核对同名不同号 ADR（`0046` 三份）是否真的是身份冲突，还是三个团队各自的编号空间。
