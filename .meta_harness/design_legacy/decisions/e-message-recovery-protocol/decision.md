# D-020：消息游标、快照与活跃流交接的新 v1 方向

- 状态：以下三组**语义方向已接受**；新 v1 规格发布、依赖采用、实现和符合性仍未完成。
- 来源：[消息流三候选提案](../../proposals/message-stream/README.md)、[D-018](../e-message-stream-hooks/decision.md)及本决定下表的旧/新行为界限。旧正式 `spec/capabilities/message-stream/v1/contract.md` 固定于 `e3573ca72d18bfe7ddd002df5025551b51eede46`，SHA-256 `d3c90975868c2af08c429708fb664c221569692e99b033d210ac7f0ea4b182b1`；新 `capability.message-stream@1` 的 `contract.md` SHA-256 为 `a4ac7ff8fb7168d034c7bc0a5bd09bdfa57a79212a25214f3ad735589780538b`。相关新 Model/Session 契约分别为 SHA-256 `d7d6f9508f31915e48c4bbd33a89067c13f14c8af74cca706b12788b128091bf`、`dab0166e029d8aa96f721c1eba4965e90d835753d252bd85de3d13e21a74742f`。
- 接受依据：2026-09-16 产品用户对明确列出以下三组、并说明“只裁决设计方向，不代表 J 验证、catalog 冻结或实现符合性完成”的问题答复“接受三组候选语义（推荐）”。

## 接受的选择

| 范围 | 新增的可观察选择 | 已有保证与边界 |
|---|---|---|
| MS-07/08/11：游标与增量对账 | 客户端即使无提示帧也定期请求授权 `changes(after,to,principal,visibilityVersion)`；只有完整安装 history、attempt 状态、正文与覆盖水位后才推进游标。状态独占的提交须返回授权更新；隐藏对象独占的提交只以集合级覆盖水位跨过。 | D-015 已要求不越过未安装内容、同批完整和读权裁剪；本次接受新增取数责任、接口和无帧安装条件，不重授旧保证。 |
| MS-12：完整快照恢复 | 同水位快照给当前主体获准的完整 `attemptStates` 及 `floor/coverage/visibilityVersion/replacementToken`；客户端按替换代次、读权版本和非回退水位原子安装。缺席只可标记本地证据不可用，不推断业务终态。 | 旧设计已要求同水位读取和无权/不存在不可区分；本次接受完整集合、三条件安装及缺席处理。不能用旧快照回退已安装状态。 |
| MS-04/20/23：活跃流身份与换代 | 公开帧区分 `attemptEpoch` 与 `runEpoch?`，保留 source/transform 代次、route binding 与 history anchor；活跃读面给 compact state、覆盖水位和源 cut。正常换代发布有序 `source.generation.changed` marker 并映成公开控制帧，崩溃无 marker 才报告 source-unavailable。 | D-018 已接受 listener-first 切换、单 listener 隔离及源失联非终态；本次接受公开字段、compact 读面和正常换代 marker，不由观察者代裁决业务结束。 |

## 取代、消费者与剩余门

本决定仅在表中新增的可观察范围内取代 D-015 旧消息流设计的相冲突行为，并补充 D-018；不接受消息提案的所有候选机制，也不把目标整份契约哈希视为全文批准。旧规格已批准且未改变的保证继续有效。若后续改变公开字段语义、安装条件、所有权或消费者可观察行为，须重新分类接受。

Model Execution 消费活跃源代次、route binding、compact fold 与 marker；Session 消费授权变化、快照同水位和 attempt 状态。I 须用源→目标条款映射核对这两份精确快照、E 的 46 条映射以及最终资源锁，随后按依赖闭包登记候选、独立评审与采用。J 须在固定候选上核对跨能力模型和故障场景；有限模型结果不证明真实提供者或客户端在断线、撤权、崩溃及换代下符合协议。
