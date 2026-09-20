# 独立评审 r1：逻辑闭合

评审对象：本提案修订 `bce30a0`（draft）。评审者：architecture-reviewer（只读，未运行任何工具，全部为手工推导）。评审日期：2026-09-14。派发重点：论证设计是否逻辑闭合，并保留可复用的形式化推导。

处置状态：**未处置**。发现的逐项处置与修订记录在本文末尾追加；第 4 节的最小模型是评审推导工具，接受时可作为正式 TLA+ 模型的起点，但不是提案附件本身。

---

# 评审：P-agent-loop-inbound（bce30a0，draft）— 逻辑闭合

评审对象：`/data/qiwei/repos/omne-harness-lite/.worktrees/dsh-e-loop-inbound/docs/proposals/agent-loop-inbound/{README,loop,inbound,invariants}.md`，修订 `bce30a0`。
需求基线：同工作树 `docs/requirements/`。消费契约：`spec/` 下 session-run/tools/human-decisions/model-execution/live-agent/durable-records v1、`compositions/core-work-coordination` v1、`data/core-work` v1（catalog 确认均为 accepted，依据 D-005/D-008）。
范围：逻辑闭合（节点出边、裁决表、封闭词表、不变式推导、恢复判定、形式化、契约冲突）。不评措辞与格式，不复议 U-1～U-10。
完成状态：范围内全部核对完成；无实际执行证据（提案本身也未声称），所有判断为手工推导。

## 1. 结论

**不闭合。** 依据三点，均为结构性而非措辞问题：

1. **E7 的出边错误。** 拓扑把 E7 无条件连到 E8"结算 Run"，但 `interrupt`/`interrupt_then_run` 的合法终点是非终态 `interrupted` 且释放占位（SR-10、SR-11），不经过 E8；而 I-14"结算前一律把未消费 continuation 转为 trigger"若沿 E7→E8 应用到 cancel/force_stop，直接与 SR-10"不能被迟到结果重新启动"、CC-06"cancelled 不复活"、HD-04"cancel 在共同提交内关闭阻塞请求"冲突。
2. **审批型接续没有出边。** 人类对 `system_approval`/`agent_approval` 的 approve 经 HD-08 成为 `continuation`，拓扑只有 E6→E1（开模型 Step），但 approve 后正确的下一步是 HD-06 的"再次核对→共同准入消费决定→`start`"，即 E4 语义；`decide` 的八种意图中没有对应意图。P-1 在此路径上无法成立，I-9 的"当且仅当"也被"收束后才批准并执行的调用"打破。
3. **意图与提交粒度不一致。** loop.md 声称"每个意图对应一次共同提交或一次无副作用的等待"，但 `RequestModel` 至少跨 admitted→dispatched→settled 三次提交加一次外部效果，`ProposeCalls` 跨 proposed→门/许可→`start` 回执；I-20 按意图派生一个 operationId，与 DR-02"同 operationId 异输入返回冲突"叠加后，要么第二次提交冲突，要么必须按提交而非按意图派生。I-18 的字面陈述（"不会产生第二次模型请求"）又被恢复表第 4 行（dispatch 后崩溃"按政策新 attempt"）自己否定。

其余为重要缺口（E1/E2 顺序、`schedule_due` 死锁、`subagent_result` 双投或饿死、`call_frame` 作为 arrival、空闲 Session 的未裁决 arrival 无人处理、Step 收束词表漏 `proposed`、前台等待无状态/意图等），修复后可达"有条件闭合"。整体框架（事实在权威处、位置是投影、意图封闭、恢复用同一 `decide`）是可行的；缺口集中在出边与原子性，不在原则。

## 2. 逐节点闭合论证

约定：Rc = Inbound 中指向本 Run、已裁决为 `continuation` 且未消费的 arrival 存在；Pq = 本 Run 仍有 pending 请求或未确认独立持有的后台责任；Ctl = 已受理的全 Run/Session 控制。

### E0 取得驱动

| 项 | 判定 |
|---|---|
| 前提由谁建立 | 新 Run：SR-06/07 的 `take*` 在同一提交建立 Run、占位、epoch，E0 被吸收；恢复/resume：E0 自己取新 epoch（SR-10、CC-06） |
| 提交什么 | 新 epoch、（恢复时）未裁决 arrival 的裁决 |
| 出边 | 图中只有 E0→E1。恢复表却要求 E0 后按折叠位置进入 E3 重试、E4 重新过门、E4/E5 重连、E6 重订阅、E7 继续收口 —— 这些出边存在但未画，也**没有对应意图**（八种意图里没有"继续 dispatch 已准入 attempt""继续收口""对已准入调用重发 start"） |
| 漏项 | 图上前提"阻塞集合为空"与正文"无全 Run/Session 控制阻塞"不一致：resume 到仍有 q2 pending 的 Run（HD-04）时阻塞集合非空但合法 |

### E1 开 Step

| 状态组合 | 出边 | 判定 |
|---|---|---|
| Run 启动，basis=text 批 | →E2 | 闭合 |
| Run 启动，basis=command | →E2→E3 模型请求？ | **未定义**：SR-07 的命令 Run 由"命令处理者"结算 success/rejected/failed/unknown，不必有模型；PF-009.C6 又允许上下文装载型 slash 进入普通输入流程。哪类 command 走 E2–E5、哪类不走，未说 |
| Run 启动，basis=trigger | →E2 | 闭合（前提 `takeTrigger` 与 Run 建立同一提交——未写明） |
| E5 后带已结算结果 | →E2 | 闭合 |
| E6 唤醒，Rc 为问题答复/拒绝/后台结算 | →E2 | 闭合 |
| E6 唤醒，Rc 为 approve | →E2→E3 | **错误**：应进入调用准入/启动（见 B2） |
| E2 辅助 Step 后返回 | 切点=？ | **未定义**：S1 已在 E1 冻结切点并消费接续 x,y（I-4）；压缩摘要是新事实，S1 的 manifest 无法包含它；只能废弃 S1 开 S2，则 x,y 需要被"再次消费"，与 arrival 单一 `consumed` 状态冲突 |
| context 水位 | 读取 | **owner 未定义**：谁推进水位、context arrival 是一次性消费还是长期可见、多个非终态 Run 共享 Session 水位如何 |

