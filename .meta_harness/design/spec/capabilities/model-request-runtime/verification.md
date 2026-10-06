# 验证义务与有限覆盖范围

本页维护 `capability.model-request-runtime` 的验证义务、责任接缝和模型有限范围。当前承诺及采用范围从[架构维护入口](../../../architecture/README.md)、[规格身份清单](../../../registry/README.md)与[当前契约 v12](v12/contract.md)定位；下文精确版本导航用于确定相应验证输入，不能从某版通过推定其他版本通过。
已迁公共定义归 `packages/core/model-request-runtime`；未迁完整接口按精确规格和节点继续消费。提供者归 `packages/model/model-request-runtime-local`；具体采用的终态由节点设计及模块旁 SPEC 维护。十五操作、必要独立函数和所有真实消费者均须按当前采用承诺验证。
接受、实现和验证分别判断。本页不声明当前实现通过；提案、修复过程、评审及每次运行输出留执行工作树 `tmp/`。模型与配置是可复跑资源，语法解析、登记检查或文件存在均不代证性质或真实行为。

## v7 发布前破坏性演进

MP5 / Directory5 / MS6 / MR7 / LC6 / RT7 / runner5 的坐标和共享结构须精确一致，既有 IV、CB、日志、资产和 hooks 依赖不自动升级。核对 `$id` / `$ref`、形状及形式字节，不把字节相同解释为形式工具执行。
不兼容输入沿既有边界拒绝，不走旧 codec、不降级/回填，不改写或清空用户数据。已受理工作、固定快照、未知结果、原批认回、恢复、释放结算仍有原 owner；格式拒绝不能丢弃责任。输入上限、Pending 回复、完整重试历史和 S-34 失败主体重取仍须真实回归。

## v3 变化与验证义务

规范与消费者关系见 [v3 契约](v3/contract.md)。读取时点、evaluate 和错误零出网由 runtime 拥有；输入 IO/一致性归 evaluation-input-store，真实生产者及授权由真实装配验证。

- S-66 captured standing 只作配方，每次以真实本机权威或明确采用副本另核当前成员有效性/内部权限，保持 AE PRE-3；不以旧 captured effective 放行，也不逐请求向中心更新会话身份/roles。当前失效、未知、无权和固定根 C16 失配均须零 HTTP，不改 holding 迁就根。
- 当前 model/settings、basis 原选择窗口、每次实际发送现求的两个时限和旧调用固定绑定分别验证。新会话显式 selectModel 写真记录，不猜初选；历史 manifest 读面不能代证当前设置。
- 完整失败主体保留原 profile/messages 绑定；已有发出后的续接规划拒绝按 invalidInput 保持原状态，零次发出保留首次模态终结。bad-tool→repair、new-modality 零 HTTP 须有真实场景。
- 正常已知 run_cancelled 与锚点未知隔离后的 S-33 恢复分开。无耐久中断意图时，只据 opened 有无走 runtime_lost 两支，不捏造跨失联停止原因。
- 未知回执/取消后迟到提交须先隔离、unavailable/零内容/零重发/无普通响应。旧追加方实际停止、有效栅栏与合法完整权威读取后恢复；保留中断意图优先，按 opened 精确结算、timing 一致、账恰一次。

真实故障必须覆盖：已提交丢回执、未提交回执未知、取消门等待后迟到成功、旧追加未静止、旧 tail 假空、无 Run 旧 owner 未退出。owner 为 runtime、真实日志及验收装配，现有有限模型不含这些真实 IO。

| 验证对象 | 必须执行的证据 |
|---|---|
| S-53 精确绑定、恢复旧版缺席 | `AdaptationBinding.tla` 正向配置、两个预期反例；真实日志恢复后移除旧实现，核对账不联网/再发 unavailable |
| S-54～S-56 首内容门与取消 | `ContentGate.tla` 正向配置、两个预期反例；所有快照/增量读面门前无内容，gate reject 与 abort 后迟到 resolve |
| S-54 发送前取消与 S-60 retryDelay | 表示校验/规划拒绝/取消的终局次序；none/full/half/decorrelated 的 u=0、u趋近1、D=0、退化区间及非法配置向量 |
| S-9/S-10/S-21/S-66 当前输入与纯求值 | captured standing 只作配方、当前本机成员有效性/内部权限另核、真实 session/root/workspace 配方、当前持有/配值、租户错配、源版本竞争、无 model 无锁、显式初选、每次发出时限现求 |
| S-54/S-60 公开函数独立性 | 无会话/租户/存储/Cordis 的独立消费者；仅一次 send；无合成业务身份；纯判定零副作用 |
| S-57～S-59 传输构件 | 已有 T1–T20/SC1–SC3 不因本版省略；精确规划→一次 send→流读；原始参数、推理、计费、身份不外传 |
| S-61 宿主生命周期 | 登记与停止竞争、在途取消实际收口、结算失败与释放次序；独立验证真实组合 |
| S-62 观察者 | 错会话同 callId、错 dispatch、snapshot/delta 衔接、慢消费者按事件数与字节数分别触顶、消费异常 |
| S-63 诊断 | 正常/拒绝/失败/取消/恢复全链关联，秘密哨兵、缺 usage 与 0 区分、导出失败、关键诊断缺口状态；对照耐久锚点失败 |
| 原有运行时义务 | v2 原规范场景与三条真并发/崩溃验收继续；新类型依赖与行为须重新过符合性 |

