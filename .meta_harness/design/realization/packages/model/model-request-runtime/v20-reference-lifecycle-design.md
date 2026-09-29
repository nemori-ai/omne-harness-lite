# 持久调用引用、独立消费者与结果留存

2026-09-29，revision 1，**candidate，未接受、未技术采用、未实施验收**。这是既有 provider `packages/model/model-request-runtime` 的后继；源码包已经存在，沿 `src/index.ts` 公开函数、`service-runtime.ts` 的统一服务、`service-container.ts` 的 store/准备 owner 与 `ModelCallHost` 扩展。保留 v7～v19 的精确历史文件，本页只拥有下列差异。

## 输入与采用边界

已核 [catalog](../../../../registry/catalog.json)：`capability.model-request-runtime/v11`（下称 RT11）、`data.model-response/v10`（MR10）、`data.messages/v7`（MS7）、`data.call-accounts/v3`（CA3）均为 candidate；`capability.session-log/v3`（SL3）为 accepted，本批不升版。规范基线 `omne-harness-lite-design-2026-09-15`，读取本批契约修订 `1254553f`。需求为 PF-013 rev16、PF-012 rev21、PF-015 rev20；范围和机制来源见 [r4](../../../../record/proposals/model-runtime-reference-lifecycle/technical-choices-r4.md)、[四表](../../../../record/proposals/model-runtime-reference-lifecycle/reconciliation.md) 与 [机制读数](../../../../record/proposals/model-runtime-reference-lifecycle/sources/mechanism-reading.md)。本次消费已完成的领域/机制读数，不重新声明双盲。

