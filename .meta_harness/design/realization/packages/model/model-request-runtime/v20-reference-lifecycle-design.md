# 持久调用引用、独立消费者与结果留存

当前技术采用范围与排除见本页“当前采用范围”；不据此宣称实现或验证完成。

## 输入与采用边界

已核 [catalog](../../../../registry/catalog.json)：`capability.model-request-runtime/v11`（下称 RT11）、`data.model-response/v10`（MR10）、`data.messages/v7`（MS7）、`data.call-accounts/v3`（CA3）均为 candidate；`capability.session-log/v3`（SL3）为 accepted，本批不升版。规范基线 `omne-harness-lite-design-2026-09-15`，读取本批契约基线 `1254553f` 及本次 S-85/S-93/G-39、MS7 S-55 无GC适用条件修订。需求为 PF-013 rev16、PF-012 rev21、PF-015 rev20；范围和机制来源见 r4、四表 与 机制读数。本次消费已完成的领域/机制读数，不重新声明双盲。

Cordis 采用 D025 的 4.0.4。只复用 Cordis；DSH registry 范式仅是提案的对比输入，不引入 DSH Agent、通用 registry、新进程、每调用 fiber 或完整 Session/Run 系统。P-2 仍提供一个 `modelRuntime`，P-5 默认重试消费沿 v17/v18 的真实原 Run 来源。公开 `invokeModel` 和纯构件仍可脱离 Cordis、会话、租户和存储使用。

本页的新增服务成员、技术端口、类型、字段和存储对象名一律为**候选**；引用现有同名接口时显式注明“现有”。共同配置政策：静态必需端口/政策/密钥配置错误在初始化失败；显式调用表示错误沿原 `invalidInput`；受信来源不可达/不可核为 `unavailable`。业务上当前凭据不可取得仍按 RT11 原闭合分支处理，不改成启动配置错误。重试、等待、容量、追尾及关闭策略显式配置，不填猜测默认值。

## 契约责任到实现投影

| ID／契约责任 | 插件、服务或公开兑现点（新增均候选） | 实现与采用边界 | 符合性依据或缺口 |
|---|---|---|---|
| R20-P1：RT11 S-84/S-89；MS7 S-51 | 原 P-2 新增 acquireCall；独立 consumer resource | 现 `service-runtime.ts`、`service-types.ts`、`service-container.ts`；新增面未实现 | R20-V1/V2/V3；MS7 独占 CallKey，非权限 |
| R20-P2：RT11 S-28/S-85；MS7 S-52～S-54 | openCall 的 creationKey 认回、内容发布、created/拒绝创建 | 原 `service-calls.ts`、共同 codec 的候选扩展 | R20-V4/V5/V6；无GC耐久容器 R20-G3 |
| R20-P3：RT11 S-17/S-75/S-86；MR10 S-39/S-46 | dispatch 的完整原 pending→ready、无回复 final | 原 anchored invocation、response construction 与 settlement coordinator；未新增第二模型结果装配器 | R20-V7/V8/V9；原值持久，处分独立 |
| R20-P4：RT11 S-87/S-93 | RuntimeSessionAccess 的当前 action 资格及撤权准入 | 现 sessions.bind/observer 授权的窄扩展；真实来源由访问装配提供 | R20-V10/V11；R20-G2 不准 caller true |
| R20-P5：RT11 S-33/S-90/S-91 | 先认回、callPresence.read、指定 lookup | 现 `service-reconcile.ts`、`service-reads.ts`、`call-history.ts` 的分支重排与派生索引 | R20-V12/V13；没有本地对象不推 lost |
| R20-P6：RT11 S-15/S-88；SL3 S-10/S-32～S-37 | 原 opened 门 unfenced + tailEquals；新 dispatch 保留 fenced | 现 `anchored-invocation.ts` 门与 codec/完整前缀 | R20-V14/V15；共同对象为同本 Session 日志 |
| R20-P7：RT11 S-69/S-75/S-86；MR10 S-47；MS7 S-9 | 既有授权回复写方同批 `[AssistantMessage, final]`；settleReply 只 non-persisted | 原 settlement coordinator 与实际消息写方组合两个 core judge | R20-V16/V17；转换来源、写权在 R20-G2/G5 |
| R20-P8：CA3 S-40～S-42；RT11 S-34/S-86/S-91 | 原费用读面先按 ResponseId 选择，再 sum/corrections | 原 `readAttempts`/历史解析及实际费用消费者；core sum 签名不变 | R20-V18；缺源不等于零，原 Run/Session 不迁账 |
| R20-P9：RT11 S-61～S-64/S-84/S-86/S-94 | 原 ModelCallHost 的 execution close 与独立 consumer 清理 | 原 store/准备 owner/observer queue，候选拆开 lease 与 orphan receiver 留责 | R20-V2/V8/V19；真实停与持久责任分别检查 |
| R20-P10：RT11 S-77～S-83；MR10 S-47 | 原校准 reader 与 H19 原值输出历史 | 原 `service-calibration.ts`、`output-history.ts`；本次不新增派生DTO | R20-V20/V21；真实媒体派生另留R20-G5，H19 原采用 transport v13，后续 v14 拒绝映射不改变本接缝 |
| R20-P11：RT11 S-23/S-92 | 十四操作、原 failure consumption、demo loop 与双语例子同步迁移 | 现服务 root、插件转发名单、tests、examples；尚未迁移 | R20-V22/V23；ref 不取得 anchored 控制与消息写权 |