### v3 形式范围与负控

[v3 formal](v3/formal/README.md)拥有精确常量和映射。Adaptation 三负控对应 NoAcquireRetired、NoDisposeWithLease、BindingPinned；RegistrationDoesNotAdopt / AdoptionFailureKeepsProfiles 仅有正向配置，不宣称变异有效性覆盖。模型不含真实资源释放、追加失败或多会话。
ContentGate 正向检查 NoContentBeforeGate；NoWait 负控反驳它，IgnoreCancel 负控反驳 action property NoRevealAfterCancel。AdaptationBinding 的 UseLatest / MissingFallback 分别反驳 SentUsesOriginal / SentMatchesRecord。终态允许无动作时关闭 deadlock 检查，不作死锁自由主张；解析失败不是指定负控反例。

默认重试身份唯一归 runtime S-67 的 `{category:loop_extension,name:"omne-official:default-retry"}`，位置 after_model_call、维度 ending:failure；runner 实际识别须独立验证，不增设 power/onError 或把 retry/record 当作 Power。

G-25 的精确消费、G-26 的注册/撤除组合、G-27 的 retryDelay 向量及技术采用分别核对；G-9/G-20 的当前输入/初选来源不由候选端口存在关闭。G-5/G-6/G-11/G-12/G-17/G-22 的验证责任按当前契约拥有者接续。

## 证据义务

### 形式工件

模型、配置及断言与条款的映射见 [v2 formal](v2/formal/README.md)。下表规定有限前提，不登记旧执行结果为当前实现证据。