Cordis 采用 [D025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。只复用 Cordis；DSH registry 范式仅是提案的对比输入，不引入 DSH Agent、通用 registry、新进程、每调用 fiber 或完整 Session/Run 系统。P-2 仍提供一个 `modelRuntime`，P-5 默认重试消费沿 v17/v18 的真实原 Run 来源。公开 `invokeModel` 和纯构件仍可脱离 Cordis、会话、租户和存储使用。

本页的新增服务成员、技术端口、类型、字段和存储对象名一律为**候选**；引用现有同名接口时显式注明“现有”。共同配置政策：静态必需端口/政策/密钥配置错误在初始化失败；显式调用表示错误沿原 `invalidInput`；受信来源不可达/不可核为 `unavailable`。业务上当前凭据不可取得仍按 RT11 原闭合分支处理，不改成启动配置错误。重试、等待、容量、追尾及关闭策略显式配置，不填猜测默认值。

## 契约责任到实现投影

| ID／契约责任 | 插件、服务或公开兑现点（新增均候选） | 实现与采用边界 | 符合性依据或缺口 |
|---|---|---|---|
| R20-P1：RT11 S-84/S-89；MS7 S-51 | 原 P-2 新增 acquireCall；独立 consumer resource | 现 `service-runtime.ts`、`service-types.ts`、`service-container.ts`；新增面未实现 | R20-V1/V2/V3；MS7 独占 CallKey，非权限 |
| R20-P2：RT11 S-28/S-85；MS7 S-52～S-54 | openCall 的 creationKey 认回、内容发布、created/拒绝创建 | 原 `service-calls.ts`、共同 codec 的候选扩展 | R20-V4/V5/V6；内容保留域 R20-G3 |
| R20-P3：RT11 S-17/S-75/S-86；MR10 S-39/S-46 | dispatch 的完整原 pending→ready、无回复 final | 原 anchored invocation、response construction 与 settlement coordinator；未新增第二模型结果装配器 | R20-V7/V8/V9；原值持久，处分独立 |
| R20-P4：RT11 S-87/S-93 | RuntimeSessionAccess 的当前 action 资格及撤权准入 | 现 sessions.bind/observer 授权的窄扩展；真实来源由访问装配提供 | R20-V10/V11；R20-G2 不准 caller true |
| R20-P5：RT11 S-33/S-90/S-91 | 先认回、callPresence.read、指定 lookup | 现 `service-reconcile.ts`、`service-reads.ts`、`call-history.ts` 的分支重排与派生索引 | R20-V12/V13；没有本地对象不推 lost |
| R20-P6：RT11 S-15/S-88；SL3 S-10/S-32～S-37 | 原 opened 门 unfenced + tailEquals；新 dispatch 保留 fenced | 现 `anchored-invocation.ts` 门与 codec/完整前缀 | R20-V14/V15；共同对象为同本 Session 日志 |
| R20-P7：RT11 S-69/S-75/S-86；MR10 S-47；MS7 S-9 | 既有授权回复写方同批 `[AssistantMessage, final]`；settleReply 只 non-persisted | 原 settlement coordinator 与实际消息写方组合两个 core judge | R20-V16/V17；转换来源、写权在 R20-G2/G5 |
| R20-P8：CA3 S-40～S-42；RT11 S-34/S-86/S-91 | 原费用读面先按 ResponseId 选择，再 sum/corrections | 原 `readAttempts`/历史解析及实际费用消费者；core sum 签名不变 | R20-V18；缺源不等于零，原 Run/Session 不迁账 |
| R20-P9：RT11 S-61～S-64/S-84/S-86/S-94 | 原 ModelCallHost 的 execution close 与独立 consumer 清理 | 原 store/准备 owner/observer queue，候选拆开 lease 与 orphan receiver 留责 | R20-V2/V8/V19；真实停与持久责任分别检查 |
| R20-P10：RT11 S-77～S-83；MR10 S-47 | 原校准 reader 与 H19 输出历史的窄派生交接 | 原 `service-calibration.ts`、`output-history.ts`；transport 后继待联合设计 | R20-V20/V21；R20-G5，H19 原采用 transport v13，后续 v14 拒绝映射不改变本接缝 |
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

候选 `CallReadView` 明确字段：`ref` 为 MS7 CallKey；`origin` 直接复用 `ModelCallCreatedPayload['origin']`；`state` 采用 RT11 S-6 闭合集合；`source` 带原日志 generation/progress（复用 SL3 generation/position 类型）；`result` 仅存在真实 ready/final 时取上述 CallResultFact；`presence` 为 live/stopped/unknown/notFound 的具名事实及其原执行代际和来源坐标。已存在调用不能返回 presence=notFound。stopped 无结果还交回原锚点/未知批定位等恢复所需证据，只有受信恢复入口解释它，不在视图塞恢复方法。视图所返“结果”对应当前最近发出；完整多次结果通过 readAttempts 返回，不把早期 failed final 当整个调用终态。

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

当前性与撤权不能只“先 check 再 await append”。候选共同对象 **SessionAccessAdmission(session, authorizationGeneration)** 由真实访问写方和受控日志追加方共同锁定/修改：撤权更新其版本；处分/取消在同一存储事务内锁定读该行、核 action/关联，并提交同本 Session 日志批；读值/交付以受信访问装配的实际准入顺序裁决。跨 owner 同约束域要求必须由访问提供者与日志提供者两边签收。当前没有这项生产接线，不伪造 proof/token，相关生产提交门返回 unavailable。局部 demo 可由其唯一真实访问入口持有“撤权/准入”实际锁并覆盖完整 append 临界段，但这仅验证该单机单写者前提，不能作为跨重启或多进程来源证明；持久写路径仍须下节共同对象要求。

依赖沿现 plugin 必需 inject：sessionLog、modelCatalogRead、credentialLookup、modelTransport、storage、clock。consumer loop 可 inject modelRuntime 并在重跑后用 ref 重新取得；execution 不归 loop 子 fiber。依据 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)（4.0.4，probe 已存在），提供者换代会重跑，故已发生事实落日志，原工作由外层装配 owner 保有，不能藏在会重建的插件闭包。缺席可选观察不是可选 inject；依据 [inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)。不增加事件，异步资格直接 awaited 端口，不借 emit/bail 控制。

## 内容发布、共同对象与索引

