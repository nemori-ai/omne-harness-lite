# Run 驱动、等待与结算场景

本表是规范场景，不是已执行实现测试；模型覆盖与刻意未覆盖项见验证说明（legacy source: `../verification.md`）。
条款编号按本版契约（legacy source: `contract.md`），跨能力规则按 session v2（legacy source: `../../session/v2/contract.md`）（SE）、
run v2（legacy source: `../../run/v2/contract.md`）（RN）、tools v2（legacy source: `../../tools/v2/contract.md`）（TL）、
human-decisions v2（legacy source: `../../human-decisions/v2/contract.md`）（HD）、
model-execution v2（legacy source: `../../model-execution/v2/contract.md`）（MC）与
生命周期组合 v2（legacy source: `../../../compositions/session-run-agent-lifecycles/v2/contract.md`）（LC）。
证据列的模型动作与性质指 RunDriver.tla（legacy source: `RunDriver.tla`）。

| 编号 | 初始条件、动作与可观察结果 | 规则 | 证据 |
|---|---|---|---|
| S01 文本批开 Run | 队首两条连续文本；takeBatch 建 Run、占位、epoch 同提交；首个 Step 切点恰为该批；后到文本按 S21 处理 | RD-04/06；SE-06；LC-04 行 3 | `OpenStep`（Cur = 0）；提供者验收 |
| S02 trigger 分隔 | 队列为文本、trigger、文本；takeBatch 只取首段；takeTrigger 一项一 Run；trigger 来源失权时结算 closed 不跳过 | RD-04；SE-06/15 | `TakeTrigger`；提供者验收 |
| S03 前台调用不阻止收束 | 批内一个前台执行调用；attempt 已结算、提议已登记 → Step 收束、Run `waiting`（登记开放）；驱动器缺省等该登记注销再开下一 Step；detach 确认注销后以 `deferred_receipt{detached_background}` 开下一 Step | RD-09/10；RN-01 | `SettleStep`、`Wait`、`Detach`、`OpenStep`；I25 |
| S04 单一消费路径 | 调用在工具权威已终态但 arrival 未裁决；视图为 settling、登记仍开放；裁决为 continuation 的同一提交注销登记，结果在下一 Step 呈现恰一次 | RD-09；SE-13/14；RN-01 | `SettleCall` → `AcceptSettlement` → `Adjudicate`；I9、I23、NoDouble |
| S05 收束后批准 | 待审批调用的 Step 已收束、Run `waiting`（投影为等人）；批准到达 → 消费批准并 start，不开新 Step，登记保持开放；结算后作为接续开 Step | RD-11；RN-02 | `AdmitApproved`；P1 |
| S06 批准与接续同时就绪 | 审批型决定与某个调用的结算同时 classified；先消费批准，再以结算开 Step | RD-06/10/11 | `CanOpen` 的 `ReadyApprove = {}` 前提；`AdmitApproved` |
| S07 预算门 | 预留被拒于模型准入/调用过门/批准消费三处之一；驱动器登记门 `(budget, E3 \| E4 \| E4A)`，Run 的 `waitingFor` 显示等门；gate_restored 到达后注销该登记并返回原点重做准入；resume 复核门后重取 | RD-08/09/11/12；RN-01 | `GateBlockE3/E4/E4A`、`WakeGate`；I24、P1g |
| S08 依赖门 | 开 Step 所需绑定不可用；登记 `(dependency, E1)`，不取入补充批；调用级绑定撤回则结算 unavailable 不等待 | RD-06/12/18；TL-06 | `GateBlockE1`；I24 |
| S09 Yield 与重取 | 运行时退役且本批无 `foreground` / `detach_in_flight` 登记、无已过门未 start 的调用；epoch 封闭、占位保留、Run 状态与登记簿不变；调度不能开新 Run，只能以新 epoch 重取并从投影位置继续 | RD-14；SE-15；LC-07 | `Yield`、`Reacquire`；P1y、Hist |
| S10 等人不阻止退役 | Run 在等内建 `human` 调用的答复（关系 `human_wait`）时运行时退役；Yield 成立；答复到达后由重取的驱动器消费 | RD-14；HD-04 | `Yield`（`c \notin HIds` 前提）；`RunDriverProgressHuman.cfg` |
| S11 强制退役 | 热宽限到期仍有前台登记；按 interrupt 收口，记 yield_forced，占位随状态派生释放 | RD-13/14 | 提供者验收 |
| S12 终态晚到 | Run completed 后后台调用结算；arrival 裁决为 queue 的 trigger，开新 Run，其首个 Step 以 `system_reminder{late_result}` 呈现；cancelled 的 Run 同类结算 closed(cancelled_run)，stopping 的 closed(isolated) | SE-14/17；RD-09/15 | `SettleRun` + `ConvertOrClose`；I14、I22 |
| S13 结算与接续同提交 | Run failed 时存在未消费 continuation；同一提交转为 trigger 并记 converted；崩溃于其间恢复后仍恰一次 | SE-17；RN-09；LC-04 行 4；RD-16 | `FailRun` + `ConvertOrClose`；I14（否定变体 splitSettle） |
| S14 失败不处置已准入调用 | Run 因不可恢复失败结算：未准入调用得 cancelled_before_execution 且审批请求关闭，已准入调用与未答请求继续；终态提交整簿注销；其结算此后按 C 列开新 Run 接上 | RD-13；RN-02；SE-14 | `FailRun` 的 `FailCalls`；I22 |
| S15 恢复不重发 | attempt 已准入未耐久 dispatched 时崩溃；恢复判定未发出，旧 attempt cancelled、新 attempt 新准入；已耐久 dispatched 时不重发，查询或按政策新 attempt 并保留费用暴露 | RD-16；MC-04 | `Crash`/`Recover`；I18（否定变体 sendEarly） |
| S16 start 窗口 | 准入后 owner 未回执 start 时崩溃；同 attemptId inspect；owner 无此 attempt 且许可有效则同 ID 重发，不产生第二个 attempt | RD-16；TL-08 | I18（`starts <= 1`） |
| S17 未裁决 arrival | 受理后裁决前崩溃：恢复先校验完整前缀并 fold 裁决视图，再把 accepted arrival classified；只有扫描完成且兼容/资格仍成立，最终联合准入才发行新 epoch 与 WorkPermit 并进入 decide | RD-04；SE-11/18；RN-08；LC-08 | `Reacquire`/`Resume` 的 `~Unadjudicated` 只覆盖扫描屏障；完整前缀、兼容与发行顺序由提供者验收 |
| S18 系统复合打断 | 连接器条件触发且配置为 interrupt_then_run；旧 Run 收口后进终态 `superseded`，整簿注销，未消费 continuation 改判 context，待批准调用 cancelled_before_execution；新 Run 首个 Step 以 `system_reminder{system_notice}` 交代被保留的工作清单 | SE-08；RN-04；RD-06/13；SE-14 | 未建模（见验证说明）；提供者验收 |
| S19 命令 Run | 队首有序命令；命令处理者结算 success → completed；unknown 保留占位可见；上下文装载型命令随文本项进入模型；命令 Run 不消费 `system_notice` | RD-05/06；SE-07；RN-06 | 提供者验收 |
| S20 context 不唤醒 | Run 在 `waiting` 时被动订阅内容到达；只推进水位，不唤醒；下一次开 Step 时按水位可见且去重 | SE-13/16 | 未建模（context 意图不建模） |
| S21 等待期间取入文本 | Run 在等前台调用（Step 已收束、登记开放）时用户追加普通文本；同一提交 `queue.items.taken{into}` + `run.step.opened{cutpoint: [用户文本, deferred_receipt{foreground_pending}]}`；模型回复后 Step 再次收束、登记仍开放、Run 回到 `waiting`；该调用结算到达时以 `system_reminder{late_result}` 呈现；队首是 command / trigger 或 Session hold 时不取入 | RD-10/11/18；SE-06/15 | `SteerOpen`（`MaxSteer = 1`，核心配置）；I9、NoDouble |
| S22 占位首次呈现即开 Step | 批内唯一调用转后台（或等审批、等人）、没有别的可喂给模型的内容；驱动器开下一 Step，切点只有该 tool_use 的 `deferred_receipt`，模型据此决定继续推进还是停下来等；该占位已呈现过则不再触发开 Step | RD-09/10；CD v2 | `OpenStep` 的 `NeedPh # {}` 分支与 `MarkShown`；I9 |
| S23 晚到结果恰一次 | 调用已占位后其结算被裁决为 continuation；结果以 `system_reminder{late_result, ref}` 进入到达的 Step，只引用已耐久结果、不复制正文；同一调用不再出现第二个 `tool_result` | RD-06/09 | `NoDouble`；投影验收 |
| S24 无效提议收口 | attempt 成功但整份提议不能形成合法 Action；tools 不登记任何 proposed，Step 以 `run.step.settled{invalid_proposal{reasons}}` 收口；被拒片段带 `rejected{reason}` 与原始参数进历史；本 Step 不新增等待登记 | RD-08；TL-01 | `InvalidProposal`（`AllowInvalid = TRUE`）；I26 |
| S25 守卫只能关闭 | 受理成功的队列项在取用前被守卫判为 close：同一 take 门内提交 `queue.item.closed{closed_by_guard}` 与 `inbound.arrival.closed{closed_by_guard}`，继续下一队首；守卫超时或输出非法一律放行并记录；守卫尝试改写文本、参数或阻止 Run 结算均被拒 | RD-17；SE-12；HK-02、HK-07 | 未建模（守卫不建模）；提供者验收 |
| S26 force_stop 隔离门 | A 的调用已 `settled(unknown)` 但 exposure 仍 open；A 由 interrupted→stopping且不占位，B 已运行。barrier 不撤销 B，但阻止向 B 取 supplement 及 B 后启动 C；错代/迟到/重复/重启前未认回的证据都不清门。owner 给同 call/attempt/owner generation/fence 的 quiescent/强隔离证据后才 cancelled，barrier 消失；Session force_stop 的用户 hold 仍保留 | RN-05；RD-13；SE-06/09/15 | 现有模型未覆盖 exposure 集合、非占位 stopping 或 barrier；交给 round-2 formal/provider 验收 |
| S27 首次创建与 epoch | take 与 `run.lifecycle.created{basis,...}`、`run.epoch.issued{e1,driverBinding,compat}` 同 batch；created 不含 epoch | RN-01、LC-04 行3 | provider/codec 验收；旧模型未固定事件 payload |
| S28 Yield 后重取 | Run owner preparation 对已 closed e1 只引用原 `closed{yield}`，与 AR WorkPermit 合并提交唯一 `issued{e2}`；Run state 不变。组合者不写 Run facts | RN-01/08、RD-14 | owner guard、lookup/幂等与 stale e1 提交验收 |
| S29 interrupt 后 resume | resume 复核资格并总是取得 successor：e1 已 closed 则引用原 close；若 waiting 路径旧 epoch 仍 open，则 owner 以 `reacquired` 唯一关闭。owner preparation 与 WorkPermit、`state.changed{→running}` 合并提交，不写第二 created；active terminationIntent 硬拒 | RN-01/03/08 | provider/恢复验收 |
| S30 crash 旧 epoch | crash 后 e2 已 issued；e1 holder 提交 Step/settle → `rejected(stale_epoch)`，OB/DR evidence 记录隔离事实，Run 流无 late_fact | RN-01/02 | 负例与审计 owner 验收 |
| S31 issued 回执丢失 | e2 发行 batch 已提交但调用方未收 receipt；恢复 lookup 原 operation 返回 e2，不创建 e3 | RN-01/08、DR-02 | operation lookup fault injection |
| S32 门恢复与终态词表 | gate_restored arrival 与 wait.released 同 batch，无 gate.returned；所有 Run facts 来自 Run owner effect-free preparation。open epoch 的 terminal 由 owner给匹配唯一 close；已 closed 只引用原 close；reacquire/resume 对 open old epoch 以 reacquired 唯一关闭后 issue。CC submit 重核 owner guard，组合者不能改 facts | RN-01、RD-13、LC-04 | schema/decoder、duplicate-close/consumer-authored-fact mutation tests |
| S33 Run append revision | 首次 `created + epoch.issued + state.changed` 是 run(R) 的一个 owner append，三个 facts 共享 revision=1、eventId 的 recordIndex 各不同；随后 expectedRunRevision=1 接受，=3 冲突 | RN-01、DR-01、RD-13 | codec/Run owner guard/重启 fold 对照；新协议未建模 |
| S34 跨流 canonical 与同批引用 | Session/Run 准备顺序互换，组合者按 StreamRef canonical 排唯一 appends，保留各流内部次序；两次得到相同 flatten envelope/eventId。prepare 临时 correlation 不进入 durable eventId，同批 `{kind:this_batch,stream,recordIndex}` 在 commit 后解析到同一最终位置 | RN-01、DR-01、CC-01 | codec/owner组合/consumer 引用测试；新协议未建模 |
| S35 required owner root 失败 | 同一完整 watermark 的 Session root 已恢复，Run root 失败或旧 owner generation 到达：基线不可见、域不 reopen；迟到旧 host ack 也不推进新代 | RN-08、CC-06、DR-03 | 多 owner fail injection；新协议未建模 |
| S36 publication blocked 后恢复 | 旧 operation committed 但 publication=blocked；新代验证全部 roots、旧 ExactUse/claim 与 writer epoch，原 completion 原件不变。新 lookup 可报 consumable+baselineRef，不重发事实/广播/receipt，外部 attempt 经当前资格、墓碑和 inspect 而非自动重试 | RN-08、CC-05/06、DR-03 | crash/lookup/外部 attempt 去重故障注入；新协议未建模 |
