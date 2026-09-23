# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.model-response` v1 是 `candidate`（2026-09-23 起草），未接受、未冻结；没有提供者设计、没有源码、没有装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。**一条都未执行**——文件存在不代替结果。
> **连 Schema 正反实例的自检也未运行**：本 Schema 引用的五份契约与它并行起草、在本分支里还不存在，引用解析不了；
> 起草派发也只允许运行 `make design-check` 与 `make docs-check`。见[结果与反例](#结果与反例)。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v1/examples.md) 第一、二节的每个 JSON 块过根模式，结果与块前的「预期」逐一对上；拒绝的那些还要核对给出的拒绝值符合 [S-27](v1/contract.md#s-27-表示层拒绝值) 的次序 | Draft 2020-12 校验器；需要五份依赖契约的 Schema 已就位 | [S-6](v1/contract.md#s-6-responseid)～[S-15](v1/contract.md#s-15-故障的成因与原样状态码)、[S-17](v1/contract.md#s-17-首-token-与时序)、[S-19](v1/contract.md#s-19-用量与费用)、[S-20](v1/contract.md#s-20-上游原始响应留存)、[S-26](v1/contract.md#s-26-schema-的范围)、[S-27](v1/contract.md#s-27-表示层拒绝值) 的**形状那一面** | **未运行。**阻断在依赖契约未定型；整批对齐之后第一件事 |
| V-2 | **两次发出、两条响应体、两笔钱**（[S-29](v1/contract.md#s-29-两次发出两条响应体两笔钱)） | 规范场景演练：注入上游 503，默认重试挂件换一家 | [S-4](v1/contract.md#s-4-一次调用一次发出一条响应体)、[S-8](v1/contract.md#s-8-第几次发出)、[S-19](v1/contract.md#s-19-用量与费用)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列)、[S-24](v1/contract.md#s-24-一条响应体对应上游的一次请求) | **未开始。**需要模型请求运行时的提供者。**必须数响应体的条数**——只看最后一条成功，一个把失败的那次吞掉的实现看起来完全正常 |
| V-3 | **首 token 之后的故障**（[S-30](v1/contract.md#s-30-首-token-之后的故障)），且换上一件「见 429 就重试」的挂件 | 规范场景演练 ＋ 故障注入（流吐出一段之后断开） | [S-13](v1/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v1/contract.md#s-14-回复与已交付部分)、[S-15](v1/contract.md#s-15-故障的成因与原样状态码)、[S-17](v1/contract.md#s-17-首-token-与时序)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列) | **未开始。**「换上一件会乱重试的挂件」是这条的全部分量：默认挂件本来就不会重试，只跑默认的证明不了「挂件推翻不了」 |
| V-4 | **用户中断的两支**（[S-31](v1/contract.md#s-31-用户中断的两支)），同一次演练里跑 | 规范场景演练 | [S-12](v1/contract.md#s-12-收场)、[S-13](v1/contract.md#s-13-收场与其余成员的条件关系) | **未开始** |
| V-5 | **没发出去的调用没有响应体**（[S-32](v1/contract.md#s-32-没发出去的调用没有响应体)）；另加一条**写入者检查**：代码里没有任何一处给响应体写 `withdrawn`、`scope_disallowed`、`modality_mismatch` | 规范场景演练 ＋ 写入者的静态检查（形式归 realization） | [S-4](v1/contract.md#s-4-一次调用一次发出一条响应体)、[S-16](v1/contract.md#s-16-发出了的才有响应体) | **未开始** |
| V-6 | **参数不静默丢**（[S-33](v1/contract.md#s-33-参数不静默丢)） | 规范场景演练：带一项传输适配认不得的统一参数，同时抓发往上游的请求体 | [S-11](v1/contract.md#s-11-交给传输适配的参数与没发出去的项) | **未开始。**必须同时看响应体与真实请求体；只看响应体，一个「列了名字但其实发出去了」的适配层也会通过 |
| V-7 | **凭据不进响应体**（[S-34](v1/contract.md#s-34-凭据不进响应体)） | 故障注入：上游错误原文与响应头里带已知凭据样式文本 | [S-21](v1/contract.md#s-21-写入之前脱敏) | **未开始，且判据受阻于 [G-5](v1/contract.md#七已知缺口)**：脱敏规则未定，只能用「已知凭据原文不出现」一种判法 |
| V-8 | **无隐藏重试**：在传输层注入一次可重试的失败，数上游实际收到的请求数与写下的响应体条数，两者相等 | 提供者设计核对（传输适配是否指定单家、禁止回退）＋ 规范场景演练 | [S-24](v1/contract.md#s-24-一条响应体对应上游的一次请求) | **未开始。**需要 pi-ai 定向 fork 的传输适配（D-019）；比较门里「无隐藏重试」那一项与这里是同一件事，**各自记结果，不互相顶替** |
| V-9 | **写入者的跨字段约束**：`reply.response = id`；三个时刻的先后；`upstreamModel` 不被冒填；`provider` 在档案允许的供应商里；`unrecognized` 带痕迹；`ResponseId` 不取上游 id | 写入者的单元与契约测试（形式归 realization） | [S-6](v1/contract.md#s-6-responseid)、[S-9](v1/contract.md#s-9-路由留痕)、[S-14](v1/contract.md#s-14-回复与已交付部分)、[S-15](v1/contract.md#s-15-故障的成因与原样状态码)、[S-17](v1/contract.md#s-17-首-token-与时序) | **未开始。**这些条款**全在 Schema 之外**（[examples.md 第三节](v1/examples.md#三schema-挡不住但同样非法的)），V-1 全绿也不支持其中任何一条 |
| V-10 | **同一次调用的序列性质**：对任意一次调用读全部响应体，核对 `dispatch` 不重不跳、只有策略那一类失败之后才有下一条、`reply` 至多一条且在最后 | 对演练产生的日志做序列核对；需要时由能力契约的行为模型承担 | [S-8](v1/contract.md#s-8-第几次发出)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列) | **未开始。**停机那一支受阻于 [G-7](v1/contract.md#七已知缺口) |
| V-11 | **首 token 缺席是断言**：让运行时在首 token 之后、写响应体之前停机，恢复后核对没有任何一条把这一次写成「没开口」 | 故障注入（杀进程）＋ 恢复演练 | [S-18](v1/contract.md#s-18-首-token-缺席是一条断言) | **未开始，且受阻于 [G-7](v1/contract.md#七已知缺口)**：停机后谁补写、首 token 怎样判得出，本版无答案 |
| V-12 | **写下即不变**：补账之后原响应体逐字不变；原始响应附件被清理之后响应体逐字不变 | 规范场景演练 | [S-19](v1/contract.md#s-19-用量与费用)、[S-20](v1/contract.md#s-20-上游原始响应留存)、[S-22](v1/contract.md#s-22-写下即不变) | **未开始** |

## 已知缺口

**本节是提供者层的事实与取证状态，不写进契约条款**（契约的 [G-10](v1/contract.md#七已知缺口) 指到这里）：

- **pi 传输层不读 OpenRouter 的真实费用。**pi 钉 `3390bd9` 的传输层（`packages/ai/src/api/openai-completions.ts` 的 `parseChunkUsage` 与 `anthropic-messages.ts`）
  **只从上游读四类 token，费用按本地价目表算（`calculateCost`）**，不读 OpenRouter 回的 `usage.cost`。
  所以 [D-019](../../../record/decisions/model-provider-pi-ai-fork/decision.md)「实际费用不能被目录估算冒充」在 fork 时要**自己加**：请求带 `usage: { include: true }`，响应读 `usage.cost` 与 `cost_details`。
- **这两个字段名出自 OpenRouter 的用量核算文档，未钉存取证。**owner：块 C 提供者设计；闭合条件：钉 SDK 版本时一并取证，结果回填本节。
- **在这之前，任何实现写出来的 `cost_usd` 若来自本地价目表，都违反 [S-19](v1/contract.md#s-19-用量与费用) 第 2 条**——它必须是 `unknown`，而不是一个估算值。

## 结果与反例

### 未执行：Schema 正反实例自检

**未运行，不是通过。**两个原因：

1. 本 Schema 以相对路径引用 `data.call-accounts`、`data.content-blocks`、`data.messages`、`data.model-profile`、`data.loop-extension` 五份契约的 Schema，
   它们在本分支里不存在，校验器解析不了引用；
2. 本次起草派发只允许 `make design-check` 与 `make docs-check` 两条命令。

**建议整批对齐时第一件事就跑 V-1**：本 Schema 的条件约束（`allOf` 里的 `if/then` 共十四处）是最容易写错而肉眼看不出的部分，
而 [`examples.md`](v1/examples.md) 已按「预期」列写成可以直接喂给校验器的格式。

### 尚无的记录

规范场景 S-29～S-34 与写入者检查尚无执行记录。首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；
原始产物归 [record/evidence/](../../../record/evidence/README.md)。记录时分开陈述：Schema 校验的结果、规范场景演练的结果、真实组合的符合性。

## 实际执行

| run id | 本契约的哪条义务 | 结果 | evidence |
|---|---|---|---|
| —— | —— | **没有任何一次运行覆盖本契约** | —— |

**catalog 登记**（2026-09-23，`candidate`）**不产生任何证据**，它只是把坐标与资源放进采用面。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[包入口](README.md#版本包)：本契约没有状态转移，收场条件是一张有限判定表，由 Schema 与正反实例逐格覆盖；
[S-23](v1/contract.md#s-23-同一次调用的响应体序列) 的序列性质是写入者的行为，需要行为模型时归 `capability.model-request-runtime`。
**这不是把义务省掉**：它被改写成了 V-1（形状）、V-10（序列核对）与 S-29～S-34 六条规范场景。

## 变化的影响

- **2026-09-23 首次起草**（`candidate`，本分支 `panqiwei/assets-runtimes-spec-response`，基线 `e949df8`）。
  **起草时五份依赖契约都没有定型**，本契约只按施工简报账本引用它们的名字。**每一份定型时要复核的东西逐条列在下面**；
  复核不过就是本契约要改的地方（未冻结，原地改，并在本节追加一条）：

  | 依赖 | 本契约用了它的什么 | 它定型时要复核 |
  |---|---|---|
  | `data.call-accounts` v1 | `$defs/Usage`、`$defs/Cost`；`CostCorrection` 的目标形状 `{ kind: model_response, responseId }` 与 `obtainedVia`；汇总规则（`unknown` 单独计数、取最新更正） | `$defs` 名与成员名；「来源 = 无」时四项全 `unknown` 的写法；**它自己也立了 `ResponseId`**——整批对齐须定下一处权威（本契约 [S-6](v1/contract.md#s-6-responseid) 认为家在这里）；catalog `clauses` 由 `$defs/…` 换成它的条款号，**并补上汇总规则所在的那一条**（它没有 `$defs`，起草时无从填占位） |
  | `data.content-blocks` v1 | `$defs/ContentBlock`（`delivered`）、`$defs/AttachmentRef`（`raw.body`）；没长完的工具调用两位皆假的规则 | `$defs` 名；实例里块的成员名（`kind`、`visibility`、`complete`、`rawArguments`…）；`AttachmentRef` 的成员 |
  | `data.messages` v1 | `$defs/AssistantMessage`；它的 `response` 成员与 `ending` 三值（`complete`、`interrupted_by_user`、`truncated_at_limit`） | 成员名与三值是否与本 Schema 的 `ending` 条件逐字一致；**它也在本地立了 `ResponseId`**（家指向块 C）——改为引用本契约 |
  | `data.model-profile` v1 | `$defs/ModelProfileRef`、`$defs/ProviderName`、`$defs/ModelRequestParameters`；参数词表的成员名（`droppedParameters` 的项名取它） | `$defs` 名；`ModelProfileRef` 能否表示**官方档案**（它在出厂默认层，而 `data.identity-values` 的 `ScopeLayerIdentity` 不含那一格）；词表成员名 |
  | `data.loop-extension` v1 | `$defs/FailureCause` 的八值 | 八个名字与本契约 [S-15](v1/contract.md#s-15-故障的成因与原样状态码) 列的逐字一致；`data.arrival-events` 那份不透明的 `FailureCause` 形状同样要改为引用它 |

  **另有两处本契约自己的引用要在整批对齐时定**：`RunId`／`AttemptId` 与 `data.loop-extension` 的 `RunRef`／`AttemptRef` 是不是同一样东西、叫哪个名字；
  `ModelCallId` 与 `data.arrival-events` 本地立的那一份合一（[G-2](v1/contract.md#七已知缺口)）。
  **三个不透明标识引用了 `data.identity-values` 的 `OpaqueIdentifier`**，而那个定义的说明写着「只供本文件各具体标识复用」——
  全批不透明标识怎样引用同一份表示，整批对齐时统一。

  **对证据的影响**：无——还没有任何证据。

- **将来的触发点**：
  - [G-6](v1/contract.md#七已知缺口) 闭合（产品给「回复在落盘之前被否决」那一次定成因）：[S-13](v1/contract.md#s-13-收场与其余成员的条件关系) 的判定表要多一行、Schema 第六支的②要松一处；接受之后即是语义变更，发新版本。
  - [G-7](v1/contract.md#七已知缺口) 闭合：V-10 的停机那一支与 V-11 解除阻断；若要加「判不出」这一取值，是表示变更，接受之后发新版本。
  - [G-8](v1/contract.md#七已知缺口) 若结论是「上游仍可能换家」，要加一个成员，接受之后发新版本。
  - 跨进程演化（[S-25](v1/contract.md#s-25-装配给的保证与协议须给的保证) 右列转为协议给）：语义边界改变，发新版本；本版的全部证据只保留其单机范围。

结果不改写规范。发现语义问题回到来源设计（PF-013／PF-009／PF-012），不在这里改契约。
