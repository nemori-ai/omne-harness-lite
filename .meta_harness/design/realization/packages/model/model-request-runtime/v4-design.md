# model-request-runtime：RT4／SL3 结算消费增补候选

2026-09-27，rev 2，**candidate，未接受；本增补未实现、实际组合未验证、新增 bindings 0**。本页投影已经接受的 RT4 变化，保留既有节点及两插件边界，不重新设计模型适配、资产、会话或 Agent Loop。新增函数、字段、配置、端口及内部状态名称全部为**实现面候选**；十三个服务操作沿契约。原四件套和 [v3-design](v3-design.md) 原字节保留，本页不授予施工或采用资格。

## 精确输入与四层状态

| 输入／层 | 本次消费及状态 |
| --- | --- |
| 语义接受 | D-086 接受 baseline `omne-harness-lite-design-2026-09-15`、`capability.model-request-runtime/v4` 全部 S-1～S-73、27 资源、13 个九项操作；[contract](../../../../spec/capabilities/model-request-runtime/v4/contract.md) SHA256 `4a31cb8bc98ae5bbb55a28c671ff84a8f86520747de7dd07c180787183651689`。catalog accepted，冻结正文原 candidate 标签不改变接受事实 |
| 日志语义与投影 | D-083 接受 SL3，contract SHA256 `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`；D-084 采用日志 [v3-design](../../session/session-log-jsonl/v3-design.md) rev 2，SHA256 `f8561eed58597fbb972d474b14648f74f74cafae3d1125f7813a45a4c241b351`；D-085 采用 [v3-recovery-design](../../session/session-log-jsonl/v3-recovery-design.md) rev 2，SHA256 `ea205862968dbe54889d7ba4b80ffcb33e04318c5ba8a82fb09367c1bbd324ae`。采用不代表 IO 验收完成 |
| 原 runtime 投影与选择 | D-076 采用 v3-design，SHA256 `31a46a46ad67bb6d1dd383cbc6a08a7a89d3354aa261d9db54ab8f7ae7d2ae99`；D-081 已从 三候选 选共同日志尾条件。这里只补 L-2～L-5/L-7、Q-1～Q-4 的实际消费，不复议已决定方向 |
| 公共适配面 | D-082 的完整定义、显式 definitions、固定精确 lease 与无兼容迁移保持；不补官方模型未知事实。现有源码 `packages/model/model-request-runtime/src/index.ts` 公开 invokeModel、classifyCause 及 types；P-2/P-5 和十三操作尚未交付，不能把公共函数局部证据当服务面证据 |
| 可实施 | 本候选给出条件选择、消费算法、争用配置和责任交接；独立复核、精确采用后才可实施。RT4 G-28～G-31 及原相关门只阻断依赖它们的接线，不补默认认法、键编码、读权或 headers 表示 |
| 绑定证据 | 新增 0。原 [bindings](bindings.yaml) 保持各自版本和已运行范围；下文新增 R4-V 是待执行义务 |
| 实际验证 | 本增补没有 IO、真实操作或产品运行。D-086 所引有限 Settlement 运行及 403 文件运行归档只支持其输入、模型前提和指定安全断言；不证明 StopOld、读权、文件持久、实际调度、全部十三操作或公平进展 |

RT4 的 **17 项精确规范依赖**按 catalog 原样消费：model-profile-directory3、model-profile3、model-response4、loop-extension4、call-accounts2、content-blocks3、messages4、tool-definition3、identity-values1、offer-expiry1、asset-evaluation4、modality-projection2、stream-assembly3、arrival-events2、**session-log3**、**asset-registry3**、session-tenancy2。只有 SL2→SL3 是这次升级；AR3 不换 AR4，不新增对 RAF2、assembly-manifest 或进程能力的规范依赖。MS4/MR4/CA2 Schema 不改；条件不写进业务 payload。其余 provider 依赖、当前输入和凭据读取、工具解析、transport、观察、缓存、clock 及宿主口径沿已采用 v3。

## 节点边界与公开构件

沿用 P-2 `modelRuntime` 服务和 P-5 默认重试贡献。P-2 一次调用仍是显式宿主管的资源，不是可重跑并重发请求的 fiber；required `sessionLog` 换代使 P-2 按原生命周期停止，贡献定义更新不因此重发旧 call。Cordis 仍为 D-025 的 4.0.4。存储仍消费独立协议，不新选数据库、不新增持久调用状态表。

`invokeModel` 及已公开构件保持无会话日志、租户 service、争用策略或 Run 读取依赖；独立消费者可直接使用原传输函数闭包。它只给未结算结果，不能承担 RT4 的耐久结算保证。P-2 消费同一函数，不建 LLM 基类或第二条网络循环。现有包根及双语 README 的函数例子保留；新增 runtime 服务例子只有相应实物交付后才可写成可运行示例。

以下是本节点可独立取用的**候选内部构件公开面**，不作为第十四个服务操作，也不当已实现 API：

