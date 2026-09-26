# messages 验证与证据

契约侧的证据义务权威在 [`spec/data/messages/verification.md`](../../../../spec/data/messages/verification.md#证据义务)（V-1～V-12、SC-1～SC-6）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 参与机检的各节逐行过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值的具名与两段次序 | 每个拒绝行逐字相同；第 12 节六行专验第一段的次序 | 未开始 | 本节点 |
| V-3 单条消息里 Schema 管不到的约束 | 工具消息两个 `callId` 相等等；`block_id_duplicate` 含嵌套与派生表示 | 未开始 | 本节点 |
| S-37 读 JSON 文本的口径（M36） | examples 新加的两例：顶层 `type` 出现两次的文本得 `malformed`（不取任一个）；含 `12345678901234567890` 的记录经 `readJsonStrict`／`writeJsonLossless` 往返逐字相同 | 未开始 | 本节点做模块内那一半；会话日志落盘与回读那一跳归日志写入方（content-blocks CB-2） |
| V-4 日志层的判定（名单 ② ③ ⑤ ⑥、配对与唯一 ①～⑦） | 给定日志前缀，判一次追加合不合法 | 未开始；⑤ ⑥ 受阻于调用方给不出输入（MSG-2） | 本节点提供判定；演练在日志写入方（下一程） |
| V-5 此刻模型可读 | examples 第 11 节五条消息，算出的可读集合与手算逐块相同；三个变体各跑一次 | 未开始 | 本节点（纯函数那一半）；「真实组装」那一半归 PF-010 的组装（无契约） |
| V-11 结构模型 `Readable.als` | Alloy | 契约侧记录，**不是 formal task、不可绑定** | 契约 owner |
| V-12 与别处逐字相同的定义 | `ResponseId` 等四份副本 | 放在 model-response 节点 | model-response |
| V-10 中本节点承载的 SC-3、SC-4、SC-5 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |

**不在本节点**：V-6（规范场景，要真实接收边界与落盘）、V-7（出门三条义务，归传输适配）、V-8（走查，与消费者共同做）、V-9（跨进程，本版装配下无法演练）；SC-1、SC-2、SC-6。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；`judgeCompactionList` 的第三个参数由 `ctx` 改名 `inputs`（候选名，免与 Cordis Context 混读）；MSG-1、MSG-2 改指接口契约 `capability.session-log/v2`，V-4 ⑤ ⑥ 仍受阻于 MSG-2。这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **Alloy 模型不可绑定**：S-28 的实现侧证据只能是 V-5。
- **名单判定的 ⑤ ⑥ 没有可测的输入**（MSG-2），随会话日志契约留给下一程。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
