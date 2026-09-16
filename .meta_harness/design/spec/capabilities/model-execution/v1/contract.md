# 模型选择、请求与上下文装配 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.model-execution, 1)`，状态为 candidate、
`acceptance:null`。正文从 legacy current `capability.model-execution@2` 重基，保留
MC-01～MC-14；D-008/D-015 只作来源与旧接受事实，不自动接受新坐标。

本能力拥有模型档案、请求 manifest、OpenRouter 路由、attempt 身份/状态/结算、上下文装配
和会话模型切换。Session/Run/Driver/Tools 拥有工作切点、执行权、调用与等待；预算能力拥有
费用暴露与结算；媒体能力拥有字节、引用、保留和投递；message-stream 拥有公开帧信封、游标
和 `toPublic`。MC-12～MC-14 对 message-stream 的精确 MS-20～MS-24 交接等待 E 给出新基线
坐标与哈希，在此之前只完成 M 内部一致性，不能释放或冻结。

规范依赖：`data.core-work@1`、`composition.core-work-coordination@1`、
`capability.durable-records@1`、`capability.session@1`、`capability.run@1`、
`capability.run-driver@1`、`capability.tools@1`、`capability.media-content@1`、
`capability.tenant-governance@1` 与 `capability.budget-accounting@1` 的精确消费见候选 catalog。
动作授权只沿 L 已固定的共同门见证消费，G 尚未向 M 发布 AU 接口；message-stream 依赖保持具名阻断。

## 目录、档案与当前能力

**MC-01**：模型档案有稳定 profileId、归属 scope、official/customized 来源、
revision、OpenRouter modelId、路由约束和 enabled/withdrawn 状态。official
原档公开只读；customized 由有权主体创建／条件更新／撤回。撤回保留历史
引用和原因，不复用 ID。恢复原档须有权显式 relist，产生新修订，不能复活
旧运行绑定。档案本身不是调用授权、计量事实或已安装 adapter。

能力事实绑定具体 OpenRouter model/provider 路由、观察来源/时间/修订、
输入/输出模态与格式、工具/参数支持、上下文及输出限制，值区分 supported、
unsupported、unknown。官方目录、提供者实测和用户档案声明分别保存来源，
用户自报不能覆盖已知不支持；缺席不等于已知支持。价格事实另有版本及
计量单位，不从能力等级推导模态。当前可用性不等同于长期目录条目存在。

**MC-02**：listCandidates 返回获准可见档案和 can_select/blocked/unknown
理由，不隐去可披露的不兼容项。资格依据包含当前用户/tenant/definition、
权益、部署与环境、事实支持及预算立场。模型等级只参与相关能力策略，
不能替代逐项模态/工具条件。事实来源断连或索引落后具名返回，不能把
旧目录当永久许可，不能私自换模型/出口完成请求。

## 一次请求与提供者绑定

**MC-03**：prepare 取得不可变 manifest：requestId、Step/辅助工作、Run
固定模型或辅助模型明确选择、profile revision、adapter generation、路由
约束、内容块及历史切点、工具映射、必需 skill、输出要求、估算/窗口依据。
准备不发网；材料/权限变化在准入时重检。发送前记录实际请求和费用 attempt，
通过当前授权、能力、预算与运行 epoch 的共同门。actualModel/provider
取供应方实际响应／核实，不用 Session 当前选择改写历史。

**MC-04**：请求状态 prepared → admitted → dispatched → closing → settled，settled
区分 success/partial/failed/cancelled/unknown/abandoned；未发出与可能已发出分别表达。
adapter 把系统内容投影到按模态明确选定的 OpenRouter endpoint，生成/解析不使用
任意用户 baseURL 或直连凭据。标题、压缩、后台推理、重试及多模态生成
都消费此能力；没有 Session 的系统工作仍有 WorkRef 和租户／费用归因。