### E2 辅助 Step

| 组合 | 出边 | 判定 |
|---|---|---|
| 不需要 | →E3 | 闭合 |
| 需要，辅助成功 | →E1 | 见上，S1 归宿未定义 |
| 辅助 failed/unknown | — | **无出边**。MC-10 只定义切换场景的 `compression_unavailable`；Loop 内失败后是带超限上下文进 E3、还是 E7，未说 |
| 辅助后仍超限 | →E2? | **无上界**。MC-10"不无限重试压缩"只约束 switch；此处 E1↔E2 可无限循环，破坏进展 |

### E3 模型请求

| 结算 | 出边 | 判定 |
|---|---|---|
| success | →E4 | 闭合 |
| partial | →E4 | **需规则**：MC-06"流中途错误不是正常 finish"；被截断的 tool_call 是否 propose？ |
| failed，政策允许 | 同 Step 新 attempt | 闭合（I-8） |
| failed，政策不允许 | — | 未写；可从 E7"不可恢复失败"推出，应显式 |
| unknown → 核实成功/失败 | →E4 / 重试政策 | 闭合 |
| unknown → 核实不了 | — | **无出边**。P-3 允许 unknown 长期存在，但 Step 无模型结果不能收束；Run 停在什么状态、占位是否保留、如何退出，未说 |
| cancelled | →E7 | 闭合 |

### E4 调用批

| 组合 | 出边 | 判定 |
|---|---|---|
| 全部过门并 start/deny/ask | →E5 | 闭合 |
| 缺省串行：c1 已 start，c2..cn 尚未过门 | →E5 | **词表漏项**：c2 处于 TL-07 `proposed`，六种收束视图没有它；E5 无法判定 |
| 有 `executing_foreground` | E5 阻止收束 → 等待 | **无状态/无意图**：既不是 E6（E6 释放工具驱动，SR-08 waiting），八种意图也没有"等待前台调用"。硬规则"事实只在 E5/E6 被消费"与"前台执行中 Loop 在 E4/E5 等待"不能同时成立，除非承认 E5 有自环 |

### E5 Step 收束

| 批状态 | Rc | Pq | Ctl | 出边 | 判定 |
|---|---|---|---|---|---|
| 任意 | — | — | 是 | E7 | 闭合 |
| 含 executing_foreground / admitted_pending_start | — | — | 否 | 等待 | 见 E4 |
| 含 `proposed` | — | — | 否 | — | **未覆盖** |
| 非空全 settled | — | — | 否 | E1 | 闭合（"就绪接续"须显式包含本批结算结果） |
| 有 deferred 且 ≥1 settled 或 staged | — | — | 否 | E1 | 闭合（U-3） |
| 仅 waiting_approval/detached，无结果 | 否 | — | 否 | E6 | 闭合但未明写"无可喂模型内容 ⇒ E6 而非 E1"，否则违反 P-4 |
| 仅 deferred | 是 | — | 否 | E1 | 闭合 |
| 空批 | 是 | — | 否 | E1 | 闭合 |
| 空批 | 否 | 是 | 否 | E6 | 闭合 |
| 空批 | 否 | 否 | 否 | E8 | 闭合，但 E8 与新到 continuation 的竞争见 B4 |
| 含 `settled(unknown)` | — | — | 否 | 按上表 | **与 SR-14 疑似冲突**：SR-14 要求 unknown"阻塞依赖决定"；提案让它作 `tool_result` 进入下一模型决策 |

### E6 等待

| 事件 | 出边 | 判定 |
|---|---|---|
| Rc 就绪且无全 Run 阻塞（问题答复/拒绝/后台结算/暂行一次接续/前台子结果） | E1 | 闭合 |
| Rc 就绪但 Run 处于 interrupted 阻塞 | 停留 | 闭合（靠 SR-09 引用，提案应明写） |
| Rc = approve | E1 | **错误**，见 B2 |
| 控制 | E7 | 闭合 |
| 请求无答复而关闭（HD-06 approved_but_not_admitted、HD-07 模式切换关闭、TL-06 绑定撤回取代待办） | — | **无出边**：该位置已解除，Run 需重评 E5/E8 |
| 预算/依赖恢复（PF-019/020） | "感知" | **无机制**：不是 arrival，也没有订阅源；P-1 的"订阅不丢事件"对它们无对象。且与 E7"预算耗尽走收口→interrupted 需显式 resume"矛盾 |
| `schedule_due` 继续同一件工作 | 裁决表给 `queue` | **死锁**（见 3.11） |
| 跨会话答复（PF-017.C2） | 裁决表给 queue/context | Run 若在等它，永不唤醒 |
| 运行时退役（AR-11/12） | — | **未列**：不是用户 interrupt，也不能改写成它；`Yield(reason)` 可能是为此设，但未定义 |
| 显式 resume | E1 | 对 waiting 成立；对 interrupted 应经 E0 取新 epoch，不是 E6 |

### E7 收口

| 原因 | 合法终点（契约） | 图中出边 | 判定 |
|---|---|---|---|
| interrupt | `interrupted`，释放占位，非终态（SR-10） | E8 | **错误** |
| interrupt_then_run | `interrupted`+supersededByInput，释放占位（SR-11） | E8 | **错误** |
| cancel | `cancelled` 终态，关闭 pending 请求（SR-10、HD-04） | E8 | 出边对，但 I-14 转换政策冲突 |
| force_stop 确认安全 | `cancelled(force_stopped)` | E8 | 对 |
| force_stop 未证实 | `stopping` 长期，占位保留（SR-12） | — | P-3 承认，图未画 |
| 预算耗尽 | 状态未定（interrupted? failed? waiting?） | E8? | **未定义**，且与 E6 自动唤醒矛盾 |
| 不可恢复失败 | `failed` | E8 | 对 |
| 运行时退役 | 非终态，位置保留，占位 epoch 待接管 | — | **未列** |

### E8 结算 Run