| 条款与性质 | 模型／配置 | 前提 |
|---|---|---|
| [S-15](v2/contract.md#s-15-两个锚点先写后行) 两个锚点先写后行；[S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢) 结算幂等、先到者赢；[S-22](v2/contract.md#s-22-同一次调用的发出序列) 第 3、4 条（开口之后跨尝试不再发出、只在策略类故障或无声失联之后再发）；[S-30](v2/contract.md#s-30-dispatchagain) 守卫 1、2；[S-31](v2/contract.md#s-31-interrupt) 意图先落；[S-33](v2/contract.md#s-33-reconcile) 对账（失联发出被追补且不重发；没发出过而有中断意图的写调用终结） | `Invocation.tla` ＋ `Invocation.cfg`（允许回退）、`Invocation_NoFallback.cfg`（不允许回退）；formal task `model-request-runtime-v2-invocation`、`model-request-runtime-v2-invocation-no-fallback` | 常量：2 家、至多 3 次发出、至多 2 次停机；对「出网、首 token、四种收场、中止、撤除结算、对账」弱公平；写下一条响应体是原子的 |
| 上一行里六条断言**能失败**：`NoDispatchAfterSpoke`、`ContinuationOnlyAfterStrategyOrSilentLoss`、`NoDispatchAfterSeen`、`QuiescentSettled`、`NoDispatchAfterInterrupt`、`AtMostOneBodyPerDispatch` | 六份 `Invocation_Validity_*.cfg`（各拧反一个开关、各只检查那一条） | 同上 |
| 续接、换家两条路可达 | 两份 `Invocation_Reach_*.cfg` | 同上 |
| [S-22](v2/contract.md#s-22-同一次调用的发出序列) 第 2、3、5 条（首次第一家、续接同一家、只发给允许的家）、[S-30](v2/contract.md#s-30-dispatchagain) 守卫 3、[S-28](v2/contract.md#s-28-opencall) 出门前检查不过即无发出 | `ProviderAllowed`、`FirstDispatchFirstProvider`、`ResumeSameProvider`、`UndispatchedHasNoDispatch` | —— |

前两行的六份 validity-check 各拧反一个开关，分别检查 NoDispatchAfterSpoke、ContinuationOnlyAfterStrategyOrSilentLoss、NoDispatchAfterSeen、QuiescentSettled、NoDispatchAfterInterrupt、AtMostOneBodyPerDispatch，预期指定反例，不登记为正常 formal task。续接/换家 Reach 配置预期给见证，也不登记为正常任务。
ProviderAllowed、FirstDispatchFirstProvider、ResumeSameProvider、UndispatchedHasNoDispatch 被动作前置写死，是按构造成立，不作为可反驳的证据；真实证据仍为 S-41 与实例 §4/§8/§11。

**模型没有覆盖、不得写成「已由模型覆盖」的**：追加口的原子性与按 `ResponseId` 幂等、回复消息与响应体同一提交、`reply_pending` 与 `settleReply`、绑定落在「已出门」上（含追补体参数三项的来源）、模型侧到达装配的宿主前提（[S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺)）、`released{cause}`、`session` 归属、对账由谁触发、只读守卫 `canDispatchAgain`、成因分类表的内容、脱敏、凭据取值、合法目标与展示列表、投影、拓展件与 loop 的行为（见 [formal 入口「模型吸收了什么」](v2/formal/README.md#模型吸收了什么不写成已由模型覆盖)）。它们的证据在下两表。

### 规范场景与测试

| 条款与性质 | 场景／测试 | 证据形式与前提 | 验证范围 |
|---|---|---|---|
| [S-22](v2/contract.md#s-22-同一次调用的发出序列)、[S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢) 发出序列与一次发出一条响应体；[S-29](v2/contract.md#s-29-dispatch) ⑧、[S-30](v2/contract.md#s-30-dispatchagain) ⑧ 再发时取不到凭据写 `released{cause}`；[S-49](v2/contract.md#s-49-settlereply) 被否决的那一条由本能力写 | [S-41](v2/contract.md#s-41-两家发出第一家-429-未开口第二家完成)（含凭据一支、否决一支） | 脚本化传输 → 真实会话日志；核两条响应体、两份账；凭据一支核调用终结是 `released{cause: credential_unavailable}` 而非 `undispatched`；否决一支核 `replyDisposition = vetoed`、日志里没有回复消息 | 真实行为须另验 |
| [S-15](v2/contract.md#s-15-两个锚点先写后行)、[S-33](v2/contract.md#s-33-reconcile) 停机前后；[S-7](v2/contract.md#s-7-一次调用绑定了什么) 绑定从「已出门」读 | [S-42](v2/contract.md#s-42-开口之后断流不重发)（含路由留痕一支）、[S-47](v2/contract.md#s-47-用户叫停之后停机不再发出) | **故障注入**：在两个锚点前后各杀一次进程，新进程对账；停机与对账之间改档案，核追补体与续接用的是「已出门」上的绑定；参数一支核追补体上的 `parameterAdjustments`、`droppedParameters` 与「已出门」逐字相同、`route.parameters` 是由它还原的实际送出那一组（[S-33](v2/contract.md#s-33-reconcile) ④） | 真实行为须另验 |
| [S-27](v2/contract.md#s-27-selectmodel)、[S-7](v2/contract.md#s-7-一次调用绑定了什么) 切换先落后生效、不作用于在途；[S-28](v2/contract.md#s-28-opencall) ①④ 用交来的 `target`、不重算 | [S-43](v2/contract.md#s-43-切换先落事实后生效)（含交接一支） | 集成；另一支让模型切换的记录写不进；交接一支在 `effectiveModel` 与 `openCall` 之间插入一次切换 | 真实行为须另验 |
| [S-11](v2/contract.md#s-11-合法目标集合)、[S-12](v2/contract.md#s-12-展示列表)、[S-9](v2/contract.md#s-9-选中模型) 已下架、恢复在册后自然接上、模态挡在这一刻 | [S-44](v2/contract.md#s-44-已下架的档案)（含恢复一支）、[S-45](v2/contract.md#s-45-模态不兼容挡在算合法目标那一刻) | 纯计算的表驱动测试 ＋ 集成 | 真实行为须另验 |
| [S-10](v2/contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步把路由名解析为一行（先滤已撤回与范围不允许、再取最具体；模态与缺凭据不滤；作用在锁之上；`selectedBy` 不变）；[S-11](v2/contract.md#s-11-合法目标集合)、[S-12](v2/contract.md#s-12-展示列表) 以路由名为元素、每个名字一条、主标取胜出行的来源、被盖住的行列在下面带 `overridden_by{scope}`；[S-19](v2/contract.md#s-19-凭据每次发出现取取值只交给传输适配) 按覆盖之后那条的来源取凭据、自建档案不用出厂格那一把 | [S-48](v2/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行)；[examples §9](v2/examples.md#9-同路由名按层覆盖一个名字一条落到胜出行场景-s-48) ；[examples §10](v2/examples.md#10-三层同名锁与已撤回的行) | 集成：目录替身配两种部署（有无出厂格那一把）、租户配与不配两种、同名一至三层与锁、已撤回的行（被覆盖方与选中方各一次）；核 `route.profile`、`selectedBy` 与 `route.credentialScope` | 真实行为须另验 |
| [S-18](v2/contract.md#s-18-成因按来源分类三类事实由守卫兑现) 成因按来源、[S-20](v2/contract.md#s-20-写入之前脱敏) 脱敏 | [S-46](v2/contract.md#s-46-成因按来源分类与脱敏) | 哨兵串扫全部记录；前提：`status_cause_table` 与三个脱敏参数有值（G-5、G-6） | 真实取值前提 G-5/G-6 |
| [S-13](v2/contract.md#s-13-模态投影读到的必须追到日志尾) 投影追到日志尾 | **性质测试**：任意日志前缀上，追补之后的读 = 对全日志重算；**伸缩测量**：读的代价与历史长度无关 | 随机日志生成器 | 真实行为须另验 |
| [S-35](v2/contract.md#s-35-默认重试件可替换) 默认件逐家一遍、不允许回退时同家至多再试一次 | 表驱动测试（它是一个纯函数） | —— | 真实行为须另验 |
| [S-14](v2/contract.md#s-14-缺席时的默认答案与失败集合) 失败值闭合与判定次序（含 `callId` 属于别的会话、`reply_pending` 上的 `alreadyEnded`） | [examples §8](v2/examples.md#8-每个失败值一个反例) 与次序回归例 | —— | 真实行为须另验 |
| [S-49](v2/contract.md#s-49-settlereply) 交回之后的收口、[S-50](v2/contract.md#s-50-candispatchagain) 只读守卫与 `dispatchAgain` 同一张表 | [examples §11](v2/examples.md#11-交回之后的收口与只读守卫) | 表驱动：对同一组调用状态与计划，`canDispatchAgain` 的答案与 `dispatchAgain` 的判定逐条相同；`settleReply` 幂等与 `alreadyEnded` | 真实行为须另验 |
| [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条 | 适配层的契约测试（脚本化上游）：单家、禁止回退、一次发出之内不自行重试、状态码、首 token 映射、只用交来的那一把凭据、不送会话标识、不换占位文本、固定 base URL、改值与丢项在出网之前定下并与实际送出的一致、模型侧工具名不做逆转写 | 前提：G-10 的 basis 条目 | 真实行为须另验 |
| [S-51](v2/contract.md#s-51-模型侧到达装配前提的承诺) 模型侧到达装配的七条宿主前提（`capability.stream-assembly/v2#S-28` 第 1、2、4、6、7、8、9 条）与不做逆转写；[S-36](v2/contract.md#s-36-宿主停止与撤除) 撤除走放弃 | [S-52](v2/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)（一次发出、两次发出、两个会话同一个 `callId`、「已开口」写不进、宿主停止时在途，五支） | 脚本化传输 ＋ 结构化日志的读取：核被拒的增量只报一次且日志里有带齐四样的事件、观察者刷新之后读到的是装配结果、收场之后同一次发出的迟到事件不进、上一次发出的迟到事件不进下一次、按（会话，目标）路由、工具调用块保留模型侧名字、没砍时响应体没有 `trims`；故障注入让「已开口」追加失败；宿主停止与本能力撤除各一次 | 真实行为须另验 |
| [S-11](v2/contract.md#s-11-合法目标集合) 末段、[S-28](v2/contract.md#s-28-opencall) 出门前检查第 3 行：传输承载是可发出的另一条前置 | [S-45](v2/contract.md#s-45-模态不兼容挡在算合法目标那一刻)（传输一支）、[examples §6](v2/examples.md#6-模态不兼容挡在算合法目标那一刻场景-s-45) 语音那一行 | 集成：据点传输配成送不出某一模态；核合法目标不变、出门前以 `modality_mismatch` 挡下 | 真实行为须另验 |

### 由别处承担、本契约只写明要求的

| 要求 | 由谁承担 | 本契约位置 |
|---|---|---|
| 回复消息与响应体同一提交、追加按 `ResponseId` 幂等、结算不受栅栏拒收 | 会话日志追加口：`capability.session-log` v2（S-8、S-10 第 3 条、S-17）；整本日志的真承接者是 loop 那一程 | [S-17](v2/contract.md#s-17-结算一处按序幂等先到者赢)、[S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) |
| 上交条目、中断提醒、用户取消运行时宿主停止前先中断 | loop | [S-3](v2/contract.md#s-3-本契约明确不承诺什么)、[S-36](v2/contract.md#s-36-宿主停止与撤除) |
| 跨进程的新鲜度、秘密送达、转发链不越过锚点 | 组合契约（G-12） | [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证)、[G-12](v2/contract.md#十二已知缺口) |
| 传输适配须兑现的十一条 | pi-ai 传输节点的符合性测试 T-1～T-11（[`realization/packages/model/pi-ai-transport`](../../../realization/packages/model/pi-ai-transport/verification.md)；采用的 fork 边界不得依赖上游库缺省行为）。本契约**不以坐标依赖**那个包：它不是契约，catalog 不登 | [S-38](v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条、[G-10](v2/contract.md#十二已知缺口) |

## 变化的影响

历史形成过程不作为现行承诺；政策值、记录形状和操作判定按适用精确契约核对。真实验收还须覆盖：

- HTTP 状态与带内整数 code 的来源分开，后者保留 inBand:true；无整数 code 为 unrecognized、无状态码且保留 upstreamError。queued 的本地等待超时对上游零请求，不误报 upstream_unavailable。402/403 的成因映射按 S-18 与真实来源前提验证，不推成策略换家。
- 模型面工具名经资产注册表解析。属于 Run 的调用沿同 session/run/attempt 报告快照，不属 Run 的沿当前快照；report 与 run 同在同缺，续接重取原报告范围，不做模型面名字逆转写。
- 规划拒绝在 opened/HTTP 前处理；缺工具回复或 ToolInternalMessage 等调用方非法输入不伪装 undispatched 成因。opened 持久保存 parameterAdjustments / droppedParameters，恢复的实际 route.parameters 从原事实还原。
- 凭据每次发送现取、只交 transport；租户失败不回落 factory，自建档案不取 factory。原调用消费租户及成本身份保持；usage/cache/cost、缺 usage 与零 usage 分开。
- 不从未知上游输出上限猜参数修正；wire hints 按路由名逐码点明确提供，不按前缀猜。具体事实与采用范围由 profile/transport owner 维护。

## v4 结算与未知提交

[v4 契约](v4/contract.md)、[实例](v4/examples.md)与[消费者影响](v4/consumer-impact.md)拥有条件追加和恢复规则；完整消费者传播包含 runtime、JSONL、外部回复、runner 写方及验收应用，单个提供者采用不自动迁移消费者。

| 施工验收项 | 规范落点 | 真实验证义务 |
|---|---|---|
| 1 全部 append 显式 condition，保持 fence 分类 | S-8/S-68；实例 V-7 及失败分支 | 完整调用方清单及旧三参数拒绝；须验证全部真实消费者迁移 |
| 2 全部 withRun 结算方同次完整前缀、原 attempt、全批 tailEquals；无 run 原义 | S-69/S-72；V-1～V-5/V-7/V-14 | Settlement 三正配置与真实回复/日志交错；模型与真实组合须分别验证 |
| 3 THIS 零写、身份/原值、完整批认回 | S-70；V-4～V-8/V-10/V-13 | NoOrphanMessage、ClaimsWholeBatch、UnknownNotAbsence 正负配置；须验证共同 codec/真实读回 |
| 4 不增领域状态或失败、耗尽责任保留 | S-14/S-71/S-72；V-11～V-13/V-15 | PendingOwned 正负配置及逐操作返回/恢复故障验收 |
| 5 显式可替换争用政策、无默认/紧循环/模型重试许可 | S-71；V-10/V-11 | 参数缺失、耗尽、取消、无限争用有限退出；须验证真实政策符合性；有限模型不给无饥饿证明 |
| 6 unknown opened 强门/物理旧写者停止 | S-17/S-33/S-70；V-8/V-9/V-15 | NoSettlementThroughUnknownOpened 正负配置；真实门/网络/append/unfenced 写者停止须验证，模型 StopOld 仅假设 |
| 7 共同物理日志/全写方键、生产 Run 和合法完整读取 | S-69/S-70/S-73、G-28～G-30 | 有限模型不代证文件 IO、读取权限或生产 Run 认法；原 owner 缺口保持 |
| 8 多值头保持原表示 owner 缺口 | G-31 | 须核对当前共享响应形状、core/codec、全写方和真实交接；TransportFailure 值不得冒充另一版合法持久表示 |
| 9 双向竞争与未知实例齐全 | [15 个新场景](v4/examples.md#v4-增量结算竞争与恢复)，旧操作/失败实例继承 | 规范向量与真实执行分别验收 |

[Settlement formal](v4/formal/README.md#结算组合模型)有三正配置和六指定负控；继承模型按原精确范围解释。THIS 零写、原身份/原值、完整批认回、未知不等于缺席、pending owner 和强门须分别可反驳。有限模型的 StopOld 只是前提，不证明真实网络、append 或 unfenced 写方实际停止；SANY 只检查解析。

进展前提为合法完整前缀、实际停止/恢复、政策许可内可得提交机会，恢复真实被调用且可执行。触发一次收口或保留 owner 不保证未来成功、获调度或无条件时间界；前提不满足仍有未完成责任。
无键 selectModel 的未知命令不能由当前选中值识别，不增加恰一次、自动重放或回滚；本次待确认责任也不得否认已耐久响应/终结。当前模块 SPEC 的无键选择收口另须符合性验证。

## v5 原始头交接

[v5 契约](v5/contract.md)、[实例](v5/examples.md)、[消费者影响](v5/consumer-impact.md)与[formal](v5/formal/README.md)是精确输入导航。rawHeaders 从单一 send 权威经 invoke 到完整响应保留原值，read 不另创头权威。

| 本 topic 局部标签 | 可失败的证据义务 | 责任与前提 |
|---|---|---|
| RT5-H1 | string／ordered string[] 的原形、顺序、重复、空串/空数组/空 map/缺席；非法 map/混型拒绝；自有不可变；原表示校验和发送前取消优先不变 | core/transport/runtime 与 response owner；公开端口/完整 MR5 形状符合性及变异负控 |
| RT5-H2 | 同次 send→invoke，真实 TLS 的成功/HTTP 错误/带内失败/读体或解析中断/门失败/取得头后取消全分支保留；成功 R 不透明、read 无另一头权威 | transport/runtime owner；真实组合和取消/关闭故障场景 |
| RT5-H3 | 仅头不触发门/首 token、snapshot/onAccepted/arrival 不交头，模型上下文/默认人类呈现/diagnostic detail 无头对象 | runtime/observer/各消费 owner；边界观测和头当 token 负控 |
| RT5-H4 | 原参数/绑定/实际值/usage/cache/cost、四 outcome、最多一次 send、完整操作拒绝/失败、SL3 整批/unknown 与实际停止全部回归 | runtime/host/日志/回复 owner；原操作及37模型生产验收须单独执行 |
| RT5-H5 | 完整 MR5 原值→所有真实写方→一次 append→关闭旧 writer/reopen；同批身份/账/原批优先、unknown 强门与秘密哨兵 | core/codec/runtime/所有回复写方与日志 owner；真实日志与故障负控，不能只测 map JSON 往返 |
| RT5-H6 | public 制品和双语 literal 严格消费完整值；compiled 形状损坏、取消丢值、头当 token 与旧 MR4 错接等负控能失败 | core/运输/运行时/codec owner；先明确公开入口和精确采用；不自决 wrapper/key 的历史兼容/混用 |

实例的同标签行给出输入与期望；测试驱动显式政策不成为产品默认，G-6 的真实取值须由政策 owner 确定。Schema 不证明采集、交接、脱敏或持久过程，readonly 不证明自有不可变。
原四模型/十九配置的六正/十三负保持 formal 映射；rawHeaders 没有进入继承模型，CancelEventuallyStops 不代证新头性质或真实资源停止。负控只作 validity-check。

G-28 的生产 Run 终结认法归 loop/Run/runtime/回复 owner；G-29 的共同业务键、真实提交/恢复/实际停止归日志、runtime及全部回复方；G-30 的合法完整前缀授权/供给归访问授权、宿主、日志与结算者；G-31 的当前头形状、core 接收、投影、全写方及真实链须逐项接续，不以表示表达完成替代整体完成。产品后续 revision 不自动采用，超出当前精确来源范围由对应产品 owner 核对。

### 静态检查的边界

编号、操作九项、依赖、冻结字节和登记资源只验证结构。formal=skip 不执行形式工具；formal=registered 只检查登记。局部检查与完整组合分别判断。

## v6 最终计划、Pending 与完整历史

[v6 契约](v6/contract.md)、[实例](v6/examples.md)、[消费者影响](v6/consumer-impact.md)维护对应规范；共享值唯一归 MP/MS/MR/LC data owner，不在能力复制 Schema。
固定快照含完整 cap/upstreamInputLimits，每次实际 plan 在新锚点/HTTP 前计量，公开函数与服务同门；准确超限与不可判分开。PendingModelResponse 不含 disposition/late，仅显式处分后构造持久响应，在真实提交点判断 late。失败主体有完整 retryConclusions，默认件只计自身已生效结论，已给未发也计入；自定义、跨调用与失联续接不冒充自身重试。

### 证据义务及状态

| 义务 | 规范落点 |
|---|---|
| 完整操作动作链、headers、credential、cancel/late/unknown 实际组合 | 原实例及 RT5-H1～H6、S68～S73 |
| 每模型/供应商的可靠计量、所有实际发送模态/工具/协议、UTF8最终体 | RT6-I1～I9、S74、FinalPlan |
| 完整pending数据交接、无默认处分、持久schema门与多写方 | RT6-P1～P3、S75、PendingReply |
| 已给未发、[A,A]两历史、跨调用与自定义结论、旧格式拒猜 | RT6-R1～R4、S76、RetryHistory |
| TLC 正反配置 | v6/formal/README.md 的精确映射 |
| 数据 Schema 与真实生产读取、Run 终结认法 | MR6/LC5/MP4 owner；G28～G35 |
上述实际责任分别归计量/transport/runtime 提供者、MR/core/codec/全部回复写方、LC/runner/日志提供者及生产 Run owner。结构或通用 bool/fixture 不关闭真实来源缺口。

[v6 formal](v6/formal/README.md)的 FinalPlan/公开无日志路径、PendingReply、RetryHistory 有四正/六负，目标分别为 CheckedBeforeEffects、SameFixedPlan、UnknownNotExceeded、NoInventedDisposition、CompleteHandoff、CountsOwnConclusions。解析失败不算负控通过。有限模型不证明实际计量、附件取得、Schema 完备、完整日志来源、真实多写方/资源或生产 Run；继承模型仍按前驱有限输入解释。

S-34 的失败主体重取须按 RT6-R5～R8 真验：awaiting_decision 且最近真实响应 failed，同一合法完整前缀决定状态、响应、dispatches 和完整历史；必要源不可判整体 unavailable，恢复后重复可重取。其他状态不带主体；读取无写/发送/凭据/计次副作用；后续 dispatchAgain 仍核当前状态/守卫/fence。此路径未建模，不冒称 RetryHistory 已覆盖。

## v8 估算计量保证

[v8 契约](v8/contract.md)与[formal](v8/formal/README.md)拥有估算、余量、优先级及精确模型映射；字段、Schema、实际 usage 的承诺不由模型或估算改写。
显式 multiplier≥1 为有限十进制、reserveTokens≥0 为整数；admissionTokens=ceil(estimatedTokens×multiplier)+reserveTokens。cap/事实 missing 先于政策校验，非法政策沿 malformed；准确超限与估算拒绝共存时优先准确事实。bytes/图数精确，actual usage 来自上游。须执行边界、缺项、非法政策、精确十进制、固定最终请求及来源区分向量。

### 证据义务与缺口

实际 tokenizer 的模型/供应商/版本依据、完整输入覆盖、任意有限十进制实现、37 模型生产认证与真实 IO 归对应计量/transport/runtime owner。MP G-15/RT G-33 的材料责任及 RT G-28 的生产 Run 终结认法保持；不以静态形状或模型关闭。

### 估算计量的模型限制

FinalPlan 区分日志与公开无日志路径，负控检查 CheckedBeforeEffects、SameFixedPlan、UnknownNotExceeded、EstimateCanProceed、MarginApplied、EstimateNotActual、MissingPriority、BytesExact、UsageFromUpstream。模型允许 estimated≤cap 而实际 token>cap 的发送，本契约不承诺排除它。有限模型/Schema 不证明真实 IO，registered 只核登记。

## 恢复时序

[RT9 契约](v9/contract.md)与[实例](v9/examples.md)拥有 interrupted 的 sentAt:null 及追补责任。保持真实已知时刻，不代填、不据 null 重发；首 token、真实账及计量政策仍按原输入。runtime/response/codec 须覆盖相同完整前缀的两支：锚点后未 send、send 后丢时刻；核 opened 保留、已知时刻保留、零 HTTP、未知门/完整批认回、Pending/独立 invoke 禁 null。

### 恢复时序的真实事实与有限范围

正常发送须与同次固定计划实际一致。零 send/不可判中断从锚点原样还原适配结果，不猜发送、费用或重试。保留原执行 owner 持有且经既有传输/归一化边界确认的同次可信事实/原完整批；不可得部分才 unknown。不从 sentAt:null 丢已知账，不采任意 caller 声称，不新增采信入口、账修补或 HTTP 重查。
RT9 RecoveryTiming 的一正/四负按 [formal](v9/formal/README.md)有限范围解释；旧模型不自动证明新时序。Schema 不证明 Scope、可用性或真实事实；恢复提供者、core 响应与日志 codec 的实际采用均须另验。

## RT11 引用、发布与 opened 次序

[v11 验证义务](v11/verification.md)拥有精确场景；ReferenceLifecycle、Publication、OpenedOrder 三新模型及九负控按相应 formal 输入解释。继承模型仍保留原有限范围；提供者、装配、真实网络、权限、存储故障和性能测量不由这些模型代证。

## v12 ACK后继

[v12 契约](v12/contract.md) · [消费者影响](v12/consumer-impact.md) · [验证义务](v12/verification.md)。ACK 确认、实际处分与清理分别可见；前驱接受状态不传递，证据义务不因目录或工件存在而完成。

### ACK 验证范围与限制

ACK 模型有限范围为 2 calls、2 consumers、单 Focus、一次可选 crash、显式公平性。继承模型不自动证明新增 ACK；真实提供者、授权、存储、内存清理及未知写方须独立组合验收。

### ACK 处分与恢复接缝

当前精确采用范围归节点 [v22 设计](../../../realization/packages/model/model-request-runtime/v22-acknowledgement-design.md#当前采用范围)；本节保留接缝验证要求，不改冻结 v12。后继表达参见 [v-next](v-next/README.md)，不能凭待并入导航授予采用状态。

- 暂存行为最近一次尚未确知零写的追加所用完整批。tailChanged 确知零写后重构批，必须在新追加可能生效前耐久更新；unknown 期间不覆盖。
- 删除失败/回执未知通过与 ACK 清理相同的耐久待办、可配置策略/调度构件重试唤醒；确切读到同行不存在才认已删。幂等重调不掩盖未知提交，须验证暂存字节归零。
- 默认崩溃恢复须实际停全部写方，再读权威前缀；确知缺席后结束物理责任、返回 unavailable、删暂存，消费者持自持值重调。策略继续/owner 代重送须 S-71 显式选择且发送前重核 S-99② 资格，不承诺自动重送。扩展模型 RecoveryRead/EndSettlement 只表达默认路径前提，资格重核未建模。
- 身份摘要/结构完整性不能取代 S-70/S-71 的完整值认回与缺席边界；规范理由由对应契约/当前节点设计维护，不保存候选比较过程。

#### 扩展模型的验证方法与限制

[v-next formal](v-next/formal/README.md)反例 A 负控检查暂存未随重构更新是否破坏 RecoveredMatchesFinal；B 检查不可读权威当缺席是否破坏 EndedMeansAbsent。正/负配置分别判断，有限模型不证明真实字节、耐久、权限或密码学。A/B 是 validity-check，不自动登记为正常 formal task，扩展结果不充当前驱冻结模型结果。

#### 真实并发验收义务（反例 C–E，对应节点 A22-V13/V14）

| 义务 | 落点 | 必须观察到 |
|---|---|---|
| C 原晚 writer 的 final 先落 | 节点 [A22-V13/V14](../../../realization/packages/model/model-request-runtime/verification.md)；结算写方/恢复 owner | ACK 前已取得发布许可的原晚 writer 先提交 final 后，新写不追加第二批：同处分认回原 final、异处分 `alreadyEnded`；暂存行仍自动删；`cleanup=released` 不回退 |
| D 部分碰撞/残批 | A22-V13；结算写方 | 新写命中 `alreadyRecorded` 部分碰撞/身份不符/残批：不报成功、不补残批、不换 ID；暂存行保留、阶段未完成、返回 `unavailable` |
| E 迟到 worker 的代际拒绝 | A22-V14；Storage 控制行 | 旧代际 worker 对新代际暂存行的写/删被代际比较拒绝；新行不丢、不被覆盖 |
该表是规格侧义务，不替代节点验证绑定。真实写方及 Storage 控制行须共同验收，cleanup=released 不证明处分、回滚或责任提前释放。
