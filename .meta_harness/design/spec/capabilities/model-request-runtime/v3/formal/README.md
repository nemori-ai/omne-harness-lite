# v3 增量行为模型

本目录维护模型与配置；[版本外验证入口](../../verification.md#v3-变化与验证义务)拥有覆盖、前提与限制，单次执行输入与结果放本工作树 `tmp/<task>/`。
执行须使用指定 TLC 工具链；模型与配置存在不等于已运行或实现符合。

## 原状态机的采用边界

v3 保留十三个服务操作，原有交错消费已冻结 [v2 Invocation](../../v2/formal/README.md) 及其配置，原字节不变。
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
三个新正向任务的候选登记名分别为 `model-request-runtime-v3-content-gate`、`model-request-runtime-v3-adaptation-binding`、`model-request-runtime-v3-adaptation-lifecycle`；registry 由主线集成。七份否定配置均不登记为正向 formal task。
没有新 Alloy 模型：本批新增值结构由 model-profile/messages/model-response 的 Schema 承接，本契约只引值不另立结构权威。

本起草者的两个模型不替代主线 Adaptation 模型的义务；这三份模型也不承载 `retryDelay` 的实数关系、结果投影的全部字段、发送前取消的外层结果形状或S-66 当前输入提供者的真实读取、跨源一致性或 S-28/S-29 续接新输入分支。这些由规范向量及实现符合性验收承担。

S-15/S-16/S-17/S-33/S-55 的 opened 回执未知及取消后迟到提交分支不在现有模型范围：ContentGate 只验证可见门，不包含真实日志追加、丢回执、旧生产者实际静止、有效尝试栅栏或权威完整读回。零可见内容与已有耐久 opened 同时成立的组合、隔离后按真实锚点结算，须用真实日志与 runtime 故障注入验收；不由旧 TLC 运行代证。