## 唯一公共接口账本

共享数据只 import/reexport [MS7 节点](../../core/messages/v7-design.md) 的 CallKey、CreationKey、ModelCallPayloadRef、ModelCallCreatedPayload；删除 runtime 当前 `service-types.ts` 的本地 CallKey 定义。PendingModelResponse/ModelResponse/ResponseId 仍来自 [MR10](../../core/model-response/v10-reference-result-design.md)，不建 PersistentPending 或另一份 Schema。原十三方法名已存在；以下是候选后继的**唯一增量账本**，未列出的输入和闭合失败沿 RT11 对应操作及现有 root 类型。

资源迁移沿各 core 节点：MS7 root 保留 LC6 所需 `messages/schema/v6`，CA3 root 保留精确 `call-accounts/schema/v2`；MS7 created 所需 MP6 用候选 `model-profile/schema/v6` 原字节资源。现 model-profile root/schema 仍为 MP5，本页不要求把它升为 MP6，也不重定向旧 `$id`。这是制品资源闭包要求，子路径尚未实现，不是多版本 runtime 兼容层。

| 操作／条款 | 候选公开增量与实际调用路径 |
|---|---|
| legalTargets／S-24 | 显式 session→当前受信绑定→原允许集合，零 call resource |
| displayList／S-25 | 显式 session→当前目录/投影→原列表，ref 不扩权 |
| effectiveModel／S-26 | 当前求值→原 basis；不从旧调用替新 basis |
| selectModel／S-27 | 当前切换资格→原日志事实→后继选择；已创建内容不变 |
| openCall／S-28/S-85 | OpenCallInput 必填 creationKey；原显式 host 仍为真实 execution owner。先当前创建资格、同键认回，再新建准备。成功增加 ref；同键返回原采用事实与当前全部 S-6 状态；新增 `{creationConflict:true}`，不带原内容。初次 rejected 仍返回原 callId/handed_up/undispatched；稳定键保存但不伪造 accepted |
| dispatch／S-29 | 仍用 CallKey + 原 attempt；accepted created 已发布才准入。原 `replyPending` 成功字段保存 MR10 全值，候选增加 `state:complete|interrupted` 与 `disposition:disposition_pending`；只有 ready 确认才成功。原 failed/无回复 interrupted settled 分支保持，不替它们造 pending。原 consumeFailure overload 保留 |
| dispatchAgain／S-30 | 原 RetryPlan 和实际原工作准入→新 fenced dispatch；返回沿 dispatch。后继 Run 只读不能调用失败重试冒领原工作 |
| interrupt／S-31 | 原 initiator 输入与 stage 返回不变；当前 cancel 门→原意图提交→请求停止。它是命令，不返回第二份响应，ready 已终态时 alreadyEnded |
| releaseCall／S-32 | 原工作放弃、只 awaiting_decision/resumable；与 consumer.release 无关；当前资格不由只读 ref 获得 |
| reconcile／S-33 | 原 session/attempt 输入；返回 calls 的 state 扩为完整 S-6 联合，附同一 CallReadView 中已有事实。逐 call 先 final→ready→终结→live→created；仅真正需要追补时进入 recovery。不能为认回调用先 stop hosts |
| readAttempts／S-34 | 原只读历史，已确认创建可返回 open/空 dispatches；每次发出增加 ready/final 原结果及独立 disposition。failureSubject/consumeFailure 仅原 awaiting_decision+最近 failed 条件 |
| settleReply／S-49 | 现 `CallKey & {disposition:Exclude<ReplyDisposition,'persisted'>}` **不扩成 persisted**；从持久 ready 读全值，经当前 settle 门在原日志结算，不要求活 invocation。原终态保持 |
| canDispatchAgain／S-50 | 原 plan/守卫、当前原工作资格；纯判断不发出，不把新 consumer 的 Run 当原工作 |
| acquireCall／S-89 | 新 `(input: AcquireCallInput) => Promise<AcquireCallResult>`；先当前 read，wait/观察另查 wait；按 ref 指定读取与精确代际 attach。零 open/dispatch/reconcile/settle 副作用 |

