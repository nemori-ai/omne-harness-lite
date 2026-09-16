# 记录端口与 codec设计映射

## 采用接口

提供者消费 `capability.durable-records@1` 的精确候选坐标，并在 Cordis Context 中以有生命周期的服务/插件装配。
tenant、operation、因果、epoch、修订与资源所有者必须显式；依赖撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/storage/records/README.md`，SHA-256 `c039cd8830ffc13d0ef3acb38ac04d60174b502638bd5c7200f388ca173ab41d`。只拥有公开 ports、envelope/receipt 数据与严格 codec；不拥有 writer 锁、fsync、恢复或业务状态语义。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

## 持续消费的映射


| 范围 | 当前映射 | 不提供 |
|---|---|---|
| ports | RecordPreparation/Writer/Reader、Submission、Watermark、Receipt | 具体 I/O、锁或生命周期实现 |
| data | CommitEnvelope、RecordedOutcome、Position、UseRequirement | 业务状态解释或授权判断 |
| codec | 单行严格编码/解码与结构限制 | 完整前缀、fsync 或恢复成功证明 |
