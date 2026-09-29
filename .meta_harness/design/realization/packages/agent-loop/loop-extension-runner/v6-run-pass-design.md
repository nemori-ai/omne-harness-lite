# loop-extension-runner 公共 runPass 执行面增补

2026-09-29，revision 1，**candidate，未采用、未实施验证**。节点仍为 `packages/agent-loop/loop-extension-runner`，provider；`v6` 是提供者文档修订名，不是 Runner 契约版本。前身为 [v5 revision3](v5-current-design.md)，SHA256 `1a85cfa993a42dc721e39a68ce1492e474d1be96c25067a16561fa1975db7f13`。原文件及 [D106](../../../../record/decisions/runner-current-pure-provider-adoption/decision.md) 的采用字节不改；D106 只采用五个纯构件及后续 core 纯主体入口，**未采用 runPass 执行面**。

## 输入、范围与分层状态

基线 `omne-harness-lite-design-2026-09-15`；已核 catalog 与接受摘要：

| 精确契约／用途 | contract SHA256／接受 |
|---|---|
| [Runner5](../../../../spec/capabilities/loop-extension-runner/v5/contract.md)：完整经过、ask/replay、控制与收口 | `e571e01d8e4d86fec3904d9decb37beb38615940125f320a72c250fd63ca4c43`；D100 |
| [LC6](../../../../spec/data/loop-extension/v6/contract.md)：输入/结论、等待作者约束 | `d5cf4e24abc0a72ffe27072b8239489812382e3b94f2ee891ca9264338a1954a`；D100 |
| MS6／SL3 | 沿 v5 精确表：`73736fb36e63961b88b88918c641608204863831f40c503dc96b5cecf9e84c1c`／`f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`；D100／D083 |
| RT9／MR8 | 仅沿 v5 已声明的 runtime 守卫、失败主体与消息 codec 消费；D104。Runner5 的规范依赖仍为其原精确坐标；此页不升级 MR9/RT10 |

需求 topic/rev、Cordis 4.0.4（D025）、SL3 独立存储抽象及静态配置启动失败政策继承 v5。新发现并非产品规则缺失：Runner5 S-27/S-28(4) 已确定行为，原端口未携带区分行为所需的来源与结果。本页只补公共执行面的端口、映射和证据义务，不建立卡片存储、等待服务、AgentLoop、Session、Inbound 或 production Run owner。

- **语义接受**：上述精确契约已接受；本提供者增补未采用。
- **可实施**：有显式、满足下文责任的执行/等待/日志端口时，可实现完整公共 runPass 各分支；没有真实等待来源时 ask 接续具名 unavailable，不伪造 ready。此条件函数面不等于生产服务完成。
- **绑定证据**：新增 0，总数仍 0；规格模型与别包测试不冒充本函数证据。
- **实际验证**：基线 `902e1972` 已有五个纯构件源码，未见 runPass 公共实现；本任务无产品运行。原稿“尚未建包”按历史读，纯构件存在不补全执行面。

## 契约责任到公共执行面

下表 S- 坐标均为 Runner5；所有新增接口、端口、控制结果与技术字段名均为**候选**，不是已有 API。

| ID／责任 | 公开操作／Cordis 投影 | 兑现点及依赖 | 证据或边界 |
|---|---|---|---|
| RP6-P1：S-5/S-6/S-10/S-21 | `runPass(pass, chain, ports, signal)`；无新服务/fiber | 继承显式 initial/anchor/execution，构造完整 LC6 Input，顺序 await、先提交后下一件；复用 core 纯主体入口与 D106 构件 | V6-1/6；noRun failure 仍 invalidInput |
| RP6-P2：S-27、S-28(4)、S-9 | 新增受控 `readAskState`；invoke 接明确 fresh/replay 模式 | 同一耐久末尾 ask 的未答/整批答完/来源不可读由等待 owner 提供，核原 ask 轮次/卡片/批次关联后分支 | V6-2/3；卡片实际存储仍归其 owner |
| RP6-P3：S-28(4)、S-21⑥、LC6 S-35 | `invoke` 新增受控 replayInconsistent/unavailable 结果 | 等待执行 owner 检查本次重演与日志每次等的对应；偏离越过一般 onError 直接失败，零本件新记录/卡片 | V6-4；不能把异步控制放 emit/bail |
| RP6-P4：S-11/S-18/S-19/S-28 | 当前结论解码、原值回放、提醒补全 | 原 final/ask ordinal 与判重键；已最终件零 invoke；函数结果与效果使用各自明确的历史/有效结论投影 | V6-3/6/7；不改 D106 字节 |
| RP6-P5：S-33/S-34、SL3 S-22/S-23 | runner 长期任务 owner + 每次调用资源 owner | 继承 unknown 留存、可信停止恢复、合法竞争胜者；等待读取/执行也有所有者和 late completion 消费 | V6-5/7；G5 真实宿主继续未闭 |
| RP6-P6：S-26/S-53/S-54、LC6 S-43 | 同 prefix `verifyFailure` 及真实能力判定 | 不删、不替换原主体来源闭包；同次 full prefix 和当前调用身份共同核，retry 再过真实守卫 | V6-8；G3/production Run/P-5 不随本增量签收 |

