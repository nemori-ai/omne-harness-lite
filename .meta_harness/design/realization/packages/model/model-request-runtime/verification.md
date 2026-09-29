## 2026-09-28 统一 service demo 有限实测

[实际证据](../../../../record/evidence/2026-09-28-tests-model-invocation-demo-service/README.md)：1b2a6a0b／产品776989fd，真实PTY同进程两轮及关闭重开第三轮通过，原批持久回复/响应和实际USD0.0005447；前一次429未知费用保留。HUB runtime628、demo85有限测试通过；不是独立QA或完整十三操作/37认证，不覆盖后续恢复留存修订。

# model-request-runtime 验证与证据

## v12 恢复时序候选义务

对应 [v12 revision 1](v12-recovery-timing-design.md)，全部待运行，新增 bindings 0。有限 Schema/TLC 证据只沿 D-104 原范围读取。

| 编号／条款 | 必须可失败的断言 | owner |
|---|---|---|
| T12-V1：MR8 S-17/S-27 | interrupted/null 当前 codec 往返保持原值；complete/truncated/failed/null 拒绝；null 不进日期比较，firstTokenAt>endedAt 仍失败 | C + core |
| T12-V2：RT9 S-54/S-75，MR8 S-39 | 普通 ModelInvocationResult/ResponseConstructionInput 与 Pending 编译及运行边界拒绝 null，实际已开始 send 的时刻保持原 string | B + C |
| T12-V3：RT9 S-17/S-36/S-54 | 两处锚点后 send 前取消分别 0 send、一响应、sentAt:null；无锚点取消零响应；恢复或锚点 now 代填负控必须失败 | B |
| T12-V4：MR8 S-11 | 非平凡调整/丢项的固定计划在零 send 与失联恢复中三项逐字保留；不是 requested，也不清空。mrr/3 key/payload/去重保持一致，旧标记不能报 absent | C |
| T12-V5：RT9 S-17/S-33 | 实际 send 时刻、部分用量/已知零/费用、多值头、实际执行身份已知后 opened ack 未知；原执行停后仍保留，全 unknown/null 替换负控失败。未形成完整 outcome 但 send 已开始的拒绝分支也保留真实时刻 | B + C |
| T12-V6：RT9 S-33 | 伪造 caller 事实、跨 session/tenant/call/dispatch/ResponseId 原 handle 拒绝；原 owner unavailable 不降成 absent；冷启动确无 owner 才 null/unknown，不宣称零费用 | C + 宿主 |
| T12-V7：RT9 S-33 | 同样只有 dispatched 的权威前缀，真实 kill 分别发生 send 前/后；重开恢复均可 null/无首 token/resumable、恢复 HTTP=0；去零 HTTP 保护负控失败 | 独立验收 + 装配 |
| T12-V8：RT9 S-17/S-33/S-69 | 原完整批含真实时刻/账/头，与恢复追加竞争；只认回原批不覆盖，不刷新 endedAt；批缺成员不假成功，每个 ResponseId 至多一完整批 | C + SL3 |
| T12-V9：RT9 S-15/S-33 | 旧 opened writer 未停、日志非权威全尾或源不可读时 unavailable 零结算/零发送；停后权威 opened 时刻与恢复 firstTokenAt 一致，null 不删除首 token | C + 装配 |
| T12-V10：RT9 S-33 | 意图优先、无 opened runtime_lost 可续接、有 opened 为终态；多 call 中途写失败整体 unavailable，再调仅补未完成行；无实际 Run 解释继续 unavailable | C |
| T12-V11：RT9 S-6/S-22/S-34/S-50/S-76 | null/非空 sentAt 对同一 interrupted 事实不改变状态；有 opened 不再发；failed 真主体仍保留原时刻；重复 reconcile/观察不新增 HTTP、重试计次或改原批 | A + C |

T12-V5/V9 须合跑一次实际停止与关闭责任的组合场景：outcome 已返回但原门回调或 writer 未 stopped 时，observedFacts() 仍 unavailable；实际停止后可重复取得稳定 owned 值。此时若耐久结算仍 unavailable，close 保留原 handle 引用与登记；最终认回后只释放一次。观察接收端有独立停止责任，不能因此阻塞业务结算。本项来自独立架构评审 N1，仍为待执行义务。