| 组合 | 判定 |
|---|---|
| completed，转换 continuation→trigger | 语义可，但"结算前先转换"若是两次提交，中间可插入新裁决（3.4） |
| cancelled / force_stopped，转换 | **冲突**：SR-10、CC-06、PF-013.C2；U-10 说"已终态 Run"未区分终态原因 |
| 结算后谁调用 `take*` | P-2 无 owner |
| 占位释放是否与终态同一提交 | 未写；SR-06 要求"不存在活动驱动占位"才能开新 Run |

## 3. 反例搜寻记录

| # | 尝试 | 结果 |
|---|---|---|
| 3.1 | E5 批内 `waiting_approval`+`executing_foreground` | 被 I-9 排除（等前台结算再部分收束），但等待态无对应意图/节点 → **依赖未定义** |
| 3.2 | E5 批内 `proposed`（串行第二个调用） | **成立**：六种视图不覆盖 |
| 3.3 | E6 接续就绪与 interrupt 同时到达 | CC-01 全序：先裁决→continuation 挂在 interrupted Run，resume 后消费，被设计排除；但随后 cancel→E8→I-14 转 trigger→新 Run 从被取消工作的答复启动 → **成立**（与 SR-10/CC-06 冲突） |
| 3.4 | E8 结算与 continuation 裁决竞争 | 若"转换"与"Settle"是两次提交：Convert; Adjudicate(a2)(Run 仍非终态→continuation); Settle → I-14 违反 → **成立**；若同一提交且 Settle 前提含检查 → 排除 → **依赖未定义（原子性未写）** |
| 3.5 | 恢复重发模型请求（E3 准入后崩溃） | MC-04 要求 owner 发网前有耐久 dispatched 记录，遵守则排除；不遵守则成立 → **被设计排除，但依赖须显式列为提供者义务**（README 未决项已提到记录内容，未提到"先耐久后发网"这一义务） |
| 3.6 | 恢复表第 4 行"按政策新 attempt" | 第二次模型请求确实发出（供应方无法去重，MC-06）→ **对字面 I-18 成立**；设计已接受为局限，I-18 需改写为"不盲目重发同一 attempt；新 attempt 是经政策与准入的新记录" |
| 3.7 | 恢复重发工具 start | TL-08 同 attemptId 幂等接纳 + owner 重启先恢复账本 → **被设计排除**（提供者义务） |
| 3.8 | E1 切点提交前崩溃，恢复时 context 水位已推进 | 同 operationId 异输入；但若第一次是"完整未回执"，重同步后它已在前缀，fold 看到 Step 已开，不再重算 → **被设计排除，前提是 E0 第 2 步先于 decide（已写）**；恢复表"结果相同"的措辞过强 |
| 3.9 | approve 答复→E6→E1 | 模型 Step 无可喂内容（调用未执行）→ **成立**（缺 E4 路径） |
| 3.10 | 收束后才批准的不可转后台调用执行 | 谁持有前台等待关系、是否阻止当前 Step 收束、TL-10 未声明 detach 是否算后台 → **依赖未定义** |
| 3.11 | Run 安排"2 小时后继续同一件工作"（PF-011.C5）并在 E6 等待 | 到期→`schedule_due`→裁决表列 A 给 `queue`→`takeTrigger` 需无活动占位→该 Run 持占位→永不开始；Run 等的接续永不到 → **成立（死锁）** |
| 3.12 | delegate 结果到达 | 若同时是派发工具的 `call_settlement`(continuation) 与 `subagent_result`(B 列 context) → 双投；若只走 subagent_result 而 master 在 E6 等后台 deferred_receipt → 永不唤醒 → **依赖未定义，两种解读各有反例** |
| 3.13 | 终态 Run 的后台调用持续产生 `call_frame` | 裁决表 C 列→每帧一个 trigger→每帧一个 Run → **成立**；且与 TL-12"实时帧可非耐久、各订阅者独立游标"冲突 |
| 3.14 | 空闲 Session（无 Run）崩溃后留下 accepted 未 classified 的 `connector_condition` | E0 不会被进入（无 Run），队列无此项，P-2 前提为假 → 永不裁决 → **成立（进展）** |
| 3.15 | 预算耗尽 | loop.md E7 列入收口原因 → interrupted 需显式 resume；接续来源又列"预算恢复解除阻塞"自动就绪 → **矛盾** |
| 3.16 | E1 后 E2 触发压缩 | S1 已冻结切点并消费 x,y；S2 需再消费 → **依赖未定义** |
| 3.17 | 多个非终态 Run（A interrupted，B waiting）+ 无引用的 `connector_condition` | `observedRun` 取哪个 Run 未说 → **依赖未定义** |
| 3.18 | I-5 对子 Session 首个 Run | 派发任务既非 user_text 也非 trigger 来源 → **依赖未定义**（README 声明派发协议不在范围，但 I-5 用全称表述） |
| 3.19 | force_stop 后隔离永不证实 | `stopping` 长期占位，P-2 前提为假，P-3 承认 → 被设计接受 |
| 3.20 | U-3 部分收束后 I-11"写回顺序=模型发出顺序" | c1 deferred、c2 settled：c2 结果在 S2，c1 结果在 S3 → 跨 Step 无法保持发出顺序 → **对字面 I-11 成立**；SR-09 只要求"分别记录"，I-11 措辞强于契约 |

## 4. 形式化推导

手工推导，未运行 TLC。为可读性省略租户、多 Run、帧与预算；单 Run、单协调域、所有提交在模型中即时耐久（CC-03 的"完整未回执"用 Crash 后重读同一状态表示，因为重同步后它就在前缀里）。

