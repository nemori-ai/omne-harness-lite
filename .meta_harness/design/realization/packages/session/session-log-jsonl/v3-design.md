# session-log-jsonl：SL3 条件追加投影候选

2026-09-27，rev 2，**candidate，未接受，尚未建包、未实现、未实际验证；新增绑定 0 条**。本页仅起草既有节点对 `capability.session-log/v3` 的必要增量；原 [design.md](design.md)、[v2-design 候选](v2-design.md) 与四件套原字节保留。新增类型、函数、服务、状态和字段名均为**提供者实现面候选**；三个业务操作名沿契约。本文不是新契约，也不接受自己的方案。

## 输入、精确采用与分层状态

| 输入 | 状态与本节点的消费范围 |
| --- | --- |
| [capability.session-log/v3](../../../../spec/capabilities/session-log/v3/contract.md) | baseline `omne-harness-lite-design-2026-09-15`，catalog accepted；D-083 接受全 37 条及 24 项资源。contract SHA-256 `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`。本页投影全部三操作，重点新增 S-32～S-37 |
| SL3 的五项精确依赖 | identity-values1、messages2、call-accounts2、content-blocks2、session-tenancy2，按 SL3 S-4；不把载荷消费者所用新版改成日志协议的规范依赖。日志不 inject sessionTenancy，如实填写 tenant 仍是写方责任 |
| [已接受原节点 design](design.md) | D-062／D-065；SHA-256 `a52d26d2042b260e53c4fa9cb849b883034b92381b19cc87f8cd815c253a025e`。沿用 JSONL 属主锁、每本日志队列、一行一批、datasync、派生索引及其前提；不是重新选择数据库 |
| [v2-design 修订 2](v2-design.md) | SHA-256 `a3cd98478faf5d158a8b09dd8e1491db568b4cc93091b0dc560b6e74a20ffbb6`；仅为未接受的起草输入。本页明确写出的无损载荷／unknown 责任才是本次待评内容，不把 G2-1～G2-7 追认为已经关闭 |
| D-081／D-076 | 前者选择共同日志尾条件方向，后者既有准确 late、回复同批、unknown opened 与实际停止义务保留；SL3 接受不自动升级 runtime3、runner3 或任何写方 |
| messages4／model-response4／content-blocks3／call-accounts2／model-profile3，runtime3／runner3 | 已接受的消费者及载荷输入；仅承接合法 JSON 原样存取和下述传播门。业务形状、完整 adaptation、金额／opaque、ResponseId／MessageId、Run 认法及 late 的解释均归它们的 owner |

产品依据沿 SL3 所列 PF-012 rev 15、PF-015 rev 13、PF-000 rev 1；不把当前产品后续修订自动纳入已接受日志语义。

| 层 | 本次结论 |
| --- | --- |
| 语义接受 | SL3 已由 D-083 接受；本 provider 增量仍为候选 |
| 可实施 | 原文件机制可承载新增比较；本页明确同一提交域、失败与生命周期。须独立评审、主线采用后才按本页开包；新 runtime 消费规范、共同键及真实 Run 认法仍阻断对应业务接线 |
| 绑定证据 | 0 条新增。下面 SLJ3-V 仅为待执行验收义务，不登记虚构 test 或以有限模型绑定真实 IO |
| 实际验证 | 本节点源码不存在，真实三操作、持久化、恢复及 Cordis 排空尚无运行。结构检查不等于实现／语义验证 |

## 实现路径与公开面

沿原节点的必要自建闭包＋薄 Cordis 插件：Node ≥24 文件操作，`node:sqlite` 只持根目录 `.owner-lock` 的文件锁，不存业务；采用 D-025 的 Cordis 4.0.4。原 `dir` 与策略配置、配置错误启动失败政策保持，缺失或非法配置不 provide；不增加数据库、日志协调服务或持久 Run 状态。

包根公开纯面与不依赖 Cordis 的生命周期闭包；插件面另行导出。静态导入纯面不加载 Cordis、不打开文件；实际调用者必须拥有并关闭闭包。所有名字为候选：

