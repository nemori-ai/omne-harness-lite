# MR8／RT9 恢复时序的 runtime 实施投影

2026-09-28，revision 1，**candidate，未技术采用，新增绑定 0**。节点仍为 `packages/model/model-request-runtime`，本页只接续恢复时序，不改十三操作、P-2/P-5 或存储边界。

## 精确输入与状态

D-104 已接受 `data.model-response/v8`、`capability.model-request-runtime/v9`；起草时逐一核对 acceptance.json 的 55 个资源 SHA256 全部一致，catalog 状态 accepted。冻结正文里保留的 candidate 是受审文本，不覆盖登记的采用状态。需求与政策沿上述契约的既有 PF 来源，本页没有新产品选择。

保留 D-102 已采用的统一 store／组合 close，及 D-103 的宿主／观察端口。L1/L2 原 owner 交接、G-28 真 Run 解释未闭合，本页不借 nullable 时刻宣称解决。D-104 的十个 Schema 与有限 TLC 结果不代证实际 I/O。

源码基线 `7a5810eb`：codec projection 和时间比较仍要求 string；anchored 两处锚点后未 send 取消用 `now()` 填 sentAt；service-reconcile 仅解释已有收场记录。以下新增类型、方法及文件划分均为**候选实施面**，不是已实现 API。

## 契约责任 → 实施点

| 契约坐标 | 操作／构件 | 本节点兑现点 | 依据或缺口 |
|---|---|---|---|
| MR8 S-17/S-27/S-39，RT9 S-54/S-75 | codec、普通 invoke、Pending 构造 | 根 MR8 判定；持久 Timing 可空，正常结果及 Pending 必须实际 Instant；null 不进日期比较 | T12-V1/V2 待验 |
| MR8 S-11/S-16/S-24，RT9 S-17/S-36/S-54 | anchored 零 send 取消 | 确认 dispatched 后用独立 interrupted 构造，sentAt:null；计划三项与锚点一致，无锚点零响应 | T12-V3/V4 待验 |
| MR8 S-9/S-17/S-19/S-20，RT9 S-17/S-33 | 原 invoke/anchored owner 的事实保留 | 同次实际时刻、账、头及执行身份由原归一化路径保存，未知不清除已知 | T12-V5/V6 待验 |
| RT9 S-33/S-69～S-72 | reconcile、共同 coordinator | 原完整批优先；同一权威完整前缀、实际停止、原身份及整批追加；恢复零 HTTP | T12-V7～V10；L1/L2、withRun 继续按原缺口 |
| RT9 S-6/S-22/S-34/S-50/S-76 | CurrentHistoryReaders、守卫、再次发出 | nullable 响应正常参加历史；resumable 仍由原 outcome/initiator/opened/终结决定 | T12-V11；不新增由 null 推断的再发规则 |

## 单一当前 codec 与精确类型

本增补候选**保留 `mrr/3`**：payload 仍为 format/category/value，键的身份分量、规范化、条目壳、原批判重与读取键均不变。只把当前 response 值校验及投影从 MR7 升 MR8；原合法非空时间值保持同样字节和含义，新增 null 是当前值域的规范扩展，不需要另一套封装。旧二进制读不了新 null 不在本阶段兼容承诺内；所有当前消费者同批迁移，不加 `mrr/4` 双轨或版本探测回退。沿 [v8 编码增补](v8-current-codec-design.md)，mrr/1、mrr/2 和未知模型格式仍明确拒绝，不能跳过后报 absent。冻结规范的精确旧 Schema 依赖继续保留，不等于可执行旧 reader。

core model-response 的候选投影将现有公开 `Timing.sentAt` 放宽为 `string | null`，以 ModelResponse outcome 分支收窄非 interrupted，并使 Pending 的 sentAt 仍为 string。本节点不另造公共持久 Timing 家；普通 `ModelInvocationResult.timing` 改引用 `Timing & {readonly sentAt:string}`，独立函数的正常结果、`ResponseConstructionInput.result` 和 Pending 构造继续不能接受 null。Instant 的具体表示沿现有 RFC3339 字符串与比较器，不以 JS Date 丢精度。