本节只规定存储提供者的要求，不选数据库。既有 session-log-jsonl 的 SL3 append 能力继续使用；其当前公共面不自动承诺下列新增跨内容/授权约束域。相关提供者补充和真实组合未完成时，R20-G2/G3 阻止声称可施工生产发布链。

**G3 范围尚待主线联合评审裁定**：ref 本身不要求通用内容平台。应比较三条路径：本轮 inline 已产生的完整请求/回复随原耐久对象保留、没有独立 GC；确实存在外部内容引用时才采用最小可注入的保留/发布协议；所需外域 provider 缺席时 unavailable。下列 ST2 及跨 provider 共同域是存在独立发布/回收者时的候选要求，不能默认升级成所有调用的新基础设施前置。inline 替代仍须由实施映射证明 MS7 原字节/locator/version/digest 可取得和 marker 同源关系，不能只以“放一起”略过；本页不自行选定该替代或扩建 provider。R20-V6 的独立 GC 并发只在选择该路径时适用，无独立 GC 的路径改验原耐久对象整体存续及无悬空引用。

| ID／条款 | 对存储提供者的要求与共同对象（名称候选） | 写入者、失败及对应 owner |
|---|---|---|
| ST1：S-85；MS7 S-52/S-53 | ImmutableModelContent(locator,version)：原 UTF-8 字节不可变、SHA-256 核原字节、严格无损 JSON；引用的 raw/输入内容同寿命保留 | runtime 内容发布者／内容存储；不可读 unavailable，坏字节 malformed |
| ST2：S-85/S-86；MS7 S-55 | **ModelContentRetention(locator,version,digest)**：持久 reservation 标识与 writer generation、发布/已发布引用、禁止新发布位；所有发布与回收同对象互斥 | 内容发布者、Session 日志 marker 追加者、GC 三者共同触碰；持有引用内容的保留记录按同一责任集取得。不可只扫日志后删 |
| ST3：S-85/S-91 | 同本 Session 日志的 creationKey 种类域唯一键 + CallKey 唯一键；同键 accepted/rejected 互斥，完整输入相等后认回 | open/recovery 同原批；并发 loser 不铸新公开 ref，唯一映射由日志权威重建 |
| ST4：S-69/S-86/S-88；SL3 S-32～S-37 | **SessionLog(session)** 的 entries/tail/keys/fence：完整前缀一致快照、完整原批原子持久、tailEquals、判重冲突、unknown 可识别 | opened/cancel/ready/final/恢复共同触碰；新工作 fenced，原事实指定例外 unfenced |
| ST5：S-87/S-93 | **SessionAccessAdmission** 与 SessionLog 的受控提交处于同一可锁定/约束域；撤权与 action 提交有实际全序 | 访问装配写方及日志写方；两侧均须列互指要求，当前 R20-G2；外部 caller boolean 无效 |
| ST6：S-91 | CallProjection(CallKey) 与 CreationProjection(tenant,session,creationKey)：持久可重建、generation/progress 及原稳定定位；SessionProjectionHead 提供一次当前性读 | runtime 追尾器单调推进同代 source watermark；不改变事实；按键当前读成本独立于总日志长度 |
| ST7：S-84/S-90 | 原发布任务与 execution 登记可核代际、实际停止与唯一恢复责任，跨进程接手需要真实退出证明和单一承载协议 | ModelCallHost/恢复装配；时间过期或内存缺席不推停止，unknown 留责 |

ST2 的具体提交形状：准备 writer 先持久登记 reservation，再写/核内容；marker 追加在保留记录的锁定读仍成立时与日志批一起提交，登记稳定 marker 引用；GC 也锁定同一保留记录，只有无已发布引用、所有 reservation 的 writer 已真实停且完整来源证明确无 marker/不可能再发布，才封闭新发布并回收。删除可在封闭后执行，但新发布必须被拒，不能复用旧 version。内容 bytes 写入不与日志原子化；**保留元数据与 marker 提交**须有共同事务/约束域，provider 无此能力就不能宣称 ST2 已实现。没有纯“读面现读再写”替代。两个 provider 的互指要求应进入 session-log-jsonl 后继和具体内容 provider；本页无权修改它们，登记 R20-G3。

