# model-request-runtime 验证与证据

## RT4 结算投影采用（2026-09-27）

[D087](../../../../record/decisions/model-runtime-v4-projection-adoption/decision.md)技术采用[v4-design rev2](v4-design.md)；R4-V1～V13全部待执行，原R3-V1～V23及T／SC／G、公开制品、双语示例和37生产认证义务保留。两类独立设计评审无阻断不构成运行结果；本次新增bindings0，没有IO／真实十三操作／宿主恢复验收。G28～31及R4-G1～G6沿原owner保留；旧证据不改标签，runner3及源码不自动采用RT4。

## Revision 7 公共消费者补证（2026-09-27）

[实际完整定义 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-definitions/README.md)包含当前两model包双语12个TS块的两仓库外目录编译／执行，以及两语言公开runtime helper的实际受控HTTPS调用；HUB既有runtime6项通过，受测源码无漂移。此处仅登记公共消费者证据，不新增十三操作绑定、不将transport机制验证升为耐久service、租户装配、结算恢复或完整P2签收。37正式生产认证仍0／37。

## P2 函数消费者实际验证（2026-09-27）

[新 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-p2/README.md)保存 runtime 6 项、伴随 transport 196 项与仓库外实际制品。调用在异步开始前固定请求/政策；真实 Cordis 模型贡献 force 时，direct 与 invokeModel 的 socket/读循环都实际停止，独立 gate/callback 的 track 未完成仍保留引用、fiber 等待，完成后才清理。这是 S-53/S-56/S-64 的独立函数消费者局部责任，P-2 耐久服务尚未建立；不证多个 dispatch、retry/reply_pending 或持久结算后的 release。

本轮没有付费请求，revision 3 的完整生产认证未执行。R3-G4/L-7 的日志载荷传播/权威恢复、十三操作与所有租户/观测门继续待验；当前日志提供者传播候选不因本轮组件通过而被接受。

## P1 实际公开函数验证（2026-09-27）

[本次 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-p1/README.md)保存精确源码、已接受输入、控制 TLS、制品、原始结果及费用回执。runtime build/typecheck 与 6 项成因检查、伴随 transport 的 39 项检查通过；r2 生产制品完成 OpenAI/Anthropic 各两次冷暖请求，均一次 send、正常结束且 readerStopped。公开面 R3-V8 已取得有界实际证据；R3-V7 只覆盖函数门私有/失败/取消，不覆盖任何真实追加、回执未知或恢复。R3-V13 取得本机排队/已触达、精确 usage/cost 及两代表模型缓存事实，完整 custodian/service 与其他分支仍待。

四条 v3 局部测试绑定见 bindings；原六条 v2 形式绑定保留原前提。十三操作、耐久服务、37 模型、Cordis 装配及独立总体验收尚未完成。本包双语 README 及公开例子已检查。下文是原义务与历史执行记录，“待实现/源码不存在/candidate”沿原日期读取，不盖过本节采用后的局部事实；未被本节明确覆盖的义务继续待验。

## v3 增量证据义务

本节对应 [v3-design.md](v3-design.md) R3-P1～P11；本版为candidate、尚未建包。所有“待验”均不是通过声明。契约侧[有限模型与原型](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md)不包含生产HTTP、真实提供者提交或完整租户接线；不增加绑定。

