# 独立评审 r2：规格就绪判断

评审对象：本提案修订 `439a4da`（r2）。评审者：architecture-reviewer（只读，手工推导，未运行工具）。评审日期：2026-09-14。比较基线：[评审 r1](review.md) 及其处置记录。

结论：**有条件闭合**。三处需在写规格前做取舍（X1 Yield 占位、X2 waiting_gate 进入与返回、X3 同一事实双消费路径），其余可在规格撰写时以条款封闭。第 5 节为可改写成可运行模块的 TLA+ 模型。处置见末尾"处置记录（r3 修订）"。

---

# 评审 r2：P-agent-loop-inbound（`439a4da`，draft）— 规格就绪判断

评审对象：`/data/qiwei/repos/omne-harness-lite/.worktrees/dsh-e-loop-inbound/docs/proposals/agent-loop-inbound/{README,loop,inbound,invariants}.md`，修订 `439a4da`（工作树 `.git` 指针 → `refs/heads/design/dsh-e-loop-inbound` = `439a4daaac…`，已核对）。比较基线：同目录 `review.md`（r1，对象 `bce30a0`）及其"处置记录（r2 修订）"。需求基线与消费契约同 r1（catalog 确认 session-run/tools/human-decisions/model-execution/live-agent/durable-records/CC/core-work 均为 accepted v1，另核对了 command-input v1 与 budget-accounting v1，因 EC 与 `gate_restored` 依赖它们）。
范围：r1 处置核对、新节点闭合、裁决表、形式化推导 r2、规格就绪、契约影响。不复议 U-1～U-16，不评措辞格式。全部为手工推导，无工具执行。

## 1. 结论

**有条件闭合。** 框架（事实在权威处、位置是投影、意图封闭、Session 级裁决、E7 分终点、E8 同提交）已稳定，r1 的五项阻断都在正文成立；但仍有三处需要在写规格前先做小的设计取舍，它们不改变拓扑，却决定新版本 session-run 与 run-driver 的几条核心条款怎么写：

1. **`Yield` 释放占位但 Run 状态不变**，使 Session 级调度可在同一 Session 启动第二个 Run，原 Run 无人再取得（X1）。
2. **`waiting_gate` 只有 E6 一个落点，没有进入边和返回点**；`gate_restored` 没有任何已接受契约生产它；依赖缺失按 U-13 停在调用级与 TL-06 "unavailable，不在新提供者上无声恢复"冲突（X2）。
3. **同一事实有两条消费路径**（TL 结算视图 vs. `call_settlement` arrival；HD 拒绝 vs. `human_answer`），"不双投"在裁决与 E5/E1 交错时不成立（X3）。

其余缺口（裁决表四处修正、EC 与 IN-01 对齐、U-15 与 SR-12 的范围声明、词表与出边补全）都可在规格撰写时以明确条款封闭，清单见第 6 节。

## 2. r1 处置核对表

| 发现 | 判定 | 理由 |
|---|---|---|
| B1（G1）E7 五终点 + E8 同提交 | **成立** | loop.md E7 表按原因给出 interrupted / interrupted+superseded / E8 cancelled / E8 cancelled(force_stopped) / stopping / E8 failed / Yield；E8 按终态原因转换，与 inbound.md D 列、I-14、SR-10/11/12、HD-04、CC-06 一致。新矛盾：D 列把"Run cancelled"与"Session 归档/删除"合并成一列，但 SR-02 归档要求无非终态 Run 且封闭输入，`connector_condition`/`schedule_due`/`cross_session_message` 在 D 列给 `queue` 对归档 Session 不成立（见 4、8-M4）。 |
| B2（G2）E4A / U-12 | **成立，附一处未定义** | E4A 按 HD-06 再核对→共同准入消费→`start`；收束后调用作为 E6 等待位置，与 TL-07"Run 只持有前台等待关系"、I-9（收束后经 E4A 启动的调用不属于该批）、I-22 自洽；HD-06 消费路径闭合。未定义：E5"收束，有模型可消费接续 → E1"与"审批就绪"同时成立时，E1 的切点集合是否排除审批型 continuation（若不排除，E1 会把审批标为 `consumed`，E4A 永不发生；若排除，E4A 被推迟一整个模型 Step）。见 8-M9。 |
| B3（G3）按提交种类派生 operationId | **成立** | `f(RunRef, stepId, commitKind, ordinal)` 与 DR-02 相容：同 op 异输入只可能在前缀已含该 op 时出现，而 E0 第 2 步重同步后 fold 不会重算已存在的提交。I-18 改为按 attempt 计；两项提供者义务写入恢复一节。规格时需补：`takeBatch/takeCommand/takeTrigger` 与 Session 级调度的 operationId 派生（不在 `f` 覆盖内）；Run 级提交（`settle_run`）的 stepId 取值。 |
| B4（G4）同提交原子性 | **成立** | E8 与 inbound.md"与 Run 终态的协调"均写为同一提交并作为 E8 动作前提；Inbound 归 session-run（U-16）后与 Run 终态同权威，不需要 CC-01 新增原子组合。 |
| B5（G5、G6）词表 + E5W | **部分成立** | 八值词表与 E5W/`AwaitCalls` 成立，SR-08"等待结算"边界有了显式节点。未处理：缺省串行下 `proposed_pending_gate`"前一个结算后再过门"——前一个若转后台（`detached_background`，长期不结算），后续调用永远停在 `proposed_pending_gate`，Step 不能收束，U-3 的提前开 Step 失效（8-M6）。E5W 的唤醒条件只写"收到结算"，detach 确认、过门、start 回执这三种解除阻止的变化未列（8-M10）。 |
| M1（G7）E2 前移到准备阶段 | **成立** | 切点在 E2 之后一次冻结，E2 不消费 arrival，每次准备最多一次，失败/仍超限 → E7 failed(context_overflow)。MC-10 的政策只覆盖切换场景，Run 内压缩政策由 run-driver 规格自有，MC v1 无需修订（模型执行端 MC-03/04 已允许压缩作为辅助工作）。 |
| M2（G8）schedule_due | **成立，附一处不一致** | 按 U-14 原 Run 先结算，Run 不再等待到期项，死锁消除。不一致：D 列"若原工作被人取消 → closed"要检查的是**原工作**的终态，而 `observedRun` 规则对无 `refs` 来源取"当前占位 Run"；两者不是同一个 Run。规格须给 `schedule_due` 一个 `originWork` 引用并说明 D 列按它判定。 |
| M3（G9）子代理走 `call_settlement` | **部分成立** | Run 发起的 delegate/spawn/handoff 结果路由闭合（A 续、B context、C 触发）。两处未闭合：(a) 定时派发（PF-004.C7）的派发调用在 WorkRef 下创建，不属于本 Session 任何 Run，master 忙时按 B 列得 `context`，违反 C7"作为唯一且可恢复的新输入触发原 master；忙碌会话按有界待处理输入接续"（应为 `queue`）；(b) "前后台关系、detach、晚到结算全部沿 TL-10/11"与 SR-12"结构化后代、脱离委托和 handoff 的传播交给 PF-004 专属关系，不从后台工具策略推导子 Agent 权限或终止规则"冲突——U-15 只能覆盖结果路由，E7 对派发调用的处置须按 PF-004 关系而非 TL-09/10 通用策略。 |
| M4（G10）帧不是 arrival | **成立** | |
| M5（G11）Session 级裁决者 | **成立，附一处待定** | I-21 拆分正确。"Session 恢复读取时先裁决"对空闲 Session 仍依赖"有人读它"；进程重启后若无人读，`accepted` 项停留。规格须把"启动时扫描所有含 accepted arrival 的 Session"列为提供者义务（I-21 进展侧的前提）。 |
| M6（G12）waiting_gate + gate_restored | **部分成立** | 政策按 U-13 落地，但机制不完整：预算/依赖门在 E1/E3/E4/E4A 四处被命中，正文只画了 E6 等待，没有进入边，也没有唤醒后的返回点（E6 三类出边都回不到 E3 attempt 或 E4 调用）；E5 把因预算停在 `proposed_pending_gate` 的调用路由到 E5W，而 E5W 只订阅结算，`gate_restored` 对非 waiting_gate 的 Run 又裁决为 `context`，Run 永不唤醒。`gate_restored` 的生产者在 BG v1（BG-04/06 只说"影响下一准入"）和 TL v1 里都不存在。见 X2。 |
| M7（G13）E3 出边、E2 上界 | **成立** | 规格时需定义多 attempt（含 partial）时 Step 的权威模型输出。 |
| M8（G14）unknown 进模型 | **成立** | 与 SR-14 的解释合理："系统侧依赖决定保持阻塞"由 HD-06/BG-03/HD-12 各自承担。 |
| M9（G15）observedRun | **部分成立** | 消除了 r1 3.17（interrupted Run 不持占位，取占位 Run）。新问题：`Yield` 释放占位后无引用来源取到 `none` → C 列 → `queue` → 调度启动第二个 Run（X1）；`stopping` Run 持占位，其自有调用晚到结算按 B 列得 `context`，与 SR-12/TL-09"旧结果只作隔离证据"冲突（8-M7）。 |
| M10（G16）Yield | **不成立** | 定义了"释放占位，Run 状态不变"，但这与 SR-06"无活动占位方可建新 Run"、PF-013.C7"单个 Session 同时最多一个活动 Run"组合后产生两个 running Run，且没有任何动作重新取得被 Yield 的 Run（P-1 失效）。见 X1。 |
| M11（G17）EC | **部分成立** | EC 路径存在，但"声明进入模型的命令（PF-009.C6 上下文装载型）由处理者产出切点后进入 E1"与已接受的 IN-01 冲突：IN-01 规定上下文装载型意图**随同一普通输入耐久排队／取批**（即走 `takeBatch`，是文本批的一部分），只有"系统控制/有序命令"按自身操作进入 SR 协议。EC 应只处理 SR-07 有序命令；E1 的文本批 basis 须包含随批的装载意图。EC 的结算词表（success/rejected/failed/unknown）到 Run 终态的映射、unknown 时占位保留、命令执行中的控制（SR-07"即时控制不排队"）均未列。 |
| M12（G20）I-11 | **成立** | |
| M13 resume 走 E0 | **成立** | |
| S1～S11 | **成立** | 逐项核对：`delivered` 已删；前提措辞；恢复表措辞；同提交；I-5 限定范围；裁决 opId 从 arrivalId；四种回传策略（但见 8-M5）；SR-13 projection；分区行；P-4 豁免；水位 owner（但"持续可见"与"各自记录消费到的水位"的关系需一句定义）。 |
| 政策 1～6 → U-11～U-16 | 已记入 README | 后果见各节，不复议。 |
| 证据缺口 | 保留 | invariants.md 证据义务列出需补的模型范围；本轮仍无 TLC 结果。 |
| 租户（PF-017.C3） | **成立** | 受理时检查、不泄漏存在。 |