首次 open 的顺序：当前创建资格→按 creationKey 当前认回→登记原准备 owner/稳定写任务→冻结显式输入、sourceVersions 与 adopted 或 rejected payload→保留责任→内容原字节确认→同日志 created 或初拒绝整批→确认回执→发布 ref/原拒绝→更新派生索引。索引失败不回滚日志；查询追尾失败具名 unavailable。accepted created 后首次 dispatch 的零发送终结不带 rejected creation payload/key，原 created 始终为创建权威。续接不重新选档案；同键输入差异 creationConflict 不返回旧内容。

任何 unknown 都保存原字节、键、完整批、保留责任和原 writer；只在全部可能晚到的原 writer 停后读取同源完整前缀认回。有原批接受原结果；证明确无批才同字节重送；不可核 unavailable。重复 open/settle 不建立新写任务绕过原 unknown。原任务 registry 由 execution/恢复 owner 保有，插件卸载不是删除许可。

正常 lookup 采用 source head→一个按键投影→对应原 marker/payload→再次 source head 的有界访问，两个 head 同 generation/progress 才返回这次线性化点的当前值；变化则按显式策略有限重试或 unavailable，不全扫。不存在也必须同一当前 projection watermark 的 negative 证明。冷重建/追尾可以 O(日志新增量)，明确处于 unavailable；写入者可在同源确认后提供直接 final 认回，旧 pending 投影不能覆写该事实。readAttempts 返回历史成本按实际条数计，不混报 lookup 性能。

## 执行、消费、结算与晚到清理

执行 owner 仍为原 ModelCallHost 注册的准备 owner→CallContainer→真实 invocation/全部写任务。短 reservation 只控制准入；不得拿着它等待只能通过同 reservation 完成的 interrupt/close。consumer 独立登记为 `(CallKey, executionGeneration, consumerInstance)`，release 只比较并撤自己那一项；代际 A 的晚到 finally 不能 remove B，也不能按 CallKey 清空整桶。

live attach 与原 execution 收尾在同一实际 host 登记临界段裁决：先 attach 则同代消费最终已确认事实；先结束则不再挂 listener，直接读 ready/final。临界段只解决同进程资源附着，耐久状态以日志为准。旧 service 停止但仍具合法 durable read 端口时，read/已终态 wait 可返回原事实；需要新 live resource 才按 S-89 的 runtimeStopped 优先级拒绝。真正撤掉 storage/access 时 unavailable，不能包装成 runtimeStopped 掩盖资格失败。

N→0 仅撤消费接收端。原 invocation 继续到真实结果；runtime 用原装配器产出的完整事实写 ready/final，绝不从 caller delta 重造。用户主动中断有真实回复按 interrupted ready，fault/timeout/system-stop 沿既有 delivered+原 usage/cost 的 final，无内容不造回复，未知不补零。硬 kill 只恢复实际耐久内容；本页没有逐 token 日志，未持久部分不承诺找回。

ready 确认后，调用 complete/interrupted 已终态而 disposition_pending 可长期存在。真实网络、首内容门、写任务全停后释放 transport lease；不为等待处分长期占 provider。慢/失效 receiver 的实际 stop promise 迁到**原 ModelCallHost 所有的接收任务留存集合**，不迁所有权给新 consumer；其登记保留到实际停止，但不再持 transport lease。新 consumer 不等待旧 receiver 清完才读取耐久结果；旧 receiver 不能再交付。异步 image preparation 若存在，属于 execution 的真实任务集合，consumer release 无权取消；具体构件/缓存作用域沿独立 runtime v21/transport v15 候选，不在此设计。

真正 owner.close 先关闭本代新执行准入，区分三支：ready/final 只排空资源；已形成结果但 ready unknown 留原内容/批/认回责任；真实在途者沿原系统 stop 先持久意图再请求实际取消与排空、持久真实收场。取消不会使未入提交调用凭空返回统一错误：没有显式关门机制的在途读取/提交跑完，按各自那次提交收场。close 的 released 只有实际任务停止且责任完成/唯一可证交接后可返；否则 unavailable、host 留登记，可再次 close。异步 prepare 晚到即由原准备 owner 收口，不得向新代容器发布。