覆盖缺口 T12-G1～G4 沿正文；真实 L1/L2 责任交接和 withRun 不由这些局部测试代签收。验收需直接统计恢复 transport 的 plan/send/read 及所有 HTTP 出口均零，不只 mock 一个 send；真实重启/权威日志证据与受控时序测试分开报告。

## v11 宿主与观察端口候选义务

对应 [v11 revision 1](v11-host-observer-design.md)，全部待实施、待运行；新增 bindings 0，不把检查器通过当行为验证。

| 编号／条款 | 可失败场景与断言 | owner |
|---|---|---|
| H-V1：RT8 S-61 | stop 先于 register；register 插入后重入 stop；准备 await 期间 stop。均无漏取消、无停止后发布，失败资源归还一次；删登记临界段负控须失败 | C + 宿主 |
| H-V2：S-28/S-61 | 数据型旧 host、缺 register/signal/stopping 拒绝；已停止 runtimeStopped；登记抛错 unavailable；零 send/锚点 | B |
| H-V3：S-36/S-61 | open 已返回且短 reservation 释放后 host stop，未发 call 有 interrupted/run_cancelled 终结；在途 abandon 不产回复；重复 stop 与主动结算不重复响应，close 不自锁 | B |
| H-V4：S-61/S-64 | 真实 Cordis 撤除时 receiver/append 未停：fiber 消失原 owner 仍可定位；迟到 stopped 后再 close 才 unregister/release 一次；部分构造失败同测 | C + 装配 |
| H-V5：S-62①② | 同名 callId 的跨会话/租户 endpoint；伪造同形对象；关联未知与明确错配分别 unavailable/observer_scope_mismatch，open 可判分支零联网 | 装配 + B |
| H-V6：S-62②③ | dispatch 2 使用 dispatch 1 限定接收端：零发出；合法 dispatch 2 且 dispatch 1 receiver 未 actual stopped 时，不新建 receiver、旧端零新 target 文本，模型 send/结算继续；与 H-V11 合跑，stopped 后仅下次 dispatch 重建。旧 stream 迟到事件不能进入新队列。去目标核验负控须失败 | B |
| H-V7：S-62② | authorize 后撤权、endpoint.open 重入撤权、入队后消费前撤权；真实关联检查拒收而非接收方过滤，零错域正文 | 装配 + C |
| H-V8：S-51⑧⑨ | opened 门阻塞时 snapshot 无内容；start 与首 onAccepted 交错，p 前由原快照覆盖、p 后仅已接受增量；不重复、不发 rawHeaders、不造第二装配状态 | B |
| H-V9：S-62④⑧ | 缺任一双限/零/负/分数拒绝；中文/转义及大 snapshot 按实际 UTF-8 字节；等待+在途恰界 accepted，超界 buffer_full，不改变业务 response | C |
| H-V10：S-62④⑥⑨ | receiver 永不完成时 send/结算仍完成、队列不越双限；sync throw/completion reject 各记 consumer_failed 与计数，ModelResponse cause 不变 | C |
| H-V11：S-62⑧⑨ | completion 先完成而 stopped 待定，额度仍被占、无第二 receive；close 返回 unavailable 并保留任务，后台实际退出后 released；与 H-V6 合跑，dispatch 1 receiver 未停时合法 dispatch 2 继续 send/结算但零新增 receiver、零旧端新 target 文本；stopped 不在 dispatch 2 中途复活观察，仅下一次 dispatch 重建。晚到 offer 不复活 | C + 接收适配 |
| H-V12：S-62⑤⑦⑨/S-63 | accepted 后异步失败有单独诊断；close 丢弃逐项计数，sink 抛错隔离；重复观察不重做 send/结算，完整事实由原日志可读 | 装配 |

覆盖缺口 H-G1/H-G2：候选未采用且真实宿主/观察提供者未接线，完整服务消费者仍受阻。上述测试既要受控交错，也要实际接收资源（例如终端写入完成/关闭）和真实宿主登记组合；mock valid/stopped 不代证。原恢复缺口 H-G3 仍由主线负责，不扩大本组验证结论。

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
| R3-G6：真实验收应用与观测持有者 | S-38/S-62/S-63；真实依赖、guard、查询/权限、观测完整性 | 主线指定[apps/model-request-acceptance](../../../retired/model-request-acceptance/README.md)目前候选起草；承担provider清单/真实数据初始化、OS权限、JSONL/query/metrics、guardconfirm及V18～V23。RT-AR1实际恢复与日志owner交接另须R3-G8 |
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

