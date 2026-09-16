# 工具定义、调用、结果与控制 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.tools, 1)`，状态为 candidate、
`acceptance:null`。正文从 `omne-harness-lite-legacy-spec` 的 `capability.tools@2`
当前版本重基，保留 TL-01～TL-20 的身份和仍有效语义；旧决定、旧接受、
执行日志和旧模型结果只作 provenance，不自动接受或验证本坐标。

本能力的责任是：工具发布、冻结 Action、调用准入、执行归属、frames、结果和停止。 本轮采用 F/S/G 精确候选坐标；尚未迁移的
model-execution、media-content、message-stream 与 external-hooks 引用只表示后续接口需要，
不构成本候选 catalog 的当前依赖。后文出现的 legacy 路径和旧版本号用于恢复来源，
同名新谱系依赖均以本任务 candidate manifest 为准。

## 定义与模型表面

**TL-01**：工具贡献有原定义/版本、toolKey、不可变命令表、实现制品/版本和
configuration revision。每条命令有稳定 commandKey、输入/输出 JSON Schema、权限
声明、效果声明，以及停止能力、后台与前台、并发、媒体与帧的声明，必需 skill 和
环境能力。输入先通过具体命令完整校验再解析 Action；未知 command 或多余/非法参数
不得落到默认 handler。实现只收到校验后冻结参数，不能在授权后再次读取可变原输入
改变效果。

模型投影按命令表的范式分两类，都只占 manifest 的一个槽位。单操作工具（命令表恰一条，commandKey
与 toolKey 同名或为 `default`）投影为 `single`：顶层 Schema 就是该命令的输入 Schema，
没有 `command` 层，也没有 `help`。多命令工具默认投影 `compact`，即一个顶层条目
`{command: string, params: object}`，也可以选择 `oneOf` 投影把每条命令作为一个分支；
`help` 是保留元命令，提供获准摘要和具体命令定义，不执行业务效果。完整命令 Schema
从同一定义派生；不能为每个命令增加顶层槽位来声称符合
PF-024（legacy source: `../../../../docs/requirements/product/agent/PF-024-multi-command-tool-definition.md`）。
一次调用只选择一条命令；批量、管道和 shell 字符串不因 CLI 类比自动纳入协议。投影层
剥掉的 `command` 与保留参数不进入 `Action.params`；调用、过程、费用与审计仍定位到
具体 commandKey。

发布一个工具入口时下列检查全部通过才发布，不发布半项：命令的输入与输出 Schema（形状归
CD-05（legacy source: `../../../data/core-work/v2/contract.md`） 的 `Command`）能被本能力的校验器完整编译，不含它不支持的关键字；`single` 只用于单命令工具；`help` 不注册业务 handler；`oneOf` 的分支
数在 manifest 预算内，超出回落 `compact`；命令的输入 Schema 不声明保留参数名
`detach`、`command`、`params`；`foreground.onLimit`、`background.startModes`、
`stop.capability` 与 `background.mode` 互相一致（TL-08、TL-10）；`media.inputs` 的每个
参数指针指向存在的参数且其形状为 `MediaRef`；`frames[].kind` 在命令内唯一；执行 owner
在装载核实时能兑现声明的停止能力与后台协议版本，不能兑现则该命令 unavailable。

**TL-02**：工具别名只在一次模型请求的 manifest 内有效；manifest 绑定精确
定义/命令集合、声明解析器、实现 generation、配置/环境和 skill 内容，记录
模型实际得到的 Schema 与提示材料。返回别名通过原 manifest 解析，不查
“当前同名工具”直接执行。服务端 manifest 和 dependency evidence 不能由
模型参数伪造；读取 help/skill 不产生人类批准。

## 发现、装载与声明注册

**TL-03**：discover 返回获准可披露候选摘要、版本、用途、所需 skill 和
available/requestable/unavailable 及原因。目录缺失/落后/故障必须如实说明，
不是成功空列表。load 解析当前 tenant、definition、权益、精确版本、实际
执行能力和必需 skill，再准备贡献；定义 Schema 存在不等于实现就绪。

discover 同时支持 kind=tool/skill；独立 skill 无需绑定工具才能被发现、选择
和装载。loadSkill 复核当前权限及内容版本，将完整核心正文、资源清单及其
摘要注册到目标 Session/Run 的指引选择；实际请求装配再按该精确版本读取。
不能仅返回“已装载”而没有可进入请求的正文。资源按需加载且不自动执行。
独立 skill 的更新和撤回沿相同 generation/作用域规则，撤掉后续请求选择，
保留历史请求引用；它本身不能授予工具执行权或强制占用新的工具槽位。

**TL-04**：装载自动消费 AU-03（legacy source: `../../action-authorization/v1/contract.md`） 权限声明，取得
匹配声明解析器和动作索引；工具业务入口与有效声明作为同一发布单位准备、校验和
发布。身份冲突、未知词汇、解析失败、重复键或依赖不全阻止该入口发布，不能发布
工具后异步补审批规则。声明注册身份包含原 tool/command/version、贡献 generation、
tenant 和作用域；只有原注册 owner 可撤除，旧 disposer 不撤掉后来同名贡献。

