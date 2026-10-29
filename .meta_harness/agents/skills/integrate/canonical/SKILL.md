---
name: integrate
description: >
  唯一 Reduce 用 wait-cli 监督批次 PR 与各线交回记录，接管并集成批次，处置 blocked/failed，整波验证后收口。处理交回、集成批次、收口一波或恢复里程碑 reduce 时加载；建卡、首次消息与发 delta 用 dispatch。
---

# 集成

协作规则归 `docs/engineering/integration.md`「集成节点的清单」，其中「线会话记录」「失败处理」「等待监督」与本技能直接相关。Reduce 的阶段、阶段内的核对、收口顺序与提问前三问归 `docs/engineering/map-reduce-states.md` 第 3 节，redo 与接管处置归第 4.1 节。首次开工和恢复时先读这些节。工程规则、接受与权限沿拥有者，本技能不另授权限。

本技能给 SERVE 与 VERIFY_WAVE 的动作顺序，以及 RELEASE_WAVE 的入口。建卡、首次消息与发 delta 按 `dispatch`。

## 监督：两条等待一直挂着

波内挂两条等待，命令用法归 `tools/dev-flow/src/delivery/README.md`「事件等待」：

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts pr-ready --base <联调轨道> [--ignore <pr>@<处理时的完整 head> ...] --since <ISO 时间或 delivery id>
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts any --comment <线父卡>:line-handoff [--comment <线父卡>:line-handoff ...] --since <ISO 时间或 delivery id>
```

- 每条参加线写一个 `--comment`。
- 两条等待同时挂着的方法取决于宿主：
  - Claude Code：两条等待命令都作为宿主跟踪的后台任务运行。任务结束时，宿主唤醒会话。
  - 宿主不能唤醒已结束的回合时（例如 Codex）：能合并的条件合进一条前台阻塞的 `wait-cli any`。`any` 不接受 `pr-ready`，所以 `pr-ready` 与交回记录的等待轮流前台阻塞。每次都带有界的 `--timeout`。退出 3 时换另一条等待，各自的 `--since` 不变。
  - 这条宿主差异只适用于 Reduce。线会话的等待一律前台阻塞，没有例外。
- 命中只是唤醒。唤醒后读回全部参加线父卡的交回记录与待处理的批次 PR，按已处理集合去重后逐条处理，再重挂。读回、去重与重挂起点归 `docs/engineering/integration.md`「等待监督」。处理一项时，另一条等待保持挂起。
- 本波已处理的每个批次 PR 都累加一条 `--ignore <pr>@<处理时的 head>`，再重挂 `pr-ready`。
- 等待命中只表示有事件。Issue 关闭或评论命中不代表整波已放行。
- 等待命令退出 2 时诊断并恢复，恢复后先对账，不报告空队列成功。
- Reduce 自己启动的 gate 运行与审批、子代理、检查进程和约定期限由 Reduce 自己观察。审批交有权者，不自动批准。期限到达时核对事实，再决定等待、重排或取消。沉默保持 unknown，不判线失联。

## 处理一条交回

先读交回记录的结果，再读该线各卡上的交接报告。

### ready：集成批次

一次接管一个批次 PR。保存原始 head、候选 head、targetBase 和 merge 链。

1. 在 reduce 隔离候选上同步目标分支，处理冲突。
2. 完成跨域修改与消费者迁移。Reduce 负责交回后的全部集成冲突、跨域修改、消费者迁移和改后验证，不把集成缺陷退回线会话。
3. 验证：生成宿主投影，运行 `pnpm run check:agents`，再运行 `OMNE_ADMISSION=1 pnpm run check`。同一台机器上的准入一次只跑一个。候选或基线变动后，重做受影响的验证与评审。
4. gate：按既有权限发 gate，绑定精确的 workflow、ref、head、runId 与 runAttempt。需要审批时交有权者。发 gate 时对线父卡运行 `board-cli.ts integrating`。批次内的各张任务卡停在 In review，按卡接受时再运行 `board-cli.ts accepted`。规则归 `agent-delivery.md`「4. 推进和更新状态」。
5. 读回合入：PR 实际合入，且合并提交在目标轨道可达，才记合入。gate 成功、PR 关闭或审批完成都不能单独记合入。合入被回退时，本批次重新未解决。

### blocked 或 failed：redo 或接管

核对线已停写，读清已完成部分与剩余工作，然后选一种处置：

- redo：更正输入，按 `dispatch` 第 5 节为任务卡登记新 attempt，再按 `dispatch`「放行」一节的发布方法发 redo delta。redo 不推进波号。
- 接管：Reduce 自己完成剩余工作。线会话继续等待下一条 delta。

处置规则（不另写处置记录、处置不等于已解决）见 `map-reduce-states.md` 4.1。处理一条交回时，其他事件继续落在等待里。

## 收口一波

1. 全部预期项有效解决后，在联调轨道头运行 `OMNE_ADMISSION=1 FULL=1 pnpm run check` 及里程碑联调命令，确定最终 F。没有里程碑联调命令时报告「未运行」。任一未决项、未知写入、未解决失败或失效证据都阻止收口。
2. 检查失败或候选变化时回到监督，旧证据失效。
3. 整波检查通过后，按 `dispatch`「放行」一节建后继、给全部存续线发 delta、接受并读回 R(w)、关闭 R(w)。
4. 调整后一波预案时，按 `dispatch` 技能的 `references/wave-planning.md` 用本波实际耗时、集成负荷和新事实修正取舍。

## 提问前三问

向人提任何设计或方案问题前，先按 `map-reduce-states.md`「提问前三问」逐问检查。其余自行决定并留简短依据。

## 恢复

恢复时从 GitHub 重读事实，不按会话记忆认定成功：

1. 读当前收口卡、本波任务卡与 binding、各线父卡上最后的 delta 与交回记录、联调轨道上开放的批次 PR、在途 gate 运行。
2. 结果未知的写入、合入或发布先读回实际结果，再决定下一步。结果未知时不重复 POST 或 merge。
3. 从读回的事件重挂两条等待，再继续处理。
4. 人请求停止时冻结新写入；STOPPED 不等于 DONE。
