# 调用、人类请求与帧的不变式

[提案索引](README.md) · [生命周期](lifecycle.md) · [需求](requirements.md)

按[需求推导性质](../../architecture-guide/assurance/invariants.md#从目标与需求推导性质)：安全
性质说"永远不会"，进展性质说"最终会"。编号：T = 调用，H = 内建人类请求工具，F = 帧，
TP = 进展。已由 [agent-loop-inbound](../agent-loop-inbound/invariants.md) 与
[lifecycles](../session-run-agent-lifecycles/invariants.md) 提出并进入规格的 I-*、S-*、R-*、L-*
只引用不复述。证据列中"调用模型"指本提案波 3 的 TLA+ 模型；未执行的证据分别保留，
不表述为已证明。

来源缩写：TL = [tools v1](../../../spec/capabilities/tools/v1/contract.md)，
RD = [run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md)，
SE = [session v1](../../../spec/capabilities/session/v1/contract.md)，
RN = [run v1](../../../spec/capabilities/run/v1/contract.md)，
HD = [human-decisions v1](../../../spec/capabilities/human-decisions/v1/contract.md)，
BG = [budget-accounting v1](../../../spec/capabilities/budget-accounting/v1/contract.md)，
CT = [media-content v1](../../../spec/capabilities/media-content/v1/contract.md)，
MC = [model-execution v1](../../../spec/capabilities/model-execution/v1/contract.md)，
CC = [core-work-coordination v2](../../../spec/compositions/core-work-coordination/v2/contract.md)，
LC = [生命周期组合 v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)，
PF = [需求正文](../../requirements/README.md)，U = [用户裁决](README.md#裁决记录2026-09-14用户)。

## 调用

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| T-1 | 一次调用同一时刻至多一个活跃 attempt；新 attempt 只在前一个 attempt 终态或墓碑生效之后，且经政策与新的准入；一次人类批准不覆盖不同 attempt | TL-07/08、RD-16 | 执行 owner 的 attempt 账本；tools 提交面的 admit | 调用模型 |
| T-2 | 每次终态恰一次进入 Inbound（来源级 dedupKey = `(call, attempt)`），恰被消费一次；费用与效果随 attempt 归原调用与来源 Step，不改挂新 Run | SE-12/13、BG-03、PF-019 | `prepareTerminal` 与 Inbound accept 同批；消费事件引用 eventId | Inbound 模型（去重、单次消费）；调用模型（结算恰一次发出） |
| T-3 | stop 单调：墓碑生效后不再有新步骤与新 start；迟到 start 在产生任何外部效果之前被拒；终态与 stop 竞争按真实先后，已完成的成功不被改写为中断；stop 只作用于原 call/attempt | TL-08/09、PF-003.C3 | owner 的同一接纳账本排序 start 与 stop | 调用模型；迟到 start 注入 |
| T-4 | 调用从实际启动起由独立执行 owner 拥有，Run 与调用的生命周期错位：实例退役、崩溃、Yield、归档与 Run 失败不隐式取消也不隐式重启已准入的调用，只释放等待位置，结算按 SE-14 在新 Run 接上；转换只改变等待关系，不创建新调用、不重启工作 | TL-07/10/11、LC-04 行 1/6/7、PF-003.C4/C6、决定 f、U-43 | 准入时绑定 owner；驱动器视图只读；调用状态耐久于 tools 流 | 调用模型（OwnerCrash / Archive / RunFail 动作后已准入调用状态不变：ArchiveKeepsWork、FailKeepsHuman、TerminalRunOnlyBackground）；Yield 与 force_stop 不建模，用场景 TS-11 与 run-driver 场景 |
| T-5 | 无接纳证据不产生外部效果；恢复不对已耐久 dispatched 的 attempt 重发；dispatch 不明只 inspect/收口，不重新发出 | TL-08、RD-16、CC-04 | owner 在真实 I/O 前写 accepted 与 dispatch_intent | run-driver 模型 I-24；LE kill 探针；调用模型 |
| T-6 | 参数在准入点冻结，之后任何站点（含 hooks 兼容层）不可改写；未完整通过具体命令校验的参数不产生 Action，未知命令或多余参数不落默认 handler；守卫只能收紧 | TL-01/13、RD-17、PF-025.C1 | `proposeCalls` 的完整校验；守卫返回值封闭 | Ajv profile 单测；run-driver 场景 S20 |
| T-7 | 别名只经原 manifest 解析；同名新版本不接管旧请求返回的调用；已准入调用保留原实现闭包直到排空，突发依赖丢失结算 unavailable/unknown 而不无声换实现 | TL-02/06、PF-014.C5 | manifest 绑定；registration generation | 场景 |
| T-8 | 多命令工具在 manifest 恰占一个槽位；调用、过程、费用与审计能定位到具体命令 | TL-01、PF-024.C2 | manifest 派生 | 单测 |
| T-9 | 系统发起的一次性批准恰一次消费，新 attempt 不能消费旧批准；Agent 发起的 `request_approval` 答复只是耐久在历史里的提示词，不被任何门消费、不建立 standing permission，之后的受控动作照常过系统门 | HD-06、RD-11、PF-005.C2/C10、U-44 | system_approval：`prepareConsumeDecision` 与调用准入同批；agent_approval：无门消费路径（[命令表](lifecycle.md#内建人类请求工具)） | run-driver 模型（system_approval）；场景 TS-14 |
| T-10 | 归档/删除后到达的结算按 SE-14 D2 列关闭，不开新 Run；结果引用按数据治理保留，不静默丢弃 | SE-14、决定 f | Inbound 裁决 | Inbound 模型 ArchiveClean |
| T-11 | 前台上限的有效阈值 = min(声明, 系统上限)，与 Run 无关（U-45）；单次转换失败保持前台关系并报告原因；`keep_waiting` 的调用只由自然结束或用户 stop 结束；等待人类的时间不计入执行时长 | TL-10、PF-003.C5、U-45 | 调用运行时的计时与转换决定（决定 n） | 场景 TS-16（模型不建模时间；Detach / StopRequest 作为无标签触发） |
| T-12 | 工具产生的媒体只有 CT 引用耐久后才进入历史与结果；模型投影只含目标模型能消费的模态，其余以引用与文字说明进入；用户展开帧不等于向模型注入 | CT-02/04、MC-11、TL-12、PF-022.C5/C6 | `prepareTerminal`；投影选择 | 场景 |
| T-13 | 调用级 `detach` 参数不越出定义的 `startModes`，也不能否决定义声明的 `onLimit`；不可兑现的能力（后台、停止、帧）不能被声明，未声明的不能被调用 | TL-08/10/12、决定 j、ab | 参数校验；装载时核实 owner 能力 | 单测 |
| T-14 | 一个调用的最终结果恰一次进入模型：该 tool_use 未占位则作为它的 tool_result，已占位（deferred_receipt）则作为一条 `system_reminder{late_result \| human_answer}`；system_reminder 只由驱动器从已裁决 arrival 产生，不能由用户输入导入 | RD-09/10、CD-03、决定 ac、PF-003.C4 | 驱动器的投影规则（[占位与迟到结果](lifecycle.md#占位与迟到结果的投影)）；CD 块来源规则 | 投影单测；场景 TS-06 / TS-12 |
| T-15 | 复合打断（interrupt_then_run）在旧 Run 进终态 `superseded` 的同一提交整簿注销等待登记：无残留 continuation，幸存的开放调用与请求不再是任何 Run 的阻塞者；其后的结算与答复按登记簿查表对当时的活动 Run 路由（作者裁决 3） | RN-04、SE-08、SE-14 | Run 提供者的同批提交（`prepareCloseOut{superseded}`）；Inbound 的改判 | ToolCall 模型 `SupersedeReleasesPositions`、`SupersedeKeepsWork`；场景 TS-20 |
| T-16 | 同一媒体引用在耐久记录里以结果 `content` 的块为准、帧只是过程预览；客户端按 `mediaId` 去重、不双份呈现；工具生成媒体的引用记录产生它的调用与 attempt（作者裁决 6） | T-12、PF-022.C5、CT-03 | CT 引用的来源记录；投影选择器只选不改 | 投影单测；场景 TS-22 |
| T-17 | 等待登记簿是"Run 在等谁"的唯一权威：登记与注销和 holder 自己的事实同一提交；只有本 Run 准入的对象能登记；Run 处于等待当且仅当 Step 已收束且登记簿非空；到达的结算或答复是 continuation 当且仅当它注销了活动 Run 上的一条开放登记；调用上的等待关系是登记簿的投影（U-59，[等待登记簿](lifecycle.md#等待登记簿)） | RN-01、RD-11、SE-14、TL-10、HD-03 | Run 提供者的登记簿与同批提交；tools / HD 只投影不另存 | ToolCall 模型的 `rel` / `Blocking` / `Route` 即按调用投影（行为等价）；Run 提供者单测：登记与 holder 事实同批、非准入对象登记被拒 |

## 内建人类请求工具

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| H-1 | `human` 调用恰被一次答复结算；请求创建与调用准入在同一提交，答复与调用结算在同一提交；答复前崩溃、退役或 Yield 不丢请求、不重复请求 | HD-03/04/08、U-41 | HD 作为执行 owner 的 start 与 answer | 调用模型（`human` 种类）；崩溃注入 |
| H-2 | 等人期间该调用的视图 `waiting_human` 不阻止 Step 收束、不阻止 Yield；答复后重取或开 Step 时，模型恰一次看到答复：未占位则作为该 tool_use 的 tool_result，已占位则作为一条 `system_reminder{human_answer}`（T-14） | RD-09/10/14、U-41、决定 ac | 视图词表；投影规则 | 调用模型（RunWait 允许 human_wait；RunComplete 不允许）；场景 TS-12；投影单测 |
| H-3 | Run interrupt、interrupt_then_run 与不可恢复失败都保留请求（失败后答复按 SE-14 C 列触发新 Run 接上，U-43）；只有 cancel / force_stop 与用户单次 `stopCall` 同提交关闭请求并结算调用；迟到答复返回当前结果，不生成 arrival | HD-02/04、RN-03/04、SE-14、U-43 | HD.answer 的当前状态核对；Run 收口协议 | 调用模型（InterruptKeepsHuman、FailKeepsHuman；RunCancel / StopRequest 的 Cascade）；HD 场景 |
| H-4 | 提问不消耗执行预算，费用来源为零；请求不设自动超时或默认答案；热宽限到期只回收实例 | PF-005.C5、HD-03 | BG 零费用来源；HD 请求策略 | 场景 |

## 帧

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| F-1 | 帧序号在 attempt 内单调，生产者身份在 attempt 内稳定；同键同内容重试认回原帧，同键异内容封锁该通道（该生产者后续帧被拒并记诊断；若受影响的是 critical 帧，attempt 不能报 succeeded，只能报 `failed{record_incomplete}`）；裁剪、崩溃丢失均以明确缺口表达 | TL-12、[frames 草案](../tool-system/v1/frames.md) | 执行 owner 的生产通道 | 场景 |
| F-2 | 终态与帧分开：关闭生产通道后才报终态，进度 100% 不代表成功；必需记录未确认时结果显示待核实，不伪造失败重试动作 | TL-12 | owner 收束顺序 | 场景 |
| F-4 | 耐久帧与同一 Session 的日志在同一协调域 append-only 追加，按 `(frames(S), seq)` 可回放且与消息顺序可对齐；transient 只由显式声明产生，回放不冒充完整 | U-42、DR v1 | records 的 `frames(S)` 流；owner 到 records 的回执 | 回放测试；崩溃后未回执帧标 `unconfirmed` 的注入 |
| F-3 | 帧、调用状态与控制的读面都按当前读权裁剪：每订阅独立游标；投递前再次核对当前读权；撤权结束订阅效用而不停止工作；跨租户不泄漏存在性 | TL-12、PF-003.C1、SYS-TENANT | 读面（`readFrames` / `subscribeFrames` / `inspectCall` / `readControl`） | 场景 |

## 进展

| 编号 | 陈述 | 来源 | 说明 |
|---|---|---|---|
| TP-1 | 执行 owner 存活且公平调度下，前台调用最终结算或被收口处置为终态之一；unknown 也是终态 | 复用 P-1 | 等待人类与门恢复不计 |
| TP-2 | 已受理的 stop 最终得到真实停止、隔离或未知三者之一的回执；不停留在无记录的中间态 | TL-09 | 与 LP-4 同型 |
| TP-3 | 后台调用的终态最终作为 arrival 被裁决并按目标 Run 状态处置（接续、trigger 或关闭） | SE-14、LP-3 | 裁决者扫描兜底 |
| TP-4 | `human` 请求最终由首个合法答复结算或被显式关闭；系统不替用户定夺 | PF-005.C5、HD-03 | 条件进展：依赖人类答复，不设超时 |
| TP-5 | 已请求的 detach 在 owner 存活下最终得到确认或失败回答；失败保持原关系并报告 | TL-10、RD-13/14 | Yield 与 interrupt_then_run 依赖它；模型 WF(DetachConfirm) 下由 CallsSettle 间接覆盖 |

## 证据义务

- T-1、T-3、T-4、T-5 与 H-1～H-3 是接受本提案前须由调用模型覆盖的条目；模型实际范围
  为五个维度、`human` 调用种类、执行 owner 崩溃与恢复、Run 的 interrupt / cancel / 不可恢复
  失败与归档级联、Inbound 交接；不建模 Yield、force_stop 的 epoch 撤销、interrupt_then_run、
  时间与预算（[证据说明](evidence/README.md)）；单配置 8 核 ≤ 1 分钟；活性只在小配置检查。
- T-2、T-10 复用 Inbound 模型；T-5、T-9 复用 run-driver 模型；不重做。
- T-6～T-8、T-13、T-14 是结构性质，用 Ajv profile 与投影单测；F-1～F-3、T-11、T-12 用场景。
- 崩溃窗口按 [恢复窗口](lifecycle.md#恢复窗口) 逐窗口注入。本提案接受不等于这些性质已被证明。