| 层／公开面 | 增量及边界 |
| --- | --- |
| `checkAppendInput` | 同时检查必填 fence、condition、壳和合法无损 JSON；先捕获自有输入。新 condition 使用封闭对象 `{ kind: 'unconditional' }` 或 `{ kind: 'tailEquals', tail: JsonNumber }`；这是 SL3 判别式的本地 TypeScript 投影，无默认、无其他成员 |
| `judgeAppend(state, request)` | 给定同一本日志的一份权威判定态，依次判 tenant、fence、dedupe、tail；只返回纯判定，不写状态。函数不保证所给 state 是实际提交点的状态 |
| `emptyLogState`／`foldCommit` | 租户、精确尾、判重键、读取键位置和每个 run 最大 attempt 同源折叠；不读 payload，不以 Run 终结记录改变日志自身状态 |
| `encodeCommitLine`／`decodeLogBytes` | 复用 core 严格无损交换表示；整行一批，保留原行形状与 format/fold 版本规则。condition 不写进 payload 或条目壳，不成为新日志记录 |
| `openJsonlSessionLog({dir, policy})` | 返回 `append(session, entries, fence, condition)`、`readByKey(session, key)`、`readSince(session, after)` 与 owner 生命周期 `close`。close 不是第四个日志业务操作；不新增 recover、锁回调或提交时构造 payload 的接口 |
| 插件 `session-log-jsonl`／服务 `sessionLog` | 一条 fiber、无 inject、无业务事件；服务仅暴露三个操作，生命周期归闭包 owner。同一根一份实例，动态替换不等于在途调用自动迁移 |

位置、condition.tail、after 以及 attempt 的整数域沿精确契约，内部比较和加法不转有限精度浮点。公开使用 core `JsonNumber`，实现可转精确整数进行运算后再经公开入口返回；不能因超过 JS safe integer 报 invalidInput 或舍入尾。文件字节偏移与逻辑位置不是一回事，不能将一个强制转成另一个；实际资源／IO 不可用沿 unavailable，不擅加协议上界。

## 契约到 Cordis／文件提交的投影

| 行 | 契约责任 | 操作及实际兑现点（候选） | 依据或缺口 |
| --- | --- | --- | --- |
| SLJ3-P1 | SL3 S-6/S-7/S-11/S-15/S-17/S-32：精确输入与必填条件 | append 入口的 owned 输入及纯校验；未知判别式／额外成员／负数／分数拒绝；合法未来尾进入比较 | SLJ3-V1/V2；无新增业务校验 |
| SLJ3-P2 | S-8/S-10/S-12/S-14/S-33：同提交四道判定 | 根属主锁＋同一本 entries.jsonl 的队列；队首同一判定态顺序比较，持有执行权至整批确认或故障隔离 | SLJ3-V2/V3/V4；仅进程锁不成立，物理共同对象见下节 |
| SLJ3-P3 | S-13/S-17/S-33：全批、零写与确认 | 四道判定全过后才建首次日志文件、编码提交行、分配本批逻辑位置；完整写和 datasync 后发布新判定态／尾并答成功 | SLJ3-V2/V5/V8；不把失败批写成拒绝记录占位置 |
| SLJ3-P4 | S-9/S-18/S-19/S-34：同次完整读 | 捕获同一不可变确认态的尾与行偏移；读取截止该尾的全部指定范围，校验无缺号，不返回半段 | SLJ3-V6；按键结果不是完整前缀，完整读权归消费者装配 |
| SLJ3-P5 | S-22/S-23/S-35：unknown 与恢复 | 真实文件任务由 provider 持有；不可信时关闭该日志正常读写，实际停止／属主交接后重开扫描 | SLJ3-V7/V8/V9；不替 runtime 否认旧 unknown、认业务批或重发 |
| SLJ3-P6 | S-20/S-21/S-23：装卸、作用域 | 单组合 effect 执行关准入→拒未开始项→等实际任务→关句柄→放锁；旧引用也受关闭状态约束 | SLJ3-V9/V10；不能靠 disposer resolve 推导全部步骤成功 |
| SLJ3-P7 | S-34/S-35/S-36/S-37：条件使用与迁移 | 日志交不透明批结果；实际响应写方采用新规范后明确第四实参、合法前缀与完整认回 | SLJ3-V4/V7/V11；业务推进／争用策略、Run 终结认法和共同 codec 仍有门 |

### 同一提交域与反证

