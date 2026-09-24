# model-model 验证与证据

契约侧的证据义务权威在两份契约的验证入口：[`data.model-profile`](../../../../spec/data/model-profile/verification.md#证据义务)（按条款列）、
[`data.model-response`](../../../../spec/data/model-response/verification.md#证据义务)（V-1～V-14）。
本页只登记**落在本节点上的那一部分**；目录的写路径与运行时的写入纪律归模型档案目录与模型请求运行时。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| MP S-24、S-25 表示层校验与拒绝值次序 | `examples.md` 的正反实例逐条过 `judgeModelProfileDocument`；第 6 节四条次序回归例与第 10 节建档内容一条；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| MP S-18 `max_output_exceeds_profile`（Schema 之外那一步） | 单元检查：档案与建档内容两种文档各一正一反 | 未开始 | 本节点 |
| MP S-28 建档内容不带在册状态与 `updatedAt`（M12） | 带了即 `malformed` | 未开始 | 本节点 |
| MP S-14 引用只精确解析 | `refMatches`：名字对、所在范围不对 ⇒ 不匹配；官方支与自建支互不匹配 | 未开始 | 本节点（匹配那一半）；三种收场不折叠归目录 |
| MR V-1 形状校验 | 第一、二节每个 JSON 块过 `judgeModelResponse`，结果与「预期」逐一对上，拒绝的核对拒绝值 | 未开始 | 本节点 |
| MR 与 `data.messages`、`data.call-accounts` 的副本对齐（MSG V-12 的一部分） | `ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 的 `$defs` 逐字相同 | 未开始 | 本节点（[design](design.md#副本定义的对齐放在本包)） |
| MP 的对齐义务（`Modality` 只有一份定义等） | 类型与 Schema 都从 message-model 取 `Modality` | 未开始 | 本节点 |

**不在本节点**：MP 的撞名、在册转移、`updatedAt`、只发往允许的一家、不静默丢改、快照原样、缺席不补值等规范场景（模型档案目录与模型请求运行时）；MR V-2～V-14（写入纪律、序列性质、首 token、脱敏、无隐藏重试、`late`，都归模型请求运行时）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **两份契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **包建不起来**：MDL-1（包级依赖成环）不解，上表所有行都无从开始。owner：主线。