以下类型均为候选，是服务返回视图，不持久化成第二真值：

```ts
type CallResultFact =
  | { readonly disposition: 'disposition_pending'; readonly pending: PendingModelResponse }
  | { readonly disposition: 'final'; readonly response: ModelResponse }
type AcquireCallInput = {
  readonly ref: CallKey
  readonly mode: 'read' | 'wait'
  readonly observer?: ModelObserverRequest
}
type AcquireCallResult =
  | { readonly view: CallReadView; readonly consumer?: CallConsumer }
  | ServiceInvalidInput | ServiceUnavailable | ServiceCallNotFound | ServiceRuntimeStopped
interface CallConsumer {
  readonly wait: (input: { readonly signal?: AbortSignal }) => Promise<CallWaitResult>
  readonly release: () => void
  readonly stopped: Promise<void>
}
type CallWaitResult =
  | { readonly view: CallReadView }
  | { readonly released: true } | { readonly aborted: true }
  | ServiceUnavailable
  | { readonly rejected: { readonly reason: 'buffer_full' | 'consumer_failed' } }
```

候选 `CallReadView` 明确字段：`ref` 为 MS7 CallKey；`origin` 直接复用 `ModelCallCreatedPayload['origin']`；`state` 采用 RT11 S-6 闭合集合；`source` 带来源数据集 generation 与进度：progress 复用 SL3 日志位置值；generation 是 callFacts 与受信日志装配显式绑定并验证的稳定来源身份，不冒称 SL3 已有该类型或读取 API；`result` 仅存在真实 ready/final 时取上述 CallResultFact；`presence` 为 live/stopped/unknown/notFound 的具名事实及其原执行代际和来源坐标。已存在调用不能返回 presence=notFound。stopped 无结果还交回原锚点/未知批定位等恢复所需证据，只有受信恢复入口解释它，不在视图塞恢复方法。视图所返“结果”对应当前最近发出；完整多次结果通过 readAttempts 返回，不把早期 failed final 当整个调用终态。

`mode:read` 禁止 observer，成功无 consumer。`mode:wait` 对 live 返回独立 consumer；已 ready/final 直接返回完整原 view，无须新资源；stopped/created 未发送返回原 view，不自动发出或恢复。wait 可重复等待同一结果，各次 signal 只终止该次等待；release 同步关该资源后续投递并使未决 wait 返回 released，实际接收任务停止由 stopped 表达。资源撤权或来源失效返回 unavailable，队列拒收沿原闭合集合，不改变模型 outcome。成功交付前再次核当前资格；observer 双限必填，持 ref 无 anchored handle、abort execution、close execution、persisted writer 等控制面。

dispatch 的调用等待者不是执行 owner：其调用 Promise 不再是唯一交付渠道，执行任务由原 host/store 保有。caller 丢失 Promise、消费 abort、loop fiber dispose 均不能终止该执行。公开独立 `invokeModel` 原 handle 的主动 abort 仍是其拥有者控制，不把这个独立函数 handle 泄漏到 acquire。

## 受信端口、依赖与生效点

候选 RuntimeConstruction 扩展三组窄输入：`callAccess`、`callPresence` 和 `callFacts`。它们是构造时装配提供的行为端口，不是 caller 填的权限/停止位，也不新增 Cordis service。`callFacts` 由本节点组合内容、日志和派生索引；存储提供者只兑现下面的抽象要求，不拥有调用语义。

| 端口／依赖 | 候选责任、作用域与生效点 | 缺席／旧引用与 owner |
|---|---|---|
| 现 RuntimeSessionAccess.bind + callAccess.check（RT11 S-87） | 从已认证入口捕获当前主体；对创建 tenant/Session、action、原用途/关联核验。调用者不能传 actor 字段覆盖捕获身份。read/wait 在返回/附着/每次投递时；settle/cancel 在实际提交准入时核验 | denied/unavailable 对外均 unavailable；诊断区分。生产提供者为 Session/Run 访问装配 owner，R20-G2；demo 仅自己真实身份/成员/会话持有关系 |
| callPresence.read（S-90） | 输入 ref、创建来源、当前日志 source、原执行代际；返回 live/stopped/unknown/notFound 的真实来源范围。live attach 使用同一宿主登记的精确实例临界段 | 仅原 host/恢复装配能证明停止；Map 空/超时是 unknown。过期代际不进入恢复 |
| callFacts 指定读取／创建认回（S-85/S-91） | 固定次数读取 source head、按 CallKey/creationKey 索引和已定位 marker/payload；先核当前性后发布 owned view | 过期/重建 unavailable；只在当前完整来源证明无键才 callNotFound；owner 为 runtime 投影与存储装配 |
| 现 recovery.enter（S-33/S-90） | 只在识别后确需追补时用；真实旧网络、门、writer 停止以及唯一恢复承载/同源完整前缀 | 正在 live 不进入；不能核停止 unavailable。原 scope 留存沿 v12 补充，生产 owner R20-G4 |
| MR10/MS7/CA3 纯公开面 | 内容接收/写入时原数据判定、same-fact 和消息扩展判定；共享 exact number/codec | 静态资源图错误初始化失败，非法值 closed malformed；不认证权限 |
| 现 transport 精确 lease、policy/currentEvaluationInputs、credentials | 每次新 dispatch 仍按原政策/输入限额/凭据现取，lease 固定 contribution；ready 重读不再取得网络 lease | 缺源沿原失败；不能因 consumer 消失换 provider 或重新请求。时钟/秘密下发归原模型装配 |

