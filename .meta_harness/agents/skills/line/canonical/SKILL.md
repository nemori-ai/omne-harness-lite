---
name: line
description: >
  常驻 Line 的开工、波内自主执行、ready/blocked/failed 交接、处置等待及逐 reduce 续接。认领线父卡、跨波继续、轮空或恢复 Line 时加载；单张卡用 claim。
---

# 线

首次加载和恢复必须先读 `docs/engineering/integration.md`「集成节点的清单」及 `docs/engineering/map-reduce-states.md` 全部 Line 状态、全局规则和组合不变量。依据持久回执确认 phase/control、当前正式波、attempt、requestId、未完成 operation 和 waitPlan，然后选择下表动作。状态表 L01–L31、LC01–LC04 是完整 guard，不能只走成功路径。

## 工作前提：自驱，不提问

外部 Line 在同一会话跨波持续。协调只有两个边界：开工读取线包/有序 delta；结束本次执行交 PR/结果并移交写权。波中独立实现和验证，不向人提问、不在普通 Issue 评论向 reduce 求方案、不等问答、不读取新设计或别线未集成提交。Reduce 不监听这类讨论。可在本域授权内查证和决定局部细节。

## 阶段与出口

| 阶段及规则 | 输入与允许动作 | 出口 guard、读回和下一等待 | 失败去向 |
| --- | --- | --- | --- |
| RECEIVED，L01–L04/L25 | 核对首次消息、唯一 binding/owner/attempt、有效修订和入口。重复消息接续原执行 | active/NOW 到 PREPARE；WAIT_REDUCE 到 ENTRY_WAIT；idle/NOW 到 IDLE_WAIT | 输入确定失效交 blocked；未知认领或冲突到 RECOVER |
| ENTRY_WAIT，L02/L05/L30/L31 | 保存已授权加入基线、当前真实入口 R；只挂 watch，不写产品 | 有效 release 及 delta 按序读回，依据 active/idle/terminal 分支；closed 本身不放行 | 超时、取消和故障保留目标/游标并恢复 |
| PREPARE，L06/L07 | 读线包、任务包、已接受依据、范围和局部裁量；按 claim 准备环境、唯一执行和模型策略；保存当前 R 的等待计划 | StartReady 全部成立，从获准 F 建批次并到 EXECUTE；仅准备不改产品 | 必要输入不可自行补齐则 HANDOFF blocked |
| EXECUTE，L08–L10 | 按冻结队列自主细化、实现和测试。卡按 claim 增量准备及线内合入，不合联调轨道 | 实现齐备到 VERIFY_LOCAL；硬阻塞且无独立工作或确定失败到 HANDOFF | 先停依赖项，继续可执行部分；达结束条件交 blocked/failed |
| VERIFY_LOCAL，L11–L13 | 固定验证 head，跑必要自测、独立评审及准入，保留失败 | LocalReady 成立到 HANDOFF ready；可局部修复回 EXECUTE，新 head 重验 | 自主不能解决的全局缺口/环境失败到 HANDOFF blocked/failed |
| HANDOFF，L14–L16 | 固定 requestId/head 和五节报告；提交开始冻结代码，备齐停写声明，经 submit 登记 | 回执身份/head/outcome 读回后交出写权，到 RELEASE_WAIT。ready 等 wave；blocked/failed 等 disposition | 明确无副作用才同键重试；未知先 recover，不另造 ID、不恢复实现 |
| RELEASE_WAIT，L17–L19/L23/L24/L26 | 只读回权威 release 或匹配 requestId/旧 attempt 的 disposition | wave 按序消费 delta；active 到 PREPARE，idle 到 IDLE_WAIT，terminal 到 FINAL_HANDOFF。takeover/rescope 保存后改等当前 wave | 仅 redispatch 且 RedispatchReady 全部成立可同波新 attempt 到 PREPARE；其他评论/PR 合入不放行 |
| IDLE_WAIT，L27–L29 | 保存 idle 原因、F、计划修订、游标和当前真实 R；不建任务分支、不交空 PR | 每个有效 release 消费后 active 准备、idle 立即重挂直接后继、terminal 最终交接 | 后继缺失为发布错误；无未来任务/未知 nextHint 不停止监听 |
| FINAL_HANDOFF，L20/L21 | 核对明确终态，提交最终五节报告及剩余责任 | 最终报告读回、必要接受齐备到 DONE；区分完成、限定接受、取消 | 写入未知先恢复，接受未齐继续等既定终态事实 |
| DONE，L22 | 仅对账既有终态和自己的清理责任 | 旧事件不重开，新任务必须新授权 | 不以普通评论重开 |