| 构件 | 输入与责任边界 | 缺席／失败与所有者 |
| --- | --- | --- |
| `readSettlementPrefix` | 捕获该 session 的同一日志服务代际、实际 tenant 和合法全读范围，经 SL3 `readSince(session,0)` 返回完整前缀；可接受该构件自己拥有且身份／代际／权限仍有效的完整前缀，以 `readSince(session,tail)` 密集追补。条目位置、实际尾使用 core 精确数值，不经浮点舍入 | runtime 或外部回复 owner 拥有读任务和前缀；受限读不冒充全读，缺权限／日志失败／缺号／代际失效均 unavailable。不增加布尔 `authorized=true` 回调兜底，G-30 的真实授权提供者及接线未交付前相关路径受阻 |
| `interpretSettlementPrefix` | 纯计算，只对给定完整前缀解释原 dispatched、opened、intent、原发出 Run/attempt 及已有批。生产 Run 认法必须来自 G-28 的正式 owner 输入；不调用 RAF2 两个独立 bool 后另配 tail | 返回可判事实或不可判原因；不读另一本日志、不写事实、无“未知即 false”。具名测试认法只证明测试驱动自己生产的记录。函数层不承诺前缀的真实来源／读权 |
| `recognizeCommittedBatch`／`prepareSettlementBatch` | 复用 MS4/MR4/CA2 公开接收与构造边界，前者核原身份、关联、全部成员及原值，后者只对尚未提交的稳定响应／消息候选应用同次前缀得出的 late；精确绑定、参数和金额原样保留 | 共同 codec 及完整批辨认规则仍由 G-29 的共享 owner 给出，未采用不得填 owner 私有前缀或仅核键数。部分碰撞／无法认证原批为 unavailable，不能拼补残批；纯构件不带 IO 权限 |
| `createSettlementCoordinator` | 非 Cordis 闭包；显式取得上述构件、同一个 SL3 三操作端口、下节策略和调度、已登记的原调用／回复 owner、诊断采集器。只负责一次耐久结算推进，不能 plan/send、改身份或控制物理进程 | P-2 和外部 persisted 写方可消费同一实现；各自仍拥有本次任务、合法权限和退出交接。缺必需事实／依赖即原 unavailable，取消不解除仍可能写入的任务所有权；关闭语义见后文 |

这些构件不能通过可替换性获得越权：给它一个形状合法的日志／认法不证明合法来源。生产缺口保留具名门；本候选只允许将独立算法用具名完整非生产输入先行实现、测出错误，不允许把这些输入发布成生产 Run 或全读权限。纯函数不强加本 runtime 的宿主，带 IO 的协调器必须显式有 owner。

## 契约责任的增量投影

| 行 | RT4／SL3 责任 | 操作／兑现点 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| R4-P1 | RT4 S-68/S-72；SL3 S-17/S-32 | P-2 每个日志调用和外部消息批显式第四实参，保持原 fence；调用矩阵如下 | R4-V1；全部写方迁移门，无三参数适配 |
| R4-P2 | S-17/S-69/S-73；SL3 S-13/S-14/S-33/S-34 | 单一结算协调器从合法同次前缀准备 withRun 批，unfenced＋tailEquals 同一本 entries 提交 | R4-V2～V4；G-28/G-29/G-30 |
| R4-P3 | S-6/S-70/S-72 | 原 owner 保留稳定业务候选与实际追加任务，权威认回全批，THIS 拒绝不关闭旧 unknown | R4-V5～V7；无新增领域阶段或 failure |
| R4-P4 | S-15/S-17/S-33/S-70.6 | 原 Q-1～Q-4 的 opened 强门优先于一切响应结算；实际停止后只在既有 S-33 时机恢复 | R4-V8；D084/D085 及原 R3-G8 的真实组合门 |
| R4-P5 | S-71/S-72 | 具名可替换的 settlementContention 策略、显式调度和有界资源准入；耗尽映射到原未完成责任 | R4-V9/V10；不借 P-5 的模型重试策略 |
| R4-P6 | S-36/S-61/S-64/S-72/S-73 | 同一关闭 effect 关准入、持有真实任务、尝试收口或交接耐久责任、确认可释放后释放资源 | R4-V11；宿主／日志 owner 承接实际静止和独占恢复 |
| R4-P7 | S-27/S-32/S-33/S-43/S-49/S-72 | 十三操作保持原返回／重复规则，私有 pending 不覆盖耐久事实；不从选中值认回未知切换命令 | R4-V6/V7/V10；不加命令键或自动重放 |
| R4-P8 | S-20/S-54/S-62/S-63 | 原纯函数、观察、结构化诊断继续，新增结算争用／unknown／恢复阶段因果；诊断不作恢复真相 | R4-V12/V13；既有 T/SC/G、真实模型和双语例义务保留 |

## 十三个操作与全部追加写方

下表的 F 表示：**属于 Run 时取原操作已授权的 `fenced{run,attempt}`，不属于 Run 时 `unfenced`**；不能从恢复归账壳、缺席 attempt 或猜测的新 Run 造一个 fence。U 表示显式 `unconditional`。R 表示响应整批：**始终 unfenced；withRun 用同次完整前缀的 tailEquals，noRun 用 U 且 late 缺席**。表记号不是公开类型。

