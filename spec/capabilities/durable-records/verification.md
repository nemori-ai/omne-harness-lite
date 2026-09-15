# durable-records 的验证范围

本页说明各版本条款有哪些证据支持、哪些没有。更新本页不改动冻结的版本目录。

## v2

[v2](v2/contract.md) 目录下的 `Recovery.tla` 与 `Recovery.cfg` 是 v1 同名文件的逐字节复制
（SHA-256 分别为 `8cc142c2…6591e` 与 `43c98e23…aea3f`），模型本身没有改动，因此 v1 的历史
运行结论按同一工件成立；本轮没有重跑 TLC。v2 唯一的新增承诺——DR-01 的批内记录顺序属于
envelope、读取与重放稳定——**不在模型覆盖范围内**：`Recovery` 只建模一个 envelope 的写入、
同步、回执与一次重启，没有多记录批次，也没有读取顺序。该承诺目前只有正文，待提供者验收。

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [DR-01](v2/contract.md) 批次原子、envelope 内容、批内顺序 | 无模型；结构由 [CD v2 Schema](../../data/core-work/v2/schema.json) 与提供者验收支持 | 全部：批次原子性、多流前置修订、批内顺序与重放稳定 |
| [DR-02](v2/contract.md) 结果区分与去重 | `Recovery.cfg`（`DurableAck`：同步前不得回执；`RecoverExact`：恢复后 committed 蕴含完整且已同步）；否定变体 `Recovery-earlyAck.cfg` 给出 `DurableAck` 反例 | `conflict` / `rejected` 的判定、同 operationId 异输入的冲突、通知失败后的 delivery 状态 |
| [DR-03](v2/contract.md) 独占写入权与水位读取 | `Recovery.cfg`（`RecoverExact` 的 `epoch = 1`：恢复取得新 writer epoch） | 真实独占强制、旧 epoch 被拒的存储侧机制、读者水位与落后投影 |
| [DR-04](v2/contract.md) JSONL 格式与尾部恢复 | `Recovery.cfg`（`bytes ∈ {full, tail, bad}`：完整行恢复后重新同步再认回 committed，坏行保持 unknown，未完成尾部为 not_committed） | 真实文件与目录 fsync、OS/文件系统清单、长度与摘要的实际校验、中间缺口的拒绝 |
| [DR-05](v2/contract.md) 关闭与更换提供者 | 无模型 | 全部：排空、释放、前缀核对、格式升级 |

有限范围与刻意未覆盖：一个 envelope、一次重启、一个协调域；不证明磁盘、文件锁或 OS 的
实际耐久性，不覆盖并发写者、跨域提交与迁移。实现符合性按
[组合场景](../../compositions/core-work-coordination/v1/scenarios.md)与 JSONL 提供者验收
另行判断。

## 历史运行

模型与配置的实际命令、返回码与日志见
[core-capabilities 运行记录](../../../docs/proposals/core-capabilities/evidence/model/results.json)。
其中 `Recovery` 的两次运行所用工件哈希与本目录 v1/v2 的副本一致：

| 运行 | 期望 | 返回码 |
|---|---|---|
| `Recovery`，mutation `none` | 完整探索通过 | 0 |
| `Recovery`，mutation `earlyAck`（配置在证据目录，未进版本目录） | `DurableAck` 反例 | 12 |

[formal-tasks](../../formal-tasks.json) 中的 `durable-records-v1-Recovery` 指向 v1 目录，
`durable-records-v2-Recovery` 指向 v2 副本；两份工件逐字节相同。

## v1

[v1](v1/contract.md) 的覆盖说明与上表相同，只是不含 DR-01 的批内顺序承诺；当时的设计来源、
逐模型映射与全部否定配置见
[core-capabilities 验证范围](../../../docs/proposals/core-capabilities/verification.md)。