可替换解析器作为受管能力，其被选中的精确绑定加入发布单位；声明索引是
定义的派生结果，不另存一份需手工维护的用户授权。每次调用重新求值当前
配置/授权，登记时 allow 不作执行凭证。程序化、后台和插件验证消费者走
同一动作门，按声明的消费类型提交可核实证据，不伪造模型 manifest。

**TL-05**：必需 skill 可以位于工具级和命令级；解析后绑定精确版本/摘要、
必需核心正文和实际资源位置。同一请求相同内容去重，但保留每个使用关系。
正文必须实际进入产生调用的请求，不能用“过去读过”或任意即时摘要代替；
超出窗口时缩小命令集合或拒绝装配。资源按需取得，路径对应真实宿主／沙盒，
读取脚本不自动执行。不存在/不可读/版本冲突时相关命令不可调用。

## 动态变化与在途绑定

**TL-06**：贡献状态 preparing → published → draining → released，失败保留
资源和诊断；条目变更、准入和 acquireUse 使用共同撤销屏障。更新先准备新
发布单位，失败保留旧选择；成功后新请求绑定新代，旧 manifest 的未准入
调用返回 stale_binding。待批动作不持有无限期运行资源；对应绑定撤回时
关闭或取代旧待办，不能把批准搬到新实现。

已经准入的调用持有原实现及必要依赖闭包，排空前不得释放。需要共存的旧
generation 在独立运行所有者／解析范围保留；无法共存的排他环境返回 busy，
或消费已授权的停止/维护操作，不能强杀无关调用。计划卸载先关新准入并
排空，然后 Cordis dispose；突发依赖丢失则新调用 unavailable，原调用
failure/unknown，不在新同名提供者上无声恢复。skill 撤回撤掉派生入口和
指引；它不是撤销已执行外部效果。

## 独立调用与实际执行

**TL-07**：调用有不可变 Action、来源 Step、callId、状态、绑定和原始 caller。
状态为 proposed、waiting_approval、admitted、executing、settled；settled 结果是封闭
七值：succeeded、failed、interrupted、unknown、denied_before_execution、
cancelled_before_execution、unavailable。`unavailable` 只在执行前出现——绑定失效、
提供者或环境不可用（TL-06），或准入后 start 回执丢失且按恢复政策 inspect 仍不可用——
它不消耗 attempt，其结果的 output 与 content 为空。admitted 与真正执行/物理停止分别
可见，unknown 不是成功或“肯定没执行”；之后核实只追加 resolution，不重写原未知观察。

业务 settlement 与物理 execution exposure 是两个正交维度。执行 owner 对每个曾取得执行许可或
attempt 接纳的 `{call,attempt,owner,ownerGeneration}` 持有 exposure；只有同一 execution identity 的
`quiescent` 或 verified isolation 事实关闭它。`settled(unknown)`、等待登记注销、Run 终态、超时、
not_found、callback/进程失联都不关闭 exposure。Run/RD 可读取并聚合 exposure 以求 RN-05 门，不能按
TL-07 settled 标签自行删项；迟到、重复、错 attempt/generation 的证据只留审计。

proposed 耐久登记后解析当前门；deny 直接结算，ask 按 HD-03（legacy source: `../../human-decisions/v2/contract.md`）
建请求，allow 在联合提交中取得预算预留、精确使用和执行许可，再建立 attempt。预算
预留被拒不是 deny：该调用停留在 proposed，不产生 attempt，Run 进入预算门等待
（RN-01（legacy source: `../../run/v2/contract.md`）、BG-03（legacy source: `../../budget-accounting/v1/contract.md`）），门恢复后
从该调用起重新过门。工具参数和权限在该次实际开始点都已确定。所有工具从实际启动时
由独立执行 owner 拥有，Run 只持有等待登记与控制关系（TL-16）；非后台工具也不能无主
启动。

**TL-08**：执行提供者承诺 `start(attempt,permit,binding)`、`inspect(attempt)`、
`requestStop(attempt)` 和按能力提供 `detach(attempt)`／`subscribe`。start
以同一 attemptId 耐久或可恢复接纳，重复返回原执行身份；没有接纳证据
不能先产生外部效果。接纳响应丢失时 inspect 原 attempt，不用新 ID 重发。
提供者无法兑现去重／核实或安全取消的行为时，不可声明相应能力。

attempt 账本的状态是封闭四值 `absence → accepted → dispatch_intent → terminal`，只前进
不回退；取消墓碑（fence）可在其中任一点建立，含 absence。start 与 requestStop 在原
执行 owner 的同一 attempt 接纳账本中排序。即使 start 尚未到达，stop 也须先建立可恢复
的取消墓碑；迟到 start 在产生任何外部效果之前检查墓碑及有效执行 epoch，拒绝已关闭
尝试。inspect 的 not_found 不证明安全停止。安全停止回执必须证明取消墓碑已生效且不能
被迟到消息绕过，或启动通道已被可验证地隔离；仅发送取消信号不足。已经先接纳的执行按
真实停止协议收口；准入许可耐久不免除执行器的开始／停止屏障。提供者重启必须先恢复该
账本／隔离状态，不能先接收旧 start 再加载取消记录。exposure 与 attempt 账本同 owner、同 generation
恢复；pending/迟到 start 仍受既有墓碑约束。新 generation 必须先认回旧 exposure 与 fence，或保持
unavailable，不能用换代把未闭合 exposure 清空。