```tla
---- MODULE LoopInbound ----
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS A                       \* arrival 身份
VARIABLES
  run,        \* ∈ {"none","running","waiting","interrupted","stopping","completed","cancelled"}
  epoch,      \* Nat；0 = 无持有者
  steps,      \* Seq [cut: SUBSET A, closed: BOOL]
  att,        \* SUBSET [step, ord, st ∈ {"admitted","dispatched","settled"}, sent: Nat]
  calls,      \* SUBSET [id, step, st ∈ {"proposed","waiting_approval","admitted","executing","settled"}, fg: BOOL, starts: Nat]
  arr,        \* [A -> [st ∈ {"none","accepted","classified","consumed","converted","closed"},
              \*        intent ∈ {"queue","continuation","context","control","none"}, obs, refs: BOOL]]
  pending,    \* 待人类决定的 call id 集合
  log,        \* Seq [op, input]   —— 每次共同提交
  inflight,   \* 易失：本进程已确认耐久、尚未发出的 attempt/call（Crash 清空）
  alive

Term    == {"completed","cancelled"}
NonTerm == {"running","waiting","interrupted","stopping"}
Cur     == Len(steps)
Ready   == {a ∈ A : arr[a].st = "classified" ∧ arr[a].intent = "continuation"}
Blocking(s) == ∃c ∈ calls : c.step = s ∧ (c.st = "proposed" ∨ c.st = "admitted" ∨ (c.st = "executing" ∧ c.fg))
Op(kind, s, o) == <<"R", s, kind, o>>       \* I-20 的 f
Commit(op, in) == log' = Append(log, [op |-> op, input |-> in])
Dedup(op, in)  == ∀i ∈ DOMAIN log : log[i].op = op ⇒ log[i].input = in   \* DR-02

Accept(a)     == arr[a].st = "none" ∧ arr' = [arr EXCEPT ![a].st = "accepted"]
Adjudicate(a) == arr[a].st = "accepted" ∧
  LET i == IF run ∈ NonTerm ∧ arr[a].refs THEN "continuation"
           ELSE IF run ∈ NonTerm THEN "context" ELSE "queue"
  IN arr' = [arr EXCEPT ![a].st = "classified", ![a].intent = i, ![a].obs = run]

OpenStep == alive ∧ epoch > 0 ∧ run ∈ {"running","waiting"} ∧ Ready ≠ {} ∧ (Cur = 0 ∨ steps[Cur].closed)
  ∧ Dedup(Op("OpenStep", Cur+1, 0), Ready)
  ∧ steps' = Append(steps, [cut |-> Ready, closed |-> FALSE])
  ∧ arr' = [a ∈ A ↦ IF a ∈ Ready THEN [arr[a] EXCEPT !.st = "consumed"] ELSE arr[a]]
  ∧ run' = "running" ∧ Commit(Op("OpenStep", Cur+1, 0), Ready)

RequestModel(o) == alive ∧ epoch > 0 ∧ ¬steps[Cur].closed ∧ ¬∃t ∈ att : t.step = Cur ∧ t.ord = o
  ∧ att' = att ∪ {[step |-> Cur, ord |-> o, st |-> "admitted", sent |-> 0]}
  ∧ Commit(Op("RequestModel", Cur, o), "admit")
Dispatch(t) == alive ∧ t.st = "admitted"
  ∧ att' = (att \ {t}) ∪ {[t EXCEPT !.st = "dispatched"]} ∧ inflight' = inflight ∪ {t}
  ∧ Commit(Op("Dispatch", t.step, t.ord), "dispatch")           \* MC-04 dispatched 记录
Send(t)     == alive ∧ t ∈ inflight ∧ t.st = "dispatched"
  ∧ att' = (att \ {t}) ∪ {[t EXCEPT !.sent = t.sent + 1]} ∧ inflight' = inflight \ {t}
SendEarly(t)== alive ∧ t.st = "admitted"                          \* 违反 MC-04 的变异
  ∧ att' = (att \ {t}) ∪ {[t EXCEPT !.sent = t.sent + 1]}
SettleAttempt(t) == alive ∧ t.st = "dispatched" ∧ att' = (att \ {t}) ∪ {[t EXCEPT !.st = "settled"]}
  ∧ Commit(Op("SettleAttempt", t.step, t.ord), "settle")

SettleStep  == alive ∧ ¬steps[Cur].closed ∧ ¬Blocking(Cur)
  ∧ steps' = [steps EXCEPT ![Cur].closed = TRUE]
Wait        == alive ∧ steps[Cur].closed ∧ Ready = {} ∧ (pending ≠ {} ∨ ∃c ∈ calls : c.st = "executing")
  ∧ run' = "waiting"
SettleRun(reason) == alive ∧ epoch > 0 ∧ steps[Cur].closed ∧ pending = {}
  ∧ ¬∃c ∈ calls : c.step = Cur ∧ c.st ≠ "settled"
  ∧ run' = reason ∧ epoch' = 0
  ∧ arr' = [a ∈ A ↦ IF arr[a].st = "classified" ∧ arr[a].intent = "continuation"
                     THEN [arr[a] EXCEPT !.st = IF reason = "completed" THEN "converted" ELSE "closed"]
                     ELSE arr[a]]                                   \* 原子：转换/关闭与终态同一提交
\* 分裂变体（提案现文可读成这样）：
Convert     == alive ∧ arr' = [a ∈ A ↦ IF arr[a].st="classified" ∧ arr[a].intent="continuation"
                                  THEN [arr[a] EXCEPT !.st="converted"] ELSE arr[a]]
SettleRunNoCheck(reason) == alive ∧ steps[Cur].closed ∧ pending = {} ∧ run' = reason ∧ epoch' = 0

Interrupt   == alive ∧ run ∈ {"running","waiting"} ∧ run' = "interrupted" ∧ epoch' = 0
Cancel      == alive ∧ run ∈ NonTerm ∧ pending' = {} ∧ SettleRun("cancelled")
Crash       == alive ∧ alive' = FALSE ∧ inflight' = {}
Recover     == ¬alive ∧ alive' = TRUE ∧ epoch' = epoch + 1
  \* E0：新 epoch；重读前缀（本模型状态即前缀）；裁决所有 accepted；不重放 Send

I13 == ∀a ∈ A : arr[a].intent = "continuation" ⇒ arr[a].obs ∈ NonTerm
I14 == run ∈ Term ⇒ ∀a ∈ A : arr[a].intent = "continuation" ⇒ arr[a].st ∈ {"consumed","converted","closed"}
I18 == ∀t ∈ att : t.sent ≤ 1
     ∧ ∀s, o ∈ Nat : Cardinality({t ∈ att : t.step = s ∧ t.ord = o}) ≤ 1
     ∧ ∀c ∈ calls : c.starts ≤ 1
I20 == ∀i, j ∈ DOMAIN log : log[i].op = log[j].op ⇒ log[i].input = log[j].input
======
```