本地模型执行 owner 对 dispatch、interrupt 与强停使用
[TL-08](../../tools/v1/contract.md) 同等的 attempt 接纳账本和迟到启动墓碑，
在发网之前检查有效 epoch 与取消状态。interrupt 与强停在同一账本上与 start
排序，不各自维护一套停止记录：墓碑生效后该 attempt 不再发网，迟到的启动在
产生任何外部效果之前被拒。停止发生在已准入但尚未 dispatch 的间隙时，不能凭
已耐久许可继续发网；已发网的供应方工作按 MC-06 保留未知／费用，隔离本地结果
不声称撤回供应方已发生的效果。被 interrupt 结算的 attempt 记 `cancelled`，
已流出的前缀按 MC-06 保留并明确可见，不作为可续写的草稿。持久 `attemptId` 标识一次实际外部
请求；普通重试必须新建 attempt。`attemptEpoch` 是同一 attempt 的执行权 fencing epoch：e2 接管前
先耐久 fence e1，e2 的 terminal disposition 支配该 attempt 所有不大于 e2 的旧草稿。旧 provider 可
排空 A，且新 provider 可开始身份独立的 B；fence 后旧 A/e1 不得发布，新 owner 未 inspect 证明安全
不得重复 dispatch A。

`abandoned` 只在 M 或其消费的 Run/CC 权威 fence/closure 证明该 attempt 的有效结果不再可接纳时成立，
并与其它 outcome 一样先写 MC-06 durable disposition。provider/listener 失联、active snapshot 缺席或
提交结果未知都不是该证明；迟到 usage/provider evidence 只追加费用与审计观察。

**MC-05**：请求经 OpenRouter 的路由必须符合精确允许的 provider 集合和
参数支持。未授权模型 fallback、自动转写、工具模拟或静默模态丢弃禁止；
明确允许同 modelId 的供应方 fallback 时，所有候选须满足同一必需参数、
模态及预算条件，并记录实际 provider。HTTP redirect 不得转移凭据或模型
请求到非允许出口。供给动态变化不能改写已绑定请求；旧 adapter 排空
保留必要依赖，未开始旧请求可明确失效后重新 prepare。

本地受控工具只由本项目调用门执行；不向请求暗加 OpenRouter server tools、
远端搜索或其他可产生额外动作/收费的自动插件。确需使用时，须有独立的
授权、费用和效果契约，不能因供应方称为“工具”便绕开本项目系统审批。
原生 PDF 投送明确选择 native 路径并验证目标支持；供应方默认 OCR/解析
不能冒充原生消费，获准转换才生成有来源的派生内容与相应费用。

**MC-06**：每次实际请求 attempt 有独立 ID 和计费记录。传输确认未发出
且政策允许时可发起新 attempt；可能发出后超时、断连或 abort，记录
unknown/partial，并在有供应方 ID 时查询原请求。重试须重新过当前门并
保留原尝试，不能把缺失 usage 当免费，不能承诺 OpenRouter 去重外部
请求或恰好一次生成。停止本地流不证明供应方停止或费用撤销；迟到计量
仍入原账。流中途错误不是正常 finish，部分内容明确可见；内容过滤等供应方
终止原因记为错误结局并在失败诊断里保留供应方给出的原始终止原因，不记成
正常完成。