## 3. 新增节点闭合论证

约定：Rm = 指向本 Run 的已裁决、模型可消费的 continuation；Ra = 审批型 continuation；Rg = 门恢复 continuation；Ctl = 全 Run/Session 控制。

**EC 命令处理者**

| 组合 | 出边 | 判定 |
|---|---|---|
| 有序命令 success，无未知效果 | E8 completed | 闭合 |
| rejected / failed | E8 → ? | 未定义终态映射（failed？）；SR-07 只说"独立失败结算后可继续下一项" |
| unknown / hold | — | 未定义：SR-07"不可冒充可继续"，Run 应保持占位并可见；正文无节点 |
| 上下文装载型命令 | E1 |

| 上下文装载型命令 | E1 | **与 IN-01 冲突**：装载意图随文本批 `takeBatch`，不是 `takeCommand` 项；EC→E1 这条边在契约下不存在 |
| 命令执行中收到 interrupt/cancel/force_stop | C→E7 | E7 协议（封闭新 Step→处置在途调用）不适用于命令处理者的在途效果；SR-07"异步效果沿 CC-05 保留责任"须映射为 EC 自己的停止语义 |

**E2 辅助 Step**

| 组合 | 出边 | 判定 |
|---|---|---|
| 压缩成功 | E1 重新准备（切点含 summary） | 闭合 |
| 失败 / unknown 核实不了 / 仍超限 | E7 failed(context_overflow) | 闭合 |
| 控制到达 | E7（attempt cancel） | 闭合 |
| 崩溃 | 恢复表 E2 行 | 闭合 |
| 第二次超限 | 上界"每次准备最多一次" | 闭合 |

**E5W 等待前台结算**

| 批内变化 | 出边 | 判定 |
|---|---|---|
| 前台结算 | E5 | 闭合 |
| detach_in_flight → detached_background | 应回 E5 | 未写（只写"收到结算"） |
| proposed_pending_gate → admitted / waiting_approval / denied | 应回 E5 | 未写 |
| admitted_pending_start → executing | 应回 E5 | 未写 |
| 审批到达（Ra） | 不消费，留待 E6 | 闭合（可接受） |
| proposed_pending_gate 因预算/依赖被拒 | — | **无出边**：E5W 只订阅结算；Run 不在 waiting_gate，`gate_restored` 裁决为 context → 死锁（X2） |
| 前一个调用转后台、后一个仍 proposed_pending_gate | — | **无出边**（8-M6） |
| Ctl | E7 | 闭合 |

**E4A 消费批准并启动**

| 组合 | 出边 | 判定 |
|---|---|---|
| 再核对通过、预留成功、start 接纳 | E6（新等待位置） | 闭合，I-22 成立 |
| HD-06 approved_but_not_admitted | E6 第三类出边（位置解除） | 文字闭合，图未画 E6→E5/E8 |
| 预算预留失败 | 应进 waiting_gate，返回点 E4A | 未写 |
| start 返回 busy/unavailable（TL-06/08） | 调用留在 admitted_pending_start | 未写重试/放弃规则 |
| 调用为启动即后台 | E6，不作等待位置 | 闭合（U-9） |
| Rm 与 Ra 同时就绪（在 E5） | E5→E1 优先 | 未写 E1 排除 Ra（8-M9） |

**E6 等待（含 waiting_gate）**

| 事件 | 出边 | 判定 |
|---|---|---|
| Rm | E1 | 闭合 |
| Ra | E4A | 闭合 |
| 请求无答复关闭 | "重评 E5 完成条件" | 文字有、图无 E6→E5 边 |
| Rg（Run 在 waiting_gate） | 应回 E3 attempt / E4 调用 / E4A / E1 | **三类出边都不覆盖**（X2） |
| gate 在 E1/E3/E4/E4A 被命中 | 进入 waiting_gate | **无进入边**（X2） |
| 显式 resume（waiting_gate） | E0 | 闭合（SR-10"可解除阻塞的 waiting"） |
| 跨会话答复 Run 在等 | queue/context，不唤醒 | r1 已指出，r2 未答：应明确"Run 内等待答复只能是工具调用（U-15 同类）"或不支持 |
| Ctl | E7 | 闭合 |

**Yield**

| 组合 | 结果 | 判定 |
|---|---|---|
| Run running/waiting，退役 | 释放占位，状态不变 | **不闭合**：占位空 → 调度取队列启动新 Run → 两个 running Run；原 Run 无重取路径（X1） |
| E5W 中有本实例拥有的前台调用 | "安全边界释放" | AR-12 第 2 步要求先结算或移交本实例拥有的工作；Yield 前提未写 |
| Yield 后新实例激活 | 谁触发 E0？ | 未写：调度只看队列，不看无占位的非终态 Run |

## 4. 裁决表核对

