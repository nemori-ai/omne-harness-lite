# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.model-response` v1 是 `candidate`（2026-09-23 起草），未接受、未冻结；没有提供者设计、没有源码、没有装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。起草时一条都未执行；**整批对齐（2026-09-24）跑过一次 V-1 的本地自检**（只判通过与拒绝，见[结果与反例](#结果与反例)），其余义务仍未开始。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v1/examples.md) 第一、二节的每个 JSON 块过根模式，结果与块前的「预期」逐一对上；拒绝的那些还要核对给出的拒绝值符合 [S-27](v1/contract.md#s-27-表示层拒绝值) 的次序 | Draft 2020-12 校验器；需要五份依赖契约的 Schema 已就位 | [S-6](v1/contract.md#s-6-responseid)～[S-15](v1/contract.md#s-15-故障的成因与原样状态码)、[S-17](v1/contract.md#s-17-首-token-与时序)、[S-19](v1/contract.md#s-19-用量与费用)、[S-20](v1/contract.md#s-20-上游原始响应留存)、[S-26](v1/contract.md#s-26-schema-的范围)、[S-27](v1/contract.md#s-27-表示层拒绝值) 的**形状那一面** | **本地自检已跑一次**（整批对齐，2026-09-24）：35 个块，0 处不符；**给的是哪一个拒绝值没有机判**，只由人按 S-27 次序逐块核过 |
| V-2 | **两次发出、两条响应体、两笔钱**（[S-29](v1/contract.md#s-29-两次发出两条响应体两笔钱)） | 规范场景演练：注入上游 503，默认重试挂件换一家 | [S-4](v1/contract.md#s-4-一次调用一次发出一条响应体)、[S-8](v1/contract.md#s-8-第几次发出)、[S-19](v1/contract.md#s-19-用量与费用)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列)、[S-24](v1/contract.md#s-24-一条响应体对应上游的一次请求) | **未开始。**需要模型请求运行时的提供者。**必须数响应体的条数**——只看最后一条成功，一个把失败的那次吞掉的实现看起来完全正常 |
| V-3 | **首 token 之后的故障**（[S-30](v1/contract.md#s-30-首-token-之后的故障)），且换上一件「见 429 就重试」的挂件 | 规范场景演练 ＋ 故障注入（流吐出一段之后断开） | [S-13](v1/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v1/contract.md#s-14-回复与已交付部分)、[S-15](v1/contract.md#s-15-故障的成因与原样状态码)、[S-17](v1/contract.md#s-17-首-token-与时序)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列) | **未开始。**「换上一件会乱重试的挂件」是这条的全部分量：默认挂件本来就不会重试，只跑默认的证明不了「挂件推翻不了」 |
| V-4 | **用户中断的两支**（[S-31](v1/contract.md#s-31-用户中断的两支)），同一次演练里跑 | 规范场景演练 | [S-12](v1/contract.md#s-12-收场)、[S-13](v1/contract.md#s-13-收场与其余成员的条件关系) | **未开始** |
| V-5 | **没发出去的调用没有响应体**（[S-32](v1/contract.md#s-32-没发出去的调用没有响应体)）；另加一条**写入者检查**：代码里没有任何一处给响应体写 `withdrawn`、`scope_disallowed`、`modality_mismatch` | 规范场景演练 ＋ 写入者的静态检查（形式归 realization） | [S-4](v1/contract.md#s-4-一次调用一次发出一条响应体)、[S-16](v1/contract.md#s-16-发出了的才有响应体) | **未开始** |
| V-6 | **参数不静默丢**（[S-33](v1/contract.md#s-33-参数不静默丢)） | 规范场景演练：带一项传输适配认不得的统一参数，同时抓发往上游的请求体 | [S-11](v1/contract.md#s-11-交给传输适配的参数与没发出去的项) | **未开始。**必须同时看响应体与真实请求体；只看响应体，一个「列了名字但其实发出去了」的适配层也会通过 |
| V-7 | **凭据不进响应体**（[S-34](v1/contract.md#s-34-凭据不进响应体)） | 故障注入：上游错误原文与响应头里带已知凭据样式文本 | [S-21](v1/contract.md#s-21-写入之前脱敏) | **未开始，且判据受阻于 [G-5](v1/contract.md#七已知缺口)**：脱敏规则未定，只能用「已知凭据原文不出现」一种判法 |
| V-8 | **无隐藏重试**：在传输层注入一次可重试的失败，数上游实际收到的请求数与写下的响应体条数，两者相等 | 提供者设计核对（传输适配是否指定单家、禁止回退）＋ 规范场景演练 | [S-24](v1/contract.md#s-24-一条响应体对应上游的一次请求) | **未开始。**需要 pi-ai 定向 fork 的传输适配（D-019）；比较门里「无隐藏重试」那一项与这里是同一件事，**各自记结果，不互相顶替** |
| V-9 | **写入者的跨字段约束**：`reply.response = id`；三个时刻的先后；`upstreamModel` 不被冒填；`provider` 在档案允许的供应商里；`unrecognized` 带痕迹；`ResponseId` 不取上游 id | 写入者的单元与契约测试（形式归 realization） | [S-6](v1/contract.md#s-6-responseid)、[S-9](v1/contract.md#s-9-路由留痕)、[S-14](v1/contract.md#s-14-回复与已交付部分)、[S-15](v1/contract.md#s-15-故障的成因与原样状态码)、[S-17](v1/contract.md#s-17-首-token-与时序) | **未开始。**这些条款**全在 Schema 之外**（[examples.md 第三节](v1/examples.md#三schema-挡不住但同样非法的)），V-1 全绿也不支持其中任何一条 |
| V-10 | **同一次调用的序列性质**：对任意一次调用读全部响应体，核对 `dispatch` 不重不跳、只有策略那一类失败之后才有下一条、`reply` 至多一条且在最后 | 对演练产生的日志做序列核对；需要时由能力契约的行为模型承担 | [S-8](v1/contract.md#s-8-第几次发出)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列) | **未开始。**停机那一支的补写者与收场已由 `capability.model-request-runtime` v1 S-33 给出（原 G-7） |
| V-11 | **首 token 缺席是断言**：让运行时在首 token 之后、写响应体之前停机，恢复后核对没有任何一条把这一次写成「没开口」 | 故障注入（杀进程）＋ 恢复演练 | [S-18](v1/contract.md#s-18-首-token-缺席是一条断言) | **未开始**：停机后谁补写、首 token 怎样判得出，已由 `capability.model-request-runtime` v1 S-33、S-15 给出（原 G-7），演练需要它的提供者 |
| V-12 | **写下即不变**：补账之后原响应体逐字不变；原始响应附件被清理之后响应体逐字不变 | 规范场景演练 | [S-19](v1/contract.md#s-19-用量与费用)、[S-20](v1/contract.md#s-20-上游原始响应留存)、[S-22](v1/contract.md#s-22-写下即不变) | **未开始** |
| V-13 | **回复在落盘之前被否决**（[examples.md E-8](v1/examples.md#e-8-同一个-run-里前后两次调用前一次的回复被否决) 的场景）：挂一件对第一份回复必定否决的拓展件，核对①那次调用以 `complete`／`truncated` 加 `replyDisposition = { vetoed }` 结束、不带 `failure`；②**这次调用没有第二条响应体**，再试的那一条属于一个新的 `callId`、`dispatch = 1`；③被否决那份 `reply.id` 在会话日志里找不到消息，落盘那份找得到；④两笔用量与费用都在账上 | 规范场景演练；需要 `data.loop-extension` 的否决落点与模型请求运行时的提供者 | [S-13](v1/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v1/contract.md#s-14-回复与已交付部分)、[S-17](v1/contract.md#s-17-首-token-与时序)、[S-19](v1/contract.md#s-19-用量与费用)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列) | **未开始。**②是这条的分量：把再试写成同一调用的 `dispatch = 2`，Schema 放得过（[examples.md 第三节](v1/examples.md#三schema-挡不住但同样非法的)），只有数 `callId` 才看得出首 token 规则被开了例外 |

## 已知缺口

**本节是提供者层的事实与取证状态，不写进契约条款**（契约的 [G-10](v1/contract.md#七已知缺口) 指到这里）：

- **pi 传输层不读 OpenRouter 的真实费用。**pi 钉 `3390bd9` 的传输层（`packages/ai/src/api/openai-completions.ts` 的 `parseChunkUsage` 与 `anthropic-messages.ts`）
  **只从上游读四类 token，费用按本地价目表算（`calculateCost`）**，不读 OpenRouter 回的 `usage.cost`。
  所以 [D-019](../../../record/decisions/model-provider-pi-ai-fork/decision.md)「实际费用不能被目录估算冒充」在 fork 时要**自己加**：请求带 `usage: { include: true }`，响应读 `usage.cost` 与 `cost_details`。
- **这两个字段名出自 OpenRouter 的用量核算文档，未钉存取证。**owner：块 C 提供者设计；闭合条件：钉 SDK 版本时一并取证，结果回填本节。
- **在这之前，任何实现写出来的 `cost_usd` 若来自本地价目表，都违反 [S-19](v1/contract.md#s-19-用量与费用) 第 2 条**——它必须是 `unknown`，而不是一个估算值。

## 结果与反例

### 本地自检：Schema 正反实例（整批对齐，2026-09-24）

**工具**：Draft 2020-12 校验器（`jsonschema`，按仓库 `uv.lock`），以对齐后整棵设计树的全部 Schema 建 registry；脚本在任务暂存区，不入库。
**输入**：[`examples.md`](v1/examples.md) 第一、二节每个 JSON 块作根模式实例，块前「预期」给出通过或拒绝。

| 预期通过 | 预期拒绝 | 不符 |
|---|---|---|
| 12（E-1～E-11，E-6／E-7、E-8a／E-8b 各两块） | 23（R-1～R-23） | **0** |

**只判通过与拒绝**：给出的是不是块前写的那个拒绝值，校验器不回答——Schema 只报「不合法」，给哪个值由 S-27 的次序定；本轮按错误落在哪一支逐块人工核过，每个反例恰违反一处（R-10 为此补了一条 `localError`）。
第三节的反例不参与，它们本来就过得了 Schema。**这不是 V-2 以后任何一条义务的证据。**

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
  | `data.call-accounts` v1 | `$defs/Usage`、`$defs/Cost`；`CostCorrection` 的目标形状 `{ kind: model_response, responseId }` 与 `obtainedVia`；汇总规则（`unknown` 单独计数、取最新更正）；**2026-09-23 修订起**还有 `$defs/RunId`、`$defs/AttemptId`（整数）、`$defs/ModelCallId`——本契约对这三个直接 `$ref` 过去 | `$defs` 名与成员名；「来源 = 无」时四项全 `unknown` 的写法；**对齐义务：那三个标识的定义要补进它**——补进之前本 Schema 的这三处 `$ref` 解析不了，V-1 跑不起来；补进后核对 `AttemptId` 是从 1 起的整数序号（本契约 [S-7](v1/contract.md#s-7-所属的那次调用)）。**`ResponseId` 的家按主线裁定在本契约**（[S-6](v1/contract.md#s-6-responseid)），它那边按 `data.identity-values` S-31 的散文自定义、**不 `$ref` 本契约**（避免两份 Schema 互相引用），对齐时核对两处表示逐字等价；catalog `clauses` 由 `$defs/…` 换成它的条款号，**并补上汇总规则所在的那一条**（它没有 `$defs`，起草时无从填占位） |
  | `data.content-blocks` v1 | `$defs/ContentBlock`（`delivered`）、`$defs/AttachmentRef`（`raw.body`）；没长完的工具调用两位皆假的规则 | `$defs` 名；实例里块的成员名（`kind`、`visibility`、`complete`、`rawArguments`…）；`AttachmentRef` 的成员 |
  | `data.messages` v1 | `$defs/AssistantMessage`；它的 `response` 成员与 `ending` 三值（`complete`、`interrupted_by_user`、`truncated_at_limit`） | 成员名与三值是否与本 Schema 的 `ending` 条件逐字一致；**它也在本地立了 `ResponseId`**（家指向块 C）——改为引用本契约 |
  | `data.model-profile` v1 | `$defs/ModelProfileRef`、`$defs/ProviderName`、`$defs/ModelRequestParameters`；参数词表的成员名（`droppedParameters` 的项名取它） | `$defs` 名；`ModelProfileRef` 能否表示**官方档案**（它在出厂默认层，而 `data.identity-values` 的 `ScopeLayerIdentity` 不含那一格）；词表成员名 |
  | `data.loop-extension` v1 | `$defs/FailureCause` 的八值 | 八个名字与本契约 [S-15](v1/contract.md#s-15-故障的成因与原样状态码) 列的逐字一致；`data.arrival-events` 那份不透明的 `FailureCause` 形状同样要改为引用它；**2026-09-23 修订起**还要核对它在「消息落盘之前」给出的否决结论与本契约 `replyDisposition.vetoed` 的 `by`、`reason` 同名同义，以及「否决之后再试是新的模型调用」在两边说法一致 |

  起草时另有两处本契约自己的引用留给整批对齐（`RunId`／`AttemptId`／`ModelCallId` 的家；三个不透明标识 `$ref` 了 `data.identity-values` 的 `OpaqueIdentifier`，
  而那个定义的说明限本文件复用）——**两处都已由下一条的主线裁定处理**。

  **对证据的影响**：无——还没有任何证据。

- **2026-09-23 主线裁定后就地修订**（仍 `candidate`，未冻结，同一分支第二条提交）。六项：

  | 裁定 | 本契约改了什么 | 对证据的影响 |
  |---|---|---|
  | 回复在落盘之前被否决（与 `data.loop-extension` 对齐） | 新增成员 `replyDisposition ∈ persisted \| { vetoed: { by, reason? } }`，只在 `complete`／`truncated` 上且在那里必有；否决不改写收场、不带 `failure`，这次调用就此结束，再试是 loop 另起的新调用（新 `callId`）；首 token 规则**不加例外**，S-23 序列性质不变。改了 [S-1](v1/contract.md#s-1-本契约拥有什么)、成员表、[S-5](v1/contract.md#s-5-与别的形状的关系)、[S-12](v1/contract.md#s-12-收场)～[S-14](v1/contract.md#s-14-回复与已交付部分)、[S-17](v1/contract.md#s-17-首-token-与时序)、[S-23](v1/contract.md#s-23-同一次调用的响应体序列)、[S-26](v1/contract.md#s-26-schema-的范围)、[S-27](v1/contract.md#s-27-表示层拒绝值) 与性质表；G-6 闭合；新立 [G-12](v1/contract.md#七已知缺口)（`interrupted` 的那份被否决时无表示）；examples 新增 E-8（同一 Run 前后两次调用，前一次 `vetoed`）与 R-17、R-18 | V-1 的实例多了 E-8a／E-8b、R-17、R-18，全部正例补了 `replyDisposition`；新增 V-13；V-2、V-3、V-10 的判据不变 |
  | `upstreamModel` 可缺席、`attemptId` 是整数序号 | 维持起草时的推导，未改 | 无 |
  | 两个新拒绝值 | `failure_on_success`、`reply_ending_mismatch` 排在 `failure_on_interrupted` 之后；原先落在 `malformed` 的这两种情形改给具名值，`malformed` 只剩成员层面的不合与 `replyDisposition` 的有无；Schema `allOf` 仍是十支（具名的由六支变为八支，标 `malformed` 的由四支变为两支、改管 `replyDisposition` 的有无），`if/then` 由十四处变为十六处 | V-1 要核对的拒绝值变了：R-15、R-16 的预期改为具名值 |
  | 标识的家 | `RunId`、`AttemptId`、`ModelCallId` 改为 `$ref` `data.call-accounts` v1（上表那一行的对齐义务）；`ResponseId` 的家在本契约；G-1、G-2 闭合 | V-1 多了三处要等 `data.call-accounts` 补定义才能解析的引用 |
  | 不跨契约 `$ref` `OpaqueIdentifier` | `ResponseId` 按 `data.identity-values` S-31 的散文自定义（非空、首尾无空白，pattern 逐字照那张码点表）；本契约对 `data.identity-values` 不再有 Schema 引用，只有条款引用 | 无；V-1 少一处外部引用 |
  | 8b／Q14 的依据落为 D-038 | 设计依据行改为「D-038 8b ／ Q14」；G-11 闭合。**D-038 在 HUB 上，本分支看不到**，依据行暂写成文字——**合入后补成链接**，是对齐或合入那一步的事 | 无 |

  catalog：`data.call-accounts` 那条依赖的 `clauses` 补了 `$defs/RunId`、`$defs/AttemptId`、`$defs/ModelCallId`。
  covers：PF-012「消息落盘之前的否决」由缺口登记改为常规覆盖（S-13、S-14、S-23），PF-013「已经开口说话了」的注记与全局注记去掉 G-6／G-11 的说法。

- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单。

  | 改了什么 | 依据 | 条款 | Schema | 实例 |
  |---|---|---|---|---|
  | `replyDisposition` 加第三值 `{ consumed: { by: compaction \| side_query } }`；改为与 `reply` 同在同缺（含被中断有回复的那支）；G-12 闭合 | 对账块 D；读数报回 S8-e | S-1、S-5、S-13、S-14、S-23、S-27 | `ReplyDisposition`；两支 `malformed` 改判据 | E-3 补 `persisted`；R-18 改成「被中断的回复不带它」；新增 E-9 |
  | `interrupted` 带 `initiator ∈ user \| run_cancelled \| runtime_lost`；开了口却没有回复的被中断一行（`delivered` 有才带）；`runtime_lost` 不带回复；首 token 之前失联可续接再发；G-7 闭合 | 账本 RP-24、S16-g；`capability.model-request-runtime` S-33、S-36 | S-8、S-12、S-13、S-14、S-23 | `initiator`；删 `first_token_inconsistent` 第⑥支；加两支 `malformed` | 全部被中断的块补 `initiator`；R-14 换题；新增 E-10、E-11、R-19、R-20 |
  | `attemptId` 从 `call` 挪到每一次发出，跨尝试连续；`call.runId` 对不属于任何运行的调用必无 | 账本 C-R7、C-14 | S-7、S-8、S-19、成员表 | `ModelCallRef`、`attemptId`；一支 `malformed` | 全部 27 块改写；新增 R-21 |
  | `route.profileSnapshot`（`$ref` `data.model-profile` 的 `ModelProfileSnapshot`）、`route.credentialScope`（出厂格或 `ScopeLayerIdentity`，新 `$defs` `CredentialScope`） | 账本 C-R1、C-12、S16-f | S-9、S-26 | `Route`、`CredentialScope` | 全部块补两项；E-9 用出厂格 |
  | `trims?`（`$ref` `data.call-accounts` 的 `TrimSummary`；缺席即没砍，全零拒绝） | 对账块 D；账本 S4 | S-19、S-26、S-27 | `trims` | E-9；新增 R-23 |
  | `unrecognized` 必带痕迹改为 Schema 管得到；`failure` 加 `localError` | 对账块 C（SAF-17）；与 `capability.model-request-runtime` S-18「本地错误」对齐 | S-15、S-26、S-27 | `Failure.localError`；一支 `malformed` | R-10 补痕迹；新增 R-22；第三节那一行换题 |
  | `ModelProfileRef` 按 `data.model-profile` 带 `origin` | `data.model-profile` S-13 | — | — | 全部块 |
  | D-038 依据补成链接；G-11 文字、G-1 文字更新；新立 G-13（`run_cancelled` 交出的回复 `ending` 名不副实） | 合入后补链接 | 设计依据、第七节 | — | — |

  **对证据的影响**：V-1 首次有了本地自检；V-10、V-11 解除阻断（仍需提供者）。

- **2026-09-24 跨契约对齐：凭据只在租户层与出厂格（候选，未冻结，原地改）**。依据 [PF-013 rev 10 裁决 33](../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--组织那一层不持有凭据每人租户层自取)（组织那一层不持有模型凭据），主线派发：
  - **`CredentialScope` 去掉组织那一支**：[S-9](v1/contract.md#s-9-路由留痕) 成员表、Schema 类型表、「引用的形状由各自的家决定」三处改为「出厂格或 `ScopeLayerIdentity` 的租户那一支」；Schema `$defs/CredentialScope` 第二支由 `$ref ScopeLayerIdentity` 改为 `allOf [$ref ScopeLayerIdentity, layer = tenant]`——形状仍归 `data.identity-values`，不另写一份。**表示变更**：带组织那一格的旧实例按新 Schema 被拒（`malformed`）。
  - **实例**：第一、二节 33 处组织那一格的 `credentialScope` 改为租户那一格（同一租户 `org_7fd2c1`/`acc_91ab40`）；新增 R-24（组织那一格 ⇒ `malformed`）；第三节「实际用的是组织那一把」改为「发起租户自己那一把」。本地自检：第一、二节 36 块按「预期」逐块过 Draft 2020-12 校验器，36 块全部与预期相符（只核通过／拒绝，不核拒绝值名）。
  - **catalog 不变**：仍消费 `data.identity-values` S-11（`ScopeLayerIdentity`）。**covers 新增一条**：PF-013 §5.6（裁决 33 所在）→ S-9，`reviewed: false`。
  - **头部产品依据对到 PF-013 rev 11**（主线裁定 2026-09-24 后核 changelog rev 9–11）：rev 9 的相关项（落盘前被否决不算故障、首 token 之后停机记运行时失联、出厂格凭据、调用规则对每一次模型调用都成立）整批对齐时已按主线账本落入；rev 10 只有裁决 33 触及本契约（即本条）；rev 11 不涉及。
  - **对证据的影响**：V-1 的自检须按新 Schema 重跑（本条已跑一次本地自检，见上）；其余不受影响。

- **将来的触发点**：
  - [G-13](v1/contract.md#七已知缺口) 闭合：若运行被取消时的半截回复不落成消息，本契约把那一支收成「没有回复、带 `delivered`」，是表示变更，接受之后发新版本。
  - [G-8](v1/contract.md#七已知缺口) 若结论是「上游仍可能换家」，要加一个成员，接受之后发新版本。
  - 跨进程演化（[S-25](v1/contract.md#s-25-装配给的保证与协议须给的保证) 右列转为协议给）：语义边界改变，发新版本；本版的全部证据只保留其单机范围。

结果不改写规范。发现语义问题回到来源设计（PF-013／PF-009／PF-012），不在这里改契约。

## 对齐义务

- **词条链接待合流后补**（2026-09-24 整批对齐）：正文里「一次发出」原标「无词条」，词条批已立为词条，本包已改用正式名、去掉标记；那几条词条在 HUB 上、本分支看不到，**链接待合流后补**（主线）。
