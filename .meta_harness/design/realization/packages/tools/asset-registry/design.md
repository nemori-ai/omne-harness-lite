# asset-registry 实现设计

## 实现路径与来源

**自建一个 Cordis 插件，没有可复用的上游对象**：会话资产注册表的快照、换表规则、可用性与报告是本项目的产品语义（PF-002、PF-006），DSH 没有对应物。

**复用的都是本仓库的节点或纯模块**，依赖方向单向：

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| 求值 `evaluate(EvaluationInput) → EffectiveAssembly`（纯计算；失败集合 `invalidInput`、`compositionCycle{cycle}`、`categoryUnsupported{category}`，M32、M45） | [`core/asset-evaluation`](../../core/asset-evaluation/README.md)（D-039 assets 候选 B：进 `core` 作纯模块） | `reload` 一次、`refreshAvailability` 两次、读时的「谁可以用」现读——**本节点只调用、不重算**（契约 S-16）；两个判定类失败原样转交 |
| 资产形状、能力标识、版本线 | [`core/asset-model`](../../core/asset-model/README.md) | 条目的 `capability`／`asset`／`content`、类别取值 |
| 工具定义形状、`ModelToolName`、由定义得出的依赖声明 | [`core/tool-definition`](../../core/tool-definition/README.md) | `tool` 表的查找键、名字冲突、依赖解析 |
| 技能包、斜杠命令、拓展件、MCP 接入点的形状与依赖声明 | [`core/skill-package`](../../core/skill-package/README.md)、[`core/slash-command`](../../core/slash-command/README.md)、[`core/loop-extension`](../../core/loop-extension/README.md)、[`core/mcp-endpoint`](../../core/mcp-endpoint/README.md)（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：一契约一包） | 依赖解析与门控 |
| 运行与尝试标识 `RunId`、`AttemptId` | [`core/call-accounts`](../../core/call-accounts/README.md) | 报告带的运行与尝试（M46） |
| 时间源 `clock`（`now(): Instant \| 'unavailable'`，毫秒整数，不后退） | [`infra/clock`](../../infra/clock/README.md)（形状归 [`core/offer-expiry`](../../core/offer-expiry/README.md)） | `filledAt`、报告的 `computedAt` |
| `definePlugin`、`resolveOptional` | [`core/kernel-basis`](../../core/kernel-basis/README.md) | 插件骨架、可选依赖的现取 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）。机制语义引 [basis](../../../../basis/README.md) 条目。
**配置**：本插件**没有 config**。配置错误政策（启动失败）因此不产生本节点的条目。

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个插件 `asset-registry`（候选名），一条 fiber。必需 inject：装配清单（候选服务名 `assemblyManifest`）与 `clock`。不 inject `storage`。**
它 provide 一个服务（候选名 `assetRegistry`），方法与契约第四节的七个操作一一对应（名字取契约：`fill`、`reload`、`refreshAvailability`、`lookup`、`list`、`markFailed`、`onAssetChange`）。**全部尚未实现**。

插件体 provide 服务、登记**一个** effect，它持有进程内的全部状态：