命令声明的停止能力 `stop.capability` 是封闭三值，执行 owner 在装载核实时必须能兑现，
否则该命令 unavailable：`cooperative_fence` 表示 owner 封闭新动作并等待真实收口、不承诺
时限，只有 `physical: quiescent` 才算停止；`forced_isolation` 表示 owner 能在时限内隔离
工作，`physical: isolated` 之后外部效果仍可能已发生，结果按 `possibleEffect` 处理；
`unsupported` 表示不能停，声明它的命令不得同时声明后台可用，也不得声明
`foreground.onLimit: stop`。

外部服务自身不支持幂等时，执行提供者只保证本地 dispatch 不因恢复重发；
网络断点可能造成结果未知，保留实际暴露。一个外部调用可能发生，不能
为了得出确定结果盲目重试。显式新尝试重新过当前授权、预算和重试政策，
其收费与副作用各自记录；一次人类批准不自动覆盖不同 attempt。

**TL-09**：单次 stop 指向原 call/attempt，封闭其新步骤并请求底层停止；受理、真实
停止、清理和外部结果分开返回，不影响其他调用。停止进展的物理事实是三条封闭词表的
组合：`physical ∈ {quiescent, isolated, unknown}`、`cleanup ∈ {done, retained}`、
`effect ∈ {none, possible, confirmed}`。三者在 owner 的同一条进展事实里给出；
stop_requested 期间的“仍在活动”只是中间观察，不是 `physical` 的取值。owner 的有界
等待到期即报 `unknown`，时限只结束等待、不冒充隔离；没有系统级停止超时。

终态与 stop 竞争时返回真实先后，不能把已完成成功改写成中断；控制后晚到结果按原执行
epoch 作为合法结果或隔离证据处理。被明确中断或结果未知的调用不会因 resume Session
自动重试。清理权随原 owner 保留，不因普通 grant 撤销丢失。
stop progress 的 quiescent/isolation 只有 identity 与当前 exposure 的 call、attempt、execution epoch、
owner generation 和 fence revision 全部一致才可关闭；重复证据幂等，错代与迟到证据不命中新 exposure。

## 前后台关系

**TL-10**：执行状态与 foreground/background 关系正交。后台声明包含可脱离
形态、独立 owner、必要资源和重连协议；只有不再依赖 Agent 临时资源且
原 call/attempt 可观察／控制／结算时，detach 才确认 background。
转换只改变关系，不创建新调用、不重启实际工作。重复 detach 返回现状；
完成与 detach 竞争按原实际结果回答；未支持、已停止和暂不可用具名反馈。
`BackgroundDeclaration` 以 form=independent_execution、精确 owner/reconnect 协议版本和
requiredResources 表达此声明；实际 owner 身份在调用准入时绑定。协议引用须在装载时
核实，不能只是任意字符串。

后台可用时命令声明 `startModes`，取 `{on_start, auto}` 的非空子集：`on_start` 表示该
调用启动即后台，`auto` 表示前台启动、之后按前台上限处理。模型只能在 `startModes` 含
两种取值时收到保留参数 `detach: on_start | auto`（缺省 `auto`），取值越出 `startModes`
即参数校验失败，不产生 Action。该参数剥离后记为调用的 requestedRelation，不进
`Action.params`，准入后不改；它不能否决定义或运维声明的自动离场。

前台上限由命令声明 `foreground: {limitMs?, onLimit}` 表达，`onLimit` 取
`keep_waiting | detach | stop`，缺席等同 `keep_waiting`。`detach` 只在后台可用且
`startModes ∋ auto` 时合法，`stop` 只在 `stop.capability ≠ unsupported` 时合法。
有效阈值是 `min(声明 limitMs, 系统上限)`；两个来源值与计时来源在准入时记录到调用。
计时使用单调执行时长，等待人类的时间不计为工具执行，状态恢复不得把已过阈值时长
清零。单次手动或自动转换失败保持原关系并报告原因；只有复合打断
（RN-04（legacy source: `../../run/v2/contract.md`），受理形状见 LC-04 行 8（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`））明确要求转换
失败后中断，不能把此复合政策扩成所有手动转换的默认。`keep_waiting` 的调用只由工具
自然结束或用户停止结束：本契约不承认 Run 级执行预算或收口余量作为工具的刹车
（PF-013（legacy source: `../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md`））。

**TL-11**：Agent 重建根据 Session／Run 的 call 引用向独立执行 owner
inspect 和 subscribe，重连同一 attempt、原结果与费用。工具 host 自身
故障时的持续执行保证由其声明决定；未支持的 host 丢失标 unknown/lost，
不声称无限生存。后台完成可在无 Agent 时保存结果和待交付引用，后续
运行按权限感知。Run 普通 interrupt/cancel 包括其后台调用，复合打断按
RN-04（legacy source: `../../run/v2/contract.md`） 与
LC-04 行 8（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`） 处置；后台不免除
人类审批、预算或租户约束。

