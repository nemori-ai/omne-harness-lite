# 实然：推进链路的缺口（读码 + 2026-11-25 真部署日志）

证据来源标在每行：读码（文件:行）或日志（`tmp/skins-three/logs/server.log` 的时刻）。

## 推进触发怎样工作

- `session/src/advance.ts` 的 `check()`（第 606 行）每次被叫醒都从日志现算：`grantedNotInvoked` → `replay`→`invoke`；`waitingInputs(snapshot, known)` → `handIn`→`submit`；`judgeRunStart` 合格 → `openRun`→`start`→`invoke`。义务本身是日志的函数。
- 叫醒来源：提交叫醒；`scan.ts` 的周期扫描（`PERIODIC_REASONS = inputs, unresolved, controls, run`，每 30 s，会话退避 5 s 起、翻倍、上限 300 s）。扫描对一个会话：有 `runStartInputs`（待处理的可叫醒输入，不论有没有活跃 Run）就 `advance.trigger`；有活跃 Run 就 `recovery.trigger`（读码 scan.ts:79-80）。

## 缺口

| 编号 | 缺口 | 位置 | 后果 | 对应的卡死 |
| --- | --- | --- | --- | --- |
| R1 | **内存的「已交出」遮住日志里缺的一步**：`submit` 拿到 Agent 受理后先 `known.note` 再 `handOver`；`handOver` 答 `unavailable` 时事实没进日志，`known` 却已记上。之后 `check()` 里 `waitingInputs(snapshot, known)` 把这条输入当作已交出，什么都不做。`known` 只在 Run 变了才清 | advance.ts:385-388（`recorded`）、known-handovers.ts、advance.ts:612 | 日志里缺「交入」事实，内存认为已交；扫描每次都被遮住 | **不是**第 2 次卡死的原因：`receive unavailable` 在发行里恒定出现（见下「2026-11-25 更正」） |
| R2 | **有界重试用完即弃**：`invoke`、`submit`、`openRun` 对 `busy / unavailable / commit-unknown` 按 `[1s, 5s, 30s]` 重试，用完只 `report('retries-exhausted')` 就返回；`handOver` 只对 `commit-unknown` 安排认回，`unavailable` 直接丢 | advance.ts:239-246、401-417、516-526、567-570 | 放弃之后要等下一次叫醒；叫醒若也被 R1/R3 遮住，就永久悬置 | 第 1、3 次 |
| R3 | **「活体存在」被当成「在推进」**：`agent-host-local` 的 `contact` 只要内存里有运行体就答 `live`；拿不出证据时答 `unknown`。`session-adapters` 的 `inspect` 只在 `lost` 时给出失联证据；`recover.ts` 的 `check()` 只在 `handsBack`（挂起，或挂接活着且已失联）时接手，否则返回 | agent-host-local/src/host.ts:921-928；session-adapters/src/cordis/agent-drive.ts:374-381；session/src/recover.ts（`handsBack`、`check`） | 运行体还在但不再推进时，Session 无限等 | 代码事实成立；没有任何现场显示它造成了卡死（见下「2026-11-25 更正」） |
| R4 | **被取消轮次的推进位不让出**：旧轮取消后 Agent 端实例以 `stale-advance` 停下（10:24:02），新一轮 `invoke` 每次三档重试全答可重试失败（10:24:39、10:25:17、10:25:53 `retries-exhausted`，间隔约 37 s，是扫描 → `replay` → `invoke`）；直到重启才通 | agent-host-local/src/host.ts:480-495：`expire` 只在 `entry.reported.kind === 'idle'` 时回收；被 `stale-advance` 停下的执行留在实例上算未了结（`failedRuns`），实例从不报 idle。日志 10:26:30「ordered stop left 1 unsettled: agent-instance-af8596fd…: quiesce left 1 execution(s) unresolved: run_9bbe5385…」。新一轮按 `sessionSlotReference(session, adoption)` 取同一个槽 | 取消后发新消息，新一轮交不进去 | 第 3 次 |
| R5 | **永久性失败被当成瞬时失败无限重试**：日志解释对 `required original material is missing` 每 5 s 重试，`call 555` 仍在继续；对 `answered changed` 按 0 ms 紧贴重试 | 日志（run_292f…）；session-adapters 的 journal-interpretation | 无止境的读压（F36、#1640 的放大器）；这一轮永不收场 | s18 测试会话 |
| R6 | **一轮只带首条输入开始**：`openRun` 以 `judgeRunStart` 的 `first` 开始并只把它交给 `invoke`，其余待处理输入经 `handIn` 在后续步骤补交；规格「新 Run 分两次提交……带首条输入」写的就是这样 | advance.ts:549-582；packages/session/SPEC.md「Run 与推进资格」 | 失败轮作废的输入作为 `first` 单独一步回答，新输入下一步再答（F1） | F1 |
| R7 | **启动恢复与扫描不覆盖「已开 Run、Agent 尚未受理、invoke 已放弃」之外的组合** | recover.ts 的 `checkedRun` 对未受理的一轮返回空；它由 advance 的 `replay` 负责，但 `replay` 也受 R2/R4 限制 | 叠加 R4 时永久悬置 | 第 3 次 |
| R8 | **界面投影与日志不一致**：日志有未终结 Run 时桌面端显示空闲、没有停止按钮，显示「还有 2 句话排着没处理」 | 截图（evidence/omne-crop.png）；会话观察的投影待第 4 步细读 | 人无从自救 | 第 2 次 |