final 由原授权消息写方/settlement coordinator 负责：读取完整 pending→当前 settle/消息写权及原用途核验→真实系统转换来源核验→MS7 候选 `judgeModelReplyMessage(originalReply,persistedMessage)`→MR10 候选 `judgeResponseFinalization(pending,final)`→同前缀 Run late 判定→同日志原子 `[M,R]`。两个 pure judge 只判值；并不产生转换来源、权限或转换句柄。final.reply 保留原 pending.reply，只有唯一 M 允许首次合法新增派生；M 入上下文，ready/final.reply 不成为第二消息。non-persisted settleReply 不需要生成 M，也不经 acquire 取得 anchored 方法。

final unknown 保留**已经转换并固定的原 M/R 完整批**，停止/认回后同批重送；不能重新转换、重复工具/外部消费或改处分。先到批胜出，另一合法处分者同处分认回、异处分 alreadyEnded；外部副作用幂等仍归消费者。已确认 final 胜过任何旧 pending，不能因旧 projection/ready 把终态倒退。

费用读面按 `(原Session,ResponseId)` 从同一来源选一份：相符 final 优先，否则 ready；两份同时有时先 MR10 同事实判定，矛盾拒绝而非任取。再按 CA3 原费用有效性、corrections 和精确 sum，原 Run 归属不改；pending 也计入，不能只扫 final，不能把 ready/final 两行作为两次调用。补账仍原 ResponseId，镜像不再加一次。费用查询未取得必要完整来源时 unavailable，不返回看似精确的部分零值。

## H19 后继：原事实与实际派生表示

现 `output-history.ts` 的逐块全值相等及 `service-calibration.ts` 的原批校验已有实现；[v19](v19-output-history-design.md) 的 H19 原采用 transport v13，后续 v14 revision 2 拒绝映射已由 D108 接受，但不改变本接缝，不能凭宽松相等直接支持新派生。候选窄增量为 PlanInput/InvocationInput 及 AuthorizedCalibrationResult 增加必填 `replyDerivations: readonly PlanReplyDerivation[]`：

```ts
// 候选；共享 AssistantMessage 来自 MS7；这里只拥有交接容器。
interface PlanReplyDerivation {
  readonly messageIndex: number
  readonly originalReply: AssistantMessage
  readonly persistedMessage: AssistantMessage
}
```

空序列必须显式 `[]`；同一 messageIndex 至多一项，值必须对应实际 messages 的整条 persistedMessage，originalReply 必须来自同一原 ResponseId 原 reply；两者由 MS7 helper 完整判断。仅有变化的合法首次派生列入，普通逐值相等路径不用额外元素。保留 H19 `ReplaySelection` 原顶层 `sourceBlockIndex/messageIndex/blockIndex`；当前 messages 仍是一条完整唯一消息，不能把 renderings 拍平成伪造的历史消息。所有原 outputBlocks/usage/inputCalibration/origin 原值不变，原摘要仍针对原块。

顺序不可交换：① runtime 先核真实同批原 D/R/M、selectedSources、原归属与当前源；②固定 transport 先按原编码核 originalReply/outputHistory/outputBlocks 与原 blockDigests，已知矛盾 invalidInput/malformed；③核上述合法扩展关系、实际持久转换来源，以及最终固定投影确实从 M 选择了哪些原块/renderings/transcript；④才由模型 meter 判旧 O 对实际 units/spans 适用性，合法但不适用可 full，未知必要来源 unavailable，仍无法完整计量 input_size_unavailable。不能以“摘要不等就 full”或 `transformed:true` 绕过①②。