- **列定义**：A/B/C 完备；D 混合了"Run cancelled（Session open）"与"Session 归档/删除"。后者按 SR-02 已封闭输入，`queue` 意图不可成立；`user_text` 行自己写了"Session 未关闭时"，其余行未区分。应拆为 D1（Run cancelled）/ D2（Session closed → 受理拒绝或 `closed(closed_by_archive|delete)`）。
- **`observedRun`**：消除 3.17；但对 `Yield` 后（占位空、Run 非终态）取 `none` 走 C 列是错误结果的来源（X1）；对 `schedule_due` D 列判定用的是 originWork 不是 observedRun（需第三条规则）。
- **`call_settlement` 统一子代理**：与 PF-004.C3"前后台结果均回到正确 master"、C5 父子生命周期兼容（结果路由层面）；与 C7 定时 handoff 不兼容（WorkRef 派发、master 忙时应 `queue`）；与 SR-12 的终止传播排除条款冲突（须限定 U-15 为结果路由）。`stopping` Run 的自有调用晚到结算按 B 列 `context` 与 SR-12"隔离证据"冲突。
- **`human_answer` 与 `call_settlement` 重叠**：HD-07 reject 同时产生 `denied_before_execution` 结算（TL 事实）和 `human_answer` arrival，两条都会成为 continuation；approve 亦然（`human_answer` → E4A，之后调用结算又一条）。须按请求 kind 指定唯一来源（question → `human_answer`；approval → 只走 `call_settlement`，或 `human_answer` 只承载决定、不进切点）。
- **`gate_restored`**：A 列要求 Run 已在 waiting_gate，但命中门的 Run 可能停在 E5W/E3（X2）；B 列给 `context` 无意义（预算恢复不是模型上下文），应"不生成"。
- **`schedule_due` D 列**与 PF-011.C9/C5 一致（已取消工作不复活），也与 PF-013.C11"终止一次运行不停用日程"一致（周期项无 originWork 时仍 `queue`）。
- **`provisional_outcome`**："一次接续"在 B 列降为 `context`，而 Run 按 HD-11 设计上不等待暂行请求，A 列几乎不可达；意图一经裁决不再变化，Run 之后进入 completed 也不会把 context 转为 trigger，PF-007.C7/HD-12 的"触发一次接续"承诺在"Run 存活但不等待"时丢失（只剩可见性）。这是设计取舍，需明确（8-M5）。
- **`connector_condition` A 列系统发起 interrupt_then_run**：按 SR-11 会把旧 Run 待批工具标 superseded、结算 cancelled_before_execution——用户正要回答的审批会被 connector 触发取消；这是 PF-002.C9"忙碌处理由获准配置决定"的后果，须在配置面可见（后果说明，不是缺陷）。

## 5. 形式化推导 r2

手工推导，未运行 TLC。在 r1 §4 上扩展：终态原因、E4A、E5W（以 `Blocking` 阻止 `SettleStep` 表达，不另设动作）、waiting_gate、Session 级 `Adjudicate`/`TakeTrigger` 不依赖 `alive`、按提交种类的 operationId、Yield 两个变体、CC-03 尾部（分两阶段的 `Dispatch`）。为可读性只保留一个在途 Run 的 Step/attempt；旧 Run 只保留终态于 `hist`，旧 Run 的后台调用以 `calls[c].run` 区分。省略租户、帧、预算数值、多 Session。