| 服务操作（完整十三项） | 本节点实际日志写入、fence／condition | 新版未完成／重复责任 |
| --- | --- | --- |
| legalTargets | 无追加 | 原授权、当前输入和合法集合不变，不消费结算争用策略 |
| displayList | 无追加 | 原来源／选中展示不变；读不到不是空列表 |
| effectiveModel | 无追加 | S-66 当前输入求值不变；原 basis 窗口保持 |
| selectModel | `model_selection_changed`，unfenced＋U | 先判合法再判重复。确知本次没写仍 unavailable，不保证其他命令没切换；unknown 不保证仍为旧模型。当前 selection 只由权威记录读，不能认定本次命令；不重放、不回滚、不加命令身份 |
| openCall | 正常打开无耐久追加；原检查拒绝的调用终结用 F＋U | 原绑定、basis、工具、credential/current-input 门保持；失败结束记录未确认不伪造已终态 |
| dispatch | dispatched／opened 用 F＋U；故障／无回复中断响应用 R；原无发出拒绝／缺凭据终结仍 F＋U | 未确认响应不得进入 awaiting_decision 或返回已结算结果；按已知耐久锚点保留 in_flight/speaking 处理责任，unavailable 不许重发；有回复照旧进入 reply_pending，尚未声称持久 |
| dispatchAgain | 锚点、响应、终结分类同 dispatch；原 guard 不变 | 不以尾争用增加 dispatch 序号、换 provider 或改旧绑定；未知前提不可判仍 unavailable |
| interrupt | 意图 F＋U，成功后才发信号；没有在途发出时原调用终结 F＋U；后续响应 R | 意图成功即按原时点返回 phase，不等响应；后台耗尽不追改已完成返回。意图本身未确认则 unavailable、不发信号，真实任务继续归 owner |
| releaseCall | 仅 awaiting_decision/resumable 的 released 调用终结 F＋U | 未确认 unavailable；可能已耐久不能由本地旧阶段否认。认回 handed_up 后重复为 alreadyEnded，不用 release 绕过尚未结算发出 |
| reconcile | 原表中响应追补用 R；无响应的调用终结仍按原所需 F＋U | 只在 S-33 两时机，行优先级不变；不能取得原操作所需的有效 fence 则 unavailable，不为追补伪造。任一必要读／批未完成不返回部分结果；已提交批不回滚，下次认回 |
| readAttempts | 无追加 | 从权威事实读，未结算／未知不能被当作模型失败主体；既有 identity／输入判断优先级保持 |
| settleReply | vetoed/consumed 响应用 R，拒绝 persisted 参数 | 同处置完整认回返原结果；不同合法处置 alreadyEnded。未确认／耗尽为 unavailable，保留本实例 reply_pending 责任，不改变既定收场，不证明耐久响应缺席 |
| canDispatchAgain | 无追加 | 与实际 dispatchAgain 同守卫；未知前提不给可重发许可，不产生新失败枚举 |

| 其他实际写方／触发 | 承担的追加与条件 | 必须共同履行 |
| --- | --- | --- |
| 普通完成、取消、interrupt 后续、宿主停止／撤除／替换 | 不带回复的响应均经同一 R 路径；系统停止是否写意图保持 S-36 原规则，不补假意图 | 原 opened 门、真实 owner、稳定 ResponseId、同提交 late 与完整批认回 |
| 调用方 persisted 回复 | 指定后的同一个 MessageId＋原 ResponseId 的 AssistantMessage／response 完整批，按 R；账沿 MR4/CA2 随原响应携带，不另造独立重复账条目 | 与 runtime、对账和其他处置用等价业务键／读取键。消息不能先写；失败方不能补半批或换 MessageId。外部返回归该消费者，未完成不能伪报本契约成功 |
| 新 attempt／Run 终结／无关日志追加者 | 它们的业务提交仍归各自契约和实际写方，本节点不代定 fence/condition | 其追加必须进入同一本权威日志，不能绕文件 owner；它们会改变全尾。runner 自己的 SL3 消费须另显式采用，不因 RT4 守卫兼容自动升级 |

无 Run 的响应没有可判断 late 的 Run，保持缺席而非 `late:false`，不要求 Run 全尾条件；共同身份、整批、锚点和 unknown 义务照旧。普通记录不经结算争用循环，不为模型切换或锚点增加新的全历史业务谓词。

## 同次前缀、稳定原批与提交循环

一次结算推进由实际调用／回复 owner 拥有，只有以下受控重复；不是一个会自动重发模型或在关闭后复活的后台任务。

