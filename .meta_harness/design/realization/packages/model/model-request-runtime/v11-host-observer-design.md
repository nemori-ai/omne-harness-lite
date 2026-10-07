# 显式宿主与有界观察端口的共享实现投影

2026-09-28，revision 1，**candidate，未接受、未实现验收**。本增补精化已采用的 [v3 R3-P8/P9](v3-design.md)，承接 [RT8 S-51/S-61/S-62](../../../../spec/capabilities/model-request-runtime/v8/contract.md)。RT8、data.arrival-events/v2、capability.stream-assembly/v3 均在 [catalog](../../../../registry/catalog.json) 为 accepted；RT8 采用沿 D-101。不新增插件、服务或第十四操作，不修改业务结果集合。需求沿 RT8 所列 PF-010/PF-013 来源；本次无产品政策选择。

下文类型、方法和文件分工均为**候选施工接口**，不是已有公开 API。现有源码只有独立 invoke 的 `onAccepted(event, snapshot)`、会话数据绑定和调用容器；`OpenCallInput.host: SessionRuntimeBinding` 尚不能兑现 S-61。共享 owner 的统一 store／组合 close 已技术采用，精确范围见 [统一收口](v10-owner-assembly-design.md#当前采用的收口范围)；L1/L2 交接不在其采用范围。本页仅给已采用统一收口必须纳管的新增资源，不替代恢复与耐久结算设计。

## 契约责任到实现

| 条款 | 插件／操作 | 实现绑定与版本 | 符合性依据或缺口 |
|---|---|---|---|
| RT8 S-28/S-61 | P-2 openCall、原调用容器 | 显式 `ModelCallHost`；登记早于异步准备和可见发布；会话数据仍从 sessions.bind 取得 | H-V1～V3 待验；旧 host 数据别名删除 |
| RT8 S-36/S-61/S-64 | 原 call 收口及 P-2 卸载 | 宿主停止请求进入同一原调用的 run_cancelled 收口；未释放登记由宿主持有 | H-V3/H-V4 待验；不把取消当 actual stopped |
| RT8 S-51/S-62①②③ | openCall、每次 dispatch/dispatchAgain | SessionRuntimeBinding 的实际观察授权入口；会话持有租户、endpoint 实例、call/dispatch 同时校验 | H-V5～V7 待验；无可信授权输入则 unavailable |
| RT8 S-51⑧⑨/S-62④⑤⑦ | invoke onAccepted → 本次观察队列 | ArrivalEvent v2、AssemblySnapshot v3；内容门通过后，快照位置切分接受增量 | H-V8 待验；独立 invoke 不引入租户、Cordis |
| RT8 S-62④⑥⑧⑨/S-63 | 有界观察队列、接收任务 owner | 显式事件及 UTF-8 实际序列化字节双限；独立拒收及诊断计数 | H-V9～V12 待验；不改 ModelResponse cause |

## 宿主端口与原调用所有权

```ts
// 全部为候选。RuntimeCloseResult 复用现有 released / unavailable 联合。
interface ModelCallHost {
  readonly signal: AbortSignal
  readonly stopping: () => boolean
  readonly register: (close: () => Promise<RuntimeCloseResult>) =>
    | { readonly registration: { readonly unregister: () => void } }
    | { readonly runtimeStopped: true }
    | { readonly unavailable: true }
}
```

`OpenCallInput.host` 改为此类型；SessionRuntimeBinding 不再兼任宿主。身份核验继续由 `sessions.bind(session)` 及日志、selection 的真实 session/tenant/generation 一致性承担；host 不是身份凭证。host 为调用方显式传入，同一个原 call 续接仍须是原 host 对象；跨 host 迁移只沿既有恢复入口，本次不开放替换。

宿主实现持有同一寿命的停止位、AbortController 和登记集合。`register` 必须同步完成“若 stopping 则拒绝，否则插入原 close”这一个临界段；stop 同步先置 stopping、abort，再取得集合并逐一请求 close。重入 stop 不能漏掉插入的元素；拒绝登记零资源发布。单机 JS 临界段不得 await；跨线程实现必须用同一宿主互斥原语，不把先读 stopping 再异步登记当等价。任一行为缺席/形状非法为 invalidInput{malformed}；登记不可判为 unavailable；明确停止为 runtimeStopped。

openCall 在取得任何异步准备资源前创建**原调用准备 owner**并登记 close，然后加取消监听并再次检查 signal/stopping。owner 从准备阶段持续到容器实际释放；close 同步关本 owner 准入并请求取消，准备任务迟到返回只能在同一个 owner 中释放，不能插入容器。登记成功但后续校验失败时，先停止本次准备任务、释放未移交 lease/观察绑定，再 unregister。原 call 已存在的续接不得创建第二个永久登记；只借原 owner，核同一 host 后更新请求，失败不关闭别人的原 call。

停止发生在容器发布前：准备返回 runtimeStopped，未发请求；已存在的 durable 事实不回滚。停止发生在发布后：即使 openCall 的短 reservation 已归还，宿主仍能调用原 close。close 直接沿 S-36 请求原 call 的系统停止收口，不通过 S-31 写用户中断意图，再等真实调用工作停止及既有结算责任。尚无 dispatch 的已发布 call 写 interrupted/run_cancelled 终结；在途 abandon 无 error、无回复；reply_pending 与调用方按 S-17 共同日志竞争，不能仅释放 lease。

这里不能让 close 等待一个由其自身占着 reservation 才会完成的公开 interrupt；共享内部收口构件接受已持有的原 owner，短 reservation 只保护状态切换，网络和追加等待在其外。准备 owner 与容器只有一次责任移交，宿主登记回调不替换成新调用、不重新发出。所有准备、监听、观察任务停止且原容器 actual released 后才 unregister；unavailable 或抛错保持登记、原 owner 和可重试 close，不靠 Promise 完成或 fiber 消失断言释放。

## 观察者请求、可信归属来源与按次建立

以下类型中的 `SessionRef`、`TenantId`、`ModelCallId`、`JsonNumber` 使用现有 core 公开定义；`ModelArrivalTarget` 为 `Extract<ArrivalTarget, {kind:'model_call'}>`，不复制目标字段。

```ts
// 候选接口；endpoint 是真实接收提供者实例，不是身份字段袋或布尔授权票据。
interface ModelObserverEndpoint {
  readonly open: (scope: ObserverScope) => ObserverReceiver
}
interface ModelObserverRequest {
  readonly session: SessionRef
  readonly endpoint: ModelObserverEndpoint
  readonly observer_max_buffered_events: JsonNumber
  readonly observer_max_buffered_bytes: JsonNumber
}
interface ObserverScope {
  readonly session: SessionRef
  readonly tenant: TenantId
  readonly target: ModelArrivalTarget
}
type ObserverScopeResult = { readonly valid: true }
  | { readonly invalidInput: { readonly reason: 'observer_scope_mismatch' } }
  | { readonly unavailable: true }
interface AuthorizedCallObserver {
  // 同步真实现读，不是恒真的 auth 标志；每次建接收端与交付前都核验。
  readonly check: (target: ModelArrivalTarget) => ObserverScopeResult
  readonly open: (target: ModelArrivalTarget) =>
    | { readonly receiver: ObserverReceiver }
    | Exclude<ObserverScopeResult, { readonly valid: true }>
  readonly close: () => Promise<RuntimeCloseResult>
}
interface SessionObserverAccess {
  readonly authorize: (input: {
    readonly request: ModelObserverRequest
    readonly session: SessionRef
    readonly tenant: TenantId
    readonly callId: ModelCallId
  }) => { readonly observer: AuthorizedCallObserver }
    | Exclude<ObserverScopeResult, { readonly valid: true }>
}
```

`OpenCallInput.observer?: ModelObserverRequest` 显式选择观察；没有配置则不建队列，配置后任何必需成员缺席都失败。`SessionRuntimeBinding.observers?: SessionObserverAccess` 是调用方已授权会话入口带回的行为，缺席只在配置观察者时 unavailable。runtime 校验 request.session 与绑定会话相同、绑定持有租户来源可核、两个界限为正有限整数；用精确 JsonNumber 判断，不经浮点舍入。runtime 生成/核准 callId 后即 authorize，早于 openCall 成功、锚点和联网。

**授权的实质实现归宿主装配**：会话出站持有者创建 endpoint 时把该实际对象与已核准的 session/tenant 及允许接收的 call/dispatch 范围放在其自身私有关联中；authorize 查该关联及当前会话持有关系，check 重查它仍有效且目标在范围内。关联由真实入口身份验证及创建动作建立，不能从 request 的 session/tenant 字段现填，也不能从 endpoint 自报 scope 或返回 valid 推导授权。未知关联 unavailable，明确错配 observer_scope_mismatch。提供者代码必须体现这次查询；测试伪造 valid 不能替真实装配验收。这个关联是既有出站接收资源的所有权表，不是新资产注册表/通用总线或持久领域对象。

openCall 尚不能确定的 dispatch 归属在发出前判：B 从权威历史得本次 target，调用已固定的 AuthorizedCallObserver.open(target)。该方法内部 check 后才调用原 endpoint.open，返回接收者前再次确认关联未撤除；同步构造中的重入撤除使新 receiver 进入 close，零交付。不得复用 dispatch 1 的 receiver 给 dispatch 2。同一 call 最多保留一份尚未 actual stopped 的 receiver/队列；进入下一次发出前先关闭原观察端。若仍未停止，本次仍核目标归属，但不创建第二个接收任务，观察交付独立返回 consumer_failed 并记录计数，模型请求和结算继续；绝不把新 target 文本交给旧 receiver。旧端真正停止后，下次 dispatch 才能重建接收者，不在当前发出的半途中暗自复活观察。已知的错误直接返回相应服务拒绝且零锚点/零 send；一个匹配所有后续 dispatch 的 endpoint 也必须每次建立具体 target 绑定。

续接 openCall 若观察请求变化，先对新请求 authorize；成功且原观察 receiver 已停后在同一原 call owner 内替换观察绑定，旧授权资源先关闭。失败保留原 call 的耐久阶段；不能把旧观察待交付内容送给新 endpoint。每次 dispatch 的 receiver 和队列由 call owner 持有，结束后关闭，未停止的旧 receiver 不得被丢弃；模型业务结算可以完成，不等待慢观察端。call 的最终资源释放仍等待或明确保留这些观察责任。

## 交付表示、位置和 actual stopped

```ts
// 候选技术交付表示；不新增 ArrivalEvent 事件种类。
type ObserverDelivery =
  | { readonly scope: ObserverScope; readonly kind: 'snapshot';
      readonly snapshot: AssemblySnapshot }
  | { readonly scope: ObserverScope; readonly kind: 'event';
      readonly position: JsonNumber; readonly event: ArrivalEvent }
interface ObserverReceiveTask {
  readonly completion: Promise<void>
  readonly stopped: Promise<void>
}
interface ObserverReceiver {
  readonly receive: (serialized: string, signal: AbortSignal) => ObserverReceiveTask
  readonly stop: () => void
  readonly stopped: Promise<void>
}
type ObserverOfferResult = { readonly accepted: true }
  | { readonly invalidInput: { readonly reason: 'malformed' | 'observer_scope_mismatch' } }
  | { readonly unavailable: true }
  | { readonly rejected: { readonly reason: 'buffer_full' | 'consumer_failed' } }
```

队列构件候选 `createModelObserverQueue` 由 C 实现，给 B 同步 `offer(event, snapshot): ObserverOfferResult`、`start(snapshot): ObserverOfferResult` 和 `close(): Promise<RuntimeCloseResult>`。每次调用 invoke 前建立 receiver/队列，把 onAccepted 固定为只调用该队列 offer 的闭包，不 await 接收者；原 invoke/anchored 仍只知道 ArrivalEvent 与 AssemblySnapshot，独立使用无会话依赖。

invoke 原 handle 建立后，B 在同一个同步段读取其**可见 snapshot**并 start：令位置为 p，首项为该 snapshot，删除暂存中位置 ≤ p 的增量，保留 > p 的已接受增量。offer 在 start 前仍受双限；不得先启动接收再拉快照，也不得重新构造一份装配状态冒充原快照。快照和事件 position 使用原 assembly 的精确计数；onAccepted 的 snapshot 仅提取位置，不为每个增量复制整份 growing snapshot。一次 start，不承诺补发被拒增量；快照拒收不会自动重新模型调用，消费者需完整事实可读会话日志。

实际交付表示固定为上述 envelope 的 `writeJsonLossless` 文本，交给 receive 的就是同一条不可变字符串；字节数是 `TextEncoder.encode(serialized).byteLength`，不是 JS 字符数、估计 token 数或接收端自报值。scope、kind、position 和 snapshot 的全部字节都计入。rawHeaders 无成员、不得拼入。双限计**等待队列加当前正在 receive 的一项**；snapshot 也占一事件。入队前核形状、原 target、可信 check 和两个余额；任一超限整项 rejected{buffer_full}，不截断、不修改模型流。超大单条不入队；序列化临时空间不宣称被队列限额约束，验收要单独测持有队列上界。

最多一个 receive 在途，顺序消费。调用 receive 前再次 check；撤权后清除未投递项并逐项记录归属拒收，接收者不获得文本。一次 receive 同步返回真实 task，completion 与 stopped 都由队列登记；completion resolve 仅表明接收处理返回，不代表 stopped。该项字节/事件额度直到 task.stopped 成功才归还，以防 completion 提前 resolve 后连续创建未停止任务。同步抛错、completion reject 或 stopped reject 均记录 consumer_failed，关闭观察准入并请求 receiver.stop；旧任务未 actual stopped 时保留 owner。接收实现不得启动未计入 stopped 的后台任务；socket flush、异步 UI 输出等如脱离 receive completion，必须仍计入 task.stopped 和 receiver.stopped。无法提供此生命周期的接收适配不可装配为本端口。

队列 close 同步关准入、丢弃等待项并计数、abort 当前任务及 receiver.stop；停止新 drain，移除本端监听。close 不无限 await 一个慢消费者：本次若 task/receiver 的实际 stopped 尚未成功，返回 unavailable 并保留原接收 owner；其停止 Promise 由 owner 持有并处理 rejection，随后重复 close 才可 released。没有隐式超时/重试数字。receiver.stopped 只有其全部任务和本端资源均已终止才 resolve；stop 请求本身不算。已关闭 offer 返回 consumer_failed 并计数，不积累文本、不重新打开调用。正常流结束的观察 drain 同样不阻塞 response 结算；需继续消费的队列保留在 owner 中，最终关闭由显式宿主收口驱动。

每项交付维护本次本地终局，拒收或 close 丢弃只能计一次；已计 consumer_failed 的同一在途项，不因 stopped 再拒绝或 close 再计一次。每次拒收有唯一关联诊断与丢弃计数，至少带 session、tenant、callId、dispatch、阶段、reason、position（存在时）、事件数/实际字节；不记录被丢正文、密钥或 rawHeaders。completion 失败前已返回 accepted 的交付，另报其异步 consumer_failed，不能谎称原 accepted 代表用户已读。诊断 sink 故障沿既有隔离政策，仍更新本地计数；观察失败不进入 FailureCause，也不造 trim 改写原装配账。

## Cordis、装卸与存储

仍为原 P-2 及原 call 资源，不为每次 dispatch 建 fiber。Cordis 4.0.4 采用依据 D-025。依赖替换触发卸载重跑引用 basis [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)；不同 effect 的异步清理无完成顺序引用 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)，两者已有 probe。宿主登记、取消、排空均是本项目机制，不冒充 Cordis 保证。公开 host/观察构件可单用，不调用 ctx.emit 或注入“当前会话”。