```tla
---- MODULE LoopInboundR2 ----
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS A, CIds, QIds        \* arrival / call / question 身份（有限集，互不相交）

Term    == {"completed","failed","cancelled"}
NonTerm == {"running","waiting","waiting_human","waiting_gate","interrupted","stopping"}
Drive   == {"running","waiting","waiting_human","waiting_gate"}   \* 有效 epoch 时可推进
Src     == {"call_settlement","human_answer","gate_restored","connector_condition"}

VARIABLES
  runId, runSt, hist,   \* 当前 Run 身份与状态；hist: [Nat -> 旧 Run 的最终状态]
  epoch, occupied,      \* epoch = 0 无有效执行者；occupied = 驱动占位是否由 runId 持有（与 epoch 分离）
  steps,                \* Seq [cut: SUBSET A, closed: BOOL]
  att,                  \* SUBSET [run, step, ord, st \in {"admitted","pending_durable","dispatched","settled"}, sent: Nat]
  calls,                \* [CIds -> [st \in {"none","proposed","waiting_approval","admitted","executing","settled"},
                        \*           run: Nat, step: Nat, fg: BOOL, viaE4A: BOOL, starts: Nat]]
  pendingQ, decided,    \* 待答 question 集合；已批准未消费的 system_approval 调用集合
  arr,                  \* [A -> [st \in {"none","accepted","classified","consumed","converted","closed"},
                        \*        src, refs \in CIds \cup QIds \cup {"gate","none"},
                        \*        intent \in {"none","queue","continuation","context"},
                        \*        obsRun: Nat, obsSt, obsWait: BOOL]]
  queue,                \* Seq A：intent = queue 且未取走的 trigger 段
  gate, gateRet,        \* 预算/依赖门开；进入 waiting_gate 的返回点 \in {"","E1","E3","E4","E4A"}
  log, inflight, alive  \* 提交日志 Seq [op, input]；易失在途；Loop 进程存活
vars == <<runId, runSt, hist, epoch, occupied, steps, att, calls, pendingQ, decided,
          arr, queue, gate, gateRet, log, inflight, alive>>

Cur    == Len(steps)
Closed == Cur > 0 /\ steps[Cur].closed
Op(k, s, o)    == <<runId, s, k, o>>                       \* I-20 的 f
Commit(op, in) == log' = Append(log, [op |-> op, input |-> in])
Dedup(op, in)  == \A i \in DOMAIN log : log[i].op = op => log[i].input = in   \* DR-02

WaitPos == {c \in CIds : calls[c].run = runId /\ calls[c].st = "executing" /\ calls[c].fg}
        \cup {c \in CIds : calls[c].run = runId /\ calls[c].st = "waiting_approval"}
        \cup pendingQ
        \cup (IF runSt = "waiting_gate" THEN {"gate"} ELSE {})
Blocking(s) == \E c \in CIds : calls[c].run = runId /\ calls[c].step = s /\ ~calls[c].viaE4A
               /\ (calls[c].st \in {"proposed","admitted"} \/ (calls[c].st = "executing" /\ calls[c].fg))

Cls(a)        == arr[a].st = "classified" /\ arr[a].intent = "continuation" /\ arr[a].obsRun = runId
ReadyModel    == {a \in A : Cls(a) /\ arr[a].refs \notin decided /\ arr[a].refs # "gate"}
ReadyApprove  == {a \in A : Cls(a) /\ arr[a].refs \in decided}
ReadyGate     == {a \in A : Cls(a) /\ arr[a].refs = "gate"}
Unadjudicated == \E a \in A : arr[a].st = "accepted"
CompleteCond  == Closed /\ pendingQ = {} /\ decided = {}
   /\ ~\E c \in CIds : calls[c].run = runId
        /\ (calls[c].st \in {"proposed","waiting_approval","admitted"} \/ (calls[c].st = "executing" /\ calls[c].fg))
   /\ ReadyModel = {} /\ ReadyApprove = {} /\ ReadyGate = {}

RefRun(r) == IF r \in CIds THEN calls[r].run ELSE runId
StOf(rid) == IF rid = runId THEN runSt ELSE hist[rid]
Intent(src, r) ==                                   \* inbound.md 裁决决定表
  LET rid == IF r = "none" THEN (IF occupied THEN runId ELSE 0) ELSE RefRun(r)
      st  == IF rid = 0 THEN "none" ELSE StOf(rid)
  IN IF st \in NonTerm /\ r # "none" /\ r \in WaitPos THEN "continuation"                                   \* A
     ELSE IF st \in NonTerm THEN (IF src = "connector_condition" THEN "queue" ELSE "context")                \* B
     ELSE IF st \in {"completed","failed","none"} THEN (IF src = "gate_restored" THEN "drop" ELSE "queue")   \* C
     ELSE "closed"                                                                                          \* D

Accept(a, src, r) == arr[a].st = "none"
  /\ arr' = [arr EXCEPT ![a] = [st |-> "accepted", src |-> src, refs |-> r, intent |-> "none",
                                obsRun |-> 0, obsSt |-> "", obsWait |-> FALSE]]

\* ---------- Session 级（不要求 alive） ----------
Adjudicate(a) == arr[a].st = "accepted"
  /\ LET i == Intent(arr[a].src, arr[a].refs) IN
       arr' = [arr EXCEPT ![a].st = IF i \in {"closed","drop"} THEN "closed" ELSE "classified",
                          ![a].intent = IF i \in {"closed","drop"} THEN "none" ELSE i,
                          ![a].obsRun = IF arr[a].refs = "none" THEN (IF occupied THEN runId ELSE 0)
                                        ELSE RefRun(arr[a].refs),
                          ![a].obsSt = runSt, ![a].obsWait = (arr[a].refs \in WaitPos)]
       /\ queue' = IF i = "queue" THEN Append(queue, a) ELSE queue
       /\ Commit(<<"arr", a, "adjudicate", 0>>, i)

TakeTrigger == ~occupied /\ queue # <<>>                       \* SR-06 门：无活动占位（P-2 的调度动作）
  /\ hist' = [rid \in DOMAIN hist \cup {runId} |-> IF rid = runId THEN runSt ELSE hist[rid]]
  /\ runId' = runId + 1 /\ runSt' = "running" /\ epoch' = epoch + 1 /\ occupied' = TRUE
  /\ steps' = <<>> /\ gateRet' = "" /\ pendingQ' = {} /\ decided' = {}
  /\ arr' = [arr EXCEPT ![Head(queue)].st = "consumed"] /\ queue' = Tail(queue)
  /\ Commit(<<"take", runId + 1, "take_trigger", 0>>, Head(queue))

\* ---------- Loop（要求 alive 与有效 epoch） ----------
OpenStep ==                                                     \* E1
  alive /\ epoch > 0 /\ occupied /\ runSt \in {"running","waiting","waiting_human"}
  /\ (Cur = 0 \/ (Closed /\ ReadyModel # {}))
  /\ ~Unadjudicated                                              \* E0 第 3 步推广到每次开 Step（本评审建议的前提）
  /\ Dedup(Op("open_step", Cur + 1, 0), ReadyModel)
  /\ steps' = Append(steps, [cut |-> ReadyModel, closed |-> FALSE])
  /\ arr' = [a \in A |-> IF a \in ReadyModel THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  /\ runSt' = "running" /\ Commit(Op("open_step", Cur + 1, 0), ReadyModel)

RequestModel(o) ==                                              \* E3 准入
  alive /\ epoch > 0 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ gate
  /\ ~\E t \in att : t.run = runId /\ t.step = Cur /\ t.ord = o
  /\ (o = 0 \/ \E t \in att : t.run = runId /\ t.step = Cur /\ t.ord = o - 1 /\ t.st = "settled")
  /\ att' = att \cup {[run |-> runId, step |-> Cur, ord |-> o, st |-> "admitted", sent |-> 0]}
  /\ Commit(Op("admit_attempt", Cur, o), "admit")
GateBlockE3 == alive /\ epoch > 0 /\ Cur > 0 /\ ~Closed /\ runSt = "running" /\ ~gate
  /\ ~\E t \in att : t.run = runId /\ t.step = Cur /\ t.st \in {"admitted","pending_durable","dispatched"}
  /\ runSt' = "waiting_gate" /\ gateRet' = "E3"

Dispatch(t) == alive /\ epoch > 0 /\ t.st = "admitted"           \* CC-03：分配位置，尚未耐久
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "pending_durable"]}
  /\ Commit(Op("dispatch_attempt", t.step, t.ord), "dispatch")
Durable(t)  == alive /\ t.st = "pending_durable"                   \* fsync 完成后才允许受控效果
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "dispatched"]} /\ inflight' = inflight \cup {t}
Send(t)     == alive /\ t \in inflight /\ t.st = "dispatched"
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.sent = t.sent + 1]} /\ inflight' = inflight \ {t}
SendEarly(t)== alive /\ t.st \in {"admitted","pending_durable"}    \* 违反 MC-04/CC-03 的变异
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.sent = t.sent + 1]}
SettleAttempt(t) == alive /\ t.st = "dispatched" /\ t \notin inflight
  /\ att' = (att \ {t}) \cup {[t EXCEPT !.st = "settled"]}
  /\ Commit(Op("settle_attempt", t.step, t.ord), "settle")

ProposeCalls(S) ==                                              \* E4
  alive /\ epoch > 0 /\ ~Closed /\ S # {} /\ \A c \in S : calls[c].st = "none"
  /\ \E t \in att : t.run = runId /\ t.step = Cur /\ t.st = "settled"
  /\ calls' = [c \in CIds |-> IF c \in S THEN [st |-> "proposed", run |-> runId, step |-> Cur,
                                               fg |-> TRUE, viaE4A |-> FALSE, starts |-> 0] ELSE calls[c]]
  /\ Commit(Op("propose_call", Cur, 0), S)
GateAllow(c) == alive /\ epoch > 0 /\ calls[c].st = "proposed" /\ gate
  /\ calls' = [calls EXCEPT ![c].st = "admitted"] /\ Commit(Op("admit_call", calls[c].step, c), "allow")
GateAsk(c)   == alive /\ epoch > 0 /\ calls[c].st = "proposed"
  /\ calls' = [calls EXCEPT ![c].st = "waiting_approval"] /\ Commit(Op("admit_call", calls[c].step, c), "ask")
GateDeny(c, a) == alive /\ epoch > 0 /\ calls[c].st = "proposed"
  /\ calls' = [calls EXCEPT ![c].st = "settled"] /\ Accept(a, "call_settlement", c)
  /\ Commit(Op("admit_call", calls[c].step, c), "deny")
GateBlockE4(c) == alive /\ epoch > 0 /\ calls[c].st = "proposed" /\ ~gate /\ runSt = "running"
  /\ runSt' = "waiting_gate" /\ gateRet' = "E4"                   \* 提案现文没有这条边
StartCall(c) == alive /\ epoch > 0 /\ calls[c].st = "admitted" /\ calls[c].starts = 0  \* TL-08 幂等接纳
  /\ calls' = [calls EXCEPT ![c].st = "executing", ![c].starts = 1]
Detach(c)    == calls[c].st = "executing" /\ calls[c].fg /\ calls' = [calls EXCEPT ![c].fg = FALSE]

\* 执行 owner 侧终态与 Inbound 受理（提案现文为两次提交；不依赖 alive）
SettleCall(c)        == calls[c].st = "executing" /\ calls' = [calls EXCEPT ![c].st = "settled"]
AcceptSettlement(a,c)== calls[c].st = "settled" /\ ~\E b \in A : arr[b].refs = c /\ arr[b].st # "none"
  /\ Accept(a, "call_settlement", c)

SettleStep ==                                                   \* E5（E5W = 该动作因 Blocking 未使能）
  alive /\ epoch > 0 /\ Cur > 0 /\ ~Closed /\ ~Blocking(Cur)
  /\ \E t \in att : t.run = runId /\ t.step = Cur /\ t.st = "settled"
  /\ steps' = [steps EXCEPT ![Cur].closed = TRUE] /\ Commit(Op("settle_step", Cur, 0), "close")
Wait ==                                                         \* E6 进入
  alive /\ epoch > 0 /\ Closed /\ runSt = "running" /\ ReadyModel = {} /\ ReadyApprove = {} /\ ~CompleteCond
  /\ runSt' = IF pendingQ # {} \/ \E c \in CIds : calls[c].run = runId /\ calls[c].st = "waiting_approval"
              THEN "waiting_human" ELSE "waiting"
AdmitApproved(c) ==                                             \* E4A
  alive /\ epoch > 0 /\ Closed /\ runSt \in {"waiting","waiting_human"} /\ c \in decided
  /\ calls[c].st = "waiting_approval" /\ gate /\ \E a \in ReadyApprove : arr[a].refs = c
  /\ calls' = [calls EXCEPT ![c].st = "admitted", ![c].viaE4A = TRUE] /\ decided' = decided \ {c}
  /\ arr' = [b \in A |-> IF Cls(b) /\ arr[b].refs = c THEN [arr[b] EXCEPT !.st = "consumed"] ELSE arr[b]]
  /\ Commit(Op("admit_call", calls[c].step, c), "consume_approval")
WakeGate ==                                                     \* waiting_gate 唤醒，回到 gateRet
  alive /\ epoch > 0 /\ runSt = "waiting_gate" /\ ReadyGate # {}
  /\ arr' = [a \in A |-> IF a \in ReadyGate THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  /\ runSt' = IF gateRet \in {"E1","E3","E4"} THEN "running" ELSE "waiting" /\ gateRet' = ""

CloseOut == calls' = [c \in CIds |-> IF calls[c].run = runId
                       /\ calls[c].st \in {"proposed","waiting_approval","admitted","executing"}
                       THEN [calls[c] EXCEPT !.st = "settled"] ELSE calls[c]]        \* E7 抽象为原子
SettleRun(r) ==                                                 \* E8
  alive /\ epoch > 0 /\ occupied /\ (r = "completed" => CompleteCond)
  /\ runSt' = r /\ epoch' = 0 /\ occupied' = FALSE
  /\ arr' = [a \in A |-> IF Cls(a) THEN [arr[a] EXCEPT !.st = IF r \in {"completed","failed"}
                                                             THEN "converted" ELSE "closed"] ELSE arr[a]]
  /\ queue' = IF r \in {"completed","failed"} THEN queue \o SetToSeq({a \in A : Cls(a)}) ELSE queue
  /\ Commit(Op("settle_run", 0, 0), r)

Interrupt == alive /\ runSt \in Drive /\ CloseOut /\ decided' = {}      \* HD-04：pendingQ 保留
  /\ runSt' = "interrupted" /\ epoch' = 0 /\ occupied' = FALSE
Resume    == alive /\ runSt = "interrupted" /\ ~occupied
  /\ epoch' = epoch + 1 /\ occupied' = TRUE /\ runSt' = "running"        \* E0
Cancel    == alive /\ runSt \in NonTerm \ {"stopping"} /\ CloseOut /\ pendingQ' = {} /\ decided' = {}
  /\ runSt' = "cancelled" /\ epoch' = 0 /\ occupied' = FALSE
  /\ arr' = [a \in A |-> IF Cls(a) THEN [arr[a] EXCEPT !.st = "closed"] ELSE arr[a]]
  /\ Commit(Op("settle_run", 0, 0), "cancelled")
ForceStop == alive /\ runSt \in Drive /\ runSt' = "stopping" /\ epoch' = 0     \* 占位保留
ConfirmIsolation == runSt = "stopping" /\ CloseOut /\ pendingQ' = {} /\ decided' = {}
  /\ runSt' = "cancelled" /\ occupied' = FALSE
  /\ arr' = [a \in A |-> IF Cls(a) THEN [arr[a] EXCEPT !.st = "closed"] ELSE arr[a]]
  /\ Commit(Op("settle_run", 0, 0), "cancelled")
FailRun   == alive /\ epoch > 0 /\ runSt = "running" /\ CloseOut /\ SettleRun("failed")

YieldAsWritten == alive /\ runSt \in Drive /\ epoch' = 0 /\ occupied' = FALSE   \* 提案现文
YieldKeepSlot  == alive /\ runSt \in Drive /\ epoch' = 0                        \* 变体：只封闭 epoch
Reacquire      == alive /\ epoch = 0 /\ occupied /\ runSt \in Drive /\ epoch' = epoch + 1   \* E0

GateDrop       == gate /\ gate' = FALSE
GateRestore(a) == ~gate /\ gate' = TRUE /\ Accept(a, "gate_restored", "gate")
ExtTrigger(a)  == Accept(a, "connector_condition", "none")
AskQuestion(q) == alive /\ epoch > 0 /\ ~Closed /\ q \notin pendingQ /\ pendingQ' = pendingQ \cup {q}
Answer(q, a)   == q \in pendingQ /\ pendingQ' = pendingQ \ {q} /\ Accept(a, "human_answer", q)  \* HD-08 同提交
Approve(c, a)  == calls[c].st = "waiting_approval" /\ c \notin decided
  /\ decided' = decided \cup {c} /\ Accept(a, "human_answer", c)
Reject(c, a)   == calls[c].st = "waiting_approval"
  /\ calls' = [calls EXCEPT ![c].st = "settled"] /\ Accept(a, "human_answer", c)

Crash   == alive /\ alive' = FALSE /\ inflight' = {}
          /\ att' = {t \in att : t.st # "pending_durable"} \cup
                    {[t EXCEPT !.st = "admitted"] : t \in {u \in att : u.st = "pending_durable"}}
          \* CC-03/DR-04：未耐久的尾部丢失，dispatch 记录回到 admitted；若尾部无法确认截回则 writer 隔离（未建模）
Recover == ~alive /\ alive' = TRUE
          /\ (IF occupied /\ runSt \in Drive THEN epoch' = epoch + 1 ELSE UNCHANGED epoch)
          \* E0：新 epoch；重读前缀（状态即前缀）；不重放 Send；第 3 步由 OpenStep 等动作的 ~Unadjudicated 表达

Next == \/ \E a \in A : Adjudicate(a) \/ TakeTrigger
        \/ OpenStep \/ \E o \in 0..2 : RequestModel(o) \/ GateBlockE3
        \/ \E t \in att : Dispatch(t) \/ Durable(t) \/ Send(t) \/ SettleAttempt(t)
        \/ \E S \in SUBSET CIds : ProposeCalls(S)
        \/ \E c \in CIds : GateAllow(c) \/ GateAsk(c) \/ GateBlockE4(c) \/ StartCall(c) \/ Detach(c)
                          \/ SettleCall(c) \/ AdmitApproved(c)
        \/ \E c \in CIds, a \in A : GateDeny(c, a) \/ AcceptSettlement(a, c) \/ Approve(c, a) \/ Reject(c, a)
        \/ \E q \in QIds, a \in A : Answer(q, a) \/ \E q \in QIds : AskQuestion(q)
        \/ SettleStep \/ Wait \/ WakeGate \/ SettleRun("completed") \/ FailRun
        \/ Interrupt \/ Resume \/ Cancel \/ ForceStop \/ ConfirmIsolation
        \/ YieldAsWritten \/ Reacquire \/ GateDrop \/ \E a \in A : GateRestore(a) \/ ExtTrigger(a)
        \/ Crash \/ Recover
        \* 变异动作 SendEarly、YieldAsWritten/YieldKeepSlot 互换，用于反例；正式模型中去掉变异

Init == runId = 1 /\ runSt = "running" /\ hist = <<>> /\ epoch = 1 /\ occupied = TRUE /\ steps = <<>>
     /\ att = {} /\ calls = [c \in CIds |-> [st |-> "none", run |-> 0, step |-> 0, fg |-> TRUE, viaE4A |-> FALSE, starts |-> 0]]
     /\ pendingQ = {} /\ decided = {} /\ arr = [a \in A |-> [st |-> "none", src |-> "", refs |-> "none", intent |-> "none",
                                                          obsRun |-> 0, obsSt |-> "", obsWait |-> FALSE]]
     /\ queue = <<>> /\ gate = TRUE /\ gateRet = "" /\ log = <<>> /\ inflight = {} /\ alive = TRUE

\* ---------- 不变式 ----------
I1   == (occupied => runSt \in NonTerm) /\ (runSt \in Drive /\ epoch > 0 => occupied)
Hist == \A rid \in DOMAIN hist : hist[rid] \in Term \cup {"interrupted"}      \* 被调度越过的 Run 只能是终态或 interrupted
I9   == \A s \in 1..Cur : steps[s].closed => ~Blocking(s)
I13  == \A a \in A : arr[a].intent = "continuation" => arr[a].obsSt \in NonTerm /\ arr[a].obsWait
I14  == runSt \in Term => \A a \in A : (arr[a].intent = "continuation" /\ arr[a].obsRun = runId) =>
          /\ arr[a].st \in {"consumed","converted","closed"}
          /\ (runSt = "cancelled" => arr[a].st # "converted")
          /\ (runSt \in {"completed","failed"} => arr[a].st # "closed")
I18  == /\ \A t \in att : t.sent <= 1
        /\ \A r, s, o \in Nat : Cardinality({t \in att : t.run = r /\ t.step = s /\ t.ord = o}) <= 1
        /\ \A c \in CIds : calls[c].starts <= 1
I20  == \A i, j \in DOMAIN log : log[i].op = log[j].op => log[i].input = log[j].input
I21s == \A a \in A : arr[a].st \in {"consumed","converted"} => arr[a].intent # "none"
I22  == /\ (runSt = "completed" => ~\E c \in CIds : calls[c].run = runId /\ calls[c].st = "executing" /\ calls[c].fg)
        /\ \A c \in CIds : (calls[c].viaE4A /\ calls[c].st = "executing" /\ calls[c].fg) => StOf(calls[c].run) \in NonTerm
NoDouble == \A c \in CIds : Cardinality({s \in 1..Cur : \E a \in steps[s].cut : arr[a].refs = c}) <= 1

\* ---------- 进展 ----------
Fair == /\ \A a \in A : WF_vars(Adjudicate(a))
        /\ WF_vars(TakeTrigger) /\ WF_vars(OpenStep) /\ WF_vars(WakeGate)
        /\ \A c \in CIds : WF_vars(AdmitApproved(c))
        /\ WF_vars(Recover) /\ <>[]alive                          \* 有限次崩溃
P1 == [](runSt \in {"waiting","waiting_human"} /\ epoch > 0 /\ (ReadyModel # {} \/ ReadyApprove # {})
          => <>(runSt = "running" \/ runSt \in Term \cup {"interrupted","stopping"}))
P1g== [](runSt = "waiting_gate" /\ epoch > 0 /\ ReadyGate # {} => <>(runSt # "waiting_gate"))
P2 == [](~occupied /\ queue # <<>> => <>(occupied))
======
```