## 统一交接与处置

硬阻塞也是本次执行的结束交接。报告真实原因、已有成果、剩余项和停写事实。已有差异给 PR/head，可保持草稿；零差异交无 PR 的结果记录。不能把报告写成求方案的普通评论。报告里的验证证据贴摘要与关键行，并写明原件位置与哈希。只写任务 tmp 中的路径时，接受者不据它判断，规则归 `agent-delivery.md`「5. 提交成果供接受」。远端完全不可用时保存完整本机非成功交接文件并打开供人带回 reduce，保持停写，不声称机器登记成功。

RedispatchReady 要求有效 disposition、旧执行已停止、写权交接读回、阻塞解除或新任务可执行、新 attempt 授权与完整新输入。只有这条路径能在 R(w) 未关闭时重开同波执行，波号和已消费 release 不增加。takeover/rescope 由 reduce 承担后续责任，Line 回等当前 R(w)，不能形成 reduce 等 Line 完成而 Line 只等 reduce 关闭的死循环。

## 命令与持久等待

从固定独立工具检出运行，目标 repo、事件文件和 journal 取本机运行绑定。工具检出的仓库身份不能代替目标 repo。精确字段、帮助与失败码读 `tools/dev-flow/src/delivery/README.md` 及当前入口帮助；具体 recipe 由 reduce 在开工输入中填齐并验证。

现有公开入口：`integration-request-cli.ts submit|recover` 交接与恢复，`reduce-watch-cli.ts watch` 等有效收口或 disposition，`line-inbox-cli.ts inbox|delta|state` 读增量、发布增量和保存消费。路径均在固定工具的 `tools/dev-flow/src/delivery/`。执行示例和参数见 [runtime](references/runtime.md)。不得以低层 issue-closed 等待代替 release 校验。

watch 只需当前已存在 R(w)。可选 nextHint 未知时省略。ready 挂 wave；非成功挂 disposition，使用同一 shell 结果通路。原 tool call 的 stdout/stderr 是结果；宿主要求 wait/read 时接续原工具，不用 CLI 注入消息。已经存在同 owner/target 的有效等待复用，不起第二进程。

## 状态、增量与恢复

每次交出、停下、压缩前按线状态模板保存完整人读恢复快照，包含已消费 delta 序号和评论游标、attempt/head、pendingOps、purpose、目标及恢复点。该快照不扩展机器 schema。消费 delta 时使用 state 命令写正式 consumption 记录并读回；没有已消费 delta 时不伪造消费记录。波内保存事实不消费新变化；每张卡交回和单卡接受都不触发读取 delta。

LC01–LC04：未知副作用、事件损坏、工具结果丢失或启动恢复进入 RECOVER，冻结受影响写入。先读回原操作、当前授权和 head，再按事实恢复阶段。已登记进入等待；已开始交接但未登记仍在 HANDOFF。STOPPED 不等于 DONE，只有显式恢复/重派授权才恢复。

release 逐条消费，更新 assignment、lastDelta、已消费波号和 waitPlan。active 从最终 F 新建分支；idle 立即续挂；明确 terminal 才停止。后台 wait 即使提前返回，也只保存到本波交接之后处理。采用新工具/技能/策略只在下一开工边界，保留旧 journal 和挂起结果，未验证宿主行为写 unknown。