| 编号／来源 | 必须可失败的检查 | 当前状态／owner |
|---|---|---|
| R3-V1：S-28/S-53 | 新call完整binding/配置取得、目录改V2后旧call三阶段仍V1、新call用V2；同名配置revision跨档案不同值不互取；旧版缺失unavailable零锚点/零HTTP | 待实现；runtime＋transport＋directory |
| R3-V2：S-28 | 真assetRegistry发布/lookup与report；run/attempt/session每一处错配拒绝，reload后report仍读旧工具快照；无工具/未知工具/源不可读三分；续接用新tools/report | 待真实provider；runtime＋registry＋runner |
| R3-V3：S-10/S-21/S-66 | 无reload改变层配值，新effectiveModel受新锁，旧openCall绑定不变而下一dispatch使用新时限；缺可选model无锁、缺任一时限零HTTP且状态不变 | 待真实当前输入store；runtime＋AE＋输入provider |
| R3-V4：S-66、AE4 PRE-3、OG2 S-63 | 捕获effective但当前资格失效/未知/无内部权限均unavailable且零HTTP，当前有效时角色变化不改捕获standing、不逐请求取中心；真实OG participate与recipe/head/资产同atomic，资格撤销或发布交错无拼接成功，去保护负控能失败；参与异常必须实际回滚/排空后才映射。跨tenant、根version/source/正文失配、current误改pinned及源不可读均拒绝，历史manifest不能掩盖当前失败 | 待真实同存储参与组合；输入provider主验、runtime核原状态与零发出；不以mock资格替代 |
| R3-V5：S-15/S-29/S-54/S-57 | 插桩使真实plan在锚点前只运行一次；实际请求体及参数与已出门还原值一致；锚点写失败send计数0；写成后停机恢复保留事实；private prepared构件输入错配拒绝 | 待实现；runtime＋真实log＋transport |
| R3-V6：S-28/S-29/S-57 | 已发出后续接换messages/tools造成三种规划拒绝，各零新send/response/ended且保留原阶段；同样模态拒绝在历史0次时才undispatched。历史不可读不猜零；凭据缺失独立分支 | 待实现；runtime |
| R3-V7：S-15/S-16/S-17/S-29/S-33/S-51/S-55、X4/X5 | 真实opened追加阻塞时所有可见面无内容；函数门失败仍无firstTokenAt。至少故障矩阵：①提交true/ack unavailable→禁止普通failed response，恢复opened后durable firstTokenAt等于锚点且终态不重发；②提交false/ack unavailable仍先隔离，不把未知当未写，满足S-33前提并权威确无opened后才按原表；③取消门等待→函数interrupted零内容→append迟到提交或ack丢，durable timing仍取opened，中断意图优先；④权威read unavailable或只剩旧confirmed tail→未结算、零内容/零再发；⑤旧writer未停/无有效fence→不得先结算或进入可续接；⑥假成功回执负控必须被重启耐久/先锚点后可见断言抓住。隔离期间runner/P-5不得收到失败主体。全支核ResponseId至多一次与response/anchor一致；去掉隔离/静止屏障须失败 | 待真实故障注入及独立机制复审；runtime＋JSONL owner＋宿主装配；原ContentGate模型不覆盖耐久ack未知 |
| R3-V8：S-54～S-56 | 不装Cordis/会话/存储的实际制品消费者仅一次send；结果无系统身份/回复处置；发送前取消外层分支不造ResponseOutcome；abort幂等但不假称实际停止；不响应构件保持可见未停状态 | 待实现；runtime＋transport |
| R3-V9：S-17/S-49、X1 | 两副协程交叠于真实日志提交：consumer回复＋R与撤除/settleReply的R竞争，唯一response/账，整批回复无孤儿；持久写失败保留reply_pending，不提前release | 待真实log组合；runtime＋consumer |
| R3-V10：S-8/S-22/S-38、X2/X3 | 新attempt与旧fenced发出交错；无run旧/新实例同序号交错；败者零HTTP，不用同实例锁或固定sleep代替提交插桩 | 待真实log双实例；runtime＋日志owner |
| R3-V11：S-31/S-33/S-36 | 意图写前/后崩溃，意图失败不发中止；用户取消与系统停止有/无内容、reply_pending竞争分别收场。普通已知系统停止为run_cancelled、无回复且保留已交付块；未知ack隔离不因系统停止新增durable意图，恢复无意图/无response时，opened无→runtime_lost/resumable、有→runtime_lost/interrupted并取锚点时刻。有真实意图才优先；不能用内存stop原因阻止合法显式续接 | 待实现；runtime＋宿主consumer |
| R3-V12：S-33/S-34/S-53 | 真进程终止后在相同持久日志恢复；只装V2亦可追补V1且send0；无首内容resumable、已开口终态；部分追补失败不交部分成功，重复对账幂等；续接再取得原版 | 待跨进程真实验收；runtime＋装配 |
| R3-V13：S-18/S-19/S-21 | queued超时unrecognized、触达后upstream_unavailable、未知阶段不猜；首内容后故障优先；每次凭据轮换真实读；provider请求/实报/缺席、缓存0/未知/正数、cost精度逐支 | 待实现/采用表取证；runtime＋transport＋custodian |
| R3-V14：S-20 | 原凭据、满足长度的片段、具名头/模式秘密哨兵遍及错误/记录/附件/诊断出口；默认prompt/tool/reasoning哨兵不入诊断；不能用Schema通过当禁秘证据 | 待实现；runtime＋transport＋sink装配 |
| R3-V15：S-30/S-35/S-50/S-60/S-67 | 真实runner按 `{ category: loop_extension, name: "omne-official:default-retry" }` 识别；声明/name/记录逐码点一致，after_model_call且ending=failure；错名/错位/错dimension不得冒充默认件，禁止按类名识别。完整失败主体经声明求值和结论记录；实际power不允许时retry被拒绝，不能将retry/record填Power或凭身份越权。默认与恶意自定义retry均过同一只读/实际守卫；n/u端点、非法factor/base/max、退化区间/decorrelated前值逐项；无seed、隐式取整或自动send | 待runtime3/runner3接受及真实组合；runtime拥有标识与P-5，runner消费并校验；LC4已接受 |
| R3-V16：S-36/S-53/S-61 | 真实Cordis宿主register↔stop两种次序、登记失败回收；正常提前解除、重复停止、runtime与host并发撤除；真实socket/回调结束后才release，写失败不伪称结算 | 待source-check及产品组合；runtime＋宿主＋transport |
| R3-V17：S-53/S-64 | acquireA→releaseA→acquireB→retire，B在途不dispose；正常retire不打断旧call，强制取消同时覆盖runtime/direct；等待超时保留资源/诊断，服务替换另触发S-36 | 待产品实现；transport主验、runtime消费验收 |
| R3-V18：S-51/S-62 | 两会话同callId/不同dispatch串流拒绝；字节/事件双限分别耗尽、consumer异常和中途关闭有具名结果；结算继续；晚到事件不重开、不可靠重放 | 待实现；runtime＋observer装配 |
| R3-V19：S-63 | 每个边界事件可关联且不录高基数metrics标签；真实JSONL查询显式tenant过滤、OS权限、runtime fiber撤除后仍能查询；记录retention/采样/丢弃范围 | 待真实sink/query/metrics；验收装配owner |
| R3-V20：S-63 对照 S-15 | sink写失败/满缓冲不改业务收场，独立退化状态及有界stderr可见；同处替换成opened durable失败则无内容；所有出口失败明确覆盖缺口 | 待故障注入；runtime＋装配 |
| R3-V21：S-13/S-38 | 真实增量日志任意前缀与全量重算同值；日志身份错/水位竞争/缓存不可用/日志不可用各支；不同历史长度测量新增量工作量 | 待实现；runtime＋storage/log |
| R3-V22：装配开闸与既有MRR-N7 | 全部required与操作必需provider ACTIVE、真实guard.confirm后才HTTP；confirm失败/迁移失败关闭受理并核pending；测量JSONL opened持久延迟分布，报告负载/存储/样本不猜SLA | 待真实验收应用；assembly＋storage/log |
| R3-V23：S-38与公开闭包 | transport原T-1～T-20、SC-1～SC-3及D-019比较门全部保留；runtime只能从invokeModel通道出网；实际打包consumer无私有导入/隐藏环境依赖；37模型在生产路径复验 | 待实现；transport＋runtime＋验收装配 |