**I-13 保持性。** 只有 `Adjudicate` 写 `intent/obsSt/obsWait`，三者同一动作、同一 `runSt`/`WaitPos` 求值；`continuation` 分支要求 `st ∈ NonTerm ∧ r ∈ WaitPos`。"恰一次"由 `st="accepted"` 前提与无动作回退到 accepted 保证。**成立。** 前提：裁决与 Run 状态/WaitPos 变化在同一协调域全序（提案已要求）；若 TL 结算在另一域，`WaitPos` 的求值可能落后，A/B 判定会漂移——这就是 X3 的根源。

**I-14 保持性（按原因）。** 使 `runSt ∈ Term` 的动作只有 `SettleRun`、`Cancel`、`ConfirmIsolation`，三者都在同一动作里把所有 `Cls(a)` 置为 `converted`（completed/failed）或 `closed`（cancelled）；终态后 `Adjudicate` 对 refs 指向本 Run 的项按 C/D 给 `queue`/`closed`，不再产生 continuation。**成立。** r1 分裂变体反例仍作回归。注意第三合取项要求 `closed` 只由 D 列产生：模型里 `gate_restored` 在 C 列的 `drop` 也写 `closed`，但其 `intent` 保持 `none`，不落入量词范围；规格里 `closed` 须带原因区分（`cancelled_run` vs 其他）。

