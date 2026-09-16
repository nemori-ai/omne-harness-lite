# 记录端口与 codec：设计映射

## 采用接口

提供者消费 `capability.durable-records@1` 的精确候选坐标。该包只有公共 ports、envelope/receipt 数据和严格 codec，无运行时资源、factory 或 Cordis 依赖；具体 writer/锁/恢复由 JSONL 等提供者拥有。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/storage/records/README.md`，SHA-256 `c039cd8830ffc13d0ef3acb38ac04d60174b502638bd5c7200f388ca173ab41d`。旧实现只拥有公开 ports、envelope/receipt 数据与 `/1` 严格 codec；不拥有 writer 锁、fsync、恢复或业务状态语义。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

## 持续消费的映射


| 范围 | 当前映射 | 不提供 |
|---|---|---|
| ports | RecordPreparation/Writer/Reader、Submission、Watermark、Receipt | 具体 I/O、锁或生命周期实现 |
| revision | `StreamAppend.expectedRevision` 与 receipt/envelope stream revision 每次 accepted append 恰好 `+1`；同流多 facts 共享该 revision | owner fact count/sequence 不参与 CAS、身份或完整性 |
| order | 调用方在 commit 前合并同流事实为唯一 append，冻结至少一条 appends 的数组顺序和每条 records 顺序；codec 拒绝重复 `StreamRef` | 通用批次允许唯一流的任意次序，codec/writer 不排序或重排；跨流次序不代替业务因果 |
| identity | commit 时以冻结数组 flatten 位置分配 `(coordinationDomain,batchSeq,recordIndex)` eventId | prepare correlation 不冒充 eventId；`(stream,revision)` 不逐 fact 去重 |
| data | CommitEnvelope、RecordedOutcome、Position、UseRequirement | 业务状态解释或授权判断 |
| codec | `core-json/1` canonical 字节、`core-journal/3` JournalLine 与普通 commit、普通 conflict、writer epoch 三类封闭 CommitEnvelope 严格编解码；可信 writer 赋 `recordClass`/`source`，普通 conflict 带 attemptedAppends | 单行 codec 不证明完整前缀、fsync、原操作认回或恢复成功；反序列化字段不颁发资格 |
| personal creation scope | Tenant 从受信 F 派生 T/C 并在本代核来源、注入式 target、目标流空前态及唯一 owner；records 对冻结的一个 tenant-scope append 使用普通 DR-01 结构、CAS、冲突与认回 | 客户端来源、owner/operationKind 字符串、反序列化字段不可铸造业务资格；codec 不解读 Account 授权或 Tenant 业务事实 |

以上是候选契约到 records 端口/codec 的目标映射，不表示当前实现已全部符合。实现验收须让
prepare、encode/decode、writer receipt 与 recovery replay 使用同一版本化冻结顺序、
flatten/eventId 与 `+1 per accepted append` 算法；任何一处按 fact 数推进修订、按
`StreamRef` 重排 appends 或把 `(stream,revision)` 当逐 fact 身份都不符合目标。
`canonicalInput` 须是 DR 所有的精确 `core-operation/1` `OperationInput`，而非调用方任意
JSON：可信 prepare 的 namespace 与 `OperationRef.namespace` 一致，其 tenant/principal 与
输入一致；`OperationRef.principalId` 为输入 principal 的 canonical JSON。
`core-json/1` 规范对象键但保留数组顺序；
`inputDigest` 是 canonicalInput UTF-8 的 SHA-256，外层 `JournalLine.byteLength/sha256`
均按 canonical payload UTF-8 字节核对。原 `OperationRef` 加规范输入区分同键同输入
认回与同键异输入冲突；摘要或记录行本身不授予调用权，也不证明 unknown 已收口。

通用 CAS mismatch 的 `RevisionConflict.currents` 按原冻结 appends 顺序列出实际
mismatch，不按 stream 字典序排序。冲突 envelope 持久保存原冻结成功候选的
`attemptedAppends:[{stream,expectedRevision}]`，与原数组一一对应、无重复，不含
业务 facts，也不算已应用 append 或参与 eventId 分配。writer 为同一原操作生成唯一 provider-owned
`core.records/operation-outcomes` append，scope 随可信原输入的 tenant 或 system，
fact 为 `operation.conflict/3`、data 恰为 RevisionConflict；outcome 恰为
`{status:"conflict",conflict}`、`requiredUses=[]`。原业务 appends 全不应用，只有
结果批次耐久后才可报告 conflict；codec 校验 outcome/fact 等值、无个人扩展字段。
replay 须从冲突行**之前**的连续完整前缀重算每个 attempted stream 当时的 head，
按原顺序推出与 outcome/fact 完全相同且非空的 currents；期望修订或前缀无法核实时
拒绝可写恢复/保持 unknown，不能只信冲突行自报的 currents。
个人创建若因目标流 CAS 冲突，沿普通 tenant-scope provider outcome 写入同 T/C 的
durable conflict；`attemptedAppends` 只含原目标流的冻结 stream/expectedRevision，
`currents` 只含实际冲突流。另一 T 即使已在相同 target 创建，也不能将其成功归给
本 T。lookup/replay 按原 operation/canonicalInput/digest 认回一次 committed 或 durable conflict；
unknown 和临时 `not_seen` 均不证明未提交。

v3 payload 的 `recordClass` 是 `ordinary_commit`、`ordinary_conflict` 或
`writer_epoch`；对应 `source` 为 `ordinary` 或 `writer`，由可信 writer 从普通准备
或内部取得 writer 动作赋值。个人创建的 F/T/C 含义由 Tenant 核实，DR 不增加
personal 专属 envelope 或跨 scope 写入特例。
BaseEnvelope 只是共用字段，codec 必须按该判别值强制对应的封闭子形状；历史
字节中的 `recordClass`/`source` 不可重铸新的运行资格。

每次 `acquireWriter` 的受信 `core.writer` 操作也用 v3 封闭 envelope：唯一 system
`writer-epochs` append 含 `writer.epoch/3{epoch}`，committed result 含同一 epoch，
`requiredUses=[]`；原 operationId 包含无歧义的 domain64 与 epoch，避免两个
coordinationDomain 的初始 epoch 共用 OperationRef；确切形式为
`epoch:<domain64>:<epoch>`，domain64 是该 domain UTF-8 的无填充 canonical base64url。
codec 校验封闭形状和规范输入，但只有 JSONL 持锁完整前缀、
前一 epoch、同步和旧写者排除后才能交出 writer。普通调用不能提交保留的
`core.writer` 或 `core.records` 记录。旧 `/1`、`/2` 字节没有本候选的可写恢复
兼容承诺；遇到实际旧字节须保全原件，另作显式处置，不静默重释。

当前 `packages/storage/records/src/index.ts` 仍将格式固定为 `/1`，要求 canonical
stream 顺序并校验旧 conflict/epoch 形状；v3 通用 codec、按调用方冻结顺序及受限
特例均需要实施修订。它尚非本候选的符合性证据。
