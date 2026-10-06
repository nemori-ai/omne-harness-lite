# 验证义务与方法

本页维护验证义务、方法、前提与范围。采用与接受状态从专题入口/registry 读取，实现状态从实际成员入口读取；单次执行留工作树 tmp，不维护运行台账。各版本义务按精确消费分别判读，旧范围不自动升级，删除旧日志不关闭缺口。

## v7 发布前破坏性演进

| 证据义务 | 可失败观察 | 责任 |
|---|---| --- |
| 精确依赖及 Schema 同构 | 除本批坐标和说明文字外出现结构差异即失败；所有 `$ref` 精确解析 | 规格与集成拥有者 |
| 冻结源与形式工件保持 | 源登记 hash 改变，或 `.tla`/`.cfg`/`.als` 任一字节改变即失败 | 规格拥有者 |
| 当前格式唯一运行路径 | 旧不兼容输入不得进入旧 codec、不得降级/回填、不得写/清空原数据 | 相应数据接收者 / 提供者 |
| 当前代际责任不丢失 | 当前任务未知提交或已受理工作仍由原 owner 认回/恢复/结算；新格式拒绝不能抹旧事实 | runtime / runner / 日志提供者 |
| 公共操作与最终门不退化 | 原输入上限、Pending 回复、重试历史及 S-34 失败重取仍按原精确性质成立 | 对应消费者及验证 owner |