| R9 | **撤销归档后的新一代作用域没有会话自有块的注册**（F11 根因，子代理现场只读核实，`f11/report.md`）：注册只在创建时写进第 1 代；`tools.ts:95` 把 `heldBy` 的确定拒绝 `refused` 译成 `unavailable`，Agent 在 I1 每约 15 s 重查，永不收场 | session-contract/src/decide-initialization.ts:166-168、decide-management.ts:149；apps/harness-server/src/rows/agent-context/tools.ts:90-95；session-ad03/published-view.ts:60-105 | 任何 coding 会话归档再撤销都卡死；重启救不回 | F11 |
| R10 | **一步推进的读量随日志变长**：同一会话每步约 80 次 readWork、60–170 页 history.next，pass.run 从 0.5 s 涨到 2.5–3.7 s；快照仅约 40 KB，读慢在于排队（每域 2 个读线程）。调用方待定位：遥测每个翻页是独立 trace | server.log 11:04:53 一步的窗口；sqlite 只读：会话 9401ad… 2905 条、7.2 MB、5 轮 | 会话越长越慢；放大 #1640 的跨租户饥饿 | I-10 |

## 2026-11-25 更正：第 2 次卡死的归因，与已有 issue 的关系

证据：`evidence/timeline-1005-1028.txt`（服务端日志 10:05–10:28Z）；轨道头 `02a9e3103` 的代码；issue #1195、#1197、#1319 的正文与评论；`evidence/tlc-liveness-no-evidence-source.log`。

### 被推翻的

- **R1 不是第 2 次卡死的原因。** `C2 receive unavailable` 在发行里是恒定行为，不是「依赖一时不可用」：`apps/harness-server/src/entry/session-evidence-sources.ts` 的两个证据来源 `prepare` 无条件答 `unavailable`（诊断文本：`the original owner's row is not delivered`）。#1195 的实例表把它列为「永久缺失 → 暂时」，#1197 的差异 G8 写的是同一处。反例：10:26:43 新一轮同样两条 `receive unavailable`，随后一切正常。交入事实的纯裁定 `decideHandover`（session-contract/src/decide.ts:472-497）没有 `unavailable` 这一支。
  R1 描述的代码行为（先 `known.note` 再 `handOver`，失败不撤）是事实；它是不是缺陷取决于交入回执写不写得上。发行里写不上，`known` 在那里的作用是不对 Agent 已受理的输入反复 `submit`。
- **`answered changed; again in 0 ms` 不是卡死标志**，是每一步都有的常态日志。
- **「Agent 在 F2 等交入事实」不成立。** `F2`（agent/src/loop/coordinator.ts:2982）只读执行状态、判取消、置 `settling`；核对待交输入在 `F3` 的 `tryFinish`。
- **「收尾节点的等待没有重查、只能靠外部叫醒」没有依据。** `waitFor` 的第三个参数是依赖重查；#1197 实测被挡之后按检查间隔（发行 1000 ms）到点重跑。

### 没有证据的

- **R3 对任何一次卡死的归因。** `contact` 以运行体存在答 `live` 是代码事实（host.ts:922-928）；没有任何现场显示它造成了卡死。

### 第 2 次卡死：现在知道的与不知道的

知道的：10:09:46 最后一次工具结果交付之后，这一轮 5 分 39 秒没有任何日志或事件；10:15:25 有序停止时运行体在 `step=step-50 node=F2`，`quiesce` 在期限内没有答；当时界面上有两句话排着。运行体没有以失败停下（没有 `agent run stopped on a failure`）。