**I-13 保持性。** 初始 `arr[a].intent="none"`，成立。只有 `Adjudicate` 写 `intent` 与 `obs`，且二者在同一动作由同一 `run` 值决定；`continuation` 分支要求 `run ∈ NonTerm`。"恰裁决一次"由 `Adjudicate` 前提 `st="accepted"` 与没有任何动作把 `st` 改回 `accepted` 保证；`Recover` 只对仍 `accepted` 的项裁决。**成立。** 前提缺失会破坏它的动作：若裁决不在 Run 终态转移的同一协调域全序（提案已要求），`Adjudicate` 读到的 `run` 可能落后于已提交终态。

**I-14 保持性。** 初始 `run="none"`，成立。唯一使 `run ∈ Term` 的动作是 `SettleRun`，它在同一动作里把所有 `classified` continuation 置为 `converted/closed`，后状态满足 RHS；终态后 `Adjudicate` 不再给出 `continuation`（I-13）。**原子变体成立。** 分裂变体最短反例：`Accept(a2)`；`Convert`；`Adjudicate(a2)`（`run="running"` → continuation, classified）；`SettleRunNoCheck("completed")` → `run ∈ Term` 且 `arr[a2].st="classified"`，I-14 假。提案的"结算前先转换并记录"须写成 `SettleRun` 的动作前提加同提交转换。另注：模型里 `reason="cancelled"` 走 `closed` 而非 `converted`，这是我为消除 3.3 反例加的政策，提案现文是"一律转换"。

**I-18 保持性。** 初始 `att={}`。`Send` 前提 `t ∈ inflight ∧ st="dispatched"`，`inflight` 只在 `Dispatch` 加入、`Send`/`Crash` 移除，`Recover` 不重建；故一个 attempt 至多一次 `Send`。`RequestModel(o)` 前提"不存在同 (step,o)"保证 (step,ord) 唯一。`starts ≤ 1` 依赖 owner 以 attemptId 去重（TL-08），模型中以 `StartCall` 前提 `starts=0` 表达（未展开）。**在 MC-04/TL-08 前提下成立。**
最短反例（去掉前提）：`OpenStep; RequestModel(0); SendEarly(t)`（sent=1）`; Crash; Recover;` 恢复规则"无 dispatched 记录 ⇒ 未发出 ⇒ 结算 cancelled，新 attempt"：`RequestModel(1); Dispatch; Send` → 同一 Step 两次真实请求。这说明 I-18 的成立条件不是 I-20，而是"发网前耐久 dispatched 记录（CC-03 受控效果等待耐久确认 + MC-04）"与"unknown 不重发"。
**CC-03 未知收敛下**：完整未回执批次在重同步后即在前缀，`Recover` 后的 fold 看到 `st="dispatched"` → 按 MC-06 走 unknown，不 `Send`；看到 `st="admitted"` 且无 dispatched → 未发出。两种都不产生对同一 attempt 的第二次 `Send`。唯一不能判定的是尾部损坏无法确认截回，此时 DR-04 隔离 writer，Loop 不推进，I-18 空成立。**结论：在 CC-03 下 I-18（按 attempt 计）仍成立；按"每 Step 至多一次真实请求"计不成立（恢复表第 4 行按政策发新 attempt），提案应按前者措辞。**
**I-20 是否充分？** 不充分：I-20 只去重"再次派生出同一意图"的本地提交；外部效果去重靠 `inflight`/账本语义（MC-04、TL-08）。且 I-20 需补两条：(i) 同 op 异输入返回 conflict 时 Loop 的处理是重读前缀重算，不覆盖；(ii) op 须按提交而非按意图派生（`RequestModel` 在模型里已拆成 `RequestModel/Dispatch/SettleAttempt` 三个 op 才能满足 `Dedup`）。

**I-20 保持性。** 每个提交动作以 `Dedup(op, in)` 为前提，`Commit` 追加；同 op 只能同输入追加。**在模型中成立**；对应现实前提：Loop 在 `decide` 前完成 E0 第 2 步重同步（否则会拿旧前缀派生同 op 异输入并被拒），提案已写。

**I-21。** 模型中 `Recover` 裁决所有 accepted，随后 `OpenStep` 只读 `classified`；但 `Accept` 可在 `Recover` 后、`OpenStep` 前发生，此时 I-21 作为状态谓词为假而系统无害——安全侧应改写为"`decide` 只读 classified"，进展侧改写为"每个 accepted 最终被裁决"。后者在模型里需要 `Adjudicate` 的弱公平性，且对 `run="none"` 的 Session 没有任何动作强制进入 `Recover` 的裁决步——对应 3.14。

**P-1 / P-2。** P-1（`run="waiting" ∧ Ready≠{}` ⇝ `OpenStep`）在模型中需 `OpenStep` 弱公平；但 approve 类 continuation 进入 `Ready` 后 `OpenStep` 会开一个无内容 Step（3.9），`schedule_due` 按提案裁决根本不进入 `Ready`（3.11）。P-2 需要一个不在模型中的 Session 级调度动作。**两条进展性质在当前正文下无法建立。**

## 5. 与契约的冲突与缺口清单

