# @omne-harness/session-observation 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

会话观察回答一个问题：登录的人看一个会话，现在正在发生什么。它给出一条帧序列，告诉界面这一轮开始了没有、日志里有没有新的已提交内容、正在生成的那段回复是什么。已提交的内容本身由读历史给，历史是权威，观察只是进行中的投影。

## 范围与依据

本包拥有会话观察的领域面、定位、刷新的预算、帧的翻译和一次观察的收场。它只读会话与模型两个领域，不写任何东西，不做授权判断。

依据：

- 提案 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 的[会话观察](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#会话观察)与[会话观察的定位与流](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#会话观察的定位与流)两节，以及模型三的精化对照。
- 会话契约 [SPEC](../session-contract/SPEC.md#稳定调用引用的读取) 的读者日志读取面、调用登记的读法（`readCallRegistration`）和「一轮在进行」的判法。
- 模型契约 [SPEC](../../model/model-contract/SPEC.md) 的公共流两个读取面。本包的端口里已有这两个面，流这一侧尚未接入，见[现行限制](#现行限制)。
- 刷新的数值与原状态图沿用[服务端接入规格的刷新策略](../../access/server-entry/SPEC.md#刷新策略)。本包的策略对象承接它。

采用范围：定位轴与刷新已按本文件实现。流的订阅、快照与增量、缺口帧在本文件里标为「第 2 块，未实现」，不属于现行保证。

与提案正文有两处不同，以本文件和代码为准：

- 帧序列的返回类型是 `SessionObservationEnd | undefined`，`undefined` 表示被中止。提案写的是 `SessionObservationEnd`。
- 通知的种类集合由端口 `historyKinds` 提供，不是写死的「八种」，见[通知](#通知)。

## 结果与不变量

### 领域面

`open({ access, signal })` 先以观察者自己的主体读一次日志，核对资格。有三种结果：

| 结果 | 条件 |
| --- | --- |
| `opened` | 读得到。给出帧的异步序列 |
| `denied` | 读被拒、会话不存在、会话或租户标识不合法。三种情况的答复逐字段相同，调用方分不出 |
| `unavailable` | 日志暂时不可得 |

不变量：

- 帧序列的第一帧是 `state`，或者一帧不发就结束。只有「帧的翻译」和「一次观察」能发帧，所以次序只有一处要守。
- 领域面没有结束帧。帧序列走完时，原因是生成器的返回值：`refresh-exhausted`、`denied`、`unavailable`。被中止时生成器直接结束，返回 `undefined`，不给原因。
- `open` 的 `access` 是观察者自己的主体，读日志都用它。会话观察不用自己的身份替他读。
- 建立过程中被中止：收掉通知的订阅，`open` 答 `unavailable`。

### 状态帧

状态帧有四个字段：`run`（当前这一轮的编号，没有进行中的一轮时是 `null`）、`revision`（日志的修订号）、`phase`、`target`。只有四个字段里有变化才发新的状态帧，第一帧一定发。`target` 只比较有没有。

### 五个对象

每个对象有一个变化的理由，互不并入。

| 对象 | 它独占什么 | 为什么单独成一个对象 | 实现 |
| --- | --- | --- | --- |
| 一次观察 | 帧的出口与次序；「第一帧是状态」；中止时的收场 | 只有它发帧，帧的次序只有一处要守 | `src/observation.ts` |
| 定位 | 日志读到哪了；当前这一轮；最近一次主调用的引用；日志的修订号；标记「有新提交待看」。纯读 | 「看哪一次调用」只由日志决定，和流无关 | `src/locate.ts` |
| 刷新的预算 | 当前一档间隔、连续没有新内容的次数、累计的等待时长 | 它是策略，换部署就换值，不该散在状态机里 | `src/refresh-budget.ts` |
| 帧的翻译 | 上一次发出的状态字段；状态帧只在四个字段有变化时发 | 对外表示的对应关系只有一处实现 | `src/frames.ts` |
| 流的订阅 | 对一个目标的订阅和它的中止信号；换目标之后丢掉迟到的旧帧 | 「那次调用的流现在怎样」只由模型决定，和日志无关 | 第 2 块，未实现 |

「帧的翻译」里模型的快照、增量、缺口到帧的部分，同样是第 2 块，未实现。

### 全化表与用例的对照

定位与流是两条独立的轴。下面几张表逐格对应提案「会话观察的定位与流」的表，并给出每格的落点和 `tests/observation.spec.ts` 里用例名的前缀。标「不可达」的格不写处理，也不写用例。

定位这条轴。一次定位是串行的一步，另有标记「有新提交待看」。

| 提案 §13 的格 | 落点 | 用例名前缀 |
| --- | --- | --- |
| 建立成功，空闲 | `open` 做第一次定位，反向读 | `opened-idle` |
| 建立成功，进行中 | 不可达 | 不可达，不写 |
| 刷新的间隔到期，空闲 | 等待跑满后定位，只读新条目；发 `refreshing`，计一次尝试 | `interval-idle` |
| 刷新的间隔到期，进行中 | 不可达 | 不可达，不写 |
| 通知有交集，空闲 | 取消正在等的间隔，定位，只读新条目；不发 `refreshing`，不计尝试 | `notice-idle` |
| 通知有交集，进行中 | `Locator.note()` 立标记 | `notice-busy` |
| 通知没有交集，空闲与进行中 | 监听处按种类集合过滤，不理会 | `notice-unrelated` |
| 这次定位有了结果，空闲 | 不可达 | 不可达，不写 |
| 这次定位有了结果，进行中 | 按结果表处理，回到空闲；标记立着就放下并立刻再定位，优先于等间隔 | `notice-busy`（同一条用例覆盖标记与立即再定位，即「不丢唤醒」） |

定位的结果。现行只有「流：没有目标」一列里靠日志能定的格；定位不问模型，见[现行限制](#现行限制)。

| 结果 | 流：没有目标 | 用例名前缀 |
| --- | --- | --- |
| 主调用是新的一次，模型给了流 | 第 2 块，未实现 | 第 2 块，未实现 |
| 主调用是新的一次，模型没给流 | 第 2 块，未实现 | 第 2 块，未实现 |
| 主调用没换，模型给了新的流 | 第 2 块，未实现 | 第 2 块，未实现 |
| 日志里有主调用（临时做法，按没有目标处理） | 四个字段有变化就发 `state`；`phase`、`target` 为 `null` | `result, no target, main call in the log` |
| 没有新内容 | 不发 `state`。间隔引起的发 `refreshing`、计一次尝试；通知引起的不发、不计，按现在这一档重新等 | `result, no target, nothing new` |
| 读日志暂时不可得 | 当作没有新内容 | `result, log not available` |
| 翻页读满还没找到 | 已读到的成立，其余当作没找到 | `result, pages full before finding` |
| 取流超时 | 第 2 块，未实现 | 第 2 块，未实现 |
| 自己的游标不合法 | 丢掉游标，当作没有新内容，下一次从头反向读 | `result, own cursor invalid` |
| 别的不合法 | 结束，原因 `unavailable` | `result, another invalid answer` |
| 读日志被拒 | 结束，原因 `denied` | `result, log read denied` |
| 模型拒绝，或答复引用无效 | 第 2 块，未实现 | 第 2 块，未实现 |

「流：观察中，或等着重新观察」一列整列是第 2 块，未实现。

流这条轴整张表是第 2 块，未实现：定位给出新目标、快照、增量、目标的流结束、订阅中断、模型撤资格、间隔到期、次数用完各格都还没有实现与用例。

另有收场、预算与领域面的用例，不对应提案的格子：`an abort ...` 与 `an observer that stops reading ...`（[中止](#中止)）；`interval-driven locates back off ...`、`maxAttempts ...`、`the accumulated waiting ...`、`an interval below the floor ...`、`without notices ...`（[刷新的预算](#刷新的预算)）；`open: ...`（[领域面](#领域面)）；`a run that started ...`、`a terminal of another run ...`、`reading backward, a run ...`（「一轮在进行」）。

### 定位的读法

- 第一次定位反向读：`begin`，`direction: 'backward'`，`from: null`，最多读 `locatePages` 页，用 `next` 翻页。找到当前这一轮和最近一次主调用就提前停。
- 之后的定位用 `since`，从上次读到的最后一条往后读，不重读整段日志。
- 读的种类是 `call.bound`、`run.started`、`run.terminal` 三种。
- 修订号取页的 `upper`。
- 当前这一轮按会话契约的判法得出：最近一条 `run.started` 之后没有同编号的 `run.terminal`，这一轮就在进行。别的编号的结束不改变它。`run.started` 的编号在载荷的 `run`，`run.terminal` 的编号在 `terminal.run`。
- 主调用用 `readCallRegistration` 读每条 `call.bound`，只认 `kind: 'model'`、`purpose: 'main'`，并且有引用的那一条。

### 定位中各答复怎么处理

| 读日志的答复 | 第一次定位（建立） | 之后的定位 |
| --- | --- | --- |
| `denied` | `open` 答 `denied` | 结束，原因 `denied` |
| 自己的游标不合法（`since` 或 `next` 答 `invalid`） | 不适用 | 丢掉游标，当作没有新内容，下一次从头反向读 |
| 别的不合法（没带游标的 `begin` 答 `invalid`） | `open` 答 `denied`：会话或租户标识不合法与被拒不可区分 | 结束，原因 `unavailable` |
| `unavailable` | `open` 答 `unavailable` | 当作没有新内容 |

游标过期是暂时的事，不按被拒处理，不让观察以 `denied` 结束。

### 刷新的预算

规则与默认初值如下。每个值都是装配传入的配置，默认值不是承诺。

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| `interval` | 第一档间隔，毫秒。底线 `INTERVAL_FLOOR` 是 100 | 1000 |
| `backoff` | 每次间隔到期的定位没有新内容，间隔乘它；上限是 `interval` 的 30 倍 | 1.5 |
| `maxAttempts` | 连续没有新内容的次数上界 | 60 |
| `deadline` | 累计的刷新等待时长上界，毫秒 | 30 分钟 |
| `currentTimeout` | 向模型取当前的流的本地等待上界，毫秒 | 5000（流接入后才用到） |
| `locatePages` | 一次反向读最多翻几页。不在策略对象里，由装配另传 | 4 |

- `interval` 低于底线时钳到底线，并记诊断 `observation.policy-clamped`。
- 次数满 `maxAttempts`，或累计等待满 `deadline`，就在下一次开始等之前结束，原因是 `refresh-exhausted`。标记立着时先定位，不先判耗尽。
- 累计等待只记跑满的间隔；被通知取消的那次等待不计。观察中的时间不计。
- 第一次定位不发 `refreshing`，也不计尝试，之后按第一档开始等。
- 间隔到期引起的定位：先在四个字段有变化时发 `state`，再发 `refreshing`，计一次尝试，进下一档。
- 通知引起的定位：不发 `refreshing`，不计尝试，按现在这一档重新等。
- 预算在取得新目标、或重新观察后收到新的快照或增量时归零。这两件事属于流的订阅，第 2 块，未实现。
- 计时用端口 `wait`，成员的逻辑不直接调 `setTimeout`。

### 通知

- 判断依据是种类集合：固定的三种 `call.bound`、`run.started`、`run.terminal`，加上端口 `historyKinds`。通知里的种类和这个集合没有交集的，不理会。
- `historyKinds` 由装配传入，和读历史用的是同一个来源，这样「读历史给什么」和「什么通知算有新内容」只有一个来源。服务端应用用 `apps/harness-server/src/local/operator-defaults.ts` 的 `LOCAL_HISTORY_KINDS` 填它。提案正文写的「八种」与代码不一致，以代码为准。
- 通知只是叫醒，不是事实的来源。漏掉、重复、合并都不改变结果，漏掉的由按间隔的刷新补上。
- 通知随时立起标记，并取消正在进行的等待。每次定位结束后先看标记；标记立着就放下它并立刻再定位一次。这保证不丢唤醒：一条种类有交集的通知到达之后，总有一次在它之后才开始的定位。
- 薄适配在 `./cordis`：一棵树只挂一个 `session-cordis-contract/committed` 监听者，按租户和会话过滤后分发给各次观察。见 [docs/cordis.md](docs/cordis.md)。

### 现行限制

定位不问模型。日志里有主调用也当作没有目标，`phase` 和 `target` 恒为 `null`，不发 `snapshot`、`delta`、`gap`。端口里的 `streams`、`observer` 和策略里的 `currentTimeout` 已声明，尚未使用。这是第 1 块的临时做法，在第 2 块去掉。

## 所有权、失败与生命周期

| 事项 | 拥有者 | 行为 |
| --- | --- | --- |
| 观察者的主体 | 调用方（`open` 的 `access`） | 原样带到每次读取。会话观察不做授权判断，只转交两头的拒绝 |
| 日志读取、通知订阅、计时 | 一次观察 | 观察收场时全部收掉 |
| 会话事实 | 会话日志 | 会话观察不保存业务状态，不写任何东西 |
| 模型调用 | 模型 | 会话观察不取消、不重发、不要求模型多保留流 |

### 失败

| 情形 | 行为 |
| --- | --- |
| 建立时读被拒、会话不存在、标识不合法 | `open` 答 `denied`，三种逐字段相同 |
| 建立时日志暂时不可得 | `open` 答 `unavailable` |
| 之后读被拒 | 帧序列结束，原因 `denied` |
| 之后读日志暂时不可得、翻页读满 | 当作没有新内容，按刷新的规则继续，不编造帧，不结束 |
| 刷新的预算用完 | 帧序列结束，原因 `refresh-exhausted` |

结果不知道就是不知道：暂时不可得不写成成功，也不写成失败。

### 中止

任何一格遇到中止，都收掉通知的订阅和正在进行的等待，不再发起读取，帧序列结束且不给原因。正在进行的定位的结果在返回后丢掉。观察者不再读帧时（对生成器调 `return`），同样收掉订阅。会话观察不取消模型调用，也不写任何东西。取消、替换、撤销登录、连接断开、协议撤下、帧队列超限，都由观察中枢判断，对会话观察来说只是中止。

### 并发

一次观察内定位串行：同一时刻只有一次读日志在进行。通知回调只做两件事：立标记，唤醒正在等的间隔。

## 组合与验证

消费的承诺：

- 会话契约：读者的日志读取面（`begin`、`next`、`since`）与 `readCallRegistration`，见[稳定调用引用的读取](../session-contract/SPEC.md#稳定调用引用的读取)。
- 模型契约：公共流的两个读取面（`ModelStreamReferences`、`ModelStreamObservation`）。第 2 块才用。
- 会话的 Cordis 契约：事件 `session-cordis-contract/committed` 与会话服务键；模型的 Cordis 契约里两个读取面的服务键。

持续验证：

- 在成员目录跑 `pnpm exec vitest run --mode fast`。用例对着 `SessionObservationPorts` 的假实现，时间用假的 `wait`。
- 形式模型三 `SessionObservation.tla` 与四份 `obs-*.cfg` 在 [packages/access/server-entry/verification/models](../../access/server-entry/verification/models/SessionObservation.tla)。它暂时留在原地，待搬到本包的 `verification/models/`。

对应关系：不丢唤醒由 `notice-busy` 用例与模型三的 `obs-dropWhileBusy` 配置对照。旧目标的帧不出现在新目标之后、不停在旧的调用上，由模型三的 `obs-noDiscard`、`obs-keepOldTarget` 配置检查；对应的代码与用例是第 2 块，未实现。

不能声称的事：

- 模型三检查的是设计的小模型，不是这份代码。代码与模型的对应靠契约测试与精化对照。
- 调用登记比模型调用晚出现的那段时间里，观察者看不到这次调用的流。
- 提交通知跨行送达只在本机一棵树上测过。
