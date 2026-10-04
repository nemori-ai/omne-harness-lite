# model-request-runtime：当前格式与十三操作公共施工面

2026-09-28，rev 1，**candidate，未接受；新增绑定 0，未运行本增量实现验证**。本稿是现有节点的窄增补，不新建插件、操作、提案或通用依赖平台。除十三个契约操作及已有源码符号外，下文新增 TypeScript 类型、方法、字段、文件名均为**候选实现面**，须由主线统一施工后才成为公开 API。

## 输入与采用门

继承 [D-076](../../../../record/decisions/model-runtime-delivery-adoption/decision.md) 的 [v3-design](v3-design.md) 与 [D-087](../../../../record/decisions/model-runtime-v4-projection-adoption/decision.md) 的 [v4-design](v4-design.md)：十三操作、P-2/P-5、宿主责任、同次前缀和未知写者机制不重做。沿 [D-099](../../../../record/decisions/model-input-limit-consumer-contract-adoption/decision.md) 已接受的 [RT6 S-74～S-76](../../../../spec/capabilities/model-request-runtime/v6/contract.md#s-74-每次发送之前的完整输入限制与固定计划) 补最终输入计量、完整未处分响应、真实重试历史与 S-34 重取。

本稿最终目标坐标为同一 baseline `omne-harness-lite-design-2026-09-15` 的 `capability.model-request-runtime/v7`、`capability.model-profile-directory/v5`、`data.model-profile/v5`、`data.messages/v6`、`data.model-response/v7`、`data.loop-extension/v6`、`capability.loop-extension-runner/v5`。已阅读这七份无旧格式过渡候选；它们只在原 RT6 语义上去除旧格式 codec/读回/结算义务及替换精确坐标。**本次检出 catalog 尚未登记这些版本，候选尚未采用；R7-G1 阻止据本稿宣称新代际已采用。**正文用 RT7/MP5/MS6/MR7/LC6 指上述精确目标，非已接受声明。候选最终资源与 catalog 对齐由主线完成，不由本稿改契约。

产品来源沿 RT6 的 PF-013 rev14 与 D-096，不新增产品规则；同时消费 PF-009 rev8、PF-012 rev15；其余需求沿 RT6 的精确范围。Cordis 采用 D-025 的 4.0.4；存储消费 SL3 抽象、不选择新数据库。静态配置形状错误按原 v3 启动配置检查拒绝启动；运行中具名依赖不可用沿操作返回 unavailable，真实凭据缺席仍按 S-19/S-29 的 credential_unavailable 分支，不把它改成配置默认值。

## 增量责任投影

| 行 | 契约责任 | 兑现点与采用路径 | 依据或缺口 |
|---|---|---|---|
| R7-P1 | RT7 S-28/S-53/S-74；MP5 S-8/S-9/S-27/S-32/S-33 | root 唯一当前 codec 与完整快照；目录、日志写方、公共 invokeModel、demo 同代际迁移。删除旧 codec 分发与版本兼容导出；规范精确旧 Schema 依赖不等于旧 codec | R7-V1；候选采用 R7-G1 |
| R7-P2 | S-29/S-30/S-54/S-57/S-58/S-74 | B 组在每次 dispatch 的已出门之前取得并消费同一固定 planned；transport 完成全量计量，runtime 不另造 token 估算或绕过门 | R7-V2；计量 R7-G2 |
| R7-P3 | S-17/S-29/S-49/S-75；MR7 S-39 | B 组产生完整 PendingModelResponse，C 组结算；共享 core 类型唯一。服务 settleReply 仅 vetoed/consumed，persisted 由调用方原 [M,R] 批路径承担 | R7-V3；当前实现仍为 responseFor 回调，须迁移 |
| R7-P4 | S-29/S-34/S-35/S-60/S-76；LC6 S-42/S-43 | A 从同一合法全前缀构造 failureSubject；runner5 写真实 modelCallId；P-5 只消费主体及显式政策 | R7-V4/V5；真实结论源 R7-G3 |
| R7-P5 | S-6/S-15/S-17/S-31～S-34/S-36/S-68～S-73 | root 调用容器持所有权；B/C 共用唯一 coordinator、reservation 与原日志对象；opened unknown 优先隔离 | 原 v4 提交规则，R7-V6/V7；真实 Run R7-G4 |
| R7-P6 | S-24～S-34/S-49/S-50/S-66 | 一份 service-types 与构造输入，A/B/C 不各自定义调用状态、依赖或失败方言；所有方法仍显式 session | 下表施工分组；R7-V8 |

## 一次锁定的公共类型与构造签名

以下是实现映射的 TypeScript 施工伪型，不是语言无关契约的第二份定义。`OpInput<S>` / `OpResult<S>` **只作为文档的精确条款代号**：root 在 `service-types.ts` 展开对应 RT7 条款①/⑤/⑥的具体可辨识联合，不实施泛型字符串派发，不把它们实现成 unknown/任意 JSON，也不把所有操作失败并成一种大联合。身份与事实复用当前 core 公开类型，外界不可信值仍经过接收校验。

```ts
interface CallKey {
  readonly session: SessionRef
  readonly callId: ModelCallId
}
interface ModelRuntimeService {
  legalTargets(input: OpInput<'S-24'>): Promise<OpResult<'S-24'>>
  displayList(input: OpInput<'S-25'>): Promise<OpResult<'S-25'>>
  effectiveModel(input: OpInput<'S-26'>): Promise<OpResult<'S-26'>>
  selectModel(input: OpInput<'S-27'>): Promise<OpResult<'S-27'>>
  openCall(input: OpenCallInput): Promise<OpResult<'S-28'>>
  dispatch(input: OpInput<'S-29'>): Promise<DispatchSuccess | OpFailure<'S-29'>>
  dispatchAgain(input: OpInput<'S-30'>): Promise<DispatchSuccess | OpFailure<'S-30'>>
  interrupt(input: OpInput<'S-31'>): Promise<OpResult<'S-31'>>
  releaseCall(input: CallKey): Promise<OpResult<'S-32'>>
  reconcile(input: OpInput<'S-33'>): Promise<OpResult<'S-33'>>
  readAttempts(input: CallKey): Promise<OpResult<'S-34'>>
  settleReply(input: CallKey & {
    readonly disposition: Exclude<ReplyDisposition, 'persisted'>
  }): Promise<OpResult<'S-49'>>
  canDispatchAgain(input: CallKey & {
    readonly plan: RetryPlan
  }): Promise<OpResult<'S-50'>>
}
```

`ReplyDisposition` 精确是字符串 `persisted`、对象 `{ vetoed: { by, reason? } }`、对象 `{ consumed: { by } }` 三支；服务输入只收后两支，并在接收边运行期拒绝 persisted。无 `any` 或万能输入袋。dispatch 与 dispatchAgain 的失败联合不同：分别是 `DispatchSuccess | OpFailure<S-29>` 与 `DispatchSuccess | OpFailure<S-30>`；下述四支组成共有 `DispatchSuccess`：

| 共同成功成员（候选外壳） | 值及唯一依据 | 所有权与禁止 |
|---|---|---|
| `replyPending: PendingModelResponse` | MR7 S-39 的全部值；S-75 | 原容器仍持待结算责任；不另给默认 persisted，不提前带 late |
| `settled: ModelResponse`，failed 时另必有 `failureSubject: AfterModelCallFailureSubject` | S-29/S-76；MR7/LC6 | 只有耐久批成功或完整认回才返回；failureSubject 暂不可得返回 unavailable，已提交响应不撤销 |
| `undispatched` | S-28/S-29 已有零历史分支的完整形状 | 不把已发过的调用改写为此支，不把 S-74 三项拒绝变成此支 |
| `released: { cause: 'credential_unavailable' }` | S-29⑧/S-30⑧：已有发出后凭据明确缺失，调用终结追加确认后返回 | 不返回 ModelResponse，不伪造零历史 undispatched；追加未知则 unavailable 并保留责任 |

`OpenCallInput` 逐项展开 S-28①：显式 session/messages/target/basis/tools、可选 callId/parameters/targetChangedBy，withRun 分支同时有 run/attempt/report，noRun 三者均无；另带 S-61 宿主与本会话合法追加入口。续接保留同 callId，快照从原锚点取；新 messages/tools/report 的可变边界沿 S-28，不能通过可变共享数组偷改已规划输入。

```ts
interface RuntimeSessionAccess {
  bind(session: SessionRef): Promise<
    { readonly binding: SessionRuntimeBinding } |
    { readonly failure: 'invalidInput' | 'unavailable' }
  >
}
interface SessionRuntimeBinding {
  readonly log: SettlementLogBinding
  readonly selection: SessionModelSelectionInput
  readonly tools: Pick<AssetRegistryService, 'lookup'>
  readonly catalog: ModelCatalogRead
  readonly credentials: CredentialLookup
  readonly currentEvaluationInputs: CurrentEvaluationInputs
}
interface RuntimeConstruction<P extends PlannedSemantics, R> {
  readonly sessions: RuntimeSessionAccess
  readonly calls: CallContainerStore<P, R>
  readonly transport: ExactTransportAcquirer<P, R>
  readonly settlementContention: SettlementContention
  readonly settlementScheduler: SettlementScheduler
  readonly policy: InvocationPolicy
  readonly identities: ModelIdentitySource
  readonly history: CurrentHistoryReaders
}
declare function createModelRuntime<P extends PlannedSemantics, R>(
  input: RuntimeConstruction<P, R>,
): { readonly service: ModelRuntimeService; readonly close: () => Promise<RuntimeCloseResult> }

declare function createCallContainerStore<P extends PlannedSemantics, R>():
  CallContainerStore<P, R>
declare function createCallContainer<P extends PlannedSemantics, R>(input: {
  readonly key: CallKey
  readonly session: SessionRuntimeBinding
  readonly binding: PreparedCallBinding<P, R>
  readonly request: OpenCallInput
  readonly owner: SettlementOwner
  readonly coordinator: SettlementCoordinator
}): CallContainer<P, R>
```

`PreparedCallBinding<P,R>`（候选）是 B 完成 S-28 检查后的只读准备值：完整 `ModelProfileRef`/`ModelProfileSnapshot`、合并后的 `ModelRequestParameters`、`SelectedBy`、精确 transport lease；不是可发送的 planned。其构造只接受新目录成功读或当前格式原锚点成功读，不由 caller 自填通过布尔值。`createCallContainer` 仅捕获已有资源并建立状态，不读目录、不发送、不追加；B 创建后在同一 reservation 下 insert，失败即由 B 关闭其 acquired lease/owner。`createCallContainerStore` 只建本实例内存所有权索引，无 IO，无恢复事实。

这些新增端口的**最小责任及签名**在下表封闭；不得让分组各自补隐式默认值。具体现有类型可拆 input/result 别名，但不改变责任。`RuntimeSessionAccess` 由装配核实入口身份及会话归属后构造，只是一条真实会话绑定取得路径，不是新增目录/租户平台；每次 bind 核 session 与返回 log/selection 的 session、tenant、generation 一致。形状本身不证明授权。caller 不可提供 `authorized: true` 代替来源。

| 共享构件（候选，root 拥有） | 最小调用形状与责任 | 缺席、并发与失败 |
|---|---|---|
| `ModelIdentitySource` | `call(): ModelCallId`；`response(): ResponseId`；调用方消息身份沿原 MR7/MS6 构造端口；只在合法创建时分配，稳定候选不换 ID | 明确注入，不能用响应重试换键；不复刻身份 Schema |
| `ExactTransportAcquirer<P,R>` | `acquire(binding: ModelAdaptationBinding)` 返回精确 lease 或 unavailable；lease 内 adapter、计量构件及显式 release。计量细节由 transport 节点既定接口输入，不以无证据 meter 回调代替 | S-53：定义撤回不擅换 latest；实际网络/回调/写者静止并结算或合法交接前不 release |
| `CallContainerStore<P,R>` | `find(key: CallKey)` → 当前 `CallContainer` 或 absent；`reserve(key)` → `CallReservation` 或当前占用；`insert(reservation, prepared)`；`remove(reservation)` | 进程资源表，不是耐久事实表。调用操作顺序由一次 reservation 同步取得保证，检查后追加前保持拥有；同调用并发在前一 reservation 更新后按原 phase 重判，不生造 busy 失败。异步排队如需要必须使用既有显式有界策略 |
| `CallContainer<P,R>` | 不可变 key、会话绑定、profile/snapshot/parameters/selectedBy、精确 lease；当前 messages/tools、宿主、local responsibility、待处分完整值；原 opened task、unknown append tasks 与 coordinator | 所有 mutable 状态封装在该 owner，A 读不可变 view；phase 不推翻权威耐久事实。未结算写者仍可能产生效果时不能移除容器或释放依赖 |
| `CallReservation` | `view()` → 本容器只读视图；`publish(next)` → 当前责任更新；`release()` → 仅让出本地操作准入 | 不代表日志 fence、Run 真相、实际取消或新 phase；调用方法自身终结 release，持续写任务由容器独立保留；待流式结果时允许 interrupt 的受控状态读取/写意图，不将整段网络等待封在互斥门里 |
| `CurrentHistoryReaders` | `call(prefix: SettlementPrefix, callId)` → CallHistoryResult；`failure(prefix, callId)` → 完整 LC6 subject 或 unavailable；`run(prefix, originalRun, originalAttempt)` → 原 owner 的真实解释结果或 unavailable | 必须消费传入同一 owned prefix，不暗自读另一尾。run 的结果只由已采用真实记录解释器生成，禁止 boolean Run 替身；缺来源只挡需要它的分支 |
| `RuntimeCloseResult` | `{released:true}` 或 `{unavailable:true}`；保留原 unresolved 任务 owner | close 不保证物理停止；任务 completion 与 stopped 分开。disposer 不能以返回 unavailable 后丢引用完成整个 owner 生命周期 |

**仍需 root 落码前锁定的精确项目**：transport 最终计量构件具体导出类型、Run 真记录解释器和 runner 结论解释器的接受坐标。前项是已定语义的 TypeScript 投影；后两项是 R7-G3/G4 的真实提供者门。未取得时不伪造类型满足，以可确定读/选择/noRun 路径先行实施。

## A/B/C 文件及责任边界

| owner | 文件候选及现有复用 | 操作与交接 | 不得拥有 |
|---|---|---|---|
| root | `service-types.ts`、`service-container.ts`、root exports；core 当前类型与单 root codec 接续 | 一次锁输入/输出/构造签名、reservation、容器视图、prefix/unknown 任务公共类型；不分组各造错误集合 | 不在类型文件混入 send/结算或替造源事实 |
| A | `service-reads.ts`、`failure-subject.ts`；`session-selection*`、`selection*`、`call-history`、`call-state` | legalTargets/displayList/effectiveModel/selectModel/readAttempts/canDispatchAgain；B 传同 prefix 取 failureSubject，C 对账只返原 state，调用者可 S-34 重取 | 无发出循环，不在失败历史缺席时补空数组，不私造 Run 认法 |
| B | `service-calls.ts`、`service-dispatch.ts`、`service-control.ts`；`anchored-invocation*`、`call-tools`、`dispatch-guard` | openCall/dispatch/dispatchAgain/interrupt/releaseCall；prepared call 给共享容器；完整 Pending 给调用者；所有耐久结果经 C 共享结算构件 | 不代 S-49 接 persisted，不重写 coordinator，不做隐藏重试，不独占流式全程阻止中断 |
| C | `service-reconcile.ts`、`service-plugin.ts`；`settlement-*`、`response-construction` | reconcile/settleReply、P-2/P-5 装卸与共同结算；统一外部 persisted 路径和 runtime 响应路径使用同一 root codec/键 | 不改 B 既定 outcome，不猜 failureSubject，不在卸载时删 durable 锚点 |

root 类型合入先于 A/B/C 互相集成；各组局部可用精确受控输入先施工，但真实来源/装配尚缺不得宣称服务交付。跨组不抢 index/package.json/同一测试文件；每组行为测试按文件归属，root 最后统一 bilingual README 与组合示例。

## 最终计划、失败主体与单一 codec

1. `openCall` 完整接收 MP5 cap；新调用才读目录，续接只读原 MS6 锚点。B 的每次 dispatch 先当前时限与凭据，再由原 lease 的 plan 固定 messages/system/tools/cache/protocol/modalities 后计量，**零新锚点**的拒绝严格沿 S-74。required meter 获取失败为 unavailable；有效材料计量不足为 input_size_unavailable；不拿字符倍率放行。原阶段/unknown 责任不变。send 只消费同一 owned planned，不认外界布尔通过位。
2. 有回复结果由 MR7 构造完整 PendingModelResponse，S-75 全字段与 rawHeaders/usage/cost/trims 均保留。它禁止 disposition/late；调用方 persisted 按原共享 coordinator 构 [M,R]，service settleReply 只给 vetoed/consumed。处置输入不改变既定 outcome；已有完整批优先认回。
3. A 的 `readAttempts` 只从同次 prefix 定状态/dispatches/最近响应；仅 failed+awaiting_decision 必带 LC6 failureSubject。runner5 同前缀的同 session/callId 生效 retry 原值按日志顺序全部保留；不按供应商、时间戳或值去重。历史暂不可得返回整体 unavailable，已经结算的 failed 与账保留，恢复后 S-34 重读，不重发、不计次、不重写响应。
4. 默认 P-5 的 `decideRetry` 计默认件自己已给 retry 条数，不按 dispatch 数替代；已给未发仍计，runtime_lost 续接不计。没有 runner 真实新结论关联时不宣称默认重试闭环通过；选择、读取非失败分支和 noRun 发出不因此全局关闭。
5. 删除 `log-codec-v2` 等旧格式执行分轨，所有当前写方与消费者走当前 root codec。旧用户目录不重写不清空；显式错误输入按当前 malformed 或 cap-missing，耐久内容当前格式无法可靠解释则 unavailable。历史冻结文档/精确依赖资源保留，不导出可运行旧 codec。当前代际已受理的未结算责任不因升级或重构被遗弃。

## 共同存储对象与装卸配对

继续使用 v4 的共同**会话日志对象**：本 session 的权威 entries 与 tail、判重键、fence 检查同在 SL3 一次追加边界。runtime、外部 persisted [M,R]、runner 的新 attempt/Run 终结、对账写方都改变同一对象。withRun 响应经同前缀解释原 attempt/Run，再用 unfenced+tailEquals 提交；noRun 响应为 unfenced+unconditional，late 缺席。其余锚点/意图/终结沿原 fence+unconditional 矩阵。不把本地 reservation、时钟或单独两个 Run bool 当共同存储。

| 对存储提供者要求 | 条款与配对责任 |
|---|---|
| 全尾比较、判重、批原子持久确认与 attempt fence 在同一追加边界 | RT7 S-15/S-17/S-68/S-69；SL3 S-8/S-13/S-14/S-17；[session-log-jsonl v3](../../session/session-log-jsonl/v3-design.md) 同侧要求 |
| 同一身份、代际、合法全读得到连续完整前缀及其尾；失败具名可识别 | RT7 S-34/S-69/S-76；SL3 S-32/S-33；不需要新数据库或第二本 retry 账本 |
| unknown 写者真实停止后权威恢复；旧读尾/THIS 零写不能消除旧未知 | RT7 S-17/S-33/S-70；SL3 S-22/S-23/S-34/S-35；[恢复投影](../../session/session-log-jsonl/v3-recovery-design.md) |

两条必要交错：A 读 t，runner B 写 retry 或新 attempt 后 A 提交旧尾响应应零写并重读；A 先提交完整原批，B 后推进，原响应值不追改。另测 failed 已提交后 runner 源不可读，S-34 unavailable；恢复后只读拿同调用全部 retry，不产生新响应。retryConclusions 读取是快照，不声称读取与随后 dispatchAgain 在同一提交，后者独立过守卫。

| 装载贡献/资源 | 取得、对外可用与部分失败 | 撤除/停止与保留 |
|---|---|---|
| P-2 modelRuntime 服务（候选名） | 必需依赖 ACTIVE、静态配置通过后提供；应用另核恢复准入；部分失败关闭已取得资源 | 一项组合清理先关准入，再让已有调用按 S-36 收口；不是把十三操作各做 fiber |
| 调用容器及精确 lease、credential、网络/门/append 任务 | B 准入时持有，容器 register 先于实际任务；失败显式收未发布资源 | abort 仅请求停止；等真实 stopped 与响应结算/合法恢复交接，未知未闭合保持引用。已提交账与日志保留 |
| P-5 默认贡献 | 沿 S-35/S-67 向 runner 登记，声明、政策齐全才可调用 | 撤贡献不删除已给结论、不重跑链；默认件本身不发送或计时 |
| 全读授权/时钟/入口身份/恢复开闸 | 归当前实际宿主装配，不是本节点新语义；example 消费者只能按其真实配置声明范围 | 宿主确保旧写者静止与唯一恢复，未承接不得启用相应路径；不恢复已退役 acceptance app |

上游依据：[plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)。均有 probe；不将 `inject` 当可选分支探测器，G28/runner 解释采用显式具名端口结果，使其缺席不令无关 noRun/selection 依赖全停。内核自动撤除服务不保证取消在途网络，本文收口由真实 owner 完成。

## 取舍与实施缺口

| 选择 | 落选方最强理由 | 本方弱点及置信度 |
|---|---|---|
| 继承两个插件、共享调用 owner，A/B/C 只是施工分组 | 每组独立插件可分别换代 | 需要同一次 root 类型集成，不能用插件隔离规避公共状态；高，契约 owner 未变化 |
| 当前 root codec，所有当前消费者直接迁移 | 旧 codec 可继续读历史、降低切换成本 | 旧数据当前不可解释会明确拒绝，用户须保留旧资料另处理；高，用户已要求且待精确契约接受 |
| 同前缀真实结论投影，branch 局部门 | 全局等待 runner 就绪容易装配 | 需要按调用路径明确就绪范围；高，S-76 真实来源与 S-24/noRun 不共享该必要输入 |
| 保留现有 coordinator 与显式 owner/任务 | 直接 await append 更少代码 | 更复杂的 unknown 所有权必须组合实测；高，S-70 明确不能以回执结束等同停止 |

| 缺口 | 受阻范围与 owner |
|---|---|
| R7-G1 新 RT7/MP5/MS6/MR7/LC6/directory5/runner5 精确候选尚未 catalog 接受 | 主线负责版本闭包/采用。本稿不放行 frozen RT6 与无旧 codec 的矛盾，不回填旧契约 |
| R7-G2 精确模型/供应商全输入 token 计量依据及实际 meter | transport owner；只挡需要发送的具体模型/输入组合，缺 meter 不发送；永久 unavailable 不算完成 |
| R7-G3 runner5 真实结论写入、同调用关联、生效解释 | runner 与 A；阻失败主体/default retry 完整路径，不挡选择/noRun 的非失败结果；受控输入只验算法 |
| R7-G4 G28 原 Run/attempt 真记录解释及合法完整读接线 | 原 loop/装配与 C；只挡 withRun 所需判断，不把 noRun 一律拒绝。无 boolean 替身 |
| R7-G5 当前接口集成、真实日志未知写与关闭、外部 persisted 消费者 | root/B/C 与宿主；完整十三操作目前未验收，源码函数存在不能作结论 |

验证义务见 [R7 当前格式与服务施工义务](verification.md#r7-当前格式与服务施工义务)。本稿没有新已运行证据，bindings.yaml 保持原版本、原范围，不复制绑定或把旧模型结果改记成 RT7。