### v3 覆盖缺口与实施门

| 缺口 | 受阻条款／消费者 | owner与闭合条件 |
|---|---|---|
| R3-G1：runtime3/runner3候选接受与接续 | S-28/S-29/S-35/S-50/S-60/S-67；失败主体、默认重试与完整runtime实现 | D-070/D-072/D-073接受相关数据及读取链，LC4已接受；runtime3/runner3仍candidate，主线及各owner完成独立评审/接受与真实接续。P-5声明/登记和runner消费一致采用S-67，身份不增权；不降成LC3 |
| R3-G2：S-66实际当前输入源与一致性 | S-10/S-21/S-24/S-26/S-66；有效模型及所有发出 | [evaluation-input-store](../../assets/evaluation-input-store/design.md)读取投影已由D-074采用；其owner与OG/runtime/装配仍须完成真实公开参与面、同AtomicStorage授权/源读取、捕获配方与当前资格分离及V3/V4，落实参与异常共同终结。不得fixture、历史manifest、恒真授权或固定设置假成功 |
| R3-G3：宿主与精确引用实际停止 | S-36/S-53/S-55/S-56/S-61/S-64；hot update、取消、卸载 | runtime、transport、宿主owner；basis外提前解除/登记竞态source-check与V16/V17。构件不响应时不能通过释放资源伪造闭合 |
| R3-G4：共同日志真实耐久及v4载荷接续 | S-8/S-15/S-17/S-31/S-33；所有服务面、恢复 | session-log-jsonl/runtime/consumer完成L-1～L-6互指、V5/V7/V9～V12与真实崩溃；禁止内存标记或跨SQL假事务替代 |
| R3-G5：传输比较门、状态码表与脱敏配置 | S-18/S-20/S-38；production transport及成因留痕 | transport与主线给实际来源表、完整显式脱敏参数及D-019门；表外仍unrecognized，不能把研究样本当全模型认证 |
| R3-G6：真实验收应用与观测持有者 | S-38/S-62/S-63；真实依赖、guard、查询/权限、观测完整性 | 主线指定[apps/model-request-acceptance](../../../apps/model-request-acceptance/README.md)目前候选起草；承担provider清单/真实数据初始化、OS权限、JSONL/query/metrics、guardconfirm及V18～V23。RT-AR1实际恢复与日志owner交接另须R3-G8 |
| R3-G7：调度构件及完整Duration承载 | S-21/S-55/S-56/S-60；计时/取消等待与默认重试消费 | runtime/装配owner以现有成熟实现或有依据必要自建投影，核精度/溢出/大时长/取消实际停止；不可隐式取整或硬塞数值默认。契约外拒绝政策若必需回主线，不在此发明 |
| R3-G8：RT-AR1未知opened回执恢复机制 | S-15/S-16/S-17/S-29/S-33/S-51/S-55；首内容门、取消、普通结算、再次发出及恢复 | runtime实现Q-1隔离所有普通结算路径，日志owner/宿主落实Q-2/Q-3旧append与stream实际静止、有效fence及权威恢复读，S-33沿原意图优先表定timing。旧confirmed tail、requestedCancel和ResponseId判重均不代证。L-7需提供者/装配承接互指、R3-V7真实矩阵与独立架构复审；本节点不新开恢复操作/枚举 |