| # | 位置 | 条款 | 阻塞的承诺 | 最小澄清 |
|---|---|---|---|---|
| G1 | loop.md 拓扑 E7→E8；invariants I-14 | SR-10 interrupt→interrupted 非终态；SR-11 释放占位；SR-10/CC-06 cancelled 不复活；HD-04 cancel 关闭请求；PF-013.C2 | E7 完备性、I-1、I-14、U-10 的适用范围 | E7 按原因给三个终点（interrupted 释放占位 / stopping 保留 / 终态→E8）；E8 转换政策按终态原因区分：completed→trigger，cancelled/force_stopped→closed 并记录 |
| G2 | loop.md E6 出边、decide 意图；inbound.md human_answer 行 | HD-06 approve 后再次核对、共同准入消费决定、执行；TL-07 allow 联合提交取许可；CC-02 提交须核 epoch | P-1、I-9、I-10、HD-06 消费路径 | 增加"审批就绪→调用准入/启动"节点或意图（E4 子路径）；定义收束后被批准调用的执行 owner 与前台关系 |
| G3 | loop.md decide 输出、I-20 | MC-04 四态、TL-07/08 多次提交、DR-02 同 op 异输入冲突 | I-18、I-20、恢复表 3/5/7 行 | 把意图→提交映射写成固定序列，operationId 按 (RunRef, stepId, commitKind, ordinal) 派生；说明 conflict 的处理；I-18 改为"按 attempt 不重发；新 attempt 是政策准入的新记录" |
| G4 | inbound.md "与 Run 终态的协调"、loop.md E8 | CC-02 共同提交按确定顺序裁决 | I-14 | 转换与 Settle 同一提交，或 Settle 前提含"无 classified continuation"并在失败时重算 |
| G5 | loop.md 封闭词表 | TL-07 `proposed`；TL-10 detach 在途/启动即后台；HD-11 staged 与 settled 的优先级 | I-9 穷尽性、E5 判定 | 补 `proposed_pending_gate`（阻止或跳过）；定义 detach 在途视图；staged_provisional 优先于 settled |
| G6 | loop.md E4/E5 | SR-08"等待结算"是安全边界 | "意图穷尽出边"、恢复表"E4/E5 executing 中" | 承认前台等待是一个节点/意图（AwaitCalls），与 E6 区分 |
| G7 | loop.md E1/E2 顺序 | I-4 切点不可变；MC-07 在明确切点装配；U-4 | I-4、arrival `consumed` 单次 | 把 E2 判定移到 OpenStep 提交之前（准备阶段可算窗口，CC-02 允许），或定义 S1 废弃与接续转移规则 |
| G8 | inbound.md 裁决表 schedule_due 行 | PF-011.C5 等待期间释放执行资源、到期一次逻辑接续；SR-08 waiting 占位 | PF-011.C5 覆盖、P-1/P-2 | 若 Run 等待该到期则为 `continuation`；或规定"继续同一件工作"必须先结算 Run 再以 trigger 续 |
| G9 | inbound.md subagent_result/call_settlement 行 | PF-004.C3 结果回到正确 master、交付不重复；U-9 | "不能双投"、P-1 | 明确 delegate/spawn 结果只走一个来源；U-9 的"不在前台等待"改为"无待答位置引用它" |
| G10 | inbound.md call_frame 行 | TL-12 帧可非耐久、独立游标、frame limits | I-17、P-4、TL-12 | 帧不进 Inbound；只有结算是 arrival |
| G11 | inbound.md 恢复时的裁决；I-21 | SR-02 队列结算、CC-06 恢复读队列 | I-21、P-2、PF-002.C9"不丢失已成立响应" | 指定 Session 级 Inbound 裁决者（不依赖 E0）；I-21 改写为 decide 只读 classified |
| G12 | loop.md E7 预算耗尽 vs 接续来源"预算恢复" | PF-019.C6、SR-10 resume 显式 | E6 出边、P-1 | 二选一并给出 wake 机制或删除该来源 |
| G13 | loop.md E3 partial/unknown/failed | MC-06 部分内容明确可见、unknown 核实 | E3 完备性 | 补三条出边 |
| G14 | loop.md 封闭词表 `settled(unknown)` | SR-14 unknown 阻塞依赖决定 | E5 与 SR-14 一致性 | 澄清"以标明 unknown 的 tool_result 进入下一决策"是否满足 SR-14，或需要人类/政策解除 |
| G15 | inbound.md 裁决表列头 | SR-08 一个 Run 可多次激活；I-1 多个非终态 Run | `observedRun` 唯一性 | 无引用来源的"Run"定义为占位持有 Run；有引用来源为被引用 Run |
| G16 | loop.md `Yield(reason)`；E7 原因列表 | AR-11/12 退役收口不改写为用户控制；PF-005.C5 热宽限只回收实例 | live-agent 端口映射、E7 完备性 | 定义 Yield = 安全边界主动释放驱动、Run 状态不变 |
| G17 | loop.md E1 command basis | SR-07 命令处理者结算；PF-009.C6 两类 slash | I-5、命令 Run 路径 | 说明哪类命令 Run 走模型拓扑 |
| G18 | inbound.md provisional_outcome 行 | HD-12 四种回传策略 | PF-007.C7 覆盖 | 补"只改变产物"（无 arrival）与"显式补偿流程"落点 |
| G19 | inbound.md `queue` 意图、U-7 | SR-04 kind 封闭为 text/command；SR-06 遇 command 停止 | I-5、takeTrigger、SR-06 消费者 | 需 session-run 新版本或新契约登记 trigger kind 与 takeTrigger；提案已把落点列为未决 |
| G20 | invariants I-11 | SR-09 只要求分别记录 | I-11 与 U-3 | 改为"每个 Step 呈现顺序内保持发出顺序；deferred_receipt 占位" |
| G21 | inbound.md arrival 字段 `state` 含 `delivered` | U-2 只有意图是权威 | 提交次数、I-13 | delivered 定为非权威或删除 |
| G22 | loop.md E1 context 水位 | SR-13 projection 有 owner 与 watermark | I-4、I-18 的 view 定义 | 指定水位 owner、推进时点、是否一次性消费 |

U-裁决与契约的冲突（不复议，仅指出后果）：U-10 需限定终态原因（G1）；U-3 与 I-11 措辞（G20）、与 HD-06 收束后执行（G2）；U-7 触发 SR-04/06/07 版本义务（G19）并使"系统发起 interrupt_then_run"超出 SR-11 的"新 input"定义；U-9 的"前台等待"需精确化（G9）；U-4 与 P-4（辅助 Step 是无接续的模型请求，P-4 应豁免）及 G7；U-1/U-2 与 SR-08 把"驱动位置"列为 Run 字段——可通过 SR-13 projection 类贡献调和，应写明。

## 6. 发现清单