共同存储对象是**同一 session 的 `entries.jsonl` 已提交前缀与其末位置**，共同写入者包括模型结算方、回复方、Run 事实写方以及无关消息写方。它们全部只能经同一物理属主的追加队列改变该文件。判重需要的共同键同样保存在该文件条目壳上；provider 不发明键编码。

`.owner-lock` 随实际进程生死排除同根跨实例写者，且句柄按原设计钉在模块级强引用集合直到显式释放；每日志队列串行化该唯一属主中的调用。四道判定、追加和确认之间虽有异步 IO，队列执行权不能放掉，也不能让另一个队首启动；因此任何追加都无法在比较与整批写入之间插入。不是把“先读尾”放在锁外，再到另一事务写；也不依赖 now、未落盘单调事实或旧 fiber 的本地 mutex。

反证交错必须真跑：① A、B 同读尾 t，A 的条件批先提交到 t+n，B 在队首必须看到 t+n，若无更早拒绝则 tailChanged；② A 读 t 后，C 的新 attempt／同 attempt 终结／无关条目任一种先提交，A 以 t 追加即整批拒绝；反过来 A 先成功、C 后提交时 A 原值保留。去掉队列占有或将尾比较移出队首，测试须允许 C 插入并暴露错误成功。测试驱动对自己的 Run 样本作解释，不证明生产 Run 识别器已经建立。

## 追加顺序、失败与合法组合

1. 严格校验并拥有所有入参，特别是 payload、readKeys、fence 和 condition。表示非法先答 invalidInput，不创建日志、不入队；旧三参数调用同样如此。队列／常驻数量不足及实例关闭沿原配置答 unavailable，不冒称已作完业务判定。
2. 入队后，核根的设备号／inode 与原运维前提；懒打开完成才有可用判定态。不存在的会话日志仅在根确实可读且未替换时表示空尾 0、租户未定；读不到不是空。恢复尚未完成或状态不可信时 unavailable，不猜测后续判定。
3. 在队首同一权威态按 `tenantMismatch → attemptSuperseded → alreadyRecorded{keys} → tailChanged{tail}` 判断；只有 fenced 才判尝试拒绝，只有 tailEquals 才判尾相等。较早结果不得被较后结果掩盖；unavailable 是无权威答案／未确认提交，不在确定拒绝优先级末尾。
4. tail 不等时复制此**判定点**实际尾返回；不能返回请求尾、响应送达时的尾或预读尾。该次一条不写、不占键、不推进运行最大序号、不初始化租户、不分配位置。空日志失败也不建会话目录或日志文件；根锁及已存在派生物的维护不是该批的业务提交。返回前后其他已排队批可合法提交，所以不能断言全局文件尾始终不动。
5. 全过后才确定 `first=tail+1` 和本批连续位置，将全部条目编码为**一行**，完整追加并 datasync；首次目录／文件及必要父目录同步沿原 F-3。保持本日志队列直到确认、发布整份折叠态并完成本次结果。派生索引写失败只告警、可重建，不把已确认批重新追加。

| 输入组合 | 合法性与效果 |
| --- | --- |
| 无 dedupeKey＋unfenced＋unconditional | 合法普通追加；重交不保证幂等 |
| 无 dedupeKey＋unfenced＋tailEquals | 合法；尾冲突本次零写；旧 unknown 仍不能自动认回或幂等重试 |
| fenced＋任一 condition | 只要全批壳的 run/attempt 与 fence 一致即为合法输入，随后按顺序判；tailEquals 不替代 fence |
| 有键＋任一 fence／condition | 碰任一现有键就整批 alreadyRecorded；键前仍先判租户与 fence。返回键不证明已存 payload 与本次相同 |
| 同 run/attempt 壳＋unfenced | 合法结算类输入，不因旧 attempt 拒绝；仍推进壳对应最大 attempt 的折叠信息。provider 不因此生成 late 或判定 Run 有效 |
| 合法 future tail 或 after | tailEquals 的 future tail 得真实 tailChanged；after 大于实际尾读空并照实交 tail。均不改成 invalidInput |

## 完整前缀、载荷与索引