G-20初始模型完整推出规则、中心/据点复制、完整Agent Loop和跨进程部署继续在外部owner，本批显式创建真实初选与本机源不关闭它们。当前有限形式任务也不覆盖真实IO失败、租户读取或任意模型行为。

### v3 实际执行

本版产品实现/实际装配尚无。节点文档检查仅检查引用与登记结构；本次实际命令及退出结果随起草交付报告提交。旧六条绑定保持原v2性质、常量与否定配置范围；不改为v3，不为未实施测试写占位binding。

以下为原v2记录，按当时的版本读取；旧seed退避、历史求值读取、旧schema主体等验收不代替上述v3义务。

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。原始输入与输出归 [record/evidence](../../../../record/evidence/README.md)；契约层的证据状态归[契约验证入口](../../../../spec/capabilities/model-request-runtime/verification.md)，本页只写它们与本节点的关系。**源码不存在，本节点没有任何实现层的证据。**

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| `capability.model-request-runtime/v2#S-15`、`#S-17`、`#S-22`、`#S-30`、`#S-31`、`#S-33` | 形式任务 `model-request-runtime-v2-invocation`：六条有否定配置的不变量 | **已执行**（契约层；run `2026-09-25-formal-assets-runtimes`，退出 0）；绑在 [`bindings.yaml`](bindings.yaml) | 主线；模型改动后重跑 |
| 同上（不允许回退的常量） | 形式任务 `model-request-runtime-v2-invocation-no-fallback` | **已执行**（同一 run，退出 0）；**不绑**：否定配置只在允许回退的常量下演示过 | 主线；要绑须在不允许回退的常量下补否定配置 |
| `#S-41`～`#S-48`、`#S-52` 规范场景 | 包内场景测试：真实 P-2 ＋ 脚本化传输 ＋ 真实会话日志提供者 ＋ 真实存储（sqlite 临时文件库） | 未开始。**G-19 已按 [D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) 闭合**（`A` = 范围里登记的全部档案，由目录读面直接给）：`legalTargets`、`displayList` 与经它们的场景**解阻**（`sessionTenancy`、目录、会话日志用最小提供者 ＋ 测试种子）。**仍受阻**：从没切换过的会话一律 `unavailable`（契约 G-20，MRR-N13），验收装配以种子写一条模型切换记录（契约 S-9、G-20 ②）；写过切换的会话，`effectiveModel` 的锁判与 `dispatch` 的两个时限要读求值结果，挡在 **assembly-manifest G-4**（读法未约定，MRR-N3）——验收装配由最小提供者 ＋ 测试种子给出一份不含「用哪个模型」项的求值（⇒ 没有锁）与时限值；`openCall` 本身不读求值（S-28 ④）；会话日志、保管方、装配清单的最小提供者尚未建包（节点 `session-log-jsonl`、`credential-custodian-local`、`assembly-manifest-store` 已立，MRR-N1～N3）。**函数面**：`invokeModel` ＋ 脚本化传输跑发出、收场、成因、脱敏、装配各支，不受上述任何一处挡。按 D-060 §八 N-35 ①：只在最小提供者 ＋ 测试种子上跑通的记「有前提」，不计入实际验证完成数 | 本节点；各阻断闭合后 |
| 公开函数面 `invokeModel`（[design 的公开面](design.md#公开面)） | 单元测试：不装 Cordis、不给存储与会话，只给档案快照、消息、凭据值与脚本化传输即跑通一次发出；首个内容出现前 `beforeFirstContent` 被 await、它未完成时快照里没有内容；`abort()` ⇒ 收场与账如实；**反证**：同一请求两次 `invokeModel` 就是两次发出（函数层不判「开口之后不再发」、不写锚点）；传输答失败时 `invokeModel` 不自己回退到下一家 | 未开始 | 本节点；有实现即可跑（不受阻） |
| 服务面复用同一个 `invokeModel` | 结构检查：P-2 的发出只经 `invokeModel`；演练：「已出门」确认之后才调它、「已开口」确认之后内容才推给观察者（与绑 S-15 的模型互为两层证据） | 未开始 | 本节点 ＋ `tools/ts-checks` |
| `#S-46` 成因分类与脱敏 | 哨兵串场景：七种失败源、全部记录里找不到凭据原文与其片段 | 未开始；受阻于契约 G-5、G-6（没有值就没有可测的配置） | 本节点；G-5、G-6 定值后 |
| `#S-18`、`#S-21`、`#S-36`：传输交回的事实怎样分成因（[design](design.md#传输交回的事实怎样分成因)） | 场景测试（真实 P-2 ＋ 脚本化传输）：① `first_token_wait_limit` 到点、传输交回 `local{queued}` ⇒ `unrecognized`、`localError` 带排队时长，**不是** `upstream_unavailable`；② 同一时限到点、传输交回 `aborted` ⇒ `upstream_unavailable`；③ 撤除中止、传输交回 `aborted` 或 `local{queued}` ⇒ `interrupted{run_cancelled}`、不进成因分类；④ 带内错误带整数 `code` 而 `httpStatus` 是 200 ⇒ `failure.statusCode` 是那个 `code`、`inBand: true`，结构化日志里有 `httpStatus`、`failure` 里没有；⑤ 带内错误没有整数 `code`（首 token 之前）⇒ `unrecognized`、不带状态码、留 `upstreamError` | 未开始；①已有契约 S-21/S-18 判据（MRR-N15 已闭合） | 本节点；有实现即可跑 |
| `#S-28` ①③④⑧ 工具条目经注册表取、`report` 同在同缺 | 场景测试（测试注册表件按 `capability.asset-registry/v2#S-25` 的答复分法写，或注册表节点的实现）：带 `run` 与 `report` ⇒ 以 `within = run{report}` 取、取到的条目进 `plan`；不带 `run` ⇒ `within = session`；带 `run` 缺 `report`、或带 `report` 不带 `run`、或报告的会话／运行／尝试任一对不上 ⇒ `invalidInput`、不写记录；名字取到「没有」⇒ `invalidInput{unknownTool}`；注册表缺席或答 `unavailable` ⇒ `unavailable`、不写记录、不打开调用；续接按这一次交来的 `tools` 与 `report` 重取；**反证**：尝试中途 reload 之后，同一 `report` 取到的仍是报告所依快照里的那一条定义 | 未开始 | 本节点；有实现即可跑（真实注册表受阻于它自己的节点建包） |
| `#S-13` 投影追到日志尾 | 性质测试：任意日志前缀上，追补后的读 = 对整份日志重算；伸缩测量：读的代价与历史长度无关 | 未开始 | 本节点；有实现即可跑（只依赖测试日志端口的不算——须对 `capability.session-log` v2 的真实提供者，最小提供者即可） |
| 被建模方式吸收的四条（`#S-22` 第 2、5 条，续接同一家，`#S-28` ④） | 场景 `#S-41`、`#S-42`，examples 第 4、8、11 节 | 未开始；同上受阻 | 本节点 |
| 跨 owner 的三条交错（[design 表 X-1～X-3](design.md#跨-owner-的共同存储对象与三条交错)） | 真并发演练 C-1（宿主停止 ‖ loop 写回复）、C-2（旧尝试写「已出门」‖ 新尝试推进并对账）、C-3（不属于运行的调用，旧实例 ‖ 新实例续接）：两副协程、同一日志、插桩让它们在提交前交叠 | 未开始；**受阻**：共同对象 L-2、L-4、L-6 所在的会话日志提供者不存在 | 本节点 ＋ 块 D；日志提供者到位后 |
| 契约 `#S-38` 传输适配十一条 | **逐条归 fork 节点 [`pi-ai-transport`](../pi-ai-transport/verification.md) 的 T-1～T-11**（S-38 第 n 条 ↔ 它的 T-n；第 10 条是 T-10a），本节点不另写一份；本节点只核 P-2 这一侧的次序——「已出门」确认之后才调 `send`（S-15 行） | 未开始；那个节点尚未建包（MRR-N4）；D-019 比较门未过（它的 PAT-N2）；第 1、2、4、5、7 条依赖的上游事实在研究层（契约 G-10） | fork 节点 ＋ 实施程 |
| 假设 H-1（effect 提前撤除） | kernel-basis probe | 未开始 | `packages/core/kernel-basis` |
| 静态检查 | `credentialLookup` 的调用点只在「发出」模块；锚点写只经调用方交来的口 | 未开始（规则未写） | 本节点 ＋ 承载仓库 `tools/ts-checks` |
| `#S-7`、`#S-19` 发起租户的来路（D-060 §八 M66） | 单元测试：`sessionTenancy`（按 `capability.session-tenancy/v2#S-8` 的答复分法写的测试件，或它的最小提供者 ＋ 测试种子）答租户 A ⇒ 取值问法收到 A；读面缺席或答 `sessionNotFound`／`unavailable` ⇒ 那一次操作 `unavailable`，取值问法**一次都没被调**；`openCall` 输入里没有租户这一项 | 未开始 | 本节点；有实现即可跑 |
| `#S-19` 离线凭据收场（D-060 §八 M47） | 场景测试：`credentialLookup`（P-1r 或按 `capability.model-profile-directory/v2#S-20` 写的测试件）答 `credentialUnavailable`（据点离线、保管方 `readReplica` 答 `absent`）⇒ 首次发出 `undispatched{credential_unavailable}`、续接 `released{cause: credential_unavailable}` | 未开始 | 本节点；有实现即可跑 |
| `#S-35` P-5 的策略对象（[D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；[design](design.md#p-5重试策略是一个可配置对象)） | **性质测试**（`retryDelay`）：结果 ∈ `[0, max]`；`jitter: none` 时 `linear`／`exponential` 对 n 单调不减；`full` ∈ `[0, d]`、`half` ∈ `[d/2, d]`、`decorrelated` ∈ `[base, max]`；同一 (策略, n, 种子) 同一结果；默认初值下 n = 1～4 依次 1000、2000、4000、4000。**单元测试**（`decideRetry`）：S-35 五条逐条，含「允许回退时每家至多一次」「不允许回退时同家一次」「没有下一家即试尽」——次数不来自配置；`Config` 不给 `retryPolicy` ⇒ 取默认初值；`kind` 不在枚举、`max < base`、`factor < 1` ⇒ 启动失败 | 未开始 | 本节点；有实现即可跑 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| `2026-09-25-formal-assets-runtimes`，任务 `model-request-runtime-v2-invocation` | `Invocation.tla`（SHA-256 `7dafcaa2…`）＋ `Invocation.cfg`：2 家、允许回退、至多 3 次发出、至多 2 次停机，五个开关全开；弱公平只用于进展性质 | 退出 0，无反例；29,521 generated、15,802 distinct、深度 21 | [run 入口](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) |
| 同一 run，任务 `model-request-runtime-v2-invocation-no-fallback` | 同上，不允许回退 | 退出 0，无反例；13,861 generated、7,420 distinct | 同上 |
| 六份否定配置（同一模型哈希） | 每份恰拧反一个开关 | 各出预期反例（退出 12） | [契约验证入口「实际执行」](../../../../spec/capabilities/model-request-runtime/verification.md#实际执行) |

**这些是契约层的有限检查**：结论只在所列常量内成立，模型只有一次调用、不含 loop、拓展件、追加口失败与传输；它们**不是本节点实现的验证**，本节点尚无实现。

## 覆盖缺口

- **没有任何实现层证据**：源码不存在。
- **契约里没有形式证据的条款**：S-9～S-13、S-16、S-18～S-21、S-24～S-29、S-32、S-34～S-37、S-49～S-51——证据形式是规范场景与性质测试，全部未开始，受阻原因见上表。
- **S-39** 只有第四条（在途发出不假装没发生）落在 `QuiescentSettled` 上，整条不绑；其余三条靠场景。
- **跨 owner 的三条交错**被模型吸收（一次调用、原子的「写下」），只能真并发演练，演练受阻于会话日志提供者。
- **排队中首 token 时限到点的判据已定**（MRR-N15）：S-21/S-18 明确对上游零请求的 `local{queued}` 收 `unrecognized`。对应真实 P-2 场景仍未运行，不能把表达闭合说成默认重试件已验证。
- **已开口的耐久写延迟**（MRR-N7）没有测量；与会话日志最小提供者 `session-log-jsonl` 的每批 `datasync`（它的 SLJ-2、verification V-13）同一次测量。

## 独立评审

2026-09-25 本节点（修复波 3 对齐之后）随 N4 批经一次独立的架构评审（只读结构核对，无运行）：应修 2、建议 2，总判可进 G5；另有 N5 批（cli）反推出的离线凭据来源。主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M47、M65、M66、M67。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| M-1（应修） | 发起租户（契约 S-7「来自会话」）在本节点没有来路：不在 `openCall` 输入、不在 inject、不在调用时取用，安全性质「不改用别的租户的凭据」的前提无落点 | 按 M66：来路是会话持有租户读面 `sessionTenancy`（与 runner 同一读面，C-13），不进 `openCall` 输入、不改契约 ① | design.md 插件表 P-2 行、操作落点 S-7 行、inject 表新增一行、装配给表凭据一行、依赖表新增一行、MRR-N10；本页证据义务新增一行 |
| M-2（应修） | 装配给表「在册状态变化之后」一行写「单进程装配由 P-1 直读同一份存储」，指向没有节点的装配 | 按 M65：改为「产品装配（cli）：协议给——中心可达时经 P-1r 读中心，据点副本经保管方；`serveBaseFaces: true` 只供尚无节点的开发装配」 | design.md 装配给表第 5 行、插件表 P-2 行、依赖表第一行 |
| M-3（建议） | `defaultRetryBackoff` 无值则不装 P-5，与 cli 清单列了 P-5 冲突 | 按 M67：P-5 的 `Config` 以候选默认 `[1000, 2000, 4000]` ms（至多三次、指数、无抖动）为默认值，cli 照常装；G-8 保持开着，只待产品负责人确认数值 | design.md「值不在本节点」一条、插件表 P-5 行、配置错误政策一段；README；本页证据义务新增一行 |
| M-4（建议） | `openCall` 的宿主句柄形状只在正文里作候选，loop 契约起草者看不到这项义务 | 按 M67：登缺口 MRR-N11，owner C-8 | design.md「一次调用是宿主上的一个 effect」第一条、MRR-N11 |
| N5 B-2（cli 批反推） | 离线调模型的凭据来源 | 按 M47：据点上 `credentialLookup` 由 P-1r 先读保管方里的本地副本；保管方缺席的本版离线如实 `undispatched{credential_unavailable}` | design.md 操作落点 S-19 行、装配给表凭据一行、MRR-N2；README；本页证据义务新增一行 |
| 反证清单 1～5 | loop 把会话级写入也做成调用方交口；H-1 不成立且子作用域代价更高；出现第二条不经 P-2 的发出通道；会话日志契约给不出 L-2／L-4；出现只要选择不要调用的消费者 | 照录为改选条件，本版都未触发（第 1 条已写在 design.md 末段） | 本表 |

## 修订波（2026-09-25 公开面）

依据：[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2、R-4、R-5，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-36、N-37。本波只改节点；契约侧（G-19、G-8、S-11）由规格侧并行落，本节点只引裁决与条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-063 R-2、R-5 | 新开「公开面」：`invokeModel`（一次发出）、`TransportAdapter` 与 pi-ai 传输 fork 作公开构件、`classifyCause`、`redact`、S-10～S-12 纯判定、`dispatchGuard`、`decideRetry`、`retryDelay`；P-2 复用 `invokeModel`；跨发出守卫、锚点、结算、SYS-LLM 列为函数层不承诺；登 MRR-N12 | design.md「公开面」、MRR-N12；README；本页函数面两行 |
| P-5 策略对象 | N-36 | `defaultRetryBackoff` 列表改为 `retryPolicy { kind, base, factor, max, jitter }`，默认初值在配置层、与原列表逐次相同；次数由 S-35 推出；自写算术配性质测试，不引库；`decorrelated` 以 (`callId`, n) 为种子（取舍表） | design.md「P-5：重试策略是一个可配置对象」、插件表 P-5 行、S-35 行、配置错误段、装卸表；本页 `#S-35` 一行 |
| G-19 闭合 | D-063 R-4；契约 G-19（`f0998468` 起已闭合） | `A` 由目录读面直接给；`legalTargets`、`selectModel`、写过切换记录的会话的 `displayList` 解阻；`openCall` 按 S-28 ④ 不读求值；`effectiveModel` 的锁判与 `dispatch` 的时限仍挡在 assembly-manifest G-4（报主线） | design.md S-9～S-12 行、inject 表、依赖表、MRR-N3；本页场景行 |
| 会话日志接线 | `capability.session-log` v2 S-6～S-10、S-13～S-19 | L-1～L-8 加「接口契约兑现条款」一列；L-4 改为「在日志条目壳上判、不另存尝试行」；共同对象第 2 条与 X-2、X-3 改写；失败值映射 | design.md 存储要求、跨 owner 一节、依赖表；MRR-N1；bindings 文件头与 S-17 条 |
| 装配清单、会话持有租户、保管方接线 | `capability.assembly-manifest` v2 S-16、G-4；`capability.session-tenancy` v2 S-8、G-2；`capability.credential-custodian` v2 | 服务键不变，改指条款；缺口改写为「接口已定、真承接者未到」；产品装配里会话持有租户恒 `sessionNotFound` 如实写出 | design.md 插件表、S-7 行、inject 表、依赖表；MRR-N2、MRR-N3、MRR-N10 |
| 传输 fork | D-063 R-5 | 基线与托管已定，MRR-N4 改为「只缺节点本身」 | design.md 实现路径、公开面、MRR-N4 |
| G-20 与「没有锁」（对齐契约侧提交 `f0998468` 与主线 2026-09-25 裁定） | 契约 S-9、S-10 第 2 步、S-26、G-20；`capability.asset-evaluation/v2#S-12` | 求值成功而没有「用哪个模型」这一项 ⇒ 没有锁、取第 1 步的名字；读不到才 `unavailable`；从没切换过的会话仍 `unavailable`（新立 MRR-N13：新会话在第一次切换之前发不出请求）；MRR-N3 收窄为锁判与时限 | design.md S-9～S-12 行、inject 表、依赖表、MRR-N3、MRR-N13；本页场景行 |
| G-8 闭合 | 契约 G-8、S-35 | 「值不在本节点」一条改为引契约已闭合的策略对象 `default_retry_backoff`（`kind`／`base`／`factor`／`max`／`jitter`）；上面独立评审 M-3 一行的「G-8 保持开着」是当时的处置，已被本行取代 | design.md「值不在本节点」 |
| 对齐契约第二轮（`47e36d14`）：G-20 口径 | 契约 S-9 末句、S-10 第 2 步、G-20 ①②；`capability.asset-evaluation/v2#S-12` | 措辞核对：求值读不到（求值失败）⇒ `unavailable`，求值成功而 `values` 无此项 ⇒ 没有锁，直接引 S-10 第 2 步；MRR-N13 删去「不当没有锁」，只留初值那一半；验收装配改为以种子写一条模型切换记录 | design.md S-9～S-12 行、MRR-N13；本页场景行 |
| 传输 fork 节点立起（主线 2026-09-25，按 `pi-ai-transport` 的 PAT-N14 ①） | `packages/model/pi-ai-transport`（candidate） | P-2 必需 inject `modelTransport`（关键差异之四，取舍表）、「有意不设的边」删去不 inject 传输；`TransportAdapter` 改 `plan`／`send`／`read` 三段，输入带 `target` 与 `ModelToolEntry[]`，名字到条目的来路登 MRR-N14；`data.messages` S-35 的翻译落在 `plan` 之内；插件表配置列删传输选择，`statusCauseTable` 初值用 `openRouterStatusCauseTable`；关键差异三改为连接池不在 P-2；装卸表与依赖表随之改；MRR-N4 改「节点已立、尚未建包、比较门未过」；S-38 十一条的证据改指那个节点的 T-1～T-11 | design.md 实现路径、公开面、插件表、inject 表、关键差异三与四、装配给表、依赖表、装卸表、MRR-N4、MRR-N14；README；本页 S-38 行 |
| 最小提供者节点互指（主线 2026-09-25） | `session-log-jsonl`、`assembly-manifest-store`、`session-tenancy-table`、`credential-custodian-local` | L-1～L-8 引导段、MRR-N1、MRR-N2、MRR-N3、MRR-N7（与 session-log-jsonl 的 SLJ-2／V-13 同一次测量）、MRR-N10 改为「真承接者未到，最小提供者节点 X 已立（candidate）」 | design.md 存储要求与缺口表；README |
| 第四轮：MRR-N4 规划拒绝 | 契约 S-28 末条、S-29 ④、G-21（它们已闭合 PAT-N9） | MRR-N4 那一句「规划拒绝没有落点」改为已由契约闭合，写明三种拒绝的收场 | design.md MRR-N4 |
| 第四轮：P-2 对传输两种事实的分类（`pi-ai-transport` 的 PAT-N18 ①） | 契约 S-18、S-21、S-36、S-38 第 2 条；带内无整数 `code` 一行是 [D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)、N-43 | 新开「传输交回的事实怎样分成因」：`local{queued}` 按传输本地行收 `unrecognized`、`aborted` 按两个时限分、撤除一律按撤除收场；`httpStatus` 只进诊断、不进 `failure.statusCode`；带内无整数 `code` ⇒ `unrecognized`。S-21 一列与这一格读法相左，登 MRR-N15 报主线 | design.md S-18 行、新一节、MRR-N15；本页一条场景义务 |
| 第四轮：`openCall` 带 `report`、工具条目经注册表取（契约 28a97642） | 契约 S-28 ①③④⑧、G-24 闭合（D-060 §八 N-43）；[D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④ | 依赖表加 `assetRegistry.lookup`（调用时取用，取舍表：inject 会让注册表每次换代连带 P-2 与全部 agent runtime 重跑）；S-7 行写取条目、`report` 核三者、续接重取；`report` 只进服务面 `openCall`，`invokeModel` 收已解析的条目、不收它；MRR-N14 改已闭合 | design.md 公开面 `TransportAdapter` 行、插件与配置表 P-2 行、S-7 行、十三个操作行、依赖表与「有意不设的边」、MRR-N14；README；本页一条场景义务 |

## 2026-09-27 既有承诺同步

主线与独立 spec-reviewer 定向核对 PAT-N14、PAT-N18、MRR-N15：MRR v2 冻结契约 SHA256 `d7d166da84aaf1f05ac6274abc0f215e57a32dadad79db19f4a7402120f799b9` 已含 D-060 N-42～N-44 的工具条目来源、无码带内错误与排队中止分类，D-066 登记继续承接其语义接受。三处为节点漏同步，按既有条款修正，无新裁决、未改冻结资源。历史评审表保留原时点；未运行源码、T/G 比较门或新的形式验证，其他实施缺口不变。

## 2026-09-27 revision6 公开函数消费实际补证

[运行边界与原始归档](../../../../record/evidence/2026-09-27-tests-model-request-runtime-boundaries/README.md)：实际direct NetworkResources和invokeModel在baseline/throw/reject/pending诊断sink下业务结果相同、无未处理rejection；两份独立制品真实TLS并有旧诊断缺陷负控。新增S-54局部绑定，不借transport整包测试推断runtime十三操作已完成。宿主service/耐久结算恢复/租户观测出口/完整换代及官方37认证仍未覆盖；本轮付费0、形式任务0，旧结果原样保留。