- `log-codec-value.ts`：ModelLogResponseProjection.timing 复用当前 `Timing` 所需成员；投影守卫允许 sentAt 为 string 或 null，**先调用 MR8 judgeModelResponse**，不能仅改 typeof 后放行 failed/null。
- `log-codec-settlement.ts`：`timingOrdered` 在 sentAt 非空时才比较 sentAt≤endedAt／firstTokenAt；首 token 存在仍比较 firstTokenAt≤endedAt。null 不当最小时间或零。锚点存在、opened 相等、身份、参数、意图和完整批校验照旧。
- `call-history.ts`／`CurrentHistoryReaders`：继续消费同一 owned SettlementPrefix；response 原值保留 null，不补 now。failure subject 仅来自已判为 failed 的 MR8 非空时间分支，不被新的 interrupted/null 污染；run 读面没有真实来源仍 unavailable。
- `response-construction.ts`：正常构造保留现有严格输入。新增内部 `constructAnchoredInterruption` 候选，输出复用 `Extract<ModelResponse,{outcome:'interrupted'}>` 并经同一根判定/capture；它不生成 Pending，不把 nullable 值塞进 ModelInvocationResult。

内部恢复构造只由持有真实锚点和恢复前提的实现调用，参数包含原 dispatched、权威 opened/意图、原 source facts 的只读值、确认失联的 endedAt；类型复用现有 core 值。其输入不是第十四操作或开放的“传入一个 sentAt/账就采信”的服务入口。普通公开纯构造仍只能作值变换，不能凭形状证明真实 I/O。

## 原 owner 如何保留事实

必须先保存事实，再决定普通结果还是 quarantine。当前 anchored 在收到独立 invocation.outcome 后先检查未知 opened 并 return unavailable，会丢失本地 construction 赋值机会；施工把**原独立调用自己的实际事实**留在原 invocation/anchored 闭包，不能先返回再从诊断日志补读。

为覆盖 send 已开始但正常结果未形成的分支，候选给原 `ModelInvocationHandle` 增加只读 `observedFacts()`：返回 unavailable，或已停止后 owned copy 的 `InvocationObservedFacts`。该类型复用 `ModelInvocationResult` 的 usage/cost/trims/rawHeaders/upstreamModel/servingProvider/upstreamRequestId/stopReason 字段，加可缺席的 string `sentAt`；不含 nullable Timing、caller 声称、结算状态或 Run 标志。缺席 sentAt 仅说明该原执行未保有实际时刻；记录器在**调用本次 transport.send 的同一同步边界**记录时刻，不能在计划或锚点确认时记。

记录器属于同一 invoke 执行闭包：实际 send 的时刻在进入 send 前记录；调度安装、最后取消检查和可能拒绝的准备须在此之前完成，记录与调用之间不再插入会抛错的 deadline 安装或 await。send 自身同步抛错仍已进入该实际边界，不能删掉时刻；rawHeaders 在既有 owned/脱敏归一化确认后保存；account 只从同一状态接受的 account 事件及现有归约结果保存，可信结束身份从同一 read 返回值保存。未知用量采用已有 unknown/source 规则；每次已知零/部分已知都保留，不能在 abandon、门失败、系统停止或 close 中重置。它不新建另一套 header/account 解析。`observedFacts()` 只在该执行拥有的 reader、门回调与停止工作全部 actual stopped 后提供稳定 owned copy；没有实际创建 invocation 的锚定取消由外层明确判为无可用事实，不伪造一个已完成 handle。

原 `AnchoredInvocationHandle` 的候选同名只读面再验证同次 target、返回原记录器结果；没有 invocation 的已确认锚点可返回缺 sentAt、未知账的事实值。完整 ModelInvocationResult 已形成时以它保存的事实为准，不能用较早快照覆盖；已知 actual sentAt 必须保留，已知头的多值顺序和费用精度保持。公开 service 的 reconcile 输入仍只有 session/attempt，不接此数据。事实来自原 closure，无全局 registry、通用 event bus 或另一本持久日志。

## 两种构造路径与恢复动作链

**锚点后取消**：anchored 在 durable dispatched 已确认而 usable 失效的第一分支，以及其 wait 任务返回 cancelledBeforeSend 的第二分支，都直接用 `constructAnchoredInterruption`。没有调用 send 时 sentAt 为 null，endedAt 是该层确认中断的真实时刻；firstTokenAt 仅按确认的 opened（这两支应无 opened），usage/cost 不捏造零，参数三项由已固定 planned 与锚点一致地保留。取消前尚无 confirmed dispatched 的 cancelledBeforeDispatch 不生成响应。实际开始 send 后即使 queued/取消，既有实际交给传输时刻仍是 string；“HTTP 尚未触达”不能推回 null。