单调用强停 `stopCall{mode: force}` 要求 owner 尝试隔离该 attempt 并报
`physical: isolated | unknown`。它**只对声明 `stop.capability = forced_isolation` 的
owner 存在**：声明 `cooperative_fence` 的 owner 没有升级路径，其停止未知的调用长期
可见而不冒充隔离，系统不再对它发起动作。Run 级强停只对有升级能力的 unknown 调用
发单调用强停并等待其回答，其余在受理时由 Run 记为隔离未证实
（RN-05（legacy source: `../../run/v2/contract.md`））。

## 帧、披露和结果

**TL-12**：原始帧由执行 owner 分配序号，关联 call/attempt、生产者、kind、内容与来源，
可是执行观察或工具显式产生的中间材料；不是模型未提供的推理。调用状态、控制与结算
本身不是帧，永远是事实记录（TL-15）。帧在 attempt 内有稳定的生产者身份与严格递增的
序号；新 attempt 是新流，不与旧尝试合并。同一 `(producer, sourceKey)` 同内容的重试
认回原序号；同键异内容报冲突并封锁该生产通道，不覆盖旧帧，被封锁生产者的后续帧
被拒并记诊断，调用继续，但若受影响的是 critical 帧，该 attempt 不能报 succeeded，
只能报 `failed{record_incomplete}`。多生产者按 owner 接纳顺序排序；生产时间与到达
时间都不冒充因果顺序。旧通道资格先撤销再交给当前执行 owner，补交沿原键关联原来源
并另记补交者；已封闭的流只允许查询。owner 报终态前完成必需记录的提交并关闭生产
通道；强停立即撤销旧生产资格。帧可携带命令声明给出的呈现标识供客户端选择组件与版本，
语义不依赖它，词表全集归 message-stream v1（legacy source: `../../message-stream/v1/contract.md`）。终态结果
与帧分开，进度 100% 不代表成功。工具无帧时如实返回 unsupported 或 empty，不虚构内部步骤。

帧缺省耐久：记录等级是封闭三值 `critical | durable | transient`，缺省 `durable`。
critical 与 durable 帧写入 Session 域内的 append-only 帧流 `frames(S)`
（由 session v2（legacy source: `../../session/v2/contract.md`） 登记，与该 Session 的其它流同一协调域与
水位语义），可按 `(frames(S), seq)` 回放并与消息顺序对齐；critical 帧的写入回执是
owner 报终态的前提，写入或容量失败时不接纳依赖该保证的新动作，已有工作按能力受控
停止或标“无法完整记录”，不报全部成功；durable 帧每帧有写入回执，owner 侧只保留未
确认缓冲，写入权丢失时 owner 可继续工作、帧等写入权恢复后按序补写，未确认不标已
保存。transient 只由显式声明产生，不进 `frames(S)`，无回放承诺，按容量丢弃并显示
缺口。部署记录策略只能关闭 transient，不能把 critical 或 durable 降级。发出帧或等待
监听器完成都不是记录确认；耐久帧以写入回执为准。

帧的缺口是封闭词表：`trimmed`（transient 超出条数/字节上限被裁剪，或 durable 帧
payload 超过声明的单帧上限被截断）、`expired`（超出保留期）、`unconfirmed`（展示过但
写入未确认）、`crash_gap`（owner 重启无法保留的旧帧）、`decode_unavailable`（格式版本
无可用解释器）、`read_failure`（存储读取故障）、`result_unknown`（调用结果 unknown、
帧流可能不完整）。带缺口的摘要不能伪装完整原件。frame limits 按条数、字节和保留期限
配置，溢出、裁剪和数据丢失都落在上述词表里，不静默假装完整。媒体帧先经
CT-02（legacy source: `../../media-content/v2/contract.md`） 取得耐久引用，再确认该帧满足记录要求；未完成
时呈现带状态的占位帧。

