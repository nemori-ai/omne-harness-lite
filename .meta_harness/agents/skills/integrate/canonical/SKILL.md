---
name: integrate
description: >
  集成节点侧的一波：开波后阻塞等各线的批次 PR 转 ready，逐批次核对写范围、同步联调轨道、重生成投影、排队跑准入、派发并代为确认 gate、读回，本波批次全部合入后建收口点，逐卡写接受评论与看板字段，在里程碑卡交回集成报告，给各线父卡发 line-delta，最后关闭收口卡唤醒下一波。
  被调度者指定为集成节点、要把线交出的批次合入轨道、或问「批次怎么合」「准入怎么排」「gate 怎么代确认」「收口点怎么建」时加载。点名 /integrate 时加载。
  单张卡自己的分支同步与 FI/RI 用 branch-integration；建卡、波准入与派发用 dispatch。集成节点不改批次的代码（只落在共享路径上的合并冲突除外），不与线通信；批次有缺陷时整体退回。
---

# 集成

本技能是 `docs/engineering/integration.md`「集成节点的清单」的可执行版。批次、波、收口点、不变量、合并顺序、冲突、失败处理与退回的规则都归那一节，权限与 gate 归同页「现行准入」。命令的精确行为归 `tools/dev-flow/src/delivery/README.md` 与 `tools/dev-flow/src/integration/README.md`，PR 与提交的格式归 `CONTRIBUTING.md`。

开始前确认：调度者已在里程碑卡中把集成节点具名给你；本波的波准入已通过；你有各线父卡的卡号、批次 PR、批次报告与各卡的交接报告；代为确认 gate 时，你有该 admin 对本次确认的授权。缺任一项时停下，交回调度者。

## 0. 开波与等待

