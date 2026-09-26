# messages 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.messages/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/messages` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**473 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 15 项 core-local、2 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前3实际形式执行（2026-09-26）

[2026-09-26-formal-core-v3](../../../../record/evidence/2026-09-26-formal-core-v3/README.md) 保存本次正式3输入的实际模型、指定变异、原始输出与完整封存。主调度核32冻结资源、630 SHA、631归档字节及263主Alloy／28 XML读数，独立spec-reviewer核对应性无阻断。原6命令2 run SAT/4 check UNSAT，五变异各规定check有反例；恰6/5条消息与前缀范围，不把fact/类型吸收的名单/配对/块不变前提当接收或写入保护。Alloy未登记正式task，不增formal binding。旧证据保留原输入；本次模型执行不签收产品实现、W6真实组合或人的最后总体门。

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

## D-068 当前验证epoch

当前设计输入为 `data.messages · v3`，规范资源在 [acceptance.json](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。

## 2026-09-26 typed表示恢复的实际旧2范围复验

[HUB独立实际运行](../../../../record/evidence/2026-09-26-tests-core-opaque-restoration/README.md)保存四包1700测试/build/type/27规则、原两项TypeError与八组built消费者的输出及精确2输入。只证指定恢复路径/表示与完整业务分离，非全仓opaque数据流/性能/外部runtime/后续3采用。当前3完整回归与逐ID接受仍待，不将旧2运行重标。