健康实例的 readByKey/readSince 在懒打开完成后捕获同一份不可变确认态：tail、行偏移及键位置相互对应；文件读只到这份快照范围，不与稍后尾拼接。追加确认后启动的读必含该批。与尚未完成的追加重叠的读可以固定在此前确认态；一旦实例知道某写入已不可信，后续不能再给“旧确认态就是当前权威态”的答案。读取开始时已捕获的合法前缀不会因后续追加而变成非法，但也不能替消费者排除之后仍可能提交的旧写者。

readSince(0) 成功必须交 1..tail 的全部条目；从合法完整前缀 1..a 追补时才可用同次 a+1..tail 扩展，不能混会话／漏号／拼别次 tail。after 位于某批中间时按契约只返回大于 after 的条目，这是范围过滤，不是把正在写的半批提前暴露。readByKey 返回筛选结果及同次真实 tail，仍不能冒充完整前缀；合法 JSON、正确尾均不能补偿非法读权或错误业务解释。

载荷只过合法 JSON，不过 messages／response Schema。沿 `@omne-harness-lite/content-blocks` 公开 `copyJsonValue`、`readJsonStrict`、`writeJsonLossless`、`JsonNumber`／`jsonNumberSource` 实现精确保留；公开支持的 LosslessNumber 和 OpaqueJson 通过其公开交换表示复制，不导入私有类。重复成员在文本解码前拒绝；任意不受支持 class、循环、函数、undefined、NaN/Infinity 不静默剥掉。不得经普通 JSON.parse、JSON.stringify 或 number 中转。调用者后改原对象和读回对象均不能改排队批次、判定态或后续读取。

日志读回交换值；领域品牌／opaque 包装和 messages4、response4 的跨字段校验由相应公开接收入口恢复。它们的完整 adaptation、原配置、精确金额、数组与 rawArguments 原样保留。合法 JSON 却非法于业务 Schema 的记录也原样保存；MR4 raw.headers 只收 string 的既有约束不被日志能存数组这一事实改变，G2-6 继续归表示 owner。

派生 `index.jsonl` 沿原设计：无业务权威，缺／截／落后／折叠版本不符／结构错误可作废重建，内容正确依赖同一正确折叠实现和根不受外部改写的原前提。新增 condition 不必写进历史行；修改任何实际行编码或折叠含义必须升对应格式版本并明确迁移，不能原地读错旧索引。**不可信写入后的权威恢复**不借旧内存确认尾或旧派生索引断言缺席：独占重启时从权威日志字节 0 扫描，按严格整行规则折叠并重新生成索引；正常健康打开可保留原索引路径。没有物理停止／独占前提时扫描也不能证明旧请求不会稍后追加。

## 未知回执、物理停止与恢复

| 实际情况 | provider 的收口及边界 |
| --- | --- |
| 整批已 datasync 并推进判定态，但成功答复丢失 | 条目保留、后续健康读可见；消费者仍把原调用记为未知，按自身稳定读取键认回完整批。provider 不自动重交、不重算 payload |
| 真实写／datasync 仍在途，调用方取消等待、Promise.race 已返回或断开 | provider 继续拥有底层任务和队列执行权；不宣称任务停止，不放属主锁，不启动后续写。消费者的 AbortSignal 不取消内核中的文件 IO；旧写者仍可能提交 |
| 写／确认明确失败且实际 IO 已结束 | 沿原机制截回写前偏移并 datasync；确认截回成功才可恢复健康态。对外 unavailable 仍不新增“肯定没写”的业务结果，不能据此替消费者关闭另一笔旧 unknown |
| 截回失败、任务状态无法确认或无法建立可信当前尾 | 本日志进入不可信态，后续三操作 unavailable；已排队尚未开始的追加零写拒绝。内部可保留旧确认前缀用于故障定位，但不经三个正常读面将它伪装为最新权威事实。其他日志在根及自己的状态健康时继续 |
| 正常关闭／重开 | 先停所有本实例新准入，等待真实写读任务及修复任务终止，关句柄后放锁；新实例独占打开并读盘。不能先放锁，再等旧任务 |
| 不可信分支恢复 | 继承原 SLJ-9 的**进程重启**路径：旧物理进程已退出／被杀且确认退出，新 owner 取得同根锁，再作权威全量扫描和尾修复。不开活实例 reset 标记／逐会话 recover API；未完成恢复前不对该日志接纳新写 |
| 重开扫描 | 完整合法批纳入折叠；尾部没有后续完整有效行的半截按原规则截至最后完整行并同步；中间受损、后面仍有有效行、session 错配或位置不连续则 unavailable，不跳过／重排。恢复修复确认后才发布可读判定态 |

