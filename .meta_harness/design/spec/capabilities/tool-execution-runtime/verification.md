# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-25，第二轮独立评审修复之后；同日按实现映射反推原地改，模型与配置未改、未重跑）：形式工件在第一轮修复后由修复者本机重跑过，第二轮没有改模型与配置、未重跑；规范场景与故障注入一条都没演练。**
> `capability.tool-execution-runtime` v2 是 `candidate`，经两轮独立评审（处置见[独立评审](#独立评审)）后原地修订，**未接受**；尚无提供者设计、尚无源码。
> **第二轮新增的承诺**（以模型面名字查注册表与 `UnlistedCall`、有序撤下收尾帧流、上交之后撤下、发帧形状不合按原名交回）**都不在模型里**，证据只能是规范场景 [S-68](v2/contract.md#s-68-有序撤下收尾在途的帧流上交之后撤下)、[S-69](v2/contract.md#s-69-查不到条目的调用即刻收场不可用) 等，全部未开始。
> 模型那几条「无反例」**之所以有内容**，是因为同一次执行里六个去保护配置、三份补充否定配置都按预期给出了反例，七个可达性探针都按预期被反驳；
> 按构造成立的几条（`SequentialBatch`、`ConcurrencyCap`、`WaitOnlyForeground`、`ReminderAfterPlaceholder`、`ArchiveSettlesAll` 等）**不作为证据**，理由在 [formal 入口](v2/formal/README.md#本版选用什么)。
> **本轮新增的条款**（提交的判重与租户核对、参数解析不了的调用、执行者一侧四个原语、工具侧到达装配前提、丢失在途状态时的账）**都不在模型里**，证据只能是规范场景，全部未开始。
> **原始输出没有存进 `record/evidence/`**：修复者对那一区没有写权限，下面「实际执行」一节只是摘要，原始日志在主检出根的 `tmp/formal-runs/tool-execution-runtime-v2-2026-09-24d/`，**正式证据 run 待主线落盘**。

## 证据义务

### 形式工件

| 规范条款与性质 | 模型／配置 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-16](v2/contract.md#s-16-首胜收场只写一次) · [S-17](v2/contract.md#s-17-持久意图先于外部效果) · [S-18](v2/contract.md#s-18-收场先落停止后发) · [S-19](v2/contract.md#s-19-送达) · [S-20](v2/contract.md#s-20-恢复扫描与停机不重来) · [S-29](v2/contract.md#s-29-会话归档) · [S-30](v2/contract.md#s-30-答复等待) 的安全性质 | TLC 对 [`Execution.tla`](v2/formal/Execution.tla)，配置 [`Execution.cfg`](v2/formal/Execution.cfg)；formal task `tool-execution-runtime-v2-execution` | **已执行**（[下文](#实际执行)，2026-09-24 重跑同一结果）：**无反例**，741,344 个不同状态、完整穷尽、深度 22；覆盖只到[formal 入口](v2/formal/README.md#本版选用什么)第一张表里**有去保护配置或补充配置反驳**的那几条，按构造的几条不算 | 结论只在模型的固定规模内、**且存储真的兑现同一行条件写与「不只成一半」**这个前提下成立；跨进程不自动成立（[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证)） |
| [S-19](v2/contract.md#s-19-送达) · [S-20](v2/contract.md#s-20-恢复扫描与停机不重来) · [S-18](v2/contract.md#s-18-收场先落停止后发) 的进展性质 | 同一模型，配置 [`ExecutionProgress.cfg`](v2/formal/ExecutionProgress.cfg)（`FairSpec`，`MaxWaits = 1`）；formal task `tool-execution-runtime-v2-execution-progress` | **已执行**（[下文](#实际执行)）：**无反例**，524,448 个不同状态、完整穷尽、深度 20；**约 16 分钟**，是本分支最慢的一个 formal task | 三条公平性是**前提**：恢复终会发生、日志追加终会成功、强制停止终会生效（后一条依赖 X-5，未核） |
| 同上的**有效性**（六处保护各自去掉） | 六个 `Execution_*.cfg`，**预期找到反例** | **已执行**：六个都**按预期违反**，轨迹对得上各配置注释写的局面（[结果与反例](#结果与反例)） | **必须与第一行成对报告**。它们**不登记为 formal task**——期望失败的检查与该清单的语义相反 |
| `AtMostOneToolMessage`、`OneAccountPerEnded`、`NoNewDeliveryAfterArchive` 的有效性（`FirstWins = FALSE`） | 三份补充否定配置，在验证入口的证据里（不进版本目录） | **已执行（2026-09-24）**：三份都**按预期违反** | 同上，不登记 |
| 关键路径可达（两批都提交、第二次进等待、转后台、用户中断、取消运行、归档、停机后恢复） | 七个可达性探针：`ExecutionReach.tla`（`EXTENDS Execution`）里七条「到不了」的不变量，主配置同常量 | **已执行（2026-09-24）**：七条都**按预期被反驳**（反例即可达） | 同上，不登记；「守卫不是靠没人动得了成立的」这句话的证据 |

### 规范场景

**十八条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-50 前台完成](v2/contract.md#s-50-前台完成) | 演练；断言收场、账、消息、条目**同成同败**（在四者之间注入一次失败）；**另注入一次两件事实读不到**（`attemptFacts` 答 `unavailable`）：断言 `dependencyUnavailable{runAttemptFacts}`、什么都不写、不出现缺席的 `late`（2026-09-25 修订波） | **未开始** | 可跑：追加口与判重键由 `capability.session-log` v2 给，两件事实由 `capability.run-attempt-facts` v2 给、验收装配以种子答（原「受阻：追加口未定」随那两份接口契约解除，[G-1](v2/contract.md#十二已知缺口) 收窄） |
| [S-51 前台被用户中断](v2/contract.md#s-51-前台被用户中断) | 演练；执行者在停止后以错误退出 | **未开始** | 断言收场仍是 `interrupted`、三件事分开 |
| [S-52 自动转后台后完成](v2/contract.md#s-52-自动转后台后完成落一条提醒) | 演练，能操纵时间源；运行在执行完成之前终结 | **未开始** | 账归原运行、标 `late`（「运行已终结」由验收装配的种子答，[G-18](v2/contract.md#十二已知缺口)）；落盘前那一关受阻于 [G-6](v2/contract.md#十二已知缺口) |
| [S-53 等待、再次等待与迟到的答复](v2/contract.md#s-53-等待再次等待与迟到的答复) | 演练 | **未开始** | 答复者形状受阻于 [G-10](v2/contract.md#十二已知缺口) |
| [S-54 停机后前台与后台各追补一条](v2/contract.md#s-54-停机后前台与后台各追补一条) | **故障注入**：强杀据点进程；**含一个没有协程要恢复的会话** | **未开始** | 「已作废」产品已定；怎样请求关卡受阻于 [G-5](v2/contract.md#十二已知缺口)；`frames` 写 `"unknown"`、`reportedCost` 照样进账 |
| [S-55 找得到的不追补](v2/contract.md#s-55-找得到的不追补) | **故障注入**（见下「两个方向」①） | **未开始** | —— |
| [S-56 归档之后到达的完成不送达](v2/contract.md#s-56-归档之后到达的完成不送达) | 演练；执行者故意在停止之后再交回 | **未开始** | —— |
| [S-57 取消运行不动后台](v2/contract.md#s-57-取消运行不动后台) | 演练；两级各跑一次 | **未开始** | 记录与消息都可验证（`run_cancelled` 已有取值） |
| [S-58 插队三行](v2/contract.md#s-58-插队三行) | 演练 | **未开始** | `human_declined` 的判据（等的是不是卡片）受阻于 [G-5](v2/contract.md#十二已知缺口) |
| [S-59 停止与交回交错](v2/contract.md#s-59-停止与交回交错) | **故障注入**：在收场写下与实际停下之间注入一次交回 | **未开始** | local-execution「停止与 I/O 交错」那组反例的本项目版本 |
| [S-60 凭据不符与核对不了都整批不执行](v2/contract.md#s-60-凭据不符与核对不了都整批不执行) | 演练；放行核对面可关 | **未开始** | 依赖 `capability.tool-admission` 的核对面（S-25） |
| [S-61 参数不合即刻失败并带用法](v2/contract.md#s-61-参数不合即刻失败并带用法) | 演练：六支（未知键且 `input` 没写 `additionalProperties`、未知键且显式 `false`、缺必填、命令不在命令表、单函数工具带未知键、只带命令清单即显式 `true` 收任意对象）各一次；断言执行者没起、块上用法与 `Tools().inspect` 答的一致。**另加一支（2026-09-25，T-16）**：作者写的工具参数判定超出登记的判定时限（及编不出、`pattern` 超上限各一次）——断言那一项 `failed{schema_unsupported}`、块上说判不了而**不附用法、不说参数不合**、执行者没起、同批别的项照常 | **未开始** | 「与 `inspect` 一致」受阻于 `Tools()` 没有契约（PF-007）；**模型里没有这一支**，TLC 的结果对它不作证 |
| [S-64 参数收齐却解析不了](v2/contract.md#s-64-参数收齐却解析不了) | 演练：一批里一项 `UnparseableCall`、一项合格；另让它的工具名在注册表里查不到 | **未开始** | 模型里没有这一支；上游标记归 `capability.stream-assembly` S-11 |
| [S-65 重放同一批返回首次的结果](v2/contract.md#s-65-重放同一批返回首次的结果) | 演练：原样重放、夹一项凭据不符的新调用重放、运行取消之后重放、同 `CallId` 改参数 | **未开始** | 模型里每批只提交一次，对判重没有断言 |
| [S-66 帧被拒报一次，收场之后的帧不进](v2/contract.md#s-66-帧被拒报一次收场之后的帧不进) | 演练：执行者发一串含重开索引、`trim`、收场之后的帧；再跑一帧不发、等待到点两支；断言 `rejected` 的 `trim` 紧跟被拒那一帧、恰一个 | **未开始** | 帧与装配状态不在模型里；`capability.stream-assembly` 的 TLA+ 只到装配本身 |
| [S-67 租户不符整批不收](v2/contract.md#s-67-租户不符整批不收) | 演练：错租户提交（批里有已登记与冲突的 `CallId`）；会话租户读不到 | **未开始** | 可跑：会话持有的租户由 `capability.session-tenancy` v2 的 `holdingTenant` 给，验收装配以种子写映射；「读不到」两支（`sessionNotFound`、`unavailable`）各一次（原「受阻于 G-12」随那份接口契约解除，[G-12](v2/contract.md#十二已知缺口) 收窄） |
| [S-68 有序撤下收尾在途的帧流，上交之后撤下](v2/contract.md#s-68-有序撤下收尾在途的帧流上交之后撤下) | 演练：发过帧的执行在跑时有序替换本能力；**故障注入**：交回时注入执行记录写失败，再恢复存储 | **未开始** | 断言 `frames` 不是 `"unknown"`、`ToolInternalMessage` 的 `ending: lost`；上交后一切操作 `runtimeStopped`、存储恢复后不补写；**模型里没有撤下与上交** |
| [S-69 查不到条目的调用即刻收场不可用](v2/contract.md#s-69-查不到条目的调用即刻收场不可用) | 演练：`UnlistedCall`（编造的名字）与合格项同批；`UnlistedCall` 却查得到条目；注册表读不到 | **未开始** | 上游：runner 不把它交进 `admit`、记 `observed{no_such_entry}`（D-060 §七 M10，那一侧的场景）；查找键 `ModelToolName` 归 `capability.asset-registry` S-25 |

### 故障注入：「找得到／找不到」的两个方向

[S-7](v2/contract.md#s-7-活体与找得到) 的「只有扫描之后找不到才可信」只有两个方向都测过才算有证据：

| 方向 | 做法 | 断言 | 状态 |
|---|---|---|---|
| ① 在的误判成不在 | 执行跑着时触发 `reconcile` | 不追补；日志里这个 `CallId` 只有它自己跑完之后的那一条结果 | **未开始** |
| ② 不在的漏判成在 | 杀掉执行的进程组、再杀据点进程，重启 | 扫描完成前一切操作 `runtimeNotReady`；追补出现且只有一条；**执行者没有被重起** | **未开始** |

**另一条要真跑的**：存储不可用时的读面（[S-33](v2/contract.md#s-33-读一次执行)～[S-35](v2/contract.md#s-35-列出活体)）返回 `dependencyUnavailable` 而不是空表或 `executionNotFound`——最容易被「读不到就当没有」抹掉的一条。**未开始。**

### 两源已知失败情形

[D-032](../../../record/decisions/tool-execution-runtime-baseline/decision.md) 要求把两源（DSH `jobs` 与 minimal-runtime `local-execution`）已知的失败情形列成测试义务，
来源见[提案的候选与取舍](../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#a--fork-dsh-jobsjobsjobs-localtool-jobs-再改造)与[仍待区分的实验](../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)。

| # | 已知失败情形（来源） | 本契约的哪条义务挡住它 | 测试义务（证据形式） | 状态 |
|---|---|---|---|---|
| K-1 | **撤除时停止抛错，要强制结算**（DSH `jobs`） | [S-18](v2/contract.md#s-18-收场先落停止后发)：收场先落、收口出错记账不改收场；[S-48](v2/contract.md#s-48-本能力自己的撤除与换代)：有序撤下先收尾帧流、再写首胜收场，之后才发停止；**正确性不依赖撤下这一步写成**（写不下去的由下一任扫描） | 注入一个停止时抛错的执行者，分别在中断与本能力有序撤下时触发；断言收场不变、错误进条目、下一任扫描不重复写 | **未开始** |
| K-2 | **同 id 换实例不串台**（DSH `jobs`） | [S-5](v2/contract.md#s-5-一次执行以会话里的-callid-指认)：身份是 `(租户, 会话, CallId)`，不是实例；[S-16](v2/contract.md#s-16-首胜收场只写一次)：晚到的交回按「记录已收场」丢弃 | 执行者重新登记（新实例）时旧实例仍在跑；旧实例在收场之后交回；断言被丢弃、之后的提交走新实例 | **未开始** |
| K-3 | **起进程失败被记成被中断**（DSH bash producer） | [S-38](v2/contract.md#s-38-起执行者)、[S-11](v2/contract.md#s-11-失败的种类)：起不来 = `failed{start_failed}` | 让起进程失败；断言收场 `failed`、种类 `start_failed`、外部效果「已确定未发生」 | **未开始** |
| K-4 | **停止不结算就卡住撤除、占着并发位置**（DSH `jobs` 已知限制） | [S-18](v2/contract.md#s-18-收场先落停止后发)：宽限后强制；[S-43](v2/contract.md#s-43-一批依次与同一工具的并发上限)：并发位置在收场那一刻释放 | 执行者忽略停止；断言收场即刻写下、同一工具的下一次执行立刻能起、宽限到点强制停止、停不掉时记 `unconfirmed` | **未开始** |
| K-5 | **后台默认开启**（DSH `jobs`） | [S-15](v2/contract.md#s-15-缺席时的默认答案)：没声明 `allowBackground` 就不能后台，四个触发源都不例外 | 对不许后台的工具分别触发阈值、上限、手动、插队、发起即后台；断言没有一次转成后台 | **未开始** |
| K-6 | **执行寿命挂在活体 agent 上，回收即杀**（DSH `jobs`） | [S-8](v2/contract.md#s-8-姿态与阶段两个维度)、[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证) 第一行：执行宿主不在 agent runtime 之下 | 前台执行中回收 agent runtime；断言执行照跑、新协程 `awaitForeground` 拿到同一结果 | **未开始** |
| K-7 | **记录只在内存，重启后查无此任务**（DSH `jobs`） | [S-17](v2/contract.md#s-17-持久意图先于外部效果)、[S-20](v2/contract.md#s-20-恢复扫描与停机不重来) | 同上「两个方向」② | **未开始** |
| K-8 | **停止与 I/O 交错**（`local-execution` 已发现、只做了局部修复） | [S-16](v2/contract.md#s-16-首胜收场只写一次)：同一行首胜；收场之后到达的完成丢弃、外部效果「不可确定」 | 场景 [S-59](v2/contract.md#s-59-停止与交回交错)；模型否定配置 `FirstWins = FALSE` 是它的形式版本 | 形式版本**已执行**（按预期反例）；演练**未开始** |
| K-9 | **恢复把在途执行落成「状态不明」、「已受理未派发」可经许可继续**（`local-execution`） | [S-20](v2/contract.md#s-20-恢复扫描与停机不重来)：一律 `failed{abnormal_interruption}`，没有例外，**排队中从没起过的也不继续** | 停机时留一条 `queued` 的记录；断言恢复后落失败、外部效果「已确定未发生」、没有被起 | **未开始** |
| K-10 | **据点进程被强杀后子进程还活着**（提案 X-5，两源都没覆盖） | [S-20](v2/contract.md#s-20-恢复扫描与停机不重来) 第 2 步：先回收登记过的进程组，再写失败；[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证) 倒数第二行 | 两平台各起一棵子进程树后强杀据点进程；断言重启扫描回收了整组、之后才落失败 | **未开始**；进展性质 `StopsTakeEffect` 的前提依赖它 |
| K-11 | **自有 JSONL 账本、部署独占租约**（`local-execution`） | 不是契约性质：执行记录落 `core/storage`，归提供者设计 | 无（提供者设计的选择） | 不适用 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 凭据本身不含会话，核对按 `(会话, CallId, 生效参数)`；核对面区分 `invalid` 与 `unavailable` | [S-23](v2/contract.md#s-23-提交一批) ② | `capability.tool-admission` | 那份契约的场景；本契约 S-60 |
| 替换件与不可用条目带原因 | [S-23](v2/contract.md#s-23-提交一批) ④ | `capability.asset-registry` | 那份契约的场景 |
| `lookup` 在 `within = run{报告}` 下以模型面名字 `ModelToolName` 查 `tool` 类条目，答那一条、「没有」或 `unavailable` 三者分开 | [S-23](v2/contract.md#s-23-提交一批) ② 第 6 条 | `capability.asset-registry` S-25、S-7（[D-060 §七 M8](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） | 那份契约的场景；本契约 S-69 |
| 报告里查不到条目的调用不进 `admit`、那一次经过记 `observed{no_such_entry}`，以 `UnlistedCall` 交给本能力 | [S-23](v2/contract.md#s-23-提交一批) ① | `capability.loop-extension-runner`、`capability.tool-admission`（[D-060 §七 M10](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） | 那两份契约的场景；本契约 S-69 |
| 可用性报告里钉住每个接入点的接入点持有（`endpointHoldings`） | [S-23](v2/contract.md#s-23-提交一批) ②、[S-38](v2/contract.md#s-38-起执行者) | `capability.asset-registry`（[D-060 §五 K30](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)） | 那份契约的场景 |
| 会话持有的租户读得到 | [S-21](v2/contract.md#s-21-租户与会话范围)、[S-23](v2/contract.md#s-23-提交一批) ② | `capability.session-tenancy` v2 S-5～S-8；那一写的真承接者是会话那一程（[G-12](v2/contract.md#十二已知缺口)） | 那份接口契约的场景 |
| 两件事实（尝试是否被取代、运行是否终结）只从假变真、读不到不编 | [S-13](v2/contract.md#s-13-账) | `capability.run-attempt-facts` v2 S-5、S-6、S-9；真承接者是 agent loop 与运行那一程（[G-18](v2/contract.md#十二已知缺口)） | 那份接口契约的场景 |
| 落点判断：本版只有宿主机，读不到、没有允许都不答 `host` | [S-38](v2/contract.md#s-38-起执行者) 第 2 步 | `capability.execution-environments` v2 S-6、S-12；沙箱与设施匹配归 PF-005 那一程（[G-4](v2/contract.md#十二已知缺口)） | 那份接口契约的场景 |
| 桥换代时挂起调用落 `failed{abnormal_interruption}`、不重放 | [S-37](v2/contract.md#s-37-执行者登记与撤下) | `capability.mcp-bridge` | 那份契约的场景 |
| 帧的装配、在途状态的快照、帧流收尾产出 `ToolInternalMessage` | [S-39](v2/contract.md#s-39-发帧) | `capability.stream-assembly` | 那份契约的 TLA+ 与场景 |
| 会话日志追加能与执行记录「不只成一半」 | [S-19](v2/contract.md#s-19-送达)、[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证) | `capability.session-log` v2 S-3、S-8（判重键即共同的存储对象）＋ 本能力的提供者设计（出站项） | 那份接口契约的场景与本契约 S-50；[G-1](v2/contract.md#十二已知缺口) 收窄为真承接者未到 |
| 账与记录不进给模型看的上下文 | [S-13](v2/contract.md#s-13-账) | 上下文组装（PF-010，无契约） | 那一侧的场景 |

## 对齐义务

**这些是本契约与别的契约、或与主线待落的改动之间要一起落的事**，不是本契约自己的证据义务。

| 对齐什么 | 依据 | 涉及 | 现状 |
|---|---|---|---|
| **多命令调用在起执行者之前按所选命令的 `commands[c].input` 校验 `args`**（缺必填、未知键、类型不合）；**不合即不起执行者、收场 `failed`**，新失败种类 `arguments_invalid`，结果内容**必须带该命令的参数用法**（与 `Tools().inspect` 给出的同一份文本），让模型能自纠。落点：[S-23](v2/contract.md#s-23-提交一批) 的九件事与 S-42 之前那一步 | 研究 V-5 结论 ③（`tool-definition-shape-sources`，HUB `1867ceb0`），产品负责人 2026-09-24；`data.tool-definition/v2#S-7` 第 3、4 条（判定以 `commands[c].input` 为准、`args` 缺席按 `{}` 判——flat 形的模型面不替它判参数） | 本契约 S-11、S-23、S-42；`data.content-blocks` 的收场与结果块；`Tools().inspect`（PF-007 的契约，尚未建立） | **已落正文（2026-09-24）**：原有的 `arguments_rejected` 就是这一种，改名为 `arguments_invalid`，**种类当时仍是七个**（本行原写的「七个变八个」不成立；第一轮评审修复加了 `unparseable`，现在是八个）；判定从起执行者移到提交时（S-23 ④ 第 ② 条）；S-42 列明它不经卸载那一关；新场景 S-61。**仍待**：`Tools().inspect` 的契约建立后核「同一份用法」 |

## 实际执行

**2026-09-23，起草者本机，run 未落进 `record/evidence/`。**

- **工具**：TLC2 Version 2026.09.12.025210（rev 867aefb），`/opt/tlaplus/tla2tools.jar`；OpenJDK 21.0.12.1（Temurin），`/usr/local/bin/java`
- **工作目录**：设计根 `.meta_harness/design`（与 `formal-tasks.json` 的 runner 相同）
- **输入**：本分支工作树里的 `v2/formal/Execution.tla` 与八个配置（提交之前的同内容文件；提交之后以提交修订为准）
- **命令**（主配置，与 `formal-tasks.json` 的 `tool-execution-runtime-v2-execution` 相同，另加 `-Djava.io.tmpdir` 指到设计根的 `tmp/`——本机根分区满，TLC 的临时文件不能落 `/tmp`）：
  `java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/tool-execution-runtime-v2-execution -cleanup -noGenerateSpecTE -workers 1 -config spec/capabilities/tool-execution-runtime/v2/formal/Execution.cfg spec/capabilities/tool-execution-runtime/v2/formal/Execution.tla`；
  进展配置与六个有效性核对同一命令形制，只换 `-config` 与 `-metadir`

| 配置 | 退出码 | 结果 | 规模 |
|---|---|---|---|
| `Execution.cfg` | **0** | `Model checking completed. No error has been found.` | 2,656,347 generated · **741,344 distinct** · 0 left · 深度 22 · 1 min 12 s |
| `ExecutionProgress.cfg` | **0** | `Model checking completed. No error has been found.`（`LostSettles`、`HandoffLands`、`StopsTakeEffect`，12 个时序分支） | 1,858,831 generated · **524,448 distinct** · 0 left · 深度 20 · 15 min 56 s（与别的检查并跑；登记的超时 2400 s） |
| `Execution_NoFirstWins.cfg` | 13 | `Action property OutcomeStable is violated.` | 轨迹 5 步 |
| `Execution_VolatileHandoff.cfg` | 12 | `Invariant EndedIsLanded is violated.` | 轨迹 3 步 |
| `Execution_StopBeforeWrite.cfg` | 12 | `Invariant InterruptHonored is violated.` | 轨迹 4 步 |
| `Execution_PartialRecovery.cfg` | 12 | `Invariant ServingConsistent is violated.` | 轨迹 4 步 |
| `Execution_RestartOnRecover.cfg` | 12 | `Invariant AtMostOneStart is violated.` | 轨迹 5 步 |
| `Execution_NoWaitIndex.cfg` | 12 | `Invariant NoStaleAnswer is violated.` | 轨迹 7 步 |

**经登记的 runner 再跑一遍**：`JAVA_BIN=/usr/local/bin/java TLA2TOOLS_JAR=/opt/tlaplus/tla2tools.jar make design-check FORMAL=run`（2026-09-24 本机，提交 `dfef00fd` 的模型与配置）：
本分支登记的八个 formal task 全部 `exit=0`，其中 `tool-execution-runtime-v2-execution` 与 `tool-execution-runtime-v2-execution-progress` 两个是本契约的；整次 18 min 05 s，`PASS: design tree … formal=run`。

**2026-09-24 修订批（第五节）之后复跑两个 formal task**（起草者本机，run 未落进 `record/evidence/`）：本批**没改** `Execution.tla` 与任何 `.cfg`（参数不合那一支不在模型里，见 [formal/README](v2/formal/README.md)），复跑只为确认结论不随正文改动失效。同一 TLC2 版本，命令形制同上（`-metadir tmp/tlc/te-rev0924-<配置>`），两个配置先后串行跑：

| 配置 | 退出码 | 结果 | 规模 |
|---|---|---|---|
| `Execution.cfg` | **0** | `Model checking completed. No error has been found.` | 2,656,347 generated · **741,344 distinct** · 0 left · 深度 22 · 1 min 10 s |
| `ExecutionProgress.cfg` | **0** | `Model checking completed. No error has been found.`（12 个时序分支，时序检查 3 min 01 s） | 1,858,831 generated · **524,448 distinct** · 0 left · 深度 20 · 19 min 42 s（与其他代理的检查并跑） |

规模与 2026-09-23 那次逐位相同。六个否定配置本批没有复跑。

**2026-09-24 第一轮独立评审修复之后（修复者本机，run 未落进 `record/evidence/`）**：`Execution.tla` 只改了注释（`StartFail`、`Return` 两处，TE-7），配置未改；为 TE-6 补跑三份补充否定配置与七个可达性探针，同时把主配置、进展配置与六个否定配置全部重跑一遍。

- **工具**：同上（TLC2 2026.09.12.025210，rev 867aefb；OpenJDK 21.0.12.1，`/usr/local/bin/java`；`-Djava.io.tmpdir=tmp/java`，设计根下）
- **证据目录**：主检出根 `tmp/formal-runs/tool-execution-runtime-v2-2026-09-24d/`——`run.sh`（逐配置一次 TLC，`-workers 1 -cleanup -noGenerateSpecTE`，`-metadir tmp/tlc/ter-ev-<名字>`）、`input/`（版本目录里模型与八个配置的副本）、`variant/`（补充配置、探针模块与它们的基底）、`logs/`（每个配置的完整输出与退出码）
- **输入的 SHA-256**：`Execution.tla` `57b9b031bd5ca1633f00c5111b811164d2b7dd2186b3549642b78eb7300dfe23`（其余见证据目录 `input.sha256`、`variant.sha256`）；版本目录里的模型与八个配置与 `input/` 逐个相同；`variant/Execution.tla` 与之相同，`ExecutionReach.tla` `50a041a74da9afaaaefdbdb27bd3ec9f32a1d1cdcc55d245c08e611e092b704e`

| 配置 | 退出码 | 结果 | 规模 |
|---|---|---|---|
| `Execution.cfg` | **0** | `Model checking completed. No error has been found.` | 2,656,347 generated · **741,344 distinct** · 0 left · 深度 22 · 1 min 20 s |
| `ExecutionProgress.cfg` | **0** | `Model checking completed. No error has been found.`（12 个时序分支） | 1,858,831 generated · **524,448 distinct** · 0 left · 深度 20 · 15 min 56 s |
| `Execution_NoFirstWins.cfg` | 13 | `Action property OutcomeStable is violated.` | 深度 5 |
| `Execution_VolatileHandoff.cfg` | 12 | `Invariant EndedIsLanded is violated.` | 深度 3 |
| `Execution_StopBeforeWrite.cfg` | 12 | `Invariant InterruptHonored is violated.` | 深度 4 |
| `Execution_PartialRecovery.cfg` | 12 | `Invariant ServingConsistent is violated.` | 深度 4 |
| `Execution_RestartOnRecover.cfg` | 12 | `Invariant AtMostOneStart is violated.` | 深度 5 |
| `Execution_NoWaitIndex.cfg` | 12 | `Invariant NoStaleAnswer is violated.` | 深度 7 |
| 补充 `Execution_NoFirstWins_ToolMessage.cfg` | 12 | `Invariant AtMostOneToolMessage is violated.` | 深度 7 |
| 补充 `Execution_NoFirstWins_Account.cfg` | 12 | `Invariant OneAccountPerEnded is violated.` | 深度 5 |
| 补充 `Execution_NoFirstWins_Archive.cfg` | 13 | `Action property NoNewDeliveryAfterArchive is violated.` | 深度 6 |
| 探针 `Reach_NotBothSubmitted.cfg` | 12 | `Invariant NotBothSubmitted is violated.`——两批都能提交 | 深度 3 |
| 探针 `Reach_NotSecondWait.cfg` | 12 | `Invariant NotSecondWait is violated.`——能进第二次等待 | 深度 6 |
| 探针 `Reach_NotBackgrounded.cfg` | 12 | `Invariant NotBackgrounded is violated.`——非发起即后台的调用能转后台 | 深度 3 |
| 探针 `Reach_NotInterrupted.cfg` | 12 | `Invariant NotInterrupted is violated.`——能被用户中断 | 深度 3 |
| 探针 `Reach_NotRunCancelled.cfg` | 12 | `Invariant NotRunCancelled is violated.`——取消运行能中断调用 | 深度 3 |
| 探针 `Reach_NotArchived.cfg` | 12 | `Invariant NotArchived is violated.`——归档能中断调用 | 深度 3 |
| 探针 `Reach_NotRecovered.cfg` | 12 | `Invariant NotRecovered is violated.`——停机之后恢复、落 `abnormal_interruption` | 深度 4 |

主配置与进展配置的规模与 2026-09-23 那次逐位相同。**这次运行不是 `make design-check FORMAL=run`**；那条入口只跑登记的两个任务，本轮未经它复跑。

### 结果与反例

| 配置 | 轨迹 | 对得上注释写的局面吗 |
|---|---|---|
| `NoFirstWins` | `Submit(b1)` → `Start(c1)` → `Interrupt(c1)` → `LateReturn(c1)` | 是：中断落定之后晚到的完成覆盖了收场 |
| `VolatileHandoff` | `Submit(b2)` → `Crash` | 是：替换件 c4 的 `unavailable` 已写进记录，那条工具消息只在进程内存里，停机即丢 |
| `StopBeforeWrite` | `Submit(b1)` → `InterruptSignal(c1)` → `StartFail(c1)` | 是：停止先发、中断的收场还没写，另一路收场（起不来）抢先落定 |
| `PartialRecovery` | `Submit(b2)` → `Crash` → `Recover` | 是：发起即后台的 c3 不在「只处置前台」的扫描范围里，恢复之后记录未收场、找不到活体 |
| `RestartOnRecover` | `Submit(b1)` → `Start(c1)` → `Crash` → `Recover` | 是：恢复把在跑的 c1 重起了一遍 |
| `NoWaitIndex` | `Submit(b1)` → `Start(c1)` → `EnterWait(c1)` → `Answer(c1,1)` → `EnterWait(c1)` → `Answer(c1,1)` | 是：答给第 1 次的答复解除了第 2 次 |

**模型的演化**：本日第一版把送达建成「与收场同一步」、以 `SameCommit` 开关对照；主线随后裁定「同一提交」目前没有共同存储对象、两种承接形状交给提供者设计，
模型改为「交付 + 追加」两步（`DurableHandoff` 开关），同时覆盖两种形状。第一版的运行结果**不再代表本模型**，不列。
第二版在 `Waiters = {c1, c2}` 下主配置达 1,921,132 个不同状态、3 min 10 s；为让 formal task 在合理时间内跑完，收成只有 c1 进等待（c2 的等待与 c1 的等待对哪条性质都不提供新局面），即上表。

## 变化的影响

- **2026-09-23 起草**：新建 v2 候选。登记：catalog 一条（七项依赖）、covers 57 条（`reviewed: false`）、formal-tasks 两条。
- **并行起草的六份契约**（`data.arrival-events`、`capability.stream-assembly`、`capability.tool-admission`、`capability.asset-registry`、`capability.loop-extension-runner`、`capability.mcp-bridge`）：
  本契约按它们的施工账本或主线转达引名，**未登 catalog 依赖**。合流对齐时：补登坐标与消费 clauses；核对引到的名字
  （`verifyToken(token, call, session)` 的三个结果、`availability` 的三支、`after_action` 的派发与「卸载判定不可用 = 只记可见」、桥换代时挂起调用的收场、`stream-assembly` 的五个操作与 `finish` 的四个 `reason`）是否与定稿一致，不一致按定稿改本契约。
- **三个占位原因**：起草时写作「等 `data.content-blocks` 下一版」；2026-09-24 整批对齐时它们已在 v2 候选里，G-2 闭合，S-10 那三行改为「有」，不改任何行为。
- **起草途中主线三次转达**（均已并入本版）：核凭据的面与两个失败值（`notAdmitted{why}`、`admissionUnavailable`）；「同一提交」改写为装配给的一行、两种承接形状不在契约里选；
  注册表判为不可用的条目落 `failed` 并带原因（`notAvailable{reason}`，已被 2026-09-24 整批对齐撤回，见下一条）；MCP 动作的撤下例外。
- **2026-09-24 整批对齐**（主线裁定 2026-09-23，待产品负责人确认；账本 S13-a～h、S19-b/d）：
  - **注册表判为不可用 → 收场 `unavailable`**（S13-a，改判 S22-f）：删失败种类 `not_available`（八 → 七）、失败值 `notAvailable{reason}`（十三 → 十二）；替换件、条目 `unavailable{reason}`、关掉的命令三支同归 `unavailable`。改了 S-9 收场表、S-11、S-23 ④⑤⑥ 与其后一条、S-37、第八节性质表一行、examples §8（删一行、补「不是失败值的那一支」）、formal/README 语义映射（常量 `StandIn` 的含义扩成三支，模型文件不改，行为相同）。R-17 闭合。
  - **声明卸载的原始结果由本能力总是存下**（S13-b）：S-36 加两条（先存、存不下同「记录读写不了」上交），S-42 改「那一关不可用」一条（只落引用、摘要缺席）与停机那一条，S-15 一行，CS-5，examples §5。G-6 收窄为「由谁驱动」；R-11 闭合。
  - **工具执行被中断不另补提醒**（S13-d）：S-19 加一条，S-4 `data.messages` 行加 S-21；G-14 闭合，R-15 闭合。
  - **六份并行契约补登**：头部依赖列表与 S-4 表合一，引名逐字核定稿——`stream-assembly` 的操作名是 `start`、`closeOut`（原 `open_target`、`close_out` 作废）；`verifyToken` 的结果是 `valid | invalid{reason}`、失败 `invalidInput | unavailable`（原 `invalid{why} | unavailable` 三结果写法作废），`invalidInput` 收成整批 `invalidInput`（S-23 ⑧）。六份都不反向登记本契约，无环。
  - **MCP 桥**（S19-b/d）：S-11 把桥的失败值按 `capability.mcp-bridge/v2#S-21` 对到 `implementation_error` / `abnormal_interruption`；S-14 按「请求是否已发出」定外部效果；S-37 与桥 S-27 互指；CS-6。
  - **账与占位原因**（S13-f、S13-h）：`data.call-accounts` v2 候选已带 `externalEffect`、`stoppedAt`、`late`，`data.content-blocks` v2 候选已带三个占位原因——S-13 表补 `initiator`、`credentialScope`、`externalEffect`、`stoppedAt`、`late` 五行，S-14 写投影（「不可确定」→ `unknown`），G-2 闭合，G-8 收窄为「晚报的一笔没有 `obtainedVia` 取值」，新立 G-15（`credentialScope` 从哪来）。
  - 不改的：S13-c 采纳的推导（姿态 × 阶段、`preempt` 原子、并发按会话计等）本来就在正文；S13-e 进展任务照登；S13-g 两种承接形状本来就不选。
  - **对消费者**：agent loop 与 `BkgJobs()` 读到的判为不可用的项，从 `notAvailable{reason}` 逐条失败变成 `ended{unavailable}`——调用方不必另补结果这一点不变。
- **2026-09-24 修订批第五节（候选，未冻结，原地改）**：
  - **参数不合 → `failed{arguments_invalid}`**：原失败种类 `arguments_rejected` 改为账本名 `arguments_invalid`（同一件事，种类仍七个）；判定由起执行者（原 S-38 第 2 步）移到提交时，成为即刻收场的第 ② 种（[S-23](v2/contract.md#s-23-提交一批) ④，与「判为不可用」「发起即后台被拒」排定次序）；单函数工具按它的 `input`、多命令工具按所选命令的 `commands[c].input` 判；块上必带「哪里不合」与该命令的一行说明加参数表（命令不在命令表里时带命令清单），与 `Tools().inspect` 一致（[S-11](v2/contract.md#s-11-失败的种类)）；S-42 列明它不经卸载那一关；S-9、S-2、S-4 相应几处；安全性质表加一行；新场景 [S-61](v2/contract.md#s-61-参数不合即刻失败并带用法)；examples 共用局面加 `fs`、第 1 节第 1～2 步、第 8 节末加一张表。
    **S-38 的步骤号顺移**：原第 3、4、5 步成为第 2、3、4 步，G-4 那一格跟着改；外部没有引用这几个步号。
  - **产品依据升到 PF-006 rev 19**：抬头与设计依据表加 §5.3「多命令工具的定义里带多少」（→ S-11、S-23）与 §6.6「前台上限与并发上限」（→ S-43、S-44）；S-43 的计数范围、S-44 的「等待不计、转后台不再计」由「本契约的推导」改为引产品正文；**G-3 收窄**：产品已定原因「前台超时」，缺的只剩 `data.content-blocks` 的取值（R-25）。
  - **formal**：`Execution.tla` 与八个配置**未改**；`formal/README.md` 语义映射里 `StartFail` 一行去掉「参数」、写明参数那一支不在模型里。catalog 对 `data.tool-definition` 的依赖加 S-4、S-5、S-7；covers 加两条。
  - **对消费者**：没有已采用的消费者，无迁移。**语义改变**：参数不合的调用不再占排队位置、不等轮到它，提交那一次写就落定；它的块上多了用法。agent loop 读到的仍是 `ended{failed}`、不必另补结果。
- **2026-09-24 主线对修订批报回项的裁定（候选，未冻结，原地改）**：
  - **未知键一律拒**（R-24 裁定）：[S-11](v2/contract.md#s-11-失败的种类) 那条「按定义的原义读」改为「`input` 顶层没写 `additionalProperties` 按 `false` 读，显式 `true` 或 schema 才收」，读法的家在 `data.tool-definition/v2#S-5` 末条，本契约照它判；「只带命令清单」的写法随之是显式 `true`。[S-61](v2/contract.md#s-61-参数不合即刻失败并带用法) 由四支扩到六支（未知键分「没写」「显式 `false`」两支，加单函数工具一支）；`examples.md` 共用局面里 `grep` 的 `input` 改为不写 `additionalProperties`、加一个不收参数键的命令 `pwd`、`peek` 改为显式 `true`，第 8 节表加 `pwd` 一行。
  - **次序与单函数工具**（R-26、R-27 确认）：S-23 那句「这两个次序是本契约的推导」改为主线裁定 2026-09-24；S-11 加一条单函数工具同一种类、同一规则。
  - **前台超时的取值**（R-25 裁定）：主线定名 `foreground_timeout`，已进 `data.content-blocks` v2 的 S-18；[S-10](v2/contract.md#s-10-占位原因) 那一行由「本版没有取值」改为它，表下「停下并上交」那段删去；S-44 表那一格同步；**G-3 闭合**。
  - **formal**：模型与配置未改（参数那一支与占位原因都不在模型里）。
  - **对消费者**：没有已采用的消费者，无迁移。**语义改变**：没写 `additionalProperties` 的 `input` 从「收未知键」变为「拒未知键」；前台超时的那条消息从「落不下去」变为可以落。
  - **（同日第二轮，主线裁定，以 PF-006 §6.7 为准）`terminated_by_agent` 只落后台执行收场提醒的结果块，不作占位**：[S-10](v2/contract.md#s-10-占位原因) 那一行、[S-25](v2/contract.md#s-25-中断一次执行) 表下那一条（原写「照常落占位」，与 S-25 自己的「后台的执行被中断，落 `background_execution_finished` 提醒」相抵）改写；与 `data.content-blocks` S-18 同一措辞。模型与配置未改。
- **2026-09-24 第一轮独立评审修复（候选，未冻结，原地改；评审基线 `765b01dc`）**。本轮主线裁定链 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K2、K10、K23、K24、K25、K27、K29、K30、K50）：
  - **产品依据逐版复核**：PF-012 10→14（rev 11 放行之后到执行之间不重判——S-23 的「放行之后参数不许再变」照旧成立；rev 12 系统自带件不可用由指定挂件顶上——卸载判定这一件写进新条款 [S-63](v2/contract.md#s-63-卸载判定这一件)，S-42「那一关不可用」改引它；rev 13、14 只动转换件，不触及本能力）；PF-009 7→8（§9.2 在途状态；有块才有 `ToolInternalMessage`——S-19、S-39 改判据）；PF-007 16→18（rev 17 全拒件不触及本能力；rev 18 `Ask()` 五个出口——停机那一种即 S-20 第 4 步，「明确拒绝回复」怎样进来仍是 G-10）；PF-008 5→7（rev 6 本版不在后台等——S-12 的 `notInForeground`；rev 7「已作废」——S-20 第 4 步依据改引、G-5 收窄）；PF-014 5→7（rev 6、7 不触及本能力，§5.4 未改）。PF-006 19、PF-015 11、PF-005 5、PF-000 1、PF-011 4 仍是当前 rev。
  - **提交**（[S-23](v2/contract.md#s-23-提交一批)，TE-1～TE-3、X-3、X-6）：批项分 `AdmittedCall`／`UnparseableCall` 两种；判定次序写全——服务 → 会话租户（新失败值 `crossTenant`）→ 判重（`callIdConflict`；全部已登记即按幂等返回）→ 归档／取消 → 凭据（核对按会话、`CallId`、生效参数）→ 注册表（按定义名找，逆转写在这里做一次；MCP 动作取可用性报告里的接入点持有）；解析不了的即刻收场 `failed{unparseable}`；发起即后台被拒只是收场，删逐条失败值；⑤ 没有逐条失败值，重放给首次的 `disposition`。失败值全集十二 → 十四（加 `crossTenant`、`notInForeground`）；失败种类七 → 八（加 `unparseable`）。
  - **执行者一侧四个原语**（TE-5）：[S-12](v2/contract.md#s-12-等待)、[S-39](v2/contract.md#s-39-发帧)、[S-40](v2/contract.md#s-40-报账)、[S-41](v2/contract.md#s-41-交回) 各补九件事——等待交回 `answered`／`ended`、失败 `notInForeground` 等；发帧交回 `accepted`／`dropped{rejected|notAFrame|executionEnded}`、没有失败值；报账逐笔 `recorded`／`rejected`／`executionEnded`，报过的钱落执行记录的 `reportedCost`、停机不丢；交回 `settled`／`discarded`／`escalated`。
  - **账**（TE-4）：[S-13](v2/contract.md#s-13-账) 丢失在途状态时 `frames` 写 `"unknown"`（`data.call-accounts` v2 S-11 已加这一支），执行者从没起过的写零；[S-6](v2/contract.md#s-6-执行记录) 加 `endpointHolding`、`reportedCost` 两项，`definition`／`admission`／`environment` 只对解析成功的调用有。
  - **帧与到达装配**（X-2、X-7）：新条款 [S-62](v2/contract.md#s-62-工具侧到达装配前提的承诺) 逐条承诺 `capability.stream-assembly` S-28 的第 1～4、6、7、9 条；S-39 帧流收尾改引 `data.messages/v2#S-14`（等待到点与执行者换代 → `abandon`，即 `lost`）；S-19 `ToolInternalMessage` 判据改为交出的块非空。
  - **缺口**：新立 [G-16](v2/contract.md#十二已知缺口)（整批被拒之后落什么收场，owner agent loop 契约）；G-5 收窄（「已作废」产品已定）；G-12 加「会话持有的租户从哪读」；G-13 收窄为几条尚无决定记录的主线裁定；G-2、G-6、G-8、G-14 的账本编号改链 D-060。
  - **与 `capability.asset-registry` 同轮修订对齐**：[S-23](v2/contract.md#s-23-提交一批) ② 第 6 条写明接入点持有**原样取自报告的 `endpointHoldings`、本能力不自己解析**；报告对那个接入点写明「没有」生效的持有，按读不到处理（`dependencyUnavailable{registry}`），不拿别的那份补上。
  - **新规范场景** [S-64](v2/contract.md#s-64-参数收齐却解析不了)～[S-67](v2/contract.md#s-67-租户不符整批不收)；examples 第 8 节删逐条的 `backgroundNotAllowed`、加 `crossTenant`、`notInForeground` 两行与「发起即后台被拒」一支，新增第 9、10 节，第 6 节补 `frames` 与 `reportedCost`。
  - **形式**（TE-6、TE-7）：模型只改两处注释、配置未改；formal/README 把 `ReminderAfterPlaceholder`、`ArchiveSettlesAll` 标为按构造，`FirstWins = FALSE` 反驳另三条的说法由三份补充配置作证，「关键路径可达」由七个可达性探针作证；契约安全性质表同改。重跑结果见[实际执行](#实际执行)。
  - **登记**：catalog 依赖补 `data.tool-definition` S-6、S-18，`data.messages` S-31，`data.arrival-events` S-14、S-29，`capability.stream-assembly` S-28，`data.loop-extension` S-7；covers 相关 note 按现行内容改（`reviewed` 保持 false）；formal-tasks 未改。
  - **依据落持久记录**：设计依据下的第二张表逐行链 D-060 与产品小节；账本编号与施工标签删去；几条 2026-09-23／24 的主线裁定尚无决定记录，写「决定记录待补」并归 G-13。
  - **对消费者**：没有已采用的消费者，无迁移。**语义改变**：agent loop 把解析不了的调用也交给 `submit`，不再自己落结果；重放一批不再因运行已取消而被拒；租户不符不再以错误租户落记录；执行者对四个原语拿得到确定的交回值。
- **2026-09-25 第二轮独立评审修复（修复波 2；候选，未冻结，原地改；评审基线 `8ad37c50`，本轮起点 HUB `7c3ef6c2`）**。本轮主线裁定链 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（M8、M10、M12、M13、M16、M18、M23、M29）与 [§六 N-8](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)，逐条处置见[独立评审 · 第二轮](#第二轮2026-09-25)：
  - **查注册表的名字**（M8、M10）：[S-23](v2/contract.md#s-23-提交一批) ② 第 6 条以 `call.tool` 原样（`ModelToolName`）按 `capability.asset-registry` S-25 查，逆转写只为找执行者；注册表答「没有」→ ④ 即刻收场 `unavailable{no_such_entry}`，与「读不到」（整批 `dependencyUnavailable{registry}`）分开；批项多一种 `UnlistedCall = { call }`（报告里查不到条目、没进放行判断的调用），查得到条目即整批 `notAdmitted`。S-1、S-2、S-4、S-6、S-9、S-15、CS-1 同改；新场景 [S-69](v2/contract.md#s-69-查不到条目的调用即刻收场不可用)，examples 第 8 节加「第四支」。
  - **撤下与上交**（M12、M13）：[S-48](v2/contract.md#s-48-本能力自己的撤除与换代) 改写——有序撤下先对开着的装配状态 `abandon`（帧流 `lost`）、再写同一个首胜收场 `failed{abnormal_interruption}`，账取 `abandon` 的 `frames`；停机仍 `"unknown"`；正确性不依赖撤下这一步写成。[S-47](v2/contract.md#s-47-依赖的提供者不可用) 删「存储回来后照常写」，改为上交之后本任撤下；[S-41](v2/contract.md#s-41-交回) ⑤ 写明交回的结果随本任丢弃。S-9、S-10、S-11、S-13、S-15、S-39、[S-62](v2/contract.md#s-62-工具侧到达装配前提的承诺) 第 6 条、S-46 同改；新场景 [S-68](v2/contract.md#s-68-有序撤下收尾在途的帧流上交之后撤下)，examples 第 6、10 节各加一段。
  - **路由与观察者**（M16）：S-62 第 1 条路由键是（会话，目标），第 9 条只推给本会话观察者；被拒而无处可说的照旧留记录条目。
  - **原语**（M29）：[S-39](v2/contract.md#s-39-发帧) ⑧ 形状不合的事件交给 `accept`、按原名交回并补 `trim`，`malformed` 只留事件缺席；[S-40](v2/contract.md#s-40-报账) ⑥ 补 `invalidInput`；[S-23](v2/contract.md#s-23-提交一批) ② 第 5 条多项凭据结果不同时取 ⑥ 最左失败值，⑥ 写明 `verifyToken` 的 `invalidInput` 出在第 5 步。
  - **依据落持久记录**（TE2-1）：七处「决定记录待补」改链 D-060 §六 N-8，G-13 闭合；设计依据表加六行（N-8 命名、M8/M10、M12、M13、M16、M29）；S-25 那句改链 D-060 §七 M23；产品依据加 PF-009 §6.9（→ S-39、S-48、S-62）与 PF-011 §6.2（→ S-41、S-47、S-48），PF-006 §6.12 那一行加 S-48。
  - **README**（M18）：补「本能力的提供者是运行时协程」。
  - **产品依据 rev**：未变（PF-006 19、PF-012 14、PF-009 8、PF-007 18、PF-008 7、PF-014 7、PF-015 11、PF-005 5、PF-000 1、PF-011 4 仍是当前 rev）。
  - **形式**：`Execution.tla` 与八个配置**未改**，**本轮未运行 TLC**；formal/README 语义映射写明有序撤下、上交、`UnlistedCall` 不在模型里、不作证据。
  - **登记**：catalog 本契约依赖 `capability.asset-registry` 加 S-25、`capability.stream-assembly` 加 S-23、S-24（TE2-7）；covers 加 PF-009 §6.9、PF-011 §6.2 两条（本契约条目 62 → 64），PF-006 §6.12 那一行的三条补 S-48（`reviewed` 保持 false）；formal-tasks 未改。
  - **对消费者**：没有已采用的消费者，无迁移。**语义改变**：注册表答「没有」从整批 `dependencyUnavailable{registry}` 变为那一项 `ended{unavailable}`；loop 多交一种批项 `UnlistedCall`；有序撤下时在途执行当场落收场（此前留给下一任）；上交之后本任不再服务；发帧的执行者对形状不合的帧拿到的是原名而不是 `malformed`；报账空批明确失败 `invalidInput`。
- **2026-09-25 修复波 3：实现映射反推（候选，未冻结，原地改）**：裁定出处 [D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M33、M42、M43；逐条处置见[实现映射反推（2026-09-25）](#实现映射反推2026-09-25)。
  - **`submit` 带 `report`**（M33）：[S-23](v2/contract.md#s-23-提交一批) 签名与 ① 加 `report`，② 第 6 条改 `within = run{report}`、`endpointHoldings` 取自它；⑥ 的 `invalidInput` 收「报告带的会话、运行不是本次的」，⑧ 收「`report` 缺席」；S-4（asset-registry 那一行）、S-6（`endpointHolding` 行）、S-15、S-46（新一行）、S-47（注册表那一行）、CS-1 同改；examples 共用局面加 `rpt_1`、七处 `submit` 带它、第 8 节加一行「报告不对」。
  - **送达通知只在本进程内**（M42）：[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证) 末行新增；[S-45](v2/contract.md#s-45-送达通知) 加一条指路。
  - **缺口**（M43）：[G-6](v2/contract.md#十二已知缺口) 放宽为「由谁驱动、结论怎样交回」（T-2 并入）；新增 G-17（观察者订阅面，T-3）、G-18（`late` 读面，T-4）、G-19（模型调用成本的来路，T-5），owner 主线、本程不补；S-13、S-40、S-42、S-62 第 9 条各加一处指路。
  - **产品依据 rev**：未变。
  - **形式**：`Execution.tla` 与配置**未改**（模型里没有报告、没有送达通知、没有账），**本轮未运行 TLC**；formal/README 不改。
  - **登记**：catalog 本契约条目不变（新引的 `capability.asset-registry/v2#S-11` 第 3 条、`capability.loop-extension-runner/v2#S-21`、`data.call-accounts/v2#S-20`、`#S-39` 都已在已登记的 clauses 里）；covers 不变；formal-tasks 不变。
  - **对消费者**：没有已采用的消费者，无迁移。**语义改变**：`submit` 多一个必带的输入，缺它或带错运行的报告整批 `invalidInput`；此前「这次尝试的报告」没有来路（节点 T-1），现在由调用方交来。
  - **同轮追加 M46**（[D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M46；本轮推导经 N-20 接受）：报告带 `attempt`，`submit` 核会话、运行、尝试三者，任一对不上即 `invalidInput`——S-23 ①⑥、S-4、S-15、S-46、CS-1、设计依据表同改；examples 第 8 节「报告不对」一行加「同一运行上一次尝试的报告」一支。R-38 已答。模型仍未改，未运行 TLC。
- **2026-09-25 修复波 3 跨批对齐（drafter 丑；候选，未冻结，原地改）**：裁定出处 [D-060 §八 N-22](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16；逐条见[实现映射反推](#实现映射反推2026-09-25)末行。
  - **语义改变**：失败种类八个 → **九个**（`schema_unsupported`）；[S-23](v2/contract.md#s-23-提交一批) ④ 的参数判定分两支——判不了（编不出、超出实现登记的上限、判定超时）即刻 `failed{schema_unsupported}`、判得了而不合 `failed{arguments_invalid}`，都只落这一项；⑤ 的即刻收场种类随之多一个；S-38 与卸载那一关的两处列举同步。**`submit` 的失败值集合不变**（仍没有逐条失败值）。
  - **登记**：catalog 本契约 → `data.tool-definition` 的 clauses 补 `S-26`（第 13 行：判不了的那一种由它定义）；covers、formal-tasks 不变。
  - **形式**：`Execution.tla` 不区分参数判定的种类（即刻收场在模型里是一类），**未改、未运行 TLC**。
  - **证据**：examples 第 8 节「参数不合」那张表加一行（判定超时）；新义务并进[规范场景](#规范场景) S-61 那一行（加一支），不另立——仍「未开始」。
  - **对消费者**：`data.tool-definition` 的 G-15 据此关闭（同批由丑落）；runner、放行判断不受影响（参数判定只在本能力）。

## 独立评审

处置栏的 K 编号指 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 的主线裁定。

| 评审 | 对象与基线 | 发现 | 处置 | 落在哪 |
|---|---|---|---|---|
| spec-reviewer，2026-09-24 | v2 candidate，基线 `765b01dc` | TE-1 发起即后台被拒是收场还是逐条失败值 | **接受**（K50）：只是收场 `failed{background_start_refused}`；删 `backgroundNotAllowed` 的逐条用法 | [S-23](v2/contract.md#s-23-提交一批) ④⑤⑥；examples 第 8 节 |
| 同上 | 同上 | TE-2 判重的位次、`callIdConflict` 的位次 | **接受**（K50）：判重在凭据、归档、取消之前（租户核对之后），全部已登记即返回首次结果；`callIdConflict` 在判重那一步 | [S-23](v2/contract.md#s-23-提交一批) ②⑦；S-65；examples 第 9 节 |
| 同上 | 同上 | TE-3 提交时不核会话租户 | **接受**（K50）：核对会话持有的租户，不符 `crossTenant`、读不到 `dependencyUnavailable{storage}` | [S-21](v2/contract.md#s-21-租户与会话范围)、[S-23](v2/contract.md#s-23-提交一批) ②⑥⑧；S-67；G-12 |
| 同上 | 同上 | TE-4 丢失在途状态时 `frames` 填什么 | **接受**（K50）：写 `"unknown"`，从没起过的写零 | [S-13](v2/contract.md#s-13-账)、[S-20](v2/contract.md#s-20-恢复扫描与停机不重来)；examples 第 6 节 |
| 同上 | 同上 | TE-5 执行者四个原语没有九件事 | **接受**（K50） | [S-12](v2/contract.md#s-12-等待)、[S-39](v2/contract.md#s-39-发帧)、[S-40](v2/contract.md#s-40-报账)、[S-41](v2/contract.md#s-41-交回) |
| 同上 | 同上 | TE-6 `FirstWins` 反驳范围、可达性、`ReminderAfterPlaceholder` | **接受**：补三份补充否定配置与七个可达性探针（都按预期）；`ReminderAfterPlaceholder`、`ArchiveSettlesAll` 标按构造，次序的证据改为场景 S-52 | formal/README；契约第八节；本文件「证据义务」「实际执行」 |
| 同上 | 同上 | TE-7 模型注释、状态行、`data.messages` S-31 未登记 | **接受** | `Execution.tla` 两处注释；契约头部状态行；S-4；catalog |
| 同上 | 同上 | X-1 调用块里是模型面名字，谁做逆转写 | **接受**（K10）：本能力在提交时按定义名找条目之前逆转写一次，登记消费 `data.tool-definition` S-6、S-18；执行记录里的调用块保留模型面名字 | [S-23](v2/contract.md#s-23-提交一批) ②、[S-38](v2/contract.md#s-38-起执行者)、S-4 |
| 同上 | 同上 | X-2 工具侧没有接住 stream-assembly S-28 | **接受**（K23） | [S-62](v2/contract.md#s-62-工具侧到达装配前提的承诺)；S-66；examples 第 10 节 |
| 同上 | 同上 | X-3 解析不了的调用谁收场 | **接受**（K24）：本能力，`UnparseableCall` 即刻 `failed{unparseable}` | [S-23](v2/contract.md#s-23-提交一批)、[S-11](v2/contract.md#s-11-失败的种类)、S-2；S-64 |
| 同上 | 同上 | X-4 整批被拒之后落什么收场 | **登缺口**（K25） | [G-16](v2/contract.md#十二已知缺口)、CS-1 |
| 同上 | 同上 | X-6 凭据绑不绑会话 | **接受**（K27）：凭据本身不含会话，核对按（会话，`CallId`，生效参数） | [S-23](v2/contract.md#s-23-提交一批) ②；本文件「由别处承担」第一行 |
| 同上 | 同上 | X-7 帧流收尾、`ToolInternalMessage` 判据 | **接受**（K2）：改引 `data.messages/v2#S-14`；等待到点与执行者换代落 `lost`（经 `abandon`）；判据为交出的块非空 | [S-19](v2/contract.md#s-19-送达)、[S-39](v2/contract.md#s-39-发帧) |
| 同上 | 同上 | X-9 卸载判定的能力标识没人定 | **接受**（K29）：`omne-official:offload-judgment`，登记消费 `data.loop-extension` S-7 | [S-63](v2/contract.md#s-63-卸载判定这一件)、S-1、S-42 |
| 同上 | 同上 | X-10 产品 rev 过期 | **接受**：逐版复核，见「变化的影响」 | 契约头部；S-12、S-19、S-20、S-39、S-42 |
| 同上 | 同上 | X-11 规格层名字无词条 | **接受**（按主线：产品正文没定义的规格层名字不立词条）：活体、执行者、失败的种类仍标「（无词条）」，已有词条的（到达装配、在途状态、发帧、执行帧、拓展件不可用处置）逐处链接 | S-1、S-7、S-11、S-37、S-39、S-63 |
| 同上 | 同上 | X-12 账本编号与施工标签 | **接受**：改链 D-060 与产品小节；尚无决定记录的归 G-13 | 设计依据、G 表、S-42、S-43、examples、formal/README、README |

### 第二轮（2026-09-25）

spec-reviewer 第二轮复评，对象 v2 candidate，基线 HUB `8ad37c50`，发现表 `tmp/assets-runtimes/reviews/r2-R4a.md`（任务区）；处置依据 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（下称 M 编号）与 [§六 N-8](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)。

| # | 发现 | 处置 | 落在哪 |
|---|---|---|---|
| X2-1 | 【阻断】查注册表用定义名，与注册表按模型面名字建键对不上；没登 asset-registry S-25；注册表的「没有」没有收法 | **接受**（M8、M10）：以 `call.tool` 原样（`ModelToolName`）查，逆转写只为找执行者；登记消费 S-25；「没有」→ 那一项即刻 `unavailable{no_such_entry}`，与「读不到」分开；报告里查不到条目的调用以新批项 `UnlistedCall` 交来（名字本契约取，R-34），查得到条目即整批 `notAdmitted`。注册表一侧（S-7、S-25）归 asset-registry 起草者 | [S-23](v2/contract.md#s-23-提交一批) ①②④⑤⑥⑧ 与表后两条；S-1、S-2、[S-4](v2/contract.md#s-4-依赖方向与被消费的面)、S-6、S-9、S-15、CS-1；[S-69](v2/contract.md#s-69-查不到条目的调用即刻收场不可用)；examples 第 8 节；catalog |
| X2-2 | 【应修】宿主撤下时在途的流：三份契约三种说法；TER「撤除时不写收场」与 call-accounts S-11「计数的一方还在却丢了是违约」相抵 | **接受**（M12）：有序撤下前对每个开着的装配状态 `abandon`（`lost`），账取 `abandon` 的 `frames`，当场写首胜收场；停机仍 `"unknown"`。stream-assembly 那一半（SA2-1）由本批同一起草者在那份契约落；MRR 一侧归 R5 起草者 | [S-48](v2/contract.md#s-48-本能力自己的撤除与换代)、[S-62](v2/contract.md#s-62-工具侧到达装配前提的承诺) 第 6 条、[S-39](v2/contract.md#s-39-发帧)、S-9、S-10、S-11、S-13、S-46；[S-68](v2/contract.md#s-68-有序撤下收尾在途的帧流上交之后撤下)；examples 第 10 节 |
| TE2-1 | 【应修】D-060 §六 N-8 没落进本契约：七处「决定记录待补」、G-13 开着、第 134 行「名字由本契约取」、verification R 行未标已裁 | **接受**：七处改链 N-8；G-13 闭合；那一行改链 N-8；R-28～R-31、R-33 标已裁 | 设计依据第二张表、[S-11](v2/contract.md#s-11-失败的种类) 两条、[S-23](v2/contract.md#s-23-提交一批) 表后、[S-37](v2/contract.md#s-37-执行者登记与撤下)、[S-43](v2/contract.md#s-43-一批依次与同一工具的并发上限)、[G-13](v2/contract.md#十二已知缺口)；本文件「报给主线」 |
| TE2-2 | 【应修】S-40 ⑥ 没收 ⑧ 用到的 `invalidInput` | **接受**（M29）：⑥ 补 `invalidInput`，写明集合闭合、单笔不合形状走 ⑤ | [S-40](v2/contract.md#s-40-报账) ⑥⑧ |
| TE2-3 | 【应修】S-39 ⑧ 把形状问题一律收成 `malformed` | **接受**（M29）：形状不合的事件交给 `accept`、按原名交回、照 S-62 第 4 条补 `trim`；本能力自己只在事件缺席时给 `malformed`、不补 `trim`（「不补」是本契约的推导：没交出任何一帧） | [S-39](v2/contract.md#s-39-发帧) ⑤⑧；examples 第 10 节 |
| TE2-4 | 【应修】S-41 ⑤ 的 `escalated` 与 S-47「存储回来后照常写」给出不同收场 | **接受**（M13）：上交之后本任撤下、不再服务，删「存储回来后照常写」；交回的结果随本任丢弃，下一任扫描落 `failed{abnormal_interruption}`；等着的 `awaitForeground` 得 `runtimeStopped`、不一直等 | [S-47](v2/contract.md#s-47-依赖的提供者不可用)、[S-41](v2/contract.md#s-41-交回) ⑤、[S-48](v2/contract.md#s-48-本能力自己的撤除与换代)、S-15、第八节不变量；S-68；examples 第 6 节 |
| TE2-5 | 【建议】同一批多项凭据核对结果不同时给哪个失败值；`verifyToken` 的 `invalidInput` 与 ⑥「先于一切」不一致 | **接受**（M29）：取 ⑥ 最左（`invalidInput` > `notAdmitted` > `admissionUnavailable`），`why` 取批内最前那个不符项的 `reason`（「批内最前」是本契约的推导）；⑥ 写明 `verifyToken` 的 `invalidInput` 出在第 5 步 | [S-23](v2/contract.md#s-23-提交一批) ② 第 5 条、⑥ |
| TE2-6 | 【建议】S-39「有意停下」的列举漏了 agent 掐掉 | **接受**：改为「收场为 `interrupted` 的全部」并指 S-10 那几行，列举补 agent 经 `BkgJobs()` 掐掉 | [S-39](v2/contract.md#s-39-发帧) 帧流收尾那一条 |
| TE2-7 | 【建议】S-4 与 catalog 漏登 stream-assembly S-23、S-24 | **接受**：它们是发帧原语原样交回的拒绝值出处，实质消费，补登 | [S-4](v2/contract.md#s-4-依赖方向与被消费的面)；catalog |
| M16 | S-62 路由键与观察者范围（R5 R2-MRR-6 在本能力的同形处） | **接受**：第 1 条按（会话，目标）路由，第 9 条只推给本会话观察者；无处可说的拒绝照旧留记录条目 | [S-62](v2/contract.md#s-62-工具侧到达装配前提的承诺) 第 1、9 条 |
| M18 | README 那句「提供者是运行时协程」 | **接受**：改为这句原文并链 M18 | [README](README.md) |
| M23 | S-25 表下「主线裁定 2026-09-24」没有持久出处 | **顺带改链**：以 PF-006 §6.7 为准、D-060 §七 M23 | [S-25](v2/contract.md#s-25-中断一次执行) |

**核对**：评审表里 TE-5、X-1、X-2 三项「兑现有误」随上面几行一并处置；X-12 的残留即 TE2-1。

## 实现映射反推（2026-09-25）

realization-drafter 起草本能力的节点（`realization/packages/tools/tool-execution-runtime/`）时报回的契约层缺陷，主线裁定见 [D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（下称 M 编号）。本契约涉及三条。

| 裁定 | 来源 | 处置 | 落在哪 |
|---|---|---|---|
| M33 `submit` ① 加 `report`：与 runner `dispatch.admission.report` 同一份值；② 第 6 条据它查注册表；跨进程随请求传递、接收边界核会话与 `runId`、不得现算 | 庚 T-1、A-7、B-6 | **接受**。**推导两处**（与 runner [S-21](../loop-extension-runner/v2/contract.md#s-21-dispatch一次经过) ⑥ 同一条）：核对不上收成 `invalidInput`，排在一切之前——只比对交来的值、不读任何东西；`report` 必带，一批里全是 `UnparseableCall` 也必带（缺席即拒，不因用不着就放过）。报告不再是会「读不到」的依赖：S-47 注册表那一行写明 | [S-23](v2/contract.md#s-23-提交一批) ①②⑥⑧、S-4、S-6、[S-15](v2/contract.md#s-15-缺席时的默认答案)、[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证)、[S-47](v2/contract.md#s-47-依赖的提供者不可用)、CS-1、设计依据表；examples 共用局面与第 8 节 |
| M42 S-46 加一行：`execution.delivered` 只在进程内通知、不得跨进程广播；载荷只带标识与收场；进程内不按租户分开，监听者按载荷自筛 | 庚 F③、壬 | **接受**：S-46 末行，左列写单机进程内的做法、右列写分布式不得广播与替代的来路（读日志，或 G-17 那份订阅面）、末列写做不到会怎样；S-45 加一条指路。**载荷不变**（S-45 列的 `tenant, session, callId, segment, outcome` 已只有标识与收场） | [S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证) 末行、[S-45](v2/contract.md#s-45-送达通知)、设计依据表 |
| M43 TER 的 `after_action` 驱动与观察者订阅（T-2、T-3）、`late` 读面与模型调用成本路由（T-4、T-5）本程不补、登缺口（owner 主线） | 庚 | **接受**：T-2 并入 G-6（放宽到前台也没有交回面）；T-3、T-4、T-5 新登 G-17、G-18、G-19。**三处本契约的推导**：G-6 闭合之前只能按「那一关不可用」落（S-42 那一支，是降级不是兑现）；G-17 闭合之前帧的增量不推给任何观察者（没订阅、没验身份的一方不收）；G-18、G-19 写明缺席在那两格上各有确定含义（「不晚」「一次都没调」），闭合之前照写缺席就是替判不出的事写结论——这两格**兑现不了**，不给过渡值 | [第十二节](v2/contract.md#十二已知缺口) G-6、G-17～G-19；[S-13](v2/contract.md#s-13-账)、[S-40](v2/contract.md#s-40-报账)、[S-42](v2/contract.md#s-42-结果落成消息之前的那一关)、[S-62](v2/contract.md#s-62-工具侧到达装配前提的承诺) 第 9 条 |
| M46（追加）报告加 `attempt`（asset-registry S-11 带这一次尝试的 `AttemptId`）；`submit.report` 接收时核会话、`runId`、`attempt` 三者，对不上 ⇒ `invalidInput` | 子报回（本文件 R-38） | **接受**：S-23 ① 写明三者须与本次相同、⑥ `invalidInput` 那一句改为三者；S-4 asset-registry 行、S-15、S-46 报告那一行、CS-1、设计依据表同改；examples 第 8 节加上一次尝试那一支。报告的 `attempt` 格由 asset-registry 同轮加（另一位起草者） | [S-23](v2/contract.md#s-23-提交一批) ①⑥、[S-15](v2/contract.md#s-15-缺席时的默认答案)、[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证) |
| N-22 T-16（跨批对齐追加）参数判定编不出或超出上限（含判定超时）⇒ 该项 `failed{schema_unsupported}`，带说明，不新增值、不牵连同批；作者写的工具碰上 `schema_unsupported` 同此收场 | 庚对齐报回、主线裁 | **接受**（drafter 丑落）。**推导两处**（R-40）：① **判不了先于判不合**——判定没走完即 `schema_unsupported`，不拿走完的那一部分报 `arguments_invalid`；② 块上**不说「参数不合」、不附用法**（判不出来与判为拒绝是两个值）。判定时限的值不在本契约，挂 `data.tool-definition` 的 G-16 | [S-11](v2/contract.md#s-11-失败的种类) 表与块上一条、[S-23](v2/contract.md#s-23-提交一批) ④⑤、S-38 与卸载那一关的两处列举、S-4 对 tool-definition 那一行、设计依据表；examples 第 8 节一行 |
| M75（节点独立评审 N3 范围外 ②，覆盖 N-25 后半）S-30 答复形状校验判不了（编不出、超上限、超时）⇒ 答复照 ④ 受理、执行随即 `failed{schema_unsupported}`，不以 `invalidInput` 回给答复者 | N3 | **接受**：S-30 ⑥ 去掉「判不了」分支，表下加一条；与 S-23 ④ T-16 同口径。N-25「收成 `invalidInput`」作废 | [S-30](v2/contract.md#s-30-答复等待) ⑥ 与表下第一条 |

**examples 对 Schema 的机检（2026-09-25，跨批对齐，drafter 丑）**：本契约不附 Schema，examples 是操作层面的「输入 → 预期」，其中唯一完整的 data 契约之值是第 10 节那一帧 `{"t": "sparkle", "index": 0}`——按 `data.arrival-events` 的 `ArrivalEvent` 判为不过，与「认不出的种类」一致：**1 处，0 不符**（暂存区脚本，`jsonschema` 4.26.0，设计根下全部 Schema 按 `$id` 登表）。只核形状，不是 V- 义务的执行证据。**名字与形状核对**：`report` 带的「会话、运行、尝试」与 asset-registry S-11、runner S-21 ① 逐字同一组，`attempt` 是整数序号 `AttemptId`，本契约实例写 `attempt = 1`；无改动。

## 修订波（2026-09-25 公开面）

依据链：[D-063](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1（替身改为接口契约 ＋ 最小提供者）；[D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-29（读面立契约时加 `dependencyUnavailable{runAttemptFacts}`）、N-37 ④（尝试事实最小提供者不另存表、「已终结」产品装配恒 `unavailable`）、⑨（执行环境的消费者是本契约 S-38 第 2 步与 G-4）。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **失败值全集加 `dependencyUnavailable{runAttemptFacts}`**：落账要的两件事实读不到（`attemptFacts` 答 `unavailable` 或 `attemptNotFound`）⇒ 这一次收场写不下去；七个要写收场与账的操作 ⑥ 逐条加入；交回以 `escalated` 交代、时间触发的收场上交；**不写缺席的 `late`** | N-29 | 失败值全集、[S-13](v2/contract.md#s-13-账) `late` 一格、[S-15](v2/contract.md#s-15-缺席时的默认答案) 新一行、[S-23](v2/contract.md#s-23-提交一批)／S-25／S-26／S-28／S-29／S-31／S-32 各 ⑥、[S-47](v2/contract.md#s-47-依赖的提供者不可用) 新一行、examples §8 新一行 | **失败集合扩大一值**：调用方（agent loop、交付面、入站受理方）的失败处置要认得它；原先这一格借用的 `{storage}` 不再用于它。**推导**：`attemptNotFound` 也收成它（那份契约答「日志里没有这次尝试」时，本能力手上这笔账的归属无从核实，不是「不晚」） |
| **会话持有的租户改读 `capability.session-tenancy/v2#S-8`**：`sessionNotFound` 与 `unavailable` 都是读不到 ⇒ 整批 **`dependencyUnavailable{sessionTenancy}`**——失败值全集加这一值，与 `{runAttemptFacts}` 同列，不再借用 `{storage}`（初稿沿用 `{storage}`、报主线 R-41，主线同日裁定加专值） | R-1；主线裁定（R-41） | 失败值全集、[S-15](v2/contract.md#s-15-缺席时的默认答案) 新一行、[S-21](v2/contract.md#s-21-租户与会话范围)、[S-23](v2/contract.md#s-23-提交一批) ⑥⑧、S-47 新一行、场景 S-67、examples §7 第 7 步、[G-12](v2/contract.md#十二已知缺口) 收窄 | **失败集合再扩一值**：`submit` 的调用方要认得它；读得到时语义不变 |
| **运行时面接进产品装配的前提**：loop／会话那一程立起真提供者——`capability.run-attempt-facts` 的 G-3（运行终结记录）、会话持有租户的写入方（`capability.session-tenancy` 的 G-2）、在场事实。本程产品装配没有 loop 与会话，这三份读面在那里**没有调用者**；验收装配以种子答（N-37 ④）。R-42 与 modality-projection、runner 报的两件是**同一个事实**，不改条款、不给 `late` 加第三值 | 主线裁定（R-42） | [G-18](v2/contract.md#十二已知缺口) 的 owner 一栏 | 不改语义 |
| **S-38 第 2 步改问 `capability.execution-environments/v2#S-12` 的 `placeExecution`**：答 `host` 即到位，其余每一种都是 `failed{environment_unavailable}`，不降级、不换落点；`environment` 成员指那份契约 S-5 | R-1；N-37 ⑨ | [S-38](v2/contract.md#s-38-起执行者)、[S-6](v2/contract.md#s-6-执行记录) `environment` 一行、S-47 新一行、[G-4](v2/contract.md#十二已知缺口) 收窄为「沙箱与设施匹配」 | 不改语义（到不了位原本就是这一个收场）。**推导**：`referenceNotValid`、`environmentsWithdrawn`、`invalidInput` 也收成它——那一次执行起不来，原因写在块上，不牵连别的执行 |
| **送达的承接形状只剩发件箱一种**：会话日志窄口不加入别的 owner 的事务（`capability.session-log/v2#S-3`），共同的存储对象是判重键（S-8）；条目壳的最小成员指那份契约 S-6 | R-1；那份契约 S-3 已写明本能力选了出站项（M44） | [S-19](v2/contract.md#s-19-送达)、[S-22](v2/contract.md#s-22-关键转换留记录) 首段、[S-46](v2/contract.md#s-46-装配给的保证-vs-协议须给的保证) 那一行、[G-1](v2/contract.md#十二已知缺口) 收窄为真承接者未到 | 收窄「两种形状契约不选」为一种；提供者设计早已选了这一种（M44），**对它无影响** |
| G-1、G-4、G-12、G-18 各写成「接口已定，真承接者未到」与剩下的那一截；G-18 保留读写之间的窗口，并如实写出**产品装配里「已终结」恒 `unavailable`、凡要落账的收场都写不下去** | R-1；N-37 ④ | [第十二节](v2/contract.md#十二已知缺口) | 见「报给主线」R-42 |
| 场景：S-50 解阻并加一支「两件事实读不到」、S-52 注明 `late` 由种子答、S-67 解阻；「由别处承担」表改指三份接口契约并加两行 | R-1 | 本文件[规范场景](#规范场景)与「由别处承担」 | 状态仍全是**未开始** |
| catalog：本契约新增四条依赖（`capability.session-log` S-3、S-6、S-8、S-17；`capability.session-tenancy` S-5、S-8；`capability.run-attempt-facts` S-5、S-6、S-9；`capability.execution-environments` S-5、S-6、S-12） | 引用即消费 | [S-4](v2/contract.md#s-4-依赖方向与被消费的面)、页首依赖表、README | 四份接口契约都不以坐标依赖本契约，无环 |

**没有证据因此作废**：`Execution.tla` 把送达建成「交付 ＋ 追加」两步（`DurableHandoff` 开关），原本就同时覆盖两种承接形状，收窄到发件箱一种不动它；模型不建租户读面、尝试事实与落点，失败值全集多一值也不进模型。此前的运行结果照旧有效。

## 报给主线

产物末尾的问题清单：**要主线或产品负责人答的**，与契约[第十二节](v2/contract.md#十二已知缺口)「契约自己承认的缺口」分开。

| # | 问题 | 坐标 | 种类 |
|---|---|---|---|
| R-1 | **「工具执行运行时」这项能力没有词条**：词表把它并进了 UL-tool-execution（单次执行自己的运行时），承载全部执行的这一项能力本身无词可用；本契约只在入口处说明，正文用「本能力」 | 契约 S-1；[UL-tool-execution](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) | 无词条 |
| R-2 | **另三个无词条概念**：「活体」（S-7）、「执行者」（S-37）、「失败的种类」（S-11）；本契约各在一处给了用法说明，未立正式名 | S-7、S-11、S-37 | 无词条 |
| R-3 | **账本外取的名字**：失败值 `notInBackground`、`callIdConflict`、`dependencyUnavailable{which}`、`runtimeNotReady`（对账产物给的）；操作 `preempt`、`awaitForeground`（对账产物给的）；`AdmittedCall.startInBackground`；`waitIndex`；事件 `execution.delivered`；失败种类的八个值 | S-23、S-24、S-31、S-45 | 账本缺名；**已裁（2026-09-23，S13-c 采纳 `callIdConflict`、`dependencyUnavailable{which}`、`notInBackground`）** |
| R-4 | **账本的 `ExecutionState` 单枚举被拆成两个维度**（姿态 × 阶段）：`backgrounded` 是前台那一次调用的收场，不是执行的状态；单枚举装不下「后台且排队」「前台且在等」 | S-8 | 简报改判；**已裁（S13-c 采纳）** |
| R-5 | **简报的 `environmentUnavailable` 失败值去掉了**：执行时才发现的落点拒绝按主线裁定是收场 `failed{environment_unavailable}`，不是操作失败 | S-11、S-38 | 简报改判 |
| R-6 | **超时与阈值不计等待时间**：B-M08 说超时是「前台等待上限」，本契约读成「前台在跑的时间」，等待期间不走——否则一段不占资源的等待会被替人签字（PF-006 §6.6）。若主线本意是计入等待，S-44 与 S-12 要改 | S-44 | 推导待确认；**已裁（S13-c 采纳）** |
| R-7 | **并发上限的计数范围取会话**（同一会话、同一工具名，不论姿态）；B-M08 没说范围 | S-43 | 推导待确认；**已裁（S13-c 采纳）** |
| R-8 | **插队同样处置同一批里还排着的调用**（允许后台的转后台、不允许的中断）；PF-014 §5.4 只说「工具执行中」 | S-31 | 产品问题；**已裁（S13-c 采纳 `preempt` 原子且处置同批排队者）** |
| R-9 | **用户单独中断一次执行之后，同一批后面的调用照样起**；要停这一步走取消运行或插队 | S-43 | 推导待确认；**已裁（S13-c 采纳）** |
| R-10 | **agent 只能掐掉后台执行**（`notInBackground`）：PF-006 flows §四「agent 不中断自己的执行」与 PF-007 §6.10 `terminate` 的调和，按「前台的那一次正阻塞着它自己」读 | S-25 | 推导待确认；**已裁（S13-c 采纳 `notInBackground`）** |
| R-11 | **卸载判定不可用时，作者声明的卸载无人兑现、原始结果丢失**：主线裁定「只记可见」的直接后果，与 PF-006 §6.10「存着，没丢」相抵 | S-42、G-6 | 与裁定的冲突；**已闭合（S13-b：原始结果由本能力总是存下）** |
| R-12 | **`answerWait` 本版没有「明确拒绝回复」**：插队时的 `human_declined` 是中断，不是答复；卡片上人点「拒绝回复」怎样进来，要卡片契约给 | S-30、G-10 | 产品问题 |
| R-13 | **报了但被拒的一笔费用**：本契约选「不进 `items`、留一条记录条目」，不变成一笔 `source: none` 的未知（替 call-accounts 的 G-5 落地） | S-40 | 推导待确认；**已裁（S13-c 采纳）** |
| R-14 | **消费了 `data.identity-values` v1**（简报 catalog 依赖清单里没有它）：租户身份、身份参数无默认、缺席即拒、表示层校验与判定分开 | S-4 | 简报补项 |
| R-15 | **执行结束不另补 `interrupted` 提醒**：`data.messages` S-21「只要中断就补」对工具执行是否适用未定，本版只落占位 | G-14 | 与其他契约的疑似冲突；**已闭合（S13-d）** |
| R-16 | **归档流程里工具执行与模型请求「先停谁」**：PF-015 §6.3 列的次序本契约不管，只保证调用之后没有未收场的执行 | S-29 | 归会话那一程 |
| R-17 | **注册表判为不可用的条目落 `failed` 与 PF-006 的「换替换件、落 `unavailable`」对不上**：主线转达把「关掉的命令、依赖未解析、MCP 连不上的原位顶替」列为落 `failed{…}` 带注册表原因；而 PF-006 [flows §二](../../../product/PF-006-tools-and-skills/flows.md#二异常分支)、[§6.3](../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)、[§6.13](../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用) 把依赖连不上、MCP 连不上都写成装替换件、调用得「不可用」（绕路、别重试）。`failed` 给 agent 的下一步是「重试、换招」，与「别重试」相反。本契约按注册表给的支走：`stand_in` → `unavailable`，`unavailable{reason}` → `failed{not_available}`；**请主线确认哪些情形该落哪一支**，并同步给 `capability.asset-registry` | S-23 ④、S-11 | 与产品正文的冲突；**已闭合（S13-a：一律 `unavailable`）** |
| R-18 | **进展任务慢**：`tool-execution-runtime-v2-execution-progress` 本机约 16 分钟（超时登 2400 s），`make design-check FORMAL=run` 的总时长随之翻倍；安全任务约 75 秒。要不要把进展任务移出例行运行、或再缩场景，由主线定 | formal-tasks | 工具与流程；**已裁（S13-e：保留登记，不加机制）** |
| R-19 | **词条描述过时**：[UL-cancellation-follows-host](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host) 的索引描述仍写「转后台就是换宿主」，与 PF-006 rev 17、PF-012 §6.13「转后台不换宿主」相抵（主线已知，B-M06(ul)） | —— | 词条 |
| R-20 | **「摘要缺席」读成作者的 `summary` 与运行时占位说明都不落**（账本 S13-b「它不可用时消息里只落引用、摘要缺席」）：把二者排进占位的是卸载判定那一关，它不在就没人排。若本意只是「系统不写摘要」、作者的 `summary` 照落，S-42 那一条改一句 | S-42、S-15 | 推导待确认（2026-09-24） |
| R-21 | **声明卸载的原始结果存不下时上交**：S13-b 让本能力总是存，存储读写不了时按「执行记录读写不了」同一处置（收场照写、落盘写不下去就上交），不假装存下 | S-36 | 推导待确认（2026-09-24） |
| R-22 | **失败种类由八个变七个**：S13-c 采纳的「失败种类八值」数的是 S13-a 之前的表；删去 `not_available` 之后是七个 | S-11 | 账本数字过时（2026-09-24） |
| R-23 | **简报写「MCP 例外条款与 mcp-bridge S-27/S-38 互指」**：mcp-bridge v2 没有 S-38；按本契约 S-37（执行者登记与撤下）↔ 桥 S-27（桥被替换或卸载）互指，另引桥 S-21（失败值与收场的对应） | S-37 | 简报坐标（2026-09-24） |
| R-24 | **「未知键都拒」的读法**：修订批简报写「未知键与缺必填键都拒」。本契约读作「`input` 不收的键」——`input` 用 `additionalProperties: false` 关住了才拒，没关的照 Draft 2020-12 收下。若读成「`properties` 里没有的键一律拒」，会与 `data.tool-definition/v2#S-5` 的「只带命令清单」写法（`{"type": "object", "properties": {}}` 收任何一个对象）和 PF-006 §5.3「对不对由工具自己判」相抵——那种写法下任何参数都会被拒。**请主线确认**；若取后一种读法，TD S-5 与 PF-006 §5.3 那一行要一起改 | S-11、S-23 ④ | 简报读法待确认（2026-09-24）；**已裁（主线 2026-09-24：未知键一律拒——`input` 顶层没写 `additionalProperties` 按 `false` 读，显式 `true` 或 schema 才收；与「工具自己判」不冲突，这是判的规则；TD S-5 补末条）** |
| R-25 | **「前台超时」没有 token**：PF-006 rev 18 §6.6／§6.7 定了占位原因「前台超时」，`data.content-blocks` v2 的 S-18 没有对应的 `reason.code`，账本也没给名字；本契约不自造。前台上限到点而不许后台时，记录照写、那条消息落不下去（S-10 那一行「停下并上交」） | S-10、S-44、G-3 | 账本缺名（2026-09-24）；**已裁（主线 2026-09-24：定名 `foreground_timeout`，进 `data.content-blocks` v2 S-18）** |
| R-26 | **参数判定的两个次序是推导**：同一项既被注册表判为不可用又参数不合时报 `unavailable`；参数不合又发起即后台被拒时报 `arguments_invalid`。简报只说「按所选命令的 `input` 校验」，没说与另两种即刻收场谁先 | S-23 ④ | 推导待确认（2026-09-24）；**已裁（主线 2026-09-24 确认）** |
| R-27 | **单函数工具同样判参数**：简报写「按所选命令的 `input`」；本契约把单函数工具（按它的 `input`）一并纳入同一种类——否则 MCP 条目与单函数工具的坏参数会原样交给执行者，与多命令工具两套规矩 | S-11、S-23 ④ | 推导待确认（2026-09-24）；**已裁（主线 2026-09-24 确认）** |
| R-28 | **本轮由本契约取的名字**（D-060 §五只给了语义）：失败值 `notInForeground`；批项 `AdmittedCall`／`UnparseableCall`；执行记录的 `reportedCost`；四个原语的交回值——等待 `answered{value, by}`／`ended{outcome}`，发帧 `accepted`／`dropped{rejected{value}｜notAFrame｜executionEnded}`，报账逐笔 `recorded`／`rejected{value}`（含 `notToolReported`）／`executionEnded`，交回 `settled{outcome}`／`discarded`／`escalated` | [S-6](v2/contract.md#s-6-执行记录)、[S-12](v2/contract.md#s-12-等待)、[S-23](v2/contract.md#s-23-提交一批)、[S-39](v2/contract.md#s-39-发帧)～[S-41](v2/contract.md#s-41-交回) | 名字待过目（2026-09-24）；**已裁（[D-060 §六 N-8](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) 接受）** |
| R-29 | **租户核对排在判重之前**：K50 只说判重在凭据核对之前；本契约把会话租户的核对再往前放一步，否则别的租户的调用方能据幂等返回读到这个会话里登记过哪些调用 | [S-23](v2/contract.md#s-23-提交一批) ② | 推导待确认（2026-09-24）；**已裁（D-060 §六 N-8「租户核对先于判重」）** |
| R-30 | **交回写不下去时 `escalated`**：收场写不下去就上交（PF-011），这次执行此刻没有收场，由下一任恢复扫描按停机处置；执行者不重交 | [S-41](v2/contract.md#s-41-交回) ⑤⑥ | 推导待确认（2026-09-24）；**已裁（D-060 §六 N-8；上交之后本任撤下见 §七 M13）** |
| R-31 | **几条主线裁定尚无决定记录**：一批依次、本地实现撤下不影响在途、落点执行时不到位落 `failed{environment_unavailable}`（2026-09-23）；参数不合即刻失败并带用法、未知键一律拒、单函数工具同一规则、即刻收场的次序（2026-09-24） | [G-13](v2/contract.md#十二已知缺口) | 决定记录待补；**已闭合（D-060 §六 N-8 登了这七条，G-13 关）** |
| R-32 | **会话持有的租户由谁给读面**：提交时要读它，会话那一侧还没有契约 | [G-12](v2/contract.md#十二已知缺口) | 与其他契约的缺口 |
| R-33 | **报告写着某个接入点「没有」生效的持有、而那个接入点的动作仍被提交时，按读不到处理**（整批 `dependencyUnavailable{registry}`）：这只会是上游不一致（没有持有就钉不出动作集）；本契约取明确失败，不替它补一份持有、也不落 `unavailable` | [S-23](v2/contract.md#s-23-提交一批) ② | 推导待确认（2026-09-24）；**已裁（D-060 §六 N-8）**。M10 之后这种调用多半在查条目那一步就得「没有」（失去生效持有的接入点，动作条目不在表里），本条只剩「条目在、持有却写没有」的上游不一致 |
| R-34 | **本轮由本契约取的名字：批项 `UnlistedCall = { call }`**——D-060 §七 M8、M10 给了语义（报告里查不到条目的调用不进 `admit`、由本能力收 `unavailable{no_such_entry}`），没有给批项的名字；没有它，loop 无从把一个没凭据的调用交进 `submit`。另有两处推导：`UnlistedCall` 查得到条目 → 整批 `notAdmitted`（宁拒不执行、不信交来一方说的「查不到」）；`{no_such_entry}` 是执行记录上的原因、不是块上的 `reason.code`（`data.content-blocks` S-18 规定 `unavailable` 不带） | [S-23](v2/contract.md#s-23-提交一批) ①②④ | 名字待过目；推导待确认（2026-09-25） |
| R-35 | **`data.messages` S-14 的对应表没有「工具执行运行时有序撤下」这一行**：M12 之后本能力有序撤下时对开着的帧流调 `abandon`，`ending` 落 `lost`；那张表现有「执行者换了代」一行只写 MCP 桥。建议甲在那张表补一行（或把「执行者换了代」写宽到「执行那一侧的承载者撤下」），本契约 S-39 已按 `lost` 写 | `data.messages/v2#S-14`；本契约 [S-39](v2/contract.md#s-39-发帧)、[S-48](v2/contract.md#s-48-本能力自己的撤除与换代) | 与其他契约的措辞对齐（甲那一侧） |
| R-36 | **`data.content-blocks` S-18 `abnormal_interruption` 那一行只写「据点停过机、恢复时追补；或 MCP 桥换代」**：M12 之后本能力有序撤下时也当场写这个值；取值与收场不变，只是那一行的说明窄了一路 | `data.content-blocks/v2#S-18`；本契约 [S-10](v2/contract.md#s-10-占位原因) | 描述对齐（甲那一侧） |
| R-37 | **上交之后的那条条目落在哪**：PF-011 §6.3「上交必须留下条目」，而本能力上交恰因为执行记录与会话日志写不下去——那条条目此刻进不了会话日志。本契约只写到「上交、撤下」，条目由接手那一层（部署装配）留在哪、以什么形式（结构化日志？），本版没有答案 | [S-47](v2/contract.md#s-47-依赖的提供者不可用)、[S-41](v2/contract.md#s-41-交回) ⑤ | 与其他契约的缺口（装配与观测那一程）；**不自决** |
| R-38 | **修复波 3 的两处推导待确认**（[D-060 §八 M33](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：`report` 与本次会话、运行对不上收成 `invalidInput`、排在一切之前（与 runner 同一条）；`report` 恒必带，一批里全是 `UnparseableCall` 也不例外。另：报告只带会话与运行、不带尝试（`capability.asset-registry/v2#S-11`），**同一运行里上一次尝试的报告核对得过**——M33 只要求核会话与 `runId`，本契约照此，不另加一条 | [S-23](v2/contract.md#s-23-提交一批) ①⑥⑧ | **已答（2026-09-25）**：两处推导经 D-060 §八 N-20 接受；尝试那一半裁为 M46——报告带 `attempt`，核三者（本文件「实现映射反推」M46 行） |
| R-39 | **M43 那几个缺口在闭合之前怎样落，本契约只写了方向**：G-6 按「那一关不可用」落（降级）；G-17 不推给任何观察者；G-18 的 `late`、G-19 的 `usage` 与模型调用成本**兑现不了**、不给过渡值。实现节点若要一个过渡写法（例如 `late` 判不出时写什么），须主线另裁——`data.call-accounts` 里这两格的缺席各有确定含义，没有「判不出」的写法 | [G-6](v2/contract.md#十二已知缺口)、G-17～G-19 | **已答（2026-09-25）**：D-060 §八 N-20 接受——G-6／G-17～G-19 闭合前 `late`、`usage` 不给过渡值 |
| R-40 | **T-16 落地的两处推导**（[D-060 §八 N-22](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：① 判定没走完（超时）就以 `schema_unsupported` 收场，即使已判出某个键不合也不报 `arguments_invalid`——否则同一次调用在快慢两台机器上收场不同的机会更多；② `schema_unsupported` 的块只说「判不了、哪一种」，不附用法、不说参数不合。另：「判定时限」是实现登记的第三样上限，本契约不取名、不填值，挂 `data.tool-definition` 的 G-16 | [S-11](v2/contract.md#s-11-失败的种类)、[S-23](v2/contract.md#s-23-提交一批) ④ | 推导待确认（2026-09-25，丑） |
| R-41 | **会话租户读不到仍借 `{storage}`，尝试事实读不到已是 `{runAttemptFacts}`——两处不对称**：N-29 只给尝试事实这一格加了专值；`holdingTenant` 答 `sessionNotFound`／`unavailable` 本波沿用 `dependencyUnavailable{storage}`（存储其实是好的）。要不要同样加 `{sessionTenancy}`，由主线定；本波不自加 | [S-21](v2/contract.md#s-21-租户与会话范围)、[S-23](v2/contract.md#s-23-提交一批) ⑧；`capability.session-tenancy` 消费者核对那一行 | 与其他契约的对齐。**已裁（主线，2026-09-25）**：加 `dependencyUnavailable{sessionTenancy}`，与 `{runAttemptFacts}` 同列；已落（见[修订波](#修订波2026-09-25-公开面)第二行） |
| R-42 | **产品装配里本能力一次账都落不下**：`capability.run-attempt-facts` 的最小提供者在运行终结记录形状（它的 G-3）定下之前对「已终结」恒答 `unavailable`（[D-060 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④），`attemptFacts` 因此整次 `unavailable`；按 S-13 读不到就不写缺席的 `late`，于是**凡要落账的收场都写不下去**——操作以 `dependencyUnavailable{runAttemptFacts}` 失败，执行者交回的以 `escalated` 上交、本任撤下。这是 fail-closed 的正确方向，但等于产品装配里工具执行跑不完。可选的出路（不自选）：接受到那份 G-3 闭合为止；或让那份读面在「已被取代」为真时单给出它（`late` 只要任一为真即 `true`）；或 `data.call-accounts` 的 `late` 加一个「判不出」取值 | [S-13](v2/contract.md#s-13-账)、[G-18](v2/contract.md#十二已知缺口)；`capability.run-attempt-facts` G-3、S-9 | 产品／与其他契约的缺口。**已裁（主线，2026-09-25）**：与 modality-projection、runner 报的两件是同一个事实——本程产品装配没有 loop 与会话，这些读面在那里没有调用者，验收装配以种子答（N-37 ④）；**不改条款、不给 `late` 加第三值**，前提写进 G-18 的 owner 一栏（见[修订波](#修订波2026-09-25-公开面)第三行） |

- 2026-09-25（N-25）：S-30 ⑥ 的 `invalidInput` 扩到「形状校验判不了」（编不出、超上限、校验超时），不新增值；证据义务同 N-15 那一支。