**阻断**
- B1 [loop.md 拓扑；E7；invariants I-14] E7→E8 无条件；interrupt 终点错误；cancel/force_stop 的 continuation 转换与 SR-10/CC-06/HD-04 冲突。（G1）
- B2 [loop.md E6、decide 输出；inbound.md human_answer 行] 审批型 continuation 无准入/启动路径；收束后批准的调用 owner/前台关系未定义。（G2）
- B3 [loop.md decide 的输入与输出、operationId；invariants I-18/I-20；恢复表第 4 行] 意图/提交粒度不一致；I-18 字面与恢复表矛盾；I-20 非充分条件。（G3）
- B4 [inbound.md 与 Run 终态的协调；loop.md E8] 转换与结算的原子性未写，存在最短反例。（G4）
- B5 [loop.md Step 收束的封闭词表；E4/E5] 漏 `proposed`；前台等待无节点/意图；SettleStep 无对应提交。（G5、G6）

**重要**
- M1 [loop.md E1/E2] 辅助 Step 后原 Step 归宿与接续再消费。（G7）
- M2 [inbound.md schedule_due 行] 继续同一件工作死锁。（G8）
- M3 [inbound.md subagent_result 行] 双投或饿死。（G9）
- M4 [inbound.md call_frame 行] 帧作 arrival。（G10）
- M5 [inbound.md 恢复时的裁决；invariants I-21] 空闲 Session 未裁决 arrival 无人处理。（G11）
- M6 [loop.md E7/接续来源] 预算耗尽路径自相矛盾；预算/依赖恢复无唤醒机制。（G12）
- M7 [loop.md E3、E2] partial/unknown/failed 出边；辅助失败与循环上界。（G13）
- M8 [loop.md 封闭词表] `settled(unknown)` 与 SR-14。（G14）
- M9 [inbound.md 裁决表] `observedRun` 选择。（G15）
- M10 [loop.md decide 输出、E7] `Yield` 未定义；运行时退役未列。（G16）

- M11 [loop.md E1 启动依据] 命令 Run 在拓扑中的路径未定义。（G17）
- M12 [invariants I-11] 与 U-3 部分收束冲突，措辞强于 SR-09。（G20）
- M13 [loop.md 接续来源"显式 resume"] interrupted Run 的 resume 应经 E0 取新 epoch，不是 E6 唤醒。

**建议**
- S1 [inbound.md arrival 字段] `delivered` 定为非权威或删除。（G21）
- S2 [loop.md E0 图注] "阻塞集合为空"改为"无全 Run/Session 控制阻塞"。
- S3 [loop.md 恢复表第 2 行] "结果相同"改为"结果由重同步后的前缀决定"。
- S4 [loop.md E1/E8] 写明 `takeTrigger` 与 Run 建立同一提交、占位释放与终态同一提交。
- S5 [invariants I-5] 限定适用范围到本提案的 Run 启动路径，或补子 Session 首个 Run 的 basis 来源。
- S6 [inbound.md] 裁决提交的 operationId 从 arrivalId 派生（I-20 只覆盖 Loop 意图）。
- S7 [inbound.md provisional_outcome 行] 补 HD-12 另两种回传策略的落点。（G18）
- S8 [loop.md 三层拆分] 说明 SR-08"驱动位置"字段以 SR-13 projection 贡献实现。
- S9 [loop.md 恢复表] 补"Loop 存活但与执行 owner 分区"一行（不换 epoch，按 TL-11 unknown/lost）。
- S10 [invariants P-4] 豁免辅助 Step，或定义辅助 Step 的启动依据。
- S11 [loop.md E1 context 水位] 指定 owner 与消费语义。（G22）

## 7. 未决问题与需要派发者澄清的输入

政策未决（阻塞对应承诺，不代选）：
1. 终态原因与 continuation 转换政策：completed 转 trigger、cancelled/force_stopped 关闭，是否符合用户对 U-10 的本意？需要用户确认 U-10 的范围。
2. 收束后被批准的不可转后台调用由谁持有前台关系：阻止当前 Step 收束，还是以"审批后独立执行"作为 TL-10 之外的第三种关系？影响 I-9/I-10 与 tools v1 是否需新版本。
3. 预算耗尽是 E7 收口（需显式 resume）还是 waiting（自动唤醒）：影响 PF-019.C6 的产品表现。
4. `schedule_due`"继续同一件工作"是 Run 内等待还是 Run 结算后触发：影响 PF-011.C5 的实现形态与 SR-08 占位规则。
5. delegate/spawn 结果的唯一来源（派发工具的 call_settlement 还是 subagent_result）：属 PF-004 协议范围，README 声明不在本提案内，但裁决表已给出行，须二选一。
6. Inbound 的规格落点（session-run v2 / 独立能力 / 组合契约）：影响 SR-04/06/07 版本义务与 I-13/I-14 的保护位置归属。

证据缺口：
- 全部性质为手工推导，无 TLC 结果；提案自述 TLA+ 待附。第 4 节模型可作起点，但它把 CC-03 收敛简化为"重同步后即在前缀"，尾部损坏与 writer 隔离未建模。
- MC-04"发网前耐久 dispatched 记录"与 TL-08 owner 幂等接纳是 I-18 的外部前提，需在提供者验收中作为义务列出；本评审未核对任何提供者实现。

未覆盖范围：
- 通知命名空间与作用域过滤（U-5）、PF-004 三种派发关系完整协议、runtime-context 装配算法：按 README 声明不在范围，未评。
- 租户维度：arrival 带 tenantId 与 CD-01 一致，但跨会话消息（PF-017.C3）的目标授权检查在裁决前还是受理前，提案未写；本轮未深入，列为后续。
- 多进程旧 epoch 活性：README 已列未决，单进程首版不评。

## 8. 阅读范围