attempt 的结算记录必带：`purpose ∈ {reply, title, compression, auxiliary}`、
装配后的内容块序列、按 [CD v1](../../../data/core-work/v1/contract.md) 形状记录的
缺失块清单、实际送达模态、actualModel 与 provider、usage 与 finish，以及该 attempt
的公开紧凑流记录（连续同块增量合并后的形态，足以重建增量过程与首个增量时间）。
`purpose` 在 attempt 开始时即确定并随其瞬态帧发布（MC-12），不在结算时补定；
消费者按 `purpose` 分流，只有 `reply` 是会话的正式回复。缺失清单的 `reason` 除
CD v1 固定的 `truncated` 外由本能力定义，至少区分未耐久的媒体与被装配器丢弃的
调用；`failed` 与 `unknown` 没有内容，仍保留 usage 与状态。实际送达模态是“模型
这次实际收到了什么”的权威记录，与投递意图（CD v1 的 `delivery`）分开，供
[PF-009.C4](../../../../requirements/product/PF-009-multimodal-input-attachments-and-commands/requirements.md#已确认要求)
的读面消费。回放所需的私有材料另存（MC-14），不进结算记录的公开部分。

每个 attempt 的 ledger 保存 immutable observations 和 revisioned current disposition；本能力是两者的
唯一写 owner。更新操作 `reviseDisposition(attemptId, attemptEpoch, expectedRevision, evidenceId)` 在 attempt
内以 revision 全序/CAS：同一提交写不可变 observation、检查 expectedRevision，并把 current pointer
推进到唯一后继；同一 evidenceId 重试认回原 revision，不允许并列 current。disposition 是以下封闭
tagged union，共同字段为
`{attemptId, attemptEpoch, revision, purpose, outcome, historyAnchor, missing,
actualResponseIdentity?, usage, finish}`：`with_message` 必带
`{contentDisposition:settled_with_message,contentRef}`；`without_message` 必带
`{contentDisposition:settled_without_message}`；`abandoned` 必带
`{outcome:abandoned,contentDisposition:settled_without_message,authorityRef}`。其它分支不得带
`authorityRef`，unknown 只能是 without_message。`historyAnchor` 是
`session{position: commitPosition} | work{workRef, basisRevision}`：有 Session 的请求使用主体无关 durable
position，无 Session 的系统工作使用稳定 WorkRef/basis revision；它不含 principal visibility 或客户端
cursor。`contentDisposition` 不能让消费者从空正文推断。所有 non-reply purpose 及
`failed/unknown/abandoned` 即使无助手正文也必须耐久记录；`partial/cancelled` 是否有耐久前缀由记录明确。
实际响应身份只能来自响应或核实；started 的 route binding 不能冒充 actual provider/model。

进入 disposition 提交前，M ledger 先耐久记录 immutable
`attempt.closing.pending{attemptId,attemptEpoch,operationId,historyAnchor}`；同一 operation 的 disposition receipt
未知时，由这条 observation fold 为 `closing/outcome_unresolved` 并 lookup/inspect 原 operation，不能把 timeout、
无 receipt 或读不到记录当作未提交。该状态不是 current disposition revision，也不是业务 outcome：
SessionProjection 只从该耐久 observation 在同一 asOf fold 出
`in_progress{pendingReason: outcome_unresolved}`，不能从内存 active snapshot 合成；客户端保留草稿。只有 lookup 认回原
disposition 提交，或 owner 取得足以明确业务 outcome 为 `unknown` 的新 observation 后经 CAS 提交 current
revision，attempt 才进入耐久终态。durable `unknown` 必为
`contentDisposition=settled_without_message`，首次投影即执行 semantic close；它可由后续 observation 单调细化为
success/partial/failed/cancelled，但 revision 提交必须在同一原子门核对：该 Step 尚无另一 accepted success、
attemptEpoch 仍有结果接纳权、Run epoch/fence 与 RN-05 不可清除终止意图仍允许该结果。门通过才可产生
`settled_with_message` 或 tool batch；门失败只追加 late evidence、usage/cost 与隔离审计 observation，
已有 current disposition 时保持原 revision；尚无 current 时 pointer 仍为空。CAS 返回
`rejected(late_business_result)`，不存在“不接纳的 disposition”后继，也不生成有效 Message、
`tools.call.proposed` 或调用批。pointer 为空时，owner 只能用独立且有权的 fence/closure observation
另行提交 `abandoned`；原 current 已是 unknown/其它 terminal 时则保持它。
旧 observation 不改写，消费者更新同一 attempt 的呈现但不重复 semantic close；
`outcome_unresolved` 后续被认回为 durable unknown 时才发生这一次 close。

`abandoned` 必须引用同 attemptEpoch 的权威 execution fence/Run closure；它封闭 RD-08 的全部业务出边：
不得成为 Step 的 success、有效 Message、工具提议或新 attempt 的内容来源。迟到 provider output 只进审计、
费用与隔离证据，不得把 abandoned 细化为可接纳 success/partial。
disposition 与 Session history 共用 retention/归档/删除/授权；保留期外不建立 M/E 第二历史。

## 上下文装配

**MC-07**：装配在一个明确历史切点与贡献集合 revision 上计算，包含系统
指引、当前组织流程、有效历史、固定输入批次、选择的工具结果/帧投影、
系统提醒块、原生媒体和必需 skill。贡献声明作用域、排序、来源和可见条件，同 scope
命名冲突拒绝；稳定排序不依赖插件随机装载顺序。动态变量在准备时求值，
秘密引用只在受限投送边界取值，不把凭据写入提示或日志。

必需 skill 核心正文与可调用命令集合一致，正文不足则缩小集合或拒绝。
压缩保留原始内容、已消费输入边界、工具关联和必需内容；未取批输入、
已撤回草稿和来自未授权会话的内容不能通过摘要或投影混入请求。
准备期间历史/贡献变化可重算一次新 manifest 或返回 conflict；发出后
manifest 不变，内容更新在下一请求边界生效，不宣称任意在途热改。

[CD v1](../../../data/core-work/v1/contract.md) 的 `system_reminder` 块按目标
模型族投影：Anthropic 类模型投影为带系统提醒框架的 user message，OpenAI 类
模型投影为 developer message；同一耐久块在两族下只有这两种承载，装配不改写
块的正文、`reminderKind` 与引用，也不把它转成用户输入或助手内容。投影选择器
只能选择哪些已耐久内容进入本次请求，不能改写它们；被排除的内容在耐久记录里
保持不变，排除本身在结算记录里可查。

## 会话模型切换

**MC-08**：switchModel 有稳定 operationId、目标 profile/model、观察到的
Session/selection revision、历史切点、压缩尝试状态及结果；有权用户
改变本 Session 的未来选择，不修改用户偏好或定义。若 Run 仍活动，
将切换意图登记为 pending_next_run，在当前 Run 安全边界后完成实际
检查和提交；pending 不是已经生效。期间可显式取代请求，旧意图不能
随后覆盖新选择。Run 准入与选择生效共享屏障，避免半次切换。

**MC-09**：实际切换按当前 durable Session 模态集合和 target 实际能力
检查，已知不支持与 unknown 分别拒绝。压缩/缓存丢失不能删除模态；
派生 Session 只消费派生切点已有事实，不能混入母会话后来媒体。
模态历史不可信时阻塞；不得为使切换成功静默删图、转写或换目标。

**MC-10**：通过模态门后，按目标已知窗口、配置比例和输出预留检查当前
有效上下文。超限仅为该切换发起一次具名 compression 工作，所有请求
仍走当前授权/预算和 OpenRouter；压缩所用模型明确记录，不能让目标
模型或旧模型的选择被隐式猜定。默认使用切换前合法模型，无法使用时
返回 compression_unavailable，不偷偷更换。压缩保存 summary 及原切点
引用，原历史和模态集合保持。

一次压缩的发起/可能发出/结果状态耐久记录；未知时核实原 attempt，
不借 switch 重试无限压缩。成功摘要即使随后切换失败仍保留；复核后
仍超限或压缩失败则拒绝，原模型选择不变。窗口未知记录诊断但不当成
已知超限拒绝；仍检查其他已知容量限制。切换提交前再核对权限、版本
和历史变化，无法沿原切点有效完成则 conflict，不重复压缩掩盖竞争。

**MC-11**：下一 Run 取得已经生效的精确选择，重新计算模型工具能力及
部署/权限交集。旧后台工具保持原绑定/归属，不因切模型终止或重新调用。
回复中的 actualModel、来源 request/attempt 及费用独立保存；候选列表、
设置更新成功和实际模型执行成功分别报告。

## attempt 的实时形态

**MC-12**：本能力的 active publisher 为每个 attempt 发布三种瞬态 hint：
`model.attempt.started`、`model.attempt.chunk`、`model.attempt.ended`。它们不是 outcome 事实；MC-06
current disposition 才是恢复权威。每帧统一携带
`{attemptId, attemptEpoch, runEpoch?, sourceGeneration, transformVersion, pub}`；`started` 另带
`{purpose,request,routeBinding,historyAnchor}`，`chunk` 另带 attemptEpoch-local 稠密 `index`。
`ended` 只带 `dispositionRef{attemptId,attemptEpoch,revision,commitPosition}`，且仅在该 revision 取得
DR-02 receipt 后发布；客户端从 durable disposition 读取 outcome，不能从 ended 自造 abandoned。

三种 hint 都带 `pub{source,generation,n}`：source 是 tenant/Session 内 publisher 的稳定逻辑身份，
generation 在实例重启/换代时变化，n 只在同 sourceId/sourceGeneration/Session 严格递增。一个 sourceGeneration
绑定唯一 transformVersion。正常公开转换换代必须在旧 listener callback API 的同一有序队列发布唯一
`source.generation.changed{sourceId,fromGeneration,toGeneration,newTransformVersion,transitionId,
pub:{source,generation:fromGeneration,n}}`，随后封旧 generation 并以新 generation 重建 publisher；marker
是旧代最后一个 publication，同 transitionId 重试只认回，不得在其后发布旧代 hint。崩溃无法发布 marker
时，listener closure/新 snapshot generation mismatch 触发 source-unavailable/resubscribe，不伪造 marker。
`source.generation.changed` 是 publisher protocol control，不是第四种 attempt hint，也不是 outcome 事实；E
把它唯一对应映射为 MS-04 的 `stream.source-generation-changed` 客户端控制帧。publisher 的 listener
registration 返回 effective cut；返回后每次 publication 必须在 publish 完成前按 n 可靠、有序地交给
每个已登记 callback 的独立有界入口。某一 callback 失败/溢出只撤该 listener，由其订阅 resubscribe；
publish 不等待慢订阅，其他 listener 与 source 继续。只有 publisher generation 本身终止或不可读才是
source failure。该保证只覆盖进程内 active handoff；崩溃后依靠新 generation/resubscribe，不承诺 frame replay。pub 不与 chunk index、
commit position、visibilityVersion、subscriber generation 或客户端 cursor 比较。

**MC-13**：本能力提供 `activePublicState(session) → {source,generation,transformVersion,items,cut}`，
只列当前 active attempt。每个 item 是 compact public state：
`{attemptId,attemptEpoch,runEpoch?,started:{purpose,request,routeBinding,historyAnchor},coveredThrough,state}`。
`coveredThrough` 恰是下一条尚未折叠的公开 chunk index；state 是把 MC-14 同版本 public transform
应用于 `[0,coveredThrough)` 后的折叠结果，含恢复公开草稿所需的块/阶段/可公开 usage 状态。它不是
旧 frame 数组，消费者不得要求 state 元素与历史 chunk 逐项相等。

snapshot 与 publication 在 sourceId/sourceGeneration 内同一互斥下完成，cut 是该 sourceId/sourceGeneration 的 pub 水位，item state
与 cut 对同一前缀一致。snapshot 不含 terminal attempt，也不证明 outcome；旧草稿由 MC-06 durable
disposition收口。读面按当前主体读权裁剪；visibilityVersion 由 Session read face 拥有，不进入 cut。
baseline 对每个 item 覆盖一条 started 语义及 `[0,coveredThrough)` 的 chunk fold；它不覆盖 ended。
state schema 固定 reducerVersion/transformVersion、公开 block 顺序、当前 open block、文本/推理前缀、
tool-call public markers、usage/finish 摘要，使消费者能判定增量 index 是否已覆盖；无法解析时必须 resubscribe，
不得猜 fold 等价。

**MC-14**：私有增量序列由本能力耐久保存并只经私有读面回传模型。公开投影 `toPublic` 由 MS-21
定义；MC-06 公开紧凑结果、MC-13 compact state 与实时 chunk 都由带版本的同一 `toPublic`/fold 产生，
没有第二条私有载荷出口。transformVersion 固定增量与 state fold 语义；同一私有前缀在同版本下得到
相同 public state，前缀增长只以 coveredThrough 表达。下一次模型请求从私有读面恢复，不从公开 state、
hint 或 disposition 反推。

## Legacy v2 相对 legacy v1 的来源差异

来源以提案与裁决编号给出；正式契约正文不引用提案，各编号的正文与链接从本能力入口
`README.md` 与验证范围页 `verification.md` 找到。

| 条款 | 性质 | 来源裁决 |
|---|---|---|
| MC-04 | 语义变化：interrupt/强停共用接纳账本；attempt identity、fencing epoch 与 durable abandoned authority 明确 | 原重基输入 + 本轮 M/L/E 结构候选；待联合评审 |
| MC-06 | 语义变化：结算扩为 immutable observations + revisioned current disposition，覆盖明确无正文、unknown细化、retention与fence | 原重基输入 + 本轮 M/L/E 结构候选；待联合评审 |
| MC-07 | 兼容扩展：`system_reminder` 按模型族投影为 user／developer message；投影选择器只选不改 | 用户裁决 U-46；工具执行提案契约措辞缺口表 MC-07 行 |
| MC-12 | 新增并强化：source-scoped pub、listener effective cut、可靠有序callback，ended仅为durable hint | 原重基输入 + 本轮 M/L/E 结构候选；待联合评审 |
| MC-13 | 新增并强化：active snapshot改为compact public state、coveredThrough与source cut，不承担terminal恢复 | 原重基输入 + 本轮 M/L/E 结构候选；待联合评审 |
| MC-14 | 新增并强化：带transformVersion的同一toPublic/fold统一实时、compact state与durable public result | 原重基输入 + 本轮 M/L/E 结构候选；待联合评审 |