`CurrentHistoryReaders.calibration` 的 selected_reply 候选仍带原 messageEntry/responseEntry/dispatchedEntry；runtime 从同一 prefix 解析原 M/R，以两个 core judge 校验值，另由原消息写方可核来源证明首次派生确由系统转换流程完成。source reader 不能自行声称 true；当前没有可核转换来源时 R20-G5。public 独立闭包只接调用者合法持有的显式值，纯比较不认证系统来源；服务必须在交给 planner 前完成真实来源门。

固定 transport 的现投影须为每个选中顶层块给出实际采用原值或派生内容的位置与覆盖，沿已有 selectionSpans/historySpans 接到 full/φ/δ；接口的精确后继与双边 copy/拒绝顺序须由 transport owner 联合起草，拟占 transport v16，不暗改已采用 v13，也不混用 request-local image preparation 的来源。当前实际投影无法解释时不实施这项路径。原锚可用性、整组覆盖与重复目标校验保持；replyDerivations 不是可复用授权票据或另一计量真值，不回写历史 calibration。

## 装载与撤除成对

| 取得的资源／贡献 | owner、可见时点 | 部分失败与撤除、仍成立的事实 |
|---|---|---|
| 原 P-2 服务注册与十四方法 | 外层 ModelRuntimeAssemblyOwner 在 construct 返回前留存；依赖/静态配置齐后提供服务 | 方法不全/发布失败走同一 close；关闭执行准入，真实组合 close 后才 release 外层留存；旧读取按上文持久读能力判断 |
| 原 preparation/host 登记、精确 lease | 异步准备之前同步登记；created 确认后公开 ref；dispatch 另准入 | 登记失败零发布；准备迟到归原 owner，任何未知批/未停任务留责；lease 实际停后释放 |
| 内容 reservation 与 marker 引用 | 内容 publisher 持有；marker 确认才公开 created/ready | 失败保留原任务；未发布回收需停止+无 marker 证明；已发布引用不随 fiber 消失 |
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
| H19 planner／invoke／transport copy 和 meter | replyDerivations 同步必填与严格交叉校验，先原事实后实际选择；缺字段不能偷偷补空 |
| demo bootstrap／model-call-host／loop fiber | 现 examples 按 Session identity 划定作用域的 assembly owner 持有执行 host，不是正式 Session 实现；loop effect 只 release 自己 consumer。loop 重跑保存 ref，再 acquire；真实应用退出才 stop 原 host；冷打开先合法认回再针对确失联分支 recovery |
| 双语 README／tests／仓库外 packed consumer | 首调用、零消费者后重接、独立 invoke、non-persisted settle 与原合法 `[M,R]` 写方分别有实际运行例子；不是只编译接口桩 |

候选双语 README 应同步以下**实际服务路径示例**（本页只规定实施后的 literal 验收，当前包没有 acquireCall）：

中文：受信入口取得 service 与按原 Session identity 划定作用域的 assembly owner 所持 execution host；显式 creationKey 调 openCall，保存返回 ref；原 execution task 调 dispatch 并托管 completion；loop 用 acquireCall({ref,mode:'wait',observer}) 取得 consumer。loop effect cleanup 只 consumer.release；新 loop 用相同 ref acquire，在 ready 后由另一个合法消息写方验证并同批落 M/R，或显式 settleReply 的 consumed/vetoed。窗口关闭只释放等待；实际应用停机才等待原 host.stop。首次无历史显式 outputHistory/replyDerivations=[]，后续从原消息/响应真实来源生成。

English: The authenticated entry binds the existing service and an execution host retained by the Session identity-scoped assembly owner. Open with an explicit creationKey and retain the returned ref; the execution owner retains dispatch completion. A loop acquires its own wait/observer resource, and its effect releases only that consumer. A later loop reacquires the same ref without another send. An independently authorized writer persists the message and final response in one batch, or explicitly chooses a non-persisted disposition. Closing a view releases observation; application shutdown waits for the actual execution host to stop. History is derived from original facts, never reconstructed from displayed deltas. This demo does not implement the Session domain.