当前性与撤权不能只“先 check 再 await append”。候选受信准入协议必须把真实撤权和读/投递/控制/处分准入放入共同次序，但**不要求授权 SQL 行与 JSONL 组成事务**。单进程实现可由唯一真实访问入口持有 action 准入锁，覆盖所有相应写方及完整 append 临界段；撤权与换代也经过同一入口，只有全部旧写任务真正停止后才交权。unknown、超时或插件卸载不释放仍可能提交的写者责任。准入协议由构造时受信访问装配提供，返回来源/范围/当前依据；不能由 caller 自报 allowed。跨进程若没有等价真实协议则相关动作 unavailable，生产治理仍属 R20-G2，不成为构建完整 Session/Run 的前置。demo 可验证其真实单机唯一入口，不冒称跨进程或完整生产治理。

依赖沿现 plugin 必需 inject：sessionLog、modelCatalogRead、credentialLookup、modelTransport、storage、clock。consumer loop 可 inject modelRuntime 并在重跑后用 ref 重新取得；execution 不归 loop 子 fiber。依据 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)（4.0.4，probe 已存在），提供者换代会重跑，故已发生事实落日志，原工作由外层装配 owner 保有，不能藏在会重建的插件闭包。缺席可选观察不是可选 inject；依据 [inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)。不增加事件，异步资格直接 awaited 端口，不借 emit/bail 控制。

## 内容发布、共同对象与索引

本版选定最小耐久映射：**现有 runtime 使用既有 Storage 的私有不可变内容表，无独立删除/GC**。不新建内容 service/package，不修改 SL3 或要求 session-log-jsonl 与 Storage 跨存储原子提交。内容至少与所有有效日志引用及尚可能发布的写任务同存续；host/plugin/application close 只关资源，不删除内容，未知与未发布孤儿也保留。本程不提供单行回收或 Session 删除功能；未来删除/独立回收能力须另行设计引用存续与发布关闭，不能调用本节点不存在的 delete 入口。

候选私有 `ModelCallContent` 行包含 tenant、session、locator、version、kind、digest、原UTF-8 bytes；以 tenant/session/locator/version 为唯一键。通过 Storage.write 原子插入或完整同字节认回，确认提交后才调用现有 SessionLog.append 发布 marker。冲突不同字节/归属拒绝，不覆盖、不复用版本；bytes 用原二进制表示保存，不先普通 JSON.parse/重编码，读边界先核摘要再严格无损解析、kind与归属。若内容提交回执未知，持有原写任务直到实际停止并从原存储认回，未确认前绝不写 marker。内容行存在不是调用创建或结果发布，日志仍是唯一执行事实权威。相关表迁移、固定查询、诊断及生命周期归本包，复用现 Storage/narrow/migration；不读取其它包私有表。

当前八家官方供给只声明 text 输出，transport 构造 text/thinking/tool_call，response raw 当前只有 headers；这些完整值在该容器内即可保留。输入或未来响应确有外部内容引用时，实际启用路径必须注入可信的保留/解析协议，并证明所引用内容同存续；缺 provider、不可核版本或寿命则相关发布 unavailable，不把 locator 当内容。内联值不要求外部平台。若以后启用独立 GC，才触发 RT11 S-85 的同保留记录与发布互斥要求，并补相应提供者设计和并发证据；本候选不启用该分支。