**本增量明确替代的旧恢复口径**：原 design「写不全、写报错、datasync 报错」行中，截回也失败后“读照旧只读到确认过的尾”不再作为 SL3 的实施输入；改按上表不可信态三操作均 unavailable，直到实际停止／独占重启及权威恢复完成。只替代这一失败分支的正常读面行为；成功截回后恢复健康、其余故障处理、文件机制与原部署前提保持。

后一调用的 tailChanged、tenantMismatch 或 attemptSuperseded 只否定**后一次**提交；它们不否定先前 unknown。判重优先于尾比较同样不保证撞键项构成原完整业务批。普通无键追加仍合法，但本节点不给它编造稳定业务身份、自动认回协议或幂等恢复。

runtime 的 unknown opened 还需停止可能写 opened、response 的旧业务参与者，包含 unfenced 结算者；仅隔离 provider 不能阻止重跑的消费者再次调用新 provider。带 run 的新尝试 fence 及无 run 的独占承载按实际消费者新规范和装配负责；fence 不能代替 unfenced 写者停止。日志不构造 opened、response、late、耐久中断意图或 runtime_lost，也不将恢复读的结果转成重试模型请求。

## 存储要求与装卸配对

没有新数据库选型。以下是抽象存储要求在原文件提供者上的投影；本机文件系统与锁是已经接受的实现选择，不把要求反向定义成 SQLite 业务事务。

| 要求 | 精确条款／兑现点 | 前提失效时 |
| --- | --- | --- |
| 同一 session 的全部写者共享一个不可插入的比较／整批提交域 | SL3 S-8/S-10/S-12/S-14/S-33；共同 entries.jsonl＋根属主锁＋每日志队列 | 不能接受该部署／不得宣称 tail 条件有效；异构节点需重新实现协议 |
| 成功确认批与首次文件目录可在进程崩溃后重读 | S-13/S-17；每批 datasync 和原 F-2/F-3 目录同步 | IO 失败 unavailable；原本地文件系统同步及断电前提保留，不能扩大到跨 SQL／JSONL 原子持久 |
| 同一读取点的完整范围与尾，已确认字节稳定 | S-7/S-11/S-18/S-19/S-34；不可变确认态＋只增文件偏移 | unavailable，不能空读或给半段；不可信态不输出旧尾冒充权威 |
| 排他属主在同进程／跨进程均成立，真实退出才交权 | S-21/S-23；F-6 文件锁和钉住句柄，最后放锁 | 启动失败；旧 owner 未静止不能让新 owner 开写 |
| 根身份可核对、IO 失败可识别、派生索引可重建 | S-5/S-15/S-22；F-4/F-7/F-8 | 根失效不当空，结构受损不修业务，索引坏不变成“无重复键” |

| 取得的资源／贡献 | owner、可用点和部分失败 | 撤除与仍然为真 |
| --- | --- | --- |
| 配置与根目录 | provider；配置有效后创建根，未完成不 provide；配置错或根不可用启动失败 | 不删除目录／已提交记录；运行期路径不被改换的装配前提持续 |
| 根属主锁与强引用句柄 | 初始化路径取得即有清理责任，成功后才能触碰日志；取不到立即失败，不等待；初始化后续失败自行清理已得资源 | 所有真实任务和文件句柄结束后最后放锁；关闭失败保留可见失败与所有权，不声称新 owner 可接手 |
| 日志表、队列、确认态、行偏移、文件句柄与读计数 | 每本日志懒打开，整份恢复完成后发布；单本失败不污染其他日志。常驻硬上界和 appendQueueLimit 沿原可配置策略 | 先关准入及旧引用，再拒未开始追加，等待已开始追加／在途读／修复按自身提交收场；空闲逐出不能逐出有任务的日志 |
| 三操作 service 与单组合 effect | 初始化及清理归属完成后提供服务；effect 登记失败由初始化路径收口再抛，provide 失败仍要清理 | 同一 cleanup 顺序执行关准入→排空→关闭句柄→放锁；不依赖多个 effect 的异步顺序。取消不等于物理停止 |

