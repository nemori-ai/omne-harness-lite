# 记录端口与 codec：设计映射

## 采用接口

提供者消费 `capability.durable-records@1` 的精确候选坐标。该包只有公共 ports、envelope/receipt 数据和严格 codec，无运行时资源、factory 或 Cordis 依赖；具体 writer/锁/恢复由 JSONL 等提供者拥有。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/storage/records/README.md`，SHA-256 `c039cd8830ffc13d0ef3acb38ac04d60174b502638bd5c7200f388ca173ab41d`。只拥有公开 ports、envelope/receipt 数据与严格 codec；不拥有 writer 锁、fsync、恢复或业务状态语义。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

## 持续消费的映射


| 范围 | 当前映射 | 不提供 |
|---|---|---|
| ports | RecordPreparation/Writer/Reader、Submission、Watermark、Receipt | 具体 I/O、锁或生命周期实现 |
| revision | `StreamAppend.expectedRevision` 与 receipt/envelope stream revision 每次 accepted append 恰好 `+1`；同流多 facts 共享该 revision | owner fact count/sequence 不参与 CAS、身份或完整性 |
| order | adapter 先合并每流唯一 append、保留 append-local order，再按 envelope format 的 canonical `StreamRef` 编码严格排序；codec 拒绝重复/非 canonical 输入 | codec/writer 不静默重排；跨流 prepare 顺序无业务语义 |
| identity | commit 时以 canonical flatten 位置分配 `(coordinationDomain,batchSeq,recordIndex)` eventId | prepare correlation 不冒充 eventId；`(stream,revision)` 不逐 fact 去重 |
| data | CommitEnvelope、RecordedOutcome、Position、UseRequirement | 业务状态解释或授权判断 |
| codec | 单行严格编码/解码与结构限制 | 完整前缀、fsync 或恢复成功证明 |
| bootstrap scope | 普通输入仍逐 append 检查 operation tenant；受信 Host 绑定精确原始操作/输入、新 tenantId 和只限两条 Tenant system stream 加一条 `tenant:<id>` tenant stream 的写入权限，codec 校验 stream 身份、唯一性及 canonical 次序 | owner/operationKind 字符串、反序列化字段不可铸造权限；codec 不解读 `tenant.created`、claim 或成员资格 |

以上是候选契约到 records 端口/codec 的目标映射，不表示当前实现已全部符合。实现验收须让
prepare、encode/decode、writer receipt 与 recovery replay 使用同一版本化 canonical 编码和
同一 `+1 per accepted append` 算法；任何一处按 fact 数推进都属于不兼容实现。
同一受限绑定还须覆盖 conflict outcome：`conflict.currents` 只列实际冲突的流；
仅此例外的 conflict outcome 与 provider-owned system `operation.conflict` 记录必须
额外编码 `bootstrapTargetTenantId` 并核对运行时绑定；相同原操作/输入的
lookup 和恢复沿 writer 已提交的原操作/输入、成功 append 或冲突目标字段恢复
历史目标，异输入不得认回。新增格式 `core-journal/2` 对该分支使用 outcome
`bootstrapTargetTenantId: OpaqueId` 及 provider-owned `operation.conflict` version `2`
的 `{conflict, bootstrapTargetTenantId}` data；二者一致且绑定原操作。`core-journal/1`
完整历史继续按旧编码读取，不能在 v1 解码中接受新增字段或声称其持有例外。
严格解码历史绑定与准入时不可伪造的
受信能力是两件事；不能仅凭日志内自称的 owner/operationKind 复授写入权。