| ID／条款 | 对存储提供者的要求与共同对象（名称候选） | 写入者、失败及对应 owner |
|---|---|---|
| ST1：S-85；MS7 S-52/S-53 | ImmutableModelContent(locator,version)：原 UTF-8 字节不可变、SHA-256 核原字节、严格无损 JSON；引用的 raw/输入内容同寿命保留 | runtime 内容发布者／内容存储；不可读 unavailable，坏字节 malformed |
| ST2：S-85/S-86；MS7 S-55 | **ModelCallContent(tenant,session,locator,version)**：上述无独立回收、同存续原字节行；无删除API，内容确认先于marker | runtime唯一内容写方和读取方；应用关闭/unknown/孤儿均不删；外部引用另核保留，未来GC才需共同保留记录 |
| ST3：S-85/S-91 | 同本 Session 日志的 creationKey 种类域唯一键 + CallKey 唯一键；同键 accepted/rejected 互斥，完整输入相等后认回 | open/recovery 同原批；并发 loser 不铸新公开 ref，唯一映射由日志权威重建 |
| ST4：S-69/S-86/S-88；SL3 S-32～S-37 | **SessionLog(session)** 的 entries/tail/keys/fence：完整前缀一致快照、完整原批原子持久、tailEquals、判重冲突、unknown 可识别 | opened/cancel/ready/final/恢复共同触碰；新工作 fenced，原事实指定例外 unfenced |
| ST5：S-87/S-93 | **受信访问准入协议**与 SessionLog 写方的实际次序；本地唯一入口锁覆盖完整append及停止后交权，不嵌套SQL+JSONL假事务 | 访问装配和所有受控写方；跨进程缺协议 unavailable，R20-G2；不要求本轮完整治理 |
| ST6：S-91 | CallProjection(CallKey) 与 CreationProjection(tenant,session,creationKey)：持久可重建、generation/progress 及原稳定定位；当前性按下文SL3 readByKey权威tail双读核验，不从派生head自证 | runtime 追尾器单调推进同代 source watermark；不改变事实；按键当前读成本独立于总日志长度 |
| ST7：S-84/S-90 | 原发布任务与 execution 登记可核代际、实际停止与唯一恢复责任，跨进程接手需要真实退出证明和单一承载协议 | ModelCallHost/恢复装配；时间过期或内存缺席不推停止，unknown 留责 |

ST2 无回收路径的反证：在内容确认前暂停 writer，marker 不得出现；内容确认后 marker 失败或回执未知，原内容必须在关闭/reopen后仍可取得；marker成功后关掉host并冷读，原字节与摘要保持；另一writer尝试同键改内容必须拒绝。因为本路径没有删除动作，原“检查保留→GC删除→提交marker”交错不存在，不需要保留行与JSONL的共同事务。人为破坏删除/覆盖保护必须被真实测试检出，不能把源码未写GC当作已验。恢复/备份不得把内容存储与日志恢复成不相容代际；来源不可核返回unavailable，不能伪造完整结果。

首次 open 的顺序：当前创建资格→按 creationKey 当前认回→登记原准备 owner/稳定写任务→冻结显式输入、sourceVersions 与 adopted 或 rejected payload→保留责任→内容原字节确认→同日志 created 或初拒绝整批→确认回执→发布 ref/原拒绝→更新派生索引。索引失败不回滚日志；查询追尾失败具名 unavailable。accepted created 后首次 dispatch 的零发送终结不带 rejected creation payload/key，原 created 始终为创建权威。续接不重新选档案；同键输入差异 creationConflict 不返回旧内容。

任何 unknown 都保存原字节、键、完整批、保留责任和原 writer；只在全部可能晚到的原 writer 停后读取同源完整前缀认回。有原批接受原结果；证明确无批才同字节重送；不可核 unavailable。重复 open/settle 不建立新写任务绕过原 unknown。原任务 registry 由 execution/恢复 owner 保有，插件卸载不是删除许可。

正常lookup使用现有SL3 readByKey对目标稳定键的返回tail取得权威进度（禁止从派生索引自身读head证明自己当前），并核对应原marker/payload；前后两次有界按键读取的tail及受信来源generation一致、projection已追到该tail，才返回该检查点的当前值；变化则按显式策略有限重试或 unavailable，不全扫。不存在也必须同一当前 projection watermark 的 negative 证明。冷重建/追尾可以 O(日志新增量)，明确处于 unavailable；写入者可在同源确认后提供直接 final 认回，旧 pending 投影不能覆写该事实。readAttempts 返回历史成本按实际条数计，不混报 lookup 性能。

## 执行、消费、结算与晚到清理

执行 owner 仍为原 ModelCallHost 注册的准备 owner→CallContainer→真实 invocation/全部写任务。短 reservation 只控制准入；不得拿着它等待只能通过同 reservation 完成的 interrupt/close。consumer 独立登记为 `(CallKey, executionGeneration, consumerInstance)`，release 只比较并撤自己那一项；代际 A 的晚到 finally 不能 remove B，也不能按 CallKey 清空整桶。

live attach 与原 execution 收尾在同一实际 host 登记临界段裁决：先 attach 则同代消费最终已确认事实；先结束则不再挂 listener，直接读 ready/final。临界段只解决同进程资源附着，耐久状态以日志为准。旧 service 停止但仍具合法 durable read 端口时，read/已终态 wait 可返回原事实；需要新 live resource 才按 S-89 的 runtimeStopped 优先级拒绝。真正撤掉 storage/access 时 unavailable，不能包装成 runtimeStopped 掩盖资格失败。