| 装载取得 | owner／可用时点 | 部分失败与撤除 |
|---|---|---|
| 宿主登记、取消监听 | 原准备 owner；登记与停止检查均通过后才继续 | 先停止准备／原 call；实际 released 才 unregister；未知责任保留 |
| 授权观察绑定 | 原 call；真实 authorize 后固定 | 部分失败关闭新绑定；旧 call 不误清；撤权不撤销已发生账单 |
| 每次 receiver、队列、接收 task | 原 call owner；本次 target 核准后可 offer | 关闭不再接纳，清等待队列，停止真实 receiver/task；未停止继续由宿主持有 |
| P-2 共享组合 | 沿主线统一 owner；发布不制造新寿命 | 单个收口 effect 发起原 owner close；fiber 消失不丢尚未释放登记 |

本增补**没有新增存储对象或同提交要求**。S-62 明定观察和业务结算无共同事务；S-17 仍以同一会话日志的整批响应、尾比较/判重为共同对象，沿已采用 v7/v9。宿主登记临界段只防进程内漏取消，不能证明持久结算原子性。所需存储提供者要求不变：权威完整前缀、持久整批追加、唯一判重、fence 和可识别 unavailable。跨进程演进时生命周期登记/取消和接收归属/背压协议须重新兑现，不把当前对象引用跨进程直接传递。