## v5 G-6 脱敏政策候选证据义务

对应 [v5-redaction-design rev2](v5-redaction-design.md)，**未采用、未实现、以下实测未运行、新增绑定 0**。RT5/MR5 的语义已由 D-090 接受；本候选的 `openrouter-redaction/1` 数值、名单与描述及 R5R-AR1 修订须独立安全复评。这里列的是可失败 oracle，不把小型算法演练或已有通用片段测试当生产闭合。

使用合成且不出网的已知凭据 V；另造未作为本次凭据的 `sk-`/Bearer/Basic 形态 Q、长度 m−1/m/m+1 的 V 片段、无秘密的原文 N。结果比较器根据原输入独立计算匹配区间，不调用被测 redactor。原始证据只记用例编号、摘要和判定，不把真实凭据、配置输入或原始异常写入报告。每项都核实际公共值和可访问的产物字节，不能只检查调用了某个 mock。

| ID／条款与表面 | 正向场景（安全值及非秘密保真） | 拒绝/泄漏负向场景与故意行为负控 | owner／通过边界 |
| --- | --- | --- | --- |
| R5R-V1：RT5 S-20/S-46/S-58/S-59；MR5 S-21，**上游错误** | 真 TLS 的 HTTP 401/400/503、未知状态和 200 后带内错误，在 code/message/raw 的嵌套键、数组字符串、精确数字/布尔/null token 中放 V/片段/Q；对 V 分别为 true/false/null，命中 scalar 必须为字符串 █、未命中原值和类型保持，二次处理相等；公开 send/read/invoke 与实际写入均无命中，N、非命中精确数值和分类来源保持；带内 500 不是 HTTP 200 | 在 unknown-key、转义 JSON 字符串、原始大整数内藏哨兵；仅处理 message、只替全值、忽略形态、跳过数字、无条件透传布尔/null 各一个编译负控必须失败。JSON 原文不可解析也不能原样进入 localError；约束字段冲突按 R5R-G4 报出，不降低 oracle | transport＋runtime；覆盖指定错误来源及已执行写方，不推出全部十三操作 |
| R5R-V2：RT5 S-20/S-54/S-58；MR5 S-20～S-22，**响应头** | 各种大小写 denylist 头全部移除；普通 string/string[] 保留形状、重复、次序、空串/空数组；V/片段/Q 在非名单头键和值都遮罩。2xx reader 未进入、非2xx body 未完及取得头后取消都有同次安全 H | 原键名 `Authorization`/`AUTHORIZATION`、`set-cookie` 多值、特殊对象键、遮罩键碰撞、输入/config 后改、stop()/stopped/描述符/Symbol/原型可达图均查漏。取消 header 剥除、恢复公开 stream.headers 或 stop 返回 request、把数组 join、二次生成 H 各负控必须失败 | transport＋runtime；复用 PH-V1～V9 的真实交错；完整写入/reopen 仍另验 |
| R5R-V3：RT5 S-20；MR5 S-20/S-21，**raw.body 附件字节** | 真附件提供者的写前口只收到两遍核稳定的安全字节；V/片段/Q 横跨每个可能网络切分点、JSON escape/surrogate、SSE data 边界，读回 AttachmentRef 后仍无命中；分别 V=true/false/null 时原 token 换为引号包围的 █，非命中 scalar 原字节保留；成功输出重交无任何“已脱敏”标签也逐字节相等。逐字比较所有不在独立期望区间内的原 x 字节、空白与次序 | 固定下方 nsecret1 反例须在写前留存失败，无原文/中间候选持久字节。先写后洗、逐 chunk 替换、parse/stringify、漏原字节命中、扩至未命中反斜杠修语法、跳过第二遍、无限重复至稳定、布尔/null 直通、无效/超界便原样保存各负控必须失败。失败无伪引用、有受控事实，费用/收场和已安全 H 保持；不以附件能否合法 JSON 另设契约 oracle | 附件写方＋装配；R5R-G3 未闭，当前真实 IO 未开始，纯字节函数不代验 |
| R5R-V4：RT5 S-20/S-46/S-54/S-63；MR5 S-21，**localError** | 本地适配抛错、连接失败、解析故障、门失败，在文字里放 V/片段/Q；public localError 和实际完整响应安全，N 原样。默认诊断只含阶段/类目/计数，正常 sink 与 throw/reject/pending sink 的业务结果一致 | Error.message/cause/stack、自定义属性及异步 rejection 放哨兵；不允许 stringify 整个错误对象旁路。编译负控去掉本地处理或将 error/rawHeaders 放 detail 后，公共值/日志扫描必须失败；sink 自身坏时独立退化可查，不能假成功 | runtime＋transport＋装配诊断 owner；不把敏感调试授权当默认旁路 |
| R5R-V5：RT5 S-20/S-60/G-6，**内核与配置** | 完整基线和每种受支持加强变体；短于 m 的全值（含 true/false/null）、所有长度 m 窗口、重叠区间、ASCII大小写、空串/空容器、键碰撞均按独立 oracle；text/JSON/header 验值幂等，byte 区分成功域幂等及明确失败域、不别名；两份包外真实制品及双语 literal 编译执行 | 缺三项之一、空/删基线名单、重复/未知/非法描述、m=0/65/非整数、生产m>8、访问器/循环配置、反射陷阱抛错均具名构造拒绝、零网络且错误不含输入；不宣称识别所有 proxy。长前缀、64描述、128头名和既有内容界边界/越界量测含字节两遍上界；把扫描换无界 regex 或允许配置夹 callback 的负控失败 | 纯构件 owner；资源复杂度与环境实测如实报告，不声称未测性能界 |
| R5R-V6：RT5 S-54/S-58/S-63；MR5 S-20/S-21，**同次联合交接** | 同一真实凭据、完整 policy 快照，经 TLS→send→invoke→安全响应批→真实 append/reopen；头事实原值保留，body/error 规则一致。记录配置非秘密全值及精确代码版本，assert 凭据只出现在受控上游请求预期位置 | 制造 transport/runtime 两端配置不同、运行中改外部 config、调用 A 后更新到 B 再结束 A；有缺口不得通过生产装配门。负控仅 runtime 事后脱敏仍须由 send 公共面扫描抓到；追加后才清洗也必须失败 | 两 provider＋全部实际写方＋装配；只有真正执行的链可签收 |
| R5R-V7：RT5 S-20/S-36/S-53/S-56/S-64，**停止和失败** | 在 header 到达前后、错误体/解析/附件处理未完、配置换代时分别取消/关闭；零次和一次send计数准确，socket/reader/回调实际终止后才释放原 lease/秘密引用，已安全 H 不因停止消失 | 构造无效 policy 不启动；处理函数故障不得 raw fallback；旧闭包提前释放、close 只发 abort 就完成、等待坏诊断才能停各负控失败。GC 不当作资源完成信号；非成功留存不伪造完整 body | 原资源 owner＋装配；实际句柄与FD观测，不仅断言 Promise 已完成 |