N→0 仅撤消费接收端。原 invocation 继续到真实结果；runtime 用原装配器产出的完整事实写 ready/final，绝不从 caller delta 重造。用户主动中断有真实回复按 interrupted ready，fault/timeout/system-stop 沿既有 delivered+原 usage/cost 的 final，无内容不造回复，未知不补零。硬 kill 只恢复实际耐久内容；本页没有逐 token 日志，未持久部分不承诺找回。

ready 确认后，调用 complete/interrupted 已终态而 disposition_pending 可长期存在。真实网络、首内容门、写任务全停后释放 transport lease；不为等待处分长期占 provider。慢/失效 receiver 的实际 stop promise 迁到**原 ModelCallHost 所有的接收任务留存集合**，不迁所有权给新 consumer；其登记保留到实际停止，但不再持 transport lease。新 consumer 不等待旧 receiver 清完才读取耐久结果；旧 receiver 不能再交付。异步 image preparation 若存在，属于 execution 的真实任务集合，consumer release 无权取消；具体构件/缓存作用域沿独立 runtime v21/transport v15 候选，不在此设计。

真正 owner.close 先关闭本代新执行准入，区分三支：ready/final 只排空资源；已形成结果但 ready unknown 留原内容/批/认回责任；真实在途者沿原系统 stop 先持久意图再请求实际取消与排空、持久真实收场。取消不会使未入提交调用凭空返回统一错误：没有显式关门机制的在途读取/提交跑完，按各自那次提交收场。close 的 released 只有实际任务停止且责任完成/唯一可证交接后可返；否则 unavailable、host 留登记，可再次 close。异步 prepare 晚到即由原准备 owner 收口，不得向新代容器发布。

final 由原授权消息写方/settlement coordinator 负责：读取完整 pending→当前 settle/消息写权及原用途核验→真实系统转换来源核验→MS7 候选 `judgeModelReplyMessage(originalReply,persistedMessage)`→MR10 候选 `judgeResponseFinalization(pending,final)`→同前缀 Run late 判定→同日志原子 `[M,R]`。两个 pure judge 只判值；并不产生转换来源、权限或转换句柄。final.reply 保留原 pending.reply，只有唯一 M 允许首次合法新增派生；M 入上下文，ready/final.reply 不成为第二消息。non-persisted settleReply 不需要生成 M，也不经 acquire 取得 anchored 方法。

final unknown 保留**已经转换并固定的原 M/R 完整批**，停止/认回后同批重送；不能重新转换、重复工具/外部消费或改处分。先到批胜出，另一合法处分者同处分认回、异处分 alreadyEnded；外部副作用幂等仍归消费者。已确认 final 胜过任何旧 pending，不能因旧 projection/ready 把终态倒退。

费用读面按 `(原Session,ResponseId)` 从同一来源选一份：相符 final 优先，否则 ready；两份同时有时先 MR10 同事实判定，矛盾拒绝而非任取。再按 CA3 原费用有效性、corrections 和精确 sum，原 Run 归属不改；pending 也计入，不能只扫 final，不能把 ready/final 两行作为两次调用。补账仍原 ResponseId，镜像不再加一次。费用查询未取得必要完整来源时 unavailable，不返回看似精确的部分零值。

## H19 当前路径与后继边界

本次 ref 交付继续 H19 的原值回放路径，不新增 PlanInput/InvocationInput/AuthorizedCalibrationResult 字段，不要求调用者补 replyDerivations，也不以 transport v16 为本次前置。当前供给的 text/thinking/tool_call 无首次媒体派生需求，完整原 response.reply/delivered/inputCalibration/outputHistory/摘要均保留。

运行时仍先核原来源、同批关联和原摘要；已知矛盾为 invalidInput/malformed，不得降full绕过。合法首次派生由 MS7 S-9/MR10 S-47允许，但实际路径若缺真实转换来源或无法解释当前实际选入表示，明确 unavailable，不能误把已证合法扩展当原事实伪造，也不能猜原输出贡献。正常原值且计量映射失效仍沿原合法full规则。本次不扩媒体输出/转换提供者。

后继若真正启用该路径，可单独比较仅包含 messageIndex 与 originalReply 的最小派生交接，persisted值直接取实际messages而不复制第二份；必须联合transport规划、真实转换来源、当前固定spans与φ/δ适用性设计。原提议的 replyDerivations DTO未选定，不是本版公共面；request-local图片准备仍属独立候选，不能冒充持久派生证明。

## 装载与撤除成对

