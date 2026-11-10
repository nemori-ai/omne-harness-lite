# tool 实现规格

本页说明本实现怎样满足[契约 SPEC](../tool-contract/SPEC.md)：独立执行作用域与执行包装器，以及之后的受理决定器、记录仓、推进协程和耐久性怎样依赖记录仓提供者。本页不另写公共保证，也不能用实现限制改写公共承诺。

下列决定已接受，由本包承担。完整记录见契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)：G1 账本工厂与记录仓端口，G2 独立执行作用域，G6 的 runtime 测试装配与记录仓一致性用例，G8 的 `executeTool`、`createIndependentToolScope`、`createToolRuntime` 及其构造形状。

W3 的最终结果准备、正文页与材料释放增量依据 [#1168](https://github.com/nemori-ai/omne-harness-lite/issues/1168)，当前为待评审设计。下述新增要求与现有支持范围分别判断，产品实现尚未兑现这些增量。

## 当前范围

### 已实现范围

已实现的范围如下。

- 独立路径：`createIndependentToolScope`（G2）与 `executeTool`（G8），即契约 SPEC [P11](../tool-contract/SPEC.md#p11-作者输出与等待原语) 的独立执行。
- 账本：账本工厂 `createToolLedger` 与记录仓端口 `ToolLedgerStore`（G1）。
- 逻辑终局：`createToolRuntime`（G8）的 invoke、queries.lookup、queries.queryOperation、queries.readResult、commands.releaseDelivery 与 queries.account。这些调用不进入环境或执行者（第 10–16 条）。
- 读取：固定结果完整块页、关联附件字节页和精确原件元数据，IO 后复核当前资格；字节读取须显式 provider，附非耐久内存组合（第 27 条）。
- 事实保管：受信 `commands.receiveFacts` 接收 process/final，`recordFactAcknowledgement` 核来源确认并清除 ACK 责任，`loadRecovery.streams` 与实现读口 `ledger.facts.read` 提供恢复依据（第 24 条）。
- 已启动调用收场：从原保存 final 主动确认独立结果保管，原子建立原结果、交付、真实 effect、物理结束及后继任务，跨域修复释放队列名额。环境释放沿原计划自动查询、请求并核验回执（第 26 条）。
- 在途停止：已记录 live 启动的 `control(stop)` 同提交保存原意图、收据与 stop 待办，driver 经原 binding 推进。原执行已结束时记录 `already-ended`。传播进度与物理终局分开（第 29 条）。
- 到启动为止的真实调用：受理、环境准备、FIFO 排队、启动意图、live-only 绑定启动、原围栏对账与启动记录，以及永久排除后的启动前拒绝收场（第 19–23 条）。前台启动通过装配传入的 `ToolClock.begin` 开启计时段。
- 过程观察的门面：`instances.current` 与 `observation.observe` 经实例目录路由到当前代次的 handle，交出每一帧之前重核资格（[运行时观察门面](#运行时观察门面)）。

尚未实现：完整计时、启动前停止与启动结果未知时的停止、withdraw/background 控制、等待、真实过程观察源与 readProcess、恢复扫描、排空与交接。未交付的操作或分支回复具名 `unsupported`。slot 释放不证明环境资源已经释放。内部机制见 [architecture](docs/architecture.md)。

## 独立执行怎样满足 P11

### 作用域的数据

一个作用域对应一次执行。它持有三组状态：

- 输出账：受理序号、待确认的字节数与条数、每个 `index` 的模式、封块状态与累计字节、一条串行交接链、第一条接收者没有接下的输出。
- 等待历史：按 `key` 的记录表。每条记录保存 key、输入摘要、固定后的请求、结果、在途 Promise 和中断器。作用域另记已预留的历史字节与当前活动等待。
- 收尾：第一次关闭的种类（`returned`、`failed` 或 `cancelled`）、取消标志和 `finish` 的记忆。

作者只拿到 `context`。`context.mode` 固定为 `independent`，`context.signal` 是输入的信号。

### emit

受理前先复制并检查输入。检查顺序是：作用域是否已关闭或取消，是否有接收者，输入形状，`index` 的模式与封块状态，容量。`replace` 的内容必须是 `judgeContentBlock` 接受的块，且 `visibility.toHuman` 为 `true`，因为过程输出只面向人。独立模式没有保管者，所以不核对附件资格。拒绝的更新不占序号，不进入交接链，以后也不会发送。

受理在第一次 `await` 之前完成：序号加一，待确认额度扣减，块状态更新。之后更新进入交接链。链上每条更新在前一条的接收结果返回后才交给接收者，所以并发 emit 按受理顺序到达，后一条的接收结果不能先发布。回执是 `{ kind: 'local', sequence }`，只说明接收者已接管。

字节按固定编码计算：`JSON.stringify({ sequence, update })` 的 UTF-8 长度。`append-text` 的累计状态是该块未封前所有文本的 UTF-8 字节和。`replace` 的累计状态是最新块的 JSON 字节数。封块后累计状态归零，只保留模式与封块标记。

容量有两个账，都以 `authorBufferBytes` 为上限，分别计算：待确认输出的字节与条数，以及全部未封块的累计字节。单条更新或单块累计状态超过上限返回 `too-large`。待确认条数达到 `authorBufferItems`，或剩余字节不足，返回 `capacity`。两者都不排队。

### wait

检查顺序是：作用域是否已关闭或取消，是否有提供者，请求形状，key 的历史，活动等待，历史容量。

请求形状按闭合字段检查。Ask 只允许 `kind`、`key`、`contract`、`request`。Resource 另有 `deadline`。多余字段返回 `invalid`。`contract` 只核形状：`kind` 与请求一致，`expiry` 合法，`adoption` 四个字段是字符串，`request.maxBytes` 与 `response.maxBytes` 是正安全整数。契约包的句柄标记不公开，所以本包不能核对品牌。`maxBytes` 不是正安全整数时返回 `unsupported`。`request` 必须是合法的标签 JSON 树，且编码后不超过 `contract.request.maxBytes`，否则返回 `invalid`。树的检查是 json-text 的 `judgeJsonValue`，走到容器自身之内返回 `invalid`（原因含 `cycle`）；共享子树每次到达都计数。访问上限取一百万与 `request.maxBytes` 中较小者：每个节点在规范文本里至少占一个字节，所以访问数超过 `maxBytes` 的树编码后必然超过 `maxBytes`。`maxBytes` 小于一百万时，到达上限返回 `invalid`（原因含 `too-large`），检查在读完整棵树之前停下；`maxBytes` 不小于一百万时，到达上限返回 `invalid`（原因含 `budget`）。契约包的值树判定用同一个函数。Resource 的 `deadline` 为字符串时，契约的 `expiry` 必须是 `supported`，且值必须是 ISO 8601 时刻，否则返回 `invalid`。

输入摘要由 kind、adoption、deadline 和请求的规范 JSON 文本组成。同 key 同摘要共享原记录：已结束则返回原结果，在途则共享同一个 Promise，提供者不会被再次调用。同 key 异摘要返回 `conflict`。有活动等待时开放别的 key 返回 `busy`。

新 key 先预留历史容量。预留量是 `contract.request.maxBytes + contract.response.maxBytes + key 的字节数`。预留量超过 `authorWaitHistoryBytes` 返回 `too-large`。条数达到 `authorWaitHistoryItems` 或剩余字节不足返回 `capacity`。旧记录不淘汰，仍可认回。

开放先设输出屏障：等待调用时刻之前受理的全部输出都已交给接收者，才把请求交给提供者。屏障期间作者仍可 emit，这些输出不属于该屏障。屏障因输出故障失败时，等待返回该故障，但位置保留并仍是活动等待：同 key 同输入重试会再次开放，别的 key 返回 `busy`，直到该位置结束。一次执行只有一个未结束的逻辑等待。屏障因取消或关闭失败时，等待以该失败结束。

提供者的结果按值接收。提供者返回失败时，该失败就是等待的结果。提供者抛出异常时，等待返回 `unknown`，`operation` 为 `wait:<key>`。提供者的回答与中断竞争：先到的生效。回答到达后、交给作者之前，作用域再看一次取消标志：已取消则等待以 `cancelled` 结束，回答不交给作者；否则交出回答，之后的取消不撤销它。

回答的 `value` 受协议的 `response.maxBytes` 约束：`value` 的 JSON 文本超过该上限，或没有 JSON 文本，等待返回 `unavailable`，`operation` 为 `wait:<key>`，回答不交给作者。`no-answer`、`declined`、`expired` 没有 `value`，不量。该失败与提供者返回的失败一样成为该 key 的结果，同 key 同输入认回它，提供者不再被调用。

### 取消

信号中止时作用域立即取消。活动等待以 `cancelled` 结束。之后的新原语返回 `cancelled`。已交给作者的回答不撤销。取消标志盖过 `returned`，所以中止后的 `finish('returned')` 返回 `cancelled`。

作用域在信号上登记一个中止监听器。取消时，以及 `finish` 的 Promise 结束后，监听器从信号上移除。此后信号再中止，作用域不再改变：新原语返回 `closed`。

### finish

`finish` 调用时同步关闭新受理。同一 exit 再次调用得到同一个 Promise。不同 exit 返回 `conflict`。

`finish('returned')` 先看活动等待。存在活动等待时（在途的，或因输出故障保留的位置），等待以 `closed` 结束，收尾返回 `invalid`；等待已因取消结束时收尾返回 `cancelled`。否则等待调用时刻之前受理的输出全部交接完成。取消先于或发生在等待期间都返回 `cancelled`。输出故障返回该故障。

`finish('failed')` 不等待输出。活动等待以 `closed` 结束。已取消时仍成功。接收者继续承担它已接下的输出。

### 失败解释

| 情况                                                                                                                                                                          | 结果                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已封块再写、跨模式写、`replace` 的块对人不可见、Ask 带 `deadline`、`expiry` 为 `forbidden` 时给 `deadline`、`deadline` 不是 ISO 8601 时刻、请求不是合法 JSON 树或超过协议上限 | `invalid`                                                                                                                                                                        |
| 没有接收者或提供者；契约没有有限上限                                                                                                                                          | `unsupported`                                                                                                                                                                    |
| `finish` 的 exit 与首次不同                                                                                                                                                   | `conflict`                                                                                                                                                                       |
| 作者有活动等待却正常返回                                                                                                                                                      | `finish('returned')` 返回 `invalid`，等待以 `closed` 结束                                                                                                                        |
| 接收者返回失败                                                                                                                                                                | 该 emit 返回那个失败。输出账记下第一条故障。之后的屏障返回该故障：接收者的失败是 `unavailable` 或 `unknown` 时原样返回，否则包成 `unavailable`，`operation` 为 `emit:<sequence>` |
| 回答的 `value` 超过 `contract.response.maxBytes` 或没有 JSON 文本                                                                                                             | `unavailable`，`operation` 为 `wait:<key>`；回答不交给作者                                                                                                                       |
| 接收者或提供者抛出异常，或返回的值不是 Outcome                                                                                                                                | `unknown`，`operation` 为 `emit:<sequence>` 或 `wait:<key>`                                                                                                                      |
| 作用域的程序缺陷                                                                                                                                                              | 抛出异常                                                                                                                                                                         |

### executeTool

包装器先核对作用域：`context.mode` 是 `independent`，`limits` 的四项是正安全整数，`finish` 是函数。不匹配时返回 `effect: 'not-started'`，不调用作者。作者返回后调用 `finish('returned')`。该收尾失败时返回失败，`reason` 是 `<kind>: <reason>`，`effect` 是 `unknown`。收尾成功后才交出 R。作者抛出时调用 `finish('failed')`，再返回 `effect: 'unknown'`，`reason` 是异常的名字与消息。

## 受理账本怎样满足 P01、P02、P08 与 P09

账本由 `createToolLedger(store, guards, clock, configuration, ports)` 构造。runtime 由 `createToolRuntime(dependencies, configuration)` 构造。两者可以取同一个 `ToolConfiguration`。账本读取 `resultPageBytes`、`ledgerCommitAttempts`、`queueCapacity` 与 `offloading`。数据形状与决定顺序见 [architecture](docs/architecture.md#本包的记录仓与决定器g1)。下列规则按编号对应测试。

签名与契约 [G1](../tool-contract/SPEC.md#契约缺口决定g1g9) 一致：`createToolLedger(store, guards, clock, configuration, ports)` 返回 `{ commands, reads, admissions, queues, facts, bodyWrites, finalPlanner, sweep, delivery, controls }`。`configuration` 给出结果页大小、提交重试上限、队列容量与正文策略，唯一来源是 `ToolConfiguration`。第五参数 `ToolLedgerPorts<P>` 必填，提供 `bodies`（正文存储、许可密钥与参与者时钟）、`releaseInspection.inspectRelease` 与显式 `content` 字节读口或 `null`，不提供默认授权或旧构造。`facts` 是账本的受信恢复读口，runtime 的结算驱动只使用 commands，不再注入它。

`finalPlanner` 提供 `ToolFinalPlanner.planFinal`：见下文“最终事实的计划与结算”。原始返回 R 不再进入任何保管端口。

结果提交在同一次 call CAS 中写入结果记录（通道值内联）、把被引用的正文条目置为 `linked` 并排期、把其余 opened/sealed 条目标孤儿并按 now + G 排期。系统受理拒绝、rejectPending 和 recordStart(rejected) 的合成结果走同一条写入。releaseDelivery 在可靠消费依据通过核验后解除交付，同一提交把记录值换成摘要（见「最终事实的计划与结算」）；到期回收只由清扫按到期索引执行。

### 正文封存与期限激活

`bodyCustody` 是账本提供给受信绑定的文本保管端口，类型归 tool-contract provider 入口的 `ToolBodyCustody`。它接收原调用、start、操作、来源依据和完整文本帧，不接收任意存储地址。新准备只允许 starting 或 running。已有操作按固定输入认回，异输入冲突。

准备意图先保存输入摘要、原声明和有效策略，再交接实际材料，最后登记 sealed。写入或登记未知时保留准备责任，inspect 区分 sealed、preparing 与 unknown。每次操作核验当前调用资格和原 start。封存回执包含正文身份、表示、大小、引用与保管依据，没有已激活期限。

#### 分段作者正文的受理与交接

本节约束 W3-B 的实现，不表示完整作者 writer 已交付。writer 属于原执行范围；账本记录只属于原 call 事务域。新 begin、append 或 seal 先核当前访问资格，再在 call CAS 中核 scope 开放、调用仍可执行和当前执行代次等于原 start。已登记的同输入操作按原身份认回；它的确认不重新要求原执行仍是当前协调者，但不得越过放弃或材料删除围栏。

作者可以在绑定的 start 调用返回前输出正文。此时唯一启动意图已耐久保存，调用仍为 starting，协调执行记录尚未由 recordStart 写入。仅在此窗口，用原 start.execution 核新写入；已有协调执行记录时必须与它一致，running 时也不允许退回启动意图。该规则同时适用于完整正文保管和分段 writer。

append 的受理提交保存序号、输入摘要和完整 staged 输入。不可变材料确认后，在同一 call CAS 记录 retained 回执、移除 staged 输入并归还暂存预算。未确认时保留原输入，恢复仅重放该输入和原材料操作，不重调作者。staged 的序列化字节和条数采用原执行固定的作者缓冲上限，包含转义开销；同操作重试不重复计费。maxWriterMetadataBytes 固定限制每个原执行的全部 writer 和 append 元数据总量，包含 key、block 和回执索引；它不按单个 writer 重置，也不借用 wait history 配额。

JSON 文档 writer 接收原文本片段，保持空白、数值词法和 UTF-8 字节。begin 从固定返回声明投影出正文表示，核对 codec 和 schema 身份。append 同时受正文总量和固定文档字节上限约束。seal 使用 json-text 按固定限制解析完整文档，拒绝 BOM、重复键及不完整 JSON，再调用受信 `bodySchemas.check` 校验固定的公开 schema。该端口不返回替代值，不能改写正文或程序 data。文本 writer 不依赖此端口。

语法、结构预算、schema 不匹配和不支持的固定 schema 都是确定失败。它们在原 call CAS 中把 writer 转为 failed，保留原 seal 身份及失败，解除片段准备用途并登记清理。同输入重试认回失败，异 seal 输入冲突；关闭不再等待该 seal。未成功封存仍阻止正常输出被当作完整成功。校验端口缺失、暂时不可用或抛错则保留 sealing 责任，按原操作恢复，不能误判为确定失败。inspect 只投影公开失败，不披露内部操作或来源记录。

片段材料不作为完整正文引用对作者发布。seal 先固定最后受理序号，再读取已确认片段，按正文总量上限聚合及校验。聚合材料已耐久而 writer 尚未确认封存时，仍保留片段和聚合的保管责任。writer sealed 与片段准备用途解除、清理待办登记在同一个 call CAS 完成。聚合正文保持 preparation，直到最终结果采用或具名恢复决定明确不再采用。seal 不启动 TTL。

结果和过程输出采用时，按原调用 writer 库存核对材料身份，执行 [P11 的 source 使用限制](../tool-contract/SPEC.md#模型正文-writer)。该限制先于 native-reference 或 process-history 用途的创建；不能用新用途绕过正文期限。

本地 Scope 先拒绝新入口，再交接已接收操作。关闭和写入登记共享 call CAS：关闭先提交则排除后来的新受理；登记先提交则关闭必须保留可恢复输入或材料回执。关闭未知不能报告交接成功。正常 return 仍有未请求 seal 的 writer 时形成明确输出失败，不自动封存。throw 或取消不能解除已接管责任。最终不采用时，先固定放弃事实，再解除暂存与材料用途并登记清理；迟到确认不得复活材料。

从未接收正文写入的 Scope 没有远端交接责任；同步关闭本地入口即可完成正文收尾，不创建无用的关闭记录。Scope 对宿主分别报告返回屏障的结果与责任交接是否已确认，不能把“作者漏掉 seal”与“关闭本身未知”合并判断。

调用恢复驱动原 writer 库存。完整输入尚在 staged 时继续原材料保管，已 retained 时认回原回执，sealing 时继续原封存。资格或提供者不可用时保留责任并明确失败或未知。依赖恢复之前，不声称能够完成回收或交付。

text 正文载荷采用 `tool-model-text-utf8-v1`。它按原顺序连接模型可见文本，不插入分隔符，不把块元数据、程序 data 或原生引用编码进正文。自动卸载与作者封存使用同一编码。材料 seal 的长度与摘要覆盖实际 UTF-8 载荷，bodyBytes 等于该长度。作者原操作的输入指纹仍覆盖完整帧、start 和来源依据；不同帧列表即使形成相同文本也不是相同输入。原结果通道继续保留各自的结构，正文载荷不用于重建整个 ToolResult。旧 JSON 帧材料需要显式迁移，不能按此 codec 解释。

`offloading` 显式配置内联字节、最长保管毫秒、正文最大字节和机械预览字节，均为正安全整数。作者声明只能收紧内联及期限上限。首次准备固定有效策略，重试不改用新配置。

`offloading.jsonDocument` 与 `offloading.jsonRecord` 是必填的独立 `JsonLimits`。前者限制整份文档，后者限制单条记录；它们不借用调用参数或程序 data 的限制。writer 固定与其格式对应的限制，恢复不采用新的配置。JSON 文档及 JSON Lines 在有限正文总量内聚合封存，当前实现不承诺常量内存。

`ToolConfiguration.readResultArguments` 是受信装配提供的读回参数 `JsonLimits`，也进入账本构造配置；它不同于原工具调用的 `guards.budgets.arguments`。自动正文准备使用固定预算检查整份 `Tools.read_result` 参数及引用内部编码。说明不可调用时返回 `invalid/readResultArguments`，不发布卸载占位。预览、原大小、从结果发布起算的固定保留期、不续期说明和读回调用共同受内联上限约束。交付可能晚于期限，首屏不承诺当前仍可读；实际截止时间沿结果描述及正文读取页返回。

装配须使准备端预算与实际读回入口兼容。升级时，此要求覆盖所有尚未到期的已发布引用，不能因收紧读回预算使它们失去约定的读取能力。恢复继续使用原准备固定的预算；它不代替应用维护读取端兼容性的责任。

作者或 renderer 返回 `ToolRenderedResult`。它的 original.source 只可采用同调用登记的 sealed body。结算核验完整引用和实际材料 seal，并在最终 CAS 中重核。作者 content 与 summary 的模型可见文本各自不得超过固定的有效内联上限。超限返回 invalid，保留准备责任，不重执行业务。作者首屏（content 加描述头）的每个块同样须放得进 `resultPageBytes` 一页，否则计划时回复 `invalid`（`content[i]`，`block-exceeds-result-page`）。

普通返回按模型可见文本的 UTF-8 字节计量。等于有效上限、且每个内容块的 JSON 编码字节都不超过 `resultPageBytes` 时内联；超过上限，或某个模型可见文本块编码后放不进一页时，保存独立正文并生成有界首尾预览。页按块的完整 JSON 编码计（含 id、可见性与转义），阈值 L 按 UTF-8 计，两个量不互相推导。结果能否交付在计划最终事实时裁定：卸载缩不小的块（对模型隐藏的块、非文本块）编码后超过一页，回复 `invalid`（`content[i]`，`block-exceeds-result-page`）；首屏本身放不进页，回复 `invalid`（`content`，`first-screen-exceeds-result-page`）。两者都不提交读不出来的结果。data、原生引用和仅对人可见内容不计入阈值，保持各自含义。正文超出系统最大字节数时拒绝结算，不能静默截断原文。

最终 `ToolResult` 在同次 CAS 中获得正文身份、表示、字节数、预览类别和固定期限，并作为结果记录的 `value` 内联保存（content、data、attachments、summary 与正文描述符；设计 4.1）：读结果只核对策略，不读任何存储；只有正文字节在正文存储里。同一提交把被引用的正文条目置为 `linked` 并按期限排期，其余 opened/sealed 条目标孤儿。原操作已提交时先认回原回执，不重新取时钟，也不续期。期限溢出拒绝提交。交付释放（C6，Handoff 模型 `Release`）：需要某个通道的全部交付都释放后，该通道的内联值在释放提交里换成摘要——content 换成卸载原文的 summary（内联结果没有摘要，换成空），attachments 换成空；data 归程序交付，模型交付的释放不动它；正文描述符与期限不变，正文在期限内仍经正文读口读取，到期由清扫回收。已释放的结果 readResult 回复 `not-found`（`reason=released`）。同操作或新操作的再次释放回复原释放状态，不再写入。

文本正文生命周期沿 W3-A 已有实现。本节新增结构化 writer 和 schema 窄校验端口。JSON 文档及 JSON Lines 的写入、语义页和本地生产装配已实现；本包验证不表示完整 W3-B 已接受。

### 直接返回的正文校验

`checkToolResultBody` 消费固定请求、已判定的 ToolRenderedResult、显式配置及窄 schema 校验端口。它属于 Tool 的返回归一化规则，由执行绑定在保管原返回之后、发布 final 之前调用。检查不改变结果，不从正文推导 data，也不读取 Session。账本消费受信绑定产生的 final，不重新执行作者的归一化。

模型可见 text 块按原顺序连接。none 声明拒绝模型正文及 offloaded；text 检查 Unicode 与总字节上限；JSON 文档检查整个值；JSON Lines 沿本包封存协议逐行检查，每条记录以 LF 结束，空流合法，空记录非法。完整文档与每条记录分别使用显式 JsonLimits。结构化正文无论是否达到卸载阈值都校验；作者已经封存的正文沿 writer 证明，摘要不按原文 schema 校验。未知词汇或确定结构错误与暂时不可用分别返回，绑定负责失败投影和原结算重试。

超过有效内联阈值的直接文本、JSON 文档及 JSON Lines 共用正文材料准备。物理内容仍是原 UTF-8 字节，表示元数据来自固定声明。首次机械预览带格式、适用 schema 身份及读回指令，它不冒充合法 JSON。data、附件、非模型文本及原生引用保持原值。系统产生的非 completed 失败提示使用系统文本策略，不能因业务 JSON 声明阻止失败收场。

### 10 边界与资格

每个命令和读取先检查边界输入，再问 `guards.access`，再读记录仓。缺租户、租户形状不对、主体不属于该租户，都回复 `denied`，`action` 是本次动作；回复不区分调用是否存在。每个操作有自己的动作：`admit`、`lookup`、`query-operation`、`read-result`、`release-delivery`、`account` 等。调用或操作身份不合词法回复 `invalid`，`field` 是 `call`、`operation` 等。

账本只检查租户的形状：`TenantId`、`OrganizationId` 与 `AccountId` 三个名字和两段非空文本。`guards.access` 必须证明租户是 legal-identity 铸造的值，不是同形状的对象，伪造的租户回复 `denied`。账本按两段身份文本为记录定键，所以这项证明是隔离的前提，不能省略。

固定请求经 `judgeFixedToolRequest` 封闭检查，拒绝的字段前缀 `request.`。来源经 `guards.sources.verify` 接收完整 Mutation 与 FixedToolRequest 核验：伪造回复 `denied`，不可读回复 `unavailable`（`dependency` 为 `source-guard`）。并发范围的授予经 `guards.grants` 核验：装配为每个接受的范围拥有者声明一个核验器，核验器确认范围拥有者已把 `scope.key` 授予当前租户和调用方。缺失、伪造或属于他方的授予回复 `denied`，范围拥有者没有声明核验器同样回复 `denied`，核验器不可读回复 `unavailable`（`dependency` 为 `grant-guard`）。资格守卫不可读回复 `unavailable`（`dependency` 为 `access-guard`）。守卫或记录仓抛出时，回复 `unavailable`，`diagnostic` 是只说明依赖名的固定文本，不带异常消息，因为异常消息可能含连接串等秘密（P05）。守卫与记录仓自己给出的 `diagnostic` 原样转交。这些拒绝都不写记录。

### 11 操作幂等（P01）

同 tenant、call、operation、同规范输入摘要的重送回复原回执。内部账本的 admit 同时说明它是否认回了已提交的受理。普通 runtime.invoke 通过来源 resolve 认回原身份，accepted.recovered 为来源或账本认回的逻辑或。内部 admission 不先读操作记录，所以受理只需要 `admit` 资格。两个首次受理同时竞争时，先提交的那次得到 `recovered: false`；后一次的提交因修订冲突失败，重读后认回原受理，得到原回执与 `recovered: true`。同操作异摘要回复 `conflict`。

已受理的调用再以另一操作号 admit 回复 `stale-revision`，`current` 是当前状态的修订号。带 `WriteContext` 的命令先比对 `expected` 与当前状态的修订号，不匹配回复 `stale-revision`，再进入命令本身。提交结果未知回复 `commit-unknown`，Tool 不在内部重试该提交。调用者以 `queryOperation` 认回：已落盘则 `committed`，重送得到原回执且不再写第二次；否定答案见第 14 条。记录仓读取失败回复 `unavailable`（`dependency` 为 `ledger-store`），不冒充调用不存在。修订冲突时重读重判，次数上限是 `ledgerCommitAttempts`；用尽后回复 `unavailable`（`ledger-store`，`<次数> revision conflicts in a row`）。

域修订号与状态修订号是两个值。域修订号是记录仓按域比对的并发令牌，每次提交加一，排除围栏（第 14 条）也加一。状态修订号是 `ToolState.revision`，等于写入该状态的那次提交的域修订号。围栏不改变状态，所以持有当前状态的写者不会因为别人的查询而失效。

下列三条是本包采用的解读，待契约拥有者确认：

- 已受理的调用再以另一操作号 admit，回复 `stale-revision`，不回复 `conflict`。admit 隐含的期望是"尚未受理"。
- 本租户内不存在的调用：`readResult`、`account` 与 `releaseDelivery` 回复 `invalid`（`call: unknown-call`）；`lookup` 回复 `not-accepted`，`queryOperation` 回复 `not-committed`。他租户的主体在这之前已经得到 `denied`，所以这个区别不跨租户泄露。
- 逻辑终局的账目取第 15 条的值：`trimmed` 为已知 `0` 字节，`duration` 未知，`receipt` 为 `received`。

### 12 逻辑终局（P02）

`known-unavailable` 的目标在身份、资格、来源与后台许可（第 13 条）核验后直接形成 `unavailable` 终局，原因是可用性给出的原因；不读参数，不查 `complete`，不调用任何其他端口。可用目标的参数先查 `complete`：`false` 回复 `invalid`（`request.arguments.complete: incomplete`），不受理。原参数与生效参数都经 `judgeToolArguments` 完整解析，任一失败形成 `failed` 终局，`cause` 为 `arguments`，`diagnostic` 是 `<original|effective>: <原因>`；半截文本与重复键都不产生参数值。

两种终局的状态是 `settled`、`foreground`、`foreground.final`、`execution.not-started`、`effect.not-started`、`timing.closed` 累计 `0`、`queue.none`、`delivery.pending`。一次提交同时写入 `call`、`operation`、`result`、`account` 与 `deliver` 任务。结果正文由 `guards.results` 生成、`guards.policy.judgeResult` 核验，核验失败回复 `unavailable`（`dependency` 为 `result-factory`），不受理。全部通过的真实工具被受理，之后的路径见第 20 条。

### 13 调用方式许可

`mode` 为 `background` 而定义 `backgroundAllowed` 为 `false` 时回复 `invalid`（`request.mode: background-not-allowed`），不写记录。这项检查在可用性分支之前，所以 dummy 与参数失败也得到同一拒绝：请求本身不被定义许可，不因为结果不需要执行而放过。`programmatic` 调用的目标定义 `programmable` 不是 `true` 时回复 `unsupported`，`adoption` 是定义的采用，不写记录；dummy 不受这项检查，仍回复不可用终局。

### 14 查询（P01）

`lookup` 以受理操作号认回：`call` 记录存在且受理操作号相同回复 `found` 与当前权威状态。`queryOperation` 对已提交操作回复 `committed`，`revision` 是提交修订号，`receipt` 是指向该操作记录的证据。

否定答案（`lookup` 的 `not-accepted`、`queryOperation` 的 `not-committed`）必须排除该操作所有在途提交（P01）。所以账本按下列顺序给出：

1. 完整读取域快照，快照里没有该操作。读取失败回复 `unavailable`，不给否定答案。
2. 提交排除围栏：在调用域写入一条 `exclusion` 记录（键 `exclusion:<operation>`，值是操作号与本次提交的新域修订号），`expected` 是快照的域修订号，域修订号加一。该操作已有 `exclusion` 记录时被替换为更新的修订号。此后任何按旧修订号准备的在途提交都因修订号不符而失败。
3. 围栏提交成功后，按第 1 步的快照给出否定答案。
4. 围栏冲突时，说明有提交在读取之后落盘。账本重读并重新判断，所以已落盘的操作得到 `committed`；另一读取者的围栏不排除本次读取，本次重读后再次围栏。重读次数受 `ledgerCommitAttempts` 限制。
5. 围栏结果未知时，`queryOperation` 回复 `unknown`，`lookup` 回复 `unavailable`（`ledger-store`）。围栏不可用时，两者回复 `unavailable`。两者都不给否定答案。

按操作号定键的命令（`admit`、`releaseDelivery`，以及带 `WriteContext` 或操作号的后续命令）记住自己第一次读取的域修订号。提交冲突后重读时，快照里若有本操作的 `exclusion` 记录，且其修订号大于第一次读取的修订号，说明否定答案在本命令在途时给出、已经把本次提交排除在外：命令停止重试，回复可重试的 `unavailable`（`dependency` 为 `ledger-store`，`diagnostic` 固定为 `operation <operation> was excluded by a negative answer; resubmit with the same identity`），不回复 `commit-unknown`，也不落盘。第一次读取就看到 `exclusion` 记录的新一次重送正常进行：它的提交在同一写入集里删除本操作的 `exclusion` 记录，所以否定答案之后同身份恰好受理一次。在途提交已被排除时，同身份异输入的重送也作为首次受理，不与它冲突。认回先于排除：快照里已有该操作记录时回复原回执，不论 `exclusion` 记录。

跨域命令（`planPreparation`、`enqueue`、`prepareStart`、`rejectPending`、`recordStart`）在队列步骤与端口调用之前先读调用域，用这次读取判断认回与前置闸门。这次读取就是它们的第一次读取：事务把它的修订号当作初始的第一次读取，所以否定答案在这次读取之后、事务之前给出（不论中间做了队列步骤、`qualifyStart` 还是 `clock.begin`），也排除这条命令，回复上面那条 `unavailable`，不落盘。`recordStart` 在调用 `clock.begin` 之前再读一次调用域：已被排除的操作不开始计时段。之后给出的否定答案由事务排除，此时计时段已经开始，它随这次失败的提交丢弃。推进协程把这条回复当作可重试的：重读后以同一身份重做，重做的第一次读取已经看到围栏，所以正常提交（第 23 条）。

本包接受的风险：

- 排除只对已经读过记录仓的命令生效。命令在首次读取之前（还在资格守卫或来源核验中）时给出的否定答案，不排除它：它随后首次读取时看到的是栅栏之后的修订号，照常提交。持有否定答案的调用方此时以异输入重送会得到 `conflict`。账本不能在资格守卫之前读取（拒绝的主体不得读到任何东西），关闭这个窗口需要端口或协议改动，由契约拥有者决定。

- 获准 `lookup` 或 `query-operation` 资格的主体每得到一个否定答案就写一次提交。所以本租户内有读取资格的主体能够创建 `exclusion` 记录、无上限地推进一个调用的域修订号；他租户主体与无资格主体在任何写入之前已被 `denied`，不写记录（第 10 条）。
- 反复轮询否定答案的读取者能让一个写者连续冲突，最多 `ledgerCommitAttempts` 次后写者回复 `unavailable`。

两条由拥有者决定是否收紧。

### 15 结果分页与账目（P08、P09）

`readResult` 按完整内容块分页：从游标位置起累计块的 JSON 字节数，不超过 `ToolConfiguration.resultPageBytes` 的块进入本页，至少一块；第一块就超过预算时回复 `unsupported`，不切块。计划最终事实时已保证提交的结果每块都放得进页（见上文内联规则），所以这一回复只在读取时的页配置小于提交时出现。每页携带版本的同一 `data`、`original`、`attachments`、终局、效果与来源证据。`next` 是绑定租户、调用、版本、投影与下一块位置的 JSON 文本；另一结果的游标（含他租户同调用同版本的游标）回复 `invalid-cursor`（`another-result`），不是游标的文本回复 `invalid-cursor`（`not-a-cursor`）。账本只为存在的块签发游标，所以位置等于或超过块数的游标回复 `invalid-cursor`（`past-the-end`），不回复空页。当前资格核验后，权威确认不存在的调用或版本回复 `not-found`（`target=result, reason=missing`），已释放的结果材料回复 `not-found`（`target=result, reason=released`）；已知调用未收场仍回复 `not-settled`。正文到期与缺失分别回复 `not-found` 的 `body/expired` 与 `body/missing`，暂不可读仍为 `unavailable`。完整分类及 `Tools.read_result` 映射见[Tool 读取失败](../tool-contract/SPEC.md#正文与结果的读取失败)，不再沿读取路径返回旧 unknown-version/unknown-call 的 invalid。`account` 只回复账目：逻辑终局的账目是替换件处理账，`usage` 与 `cost` 为空，`trimmed` 为已知 `0` 字节，`duration` 未知，不编原工具用量。

本包铸造的每种证据都定位租户与调用（P01 的身份是 `(tenant, call, operation)`）。`record` 是种类加定位值的规范 JSON，租户写成两段身份文本；`digest` 覆盖种类、定位值与内容。各种类的定位值如下：

| 种类        | 定位值                                                                       |
| ----------- | ---------------------------------------------------------------------------- |
| `state`     | 租户、调用                                                                   |
| `result`    | 租户、调用、版本、交付号、产生该版本的操作（ResultPage.source 的"实际来源"） |
| `delivery`  | 租户、调用、版本、交付号                                                     |
| `operation` | 租户、调用、操作                                                             |
| `account`   | 租户、调用、账目事件                                                         |

所以两个租户用同一调用号时，每种证据的 `record` 与 `digest` 都不同。

### 16 交付解除（P08）

普通 `runtime.commands.releaseDelivery` 成功返回 `released` 和生产者原耐久回执，不附本次操作引用。已释放后的重入不写新操作。未知结果携带本次操作引用，queryOperation 只查询该操作；可靠否定只否定该次操作，不证明交付仍 pending。调用方在可靠否定后可以明确再次释放以取得原回执，未知或不可读时不能自动重发。lookup 用原 admission 定位并返回当前权威 ToolState，可按当前 result 及 delivery 中的交付号与 consumer 认回已有释放。invoke 的 state 是受理时回执。readProcess 未支持，ResultPage 不含 DeliveryState。

`releaseDelivery` 先用契约的 `judgeConsumerRef` 与 `judgeHandoff` 封闭检查消费位置与交接证据，再比较或计算摘要。多出的字段回复 `invalid`（`unknown-field`），函数等非文本值回复 `invalid`（`type`），字段前缀是 `consumer.` 或 `evidence.`。之后核版本、交付号与消费位置都是记录的值：未知调用回复 `invalid`（`call: unknown-call`），交付号不符回复 `invalid`（`delivery: mismatch`），版本未知回复 `invalid`（`result: unknown-version`），消费位置不同回复 `conflict`，`operation` 是形成该版本的操作。`retained` 的 `custody` 或 `processed` 的 `completion` 的 `owner` 必须等于消费者的 `owner`，否则回复 `invalid`（`evidence.<custody|completion>.owner: owner-mismatch`）。

通过后一次提交同时写入结果记录的 `released`、操作回执、调用状态，并删除 `deliver` 任务。`released.evidence` 由本包铸造（第 15 条的 `delivery` 种类），不是请求证据的回送。已解除的交付再次解除（同操作或新操作）回复已解除状态，不再写入。解除回执用于判断该版本交付材料的用途是否结束。内联副本没有剩余用途后可释放；卸载正文在固定期限内经正文读口读取，到期返回找不到。原生资源与必要过程各自保管。解除交付不授予任意内容删除权。

未知答复不等于交付必然 `pending`。内存记录仓的 `unknown-dropped` 不应用写集合，首次解除后查询原操作得到 `not-committed`，目标交付、原 `deliver` 任务与内容保持。`unknown-applied` 已应用写集合，查询原操作得到 `committed`，`lookup` 可见目标已 `released`，该版本的任务已经结束。查询不可读时保留原操作与承接责任，不自动重发。可靠否定后明确再次解除时，若尚未解除才提交，若已有释放事实则返回原回执。

版本隔离按已有结果记录兑现。解除原始版本只更新其 delivery；解除 supplement 只更新 result 相同的 supplement。其他版本的完整 delivery、交付任务与固定版本内容保持不变。每个版本使用自己的 result、delivery 和原 consumer。当前 `recordLateResult` 尚未实现，多版本释放测试采用已有记录夹具，只验证释放隔离，不证明晚到结果生成。

### 17 工厂与后续增量

`createToolRuntime` 在构造时检查配置：作者限额、容量、`queueCapacity` 与 `ledgerCommitAttempts` 是正安全整数，处理延迟（`processBatchDelayMs` 等）是非负安全整数，可选的 `driverStepsPerRun` 缺省为 16，给出时是正安全整数；可选的 `driverRetryDelayMs` 缺省为 1000，给出时是 1 到 2147483647 的整数，这是定时器能持有的最长延迟，0 与超过定时器上限的值抛 `TypeError`（第 23 条）。`createToolLedger` 检查它读取的 `resultPageBytes`、`ledgerCommitAttempts` 与 `queueCapacity`。宿主每次调用 driver.run 显式提供 instance，不存在工厂级 instance。缺端口或超出范围抛 `TypeError`，因为这是装配缺陷。`ToolDependencies.admissions` 是账本的 admit 入口（`ToolLedger.admissions`），runtime 的 invoke 在来源 resolve 原子建立或认回原身份后用它；`ToolDependencies.queues` 是账本的队列维护入口（`ToolLedger.queues`），推进协程的等待者用它对账（第 22 条）。runtime、窄接口与 provider 都是冻结对象。受信的 operationIdentities 和 sourceIssuer.resolve 必须显式装配，不提供生产默认来源签发器。普通调用及引用失败协议归[契约的普通操作](../tool-contract/SPEC.md#342-普通操作与实例目录)。

构造时 runtime 把推进协程装到 `instances.install`。装入不受理业务，也不读写记录仓。真实工具的 invoke 受理成功且阶段为 `accepted` 时，runtime 调用 `instances.schedule` 唤醒该调用。原受理回执被认回时，lookup 当前状态仍待启动则补 wake，running/settled 不补；查询未知允许保守补 wake。唤醒只是提示：它抛出或失败都不改变 accepted 的回复。`inspect` 转给 `catalog.inspect`，不另加判断（P16）。

未实现的操作回复 `unsupported`，`adoption` 是 `tool-runtime` 或 `tool-ledger` 的采用，`reason` 说明操作名与它所属的后续增量。没有操作抛异常或回复空成功。`catalog` 是依赖给出的端口，content 与 instances 先解析调用引用再进入原读取端口或目录。

### 运行时观察门面

runtime 的 `instances` 与 `observation` 由 [src/stream-facade.ts](src/stream-facade.ts) 实现，兑现契约的[公共流协议上的观察](../tool-contract/SPEC.md#公共流协议上的观察)。门面只做路由与核权，不保存过程数据。每一帧都由当前代次 handle 的观察源产生。

- `instances.current` 先解析调用引用。引用不可读回复 `invalid`（`field` 为 `reference`）。跨租户或伪造租户回复 `denied`，不进入目录。之后门面问实例目录 `ToolDirectory.connect`，再用 `reads.lookup` 读当前权威状态。目录答 `live` 时，门面用 `toolStreamCallCodec` 把调用引用与 handle 的 `stream` 编为公共引用。回复的全部情形见契约的「`current` 的回复」表。
- `observation.observe` 把输入当不可信值核验。`request`、`access` 或 `signal` 形状不对时结束于 `denied`，不抛 `TypeError`。之后按公共失败顺序判定租户、引用语法、producer 与调用文本，再问实例目录。目录答 `live` 且 handle 的 `stream` 等于引用的 `stream` 时，门面把请求交给该 handle 的 `observation.observe`。
- 引用判定通过后、路由之前 `signal` 已中止时，门面不问目录，结束于 `observer-closed`。路由期间中止时，门面不等目录答复，同样结束于 `observer-closed`。门面只在两次目录调用（路由与逐帧重核）期间等待中止。handle 观察源的 `next` 在等待时，中止后结束于 `observer-closed` 是观察源的义务，门面不替它等待。
- 门面是最终集成输出边界。交出每一帧之前（含 gap 与 ended），门面再问一次实例目录，资格来源与 `connect` 相同，按同一调用与同一 `access`。目录拒绝时，门面先关闭 handle 的迭代器（移除订阅，丢弃排队），再结束于 `denied`。目录缺席、抛错或答 `unsupported` 时，门面以同样方式结束于 `unavailable`。目录答 `live`（任何代次）或 `no-live-route` 时资格仍成立，门面照常交出该帧。代次被替换或收场由生产者结束（契约「旧代次的终止帧」情形 1 与 2），不由门面结束。重核之后 `signal` 已中止时，门面不交出该帧，结束于 `observer-closed`。
- 偏离：门面是异步生成器，`return()` 不能打断在途的 `next()`。门面在 `await` 源的下一帧或资格重核时，`return()` 要等这次等待结束（来帧、资格答复或 `signal` 中止）才完成，订阅在此之前保持。公共协议要求 `return()` 立即解除；需要立即解除的消费者先中止 `signal`。
- handle 观察源的 `observe` 或迭代器抛错时，门面不捕获。异常保持为连接失败，这是 [stream-arrival 的失败顺序](../../common/stream-arrival/README.md#failure-order-and-iterator-completion)允许的通道。门面不把它改成结束帧。

本包只对受控的进程内发布者（`tests/stream-source.ts`）验证门面，用例在 `tests/stream-observation.spec.ts`。这些用例不证明真实观察提供者的原子订阅边界与披露检查。生产实例目录 `ToolInstancesService.connect` 仍回复 `unsupported`，所以在生产装配里 `current` 透传 `unsupported`，`observe` 结束于 `unavailable`。

### 记录仓单键读取

`ToolLedgerStore.readRecord(domain, key)` 读取指定键的记录及所属域的修订号。键的含义由 `recordKey` 定义。记录不存在时返回 `record: null`；读取不可用时返回 `unavailable`，不能以不存在代替失败。从未提交的域返回修订号 `0`。

记录和修订号来自同一个快照，具有完整域 `read` 的提交可见性及域内排序保证。单键读取不修改记录或修订号，不读取无关记录正文。返回值只包含单条 `record`，不能作为完整域的 `records` 消费。调用方仍以返回的域修订号执行原 CAS；其他键的并发写也会使旧修订提交冲突。

### 记录仓的同租户读集断言

`ToolLedgerStore.commit` 的可选 `asserts` 列出同一租户内其他域的 `{ domain, revision }`。提交只在被写域的修订号等于 `expected`、且每条断言的域修订号等于给定值时生效；任一不符回复 `conflict`（`current` 为被写域的当前修订号），不写入任何记录。断言不写被断言的域，也不推进它的修订号。断言与写入在同一次序列化里评估：被断言域的提交不能落在评估与写入之间。从未提交的域修订号为 `0`，可以被断言。

断言的域属于另一个租户时回复 `unavailable`，不尝试提交：账本按租户分区，跨租户的读集不是本端口的能力。被写域自身由 `expected` 约束，不列入 `asserts`。

这个机制让一个决定依据两个域的快照：调用方读 A 域决定、写 B 域、断言 A 域未变，A 域与 B 域的提交就按提交先后线性化。宿主的启动受理（受理写调用域、断言租户级守卫域）与执行环境交接用它；它取代了专用的守护宿主提交。`toolLedgerStoreConformance()` 的 `store.asserts-*` 用例是提供者的判据。

### 记录仓的到期索引

`LedgerWrite` 增加 `schedule(key, dueAt)` 与 `unschedule(key)`，`ToolLedgerStore` 增加 `due(tenant, now, limit)`。契约归 [tool-contract 的正文存储端口与到期索引](../tool-contract/SPEC.md#正文存储端口与到期索引)：排期随提交原子生效，条目以被写域与键标识，`due` 按租户读出已到时刻的条目。本包的消费者是结果提交的排期、结算后的孤儿排期（`ledger-body-entries.ts` 的 `settleBodyEntries`）与清扫的 `unschedule`；内存实现与 `toolLedgerStoreConformance()` 的 `due.*` 用例是提供者的判据。

### 清扫

`ToolLedger.sweep(tenant, now, limit)` 是到期回收的唯一执行者（`ledger-sweep.ts`，模型 `DeleteBytes` 与 `Reclaim`）；应用只负责按批量与间隔调度它，`now` 是清扫者自己的时钟。对 `due(tenant, now, limit)` 的每一项，先让正文存储删除字节与清单（幂等，不留墓碑），再在该调用域的一次提交里把正文条目置为 `reclaimed` 并 `unschedule`。两步之间停止的清扫者不留下任何需要修补的状态：到期条目仍在索引里，重跑再次删除并提交，终态相同。存储答 `unavailable` 或提交结果未知时清扫在该项停下并答 `unavailable`，已处理项的提交保留；它不为此改写任何条目。回收后的正文条目保留为按键冷记录，读回按它答 `expired`。判据：`tests/body-lifecycle.spec.ts` 的 C5 sweep 用例（内存仓与内存存储，含丢失提交的重跑与存储不可删）与 `tool-storage-sql/tests/sweep-live.spec.ts`（真实 SQLite，回收后正文表与到期索引不留行）。

### 18 非耐久记录仓（`./testing`）

`createMemoryToolLedgerStore` 声明 `durability: 'none'`。每个域从修订号 `0` 开始，并各自持有自己排期的到期条目，`due` 汇总同租户全部域的条目，`injectRead` 的故障同样作用于它；`commit` 只在 `expected` 等于当前修订号、且每条 `asserts` 的域修订号等于给定值时生效，否则回复 `conflict`；断言另一个租户的域回复 `unavailable`。生效的提交不论写入集内容都把域修订号改为 `revision`：只写一条 `exclusion` 记录、不改任何记录、删除不存在的键，都同样推进修订号，没有空操作捷径。读取给出副本。域键是各段身份文本的 JSON，含分隔符的身份不会落到别的域。`injectRead` 与 `injectCommit` 按顺序注入下一次读取或提交的故障：

- `unavailable`：不尝试。
- `conflict`：不写入，回复冲突，如同别的写者先提交了。
- `unknown-applied`：已写入，回复未知。
- `unknown-dropped`：未写入，回复未知。
- `unknown-delayed`：现在不写入，回复未知；提交保持在途，直到 `landDelayed` 按顺序落盘。落盘时重新比对 `expected` 与全部 `asserts`，任一已变则丢弃并报告 `conflict`。
- `throw-applied`：已写入后抛出。

内存仓先在局部 Map 完成全部新值复制、put 与 delete，再同步发布 records 与 revision。复制拒绝不留下部分写入。正常提交、已应用未知、应用后抛错与延迟落地共用此路径；应用后抛错仍保留完整提交。`HostRecord.value` 的 `unknown` 不承诺任意宿主值都能编码。

`toolLedgerStoreConformance()` 提供记录仓判据，`toolLedgerStoreCompositionConformance()` 用真实 ledger 提供 P01 组合判据。两者只从 `./testing` 返回既有 ConformanceCase 数组，用 node:assert 判定。具体 fixture、控制与资源责任见 [public-api](docs/public-api.md#ledger-store-conformance-testing)，消费方式见 [README](README_ZH.md#记录仓一致性用例)。提供者只供应 store，不供应 ledger 或业务 oracle。

每个 case 使用新 fixture。可选手柄分别缺失时，在首次装配、seed 和 IO 前用 tool-contract/testing 的既有 NotApplicable 报告，不能作为 passed。有手柄但未制造故障仍失败。编码拒绝 probe 使用提供者明确拒绝的值，接受异常、unknown 或 unavailable 后核完整快照与 revision 未变，并核同形全合法写集成功。该 probe 的 expected 匹配且没有竞争，任何 committed 或 conflict 都失败。它不定义统一编码拒绝协议。延迟控制的 land 完成前必须重核原 expected；成功否定围栏排除旧在途尝试，随后同身份新尝试仍可受理并删除旧 exclusion。

Store 分区与 ledger 授权分别验证。组合只核真实 ledger commands/reads 上的拒绝与零 store IO，不覆盖引用 codec、runtime 适配或生产身份系统。内存两组全部 passed、零 not-applicable 仅支持本进程非耐久证据，不证明真实数据库、跨重启、多连接或断电保证。验证资源见[测试导航](tests/README.md#记录仓公共一致性用例)。

`createTestToolDependencies<P>` 的公开类型由 `src/testing.ts` 拥有。它固定使用 `ContentBlock` 和 `MemoryEnvironment`，每次新建七个契约内存替身、记录仓与账本，并返回完整依赖与原始手柄。调用方显式提供实例身份、守卫、配置、宿主、Catalog、子调用端口及 `bindingsFor` 解析接线。工厂不隐式授予权限，也不把 executor binding 当作 `ToolBindings`。runtime 与账本共用调用方给定的结果政策。工厂本身不构造 runtime、不装入推进协程、不调度调用，异常沿既有账本构造或调用方回调传播。输入和使用方式见 [README](README_ZH.md#testing-入口)。

该工厂和记录仓只从 `./testing` 导出，均为非耐久测试设施。源码不得依赖测试目录；root 与 testing 的源码、JavaScript 和声明图均不得引入 Cordis、tool-host-local 或 tool-cordis-contract。根入口图另不得引入 testing 或 `node:assert`。

## 真实调用怎样到达启动（P02、P03、P04）

本节说明一个可用工具的调用从受理到启动记录的路径。并发范围与限额都由调用方交入：FIFO key 在租户内取自 `FixedToolRequest.scope` 的 `owner`、`key` 与工具名，并发上限取自固定的 `limits.concurrency`。Tool 只在这个范围内计数和排队，不为调用创建或推进任何外部工作对象，后续工作由消费方按其规则决定。整批批准与编排归发起协调者，Tool 只在启动边界核对交来的可信依据（启动守卫与启动围栏）。

### 19 写命令的边界

`planPreparation`、`prepared`、`enqueue`、`prepareStart`、`rejectPending` 与 `recordStart` 取契约的 `WriteContext`。契约的 `WriteContext` 没有主体字段，所以宿主把自己的主体放在同一输入的 `principal` 里。每个写命令先检查 `WriteContext` 的形状，再问 `guards.access`，动作是 `write`，然后才读记录仓。缺租户、缺主体或主体不属于该租户都回复 `denied`（`action` 为 `write`），不读任何记录。`loadRecovery` 的动作是 `recover`。恢复结果字段只含版本与来源凭据，不读取正文材料；完整结果由 `reads.result` 在当前资格下临时还原。

每个写命令先认回：同操作号同输入摘要回复原回执，异摘要回复 `conflict`。然后比对 `expected` 与当前状态修订号，不符回复 `stale-revision`。调用记录不存在时回复 `invalid`（`call: unknown-call`）。阶段不符回复 `invalid`（`call: phase:<阶段>`）。

### 20 准备与排队

1. admit 受理真实工具时同提交调用记录、受理回执与一条 `queue` 待办。状态是 `accepted`、`execution` 与 `effect` 为 `not-started`、`queue` 为 `none`、`delivery` 为 `null`。后台起步的调用同时固定后台占位。
2. admit 回复前，账本在队列域给该调用分配序号，条目阶段是 `preparing`。所以一个在另一个 admit 回复之后受理的调用，序号更大。这一步只属于首次受理：认回的受理回复首次回执里的 `accepted` 状态，即使调用已经收场、条目已经释放，也不再分配。已释放的调用得不到条目：队列域记着它（第 22 条），创建条目的步骤回复 `released`，admit 的回复不变。这一步失败时受理仍然成立，序号改由 `planPreparation` 分配。
3. `planPreparation` 保存 `PreparationRecord` 与 `prepare` 待办，状态改为 `preparing`，`queue` 为 `waiting` 与序号。只接受 `initial` 用途与受理时固定的请求。`resume` 用途回复 `unsupported`。
4. `prepared` 核对准备记录是本调用计划的那一条，记下环境证据，删除 `prepare` 待办，写 `queue` 待办。
5. `enqueue` 先把队列条目改为 `ready`，再把状态改为 `queued`。
6. `prepareStart` 在一个队列域事务里裁定队首与名额。条目是 `ready`，没有序号更小且尚未持有名额的条目，且已持有名额的条目数小于本调用固定的 `limits.concurrency`，才把条目改为 `held`。`null` 表示没有数量上限，但 FIFO 仍然适用。未轮到时回复 `unavailable`（`dependency` 为 `tool-queue`），诊断说明前面的条目数、持有数与上限。这一回复不写任何记录，也不是执行失败。

仍在准备的较早调用（条目 `preparing`）不持有名额，但后来的同 key 调用不能越过它。转后台的调用与前台调用一样持有名额，因为名额按条目阶段计数，不看关系。名额只在条目删除时释放，删除只凭调用域里的释放依据（第 22 条）。本包支持启动前拒绝保存的排除证据（第 21 条），以及已启动执行的可信原 final 结束依据（第 26 条）。仅逻辑收场不是释放依据。

容量：真实工具的 admit 在提交前读一次队列域。该 key 下尚未释放的条目数达到 `ToolConfiguration.queueCapacity` 时回复 `unavailable`（`dependency` 为 `tool-queue`），不写记录。容量只拒绝参数通过的真实工具：dummy 不读队列域，参数失败照常形成失败终局，两者都不占条目。重送已受理的操作先认回，不受容量影响。

环境准备的结果由推进协程处理（第 23 条）。环境拒绝时调用不启动，也不改用别的宿主。环境端口失败时调用停在 `preparing`，`prepare` 待办保留。

### 21 启动意图与启动围栏

`prepareStart` 在队列步骤之前问 `guards.starts.qualifyStart`：当前调用方式许可与资格是否仍成立。`refused` 回复 `unsupported`，`adoption` 是定义的采用，不产生启动意图。不可读回复 `unavailable`（`dependency` 为 `start-guard`），从不当作允许。已持有启动拒绝的调用回复 `invalid`（`call: start-rejected`）。

队列步骤成立后，调用域同提交唯一的启动记录（`ToolStartRecord`，`kind` 为 `start`）、`start` 待办与状态 `starting`，`queue` 为 `held`，`execution` 为 `starting`。

`recordStart` 只接受本调用保存的那条启动记录，阶段必须是 `starting`。

- `started`：状态改为 `running`，`execution` 为 `live`，`instance` 是写入上下文的实例。前台调用先由 `clock.begin` 开始计时段，`timing` 为 `running`。后台调用的 `timing` 为 `paused`。删除 `start` 待办，并同提交原 start 的 `facts` 续读待办，其独立 fact-reader evidence 绑定原 start。名额保持。
- `rejected`：同提交永久的启动拒绝、`unavailable` 终局、`effect` 与 `execution` 为 `not-started`、计时关闭、`queue` 为 `released`（释放依据是排除证据）、第一个结果版本、替换件处理账与 `deliver` 待办。然后释放队列条目（第 22 条）。
- `not-started` 与 `unknown`：保存回执，启动记录与 `start` 待办保留。`unknown` 把 `execution` 改为 `unknown`。

`rejectPending` 用于没有启动记录的调用（阶段 `accepted`、`preparing` 或 `queued`）。它要求宿主先取得 `authority.exclude` 的排除证据，然后与 `recordStart(rejected)` 同样收场。已有启动记录时回复 `invalid`（`call: has-start-record`）。

### 22 跨域提交与修复

调用域与队列域没有共同事务。普通跨域推进先由调用域写 `queue` 待办，队列域再做转换，调用域最后记录推进结果并删除该待办。终局释放用于启动拒绝和原 final 的 `preserveResult`：调用域先同提交终局结果、释放依据与 `queue` 待办，队列域再删除条目，调用域最后删除该待办。启动拒绝见下面的「启动拒绝」，原 final 收场见第 26 条。

队列条目复制了调用域拥有的阶段，而队列域不能读调用域，也就不能核对条目。所以条目的生命周期靠三件事守住：创建条目的提交断言它所依据的调用域修订号，只凭调用域里的依据释放，条目记录移动它的操作号。队列域只保存活条目与计数器：已释放是调用的事实，归调用域，队列域不为它保存任何记录。

- 认回：条目的 `operation` 是最后移动它的操作号。`enqueue` 与 `prepareStart` 的队列步骤遇到已越过本步的条目时，同一操作号认回，另一个操作号回复 `conflict`，所以重做不会产生第二个条目或第二次持有，别的身份也不会借走已移动的条目。创建步骤（admit 的序号分配与 `planPreparation`）遇到仍是 `preparing` 的条目按调用认回：两个入口创建的是同一个条目，且这一步不移动它；遇到已越过 `preparing` 的条目时，只有移动它的操作号认回，其余回复 `conflict`。
- 创建断言：创建条目的步骤（admit 的序号分配与 `planPreparation`）先读调用域，只在调用仍是 `accepted` 时继续，并在创建条目的队列提交里以记录仓的同租户读集断言（`asserts`）断言它读到的调用域修订号。释放依据总是先由调用域的一次提交记录（启动拒绝的收场提交、原 final 的 preserve 提交），那次提交推进了调用域修订号，所以在释放之前读过调用域的创建提交落盘时断言失败，什么也落不下，不论创建提交回答未知、延迟落盘、之后读取失败还是进程崩溃；断言失败的步骤重读调用域再判断，已收场的调用按调用域的现状回复 `stale-revision` 或其所在阶段（`invalid`，`call: phase:settled`），不留条目。所以已释放的调用在它的 key 里永远不会再得到条目，不依赖谁先读谁先写，也不依赖队列域记住任何历史。模型 [SettlementRelease](verification/models/README.md#原结果与队列释放模型) 的 NoResurrection、NoDoubleHold 与 QueueHoldsOnlyLive 守住这一条，负控 `create-without-assert` 与 `queue-before-call` 分别去掉断言与调换顺序。
- 释放依据：只有调用域持有释放依据时才删除条目；释放提交只删除条目，不写别的记录，没有条目的调用没有队列提交。依据由 `releaseBasisOf` 从调用记录读出：启动前拒绝保存的排除证据（`startRejection`）。仅逻辑收场（`settled`）不是依据，因为它不证明名额已空（契约 P02）。已启动执行只从已 settled 且 `execution.ended` 持有的可信原 final 构造 `physical-end` 依据（第 26 条），不能从任意 terminal、通道结束或 disposer 推断。`releaseQueue` 在收场提交之后重读调用域取依据，没有依据就不释放，也不关闭 `queue` 待办。

- 启动拒绝：调用域先收场，队列域后释放。释放失败时命令回复失败，`queue` 待办保留。推进协程看到已收场且有 `queue` 待办的调用时，以原操作号重发同一拒绝命令：调用域认回原回执，队列域释放（条目已不存在就没有东西可写），调用域删除待办。
- 被否定答案排除（第 14 条）的 `prepareStart` 已经完成队列步骤时，条目保持 `held`，没有对应的启动提交。命令不回退这一步：回退把条目放回 `ready` 并不释放名额，还会与另一个进程对同一操作的重做竞争。`planPreparation` 与 `enqueue` 被排除时条目保留 `preparing` 或 `ready`，调用仍在等待这一步，重做认回它们。
- 没有启动记录的 `held` 条目是待履行义务，不是启动（契约 [P02](../tool-contract/SPEC.md#p02-定义准入与队列)：名额可以先于启动记录被持有，由同一操作身份的重做对账）。调用域此时仍是 `queued`，带着 `queue` 待办。义务由该调用的下一次推进履行：重做认回已持有的条目，调用域提交启动意图；启动守卫拒绝时，义务也可以经 `rejectPending` 以释放了结。本包只在三个前提都成立时保证这一点：**这个调用被再推进一次**，记录仓与端口终会回答，宿主接受调度请求（`instances.schedule`）。第一个前提在第 23 条的三个触发里任何一个成立时成立：一轮推进因步数用尽而重调度自己；一轮推进因记录仓或端口失败结束而按重试延迟重调度；同 key 的等待者在 `prepareStart` 得到 `tool-queue` 时对账，并请宿主运行排在它前面或持有名额的调用中仍有 `queue` 待办的那些。保证是有条件的、最终的，不是「一轮推进结束时每个 `held` 条目都属于已提交的启动」。
- 对账：等待者经 `ToolLedger.queues.reconcile` 对本 key 对账一次。它先按等待者自己的调用问资格（动作 `recover`），读队列域，对排在等待者前面或持有名额的每个条目，不加围栏地读它的调用域：不经 `lookup` 与 `queryOperation`，因为它们的否定答案会写 `exclusion` 记录，把拥有者在途的重做排除在外；对账也从不向调用域写任何记录。调用域持有释放依据的条目，在一个以队列域修订号为条件的提交里删除；调用域有未关 `queue` 待办的调用报告给协程（`redrive`），由它经 `instances.schedule` 运行；被释放的调用只删去条目并唤醒同 key 的等待者，除非它同时有未关 `queue` 待办，否则不被调度运行。对账永不改变别的调用的条目阶段：不把 `held` 改回 `ready`，也不把 `ready` 改成 `preparing`，因为另一进程对同一操作的重做可能已在认回它，回退会留下已提交的启动对应 `ready` 条目。对账读取同租户同 key 的别的调用域，不核对对方的资格：读到的事实只用来删除有依据的条目或请求运行。对账答复只把同租户同 key 的调用身份交给推进协程，不经 runtime 的公开操作暴露。`reconcile` 的回复：成功时是 `{ released, redrive }`（删除了条目的调用，与有未关 `queue` 待办、请求运行的调用）；边界检查与对等待者调用的 `recover` 资格回复 `denied` 或 `invalid`；等待者的调用未受理时回复 `invalid`（`call: unknown-call`）；等待者的调用不是真实工具调用（例如 dummy）时没有队列，回复空答案（两个列表都为空）；读取失败，或释放提交回答未知，回复 `unavailable`，不回复 `commit-unknown`，因为对账没有可认回的操作身份，下一次对账重读即可。
- 同一操作由两个进程同时重做时，修订号裁定唯一写者。写者的认回与排除判断都在调用域事务里，队列域的转换是幂等的，所以不产生第二个条目或第二次持有。

本包接受的风险：

- 一个条目的调用，在进程退出之后或运行被宿主中止之后（中止的运行不重调度），既没有再被受理、被唤醒，也没有同 key 的等待者时，没有人再推进它。排在它后面的调用被它挡住，直到有人推进它。这一段由恢复扫描 `scanPending` 负责：它必须另含队列域的一遍，对每个队列域的每个条目读它的调用域，删除持有释放依据的条目，并对有未关 `queue` 待办的调用调度推进，规则与对账相同，但不限于有等待者的 key。本包的 `scanPending` 现在回复 `unsupported`。
- 已收场且持有释放依据、条目却没有释放的调用（释放提交与收场提交之间进程崩溃，没有进程内的失败重调度），仍占一个容量。key 的容量满时，新的受理在提交之前被拒绝，所以不会出现新的等待者；容量满之前已受理的同 key 等待者若已没有进程运行它们，也不会再对账。这时的修复例如恢复扫描 `scanPending` 的队列域一遍，或任一同 key 已受理调用的受理重送使它再被推进、进入对账。
- 对账的读取量随 key 下的条目数线性增长，上限是 `queueCapacity`。

### 23 推进协程

推进协程只经过账本命令写记录。它读 `loadRecovery`，按阶段与待办做一步，然后重读，直到调用等待、运行、收场或某个端口不能回答。每次最多 `ToolConfiguration.driverStepsPerRun` 步，缺省为 16。`commit-unknown`、`stale-revision` 与被否定答案排除的回复（第 14 条）都不停止推进：协程重读后重做同一步，同一身份。这三种回答都不算进展：只有提交了或认回了一次提交的步骤才算；原结果收场与 queue 修复还必须复核原 queue 待办已关闭（第 26 条），不能只凭历史主回执算作释放进展。它的操作号由受理操作号派生：`<受理>/plan`、`/prepared`、`/enqueue`、`/start`、`/started`、`/start-failed`、`/exclude`、`/reject`。所以崩溃后重做用的是同一身份，第 11 条的认回直接适用。同一进程内同一调用的运行串行，跨进程的唯一写者由修订号裁定。

一次运行结束后，协程自己决定要不要再运行这个调用，因为没有别的东西会运行它。重新推进的触发有三个，策略是配置，不是写死的值：

- 步数用尽而仍有工作：这次运行里至少有一步提交了或认回了提交的话，协程立即经 `instances.schedule` 重调度自己。整轮没有这样的一步，即回答全是被否定答案排除、修订号陈旧或提交未知的话，就没有证据说明任何东西前进了，改按重试延迟重调度，免得对一个不回答的记录仓，或一个持续排除这一步的读取者空转。
- 因记录仓或端口失败（`unavailable`）结束，或环境提供者对准备答 `pending`、`unknown`：协程在 `ToolConfiguration.driverRetryDelayMs`（缺省 1000 毫秒，1 到 2147483647 的整数，0 与超过定时器上限的值在构造时被拒绝）之后经 `instances.schedule` 重调度。上一条里没有进展的步数用尽也用这个延迟。每个调用同时只有一个等待中的重调度；`instances.schedule` 被拒绝或抛出时，再等一个延迟再试。其它失败（`invalid`、`denied`、`unsupported`、`conflict` 等）是判定，不重复。延迟是固定值；换成更复杂的退避（递增，或可替换的策略实现）由恢复扫描 `scanPending` 的调度一并评估。
- 等待者对账：见下面的「排队」。

被中止的运行不重调度：中止是宿主要它停下。重调度的定时器不占住进程（`unref`），它的释放同 `instances.install`，归排空协议（`quiesce` 与 `handover`）。除这三个触发和受理、同 key 释放、原事实 ready 及原 reader 重连的唤醒之外，没有别的东西运行一个调用；其余的缺口归恢复扫描 `scanPending`（第 22 条）。

- 环境准备：`prepared` 记下环境。`rejected` 先取得 `authority.exclude`，再 `rejectPending`，终局原因是 `environment: <原因>`。`pending` 与 `unknown` 保留准备任务，协程按重试延迟再运行，下一次运行读 `inspectPreparation` 而不再请求准备（本进程记得它问过；进程重启后没有这个记忆，协程重新请求，提供者按同一操作去重，契约 P03）。`excluded` 时停下，不启动，`excluded` 的读法见本页末的待确认项；环境端口失败时这一轮以 `unavailable` 结束，按重试延迟再来（上面的第二个触发），调用不收场。
- 排队：`prepareStart` 回复 `tool-queue` 时，协程记下该调用在等待，对本 key 对账一次（第 22 条），然后停下。对账删除了条目的话，协程唤醒同 key 的等待者；对账报告的有 `queue` 待办的调用，协程经 `instances.schedule` 运行；宿主不接受这个请求时，这次运行按失败处理，按重试延迟再来。同 key 的调用释放条目后，协程也经 `instances.schedule` 唤醒等待者。唤醒与对账是提示加修复，不是保证。
- 启动守卫拒绝：`prepareStart` 回复 `unsupported` 时，协程先取得 `authority.exclude`，再 `rejectPending`。
- 启动围栏：协程查询原 `/start-failed` 操作回执，再问 `authority.inspect`。`started` 或 `rejected` 直接按原 invocation 记录，不调用绑定。只有合规 `not-started`、没有已确认的失败标记或本协程尚待确认的绑定失败、也没有已知 live 句柄时，才取得新许可、绑定与环境，调用 `live-only` 绑定的 `start`。绑定负责暂存待发胶囊并调用 `authority.consume`。协程随后核实实际围栏，不能以绑定失败或抛错推定未启动。
- 启动未知：`authority` 答 `unknown` 时，协程解析固定请求采用的原绑定并调用 `inspectStart`，保留查到的 live 句柄。live、settled、lost、not-started 与 unknown 查询结果都不代替 authority 的 acceptance，也不在本增量保存执行事实或释放名额。查询失败保留启动待办和责任。已知 live 与 authority 的排除矛盾时停下，不重发。
- 启动失败：绑定返回失败或抛错，围栏若已受理则记录 `started`，若已永久拒绝则记录 `rejected`。未确定时用独立 `/start-failed` 操作记录固定诊断的 `unknown`，保留原启动记录、待办与名额。该标记确认后重读调用，再向原绑定与 authority 对账。确认没有启动后，以原 `/exclude` 永久排除整次调用，成功后才用 `/started` 记录 `rejected`，建立结果、交付待办并释放名额。排除失败或回执未知不终局。下一次可从 authority 认回已提交的永久拒绝。
- 失败标记认回：`reads.operation` 的 committed 才证明本驱动失败标记存在，不能从 `execution: unknown` 推断。unknown 或不可读不授权启动。not-committed 与 rolled-back 沿 P01 的否定答案排除机制处理，可能排除在途旧提交。同一协程记住尚未确认的失败，按原标记身份重试，不再调用绑定。`/started` 仅写最终的 started 或 rejected，不先写 unknown 后更换 outcome。绑定解析、许可准备与环境重连在进入 start 前失败时，仍保留原可重试语义。

失败观察在标记真正提交前随进程丢失时，新协程不能从空标记区分「从未尝试」与「尝试失败」。此时仅当合规 authority 的 not-started 已排除原 ticket 及延迟请求、且没有永久拒绝时，才允许同逻辑调用、原 start 身份重新核权并取得新 permit，形成首次受理。它不重放已受理的执行效果。已读到 committed 标记的推进不再调用 start，当前协程已观察但尚未确认的失败也不再调用 start。另一协程持旧否定读时，即使标记随后提交，它仍可能进入绑定方法。标记是调用域的失败观察，不是 authority 的派发资格。consume 先于永久 exclude 成立时，继续认回原 acceptance 与 running，不能写 unavailable 或释放名额；exclude 先成立时，旧 permit 不能形成新的 acceptance 或实际执行。正常首次启动的 acceptance 与实际 launch 各恰好一次，重复推进不增加二者。内存标记不是跨重启围栏，实际唯一受理仍依赖合规 P04 提供者。

本口径按 [#430 revision 2 的具名决定](https://github.com/nemori-ai/omne-harness-lite/issues/430#issuecomment-6285621097)取代此前附加的「marker 提交后所有并发协程都不再调用 start」保证。旧 C430-1 反例的两次方法尝试、一次实际 launch 仍是有效反例，不能声称旧保证已修复。

本增量没有诊断正文的持久化端口。`run` 不向外输出原绑定异常正文，`readDiagnostics` 仍未交付。固定的失败标记仅用于识别启动责任，不证明原异常正文已保存。发起前端口和查询端口返回的具名失败仍交回驱动。它们抛出的未知异常以同一错误对象向 `run` 调用方传播，不映射为 `unavailable`，也不因此自动重调度或写终局。原启动待办与名额保留。绑定已尝试后的失败与抛错则必须沿原围栏对账，不因捕获异常就终局或释放名额。后续查询抛错时传播该查询错误，保留尚未确认的绑定失败责任。运行成功或失败后只清除本次串行记录，不删除后继运行，也不生成额外的未处理拒绝。

- 环境值：本进程准备的环境值留在内存里。没有时协程调用 `inspectPreparation` 重新连接，失败回复 `unavailable`（`dependency` 为 `tool-environment`）。

### 本包采用的读法，待契约拥有者确认

- 环境提供者答 `excluded` 时，协程停下，不重新请求，也不收场。契约 P03 写的是“excluded 须排除全部延迟分配，才允许用原操作重新请求”：它允许在排除之后用原操作重新请求，没有规定由谁、在何时重新请求，也没有规定调用是否收场。本包不替宿主做这个决定。
- 创建步骤对 `preparing` 条目按调用认回、对已越过的条目按操作号认回（第 22 条）。契约没有规定创建步骤的操作号怎样对应两个入口；要求它严格按操作号认回，需要 admit 的序号分配改用 `<受理>/plan`，由拥有者决定。
- 对账不核对别的调用的资格，也不向调用域写记录（第 22 条）。
- 容量按 FIFO key 下尚未释放的队列条目计数，上限是 `queueCapacity`。读取与受理提交不在同一事务，所以并发受理可以短暂超出容量。序号分配失败的已受理调用在 `planPreparation` 之前不计数。
- 未轮到队首或没有名额，以及容量拒绝，都回复 `unavailable`，`dependency` 为 `tool-queue`。
- 首次启动拒绝的 `unavailable` 终局在拒绝提交里直接形成，不经后续的 `preserveResult`，因为从未执行的调用没有 `RawOutput`。契约 SPEC 写的是"首次启动被拒绝时，当前宿主随后以 preserveResult 保存 unavailable 终局"。所以本包不写 `settle` 待办，写 `deliver` 待办。
- 宿主通过 `ToolDriver.run` 传入本实例的身份，执行引用的代次固定为 `1`。真实代次由后续的 `claim` 铸造。
- 写命令的主体放在 `WriteContext` 旁边，资格动作是 `write`（第 19 条）。实例代次与受信通道的核对随 `claim` 实现。
- 环境拒绝形成 `unavailable` 终局。契约 SPEC 没有规定环境拒绝的终局种类，而 `ToolTerminal` 有 `failed` 与 `cause: 'environment'`。环境拒绝的证据与清理责任尚未保存。
- 启动守卫在队列事务之前核对，不与名额裁定同事务。之间的资格变化由启动围栏的失效排序覆盖（P04）。

## 验证

[可运行教学](examples/README.md)通过公开 dist 消费本页现行承诺，展示成功、完整参数失败、确认的发起前排除，以及模型可见 Tools 续读与交付解除。[独立场景](acceptance/README.md)另行维护其装配与判据。教学不是新增行为契约或生产耐久证据。

[tests/README](tests/README.md) 列出每条规则对应的测试。每条测试名以本页所属规则的编号开头，`vitest -t` 可按编号单独运行。

文档导航见 [index](index.md)。

## 普通调用重入的实现范围

本实现采用契约 [普通操作](../tool-contract/SPEC.md#342-普通操作与实例目录) 的来源拥有方案。runtime 无调用身份 mint 依赖，也无关联缓存；source.resolve 拥有唯一键。来源或准入任一认回时 accepted.recovered 为 true，原回执与当前 lookup 分开。当前状态为 accepted、preparing、queued 或 starting，以及查询未知时可补 wake，running/settled 不补。

`ToolInvokeAuthority` 由来源提供者拥有，显式检查当前 tenant/consumer 资格及稳定主体。配对 guard 复用同一 authority 核对原主体与完整绑定；ledger 对当前凭据继续核调用及 scope 授予。测试来源提供者明确为非耐久，在同步写段分配保存 reservation，原子性只覆盖当前进程的同一共享实例。UUID 分配不是存储唯一约束或跨重启耐久证明。

`createTestInvocationSource` 必填 `snapshotPrincipal:(principal:P)=>P`，由凭据语义拥有者同步取得稳定、保留认证意义的视图。可变 P 必须独立捕获，真正不可变的 opaque P 可安全复用。resolve 在请求和 tenant 形状有效后、第一次 await 前取得该视图；来源 qualify 与 samePrincipal.current 使用它，原主体保存该视图。ledger 和来源 guard 的 current 仍使用本次原始 P。通用 structuredClone 或 JSON 不作为泛型 P 的认证、复制或身份协议。

快照失败答 rejected/unavailable，dependency 为 principal-snapshot，诊断不泄露异常文本；此时不读关联、不分配或写来源。来源证据摘要只覆盖 tenant、call/admission、固定请求及来源记录数据，不序列化 P。原主体由受信比较器核验，摘要不代替绑定真实性。bindings 以装配方快照隔离诊断 principal，并独立复制 tenant、request 和 invocation 等数据；返回值变异不能改写内部历史。

可选 `beforeIssue?:()=>void` 是 testing 专用的同步故障钩子，在 reservation 保存后、签发前执行。抛错答 issuance-unknown，保留原 call/admission 与 reservation；下一次同意图重入按原身份重试签发。issued 重入不再执行该钩子。它不是异步事务回调，也不增加生产端口或耐久保证。该局部修订依据 [#547 来源快照与恢复补充采用](https://github.com/nemori-ai/omne-harness-lite/issues/547#issuecomment-6288512604)。

公开 control 已实现输入封闭复制、分配新 operation、引用编码和现有 commands.control 的结果映射。非法 intent 不分配；委托抛错为带原 operation 的 commit-unknown。在途 stop 的真实 ledger 路径见[第 29 条](#29-原调用停止与释放待办)。尚未交付的控制分支返回 unsupported，身份已消耗但没有控制事实。配对 commands/reads 替身只验证门面操作对账。

当前提供者、原子步骤和有界模型的映射见 [恢复验证](verification/models/README.md)。未交付生产来源、自动恢复 scanner、完整控制或生产宿主。

## 24. 原执行事实保管（P05、P08）

本实现采用 [#431 的具名决定](https://github.com/nemori-ai/omne-harness-lite/issues/431#issuecomment-6289828424)。公开事实协议与类型仍归契约包 [P05](../tool-contract/SPEC.md#p05-执行事实与原输出) 和 [P08](../tool-contract/SPEC.md#p08-过程分页与全文交接)。以下只规定本实现的选择。

`receiveFacts` 在首次 await 前固定原 start、source、batch 和嵌套事实。凭据 principal 保持原对象交给当前 access guard，不参与 JSON 复制。边界拒绝访问器、循环、额外字段和无法保管的值。结果由装配的 ResultPolicy 验证，过程由 ContentBlock 判断验证。`write` 是受信推进方权限，不能仅凭 source owner 文本当作外部来源认证。

调用域内分存事件、批次、流和过程当前块。键采用规范元组，分别包含原 start operation、source owner 和局部 event/batch。完整原 start 与 source 固定比较，source record/revision/digest 换版被拒绝。协调实例的当前代次不代替原执行身份。当前实现只交付首次 start，不交付 resume。

先认回已知批次。同批同完整输入返回原回执，零写入，不回退后续 cursor，不重建已清除 ACK。新批 after 必须等于保存 cursor，首批为 null。cursor 不解析、不排序，旧边界与环被拒绝。一批可含多个事件及已知同值事件。事件同值只应用一次，异值拒绝整批。

process/final 全批预判成功后，以域 revision 为条件一次提交完整新事件、过程当前块或 settle 待办、原 receipt、cursor、fact-ack 与调用 revision。event 与 custody evidence 分用途，摘要覆盖原输入，任务身份覆盖用途及完整稳定定位。同 start 的同值 final 不形成第二 settle 待办，冲突 final 不覆盖原候选。首次 final 接收不建立调用的 settled 状态、结果版本、delivery 或释放依据。已结算后的同值 final 别名继承原 settled 事实凭据，不重新读取 envelope 或启动结算。

process 按原 start/index 保存当前块，并保留历史事件。sequence 用 BigInt 比较，严格增大但不要求加一。相同历史 sequence 必须同值，mode 开块后固定，closed 后禁止新更新。append 只支持 text/thinking 的累计前缀，同时固定 id、kind 和 visibility。媒体、file 和 ref append 返回 unsupported，replace 支持合法完整块。过程必须对人可见。trim 的数量、原因和历史原文持续保存，不能借 trim 绕过前缀约束。readProcess 仍不支持。普通观察经[运行时观察门面](#运行时观察门面)路由到当前代次的 handle，本包不提供真实观察源。

含 wait、continued、account 或 program-scheduling 的批次整体 unsupported，零写入、零成功回执、零 ACK。源继续持有责任。原批重投只认回原保管回执。来源确认由下述 ACK 命令推进。

`ledger.facts.read` 是实现包的恢复读口，输入精确 event evidence，返回具名 SavedFact。它逐次核 tenant/call 的 recover 资格，并核完整原 evidence，不按任意 record 文本读取。返回数据与存储脱离。pending final 恢复返回完整原 final；settled final 恢复返回 `kind: settled-final`、结果版本和结算凭据，不再读取 envelope。后继收场直接给 preserveResult 传原 settle basis，由账本决定是否需要恢复正文。

失败使用现有 ToolFailure：after 缺口或复用边界为 invalid-cursor；批次、事件、start/source 冲突为 invalid，带固定字段与原因；未知 fact basis 为 invalid。接收提交未知为 unavailable，dependency 为 ledger-store，诊断明确结果未知并要求重投原批，不伪造 operation。revision conflict 重读重判，未知提交不立即重做。端口异常脱敏。本表是本实现选择，不补写契约验证文档仍未决定的全局失败政策。

`ToolLedgerGuards.factAcknowledgements` 是必填构造依赖，返回既有 SourceVerdict，只判断来源确认。`createToolFactAcknowledgementGuard(bindings)` 与 runtime 使用同一 bindings。它恢复原 start 的绑定，经 acknowledge 重送原 receipt，再比较完整 sourceReceipt。来源与确认的 owner 无须相同。来源端口失败、抛错或返回非法 evidence 为 unavailable；只有真实合法确认与待核值不同才为 forged。诊断不暴露来源文本。

`recordFactAcknowledgement` 在首次 await 前固定 receipt、sourceReceipt、operation 与访问字段，tenant 和 principal 保持原身份与凭据。当前 write 资格逐次核验。已提交的同 operation 同输入认回原 progress，异输入 conflict，不再访问来源。未提交 operation 先核本域原 start、batch 和完整 receipt；未知 batch 为 invalid（receipt.batch），伪 custody、cursor 或原件为 invalid（receipt），均不调用来源。

pending 时在事务外核来源；失败保留任务。已确认的同值 sourceReceipt 不重送 ACK。随后携最初预读 revision 进入事务，保留 P01 排除围栏。确认状态、完整 operation 回执、待确认项移除、fact-ack 删除及调用 revision 同提交。新 operation 的重复确认也保存自身可查询回执。原 operation 的 FactProgress 保持历史值，不随后续 cursor 改写。本域提交未知使用真实 operation 的 commit-unknown，原 receipt 和任务仍能恢复；它不表示源 ACK 未发生。

验证入口为 [facts-receive.spec.ts](tests/facts-receive.spec.ts) 与 [fact-acknowledgement.spec.ts](tests/fact-acknowledgement.spec.ts)。真实账本、内存 store 与受信恢复绑定覆盖同提交、重复、冲突、未知切点、过程、重建读取、伪确认、ACK 丢答和排除围栏。自动读取组合另见下节。未覆盖生产耐久、跨进程。已保存 final 的后继收场见第 26 条。

## 25. 原事实受管推进

`recordStart(started)` 与 running 状态同提交原 start 的 facts 续读任务。它与 process、settle、fact-ack 的业务依据分开。driver-binding 的 live 键为 tenant/call/原 start，恢复使用 bindings.recover，不重新 start 已执行调用。

`driver-facts` 持有每原 start 的 session。session 包含 controller、宿主 signal 监听、iterator、一个在途 next、一个 ready 及清理 Promise。next 回调只保存 ready 并 schedule 原 call。driver 在既有 stepsPerRun 内调用 receiveFacts，再处理 fact-ack。一个批次确认前不读下一批。ready 保管失败时保持原输入，未知重投同批。ACK operation 由原 start 和完整原 receipt 的规范摘要稳定派生，重投不换身份。

driver 先修复 settled 的 queue 待办，再推进尚未终局的 settle，然后处理 fact-ack、可推进 facts 与既有准备和启动路径。ACK 故障不能遮蔽已保存 final 的收场，blocked 清理也不能遮蔽剩余 facts 或 ACK。driver 向原 live 或 recover 发送原 receipt，再调用 recordFactAcknowledgement；后者仍通过同 bindings 的 guard 独立核完整确认。ACK 提交未知沿原 operation 重试，来源已释放不能当作本域责任已消除。

每次 run 开始只捕获当时仍活动的 session signal，与本轮 run.signal 共同约束命令发起。每个命令边界读取这些原信号的 aborted 值，不新增合并监听或 Promise，也不延长 session 生命周期。已经清理中的旧 signal 不进入新 run 的边界。

run 返回不等于 abort。session 仅在宿主给本连接的 signal 有效时存活。监听注册前后都检查 aborted。abort 移除监听、取消 controller 并登记 iterator.return 与在途 next 的完成或拒绝。之后不发起新的读、调度和 ledger/source 命令；已经发出的命令不承诺撤销。清理完成前不开第二 reader，清理完成删除 session 引用。源永不完成 next/return 时，清理仍未完成，不声称已回收。

旧清理期间的新 run 保存最新待接回意图及 signal。清理完成后，仅当该 signal 仍有效才通过已有 schedule/retryDelay 唤醒。多个意图合并到同一原 start。已中止的 signal 不重调度。session Map 只提供本 driver 的资源边界，跨实例同批唯一仍归 ledger 的 revision CAS。

正常 completed 收场后，driver 按原 start 关闭 reader，汇合原 abort、return 和在途 next。关闭不作为物理结束依据，也不阻塞 queue 修复。未确认 ACK 保留原 live 或 bindings.recover.acknowledge 路由。非正常终局保留 facts 与可继续交付的 reader，晚到原 process 仍保管并 ACK，不改首结果。

流 end/throw 不生成 final 或释放名额。非正常 settled 后的 end/throw/失联按第 26 条持久 blocked facts，关闭本地 reader，不自动重新启动作者。尚未收场的连接从保存 cursor 沿 driverRetryDelayMs 重试。schedule 拒绝使用同一重试政策。unavailable 重试；unsupported、invalid 等确定失败返回 DriverStop，不自动忙循环。inspectStart settled 缺 batch/cursor 时返回 unsupported，reason 为 settled-start-facts-recovery-needs-original-batch-and-cursor，保留恢复责任。完整原事实恢复仍未交付。

[driver-facts.spec.ts](tests/driver-facts.spec.ts) 验证真实 invoke、ledger、绑定执行源与受控宿主的自动链，以及取消、在途命令、清理竞争、拒绝唤醒、流终止和原 ACK 恢复。调度快照用例只检验对应顺序；真实收场与下一同 slot 调用启动由 [driver-settlement.spec.ts](tests/driver-settlement.spec.ts) 的本地组合另验。[有限模型](verification/models/README.md#事实保管交接模型)仅检查 call 域原子 CAS 假设下的责任交接。生产耐久、生产宿主、恢复扫描、resume、完整异常源恢复与真实环境释放驱动未覆盖。

## 26. 原结果收场与释放责任

本实现采用 [#432 revision 2 决定](https://github.com/nemori-ai/omne-harness-lite/issues/432#issuecomment-6293517910)。公开操作与端口协议仍归契约包。普通调用方继续使用 invoke 及原引用，同 tenant、完整 ConsumerRef 和固定输入认回原受理。收场不重新运行作者。

### 原 final 与独立保管

W3-A 的目标表示按[材料协议 M01–M05](../tool-contract/docs/material-protocol.md)。pending final 已只保存精确封存引用，settled 只保存凭据，preserveResult 按原 basis 结算。执行结果与系统替代结果的 ResultRecord 均只保存通道引用与完整值指纹，完整 ToolResult 由读取口还原。raw 已由 Tool 材料机制保管，结果结算不再写 retainResult 完整副本。结果 CAS 解除 final 与已被替代 raw 的准备责任，并保存清理任务。仍被引用 raw 的用途转换与 TTL 尚待收口，不能据此声称全部生命周期已实现。`facts.read` 的恢复结果须区分 pending 与已结算；driver、批次认回、结算检查及 queue 释放依据均先读稳定身份，不能在结果提交后再次要求 raw/envelope 仍存在。

材料业务由本包沿同一个 call 域 CAS 实现，SQL 只提供字节与索引机制。准备意图先于字节 IO；水位、到期、租约和用途的决定使用同一域的修订条件。包括确定到期的失败答复，必要状态仍须先提交。时间不可读或回退时拒绝新时间判定；已确定提交及已授权删除可以继续认回。旧路径未完成迁移前，不称 W3 文本生命周期已实现。

`preserveResult` 使用 WriteContext 和原事实 basis，首次 await 前固定 basis 与执行定位。它逐次核当前 write 资格、tenant/call/instance/generation，先按 operation、basis 和执行身份摘要认回。尚未提交时才核 expected、原 start、当前执行与 settle.basis，恢复已封存的本域 final。raw、真实 terminal 和 effect 由原 final 取得，调用者不能另传替代正文。材料读取和外部保管之后均重核原调用资格。最终 value 从同一固定返回及采用归一化产生，不能要求它与卸载前的源展示值逐字相等；其完整派生依据和最终材料须在提交前验证。不同操作竞争先按 expected 返回 stale-revision，刷新后返回指向原 settledBy 的 conflict，不产生第二原结果或 delivery。任意 terminal 外形、reader 关闭、通道 end/throw、取消受理和 disposer 都不构成物理结束依据。

账本通过第五构造参数的 materials 准备最终通道。每个槽位绑定原 settle 任务的 operation 及固定 final，不随竞争协调者的命令 operation 改变。准备记录持有独立耐久依据，提交未知时认回同一材料，不能把已准备材料当孤儿。字节 IO 不放进 CAS 重试的纯决定器。同身份重送保持原值。明确失败保持原失败；材料仓未知或抛错返回材料依赖不可用，不冒充 call 的 commit-unknown。尚未确认封存时不建立终局或释放依据。

确认保管后，一个 call CAS 同提交唯一 original 版本、通道引用、真实 effect、原 consumer 与 pending delivery、execution custody 的 raw/final/materialized 凭据、settled 状态、execution.ended、preserve 回执、全部同 start final 别名的 settled 凭据、deliver 和 queue 待办，以及全部必要 release、清理和 clock 责任。W3 同一次结果提交固定各通道用途和正文 activatedAt/expiresAt，解除被最终通道完整替代的 raw 用途并保存清理任务。成功提交后的重试认回原期限，不重新起算。字节仓库与 call CAS 分步确认，任何一方未知都不冒充两者共同提交。前台关系成为 final，后台保留原关系。已确认的外部保管不因后继冲突而声称撤销。未执行替代结果仍用 synthetic 保管种类，不伪造 raw 或真实执行账目。

所有待写 operation 都受第 14 条的首次读取排除围栏保护，包括同提交自动 canonical plan 的身份。任一身份出现更新的否定围栏就停止本次提交。已提交回执认回优先，首次读取已看见的旧围栏允许同身份新尝试，并在成功提交时清除。自动计划回执不得覆盖其他种类或异输入回执；preserve 与 canonical plan 使用同一 operation 也 conflict。每次入口核当前 write 资格，CAS 每次重读重新核本域前提与完整历史保管闭包。

### call 与 queue 的独立提交

主收场回执只证明 call 提交。即使认回已提交 preserve，也必须继续 releaseQueue tail，不再次准备材料或重写结果。它重读已 settled 且可信 execution.ended 的原 final 依据，随后 queue CAS 删除 entry，最后 call CAS 关闭原 queue 待办。各域的 dropped/applied unknown 分别保留原操作和责任。迟到的 order 提交由它对调用域修订号的断言挡住（第 22 条），call 与 queue 没有共同事务。启动拒绝保持第 22 条的原排除路径。

driver 从原 settle 或 queue.basis 取得稳定事实凭据，以原 execution、task.operation 和当前 expected 重送 preserveResult。它不先调用 facts.read，也不注入材料恢复读口。成功后重读 loadRecovery，确认原 queue 待办消失才报告释放进展并 wake 等待者。任务仍在则返回具名 blocked `the original queue release is still unconfirmed`，避免把历史回执当作进展热循环。读取失败保留实际 failure 与适用重试。driver 取消后不发起新的结算命令或 wake。已经进入账本的结算命令继续承担原操作责任，不因 driver 取消回滚其可能已经提交的结果。等待者 reconcile 可先修复 queue，原调用仍负责关闭自己的待办。

### canonical 环境计划与报告核验

正常 completed 只在全部历史 process 引用已有独立保管时自动形成 canonical 环境计划。闭包检查完整历史事件，按完整 ref 比对已保管 raw.content 或最终 attachments；inline/text/thinking 原字节由本域保存。旧 file 只有地址时不能推定覆盖。计划与原终局同提交，固定原 preparation、resources、环境 adoption 和刚确认的 retained 证据，不能留下终局已成立却无人负责规划的窗口。

`planRelease`、`recordRelease`、受限 `recordTask` 使用 Mutation，仅有 operation，没有 caller expected。三者在首次 await 前固定业务输入，固定副本用于当前资格核验与域 CAS 重判。public planRelease 核原准备、资源、可信 ended、原 retained、completed 及全部历史闭包。它按 preparation 唯一认回原 ReleaseRecord，新 planning operation 可以保存 alias 回执，但不创建第二环境 release 身份或 task；原任务关闭后也不重建。缺证据或非正常 final 返回具名 unsupported，保留 blocked 清理，不接受调用方新造 custody 字符串解锁。

`recordRelease` 先认回自己的原观察回执，再核完整 canonical 记录。reported released 必须由原环境 inspectRelease 返回同一完整 evidence 确认，不仅比较 owner 文本。核验失败、抛错或 unknown 不清任务。pending/unknown/rejected 保存固定观察及操作回执并保留 release 责任，rejected 可 blocked。released 将确认、回执和 release task 删除同提交，不改业务结果、delivery 或 effect。released 不倒退，同值重送不复活任务，异 released evidence conflict。资源 release.operation 永久固定，后续观察使用新 recordRelease operation，原观察重试仍回原回执。本入口只核验报告，不自动调用环境 release。slot 释放不等于环境资源释放。

### 非正常输出与时钟责任

failed/interrupted 等非 completed final 即使历史为空，也不证明正常输出屏障闭合。结果和物理结束可以成立，环境清理保持 `awaiting-independent-custody` 的 blocked settle 责任，不自动或公开规划释放。facts 及仍可交付的 reader 保留，原 source 后续 process 继续保管及 ACK，不改原结果，也不自动解除清理 blocked。

非正常 settled 的原 facts 源 end、throw 或失联时，受限 recordTask 只接受当前原 facts 完整 task/basis、resolution=blocked，以及 `settled-facts-source-ended` 或 `settled-facts-source-unavailable` 诊断。它用独立稳定 operation 同提交 blocked 任务、回执与当前 revision。同操作认回，异输入 conflict。done 或其他 task 种类仍具名 unsupported，不能借此清除责任。当前原 facts 任务的 blocked resolution 使用其他诊断时，返回 invalid，field 为 `resolution`，reason 为 `settled-facts-diagnostic-required`。协调 signal 取消不持久标记源失联。完整异常源恢复、额外过程保管和环境释放驱动仍未交付。

当前 final 没有实际结束 clock marker。running 计时转 unknown，保存原 segment、accumulatedMs，诊断为 `execution-end-clock-marker-unavailable`，同提交 blocked clock 任务。原 unknown 保持证据与诊断；paused/closed 保留已知累计并 closed。收场不调用晚到 elapsed、不写零、不重复累计，也不把保管等待计成执行时间。clock 未知不阻止可信结束后的 slot 释放。

[收场账本测试](tests/ledger-settlement.spec.ts)、[环境计划与确认测试](tests/ledger-environment-release.spec.ts)、[排除交错](tests/exclusion-interleavings.spec.ts)和 [driver 组合](tests/driver-settlement.spec.ts)分别覆盖对应边界。[控制与释放推进](tests/control-progression.spec.ts)覆盖原调用停止、权限收窄、旧代回包和原释放任务。它们使用真实内存 ledger/custody/executor 与受控宿主，不能证明生产耐久、跨进程或断电恢复。[有限收场模型](verification/models/README.md#原结果与队列释放模型)只检查其明确有界范围；完整计时、未交付控制分支、scanner、真实环境后端、完整异常源恢复及 late-result 仍未覆盖。

## 27 固定结果与内容读取

本实现消费 P05、P08 与 P14。三个入口在首次 await 前固定结果、引用及必要标量，附件复制五字段，主体保留合法身份。`readResult` 保留完整块分页，在返回候选页前再次核 `read-result`，撤权则舍弃候选。

`content.read` 核正安全整数 maxBytes、固定版本、完整附件关联与 `read-content`。关联来自该版本的 attachments、content ref、offloaded original.source 或 summary ref。guard 无法建立一致视图时回复 `unavailable/access-guard`。关联后、provider IO 前及最终返回边界各核一次 `read-content`。关联需五字段精确匹配已保管集合，不能仅凭同 storage/key 放行未登记描述。只比较已知逻辑地址，不猜物理别名。提供者 IO 后重读固定版本，核关联及当前资格，返回独立 byte copy。错误响应、错结果/附件、非法 offset、越界、超预算、零进度或未到已知长度的假 EOF 回复 `unavailable/content-reader`。提供者明确失败原样交回，抛错只给依赖名，不披露异常正文。

配置的 content provider 必须证明完整源长度/摘要，并把 byte cursor 绑定 tenant/call/result/完整 Attachment/bytes 投影及位置。账本不解析其私有游标，因此自身范围核验不能代替这项证明。内存 provider 只支持 SHA-256，输入输出复制，首读空文件为 offset 0、空 bytes、next null。非首读指向或越过 EOF、负数、另一附件或结果及 block cursor 均拒绝为 `invalid-cursor`。

没有原件读口，也没有原件权限：原始返回 R 不进入任何保管端口（见「最终事实的计划与结算」），`ToolLedgerAction` 不含 `read-raw`、`read-raw-content` 或 `maintain-materials`；每个动作就是一项权限，guard 不从别的动作拼出许可。最终允许后不再等待 store、provider 或另一 guard。判定点之后发生的撤权约束后续读取，不追溯撤回已允许候选。content provider 为 null 时有关联的字节读取明确 unsupported；原结果、交付解除、收场和调用幂等不受此配置改变。


## 28. Tools 固定结果适配器

根入口的 `createToolResultReader` 消费普通 runtime 的 `queries.readResult`、`body.read` 和 `content.read`。它不取得 invoke、control、release 或 raw。工厂提供 `present`、固定引用的 `read` 和受信消费侧的 `readReply`，不注册工具作者或生成工具定义。完整 Tools 作者由独立的 `tool-definitions` 成员拥有。reader 直接内容可保留源 text、image、voice 或 video 内容；作者和消费者须按实际输出能力作兼容裁定，不能仅凭使用 reader 宣称支持所有模态。

`read` 消费当前 Access 和固定读取参数：kind 为 result、body 或 attachment，非空 reference，after 为 null 或非空游标。调用者负责按已采用的工具参数契约完成 wire 解码，身份由受信宿主绑定。reader 不接收模型自报身份、文件路径、maxBytes 或 raw selector。工厂检查 JSON 参数预算和结果页预算。`createToolMessageResultCodec` 提供同一结构化结果的有界 codec；字节预算必须为正安全整数。

### 引用与调用

引用是公开、无状态、可解码的规范 UTF-8 JSON base64url，没有填充字符。前缀与 payload 之间使用句点。payload 数组为以下形状，首项为协议版本 1。

- `tr1` 包含 `[1, invocationReference, resultVersion]`。内部身份必须通过契约 codec，并使用其规范形式。
- `ta1` 包含 `[1, tr1, selector]`。selector 为非负安全整数索引，对应该固定版本的 attachments。正文不使用附件 selector。
- `tb1` 定位同一结果的卸载正文，不用 base64url。句点后是 call、admission、resultVersion、bodyId 四个原样身份，以单个空格分隔。身份词法不含空格，所以分隔无歧义。首屏头部原样呈现它，每个身份字符只占 1 字节，模型调用 `read_result` 时自行做 JSON 编码。
- `tc1` 包含 `[1, kind, completeReference, projection, internalAfter]`。result 的 projection 为 full，原生 attachment 为 bytes，body 文本页的 projection 为 text。读取前逐项比较分支、完整引用及投影。

解码核协议、字段数、类型、规范编码及参数预算。所有发出的开始和续读提示检查整份调用 JSON 的预算，并用同一预算实际解码内部引用及 cursor。单个凭据、组合参数或内部 tuple 超限都不能发出可续读提示。引用编码不授予权限或无限寿命，也不依赖适配器内存表。结果释放和正文到期由原拥有者判断。正文游标绑定 bodyId、表示、固定版本和位置；旧字节投影游标不能被当成语义正文游标使用。未知版本、不可定位版本或错误游标不能换成最新结果或首屏。

### 模型内容与失败

`present` 读原固定版本的首屏。`read_result` 每次读一页并生成新的 ToolResult。成功结果先给状态块，再保留源页块的顺序与 visibility，状态块身份避开源块。源 attachments 保持完整。新 data 和 original 都为 none，不转发源程序数据。原文卸载状态及 bodyReference 的 tb1 在文本中说明，并给出 kind=body 的完整调用。上层调用方继续用 P14 projectToolResult 投影，固定附件块身份后追加合法逻辑附件地址。

状态分别说明 reading、sourceTerminal、content 遍历及 original。读取 failed 原工具可以成功。content=end 只结束内容块遍历，不表示附件或卸载原文字节已读。原生附件字节回应保持 mediaType、十进制 offset、bytes、base64 和 next。卸载正文回应走独立语义页，返回可读文本、JSON 完整值或明确片段、JSON Lines 完整记录，并带固定正文身份、位置、总字节数和期限。正文页不要求模型解码 base64，不把片段冒充合法 JSON 值。

已知 ToolFailure 映射为固定错误码，保留受支持的 denied 动作说明和 not-found 的 target、reason。失败结果没有源内容、源附件或 next，不转发提供者诊断。元调用 completed 表示命令答复，不代表源读取成功。未知异常、非法作者输出或保管失败仍归既有故障管线。

### 预算与收取

构造时固定 JsonLimits 和三个正安全整数预算。resultPageBytes 必须来自所装配 runtime 的相同配置。replyMaxBytes 限制完整新 ToolResult 的 JSON UTF-8 字节。contentPageBytes 限制附件字节，也作为正文页首次请求的字节预算。每个完整块必须装入一个 resultPageBytes，完整回应必须装入 replyMaxBytes。预算不足返回固定 unsupported，不截块、凭据或 schema。固定错误无法在预算内单页交付时，构造同步抛 TypeError。

正文页先读取最多 contentPageBytes，再按实际 JSON 回应检查整块与完整回应预算。超限时沿同一游标减半请求预算。文本及 JSON 文档的下限为首个完整字符的 UTF-8 字节数；JSON Lines 的下限为首条完整记录加 LF 的字节数。不能裁短正文却沿用较远的 next。达到下限仍超限时，文本返回 unsupported，JSON Lines 返回 record-too-large 及记录字节位置。每次重读重新准入，最多 ceil(log2(contentPageBytes)) + 2 次。正文页不递归卸载。原生附件与内容块遍历保持原独立预算。

源页加状态后可使新元回应再次分页。受信消费侧在调用收场后使用 readReply，沿同一 resultVersion 收齐新元回应，再投影给模型。它不生成第三个模型命令，不递归包装回应。每页 value 和累计完整 ToolResult 都受 replyMaxBytes 限制。累计大小只计一次共同元数据，再逐块增加 JSON 字节及数组分隔符。读取次数最多 `2 * ceil(replyMaxBytes / resultPageBytes) + 1`，推导值必须为安全整数。每页仍经真实读口检查当前资格。

readReply 核固定版本及各页必要元数据。重复 cursor、非结束空页、元数据变化、读取失败、字节超限或次数超限都只返回明确失败，不交付部分内容。次数保证依赖现行贪心整块分页。替换提供者不能在该上限内结束时返回 unsupported。

[Tools 行为测试](tests/tools.spec.ts)及[类型测试](tests/tools.spec-d.ts)覆盖真实作者注册、内存 runtime 组合、再次分页、闭合参数、引用、可见 ref、失败与精确预算。它们使用非耐久内存依赖。真实模型、生产存储、Cordis 和跨进程未验证。

[模型消费组合](tests/tools-model-loop.spec.ts) 以实际 runtime、作者 codec、readReply 及 P14 连接受信宿主与模拟模型。模型只接收投影块和实际帮助，依据可见 reference、next、kind 形成新请求。测试宿主将入站参数预算与 ToolsOptions.arguments 对齐，分别保留 runtime 入站检查和作者参数检查。各新调用以新消费位置与调用引用区分，其结果归属按 reference/resultVersion 成对判断，版本字符串无需全局唯一。

## 29 原调用停止与释放待办

采用契约 [P06](../tool-contract/SPEC.md#p06-内部等待与答复) 的在途 stop 和 [P03](../tool-contract/SPEC.md#p03-环境准备和释放) 的释放推进。`control` 在同一调用事务中保存 `ToolState.controls`、原操作收据、控制主体引用和完整 `ControlDispatch` 待办。原操作收据的 control 分支以 `subject` 保存该引用，`ControlRecord.source` 的摘要绑定主体引用、intent 和原 start。认回先经受信提供者比较稳定主体，再比较输入；同主体刷新凭据可以认回，异主体返回 denied，同主体不同输入返回 conflict。CAS 竞争后的重试重新核对赢家主体。`loadRecovery.controls` 投影已保存的控制，不从任务名称推断意图。

driver 以推进者的恢复资格和原 `ToolStartRecord` 取得 recovery binding，再查询 `inspectControl`。仅当本地控制和 binding 观察都为 pending 时，driver 调用同一 ledger 的 `controls.prepareDispatch`。该入口核原收据、source 与 start，并按原 `subject` 重核控制主体的当前资格。确证 denied 时，同一 call CAS 保存 rejected 并删除 stop 待办；提交结果未知时不发送 stop。accepted 和 unknown 只继续查询，不再次核权或发送。`recordControl` 只检查推进者的 write 资格，保存原 binding 的观察；它不用推进者的 control 资格替换原主体判断。晚到确认须匹配原 source 和原启动，包括执行代次。

构造者通过 `ToolLedgerPorts.controlSubjects` 提供 [ToolControlSubjects](src/construction.ts)，并把 ledger.controls 传给 runtime 的可选 controls 依赖。旧构造形状仍可使用。缺主体提供者时，新 control 返回 unavailable；旧收据没有 subject、引用无效或解析不可读时，pending 控制不传播且保留待办。缺 runtime controls 同样不传播 pending stop。其他功能和已发送控制的观察仍可推进。

主体引用的签发、稳定主体比较、租户绑定、重建解析和当前资格由可信身份拥有者提供。Tool 不保存原 P，不把 JSON 解码对象当作 WeakSet 签发主体，也不从 admission 或当前推进者推导 controller。主体提供者故障保留 unavailable，只有明确 denied 才形成拒绝。该边界不承诺外部授权源与 stop 副作用之间的原子撤权。生产装配必须提供真实解析器；[主体测试](tests/control-subjects.spec.ts) 使用可重建测试目录，不能证明生产身份恢复已集成。

accepted 不关闭 stop 待办。stopped、already-ended 或 rejected 关闭传播待办，但不直接修改执行状态、结果、队列或环境。原 final 事实继续沿第 26 条收场。公开 control 成功提交后请求宿主调度原调用；调度提示丢失不撤销已保存的任务。

release 待办先查询原 `ReleaseRecord`，pending 时向环境提供者发送同记录。unknown 只查询。ledger 继续核验实际 released 回执；pending、unknown、rejected 或不可用均保留任务。释放不删除尚未完成的 deliver 任务。

`scanPending` 仍返回 unsupported。现有 `ToolLedgerStore.read/commit` 只处理具名域，无法枚举租户内有待办的调用。进程内调度与已知调用的 loadRecovery 不构成耐久扫描；完整恢复须由扫描端口及其提供者补齐。控制纵切使用真实 ledger/driver、可控 binding 和内存记录仓。[SQL reopen 用例](../tool-storage-sql/tests/control-subjects.spec.ts) 验证实际 ledger 提交的主体引用经过 SQLite 关闭与重开后仍可用于原主体核验；其身份目录与 SQL 宿主是测试提供者，不证明断电耐久或完整生产组合。

## 单目标转发准入

`createToolForwardRuntime(dependencies, source)` 是受信 provider 工厂。它与普通 invoke 共用来源解析之后的准入、未知映射、原调用查询和调度路径。forwarding 不调用普通 invoke，也不直接启动 executor。source 的完整固定请求原样进入 admissions，programmatic 许可及现有启动围栏继续生效。

resume 只查询来源已有槽。槽未确认时回复 association-unknown，不推断历史准入未发生。目标 identities 已知而写入回执未知时回复 commit-unknown，引用保持不变。此工厂不扩大普通 ToolRuntime 接口；宿主还须提供相同的容量预约与独立结果接收者。

SourceVerdict 的 denied 表示来源真实、当前请求资格被拒。ledger 将其映射为 denied admit，不写入新准入。forged 继续表示来源证明不匹配。共用此判定的 fact acknowledgement 对 denied 返回 denied write，保留原待确认责任，不把拒绝当作可信来源或暂时不可读。

## 最终事实的计划与结算

`ledger.finalPlanner.planFinal` 在执行记录最终事实时计划结果：核当前 write 资格与原 start，按返回声明（或失败终局的系统策略、作者已封存正文的策略）调用 `prepareResult`；超过阈值的结果在此刻由账本自己的 writer 写成系统正文并封存，返回计划后的最终事实（首屏、小通道与正文条目引用），不返回也不保存原字节。`receiveFacts` 只受理这样的最终事实，引用卸载正文时核该正文是本调用已封存的条目（`unowned-final-body`）。

`preserveResult` 从事实记录取回计划后的最终事实，按 `original.source` 找到已封存条目，固定期限并提交结果记录（模型 CommitResult/Settle）：被引用的条目置为 `linked` 并排期，其余 opened/sealed 条目标孤儿；它不读任何存储。`facts.read` 返回同一个计划后的事实，或结算后的 `settled-final` 回执。原始返回 R 不再保管：宿主在内存里解码并渲染，最终事实只携带渲染结果。

### 生命周期提交观察

`observeToolLedgerCommit` 在原记录仓确认提交后，报告结果提交、卸载、交付释放、逻辑到期和物理回收。阶段按一次提交聚合，每个阶段至多一个事件。字节数仅表示该次卸载正文的大小，不是累计磁盘用量。

涉及这些阶段的提交答复为 unknown、conflict 或 unavailable 时，只报告闭合失败类别。原记录仓抛出时报告 unknown，并重新抛出原异常。观察器不改变原答复对象，不读取正文或程序数据，不参与提交决策。观察器自身抛错不影响业务。

事件只表示当前进程观察到的答复，不承诺耐久、恰好一次或完整故障审计。进程在提交后退出可以丢事件；重试可能重复观察。材料提供者在记录仓提交前的失败不属于该观察口。Tool 不依赖遥测或 Cordis；装配方选择是否接入观察器。

### JSON 文档语义读页

JSON文档复用正文页租约、期限与资格检查，在完整UTF-8字符边界分片。游标摘要已经包含固定表示及schema身份，不能与另一正文或字节投影互换。页不重新解析或改写原文；仅首个且覆盖全部正文的页为complete，其余为fragment。Tools.read_result把格式、完整性和固定schema身份写入元数据，与原文块共同计入实际序列化回复预算。超限时缩小读取页重读，游标只覆盖实际交付的字符。

### JSON Lines 记录写入与读回

append 在受理前用 `fixJsonTree` 判断记录树并有界编码，拒绝重复键和环。编码保留数值词法，再按 writer 固定的单记录限制解析，调用固定记录 schema 校验。暂存只保存编码文本加 LF。序号、正文总量和背压沿原受理事务核对；拒绝不占用序号。已受理的同操作重试沿固定输入摘要认回，不依赖 schema 服务再次可用。seal 只合并已经验证的记录，不重新采用 schema。

读页最多扫描当前页预算字节，返回最后一个 LF 之前的完整记录。非零游标须位于 LF 之后。每条记录的有界解码限制由页字节预算派生；它不重设原写入限制，也不重新校验业务 schema。源材料已由 writer 验证且封存。空流返回空的最终记录页。首记录无法容纳时，底层返回 invalid/maxBytes，原因为 `first-record-does-not-fit:<字节位置>`；Tools 显示 record-too-large 和位置，不给截断记录或空的继续页。

ToolBodyPage 返回 JsonValue 记录及固定 recordSchema 身份。Tools 用 json-text 写出完整记录，以 LF 分隔；不能把数值词法先转成 JavaScript Number。格式、schema、位置、游标及记录文本共同计入实际回复预算。