1. 先按原输入／身份／phase 判定和 Q-1 opened 隔离检查。冻结本次既定收场、处置、原 ResponseId、已指定 MessageId、原 dispatched 引用与绑定、参数三项、已知 usage/cost 和原时刻。来源由公开 core 边界无损复制；新 attempt 的归账壳不替换判 late 用的**原发出 attempt**。
2. 检查策略、owner 的准入和资源许可；在首次构造及每次重构前，从真实日志认回是否已有同一 ResponseId 的合法完整原批。withRun 必须持有同次完整前缀及其尾；若沿 owned 前缀追补，校验同 session／日志代际、位置连续且恰延伸到本次 tail，禁止合并别次尾。不能仅用按键筛选结果宣称全前缀。
3. 已有合法完整原批即保留原值并按原操作重复规则返回；包含处置、消息关联及账，不能拿本次候选覆盖。readKey 命中、碰撞数相等、JSON 合法都不等于完整原批。部分碰撞／身份或成员不符均 unavailable，不补齐、不换键。完整辨认规则和共同 codec 在 G-29 闭合前阻断真实提供。
4. 没有原批且满足 unknown 恢复前提时，withRun 才从该前缀解释原尝试是否已被取代／原 Run 是否已终结；任一不可判即 unavailable，不能填 false，也不能把 `model_call_ended` 当 Run 终结。两项均已可判时，两者确假则 late 缺席，任真则 true。noRun 不执行此 Run 判定。
5. 构造整批；同批不得加入改变此次 late 判据的新 attempt 或 Run 终结事实。再次检查停止和预算后调用同一 `sessionLog.append(session, entries, unfenced, condition)`。withRun 的 condition 取**构造这份事实的同次前缀尾**；不是新读一个 tail、不取缓存最新值、不将尾比较放在 runtime mutex 或 SQL 事务里。
6. 日志成功才确认本批耐久并推进原操作状态。`alreadyRecorded` 只表示 THIS 零写，进入完整认回；不能直接“成功”。`tailChanged` 也只表示 THIS 零写，返回尾仅作诊断和冲突信息；只有没有先前未决追加、权威读确无原批、策略明确准许，才能等待后返回步骤 2。重构只更新尚未提交批的 late，其他冻结值不变。
7. 日志 unavailable、丢回执或实际 append 仍在途：保存任务和未知责任，停止普通重交。后来的 tailChanged、alreadyRecorded、tenantMismatch 或 attemptSuperseded 不能关闭这笔旧 unknown；真实完整原批可以认回已成立事实，但关闭潜在写责任仍需旧任务不再产生效果。以缺席断定未写之前，须旧网络／门／锚点及全部结算写者实际停止并完成权威恢复。正常终止的纯本地等待也不能覆盖这个门。

稳定信息属于原 owner 持有的内存候选及已存在耐久锚点，**不新建恢复任务表、命令键或持久 phase**。进程丢失后按 S-33 重新从锚点构造其已定义的失联响应／全未知账；不能声称未持久的原完整回复或金额能凭空恢复。已经提交的批按原值认回；本地 reply_pending／in_flight 只表达未确认处理责任，不否定耐久终态。模型切换不是这个业务批协议：读取当前选中不能识别某次未知命令。

### 共同物理对象与存储要求

| 原要求／增量 | 两个或多个写方共同触碰的对象及 owner | 对应条款 |
| --- | --- | --- |
| L-1/L-2/L-3 | 同一 session 的 **`<dir>/<SHA256(SessionRef)>/entries.jsonl`**：runtime 响应、外部消息＋响应、宿主结算和对账均写其同一批；ResponseId／MessageId 的等价判重键在同一条目壳。日志 owner 的根 `.owner-lock` 和每日志队列保证比较／判重／整批确认不可插入 | RT4 S-17/S-68～S-70；SL3 S-8/S-13/S-14/S-17/S-33 |
| L-4 | 新 attempt、原 Run 终结、无关追加与旧响应共同改变这本 entries 的全尾；日志只比较 tail，不认识 Run。原 attempt/终结由消费者从同一完整前缀解释 | RT4 S-69/S-73；MR4 S-35、CA2 S-39；G-28/G-30 |
| L-5 | 原锚点／意图／终结唯一性仍靠同一本日志上的既定键和 fenced 提交；新增 condition 不替代旧 fence，不新增命令键 | RT4 S-5/S-8/S-15/S-31/S-33/S-68 |
| L-6/L-7 | 同一物理日志恢复出的完整前缀、确认尾、原批及锚点；不可信时依 D084/D085 实际进程退出、独占全扫和修复确认，旧索引／旧确认尾不作缺席证据 | RT4 S-17/S-33/S-70；SL3 S-22/S-23/S-34/S-35 |

这不是跨 SQL／JSONL 的同一提交。原 R-1～R-3 模态投影缓存、E-1 当前求值一致读取不参与本次尾比较；SQL 隔离级别、内存锁、时钟、RAF2 服务返回的两个 bool 均不是上述共同对象。日志提供者的 [SLJ3-P2/P3/P5](../../session/session-log-jsonl/v3-design.md) 和恢复投影承担原子、持久、不可用可识别及恢复；本节点只消费它们，不声称 provider IO 已通过。

两种顺序都须实测：A 读尾 t，B 先写新 attempt／同 attempt Run 终结／无关条目，A 旧尾提交应零写，合法重读后同身份重构；反过来 A 先成，B 后写，原响应的 late 不追改。另让 runtime 单响应批与外部消息＋响应批竞争：两种胜出顺序都只有一份合法响应／账，败方整批不能留下孤消息。若部署让各写方先在各自本地比较再写不同物理文件，本方案不可实施，必须交主线；相同服务名不构成共同提交域。

## 具名争用政策、调度与预算所有权

候选运行时配置 `settlementContention` 由实际调用 owner 的可信装配显式提供，外部回复 owner 同样显式提供其结算策略。它与 P-5 `omne-official:default-retry`、`default_retry_backoff` 完全分开：后者决定模型重试，本节只许可耐久结算推进。服务十三操作及 invokeModel 入参不新增业务参数。

