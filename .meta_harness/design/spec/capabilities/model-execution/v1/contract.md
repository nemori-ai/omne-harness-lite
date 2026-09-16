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

**MC-04**：请求状态 prepared → admitted → dispatched → settled，settled
区分 success/partial/failed/cancelled/unknown；未发出与可能已发出分别表达。
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
已流出的前缀按 MC-06 保留并明确可见，不作为可续写的草稿。

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

**MC-12**：本能力的提供者实例为每个 attempt 发布三种瞬态帧
`model.attempt.started`、`model.attempt.chunk`、`model.attempt.ended`。它们不是事实：
事实是 MC-06 的结算记录；帧丢失、未送达或被裁剪都不改变任何事实，也不改变 attempt
的状态。帧的形状、公开增量词表、信封、投递与作用域裁剪归
MS-20～MS-24（pending E coordinate: `capability.message-stream@1`）；本条只定义本能力作为发布者的义务。
帧里的 attempt 身份是 MC-06 的独立 attempt 身份，执行代次取该工作的执行代次——属于
Run 的是 [run v1](../../run/v1/contract.md) 的执行 epoch，没有 Run 的工作是该工作自己的
代次；本能力不另设帧级修订号。`started` 带 MC-06 的 `purpose`：它在 attempt 开始时就
已确定，不在结算时补定。`chunk` 的序号由公开投影稠密分配（MC-14）。`ended` 的发出
时机按 MS-22（pending E coordinate: `capability.message-stream@1`）：`committed` 只在该 attempt 的结算记录
取得 [DR-02](../../durable-records/v1/contract.md) 的提交回执之后发出，发起写入或进入写
队列都不算；`abandoned` 只在没有任何结算记录能提交时发出；其后不再发该 attempt 的
`chunk`。

三种帧带同一发布计数 `pub{gen, n}`，由本能力分配：`gen` 是提供者实例的代号，实例装载
时生成、换代即变；`n` 是该实例在一个 Session 内对每次发布单调递增的计数。消费者不代
分配序号，比较规则见 MS-23；换代不由本能力另发通知，帧自己带新的 `gen`。

**MC-13**：本能力提供读面 `attempts(session) → {items, version}` 作为重连基线的来源：
`items` 是该 Session 在本提供者实例上仍活跃的每个 attempt 的
`{attempt, epoch, nextIndex, stream}`，`stream` 是已发布的公开紧凑流；`version` 是取快照
时的 `pub`。读面快照与帧发布在提供者内同一互斥下完成，`items` 与 `version` 因而一致，
两步之间没有既不在基线里也不可判定的发布——MS-23 的同步切以此成立。在 attempt 中途
装载的消费者据此仍能取得完整基线；只监听未来事件取不到。提供者实例重启后该读面为空，
进程内没有可恢复的草稿。读面按当前主体的读权裁剪，不披露其它 Session 或租户的 attempt。

**MC-14**：一次 attempt 的私有增量序列由本能力耐久保存，只经本能力的私有读面提供，
供下一次模型请求原样回传（MC-07）；未校验的调用参数片段、供应方回放状态与加密推理
原件属于私有序列，不进 MC-06 结算记录的公开部分。公开投影 `toPublic` 由
MS-21（pending E coordinate: `capability.message-stream@1`） 定义；本能力保证实时发布、MC-06 的公开紧凑
记录与 MC-13 的重连基线三处出口都是同一 `toPublic` 对同一私有序列的结果，没有第二条
把私有载荷送出的路径。公开序号因而稠密、同一私有前缀在三处得到同一公开前缀；下一次
模型请求所需的完整回放从私有读面取回，不从公开记录反推。

## Legacy v2 相对 legacy v1 的来源差异

来源以提案与裁决编号给出；正式契约正文不引用提案，各编号的正文与链接从本能力入口
`README.md` 与验证范围页 `verification.md` 找到。

| 条款 | 性质 | 来源裁决 |
|---|---|---|
| MC-04 | 语义变化：interrupt 与强停共用同一 attempt 接纳账本与迟到启动墓碑；被 interrupt 结算的 attempt 记 `cancelled`，已流出前缀保留 | 工具执行提案 lifecycle.md 的 interrupt 动作链 A3；同文件契约措辞缺口表 MC-04 行 |
| MC-06 | 兼容扩展：结算记录必带 `purpose`、缺失块清单（截断块保留前缀）、实际送达模态与公开紧凑流记录；供应方原始终止原因进失败诊断 | 用户裁决 U-50；消息流提案第二轮作者裁决 R12、R16；delta-protocol §7 权威落点表 |
| MC-07 | 兼容扩展：`system_reminder` 按模型族投影为 user／developer message；投影选择器只选不改 | 用户裁决 U-46；工具执行提案契约措辞缺口表 MC-07 行 |
| MC-12 | 新增：三种瞬态帧的身份、`purpose`、序号、`ended` 的耐久回执前提与 `abandoned`，以及发布计数 `pub{gen, n}` | 消息流提案作者裁决 R8、第二轮 R15、第三轮 R20 |
| MC-13 | 新增：活跃 attempt 读面 `attempts(session) → {items, version}` 与“读面快照与发布同一互斥”的同步切义务 | 消息流提案作者裁决 R8、第二轮 R15；delta-protocol §5 重连基线 |
| MC-14 | 新增：私有增量序列与公开投影的边界；`toPublic` 的定义归 message-stream v1，本能力保证三处出口同一转换 | 用户裁决 U-49；消息流提案作者裁决 R7、第二轮 R14 |
