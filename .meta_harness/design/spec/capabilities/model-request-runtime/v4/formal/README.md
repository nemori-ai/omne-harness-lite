# v4 行为模型与继承范围

本目录没有运行结果；执行结果只进[版本外验证入口](../../verification.md#v4-候选变化与证据)。
执行使用主线给定的 TLC 工具链，精确版本、输入哈希、原始输出、退出码及修复前失败记录在版本外验证入口定位；模型与配置存在不等于已运行或实现符合。

## 原状态机的采用边界

v4 保留十三个服务操作，原有交错消费已冻结 [v2 Invocation](../../v2/formal/README.md) 及其配置，原字节不变。
它的单调用有限模型、六个否定配置与两条可达性检查仍保持各自范围，不证明新适配绑定、首内容门、观察者、目录数据升级或真实资源释放。
原模型不含 `reply_pending`、真实追加失败、多会话与完整消费者循环；这些仍由集成/故障证据承担。

## 正向配置与性质映射

| 模型/配置 | 条款及可失败性质 | 前提与范围 | 被模型吸收、不得声称覆盖 |
|---|---|---|---|
| [ContentGate.tla](ContentGate.tla)、[ContentGate.cfg](ContentGate.cfg) | S-55 `NoContentBeforeGate`、`GateFailureInvisible`；S-55/S-56 `NoRevealAfterCancel` | 单次 send、一个代表性内容事件、一个门；GateBeforeVisible=TRUE、HonorCancel=TRUE；Stop 的弱公平用于取消/失败最终停止 | send 至多一次、门调用至多一次是动作结构给定；TypeOK 不是单独证据。网络释放、门本身的中止实现、整段多模态解析和响应体构造没有建模 |
| 同上 | S-55/S-56 `CancelEventuallyStops`、`GateFailureEventuallyStops` | 以停止动作可执行且弱公平为前提；并非外部传输无条件响应 | 不含停止动作抛错、无界系统挂起；真实组合须验证资源实际释放 |
| [AdaptationBinding.tla](AdaptationBinding.tla)、[AdaptationBinding.cfg](AdaptationBinding.cfg) | S-7/S-53 `SentUsesOriginal`、`SentMatchesRecord`；S-33/S-53 恢复原绑定且对账不发送 | 两个版本，最多两次发出，一个调用，可在首发后崩溃；PinBinding=TRUE、RequireExact=TRUE；Reconcile 弱公平 | 一个整数代表整个绑定；配置严格 JSON、修订命名域及跨字段相等没建模。records 与 sent 同一动作，不能证明真实先锚点后发送；该义务由 v2 模型及真实日志承担 |
| 同上 | S-33 `LostEventuallyReconciled` | 日志可读写，恢复动作弱公平；旧版本缺失仍可恢复 | 恢复的完整账、部分提交失败、多调用竞争、registry 引用/撤除协议不在此模型 |
| [Adaptation.tla](Adaptation.tla)、[Adaptation.cfg](Adaptation.cfg)（主线拥有） | S-53/S-64 `NoAcquireRetired`、`NoDisposeWithLease`、`BindingPinned` | 两版本、runtime/direct 两消费者、official/custom 两 scope；GuardAcquire/GuardDispose/PinBinding 均 TRUE；注册、目录采用、撤旧分别是动作 | 没有 HTTP、持久写或崩溃恢复；scope 只是两个采用主体，不证明真实租户授权。TypeOK 不作为独立覆盖 |
| 同上 | S-53/S-64 `RegistrationDoesNotAdopt`、`AdoptionFailureKeepsProfiles` | 注册不能自动改目录；采用失败保留原 profiles；发布/采用/撤旧不组成跨 owner 原子动作 | 两条仅有正向检查，没有独立变异；不得称为有效性已验证 |
| 同上 | S-53/S-56/S-64 `CancelledEventuallyReleased`、`DrainedEventuallyDisposed` | Stop、Release、Dispose 的弱公平；取消请求、实际 stop 与 release 分开 | 真实外部构件不响应取消不在此前提内；模型不证明产品资源已释放 |

## validity-check（预期反例，不登记 formal task）

| 配置 | 变异 | 预期被反驳断言 |
|---|---|---|
| [ContentGate_NoWait.cfg](validity-check/ContentGate_NoWait.cfg) | 未等门成功就 Observe | `NoContentBeforeGate` |
| [ContentGate_IgnoreCancel.cfg](validity-check/ContentGate_IgnoreCancel.cfg) | Abort 后门迟到成功仍可 Observe | `NoRevealAfterCancel` |
| [AdaptationBinding_UseLatest.cfg](validity-check/AdaptationBinding_UseLatest.cfg) | 每次发送现取 current | `SentUsesOriginal` |
| [AdaptationBinding_MissingFallback.cfg](validity-check/AdaptationBinding_MissingFallback.cfg) | 恢复后旧实现缺席改用 current | `SentMatchesRecord` |
| [Adaptation_AcquireRetired.cfg](validity-check/Adaptation_AcquireRetired.cfg)（主线拥有） | 停准入后仍允许取得版本 | `NoAcquireRetired` |
| [Adaptation_DisposeActive.cfg](validity-check/Adaptation_DisposeActive.cfg)（主线拥有） | 仍有持有者时释放资源 | `NoDisposeWithLease` |
| [Adaptation_Rebind.cfg](validity-check/Adaptation_Rebind.cfg)（主线拥有） | 在途绑定随新采用版本改变 | `BindingPinned` |

以上是配置的预期结果；实际执行见版本外验证入口。正向无反例与否定出现指定反例须成对记录；某断言若只在正向列中通过，不能说已证实它能失败。
RT3 起草时三个正向任务的登记名分别为 `model-request-runtime-v3-content-gate`、`model-request-runtime-v3-adaptation-binding`、`model-request-runtime-v3-adaptation-lifecycle`；本版在候选 registry 以 v4 精确路径另列对应任务，旧运行不改记为 v4。七份否定配置均不登记为正向 formal task。
没有新 Alloy 模型：本批新增值结构由 model-profile/messages/model-response 的 Schema 承接，本契约只引值不另立结构权威。

继承的 ContentGate/AdaptationBinding 与 Adaptation 各保留原义务；这三份模型不承载 `retryDelay` 的实数关系、结果投影的全部字段、发送前取消的外层结果形状或S-66 当前输入提供者的真实读取、跨源一致性或 S-28/S-29 续接新输入分支。这些由规范向量及实现符合性验收承担。

S-15/S-16/S-17/S-33/S-55 的 opened 回执未知及取消后迟到提交分支不在上述继承模型范围：ContentGate 只验证可见门，不包含真实日志追加、丢回执、旧生产者实际静止、有效尝试栅栏或权威完整读回。零可见内容与已有耐久 opened 同时成立的组合、隔离后按真实锚点结算，须用真实日志与 runtime 故障注入验收；不由旧 TLC 运行代证。


## 结算组合模型

[Settlement.tla](Settlement.tla) 承接 S-17/S-68～S-73。独立验证须运行以下正负配置；SL3 模型和旧 RT3 运行均不代替本模型的执行。

模型使用两个有共同 ResponseId 的结算者：1 写单响应，2 写同一 MessageId 的消息+响应批；一个原发出、一个新尝试或同 Run 终结边界、至多 NoiseLimit 个无关追加。所有日志条目是单一序列；读取与提交分开，真实 Run 语义由边界种类抽象。Budget 是有限实验预算，不是产品默认值。配置不施加公平性，只检查安全/责任不变量，不声称无饥饿或预算内必成功。

| 正配置 | 范围与前提 | 可失败断言/条款 |
|---|---|---|
| [Settlement.cfg](Settlement.cfg) | WithRun=TRUE、BoundaryKind=superseded、Budget=2、NoiseLimit=1；CheckTail/WholeBatch/KeepOwner/GuardOpened=TRUE、TrustUnknown=FALSE；初始 opened 已可判 | S-69 TailGuardSound/LateCorrect；S-70 NoOrphanMessage/ClaimsWholeBatch/UnknownNotAbsence；S-71/S-72 PendingOwned |
| [Settlement_EndedUnknown.cfg](Settlement_EndedUnknown.cfg) | 同范围，BoundaryKind=ended、UnknownOpened=TRUE；可发生门回执未知、opened 迟到提交、停止后读回 | 另检 S-17/S-70 NoSettlementThroughUnknownOpened、FirstTokenCorrect；同尝试 Run 终结不是模型调用终结 |
| [Settlement_NoRun.cfg](Settlement_NoRun.cfg) | WithRun=FALSE、UnknownOpened=TRUE；忽略尾比较仍维持单响应/原批/unknown 前提；没有伪 Run | S-68 无 run late 缺席由 LateCorrect 检查；S-70 原批及未知强门；S-71 责任保留 |

| 否定配置（不登记正任务） | 唯一故意破坏 | 指定失败 oracle |
|---|---|---|
| [Settlement_NoCompare.cfg](validity-check/Settlement_NoCompare.cfg) | CheckTail=FALSE，前缀读取后允许 Run 边界先提交 | LateCorrect |
| [Settlement_PartialBatch.cfg](validity-check/Settlement_PartialBatch.cfg) | WholeBatch=FALSE，回复方只写消息就确认批成功 | NoOrphanMessage |
| [Settlement_PartialClaim.cfg](validity-check/Settlement_PartialClaim.cfg) | 同一缺陷，消费者认半批为完整批 | ClaimsWholeBatch |
| [Settlement_UnknownAsAbsent.cfg](validity-check/Settlement_UnknownAsAbsent.cfg) | TrustUnknown=TRUE，旧写方未停就据缺席读关闭未知 | UnknownNotAbsence |
| [Settlement_DropOwner.cfg](validity-check/Settlement_DropOwner.cfg) | KeepOwner=FALSE、Budget=1，仅在已发生提交尝试并耗尽时丢弃未结算责任；取消分支仍保留 owner | PendingOwned |
| [Settlement_IgnoreOpened.cfg](validity-check/Settlement_IgnoreOpened.cfg) | GuardOpened=FALSE，门锚点未知期间允许普通结算 | NoSettlementThroughUnknownOpened |

**抽象映射与局限**：Prepare 是同次合法完整前缀，Submit/Process 分开表达在途追加；LoseAck 保留可能迟到的 Process；StopOld 是原物理写方实际停止而非取消信号，Recover 在全部旧写方停止后才把权威缺席认成未写。RecoverOpened 把共同实际停止及权威读回抽象成动作，不能由本模型推得真实网络、门回调或文件任务都响应停止。CancelPolicy/Exhaust 只把策略中止抽象为保留 owner 的未完成分支，不给外部服务新增状态。模型 pc 值不对应新的领域枚举。

稳定身份、参数/绑定/金额不变、Run 正确识别、合法读取权限和完整前缀本身由建模方式给定，不称为本模型已验证；OneResponse 的键等价与 FirstTokenCorrect 的数据映射只有正检查、没有各自独立故障开关，不单独声称 validity 已证。模型未表达真实 codec、损坏尾、多值头、租户鉴权、所有十三操作的具体返回、密集缓存追补、重复未知请求的任意次数、真实 Agent Loop、观察者或实际网络 send。由实例和真实多写方/文件/故障注入承担。

本版逐字复用 RT3 的三份 TLA 与十份配置；它们表达原适配与内容可见门范围，旧证据只绑定原输入及假设，不是 v4 重跑。原 Invocation 继续指向 v2；Settlement 补耐久结算交错，不把旧内容门模型扩称为耐久恢复证明。新登记候选任务为 model-request-runtime-v4-settlement、model-request-runtime-v4-settlement-ended-unknown、model-request-runtime-v4-settlement-no-run；所有负配置仅 validity-check。