| 取得的资源／贡献 | owner、可见时点 | 部分失败与撤除、仍成立的事实 |
|---|---|---|
| 原 P-2 服务注册与十四方法 | 外层 ModelRuntimeAssemblyOwner 在 construct 返回前留存；依赖/静态配置齐后提供服务 | 方法不全/发布失败走同一 close；关闭执行准入，真实组合 close 后才 release 外层留存；旧读取按上文持久读能力判断 |
| 原 preparation/host 登记、精确 lease | 异步准备之前同步登记；created 确认后公开 ref；dispatch 另准入 | 登记失败零发布；准备迟到归原 owner，任何未知批/未停任务留责；lease 实际停后释放 |
| 内容耐久行与 marker 引用 | runtime持有同存续原字节；marker确认才公开created/ready | 失败保留原任务与内容；本路径无回收；已发布引用不随fiber消失 |
| 派生索引追尾器 | runtime 投影 owner；同 generation watermark 当前才可读 | 追尾失败 unavailable，重建可恢复；卸载停止追尾，不删权威事实或宣称空状态 |
| consumer 的 wait/listener/双限队列 | 当前授权后以精确实例登记；原 snapshot 与后续位置切分 | release/abort/revoke 关该资源；receiver 实际 stop 留存原 host，N=0 执行不变，晚到不复活 |
| 原 opened/ready/final writer | execution/消息写方/恢复 owner 分别保有同批责任 | 共同日志裁决；unknown 保存整批和原 bytes；无实际停止不得卸责 |
| 固定投影/计量/准备异步任务 | 原 execution owner，完整 plan 通过才可 dispatched | 消费 release 不取消；owner stop 请求后须等实际停；原事实不因 provider 变化改写 |

依据 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)（4.0.4、有 probe），不同 effect 异步清理不保证完成顺序。真实关闭链在一个受外层 owner 保有的组合操作中显式等待；底层日志/内容依赖使用权保留到原 writer 实停，不能假设 Cordis 先关 consumer 再关 provider。静态配置抛出依 [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)。本页不增加未经 basis 支持的内核主张；存储、权限和停止均为本项目待验要求。

## 消费者破坏性迁移与示例接线

| 消费者 | 必须同步的变更与现有责任 |
|---|---|
| root 类型／service plugin／runtime factory | 十四方法完整转发、CallKey 同定义、creationKey 必填、关闭后持久读分类；保留 pure exports 和 failure overload |
| 共同 codec、call-state/history、冷读取 | 读新 created/ready/拒绝创建分支；terminal 与 disposition 分离；原壳/无损数/完整原批；不得把旧格式 runtime 兼容层加回来 |
| dispatch/anchored/coordinator | 正确 opened 分类、独立 ready 发布、durable settle；原 failed/delivered 和当前栅栏保持 |
| 原回复写方及成本消费者 | 两个纯判断+真实资格/转换来源+同批；ready/final 唯一选择后原 sum；不通过 acquire 调 anchored |
| H19 planner／invoke／transport copy 和 meter | 本版维持H19原值协议；先原事实后实际选择；合法派生来源不可核unavailable，后继另立窄设计 |
| demo bootstrap／model-call-host／loop fiber | 现 examples 按 Session identity 划定作用域的 assembly owner 持有执行 host，不是正式 Session 实现；loop effect 只 release 自己 consumer。loop 重跑保存 ref，再 acquire；真实应用退出才 stop 原 host；冷打开先合法认回再针对确失联分支 recovery |
| 双语 README／tests／仓库外 packed consumer | 首调用、零消费者后重接、独立 invoke、non-persisted settle 与原合法 `[M,R]` 写方分别有实际运行例子；不是只编译接口桩 |

候选双语 README 应同步以下**实际服务路径示例**（本页只规定实施后的 literal 验收，当前包没有 acquireCall）：

中文：受信入口取得 service 与按原 Session identity 划定作用域的 assembly owner 所持 execution host；显式 creationKey 调 openCall，保存返回 ref；原 execution task 调 dispatch 并托管 completion；loop 用 acquireCall({ref,mode:'wait',observer}) 取得 consumer。loop effect cleanup 只 consumer.release；新 loop 用相同 ref acquire，在 ready 后由另一个合法消息写方验证并同批落 M/R，或显式 settleReply 的 consumed/vetoed。窗口关闭只释放等待；实际应用停机才等待原 host.stop。首次无历史显式 outputHistory=[]，后续从原消息/响应真实来源生成。

English: The authenticated entry binds the existing service and an execution host retained by the Session identity-scoped assembly owner. Open with an explicit creationKey and retain the returned ref; the execution owner retains dispatch completion. A loop acquires its own wait/observer resource, and its effect releases only that consumer. A later loop reacquires the same ref without another send. An independently authorized writer persists the message and final response in one batch, or explicitly chooses a non-persisted disposition. Closing a view releases observation; application shutdown waits for the actual execution host to stop. History is derived from original facts, never reconstructed from displayed deltas. This demo does not implement the Session domain.

