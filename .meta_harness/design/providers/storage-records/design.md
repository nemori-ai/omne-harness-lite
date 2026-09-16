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

以上是候选契约到 records 端口/codec 的目标映射，不表示当前实现已全部符合。实现验收须让
prepare、encode/decode、writer receipt 与 recovery replay 使用同一版本化 canonical 编码和
同一 `+1 per accepted append` 算法；任何一处按 fact 数推进都属于不兼容实现。
