# JSONL 存储提供者：设计映射

## 采用接口

提供者消费候选 [`capability.durable-records@1`](../../spec/capabilities/durable-records/v1/contract.md) 的精确坐标；跨 owner 准入与后果交接归 [`composition.core-work-coordination@1`](../../spec/compositions/core-work-coordination/v1/contract.md) 和[共同准入提供者](../coordination-admission/design.md)，端口/codec 归 [storage-records](../storage-records/design.md)。当前实现由受信应用直接调用 `createJsonlProvider`，取得 provider/writer 后交给唯一 admission；没有 Cordis 服务键或插件，未来生命周期包装是候选 gap。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为旧 `packages/storage/jsonl/design.md`，SHA-256 `78d8eb48075d91af05f5b009d5200594193feea3700f309fc3705df482a85ab9`；旧 provider 实现固定输入 `7152a7192c84fa49c27255bfdb4f9b0e86ad8eb5`，旧组合接受固定 HUB `31197742905a3c66fc3e650c153d65d014372c21`。有受限真实 JSONL/锁/恢复实现；支持文件系统、fsync、unknown、换代和全部 DR 条款仍需按新 v1 真实验收。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。
旧实现和 P1 证据只支持当时接口、格式及环境；通用 `core-journal/3`、冻结数组顺序、
普通与个人创建冲突、v3 writer epoch、全部 owner 恢复和提供者换代没有由它们证明。
若新 v1 与旧 TypeScript 类型不符，修改端口/实现，不添加旧格式兼容层。

## Factory、依赖与资源归属

受信装配为 `createJsonlProvider(options, diagnostics)` 明确给出 coordinationDomain、固定目录、namespace/owner/system scope 绑定及容量上限；缺失或非法上限不能解释为无限队列。factory 返回受信 reader，`acquireWriter` 成功后才交出唯一 writer；业务消费者只见 admission 的窄提交入口。`Diagnostics` 是必需依赖：应用拥有诊断来源和目录生命周期，provider 仅发受限诊断；日志失败不能改写存储结果，也不能在同步短门内做 I/O。若未来包装为 Cordis 插件，需明确 Context 中的 reader/writer 暴露、装卸顺序和在途责任，不能把现有 factory 当成已交付插件。

records 定义 `RecordPreparation`、`PreparedOperation`、`PreparedCommit`、`RecordWriter`、`RecordReader`、`Submission`、`Watermark`、`Receipt` 等公共端口；JSONL 拥有真实 fd/锁、I/O 队列、前缀核实及 cleanup owner。锁端口只在 provider 与故障夹具间使用，不成为业务依赖。普通文件读写导出不等于具备完整 writer 保证。

## 纯准备、同步排位与原操作

上层调用方在 `prepare` 前把同流事实合成唯一 append，并冻结 appends 数组和各
append 内 records 数组的原顺序；通用批次允许一条或多条 stream，不按 StreamRef
排序。`prepare` 在短门外无 I/O 地校验可信身份、namespace、scope、容量和批次形状，
冻结及预编码；它不读业务授权，不占 operation 键、revision 或 `batchSeq`。准备值
绑定实际 writer 实例并带从冻结 appends 算出的 owner 集合；具名 `requiredUses` 只能
引用其中 owner，binding 不得重复。伪造 TS cast、反序列化、旧 writer token 或
重复 StreamRef 均在分配位置和写盘前拒绝；**唯一流的逆字典序批次须原样接受**。
跨 stream 次序不承载业务因果，跨 owner 关系由完整批次和 owner 校验表达。

`commit` 同步核 token、原 operation 与规范输入、容量、已占键及 CAS，然后分配连续位置并排队；真正 I/O 在退出当前 JS 栈后串行启动，不调用业务回调。同键同输入认回原 pending 或耐久结果，同键异输入拒绝本次重试且不替换原结果。非法准备、关闭/隔离、未获写权或在途容量不足均不宣称已接纳，不占新位置或键。`lookupPrepared` 只在同一 writer 内同步认回；普通 `not_seen` 不是跨故障未提交证明。隔离同步封闭新提交和未启动写泵，保留已在途 I/O 与原操作的核实责任；预期 I/O 失败须完成为具名结果，不能由悬挂 Promise 丢失责任。