归装配逐项：examples/model-invocation-minimal-demo 的 bootstrap owner 接真实本地身份、Session 持有关系、已有时钟/凭据/provider 绑定、内容/索引持久资源、loop consumer effect 与真实 host 留存；该示例不得自称生产 Run。生产当前 read/wait/settle/cancel 与撤权资格、原工作准入/Run terminal 来源归 Session/Run 访问装配 owner（未建本批 assembly）；无GC内容私表与索引归本runtime；真实外部引用保留归其提供者；跨进程实际停止和唯一恢复归原宿主/恢复装配 owner；真实系统转换来源归原消息写方/转换件 owner；固定表示/φ/full 的证据归 transport owner。缺生产提供者不阻独立 pure/noRun 路径，但任何需要它的提交不得 caller 放行。

## 关键选择、反例与缺口

| 选择 | 落选方的最强论证 | 本方弱点与置信度 |
|---|---|---|
| 原 service/store/host 扩展，consumer 为 effect 资源 | 每调用 fiber 或独立 registry 能自然遍历/停机 | 需手工表达精确登记与留责，但调用本身无独立插件变化原因；高 |
| execution host 独立于 loop；保留现必需 inject | 把 execution 挂 loop 下可用父子 dispose 自动清理 | 外层 host 与日志资源保有更复杂；需要真 Cordis 换代测试；高 |
| 无GC私有内容行＋同日志marker＋派生索引 | 全部内容内联技术记录可少一次内容写 | 规范PayloadRef避免MS→MR依赖环；有额外永久孤儿空间成本，但无需跨存储GC协议，冷rebuild另验；中 |
| 当前资格端口＋可信准入次序，不签长效 bearer ref | 签名 ref 可减少读依赖并便于跨进程 | 每次读取/提交依赖当前源；签名无法兑现即时撤权与 action 区分；高 |
| final 批保留原 reply，唯一 M 允许首次合法派生 | 把转换后 reply 写回 final 可继续逐值相等 | 两个纯 judge 加真实转换来源更复杂，但不重造原证据/旧校准；高 |
| 本版只实施既有H19原值路径 | 新派生DTO能预先支持未来媒体回复 | 真正派生路径当前unavailable，避免使text输出ref依赖未来转换；后继按实际触发重新设计；高 |
| ready/final 同 ResponseId 读面选择一次 | 新建计费 ledger 可把选择移出读取 | 当前读取须当前源与冲突检查，但无新账权威/补偿责任；高 |

真并发反证义务见 verification R20-V6/V11/V14/V17/V19：内容未确认时marker必须不出现，已确认内容在marker失败/unknown及close/reopen后必须保持。独立GC路径未启用。撤权先提交时 settle/cancel 不得再通过；提交先行则事实保留而后续交付拒绝。cancel 先于 opened 则门不交首内容；opened 先行保留历史而后停后续。final 与 ready/过期索引、consumer A 清理与 B 登记都须在真实边界重演，不能靠单进程顺序模拟声明正确。

R20-G1：RT11/MR10/MS7/CA3 与本映射均未接受，阻本增量实施，owner 为主线。R20-G2：RT11 S-87/S-93/S-94 G-38 的真实授权/撤权/消息写权及生产 Run 源未建立，阻相应生产读/处分/取消/新工作，owner 为访问与日志装配。R20-G3：S-85/S-86 G-39、MS7 S-55/MR10 S-46 的本版无GC私有内容行已给具体映射，真实持久化/冲突/冷读未验；外部引用保留provider缺席只阻其启用路径，owner 为runtime及实际外引用提供者。R20-G4：S-84/S-90/S-91 G-40 的真实冷重建、停止/唯一恢复、O(1) 读与代际清理未验，owner 为 runtime/宿主实施与独立验收。R20-G5：S-75/S-77～S-83/MR10 S-47 的持久媒体派生来源和transport后继未闭合，只阻真正启用该派生路径，不阻当前文本原值ref路径，owner 为原写方/转换件/transport；不阻普通原值路径。R20-G6：本页全部新增行为尚无实际实现/验收，见 R20-V1～V23；旧绑定只证明其旧版本范围，不新增绑定、不声称已兑现。

## 当前采用范围

RT11/MR10/MS7/CA3 引用生命周期增量：CallKey 查回、独立消费者、原执行 owner、不可变私有内容与原日志 marker、原完整 Pending/final 关系及费用唯一选择。

技术采用不表示实现或实际验证已完成。验证义务：各节点当前关联验证义务；runtime R20-V1..R20-V23；SQL/JSONL 分域、unknown 留责、真实停止与来源当前性；正式包制品与全部受影响消费者。
范围之外：ACK 之后永久保管/noGC：已被 ACK 后继取代；完整 Session/Run/Agent/通用 registry 或内容平台。