## 公共函数与必要端口

`pass={initial,anchor,execution}`、`chain`、`PassResult` 继续 v5；候选 `ports.binding={session,tenant,logGeneration}` 是调用者建立并捕获的显式绑定，固定同一日志及其宿主代际；各来源端口与其相互核对，这些身份不靠贡献者输入自行声称。`PassResult` 沿 S-21 封闭失败集合；不新增等待中状态值，等待中成功仍为原 `{conclusions,effect:asked}`。调用前缺必需端口属于函数输入错误，零副作用；Cordis 宿主静态缺配置启动失败。已装端口的动态来源不可得才是 unavailable。

| 候选端口 | 输入、结果及必须落实的 owner |
|---|---|
| `readConclusions(pass)` | 继承完整原条目/tail 或 unavailable。runner 自己用当前 codec 核会话壳、pass 键、链前缀、ask ordinal/final 及完整值；**这里没有等待就绪的隐含布尔值**。未知提交尚未收口不得把读到的缺席当可重新求值。 |
| `readAskState({pass,piece,askEntry,askHistory,earlier,subject}, signal)` | 仅对无 final 的最后一件、最后一条耐久 ask 调用；结果为 `{pending:boundAsk}`、`{ready:replayBinding}`、`{replayInconsistent:true}`、`{unavailable:true}`。来源是实际等待 owner 的调用级受控闭包，责任详下节；runner 对返回绑定逐项核对，不接受 caller 的 `answered=true`。取消仍由既有 signal/准入控制，端口不发明新终态。 |
| `presence(piece)` | 保留 needs 查询与实现代际；查询不可读 → 整次 unavailable；确定缺席 → 原不可用处置。等待尚未就绪时不借此重判原 ask 为不可用结论。 |
| `openHandles(piece, invocationMode)` | 为当件这一次调用建立新的 log/environment/release；replay 读面至少含原开始前缀、earlier、自己的 ask、卡片记录和答复。来源不足 unavailable，不给空日志；开始后普通句柄读取/环境失败仍沿 S-9/S-50 的报错边界。 |
| `invoke(piece,input,signal,invocationMode)` | mode 为 `{kind:fresh}` 或 `{kind:replay,binding}`；由已登记执行适配器在等待 owner 控制下调用实现，结果完整联合为未开始的 unavailable、开始后 errored、完整 output、受控 replayInconsistent、控制来源 unavailable。后二者与贡献者报错严格区分，见下节；不把 raw output 自称的控制字段当 owner 报告。 |
| `verifyFailure(subject)` | 保留 v5 同次完整 prefix 捕获与当前 session/tenant/callId/代际核对；成功返回 authoritativeSubject；错值 invalidInput，来源失效 unavailable。只有生产主体的同次读取可建立闭包，不换最近前缀或 verified 标记。 |
| `judgeCapabilities(input,output)` | 先完整 LC6 表示/power 检查再真实守卫；拒绝走原输出不合法策略，守卫 unavailable/invalidInput 同名退出。before_action 整批 admit 仍由外层一次协调，不从单次 runPass 拆批；派生表示/下游来源判断不省略。 |
| `record(entry,execution)` | 原 prepare 后完整 Conclusion/提醒副本；显式 SL3 fenced/unfenced、unconditional、稳定判重/读取键。confirmed 才生效；alreadyRecorded 读回并采用合法胜者；unknown 交长期 owner，不叫 absent。 |
| `persistReminders(reminders,execution,signal)` | 原一层 before_persist_message 嵌套与共享 MessageId/mrr/3；同值才认回，异值 replayInconsistent，读不全 unavailable；外层取消不再补提醒，嵌套 veto 不冒成外层 veto。 |
| `mintReminder`、`now`、`isActive` 及任务 owner | 只在首次合法产出时取时/发号；重放不重铸。实例失活 unavailable，业务取消 cancelled；不得把这两者写成贡献者普通失败。start/closeAdmission/drain/reconcileStoppedLog 继续 v5 完整责任。 |

### 等待状态的真实来源与绑定