披露读面按当前授权、敏感内容策略和 cursor 过滤／订阅：按调用与 attempt 的序号区间
读取并返回缺口标记、当前水位与记录等级；订阅推送新帧位置与内容，每个订阅者独立
游标，不竞争单消费 cursor；检查面返回每 attempt 的执行状态、可读范围、记录等级与流
关闭边界。每次读取按当前读权与内容策略裁剪，投递前再次核对读权，撤权结束订阅效用
而不停止工作，跨租户或无权返回不可访问且不泄漏存在性。游标绑定调用/attempt 与读取
位置，不携带永久授权。历史读取从 `frames(S)` 回放，依赖持久记录与兼容解释，不依赖
原工具插件或实例仍在内存；向客户端的传输、重连补齐与合并游标归
message-stream v1（legacy source: `../../message-stream/v1/contract.md`），本契约只定事实侧与读面。本能力
另按 SE-10（legacy source: `../../session/v2/contract.md`） 注册 `calls` 快照贡献：给定主体与投影水位 `asOf`，
返回该主体有正文读权（SE-20（legacy source: `../../session/v2/contract.md`） 的 `read_content`）的活跃调用视图（进展、关系、帧水位），裁剪规则由本贡献自带，
projection 只在同一 fold 水位上调用它、不自带调用的可见范围规则。终态、
调用引用及可供历史取得的结果须耐久。Session 保存结果或经过选择的内容引用，模型装配
只消费明确选择的投影，不得把用户展开所有帧等同于向模型注入全量输出。

**TL-13**：框架扩展点区分纯观察、受限准备和执行守卫；观察失败不能撤销
已提交结果，声明解析/守卫缺失不能默认许可。未知输出 Schema 或内部
插件异常如实结算，保留失败阶段。工具前只有 TL-07 的门与本条的守卫，守卫只能把
allow 收紧为 ask 或 deny，不能放宽、不能改写已冻结的参数、不能新增调用；工具后只能
选择进入模型的投影，不改耐久结果（TL-19）。这两个站点在 Agent Loop 上的标签
（`pre_execute`、`post_execute`）与种类登记归
RD-19（legacy source: `../../run-driver/v3/contract.md`），本条只拥有它们对调用的权力上界。外部命令式 hooks 在这两个站点的映射、
权力上界与降级归
external-hooks v1（legacy source: `../../external-hooks/v1/contract.md`），它不获得本条之外的权力。
包级 fork 可保留有价值的 DSL/路由/冻结机制，但上游 waterfall、PTC、in-memory jobs 或
Session audit pair 不能直接承担上述目标承诺。

## 调用的五个维度、转移与等待

**TL-14**：一次调用同时被五个正交维度描述，各有自己的 owner 与事实流，不合成一个
枚举；驱动器看到的结算视图（RD-09（legacy source: `../../run-driver/v3/contract.md`））是这五个维度的派生
投影，不是第六份状态。

| 维度 | 状态集合 | owner |
|---|---|---|
| A 调用进展 | `proposed → waiting_approval → admitted → executing → settled{succeeded, failed, interrupted, unknown, denied_before_execution, cancelled_before_execution, unavailable}`；`unavailable` 只在执行前且不消耗 attempt；`unknown` 之后只追加 resolution（TL-07） | 工具能力 |
| B attempt 账本 | `absence → accepted → dispatch_intent → terminal`，取消墓碑可在任一点建立（TL-08） | 执行 owner |
| C 等待关系 | `foreground → detach_in_flight → detached_background`；或 `background_from_start`；`human_wait`（仅 `human` 调用）；未过门为 `none`；终态后关系消失（TL-16） | 权威在 Run 的等待登记簿，工具能力只投影 |
| D 控制 | `none → stop_requested → stop_progressed{physical, cleanup, effect}`（TL-09）；与终态竞争按真实先后 | 工具能力记意图，执行 owner 记物理事实 |
| E 结算交付 | `terminal → settling → {continuation, context, queue, closed} → consumed` | Inbound（SE-12/14（legacy source: `../../session/v2/contract.md`）） |

维度之间不互相推导取值：调用可以在 `executing` 且 `detached_background` 且
`stop_requested`；Run 的终态不改写 A 与 B，也不隐式重启已准入的工作
（RN-02（legacy source: `../../run/v2/contract.md`））。

**TL-15**：每个转移有确定的触发者、提交面与同批伙伴；事实 kind 为三段式。
每条 accepted fact 的最终 `eventId=(coordinationDomain,batchSeq,recordIndex)` 只由 DR-01 的 canonical
commit envelope 分配，是逐事实身份与投递去重键；`(stream,revision)` 只标识该流本次 owner append，
同 append 多 facts 共享 revision，不能据此逐 fact 去重。`operationId` 标识幂等提交尝试，不是事实
身份；prepare 临时关联 identity 不是 eventId，同批引用在 commit 前使用相对位置并在 commit 后解析。
结算 arrival 的来源级 dedupKey 另固定为 `(call,attempt)`。