**reconcile**：保留 `RuntimeRecoveryAccess.enter` 的真实停止、唯一重承载及合法前缀前提。C 将 `createRuntimeReconcile` 的 construction 明确补入既有 `SettlementScheduler`、时钟 `now` 与共同 coordinator 依赖，不在内部硬编码预算或另建写入协议。时钟只给追补 endedAt；不用于填 sentAt。动作链：

1. enter 返回实际 scope 后读取同一会话/租户权威完整前缀，沿 CurrentHistoryReaders 识别最后一次 dispatch、opened、意图、终结及完整响应批。任一部分未知返回整体 unavailable，不以 nullable 类型跳过屏障。
2. 完整响应批存在：优先以其原字节和值认回，包括原非空时刻、null、已知账和头；不重新构造、不刷新 endedAt。缺成员不能当已结算，沿现有完整批校验处理。
3. 确有需追补的 durable dispatched 且原工作实际停止：从已建立的原 owner 关联读取同次 observedFacts；冷恢复确无原 owner 时采用 null/unknown，不能把“原 owner 读取 unavailable”当“没有”。恢复 scope 候选增加 `originalInvocation(key,target)` 只读关联查找，返回 `{original:AnchoredInvocationHandle}`／`{absent:true}`／`{unavailable:true}`。关联只能由宿主实际持有的原容器建立，核 session/tenant/callId/dispatch/ResponseId 与原绑定一致；不是 caller 传事实的入口。查找原 handle 不自动取得 L1/L2 交接权，跨日志 owner 的停止/交接仍受原缺口约束。
4. 按 RT9 S-33 原表次序选择追补，先意图，再 opened，无意图且无 opened 才 runtime_lost/resumable。有 opened 时 firstTokenAt 取其原时刻，即使内容从未可见；不从 null 删 opened。无原实际 sentAt 则 null，有则保留；时间逆序不能删除已知值求通过，返回 unavailable 并保留责任。恢复无回复，不从当前快照拼成 AssistantMessage。
5. 从原 dispatched 还原档案、credentialScope、原 ResponseId、原 dispatch 和最终参数三项。复用 codec 的参数适配还原，不调 plan、不重读最新 profile、不查费用 API；只把不可得账字段置 unknown，真实已知零保留，已持有可信 rawHeaders 原样保存。以同一 coordinator 按 S-69～S-72 提交原批并认回；并发已有完整批赢时返回它，不覆盖。
6. 每行的 durable 提交可以分别成功，但整次 reconcile 只有全部可确定才返回 calls；中途失败返回 unavailable，后次从原完整批继续，无重复 HTTP 或响应。读面得到 resumable 也仍由调用者另行 dispatch，null 本身从来不是资格。

上述 originalInvocation 仅把已有原容器的事实读面接到已合格恢复 scope；不会让旧 writer 复活，不给新 binding 一个清除旧 unresolved 的布尔开关。scope.close、原 handle close 和持有者释放仍沿 D-102/D-103/既有恢复 owner 规则；一次失败不能遗弃任务或原事实。

## 存储、Cordis 与装卸

同提交共同对象仍是**该会话的 SL3 日志 entries/tail/判重键/fence**。runtime 响应 writer、外部 persisted 完整批 writer、恢复 writer 都在同一对象的追加边界竞争；sentAt:null 不另建表。要求保持：权威完整前缀及尾、整批持久原子追加、ResponseId 唯一判重、withRun 所需 tailEquals/fence、未知回执可识别。双方要求继续互指 [session-log-jsonl 恢复投影](../../session/session-log-jsonl/v3-recovery-design.md)；本页不选择数据库。

反证交错 A：恢复读无响应 → 原完整批已提交/ack 丢 → 恢复尝试追加；必须认回原批，不能覆盖实际时刻和账。反证交错 B：旧 opened writer 仍可能迟到 → 新读者读无 opened；必须 unavailable，null 不允许新读者先写无首 token 响应。两者均需真实受控追加/恢复演练，内存锁与 now 不能替代。

