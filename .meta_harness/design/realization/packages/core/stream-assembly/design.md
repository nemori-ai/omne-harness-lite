# stream-assembly 实现设计

契约：[`capability.stream-assembly` v1](../../../../spec/capabilities/stream-assembly/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律是**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块，不依赖任何第三方包。**依据：[D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) 选择表第三行把到达装配定为「三层的第三层，落 core、纯计算、自写」，保留前提 1 定「唯一的解析点在到达装配」。
契约要的是一个**对事件序列的折叠**（[S-4](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-4-装配状态是调用方持有的一个值)、[S-19](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-19-accept接一个事件)），它的判定次序、砍的去重、「一块怎样落」都是本项目的语义，没有可直接采用的实现。

- **包内依赖**：只依赖 [`message-model`](../message-model/README.md)（`data.arrival-events`、`data.content-blocks`、`data.call-accounts` 三份 v1 的类型与表示层校验）；运行时只用 Node 内置的 `JSON.parse` 与 base64 解码。
  message-model 的包界限未定（它与另三个 core 节点成环，见 [message-model 缺口 MSG-1](../message-model/design.md#包级依赖成环)）；拆包只改 import 路径，不改本节点的语义。
- **Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）。本模块不依赖 Cordis，此项只为与同批节点对齐。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。两个宿主（模型请求运行时、工具执行运行时）各自 `import`，在自己的插件体里调用 | [S-1](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-1-本契约拥有什么)「不持有任何一条流」；做成插件只会造出一个没有状态可管的服务 |
| 服务键 | 无 | 同上 |
| `inject` 关系 | **无**：本模块不 inject 任何服务，也不被 inject。**宿主换代时收掉什么**：宿主的插件体因必需服务换了提供者而重跑时，它手里的状态值随之丢失（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）——那是 [S-29](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-29-部署装配给与协议给) 第二行「状态随宿主存续」的丢失支，[S-22](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-22-abandon放弃) ⑧「没有东西可以放弃」；宿主**被有序撤除或替换**时还在途的流一律调 `abandon`、结局 `lost`（[S-28](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-28-宿主要兑现的前提) 第 6 条）。两支都在宿主节点兑现 | 与契约「撤除／在途」逐条对齐：本模块没有在途工作（每个操作一步返回，S-18～S-22 的 ⑧） |
| effect 装卸 | **无装载效应**（0 行） | 不取得任何资源、不注册任何贡献 |
| 事件派发 | **不发任何事件**，也不监听（S-18～S-22 的 ⑥）。首个内容出现、一块封口、流收尾都只是新状态里的事实，由宿主去读。**没有一条事件能越过租户或会话边界**：本模块根本没有事件；状态值不带会话与租户（[S-4](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-4-装配状态是调用方持有的一个值)），串会话的风险全在宿主路由（S-28 第 1 条「按（会话，目标）路由」、S-29 第三行） | — |
| 存储 | **无**：不读写任何存储，状态不落盘（S-4「它不进会话日志，也不是消息」）。因此没有对存储提供者的要求，也没有跨 owner 的同一提交 | [S-17](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-17-每个操作写全九件事) |

### 装配给 vs 协议给：单机时本节点提供了什么

[S-29](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-29-部署装配给与协议给) 七行的左列都由宿主给；本节点做的是让宿主**兑现得了**：

| S-29 行 | 本节点在单机里提供的 | 宿主要做的（不在本节点） |
|---|---|---|
| 1 逐个、按次序、不重不漏 | `accept` 是值进值出：交进去的状态不变，拒绝时没有新状态；索引与序列失败值照旧校验 | 一个消费循环，按生产次序、总拿上一次交出的那一份 |
| 2 状态随宿主存续 | 状态是普通值，不注册、不外泄引用 | 丢失时追补收场（模型侧按首 token、工具侧按停了不重来） |
| 3 只在所属会话里有意义 | 状态与快照不带会话、租户 | 按（会话，目标）路由；快照只给本会话观察者 |
| 4 一次发出一份状态 | `start` 每次交出一份新状态；本模块不知道别的状态 | 已收尾的目标不再开，迟到事件丢弃 |
| 5 首个内容先被宿主记下 | `accept` 同步交出含 `firstContentAt` 的新状态 | 在同一步里取时刻、先记下，再推给观察者 |
| 6 快照与增量衔接 | `position` 只数被接受的事件 | 被拒的事件不推给观察者 |
| 7 一个结果只记一次 | `closeOut` 对同一状态恒给同一结果（纯计算相等） | 按 `ResponseId`／`CallId` 只追加一次 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

| 契约责任 | 模块公开入口（候选） | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-4](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-4-装配状态是调用方持有的一个值)、[S-5](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-5-位置) 状态是值、位置只数被接受的 | 不透明类型 `AssemblyState`（内部表示不导出）；`start(target: unknown)` | 未实现。表示见[下节](#状态值用持久结构不用事件日志也不用可变对象) | 规范场景 S-34、S-36；「同一份状态接两个事件得两份分叉」由值语义直接成立 |
| [S-6](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-6-一块在状态里是什么)、[S-7](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-7-快照交出什么)、[S-20](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-20-snapshot读快照) 块次序与快照 | `snapshot(state) → { blocks, position, firstContentAt? }` | 未实现：快照时把片段物化成新字符串（语音重编成标准 base64），交出的对象整棵冻结 | P-1 由 formal task 作证（**模型**，见 [bindings](bindings.yaml)）；快照是值（P-10）是实现性质，证据形式是 S-36 与 SC-4 |
| [S-8](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-8-收尾结算交出什么)、[S-9](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-9-一块怎样落)、[S-21](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-21-closeout收尾结算) 收尾结算与落块 | `closeOut(state) → { ok: Settlement } \| { rejected: "stream_not_finished" }` | 未实现：按开块次序对每块取 S-9 那张表的一行；开着的调用块落半截、两位皆假 | S-35、CS-1、CS-2；不铸 `MessageId`、不查 PF-009 §5.6 那张表 |
| [S-10](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-10-工具调用在封口那一下解析且只解析这一次)、[S-11](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-11-参数收齐却解析不了只标记)、[S-12](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-12-被砍过内容的调用落成半截) 唯一解析点 | 无单独入口：`accept` 接受工具调用块的 `close` 时，模块内**唯一一处** `JSON.parse` | 未实现：块记录上带「开着时被改过内容」一位，`close` 时先看它；解析失败落 `unparseable: true` 的那一种 | S-32、S-33；SC-1 的承载形式见[静态检查](#静态检查义务怎么承载)；**参数里的大整数与重复键**是缺口 [SA-1](#实施缺口与消费者影响) |
| [S-13](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-13-账)、[S-14](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-14-砍的汇总)、[S-15](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-15-节流在到达装配之前投递一侧的节流不进账) 账与砍的汇总 | 结算结果的 `account` | 未实现：汇总增量维护；「配对」只凭次序认——状态记着「上一个被接受的事件是不是 `frame_too_long` 的 `trim`」，下一个被接受的是 `rejected` 的 `trim` 时把前者从 `byReason.frame_too_long` 里退掉，`omittedBytes` 两者照计 | S-39、P-12 性质测试（V-3）；缺账记全未知（`source: none`），不记零 |
| [S-16](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-16-首个内容的位置) 首个内容的位置 | 快照与结算里的 `firstContentAt` | 未实现：第一个载荷非空的 `fill`，或没收到过填、封口块内容非空的 `close`；一经确定不再写 | S-31、examples 第 8 节；本模块不取时刻 |
| [S-18](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-18-start开一份状态)～[S-22](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-22-abandon放弃) 五个操作 | `start`、`accept(state, event)`、`snapshot`、`closeOut`、`abandon(state, reason?)` | 未实现。`abandon` 实现为「对状态 `accept` 一个 `finish { reason: "lost", error: reason }` 再 `closeOut`」，工具侧带 `reason` 即 `malformed` | 失败一律以返回值 `{ rejected }` 到达，**不抛异常**；抛出只留给模块自身的缺陷 |
| [S-23](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-23-本能力自己的失败值)、[S-24](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-24-表示层拒绝值原名引用)、[S-25](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-25-判定次序)、[S-26](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-26-被拒不改状态后果归宿主) 失败值、次序、被拒不改状态 | `accept` 的 `{ rejected: ArrivalRejection \| AssemblyFailure }` | 未实现：第一段调 message-model 的到达事件表示层校验（信封 = `{ target: 状态的目标, event }`，并把「此刻开着的那一块」交给它判要借开块的两项）；通过后判 `event_after_finish`，再按事件种类判序列失败值 | S-38、examples 第 5 节；选择理由见[下节](#表示层判定借-message-model不在本模块重写) |
| [S-27](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-27-一次到达装配等于一次性到达) 一次到达装配等于一次性到达 | 无单独入口；是 `accept`＋`closeOut` 的性质 | 未实现 | P-7 由 formal task 作证（模型，有前提，见 [bindings](bindings.yaml)）；实现侧由性质测试 V-3 承担，**尚无** |
| [S-28](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-28-宿主要兑现的前提)、[S-29](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-29-部署装配给与协议给) 宿主前提与部署表 | — | 不在本节点 | 工具侧承诺在 `capability.tool-execution-runtime/v1#S-62`，模型侧在 `capability.model-request-runtime/v1#S-51`，兑现归那两个宿主节点 |

### 状态值用持久结构，不用事件日志，也不用可变对象

| | 可变对象、「用过即作废」 | 事件日志（形式模型的写法）：状态就是已接受的事件序列，读时折叠 | **持久结构（本节点选）**：每次 `accept` 交出新的冻结对象，未变的块记录共享；追加片段挂在不可变链表上 |
|---|---|---|---|
| 值语义（S-4 两份分叉互不相干） | **违反**：同一份交两次，第二次看到的是被改过的 | 成立 | 成立：没有任何一处被原地改 |
| `accept` 的代价 | O(1) | 追加 O(1)，但**判序列失败值要知道哪些块开着、封没封口**——仍得增量维护一份摘要，等于两套表示 | O(1)（块表按索引的持久映射，追加片段是链表头插） |
| 快照、结算的代价 | O(内容) | O(事件数) 重折叠 | O(内容)：只在读时把片段接成字符串 |
| 与形式模型的距离 | 远 | 最近 | 中：模型的 `log` 与本表示的对应是「同一串事件唯一确定同一份状态」（S-4 第二条），由一致性用例核 |

**落选方（事件日志）的最强论证**：它就是 [`formal/Assembly.tla`](../../../../spec/capabilities/stream-assembly/v1/formal/Assembly.tla) 的表示，实现与模型一一对应，P-1、P-7 的模型证据几乎直接搬得过来。
**它输在判定要的是摘要不是历史**：`index_reused`、`block_already_closed`、`account_duplicate`、配对规则都要问「此前发生过什么」的摘要，每次从头折叠是 O(n²)；增量维护摘要之后，日志本身就只剩冗余。
**本方弱点**：实现与模型不再同构，模型证据只证到「语义」，实现是否等于模型要靠一致性用例（V-2）与性质测试（V-3）——这两样现在都没有。`readonly` 类型不保证运行时不可变，所以新建的每个节点都 `Object.freeze`，并由 SC-4 的测试试写。置信度：**中高**。

### 表示层判定借 message-model，不在本模块重写

| | 本模块自写一份到达事件的表示层校验 | **调 message-model 的校验（本节点选）** |
|---|---|---|
| 「原名引用、不改名、同一次序」（[S-24](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-24-表示层拒绝值原名引用)） | 两份实现，次序可能分叉；传输适配与发帧入口若用 message-model 那份，同一事件在两处得出不同值 | 只有一份：`data.arrival-events/v1#S-28` 的次序与嵌着的块、账的拒绝值都在它的家里判 |
| 要借开块的两项 | 自己手里有开块，好判 | 要把「此刻开着的那一块」交过去（候选：一个按索引查开块的只读函数）；块没开或已封口就不参与 |
| 代价 | 重复 | 依赖 message-model 的一个带上下文的校验入口 |

**落选方的最强论证**：本模块独占开块信息，自写可以一次遍历同时判表示层与序列，少一次跨包调用。**它输给「一个概念一个权威定义」**：到达事件的表示层归 `data.arrival-events`，那份契约的拒绝值还会被传输适配、发帧入口在更早的边界上用到。**本方弱点**：message-model 的校验入口须接受一个开块查询参数，这个形状要两节点对齐（[MSG 设计](../message-model/design.md#契约责任--模块公开入口--实现--符合性依据或缺口)已按此写）。置信度：**高**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.arrival-events` v1、`data.content-blocks` v1、`data.call-accounts` v1（本契约文首「精确语义依赖」所列条款） | [`message-model`](../message-model/README.md) 的公开入口（包名候选 `@omne-harness-lite/message-model`），普通包依赖 | 随包版本；契约出 v2 时另开入口，不改 v1 的导出 | 无运行期缺席：静态 import。拆包（MSG-1）只换路径 |
| 被消费：两个宿主 | 宿主插件体里 `import`；每条流一份状态，放在宿主自己的在途表里 | 宿主换代时状态随宿主（见上表 `inject` 一行） | 本模块不保留任何旧状态 |

**没有配置项**，因此不涉及「配置错误」政策。

## 状态、并发与失败映射

本模块**无共享状态、无提交点**；每个入口是纯函数。同一宿主可同时持有任意多份状态，互不相干；两份状态之间没有任何交互，所以没有并发问题可言——
「一份状态只按次序接、不分叉」是宿主的前提（S-28 第 2 条），本模块不加锁、不检测分叉（检测不了：分叉的两份都是合法值）。

**失败映射**：`accept`、`start`、`closeOut`、`abandon` 的失败一律是返回值 `{ rejected: 值 }`，值取自 S-23 的八个与 S-24 原名引用的表示层拒绝值，恰一个；
`snapshot` 没有失败。**不写日志代替返回，不吞错**。被拒时交进来的状态原样可用（S-26）。
「被拒的增量要补一个 `rejected` 的 `trim`」「收尾之后被拒的要在宿主观测里记下」是宿主的事（S-28 第 4 条）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）：不取得资源、不注册贡献、不起定时器。
撤除时「在途的流一律 `abandon`」是宿主的装卸配对（S-28 第 6 条），本模块只提供 `abandon` 这个纯操作。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/capabilities/stream-assembly/verification.md#静态检查义务) 逐条对到形式（都**尚无**）：

| 检查 | 形式 | 现状 |
|---|---|---|
| SC-1 解析调用点恰一处、只在接受封口那条路径上 | `tools/ts-checks` 规则（候选）：本包源码里 `JSON.parse` 只许出现在一个指定模块（候选 `src/close.ts`）；照现有 `restricted-call-sites` 规则的写法 | 规则不存在 |
| SC-2 不持有按目标键控的表、不读时钟、不做 I/O、不发通知 | 时钟那一半：现有规则 `no-wall-clock` 的扫描范围已含 `core/`，包落地即生效；其余：本包的 import 白名单（候选：只许 message-model 与 `node:buffer`），照现有 `ops-import-whitelist` 的写法 | 时钟规则存在；白名单规则不存在 |
| SC-3 被拒路径上不写状态 | 由表示保证（旧状态冻结、拒绝时不构造新对象）＋ 单元测试：拒绝前后对旧状态做结构比较 | 无 |
| SC-4 快照与状态不共享可变部分 | 快照对象整棵冻结 ＋ 测试：对快照试写必抛，再接一个事件后旧快照逐字不变（即 S-36） | 无 |

## 实施缺口与消费者影响

本节点自己的缺口（契约的 G-1～G-7 已全部闭合，不重抄）：

- **SA-1 工具调用参数里的大整数与重复键**：S-10 说「按 JSON 解析一次」，Node 的 `JSON.parse` 把超过 2^53 的整数静默改值、对重复键静默取后一个。契约与 `data.content-blocks/v1#S-12` 都没写 `arguments` 要不要保住数值原文、重复键算不算解析失败。
  **本节点不自选**：这是 S-10「解析成功」的判据，属契约语义。受阻：工具执行运行时拿 `arguments` 去执行的每个带大整数参数的工具。**owner：主线**（改契约或裁定按 `JSON.parse` 语义）；若要保原文，解析改用 message-model 的无损读入（[MSG-3](../message-model/design.md#实施缺口与消费者影响)）。
- **SA-2 标准 base64 的严格判定**：`payload_kind_mismatch` 要求「语音的片段不是标准 base64」即拒；Node 的 `Buffer.from(s, "base64")` 对非法字符宽容、不报错。候选：先用正则核标准字母表与填充，再解码。Node 24 是否已带严格的 `Uint8Array.fromBase64`——**假设，须按 source-check 取证**（basis 无此条目；它是 Node 事实，不是 Cordis 语义）。owner：本节点。
- **SA-3 一致性用例的机读形式**：V-2 要「同一份语言无关用例」，`examples.md` 第 2～8 节是表格与手算，还没有机读的 JSON 用例集。owner：本节点起草用例文件、契约 owner 核对它与 examples 逐项相同；在那之前 V-2 只能按表手抄进测试。
- **跨节点交接**：S-28 第 1～9 条由两个宿主节点落（模型请求运行时、工具执行运行时）；本节点对它们只有一个要求——**宿主撤除时在途的流调 `abandon`，不交 `finish { interrupted }`**（S-28 第 6 条），写进各自的装卸配对表。