## 关键选择与施工依赖

| 选择 | 落选方最强理由 | 本方弱点／置信度 |
|---|---|---|
| 同一原 call owner 登记；不用 SessionRuntimeBinding 假扮 host | 合并参数少、调用方便 | 多一个显式寿命输入；可验证消除漏取消窗口，置信度高 |
| 每 dispatch receiver + 同步真实归属 check | 一个跨调用全局总线更易复用已有广播 | 装配必须交真实 endpoint 关联；正确性责任清晰，置信度高 |
| 单在途接收，双限包含在途 | 多并发接收可提高吞吐 | 慢端更早触发 buffer_full；符合不阻结算与有界要求，吞吐未作优化，置信度高 |
| 既有 P-2 一条收口 effect，调用是资源 | 独立 fiber 可借框架状态观察 | 需显式保存原 owner；避免重载自动重发且符合原采用，置信度高 |

| 施工 owner | 唯一负责面 | 依赖与完成条件 |
|---|---|---|
| C，共享类型／容器实施者 | service-types 新端口、原 owner 登记保留、观察 queue 构件、README 双语公开面 | 先发布类型；不得由 B 重定义。原容器 close 明确纳管准备、授权、receiver/task；H-V1/V4/V9～12 |
| B，open/dispatch/control 实施者 | openCall 删数据 host、提前登记核验、每 dispatch 建目标接收、原 onAccepted/快照接线、S-36 收口 | 消费 C 类型/队列；host close 不走死锁 reservation；H-V2/V3/V5～8 |
| 主线装配实施者 | 显式寿命、真实 endpoint 归属关联、接收 stopped 适配、两个配置、诊断 sink | 最小示例/后续产品消费者真实承接；不新增正式 app；真实组合 H-V4～12 |
| 独立验收者 | 故障注入、负控、真实 Cordis 与接收端任务 | 独立复评及主线采用后实施，不能以本稿自检代签收 |

C 类型落地后 B/C 可并行；装配可先实现真实生命周期与 endpoint 关联，等待公开构件后接线。配置错误沿 RT8：显式调用输入非法 invalidInput；未知归属 unavailable；宿主停止 runtimeStopped；观察投递失败独立 rejected；不默默给无限默认。不改变既有插件静态配置非法时启动失败的政策。

## 缺口与受阻消费者

H-G1：本候选未独立评审、未采用；B/C 不以 candidate 擅自改变公开面。H-G2：尚无该端口的真实宿主/接收装配与可失败证据，S-61/S-62 完整服务验收受阻；主线装配实施者承接。H-G3：现有持久结算恢复及统一 owner 的未决事项由原主线处理，本稿不能将“观察任务停止”替代“原调用全部 released”。没有发现必须改变 RT8 的新语义缺口。本次新增 bindings **0**，所有验收场景归 [验证义务](verification.md#v11-宿主与观察端口义务)。