**I-18 保持性（按 attempt）。** `Send` 前提 `t ∈ inflight ∧ st="dispatched"`；`inflight` 只在 `Durable` 加入、`Send`/`Crash` 移除、`Recover` 不重建，故每个 attempt 至多一次 `Send`。`Crash` 把 `pending_durable` 回退为 `admitted`，与 CC-03"分配位置不算受控效果已发生"一致；恢复后 `RequestModel(o+1)` 是新 attempt，`(run,step,ord)` 唯一。`starts ≤ 1` 由 `StartCall` 前提 `starts=0` 表达 TL-08。`AdmitApproved` 不改变以上论证。**在 MC-04/TL-08/CC-03 前提下成立。** 最短反例（去掉前提）：`OpenStep; RequestModel(0); Dispatch(t); SendEarly(t)`（sent=1，尚未 Durable）`; Crash`（t 回到 admitted）`; Recover; RequestModel(1); Dispatch; Durable; Send` → 同一 Step 两次真实请求，且第一次无耐久痕迹、费用暴露不可见。结论同 r1：I-18 的成立条件是"发网前耐久 + 幂等接纳 + unknown 不重发"，不是 I-20。

**I-20 保持性。** 每个 `Commit` 动作以 `Dedup` 为前提，`Adjudicate` 与 `TakeTrigger` 使用各自命名空间的 op。**成立。** 缺口：`take_trigger` 的 op 在提案中未定义派生规则（模型用 `<<"take", runId+1, ...>>`），规格须补。

**I-21 安全侧。** 只有 `Adjudicate` 写 `intent`；`OpenStep/AdmitApproved/WakeGate/TakeTrigger` 只消费 `classified`/队列项。**成立。** 进展侧需要 `WF(Adjudicate(a))` 对每个 `a`——模型里 `Adjudicate` 不依赖 `alive`，对应现实是"Session 级裁决者在任何进程实例启动时都会扫描"；若只在"Session 被读取时"裁决，`WF` 不成立于空闲 Session。

**I-22 保持性。** `SettleRun("completed")` 前提 `CompleteCond` 排除前台 executing 与 `decided ≠ {}`；`AdmitApproved` 要求 `runSt ∈ {waiting, waiting_human}` 且 `Closed`，启动后调用出现在 `WaitPos`。**作为状态谓词成立。** 但见 X1：`YieldAsWritten` 后 `Reacquire` 前提 `occupied` 为假，I-22 的第二合取仍真（Run 非终态），而实际无人驱动——谓词形式捕捉不到，需要 `Hist`。

**I-9。** `SettleStep` 前提 `¬Blocking`，收束后只有 `AdmitApproved` 能把本 Step 的调用从 waiting_approval 变为 admitted，且置 `viaE4A`，被 `Blocking` 排除。**成立。**

**反例 X1（Yield）。** `YieldAsWritten`（occupied=F，runSt=running）`; ExtTrigger(a); Adjudicate(a)`：`refs=none`，`occupied=F` → `rid=0` → C 列 → `queue` `; TakeTrigger` → `hist[1]="running"`，`Hist` 假；此后 `Reacquire` 对 Run 1 永不使能（runId 已变），P-1 对 Run 1 失效。换成 `YieldKeepSlot`：`TakeTrigger` 前提 `¬occupied` 为假，`Reacquire` 使能，`Hist`、I1 均保持。

**反例 X2（门）。** `OpenStep; RequestModel(0); …SettleAttempt; ProposeCalls({c}); GateDrop`：`c` 为 proposed、`Blocking` 真、`SettleStep` 不使能、提案现文无 `GateBlockE4` → `runSt` 停在 running；`GateRestore(a); Adjudicate(a)`：`"gate" ∉ WaitPos`（不在 waiting_gate）→ B 列 → `context`；`GateAllow(c)` 现在使能（gate=T）——**模型能继续，是因为模型让 E4 重新求值门**；提案正文 E5W 只订阅结算、E4 不重跑，对应现实无唤醒动作。加上 `GateBlockE4` 与 `WakeGate` 后，`WakeGate` 回到 `gateRet="E4"` → `GateAllow`。P1g 在有 `GateBlockE4`/`GateBlockE3` 与 `WF(WakeGate)` 时可建立；无进入边则 P1g 前提永假、Run 卡在 running。

**反例 X3（双路径）。** 设 E5 读 TL 视图（提案 decide 输入第 2 项）：`StartCall(c1); SettleCall(c1)`（TL 事实）`; SettleStep`（TL 视图无阻止）`; OpenStep`（切点含 c1 结果，此时 `Unadjudicated` 为假，因为 arrival 尚未 Accept）`; AcceptSettlement(a, c1); Adjudicate(a)`：`c1 ∉ WaitPos`（已 settled）→ B 列 → `context` → 下一 Step 装配读水位得到 c1 指针 → `NoDouble` 假（需把 context 指针计入 cut）。`¬Unadjudicated` 前提不够，因为 Accept 晚于 TL 事实。消除方法只有两种：(a) 结算事实与 arrival 受理同一提交（执行 owner 跨域时不可行，须走 CC-05）；(b) E5/E5W 只以 `classified` 的 `call_settlement` 作为结算视图（r1/r2 模型 `OpenStep` 的 `cut = ReadyModel` 实际就是这个选择），TL 事实只供 E7/E0 `inspect`。同一结构对 `Reject(c,a)`（TL settled + human_answer arrival）重复出现。

**P-1。** 需 `WF(OpenStep)`、`WF(AdmitApproved)`、`WF(WakeGate)`、`WF(Adjudicate)`，且前提"执行权有效且无阻塞"排除 `Interrupt/Cancel/ForceStop/Yield` 干扰。P-1 陈述应改为"最终消费该接续（开 Step、消费批准或门唤醒）"，因为审批型接续的下一步不是开 Step。在补齐 X1/X2 后模型内可建立；现文下对 waiting_gate 不能建立。