规范输入是 DR 的精确 `core-operation/1` `OperationInput`；writer 核可信 prepare 的
namespace 与 `OperationRef.namespace`、tenant/principal 与输入逐项一致，
`OperationRef.principalId` 是输入 principal 的 canonical JSON。`core-json/1` 仅规范
对象键和字节表示，保留冻结数组顺序；
`inputDigest` 是 canonicalInput UTF-8 的 SHA-256，外层 `JournalLine.byteLength/sha256`
按 canonical payload UTF-8 核对。该原操作身份和规范输入参与同键去重与重启认回；
完整记录字节不提供当代调用权限。

CAS 不匹配时原业务 appends 全不应用；只有同原操作的冲突结果实际耐久，才可对外返回
`conflict`。普通 v3 冲突由 writer 自己写一条 `core.records/operation-outcomes`
append，scope 随原可信 tenant/system 输入，唯一 fact 为 `operation.conflict/3`，
fact.data 恰为 `RevisionConflict` 且等于普通 conflict outcome 的 `conflict` 字段，
`requiredUses=[]`。
冲突 envelope 的 `attemptedAppends` 保存原冻结成功候选的全部
`[{stream,expectedRevision}]` 和原次序，不含业务 facts；`currents` 只列其中实际
不匹配的 stream，保留其原次序。replay 从该行**之前**的连续完整前缀重算这些
stream 当时的 head 和 mismatch，与 outcome/fact 不一致则拒绝可写恢复；结果行同步
未知时仍按原操作 unknown，不能提前声称 conflict。个人创建的封闭分支见下文；
旧 `operation.conflict/1` 字节不能充当新 v1 的编码或验证证据。

## 完整前缀读取、认回与水位

`readRange` 面向受信 owner，按完整 envelope 分页，不提供破坏原子关系的逐事件分页；用户历史由业务 owner 当前授权后投影。`through` 是已从 `readHead` 得到的精确域/commit 身份/水位，只读 `afterSeq < seq <= through.seq` 的完整批次；不匹配的水位拒绝，已知但未达的水位报告 `not_at_watermark`，不能悄悄改用最新。reader 只见本实例持锁核实并同步的前缀；旧 writer 关闭后已确认历史仍可读，未核实范围具名拒绝。首版不承诺独立进程的实时只读一致性。

`lookupOperation` 必须按耐久 outcome 认回原 `committed` 或 `conflict` 与 receipt，不能把全部完整行解释为成功。只有独占写者持锁核实并同步的完整前缀及原操作索引能证明该**存储操作** `not_committed`；在途是 pending，截尾、坏前缀或旧 writer 仍可写时是 unknown/unavailable。即使存储操作未提交，也不能推断外部 attempt 无效果；落后 head 或投影不能用于授权、终态或执行恢复。

## 独占 writer、恢复与关闭

域锁绑定已核对的固定目录与稳定锁文件 inode，防同进程及跨进程双 writer；锁文件不删除/替换，暂停进程不能按超时被夺锁。锁贯穿扫描、修尾、epoch 同步、普通写入和排空关闭。writer epoch 跨重启不复用，旧 writer/准备值失权；它不代替 Agent、Session 或执行 owner 的业务代际。新 v3 的每次 `acquireWriter` 在同一 journal 追加并同步一份受信 `core.writer` / `writer.acquire` 批次：首次 epoch 为 `"1"`，之后从已核实完整前缀的最后 epoch 严格加一；唯一 system `writer-epochs` append 含 `writer.epoch/3{epoch}`，committed result 含同一 epoch、`requiredUses=[]`。操作、规范输入、前一 epoch、position 与 fact/outcome 均由 writer/replay 逐字段核对；同步失败或未知时不交出新 writer。旧 `/1`、`/2` epoch 原件不被重解释。