最贴近的已知缺口是 #1197 根因的第 3 步：条件终结被 Session 的只读参加挡回（有已受理、未交入、也没被取走的输入），Agent 回 `R0` 重新求值，到点再试，再被挡。它要成立，需要「Agent 已受理的输入一直没被取走」，这落在 #1197 现状评论里写明没有核的 G2、G3。**未证实。**

它不是 #1319 的签名：#1319 是以 `changed` 失败停在 `I8`，执行留着占住实例。

**已复现（2026-11-25，独立装配，替身模型，`evidence/repro/`）：**

| 组 | 做法 | 结果 |
| --- | --- | --- |
| `control-step-limit` | 一轮一直要工具，不发第二句 | 第 50 次模型请求后以 `failed` 终结；`C2 receive unavailable` 1 次；停服退出码 0 |
| `second-at-45` | 第 45 步发第二句 | 第 46 次请求读到第二句，`completed`；停服退出码 0 |
| `second-at-50-step-limit` | 第二句恰在第 50 步到达，模型继续要工具 | **这一轮 4 分钟后仍 `not ended`，模型从未读到第二句，停服退出码 5** |

机制（代码）：到 `maxRunSteps`（缺省 50）时 `stepLimit` 把「取输入」改判为以失败收尾（agent/src/loop/coordinator.ts:943-975），不再取输入；Session 的 `judgeCompletion`（session-contract/src/judgments.ts:330-343）在还有待处理且未交入的输入时不让收场，而发行里交入回执写不上，所以只有「被取走」才能解除。Agent 不取，Session 不放。现场第 2 次正是 `step-50`、排着两句话。

### 不受影响的

R4（第 3 次：10:24:02 `node=F1 failure=stale-advance`，新一轮 `C2 invoke retries-exhausted` 四次，10:26:30 `quiesce left 1 execution(s) unresolved`；`expire` 只回收 idle）。它与 #1319 的后半（以失败停下的执行占着实例）是同一个后果机制。R2 的代码事实成立，但第 3 次解不开是因为 R4：扫描每约 37 秒就重来一次，义务没有丢。R5、R6、R9、R10 的证据不变。

### R10 的第一份读数（2026-11-25，独立装配，`evidence/probe-steps/`）

同一会话 4 轮、每轮 45 步（一步 = 一次模型请求加一次 `echo` 工具调用），取每轮第 5 到 40 步的平均：

| 轮 | 每步存储读 | 每步提交 | 其中 `identity read-standing` | `read-work-version` | `read-work-index` | `read-history` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1254 | 93.6 | 641 | 222 | 36 | 29 |
| 2 | 1288 | 98.8 | 662 | 221 | 36 | 29 |
| 3 | 1208 | 100.2 | 592 | 219 | 36 | 29 |
| 4 | 1326 | 102.2 | 689 | 221 | 36 | 29 |

读到的：这份小负载下读数不随轮数涨，但常数极大：**一步约 1250 次存储读、约 95 次提交**；一半是身份的 `read-standing`（每次访问裁定都读一次存储），其次是每次 `readWork` 前的版本读。每步提交数随轮数缓涨（93.6 → 102.2）。真部署上 pass.run 随会话变长，与这些读在每域 2 个读线程上排队、以及历史页数随字节增长相符（后者这份负载太小，没有量到）。调用方的栈没取到（异步边界丢了），留给第 3 程在领域读面上打标。

### R4 的候选根因（代码依据，未复现）

`agent/src/loop/coordinator.ts` 的 `failedNode`：节点撞上 `stale-advance` 时重读执行记录，已终结走 `F4`，记录里已有取消走 `F0`；两者都不是时直接以失败停下（`agent run stopped on a failure … failure=stale-advance`）。只有 `E2` 一处为「推进资格被撤、原因还没进执行记录」设了等待（`waitForRevocationCause`）。于是会话里取消已提交、取消控制还没写进 Agent 执行记录的这个窗口里，其余节点都会让执行以失败停下而不收场；实例不报 idle，`expire` 不回收，槽被占，新一轮 `invoke` 一直答可重试失败。三处现场签名一致：本机第 3 次（`node=F1`）、#1404 正文（`node=I1`）、#1404 评论（`node=I8`）。复现尝试：`probe/probe-midrun-input.ts --when cancel-model|cancel-tool` 两种时机各一次都**没有**触发（取消的一轮 `cancelled`，下一轮 `completed`，停服退出码 0；`evidence/repro/cancel-*`），与 #1404「不带插队 0/4」一致。它依赖更窄的时序或别的导火索（强杀、`command_limit`）；槽位不释放这一后果机制用成员级的确定性用例验证。