沿原节点**不设新的日志关闭超时**。外层宿主若有观察／关机期限，超时只说明尚未排空，日志 owner 继续持有资源／锁；不得把超时当关闭成功、detach 文件任务或清空强引用集合。文件关闭／锁释放失败同样暴露真实未完成范围，不吞错后向装配报告已交权；需要强制终止时由宿主实际结束进程并核实退出，下一 owner 仍须取得锁与恢复扫描。

上游语义沿已登记 basis：[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) 要求自有顺序和完成判据；[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) 支持启动配置失败；[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) 仅说明 required 消费者换代重跑，不说明旧文件任务已停止；[`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) 不提供文件所有权或授权隔离。原 provide-is-effect-managed／SLJ-4 精确时序仍为待核对主张；Node 文件任务完成与 OS 锁交接沿原 source-check 义务，不能用别包原语探针代证本节点真实组合。

## SL2 迁移、装配承接与关键取舍

SL3 是四实参公开面：不保留三实参默认 unconditional 的兼容路径。新 provider 纯面、闭包及服务同样拒绝缺 condition；旧 SL2 写者必须停用，或在实际装配中继续只连接其明确的旧 provider，不能经同一服务键静默切至 SL3。两个 provider 指向同一日志根时属主锁拒绝第二实例，即便 Cordis isolate 不同也不能并写；独立装配只有在明确**没有共享物理写者**时才可并存，不能借新目录割裂同一会话的权威日志。

替换次序：装配关业务准入并排空／隔离所有旧写方→旧日志 owner 关准入、排空物理任务、关句柄放锁或真实退出→新 owner 取得同根锁、恢复扫描→仅对已明确采用 SL3 的消费者提供新三操作面。旧句柄和闭包不可迁入新实例，旧 confirmed state 不作为新 owner 状态；旧数据是原合法 JSON 历史，不因接口升级改写成新业务版本。格式本身未变时不要求重写所有日志，但必须验证旧行全量恢复及索引适用性。

当前 runtime3 明确依赖 SL2，不能直接连接本候选；[consumer-impact](../../../../spec/capabilities/session-log/v3/consumer-impact.md) 列出的 runtime／runner／tools／facts 关系分别由各 owner 显式传播。本节点不替普通结论选择 unconditional，不替响应方构造 tailEquals、业务键、late 或认回结果。实现完成时每个编辑包即时更新 README.md／README_ZH.md 的公开面、四参数示例、close 责任与失败结果；历史三参数示例只保留在旧版本证据，不能继续出现在新版可运行教程。

本纵线装配 owner 为 [model-request-acceptance](../../../retired/model-request-acceptance/design.md)；产品据点前提沿 [cli](../../../apps/cli/design.md)。它们负责真实数据根及本地 FS、owner 权限、根不受外部改写、只装一个物理日志写者、入口身份／合法完整读权、holdingTenant 来源、旧业务参与者停止与新运行承载、存储升级确认后开闸、日志重启和诊断 sink。时钟、发号、凭据仍由消费者装配给，日志不生成；当前完整验收装配源码未完成，采用本候选后的互指与实际接线尚待主线。

| 选择 | 落选方最强论证 | 本方弱点／反证信号 | 置信度 |
| --- | --- | --- | --- |
| 原单 fiber／三操作，尾比较进入每日志队首 | 新协调服务或 SQL 事务更易直观表达条件提交 | 文件锁、队列、索引假设都须真 IO 证据；共同域若不能成立应返回主线，不自行换数据库 | 高，沿 D-081/D-083 与原已接受机制 |
| 不透明条件，业务解释留消费者 | provider 内提交回调可以直接在最新 Run 状态上算 late | 完整前缀读权、共同 codec、所有写方采用仍需闭合；尾条件不能补错误解释 | 高，SL3 S-2/S-32/S-34 明定 |
| 不可信日志三操作 unavailable，真实退出后全量恢复 | 继续读旧确认前缀可维持部分只读可用性，在线 recover 可缩短停机 | 损失故障期间该日志可用性，全量扫描有成本；保护三操作权威读取口径，不额外设计第四读面或恢复 API | 中高；SL3 S-18/S-19/S-22/S-33 |
| 保留原派生索引、恢复不以旧索引证明缺席 | 全部健康打开也扫描权威日志可去掉内容正确假设 | 健康索引仍需原 SLJ-11 前提与负控，恢复扫描不能伪装成对任意外部改写的修复 | 中，原采用保留；本轮不作性能宣称 |
| 显式停旧写方后换四参数面 | 自动兼容三参数减少消费者修改 | 必须盘点所有真实写方，换代有停顿；隐式 unconditional 会漏掉受条件保护的业务路径 | 高，SL3 S-15/S-37 |

## 验证义务与覆盖缺口

以下全部**尚未执行**，由后续 provider 实施者提供真实文件系统／进程／Cordis 输入，独立验证者执行，主线放行。继续承担原 [verification](verification.md) 的 V-1～V-13 与 S-26～S-31，**唯一替代是旧 V-5 中“截回失败后仍读旧确认尾”的预期：本增量采用 SLJ3-V8 的不可信态三操作 unavailable，随后实际停止／独占重启再作权威恢复**。旧 V-5 的成功截回后下次可写，以及半写、datasync 失败、截回失败的注入等其余义务全部保持；其余旧三操作 IO 义务不缩减。只列可失败 oracle，不先建立 bindings。

| ID／条款 | 实际场景、oracle 与负控 |
| --- | --- |
| SLJ3-V1／S-7/S-15/S-17/S-32 | 四实参、两种条件、合法 keyless／fenced/unfenced 矩阵；缺 condition、额外成员、负尾／分数均 invalidInput。合法 future tail 得真实 tailChanged；超 2^53 的相邻输入尾经精确纯判定区分，真实空日志 future tail 仍拒而不舍入；旧三参数不可用。删必填检查／改 number 比较须失败 |
| SLJ3-V2／S-12/S-17/S-33 | 同时制造表示错误、异租户、旧 fence、撞键、错尾，逐层去掉前项核精确优先级。空日志 tenant A 的 future-tail 批失败后由 tenant B 首次成功，位置从 1 起；失败键随后可用，壳最大 attempt 不被失败批推进。抓实际文件／目录、状态与返回尾，证明仅本次零写；把比较后移到初始化之后须失败 |
| SLJ3-V3／S-8/S-14/S-33 | 两个条件批读同一尾，及中间插无关条目；真实同日志并发只能一个通过旧尾，后者见新尾；不同日志不共用一个追加队列。故障注入比较后暂停，另一写者不能穿过；拆比较和写入的负控必须实际露出错误成功 |
| SLJ3-V4／S-10/S-13/S-33/S-36 | 驱动实际写出已声明的本地 Run 样本，覆盖新 attempt／同 attempt 终结先到、响应先到两种顺序；响应单批与助手消息＋响应批争同键，先到者原值不变，输家无孤立消息。keyless 条件支另跑且不被强加业务身份。测试只证明自身样本范围，生产 Run 认法另验 |
| SLJ3-V5／S-11/S-13/S-17 | 真正大整数、长十进制、公开 opaque 交换值及合法 MS4/MR4 逐值 append→读→重启；重复成员／不支持值拒绝，合法 JSON 非法业务载荷照存，由接收者拒绝。输入／读回值后改不影响保存值；精度损失、载荷 schema 强校验或拆批写的负控须失败 |
| SLJ3-V6／S-18/S-19/S-34 | 真实读与追加交错；同次 entries/tail 一致、完整稠密范围及 after 在批中间的准确过滤。按键只得局部记录不能当完整前缀；混会话／缺号／另一时刻 tail 的消费者负控即使条件成功也暴露错误结论。读半途 IO 错只能 unavailable，不能半段成功 |
| SLJ3-V7／S-22/S-33/S-35 | 批已确认但回执丢失，与旧真实写任务仍可提交分别注入；后次 tailChanged／tenantMismatch／attemptSuperseded 均不能被验收驱动当成旧请求未写；按稳定读键认回原完整批。无键未知仍未知。移除旧写者停止前提／仅凭一次缺席读关闭责任的负控须失败 |
| SLJ3-V8／S-13/S-22/S-23 | 半行、完整行未确认、datasync 错、截回错、损坏中间行、首次目录同步错逐点注入；不可信三操作 unavailable，真实 kill/退出后新锁＋全量扫描恢复完整批或去除半截，位置不变。后续恢复必须无旧写者；kill 证据不冒充机器断电证明 |
| SLJ3-V9／S-21/S-23 | 同进程两实例／跨进程两实例／空闲 GC／初始化部分失败／根替换；实际持锁排他。关闭时阻塞实际文件任务和读，锁不提前释放，未开始批拒绝；任务结束且句柄关闭后新实例才取锁。清理失败和外层期限结束不能报关闭成功；只断言 dispose 调用不通过 |
| SLJ3-V10／S-20/S-21；SYS-OPEN/OBSERVABILITY | 独立包消费者无 Cordis 导入纯面和闭包，真实文件 IO 后 close；实际 Cordis 非法配置 FAILED、服务不发布、单 effect 排空。工程诊断含受限阶段／相关标识／计数，无 payload、配置秘密、raw headers、业务键正文或原始错误泄漏；恢复读不复制敏感内容到日志 |
| SLJ3-V11／S-34～S-37 | 精确新消费者规范采用后再跑全写方传播及旧 SL2 实例退出／同根锁交接；新版拒三参数，旧引用不可推进，新实例读回旧合法历史。完整键 codec、合法读权、真实 Run、unknown opened 与争用耗尽归对应 owner 的组合门；不能以日志单包通过代它们验收 |

D-083 的有限形式证据 只支持所列有限 SessionLog／TailSettlement 断言与前提：整批原子、稠密位置、真实读快照、payload 数字、租户与优先级、文件锁、实际 StopOld、生产 Run 认法均没有被这些模型完整证明。本节点不把 TypeOK、模型中单步追加或 StopOld 抽象绑定成真实 IO 已兑现，不声称无限争用下无饥饿。退避、重试、超时、争用预算与耗尽后未完成责任全部归消费者具名策略；日志没有暗中重算并重交的循环。

| Gap／条款 | 受阻消费者、owner 与闭合条件 |
| --- | --- |
| SLJ3-G1：S-37 的提供者及消费者采用 | 本页尚未接受；主线独立架构／表达复核后明确采用，更新四件套导航与精确消费。RT3 仍钉 SL2，需新规范及全部实际响应写方投影；不只换实现接线 |
| SLJ3-G2：S-8/S-9/S-22/S-35 的共同键与整批认回 | 业务唯一性组合受阻；runtime／回复／runner owner 建立共同无歧义 codec 和稳定身份，真竞争认回整个批。日志不透明键三操作可独立实施，不猜 mrr/runner/ResponseId 拼接 |
| SLJ3-G3：S-34/S-36 的生产 Run 认法与合法完整读权 | withRun 准确 late 组合仍受阻；Run owner、runtime 与装配给正式记录认法、原发出 attempt 对应、合法读取前提及两种顺序真实证据。测试局部 kind 不变成生产协议 |
| SLJ3-G4：S-22/S-23 的真实停止／恢复与 unknown opened | provider、runtime 与宿主执行 V7～V9 及消费者新恢复链；没停旧 unfenced 写者或无法取得权威尾时保持 unknown／unavailable，不能先结算或重发 |
| SLJ3-G5：MR4 S-20/S-26 的多值 headers | 表示 owner 与主线仍须解决 TransportFailure 数组到 MR4 string-map 的精确投影；日志保真不替它选择拼接、丢值或加字段。仅阻断相应响应表示路径 |
| SLJ3-G6：原机制前提与实际源码 | 原 SLJ-2/4/5/6/7/9/10/11 的跨存储断电、精确 Cordis 时序、无超时、无分页、本地 FS、重启恢复、无修复工具、索引正确性前提保留。实施／装配 owner 分别给实际证据；本页不扩大为完整会话／Agent Loop 产品 |

未知项只阻断其对应消费，不能在日志里补 Run、late、业务键、重试政策或新的恢复能力来绕开。所有相同提交要求都已明确落在同一个 entries.jsonl；若实际装配不能让相关写者共用此物理提交域，则停止该组合的施工并交主线，而不是按同名 API 宣称兑现。