`writer.acquire` 的 operationId 为 `epoch:<domain64>:<epoch>`，domain64 是
coordinationDomain UTF-8 的无填充 canonical base64url；两个 domain 的初始
`epoch=1` 不共享 OperationRef。`acquireWriter` 只有在取锁、
连续前缀核实、必要同步和新 epoch 耐久后才交出 writer。取锁后的扫描、修尾、
epoch 同步或资源关闭失败时，必须证明完全释放，或交出同一个具名
`AcquisitionCleanup` owner，保有真实 fd/锁、在途 I/O、诊断和稳定 cleanupId。
`inspect` 分别报告清理状态及锁的 held/released/unknown；`retryRelease` 仅接管原
在途 I/O、关闭并释放原资源，不恢复、写 epoch 或造新 writer。并发/重复重试共享
同一责任；未证实 released 时阻止同域再次 acquire，不能用无归属 busy 掩盖 retained
owner。进程死亡使 OS 释放 fd，下一进程仍须重新持锁恢复。

串行写处理短 write 直到整行完成；文件 sync 和首次创建/替换所需目录 sync 后才提升 durable 水位。任何 I/O 失败即隔离域，后续位置即使尚未动笔也不能越过故障继续写。恢复持锁扫描连续前缀：只有最后未结束 LF 的字节片段可修尾，须先复制故障原件、sync 文件与目录并核对保全，再截回完整行边界并 sync。完整坏行、中间缺口、摘要/序号错、未知格式或无效 epoch 均拒绝可写恢复；不试探双算法、不静默重释旧字节。完整有效但未回执的行重新同步后按原 outcome 认回，恢复再次中断也不靠上次临时标志宣称成功。

`closeWriter` 同步封闭新提交，再排空、同步与释放锁；重复调用认回同一责任。失败保留 pending、lockHeld 与 cleanup owner 的真实状态，不谎报 closed；旧 token/epoch 被 fenced。提供者换代还要由装配确认旧写者已释放、核对相同已提交前缀及全部原操作结果，再启新 writer；能读历史不等于能接管执行。

## 持续消费的映射


| 接口/机制 | 新 v1 目标映射 | 验收限制 |
|---|---|---|
| `createJsonlProvider` | 返回受信 reader 并取得唯一 writer | 只覆盖单机一个 coordinationDomain |
| prepare/commit | 调用方合并每流唯一 append 后冻结 1+ appends 与各 records 的原顺序；门外校验预编码，commit 同步排位，I/O 退出当前栈后串行 | writer 拒绝重复 StreamRef，不重排；通用唯一流逆序可用；冲突须耐久后返回，不读授权 |
| operation identity | 相同 key/input 认回原结果；异 input 冲突；unknown 保留原 key | unavailable/rejected 不伪称已接纳 |
| stream revision / fact identity | 每个 accepted append 令目标 stream revision 恰好 `+1`；同 append 多 facts 共享 revision；commit 以冻结数组 flatten 位置分配 `(domain,batchSeq,recordIndex)` eventId | owner fact sequence 不参与 CAS；prepare correlation 与 `(stream,revision)` 都不能冒充逐 fact eventId |
| read/watermark | 只返回完整批次与精确前缀；在线、扫描和恢复复用同一 revision、冻结数组次序与 eventId 算法 | 落后/坏前缀不得用于授权或恢复成功；不得探测或兼容两套 revision 算法 |
| writer/lock/recovery/close | 旧版有 epoch、原生锁、尾部核实和排空关闭实现；新 v1 保留独占/同步/unknown 性质，重定 v3 `writer.acquire` 批次 | 网络 FS、硬件故障、目录 fsync 与提供者换代仍需环境验收 |
| generic conflict | CAS mismatch 只写同操作的 provider-owned `core.records/operation-outcomes`，`operation.conflict/3` data 与普通 outcome 等值，scope 随原可信输入，attemptedAppends 保存原冻结全部 stream/expectedRevision，`requiredUses=[]` | 原业务 appends 全不应用；replay 从冲突前完整前缀复算 currents，未同步不得返回最终 conflict，caller 不取得保留 stream 写权 |
| personal creation | writer 只接受受信 Admission/Tenant Host 在当前代为一笔冻结原操作颁发的资格，绑定来源、原 operation/摘要、`UserRef`、target、domain、精确 expected revisions、host/owner/writer 代际。registration 固定 `[personal-index,tenant:<target>]`，init 固定 `[bootstrap,personal-index,tenant:<target>]`，同批原子同步 | 特例固定次序不约束普通批次；writer 不解析 Account 授权或 Tenant 业务事实，客户端来源/字符串/旧代/历史 epoch 均不能铸造资格 |