**P-2。** 需 `WF(TakeTrigger)` 与 `WF(Adjudicate)`；`stopping` 持占位使前提为假（P-3 承认）。模型内可建立，但 `YieldAsWritten` 下 P-2 成立的代价是 `Hist` 被破坏——P-2 与 I-1 的组合才是应验证的性质。

## 6. 规格就绪清单

**规格撰写时可直接封闭**

1. `waiting_gate` 进入/退出：进入点 E1（模型/技能/绑定不可用）、E3（预算/路由）、E4（预算）、E4A（预算）；`gateRef={kind: budget|dependency, ref}` 记入 Run 阻塞集合；退出 = `gate_restored` continuation → 返回原点、显式 `resume` → E0、控制 → E7。
2. `takeTrigger` 的门：SR-06 条件 + trigger 来源权威仍有效（PF-002.C9/PF-011.C9 到期重查权限）+ 队列非 hold + Session open；`take*` 与调度的 operationId 派生。
3. trigger kind 的队列状态：沿 SR-04 `queued/held/taken/withdrawn/closed(closed_by_archive|closed_by_delete|superseded|cancelled_run)`，加 `converted` 与 arrival 的引用关系。
4. context 水位：推进（classify 为 context 时）、可见下界（撤回/到期）、每 Run 记录的读取水位只作溯源、装配按 callId/payloadRef 去重已消费结果、I-17 对 context 的上界。
5. EC 结算词表 → Run 终态：success→completed、rejected/failed→failed（带原因）、unknown→保留占位可见；命令执行中的控制语义。
6. E5W 唤醒集合：任何使 `Blocking` 变假的批内变化（结算、detach 确认、过门、start 回执）。
7. E6 第三类出边的目标（E5 重评 → E1/E6/E8），补图。
8. E4A 失败分支：approved_but_not_admitted → 位置解除；预算 → waiting_gate(E4A)；start busy/unavailable → 留 admitted_pending_start 的重试/放弃政策。
9. 审批类请求的唯一 arrival 来源（question → `human_answer`；approval/reject → `call_settlement` 或 `human_answer` 只承载决定）。
10. `schedule_due` 的 `originWork` 引用与 D 列判定；D 列拆分 D1/D2。
11. `stopping` Run 自有调用的晚到结算 → `closed(isolated)`。
12. E7 直接读 TL/HD 事实而非 arrival 的说明；收口产生的结算 arrival 按 A 列成为 interrupted Run 的恢复位置。
13. Inbound 启动扫描作为提供者义务（I-21 进展侧）。
14. Step 的权威模型输出（多 attempt/partial）。
15. `Yield` 的 AR-12 前提（本实例拥有的工作已结算或移交）。
16. I-17 对内部事实来源（call_settlement/human_answer/gate_restored/provisional_outcome）不适用"满时拒绝"，改为由各自权威的有界性承担。
17. I-9 拆为安全侧（closed ⇒ 无阻止者）与进展侧（无阻止者 ⇒ 最终收束）。
18. Session 级调度启动 Run 时与 live-agent `activate/admit` 的链路归属（调度 → 激活 → 工作许可 → E0）。

**需要再做设计取舍**

1. **Yield 的占位语义**（X1）：封闭 epoch、保留占位，由 E0 重取；或新增可自动重取的非终态并让调度优先重取。
2. **waiting_gate 的机制**（X2）：`gate_restored` 由 BG/依赖能力发出（需 BG 新版本或提供者义务）还是 Session 级定期重检；依赖缺失是否限定在 Run 级门（E1/E3），调用级 parking 与 TL-06 冲突。
3. **结算/答复的单一消费路径**（X3）：E5/E5W 以 classified arrival 为结算视图，或结算与受理同提交（需 CC-01 新组合）。
4. WorkRef 派发调用的结算在 master 忙时 `queue` 还是 `context`（PF-004.C7 要求前者）。
5. `provisional_outcome`"一次接续"在 Run 存活但不等待时的语义（Run 级唤醒位置 / 降为 context / 转 queue）。
6. 缺省串行门与 detach 的关系（前一个转后台后是否放行）。
7. E4A 与 E1 的优先级（Ra 与 Rm 同时就绪）。
8. EC 与 IN-01 的对齐：上下文装载意图随文本批。
9. U-15 的适用范围声明：只覆盖结果路由，终止传播按 SR-12/PF-004。

## 7. 契约影响

**session-run 新版本必须改动/新增的条款**

| 条款 | 改动 |
|---|---|
| SR-04 | kind 增加 `trigger`；closed 原因词表；trigger 项的撤回 |
| SR-06 | takeBatch 遇 trigger 也停止；新增 `takeTrigger`；Session 级调度的归属与 operationId |
| SR-07 | 命令执行作为 Run（basis=command）的状态映射；与 IN-01 的分工（有序命令 vs 装载意图） |
| SR-08 | 状态增加 `waiting_human`（HD-03 已引用、SR-08 缺）与 `waiting_gate`；Run basis 三种；"驱动位置"作为 SR-13 projection；占位与 epoch 的分离（Yield/force_stop） |
| SR-09 | 完成条件纳入 E4A 等待位置、未消费审批接续、门等待；"就绪接续"以 Inbound classified arrival 定义 |
| SR-10 | resume 对 waiting_gate 的适用；Yield 不是控制、不改写为 interrupt |
| SR-11 | 系统发起的 interrupt_then_run（获准配置、trigger 作为"新 input"） |
| SR-12 | stopping/cancelled(force_stopped) Run 的晚到结算 arrival 一律 closed(isolated) |
| SR-13 | Inbound 作为 authoritative 状态贡献；context 水位 |
| SR-14 | 恢复时 Session 级裁决先行；E0 四步；Inbound 启动扫描 |
| 新节 | arrival 对象、四种意图、来源枚举、裁决决定表（D 列拆分）、I-13/14/15/16/17/21/22、有界与去重、与 Run 终态同提交 |

**其他 v1**

- tools v1：视图词表可作 Loop 投影，不需新状态。但 U-13 的"依赖缺失停在调用级"与 TL-06（新调用 `unavailable`、不在新提供者上无声恢复）冲突；若坚持调用级 parking 需 tools 新版本增加 `blocked` 门结果，否则把依赖门限定在 Run 级即可不改。预算被拒的调用停留在 `proposed`（BG-03"不留下已准入调用"）与 TL-07 相容，但 TL-07 未明说预留失败不是 deny，需提供者映射确认或勘误。
- human-decisions v1：E4A 与 HD-06 一致；arrival 引用 HD-08 的 continuation 记录而非复制（SYS-REUSE）。若采用"一次接续在 Run 存活时降为 context"，HD-12 声明的回传策略含义被收窄，应在 HD 入口注明或发新版本。
- model-execution v1：不需修订。Run 内压缩政策由 run-driver 自有；MC-03"发送前记录"已覆盖 dispatched 义务。
- core-work-coordination v1：只有选择"结算与受理同提交"才需新增原子组合；E8 同提交在 session-run 内部，不需要。
- budget-accounting v1：`gate_restored` 无生产者条款；选 push 则需 BG 新版本或提供者义务。
- command-input v1：不需修订，提案须对齐 IN-01。
- live-agent v1：不需修订；Yield 是 AR-12 步骤 1 的驱动收口。

## 8. 发现清单

**阻断**

- X1 [loop.md E7 表"运行时退役"行、拓扑 EY；inbound.md `observedRun`；invariants I-1/P-1] Yield 释放占位而 Run 状态不变：调度可启动第二个 Run，原 Run 无重取路径；违反 SR-06/PF-013.C7，P-1 失效。
- X2 [loop.md E5/E5W/E6"waiting_gate"、E3/E4 出边；inbound.md `gate_restored` 行；invariants P-1] waiting_gate 无进入边与返回点；预算被拒的 proposed 调用被路由到 E5W 后永不唤醒；`gate_restored` 无生产契约；依赖缺失调用级 parking 与 TL-06 冲突。
- X3 [loop.md decide 输入、E5"结算视图"、E1；inbound.md 定义/核心规则；invariants I-13/I-14"不双投"] 同一事实两条消费路径，裁决与 E5/E1 交错时产生重复呈现，`¬Unadjudicated` 前提不足以消除。

**重要**