| 转移 | 触发者 | 提交面与同批伙伴 |
|---|---|---|
| → proposed | 驱动器提议调用批 | 工具权威的提议登记与 Run 的提议准备在同一共同提交：`tools.call.proposed` + `run.calls.proposed` + 该调用的等待登记（TL-16）。整份模型返回先完整校验，不合法则不执行任何一项，该 Step 以 `invalid_proposal{reasons}` 收口（RD-08（legacy source: `../../run-driver/v3/contract.md`）） |
| proposed → admitted（门 = allow） | 驱动器 | `tools.call.admitted` + `run.call.admitted` + 预算预留与精确使用 + 授权审计 + 执行许可 + 附着工作登记，同一共同提交；TL-13 的守卫在此只能收紧 |
| proposed → waiting_approval（门 = ask） | 驱动器 | `tools.call.waiting` + `hd.request.created{system_approval}` 同批；请求附属于该调用，不另建等待登记 |
| proposed 停留（预算被拒） | 驱动器 | 不产生 attempt，不改调用状态；Run 进入预算门等待并登记 `(gateRef, gateRet)`，门恢复后从该调用重过门 |
| proposed → settled{unavailable} | 驱动器 | 绑定失效或提供者/环境不可用（TL-06）：`tools.call.settled{unavailable}` + 结算 arrival 受理同批；不产生 attempt |
| waiting_approval → admitted | 驱动器消费批准 | `run.approval.consumed`（引用被消费答复的 eventId）+ `tools.call.admitted` + 预算预留 + 执行许可同批（HD-06（legacy source: `../../human-decisions/v2/contract.md`）） |
| waiting_approval → settled | 拒绝、绑定撤回或 Run 收口 | `tools.call.settled{denied_before_execution \| cancelled_before_execution}` + 请求关闭 + 结算 arrival 受理同批 |
| admitted → executing | 执行 owner 接纳 start | owner 的短门核对许可、绑定、执行 epoch、墓碑与去重后写 `execution.attempt.accepted`；真实 I/O 之前写 `execution.attempt.dispatch_intent` 并向预算暴露交付意图 |
| admitted → settled{cancelled_before_execution} | stop 先于 start | 墓碑与结算在同一提交；owner 迟到的 start 被墓碑拒绝 |
| admitted → settled{unavailable} | 恢复判定 | start 回执丢失、按恢复政策 inspect 仍不可用（TL-07） |
| executing → settled | 执行 owner 的终态 | `execution.attempt.terminal` + `tools.call.settled{outcome}` + `inbound.arrival.accepted{call_settlement, dedupKey=(call, attempt)}` 在同一提交；跨协调域沿 CC-05（legacy source: `../../../compositions/core-work-coordination/v2/contract.md`） |
| settling → 裁决结果 {continuation \| context \| queue \| closed} | Inbound 裁决者 | `inbound.arrival.classified{continuation \| context \| queue \| closed}`；裁决为 continuation 的提交同批注销该调用的等待登记 |
| 任一 → stop_requested | 用户单次停止或 Run 收口 | `tools.control.requested` + `execution.stop.fenced` 同批；先于 start 也先建墓碑 |
| stop_requested → stop_progressed | 执行 owner | `execution.stop.progressed{physical, cleanup, effect}` → `tools.control.progressed`（TL-09） |
| foreground → detach_in_flight → detached_background | 用户转后台、前台上限到点或复合打断 | `tools.relation.detach_requested`，owner 确认不再依赖 Agent 临时资源后 `tools.relation.detached`，确认提交同批注销该调用的等待登记；启动即后台的调用在准入提交注销 |
| settled{unknown} → 追加 resolution | 后续核实 | `tools.call.resolved` 追加，保留原 unknown 观察（TL-07） |
| 迟到事实 | 旧执行者 | Run 记录迟到事实作为隔离证据，不复活工作（RN-05（legacy source: `../../run/v2/contract.md`）） |

终态与转后台竞争时，终态先到则按当时的关系结算、转后台请求作废；转后台确认先到则
按后台关系结算，结果按 TL-19 的投影规则进入模型。

**TL-16**：“Run 在等谁”的唯一权威是 Run 的等待登记簿
（RN-01/RN-04（legacy source: `../../run/v2/contract.md`）），调用的等待关系（维度 C）是它在该调用上的
投影：有开放登记且未请求转后台 = `foreground`（`human` 调用为 `human_wait`，未过门为
`none`），有开放登记且已请求转后台 = `detach_in_flight`，无开放登记 = 后台。工具能力
只呈现这份投影，不另存一份权威，也不从调用状态反推 Run 是否在等待。

只有本 Run 提议并耐久登记的调用能在该 Run 上登记；人类请求不是独立登记项，附属于它
所属的调用——系统审批附属于等审批的那个调用，问题与 Agent 发起的批准附属于 `human`
调用（TL-17）——一次等待只有一条登记。调用在 `tools.call.proposed` 的同批登记，注销恰
与释放它的那条事实同批：其结算被裁决为 continuation、转后台确认或启动即后台的准入、
Run 的终态提交、以及强停受理进入 stopping 的提交。登记与注销的时点、Run 的等待状态
判定与入站裁决沿 run v2 与 SE-14（legacy source: `../../session/v2/contract.md`），本契约不另行定义。

## 内建人类请求工具

**TL-17**：Agent 向人提问与请求批准是一次工具调用，不是独立的驱动意图。系统提供多
命令工具 `human`，恰有两条命令：`ask_user`（kind = question）与 `request_approval`
（kind = agent_approval），没有第三条；能力授权申请用 `ask_user` 表达需要，授予本身走
系统发起的专属同意流程（PF-005（legacy source: `../../../../docs/requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md`））。
该工具的执行 owner 是人类决定能力：start 等于耐久创建请求并把接续绑定到该调用位置，
requestStop 等于关闭请求，answer 在同一提交里记唯一决定、把调用结算为
`succeeded{answer}` 并受理其结算 arrival（HD-01/03/05/08（legacy source: `../../human-decisions/v2/contract.md`））。
门为 allow——问人不需要批准——费用来源为零费用，请求不设自动超时或默认答案。