当前格式明确拒绝与当前代际认回/恢复/结算分别由接收者/runtime/runner/日志 owner 验证，不回填、清空或改写旧事实。字节核对不证明真实实现。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 |责任与限制|
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第一、二节的每个 JSON 块过根模式，结果与块前的「预期」逐一对上；拒绝的那些还要核对给出的拒绝值符合 [S-27](v2/contract.md#s-27-表示层拒绝值) 的次序 | Draft 2020-12 校验器；需要五份依赖契约的 Schema 已就位 | [S-6](v2/contract.md#s-6-responseid)～[S-15](v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](v2/contract.md#s-17-首-token-与时序)、[S-19](v2/contract.md#s-19-用量与费用)、[S-20](v2/contract.md#s-20-上游原始响应留存)、[S-26](v2/contract.md#s-26-schema-的范围)、[S-27](v2/contract.md#s-27-表示层拒绝值)、[S-35](v2/contract.md#s-35-晚到的那一条) 的**形状那一面** | 只支持形状，拒绝值、优先级与行为分别验证。 |
| V-2 | **两次发出、两条响应体、两笔钱**（[S-29](v2/contract.md#s-29-两次发出两条响应体两笔钱)） | 规范场景演练：注入上游 503，默认重试挂件换一家 | [S-4](v2/contract.md#s-4-一次调用一次发出一条响应体)、[S-8](v2/contract.md#s-8-第几次发出)、[S-19](v2/contract.md#s-19-用量与费用)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列)、[S-24](v2/contract.md#s-24-一条响应体对应上游的一次请求) | 需要模型请求运行时的提供者。**必须数响应体的条数**——只看最后一条成功，一个把失败的那次吞掉的实现看起来完全正常  |
| V-3 | **首 token 之后的故障**（[S-30](v2/contract.md#s-30-首-token-之后的故障)），且换上一件「见 429 就重试」的挂件 | 规范场景演练 ＋ 故障注入（流吐出一段之后断开） | [S-13](v2/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v2/contract.md#s-14-回复与已交付部分)、[S-15](v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](v2/contract.md#s-17-首-token-与时序)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列) | 「换上一件会乱重试的挂件」是这条的全部分量：默认挂件本来就不会重试，只跑默认的证明不了「挂件推翻不了」  |
| V-4 | **用户中断的两支**（[S-31](v2/contract.md#s-31-用户中断的两支)），同一次演练里跑；外加系统取消运行（会话归档、首 token 之后）那一支：没有回复、带 `delivered` | 规范场景演练 | [S-12](v2/contract.md#s-12-收场)、[S-13](v2/contract.md#s-13-收场与其余成员的条件关系) | 第三支是反向断言：一个「取消一律先收口出回复」的实现过得了前两支，过不了它  |
| V-5 | **没发出去的调用没有响应体**（[S-32](v2/contract.md#s-32-没发出去的调用没有响应体)）；另加一条**写入者检查**：代码里没有任何一处给响应体写 `withdrawn`、`scope_disallowed`、`modality_mismatch` | 规范场景演练 ＋ 写入者的静态检查（形式归 realization） | [S-4](v2/contract.md#s-4-一次调用一次发出一条响应体)、[S-16](v2/contract.md#s-16-发出了的才有响应体) | 按本行提供者责任验证 |
| V-6 | **参数不静默丢、不静默改**（[S-33](v2/contract.md#s-33-参数不静默丢不静默改)）三支：认不得的统一项、认不得的 `extra` 项、上游只认更窄取值域而改值 | 规范场景演练，同时抓发往上游的请求体 | [S-11](v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项) | 必须同时看响应体与真实请求体；只看响应体，一个「列了名字但其实发出去了」或「记的值不是发出去的值」的适配层也会通过  |
| V-7 | **凭据不进响应体**（[S-34](v2/contract.md#s-34-凭据不进响应体)） | 故障注入：上游错误原文与响应头里带已知凭据样式文本 | [S-21](v2/contract.md#s-21-写入之前脱敏) | 脱敏规则未定，只能用「已知凭据原文不出现」一种判法  |
| V-8 | **无隐藏重试**：在传输层注入一次可重试的失败，数上游实际收到的请求数与写下的响应体条数，两者相等 | 提供者设计核对（传输适配是否指定单家、禁止回退）＋ 规范场景演练 | [S-24](v2/contract.md#s-24-一条响应体对应上游的一次请求) | 需要能禁止隐藏重试与供应商回退的真实传输提供者；比较门里「无隐藏重试」那一项与这里是同一件事，**各自记结果，不互相顶替**  |
| V-9 | **写入者的跨字段约束**：`reply.response = id`；`id` 就是「已出门」上定下的那一个，写响应体的各方沿用；`firstTokenAt` 与「已开口」一致；三个时刻的先后；`upstreamModel` 不被冒填；`provider` 在档案允许的供应商里、第一次发出是第一家、不许回退时恒是第一家；`droppedParameters`／`parameterAdjustments`／`parameters` 三处对得上，**且与同一次发出的「已出门」逐项相同**（S-11 第 6 条；「已出门」那一侧的场景在 `capability.model-request-runtime` 的验证入口）；`extra` 全丢时 `parameters` 里整个 `extra` 缺席；`initiator = run_cancelled` 带 `reply` 只出自用户取消运行；`unrecognized` 带痕迹；`ResponseId` 不取上游 id | 写入者的单元与契约测试（形式归 realization） | [S-6](v2/contract.md#s-6-responseid)、[S-9](v2/contract.md#s-9-路由留痕)、[S-11](v2/contract.md#s-11-实际发出的参数改过的值与没发出去的项)、[S-13](v2/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v2/contract.md#s-14-回复与已交付部分)、[S-15](v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](v2/contract.md#s-17-首-token-与时序) | 这些条款**全在 Schema 之外**（[examples.md 第三节](v2/examples.md#三schema-挡不住但同样非法的)），V-1 全绿也不支持其中任何一条  |
| V-10 | **同一次调用的序列性质**：对任意一次调用读全部响应体，核对 `dispatch` 不重不跳、只有策略那一类失败之后才有下一条、`reply` 至多一条且在最后 | 对演练产生的日志做序列核对；需要时由能力契约的行为模型承担 | [S-8](v2/contract.md#s-8-第几次发出)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列) | 停机那一支的补写者与收场由 `capability.model-request-runtime` v2 S-33 给出（原 G-7）  |
| V-11 | **首 token 缺席是断言**：让运行时在首 token 之后、写响应体之前停机，恢复后核对没有任何一条把这一次写成「没开口」 | 故障注入（杀进程）＋ 恢复演练 | [S-18](v2/contract.md#s-18-首-token-缺席是一条断言) | 停机后谁补写、首 token 怎样判得出，由 `capability.model-request-runtime` v2 S-33、S-15 给出（原 G-7），演练需要它的提供者  |
| V-12 | **写下即不变**：补账之后原响应体逐字不变；原始响应附件被清理之后响应体逐字不变 | 规范场景演练 | [S-19](v2/contract.md#s-19-用量与费用)、[S-20](v2/contract.md#s-20-上游原始响应留存)、[S-22](v2/contract.md#s-22-写下即不变) | 按本行提供者责任验证 |
| V-14 | **晚到的那一条标 `late`**：①让属于某个运行的调用在「已出门」之后、响应体写下之前停机，新的一次尝试对账补写——核对那一条带 `late: true`、`attemptId` 是出门所在的那次尝试、承载它的条目归到哪一组；②一次尝试被取代时让一次发出仍在途，之后结算——同样带 `late`；③当场写下的、尝试仍是当前的那一条**不带** `late`；④不属于任何运行的调用停机后补写的那一条不带 `late` | 故障注入（杀进程）＋ 恢复演练 ＋ 栅栏演练 | [S-8](v2/contract.md#s-8-第几次发出)、[S-35](v2/contract.md#s-35-晚到的那一条) | 需要模型请求运行时与尝试栅栏的提供者；③④是反向断言——一个「补写的一律标 `late`」的实现过得了①却过不了④  |
| V-13 | **回复在落盘之前被否决**（[examples.md E-8](v2/examples.md#e-8-同一个-run-里前后两次调用前一次的回复被否决) 的场景）：挂一件对第一份回复必定否决的拓展件，核对①那次调用以 `complete`／`truncated` 加 `replyDisposition = { vetoed }` 结束、不带 `failure`；②**这次调用没有第二条响应体**，再试的那一条属于一个新的 `callId`、`dispatch = 1`；③被否决那份 `reply.id` 在会话日志里找不到消息，落盘那份找得到；④两笔用量与费用都在账上 | 规范场景演练；需要 `data.loop-extension` 的否决落点与模型请求运行时的提供者 | [S-13](v2/contract.md#s-13-收场与其余成员的条件关系)、[S-14](v2/contract.md#s-14-回复与已交付部分)、[S-17](v2/contract.md#s-17-首-token-与时序)、[S-19](v2/contract.md#s-19-用量与费用)、[S-23](v2/contract.md#s-23-同一次调用的响应体序列) | ②是这条的分量：把再试写成同一调用的 `dispatch = 2`，Schema 放得过（[examples.md 第三节](v2/examples.md#三schema-挡不住但同样非法的)），只有数 `callId` 才看得出首 token 规则被开了例外  |

## 已知缺口

真实费用来源归传输提供者与 S-19：本地价目表或 token 估算不能当成 actual cost_usd，没有来源时写 unknown。OpenRouter usage.cost/cost_details 的字段、单位与采用 SDK 事实从 [transport research](../../../../research/model-request-transport-sources/evidence.md#e11-openrouter-官方文档usage-accounting2026-09-23-抓取) 核对；不要复制旧 SDK 未读取字段的动态状态。费用读取与单位换算仍须真实提供者验证。

## 结果与反例

### 响应形状的校验方法与限制

实例第一、二节每个 JSON 块作为根模式求值；CostCorrection 不是响应体，不参与根模式校验。Schema 只判合法与否，具体拒绝值仍按 S-27 次序验证；第三节形状合法的语义反例另在实现中验证。形状检查不支持 V-2 之后的场景义务。

## 形式化工件

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[包入口](README.md#版本包)：本契约没有状态转移，收场条件是一张有限判定表，由 Schema 与正反实例逐格覆盖；
[S-23](v2/contract.md#s-23-同一次调用的响应体序列) 的序列性质是写入者的行为，需要行为模型时归 `capability.model-request-runtime`。
**这不是把义务省掉**：它被改写成了 V-1（形状）、V-10（序列核对）与 S-29～S-34 六条规范场景。

## 变化的影响

规范内容归 [v2 contract](v2/contract.md) 及专题现行版本入口。共享 Usage/Cost/CallId/RunId/AttemptId、ContentBlock/AttachmentRef、消息结局、完整档案快照和 FailureCause 改动时须同步真实写者与实例。

- ResponseId 在已出门时铸，响应写者沿用；响应归属由承载条目给，attemptId 只标发出所在尝试。参数与调整/丢弃清单同已出门逐项相同，形状家归本契约，messages 避免环逐字同写，需同步维护。
- 回复 vetoed 不开同 call 的 dispatch2，再试是新 call；consumed 不触发 after_model_call，两笔费用与用量仍结算。系统取消/撤除放弃流时 interrupted{run_cancelled} 不带回复但有 delivered；用户取消允许已交付回复，不能混同。
- inBand 只取 true 且与 statusCode 同在，标流内 code 而非 HTTP。首 token 缺席是断言，补写者须读已开口，不靠响应体缺成员推未开口。出网前适配事实须交回已出门写者，随结果才回传不足。

## 恢复时序候选

[MR8 contract](v8/contract.md) 的 sentAt:null 只用于已有锚点的 interrupted，真实已知时刻保留，不代填时间、不据 null 重发。runtime/response/codec owner 须验证锚后未 send 与 send 后时刻丢失两个相同完整前缀、opened 保留、已知时刻保留、零 HTTP、未知门与完整批认回、Pending/独立 invoke 禁 null。RT9 RecoveryTiming 正配置与四负控分别执行；Schema不提供真实事实或权限证据。

固定计划与实际发送按 MR8 S-9/S-11 与 RT9 S-33：正常发送必须一致；零 send/不可判中断原样还原锚点适配结果，不猜费用或重试。runner5 仅消费 MR7 S-10/S-14/S-36，不以实现私用根 Schema 强迫契约连锁升版。

## MR10 验证入口

[v10 verification](v10/verification.md) 拥有新引用、发布与 opened 顺序义务，继承形式资源结果不能外推；真实提供者、装配、网络、授权、存储故障与性能按对应 owner 验证。

## v11 ACK 验证入口

[v11 contract](v11/contract.md) · [consumer impact](v11/consumer-impact.md) · [verification](v11/verification.md)。ACK确认、真实处分与清理分别观察。固定编码/摘要向量及相等/不等关系逐例验证；TLC AckLifecycle/AckProgress 与八负控按 ACK-README 的2calls/2consumers、单Focus、至多一次crash与显式公平性判读。继承工件不计新ACK覆盖；真实授权/存储/内存清理/未知写入组合不由模型或导航通过代替。
