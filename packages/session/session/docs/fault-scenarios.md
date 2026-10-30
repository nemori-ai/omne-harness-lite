# Session 故障场景

本页维护本成员的故障场景。每个场景写前置、注入、期望观察与依据的条款。场景是后继实现必须通过的可观察结果，不是已运行的证据。机制归 [SPEC](../SPEC.md)，崩溃矩阵归 [CR 表](../SPEC.md#cr-崩溃矩阵)，契约条款归[会话契约](../../session-contract/SPEC.md)。契约自己的验证义务在 [VC 表](../../session-contract/SPEC.md#候选的持续验证义务)，本页不复制；本页的场景写机制层的注入方式与观察点。

本页未交付的生产提供者、真实重启与装配场景均为「未执行：提供者或装配尚未交付」。规格映射或非耐久替身不证明这些场景已通过。

## 编号规则

场景编号写作 `FS-<组>-nn`。组 A 是输入绑定与 Agent 终结的共同提交，组 B 是推进映射与重装配交接，组 C 是日志、消费责任与恢复投影，组 F 是会话冻结。编号按加入顺序分配，一经使用不重排、不复用。

「注入」指测试在哪一点制造故障：进程崩溃、回执丢失、依赖返回不可用、并发到达或迟到。「期望观察」写测试必须读到的事实；读不到该事实的测试不算覆盖该场景。

## 组 A：输入绑定与 Agent 终结的共同提交

依据 [PA-01](../../session-contract/SPEC.md#pa-01) 至 [PA-09](../../session-contract/SPEC.md#pa-09)、[C2](../SPEC.md#c2)、[CR-02](../SPEC.md#cr-崩溃矩阵) 至 CR-07。

| 编号 | 场景 | 前置 | 注入 | 期望观察 | 条款 |
| --- | --- | --- | --- | --- | --- |
| FS-A-01 | 受理先于条件终结 | Run 为 active，执行有挂接。`accept` 已提交一条去处为本 Run 的输入，尚未 `submit` | Agent 在此时提出条件终结 | 参加者响应「冲突」，依据为该 `InputId`；执行记录提供者返回 `changed`；Session 没有新条目。C2 随后 `submit`，SE35 成立；Agent 承接后 SE14 成立；Agent 再次条件终结得到「参加」。Run 终态在读到结束事件时成立 | [PA-02](../../session-contract/SPEC.md#pa-02)、[PA-06](../../session-contract/SPEC.md#pa-06) |
| FS-A-02 | 终结先于受理 | Agent 执行已结束，Session 尚未读到结束事件，Run 仍为 active | `accept` 到达；C2 对该执行 `submit` | `accept` 成立，去处为本 Run；`submit` 返回 `terminal`，C2 不重试、不改去处。读到结束事件后 Run 终态成立；下一次 `judgeRunStart` 为 `eligible`，首条输入是这条输入，新 Run 的 SE13 记录前继 Run | [PA-03](../../session-contract/SPEC.md#pa-03)、[RS-01](../../session-contract/SPEC.md#rs-01) |
| FS-A-03 | 接受后未唤醒推进就崩溃 | `accept` 已提交，提交通知丢失 | 进程在 S1 被唤醒之前崩溃 | 会话只有待处理输入，没有 Run 与其他待办。重启后 S3 按 `inputs` 原因读到该会话并交 S1；S1 调用 `judgeRunStart`；`startRun` 恰成立一次；没有第二份输入 | [PA-06](../../session-contract/SPEC.md#pa-06) 第 1 项、[S3](../SPEC.md#s3)、CR-02 |
| FS-A-04 | Run 开始后、发起执行前崩溃 | `startRun` 已提交 SE13、SE15 | 进程在 `invoke` 发出之前崩溃；另一次在 `invoke` 受理之后、SE35 写入之前崩溃 | 重启后 S3 按 `run` 原因读到该会话并交 C5；C5 读到 `advance` 非空、首条输入没有 SE35；查 `invoke` 的出站身份：未提交时以同一身份重放，Agent 恰建立一个执行；已提交时直接 `receive` 写 SE35。两次崩溃后执行身份相同 | [PA-06](../../session-contract/SPEC.md#pa-06) 第 2 项、[PM-14](../../session-contract/SPEC.md#pm-14)、CR-03、CR-04 |
| FS-A-05 | 交入后、回执写入前崩溃 | Run 为 active，执行已受理一条 `submit` | 进程在 `receive(input-handover)` 之前崩溃 | C5 读到待交输入；查 `submit` 的出站身份为 `committed`；写 SE35，不再次 `submit`；Agent 一侧该 `InputId` 只受理一次 | [PA-06](../../session-contract/SPEC.md#pa-06) 第 3 项、[I-R3](../../session-contract/SPEC.md#i-r3)、CR-05 |
| FS-A-06 | 提交未知 | 任一 Session 为提交方的命令 | 存储提供者在提交后、返回回执前断开 | 命令返回 `commit-unknown`；调用方不以新身份重做；不发出依赖该提交的出站调用；S4 以同一身份 `queryOperation`。`committed` 后原协调器继续。`not-committed` 或 `attempt-rejected` 后，原发起者以同一身份重试，存储参加者开新的尝试代次，重试不得到 `conflict`。仍有未知的尝试时查询为 `unknown`，不开新代次，不报告未受理。另一次注入：存储对该尝试持久回滚，S4 得到 `attempt-rejected`，同一受理标识重试后受理成立且只有一份输入 | [PA-07](../../session-contract/SPEC.md#pa-07)、[PA-05](../../session-contract/SPEC.md#pa-05)、[S4](../SPEC.md#s4)、[尝试代次](../../session-storage-sql/SPEC.md#w1-attempts) |
| FS-A-07 | 参加提交未知 | 执行记录提供者发起 `message` 交接，Session 参加 | 提交方在提交后断开，回执丢失 | 提交方以自己的操作身份查询，Session 以 OP-00 身份 `queryOperation`，两者读同一回执；Session 的 `unresolved` 不含该操作 | [PA-05](../../session-contract/SPEC.md#pa-05)、[CP-02](../SPEC.md#cp-02)、CR-07 |
| FS-A-08 | 取消与受理的两种先后 | Run 为 active | 一次：`control(cancel-run)` 先于 `accept` 提交；另一次：`accept` 先于取消 | 取消先：Run 为 cancelled，输入取得待处理资格，去处为下一个 Run。受理先：输入保留资格与原归属；已交入未承接的输入在 Session 一侧没有 SE14，由后继 Run 以同一 `InputId` 重新交入，SE13 记录前继 Run。两种顺序各只有一个终态 | [PA-08](../../session-contract/SPEC.md#pa-08) 第 1、2 项 |
| FS-A-09 | 取消与条件终结的两种先后 | Run 为 active，执行有挂接 | 一次：取消先提交，Agent 随后条件终结；另一次：Agent 先结束，Session 尚未读到结束事件时取消到达 | 取消先：参加者响应「冲突」，依据为 SE26 cancelled；Agent 以取消依据再次终结得到「参加」；读到的结束事件只认回。终结先：`control(cancel-run)` 照常提交 SE26 cancelled；读到的结束事件按 RS-08 认回，Agent 的结论作为引用保留，终态不改。两种顺序各只有一个 SE26 | [PA-08](../../session-contract/SPEC.md#pa-08) 第 3、4 项、[RS-08](../../session-contract/SPEC.md#rs-08)、[RS-10](../../session-contract/SPEC.md#rs-10) |
| FS-A-10 | 首条输入与后续输入被消息准入拒收 | 一次：`startRun` 已提交，`invoke` 返回 `invalid`；另一次：Run 为 active，`submit` 返回 `invalid` | Agent 消息准入拒收 | 首条：`finishRun` 有界收束，Run 为 failed，同批 SE35 为拒收，其余输入保留资格交下一个 Run。后续：只写该输入的 SE35 为拒收，Run 继续，其他输入照常交入 | [PM-02](../../session-contract/SPEC.md#pm-02)、[PA-09](../../session-contract/SPEC.md#pa-09) |

## 组 B：推进映射与重装配交接

依据 [PM-03](../../session-contract/SPEC.md#pm-03) 至 [PM-14](../../session-contract/SPEC.md#pm-14)、[C2](../SPEC.md#c2)、[C5](../SPEC.md#c5)、CR-10 至 CR-13。

| 编号 | 场景 | 前置 | 注入 | 期望观察 | 条款 |
| --- | --- | --- | --- | --- | --- |
| FS-B-01 | 候选失败 | Run 为 active，显式 reload 请求到达 | 装配报告候选不合法；另一次 Agent 的采用交接拒绝；另一次证据桥不可用 | 不写 SE08、SE15、SE16；`reload` 返回 `invalid` 或 `unavailable`；原 attempt 继续推进；原采用已不合法时报告不可用，不换定义标识，不以空采用推进 | [PM-03](../../session-contract/SPEC.md#pm-03)、[PM-09](../../session-contract/SPEC.md#pm-09) |
| FS-B-02 | 撤旧后授新的回执丢失 | 旧 attempt 已 `release`，`claim` 已发出 | 存储在 `claim` 提交后断开，回执丢失；另一次 `queryOperation` 持续返回 `unknown` | `queryOperation` 为 `committed` 时从回执读新 `AdvanceRef` 继续 `resume`；为 `unknown` 时不第二次 `claim`，Run 在认回前没有推进者；序号不跳号也不回填 | [PM-10](../../session-contract/SPEC.md#pm-10)、[S4](../SPEC.md#s4)、CR-10 |
| FS-B-03 | 授予后接续失败 | `claim` 已提交 SE15 | `resume` 返回 `changed`、`unavailable` 或超时 | SE15 不撤销；同一恢复者或下一次扫描以同一推进资格依据重试；Tool 围栏沿 Agent J03 原责任恢复 | [PM-05](../../session-contract/SPEC.md#pm-05)、CR-11 |
| FS-B-04 | 旧实例晚到 | attempt n 已被 n+1 取代 | attempt n 的 runtime 依次发起参加提交、`reload`、`claim`、`invoke`，并提交 `custody` 交接与晚到事件 | 参加提交得「冲突」且提交方得 `stale-advance`；`reload` 得 `changed`；`claim` 得 `stale-advance`；`invoke` 得 `denied`；`custody` 与事件照常登记在原调用与实际挂接下 | [PM-11](../../session-contract/SPEC.md#pm-11) |
| FS-B-05 | 重复重装请求 | Run 为 active | 同一候选同一证明重复 `reload`；同一身份不同候选；两个不同候选先后到达；候选等于当前采用 | 同候选认回原回执；同身份异候选 `conflict`；第二个候选 `changed`，调用方重新准备候选；候选等于当前采用时不写 SE08 | [PM-12](../../session-contract/SPEC.md#pm-12) |
| FS-B-06 | 无活体时取消 | control(cancel-run) 已提交 | 原执行没有 active 挂接 | C3 经 Agent 长期入口送控制，不先 resume；后续接续负责收束。控制受理不等于实际停止，未知保留；超过上限报告。Tool 围栏归 Agent/Tool J03 | [PM-13](../../session-contract/SPEC.md#pm-13)、[C3](../SPEC.md#c3) |
| FS-B-07 | 失联接管 | Run 为 active，挂接仍 active | 宿主给出失联判断作为证据，恢复者持接管资格；另一次没有失联依据；另一次没有资格 | 有依据有资格：`claim` 接管后 `resume`，旧挂接 superseded，旧 runtime 后续提交得 `stale-advance`。没有依据：等 Agent，不 `claim`。没有资格：报告并保留 | [PM-14](../../session-contract/SPEC.md#pm-14)、[RS-07](../../session-contract/SPEC.md#rs-07) |
| FS-B-08 | 撤除阶段的两条路径 | Run 为 active，准备换代 | 旧 runtime 可配合；另一次旧 runtime 不可达 | 可配合：`detach` 取得交接依据后 `release` 写 SE16。不可达：跳过撤除，`reload` 同批写 SE16，`resume` 走接管 | [PM-04](../../session-contract/SPEC.md#pm-04)、[PM-06](../../session-contract/SPEC.md#pm-06)、CR-12 |
| FS-B-09 | 有界收束 | Run 为 active，`advance` 为空 | `inspect` 与 `resume` 持续返回原记录不可读，重试次数达到 `boundedRecovery.maxInspectAttempts`；另一次 `inspect` 返回 `missing` 而 `ExecutionRef.revision` 为空 | 达到上限：`finishRun` 写 SE26 failed，依据为不可解释记录，写明未收尾效果。`missing` 且 `revision` 为空：以同一出站身份重放 `invoke`，不收束。现行 Agent 适配不产生 `missing`，这一分支在 NP-05 闭合之前用替身注入 | [P-5](../../session-contract/SPEC.md#具名前提与明确缺项)、[C5](../SPEC.md#c5)、[NP-05](../../session-adapters/SPEC.md#np-05) |

## 组 C：日志、消费责任与恢复投影

依据 [EC-01](../../session-contract/SPEC.md#ec-01) 至 [EC-10](../../session-contract/SPEC.md#ec-10)、[RD](../SPEC.md#rd-01)、[CA](../SPEC.md#ca-1)、CR-06 至 CR-09。

| 编号 | 场景 | 前置 | 注入 | 期望观察 | 条款 |
| --- | --- | --- | --- | --- | --- |
| FS-C-01 | 原确认已在同日志，Session 投影丢答复 | SE20/21 已提交 | receive(release) 提交前后崩溃 | AD-05 重读 Tool 原确认，按原 Session operation 认回或提交；无确认保持 pending，Model ACK 未决时只报告 | [EC-04](../../session-contract/SPEC.md#ec-04)、[EC-05](../../session-contract/SPEC.md#ec-05) |
| FS-C-02 | 原确认恢复 | Tool 原确认已写同日志 | Session receive(release) 未提交就崩溃 | AD-05 重读原确认，写 confirmed；消费侧仅用 SE20 内容或引用、SE21 完成依据；材料不可恢复报告 unavailable，Model ACK 未决保持 pending | [EC-06](../../session-contract/SPEC.md#ec-06)、CR-09 |
| FS-C-03 | 归档后迟到结果 | 会话已归档，SE27 撤销了原调用的投递资格 | 生产者结果与账目迟到；一次 Agent 记录存在，一次已删除 | 记录存在：经 `recordResult(custody)` 参加写 SE20；已删除：Session 提交 `preserveResult`。账目以 `receive(account)` 写 SE32。不进队列、不 `accept(business)`、不创建后继 Run；撤销归档后也不进队列 | [EC-07](../../session-contract/SPEC.md#ec-07) |
| FS-C-04 | Run 终态后后台结果到达 | Run 已终态，会话未归档，原调用仍有投递资格 | 后台工具最终结果到达 | 先 `receive(execution)` 写 SE19 并经 `recordResult` 保管 SE20；再 `accept(business)` 写 SE11，`tasks.routed-input` 记录交回责任；S1 按 `judgeRunStart` 决定是否开新 Run；原 Run 不复活 | [EC-08](../../session-contract/SPEC.md#ec-08) |
| FS-C-05 | 长历史读取 | 会话有大量条目与多代模型视图 | 以稀疏过滤读历史；恢复与事件消费并行进行 | 恢复、推进与事件消费不扫描全部历史；`begin`、`next`、`since` 的读取量按条目与字节受控；空页带 `scannedThrough`；提供者不可用返回 `unavailable`，不返回空页 | [EC-10](../../session-contract/SPEC.md#ec-10)、[SL10、SL11](../../session-contract/SPEC.md#日志读取投影及恢复) |
| FS-C-06 | 事件页以不产生后果的事件结束 | Run 为 active，同日志解释在运行 | Agent 发出若干 `message` 与 `entry` 事件后暂停 | 持久 `readThrough` 停在最后一个产生后果的事件；不向 Agent 确认事件；`openWork.unreadEvents` 从持久 `readThrough` 起算；`ended` 到达后 `readThrough` 追上 | [RD-01](../SPEC.md#rd-01)、RD-03、RD-04 |
| FS-C-07 | 进度丢失与重复解释 | 同日志解释已处理若干事件 | 快照里的 `readThrough` 被替换为 `"0"`；另一次两个进程的解释者同时解释同一执行 | 重读的事件按原 execution 与事实身份认回，不重复写后果；两个解释者并发时，同一后果只写一次，过期的根在发布前重读；解释提交未知时按原解释操作身份认回；后到者随后重读 `readThrough` 继续；`readThrough` 从不回退 | [EC-02](../../session-contract/SPEC.md#ec-02)、RD-02、RD-06、CR-06 |
| FS-C-08 | 事件缺口 | 事件消费落后于 Agent 的保留窗口 | Agent 读取返回缺口 | 消费者经 `inspect` 读完整快照，结束状态按 `ended`、结果与控制按 `producer` 与 `control` 处理，再从缺口之后继续；没有事件被跳过 | [EC-01](../../session-contract/SPEC.md#ec-01)、RD-05 |
| FS-C-09 | 过期快照与晚到通知 | 快照缓存命中 | 另一个进程提交后，本进程以缓存快照执行一个带 `expected` 的命令；另一次执行一个不带 `expected` 的命令；另一次提交通知在后来的提交之后晚到 | 带 `expected` 的命令：事务内 `decide` 返回 `changed`，流水线以同一操作身份重做一次后成功，存储参加者开新的尝试代次，不得到 `conflict`。不带 `expected` 的命令：不得到 `changed`，结局按事务内的当前状态裁定。晚到通知带自己的修订，不使缓存变为有效；清空全部缓存后结果不变 | [CA-3](../SPEC.md#ca-3)、[CP-01](../SPEC.md#cp-01)、[尝试代次](../../session-storage-sql/SPEC.md#w1-attempts) |
| FS-C-10 | 未读事件时裁定空闲与完成 | Run 为 active，Agent 已发出 Session 尚未读到的事件 | S2 到期裁定；Agent 条件终结 | `judgeIdle` 不得出 `due`；`considerAutoArchive` 返回 `not-due`；终态只在读到结束事实后成立 | [EC-03](../../session-contract/SPEC.md#ec-03)、[I-R10](../../session-contract/SPEC.md#i-r10) |
| FS-C-11 | 确认不可读或版本不符 | 原结果已保管或处理 | 日志 unavailable、未知、saved 未确认或异版本 | 保留 pending；异版本不得解除；不直接调用生产者，不以 saved 证明 ACK | [JC-Release](../../session-contract/SPEC.md#jc-release)、[C5](../SPEC.md#c5-release) |

## 组 F：会话冻结

依据[常驻工具与会话冻结](../../session-contract/SPEC.md#常驻工具与会话冻结)、[C2](../SPEC.md#c2) 的冻结行、[S1](../SPEC.md#s1)、CR-21。

| 编号 | 场景 | 前置 | 注入 | 期望观察 | 条款 |
| --- | --- | --- | --- | --- | --- |
| FS-F-01 | 冻结判定到达与两步之间崩溃 | 会话未冻结，有待处理输入，没有 Run | 候选采用材料带回 `FreezeVerdict`；进程在 `startRun` 返回带 `verdict` 的 `frozen` 失败之后、`freeze` 提交之前崩溃 | `startRun` 不提交；重启后 S1 再次触发，候选材料再次带回同一判定，`freeze` 首次提交 SE37，同批 SE38 解除全部待处理输入；只有一条 SE37 | [I-F1](../../session-contract/SPEC.md#i-f1)、[I-F4](../../session-contract/SPEC.md#i-f4)、CR-21 |
| FS-F-02 | 候选采用再次交来判定 | 会话已冻结 | planAdoption 带回同一或不同证据 | freeze 返回原回执，不写条目；应用桥接未交付，不从 maintainer 切为 coordinator | [I-F1](../../session-contract/SPEC.md#i-f1) |
| FS-F-03 | 冻结的会话里 Run 终结 | 会话已冻结，Run 为 active，有待处理输入 | Agent 结束事件到达；另一次 `control(cancel-run)` | 待处理输入照常交入该 Run；终态同批写 SE38 解除余下的待处理输入；S1 之后跳过该会话；`startRun` 返回 `frozen` | [I-F3](../../session-contract/SPEC.md#i-f3)、[I-F4](../../session-contract/SPEC.md#i-f4)、[S1](../SPEC.md#s1) |
| FS-F-04 | 冻结的会话恢复与归档 | 会话已冻结，Run 为 active，挂接丢失 | C5 走恢复路径；之后归档再撤销归档 | `claim` 与 `resume` 照常，原 Run 沿原采用接续；归档照常级联，归档批次同批以 SE26 取消原 Run；撤销归档后 `lifecycle` 为 `frozen`，不为 `dormant` 或 `active`，任何输入不被重新交入 | [I-F2](../../session-contract/SPEC.md#i-f2)、[I-F5](../../session-contract/SPEC.md#i-f5)、[JC-16](../../session-contract/SPEC.md#共同提交与共享事务域)、[C4](../SPEC.md#c4) |
| FS-F-05 | 冻结的会话自动归档 | 会话已冻结，没有 Run，自动归档已启用，没有常驻标记 | 连续空闲达到时限；另一次之前对该会话调用 `startRun` | `startRun` 返回 `frozen`，`verdict` 为 null，C2 不调用 `freeze`；S2 照常 `recordIdle` 与 `considerAutoArchive`，裁定不读 `frozen`；到期后归档成立并交 C4 | [I-F5](../../session-contract/SPEC.md#i-f5)、[C2](../SPEC.md#c2)、[S2](../SPEC.md#s2) |

## 未覆盖

- 规模、断电耐久与多进程并发尚需实测，见 SPEC 的[明确缺项](../SPEC.md#明确缺项)。
- 宿主创建实例的入口（P-7）闭合之前，涉及它的场景不在本页。
