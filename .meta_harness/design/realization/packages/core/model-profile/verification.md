# model-profile 验证与证据

契约侧的证据义务权威在 [`spec/data/model-profile/verification.md`](../../../../spec/data/model-profile/verification.md#证据义务)（按条款列）。
本页只登记**落在本节点上的那一部分**；目录的写路径与运行时的写入纪律归模型档案目录与模型请求运行时。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| S-24、S-25 表示层校验与拒绝值次序 | `examples.md` 的正反实例逐条过 `judgeModelProfileDocument`；第 6 节四条次序回归例与第 10 节建档内容一条；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| S-18 `max_output_exceeds_profile`（Schema 之外那一步） | 单元检查：档案与建档内容两种文档各一正一反 | 未开始 | 本节点 |
| S-28 建档内容不带在册状态与 `updatedAt`（M12） | 带了即 `malformed` | 未开始 | 本节点 |
| S-14 引用只精确解析 | `refMatches`：名字对、所在范围不对 ⇒ 不匹配；官方支与自建支互不匹配 | 未开始 | 本节点（匹配那一半）；三种收场不折叠归目录 |
| 对齐义务（`Modality` 只有一份定义） | 类型与 Schema 都从 content-blocks 取 `Modality` | 未开始 | 本节点 |

**不在本节点**：撞名、在册转移、`updatedAt`、只发往允许的一家、不静默丢改、快照原样、缺席不补值等规范场景（模型档案目录与模型请求运行时）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-040 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
