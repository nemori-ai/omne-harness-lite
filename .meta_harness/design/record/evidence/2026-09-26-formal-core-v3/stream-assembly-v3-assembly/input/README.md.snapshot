# 形式化工件与论证映射

> 本目录为 v3 候选的规范模型包；可执行模型与配置沿源 v2 保持原字节。旧执行结果不重标为 v3；本轮运行状态只见 [起草报告](../../../../../record/decisions/core-implementation-spec-reconciliation/draft-report.md)。

本页拥有**条款 → 性质 → 模型 → 检查配置**这一层对应关系，以及模型**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**——实际执行的工具、配置、范围与结果在[验证入口](../../verification.md)。

本版只选用一个 TLA+ 行为模型，[理由在契约 S-30](../contract.md#s-30-本版选用的形式工件)。

## 本版选用什么

| 契约条款 | 性质 | 模型里的定义 | 作不作证据；未覆盖范围与相应义务 |
|---|---|---|---|
| [S-6](../contract.md#s-6-一块在状态里是什么) · [S-9](../contract.md#s-9-一块怎样落) | 块的次序是开块次序，与封口次序无关（P-1） | `BlockOrderIsOpenOrder` | **作证据**：变异 `order_by_close` 能驳倒它 |
| [S-23](../contract.md#s-23-本能力自己的失败值) `event_after_finish` · [S-22](../contract.md#s-22-abandon放弃) | 收尾之后不接受任何事件；放弃不给已收尾的流再补一个收尾（P-2） | `FinishIsLast` | **按构造，不作证据**：它复述 `Valid` 与 `Abandon` 的守卫。证据：规范场景 S-34、examples 第 5 节 |
| [S-23](../contract.md#s-23-本能力自己的失败值) `account_duplicate` · [S-24](../contract.md#s-24-表示层拒绝值原名引用) 工具侧 `account` | 账至多一次；工具侧没有（P-3） | `AccountAtMostOnce`、`ToolHasNoAccount` | **按构造，不作证据**：复述 `Valid` 的守卫。证据：规范场景 S-38（examples 第 5 节第 15、19 行） |
| [S-23](../contract.md#s-23-本能力自己的失败值) `index_reused`、`index_not_monotonic` | 索引终身只开一次、严格递增（P-4） | `OpenIndicesIncrease` | **按构造，不作证据**：复述 `Valid` 的守卫。证据：规范场景 S-38（第 4、5 行）；第 25、26 行验证表示层在先，不是索引错误证据 |
| [S-23](../contract.md#s-23-本能力自己的失败值) `block_not_open`、`block_already_closed` | 填与封口只落在开着的块上（P-5） | `FillsLandOnOpenBlocks` | **按构造，不作证据**：复述 `Valid` 的守卫。证据：规范场景 S-38（第 7、9、24 行） |
| [S-21](../contract.md#s-21-closeout收尾结算) · [S-22](../contract.md#s-22-abandon放弃) | 没收尾就没有结算结果；放弃等于补一个 `lost` 再结算（P-6） | `ResultOnlyWithFinish`；动作 `CloseOut` 的守卫 `FinishedIn(log)`、`Abandon` 的 `~FinishedIn(log)` | **按构造，不作证据**：复述 `CloseOut`、`Abandon` 的守卫。证据：规范场景 S-35 |
| [S-27](../contract.md#s-27-一次到达装配等于一次性到达) | 一次到达装配等于一次性到达（P-7） | 后一半（结果相等）`SplitInvariance`：`res = Result(OneShot(log), tk)`；前一半（σ̂ 也被逐个接受）`OneShotAccepted`：`OneShot(log)` 的每个事件在它之前的前缀上都满足 `Valid` | **作证据**：变异 `replace_as_append` 驳倒前者、`oneshot_close_first` 驳倒后者。前一半只到 `Valid` 建出的那几条语法规则为止，见下文「盖不到什么」 |

## 模型的形状

- **一个模型实例就是一条流**：路由归宿主（[S-3](../contract.md#s-3-本契约不拥有什么)），模型不建多目标表。
  目标的种类（模型侧／工具侧）在 `Start` 那一步非确定地选，两种都被穷尽。
- **状态值写成「已接受的事件序列」`log`**：契约 [S-4](../contract.md#s-4-装配状态是调用方持有的一个值) 说一份状态的内容由它接受过的事件唯一确定、不规定内部表示；
  模型取最直接的那一种表示。`Accept(ev)` 就是 `accept` 成功的那一支；**守卫不成立即是被拒，没有新状态**。
- **到达装配这一步是 `Assemble`**：按事件逐个折叠（`Step`），收尾时按 `Settle` 落块。**它就是被检查的对象**。
- **一次性形式是 `OneShot`**：按块声明式构造——每块开一次、至多一个填（载荷是 `Reduced`，追加相接、替换取最后一次）、按原样封口或不封口，然后账、收尾。
  **它不经 `Assemble`**，所以 `SplitInvariance` 不是「X 等于 X」：左边是折叠吃分次序列，右边是同一个折叠吃另一条独立构造的序列。
  **它也不经 `Valid`**——构造本身合不合语法由 `OneShotAccepted` 单独断言，否则一个构造上的差错（比如把某块的封口排到它的填之前）照样会被判相等。

| 模型里的 | 契约里的 |
|---|---|
| `Kinds = {"grow", "call", "whole"}` | 能一点点长的（文本、思考、语音）· 工具调用 · 整交的（图、文件、工具结果） |
| `Valid` 的各支 | [S-23](../contract.md#s-23-本能力自己的失败值) 的判定失败，及 [S-24](../contract.md#s-24-表示层拒绝值原名引用) 里要看目标种类的两条（工具侧的 `account`、`max_tokens` 的收尾）与 `fill_kind_not_appendable`；第三条「工具侧带 `error` 的收尾」不在模型里（见「盖不到什么」） |
| `Settle` 的 `sealed` · `incomplete` · `partial` · `drop` | [S-9](../contract.md#s-9-一块怎样落) 的：封口块 · 半截的调用 · 开着、收到过填的按归约落 · 开着、没填过的不落 |
| `Result` 的 `account` 取 `reported`／`unknown`／`frames` | [S-13](../contract.md#s-13-账) 的三种：上游报过的那份 · 全未知的那份 · 工具侧的 `frames` |
| `Result` 的 `ending` 只取收尾原因 | [S-8](../contract.md#s-8-收尾结算交出什么) 的 `ending.reason`；`firstContentAt` 不在模型里 |
| `Abandon` 先追加 `finish lost` 再算 `Result` | [S-22](../contract.md#s-22-abandon放弃) ④「等于先接受 `finish lost` 再结算」 |
| `trim` 事件：只占一个位置，`Step` 不改任何东西 | [S-14](../contract.md#s-14-砍的汇总)「只记，不改块」 |

**`Result` 比契约的结果细**：它给每块带着 `sealed`／`partial`／`incomplete` 的记号，契约交出的块里没有这个记号（开着的块与封口的块落成同一种块，[S-9](../contract.md#s-9-一块怎样落)）。
细的相等蕴含粗的相等，所以这不削弱 `SplitInvariance`。

## 盖不到什么

下列语义**不在模型里**，不得写成「已由模型覆盖」；各自的证据形式在[验证入口](../../verification.md)：

- **参数解析与解析不了**（[S-10](../contract.md#s-10-工具调用在封口那一下解析且只解析这一次)、[S-11](../contract.md#s-11-参数收齐却解析不了只标记)）：模型里封了口的调用块一律是 `sealed`，不区分完整与标了 `unparseable`。证据：规范场景 S-32、一致性用例。
- **被砍过内容的调用落成半截**（[S-12](../contract.md#s-12-被砍过内容的调用落成半截)）：模型的 `trim` 不改任何东西，**也不标记调用块**。
  这正是 [S-27](../contract.md#s-27-一次到达装配等于一次性到达) 把「开着时被改过内容的调用」列为前提的原因——模型检查的是没有这种砍时的相等；
  而字母表里的 `trim` 恰好**不会**触发这条规则的差异，因为模型根本没有这条规则。证据：规范场景 S-33。
- **砍的汇总、`frames.emitted`**（[S-13](../contract.md#s-13-账)、[S-14](../contract.md#s-14-砍的汇总)）：不在 `Result` 里，也不在相等里。证据：性质测试（P-12）。
- **快照**（[S-7](../contract.md#s-7-快照交出什么)、[S-20](../contract.md#s-20-snapshot读快照)）：只读、不是动作，模型没有它。快照是值（P-10）是实现的性质，证据：规范场景 S-36。
- **首个内容的位置**（[S-16](../contract.md#s-16-首个内容的位置)）：不在模型里。证据：规范场景 S-31 与 examples 第 8 节。
- **表示层判定的其余部分**（[S-24](../contract.md#s-24-表示层拒绝值原名引用)、[S-25](../contract.md#s-25-判定次序)）：块头模态、载荷合不合那一类、`replace_payload_shape`、工具侧带 `error` 的收尾（模型的 `finish` 没有 `error`）、判定次序——模型的字母表只含合形状的事件。证据：规范场景 S-38 与 examples 第 5 节（带 `error` 的收尾是第 28 行）。
- **`OneShotAccepted` 只到 `Valid` 为止**：它说 σ̂ 过得了模型建出的那几条语法规则（收尾、账、索引、块开没开、填法），**不说**它过得了上一条列的表示层判定。σ̂ 的每个事件都取自 σ 或是 σ 里某块全部填的归约，那一半的证据是规范场景 S-31 与 examples 第 2 节的一次性形式手算。
- **块的内容本身**：载荷抽象成符号序列，块标识、标注、块头都不在模型里。「封口块等于归约」是生产者义务（`data.arrival-events/v2#S-20`），模型把它当作前提——封了口的 `grow` 块的内容就是它的归约。
- **被拒不改状态**（P-9）：在模型里是**建模方式本身**（守卫不成立就没有迁移），不是被检查出来的性质。
- **宿主的前提**（[S-28](../contract.md#s-28-宿主要兑现的前提)）与**跨进程**（[S-29](../contract.md#s-29-部署装配给与协议给)）：模型是一条流、一个串行的调用方；分叉、乱序、重复、宿主重建都不在模型里。

## TLA+ 与 TLC

- **模型文件**：[`Assembly.tla`](Assembly.tla)。状态变量四个：`st`（`none`／`live`／`out`）、`tk`（目标种类）、`log`（状态值）、`res`（结算结果）。
- **公平性**：不带任何公平性假设，**只检查安全性质与不变量**。本能力不拥有进展性质（[契约第八节](../contract.md#八性质与场景)）。
- **检查输入**：

  | 配置 | 常量 | 检查什么 | 预期 | 是否登记为 formal task |
  |---|---|---|---|---|
  | [`Assembly.cfg`](Assembly.cfg) | `Indices = {0, 1}`，`Frags = {"a", "b"}`，`MaxEvents = 6`，`Mutation = "none"` | 上表九个不变量（作证据的是 `BlockOrderIsOpenOrder`、`SplitInvariance`、`OneShotAccepted`） | **在本范围内无反例** | **是**：`stream-assembly-v3-assembly` |
  | [`Assembly_OrderByClose.cfg`](Assembly_OrderByClose.cfg) | 同上，`Mutation = "order_by_close"`：到达装配这一步按封口次序排块 | `BlockOrderIsOpenOrder`、`SplitInvariance` | **找到反例** | **否**（有效性核对） |
  | [`Assembly_ReplaceAsAppend.cfg`](Assembly_ReplaceAsAppend.cfg) | 同上，`Mutation = "replace_as_append"`：到达装配这一步把整体替换的填当追加片段相接 | `SplitInvariance` | **找到反例** | **否**（有效性核对） |
  | [`Assembly_OneShotCloseFirst.cfg`](Assembly_OneShotCloseFirst.cfg) | 同上，`Mutation = "oneshot_close_first"`：一次性形式把一块的封口排到它的填之前 | `OneShotAccepted` | **找到反例** | **否**（有效性核对） |

  四个配置都关掉死锁检查：本模型不承诺进展，`MaxEvents` 用完之后「没有下一个动作」不是缺陷。

- **有效性核对**（**四个配置一起才成立**）：
  - 关键路径可达（各自都在 `MaxEvents = 6` 之内；`Abandon` 补的那个收尾不占这个上限）：两块同时开着、交错填、按与开块相反的次序封口、整体替换的块被填两次。
  - **三个变异配置都必须给出反例。**给不出，说明对应的断言在本模型里是平凡的——那时问题在模型或条款表述，**不能记作 P-1 或 P-7 已检查**。
  - 反例轨迹须对得上变异的含义：按封口次序排块的反例里有「后开先封」的两块；把替换当追加的反例里有一个被填了两次的整体替换块；封口排在填之前的反例里有一个收到过填、又封了口的块。对不上说明抽象错了。
  - P-2～P-6 那六个不变量**没有**变异配置：它们按构造成立，不作证据（上表），补变异只会驳倒守卫本身，证明不了什么。
- **常量的规模**：两个索引足以产生「并开、交错、倒序封口」；两个片段符号足以区分相接与取最后一次；六个事件足以容纳两块各开、填、封再收尾。
  **更大的规模不自动带来更强的结论**，加大规模是另一次检查，结果按它自己的范围陈述。
- **砍的字母表只有一个**（落在索引 0 上的一种）：`trim` 只占位置、不改任何东西，多取几种只放大状态空间。

TLA+ 描述行为规格，TLC 对给定模型进行检查；**在已检查范围内未发现反例，不自动成为任意范围的证明**。