答复是该调用的返回值，恰一次进入模型：该 tool_use 尚未占位则答复就是它的 tool_result；
已占位则答复以一条 `system_reminder{human_answer}` 进入到达的 Step 的输入，两者恰居其一
（TL-19）。`ask_user` 的答复内容作为结果；`request_approval` 的决定（approve / reject /
comment）同样只作为结果进入历史，本质是用户对拟执行动作的态度提示，不产生任何可被系统
门消费的决定、不建立持续授权；之后真正执行的动作照常过 TL-07 的门，需要人类确认的仍由
系统发起审批。

等人期间该调用的登记不阻止 Step 收束，也不阻止驱动器让出运行时；控制的处置是：普通
中断保留请求并加全 Run 阻塞，复合打断保留请求但其登记随旧 Run 的整簿注销一起释放、
答复按登记簿路由到当时的活动 Run，Run 不可恢复失败保留请求，取消与强停在同一提交关闭
请求并把调用结算为 `cancelled_before_execution`，用户对该调用的单次停止即撤回问题、
处置同取消。迟到的第二次答复返回当前结果，不生成新的 arrival。工具体在执行中途暂停
向人提问再回到断点不纳入本版：执行 owner 不保存调用栈，需要中途问人的工具拆成两次
调用由模型编排。

## 前台上限的执行

**TL-18**：前台上限的计时与转换决定归调用运行时：它持有计时器，到点向执行 owner 发出
转后台或停止，驱动器只观察视图变化，执行 owner 只兑现动作。转换的可见中间态沿
`detach_in_flight`，不引入新状态。用户手动转后台与复合打断引起的转换不经调用级
`detach` 参数（TL-10）。

同一 Step 提议的多个调用各按自己的声明走：有的前台等到自然结束，有的到点转后台，有的
启动即后台。Step 在提议登记后即收束（RD-10（legacy source: `../../run-driver/v3/contract.md`）），开下一
Step 的合批规则与占位形态归 run-driver v3；本契约只承诺转换本身不创建新调用、不重启
实际工作、不改变已冻结的参数与授权。

批内的并发由命令声明 `concurrency: serial | parallel_safe` 约束，缺省 `serial`。同一提议
批内连续的 `parallel_safe` 调用可以同批准入并同时 start；`serial` 调用沿驱动器的缺省串行
过门（RD-09（legacy source: `../../run-driver/v3/contract.md`））。并行 start 不改变每调用独立记录观察与费用
的义务；写回下一 Step 的顺序仍按模型发出的顺序，批内某调用被拒或 Run 被收口时未派发的
调用结算为 `cancelled_before_execution` 并写合成结果。

## 结果、恢复与投影

**TL-19**：调用结果分三层，各有不同的权威与可变性。真实执行结论（outcome、error、
`possibleEffect`）由执行 owner 在终态事实里给出，恰一次，不可被任何站点改写；规范输出
数据（按输出 Schema 校验的 output、以及 content 里的耐久引用）随结算耐久保存；模型投影
由驱动器从上两层派生。形状归 CD-03（legacy source: `../../../data/core-work/v2/contract.md`），本条只定含义
与归属。

工具产生的媒体先经 CT-02/CT-03（legacy source: `../../media-content/v2/contract.md`） 取得耐久引用并记录产生
它的调用与 attempt，才能作为结果 content 里的块进入历史；未耐久的引用不能进入终态结果。
同一媒体引用可以既出现在帧里（过程预览）又出现在结果块里（结论），耐久记录以结果块为
准，客户端按 mediaId 去重、不双份呈现。模型投影按
MC-11（legacy source: `../../model-execution/v2/contract.md`） 的模型能力与部署/权限交集选择：模型能读该模态
则引用作原生块进入，不能则以文字说明加附件引用进入。投影选择器只能选择，不能改写耐久
结果；用户展开全部帧不等于向模型注入。

一个调用的最终结果恰一次进入模型：该 tool_use 未占位则作为它的 tool_result，已占位则
作为一条 `system_reminder{late_result}`（`human` 调用的答复为 `human_answer`）进入到达
的 Step。占位块与 `system_reminder` 都是系统产生、不可由用户输入导入的内容
（CD-03（legacy source: `../../../data/core-work/v2/contract.md`））；占位原因与呈现规则归 run-driver v3。
`human` 工具的答复走同一结果形状（`succeeded{output: Answer}`，content 为空）；
`unavailable` 的 output 与 content 为空。

**TL-20**：非预期退出后，调用五个维度的恢复按崩溃窗口判定；执行 owner 重启先恢复
attempt 账本与取消墓碑，再接收 start（TL-08）。