波准入、线包与 `line-delta` 的发出归 dispatch 技能第 3 节。本技能从等批次开始。等待阻塞在 GitHub 事件上，不轮询：

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts pr-ready --base integration/legacy-refactor
```

命令阻塞到有一个以联调轨道为 base 的 PR 转为 ready 才返回，并打印 PR 号与 head。接收器与 `gh webhook forward` 的启动方法见 `tools/dev-flow/src/delivery/README.md`「事件等待」。Claude Code 在 `Monitor` 下运行它。本波还有线没交批次时，处理完到手的批次后回到这条命令。

## 1. 收批次

批次 PR 转为 ready 即收到。按到达先后处理。几个批次同时到时，按 integration.md「集成节点怎样工作」第 2 步，影响面大的先合。记下每个批次的到达时刻与实际合入顺序。

## 2. 逐批次合入

对每个批次做下列步骤。任一步失败时停在这一步，按 integration.md「失败处理」整体退回该线，再处理下一个批次。

1. 读批次 PR、线父卡上的批次报告与各卡的交接报告。报告写明某张卡未进批次时，核对批次分支上没有那张卡的提交。
2. 核对批次改动的文件都在各卡写范围之并内：`git diff --name-only <收口点>...<批次头>`。有越界文件时整个批次不合入。
3. 在本机为线父卡的本波 attempt 建工作树并开工。本机还没有这张卡的树时用 `prepare`；本机有旧树时用 `swap`。`swap` 不删除旧树：它让旧树分离分支，从远端尖端建新树，并列出旧树中 `tmp/issue-<N>/` 以外的未跟踪路径。

   ```sh
   node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts prepare --issue <线父卡> --tree .worktrees/issue-<线父卡>-r<修订>a<序号>
   node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts swap --issue <线父卡> --old <旧树> --tree .worktrees/issue-<线父卡>-r<修订>a<序号>
   ```

   旧树确实不再需要时，按 `docs/engineering/workflow.md` 的清理条件与授权，先运行 `worktree-cli.ts remove --tree <旧树>` 看清单，再加 `--force` 删除。
4. 在新树中同步联调轨道，两步：先 `git merge origin/integration/legacy-refactor` 并提交，再运行 task-sync，输入 `{"kind":"task-sync","target":"<合并进来的轨道提交>"}`。合并出现冲突时，按 integration.md「冲突即退回分解」先看冲突落在哪些文件上。只落在线归属表 `shared` 的路径上时，按该节逐类解决（命令在该节），提交到批次分支，继续下一步，记一条共享路径冲突。其余冲突立即停止，不在集成侧解决，退回该线。
5. 同步合并之后、准入之前，一律重生成投影并跑 `check:agents`：`node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts projections`。批次自己没改 agent 源也要做，因为合并进来的轨道头可能带别的批次的 agent 源改动。
6. 准入排队。同一台机器上的准入一次只跑一个，按任务信息包写明的准入锁路径排队：锁文件存在时等待，每 60 秒看一次；轮到时建锁文件，跑完删除。准入命令为 `OMNE_ADMISSION=1 pnpm run check`，它包含哪些检查归开发指南与仓库根 `package.json`。记录实际命令与退出码。准入不通过时退回该线，不改批次。
7. 推送批次分支，让批次 PR 的 head 前进到同步后的提交。把线父卡的 Stage 改为 Integrating：`node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts integrating --issue <线父卡>`。
8. 派发 gate 并等待：

   ```sh
   gh workflow run gate-publish.yml --ref github-gate -f pr=<PR号> -f head=<PR head 完整提交号>
   gh run list --workflow gate-publish.yml --limit 1
   node --experimental-strip-types tools/dev-flow/src/integration/gate-cli.ts wait --run <运行号> --note tmp/issue-<线父卡>/gate-note.md
   ```

   说明文件写本地运行的检查与结果、已核对的卡上条件，以及代为确认的人，最多 1024 个字符；详细内容写进卡上的评论，说明里给链接。`wait` 缺省只批准 `publish`。PR 改动仓库工具链、gate 另要 `repo-toolchain-review` 的确认时，加 `--environments repo-toolchain-review,publish`，并让说明同时写明两道确认各自要求的内容。gate 失败时把 Stage 改回 In review，退回该线。
9. 读回：联调轨道等于 gate 报告的结果，`omne/gate/*` 记录标签存在，PR 上有发布决定评论。

## 3. 建收口点

本波全部批次合入后，按 integration.md「集成节点怎样工作」第 4 步：

1. 在联调轨道头运行联调命令。命令由里程碑卡给出。没有给出时写明本波没有联调。
2. 运行 `OMNE_ADMISSION=1 FULL=1 pnpm run check`。两者都通过时，这个提交是下一个收口点。任一项不通过时，按批次顺序定位负责的线，把修复排进该线下一波的第一张卡；收口点仍取当前头，集成报告标红。
3. 契约成员破坏性改动的允许时机与申请口子归 integration.md「里程碑内的规则」。各批次 PR 的「契约变化」按各卡的 taskBase 申报。
4. 把收口点提交号、准入与联调结果写进本波收口卡的「成果交回」。收口卡此时不关闭：关闭是下一波的开工事件，放在第 4 节最后一步。

## 4. 接受与看板

1. 接受之前，按 review-delivery 技能逐卡核对交付边界与验收标准。
2. 有权的接受者按 delivery.md「接受、取消与重开」的决定格式写接受评论，代笔时附有权者的明确输入。评论写明修订、精确 head、范围、结论、具名例外与剩余责任。须由负责人本人接受的卡交负责人。
3. 决定读回后运行 `node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts accepted --issue <N>`，再关闭卡。部分接受不关卡。
4. 在里程碑卡发集成报告：批次的合入顺序与到达时刻、每个批次每一步的结果与命令、退回的批次及原因、共享路径冲突、分解错误清单、收口点、具名例外与剩余责任。
5. 下一波的波准入按 dispatch 技能第 3 节做完，再以调度者身份给每条线的线父卡发 `line-delta`：新收口点、本线下一波队列与写范围、退回的批次与原因、对停下事项的答复。
6. 最后写收口卡的接受评论并关闭它。关闭就是各线开工的事件，所以 `line-delta` 必须在关闭之前发出，线醒来时才读得到。

每类记录的落点：

| 记录 | 落在哪 |
| --- | --- |
| 线包、`line-delta`、退回记录 | 线父卡评论 |
| 收口点提交、准入与联调结果、接受评论 | 收口卡 |
| 集成报告、reduce-state | 里程碑卡评论 |
| 各卡的接受评论 | 各卡 |

## 5. 退回

集成节点不与线会话对话，退回记录与 `line-delta` 以调度者身份写在线父卡上。除只落在共享路径上的合并冲突以外，集成节点不改批次的代码。批次有缺陷时整体退回该线：线修复后重新开批次 PR，沿用线父卡的同一个 attempt，head 前进。修复后的批次按本技能重走一遍。

## 已知的坑

- 合并进来的轨道头带了别的批次的 agent 源改动时，不重生成投影就会在准入的 `check:agents` 红。第 5 步不能省。
- 准入独占机器。两棵树同时跑准入会互相拖慢、让用例超时。
- gate 说明超过 1024 字会被拒绝。超限后同一运行仍在等待确认，缩短说明后可以对同一运行再确认。
- 求交时加入已关闭的卡会报出假冲突。命令默认排除已关闭的卡。