**R5R-AR1 的独立期望值**：已知凭据分别取 `true`/`false`/`null`，输入 raw 值 `[true,false,null,"true","false","null",{"flag":true}]`；命中的非字符串 scalar 为字符串 █、其他非字符串逐值保留，字符串按实际区间处理，再次处理值完全相等。原始体使用相同内容但故意带不同空白；期望字节由固定 token span 替换拼出，不能调用被测 mapper/stringifier 生成 oracle。S-46 的 m 不得使短于 m 的全凭据免扫。

**R5R-V3 转义反例的独立期望值**：V=`nsecret1`、m=8，x 的十六进制为 `22 5c 6e 73 65 63 72 65 74 31 22`；raw 命中恰 `[2,10)`，解码值换行接 `secret1` 不命中。最小候选 y=`22 5c e2 96 88 22` 在第二遍不能完成转义映射，故预期是留存未成且写入调用数为 0，不能只测“输出没有 V”。对照 x=`22 5c 5c 6e 73 65 63 72 65 74 31 22`（两个反斜杠）可得到 y=`22 5c 5c e2 96 88 22`，两遍稳定且未命中字节相同，应成功；把所有转义输入直接丢弃也要被这个正向对照检出。两项分别在每个 chunk 边界重放；不要求附件普遍合法 JSON，只按本提供者明确的映射成功/失败规则和字节事实验收。

