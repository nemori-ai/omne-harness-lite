# message-model 验证与证据

契约侧的证据义务权威在四份契约的验证入口：[`data.content-blocks`](../../../../spec/data/content-blocks/verification.md#证据义务)（V-1～V-10、SC-1～SC-4）、
[`data.messages`](../../../../spec/data/messages/verification.md#证据义务)（V-1～V-12、SC-1～SC-6）、[`data.call-accounts`](../../../../spec/data/call-accounts/verification.md#证据义务)（V-1～V-9、SC-1～SC-4）、
[`data.arrival-events`](../../../../spec/data/arrival-events/verification.md#证据义务)（V-1～V-9、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**；写路径、翻译方、运行时、组装与读面上的义务归各自节点，下面「不在本节点」一段点名。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| CB V-1、MSG V-1、CA V-1、AE V-1 形状校验 | 各契约 `examples.md` 参与机检的正反实例逐条过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| CB V-2、MSG V-2、CA V-2、AE V-2 拒绝值的具名与次序 | 每个拒绝行，校验入口给出的值与「拒绝值」一列逐字相同；各契约的优先级专节逐行 | 未开始 | 本节点 |
| CB V-3、MSG V-3、AE V-3 Schema 管不到的约束 | 一条消息内 `id` 重复（含嵌套）、媒体类型两处不逐字相同、派生块与原块同模态；工具消息两个 `callId` 相等等；到达事件自己的三个拒绝值 | 未开始 | 本节点 |
| CB V-6 `opaque` 原样回传、CA G-9 的闭合条件 | 含 `9007199254740993`、嵌套对象与 `null` 的不透明数据经 `parseLossless`／`stringifyLossless` 往返逐字相同；金额加总 `0.1 + 0.2 = 0.3`，超 17 位有效数字不丢位——**一条会在丢位时失败的测试** | 未开始；受阻于 Node 24 两个 API 的取证（design [MSG-3](design.md#实施缺口与消费者影响)） | 本节点做模块内的那一半；**每一跳**的那一半归各读写边界的节点 |
| MSG V-4 日志层的判定（名单 ② ③ ⑤ ⑥、配对与唯一 ①～⑦） | 给定日志前缀，判一次追加合不合法 | 未开始；⑤ ⑥ 受阻于调用方给不出输入（MSG G-5、G-2） | 本节点提供判定；演练在日志写入方 |
| MSG V-5 此刻模型可读 | examples 第 11 节五条消息，算出的可读集合与手算逐块相同；三个变体各跑一次 | 未开始 | 本节点（纯函数那一半）；「真实组装」那一半归 PF-010 的组装（无契约） |
| MSG V-11 结构模型 `Readable.als` | Alloy 的 `run` 找到实例、`check` 无反例、五个变异各找到反例 | 契约侧记录，**不是 formal task、不可绑定**；不在本节点闭合 | 契约 owner |
| MSG V-12、CB 与 tool-definition 的 `ModelToolName`、MSG／CA 与 model-response 的副本定义 | 逐字相同的对齐测试 | 未开始 | 放在依赖本包的一侧：tool-model、model-model（本包不能反向依赖它们） |
| CA V-5、V-6 补账与汇总 | `effectiveCost`、`summarize` 对 examples 第 9 节手算逐项相等；平局、孤立补账、重复的账三种失败 | 未开始 | 本节点（求值那一半）；「核原响应体的字节」那一半归补账的写入者 |
| AE V-5 封口块等于归约 | 生产者一侧的性质测试以 `reduceFills` 为参照 | 未开始 | 生产者节点（传输适配、发帧入口）跑；本节点提供参照实现 |
| SC 各项（见 [design](design.md#静态检查义务怎么承载)） | 类型约束 ＋ `tools/ts-checks` 规则 ＋ 「故意违反就失败」的自测 | 未开始；规则一条也不存在 | 本节点提出形式；规则落在 `tools/ts-checks`，大多扫的是消费者包 |

**不在本节点**：CB V-4、V-5、V-7、V-8、V-9；MSG V-6、V-7、V-8、V-9；CA V-3、V-4、V-7、V-8、V-9；AE V-4（序列规则，归 stream-assembly）、V-6～V-9。
它们要的是真实的写路径、翻译方、组装、节流方或跨进程边界，分别归日志写入方、模型请求运行时、工具执行运行时、stream-assembly 与尚未建立的组装；跨进程各行**本版装配下无法演练**。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **四份契约的每一条都没有实现侧证据**：本节点没有源码；空绑定表与此一致。owner：本节点。
- **包建不起来**：MSG-1（包级依赖成环）不解，上表所有「本节点」行都无从开始。owner：主线。
- **精度的端到端证据形式缺一半**：模块内往返测试证不了「每一跳都用了无损读写」；那一半要在各读写边界节点各有一条「丢位即失败」的用例。owner：主线分派到存储提供者与两个运行时节点。
- **Alloy 模型不可绑定**：`Readable.als` 的结论只在契约验证入口有文字记录，不进本节点绑定；S-28 的实现侧证据只能是 V-5。