| 候选输入 | 字段域与执行规则 |
| --- | --- |
| `settlementContention.name` | 非空可识别字符串，诊断关联策略。不是新领域能力标识或动态贡献；与策略值／实现一起捕获到本次结算推进，不能只按名称找“最新”对象 |
| `limits.submissions` | 有限非负整数，包含本次推进的第一次实际响应 append；开始提交前占用一次，未知、失败也已消耗，不因 tailChanged、cancel 或换日志引用归零。0 表示本次不准提交；不同 S-33 实际调用的预算由原 owner 显式给，不能内部自动开新预算 |
| `limits.elapsedMs` | 有限非负精确数，单位毫秒；本次协调器实际进入推进时开始累计，含读取、构造、等待、提交等待，不能因冲突重置。到限只关后续准入／请求停止可取消等待，不宣称已开始 IO 被取消 |
| `limits.retainedBytes`／`limits.concurrent` | 前者有限非负整数，界定本次拥有的编码前缀／候选批字节；后者有限正整数，限制同 owner 同时推进的结算任务数。先取得并发额度才开始，超出 unavailable，不建隐藏无界队列。字节按实际无损编码的 UTF-8 大小计，不用 JSON.stringify 丢精度；超限释放可释放的读取／构造数据并停止新提交，未知任务仍保留最小责任和实际引用 |
| `decide(input)` | 可替换、无 IO 的同步决策函数；input 是只读的触发阶段（初次推进、已确认 tailChanged、碰撞后认回）、实际提交次数、尾冲突次数、累计 elapsedMs、retainedBytes、前次等待值。返回闭合 `stop` 或 `proceed{waitMs}`，waitMs 为有限非负精确毫秒数；没有隐式默认等待、次数、抖动或随机源 |
| `settlementScheduler` | 显式 `nowMonotonicMs()` 和 `wait(waitMs, signal)`；前者同实例单调精确读数，仅算经过时长，不造业务时间戳。后者交被拥有句柄：`completion` 表示到期／取消，`requestStop()` 只请求停止，`stopped` 只在自身计时器／监听真实移除后完成。实际实现复用经采用且满足原 R3-G7 的调度构件，不在 runtime 手写退避计时框架 |

上述数值在本地配置面复用 core `JsonNumber` 的精确表示和校验；不对外新增 Schema 或共享 DTO，不强制舍入成 JS safe integer。实例配置出现形状非法的策略／调度对象，沿 v3 一致政策启动失败、不 provide；**整个可选端口缺席**则按 RT4 S-71 使相应结算推进 unavailable，普通只读／无结算记录操作不因此伪报模型失败。端口存在而 decide 抛出、返回非法值、单调读数失效或等待失败时，同样停止相应推进、保留原责任，诊断指出策略／调度阶段，不调用 P-5 兜底。

每次读取、重构和追加前检查实际预算与停止；decide 的 proceed 不能越过硬预算、unknown 或 opened 强门。等待完成后重新核 owner／代际／预算和完整前缀，不能沿等待前 tail 盲交；零等待仍受提交次数、经过时长和资源上限，不允许无限紧循环。已开始 append 的预算到期不释放其并发占有或底层引用，必须等真实任务收束或明确由宿主继续拥有。取消策略等待与取消模型执行、关闭日志是不同动作。

SL3 readSince 没有分页／流式资源限额；`retainedBytes` 是协调器取得结果后可持有的数据界限，**不保证日志提供者读出完整前缀时的瞬时内存上界**。不能切一段日志冒充完整前缀来满足配额；资源承载不足则 unavailable。完整读取成本、调度大时长和实际资源测量沿 R4-G3/G5，不能凭本配置声称已解决。

策略只允许本次有限尝试结束。最终收口还依赖合法完整前缀、日志可用、生产认法可得、必要旧写者实际停止，以及**恢复实际可执行且被调用、许可预算内存在真实可得提交机会**。保留 owner、启动 close 或第一次触发 reconcile 都不保证成功；不添加自动恢复调度器、默认期限、无饥饿或恰一次声明。

## unknown、opened 强门与装卸配对

原 Q-1～Q-4 整体保留并精确消费 SL3。响应 unknown 与 opened unknown 不能合并处理：前者在满足 S-70 前提后可认回完整响应；后者优先隔离所有普通响应入口、外部 persisted 写方、失败主体和再发许可，函数零可见内容／无 firstTokenAt 不是耐久 opened 缺席。只有 S-33 原新尝试或重新承载时机，完成旧网络、门回调、全部 append 和 unfenced 结算者实际停止，带 Run 再具有效尝试 fence，权威恢复读回后才按原表（意图优先、opened 原时刻）追补。不开在线 recover 操作，不重开原门、不续原流。

日志 provider 不可信与消费者回执未知也分开：datasync 成功并已发布判定态、仅成功回执丢失时 provider 可健康读，runtime 仍须认回和关闭旧任务责任；实际 IO 已结束、截回及其同步成功时日志可继续健康，不能把返回 unavailable 自动看成该 runtime 已知未提交；截回失败／任务不可确认／尾不可信时日志三操作 unavailable，依 D084/D085 恢复。此 runtime 不管理 `processOwnership`、物理身份、kill 或 marker；它们属于实际打开日志的宿主／日志 owner。