| 持有 | 是什么 | 权威 |
|---|---|---|
| 会话缓存 | 会话 → { 它所依的装配清单头（候选：记录序号）、六份当前快照、**每类上一份被顶替的快照**（按 (类别, `filledAt`) 指认）、每条条目「最近一次算出的」可用性 } | **不是权威**：装配清单才是（契约 S-18）；缓存随时可丢、可按清单重建（S-33）。被顶替的快照另见[关键选择四](#关键选择) |
| 换表队列 | 会话 → 一条进程内的先后队列 | **不是正确性机制**，只免去同进程里并发换表的无谓冲突；正确性靠装配清单的条件追加（[关键选择三](#关键选择)） |
| 撤除标记 | 本实例是否已撤 | 撤除之后到达的调用答 `unavailable` |

**不持有**：可用性报告（它是交给调用方的一个值，契约 S-11 ②：不持久、不重放）、任何存储表。

### 关键选择

**一、必需 inject 装配清单（选），不作可选依赖。**

| | 装配清单作可选依赖：服务总在，清单缺席时每个操作答 `unavailable` | **必需 inject：清单不在，本插件 `PENDING`、服务不出现（选）** |
|---|---|---|
| 落选方的最强论证 | 消费者拿到的是契约里的具名值 `unavailable`，而不是「服务不在」；本批装配清单没有提供者，可选依赖让注册表至少「在」 | —— |
| 本方弱点 | —— | 本批装配清单没有提供者（契约 G-1），**本插件整批 `PENDING`**；消费者只能按「注册表缺席」收场 |
| 为什么选它 | 装配清单是本节点的**唯一权威与唯一提交点**（S-17 ③、S-18）：没有它，七个操作没有一个答得出实质内容（`lookup` 要「这个会话有表或能重建」，重建只能按清单）。「没有它我不跑」是如实的（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）；清单提供者换代时插件重跑、缓存丢弃，正是要的——缓存的「头」若对着新提供者碰巧同值，可选依赖下会把旧缓存误认成新的 | 已知消费者对两种形态收场相同：执行运行时把注册表缺席与答 `unavailable` 都收成 `dependencyUnavailable{registry}`（`capability.tool-execution-runtime/v1#S-47`） |
| 置信度 | 中高 | |

**二、每个操作先读装配清单头，与缓存不符就重建（选）。**

| | 只信缓存，写时才以条件追加校验 | 不缓存：每个操作都从装配清单重读 | **缓存 ＋ 每个操作先读一次清单头（选）** |
|---|---|---|---|
| 落选方的最强论证 | 读零存储往返；单进程、单实例时缓存本来就与清单一致 | 零陈旧，最简单 | —— |
| 本方弱点 | —— | —— | 每次 `lookup` 多一次读（取头）；清单提供者要给一个便宜的「取头」 |
| 为什么选它 | **不成立**：内核不取消在途调用。本插件因提供者换代重跑时，旧实例手上那次 `reload` 照样跑完、照样追加进清单；新实例已按清单建好缓存，**旧的那次追加落在它之后**——只信缓存，新实例在下一次写之前一直读旧表，而旧调用方已经拿到「成功」返回，违反契约 S-17 ③「记下、操作返回之后，下一次读就是新的」 | 重建要取回每条条目那一版的正文（S-33 ②），每次读都做一遍，代价与条目数成正比 | 头一读就对齐：多一次便宜的读，换 S-17 ③ 在实例交替时也成立 |
| 置信度 | 高 | | |

**三、同一会话换表的串行：装配清单的条件追加（选）。**

| | 在注册表自己的存储里取会话哨兵，锁下换表 | 进程内每会话一把锁 | **向装配清单做「期望头 = 我读到的那个」的条件追加；冲突则按清单重建、重做一次（选）** |
|---|---|---|---|
| 落选方的最强论证 | 与执行运行时同一个形状，锁在存储里，跨实例排序 | 最快、最简单 | —— |
| 本方弱点 | —— | —— | 冲突要重做一次（含重新求值）；第二次仍冲突答 `unavailable`（本节点推导，契约 S-17 未给重试上限） |
| 为什么选它 | 提交点是**清单**的追加（S-17 ③），不是注册表自己的表；存储协议 P-13 禁止在一个写事务里调用别的插件的服务——注册表的锁与清单的追加不可能在同一个事务里，锁排出的次序与清单里的次序没有共同对象 | **不算数**：锁随插件实例生灭，旧实例在途的换表与新实例互不相知 | 两个写入者（同一实例的两次并发、旧实例与新实例）**共同触碰的存储对象是清单里 (会话, 序号) 的唯一约束**：后到的那一次撞约束、不留痕（R-M1） |
| 置信度 | 高 | | |

进程内的换表队列只把同一实例里的并发排成先后，免得它们互相撞条件追加；**它不承担正确性**——把它拿掉，结果仍对，只是多几次重做。

**反证两条交错**（条件追加）：

- **同一实例里两次 `reload(skill)` 并发**：队列让第二次在第一次返回之后才读头；即便队列失效，第二次读到的头与第一次相同，第一次先追加成功、第二次撞 (会话, 序号) ⇒ 重建、重做 ⇒ 基于第一次的结果再追加。清单里两条、先后分明；没有哪一次被「盖掉」（S-17 ①）。
- **旧实例在途的 `markFailed` 与新实例的 `reload(slash_command)`**：两者读到同一个头；先追加的成立，后追加的撞约束——若旧实例后到，它重建、重做（去掉那条命令）再追加；若新实例后到，它重建（读到 `markFailed` 的结果）、重做 `reload`（按此刻求值重填，那条命令若服务没回来仍不在）。两种次序下清单都是一条接一条，任一类的当前快照都能从这一类最后一条记录读出（S-18 ①）。

**反证不了、要真并发演练的**：两个实例同时对同一会话 `fill` 与 `reload(plugin)`（多表一次，S-17 ②）——见 [verification](verification.md#证据义务) N-2。

**四、报告所依的被顶替快照：装配清单是它的留存处，内存只留上一份（选）。**[D-040 §八 M35](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 让 `within = run{report}` 的读只在报告所依的快照里找，由此带来「有报告依它就不得回收」的留存义务（N-21，交提供者设计承接）。

| | 按报告计数：每发出一份报告就给它所依的快照加一，报告不再用了减一 | 被顶替的快照在内存里一直留到会话的缓存被丢 | **装配清单里那条换表记录就是这份快照的留存；内存只留每类上一份被顶替的，更早的按清单记录现建（选）** |
|---|---|---|---|
| 落选方的最强论证 | 精确：留得恰好够 | 最简单，读永不落空 | —— |
| 本方弱点 | —— | —— | 读更早的被顶替快照要按那条记录取回各条目那一版的正文（慢）；**工作区提供的资产**目录已改就取不回原样，那一次读答 `unavailable`（契约 S-25 ⑧ 已写明这一支） |
| 为什么选它 | **做不到**：报告是交给调用方的值（S-11 ②），本节点不知道它什么时候不再被用——没有「减一」的时刻 | 长期待机的会话每 reload 一次多一份快照，内存随会话寿命无界增长 | 契约 S-18 ① 已要求每条换表记录带齐那几张表的完整构成——**留存是现成的**，只要清单在会话存续期不删这些记录（R-M9）；「一次尝试进行中来了一次 reload」是常见情形，内存里的上一份就接住了，不必现建 |
| 置信度 | 中高；「只留上一份」没有测量依据，是最小的起点（缺口 A-8） | | |

### 契约责任到插件、服务与操作

契约的九件事本表不复述，只写兑现点与缺口。**每个换表操作恰一次装配清单追加，追加在任何其他调用（求值输入、桥、自报）之后**；方法名取契约，其余名字标候选；全部**尚未实现**。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/asset-registry/v1/contract.md#s-5-八类里登记六张表)～[S-7](../../../../spec/capabilities/asset-registry/v1/contract.md#s-7-注册表条目) 六张表、快照、条目 | 会话缓存里六份快照，每份不可变；换表 = 换引用 | 尚未建包 | `connector`／`agent_definition` 在任何求值与读之前答 `categoryNotRegistered`；`tool` 表按 `ModelToolName`（由定义名正向推出，`core/tool-definition`）建索引，撞名即 `toolNameConflict` |
| [S-6](../../../../spec/capabilities/asset-registry/v1/contract.md#s-6-注册表快照) `filledAt` 同一 (会话, 类别) 严格递增 | 取 `max(clock.now(), 上一份的 filledAt + 1 毫秒)`（本节点推导：`clock` 只保证不后退，不保证两次不同值） | 尚未建包 | `clock` 答 `'unavailable'` ⇒ 这次换表 `unavailable` |
| [S-8](../../../../spec/capabilities/asset-registry/v1/contract.md#s-8-当下可用性的三个取值)～[S-10](../../../../spec/capabilities/asset-registry/v1/contract.md#s-10-替换件同形只换说明) 可用性、按命令可用性、替换件 | 一个纯函数：(条目, 依赖声明, 各项自报的读数, 有效运行模式) → `availability`／`commandAvailability`；先工具后技能 | 尚未建包 | 每一项的自报经各自读面现取，**本批一个都没有**（契约 G-6）：凡声明了外部服务、设施、存储或模态项的条目一律 `stand_in`／`unavailable`，原因写「读不到」。有效运行模式读不到（G-9）⇒ `request_approval` 关。模态转换登记经 `capability.modality-projection` 的 `lookupConverter` 现取 |
| [S-11](../../../../spec/capabilities/asset-registry/v1/contract.md#s-11-一次执行尝试的可用性报告) 报告 | `refreshAvailability` 的返回值，带会话、`runId`、调用方交来的 `attempt`（M46）与所依各类快照的 (类别, `filledAt`)；**本节点不留副本** | 尚未建包 | 调用方把同一份交给 runner 与执行运行时的 `submit`（M33；原缺口 A-7 闭合）；meta 门清单无家（G-7）⇒ 本节点不把任何条目当 meta 门，`effectivePermissions` 全取求值 |
| [S-12](../../../../spec/capabilities/asset-registry/v1/contract.md#s-12-mcp-动作条目在一次尝试内钉住) MCP 动作条目 | `refreshAvailability` 第 4 步：对 `mcp` 表每个接入点现取 MCP 桥（候选服务名 `mcpBridge`）调 `refreshActions`、`projectActions`；桥缺席 ⇒ 按「没有结论」那一行；桥标了「只能以替换件出现」的条目按桥给的原因 `stand_in{for}`——**含 `schema_unsupported`**（M37：远端参数 schema 形状合法、只是这个实现编不出来，`stand_in{for: schema_unsupported}`） | 尚未建包 | 各接入点**依次**调（本版不并发；接入点多了再议，没有测量不引入） |
| [S-13](../../../../spec/capabilities/asset-registry/v1/contract.md#s-13-evaluationref) `EvaluationRef` | `fill` 用装配交来的那个作记录的键；`reload` 的由清单在追加时给出（R-M3） | 尚未建包 | 本节点不解析、不铸 |
| [S-14](../../../../spec/capabilities/asset-registry/v1/contract.md#s-14-会话斜杠命令集是-slash_command-那张表的视图) 会话斜杠命令集 | `list(slash_command, session)` 的结果 | 尚未建包 | 「命令名 ＋ 正文」一对，正文取条目那一版的 `SlashCommandDefinition` |
| [S-15](../../../../spec/capabilities/asset-registry/v1/contract.md#s-15-快照只在这几个时刻换)、[S-17](../../../../spec/capabilities/asset-registry/v1/contract.md#s-17-换表同一会话串行多表一次成败同一) 换表时刻、串行、多表一次 | 只有 `fill`／`reload`／`markFailed`／`onAssetChange` 产生新快照；一次操作的全部目标表写进**一条**清单记录；条件追加成功之后才替换缓存 | 尚未建包 | 串行见[关键选择三](#关键选择)；追加失败 ⇒ 缓存不动（S-17 ④） |
| [S-16](../../../../spec/capabilities/asset-registry/v1/contract.md#s-16-会话资产注册表不求值只消费求值结果) 不求值，只消费 | 求值 import `core/asset-evaluation`；**求值的输入**经据点读面（候选服务名 `evaluationInputs`）现取 | 尚未建包；据点读面**没有 provider 节点**（缺口 A-2） | 本节点只判契约列的四件事；读面缺席 ⇒ 要求值的操作 `unavailable` |
| [S-18](../../../../spec/capabilities/asset-registry/v1/contract.md#s-18-快照不持久装配清单是唯一权威) 清单是唯一权威 | 每次换表追加一条记录，带齐被换每张表的完整构成、`filledBy`、`basedOn`、`filledAt`；本节点**不建表** | 尚未建包；清单**没有提供者**（契约 G-1） | 对清单提供者的要求见[下节](#对装配清单提供者的要求清单) |
| [S-19](../../../../spec/capabilities/asset-registry/v1/contract.md#s-19-缺席时的默认答案) 缺席默认 | 表示层校验在一切判定之前；每个外部读失败逐一映射 | 尚未建包 | 见[失败映射](#状态并发与失败映射) |
| [S-20](../../../../spec/capabilities/asset-registry/v1/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 「谁可以用」门控 | 进表照求值；`slash_command` 每次读现求一次值、看该持有是否以 `not_usable` 被滤掉；`skill` 按 `within` 分：`session` 现读、`run` 按报告钉住的那一份 | 尚未建包 | 读时现读的结果**不跨调用缓存**（S-25 ⑦）；**每次读现求值**，代价随命令数与读频率——没有测量之前不加缓存，要加时按 `data.identity-values/v1#S-27` 写明失效条件与最大陈旧窗口 |
| [S-22](../../../../spec/capabilities/asset-registry/v1/contract.md#s-22-fill装配时填六张) `fill` | 表示层 → 读清单头与「这个 `EvaluationRef` 的记录在不在」→ 建六份快照（正文经据点读面按 (资产, 版本) 取）→ 算一次可用性 → 条件追加一条以该 `EvaluationRef` 为键的记录 | 尚未建包 | ⑦ 重试（M34）：追加撞 `EvaluationRef` 唯一 ⇒ 读回那条；**六份当前快照都是 `filledBy = assembly` 且 `basedOn` 是它** ⇒ 原样返回、不再追加；**任一份不是**（此后有过 `reload`、`markFailed`、`onAssetChange` 或另一次装配）⇒ `invalidInput{evaluationSuperseded}`、表不换、不追加（判据取最严，N-21）。原缺口 A-5 闭合。求值以 `compositionCycle`／`categoryUnsupported` 失败时没有结果可交，`fill` 不会被调到 |
| [S-23](../../../../spec/capabilities/asset-registry/v1/contract.md#s-23-reload按类别重填) `reload` | 读头 → 现取求值输入（含工作区承载目录此刻的内容）→ 求值 → 建目标表（`plugin` 连带成员各类）→ 条件追加一条 → 由清单给出新的 `EvaluationRef` | 尚未建包 | 不去重（⑦）；工作区读不到 ⇒ `unavailable`、表不换；求值以 `compositionCycle{cycle}`、`categoryUnsupported{category}` 失败 ⇒ **原样转交**（结论，不收成 `unavailable`；M32、M45、N-21），表不换、不追加 |
| [S-24](../../../../spec/capabilities/asset-registry/v1/contract.md#s-24-refreshavailability每次执行尝试开始时现算) `refreshAvailability` | 按契约 ④ 的六步；**不写清单、不换快照**；把算出的可用性记作会话缓存里「最近一次算出的」；`attempt` 必填、原样写进报告（M46，本节点不铸、不推） | 尚未建包 | 两次求值都经据点读面取此刻的持有与配值；第二次只在钉住了动作集时另求；第一次求值以 `compositionCycle`／`categoryUnsupported` 失败 ⇒ 原样转交、不交报告、**桥不被调到** |
| [S-25](../../../../spec/capabilities/asset-registry/v1/contract.md#s-25-lookup查一条)、[S-26](../../../../spec/capabilities/asset-registry/v1/contract.md#s-26-list列一类) `lookup`／`list` | 读头 → 选快照：`within = session` ⇒ 当前那一份；`within = run{report}` ⇒ **报告所依的那一份**（M35）——当前的、内存里上一份被顶替的、或按装配清单那条记录现建（[关键选择四](#关键选择)）→ 在那一份里找；`within = run` 时并入报告钉住的动作条目 | 尚未建包 | reload 之后的新条目对仍在跑的那一次尝试是「没有」、下一次尝试起可见（M35，原缺口 A-6 闭合）。报告所依的那一份此刻取不回（工作区资产的原样正文已不在）⇒ `unavailable`，**不改读当前那一份**（S-25 ⑧） |
| [S-27](../../../../spec/capabilities/asset-registry/v1/contract.md#s-27-markfailed命令型服务报错之后去掉那一条) `markFailed` | 读头 → 去掉那一条 → 条件追加 | 尚未建包 | 不求值；幂等：已不在 ⇒ 原样返回、不追加 |
| [S-28](../../../../spec/capabilities/asset-registry/v1/contract.md#s-28-onassetchange权限收回之后收窄) `onAssetChange` | 对 `slash_command` 每条现求值判门控，有要去的 ⇒ 条件追加 | 尚未建包 | **本批没有调用方**：资产治理的通知发在治理中心进程里，据点上没有转发者（缺口 A-3）；正确性不依赖它（读时现读），但「再授予要等 reload」本批一直不成立 |
| [S-29](../../../../spec/capabilities/asset-registry/v1/contract.md#s-29-本版不发本契约自己的事件)、[S-30](../../../../spec/capabilities/asset-registry/v1/contract.md#s-30-可用性变化不出提醒) 不发事件、不出提醒 | 不 `emit`，不监听 | —— | 见[事件与过滤器](#事件与过滤器) |
| [S-31](../../../../spec/capabilities/asset-registry/v1/contract.md#s-31-装配给的保证-vs-协议须给的保证) 装配给 vs 协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |
| [S-32](../../../../spec/capabilities/asset-registry/v1/contract.md#s-32-依赖的提供者不可用) 依赖不可用 | 失败映射表 | 尚未建包 | —— |
| [S-33](../../../../spec/capabilities/asset-registry/v1/contract.md#s-33-本能力重启与重建) 重启与重建 | 会话缓存缺这个会话、或头对不上 ⇒ 读每一类最后一条换表记录、按记下的版本取回正文、算一次可用性 | 尚未建包 | 取不回原样正文（工作区资产、目录已改）⇒ 那一类不重建、读答 `unavailable`；「取不回」要据点读面分得开「没有这一版」与「读不到」（A-2） |
| [S-34](../../../../spec/capabilities/asset-registry/v1/contract.md#s-34-进行中的运行与撤销) 进行中的运行 | 不发任何停止、中断、取消信号 | —— | 一次读在哪一份快照里找已由 M35 定下（原 G-2 闭合）；换表不改写正在跑的尝试已拿到的构成 |

### 事件与过滤器

**本插件不发、不听任何 Cordis 事件**（契约 S-29、S-30）。

| 通道 | 为什么不用事件 |
|---|---|
| 资产变化 → `onAssetChange` | 契约把调用方定为「把资产治理的通知转到据点上的那一方」（装配给）。本插件若自己监听资产治理的 `emit`，会听到**同一进程里所有租户**的变化，还要自己枚举受影响的会话——那是越过租户边界的监听，也把转发这件装配的事搬进了能力里。本批资产治理发在治理中心进程（`apps/tenancy-host`），据点进程里本来就听不到 |
| 表换了、可用性变了 | 契约不推送；消费者在自己的时机来读 |

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 装配清单（候选 `assemblyManifest`；PF-004 的契约，**未建立**） | **必需 inject** | 提供者换代 ⇒ 插件重跑、缓存丢弃（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)） | 缺席 ⇒ `PENDING`，服务不出现。**本批一直缺席** |
| 时间源 `clock` | **必需 inject**；`infra/clock` | 同上 | `'unavailable'` ⇒ 要写 `filledAt`／`computedAt` 的操作 `unavailable` |
| 据点读面（候选 `evaluationInputs`：此刻的求值输入、按 (资产, 版本) 取正文、工作区资产正文能否原样取回、会话事实） | **可选**：每次操作 `resolveOptional` 现取（basis `inject-has-no-optional-form`） | 每次操作现取 | 缺席或读不到 ⇒ `reload`、`refreshAvailability`、`fill`、重建、门控现读 `unavailable`。**没有 provider 节点**（A-2） |
| `capability.mcp-bridge` v1 [S-16](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-16-refreshactions)、[S-17](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-17-projectactions)（[`packages/tools/mcp-bridge`](../mcp-bridge/README.md)） | **可选**，现取 | 每次 `refreshAvailability` 现取 | 缺席 ⇒ 每个接入点按 S-12「没有结论」那一行，原因「读不到」 |
| `capability.modality-projection` v1 `lookupConverter`（[`packages/model/modality-projection`](../../model/modality-projection/README.md)） | **可选**，现取 | 同上 | 缺席 ⇒ 那一项「读不到」、不满足 |
| 有效运行模式（G-9）、各依赖项提供者的自报（G-6）、有效模型档案（G-6） | **可选**；本批一个都没有读面 | —— | 按 S-8 ③ 那一项不满足、原因「读不到」 |
| 求值、资产形状、工具定义等 | **纯 import**，不经 Cordis | 随包版本 | —— |

**对执行者表不依赖**：草图里「执行者表缺某种执行者 ⇒ 对应工具不可用」一格**不采用**——契约 S-8 的可用性只由依赖声明算，没有「执行者登记了没有」这一项；执行者缺席由执行运行时在起执行者时收成 `failed{start_failed}`（`capability.tool-execution-runtime/v1#S-38`）。

### 对装配清单提供者的要求清单

本节点**不建表**；它的全部持久要求落在装配清单的提供者上。那个提供者（PF-004 的契约与它的节点，都不存在）立起来时须写一条对应本节的要求，**两边互指**。

| # | 要求 | 对应条款 | 为什么 |
|---|---|---|---|
| R-M1 | **条件追加**：`append(会话, 期望头, 记录)`——期望头不等于当前头则不写、答「冲突」；(会话, 序号) 唯一 | S-17 ①②、S-18 ② | [关键选择三](#关键选择)的共同存储对象 |
| R-M2 | `fill` 的记录以装配交来的 `EvaluationRef` 为键、唯一；再追加同键答「已在」并交回那条记录；「已在」「冲突」「不可用」三者可区分 | S-22 ⑦、S-13 | 回执丢了的重试认回同一次 |
| R-M3 | `reload`、`markFailed`、`onAssetChange` 的记录由清单在追加时给出新的 `EvaluationRef`（后两者沿用被收窄那份的 `basedOn`，不铸新的求值引用） | S-13、S-6 `basedOn` | 本节点不铸标识 |
| R-M4 | 便宜地读一个会话的当前头；在**同一个一致快照**里读头与每一类最后一条换表记录 | S-33 ②、[关键选择二](#关键选择) | 头与记录不一致就会按半截清单重建 |
| R-M5 | 一条记录能带齐每张被换表的完整构成（条目的 `capability`、`asset`、版本、`from`、`resident` 与次序）连同 `filledBy`、`basedOn`、`filledAt`；记录不可改 | S-18 ① | 任一类的当前快照都能从这一类最后一条单独读出 |
| R-M6 | 能答「这个会话没有装配记录」，且与「读不到」可区分 | S-21 `sessionNotFound`、S-19 | —— |
| R-M7 | 追加答成功即持久。**边界**：sqlite `synchronous = NORMAL` 下操作系统崩溃或断电可能丢最后一段已提交事务（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md)）——那时重建出来的少了最后一次换表，而调用方已被告知成功（S-43「逐条与重启之前相同」对断电不成立） | S-18、S-33 | —— |
| R-M8 | 不可用可识别：不返回空、不返回旧快照 | S-19、S-32 | —— |
| R-M9 | **历史换表记录可按 (会话, 类别, `filledAt`) 读回，会话存续期内不删** | S-25 ④⑧、S-6 第 2 条（M35） | 报告所依的被顶替快照以它为留存（[关键选择四](#关键选择)）；删了，仍在跑的尝试的读只能答 `unavailable` |

## 状态、并发与失败映射

**写权**：会话缓存只由本插件的换表操作在条件追加成功之后替换，由读在头不符时重建。**提交点**：装配清单的一次追加。**并发**：同一会话的换表经进程内队列排队，经条件追加定序；读不排队（读只读头与缓存）。

**失败映射**（没有 catch-all）：

| 情形 | 映射 |
|---|---|
| 表示层不合（含 `within`／`run`／`attempt` 缺席、报告不是这个会话或这个 `runId` 的） | `invalidInput` |
| `fill` 带的 `EvaluationRef` 那条记录已落下、六份当前快照任一不是它填出的 | `invalidInput{evaluationSuperseded}`（M34） |
| 清单答「这个会话没有装配记录」 | `sessionNotFound` |
| 此刻的求值以 `compositionCycle{cycle}`／`categoryUnsupported{category}` 失败 | **原样转交**（结论；M32、M45），表不换、不追加、不交报告 |
| 求值结果 `unresolved` 非空 | `dependencyUnresolved{missing}` |
| `tool` 表撞名（含加上动作条目之后） | `toolNameConflict` |
| 清单读不到、追加答不可用、据点读面缺席或读不到、`clock` 答 `'unavailable'`、求值结果里 `resident` 缺席、重建取不回原样正文、`within = run` 的报告所依那一份此刻取不回 | `unavailable`；缓存不动；**不改读当前那一份** |
| 条件追加答「冲突」 | 按清单重建、从头重做一次；再冲突 ⇒ `unavailable` |
| 第二次求值（S-24 第 5 步）拿不到 | 报告照交，`effectivePermissions` 各项 `unavailable` |
| 桥、模态登记、自报、运行模式读不到 | 只让那一项或那一行不满足，原因「读不到」 |
| 本实例已撤 | `unavailable` |
| 求值模块抛出（缺陷） | 原样上抛、error 日志——**不折成 `unavailable`**：那会把一次缺陷说成「判断不了」 |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| `ctx.provide('assetRegistry')` | 本 fiber；两个必需依赖都在时插件体运行、立即可解析 | 抛出 ⇒ 随 fiber 撤（`provide` 由 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**） | 服务消失 |
| 会话缓存、换表队列、撤除标记（一个 effect） | 本 fiber；空缓存起步，按需重建 | —— | 置撤除标记、清空缓存。**在途的操作跑完，按各自那一次追加收场**：追加成功的在清单里、下一任读头时看得见；失败的什么都没留。**保留**：无——清单是权威，本插件没有只活在实例里的事实 |

**提供者换代时收掉什么**（F 第二问）：装配清单或时钟换代 ⇒ 缓存丢弃、插件重跑、下一任按清单懒重建；**没有要收的在途事实**——报告是调用方手上的值，照旧有效到那一次尝试结束（S-11 ①）；它所依的快照若已被顶替，下一任按装配清单那条记录现建（R-M9）；「最近一次算出的」可用性在重建时再算一次（S-33 ⑤）。

## 装配给与协议给：本节点单机怎样兑现左列

照契约 [S-31](../../../../spec/capabilities/asset-registry/v1/contract.md#s-31-装配给的保证-vs-协议须给的保证) 逐行；右列本节点一条都不兑现。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 同一会话换表串行、多表一次 | 进程内队列 ＋ 清单条件追加（R-M1）；一次操作一条记录（R-M5） | 本节点 ＋ 装配清单提供者（**无**） |
| 换表先记进清单再生效 | 追加成功之后才换缓存；每个操作先对头 | 本节点 ＋ 装配清单提供者 |
| 「谁可以用」现读的新鲜度 | 每次读现求值；新鲜度是据点读面给的副本的新鲜度 | **装配**（据点读面，A-2） |
| 资产变化通知转到据点 | 不监听；`onAssetChange` 等转发者调 | **装配**（`apps/cli`；本批没有，A-3） |
| 一次尝试内不变、技能门控一次运行内不变 | 报告作为值交出；本节点不在尝试中途重算 | 本节点 ＋ 调用方（agent loop，无节点）如实带 `runId` 与 `attempt`（M46），把同一份报告交给 runner 与执行运行时（M33） |
| 求值的输入被收齐 | 据点读面 | **装配**（A-2） |
| 调用方身份已核实 | 进程内能力间面；不暴露给终端 | **装配**（`apps/cli` 不把本服务接到任何入口） |
| 提供者的自报 | 同一进程里的读面，现取 | 各项 owner（契约 G-6） |

**归装配的事项**（点名给 `apps/cli`）：装配清单提供者（不存在）；据点读面（不存在，A-2）；资产变化转发者（不存在，A-3）；不把本服务暴露成入口；撤除次序——本插件先于装配清单与时钟撤（依赖关系保证，不另安排）。

## 实施缺口与消费者影响

契约第十节的缺口不重抄；下表是**本节点自己的**缺口，编号 A-n 只在本节点内有效。A-1、A-2 所指的装配清单契约与据点读面按 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（C-2、C-3）**本程不补、下一程补**，owner 主线。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| A-1 | 对装配清单提供者的要求 R-M1～R-M9 没有对端（清单无契约、无节点，契约 G-1） | 本插件整批 `PENDING`；执行运行时的 `submit`（它的 `report` 从本节点来）、agent loop 的尝试开始、`Tools()`／`Skills()`、斜杠命令识别 | 主线（M43 C-2：PF-004 的契约与它的提供者节点，下一程） | 那个节点写出对应要求并互指 |
| **A-2** | **据点读面没有 provider 节点**：此刻的求值输入（副本 ＋ 工作区读入 ＋ 会话值）、按 (资产, 版本) 取正文、工作区资产正文能否原样取回、会话事实。assets 提案把它归「据点装配、不另立契约」（[MR-3](../../../../record/proposals/capability-split-assets/design.md#本包依赖的主线裁定尚无决定记录)），`apps/cli` 的设计也登记了它没有承接者 | `fill`、`reload`、`refreshAvailability`、门控现读、重建、被顶替快照的现建 | 主线（M43 C-3：随入口组合 v2 一并起草，下一程） | 读面落定；本节点改指它 |
| A-3 | **资产变化没有转发者**：资产治理在治理中心进程发通知；据点上谁转、转给哪些会话（本节点不提供会话枚举）未定 | S-28；「再授予要等 reload」（契约 G-3 的边界在本批恒成立） | `apps/cli` | 装配写明转发者与会话扇出 |
| A-4 | 同一 (会话, 类别) 的 `filledAt` 严格递增靠「上一份 + 1 毫秒」兜底——本节点推导；`Instant` 是毫秒整数（`core/offer-expiry`） | S-6 | 本节点 | 实现时按此；若 `Instant` 刻度改变回来改 |
| A-5 | **已闭合（修复波 3，M34）**：同一 `EvaluationRef` 再 `fill` 而六张已不是它填出的 ⇒ `invalidInput{evaluationSuperseded}` | —— | —— | —— |
| A-6 | **已闭合（修复波 3，M35）**：`within = run{report}` 只在报告所依的快照里找；带来的留存义务由[关键选择四](#关键选择)与 R-M9 承接 | —— | —— | —— |
| A-7 | **已闭合（修复波 3，M33）**：执行运行时的 `submit` 带报告 | —— | —— | —— |
| A-8 | **两处没有测量的取舍**：读时门控每次现求值（代价随读频率与命令数增长）；内存只留每类上一份被顶替的快照（更早的现建，慢） | `lookup`／`list` 的延迟 | 实现者 | 有测量再决定：门控缓存按 `data.identity-values/v1#S-27` 写失效条件；留存代数按真实的尝试内 reload 频率定 |

**报给主线**（不在本节点改）：A-2（据点读面没有节点——与 `apps/cli` 登记的同一缺口，M43 C-3）；M35 带来的留存义务本节点读作「装配清单那条记录就是留存」，要求清单在会话存续期不删历史换表记录（R-M9），对清单提供者（下一程）是一条新要求。A-5、A-6、A-7 已随修复波 3 闭合；草图「注册表 inject 资产求值」一格已被 D-039 assets 候选 B 取代，本节点按纯 import 写。
