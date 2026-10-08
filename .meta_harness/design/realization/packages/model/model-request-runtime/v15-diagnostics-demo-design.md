# D6：模型请求工程观测与示例装配投影

2026-09-28，revision 2，**candidate，未接受；新增 bindings 0，新增接口及存储实现尚未验证**。本次针对 D6-AR1/AR2 补查询截止后的实际 I/O 所有权和全装配 transport 实例留存界限，不提升接受状态。这是已有节点的窄增补，四件套的其他文件不变；下文新增类型、方法、文件名和指标名均为**候选实现名**。持续消费者是 `packages/model/model-request-runtime`、`packages/model/pi-ai-transport` 与开发示例 `examples/model-invocation-minimal-demo` 的实施者。失效事件是这些提供者的观测投影改变。

## 输入与分层状态

设计基线 `omne-harness-lite-design-2026-09-15`；起草所读源码修订 `c68868e8c07880172a7df37c6850707c97fb21fa`。哈希是本次读取快照，不把未冻结材料变成冻结契约。

| 输入 | 状态、采用范围 | 本次 SHA-256 |
|---|---|---|
| [capability.model-request-runtime/v9](../../../../spec/capabilities/model-request-runtime/v9/contract.md) | catalog 为 accepted；D-104 所采用 RT9；本稿只投影 S-20、S-51、S-62、S-63、S-64 | `3ae5ee1843a31cb229a11c77a35c2bdc66e51100953322be0febed1ef37e64fb` |
| [v3 诊断与应用接线](v3-design.md#诊断观察与应用接线) | 已有 JSONL、query/export、bounded metrics、独立退化和 OS 权限责任；原应用名按下行迁移事实读取 | `96f00e5b915d7fd477d8973ec4837aeea55cb0442f460f08c32cd5921c32895f` |
| [realization 当前入口](../../../README.md) | 原验收 app 已退出当前映射，源码移至 examples；本稿点名承接 D6，不由此承接全部旧 app 义务 | 阅读快照随源码修订定位 |
| [SYS-OBSERVABILITY.C1–C7](../../../../foundation/observability-and-logging/requirements.md) | 工程观测要求；不是会话日志、账本或恢复权威 | `78fa38194e0420db474eaed0f403b4b7d3c5b59b78fccfba41cf6fee3cd88a0d` |

产品来源沿 RT9 的精确消费范围，不增加产品规则。Cordis 采用 D-025 的 4.0.4。共同政策沿 v3：必需静态配置非法或诊断存储初始化不能满足权限要求，装配启动失败；启动后的观测故障隔离、可查，不改变业务收场。凭据未配置的业务失败仍归 S-19，不改成全局启动失败。

| 层 | 当前事实 |
|---|---|
| 语义接受 | RT9 已接受；本稿实现选择尚未接受 |
| 可实施 | 下面给出候选字段、资源界限、构造和失败结果；独立评审及主线采用前不据此开工 |
| 绑定证据 | 新增 0；已有节点绑定不自动证明本增补 |
| 实际验证 | 源码已有 SettlementDiagnostic、ObserverDiagnostic 的白名单投影和独立 `diagnosticFailures`；默认 demo sink 仍为空实现，动态 transport service 未交出其网络诊断健康读面；本稿全部新增义务尚待执行 |

不新增能力、plugin、fiber、产品 app 或 trace 后端。既有 P-2 负责采集，pi transport 负责传输事实，示例装配持有存储及查询寿命。公共函数仍独立可调用，不依赖租户、会话、Cordis 或文件系统。双盲未重新执行：这是已有接受责任的机制补足，不以机制读数重定义领域性质。

## 契约责任到实现的投影

| 行／责任 | 兑现点 | 实现与采用 | 符合性义务或缺口 |
|---|---|---|---|
| D6-P1：RT9 S-63 阶段、因果、适用身份 | 公共执行采集构件与 P-2 调用边界 | runtime 公开类型和纯投影；每次执行显式关联闭包 | D6-V1/V2/V3；现有仅 kind 的事件不足以关闭此项 |
| D6-P2：S-20、S-63 默认内容边界 | 掌握来源的 runtime/transport 先投影，再交采集构件 | 复用已采用凭据脱敏实现；不复制每厂商规则 | D6-V4；collector 不获凭据、不接受任意 detail |
| D6-P3：S-62、S-63 观察失败、输出失败分开 | 既有 observer 诊断与独立 collector health | 保留 position、bufferedEvents/Bytes、stage、reason；另计 sink 故障 | D6-V5；错误不写成 ModelResponse 成因 |
| D6-P4：S-63、SYS C3/C5/C6 的可查询留痕 | 示例拥有 `createDiagnosticJournal` 与只读句柄 | 独立存储端口，示例提供本机 JSONL 实现；无新数据库 | D6-V6/V7/V8；非会话日志，不要求同业务事务提交 |
| D6-P5：S-63 有限指标与退化可见 | collector 内存状态及显式读取 | 固定 metric 集合，不设外部 exporter 平台 | D6-V5/V9；覆盖有限、进程损失不补造内存计数 |
| D6-P6：S-53/S-61/S-63/S-64 版本引用与资源收口 | 已有 transport registry 增加只读 diagnostics；装配保留旧实例读句柄 | 只读网络诊断计数＋既有 inspect；不改变 acquire/lease/retire | D6-V10；服务替换后不能拿新实例数掩盖旧实例未排空 |
| D6-P7：S-36/S-63 生命周期 | 示例显式 close 顺序；collector 独立于 P-2 fiber | 原关闭协调继续负责业务；诊断最后关写面，读面保留 | D6-V7/V11；Cordis dispose 不是清理完成证明 |

## 候选事件与关联面

`DiagnosticRecord` 只接收下表字段；没有任意 `detail`、`metadata`、Error、headers 或扩展键。自有数据属性逐层校验、复制、冻结；访问器、循环、非法数及超长字段拒绝，计入独立 `invalidRecords`。拒绝记录本身不记录原对象。枚举由生产代码封闭维护，未知 kind 计 `unsupportedEvents`，不把原 kind 字符串搬入日志。

| 字段 | 表示、来源与缺席含义 |
|---|---|
| `format`、`collectorId`、`sequence` | 格式固定 `model-diagnostics/1`；collectorId 为装配创建的本机工程实例标记；sequence 为该实例从 1 开始的十进制整数串，每次合法采集先分配，包括后续因容量丢弃者。不能解释为领域 Run 或会话日志位置 |
| `observedAt`、`elapsedMs` | 装配显式 wall clock 的 UTC 时刻及本 collector 显式单调时钟的非负差值；两个时钟分别校验。时钟不可读则相应字段缺席、`clockFailures` 增加，不猜时间，不把墙钟排序当因果 |
| `source` | `runtime`、`invocation`、`transport`、`observer`、`assembly` 五值 |
| `stage` | `admission`、`binding`、`planning`、`credential`、`queue`、`send`、`content_gate`、`first_content`、`stream_end`、`reply_handoff`、`settlement`、`retry`、`recovery`、`registration`、`retirement`、`observer`、`diagnostics`、`assembly` |
| `outcome` | `started`、`waiting`、`accepted`、`rejected`、`unavailable`、`completed`、`failed`、`cancel_requested`、`stopped`、`unknown`、`dropped`；是阶段结果，不替换既有 response outcome |
| `scope` | `{kind:tenant, tenant}` 或 `{kind:local}`。tenant 只能由服务入口已核归属的绑定生成；独立公共函数、无会话装配事件为 local。不得凭 session 字符串反查/猜 tenant |
| `association` | 本次执行的 `executionId`，及可选 `{collectorId,sequence}` 的 `causedBy`；服务事件再带已存在且适用的 session、run、attempt、call、dispatch、response。没有该身份时缺席，不填假 Run/attempt/null 占位。dispatch 等现有精确数沿现有 JSON number 编码 |
| `binding` | 可选 profile 引用、implementation 名及 revision、definition modelId/revision、configuration revision；只从本次实际绑定取。不得放 configuration values、参数值、模型消息 |
| `facts` | 按 stage 的判别联合，见下表；不允许通用 JSON |

候选 `DiagnosticAssociation` 是工程关联输入，不是新领域身份。公共 `invokeModel` 接收可选、显式 `diagnosticAssociation`（executionId、causedBy）；未交入则事件没有关联标记，不造会话、租户或其他领域身份。调用者可用公开纯构造器创建一份每次调用独享的 emitter，构造时传 collector 的 `record` 闭包；由这份闭包捕获关联，不用进程级 current-call、全局可变变量或强制 async-local 存储。关联字段不得进入 plan、HTTP、headers、cache key。

服务面在已核授权后创建调用专属 emitter：tenant/session/call 固定，dispatch/attempt 按本次操作显式取；再次发出创建新执行关联，并以之前实际记录引用作 causedBy；不能按时间相邻猜因果。公共调用的自由字符串关联在拥有本次凭据的执行边界按既有规则处理后才交出；服务的独立权威身份不因偶然同值而改写。外部调用者不能用自行标注的 `trusted:true` 绕过来源检查。

采集 `record` 候选结果为 `{recorded:{collectorId,sequence}}`（仅接纳，不表示已写盘），或 `{dropped:reason}`，reason 为 `invalid`、`unsupported`、`oversize`、`queue_full`、`closed`。只有实际得到 recorded 的引用才可交后继；被丢弃父事件通过 sequence 缺口与 health 表示，不造不存在父记录。事件不会因为日志未落盘而阻塞模型发出。

| stage 组 | `facts` 白名单与采集位置 |
|---|---|
| admission/binding/planning/credential | 既有具名拒绝 cause；规划的 adjustment/dropped **参数名与有限原因**，不记值；实际 credentialScope 与 present/unavailable 判定，不记凭据。入口、精确 acquire、plan 和凭据解值各自出事件，不能靠一次 operation completed 替代 |
| queue/send/content_gate/first_content/stream_end | queued/touched/unknown 三态、真实 HTTP status（独立来源）、已接受首内容门结果、真正首内容/流结束时刻；requestedProvider 与 servingProvider 分列。不得从收到 HTTP 200 推成已接受内容，不从 abort_requested 推 stopped |
| reply_handoff/settlement/retry/recovery | 既有 response outcome、失败 cause、未结算/已提交、已识别耐久锚点种类及 ID、再次发出与无重发恢复；保留 SettlementDiagnostic 的 owner/policy/submissions/tailConflicts。真实 usage/cost 只从已归一化同次结果投影，unknown 与零分开；遥测不成为账本 |
| registration/retirement | 精确 binding 修订、阶段、references/executions 数、强制取消请求与实际 stopped/remaining_active/cleanup_failed 分列；来源为 registry 的实际操作结果 |
| observer | 既有 ObserverDiagnostic 的 stage/reason、position、bufferedEvents、bufferedBytes 及适用身份原形；不复制被拒内容 |
| diagnostics/assembly | 固定错误类别、容量/保留/关闭状态及计数；不写 OS 错误 message/path/stack、logger 参数或任意第三方错误字符串 |

实现须逐个源判别转换；已有 kind 可以映射为上述联合，不能将任何带 kind 的对象自动当成可信事实。无准确来源的字段缺席并保留 unknown，不能填默认成功、零缓存、零费用或当前配置修订。`usage`/`cost` 如超单条容量则整条拒收并显示缺口，不截断成看似完整事实。

### 来源脱敏与权限

沿 D-095 的来源定界采用延续既有边界：凭据本身与上游/错误原文中的回显受已采用脱敏政策约束；独立取得的真实状态码、身份、费用即使偶然同值也保真。凭据 `503` 与真实 HTTP 503 同时出现时，状态码来自 HTTP 接口事实而保留，上游 error/raw 的 `503` 不能因字段名为 status 获豁免。字段白名单不是来源证明。

本稿默认不保留任何自由错误原文、请求/响应正文、工具参数/结果、模型推理、完整 headers、配置 values、credential，也不保存这些内容的 hash/截断前缀。已有业务 raw/error 仍按原公开结果/会话日志路径处理。本稿不开启敏感 debug 模式；未来扩展需另有内容权限与采用依据，不可配置一个 debug=true 就旁路。

只读句柄是本机受信装配交给 OS owner 的工程能力，不暴露普通租户 HTTP/工具入口；query 的 tenant 参数只是过滤条件。装配创建句柄时捕获已核实的许可范围，候选 `DiagnosticReadScope` 恰为一个 tenant 或 local；query/export 必须再显式传相同 scope，缺席、错 tenant 或请求 all 返回 `forbidden`，先核后读，零文件读取/输出。local 不包含任何 tenant 事件。需要跨租户运维查询时逐个取得有依据的句柄，不在本稿创造跨租户授权政策。

## 候选存储、查询、导出和有限指标

`DiagnosticJournalStore` 是独立 I/O 抽象，由示例本机 JSONL 实现。collector 管内存和调用隔离，不选数据库，不读会话日志。collector 接纳点、JSONL append 成功、flush 已确认三种水位分别为 `acceptedSequence`、`writtenSequence`、`flushedSequence`；失败或丢弃导致非连续，返回值须同时带覆盖状态，不能以最大值暗示中间无缺口。

### 配置与存储要求

候选必需配置均显式交入：`maxRecordBytes`、`maxFieldBytes`、`queueMaxRecords`、`queueMaxBytes`、`segmentMaxBytes`、`retainedMaxBytes`、`retainedMaxSegments`、`retentionMs`、`queryMaxRecords`、`queryMaxBytes`、`queryScanMaxBytes`、`queryConcurrency`、`queryMaxDurationMs`、`exportMaxRecords`、`exportMaxBytes`、`closeWaitMs`、`stderrMaxReports`，以及 wallClock、monotonicClock、schedule 和明确 scope。示例装配另必需配置全装配共享的 `transportRetainedInstancesMax`，不能每个 collector/新 service 各分一份额度。全部界限为正有限安全整数；`maxRecordBytes <= segmentMaxBytes <= retainedMaxBytes`，查询输出界不小于单条界。配置修订随装配记录；库无隐藏默认值。demo 可公开命名的一份配置基线并明确传入，数值由实施者提交审阅，不改成 provider 内常量。

| 存储要求 | 对应责任与实现约束 |
|---|---|
| 同一 journal 单写者、有界追加和完整行边界 | S-63；每个装配实例在私有根下以不可重用的新 collectorId 创建目录（exclusive，已存在即启动失败），不接管旧写者；串行追加自有字节，不允许业务 owner 写工程文件 |
| 明确确认与不可用 | S-63；append 只在完整行写入确认后提升 written；flush 实际同步文件后提升 flushed；部分写/同步失败具名 io_failed，停止该 journal 写面、保留失败状态，不能报告已持久 |
| 读取有界且验证数据 | S-63/C5/C6；query 只读已确认的完整行前缀，校验格式和 scope，不把半行当记录；重开旧目录读取发现损坏返回 corrupt，不自动修复/截断或推导业务状态 |
| 保留与容量 | S-63；按 collector 单调时钟计算当前实例保留年龄；封闭段先老后新淘汰，计 retained/expired/evicted 的条数和字节。达到字节/段上限且不能安全淘汰时丢弃新事件，不能无限扩容。当前段可先封闭再淘汰；文件删除失败返回退化并停止越界写入 |
| 权限与不可替换目标 | C6；本机 POSIX owner 检查与 no-follow 文件打开，目录 0700、文件 0600，实际 fstat 验 uid/mode/regular-file；私有根及实例目录拒 symlink、非 owner 和 group/other 权限。现有更宽权限不默默 chmod 后假装从未暴露。unsupported 平台启动失败，不声称通过 |

工程记录与业务日志**没有同一提交承诺**：不新增共享事务、不拿进程锁伪装业务原子性；结算成功而工程 append 失败仍是结算成功、coverage degraded。业务恢复只读原权威日志。存储失效不更改业务幂等、十三操作、收费或 lease 规则。

### 只读与导出

retentionMs 在活动 writer 上由显式调度器驱动过期检查；关闭后不留下无主定时器。只读 query/export 按 persisted observedAt 与当前 wallClock 计算逻辑保留窗，过期行不返回并报告 coverage；时钟缺失或倒退到无法确认保留边界时返回 unavailable，不把数据无限保留可读。磁盘过期文件只在拥有者活跃、close 清理或显式再次打开维护时删除；进程停止期间没有按时物理删除保证，须在 demo 运维说明写明，不宣称无进程也能执行 TTL 清理。容量界限作用于这一个 collector，多个已关闭实例目录的总磁盘保留由示例拥有者显式维护；本稿不新建后台系统清理器。

候选 `query({scope, after?, through?, limit, maxBytes})` 返回 `{page:{records,next?,through,coverage}}`，或 `{rejected:'invalidInput'|'forbidden'|'busy'|'timeout'|'cursor_expired'|'unavailable'|'corrupt'}`。limit/maxBytes 不得超过配置；after/through 是本 collector 的 sequence，其他实例标记拒绝。首屏 through 固定为当时 writtenSequence；后续显式携带它，只表示上界，不承诺保留快照。超过扫描字节界仍可返回空 records＋前进的 next，不能为了凑满匹配记录无限扫描。游标落入已淘汰范围时返回 cursor_expired 并附可用最早位置与 coverage，不静默跳过去。

读写器在每个有界 I/O 单元之间显式调度；每页扫描至多 queryScanMaxBytes。`queryMaxDurationMs` **只限制调用者等待**，不保证 Node 在途 open/read 或 FileHandle.close 到期完成：截止先使本次结果不可再交付，交回 timeout，停止发起后续扫描；已经提交的 I/O 继续由 journal 的查询任务 owner 持有、观察拒绝并负责真实关闭。晚到 open 成功只接管并关闭所得句柄，不再 read；晚到 read 数据立即丢弃，不向已结束 query/export 回调，也不提升业务或 journal 水位。成功 page 只在扫描和所属句柄真实关闭均完成、且尚未截止时交付一次；close 迟迟不完成也走 timeout，不把 Promise.race 的败者丢开。

查询任务在任何文件 I/O 前取得一个 `queryConcurrency` 名额，直到所有实际 I/O 已结束且取得的句柄确认关闭才释放。等待 read/close 的超时任务继续占名额；close 失败而资源状态不明时也保留名额并暴露故障，不能假定 fd 已释放。每任务同时至多持有一个文件句柄或一个待完成的 open；跨段先确认关闭前一个再打开下一个。任务数含超时遗留，达到容量后新请求立即 busy、零新增 open/read，不建后台重试或等待队列。该资源预算由同一 journal 的所有读句柄与 query/exportPage 共享；重取只读句柄不重置名额。淘汰不得把尚打开的已删除文件空间算成释放，未释放字节仍计 retainedMaxBytes。不能取得可读前缀或权限再次核验失败返回 unavailable/forbidden；期间保留变化以 cursor_expired/coverage 回报。

候选 `exportPage(query, {maxRecords,maxBytes})` 复用同一 scope/分页与上限，返回 `{page:{jsonl, next?,through,coverage}}` 或同组具名拒绝；只返回有界 UTF-8 字节，不接任意路径、不另开无界导出任务。调用者逐页消费；若 demo CLI 写导出文件，使用同一 0600/no-follow/owner 检查，写失败单独记 exportFailures，不写原错误或回滚业务。query/export 失败和覆盖信息通过 health 直接读，不能依赖写入同一个坏 sink。

候选 `health()` 同步返回不可变快照：collectorId、writeState(open/closing/closed/failed)、三水位、queuedRecords/Bytes、pendingWrites、pendingQueries（仍占名额，含已超时）、pendingQueryIo、openQueryHandles、pendingQueryCloses、timedOutQueries（累计）、queryCloseFailures、accepted/written/invalid/unsupported/dropped/oversize/expired/evicted、write/flush/query/export/clock/sink/stderrFailures、retainedBytes/Segments、oldestAvailableSequence、coverage(complete/degraded/unknown)。超时及关闭失败使 coverage 退化，读 health 不触发文件 I/O。数值为精确非负计数；进程重启以新 collectorId 重置，读旧记录只能报告旧进程独立健康计数 unknown，不能补零。health 本身不走 sink。

每个 collector 构造时恰绑定一个 scope，record 的 scope 不同即拒收；demo 对自身已核 tenant 与 local 分别创建 collector，文件和计数分开。候选 `metrics(scope)` 也核与构造 scope 完全相等。此处没有按收到的 tenant 动态建桶的 map，tenant 不作输出 label；其他租户需要独立且已获授权的装配。

| metric 名 | 类型、单位、有限维度 |
|---|---|
| `model_stage_events_total` | counter，event；labels 仅 source/stage/outcome 的上述闭集 |
| `model_stage_duration_ms` | 累积 summary `{count,sum,max}`，ms；labels 仅 stage；同一专属执行闭包内的起止单调时钟差；缺一端不计、不补零 |
| `model_observer_rejections_total` | counter，event；labels 仅既有 stage/reason 闭集 |
| `model_diagnostics_dropped_total` | counter，record；labels 仅 invalid/unsupported/oversize/queue_full/closed/retention/io_failed |
| `model_diagnostics_failures_total` | counter，failure；labels 仅 write/flush/query/export/clock/sink/stderr |
| `model_diagnostics_queue_records` / `model_diagnostics_queue_bytes` | gauge，record/byte；无 label |
| `model_transport_resources` | gauge，count；labels 仅 registration/retiring/reference/execution/cleanup_failure；来自当前指定 service 实例 inspect，不相加新旧代际 |

不设 modelId、provider 原字符串、tenant、session、call、requestId、配置 revision 或原文 label。每个 collector/范围计数从零起，不提供 reset 操作；查询返回 collectorId 与起始时刻说明 reset 边界。数值超实现精确范围时将该指标 unknown 并记录 overflow 退化，不能回绕。metric 事件 counter 在通过白名单与 scope 校验时计一次，后续 journal 丢弃另计 dropped，不能称为写盘条数；同一 emitter 显式维护阶段起点，重复 started 不叠加计时。stage duration 未结束的活动计时归调用闭包，完成/取消/退出释放，不建无限 active-ID map。成本与缓存事实留在关联日志，指标不重复聚合账单，不能把采样总量冒充真实费用。

### 替换 sink 与背压

装配的默认生产示例路径为 JSONL journal；可选附加 sink 是显式 `{mode:'sync',record}` 或 `{mode:'async',record,maxPending,maxQueuedRecords,maxQueuedBytes}`，两种模式不能靠返回值偷偷切换。同步调用抛错被捕获；返回 thenable 是 sink_contract_violation，停止继续向该 sink 投递并只观察这一个 Promise 的拒绝。同步 sink 必须由可信装配提供且及时返回；同线程永久阻塞不是可取消 Promise，本稿不宣称能隔离恶意同步代码。

异步 sink 的 pending 与等待队列均有界，调用和拒绝始终被 owner 持有；满时只丢该出口副本、计 sinkDropped，JSONL/业务继续。异步 sink 永不 resolve 时 pending 保持真实非零，不能超时后把它从计数消去再无限启动新任务。不同出口故障不递归写入自己的坏出口。独立 stderr 最多 stderrMaxReports 次，仅常量类别和计数，write 抛错/拒绝/背压均显式退化；所有出口坏时 health.coverage 必为 degraded/unknown。

## transport 健康面与装卸

候选 `ModelTransportService.diagnostics()` 返回底层已有 `createOwnedTransport` 的 `{failed,pending,dropped}` 自有快照；服务实例生存期累计，不在 contribution retire 时清零。装配直接读取当前实例与显式保留的旧实例读句柄，不让 runtime inject 一个 diagnostics 服务，也不使健康查询 acquire 新 lease。读取不延长 lease、不取消请求、不触发 pool 重建；实例 close 后保留可读最终计数，若诊断回调仍 pending 如实显示。现有 inspect 的资源计数与 diagnostics 的输出退化计数分开，不互相代替。

全装配的 `transportRetainedInstancesMax` 共同计入当前实例、正在构造的预留名额、尚未静止的旧实例和终态快照；不是每一代各自有界。开始构造替换 service 前，装配原子地预留名额；满时可先丢弃最早的**终态有限快照**，增加独立 `transportSnapshotsEvicted` 并标明历史覆盖范围，不能丢弃活句柄以腾位。仍无名额则这次装配换代在创建新 service 前返回具名 `unavailable`、诊断原因 `transport_retention_full`；不创建 fiber/pool、不卸载当前实例，不无限积累未执行的换代任务。该门仅限示例已有的 service 换代接线，**不放入 registerAdaptation/acquire/retire，不改变模型贡献注册或十三操作的结果政策**。

旧实例只有在其 closed 已确认、inspect 显示无在途资源且 diagnostics.pending 为零时，才把活读句柄替换为一次自有、不可变的有限快照（实例标记、最终 inspect/diagnostics 和结束时刻）；替换沿用同一个名额，不保留原闭包，也不每次查询复制一份历史。任一条件未知、清理失败或 pending 永不结束，活句柄继续占名额，卸载/全装配 close 以 incomplete 暴露它，不能伪造终态快照。装配独立状态提供 `transportLiveInstances`、`transportTerminalSnapshots`、`transportReservedInstances`、`transportRetentionLimit`、`transportSnapshotsEvicted`、`transportReplacementRefusals` 及有界未收口实例状态；这些读面不依赖当前 transport 的 logger 或 sink。终态快照被淘汰不删除已有 JSONL，历史详情沿 journal 自身保留边界查询；快照淘汰计数不冒充仍保留原实例。

公共传输的既有全局 kind 回调只能证明 transport 实例事件，不足以证明两个并发执行的归属。补关联时由每次 send/read 的私有请求状态捕获本次执行 emitter，并随其既有不透明响应资源传递；共享 pool 只发实例级 local 事件。不得让共享 transport 保存可变的“最近一次调用”关联。候选工程端口为 `TransportAdapter.send(planned, credential, signal, diagnostics?)` 与 `read(response, planned, signal, diagnostics?)` 的可选末参，类型 `TransportExecutionDiagnostics` 只有 `record(TransportDiagnosticFact): void`；它是已经捕获关联的回调，不携带租户或会话数据对象。invoke 将同一 emitter 交到两个位置；transport 在自己的私有请求资源中保存并校验归属，read 不得重绑另一 emitter。事件记录函数不得参与请求序列化；旧三参数消费者仍能单独调用，这不是旧版契约兼容层，而是当前独立调用允许不接诊断的可选面。全局 onDiagnostic 保留实例级故障/健康用途，有执行 emitter 时同一执行事实只向它投递一次，不向装配重复计数。此交接不增加网络参数、不改变 S-54 业务结果。

| 资源／贡献 | 取得与可见时点 | 部分失败 | 撤除与保留 |
|---|---|---|---|
| journal、collector、只读句柄 | 示例在启动 P-2 前校验配置/实际权限并打开；先持有 owner，再交 record 闭包 | 关闭已开 fd、取消已建调度、启动失败，不留下半个可用装配 | 只读句柄归示例进程，P-2 卸载不关闭；旧记录不撤销 |
| 调用 emitter、时间状态 | 由实际调用闭包持有，输入校验后可用 | 没有开始则不补 started；已采集事实保留 | 调用结束释放计时资源；在途按自身业务收场，不由诊断取消 |
| transport 健康读句柄 | 装配先在共同上限内预留名额，再构造并保存实际 service 引用 | 构造部分失败仍须收口所得资源，确认没有活实例后才退名额；取不到记录 unavailable，不伪零 | 旧 service 静止前保留显式旧代际并占名额；条件全满足才换有限终态快照，无 socket 所有权 |
| 查询任务、文件句柄与名额 | journal 在任何 open 前取得共同 queryConcurrency 名额，query/export 共用 | 任务 owner 接管已提交 I/O 和晚到句柄，关妥才释放名额 | 截止仅交回 timeout；实际停止/关闭前 health 保留 pending，晚到数据不交付 |
| JSONL 写队列及外部 sink 任务 | collector 接纳后由自身持有，不挂 P-2 effect | 输出失败 health 退化，继续独立出口 | 显式 close 停接纳、排空/flush、真实关写 fd；待执行 sink 未结束则不能宣称全部释放 |

候选 `close()` 幂等并发共享实际收口任务，返回 `{complete:true,coverage}` 或 `{incomplete:{pendingWrites,pendingSinks,pendingQueries,pendingQueryIo,openQueryHandles,pendingQueryCloses,queryCloseFailures,flushFailed,resourcesOpen},coverage}`。closeWaitMs 只限制本次等待，不将尚在途 I/O 标记取消或释放；任务继续由 collector 持有，后续 `close()` 可重新等它的真实状态，重复不得双写、重复启动仍在途的 close 或遗失查询 owner。收口期间新 query/export 返回 busy，health/metrics 仍可读；先使尚未交付的查询进入停止交付状态并交回 unavailable（已经交回 timeout 的不再交第二次结果），再等其 I/O/close 收口，遗留不为零不能交 complete。该次收口真正完成后允许用保留的只读句柄开启新查询，仍消费同一资源预算；complete 只表示该次关闭边界已收口，不承诺今后主动查询不取得新 fd。整个进程退出不能承诺随后还能调用内存对象，重开只读 journal 按校验规则读取。全装配关闭还须核上述活 transport 留存表，不把 journal complete 当作整机资源已释放。

示例关闭顺序：先原业务入口停接纳 → 等原 runtime/调用/贡献/transport 收口结果并记录 → 停诊断采集 → journal/sink close；业务未完成仍按既有结果返回，并保持其需要的诊断 owner，不能先关闭 sink 再宣布全关。一个显式协调函数表达顺序，不依赖 Cordis 多 effect 的逆序注册。依据：[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[emit-listener-throw-propagates](../../../../basis/cordis/emit-listener-throw-propagates.md) 均有 4.0.4 probe；本稿不新增 basis 绑定。文件 no-follow/实际 fsync/删除后空间占用及 Node I/O 截止语义为**须按 source-check 取证的实现前提**，不能用配置值证明已成立。

## 关键选择与反例

| 选择 | 落选方最强论证 | 本方弱点／反证触发 | 置信度 |
|---|---|---|---|
| 示例持有 journal，runtime 只采集 | 每个插件自己落盘最易单独安装 | 装配必须正确保持寿命；卸载后读失败即反例 | 高 |
| 显式调用闭包关联，不引入追踪平台 | async-local/统一 trace backend 对跨库自动传播方便 | 每个边必须显式传；两个 session 交错事件串属即反例 | 中高 |
| 有界 JSONL + 有界分页，独立内存 health | 成熟通用日志平台已有索引、搜索和运维功能 | 当前低规模扫描较慢、重启丢内存计数；出现可复现查询瓶颈后再评估后端，不预建平台 | 中 |
| 白名单来源投影，不保存自由错误正文 | 完整错误原文方便 debug | 细节少，需用实际阶段、原因和业务受保护记录定位；若不能定位已定义分支则补 typed 事实，不开放任意 detail | 中高 |
| 保留旧 transport 健康只读引用 | 只看当前实例更简单 | 需明确代际归属与有界 owner 释放，旧实例 pending 不得被新计数盖掉 | 中高 |

两条具体交错必须跑：① A 的发送等待、B 的首内容与 A 的结算交错，事件的 tenant/session/execution/dispatch 不串，时间顺序不反写 causedBy；② journal 写入未完成时卸载 P-2 并结束另一个调用，示例继续接纳其真实结算诊断，最后关写且保留查询。工程日志失败不影响业务同提交边界，因此不以共享数据库锁证明这两条；归属闭包与真实资源 owner 各自验证。

## 施工边界与顺序

允许施工位置仅限既有 `packages/model/model-request-runtime/src/` 的诊断类型、纯投影与真实采集点及对应 tests；`packages/model/pi-ai-transport/src/registry.ts`、`transport.ts`、`http.ts`、`stream.ts`、`types/index` 等公开导出及对应 tests；`examples/model-invocation-minimal-demo/src/` 的诊断 journal、装配、命令行查询/导出与 tests。每个改动包同步 README/README_ZH。共享入口由主线统一编辑，不建新 core 包或产品 app。

1. 先统一 typed 事件、来源投影、record/query/health/close 类型和构造验证；用跨包编译消费固定共享面。
2. 并行实施 runtime 阶段采集、transport 私有请求关联/health、demo journal/读面；可用局部受控输入，但不据此声称真实端到端完成。
3. demo 以显式配置接替 no-op，真实两会话及热卸载组合；默认 CLI 暴露工程数据目录与查询/导出的使用说明，租户过滤显式传入。
4. 主线在同一源码修订验收下面义务；通过后再补实际 evidence/bindings。此稿不签收任何一项。

## 验证义务、缺口与 owner

| 编号 | 必须实际执行、失败即不通过的断言 | owner／受阻消费者 |
|---|---|---|
| D6-V1 | 两个真实 session 经已核租户绑定并发服务调用；逐事件检查 session/call/dispatch/版本及非时间推测的因果链；无跨会话/跨租户查询行 | runtime + demo；服务完整观测验收 |
| D6-V2 | 独立 invoke 不提供 tenant/session 即可运行；显式工程关联保留；抓实际 HTTP body/headers/cache key 证明内部身份未外传 | runtime + transport；公共函数交付 |
| D6-V3 | 准入拒绝、绑定非法、凭据缺席、排队、首内容门拒绝、已发取消、正常结算、未知费用、无重发恢复各留下真实阶段差异；不能只断言日志条数 | runtime；S-63 全阶段覆盖 |
| D6-V4 | 凭据 503 与真实 HTTP 503 共存；可信状态保真、任意字段名 raw/error 回显脱敏；消息、工具输入结果、reasoning、headers、配置与 Error getter 的负例不出文件/导出/stderr；校验写前自有复制 | runtime + transport + demo；秘密边界 |
| D6-V5 | sink 同步抛、非法 thenable、异步 reject、永久 pending、队列满，业务结果/实际费用/HTTP 次数不变；health 始终可查，pending 不假归零、无 unhandled rejection、内存/队列不超界 | demo + transport；输出隔离 |
| D6-V6 | 实际临时目录 stat 权限/uid，宽权限、symlink、非 owner 拒绝；错 tenant/缺 scope 先拒绝且零文件读；导出同门同白名单，io 错误不泄露路径或秘密 | demo；查询权限及 POSIX 采用 |
| D6-V7 | P-2/transport contribution 热卸载后读日志仍成功；app close 后只读查询可用；晚到 pending 导致 incomplete，真正结束后才 complete | demo；生命周期 |
| D6-V8 | 字节/条数双限、超大记录、滚段、过期、删除失败、游标淘汰、扫描无匹配仍前进、半行/损坏均有具名结果和覆盖缺口；延迟 open/read 和延迟 FileHandle.close 分别超过 queryMaxDurationMs，只交 timeout，晚到数据不交付；queryConcurrency=1 时跨 query/export/新读句柄反复调用均 busy，实际任务/句柄始终至多 1，无新增后台 read；health 保留 pending、close 为 incomplete，释放延迟操作后确认真正关闭才退名额且新查询可成功；close 拒绝而资源未知不假归零 | journal 提供者；容量、截止与保留 |
| D6-V9 | 大量不同 call/model/tenant 字符串不能增加 label 集；计数/单位/reset 边界正确；不完整 duration/未知费用不补零；collector 重新启动明确分代 | collector；有限指标 |
| D6-V10 | 真实 registry acquire→执行→retire waiting→release→closed；diagnostics 同底层计数，不另造 lease；旧实例失败/pending 与新实例分开；多代故意保留 pending，达到 transportRetainedInstancesMax 后新换代零 service/pool/fiber 创建、明确拒绝且当前实例不被卸载，全装配关闭 incomplete；终态后同一名额换有限快照，满时只淘汰最早终态快照且可见计数；重复查询不增加历史快照或活句柄，注册/取得/退役操作既有结果不变 | transport + demo；动态服务健康及总留存界限 |
| D6-V11 | 存储写失败、flush 失败及 sink 不停分别演练；业务耐久仍真实、journal 水位不假前进；单一 close 协调保持业务先收口、诊断后关闭；失败关闭的资源逐项可见 | demo；真实资源关闭 |

尚缺：本候选独立评审与采用（主线）；新增接口及 JSONL 的生产实现/包文档（对应 provider 与示例）；真实 Node/POSIX 语义与完整并发/故障证据（实施/验收 owner）。全部绑定保持 0，不把将要新增的测试文件登记成现成证据。通用跨进程追踪、跨租户远程诊断授权、敏感 debug 内容权限、正式产品运维入口不在本稿内；若它们成为消费前提，回各自 owner 补契约/装配，不能由此示例暗中承担。完整系统 SYS-OBSERVABILITY 也不因模型纵线此稿完成而自动通过。