| 资源／贡献 | 装载、取得与可见点 | 部分失败、撤除及仍为真 |
| --- | --- | --- |
| P-2 服务、原调用集合、宿主登记 | 原必需依赖和静态配置通过后 provide，外部受理仍等应用开闸；原 S-61 登记和 stop 无漏窗口保持 | 同一 effect 先关本实例／旧引用准入，按原调用隔离再请求停止；不能跨 effect 假定顺序。已出门、意图和未知责任不撤销 |
| 一次结算推进、原候选与额度 | 在任何异步读／等待／append 前由调用／回复 owner 登记，保存可解释的任务归属；只有成功或合法原批认回才能确认业务完成 | 耗尽／取消／缺事实返回原 unavailable；实际已停的执行资源可释放，未完成责任留在原宿主／重新承载者。未知任务未停不放额度或实际使用引用，不用本地 phase 掩盖耐久事实 |
| 策略捕获与等待句柄 | 推进开始时捕获策略，等待前登记计时器／监听所有权；策略不读日志、不改候选 | 停止时请求取消等待并等待 stopped；失败可见，不因 resolve 一个外层 Promise 声称资源释放。策略更新只供后续明确推进使用，不中途改本次预算或生成新身份 |
| 网络、门、真实 append 及精确适配 lease | 沿 v3 调用资源容器；所有实际开始任务可定位，引用覆盖实际使用寿命 | 中止→普通可确定结算或隔离／保留恢复责任→确认实际使用停止及必要交接→释放。没有活动执行需要 lease 时可按 S-72 释放，不能把它等同结算成功；若任务仍可能调用实现则保留。对账只读旧绑定，不要求加载旧实现 |
| 外部 persisted 写方 | 实际回复 owner 在指定 MessageId 后承担消息＋响应全批；不得将任务匿名交给运行时或日志 | caller close／停止仍须实际收口或保留原未完成责任；runtime 不代造 persisted 消息。两处旧兜底只对权威确无完整响应且恢复前提成立者生效 |
| P-5 默认重试贡献／观察与诊断 | 原精确身份、power、runner 接线和有界观察不变；诊断 sink 由应用拥有且寿命长于 P-2 | 尾冲突不向 P-5 投递失败主体，观察关闭不取消耐久责任；sink/query 失败只降低诊断覆盖，不能伪造响应或 opened 确认 |

**同根升级与恢复交接**由实际宿主／验收应用 owner 执行：先显式采用 RT4/SL3 及全部实际写方，再关旧业务准入；停止旧 fenced 与 unfenced 写者、网络与门回调，确认真实静止；旧日志 close 按 D084/D085 排空、关句柄，最后放锁。需要不可信恢复时须额外确认旧**物理进程**已退出，新日志 owner 独占全扫并完成恢复后才开闸。provider.close 完成或锁可取不代替这项退出事实。runtime 不自行绕过日志门或替装配证明退出。

旧任务无法停止则继续具名持有，恢复依赖路径 unavailable；超时只报告未停范围，不销毁还在用的实现。撤除可保留耐久锚点及未完成义务，不要求无限等待争用成功；宿主／重新承载者必须按 S-33 真实调用恢复，不能只登记一个 owner 而永不执行。未取得该责任的明确承接时不得声称释放整个调用责任已完成，日志恢复投影 RG-G1 的进程机制与本节点的业务停止义务分别验收。

## 观测与消费者传播

沿 S-63 的结构化采集增加：结算进入／原批认回／碰撞不可认回／tailChanged 的 THIS 范围／unknown 保留／策略名称与预算计数／等待与实际停止／耗尽／恢复读取与完成。事件关联 tenant、session、call、dispatch、原 ResponseId、适用 Run／原 attempt 和绑定修订；高基数身份不当 metrics 标签。诊断不记录整段前缀、消息正文、原业务键、凭据或 raw headers，相关内容裁剪和 secrets 处理沿原 S-20。

业务不可用、策略拒绝、日志不可用和诊断投递失败分别可解释；sink/query 持有者仍为 [model-request-acceptance](../../../retired/model-request-acceptance/README.md) 装配。已实际停止但尚未结算的状态必须在工程诊断可见，不能以“disposed”抹掉；诊断不可读时明确覆盖缺口，不据其缺席推断日志没写。业务恢复只读权威日志。

| 消费者 | 必需变更与采用边界 |
| --- | --- |
| runtime 实施者 | 统一全部响应入口、13 操作既有返回与本地 pending 语义、四参数追加、策略端口、共同原批认回；完成后更新包 README／README_ZH 的公开面和关键示例，不把尚未提供的服务写成已提供 |
| 外部回复／loop owner | 明确消息＋响应同批、共同 codec／读权、原身份和策略，以及未知时未完成返回；不能从 RT4 接受推出 loop／完整会话产品已交付 |
| runner3 owner | 仍规范消费 RT3；单独核 S-24/S-30/S-50/S-67 并显式选版，其自己的日志 append 同样要采用 SL3，不由本页自动升级 |
| 日志 owner／实际应用宿主 | D084/D085 的 processOwnership、真实停止、全扫、开闸及合法全读接线，外部全部旧写方枚举与真实退出证明；不是 P-2 一个 disposer 能独立完成 |
| 公开函数／transport 消费者 | invokeModel 和固定 lease／完整定义消费沿 D076/D082；RT4 不增加日志依赖，原制品和双语示例测试、T/SC/G 与生产路径认证义务继续 |

