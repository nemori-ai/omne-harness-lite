# tool-host-local 行为规格

本页维护单机宿主在公共契约之外真实承担的行为：配置、资源所有权、失败、生命周期、并发、持久性、取消与恢复。公共结果、不变量和协议归契约包 `@omne-harness/tool-contract` 的 [SPEC](../tool-contract/SPEC.md)。本页不另写公共保证，也不能用提供者限制改写公共承诺。

下列决定已接受，由本包承担。它们在契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)中有完整记录：

- G4：宿主时钟适配器，同进程单调时钟加进程 epoch，跨进程比较返回 unknown。已实现，见[宿主时钟](#宿主时钟g4)。
- G5：第一版采用同机的启动协调器和耐久受理台账，实现 [P04](../tool-contract/SPEC.md#p04-实际发起围栏) 要求的启动排序域。本地启动协调器已实现，见下文；现有测试使用非耐久记录仓。耐久记录仓提供者尚未交付，耐久受理台账仍依赖该提供者。
- G7：本包提供登记表、Catalog、受信装载器、执行绑定与作者换代工厂。应用提供来源核验、合法设置、schema 检查、Scope、结果保管和持有者读取。见[作者装载与执行绑定](#作者装载与执行绑定)。
- G9：本包命名为 `packages/tool/tool-host-local`。
- TL-11：账本守卫的生产件、来源签发器与操作身份。已实现为纯工厂，见[账本守卫](#账本守卫tl-11)。装配接线在 `./cordis` 插件，尚未交付。

## 本地启动协调器（G5）

`createLocalStartCoordinator({ store, access, guardsOf, commitAttempts, permitRequirements? })` 返回 `ToolStartAuthority`。`commitAttempts` 不是正安全整数时抛 `TypeError`。

R2-D60（[#421 的采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6587795951)）限定本波只启动可信来源明确判定不需授权许可的完整固定动作。`permitRequirements` 的可选性只保持旧构造形状，缺席时不允许新启动。生产来源由装配提供，完整授权许可的 grant/consume 配对留在波 3。本包不从空资源、空能力列表、工具名或访问资格推导无需许可。

### 1 排序域与放置

一次调用的启动事实（许可、受理、启动拒绝、整次调用的排除、排除操作与排除标记）放在该调用自己的 `host` 域 `start@<call>`。守卫与失效操作放在租户级的 `host` 域 `start-guards`，它只随控制动作增长，与调用数无关。域名由 [host-domains.ts](src/host-domains.ts) 统一生成。热路径只读本调用的域，`prepare` 与 `consume` 另读 `start-guards`；`inspect`、`exclude` 与 `invalidate` 只读自己写的域。没有任何随租户历史增长的读取，所以每次调用的读写量与该租户已结算的调用数无关（能力组[部署无关原则](../docs/architecture.md#部署无关原则)第 6、7 条）。

宿主全部 `host` 域的放置：

| 事实 | 域 | 读取方式 | 大小随什么增长 |
| --- | --- | --- | --- |
| 启动许可、受理、拒绝、排除及排除操作 | `start@<call>` | 整读（一个调用的几条记录） | 该调用的启动动作 |
| 守卫与失效操作 | `start-guards` | 整读 | 控制动作，不随调用数 |
| 来源绑定、转发目标槽 | `source@<call>` | 按键读 | 不增长 |
| 转发收到的副本 | 父调用转发槽所在的 `source@<目标 call>`，每个交付键一条记录 | 按键读；父调用交付释放时整读该域一次并删除副本 | 该父调用目标的交付数，随父交付释放归零 |
| 结果交付记录 | `delivery@<call>` | 按键读 | 该调用的结果版本数 |
| 环境获取记录 | `environment@<call>` | 按键读 | 该调用的资源数 |
| 环境保留作用域 | `retention@<作用域摘要>` | 按键读；作用域关闭且空时删除 | 作用域当前持有的资源数 |
| 控制主体 | `control@<call>` | 按键读 | 不增长 |

`prepare` 与 `consume` 读本调用的域与 `start-guards`、做决定、按本调用域的修订号条件提交。`consume` 的受理提交另带读集断言：`start-guards` 的修订号仍等于本次读到的修订号，任一不符即 `conflict`、不写入。失效在受理读到守卫之后、受理提交之前落下时，受理提交冲突，重读看到守卫前进，回复永久拒绝（[start-coordinator.spec.ts](tests/start-coordinator.spec.ts) 在该窗口内注入失效）。两个域没有共同的修订顺序，受理与失效的先后由提交裁定：失效先提交则本次重读看到守卫前进、提交永久拒绝；受理先提交则失效落在它之后、启动在途。失效在提交之后才回复证据，所以已经回复的失效一定被之后的受理看到（P04）。这个栅栏由 [StartConsume 模型](verification/models/start-consume/README.md)检查。修订冲突时重读重判，最多 `commitAttempts` 次，用尽后回复 `unavailable`。

同一进程内，写同一个域的操作还经过该域的串行区，它只减少同域操作的修订冲突，不是先后正确的前提，也不跨域排序。

本排序域只在一个进程内验证过。两个进程共用记录仓的装配没有验证，所以本协调器不声明跨进程的启动保证（P04）。

### 2 许可与守卫

`prepare` 在首次异步等待前固定租户、调用、启动记录与完整请求，保留原主体引用。请求经契约判断器复制并冻结，不冻结调用方对象。它先核访问资格，再进入本租户串行区重核资格和当前许可需求。只有 `not-required` 携带完整 `DurableEvidence` 时才签发许可。`required` 回复 `unsupported`，采用为 `startCoordinatorAdoption`，原因为 `authorization-permit-required-in-wave2`。缺来源、未知、不可用、抛错或非法答复均回复 `unavailable`，依赖为 `start-permit-requirements`，不公开异常正文。

协调器从 `start-guards` 对 `guardsOf(request)` 的每个资源读取当前守卫修订号，从未失效的守卫是 `0`，其证据的修订号是 `start-guards` 当时的域修订号。许可不断言守卫域：签发与失效之间落下的失效由 `consume` 的第 3 步发现。许可记录保存完整固定请求、规范摘要、租户/调用/完整启动/原许可摘要的绑定，以及本次无需许可的来源证据。相同待决启动的不同固定请求回复 `conflict`。旧待决记录缺少完整绑定时回复 `unavailable`，不覆盖旧记录。请求相同的新许可可替换当前许可，但不清除已有的永久拒绝或受理。许可本身不授权执行。

`invalidate` 把一个守卫的修订号加一，与失效操作记录一起提交之后才回复失效证据。每个租户内，操作号绑定完整守卫输入的规范摘要与首次证据。摘要涵盖 owner、resource、revision、完整 evidence 与 scope 变体的全部契约字段，不受属性顺序或额外属性影响。同操作号、同输入重送时回复首次证据，守卫不再前进；同操作号、异输入回复 `conflict`，`operation` 为本次操作号，不写记录。后续失效或使用同一记录仓重建协调器不改变原操作的绑定。提交结果未知回复 `commit-unknown`，不可用回复 `unavailable`，两者都不给证据。

### 3 consume

`consume` 只能由受信执行边界调用，它在胶囊暂存之后以许可与执行者回执调用。决定顺序：

1. 该启动已有受理时回复原 `started`，已有启动拒绝或整次调用的排除时回复原 `rejected`。
2. 许可不是该启动的当前许可（摘要不同，或已被 `inspect` 收回）：有排除标记时回复 `not-started` 与该标记，否则回复 `invalid`（`permit: not-issued`）。
3. 许可里任一守卫的修订号已不是 `start-guards` 里的当前修订号：提交永久的启动拒绝，回复 `rejected`。失效先成立，所以不发起。
4. 从持久记录重新校验完整请求、规范摘要与原许可绑定。旧待决记录缺完整请求或绑定时回复 `unknown`，保留原身份。
5. 在串行区内重核当前访问资格和许可需求。访问被拒或明确需要许可时，提交永久拒绝并收回许可。需许可的原因为 `authorization-permit-required-in-wave2`。依赖不可用、缺席、未知、抛错或非法答复时回复 `unknown`，保留待决许可，不保存受理。
6. 当前资格与无需许可结论成立后，向本调用域提交唯一受理并收回许可，断言 `start-guards` 的修订号未变，回复 `started`。受理记录与受理证据包含消费时的无需许可来源证据，不伪造授权许可消费事实。本调用域或守卫域的每次冲突都重读两个域并重核来源，不沿用上次允许结果。

受理或拒绝提交结果未知回复 `unknown`。之后重送同一许可认回实际提交的原事实。已有受理或拒绝无需再次查询许可需求来源，入口的访问资格检查仍然适用。旧受理不因缺少新来源字段而消失。最终重核后来源变化仍属于已有残余窗口，本包不承诺跨来源的瞬时撤权。

### 4 inspect

`inspect` 只读本调用的域，不读 `start-guards`。它回复已有的受理或拒绝。都没有时，它先提交排除标记并收回当前许可，再回复 `not-started`。所以在这个回答之前签发的许可，在回答之后不能被受理。之后签发的新许可可以受理，这就是同一启动身份在排除证明之后的首次执行。已有标记且没有未收回的许可时，直接回复该标记，不再提交。

### 5 exclude

`exclude` 排除一个调用尚未受理的全部启动，将整次调用的拒绝与本次排除操作记录共同提交，再回复拒绝证据。每个租户内，以调用与操作号定位排除操作记录，绑定本次 reason 与返回 evidence。同操作号、同理由重送回复原证据；同操作号、异理由回复 `conflict`，`operation` 为本次操作号，不写记录。

已排除的调用收到另一操作号时，协调器提交该操作号与本次理由的绑定后，仍回复首次排除的证据，不改变调用的拒绝理由或终态。使用同一记录仓重建协调器后，所有已提交的排除操作仍按原绑定认回或冲突。首次排除与别名绑定的提交结果未知均回复 `commit-unknown`，不可用均回复 `unavailable`，两者都不给证据。该调用已有受理时回复 `conflict`，`operation` 是被受理的启动：在途执行只能由控制停止。

### 6 身份、租户与失败

每个操作先检查边界输入。缺租户、租户形状不对或缺主体回复 `denied`，然后才问 `access.qualify`：调用范围的操作用动作 `start`，`invalidate` 用动作 `invalidate`。资格拒绝回复 `denied`，不可读回复 `unavailable`（`dependency` 为 `access-guard`），这些都不读记录仓。守卫属于租户内的资源，所以一个租户的失效不影响另一个租户的同名守卫。启动的键同时含调用与启动操作号，因为启动操作号只在一个调用内唯一（P01）。

台账不可读回复 `unavailable`（`dependency` 为 `start-ledger`），不回复受理或拒绝，也不读缓存（P04：准入资料不可读时拒绝新的 consume）。台账里出现本协调器没有写过的记录时同样回复 `unavailable`。

## 环境准备的租户调度

调度位于实际 ToolEnvironment.prepare 的宿主协调入口。它消费注入的可替换策略，纯选择逻辑与实际环境获取分开。策略提供正且有限的 quantum 与租户权重、非负整数的队列容量与租户在途上限，以及取消和重试时机。无合法策略值时拒绝配置，不猜生产默认值。策略来源是宿主受信装配配置，provider 继续拥有当前租户与全局配额准入权威。

调度采用 DRR，一次新的 acquire 提交成本为 1，查询、原键认回和结清不计新提交。一个租户等待慢存储、慢 provider 或已占满时，其他租户仍可被尝试。只有全局容量满时才共同等待。每个租户内部的启动资格、许可消费和失效仍按同一事务串行域排序，调度次序不能越过本租户围栏或 FIFO。

prepare 在发出外部获取前保存原准备与原获取引用。取消、pending、unknown 和重试策略沿原记录决定等待、查询、结清，或在查询确认已分配后进入原获取的首次采用/认回。inspect 只刷新事实，不签发租约。后续同键 acquire 必须保持 acquisition、tenant、origin、scope、placement、provider 及全部获取输入不变，并且原登记、guard、ledger 有效且当前准入成立。首次采用不再次调用 provider 获取，也不重新计划、许可或接续。采用失败、已失效或已结清的原记录不复活。策略不能批准更换原键重新获取。确定的零分配配额拒绝是原键终局，合法重新排队必须由调用者明确提供新操作，不能由策略偷偷重发。查询不可用时保留原名额和任务。旧调用已经在途或持有资源时，取消与配额下降不自动返额、回滚效果或清除清理责任。

调度器消费 ToolEnvironment 的 allocated 事实时，先核其原准备绑定。inspectPreparation 只转达事实，不因策略为 recognize 就执行采用。对调用方已经请求的原 prepare，重试策略允许 recognize 且原条目仍有效时，调度器才可在查询后沿完全相同输入再次 prepare；它不新增获取成本或操作身份。wait 或 inspect 只保留或刷新原事实。allocated、pending、unknown 及尚有清理责任的 rejected 都不返额。已确认释放的条目不因迟到分配事实、重试答复或重新获权而恢复排队；每次等待后及转发前仍核原采用和条目未退休。冷恢复的原描述 allocated 不能映射成这条首次采用路径。

宿主把调用原适配器 prepare 前的本地预占与已经发出的原请求分开保存。首次派发的当前资格或原采用核验失败，且原 prepare 尚未被调用时，只撤回这次本地预占；不调用适配器释放、不报告资源 released，也不生成零分配证据。资格抛错时亦先撤本地预占，再进入下述资源诊断边界。返还本地预占不等待诊断接收完成。原身份与固定输入的绑定仍保留。

调用者以后显式请求同一原 prepare 时，仍核完整绑定和当前资格，才能重新尝试首次发送；inspect 不代发。原 prepare 一经调用，即使抛错、丢答或结果未知，也不能沿“未发送”路径返额，继续保留原查询与清理责任。已有可靠 excluded 允许同键重新排队时，新一轮预占重新记录是否已发送；该轮派发前失败也先返还本地预占。unknown、allocated 与仍需清理的 rejected 不适用。已确认释放的退休项不因该区分恢复资格。

公平性以前提为界：有限参与者、正权重、持续调度、有界 provider 答复与反复有容量。它不保证执行完成或强制回收长期 lease。验证必须通过实际 prepare 路径证明替换策略被消费，并观察 A 租户慢或满时 B 能推进。孤立策略对象的单测不能证明宿主隔离。真实耐久与跨进程提供者另验。

环境获取记录放在该调用的 `host` 域 `environment@<call>`，按原 call/operation 键读写。保留作用域跨调用：每个作用域有自己的 `host` 域 `retention@<作用域摘要>`，里面一条作用域记录（键 `scope`）和下文的收场记录，域名由 [host-domains.ts](src/host-domains.ts) 的 `retentionHostDomain` 生成，所以一个会话的提交不与另一个会话争同一个修订号。两者都只用 `ToolLedgerStore.readRecord`，不加载同租户的无关环境历史。需要当前资格的变更（许可、保留许可、交接）在提交里断言原调用域的修订号等于本次核对时读到的修订号：调用结算在中间落下即 `conflict`，重读后回复 `not-settled`。这取代了原来的守护宿主提交。

作用域记录只保存作用域仍持有的资源。每个条目带资源、`permitted`、`adopted`、停止事实（`active` 或 `unconfirmed`）与创建者引用（创建它的获取的 call、operation 与原获取绑定的摘要），不复制准备记录或请求；需要创建者时按键读它的 `environment@<call>`。作用域接手的条目（保留终端经 `permit`、保留进程经 `adopt`）活到停止被确认：作用域的任一视图都能记它的停止，`stopped(key, 'confirmed')` 先把创建者获取记录里该键的停止事实写成 `confirmed`，再从作用域记录删去该条目；`unconfirmed` 只改停止事实。没有被接手的预留只有创建者能记，并在创建者获取关闭时删去：这是关闭提交之后的第二次提交，没落下时条目留到下一次机会。`close` 把作用域标为已关闭，之后 `plan`、`permit`、`adopt` 答 `closed`；已关闭且没有条目的作用域删除记录。

收场事实按执行环境契约[停止](../../execution/execution-environment-contract/SPEC.md#停止)第 7 项保存。保留进程的停止被确认时，删去作用域条目的那次提交在同一个作用域域里写入一条按键记录 `ended/<进程键>`。作用域记录本身只保存仍持有的条目，大小不随已停止的进程增长。`ended(key)` 用 `readRecord` 读这一条记录：有记录答 `confirmed`，没有答 `none`，读不到或记录无效答 `unavailable`；它从不读整个域。提供者据此对已离开其索引的保留进程的 `stop` 答 `confirmed`。保留终端没有收场事实。作用域释放（已关闭且没有条目）时，同一次提交删除作用域记录和全部 `ended/*` 记录：释放先整域读一次作用域的域来列出这些键，提交仍以决定时读到的作用域修订号为条件，其间落下的收场事实使提交冲突，重试时一并删除。所以租户级状态与已结算调用数无关，一个作用域的状态以它的寿命为界：收场记录随这个作用域里停止的进程增长，在释放时全部删去。释放的整域读与删除提交都随收场记录数增长，受存储单次读出与单次命令的上限约束（SQL 仓的读出上限是 4 MiB，每条收场记录约 250 字节）：超出时这次提交（`close` 或最后一次确认停止）答 `unavailable`，作用域记录与收场记录都不变。

交接（保留作用域 `adopt` 原获取的资源）只写作用域的记录，并断言获取记录所在域与原调用域未变。获取记录不保存 `handedOver`：读取获取记录时按其 `retentionScope` 的作用域记录把作用域已采纳的本获取资源标为 `handedOver`；写回获取记录时，这些键保留获取自己存的停止事实，所以交接事实只有作用域一个拥有者。释放确认把获取的全部资源写成 `confirmed`（获取对它们的责任到此结束）；被交接的资源在作用域持有期间仍读作 `handedOver`，作用域确认它停止之后读作 `confirmed`。获取记录带保留作用域时，它的每次变更都断言自己作用域的域修订号未变，因此获取的变更与作用域的交接在两个域之间线性化：先提交者成立，后提交者重读重判。提交窗口内注入交接的栅栏用例见 [resources.spec.ts](tests/environment-adapter/resources.spec.ts)。单键读取的保持论证见 [单键读取](../tool/verification/proofs/record-read.md)。

保留作用域有三个状态：开放、已关闭、已释放。

| 状态 | 作用域记录 | 进入条件 | `plan`、`permit`、`adopt` |
| --- | --- | --- | --- |
| 开放 | 持有条目，`closed:false` | 首次预留 | 按条目规则判定 |
| 已关闭 | 只持有已被许可或接管、尚未确认停止的条目，`closed:true` | 作用域关闭；关闭的同一次提交移除所有从未被许可或接管的预留 | 答 `closed` |
| 已释放 | 只剩关闭标记 `{closed:true}`，不持有条目；结束事实已删除 | 已关闭且不再持有条目；进入已释放与删除全部 `ended/*` 在同一次提交中完成 | 答 `closed` |

关闭标记永不删除。它只按键读取，从不被跨作用域汇总读取，大小固定。作用域不会从已关闭或已释放回到开放。

保留作用域内各项记录的生灭：

| 记录 | 所在域与键 | 写入者 | 何时产生 | 何时消失 |
| --- | --- | --- | --- | --- |
| 获取记录 | `environment@<call>`，按原 call/operation 键 | 获取所在的调用 | 准备环境 | 不删除；它是该调用自己的冷记录，只被按键读取 |
| 作用域记录 | `retention@<作用域摘要>`，键 `scope` | 首次预留资源的获取 | 首次预留 | 不删除；释放时缩为关闭标记 |
| 作用域条目（持有的资源） | 作用域记录内，按资源键 | 预留、许可、接管 | 预留或许可时加入；接管时标为已接管 | 停止被确认时移除；从未被许可或接管的预留在作用域关闭的同一次提交中移除（创建者关闭时也可提前移除，这次提交失败不影响作用域关闭时的移除） |
| 接管事实 | 作用域条目的已接管状态 | `adopt`，断言获取记录所在域与原调用域未变 | 接管生效 | 随条目移除；获取记录不保存它，读取时由作用域推导 |
| 结束事实 | `retention@<作用域摘要>`，键 `ended/<进程键>` | 停止确认的同一次提交 | 保留进程停止被确认 | 作用域进入已释放的同一次提交中删除 |

获取记录的写入断言其作用域所在域的版本；接管只写作用域域并断言获取记录所在域与原调用域的版本。两侧都在读取与提交之间被对方提交时得到冲突并重新判定。

已知限制：进入已释放时整读该域一次，再删除全部结束事实。单个作用域内已停止的进程约超过一万六千个时，这次整读超出读取上限，释放答复不可用且不删除任何记录。删除整个域的写入原语随正文保管重建一并加入账本端口后，释放不再需要整读。

### 环境资源诊断边界

本地环境调度器消费一个受信诊断接收者。它只在执行环境跨拥有者资源操作边界适用 DP-01 的例外。资源操作原错误、封闭操作阶段及原 tenant/call/operation 关联交该接收者。原错误只在受信处理边界内使用；写入任何日志或持久记录前必须去除秘密值、原能力和解析器，访问控制不能免除此要求。保留脱敏后的原错误事实、阶段及原操作关联，查询与导出继续受当前披露权限约束。本调度器不声明诊断已耐久保存。

诊断接收者的 record 成功返回 recorded 或 unavailable。异常也视为 unavailable，但不把接收异常或原资源异常重新抛给普通调用者。接收者自身必须在受信侧处置其失败；本边界仅能通过下表的诊断缺口对外报告不可用，不递归调用同一故障接收者。记录不是释放、补偿、采用或业务提交。

公开错误映射如下，均沿现有 Reply/PreparationProgress/ReleaseProgress 形状，不增加通用结果框架。

| 触发                                      | 返回                                                            | 对资源与诊断的含义                                                       |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 资格正常返回失败                          | 保留原闭合失败                                                  | 不调用 prepare；若为派发前预占，立即撤预占。没有捕获异常就不伪造诊断事件 |
| 原采用核验不成立                          | 既有 unavailable，dependency 为 tool-environment-scheduler      | 不调用 prepare；若为派发前预占，立即撤预占                               |
| 环境资格检查抛出异常                      | failure.kind=unavailable，dependency=tool-environment-scheduler | 原请求未发送时不占额；已发出原请求的责任不因资格未知而消失               |
| 原 prepare 或原键认回抛异常               | ok.kind=unknown                                                 | 保留原获取与清理责任，不能据此返额或另开获取                             |
| 原 inspectPreparation 抛异常              | ok.kind=unknown                                                 | 不签发租约，不改变原责任                                                 |
| 原 release 或 inspectRelease 抛异常       | ok.kind=unknown                                                 | 不报告 released，保留清理责任及名额                                      |
| 策略 retry/release 在资源操作协调中抛异常 | ok.kind=unknown                                                 | 不调用后续效果、不替换原操作；已在途的责任和名额保持                     |

捕获异常的上述返回都使用已有 diagnostic 字符串给出固定安全标记。recorded 时为 `environment operation failed; stage=<stage>; diagnostic=recorded`；接收者返回 unavailable 或抛错时为 `environment operation failed; stage=<stage>; diagnostic=unavailable`。stage 必须来自封闭的 `qualify | prepare | retry | inspect-preparation | release-policy | release | inspect-release`，不来自错误消息或调用者文本。diagnostic=recorded 只表示接收，不代表持久化或资源成功。所有原错误消息、堆栈和对象属性均不进入此字符串。

工厂要求装配者显式提供诊断接收者，不能默认 no-op 并声称已记录。该依赖只适用于环境工厂，不改凭据公开面。资源适配器正常给出的闭合失败按现有契约处理，不把其未捕获的业务失败当成新异常事件。

四个环境资源动词读取当前原环境的 `adoption` 抛错时，按 `qualify` 阶段处理，并关联该次公开操作。`release` 与 `inspectRelease` 的内部准备核验也关联原 `release.operation`。正常读取后采用值不匹配仍返回原不可用结果，不产生异常诊断事件。同步 `adoption` 属性本身没有操作上下文，不伪造诊断关联。

## 凭据适配的边界

本包按[Tool 凭据端口](../tool-contract/SPEC.md#第三方凭据端口)接入 settings 秘密保管。适配器核实际秘密绑定，执行使用时重核租户、工具采用、用途与目标。秘密保管端口 `ToolCredentialSecrets.resolve` 每次交出绑定、能力与撤销句柄；适配器在解析时只用能力证明绑定并立即撤销，在 `use` 里把本次能力交给动作，动作结束后一律撤销，再返回或原样重抛。动作成功而撤销失败抛撤销错误，两者都失败抛 `AggregateError([动作错误, 撤销错误])`。撤销句柄缺失按 `unavailable` 处理，能力不交出。解析时的撤销或绑定不符时的撤销失败，撤销错误按未知错误原样上抛，解析不成功，能力也不交出；这时绑定不符的结论不另行报告。撤销后能力不再动作、错误文本不含秘密值，是秘密保管提供者的义务。当前没有真实 vault 的交付证据，接口与替身不得声明真实保管已完成。

文档导航见 [index](index.md)。

## 绑定登记表与换代协调者（G7）

本节规则由 [RFC-0012](../../../docs/rfcs/RFC-0012-tool-dynamics.md) 于 2026-10-21 采用。登记表（`createLocalToolBindingRegistry`）与 Catalog（`createLocalToolCatalog`）已在根入口实现；作者换代工厂由 `./author` 提供。公共的登记键、同键规则与保留义务归契约的 [G7](../tool-contract/SPEC.md#342-契约缺口决定)，协调者的动词与返回归 [Tool 的 Cordis 定义](../tool-cordis-contract/docs/cordis.md#换代协调者契约)。本节只写本包承担的部分。

- 本包的绑定登记表在单机、单进程内成立，登记不耐久。跨进程、远端目录与耐久存储不在本包覆盖之内。
- 两个 fiber 同时首次登记同一个键时，本地排序域决定哪一方成功，另一方得到 `conflict`。
- `./author` 的换代工厂持有作者的 `ctx.plugin` 句柄。`ensureLoaded` 通过注入的受信模块来源核验并载入实现包；`toolGenerations` 的生产 Service 接线由整套 `./cordis` 装配负责。
- 契约要求进程恢复后由 `sweep` 重装持有者采用依据记下的键。本工厂缺完整采用依据目录时返回 `unavailable`，不声称完成恢复。包字节保留由模块来源提供者负责。
- 按键排空与交接依赖契约 [P09](../tool-contract/SPEC.md#p09-账目恢复与退出) 的 `inspectDrain({ executor })` 范围。该范围交付之前，有在途调用时 `unload` 停在 `draining`。

### 登记表与 Catalog 的实现范围

- 来源核验经构造参数 `verifier` 注入，形状与 Cordis 服务 `toolContributionAuthority` 相同（`verify`、`admits`）。本包不提供核验实现，也不提供默认放行：未注入时 `register` 回复 `unavailable`。核验失败的回复（`denied`、`invalid`、`unavailable`）原样返回，不留部分登记。
- `register` 在一个同步步骤里完成来源核验、登记资格核验、键与形状核对、同键判定与写入，所以这一步就是本地排序域。调用方 fiber 由构造参数 `fiber()` 给出；它返回 null 时回复 `unavailable`。`retire(fiber)` 撤除该 fiber 的全部贡献，之后该 fiber 的登记回复 `unavailable`。
- 登记键冲突按 G7：同一 fiber、同一装载 digest（`loaded.executor.digest`）认回原贡献，其他情形回复 `conflict`。`release` 只按自己的 token 撤除。登记序号单调递增，token 不重复。
- registry 的 `snapshot` 与 Catalog 所读 live contribution 按来源层判定可见：`official` 对任何合法租户可见，`organization` 要同组织，`tenant` 要同租户，`workspace` 对任何租户范围都不可见（本包不读取工作区授权）。无法证明合法的租户得到 `unavailable`，不得到空列表。当前 view 所携带的已知定义是采用拥有者保管的普通数据，其披露资格由受信 scoped view 负责核验；不能从 key、定义内容或 registry 的来源层推导资格。
- `pins` 与 `drain` 数尚未释放的持有。`createLocalToolBindings.resolve` 通过 `selectAndPin` 原子选择并持有装载句柄；作者结束且事实全部确认后释放。`recover` 只认回本进程保留的执行，见[作者装载与执行绑定](#作者装载与执行绑定)。
- Catalog 先读应用提供的 `view`，再将其精确的来源层和资产版本与当前租户可见的 `live` 贡献求交。同名取登记序号最小的一份。没有同名 live 贡献时，可使用 view 当前保管的 `knownDefinition`。未纳入、不可披露与没有合法定义的名字都回复 `invalid/unknown-tool`。`view` 为 null 或来源异常时回复 `unavailable`，来源失败原样保留，不用空列表代替。
- view entry 的可选 `knownDefinition: ToolDefinition` 是当前受信采用拥有者依法保留的普通数据，不带 executor 或活体能力。Catalog 复用定义校验器读取冻结副本，核对 name 与 adoption 均匹配该 entry 的 key。定义不合法或不匹配时回复 `invalid`。省略此字段保持原行为。缺 live 的已知定义由 inspect 和 direct search 返回 `known-unavailable`，原因说明实现不在登记表中。它不会因 availability 允许而成为 available，programmatic 搜索也不返回它。usage 仍须取得当前 availability 的 qualification allowed，才能描述该定义。
- `view.scope` 是应用核验的租户、主体及会话范围证据，`revision` 固定纳入和披露材料版本。Catalog 不导入 Session 或 Runtime Context。`availability` 只提供可用性事实，不产生披露资格。已被 view 精确纳入的非常驻 `known-unavailable` 可在 direct 搜索中返回。programmatic 只索引非常驻、available 且显式 programmable 的项。search 按本次 view 的 resident 事实排除常驻项，不按名称硬编码；inspect 与 usage 仍可查询合法常驻项。保留搜索结果的 resident 字段形状，返回项为 false。
- 每次 inspect、usage 与 search 的异步判断结束后重读 view，比较 scope、revision 及 entries，包括已知定义的完整元数据。发生变化时首屏回复 `unavailable`，续页回复 `invalid-cursor`。重读后同步重取合法登记列表，比较 ordinal、state、定义、装载摘要和 executor 等元数据。登记换代也按首屏 unavailable、续页 invalid-cursor 拒绝，不能混合旧判断与新绑定。最后比较与构造结果之间没有异步步骤。这是两次观察的一致性检查，不承诺补齐 RC #677 的同步撤权边界。
- search 在 BM25 语料统计、排序和分页之前排除常驻项，只对合法非常驻语料评分。每工具一篇文档，只索引名称、描述、命令名称及摘要。BM25 使用正 IDF `log(1+(N-df+0.5)/(df+0.5))`，没有字段或调用历史加权。得分相同按名称的 UTF-16 顺序排列。空白查询按名称列举，非空但没有 token 或没有命中时返回空页。全是常驻项时成功返回空页，来源缺失或失败仍返回失败。resident 事实改变会使旧游标失效，即使 view.revision 没变。
- 分词采用 NFKC，拆分 camelCase 与下划线并保留完整标识。中文连续片段生成单字及相邻双字，其余字母数字连续分词。索引与查询共用版本 1 规则，查询 token 去重。
- 构造者显式提供 search 的 k1、b 与 maxCachedCorpora。k1 必须有限且大于零，b 必须有限且在闭区间 [0,1]，容量必须为正安全整数。非法配置抛 TypeError。常用配置为 k1=1.2、b=0.75，应用拥有具体取值。
- 每个目录实例持有有界 LRU，只缓存不可变分词、词频、文档频率和长度。缓存键包含完整合法非常驻排序材料与分词评分配置。文本或 resident 变化使参与语料改变时重建；仅定义或执行采用等元数据变更而排序材料不变时复用数学结构，结果始终关联本次条目。缓存不持有 principal、许可或执行对象，每次访问仍核 view 和 availability。
- 版本 2 游标是最长 192 字符的规范 base64url JSON，绑定规范查询、view、完整合法元数据、排序材料、consumer、invocation 及位置。任何绑定变化、非法编码或越界位置都回复 invalid-cursor。游标不授予权限，不采用 HMAC，旧版本没有兼容承诺。合法语料外的登记不影响排名与分页。已知定义元数据变化或贡献退役也使旧游标失效，即使 view.revision 不变。
- 执行者命令的用法文本与协议不在定义里，`usage` 对它回复 `unavailable`，不编造。
- 已知定义只在本次 view 中有效。撤出 view 后不再披露，Catalog 不按 scope 保存历史或跨调用补回定义。采用拥有者负责定义的合法取得与保管。应用当前发行 generation 的保管和跨发行历史是不同保证，本读路径不提供耐久采用历史。

已知限制：登记不耐久，只在单进程内成立；没有核验器的生产提供者（归应用装配）；工作区层不可见；`./cordis` 已提供运行时组合工厂，真实外域提供者由应用装配负责。

## 宿主时钟（G4）

`createLocalToolClock` 实现 `ToolClock`。`now` 读墙钟，只用于时刻与 `waitUntil`。`begin` 只产生标记，不提交、不计时：标记里写进程 epoch 与单调读数起点，并用本次运行的密钥给整条记录加摘要。`elapsed` 用单调读数减去标记起点，所以墙钟回拨不减少已用时间，只有已提交时段的标记会被调用方拿来问 `elapsed`，未提交的时段没有影响。

另一个 epoch 的标记（另一进程、重启之后）回复 `unavailable`，不回复数字：恢复不重新计满，也不补预算，已累计的时间由调用方的记录保管。被改动或不是本时钟铸造的证据回复 `unavailable`。`waitUntil` 按墙钟时刻等待，每次睡眠结束后重读墙钟再判断，所以回拨的墙钟不会让它提前回答；信号已中止或随后中止回答 `cancelled`。

已知限制：标记只在铸造它的进程运行内可比，不耐久；`waitUntil` 的精度是计时器的精度；单调源由构造参数给出，调用方保证它不回退。

## W3 材料时间源

本节归 #1168。独立时间工厂已实现，Tool 持久水位和生产接线尚未完成。原 G4 的执行计时采用不变。材料使用独立的 `createLocalToolMaterialClock`，工厂显式接收 wallMs 与 monotonicMs。首次以墙钟初始化；随后每次输出 `max(当前墙钟, 上次输出 + 单调增量)`，再更新本地锚点。输入须有限且处于合法时间范围，单调读数回退时答 unavailable，不退回原 Date.now 路径。这样，同进程墙钟回拨不会回退或暂停有效时间。

Tool 的原 call 域负责持久水位，时间工厂不拥有它。初次准备意图、每次激活、页准入/完成及到期裁定都在其状态提交中核样本不低于水位并更新水位。重启或另一实例的低样本被拒绝，追上后才能继续，原期限不重算。已到期事实不可逆，时间故障不阻止已经成立的提交或删除围栏认回。精确门槛归[材料协议 M05](../tool-contract/docs/material-protocol.md#m05-有效时间)。

跨停机的实际流逝依赖可信墙钟，进程内进展依赖单调源。永久坏钟下可能停止新读与新删除授权，不声称完成校时或保证回收时限。真实装配必须验证回拨、重启低样本、两实例竞争、提交未知及时间恢复。

## 缺席端口（D-07）

`createAbsentToolPorts` 返回 `toolDecisions`、`toolResourceResponses`、`toolChildren`。每个方法回复 `unavailable`，`dependency` 是端口名，`diagnostic` 写明被问的操作（`<端口>.<方法>`）。不抛出，不回复空成功。这三个端口在 M2 之后由各自的提供者取代。`toolOutputCustody` 不属于缺席端口，本包也不提供它。

## 账本守卫（TL-11）

账本在构造时固定一份守卫快照 `ToolLedgerGuards`。本包给出它的八项生产件和一个组装函数。全部是纯工厂：不建记录仓，不持有跨调用的状态，不导入 Cordis 与任何 `testing` 入口。资格裁定、主体比较与主体编码归其他拥有者，以函数参数进入；测试用替身，装配用真件。

| 键                     | 工厂                                                | 行为                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access`               | 无。由装配给出 `ToolHostAccess<P>`                  | 一个适配对象，两个视图：`guard` 交账本，`start` 交启动协调器与启动守卫。组装函数原样放入 `guards.access`，不加默认放行                                                    |
| `sources`              | `createLocalInvocationSource`                       | 见下文「来源签发」                                                                                                                                                        |
| `factAcknowledgements` | `createToolFactAcknowledgementGuard`（`tool` 已有） | 装配给出的窄代理 `bindings.recover` 认回原绑定。取不到时答 `unavailable`                                                                                                  |
| `grants`               | `createLocalGrantVerifiers`                         | 见下文「授予」                                                                                                                                                            |
| `starts`               | `createLocalStartGuard`                             | 见下文「启动守卫」                                                                                                                                                        |
| `results`              | `createLocalTextResults`                            | 一个文本块：`id` 为 `logical`，对人与对模型可见，没有数据、原始输出与附件。块先经 `defaultResultPolicy.judge`，被拒时答失败，账本随之答 `unavailable`（`result-factory`） |
| `policy`               | `defaultResultPolicy`（`tool-contract` 已有）       | 组装函数放入的就是这个对象。装配把同一个对象交给 runtime 的 `resultPolicy`                                                                                                |
| `budgets`              | `localArgumentLimits`                               | 参数解析的六项 json-text 预算的初值。每项必须是正安全整数                                                                                                                 |

`createLocalToolLedgerGuards({ access, sources, bindings, grants, budgets? })` 只拼对象和核必填项。缺必填项抛 `TypeError`（`access: missing`、`sources.guard.verify: missing`、`grants: not a Map` 一类）。预算缺省用 `localArgumentLimits`；给出的预算缺项或某项不是正安全整数时抛 `TypeError`（`budgets.arguments.<项>: range`）。

### 来源签发

`createLocalInvocationSource({ store, authority, principalCodec, commitAttempts })` 返回 `{ issuer, guard }`。`issuer` 交 runtime 作 `sourceIssuer`，`guard` 交账本作 `guards.sources`。

- 绑定放在它所命名调用的 `host` 域 `source@<call>`，调用 id 由租户与消费者的摘要确定性派生，所以读者先算出域再按键读取，一个域只有一条绑定。同一消费者在另一个租户派生出另一个调用与另一个域，读不到原绑定。
- `resolve` 的顺序：请求形状，租户形状，`authority.qualify`（`denied` 与 `unavailable` 在读记录仓之前返回），主体编码，读域。已有绑定时先问 `authority.samePrincipal({ current, original })`，不同主体答 `denied`；请求与原请求不同答 `conflict`（`operation` 为原受理操作）；否则答 `bound` 且 `recovered` 为真。没有绑定时条件提交一条记录，答 `bound`。
- call 与 admission 的身份由租户与消费者的摘要得出，所以同一输入永远得同一身份。提交结果未知时答 `issuance-unknown`，带的就是重试会用的身份：记录已写入则重试认回，未写入则重试写入。
- 存下的主体解不开（记录形状不对，或 `principalCodec.decode` 拒绝）答 `association-unknown`，不签发新身份。
- 修订冲突时重读重判，最多 `commitAttempts` 次，用尽答 `unavailable`。没有进程内串行区：先后由记录仓的条件提交裁定。
- `guard.verify` 读同一条记录，核 call、admission 与整个固定请求（含 `invocation`、`scope`、`consumer`）的摘要，再核主体。没有记录或不一致答 `forged`；读不到记录或解不开主体答 `unavailable`，不答 `forged`。
- `createLocalOperationIdentities` 的 `newOperation` 返回 `op-<uuid>`。它不读记录仓，也不区分租户：命令由账本按 operation 认回。

### 授予

`createLocalGrantVerifiers({ owner, key, grant })` 返回只含这一个 owner 的 `Map`。请求的 `scope` 与传入值的 owner、key 相等，且 `grant` 的 owner、record、revision、digest 四项都相同时答 `granted`，否则答 `refused`。没有声明的 owner 由账本答 `denied`。值由装配给出，装配把同一个范围值也交给 Agent 组装请求（D1 结论第 1 条），所以两边没有各自复制的配方。

已知限制：M2 每个装配只有一个范围，所有调用共用同一个 FIFO 键前缀（键由 owner、key 与工具名组成）。核验器不按租户或主体区分；`limits.concurrency` 随请求进入，它的可信来源不在本件。

### 启动守卫

`createLocalStartGuard({ access })` 的 `qualifyStart`：调用方式不是 `direct` 时答 `refused`，原因 `programmatic-not-in-m2`，不问资格；否则对 `access.qualify({ principal, tenant, call, action: 'start' })` 取当前答案，`allowed` 答 `allowed`，`denied` 答 `refused`，`unavailable` 或抛出答 `unavailable`。每次都重问，不缓存。

已知限制（评审 N7）：定义侧的事实，即受理之后绑定被关闭或排空，不在本守卫，由守卫资源的拥有者经启动围栏的失效表达。

### 本节的验证范围

`tests/ledger-guards.spec.ts` 用 `tool` 的真账本、本节的来源与守卫，资格用 `createTableToolAccess`，记录仓是内存仓。它证明单进程内的行为，不证明耐久、不证明资格真件的映射。主体编码与资格真件的通道还没有定（候选 U-2、U-4），交 Reduce 在 `./cordis` 插件之前裁定。

## 实例宿主与普通调用的边界

`createLocalToolRuntimePlugins` 组装生产实例宿主和实例身份。宿主在创建实例时取得身份，向 driver.run 显式传入，同一存活实例重复唤醒沿用。runtime 工厂不接受全局 instance。执行器在每次投递结果之后用一次新鲜恢复判定调用是否完成（已结清、没有 pending 任务、投递 pending 为 0）；完成的调用在没有 run 进行时退役，若有 run 正在进行则在该 run 结束时退役，重试 interval 不再重排它。同一租户的投递 run 按到达顺序轮流，后来的调用等自己的轮次；capacity 按在途的租户数计（每租户同时至多一个 run），一个租户在途加排队的 run 不超过 capacity，排队不占别的租户的名额（R2-D164、R2-D186）。超出时答 `unavailable`，`dependency` 为 `delivery-capacity`：它表示这个租户的在途加排队已满，或在途的租户数已满，不再表示“同租户已有 run 在途”。交付仍欠，由重试 interval 再推。组合测试将普通 payload 经 invoke、配对来源 issuer/guard、真实 ledger、本地启动协调器与实例宿主贯通。该证据不证明真实 SQL/Windows 端到端、claim、换实例接管或重启恢复。精确装配责任见[运行时组合工厂](docs/cordis.md#运行时组合工厂)。

## 冻结交付的持久表示

宿主冻结交付元数据、结果承诺、当时的 account、操作身份和阶段。结果承诺包含渲染通道的指纹及最终正文描述。前者覆盖 content、data、attachments、source 和 summary，后者覆盖 bodyId、表示、字节数、预览类型及期限。推送时分别核对，两部分均不得变化。冻结记录不保存第二份完整 ToolResult。结果承诺与最终版本绑定，重试不重新计算 account。

只有 frozen 阶段的推送读取正文。宿主通过同一 ToolLedger 的 delivery.read 还原最终通道，核对指纹及完整 ToolDelivery，并在推送前重核当前资格。材料不可读时交付仍欠，不返回部分结果，也不释放责任。接收方已经可靠保存后的 saved、release-unknown、released 和 done 恢复只消费元数据与原回执，不依赖正文仍可读。

这项表示迁移不新增交付阶段。原 frozen 到 saved 到 released 到 done 的提交顺序和未知操作认回保持不变。材料用途解除、期限和物理清理由 Tool 拥有，宿主记录不延长其寿命。

## 结果交付的推送退避

执行器把结果推给冻结 owner 的接收方。接收方可能缺席，也可能在场却答 `unavailable`。后一种情形实测过：Journal 拒收一笔超限提交，同一笔被重推 714 次。两种情形走同一套退避（R2-D273、R2-D282）。

- 触发：查找接收方答 `unavailable`（含缺席，`dependency` 为 `tool-result-receiver`），或接收方对推送答 `unavailable`。`denied`、`invalid` 等确定失败与接收方抛出的异常不退避，但不静默，见下文「确定失败」。推送被取消不退避。
- 交付保持待推，不算失败，也不丢。退避期内再次驱动同一交付，不查找也不推送，答 `unavailable`。
- 退避按交付记录计：首次等 `driverRetryDelayMs`（缺省 1000 ms），之后每次加倍，封顶 60000 ms。
- 每次进入退避写一条具名 warn，写到 `tool-executor` 日志。内容有交付、调用、接收方 owner、`dependency` 与 `diagnostic`、下次推送的间隔。退避期内不再写。
- 接收方答出非 `unavailable` 的结果（推送成功，或确定失败）后，退避清除。下一次故障从首次等待起算。
- 退避在内存里。进程重启后从首次等待起算。

### 确定失败（R2-D327）

接收方对推送或查找答 `denied`、`invalid` 等非 `unavailable` 的失败，或查找或推送抛出异常，都是确定失败。

- 交付保持待推，不算失败，也不丢。这次驱动答 `unavailable`，`dependency` 为 `delivery-receiver`，与其他未完成的推送相同。异常在这一次推送内收束，不使同一调用的其他交付停止。
- 每次确定失败写一条具名 warn，写到 `tool-executor` 日志。内容有租户、调用、交付、接收方 owner，以及原因：失败答复的 `kind` 与其命名字段，或异常的名称与消息（最多 200 字符）。
- 不退避：下一次驱动立即再推，节奏只受 driver 重试间隔约束。因此每次再推也写一条 warn。
- 确定失败清除该交付的退避。

### 退避表项的生命期（R2-D327）

退避表项属于交付本身，表的大小只与正在进行的交付有关。表项在这些时刻释放：

- 接收方答出非 `unavailable` 的结果：推送成功或确定失败。
- 一次 run 结束时没有看到该交付仍待推：交付已保存、已释放、已完成或不再存在。run 被取消或读取不完整时不据此释放。
- 调用被撤权：驱动入口或 run 内的访问判定答 `denied`，释放该调用的全部表项。
- 执行器放弃调用：调用退役，或调用已由另一实例执行。执行器经 `release` 释放该调用的全部表项。
- 交付 worker 关闭：全部表项清空。

`pacedEntries()` 返回当前表项数，执行器的 `diagnostics()` 以 `pacedDeliveries` 带出。

## 作者装载与执行绑定

`createLocalToolLoader` 先核来源及登记资格，再读取该来源层的合法设置。它调用实现模块、派生定义并运行 `judgeToolDefinition`，最后等待注入的 schema 检查。任一步失败都不发布装载句柄。合法设置、来源真实性与 schema 提供者由装配给出；本包不推导设置覆盖规则。

`createLocalToolBindings` 在登记表内原子选择并 pin 装载句柄。首选请求记下的键，包括 draining；回退只选同形、可访问的 live 贡献，并取最早登记的一份。绑定按 tenant/call 固定请求，按 tenant/call/start 认回执行。它核原 executor 与 permit 身份，先完成 `authority.consume`，再调用作者。未知消费不进入作者，不重放消费或执行。

同一绑定为其他调用取得 pin 时，登记表在同步步骤中核对原注册仍在且该租户可访问。原注册撤除后，同键后继不能替它提供 pin；即使后继复用了同一个装载句柄，也属于另一注册。已保留的原 start 仍认回原结果。参数解析、执行和结果转换使用同一次选定的命令操作，未知命令在消费许可前拒绝。多命令工具的参数是整次调用（D-94）：执行前与结果转换时，绑定都先用 `commandArguments` 按定义的编码切出固定请求所选命令的参数，再交给该命令的参数解析。调用点名别的命令、无法解码，或该命令的参数解析答 `invalid` 时，执行失败，不改用调用点名的命令。失败原因是 `describeCommandArgumentsRejection` 的文本：先写原因，后接所选命令的 guide，模型读到它（D-104）。参数解析答 `incomplete` 时只写原因。

启动输入确定无效时，绑定释放本调用尚未使用的解析 pin。合法重试须重新取得原注册的 pin。已经发起或结果未知的执行不受该清理影响。同形回退的 executor 与固定 start.executor 不同时，本实现仍拒绝启动并释放未使用的 pin。该回退如何衔接固定请求与实际执行来源，仍须 Tool 账本、Driver 和绑定的组合承担者闭合；当前作者工厂不声明这条路径可执行。

每个作者执行有独立 signal、事实流和控制记录。停止先返回 accepted，作者实际结束后才变为 stopped。事实按 cursor 重读，确认按 batch 认回；作者已结束且全部事实已有保管回执时解除 pin。未知返回、失去观察或保管失败继续保留责任。Scope 与最终结果转换是显式构造依赖。该执行绑定只支持 live-only，不承诺跨进程恢复。

作者返回值与 Scope 收场结论分别保存。绑定在作者返回后同步调用 `finish` 关闭新受理，把原 outcome 与完整 `closing` Promise 交给受信 `settle`。`settle` 须先保管原 R，再等待收场确认，不能因收场失败改写原 outcome。绑定的原 attempt 持有待结算输入；只有 final 确认并发布后才解除这份本地持有，回调抛错或保管拒绝不解除。该本地持有不是耐久回执，也不提供跨进程重跑作者的许可。

生产结算先使用原作者 codec 保存 R；收场仍 pending 时不发布 final，unknown/unavailable 时保留原件并报告未结责任。已确认的收场失败可以产生失败终局，不能产生 completed。控制身份在收场确认时核原 tenant/call/start/operation，原 stop/withdraw 若在该确认前导致取消，保留其身份；确认后的控制不能改写这次收场事实。`finish` 同步抛错或异步拒绝全化为收场 unknown，原 R 保持不变。定制 `settle` 也须履行上述顺序与屏障义务；本地 Promise 不进入数据契约或持久证据。

W3-A 按[精确 final 协议](../tool-contract/docs/material-protocol.md#m02-精确-final-与重放)迁移宿主事实缓存。绑定通过 Tool 的保管分面先登记准备责任，再封存这次真实 final。batches 与 settled lookup 只保存引用及指纹；FactReceipt 允许移除宿主重传缓存，不解除 Tool 的归一化用途。失去 live-only 连续性仍按原限制报告，不凭封存引用声称能重启任意作者函数。

正文 writer 由受信装配绑定原调用、执行代次和固定声明，再注入本次执行 Scope。作者不能提供这些身份。Scope 关闭时先拒绝新的正文操作，再通过 Tool 的正文写入端口确认已受理责任的保管或排除未受理操作。仅有本地 Promise 完成或 disposer 返回，不构成交接凭据。关闭答复未知时保留未结责任，不发布 completed。

runtime 退出先停止新调用和 writer 新受理，再等待未登记操作完成登记或得到明确拒绝，最后释放本地执行持有。材料与账本依赖须存活到交接完成；依赖提前失效时报告 unknown 和未交接责任。后继 runtime 通过原调用的正文恢复端口接续持久库存，不复用旧 Scope，也不重新执行作者业务函数。该恢复只处理正文写入责任，不扩展上述 live-only 作者执行保证。

受信装配可通过 bundle.recoverBodies 发送原调用的正文恢复唤醒。该入口重新取得原 source 的主体并核当前资格，拒绝时不入队。已结算或没有 start 的调用不入队；其余以 body-recovery 用途进入有界索引。该用途不执行普通业务 driver，也不发布旧 execution。queued 只确认唤醒，不确认材料恢复完成。容量不足保留持久库存，由后续扫描重试。原调用认回仍可触发相同恢复。

正文恢复与调用事实推进独立。片段提供者不可用或不返回时，不得阻止已取得的最终失败结果结算；结算可明确放弃不再采用的正文。每个调用至多有一个在途正文恢复，整个宿主至多有 capacity 个。调用退役不提前归还仍在执行的恢复名额；操作终结才归还。诊断保留恢复失败类别及在途数量，不把普通调用推进成功解释为正文恢复成功。

`./author` 导出 `contributeTool`、`createToolAuthorPlugin` 与 `createLocalToolGenerations`。作者插件静态依赖 toolBindings/toolGenerations，不提供服务键。贡献登记与撤除配对到作者 fiber 的 effect。服务适配器必须在普通函数中读取调用时的 `this.ctx`，用同步调用作用域把 fiber uid 传给登记表；箭头函数捕获提供者 Context 会产生错误归属。

换代工厂接受长期宿主 Context、受信模块来源、装载器与持有者读取。来源适配器负责在 import 前核实现引用和包 digest；工厂先核权限，才调用它。相同键和 digest 认回，draining 不认回。确定性装载拒绝通过 `recordRejection` 保存依据后返回 rejected。引用读取失败保留并 reopen；有 pin 时保持 draining。没有完整的持有者采用依据目录时，sweep 返回 unavailable。该返回保留契约已有的目录缺口。

[作者装载测试](tests/author-loading.spec.ts)验证装载及拒绝；[执行绑定测试](tests/author-binding.spec.ts)运行全部 23 条 N7 判据；[真实 Cordis 测试](tests/author-generations.spec.ts)验证 fiber 归属、失败撤除、排空与读取失败保留。外部来源、设置、schema 检查、启动 authority 和结果保管在这些测试中是测试提供者；不据此声明完整 runtime 装配已完成。

[绑定回归测试](tests/author-binding-regressions.spec.ts)验证注册化身隔离、多命令的参数与操作选择，以及拒绝启动后的 pin 清理。跨 executor 同形回退的用例只证明安全拒绝与清理。

## 具名偏离：热换代作者保留


按 [R2-D63](https://github.com/nemori-ai/omne-harness-lite/issues/421#issuecomment-6591819035)，本批只保证首次装载，以及 Reader 仍在但读取失败时保留贡献。持有者存在时热撤 Reader、协调者换代不撤作者的完整配对留在波 3。当前服务撤除会由 Cordis 卸载作者，贡献随之丢失；不宣称冻结契约的热换代保留义务已经兑现。上游 tool-cordis-contract/docs/cordis.md 的完整目标保持不变，不能把本偏离当作对其改写。

## 单目标转发来源与保管

来源绑定及转发结果读回经 `ToolLedgerStore.readRecord` 取得精确消费者槽。它们不加载同租户的无关来源记录。返回的域修订号仍用于原 CAS，原主体、当前资格、完整请求、结果摘要和退休状态的检查保持不变。

`createLocalInvocationSource` 可选的 forwarding 配置提供惰性 start authority 与精确发行采用判定 isParent。缺少配置只禁用转发，普通调用保持原行为。来源逐次核父 CallRecord、完整 request/start、原主体和当前 consumer 资格，并要求 authority.inspect 证实 consume.started。prepared start 本身不授予转发。父历史 settled 不阻止原槽恢复与结果接收。

同一父调用只有 execute 槽。consumer owner 固定为 `@omne-harness/tool-host-local/tools-forwarding`，work 是父 call，position 为 execute，purpose 为 tools-target。普通 issuer 在读取关联前拒绝该 owner。来源自己生成 consumer；应用 prepareTarget 只提供业务目标。目标 scope、requesterScope、context、workspace、resources、limits 与 mode 继承父请求，batchDecision 为 null。目标 settings 和 environment 来自目标采用。

原槽、父证明、完整固定目标与 principal 在目标调用的 `source@<call>` 域同一次 CAS 提交；目标调用 id 由父调用的转发 consumer 派生，所以该域也只属于这一个父调用的 execute 槽。接收到的副本是普通副本（C6）：每个交付键一条记录，键为 `<槽键>/delivery/<交付键摘要>`，放在同一个域里，保存与读回都按键进行，槽记录本身不随副本增长。副本随父调用自己的结果交付释放：交付 worker 在父调用的交付记录到 `released` 之后、标为 `done` 之前，调用来源的 `releaseReceivedCopies`，它整读该域一次（只有这一个父调用的槽与副本，大小以该父调用的扇出为界）并在一次提交里删除全部副本；删除没落下时交付停在 `released`，下一轮再释放。不是转发父的调用不读不写。已存槽优先认回，不以最新设置替换。recoverBinding 只读取与 tenant/call/admission/完整固定请求匹配的持久主体投影，核 direct 原 mint 或 forwarded 记录摘要；它不返回活凭据，不做当前资格授予。运行时据该投影向身份拥有者重新取得会话工作主体，再调用 guard 核原主体、direct 来源或 forwarded 父证明及当前资格。任何一步失败均不启动 driver；不把转发恢复成 direct。当前 programmatic 启动仍受 M2 拒绝限制。

source.receiver 在同一关联内保存完整交付和 saved 证据。接收先核当前资格、原目标引用、完整 consumer 与交付关系。只有 durable store 确认提交后才 saved。提交未知回复 outcome-unknown，生产者保留 owed。读回比较实际 payload 摘要和原键，并核 receiver evidence，不能只相信 stored digest。result、late version 与 account 的键分开。

配置 `forwarding.results` 后，`source.forwardedResult` 按原引用和固定结果版本读取消费方保管的副本。该配置提供 read-result 访问守卫、结果策略和正安全整数页预算。未配置时回复 unavailable。读口核原 call/admission、consumer、转发关联、原主体与当前资格，再核完整交付摘要和 saved 证据。它不能把账户记录或另一版本当成本次结果。损坏或无法确认的副本拒绝读取，不回退成成功。材料读取及关联核验后重新检查当前 read-result 资格。

消费方分页复用 Tool 的完整内容块与固定游标规则。原生附件和卸载正文仍沿各自读口，保管副本不延长正文期限。Tool 普通查询在生产侧交付已释放时仍拒绝读取。应用仅在该明确状态下，把 Tools 的读取转到消费方读口；授权拒绝、存储不可用等失败不得触发回退。runtime bundle 退休后拒绝新读，也不交出退休期间返回的迟到结果。此读口不新增存储副本或回收任务。


`createLocalToolForwarding` 惰性取得 runtime、forwarding、catalog、consumer profile、目标 prepare 与 reader。source/admission 尝试受正安全整数 attemptMs 约束。目标观察预算为零，只查一次状态，未 settled 即 pending。预算或父 abort 只结束等待，provider 继续承担已经发起的 promise。scope.finish 关闭新调用和等待，不发送 stop。provider.close 禁新工作、关闭 attachment 的等待并等待在途操作收口，返回 pending 与仍未知的原父数量。close 不能证明未知准入已撤销。

execute 在入口核 live 与原固定 intent 并启动 provider work 后，provider 就承担该次 prepare、来源关联和准入。父 finish、abort 或观察超时不取消这项工作。继续时使用父固定请求解出的原意图，不因调用方随后修改参数而改目标。close 先禁新方法并结束观察，再等待已接受 work 收口。

如果已经向调用方回复 association-unknown，晚到的 prepare 明确失败而未写入来源槽，原父 forwarding 引用仍无持久终局可查。当前实现保留这项未知，不创建失败台账，也不自动建立新槽。close 可返回 pending 为 0、unknown 大于 0；进程内 work 已结束不表示外部引用已解决。unresolved 集合只记录本 provider 已发出的未知引用，后续原槽确认才清除，不是效果或失败权威，也不提供全局重启扫描。

运行时 composition 对普通和 forwarded source 共用 known-call 预约，并在 provider facade 注册独立 receiver。host capacity 至少 2 才能同时拥有父与目标；capacity 为 1 明确 unavailable。资源并发为 1 时目标可排队，父返回 pending 后释放资源，目标继续推进。全局重启扫描仍未支持，恢复限于已知原引用。

验证资源是 [来源反例](tests/forwarding.spec.ts)、[接收故障](tests/forwarding-receiver.spec.ts)、[能力收场](tests/forwarding-capability.spec.ts) 和 [组合验证](tests/runtime-composition/forwarding.spec.ts)。组合测试使用真实 Cordis、ledger、启动协调器和执行绑定，存储及外部环境是显式替身，不证明真实耐久或跨进程运行。

## 目标请求当前资格

host-only `ToolRequestAccess.qualify` 接收真实 CallAccess 与完整 FixedToolRequest，返回当前 AccessVerdict。应用拥有规则解释和当前代次。ToolHostAccess.request 可配置该端口，装配将同一端口传给 local start guard 与 coordinator 的 requestAccess。未配置时保留独立提供者的既有行为。配置后缺答复、坏答复或抛错均为 unavailable，不获得启动资格。

start guard 先保留 M2 programmatic 围栏，再核当前调用身份，最后核目标策略。策略 denied 为 refused。coordinator 在 prepare 和 consume 的每次 CAS 重试中，于当前调用身份核验后、permitRequirements 前重问目标策略。prepare 的 denied 直接拒绝；consume 的 denied 用既有 rejected 与 exclusion 保存未启动事实，unavailable 保留 unknown，不写 acceptance。

consume 与 inspect 先认回原 started 或 rejected 历史，不用新规则改写既成事实。新增策略不撤销已发生副作用，也不提供外部撤权与存储提交原子同步的保证。验证见 [请求策略反例](tests/request-access.spec.ts) 和 [真实执行绑定组合](tests/runtime-composition/forwarding.spec.ts)。

## 材料维护的关闭边界

createLocalToolMaterialMaintenance 封装 Tool 的窄维护入口，提供 expire、reclaim、scan 和 close。维护作用域先登记进行中的操作，再调用端口。close 同步停止新受理，并等待全部已受理操作返回。重复 close 返回同一个完成 Promise。

每次调用账本 read/commit、材料 clock.sample、inspectErase/erase、维护资格或候选扫描之前，都同步检查作用域。关闭后不得发起新的能力调用。关闭前已受理的单次提供者操作可完成其内部有界步骤，close 不撤销提交或外部删除。一直挂起的操作使 close 一直未完成；应用 deadline 只能报告未完成，不能强报成功。

关闭后不向调用方交付成功结果。返回 unavailable 时明确已受理步骤可能完成，不推导“未执行”。已发生的删除和未知提交依原账本的 cleanup/deleting 及操作身份恢复。新作用域继续使用原存储；普通业务账本不受维护关闭影响。

scan 固定原主体、租户、时刻和游标，读取之前及返回之前检查当前扫描资格。候选源不授予维护权。此独立工厂不启动定时器或注册 Cordis 服务；生产轮询和提供者撤除次序由应用装配负责。

## 正文 schema 适配

`createLocalToolBodySchemas` 消费装配提供的 schema-provider 和一个精确的 vocabulary 采用。它实现 Tool 的窄校验端口。provider 的创建、预算和关闭归装配；适配器不拥有另一个缓存，不读取 Session 或工具注册表。`LocalToolRuntimeInput.bodySchemas` 把此端口交给账本和作者归一化，缺席时结构化封存或直接正文校验明确不可用。

直接正文校验位于 raw 保管、作者 scope 关闭及结果投影之后，final 保管之前。绑定调用 Tool 的 `checkToolResultBody`；invalid 或 unsupported 走原有 result 失败投影。其他未确认校验沿 driverRetryDelayMs 重试，保留同一原结果和 settlement，不再次执行作者。校验等待计入 pending 诊断。宿主退役阻止下一次检查和 final 保管；已发出的校验不声称被撤销。此重试只覆盖当前 live-only 作者绑定，不新增跨进程原函数恢复承诺。原结果的耐久保管不等于后继宿主已经具备重新运行任意 codec/renderer 的能力。

缓存身份取原公开 schema 的完整身份和定义摘要。相同标签下的不同定义不复用同一检查对象；恢复采用 writer 固定的定义。未知 vocabulary 或 provider 不支持的构造返回 unsupported。provider 关闭、容量拒绝及暂时失败返回 unavailable，schema 不匹配返回 invalid。

本适配器只构造校验副本。正文和 schema 定义中的每个数字都按符号、去零系数及十进制指数比较原词法与 Number 回写词法。两者数学值相等且 Number 有限时，才把副本交给 provider 的 exact-or-reject 路径。正负零统一按数学零校验。不能无损投影的数字返回 unsupported，不转成字符串，不舍入原值。原正文、JsonValue、data 及 schema 身份保持不变。本版限制不是通用任意精度 JSON Schema 的支持承诺。
