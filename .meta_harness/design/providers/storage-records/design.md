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
| personal creation scope | 普通输入仍逐 append 检查 operation tenant；只接收受信 Host 在本代颁发的一笔资格，绑定来源、原 operation/摘要、`UserRef`、target、domain、精确流集合/expected revisions、Admission/Tenant/writer 代际。`account_registration` 仅 personal-index system + `tenant:<target>`，`deployment_init` 再含 bootstrap system；codec 校验 stream 身份、唯一性及 canonical 次序 | 客户端来源、owner/operationKind 字符串、反序列化字段不可铸造权限；codec 不解读 Account 授权、`tenant.created`、claim 或成员资格 |

以上是候选契约到 records 端口/codec 的目标映射，不表示当前实现已全部符合。实现验收须让
prepare、encode/decode、writer receipt 与 recovery replay 使用同一版本化 canonical 编码和
同一 `+1 per accepted append` 算法；任何一处按 fact 数推进都属于不兼容实现。
同一受限绑定覆盖 conflict outcome：`conflict.currents` 只列实际冲突流；仅 personal
creation conflict outcome 与同一 provider-owned `operation.conflict` fact 保存
`personalTargetTenantId`、受信来源、原 operationRef、inputDigest、`UserRef`，并逐字段
核对运行时资格。即使只冲突 system index，也须保留原 target，不能伪造 tenant current。
lookup/replay 先以原 operation/摘要/来源/`UserRef`/target 核对 durable 结果和唯一
目标 append 或 conflict 字段；不能以 `not_seen` 推断原写入未发生。

新候选格式 `core-journal/3` 对该分支使用上述封闭 outcome，provider-owned
`operation.conflict` fact version `3` 使用相同 data。codec 固定 canonical 字节、摘要、
必填/禁填字段，拒绝额外字段、错版本、错 target 与 outcome/fact 不一致；JSONL
writer 在准入时复核本代资格，replay 在完整前缀上复核持久结构/绑定；replay
不能从历史字节重建运行时资格。旧候选 `/1`、`/2` 没有读取或
继续写入兼容承诺；遇到实际旧字节要保全原件并拒绝按 v3 可写恢复，由另行处置
决定处理，不能静默重释。历史结果核查不能复授本代资格。当前源码是否具备这些
端口和 codec 行为仍须在实施 revision 验收。