## 关键取舍与可失败验收

| 本次投影选择 | 最强替代理由 | 本方弱点／改票条件与置信度 |
| --- | --- | --- |
| 复用单一结算协调器，由 runtime 和回复方显式消费 | 各入口直接追加更短，不需要公共协调构件 | 共同规则容易被某外部写方旁路；必须枚举全写方和相同 codec，不把共享代码本身当保证。中高；无法完成全写方采用则依赖组合不放行 |
| 每次以完整前缀＋全尾比较；允许自有密集追补 | RAF2 两 bool 或相关 Run 局部水位更省读／更少冲突 | 本方承担全读授权、前缀资源和无关写争用；D081 已采用，不凭便利重选。真实前提无法成立时返回主线重比其候选，不削 late。中高 |
| 有界可替换策略、实际停止后保留原恢复责任 | 一直重试直到有响应最易给调用方终态；取消时直接丢任务可快速关闭 | 本方需显式 owner 和实际重新承载，不保证最终调度；缺真实责任接手即受阻。保持 S71/S72，不添加后台恢复服务。中高 |
| 同一个 effect 收口，调用是宿主资源、无新 fiber | 每结算一条 fiber 可复用框架可视化 | 本方必须维护任务和额度真实生灭。required 依赖重跑不能成为业务重交；任务未停就 release 的真实负控必须失败。高，沿原节点 |

Cordis 依据沿 [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)。原宿主提前解除／无漏登记、socket 实际停止、调度精度与大时长仍为待核对主张／假设，须 source-check 和真实运行，不能由内核补上持久、排空或跨进程保证。

以下全部**待执行**；每项需相应真实 provider／文件／宿主，负控有明确可失败后果。原 verification 的 R3-V1～V23、十三操作完整基线、T-1～T-20、SC-1～SC-3、D019 比较门、公开制品与双语 README 例、全部模型生产认证和观测义务均保留；新规范有限模型不替代这些运行。

| Oracle／条款 | 正向与负控，以及实际 owner |
| --- | --- |
| R4-V1／S-68/S-72 | 对矩阵逐调用记录真实 append 四参：普通记录 F＋U、切换 unfenced＋U、withRun 响应 unfenced＋tailEquals、noRun unfenced＋U。遗漏 condition／误 fenced 响应／把普通记录改 tailEquals 的负控须失败；13 操作返回集合不扩展。runtime、外部回复和 runner 各提供实际路径 |
| R4-V2／S-69 | 在真实 JSONL 提交点插桩，分别让新 attempt、同 attempt Run 终结、无关追加先于响应，及响应先于各边界。先边界则旧批零写并合法重读重构；先响应则原 late 不追改；原发出 attempt 与归账 attempt 故意不同。去掉比较、只比较 Run 局部尾或换新 attempt 判 late 均须失败；Run fixture 仅证具名测试解释器 |
| R4-V3／S-17/S-69/S-70 | runtime 响应与外部消息＋响应两种胜出顺序、同处置／不同处置及旧调用者并发；一 rsp／一账、无孤消息、MessageId 不变。拆成两次 append／各加 owner 前缀／碰撞后补残批的负控须失败；共同 codec 未采用不声称生产通过 |
| R4-V4／S-69/S-73 | 真授权全读、从合法完整前缀密集追补、provider 换代、另一 session 尾、断号前缀、按键局部结果、无权限和认法不可判逐支；只有合法完整输入能 append。注入两个 bool＋另读 tail 或默认 false 必须失败；真实权限由应用／会话访问 owner 验 |
| R4-V5／S-70 | 响应追加实际已提交丢 ack、确未提交但 ack unknown、旧 writer 迟到提交三支；后次 THIS 拒绝不能关闭旧 unknown。停全部旧写方并权威恢复后认回全批或在确无原批时按策略重构。只碰一个键／错误身份／数量相等假全批的负控不得成功；真实进程和文件证据归 runtime＋日志＋宿主 |
| R4-V6／S-27/S-43/S-72 | selectModel 从 M1 切 M2 的确知未写、另命令已切 M3、已提交丢回执、先读 M1 后迟到提交；返回 unavailable 时权威选中分别如实为 M1/M3/M2，不保证 M1。当前读得 M2 不作命令认回，不自动重放或回滚；注入“unavailable 恒保 M1”必须失败 |
| R4-V7／S-6/S-32/S-49 | releaseCall 已写 ended 丢 ack，认回后重复 alreadyEnded；settleReply 全批已写丢 ack，认回同处置返原结果、不同合法处置 alreadyEnded；确未写分支独立运行。本地旧 phase 不能放行再发；以 reply_pending 推无响应或未知时重写的负控失败 |
| R4-V8／S-15/S-17/S-33/S-70.6 | opened 已提交丢 ack、确未提交但 unknown、取消后迟到提交分别覆盖普通失败、interrupt 后续、host close、reconcile、settleReply、外部 persisted。强门期间零内容／零普通响应／零失败主体／零重发；只有 S33 原时机及实际停止、fence/独占和恢复齐全后用原 opened timing，意图优先。去强门、用旧尾空读或 outcome 当物理停止须失败 |
| R4-V9／S-71 | 显式命名策略与可替换实现，零提交／时间／字节预算、并发额度满、持续无关尾争用、策略缺席／抛错／非法结果、等待取消／单调时钟失效；全保持原未完成责任，无隐式默认、模型 retry 或新 send。越限 proceed／每次冲突重置预算负控失败；调度实现和读全本资源局限实测 |
| R4-V10／S-17/S-33/S-72 | dispatch/dispatchAgain 耗尽不进 awaiting_decision；S49 保留未确认责任；reconcile 某批失败无部分结果、已写前批下次原样认回；interrupt 意图先成功即返原 phase，后台耗尽不追改返回；意图失败不 abort。只保留 owner 而恢复未被调用、或预算内无真实机会时不得宣称有限成功；负控提前报 settled/resumable 须失败 |
| R4-V11／S-36/S-61/S-73 | 真 Cordis host/runtime 并发撤除与日志换代，分别阻塞 socket、门、append、等待和外部 unfenced 写方；取锁失败／processOwnership alive/unknown/真实 exit 路径分开。只有实际停止或明确继续持有才可交接；已停连接可释放但未结算责任仍可追溯。abort/Promise/close 当实际死亡、释放在用 lease、遗漏外部写者各负控失败 |
| R4-V12／S-20/S-62/S-63 | 每个新结算边界有相关诊断，payload／业务键／凭据／header 秘密哨兵不泄漏；sink失败/query拒绝/满缓冲保持原业务结果且覆盖缺口可见，卸载后 sink 仍可查。把诊断成功当日志确认或把诊断故障当模型成因的负控失败 |
| R4-V13／S-54/S-68～S-73 | 独立制品的 invokeModel 不装日志／Cordis 仍可用，保持一次 send；新服务与外部回复实际组合走同一协调器，三参数旧 consumer 被拒，双语 README 的实际导出例编译执行。旧绑定／参数／精确金额／cache 未知保持；真实 headers 多值路径在 G31 未闭合时受阻，不编默认 oracle |