`boundAsk` 是已捕获的原 ask 关联描述，不持执行资源；pending 的来源读工作在返回前收口。`replayBinding` 则是不可序列化的调用级技术交接，显式含只读关联描述与幂等 `release()`，不能存为“已验证”凭证，也不是新领域对象。它们由等待 owner 针对本次捕获的 ask 构造，并在使用前核绑定仍有效。构造输入及核验责任必须涵盖：

| 关联 | 提供与核对责任 |
|---|---|
| 原经过与件 | runner 交当前已核的 session/tenant、position/dimension、anchor、extension，以及原 ask 完整条目、判重键、日志位置和 occurrence.ordinal。等待 owner 核自己登记的等待确由这一条 ask 引起；runner 核返回描述与输入精确相等。不能凭 extension 名或选项名归属。 |
| ask 轮次与卡片 | owner 给出原 ask 与原卡片引用的受控对应；当前轮次来自已读 ask 序列，不从内存计数加一。未落卡片且可信确认尚未创建，为 pending；runner 返回同一原 asked，卡片侧按原 ask 身份幂等补建，不由 runner 再调实现或铸 cardId。正式卡片载荷/存储协议未定，不在此复制。 |
| 批次完成 | owner 必须核“这一批已答完”，单张卡已答不足以 ready。before_action 由原批次协调者交完整批次关联，不能用本动作列表的一部分、相同 batch 字符串或最后一条 answered 提醒冒充全批判定；其他位置亦取实际等待 owner 的完成事实，不自填单卡默认批次。 |
| 答复与重演来源 | ready 保有当前件各次已发生等待的可信日志/结果读取能力，至少包含当前 ask 的原卡片与其答复。MS6 `system_wait_answered` 是提醒，不是卡片答复权威；不得仅扫描提醒便判整批完成。自己的模型等待结果也从原日志交回，不再次模型请求；其他件的答复不能进入该件等待。 |
| 原输入与新句柄 | 调用者仍承担 S-5 的同锚原始输入同值义务；runner 从该 initial 和前面各件已确认 final 重建 subject/earlier，并核 ready 交接绑定到这一完整捕获值，不声称仅凭 ask 能反推出或独立证明第一次 initial。earlier 不收入本件旧 ask，亦不收入其他动作结论。回放处于当前实际 attempt，身份按 Runner5/LC6 原规则，不能为“同值”伪造旧执行尝试；subject/earlier 同值、log/environment 新句柄。 |
| 有效期与来源失败 | 绑定限该调用、该件、该 ask/批次与原等待 owner 代际；关闭或 owner 失去来源时 unavailable。确知关联错配、等待步骤与原日志偏离为 replayInconsistent；读不到/无法证明关联不是“没答”或“已经答完”。普通日志新增不使既有事实失真，不增加“尾不变才能 ready”的守卫。 |

边界明确：本节点实现校验和消费受控来源的接口；真实等待 owner 必须实现上述核验，未提供时生产接续 unavailable。受控函数测试可提供明确已建卡片/等待日志模型并用可失败反例检验 runner，不得把测试闭包当生产卡片系统。Runner5 G-17/MS6 G-5 未定义的 declined/自由作答不自行编码；放行判断仍沿 S-29(8) 已认出的选项和未知 unavailable 规则。

### 调用与回放偏离的独立结果

`invoke` 的 owner 必须包住贡献者执行及它的等待原语调用。fresh 模式照等待原语记载/取得新的等待结果；replay 模式逐次匹配已有等待并交回原结果，走完已有历史后才允许形成新一轮 ask。**仅给贡献者一个 replay 布尔值没有保护能力**：控制由执行/等待 owner 的实际作用域承载，贡献者不能通过 catch 回放错误后返回 output 绕过。

等待 owner 在本次调用作用域内锁存偏离，关闭后续等待准入；invoke 收场先检查这份受控状态。已报告偏离，即使贡献者随后交 output 或一般 error，仍返回 `{kind:replayInconsistent}`；runner 不走 onError、不调用 now/mint/record/persistReminders、不出新卡，之前已提交条目原样保留。来源在控制核验前丢失，返回 `{kind:controlUnavailable}`；整次 unavailable，不能变成 errored 留新 Conclusion。任意缺阶段归属的端口异常亦作为控制来源不可用并可观测，不靠异常字符串猜“回放偏离”。