## 个人租户创建的受限混合流

跨 stream 准备输入顺序不承载业务因果；跨 owner 关系由完整 envelope 的引用及全部
owner 校验表达。通用及 personal creation 均使用严格 `core-journal/3` canonical
**字节**编码、摘要和版本标记；canonical JSON 不给 appends 数组排序。在线写入与
重启 replay 使用同一冻结顺序、revision 和 eventId 算法。
可信 writer 按普通提交、普通冲突、个人创建提交/冲突和内部 writer epoch 五种
`recordClass`，连同当前资格确定的 `source` 写入 envelope；codec 只能按相应
封闭子形状解码，不能把通用 BaseEnvelope 当作独立可接受的 payload。历史
`recordClass`/`source` 用于 replay 核对，不会恢复或新颁本代资格。
target 协调域若存在旧候选格式或未知格式字节，须保全原件并拒绝按 v3 可写恢复；
本候选不增加旧格式读取、转换或继续写入兼容层，也不就地重释历史 envelope。

成功批次只接受资格规定的完整二/三流集合及顺序：registration 为
`[tenant-personal-index,tenant:<target>]`，init 为
`[tenant-bootstrap,tenant-personal-index,tenant:<target>]`。CAS conflict 是**同原操作的另一个
provider-owned outcome envelope**：仅写 system `operation-outcomes`，不伪造成功
批次的 personal-index、bootstrap 或目标 tenant append；绑定原 operation/摘要、来源、
`UserRef`、target 和原资格，`attemptedAppends` 则保存原二/三流候选的有序
stream/expectedRevision，按原操作身份去重。`conflict.currents` 只列实际 mismatch；
即使只冲突 system index，也要把原 target 写入 outcome 与同一 provider-owned
`operation.conflict` fact。两者采用 v3 封闭形状，fact version `3`，其 data 恰为
`{conflict, personalTargetTenantId, source, operationRef, inputDigest, userRef}`，并与
资格及 outcome 逐字段一致。普通 conflict 不接受这些扩展字段。

prepare/commit 时 writer 核当前代不可伪造资格、二/三流完整形状、CAS 与结果；
lookup/replay 从唯一成功 tenant append 或 conflict target 字段核历史身份和原结果，
并从冲突前连续完整前缀复算 attemptedAppends 的 mismatch；
严格拒绝错字段、额外字段、错版本、错 stream、个人创建错次序、非 canonical
字节、坏前缀和同键异输入。历史记录不重新颁发资格。unknown 不释放占位，临时
`not_seen` 不证明未提交；
旧 writer 完整前缀、原操作未提交和占位安全解除都可核实后，才能以同原操作/摘要/
target 在当前代重新准备。

## 待代码与环境验收

DR 候选现已给出通用 CommitEnvelope、普通 conflict 及 `writer.acquire` 的 v3
规范形状；[Schema](../../spec/capabilities/durable-records/v1/schema.json) 同时定义
通用与个人创建的封闭子形状。当前 `packages/storage/records/src/index.ts` 和
`packages/storage/jsonl/src/provider.ts` 仍使用 `core-journal/1`，旧 records codec
要求 canonical StreamRef 顺序，旧 epoch/conflict fact 也不是 v3；实施须修改端口、
严格 codec、准备/提交、持锁恢复与索引，再以固定源码 revision 和真实故障注入核验。
新版格式存在不等于旧代码支持它；旧 P1 PASS 不抵扣通用/受限 v3 或换代验收。
