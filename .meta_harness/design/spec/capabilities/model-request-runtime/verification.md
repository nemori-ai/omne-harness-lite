# 验证覆盖与实际证据

`capability.model-request-runtime` v1（candidate）的证据义务与执行状态。本文件可更新，位于规范版本目录之外；
结果始终绑定实际规范、模型与实现修订。

**当前状态**：第一轮独立评审之后的修复稿（另经 2026-09-25 修复波 1b 原地改，未改模型），行为模型在 2026-09-24 整组重跑（下文「实际执行」，输入、哈希与日志在主检出 `tmp/formal-runs/model-request-runtime-v1-2026-09-24d/`）；**没有实现，没有执行过任何规范场景或测试**。
模型检查的结论只对所列常量成立，**不是无条件证明**，也不代表任何实现符合本契约。

## 证据义务

### 形式工件

模型、配置与断言 ↔ 条款的映射在 [formal 入口](v1/formal/README.md)。

| 条款与性质 | 模型／配置 | 前提 | 状态 |
|---|---|---|---|
| [S-15](v1/contract.md#s-15-两个锚点先写后行) 两个锚点先写后行；[S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢) 结算幂等、先到者赢；[S-22](v1/contract.md#s-22-同一次调用的发出序列) 第 3、4 条（开口之后跨尝试不再发出、只在策略类故障或无声失联之后再发）；[S-30](v1/contract.md#s-30-dispatchagain) 守卫 1、2；[S-31](v1/contract.md#s-31-interrupt) 意图先落；[S-33](v1/contract.md#s-33-reconcile) 对账（失联发出被追补且不重发；没发出过而有中断意图的写调用终结） | `Invocation.tla` ＋ `Invocation.cfg`（允许回退）、`Invocation_NoFallback.cfg`（不允许回退）；formal task `model-request-runtime-v1-invocation`、`model-request-runtime-v1-invocation-no-fallback` | 常量：2 家、至多 3 次发出、至多 2 次停机；对「出网、首 token、四种收场、中止、撤除结算、对账」弱公平；写下一条响应体是原子的 | **本机跑过，退出 0、无反例**（2026-09-24 修复稿，见下）。**只有六条不变量有否定配置证明能失败**（下一行）；其余分类见 [formal 入口](v1/formal/README.md#配置与它检查什么) |
| 上一行里六条断言**能失败**：`NoDispatchAfterSpoke`、`ContinuationOnlyAfterStrategyOrSilentLoss`、`NoDispatchAfterSeen`、`QuiescentSettled`、`NoDispatchAfterInterrupt`、`AtMostOneBodyPerDispatch` | 六份 `Invocation_Validity_*.cfg`（各拧反一个开关、各只检查那一条） | 同上 | **本机跑过，六份均按预期出反例**（退出 12，2026-09-24）；不登记为 formal task |
| 续接、换家两条路可达 | 两份 `Invocation_Reach_*.cfg` | 同上 | **跑过，均按预期报出见证**（退出 12，2026-09-24）；不登记 |
| [S-22](v1/contract.md#s-22-同一次调用的发出序列) 第 2、3、5 条（首次第一家、续接同一家、只发给允许的家）、[S-30](v1/contract.md#s-30-dispatchagain) 守卫 3、[S-28](v1/contract.md#s-28-opencall) 出门前检查不过即无发出 | `ProviderAllowed`、`FirstDispatchFirstProvider`、`ResumeSameProvider`、`UndispatchedHasNoDispatch` | —— | **按构造，不作证据**：模型的动作前置把它们写死，条款被违反时模型不会失败。证据在下表场景 S-41、实例第 4、8、11 节 |

**模型没有覆盖、不得写成「已由模型覆盖」的**：追加口的原子性与按 `ResponseId` 幂等、回复消息与响应体同一提交、`reply_pending` 与 `settleReply`、绑定落在「已出门」上（含追补体参数三项的来源）、模型侧到达装配的宿主前提（[S-51](v1/contract.md#s-51-模型侧到达装配前提的承诺)）、`released{cause}`、`session` 归属、对账由谁触发、只读守卫 `canDispatchAgain`、成因分类表的内容、脱敏、凭据取值、合法目标与展示列表、投影、拓展件与 loop 的行为（见 [formal 入口「模型吸收了什么」](v1/formal/README.md#模型吸收了什么不写成已由模型覆盖)）。它们的证据在下两表。

### 规范场景与测试

| 条款与性质 | 场景／测试 | 证据形式与前提 | 状态 |
|---|---|---|---|
| [S-22](v1/contract.md#s-22-同一次调用的发出序列)、[S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢) 发出序列与一次发出一条响应体；[S-29](v1/contract.md#s-29-dispatch) ⑧、[S-30](v1/contract.md#s-30-dispatchagain) ⑧ 再发时取不到凭据写 `released{cause}`；[S-49](v1/contract.md#s-49-settlereply) 被否决的那一条由本能力写 | [S-41](v1/contract.md#s-41-两家发出第一家-429-未开口第二家完成)（含凭据一支、否决一支） | 脚本化传输 → 真实会话日志；核两条响应体、两份账；凭据一支核调用终结是 `released{cause: credential_unavailable}` 而非 `undispatched`；否决一支核 `replyDisposition = vetoed`、日志里没有回复消息 | 未开始 |
| [S-15](v1/contract.md#s-15-两个锚点先写后行)、[S-33](v1/contract.md#s-33-reconcile) 停机前后；[S-7](v1/contract.md#s-7-一次调用绑定了什么) 绑定从「已出门」读 | [S-42](v1/contract.md#s-42-开口之后断流不重发)（含路由留痕一支）、[S-47](v1/contract.md#s-47-用户叫停之后停机不再发出) | **故障注入**：在两个锚点前后各杀一次进程，新进程对账；停机与对账之间改档案，核追补体与续接用的是「已出门」上的绑定；参数一支核追补体上的 `parameterAdjustments`、`droppedParameters` 与「已出门」逐字相同、`route.parameters` 是由它还原的实际送出那一组（[S-33](v1/contract.md#s-33-reconcile) ④） | 未开始 |
| [S-27](v1/contract.md#s-27-selectmodel)、[S-7](v1/contract.md#s-7-一次调用绑定了什么) 切换先落后生效、不作用于在途；[S-28](v1/contract.md#s-28-opencall) ①④ 用交来的 `target`、不重算 | [S-43](v1/contract.md#s-43-切换先落事实后生效)（含交接一支） | 集成；另一支让模型切换的记录写不进；交接一支在 `effectiveModel` 与 `openCall` 之间插入一次切换 | 未开始 |
| [S-11](v1/contract.md#s-11-合法目标集合)、[S-12](v1/contract.md#s-12-展示列表)、[S-9](v1/contract.md#s-9-选中模型) 已下架、恢复在册后自然接上、模态挡在这一刻 | [S-44](v1/contract.md#s-44-已下架的档案)（含恢复一支）、[S-45](v1/contract.md#s-45-模态不兼容挡在算合法目标那一刻) | 纯计算的表驱动测试 ＋ 集成 | 未开始 |
| [S-10](v1/contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步把路由名解析为一行（先滤已撤回与范围不允许、再取最具体；模态与缺凭据不滤；作用在锁之上；`selectedBy` 不变）；[S-11](v1/contract.md#s-11-合法目标集合)、[S-12](v1/contract.md#s-12-展示列表) 以路由名为元素、每个名字一条、主标取胜出行的来源、被盖住的行列在下面带 `overridden_by{scope}`；[S-19](v1/contract.md#s-19-凭据每次发出现取取值只交给传输适配) 按覆盖之后那条的来源取凭据、自建档案不用出厂格那一把 | [S-48](v1/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行)；[examples §9](v1/examples.md#9-同路由名按层覆盖一个名字一条落到胜出行场景-s-48) ；[examples §10](v1/examples.md#10-三层同名锁与已撤回的行) | 集成：目录替身配两种部署（有无出厂格那一把）、租户配与不配两种、同名一至三层与锁、已撤回的行（被覆盖方与选中方各一次）；核 `route.profile`、`selectedBy` 与 `route.credentialScope` | 未开始 |
| [S-18](v1/contract.md#s-18-成因按来源分类三类事实由守卫兑现) 成因按来源、[S-20](v1/contract.md#s-20-写入之前脱敏) 脱敏 | [S-46](v1/contract.md#s-46-成因按来源分类与脱敏) | 哨兵串扫全部记录；前提：`status_cause_table` 与三个脱敏参数有值（G-5、G-6） | 未开始（被 G-5、G-6 阻断） |
| [S-13](v1/contract.md#s-13-模态投影读到的必须追到日志尾) 投影追到日志尾 | **性质测试**：任意日志前缀上，追补之后的读 = 对全日志重算；**伸缩测量**：读的代价与历史长度无关 | 随机日志生成器 | 未开始 |
| [S-35](v1/contract.md#s-35-默认重试件可替换) 默认件逐家一遍、不允许回退时同家至多再试一次 | 表驱动测试（它是一个纯函数） | —— | 未开始 |
| [S-14](v1/contract.md#s-14-缺席时的默认答案与失败集合) 失败值闭合与判定次序（含 `callId` 属于别的会话、`reply_pending` 上的 `alreadyEnded`） | [examples §8](v1/examples.md#8-每个失败值一个反例) 与次序回归例 | —— | 未开始 |
| [S-49](v1/contract.md#s-49-settlereply) 交回之后的收口、[S-50](v1/contract.md#s-50-candispatchagain) 只读守卫与 `dispatchAgain` 同一张表 | [examples §11](v1/examples.md#11-交回之后的收口与只读守卫) | 表驱动：对同一组调用状态与计划，`canDispatchAgain` 的答案与 `dispatchAgain` 的判定逐条相同；`settleReply` 幂等与 `alreadyEnded` | 未开始 |
| [S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条 | 适配层的契约测试（脚本化上游）：单家、禁止回退、一次发出之内不自行重试、状态码、首 token 映射、只用交来的那一把凭据、不送会话标识、不换占位文本、固定 base URL、改值与丢项在出网之前定下并与实际送出的一致、模型侧工具名不做逆转写 | 前提：G-10 的 basis 条目 | 未开始 |
| [S-51](v1/contract.md#s-51-模型侧到达装配前提的承诺) 模型侧到达装配的七条宿主前提（`capability.stream-assembly/v1#S-28` 第 1、2、4、6、7、8、9 条）与不做逆转写 | [S-52](v1/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)（一次发出一支、两次发出一支） | 脚本化传输：核被拒的增量只报一次、观察者刷新之后读到的是装配结果、收场之后同一次发出的迟到事件不进、上一次发出的迟到事件不进下一次、工具调用块保留模型侧名字 | 未开始 |
| [S-11](v1/contract.md#s-11-合法目标集合) 末段、[S-28](v1/contract.md#s-28-opencall) 出门前检查第 3 行：传输承载是可发出的另一条前置 | [S-45](v1/contract.md#s-45-模态不兼容挡在算合法目标那一刻)（传输一支）、[examples §6](v1/examples.md#6-模态不兼容挡在算合法目标那一刻场景-s-45) 语音那一行 | 集成：据点传输配成送不出某一模态；核合法目标不变、出门前以 `modality_mismatch` 挡下 | 未开始 |

### 由别处承担、本契约只写明要求的

| 要求 | 由谁承担 | 本契约位置 |
|---|---|---|
| 回复消息与响应体同一提交、追加按 `ResponseId` 幂等、结算不受栅栏拒收 | 会话日志追加口（loop 那一程） | [S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢)、[S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) |
| 上交条目、中断提醒、宿主停止前先中断 | loop | [S-3](v1/contract.md#s-3-本契约明确不承诺什么)、[S-36](v1/contract.md#s-36-宿主停止与撤除) |
| 跨进程的新鲜度、秘密送达、转发链不越过锚点 | 组合契约（尚未立） | [S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证)、[G-12](v1/contract.md#十二已知缺口) |

## 独立评审

**第一轮**：spec-reviewer（只读），2026-09-24，基线 HUB `765b01dc`（批 R5：本契约与 `capability.model-profile-directory`、`capability.modality-projection` 同批）。
处置按主线的修复简报（2026-09-24）与 [D-040 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 的裁定（K10、K13、K16、K19～K22、K36、K40、K42）；**评审意见不代替接受**，本契约仍是 candidate，修复稿尚未复审。二十七条全部**改**。

| 发现 | 处置 | 落点 |
|---|---|---|
| MRR-1（阻断：绑定只在内存里，失联补写的响应体与续接没有耐久来源） | **改**（K20）：「已出门」带这次调用的绑定（`data.messages/v1#S-49` 已改）；续接与对账从它读，不重读档案。**剩下一项**：传输适配改过的值与丢掉的项不在「已出门」上，追补体上参数那三项仍无耐久来源，立 **G-18** | [S-7](v1/contract.md#s-7-一次调用绑定了什么)、[S-28](v1/contract.md#s-28-opencall) ④、[S-33](v1/contract.md#s-33-reconcile)、[S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 快照那一行、[G-18](v1/contract.md#十二已知缺口)；场景 S-42 路由留痕一支 |
| MRR-2（阻断：`ResponseId` 铸点与 `data.model-response/v1#S-6` 相冲） | **改**：权威处已改为「本能力写『已出门』时铸、各结算方沿用」（R2b 交付）；本契约引它，S-4 表写明 | [S-8](v1/contract.md#s-8-调用在会话日志里留下的六种记录)、[S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢)、[S-4](v1/contract.md#s-4-依赖方向与被消费的面) |
| MRR-3（阻断：续接或再发时凭据取不到没有合法编码） | **改**（K21）：写调用终结 `released{cause: credential_unavailable}`（`data.messages/v1#S-50`，成因名随 R1 交付定为 `credential_unavailable`）；`undispatched` 只指一次也没发出；S-6 `handed_up` 补入口；模型不建成因，`UndispatchedHasNoDispatch` 列为按构造 | [S-6](v1/contract.md#s-6-调用的状态)、[S-29](v1/contract.md#s-29-dispatch) ⑧、[S-30](v1/contract.md#s-30-dispatchagain) ⑧、[S-14](v1/contract.md#s-14-缺席时的默认答案与失败集合) 注；[formal 入口](v1/formal/README.md) 第二类；场景 S-41 凭据一支 |
| MRR-4（阻断：`callId` 唯一范围与调用操作不收会话） | **改**（K19）：`callId` 会话内唯一（与 `data.call-accounts/v1#S-37` 一致）；指认一次调用的操作 ① 都收 `session`、先判归属，不符 `callNotFound` | [S-5](v1/contract.md#s-5-一次调用一次发出)、[S-29](v1/contract.md#s-29-dispatch)～[S-34](v1/contract.md#s-34-readattempts)、[S-49](v1/contract.md#s-49-settlereply)、[S-50](v1/contract.md#s-50-candispatchagain) ①、[S-14](v1/contract.md#s-14-缺席时的默认答案与失败集合)；examples §8 |
| MRR-5（「已开口」写不进时编码冲突） | **改**：没写下的开口不算开口——内容不交给观察者、中止、按首 token 之前的故障结算、成因 `unrecognized`，响应体不带 `firstTokenAt`，缺席是如实的断言 | [S-15](v1/contract.md#s-15-两个锚点先写后行) 末条、[S-16](v1/contract.md#s-16-首-token-判据) 末段 |
| MRR-6（交回之后没有收口者） | **改**（K36）：新状态 `reply_pending`；调用方把落盘成消息的那一条与消息同一提交写下，否决与被系统使用的那一条经新操作 `settleReply` 由本能力写；调用方没收口时由撤除或对账兜底；列进 formal 的吸收 | [S-6](v1/contract.md#s-6-调用的状态)、[S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢)、[S-49](v1/contract.md#s-49-settlereply)、[S-36](v1/contract.md#s-36-宿主停止与撤除)、[G-11](v1/contract.md#十二已知缺口) ②；examples §11 |
| MRR-7（不属于任何 Run 的调用没有对账触发点） | **改**：S-33 ② 加第二个调用时机——会话在据点上重新承载之后、会话级调用打开之前（规格层推导，谁来调归会话生命周期，[G-11](v1/contract.md#十二已知缺口) ③） | [S-33](v1/contract.md#s-33-reconcile) ②、[S-5](v1/contract.md#s-5-一次调用一次发出) |
| MRR-8（从 `resumable` 放手时上交带什么） | **改**：`releaseCall` 一律写不带 `cause` 的 `released`，从 `resumable` 放手时没有成因可带；上交条目带什么立 **G-17**（loop／PF-011，产品疑问报 PF-013） | [S-32](v1/contract.md#s-32-releasecall) ④、[S-6](v1/contract.md#s-6-调用的状态)、[G-17](v1/contract.md#十二已知缺口) |
| MRR-9（`selectModel` 判合法与判重复的先后） | **改**：先判合法，再判重复；重选已下架的当前选中得 `notLegalTarget{because: [withdrawn]}` | [S-27](v1/contract.md#s-27-selectmodel) ⑦ |
| MRR-10（没改目标时 loop 怎么传 `target`） | **改**：`target` 恒在（`data.loop-extension/v1#S-15`）；加输入 `basis`（loop 填 `target` 时用的那份 `effectiveModel` ⑤）；用交来的 `target`、不重算；没有 `targetChangedBy` 时 `target` 必须等于 `basis.routeName`；`basis` 这个名字待主线定名（[G-13](v1/contract.md#十二已知缺口)） | [S-28](v1/contract.md#s-28-opencall) ①③④、[S-26](v1/contract.md#s-26-effectivemodel) ⑤；场景 S-43 交接一支；examples §8 |
| MRR-11（runner 要的只读守卫缺失） | **改**（K22）：新操作 `canDispatchAgain(session, callId, plan)`，与 `dispatchAgain` 同一张表、同一次序；收 `plan` 是规格层推导（守卫 3 要看它） | [S-50](v1/contract.md#s-50-candispatchagain)、[S-30](v1/contract.md#s-30-dispatchagain) ③、第十三节；examples §11 |
| MRR-12（发起者的来源） | **改**（K16）：发起者由承载条目壳上的租户身份给出；响应体上的 `initiator` 只指中断发起方 | [S-19](v1/contract.md#s-19-凭据每次发出现取取值只交给传输适配)、[S-5](v1/contract.md#s-5-一次调用一次发出) 末条 |
| MRR-13（「切换事实／SelectionFact」） | **改**：改为「模型切换（UL-model-switch）落下的那条记录」，即 `data.messages/v1#S-49` 的 `model_selection_changed`；「切到哪条档案」改为「切到哪个路由名」 | [S-8](v1/contract.md#s-8-调用在会话日志里留下的六种记录)、[S-27](v1/contract.md#s-27-selectmodel) ④ |
| MRR-14（合法目标集合多出一项） | **改**（K40）：合法目标恰三项（与词条一致）；「本据点传输能承载的模态」写成可发出的另一条前置，在出门前检查第 3 行挡下 | [S-11](v1/contract.md#s-11-合法目标集合) 末段、[S-12](v1/contract.md#s-12-展示列表) 注记表、[S-28](v1/contract.md#s-28-opencall) 出门前检查第 3 行；场景 S-45 传输一支 |
| MRR-15（形式主张超过证据；守卫编号错位） | **改**：只对六条有否定配置的断言说「能失败」；四条按构造吸收的标「按构造，不作证据」并指向场景；其余十条标「只检查过」；守卫编号改为守卫 1（`already_spoke`）、守卫 2（`fact_class`），守卫 3 不在 `GuardOn` 里；模型注释同改 | [S-40](v1/contract.md#s-40-本版选用哪些形式工件)、[formal 入口](v1/formal/README.md)、`Invocation.tla` 注释、本页形式工件表 |
| MRR-16（`open` 被中断、停机之后正文与模型不一致） | **改**：正文与模型都取「有中断意图 ⇒ 写调用终结 `interrupted`」；模型 `Reconcile` 的 `nd = 0` 一支分两支，整组重跑（下文） | [S-33](v1/contract.md#s-33-reconcile) 第 2 行与末条、`Invocation.tla` `Reconcile` |
| MRR-17（注记判据对象；同一情形两个失败值） | **改**：名字有胜出行时判胜出行，没有时只判落点卡在哪一道滤、不判模态与凭据；选中模型的名字链上一行都没有时列表也得 `profileNotFound` | [S-12](v1/contract.md#s-12-展示列表)、[S-25](v1/contract.md#s-25-displaylist) ⑥⑧、[S-27](v1/contract.md#s-27-selectmodel)；examples §8 |
| MRR-18（S-4 缺 `data.model-profile` S-2） | **改**：补一行 | [S-4](v1/contract.md#s-4-依赖方向与被消费的面) |
| MRR-19（产品 rev 落后） | **改**：逐 rev 复核（结论见[变化的影响](#变化的影响)本轮一条），页首改为 PF-012 rev 14、PF-009 rev 8、PF-004 rev 12、PF-001 rev 17 | 契约页首 |
| MRR-20（引注表里的 INV-／SAF-／LIV- 编号） | **改**：删去编号，改指决定记录 | 契约「设计依据」 |
| MRR-21（`retryRefused` 后两条在非 `awaiting_decision` 时要不要求值） | **改**：守卫 2、3 只在 `awaiting_decision` 时求值；只读守卫同一口径 | [S-30](v1/contract.md#s-30-dispatchagain) ⑥ 与表头、[S-50](v1/contract.md#s-50-candispatchagain) ⑥；examples §8 回归例 |
| MRR-22（身份不符判 `invalidInput`；括注可反读） | **改**：`selectModel` 不另收租户身份，「谁切的」从条目壳读；S-26 ⑤ 写成单向：`selectedBy = layer_lock` 当且仅当有一格上锁，不论名字是否相同 | [S-27](v1/contract.md#s-27-selectmodel) ②、[S-26](v1/contract.md#s-26-effectivemodel) ⑤ |
| MRR-23（过期引用；宿主停止的调用终结没写发起方） | **改**：删去对已闭合 G-1 的引用；写明取 `run_cancelled` | [S-36](v1/contract.md#s-36-宿主停止与撤除)、[S-33](v1/contract.md#s-33-reconcile) 第 2 行 |
| MRR-24（实例缺 `routeName`；守卫编号） | **改**：`effectiveModel` 的返回补 `routeName`；`already_spoke` 标守卫 1 | examples §1、§2、§4 |
| MRR-25（README 的 fiber 一句；传输九条用库级措辞） | **改**：删去 README 那句；九条改为语言无关的性质（不再点名库与环境变量） | [README](README.md)、[S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输九条 |
| MRR-26（`open` 调用读不到；条目没有「选中」；S-13 没登记对 MP S-6 的消费） | **改**：`readAttempts` 对本能力手里的 `open` 调用答 `{ state: open, dispatches: [] }`；展示列表条目加 `selected`；S-4 与 catalog 补 `capability.modality-projection` S-6 | [S-34](v1/contract.md#s-34-readattempts) ⑤⑧、[S-25](v1/contract.md#s-25-displaylist) ⑤、[S-13](v1/contract.md#s-13-模态投影读到的必须追到日志尾)、[S-4](v1/contract.md#s-4-依赖方向与被消费的面) |
| MRR-27（运行记录没绑定可核对的修订） | **改**：2026-09-24 整组重跑，输入副本与 SHA-256 入主检出 `tmp/formal-runs/`，本页绑定 `Invocation.tla` 的哈希 | 下文「实际执行」 |

## 实际执行

### 2026-09-24 修复稿：TLC 十份配置（有效记录）

- **模型修订**：工作树 `.worktrees/assets-runtimes`（分支 `panqiwei/assets-runtimes`，未提交）上的 `v1/formal/Invocation.tla`，SHA-256 `7dafcaa2185ca3ae41a043ff16bb6b4e2a81cd8720f7fa66d1ff23e5b5221b48`；十份配置的哈希在运行目录 `input.sha256`，与工作树逐字相同
- **运行目录**：主检出 `tmp/formal-runs/model-request-runtime-v1-2026-09-24d/`（`run.sh`、`input/`、`logs/`、`run-exit.txt`、`summary.txt`）
- **工具**：TLC2 Version 2026.09.12.025210 (rev: 867aefb)；Eclipse Adoptium (Temurin) 21.0.12.1；`-workers 1`，工作目录 `.meta_harness/design`
- **相对上一次的模型改动**：`Reconcile` 的 `nd = 0` 一支，有中断意图时写调用终结 `interrupted`（MRR-16）；两处注释的守卫编号

| 配置 | 退出码 | 结果 |
|---|---|---|
| `Invocation.cfg` | 0 | 29,521 states generated，15,802 distinct，深度 21；20 条不变量与进展性质 `SentEventuallySettled` 无违反；无死锁 |
| `Invocation_NoFallback.cfg` | 0 | 13,861 generated，7,420 distinct；同上 |
| `Invocation_Validity_NoGuard_Spoke.cfg` | 12 | `NoDispatchAfterSpoke` 违反：OpenPass → Dispatch → Send → FirstToken → FailAfter → DispatchAgain(1) |
| `Invocation_Validity_NoGuard_Fact.cfg` | 12 | `ContinuationOnlyAfterStrategyOrSilentLoss` 违反：OpenPass → Dispatch → Send → FailBefore(事实类) → DispatchAgain(1) |
| `Invocation_Validity_SpokeAfterObserve.cfg` | 12 | `NoDispatchAfterSeen` 违反：… → FirstToken（先交观察者）→ Crash → Reconcile（当成没开口）→ Dispatch → Send |
| `Invocation_Validity_SendBeforeAnchor.cfg` | 12 | `QuiescentSettled` 违反：… → Send（锚点未写）→ Crash → Reconcile（找不到这次发出） |
| `Invocation_Validity_AbortBeforeIntent.cfg` | 12 | `NoDispatchAfterInterrupt` 违反：OpenPass → Dispatch → Interrupt(user)（未写意图）→ Crash → Reconcile（当成失联）→ Dispatch → Send |
| `Invocation_Validity_NonIdempotentSettle.cfg` | 12 | `AtMostOneBodyPerDispatch` 违反：… → Send → HostStop → FailBefore(策略类) → TeardownWrite（第二条） |
| `Invocation_Reach_ResumeThenComplete.cfg` | 12 | 见证 `NotResumeThenComplete` 被报出：OpenPass → Dispatch → Crash → Reconcile → Dispatch → Send → FirstToken → Complete |
| `Invocation_Reach_FallbackThenComplete.cfg` | 12 | 见证 `NotFallbackThenComplete` 被报出：… → FailBefore(策略类) → DispatchAgain(2) → Send → FirstToken → Complete |

**这次运行能说明的**：六条断言在对应开关拧反时会失败，正向配置在所列常量内无反例；**不能说明的**：四条按构造成立的断言、模型吸收掉的语义（[formal 入口](v1/formal/README.md#模型吸收了什么不写成已由模型覆盖)），以及任何实现。

### 2026-09-23 起草者本机：TLC 十份配置（已被上一节取代）

- **模型修订**：本分支 `panqiwei/assets-runtimes-spec-modelrt` 上首次提交的 `v1/formal/Invocation.tla`（提交号见 `git log`，本页不填哈希）
- **工具**：TLC2 Version 2026.09.12.025210 (rev: 867aefb)；openjdk 21.0.12.1；`-workers 1`，工作目录 `.meta_harness/design`
- **命令形状**：`java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/<id> -cleanup -noGenerateSpecTE -workers 1 -config <cfg> Invocation.tla`

| 配置 | 退出码 | 结果 |
|---|---|---|
| `Invocation.cfg` | 0 | 29,521 states generated，15,802 distinct，深度 21；20 条不变量与进展性质 `SentEventuallySettled` 无违反；无死锁 |
| `Invocation_NoFallback.cfg` | 0 | 13,861 generated，7,420 distinct；同上 |
| `Invocation_Validity_NoGuard_Spoke.cfg` | 12 | `NoDispatchAfterSpoke` 违反：OpenPass → Dispatch → Send → FirstToken → FailAfter → DispatchAgain |
| `Invocation_Validity_NoGuard_Fact.cfg` | 12 | `ContinuationOnlyAfterStrategyOrSilentLoss` 违反：OpenPass → Dispatch → Send → FailBefore(事实类) → DispatchAgain |
| `Invocation_Validity_SpokeAfterObserve.cfg` | 12 | `NoDispatchAfterSeen` 违反：… → FirstToken（先交观察者）→ Crash → Reconcile（当成没开口）→ Dispatch → Send |
| `Invocation_Validity_SendBeforeAnchor.cfg` | 12 | `QuiescentSettled` 违反：… → Send（锚点未写）→ Crash → Reconcile（找不到这次发出） |
| `Invocation_Validity_AbortBeforeIntent.cfg` | 12 | `NoDispatchAfterInterrupt` 违反：… → Interrupt（未写意图）→ Crash → Reconcile（当成失联）→ Dispatch → Send |
| `Invocation_Validity_NonIdempotentSettle.cfg` | 12 | `AtMostOneBodyPerDispatch` 违反：… → HostStop → FailBefore → TeardownWrite（第二条） |
| `Invocation_Reach_ResumeThenComplete.cfg` | 12 | 见证 `NotResumeThenComplete` 被报出：续接路径可达 |
| `Invocation_Reach_FallbackThenComplete.cfg` | 12 | 见证 `NotFallbackThenComplete` 被报出：换家路径可达 |

原始输出只留在起草者本机的临时目录，**没有入库**、没有绑定哈希；对应的模型在 2026-09-24 已改（`Reconcile` 一支），**结论以上一节为准**。复跑以 `make design-check FORMAL=run`（两份登记配置）或运行目录里的 `run.sh`（十份）为准。

## 结果与反例

**正向配置无反例。**否定配置的反例都是预期的，形状见上表；它们说明的是「对应开关拧反时断言会失败」，**不是契约的缺陷**。

## 变化的影响

- **2026-09-23 起草**：首版，无旧证据。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在 [D-040 §S16](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)。
  - **G-1 闭合**：`data.model-response` 的 `interrupted{initiator}` 三值、`attemptId` 在每一次发出上、`route.profileSnapshot`／`route.credentialScope`，`data.call-accounts` 的 `late` 与 `initiator` 都已落；「首 token 之前失联之后能否再发」的口径与本契约一致（那边 S-23 第 2 条）。**模型不变**：`lost_silent`／`lost_spoken`、`int_user`／`int_cancel` 正是那几支，`ContinuationOnlyAfterStrategyOrSilentLoss` 与对账表第三行不改。
  - **G-2 闭合**：五种记录的形状归 `data.messages/v1#S-49`、`#S-50`；场景的核对对象改为那里的成员名。不影响模型。
  - **G-3 闭合**：`ModelCallRequest` 定形（`parameters`、`tools: CapabilityId[]`、`targetChangedBy?`，与 `data.loop-extension` 的 `ModelRequest` 同名成员逐字相同）。
  - **`retryRefused{call_ended}` 删去**（S16-b）：已终结的调用在 `dispatch`／`dispatchAgain` 上一律 `alreadyEnded`；`why` 剩三值、守卫重新编号。模型里守卫是谓词、不带这个名字，**不需重跑**。
  - **默认重试件**：不允许回退的档案同家至多再试一次（S16-g）；它不在模型里（模型把 `dispatchAgain` 建成非确定选择，守卫是唯一约束），`Invocation_NoFallback.cfg` 的 `ProviderAllowed`（每一次都是第一家）照旧成立。实例第 7 节已改写。
  - **G-7 闭合**（S16-g：首 token 之后停机 = `interrupted{runtime_lost}`）；**G-8、G-9 收窄**；**G-4 改为产品缺口**（「范围允许」的输入是 asset-evaluation 求值结果里「用哪个模型」那一项的允许集合，S16-i）；**G-14 闭合**（三份并行契约登进 catalog；runner 只指路，它消费本契约、反向登记会成环）。
  - **凭据链多一格**（`capability.model-profile-directory` 同轮改，[D-040 §S16 S16-f](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）：S-19 取「最具体的一把」末尾加出厂格那一把，S-12 的 `credential_missing` 改为三格都没有；模型不含凭据取值，不受影响。
  - **对证据的影响**：没有既有证据失效；两个登记任务在本轮 `FORMAL=run` 重跑。
- **2026-09-24 规格修订批（PF-013 rev 10 之后；候选，未冻结，原地改）**。依据：PF-013 rev 10 裁决 33–38、decisions P33–P37，主线施工简报第三节：
  - **取凭据次序同步目录**：[S-19](v1/contract.md#s-19-凭据每次发出现取取值只交给传输适配) 删「否则组织层」——发起租户有自己那一把就用它（不论档案建在哪一层），否则只有官方档案取出厂格那一把，自建档案没有就是 `credential_unavailable`；取用时带有效模型引用的 `origin`，不另填。[S-12](v1/contract.md#s-12-展示列表) 的 `credential_missing` 按每一条的来源各问一次；[S-28](v1/contract.md#s-28-opencall) 出门前检查第 4 行、[S-29](v1/contract.md#s-29-dispatch) ⑧ 措辞随改。
  - **展示列表每条带来源**（裁决 36）：[S-12](v1/contract.md#s-12-展示列表)、[S-25](v1/contract.md#s-25-displaylist) ⑤ 写明来源即条目 `ref` 里的 `origin` 与 `scope`，不另立成员；[S-11](v1/contract.md#s-11-合法目标集合) 补一句同路由名可有几条。
  - **撤回可恢复**（裁决 37）：[S-9](v1/contract.md#s-9-选中模型) 补恢复之后自然接上；进展性质加一行；[S-44](v1/contract.md#s-44-已下架的档案) 加恢复一支；实例第 5 节加两行。
  - **新增场景 [S-48](v1/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行)** 与实例第 9 节；上表加一行。
  - [S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 两行改写（在册状态两个方向都要单调读；秘密送达去掉旧的凭据缺口指引与「组织层那一把」，来源须如实到达）；安全性质加「自建档案用上出厂格那一把」一行；catalog 本契约对 `data.model-profile` 增 S-4。
  - **对证据的影响**：没有既有证据失效——行为模型不含凭据取用、在册状态与展示列表，**十份配置不需重跑，本轮未运行 TLC**；场景全部未开始，S-44、S-48 首次执行按新内容。
- **2026-09-24 主线裁定落地（候选，未冻结，原地改）**：
  - **首 token 之后停机再 `dispatch` 得 `alreadyEnded`**：实例第 3 节那一行原写 `retryRefused{call_ended}`（整批对齐时已作废的值，漏改）；场景 [S-42](v1/contract.md#s-42-开口之后断流不重发) 停机一支原写 `retryRefused{already_spoke}`，按 [S-29](v1/contract.md#s-29-dispatch) ⑥ 的次序（`alreadyEnded` 先于 `retryRefused`）改为 `alreadyEnded`。条款本身不变。
  - 产品依据改 PF-013 rev 11（rev 11 只动转换件呈现落点，不影响本契约条款）。
  - **对证据的影响**：模型里守卫是谓词、不带失败值名字，**不需重跑，本轮未运行 TLC**；S-42 首次执行按新内容。
- **2026-09-24 用量／成本分记的理由对齐**（候选，未冻结，原地改）：「账上分记两件事」一段补一句——两者只在走出厂格那一把时分叉，出厂格那一把是唯一分叉点（与 `data.call-accounts/v1#S-38` 同轮改写一致，主线裁定）。不改条款，对证据无影响。
- **2026-09-24 产品负责人裁定同名按层覆盖（候选，未冻结，原地改）**：原话「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」（`data.model-profile` v1 G-13、`capability.model-profile-directory` v1 G-11 同日闭合）。
  - [S-10](v1/contract.md#s-10-有效模型四步每步来源可查) 加第 2′ 步**同标识覆盖**：以路由名为能力标识，在会话范围链上取最具体一格的那条（先后取 `capability.model-profile-directory/v1#S-17` 末段）；作用在第 2 步结果上（选中或锁都一样，`selectedBy` 不变），第 3 步拓展件给出的目标在打开调用时同样经它。**按行存在取、不看能不能用**：最具体那条已撤回或用不了，第 4 步照样挡下，不落到下一层——缺席默认取拒绝，要不要让位立为 **G-15**（产品负责人）。
  - [S-11](v1/contract.md#s-11-合法目标集合)：式子改为判 `覆盖(p)`——按引用各算、各是一个元素，但判的是选它实际会用的那条（**规格层推导**：否则判为合法的引用会在出门前检查被挡下）；同名几条判定相同。[S-12](v1/contract.md#s-12-展示列表)：每条标自己的来源，注记与 `credential_missing` 按覆盖之后那条算；被覆盖的条目怎样说明实际用哪一条立为 **G-16**（产品负责人与交付面）。
  - [S-26](v1/contract.md#s-26-effectivemodel) ⑤：`profile` 是第 2、2′ 步之后的结果，与 `selected` 不同可能是锁、覆盖或两者；[S-28](v1/contract.md#s-28-opencall) ④：`target` 给出时也经覆盖。
  - 场景 [S-48](v1/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行) 改写（标题与锚点随之改）：原「官方那条走出厂格那一把」在组织层有同名自建档案时不再成立——选官方那条也落到组织层那条；加三层与组织锁两支。实例第 9 节改写，新增第 10 节（三层同名、锁、已撤回的最具体那条）。设计依据表那一行补裁定原话。
  - **catalog 不变**：已消费 `capability.model-profile-directory` S-6、S-17。covers 里 PF-013 §4「档案的身份」那一条补 S-10、S-11、S-26、S-28。
  - **对证据的影响**：行为模型不含有效模型的求值与展示列表，**十份配置不需重跑，本轮未运行 TLC**；S-48 首次执行按新内容。
- **2026-09-24 主线裁定 G-15、G-16 与三条推导（候选，未冻结，原地改）**：
  - **三条推导被主线接受**，正文标「主线裁定 2026-09-24」：合法性看胜出的那条（[S-11](v1/contract.md#s-11-合法目标集合)）；覆盖同样作用在锁之上——锁定的是路由名，供应商、参数、凭据取胜出的那条（[S-10](v1/contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步）。
  - **G-15 闭合**：挑胜者时**先滤掉已撤回的行，再取最具体一格**（类推 PF-002 §5.6「先滤掉被禁用的，再取最具体」）；缺凭据不滤。上一轮「按行存在取」改掉。`覆盖(p)` 的定义随之改（一条在册的都没有时 = p）；`LegalTargetSet` 的第一个合取项由「`覆盖(p)` 在册」改为「`p` 在册」——已撤回的引用即使被接住也不能被新选中（**规格层推导**，依据 `data.model-profile/v1#S-10` 末段）。S-10 加「代价」一段：组织层建了同名、成员没配自己那一把之前同名官方档案用不上；租户建了同名又撤回不再堵官方那条；选中的那条自己撤回而链上有在册同名时照常用那条，不说「已下架」。[S-9](v1/contract.md#s-9-选中模型) 已撤回一条随之补。
  - **G-16 闭合**：[S-12](v1/contract.md#s-12-展示列表) 注记表加 `overridden_by{scope}`（附加注记，`覆盖(p) ≠ p` 时带，`scope` 是胜出那条所在的一格，官方那条为 `factory`）；被覆盖的条目照列、每条带自己的来源，呈现归 PF-016。`withdrawn` 注记改回按这一条自己的在册状态判；其余三项按胜出那条判。
  - [S-26](v1/contract.md#s-26-effectivemodel) ⑤「两者不同」的说明补「或它自己已撤回时链上在册的那条」。场景 [S-48](v1/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行) 补 `overridden_by`、缺凭据不滤的代价、锁、撤回一支；实例第 9 节补注记，第 10 节改写（标题改为「三层同名、锁与已撤回的行」）。
  - **对证据的影响**：没有既有证据；行为模型不含这些求值，**不需重跑，本轮未运行 TLC**。
- **2026-09-24 主线裁定：范围不允许的也在挑胜者前滤掉（候选，未冻结，原地改）**：类推 PF-002 §5.6 三小步完整版「禁用滤（= 已撤回）→ 谁可以使用它滤（= 范围不允许）→ 取最具体」；模态不兼容与缺凭据不滤。[S-10](v1/contract.md#s-10-有效模型四步每步来源可查) 第 2′ 步与「只滤」一条、代价一段补范围不允许；[S-11](v1/contract.md#s-11-合法目标集合) `覆盖(p)` 改为在册且范围允许的最具体一条，`LegalTargetSet` 的范围一项改判 `p` 自己（**规格层推导**：与「已撤回的引用不能被新选中」同理，这个范围不允许的引用也不能被新选中）；[S-12](v1/contract.md#s-12-展示列表) `scope_disallowed` 改按这一条自己判，被接住时与 `overridden_by` 并存；[S-9](v1/contract.md#s-9-选中模型) 与 G-15 闭合行同步。实例里没有范围不允许的行参与覆盖的例子，未改。`overridden_by{factory}` 名字保留；「已下架」口径变化由主线转 PF-013 rev 12。不需重跑 TLC，本轮未运行。
- **2026-09-24 PF-013 rev 12 最后一轮简化（候选，未冻结，原地改）**：产品正文定「用哪个模型」**记路由名**，运行时按链取胜者；主线裁以产品为准。
  - [S-9](v1/contract.md#s-9-选中模型)：选中模型 = 一个路由名（切换事实记的名字）；「名字不变，落点会变」一条取代原「引用 + 覆盖」的说法。
  - [S-10](v1/contract.md#s-10-有效模型四步每步来源可查)：第 2′ 步改为「把路由名解析为一行」，按 `capability.model-profile-directory/v1#S-17` 末段的落点（先滤已撤回、再滤范围不允许、取最具体；没有胜出行时落点那一行由第 4 步以 `withdrawn`／`scope_disallowed` 挡下；链上没有这个名字 ⇒ `profileNotFound`），不再有「引用 + 覆盖」两层；代价一段保留并补「锁得住名字锁不住落点」。
  - [S-11](v1/contract.md#s-11-合法目标集合)：合法目标集合以**路由名**为元素（胜出行存在且模态兼容、传输承载得了）；`覆盖(p)` 与 `p 在册` 那一套删去。
  - [S-12](v1/contract.md#s-12-展示列表)：**每个名字一条**，主标是落点那一行的来源；被盖住的同名行列在该条之下、带 `overridden_by{scope}`（及它自己的 `withdrawn`／`scope_disallowed`），选不了；注记表加「挂在哪」一列。
  - [S-24](v1/contract.md#s-24-legaltargets) ⑤ 一组 `RouteName`；[S-25](v1/contract.md#s-25-displaylist) ⑤ 条目形状 `{ routeName, ref, 注记集合, covered }`；[S-26](v1/contract.md#s-26-effectivemodel) ⑤ 加 `routeName`、`selected` 改为名字，⑥⑧ 加 `profileNotFound`；[S-27](v1/contract.md#s-27-selectmodel) 输入改 `routeName: RouteName`，切换事实记名字；[S-28](v1/contract.md#s-28-opencall) ① 拓展件的 `target` 只取其中的路由名（`data.loop-extension` 的形状仍是 `ModelProfileRef`，待那份契约对齐），⑧ 的 `profileNotFound` 改为「链上没有这个名字」。
  - 场景 [S-48](v1/contract.md#s-48-同路由名按层覆盖一个名字一条落到胜出行) 改写（标题与锚点随之改）；S-44 注明链上没有别的同名行；实例序言注明 `M1`、`M2` 同时指行与名字，第 8 节 `profileNotFound` 那行改为一个名字，第 9、10 节改写（加「三行都撤回」一行）。
  - **catalog**：本契约对 `data.model-profile` 补 `S-2`（`RouteName`）。**covers**：PF-013 §4「档案的身份」一条补 S-9、S-24、S-27。
  - **对证据的影响**：行为模型不含选中模型的形状与这些求值，**不需重跑，本轮未运行 TLC**；场景全部未开始，S-48 首次执行按新内容。
- **（2026-09-24 同日续，主线裁定，不改语义）**：`data.loop-extension` v1 S-15 的 `target` 与 S-24 的 `profile` 改为 `RouteName`，[S-28](v1/contract.md#s-28-opencall) ① 与 ④ 随之改为直接取这个名字、经 S-10 第 2′ 步解析；上一条里「只取其中的路由名，形状仍是 `ModelProfileRef`」的过渡读法作废。**对证据的影响**：无既有证据；本轮未运行 TLC。
- **2026-09-25 修复波 1b（候选，未冻结，原地改）**：裁定出处 [D-040 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（L4、L6、N-9）。
  - **L4，G-18 闭合**：「已出门」另带传输适配为这一次定下的 `parameterAdjustments` 与 `droppedParameters`（形状归 `data.messages/v1#S-49`，与 `data.model-response/v1#S-11` 同名成员同义）；[S-7](v1/contract.md#s-7-一次调用绑定了什么) 写明由它还原实际送出的一组，[S-8](v1/contract.md#s-8-调用在会话日志里留下的六种记录) 已出门一行、[S-29](v1/contract.md#s-29-dispatch) ④ 的次序（改值与丢项先定、再写已出门、再出网）、[S-33](v1/contract.md#s-33-reconcile) ④ 追补体参数三项从「已出门」读；[S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配九条 → 十一条（第 10 条改值与丢项在出网之前定下，第 11 条不做逆转写）；实例第 3 节首行改写；场景 [S-42](v1/contract.md#s-42-开口之后断流不重发) 加参数一支。
  - **L6**：新条款 [S-51](v1/contract.md#s-51-模型侧到达装配前提的承诺)——对 `capability.stream-assembly/v1#S-28` 第 1、2、4、6、7、8、9 条逐条承诺，并写明模型侧名字不做逆转写（逆转写只在 `capability.tool-execution-runtime`，K10）；新场景 [S-52](v1/contract.md#s-52-模型侧的装配宿主被拒的增量报一次收场之后的事件不进)。`capability.stream-assembly` v1 G-2 随之闭合（那份契约同轮改）。S-1 加第 12 行、S-4 stream-assembly 一行改列 S-14、S-18～S-22、S-26、S-28，被消费者表加 stream-assembly 一行，安全性质加两行。
  - **N-9，G-13 闭合**：`settleReply` 与输入成员 `basis` 由主线接受；S-23、S-49 与依据表随改。
  - **registry**：catalog 本契约对 `capability.stream-assembly` 由 `S-16` 改为 `S-14`、`S-16`、`S-18`～`S-22`、`S-26`、`S-28`（与 S-4 表逐项相同）；对 `data.messages` 已消费 S-49，不变。covers、formal-tasks、id-namespaces 不变（S-51 是宿主前提的承诺、S-52 是场景，不对应新的产品条款）。
  - **对证据的影响**：行为模型不含参数、到达事件与装配状态（[formal 入口](v1/formal/README.md#模型吸收了什么不写成已由模型覆盖)已补两句），**十份配置不需重跑，本轮未运行 TLC**；场景全部未开始，S-42 参数一支与 S-52 首次执行按新内容。
- **2026-09-24 第一轮独立评审修复（候选，未冻结，原地改）**：逐条处置见上文[独立评审](#独立评审)；裁定出处 [D-040 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K10、K13、K16、K19～K22、K36、K40、K42），正文里对这些 K 的依据都链到那里。
  - **产品 rev 复核**：PF-012 rev 10 → 14——rev 11 补的对账两行与本契约 S-33 一致；否决三路的模型回复一行（照常结束、记下被谁否决、不交给重试挂件）落为 S-49；「系统自带的几件，不可用时各有定法」落为 S-35「它挂了」；I-11「已发起的账迟到了照样落、标明迟到」落为 S-17 的 `late`（只在属于某个运行的调用上）；rev 12 的拓展件不可用处置由 `capability.loop-extension-runner` 执行、本契约只引；rev 13、14 只动转换件，不涉本契约。PF-009 rev 7 → 8——「已经开口是账」与本契约「已开口」记录一致，`SystemMessage` 不落日志与本契约无关，不改条款。PF-004 rev 10 → 12、PF-001 rev 16 → 17——本契约引的 §6.6、§6.4 含义未变，不改条款。
  - **新增的服务面**：`settleReply`（[S-49](v1/contract.md#s-49-settlereply)）、`canDispatchAgain`（[S-50](v1/contract.md#s-50-candispatchagain)）；新增状态 `reply_pending`。`settleReply` 与 `openCall` 的输入成员 `basis` 是规格层给的候选名，待主线定名（[G-13](v1/contract.md#十二已知缺口)）。
  - **新缺口**：[G-17](v1/contract.md#十二已知缺口)（从 `resumable` 放手时上交带什么）、[G-18](v1/contract.md#十二已知缺口)（追补体上参数三项没有耐久来源）。**G-4 闭合**（K42）。
  - **实例**：各调用加 `session`；第 3 节路由取自「已出门」；第 8 节加 `callId` 属于别的会话、`reply_pending` 上的 `alreadyEnded`、`target` 与 `basis` 不符、`settleReply` 两行、判定次序回归例两条、列表的 `profileNotFound`；新增第 11 节（交回之后的收口与只读守卫）。
  - **registry**：catalog 本契约对 `data.model-response` 补 S-3、S-35，对 `data.loop-extension` 补 S-14，对 `data.call-accounts` 补 S-25，对 `capability.modality-projection` 补 S-6（与 S-4 表逐项相同）；formal-tasks 不变（两个任务、配置名不变）。covers 补登 4 条（PF-012 §6.17 → S-17、PF-012 否决三路 → S-49、PF-012 系统自带件不可用 → S-35、PF-015 会话睡一觉醒来 → S-33），给 4 条追加条款（PF-013 §6.17 加 S-35、§6.5 加 S-11、§6.9 加 S-10／S-28、「它只有一个宿主」加 S-5），1 条注去掉施工标签；本契约条目 51 → 55。
  - **对证据的影响**：模型改了 `Reconcile` 一支（MRR-16），**十份配置整组重跑**（上文「实际执行」2026-09-24 一节），2026-09-23 那次作废；形式工件的主张收窄到六条能失败的断言，四条标「按构造，不作证据」。场景全部未开始，S-41、S-42、S-43、S-45 首次执行按新内容。