正常贡献者层返回由执行适配器规范化为 `{kind:notStartedUnavailable}`、`{kind:errored,error,classification}` 或 `{kind:output,value}`；classification 保留兼容件非阻断三种错误与其余错误的原区分。开始之后不能退回 notStartedUnavailable；不明开始状态按原普通报错处置，前提是控制 owner 可确认没有回放偏离/控制失败。贡献者读已建立 log/environment 句柄失败属于原 S-9/S-50 报错；**等待/回放控制层无法确认来源**属于 controlUnavailable，两者不能混淆。实现注销导致开始后失败仍按原报错策略；runner 自身撤除/业务取消则按实例/调用收口，忽略迟到 output。

绑定和新句柄始终在 finally 失效，之后读取必须失败且不返缓存；owner 消费迟到 Promise 的成功/拒绝、保留尚未停止的实际外部工作。释放访问句柄不宣称物理任务已停止；`replayBinding.release()` 关闭本次消费权，实际未结算工作仍归等待/执行 owner，不能借它丢责任。未开始便失败要释放已创建的 binding/句柄；pending 分支不创建执行句柄、不 invoke，也不建立后台轮询。

## runPass 逐分支执行

1. 核 pass/chain/端口与 LC6 准入，读取并捕获原结论前缀，核真实链的相同 name/次序；失败分别为 invalidInput/positionUnknown 或 replayInconsistent/unavailable。failure 位置完成同 prefix verifyFailure；没有合法 Run 的 after_model_call 在 invoke 前 invalidInput。
2. 构造两个明确投影：**完整历史**保留所有已确认 ask 轮次及 final，按链/各件历史次序返回 conclusions；**有效结论序列**每个已 final 的件只取 final，最后未 final 件才取其最后 ask，用于 composeEffect。earlier 只含前面各件的 final（S-10）。不能把旧 ask 与该件 final 一起直接交 composeEffect，导致已经回答的件仍停在 asked；也不能删日志历史或丢返回的原记录。
3. 链已完或 final 已终止：零 invoke，按原值补缺提醒后交效果。最后是 ask：先 readAskState；pending 原值 asked、零 invoke/零新 Conclusion/零新卡；ready 进入上述受控 replay；inconsistent/unavailable 无效果退出。必要先前提醒仍按 S-19 在交效果前处理，不能将“零 invoke”误写成“永不补缺提醒”。
4. 没有最终结论、也没有 ask 的下一件走 fresh；presence 不可读 unavailable，确定不可用走原处置；创建新句柄、完整校验 Input，再 invoke。重演使用相同 subject/earlier；不是把上一轮效果主体重复叠加。两个等不了位置上的 ask 仍为 LC6 表示拒绝，经原 onError，不误当受控 replayInconsistent。
5. 控制偏离/不可用先收场；正常 output 或普通错误完整经过 S-12～S-17 和能力判定。新 ask 用当前耐久 ask 序列的下一 ordinal、新 ask 稿形成新条目；final 用原 final 判重键。来源不可读、不合法内部输入或取消不得继续写。mint/now 仅用于这次真实候选，不能在 unknown 重认时重生成。
6. 所有 append 先登记长期 owner 后执行；confirmed/alreadyRecorded 的合法权威值才能交效果、推进下一件或 asked。竞争胜者是本轮确认的完整值，重新按其 ask/final 决定等待/推进，不把本地候选的卡片、时刻、提醒混入。提醒全部经原一层嵌套及同 ID 全值认回后才返回效果；任何失败保留已提交前缀。
7. 业务 signal 叫停 → cancelled，转给当前件，不开始下一件，不补提醒/交效果；实例失活或来源撤回按原 unavailable。已进入日志提交的工作仍跑完那一次提交并被 owner 观察，失败返回不宣称撤销。贡献者迟到结果不继续写；后续未知责任继续归 owner。

只读服务 `replay` 仍仅返回原 Conclusion[]：不调用 readAskState、invoke、发号、时钟、补提醒或卡片写入。本增量的等待就绪查询仅属于重复 **dispatch/runPass**，不可把服务 replay 变成恢复执行命令。

## 未知提交、竞争与失败主体原义务不变

继承 v5 的完整 `createRunnerTaskOwner` 候选责任：日志实际宿主持有，启动 read/append 前登记；closeAdmission 同步关入口但不取消已进日志提交；drain 等真实结果，unknown 不因 dispatch 已返回 unavailable 而释放；reconcileStoppedLog 只接受旧日志实际 close/可信进程退出并通过恢复准入后的同绑定读取闭包。恢复读同值认回本候选；异值先核合法竞争胜者，合法则采用原值，不能把仅 at 不同当坏记录。对实际 MessageId 同键异值仍 replayInconsistent，不能放宽成胜者接受。