| 崩溃窗口 | 恢复判定 |
|---|---|
| proposed 已耐久、门未完成 | 重跑门判定，同 operationId 认回；不重复提议 |
| admitted 已耐久、owner 无 accepted | 核对原准入与控制后，向原 owner 以同 attemptId 重发 start，不产生第二个 attempt |
| accepted 已耐久、无 dispatch_intent | 可证明未进入效果位置：按恢复许可继续，或按当前准入重新派发同一 attempt |
| dispatch_intent 已耐久、terminal 不明 | 只 inspect，不重发；核实不了记 unknown 与费用暴露，结果带 `possibleEffect` |
| terminal 已耐久、结算 arrival 未受理 | 以同一来源版本与 operationId 重交，直到 Inbound 回执认回 |
| arrival 已受理、未裁决 | 由 Session 级裁决者扫描完成裁决（SE-18（legacy source: `../../session/v2/contract.md`）），驱动器重取在扫描之后 |
| `human` 请求已创建、未答复 | 请求与调用均耐久；等待照常，答复照常路由 |
| 取消墓碑已耐久、物理结果未知 | 保持未完成的停止状态与 `cleanup: retained`，不虚报强制中止 |

## 与 v1 的差异

“性质”列按版本规范（legacy source: `../../../../docs/maintenance/versioning.md`）的分类；“来源裁决”列给出
工具执行提案中作出该选择的裁决编号，其原文出处由本能力的入口页与验证范围页给出，规范
正文不引用候选材料。

未列入本表的条款保留 v1 的编号与正文，只把跨能力引用改指本批次的精确版本。

| 条款 | 性质 | 变更 | 来源裁决 |
|---|---|---|---|
| TL-01 | 兼容扩展 | 声明列表补停止、前台、并发、媒体与帧；投影收敛为 `single` / `compact` / `oneOf` 两种范式；补发布时检查清单与保留参数名 | 决定 i、k、l、d |
| TL-07 | 语义变化 | settled 结果加 `unavailable`（执行前、不消耗 attempt）；预算预留被拒写明为“停留 proposed + 进预算门”，不是 deny；Run 只持有等待登记与控制关系 | 缺口表 TL-07 两行、U-45 |
| TL-08 | 兼容扩展 | attempt 账本封闭四值与墓碑位置写入正文；`stop.capability` 三值及其兑现与一致性约束进入本条 | 第三轮裁决 14、作者裁决 5 |
| TL-09 | 语义变化 | 停止的物理事实封闭为 `physical / cleanup / effect` 三轴；写明 owner 的有界等待到期即报 unknown、没有系统级超时；unknown 不因 resume 自动重试 | 作者裁决 2、5 |
| TL-10 | 语义变化 | 删 `automatic{thresholdMs, stopMarginMs}`、Run 剩余执行预算与收口余量；改为 `foreground{limitMs, onLimit}` 与 `startModes ⊆ {on_start, auto}`；调用级 `detach` 只取 `on_start \| auto` 且不能否决声明的自动离场；有效阈值 = min(声明, 系统上限) | U-45、U-46、决定 m、n、ab |
| TL-11 | 兼容扩展 | 新增 `stopCall{mode: force}`，只对声明 `forced_isolation` 的 owner 存在；复合打断的引用从已废止的 SR-11 改为 run v2 与 LC v2 行 8 | 第三轮裁决 14、作者裁决 3 |
| TL-12 | 语义变化 | 帧缺省耐久并写入 Session 域的 `frames(S)` 流，只有显式 `transient` 不落盘；三记录等级与失败处置、生产者身份与去重、封闭缺口词表、读面义务进入正文；“实时帧可以非耐久”改为按声明 | U-42、作者裁决 d |
| TL-13 | 兼容扩展 | 写明守卫只能收紧、不可改写参数；外部 hooks 的落点指向 external-hooks v1 | U-40、第三轮裁决 19 |
| TL-14 | 新增 | 五个正交维度的状态集合与 owner；结算视图是派生投影 | 作者裁决 0、决定 h |
| TL-15 | 新增 | 转移表：每个转移的触发者、提交面与同批伙伴；三段式事实名与结算 dedupKey | U-33、决定 h |
| TL-16 | 新增 | 等待关系是 Run 等待登记簿的投影；登记与注销的归属规则 | U-59、作者裁决 0、1、8 |
| TL-17 | 新增 | 内建 `human` 工具：恰两条命令、HD 为执行 owner、答复作为返回值、控制处置与不纳入项 | U-41、U-44、决定 w、x |
| TL-18 | 新增 | 前台上限的计时与转换决定归调用运行时；同批混合各按自己的声明；批内并发声明 `concurrency` 的含义 | U-45、决定 k、n、作者裁决 9 |
| TL-19 | 新增 | 结果三层的权威与可变性；媒体耐久与呈现去重；最终结果恰一次进入模型的两种形态 | 决定 ac、U-46、作者裁决 6 |
| TL-20 | 新增 | 调用五维的崩溃窗口恢复判定表 | 缺口表恢复窗口一节 |