- M1 [inbound.md `call_settlement` 行] WorkRef 定时派发结果在 master 忙时得 `context`，违反 PF-004.C7。
- M2 [loop.md E4、inbound.md 来源枚举 U-15 说明] "全部沿 TL-10/11"与 SR-12/PF-013.C4 终止传播排除条款冲突。
- M3 [loop.md EC] 与 IN-01 冲突；EC 结算词表、unknown、控制语义未列。
- M4 [inbound.md 裁决表列定义与 D 列] Run cancelled 与 Session 归档混合；归档 Session 不能 `queue`（SR-02）。
- M5 [inbound.md `provisional_outcome` 行] "一次接续"在 Run 存活不等待时丢失唤醒承诺（PF-007.C7/HD-12）。
- M6 [loop.md E4 缺省串行] 前一个转后台后后续调用永远 `proposed_pending_gate`。
- M7 [inbound.md 裁决表 B 列对 stopping Run] 晚到结算应为隔离证据而非 context（SR-12/TL-09）。
- M8 [inbound.md 有界与去重、I-17] "满时拒绝"对内部事实来源会丢结果（PF-004.C3、TL-11）。
- M9 [loop.md E1/E5/E4A] E1 切点是否排除审批型 continuation 未写；优先级未定。
- M10 [loop.md E5W、E6 出边、拓扑] E5W 唤醒集合不全；E6→E5 边未画；E4A 失败分支未列。
- M11 [inbound.md `schedule_due` D 列 vs `observedRun`] 判定依据的 Run 不一致。
- M12 [inbound.md 恢复时的裁决] 空闲 Session 的裁决触发未定义（启动扫描）。
- M13 [loop.md E8、U-10 后果] failed(context_overflow) Run 的后台晚到结算逐个触发注定再失败的新 Run；有界但有成本，应在 README 后果中记录。

**建议**

- S1 `gate_restored` B 列改"不生成"。
- S2 明确 Run 内等待跨会话答复只能作为工具调用（U-15 同类），否则不支持。
- S3 `take*` 与调度的 operationId 派生。
- S4 多 attempt 的 Step 权威输出。
- S5 "事实只在 E5/E5W/E6 被消费"改为"arrival 只在…消费；E7/E0 直接读 TL/HD 事实"。
- S6 Yield 的 AR-12 前提。
- S7 context"持续可见"与"消费到的水位"的关系一句定义。
- S8 I-1 措辞：waiting 也占位，能与占位 Run 并存的非终态只有 interrupted。
- S9 U-13 的产品后果：waiting_gate 持占位会阻塞该 Session 的普通排队输入直到恢复或用户 interrupt，应在 README 记录。

## 9. 阅读范围

已读（均在 `/data/qiwei/repos/omne-harness-lite/.worktrees/dsh-e-loop-inbound/`）：
- 待审稿与基线：`docs/proposals/agent-loop-inbound/README.md`、`loop.md`、`inbound.md`、`invariants.md`、`review.md`
- 契约：`spec/capabilities/session-run/v1/contract.md`、`tools/v1`、`human-decisions/v1`、`model-execution/v1`、`live-agent/v1`、`durable-records/v1`、`command-input/v1`、`budget-accounting/v1`、`spec/compositions/core-work-coordination/v1/contract.md`、`spec/data/core-work/v1/contract.md`、`spec/catalog.json`
- 需求：PF-002、PF-003、PF-004、PF-005、PF-007、PF-009、PF-011、PF-013、PF-017、PF-019、PF-020；`docs/requirements/system/runtime-state-and-continuity.md`、`long-running-and-evolving.md`
- 决定与规则：`docs/decisions/D-008-core-capabilities.md`、`docs/proposals/dsh-core-adoption/design-plan.md`、`docs/maintenance/spec-maintenance.md`、`docs/maintenance/organization.md`、`docs/architecture-guide/assurance/invariants.md`、`.agents/skills/architecture-design/SKILL.md`
- 版本核对：工作树 `.git` 指针、`/data/qiwei/repos/omne-harness-lite/.git/worktrees/dsh-e-loop-inbound/HEAD`、`/data/qiwei/repos/omne-harness-lite/.git/refs/heads/design/dsh-e-loop-inbound`

未读：`docs/research/agent-loop-events-and-hooks/README.md`、`docs/proposals/core-capabilities/fork/loop-source.md`、`spec/capabilities/live-agent/v1/Runtime.tla`、`spec/compositions/core-work-coordination/v1/Admission.tla`、`docs/architecture-guide/assurance/composability.md`、PF-001/006/008/010/012/014/015/016/018/021/022/023/024、`docs/requirements/system/constraints.md`、`observability-and-logging.md`。判断未依赖这些材料；U-5 通知命名空间、PF-004 完整派发协议、runtime-context 装配算法、多进程 epoch 活性按 README 声明不在范围，未评。

本评审不构成接受；无任何实现或工具执行证据；第 5 节模型为评审推导工具，供派发者改写为可运行模块，不是提案附件。
---

## 处置记录（r3 修订）

| 发现 | 处置 | 落点 |
|---|---|---|
| X1 Yield 释放占位 | 采纳 `YieldKeepSlot`：封闭 epoch、保留占位、Run 状态不变，E0 增加"重取"入口；AR-12 前提与 `yield_forced` | loop.md E0/E7，I-1，P-1，README A-1 |
| X2 waiting_gate 无进入边 | 进入点 E1/E3/E4/E4A，`(gateRef, gateRet)` 为 authoritative 意图，`AwaitGate` 意图；退出三条路；生产者为提供者义务；依赖门限定 Run 级 | loop.md，I-24，README A-2 |
| X3 双消费路径 | settled 视图只源自已裁决 arrival，新增 `settling`；E7/E0 直接读权威；每种请求唯一来源 | loop.md 词表，inbound.md 定义与来源，I-23，README A-3 |
| M1 | r3 曾按派发关系声明 `policy.busy`；同日用户裁定统一工具视角，改为以发起该调用的 Run 为判定对象，WorkRef 派发无发起 Run 落 C 列排队 | inbound.md 决定表，README A-4 |
| M2 | U-15 限定为结果路由 | loop.md E4，inbound.md 来源 |
| M3 | EC 只承接有序命令；结算词表与控制语义封闭 | loop.md EC |
| M4 | D 列拆 D1/D2，D2 无 `queue` | inbound.md 决定表 |
| M5 | `refs = run` 的 Run 级接续 | inbound.md，I-13 |
| M6 | 串行门以"不阻止收束"放行 | loop.md E4 |
| M7 | stopping/force_stopped 晚到结算 `closed(isolated)` | inbound.md 决定表 |
| M8 | I-17 限于外部来源 | inbound.md 有界，I-17 |
| M9 | E1 排除审批型接续；E4A 优先 | loop.md E1/E5 |
| M10 | E5W 唤醒集合、E6→E5 边、E4A 失败分支表 | loop.md |
| M11 | `schedule_due` 以 `originWork` 判定，`observedRun` 只溯源 | inbound.md arrival 对象与决定表 |
| M12 | 启动扫描为提供者义务 | inbound.md 恢复，I-21 |
| M13 | 记录为已接受代价 | inbound.md 终态协调，README |
| S1 | `gate_restored` B 列"不生成" | inbound.md |
| S2 | 跨会话答复等待只能是工具调用 | loop.md 接续来源 |
| S3 | `take*`/调度/重取的 operationId 派生 | loop.md，I-20 |
| S4 | Step 权威模型输出 | loop.md E3，I-8 |
| S5 | 措辞改为"arrival 只在 E1/E4A/E5/E5W/E6 消费；E7/E0 直接读权威" | loop.md |
| S6 | Yield 的 AR-12 前提 | loop.md E7 |
| S7 | 可见范围与消费水位的定义 | inbound.md context 水位 |
| S8 | I-1 措辞 | invariants.md |
| S9 | README 记录后果 | README |
| §6 就绪清单 1～18 | 1、2、3、5、6、7、8、9、10、11、12、13、14、15、16、17、18 已落入正文；4（context 上界）由 I-17 外部来源有界覆盖，context 意图不另设上界 | 各文件 |
| §5 模型 | 作为 run-driver v1 形式模型的起点，按 r3 裁决改写后随规格发布 | spec |