## 缺口与施工边界

| Gap／条款 | 受阻消费者、owner 与可验闭合条件 |
| --- | --- |
| R4-G1／RT4 G-28：S-69 原 Run 解释 | 原 loop／Run 事实 owner 明确生产终结表示或读取键及被采用认法，runtime／回复方从同一完整前缀应用；RAF2 G-3 和 [derived 节点](../../session/run-attempt-facts-derived/design.md) AFD-1/4 不被覆盖。此前生产 withRun 响应不能把未知变 false；具名测试仅有测试范围 |
| R4-G2／G-29：S-70 共同 codec、完整原批与停止 | runtime／外部回复／对账共同 owner 交付精确等价键和完整辨认实现，日志与宿主执行真实竞争、丢回执、旧 fenced/unfenced 写方枚举及停止、重启恢复。键长得像或单包 test 不闭合；缺口不由本页造业务字节协议 |
| R4-G3／G-30：S-69/S-73 合法完整读 | 会话访问授权和应用宿主 owner 给实际权限边界／采用接线，日志返回真实完整范围，runtime 保持代际和连续性；不能授权者 unavailable。全本读取资源成本和预算拒绝真实可验，不以局部缓存伪造完整。若此前提无法满足，沿 D081 返回主线 |
| R4-G4／G-31：S-20 和 MR4 raw.headers | 原 runtime／response 表示 owner 与主线给采用映射或新规格；TransportFailure 多值数组不能拼接、取首、丢弃或直接塞入 string-map。相关持久响应路径受阻，合法单值等独立路径继续 |
| R4-G5：S-71 具体调度与资源实现 | runtime／宿主按原 R3-G7 给成熟调度实现、精确大时长／取消停止／单调计时与资源测量证据；策略字段已经候选化但无默认数，未验证的 timer／read 内存上界不能声称有保障 |
| R4-G6：S-36/S-72/S-73 真实装配与责任接续 | model-request-acceptance 及真实宿主、日志 owner 明确旧参与者清点、D085 processOwnership、日志 close／独占恢复、实际可调用且被调用的 S33 和全部写方显式版本切换；原 G11 的 loop／会话生命周期义务不由本页关闭 |
| R4-G7：本候选采用与继承证据 | 主线独立架构／表达复核、精确采用后更新导航、计划和消费者；原 R3-G2～G8 的未覆盖部分、全部服务／生产模型及观测门按原 owner 继续。不存在本次运行就不登记新 binding、不换旧证据标签 |

本页未发现需要修改 RT4／SL3 冻结语义才能表达的新增保证。若上述必需输入不能提供，暂停依赖它的生产接线并报告相应 S 坐标；不得以扩日志业务、造新 Run 事件、默认授权、后台自动重放或更换响应表示填平。其余已明确的公开构件、普通记录传播和受控测试可按精确采用范围独立推进。
