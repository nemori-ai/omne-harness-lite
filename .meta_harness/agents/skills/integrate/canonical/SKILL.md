---
name: integrate
description: >
  唯一 Reduce 用 wait-cli 监督批次 PR 与各线交回记录，接管并集成批次，处置 blocked/failed，整波验证后收口。处理交回、集成批次、收口一波或恢复里程碑 reduce 时加载；建卡、首次消息与发 delta 用 dispatch。
---

# 集成

协作规则归 `docs/engineering/integration.md`「集成节点的清单」，其中「线会话记录」「失败处理」「等待监督」与本技能直接相关。Reduce 的阶段、阶段内的核对、收口顺序与提问前三问归 `docs/engineering/map-reduce-states.md` 第 3 节，redo 与接管处置归第 4.1 节。首次开工和恢复时先读这些节。工程规则、接受与权限沿拥有者，本技能不另授权限。

本技能给 SERVE 与 VERIFY_WAVE 的动作顺序，以及 RELEASE_WAVE 的入口。建卡、首次消息与发 delta 按 `dispatch`。反复出现的失误与防范归 `.meta_harness/human/delivery-pitfalls.md`，下面用 P 编号引用。

## 监督：两条等待一直挂着

波内挂两条等待，命令用法归 `tools/dev-flow/src/delivery/README.md`「事件等待」：

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts pr-ready --base <联调轨道> [--ignore <pr>@<处理时的完整 head> ...] --since <ISO 时间或 delivery id>
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts any --comment <线父卡>:line-handoff [--comment <线父卡>:line-handoff ...] --since <ISO 时间或 delivery id>
```

- 每条参加线写一个 `--comment`。
- 两条等待同时挂着的方法取决于宿主：
  - Claude Code：两条等待命令都作为宿主跟踪的后台任务运行，同样带 `--timeout`。任务结束时，宿主唤醒会话。
  - 宿主不能唤醒已结束的回合时（例如 Codex）：能合并的条件合进一条前台阻塞的 `wait-cli any`。`any` 不接受 `pr-ready`，所以 `pr-ready` 与交回记录的等待轮流前台阻塞。每次都带有界的 `--timeout`。退出 3 时先按「等待监督」第 5 步读回，再换另一条等待，各自的 `--since` 不变。
  - 这条宿主差异只适用于 Reduce。线会话的等待一律前台阻塞，没有例外。
- 命中只是唤醒。唤醒后读回全部参加线父卡的交回记录与待处理的批次 PR，按已处理集合去重后逐条处理，再重挂。读回、去重与重挂起点归 `docs/engineering/integration.md`「等待监督」。处理一项时，另一条等待保持挂起。
- 本波已处理的每个批次 PR 都累加一条 `--ignore <pr>@<处理时的 head>`，再重挂 `pr-ready`。
- 等待命中只表示有事件。Issue 关闭或评论命中不代表整波已放行。
- 等待命令退出 2 时诊断并恢复，恢复后先对账，不报告空队列成功。
- 等另一个会话在某张卡上贴特定评论时，先看那张卡已有的评论用什么标记，等待就用这个标记。也可以在要求里写「沿用你已用的标记」。对方可能在读到你的要求之前，已经用自己的标记贴出了评论。这时只等你新指定的标记，就会错过它。
- Reduce 自己启动的 gate 运行与审批、子代理、检查进程和约定期限由 Reduce 自己观察。审批交有权者，不自动批准。期限到达时核对事实，再决定等待、重排或取消。沉默保持 unknown，不判线失联。
- Reduce 与它派的子代理共用宿主的限流额度。无人值守的时段给 Reduce 自己留余量：Reduce 撞上限流时，会话停在原地，直到有人输入。

## 处理一条交回

先读交回记录的结果，再读该线各卡上的交接报告。

### ready：集成批次

一次接管一个批次 PR。保存原始 head、候选 head、targetBase 和 merge 链。

1. 在 reduce 隔离候选上同步目标分支，处理冲突。
2. 完成跨域修改与消费者迁移。Reduce 负责交回后的全部集成冲突、跨域修改、消费者迁移和改后验证，不把集成缺陷退回线会话。
3. 验证：生成宿主投影，运行 `pnpm run check:agents`，再运行 `pnpm run admission`（等于 `OMNE_ADMISSION=1 pnpm run check`，另写准入日志）。同一台机器上的准入一次只跑一个。候选或基线变动后，重做受影响的验证与评审。
4. gate：按既有权限发 gate，绑定精确的 workflow、ref、head、runId 与 runAttempt。需要审批时交有权者。发 gate 时对线父卡运行 `board-cli.ts integrating`。批次内的各张任务卡停在 In review，按卡接受时再运行 `board-cli.ts accepted`。规则归 `agent-delivery.md`「4. 推进和更新状态」。
5. 读回合入：PR 实际合入，且合并提交在目标轨道可达，才记合入。gate 成功、PR 关闭或审批完成都不能单独记合入。合入被回退时，本批次重新未解决。

评审或审计带出的新问题不属于本批次时，不把它并进正在集成的批次或正在推进的卡。先按 `agent-delivery.md`「1. 整理需求并定位已有卡」查有没有同一结果的卡；没有就另立小卡，按 `dispatch` 第 3、5 节求交并登记，在单独的分支上并行交付（P23）。

### blocked 或 failed：redo 或接管

核对线已停写，读清已完成部分与剩余工作，然后选一种处置：

- redo：更正输入，按 `dispatch` 第 5 节为任务卡登记新 attempt，再按 `dispatch`「放行」一节的发布方法发 redo delta。redo 不推进波号。
- 接管：Reduce 自己完成剩余工作。线会话继续等待下一条 delta。

处置规则（不另写处置记录、处置不等于已解决）见 `map-reduce-states.md` 4.1。处理一条交回时，其他事件继续落在等待里。

接管需要的写范围超出该卡 binding 时，准入的 change-scope 只按 binding 的写范围判断，超出的改动照样被拒绝。这时先换 attempt，再换树（P21）：

1. 按 `dispatch` 第 5 节为该卡登记新 attempt。spec 写新的 `writeScope`，分支沿用原分支（`swap` 只在同一分支上换树）。spec 的 `basis` 是授权依据 URL 的列表，其中要有能覆盖新写范围的授权，例如人给本里程碑的授权评论。旧 attempt 的派发评论只授权旧的写范围，不够。需要写明接管对象、写权转移、新写范围与剩余责任时，在卡上发一条评论，把它的 URL 一并列入。这条评论不写「决定」列表字段（P24）。
2. 先 `post --dry-run`，再用 `scope-cli.ts` 把拟写的 binding 与本波其他 binding 求交，然后 `post` 与 `bind`。
3. 旧树先提交并推送。然后用 `worktree-cli.ts swap` 换一棵新树，不在旧树上再运行 `start`。`swap` 只复制旧树的 `tmp/issue-<N>/`，其他过程目录自己复制。命令归 `tools/dev-flow/src/integration/README.md`。
4. 在新树里用 `integration/cli.ts status` 读回新 attempt 与 `relation=current`。

### 用部分认可解开下游

一张卡的剩余部分要花很长时间，已完成部分可以入轨，而下游卡只依赖已完成部分时：

1. 先准入并合入已完成部分。
2. 由这张卡的有权接受者，或持有可核对授权的代笔者，按 `docs/engineering/delivery.md`「4. 接受、取消与重开」记一条 partial 决定，写明已认可范围与剩余责任。
3. 剩余部分在本波收口前做不完时，由有权者按 `map-reduce-states.md` 第 3 节的 `resolved` 显式移出本波，写明剩余责任。既没做完也没移出时，本波的 WaveReady 不成立，R(w) 不能收口。
4. 剩余部分在同一张卡上继续，全部完成后再接受并关闭。

下游卡的条件是否满足，仍按该条件自己的判据核对。部分认可不满足要求整卡结果的条件。

## 收口一波

1. 联调轨道上还有本里程碑以外的写者时（例如独立推进的工具线），开始整波检查之前，请对方暂停往联调轨道合入。在与对方约定的协调卡（对方的线父卡或专门的协调 Issue）上发请求。卡上已有往来标记时沿用它；还没有时，在请求里写明请对方回复用的标记。等待对方确认时用事件等待，不轮询。没有得到确认就开始检查时，放行前再读回联调轨道头，核对它仍等于 F。理由：整波检查的对象是联调轨道头，检查之后轨道头前进，候选就变了，旧证据失效，要回到监督重新检查（P22）。放行后按 `dispatch`「放行」第 6 步通知对方恢复合入。
2. 全部预期项有效解决后，在联调轨道头运行 `OMNE_ADMISSION=1 FULL=1 pnpm run check` 及里程碑联调命令，确定最终 F。没有里程碑联调命令时报告「未运行」。任一未决项、未知写入、未解决失败或失效证据都阻止收口。
3. 检查失败或候选变化时回到监督，旧证据失效。
4. 整波检查通过后，按 `dispatch`「放行」一节建后继、给全部存续线发 delta、接受并读回 R(w)、关闭 R(w)。
5. 调整后一波预案时，按 `dispatch` 技能的 `references/wave-planning.md` 用本波实际耗时、集成负荷和新事实修正取舍。

## 报 ETA 之前

报 ETA 或说「只能串行」之前，逐段给关键路径上的串行等待分类：是真依赖，还是习惯（P27）。真依赖按争用的文件切开，方法见 `dispatch` 技能的 `references/wave-planning.md`。

## 提问前三问

向人提任何设计或方案问题前，先按 `map-reduce-states.md`「提问前三问」逐问检查，包括第 3 问的各个核对项（P19）。其余自行决定并留简短依据。

## 裁定更正与独立评审

人在波中更正一条裁定后，检索更正之前写成、还没有合入的草稿（P26）。派独立评审或顾问时，简报不带自己的结论（P28）。

## 恢复

上下文压缩后续接，也按恢复处理。先重新加载本技能，并核对它的目录是当前检出的投影，不是旧工作树里的副本。压缩后只剩摘要，技能正文会淡出。

恢复时从 GitHub 重读事实，不按会话记忆认定成功：

1. 读当前收口卡、本波任务卡与 binding、各线父卡上最后的 delta 与交回记录、联调轨道上开放的批次 PR、在途 gate 运行。再读人给本里程碑的授权评论，弄清哪些可以代接受、代确认 gate，哪些仍要问人。
2. 结果未知的写入、合入或发布先读回实际结果，再决定下一步。结果未知时不重复 POST 或 merge。
3. 从读回的事件重挂两条等待，再继续处理。
4. 人请求停止时冻结新写入；STOPPED 不等于 DONE。

## 交给下一个里程碑的 Reduce

同一里程碑只由一个 Reduce 会话负责。后续里程碑改由另一个 Reduce 会话负责时（例如换一台机器），交给它的交接包是一个能单独打包的目录，只带结论，不带推理过程。它包括：

- 已做完、不要重做的事项表。
- 为什么是现在的形状。
- 问题、裁定、理由三栏的决定表。
- 按阶段排的「到点提醒负责人」清单。
- 术语表。

用脚本生成交接包，再用脚本核对其中引用的路径都在包内。最后派一个只拿到这个目录的新子代理，按交接包里写的开工第 1 步走一遍，记下它卡住的地方并补齐。作者自己读，读不出包里缺了什么。