**安全评审的可否决清单**：对 R5R-G1 独立判断 min=8 的短片段风险、名单与形态覆盖/误剥、编码/跨记录边界、区间并集和键碰撞、全部 scalar、字节两遍/成功失败域幂等、处理异常的收场、真实公开对象可达性、附件写前边界及两端配置同次一致。可以用例如已准入 ASCII 凭据 `503` 与必须保留的 HTTP `failure.statusCode=503`，或已知片段与精确身份字段重合，要求原 owner 澄清 RT5 S-20/S-46 与 MR5 S-21 的值域边界（R5R-G4）；不能自行收紧凭据格式、改状态码或说扫描通过就没有冲突。rev2 对 R5R-AR1 的处置待独立复评，不自称已闭合。

**覆盖缺口**：R5R-G1 尚未安全评审/采用；R5R-G2 尚无两端完整实现；R5R-G3 缺真实附件写方/留存资源政策；R5R-G4 是必需事实冲突/无法安全处理时的具名门。旧 bindings 全保留其原版本前提；本次不绑定任何未执行测试、形式任务或由表示方式天然吸收的性质。设计结构检查不关闭上述门。

## 2026-09-28 G6纯构件实施与有限验证

[D093实施事件](../../../../record/decisions/model-credential-policy-adoption/decision.md#2026-09-28-纯构件有限实施签收)及[完整实际原档](../../../../record/evidence/2026-09-28-tests-model-credential-redaction-pure/README.md)记录源码f6a5d1f2／HUB7f580351、独立GI1–7有限Pass及当前HUB4a268c91专用字节与组合回归。限定签收显式配置／纯text/header/raw-error JSON政策构件；新增规范绑定0，不签收raw.body／附件、生产H和完整S20、G4必需事实、十三操作或37模型认证。历史“源码尚待”属于2026-09-27的状态。

## U16 输入观察校准实施候选

对应 [v16 revision 1](v16-usage-calibration-design.md)，MR9／RT10 与本映射均 candidate；**新增 bindings 0，以下全部待执行**。本节不修改旧证据的版本与前提，有限 Schema/TLC 只按原记录范围读取。

| ID／责任 | 必须实际运行的正向与反向 oracle | owner／证据边界 |
|---|---|---|
| U16-V1：MR9 S-41～S-45；RT10 S-79 | 当前根声明与完整 Schema 闭包编译；六共享值没有同义定义；PlanInput／StreamEnd／结果缺新字段编译失败；core 自有拷贝后修改外部深层值不能改结果。current codec 拒绝缺校准旧 shape，旧目录字节不变，无旧 reader/兼容重载；精确大整数及多值头原形回归 | core＋runtime；独立包制品与实际 codec，不以类型断言代运行边界 |
| U16-V2：S-54/S-59；MR9 S-42 | 受控真实 TLS 分别返回完整互斥分项、仅准确总 prompt、缓存细项未知、分项大于 total、response-cache 零、真实完整零、仅账单 total；独立比较 reader final→invoke→Pending→日志原值。带缓存的 total 不再加缓存；原 usage 冲突值不擦掉；无实际 model/provider 不从请求填值 | transport 解析＋runtime 交接；断掉 observedInput final、私读 R、把 total 丢掉的编译负控必须失败 |
| U16-V3：S-74/S-77～S-79 | 显式独立函数 full 首次与合法准确观察后 marginal；非加性边界、负修正、零/大整数、exact/upperBound/estimated 精度格与 margin 恰一次；φ 或 δ 不可判全量，full 不可判 input_size_unavailable；超限零新锚/HTTP/响应/终结 | transport＋runtime；O/reasoning 双加、按块分摊 O、累计上一轮预测误差的负控失败；不是所有模型的准确性证据 |
| U16-V4：S-57/S-58/S-80 | 规划与 TLS 收到 body 逐字对应；前缀文本、system、tools、模态、角色、顺序、模板／缓存标记变化检测；inputEnvelope 全覆盖。变 binding、tokenizer、meter、projection、replay、transform 或 margin 后重 plan；固定 lease 的旧调用不换组件；错误兼容布尔/伪 planned 不放行 | runtime＋transport；非输入差异也按提供者真实投影核，不自行假设全部参数 token-neutral |
| U16-V5：S-54/S-59/S-36 | 先读到合法观察，再分别解析错、带内错、装配拒绝、abort、断流；已知事实保留且 G partial/不可判独立，未知不补零。上游统计未来永不返回时取消仍沿原政策停止；已停止读取/连接/监听再释放，延迟 stopped 时 owner 留存。非合作 reader 直接 throw 具名本地违例，不谎称 missing_usage | transport reader＋runtime owner；generator.return 跳过 final、for-await 忽略终态、等待自然 EOF、提前 release 各负控失败 |
| U16-V6：S-77/S-80/S-82 | 同租户/会话真实选入祖先、相同 seq 不同日志、跨 session、不同分支、乱序到达、更新但非祖先、缺 usage 中间多轮、失败/中断准确 I。选最新合法准确观察，缺 usage 不推进，所有未覆盖回合仍计入；无来源 full，必要原调用事实不可读 unavailable，未授权沿原失败不降级 full | runtime 历史解释＋真实宿主；不能只喂 trusted bool fixture。noRun 真 JSONL 线性链与独立受控分支组合分开记覆盖，后者不证明真实 Run |
| U16-V7：MR9 S-43；S-77/S-79 | 原组所有块逐项 digest，重复保持；replaySelection 删选/重排/重复目标/错误索引/改 visibility/opaque/工具块均核实际最终 span；未映射实际新增不能漏计。requestInput unavailable 但 outputGroup known 仍可保留；G partial 不抹已知 I；结果剪裁后只能对真正保留块形成原批 | transport projectOutput＋runtime；仅摘要数组长度检查、盲信 caller indices、HTTP 成功冒充 complete 各负控失败 |
| U16-V8：MR9 S-45；S-17/S-49/S-81 | 实际 JSONL 原 `[M,R]` 和无 reply 的 R 完整保存 InputCalibration；读回/外部 settleReply/readAttempts 同值；append 已写回执丢失、未知读旧尾、同批认回、异值稳定键竞争、原写者仍运行。unknown 不成为后继来源，owner/lease 不释放，零第二次计量写入 | runtime＋JSONL owner；持久条目/尾/keys/fence 和真实 task 状态必须有证据，不只 mock receipt |
| U16-V9：S-33/S-36/S-81 | 真子进程退出后重开：新 meter 故意不可用/版本不同、无凭据/无模型贡献，仍认回或重送原完整批；HTTP/meter/projectOutput 调用数零，历史字节保持。旧写者未真实停时仍 unavailable/unknown，后次 THIS 零写不能擦旧 unknown。MR8 interrupted sentAt:null 不推断零费用/可重试 | 冷宿主＋runtime＋JSONL；沿 v14 原权限/nonce/物理停止验收，新增字段不能迫使恢复先准备模型 |
| U16-V10：S-79/S-82/S-83 | 对约百万实际 tokenizer tokens 的固定合成上下文，记录 tokenizer 输入范围/调用数、序列化/摘要/φ/δ/总 wall/CPU/峰值内存、冷/暖原始样本与环境，前后同输入和同 margin 对照。稳定 P、有效 I/θ/φ/δ 的 marginal：P tokenize 次数严格 0，G/N 计量覆盖完整；不能永远 full 假过。明确每模型/缓存政策的失败与 fallback 比例，不将字节数冒充 token 数 | runtime＋transport 性能 owner；参考 U0 基准方法但重跑实际实现，无任意速度阈值或全模型达成声明。四条 Anthropic last_message 缓存搬移必须单列是否每轮 full；未闭仍为性能交付缺口 |
| U16-V11：S-63/S-79 | 同一次请求在 public measurement、工程 log/trace、查询/export 中 mode/原因/basis/precision/贡献一致；真实 usage/cost 与预测值分栏且账单仅用实际来源；diagnostic sink throw/reject/pending 不改变业务。凭据/原文/opaque 哨兵不出诊断，原脱敏与头保真回归 | runtime collector＋example；工程日志不是会话日志，无业务记录被写回，真实安全文件/关闭边界沿 v15 |
| U16-V12：公开消费与最小 demo | 两个仓库外实际制品上逐字编译执行 runtime EN/ZH README 的 none/full 与显式观察例；公开纯调用无 session/log/Cordis 和隐藏 IO。demo 命令行多轮流式、同会话模型切换完整历史含图片/工具块、重启后原日志读取、未知账单与累计统计、观测查询/export；读不到校准不可静默重置数据目录 | 包 owner＋example owner；受控 TLS 与实际模型付费证据分别报告，真实 G37 认证不由 fixture 替代，不复建 acceptance app |

**缺口与归属**：U16-G1 接受/采用归主线；G2 reader 与三包同步交接归各实现 owner；G3 真实来源与分支解释归原历史/宿主，不建立新上下文真值服务；G4 同批与冷恢复归 runtime/JSONL/宿主；G5 各模型计量证据与百万性能归 transport/runtime，G-36 硬 fit 仍由原产品/上下文 owner 处理。设计链接/格式检查不关闭这些缺口；只有真实运行且能被行为负控击穿的证据才可另行登记 binding。

## R7 当前格式与服务施工义务

2026-09-28：[v7-current-design rev1](v7-current-design.md) 为候选增量，未接受，新增 bindings 0。本节全部为**待执行**；现有纯函数、RT6 有限模型和旧 paid demo 不证明当前十三操作通过。

| 义务 | 必须实际发生的反例与观察 | owner/未覆盖 |
|---|---|---|
| R7-V1 | 当前 MP5→MS6→MR7/LC6 全字段保真；旧 codec 导出消失，旧输入拒绝且旧用户目录字节不变；无 required-cap 回填；current unknown 任务未被遗弃 | root/core/codec/各消费者；R7-G1 采用后运行 |
| R7-V2 | 上限恰等于/超出、unknown upstream、有依据上界、全 tools/system/模态/包装；调用后 mutation 与伪 planned；每个拒绝断言零新 anchor/HTTP/response/ending，成功 send 与计量 bytes 相同 | B/transport；缺真实 meter 的模型不得列交付 |
| R7-V3 | MR7 Pending 全事实、无 disposition/late；服务 S-49 显式拒 persisted；外部 persisted 原 [M,R] 同批；重复同处置认回、异处置 alreadyEnded、回执丢失保留 owner | B/C/真实外部调用者，不能只测 responseFor 工厂 |
| R7-V4 | 同 [A,A] 发出分别配 0/1 条默认 retry 得不同结果；已给未发计数、自定义件保留但不算默认次数、跨调用/同时间戳不误归/不去重 | A/runner5/P-5；真实 writer/reader，不拿输入 fixture 作来源证明 |
| R7-V5 | failed 与账已提交而结论源暂不可读，dispatch/readAttempts unavailable；恢复后 S-34 同前缀取回完整主体，计数/HTTP/日志条数不因重取变化；并发新结论后再次读更新，guard 仍现算 | A/B/runner5，R7-G3 |
| R7-V6 | 同调用双 dispatch 至多一个新锚点；流式等待时 interrupt 能先落意图再发信号；opened unknown、append completion 先于真实 stopped、后次 THIS 零写不消旧 unknown | root/B/C/真实日志；mock abort 不证停止 |
| R7-V7 | withRun 读尾 t 后新 attempt/Run 终结竞争导致旧尾零写；反序原批不追改。noRun 不调用 G28、无 late；G28 缺席不阻选择与 noRun 正常链 | C/原 loop/宿主；真实 Run 解释缺口 R7-G4 |
| R7-V8 | 十三方法精确失败次序/非法跨 session/服务重载关闭/缺依赖；root exports、独立包使用、EN/ZH 示例；各组共享一个容器、codec 与结算实现 | root 集成；R7-G5。逐操作实际结果才增加完成计数 |

覆盖缺口：R7-G1～G5 逐条沿 design；未建立新的正式产品装配节点。examples 的开发宿主可提供本次真实验证环境，但只有它实际承接的入口身份、时钟、全读权限、恢复开闸和停止责任可以计入证据。`bindings.yaml` 不增加待执行场景；仍只绑定已经存在且会失败的原有证据。