无新 plugin/fiber；独立 invoke 仍无 Session/租户/Cordis 依赖，observedFacts 只供其自身持有者读取。P-2 消费同一实现。Cordis 4.0.4 沿 D-025，清理顺序及重载仍沿 basis [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，均有 probe；内核不提供真实停止、耐久认回或可信发送时刻。

| 取得的资源／状态 | owner 与可用时点 | 撤除或部分失败 |
|---|---|---|
| 同次 observedFacts 记录器 | 原 invoke；真实边界更新，actual stopped 后稳定可读 | 不因 outcome unavailable 清空；原 anchored/容器持有至结算或合法交接 |
| 恢复 scope、原 handle 关联与读写 task | 真实宿主及 C；旧 writer 屏障成立后才使用 | 失败保持 unavailable、原责任与引用；不能以缺时刻释放未知写者 |
| 完整响应批 | SL3 权威日志 | 原批先到者赢；停止/重载不改写或清除，晚到费用沿既有机制 |

配置政策不变：新增 construction 必需时钟/调度缺失是明确非法配置，不取隐式默认；业务输入 malformed 仍原拒绝，恢复来源或时序不可判为 unavailable。demo 的 now 使用其现有显式时钟。没有新增 TTL、重试次数或等待时限。

## 关键选择与唯一施工 owner

| 选择 | 落选方最强理由 | 本方弱点／置信度 |
|---|---|---|
| 持久 interrupted 构造独立于普通 invoke 结果 | 全局放宽 Timing 使用最少类型 | 多一个窄内部构造分支；避免正常结果/Pending 误收 null，高 |
| mrr/3 根值判定直接升 MR8 | 新 format 标识可隔离旧二进制读取 | 无混跑旧 reader 保证；符合当前全部迁移、无兼容要求，编码/键未改，高 |
| 原执行只读事实记录器 | 只缓存最终 outcome 更少接口 | 要核每个真实观察边界和 actual stopped；可覆盖未形成完整结果但已有真实事实，较高，需 T12-V5 |
| 恢复读已有原 handle，冷启动明确缺席 | 让 caller 直接传 sentAt/账方便接线 | 真实关联与 unavailable/absent 必须区分；不扩大采信入口，较高，跨 owner 交接未闭 |

| owner | 代码入口及产出 | 依赖／禁止 |
|---|---|---|
| core model-response 实施者 | MR8 根判定、Timing 与 outcome/Pending 精确类型、Schema 同步 | 依其独立 core 增补；不改变写方实际来源 |
| C，共同 codec／构造／恢复实施者 | log-codec-value/settlement、response-construction、service-reconcile、共同 service-types 的恢复关联与 construction | core 类型先锁；内部恢复构造不伪造 ModelInvocationResult；不关闭 L1/L2、G28 |
| B，实际发出实施者 | invoke/types 的只读事实保存、anchored 两支取消和未知 opened 前的保留接线 | 使用 C 共享类型；正常结果/Pending 仍实际时间；零新 send 循环 |
| A，历史/守卫实施者 | CurrentHistoryReaders/call-history/失败主体读当前 MR8 | 复用当前 codec，不从 sentAt 重新定义状态或 retries |
| 主线装配／验收 | scope 原 owner 真实关联、冷恢复确认、显式时钟、demo 与 README 双语示例 | 有真实来源才开相应分支；当前产品应用不因本增补新增 |

先锁 core 精确类型及 C 内部构造/事实读接口，B/C/A 可按上述文件边界并行。类型暴露和测试迁移同批，删除旧强制 string 假设，不加旧签名 wrapper。这里只分配现有责任，不把候选接口当已存在。

## 覆盖缺口

T12-G1：本投影仍 candidate，B/C/A 相关实施须主线采用；新运行验收尚无。T12-G2：原 L1 永久撤除后 L2 认回与旧 owner 解除的交接未闭，不能因新增 originalInvocation 查询便声称恢复关闭成功；只阻相关换代恢复。T12-G3：withRun 的真 Run/attempt/late 解释沿 G-28，仍 unavailable，不降为两个布尔值。T12-G4：真实重启/kill、可信部分事实保留、0HTTP 与完整批竞争由主线装配和独立验收补证；有限模型不足。可先实施同代际合格恢复及冷恢复 noRun 表内分支，不把这些缺口放大为整条纵线停止。

验收详见 [T12 义务](verification.md#v12-恢复时序候选义务)。本页不修改 bindings，不改 D-102/D-103 已采用字节与范围，也不声称十三操作交付完成。