unknown 留存对象包括完整候选、ask ordinal/final 键、会话/租户/旧绑定、execution 和完整提醒；新实例没得到可信停止/恢复结果前，不能据一次空读重跑或出新卡。真实恢复确认 absent 后，才沿原锚接续，不在 owner 内偷偷 invoke。共享日志的正确顺序仍为：宿主关各消费者入口 → 实际日志 close/物理停止并恢复准入 → reconcileStoppedLog → owner drain；不能先等 unknown drain 再触发消除 unknown 所需的 close。等待读取同样登记为读工作并消费 completion；执行工作由执行/等待 owner 持有到实际收口，不由 runner fiber dispose 消失。

同 prefix verifyFailure 原闭包保持：runtime 同一次完整 read 产生 interpretCallHistory、完整 retryConclusions 与 authoritativeSubject；同 session/tenant/callId、原 profile、全部 dispatches、cause/statusCode/inBand 和带重复原结论精确核验；错误混接 invalidInput，代际/使用权失效 unavailable。正常新追加不使旧 prefix 变假；这不是最新发送许可，仍必须 canDispatchAgain/dispatchAgain 各过自己的守卫。外层在 runPass 完成/取消后 finally release，未知 append 的日志任务引用不随它提前丢失。

## 存储、生命周期与共同对象

不新增数据表或数据库选择。runner 写者、另一个 runner、日志新尝试写者共同触碰同一会话的 **entries/tail、判重键唯一约束与 fence 判定域**；SL3/现 JSONL 的 entries.jsonl 是已提交权威，索引不是第二份事实。Conclusion+modelCallId+提醒副本仍同一日志条目；实际提醒仍由共享 MessageId 判重写入。原 v5 存储要求和 X5-1/2 原样适用。

本增量不声明“读卡片 readiness 与 runner 写 final 同一事务”。卡片/等待 owner 的完成与原答复是其耐久事实，runner 只获得受控读取及回放；自己的写仍由日志 fence/判重边界收场。卡片每轮创建唯一性归等待/卡片 owner，runner 不用本地锁或 tail 布尔值替代；没有真实 owner 组合不签收生产语义。

| 取得贡献／资源 | owner、可用时点、部分失败 | 撤除与保留 |
|---|---|---|
| 公共 runPass 调用、原 owned 输入与端口 | 调用方；校验成功后启动，失败不留半构造 | 返回结束本次控制，不删除任何耐久条目；失败前已进提交仍被长期 owner 持有 |
| ready replayBinding | 实际等待 owner；只有原 ask/卡片/批次/答复核对完成才返回 | 调用 finally 关闭访问；迟到控制结果由 owner 消费；原等待/卡片不删，未知来源不假称已答 |
| 本件新 log/environment 与调用控制 | runner 调用 owner＋执行适配器；初始化部分失败释放已建部分 | invoke 返回/取消后句柄失效；实际外部工作停止由其 owner 保证，不能因 abort 声称已静止 |
| 日志 read/append/unknown | 现候选长期 runner task owner；先登记再启动 | 关准入、真实停止/恢复、drain 的完整次序保留；生产宿主 G5 未闭 |

插件形状仍一 runner fiber/two services，必需日志 inject；没有新增等待 fiber/service。将来服务 dispatch 必须绑定同一 runPass，具体生产宿主、身份核实、Run来源、真实卡片等待、G3/G5 仍归各原 owner；不因公共函数端口完整而宣称实现。直接 await、依赖变更与清理的 basis 沿 v5 已列五项 4.0.4 证据；本增量不新增或重跑上游主张，撤除精确时序待核对限制不移除。

## 关键选择与缺口

| 选择 | 落选方最强论证 | 本方弱点／置信度 |
|---|---|---|
| 独立受控等待状态＋调用级 replayBinding | 扫描末尾 ask/answered 提醒可少一个 owner 端口 | readiness 来自另一事实 owner，接口须认真接线；高，提醒不能证明整批完成和卡片归属 |
| invoke 独立控制结果，偏离锁存并优先 | 一律 throw→onError 更简单，复用现错误处理 | 执行适配器需区分来源失败与贡献者错误；高，否则偏离会落新结论 |
| 复用纯构件，runPass 分离历史与有效结论投影 | 改 composeEffect 自动忽略旧 ask 可少一份投影 | runner 必须以 occurrence 解释历史；高，纯 Conclusion 没有轮次身份，不能靠同名值猜历史 |
| 保留长期 unknown owner 与受控恢复 | 返回 unavailable 即释放更省资源 | 不静止 provider 可阻排空；高，不能丢掉已进入提交口的真实责任 |

缺口和受阻消费者见 [V6 验证](verification.md#v6-公共-runpass-执行面)。这份映射不裁产品政策、不升规范版本、不签收服务、十三操作或任何模型认证。