### 第 4 次现场（2026-11-25 11:40Z，`evidence/incident-1140/`）

- 11:40:49 上一轮在 `F2` 以失败停下：`failure=invalid diagnostic=field storage: command_limit`（收尾那次提交超过了存储对整条命令的上限）；前一秒 `reception: the maintenance of … was denied; it stops`。
- 11:40:59 新输入开出新一轮，11:41:35 `C2 invoke retries-exhausted`。
- 11:42:41 起约每秒新开一轮并立刻 `C2 invoke other`，20 秒 17 轮（新现象：开轮风暴，原因未查）。
- 11:44 重启后新一轮被受理，工具调用恢复。

与第 3 次同一个后果机制（执行以失败停下 → 槽位 `failed` → 新一轮进不去 → 重启才解），导火索不同：这次不是取消，是收尾提交超限。导火索至此已见四种：取消的竞态（`stale-advance`）、`changed`（#1319）、强杀重启（#1404）、`command_limit`。

### 与已有 issue 的关系（开 #1649 之前没有查，这里补上）

| issue | 状态 | 与本线的关系 |
| --- | --- | --- |
| #1195 依赖一时答不了之后出错 | 开 | 同一类病的系统陈述：性质 U1 到 U6、分程建议。本线的 I-1、I-2、I-3、I-8 与它大面积重合。U5「永久缺失不冒充暂时」、U6「重试不放大拥塞」是本线第 1 程原设计违反的两条 |
| #1197 Run 进行中受理的输入不交给这个 Run | 开 | G1、G2、G4、G5 已做；G3、G6 没核；G8（交入回执写不上）、G9 留着。第 2 次卡死最贴它 |
| #1319 输入到达时 Run 停在 I8 | 关（转 #1611 待修清单，不是已修复） | 与 R4 同一个后果机制 |
| #1175 做完就丢、没人再做（对账扫描） | 开 | U4 的落实以它为准 |
| #1611 修复主题：会话推进与恢复 | 开 | 统一交付入口，归并了 #1197、#1319、#1175、#1195、#1404 等的待修清单。本线第 1 程在它名下交付 |
| #1612 修复主题：取消、归档与审批等待 | 开 | 统一交付入口。F11（R9）与「取消后仍占执行」在它名下 |
| #1404 取消、归档再恢复后新一轮不往前走 | 关（转 #1611） | 与第 3 次卡死同签名：被取消轮次 `stopped on a failure: stale-advance`，之后每约 36 秒一条 `C2 invoke retries-exhausted`；强杀重启后稳定出现。原卡写明根因没查 |
| #1649 推进义务只活在内存 | 开（本会话 2026-11-25 开） | 对第 2 次卡死的归因不准确；与上面几张的关系没有写。待复现后补更正评论 |

## 现有规格与实现一致、但应然不够的条款

- SE-8「推进失败不静默：每次放弃都留下具名诊断」：允许「放弃 + 诊断」。
- 「接手与恢复」：`known` 只在内存、不能据以重发——这是对的；缺的是「据它跳过」也不行（R1）。
- 「没有推进者 → 挂接仍活着时……没有依据就等 Agent」：没有等待上限，依赖 contact 的真实性（R3）。

## 第 1 程（卡 #1655）之后各条的状态（2026-11-26）

| 编号 | 状态 |
| --- | --- |
| R1 | 不是缺陷。发行装配里交入回执写不上，`known` 的作用是不重复 `submit`；重启后重交，Agent 认回 |
| R2 | 实然如此，扫描兜住。模型 `bad-no-scan` 显示去掉扫描才卡死。要守的只是重试间隔有下限（I-8），没做 |
| R3 | 没有现场证据，不做。第 1 程改了 `contact`，但改的是另一格：槽空着或被别的 execution 占着时答失联 |
| R4 | 后果已修：驱动停下让出执行槽，新一轮照常受理。取消的时序竞争（#1404）没修；停下的 execution 不终结，见 `handoff-card.md` 7.4、7.5 |
| R5 | 没修 |
| R6 | 没修，下一程（F1） |
| R7 | 扫描加 `replay` 覆盖；R4 的后果修了之后不再永久悬置 |
| R8 | 没修，下一程 |
| R9 | 没修，下一程（F11） |
| R10 | 没修。先建性能设施，再按计数门根治 |

第 2 次卡死的机制（步数上限时排着输入）已在第 1 程修掉：复现见上文的表，改后同一做法以 `failed` 终结、停服退出码 0（`evidence/repro/second-at-50-step-limit-FIXED`）。
