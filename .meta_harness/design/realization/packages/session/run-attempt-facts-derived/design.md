# run-attempt-facts-derived 实现设计

## 实现路径与来源

**自建一个薄插件：读会话日志、折叠、作答，没有自己的存储。**两件事实的权威是会话日志（契约 [S-5](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-5-两件事实) 第 4 条；PF-012「用它不引入日志之外的第二份状态」），主线已裁本版**不另存表**（[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37 ④）——那一裁定不是本节点的选择，本节点只写它怎样兑现。

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| 服务 `sessionLog` 的 `readSince`（`capability.session-log/v1#S-19`） | 验收装配里是 [`session-log-jsonl`](../session-log-jsonl/README.md) | 按水位追读条目壳 |
| `SessionRef`、`RunId`、`AttemptId` | [`core/messages`](../../core/messages/README.md)、[`core/call-accounts`](../../core/call-accounts/README.md) | 输入的表示层校验 |
| `definePlugin` | [`core/kernel-basis`](../../core/kernel-basis/README.md) | 插件骨架与配置校验 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）。
**配置**：`runEndRecognizer`（可选，运行时对象，只有验收装配给）与[策略配置项](#策略配置项) `factsCacheLimit`。**配置错误政策：启动失败**（`definePlugin` 的 Config 校验，basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；`runEndRecognizer` 在 Config 里以 `z.custom` 描述、同引用交到插件体（与 storage-sql 守卫对象同一前提，那边 2026-09-23 已在 4.0.4 取证）。**缺 `runEndRecognizer` 不是配置错误**：产品装配本来就不给。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：折叠与作答以纯函数公开，闭包不依赖 Cordis；插件服务是它的一种消费者。名字全部**候选**，**全部尚未实现**。

| 层 | 导出（候选） | 做什么 | 承诺到哪 |
|---|---|---|---|
| 纯函数 | `emptyAttemptState`、`foldAttemptEntries(state, entries, recognizer?)` | 从条目壳折叠：每个运行已见的最大尝试序号、出现过的 (运行, 尝试)、（给了认法时）已终结的运行 | 折叠**幂等、与次序无关**（取最大、并集）：同一段条目折两遍、两段重叠地折，结果都等于折一遍它们的并 |
| 纯函数 | `answerAttemptFacts(state, run, attempt, recognizerGiven)` | 契约 S-5、S-8：`attemptNotFound`／`unavailable`／`{ superseded, runEnded }` | 只对**给定的那一份**状态作答；那一份是不是「调用开始之后的某一刻的日志」，函数层不承诺 |
| 闭包 | `createRunAttemptFacts({ sessionLog, runEndRecognizer?, cacheLimit })` → `{ attemptFacts }` | 契约 [S-9](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-9-attemptfacts读一次尝试的两件事实)：追读、折叠、作答 | S-5～S-9；前提是交给它的 `sessionLog` 兑现 `capability.session-log` v1 的读（[下文要求](#对会话日志提供者的要求)） |
| Cordis 服务 | 插件 `run-attempt-facts-derived`，服务 `runAttemptFacts` | 以注入的 `sessionLog` 组出闭包 | 再加：据点根一份；`sessionLog` 换代时重跑、缓存随之丢弃 |

**只在运行时层成立、函数层不承诺**：读看得见调用开始之前已提交的日志（S-7 第 2 条，要一次真的 `readSince`）；答案等于从日志算出的答案（S-5 第 4 条，要缓存只属于一份日志）。

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个插件 `run-attempt-facts-derived`（候选名），一条 fiber，必需 inject `sessionLog`。**它 provide 一个服务 `runAttemptFacts`，方法取契约名 `attemptFacts`。插件体造闭包、登记**一个** effect（持有缓存与撤除标记）、`ctx.provide`。

| 持有 | 是什么 | 权威 |
|---|---|---|
| 折叠缓存 | 会话 → { 水位（已折到的日志位置）、每个运行的最大尝试序号、出现过的 (运行, 尝试)、已终结的运行 } | **不是权威**：会话日志才是；随时可丢、从位置 `0` 重折 |
| 撤除标记 | 本实例是否已撤 | 撤除之后到达的调用答 `unavailable` |

**`attemptFacts(session, run, attempt)` 的一次**：表示层校验 → 取这个会话的缓存（没有就从水位 `0` 起）→ `sessionLog.readSince(session, 水位)` → 读回的 `tail` 小于水位 ⇒ 这份缓存不属于这本日志：丢掉、从 `0` 再读一次、记 error 日志 → 折叠新条目、水位取 `max(水位, tail)` → 同步作答：

1. 这个 (运行, 尝试) 没出现过 ⇒ `attemptNotFound`；
2. 没给认法 ⇒ `unavailable`（认不出终结记录，契约 [G-3](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#十已知缺口)）；
3. 否则 `superseded` = 该运行已见的最大序号 > `attempt`，`runEnded` = 该运行在已终结集合里。

### 关键选择

**一、按水位追读的折叠缓存（选），不每次从头读整本日志。**

| | 每次调用 `readSince(session, 0)`，从头折叠，不留状态 | **每个会话留一份折叠态与水位，每次只追读水位之后的（选）** |
|---|---|---|
| 落选方的最强论证 | 没有任何缓存可错；最小 | —— |
| 本方弱点 | —— | 多一份进程内状态与它的上界（`factsCacheLimit`）；水位要只属于一份日志（第四条） |
| 为什么选它 | 执行宿主**每一条收场路径**都在落账前调一次（执行宿主节点 T-4）：一个会话里调用 n 次、每次读全本，读量随会话寿命平方增长，而会话日志的每一行都带着载荷——「超长期待机」直接撞上它 | **缓存是精确的，不是近似**：两件事实只从假变真（契约 [S-6](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-6-只从假变真)），折叠取最大与并集、幂等且与次序无关，所以「折过的前缀 ∪ 追读的一段」恰等于从头折到新 `tail`；每次调用仍真读一次日志，S-7 第 2 条不打折扣 |
| 置信度 | | 中高：代价论证是结构性的（平方），不是测出来的 |

**同一会话的两次并发调用不需要排队**：各读各的一段、各自折进同一份状态——折叠幂等，重叠折两遍不改结果；水位取最大，不会倒退。作答在折叠之后同步完成，状态那一刻等于「日志到某个 `tail` 为止的全部」，这个 `tail` 不早于本次调用自己读到的那个——**两件事实出自同一刻、那一刻不早于调用开始**（契约 [S-7](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-7-读的是哪一刻) 第 1、2 条）。

**二、「已终结」的认法作为配置交进来，只有验收装配给（选）。**契约 G-3：终结记录的形状归 loop 那一程；契约第十一节：验收装配里「由代 loop 写终结的那一方同时给出它」。

| | 另立一个只在验收装配装的种子插件，provide 一个「运行已终结」的写读面，本插件调用时现取 | 种子是一个由测试持有的对象，本插件读完日志之后再问它 | **配置 `runEndRecognizer`：一个「这条已提交条目是不是某个运行的终结记录、是哪个运行」的判别函数，由代 loop 写终结的测试驱动给出，本插件在折叠时把它施加到每条条目上（选）** |
|---|---|---|---|
| 落选方的最强论证 | 种子也走 Cordis 装配，与验收装配其余替身同形 | 最直白：测试说哪个运行结束了就是哪个 | —— |
| 本方弱点 | —— | —— | 认法是测试驱动自定的记录形状——那一形状只在验收里存在；G-3 闭合时，认法改由契约定的形状内建，这个配置项随新版本删去（AFD-4） |
| 为什么选它 | 两件事实分出两个来源：「已被取代」出自日志的一刻、「已终结」出自种子的另一刻——**违反 S-7 第 1 条「两件事实出自同一刻」**；写读面在 `ctx.get` 下整棵树可见 | 同左：两个来源、两个时刻；种子说「已终结」而日志里没有终结记录时，**违反 S-5 第 4 条「答案必须等于按日志算出的答案」** | 两件事实都从**同一次读、同一份折叠**出来；「已终结」仍按契约的定义——「日志里已有这个运行的终结记录」——判，测试只提供「怎样认出那条记录」这一个 G-3 留空的知识 |
| 置信度 | | | 中高 |

**三、必需 inject `sessionLog`（选），不作可选依赖。**

| | 调用时 `resolveOptional` 现取 `sessionLog` | **必需 inject（选）** |
|---|---|---|
| 落选方的最强论证 | 服务总在，日志缺席时答 `unavailable`，与执行宿主「调用时取用」的口径一致 | —— |
| 本方弱点 | —— | `sessionLog` 换代时本插件重跑 |
| 为什么选它 | **缓存会跨两份日志**：日志提供者换了（例如换了一个日志根），本插件不重跑，旧水位原样用在新日志上——新日志若更长，`tail < 水位` 这一道拦不住，答出的就是按两本日志拼起来的事实 | 日志提供者一换代，本插件重跑、缓存丢弃（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）——**缓存只属于一代日志**，这是 S-5 第 4 条在缓存下成立的前提；没有日志本来一件事实也答不出，「没有它我不跑」是如实的（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)） |
| 置信度 | | 高 |

### 契约责任到插件、服务与操作

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-5-两件事实) 两件事实 | 折叠：最大尝试序号 → `superseded`；(运行, 尝试) 集合 → 在不在日志里；认法命中 → 已终结 | 尚未建包 | 第 1 条与会话日志栅栏同一条件：都是「同一运行有更大序号的已提交条目」——本节点读的就是栅栏判的那些行；第 4 条靠缓存只属于一代日志（关键选择三） |
| [S-6](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-6-只从假变真) 只从假变真 | 折叠只取最大与并集，从不删 | 尚未建包 | 前提：会话日志只增不改（`capability.session-log/v1#S-11`） |
| [S-7](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-7-读的是哪一刻) 读的是哪一刻 | 每次调用真读一次 `readSince`；作答在折叠后同步完成 | 尚未建包 | 见关键选择一末段 |
| [S-8](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-8-缺席时的默认答案与失败值) 缺席默认 | `attemptNotFound` 先于「认不出终结」判；两件事实一起答或一起不答 | 尚未建包 | 没给认法时**不**只答 `superseded`：整次 `unavailable` |
| [S-9](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-9-attemptfacts读一次尝试的两件事实) `attemptFacts` | 上文「一次」的五步 | 尚未建包 | 次序 `invalidInput` → `attemptNotFound`；读不到或认不出 ⇒ `unavailable` |
| [S-10](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-10-本版不发事件) 不发事件 | 不 `emit`、不监听 | —— | —— |
| [S-11](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-11-装配给的保证-vs-协议须给的保证) 装配给 vs 协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |
| [S-12](../../../../spec/capabilities/run-attempt-facts/v1/contract.md#s-12-提供者撤除换代与重启) 撤除、换代、重启 | 没有自己的事实；缓存随实例消失 | —— | 重启后第一次调用从 `0` 重折 |

**与调用方的写之间的共同存储对象：没有**（契约 G-2）。执行宿主在写事务之前现读两件事实、再在自己的事务里落账（存储协议 P-13 禁止在写事务里调别的服务），读到「仍是当前」之后、它提交之前，一条更大序号的尝试开始可以落进日志——两个写入者（loop 写日志、执行宿主写执行记录）在本节点这里**没有共同的行或约束**，本节点也造不出一个：日志与执行记录分属 JSONL 与 SQL（据点装配关键选择 3）。这一窗口**只会漏标 `late`、不会误标**（S-6 第 4 条），闭合条件在契约 G-2 与执行宿主 T-4——本节点如实登为 AFD-2，**不以时间谓词或进程内锁顶替**。

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `capability.session-log/v1` [S-19](../../../../spec/capabilities/session-log/v1/contract.md#s-19-readsince从某个位置往后读) `readSince`（服务键 `sessionLog`） | **必需 inject**；验收装配里是 `session-log-jsonl` | 提供者换代 ⇒ 重跑、缓存丢弃（关键选择三） | 缺席 ⇒ `PENDING`，服务不出现；执行宿主按「读面缺席」收成 `dependencyUnavailable{runAttemptFacts}`（契约 S-12） |
| 认法 `runEndRecognizer` | 配置；**只有验收装配给** | 启动时定下 | 缺席 ⇒ 读得到这次尝试的调用一律 `unavailable`；认法抛出 ⇒ 缺陷，原样上抛 |

**消费者**：执行宿主（每条收场路径在写事务之前调一次，调用时现取，不 inject——本插件换代不连带它重跑）。

### 对会话日志提供者的要求

本节点**不建表**；它的全部读要求落在会话日志提供者上。同批节点 [`session-log-jsonl`](../session-log-jsonl/design.md#契约责任到插件服务与操作) 逐条接住，**两边互指**：

| # | 要求 | 对应条款（本契约） | 会话日志契约兑现条款 |
|---|---|---|---|
| FR-1 | `readSince` 交回位置大于水位、不大于读那一刻尾的**全部**条目，按位置升序、不跳号 | S-5（从日志算） | `capability.session-log/v1#S-19` ⑤ |
| FR-2 | 读那一刻的尾不早于调用开始之前已成功返回的任何一次追加 | S-7 第 2 条 | `#S-13` 第 4 条 |
| FR-3 | 条目壳原样带写入方给的 `run` 与 `attempt` | S-5 第 1、3 条 | `#S-6` |
| FR-4 | 读不到即 `unavailable`，不交空序列、不交半段 | S-8 | `#S-19` ⑧ |
| FR-5 | 位置单调、不回收不复用；`after` 大于尾时如实交回 `tail` | 缓存的水位 | `#S-7`、`#S-19` ⑤ |

## 策略配置项

默认值只是配置层的初值（候选名 `defaultRunAttemptFactsPolicy`），装配可覆盖；越界 ⇒ 启动失败。

| 配置项（候选名） | 管什么 | 初值 | 合法范围 | 为什么是配置 |
|---|---|---|---|---|
| `factsCacheLimit` | 缓存的会话个数上限；超出时丢掉最久未用的那份（下次从 `0` 重折） | 128 | 整数 ≥ 1 | 长期待机下会话只增不减；上限随内存变。**初值没有测量依据**（AFD-6） |

## 状态、并发与失败映射

**写权**：本节点不写任何东西。缓存只由本实例的调用在读回之后前进。**并发**：见关键选择一末段——不排队，折叠幂等。

| 情形 | 映射 |
|---|---|
| 任一参数缺席或不合形状（`attempt` 不是 ≥ 1 的整数） | `invalidInput`，不读日志 |
| `sessionLog.readSince` 答 `unavailable` | `unavailable`，缓存不动 |
| `sessionLog.readSince` 答 `invalidInput` 或抛出 | 本节点交错了参数，或日志提供者的缺陷：原样上抛、error 日志 |
| 读回 `tail` 小于水位 | 丢缓存、从 `0` 再读一次、error 日志；第二次仍读不到 ⇒ `unavailable` |
| 这个 (运行, 尝试) 不在日志里 | `attemptNotFound` |
| 没给认法 | `unavailable` |
| 认法抛出、折叠抛出 | 缺陷：原样上抛、error 日志——**不折成 `unavailable`**，也**绝不以 `false` 顶替** |
| 本实例已撤 | `unavailable` |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| 配置校验 | `definePlugin` 在插件体之前 | 失败 ⇒ `FAILED`、不 provide | —— |
| 缓存与撤除标记（一个 `ctx.effect`） | 本 fiber；空缓存起步 | —— | 置撤除标记、清空缓存。**在途的调用跑完**（内核不取消在途调用），按它自己读到的那一份作答。**保留**：无——本节点没有自己的事实 |
| `ctx.provide('runAttemptFacts')` | 本 fiber；`sessionLog` 在时插件体运行、立即可解析 | 抛出 ⇒ 随 fiber 撤（`provide` 经 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**） | 服务消失 |

**`sessionLog` 换代时收掉什么**：缓存（这正是要的，关键选择三）；在途调用握着旧的日志服务对象，旧日志提供者关准入后答 `unavailable`，本节点照答 `unavailable`。

## 装配给与协议给：本节点单机怎样兑现左列

照契约 S-11 逐行；右列本节点一条都不兑现。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 读看得见调用开始之前已提交的日志 | 每次调用真读一次 `readSince`；日志提供者与本节点在同一进程 | 本节点 ＋ 会话日志提供者（FR-2）＋ **装配**（同一进程） |
| 答案等于从日志算出的答案 | 不另存；缓存是日志前缀的精确折叠，只属于一代日志 | 本节点 |
| 调用方身份已核实 | 进程内能力间面 | **装配**：不把本服务接到任何入口 |

**归装配的事项**（点名给 `apps/cli`）：**认法 `runEndRecognizer` 只在验收装配给**，由代 loop 写终结记录的测试驱动提供（它写什么形状，就给认那个形状的判别函数）；产品装配不给——结构检查守住（[verification](verification.md#证据义务) V-8）；只装一份、装在根上；不暴露成入口。

## 实施缺口与消费者影响

契约第十节的缺口不重抄；下表是**本节点自己的**缺口，编号 AFD-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| AFD-1 | **产品装配里「已终结」认不出**（契约 G-3）：凡读得到这次尝试的调用一律 `unavailable` | 执行宿主落账的 `late`：它凡要落账的收场都写不下去（执行宿主 T-4、契约 G-18；执行宿主契约 R-42 已报主线） | loop 那一程（终结记录的形状） | 终结记录有形状或约定的读取键；本节点内建认法、删去配置项（出新修订） |
| AFD-2 | **与执行宿主落账没有共同存储对象**（契约 G-2）：漏标 `late` 的窗口本节点闭合不了 | `data.call-accounts/v1#S-39` 的「落下时」 | 主线 ＋ 会话日志与 loop 那一程（与执行宿主契约 G-18 同一闭合条件） | 落账与两件事实的写入有一个共同存储对象；本节点随新版契约改或被取代 |
| AFD-3 | **真承接者未到**（契约 G-1，据点装配 C-16） | 同上 | 主线 → 会话日志与 loop 那一程 | 那一程的契约收下或取代 RAF v1 |
| AFD-4 | **验收里的认法是测试自定的形状**：它只证「给了正确认法时本节点答得对」，不证产品里的终结记录认得出 | 契约场景 S-15 在验收里的证据力 | 本节点 ＋ loop 那一程 | 随 AFD-1 闭合 |
| AFD-5 | **只要壳却读回载荷**：会话日志 v1 没有只读条目壳的读，追读时载荷一起读回 | 大载荷会话的追读代价（缓存已把它降为每条只读一次） | 会话日志与 loop 那一程（SL G-1） | 那一程给只读壳的读，或本节点改用约定的读取键 |
| AFD-6 | `factsCacheLimit` 初值没有测量依据 | —— | 实现者 | 有测量再调 |
| AFD-7 | **产品据点清单本版不装本节点**（据点装配关键选择 5） | —— | 主线 | 据点装配的改选条件成立 |

**报给主线**（不在本节点改）：执行宿主（T-4、依赖表 `runAttemptFacts` 一行）与据点装配（验收装配表「尝试与运行的事实」一行、A-24、C-16）改指本节点；验收装配表那一行现写「『已终结』以测试种子答」，本节点的做法是「代 loop 写终结的测试驱动给出认法、答案仍从日志算」（关键选择二），措辞请随之改。