归装配逐项：examples/model-invocation-minimal-demo 的 bootstrap owner 接真实本地身份、Session 持有关系、已有时钟/凭据/provider 绑定、内容/索引持久资源、loop consumer effect 与真实 host 留存；该示例不得自称生产 Run。生产当前 read/wait/settle/cancel 与撤权资格、原工作准入/Run terminal 来源归 Session/Run 访问装配 owner（未建本批 assembly）；内容保留/GC 与日志共同域归内容存储和 session-log-jsonl provider owner；跨进程实际停止和唯一恢复归原宿主/恢复装配 owner；真实系统转换来源归原消息写方/转换件 owner；固定表示/φ/full 的证据归 transport owner。缺生产提供者不阻独立 pure/noRun 路径，但任何需要它的提交不得 caller 放行。

## 关键选择、反例与缺口

| 选择 | 落选方的最强论证 | 本方弱点与置信度 |
|---|---|---|
| 原 service/store/host 扩展，consumer 为 effect 资源 | 每调用 fiber 或独立 registry 能自然遍历/停机 | 需手工表达精确登记与留责，但调用本身无独立插件变化原因；高 |
| execution host 独立于 loop；保留现必需 inject | 把 execution 挂 loop 下可用父子 dispose 自动清理 | 外层 host 与日志资源保有更复杂；需要真 Cordis 换代测试；高 |
| 内容不可变＋同日志 marker＋派生索引 | 全部内容直接内联日志最容易单事务与恢复 | 增加保留域协调和冷 rebuild；大 payload 与实际引用寿命有明确责任，当前 G3 未闭合；中 |
| 当前资格端口＋共同准入对象，不签长效 bearer ref | 签名 ref 可减少读依赖并便于跨进程 | 每次读取/提交依赖当前源；签名无法兑现即时撤权与 action 区分；高 |
| final 批保留原 reply，唯一 M 允许首次合法派生 | 把转换后 reply 写回 final 可继续逐值相等 | 两个纯 judge 加真实转换来源更复杂，但不重造原证据/旧校准；高 |
| 邻接 replyDerivations，原顶层 replaySelection 保留 | 通用 representation path 能表达任意压缩/选择视图 | 本版只覆盖首次持久合法派生，后续任意变形仍无保证；避免扩大成通用视图协议；中，G5 待联合评审 |
| ready/final 同 ResponseId 读面选择一次 | 新建计费 ledger 可把选择移出读取 | 当前读取须当前源与冲突检查，但无新账权威/补偿责任；高 |

真并发反证义务见 verification R20-V6/V11/V14/V17/V19：GC 先封闭保留记录时迟到 marker 必须失败；marker 先提交时 GC 必须见引用。撤权先提交时 settle/cancel 不得再通过；提交先行则事实保留而后续交付拒绝。cancel 先于 opened 则门不交首内容；opened 先行保留历史而后停后续。final 与 ready/过期索引、consumer A 清理与 B 登记都须在真实边界重演，不能靠单进程顺序模拟声明正确。

R20-G1：RT11/MR10/MS7/CA3 与本映射均未接受，阻本增量实施，owner 为主线。R20-G2：RT11 S-87/S-93/S-94 G-38 的真实授权/撤权/消息写权及生产 Run 源未建立，阻相应生产读/处分/取消/新工作，owner 为访问与日志装配。R20-G3：S-85/S-86 G-39、MS7 S-55/MR10 S-46 的共同保留域、内容 provider 与日志后继尚缺，阻 durable 发布/GC；当前 session-log-jsonl 不因 SL3 accepted 自动满足，owner 为内容/日志提供者。R20-G4：S-84/S-90/S-91 G-40 的真实冷重建、停止/唯一恢复、O(1) 读与代际清理未验，owner 为 runtime/宿主实施与独立验收。R20-G5：S-75/S-77～S-83/MR10 S-47 的持久派生来源和 transport 后继未闭合，阻该派生计量与消息写入路径，owner 为原写方/转换件/transport；不阻普通原值路径。R20-G6：本页全部新增行为尚无实际实现/验收，见 R20-V1～V23；旧绑定只证明其旧版本范围，不新增绑定、不声称已兑现。