已读（均在 `/data/qiwei/repos/omne-harness-lite/.worktrees/dsh-e-loop-inbound/`）：
- 待审稿：`docs/proposals/agent-loop-inbound/README.md`、`loop.md`、`inbound.md`、`invariants.md`
- 契约：`spec/capabilities/session-run/v1/contract.md`、`spec/capabilities/tools/v1/contract.md`、`spec/capabilities/human-decisions/v1/contract.md`、`spec/capabilities/model-execution/v1/contract.md`、`spec/capabilities/live-agent/v1/contract.md`、`spec/capabilities/durable-records/v1/contract.md`、`spec/compositions/core-work-coordination/v1/contract.md`、`spec/compositions/core-work-coordination/v1/Admission.tla`、`spec/compositions/core-work-coordination/v1/scenarios.md`、`spec/data/core-work/v1/contract.md`、`spec/catalog.json`（仅八项条目）
- 需求：`docs/requirements/product/user/PF-013`、`PF-007`、`PF-008`、`PF-009`、`PF-019`、`PF-023`；`docs/requirements/product/agent/PF-003`、`PF-004`、`PF-005`、`PF-011`、`PF-017`；`docs/requirements/product/environment/PF-002`、`PF-020`；`docs/requirements/system/long-running-and-evolving.md`、`runtime-state-and-continuity.md`、`observability-and-logging.md`
- 决定与计划：`docs/decisions/D-006-dsh-core-adoption.md`、`D-008-core-capabilities.md`；`docs/proposals/dsh-core-adoption/design-plan.md`；`docs/proposals/core-capabilities/fork/loop-source.md`
- 方法：`.agents/skills/architecture-design/SKILL.md`、`docs/architecture-guide/assurance/invariants.md`、`docs/architecture-guide/assurance/composability.md`
- 版本核对：`.git`（指针）、`/data/qiwei/repos/omne-harness-lite/.git/worktrees/dsh-e-loop-inbound/HEAD`、`/data/qiwei/repos/omne-harness-lite/.git/refs/heads/design/dsh-e-loop-inbound`

未读：`docs/research/agent-loop-events-and-hooks/README.md`（判断未依赖）、`docs/maintenance/spec-maintenance.md`、`docs/maintenance/organization.md`、`spec/capabilities/live-agent/v1/Runtime.tla` 与 `scenarios.md`、`docs/proposals/agent-core/v1/execution.md`、`docs/requirements/system/constraints.md`、PF-001/006/010/012/014/015/016/018/021/022/024、`docs/proposals/core-capabilities/review.md` 与 `requirements.md`。

本评审不构成接受；未验证任何实现；第 4 节模型为评审推导工具，不是提案附件。
---

## 处置记录（r2 修订，2026-09-14）

用户对评审第 7 节六个政策问题的裁决记为 README 的 U-11～U-16。逐项处置如下；
"已处置"指 r2 正文已按最小澄清修改，"接受为局限"指写入验证边界而非修改设计。

| 发现 | 处置 | 落点 |
|---|---|---|
| B1（G1） | 已处置：E7 按原因分五个终点；E8 转换按终态原因区分，cancelled/级联关闭一律 `closed`（U-11） | loop.md E7/E8，inbound.md 决定表 D 列，I-14 |
| B2（G2） | 已处置：新增 E4A 与意图 `AdmitApproved`；收束后批准的调用作为 E6 的等待位置（U-12） | loop.md E6/E4A，I-9、I-22 |
| B3（G3） | 已处置：operationId 按提交种类派生；I-18 改为按 attempt 不重发；两项提供者义务写入恢复一节 | loop.md decide 一节，I-18、I-20 |
| B4（G4） | 已处置：结算与接续处理同一提交，作为 E8 动作前提 | loop.md E8，inbound.md 终态协调，I-14 |
| B5（G5、G6） | 已处置：词表补 `proposed_pending_gate`、`detach_in_flight`，staged 优先于 settled；新增 E5W 与意图 `AwaitCalls` | loop.md 封闭词表/E5W，I-9 |
| M1（G7） | 已处置：E2 判定移到 OpenStep 提交之前的准备阶段；辅助 Step 不消费 arrival；每次准备最多一次 | loop.md E1/E2 |
| M2（G8） | 已处置：按 U-14 原 Run 先结算，到期 trigger | inbound.md schedule_due 行 |
| M3（G9） | 已处置：按 U-15 子代理结果只走 `call_settlement`，删除 `subagent_result`/`handoff_result` 来源 | inbound.md 来源枚举 |
| M4（G10） | 已处置：帧不是 arrival | inbound.md |
| M5（G11） | 已处置：Session 级裁决者不依赖 Loop；I-21 拆为安全侧与进展侧 | inbound.md 恢复时的裁决，I-21 |
| M6（G12） | 已处置：按 U-13 走 `waiting_gate`，新增来源 `gate_restored` | loop.md E6，inbound.md |
| M7（G13） | 已处置：E3 出边封闭表；E2 失败与上界 | loop.md E3/E2 |
| M8（G14） | 已处置：unknown 进入模型决策，系统侧依赖决定保持阻塞 | loop.md 封闭词表注 |
| M9（G15） | 已处置：`observedRun` 取引用 Run，否则占位持有 Run | inbound.md arrival 对象 |
| M10（G16） | 已处置：`Yield` 定义为运行时退役的安全边界释放，Run 状态不变 | loop.md E7 表 |
| M11（G17） | 已处置：新增 EC 命令处理者路径 | loop.md 拓扑/EC |
| M12（G20） | 已处置：I-11 收窄为 Step 内顺序 | I-11 |
| M13 | 已处置：interrupted 的 resume 走 E0 | loop.md E0/接续来源 |
| S1～S11 | 已处置（S1 删除 `delivered`；S2 前提措辞；S3 恢复表措辞；S4 同提交；S5 I-5 范围；S6 裁决 operationId 从 arrivalId 派生；S7 四种回传策略；S8 SR-13 projection；S9 分区行；S10 P-4 豁免；S11 水位 owner） | 各文件 |
| 政策问题 1～6 | 用户裁决 U-11～U-16 | README |
| 证据缺口 | 保留：无 TLC 结果；形式模型在接受前补齐，范围见 invariants.md 证据义务 | invariants.md |
| 租户维度（PF-017.C3 授权检查时点） | 已处置：受理时检查，不获准不受理也不泄漏存在 | inbound.md arrival 对象 |
