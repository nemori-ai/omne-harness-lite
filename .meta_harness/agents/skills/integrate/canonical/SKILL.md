---
name: integrate
description: >
  集成节点侧的合入：一波并行的卡交回候选后，逐线核对写范围、用新 attempt 同步目标轨道、重生成投影、排队跑准入、派发并代为确认 gate、读回、写接受评论与看板字段，最后在父卡交回集成报告。
  被调度者指定为一波的集成节点、要把交回的候选合入轨道、或问「候选怎么合」「准入怎么排」「gate 怎么代确认」时加载。点名 /integrate 时加载。
  单张卡自己的分支同步与 FI/RI 用 branch-integration；建卡与派发用 dispatch。集成节点不改候选的代码，不与线的执行者通信；候选有缺陷时退回重派。
---

# 集成

本技能是 `docs/engineering/integration.md`「集成节点的清单」的可执行版。合并顺序、冲突、失败处理、退回与例外的规则都归那一节，权限与 gate 归同页「现行准入」。命令的精确行为归 `tools/dev-flow/src/delivery/README.md` 与 `tools/dev-flow/src/integration/README.md`，PR 与提交的格式归 `CONTRIBUTING.md`。

开始前确认：调度者已在父卡或任务信息包中把本波的集成节点具名给你；你有本波各卡的卡号、候选 PR、交接报告与任务信息包；代为确认 gate 时，你有该 admin 对本次确认的授权。缺任一项时停下，交回调度者。

## 1. 开始前

1. 核对本波写范围两两不相交：`node --experimental-strip-types tools/dev-flow/src/delivery/scope-cli.ts <本波卡号>...`。退出 1 时不开始合并，把冲突交调度者重新分解。已关闭的卡默认不参与。
2. 按 integration.md「合并顺序」定下顺序，合并中不改。顺序写进最后的父卡交回评论。

## 2. 逐线合入

按顺序对每条线做下列步骤。任一步失败时停在这一步，按 integration.md「失败处理」退回该线，再处理下一条线。

1. 读候选 PR 与卡上的交接报告。报告写明未达到的验收项时，该线不合入。
2. 核对改动都在 binding 的写范围内：`git diff --name-only <taskBase>...<候选 head>`。有越界文件时整个候选不合入。
3. 请调度者为该卡登记同一修订的新 attempt，binding 沿用候选分支与 taskBase，派发给你。调度者按 dispatch 技能完成。
4. 为新 attempt 建工作树并开工。本机还没有这张卡的树时用 `prepare`；本机有旧树时用 `swap`。`swap` 不删除旧树：它让旧树分离分支，从远端尖端建新树，并列出旧树中 `tmp/issue-<N>/` 以外的未跟踪路径。

   ```sh
   node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts prepare --issue <N> --tree .worktrees/issue-<N>-r<修订>a<序号>
   node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts swap --issue <N> --old <旧树> --tree .worktrees/issue-<N>-r<修订>a<序号>
   ```

   旧树确实不再需要时，按 `docs/engineering/workflow.md` 的清理条件与授权，先运行 `worktree-cli.ts remove --tree <旧树>` 看清单，再加 `--force` 删除。
5. 在新树中同步目标轨道，两步：先 `git merge origin/integration/<轨道>` 并提交，再运行 task-sync，输入 `{"kind":"task-sync","target":"<合并进来的轨道提交>"}`。合并出现冲突时立即停止，不在集成侧解决，见 integration.md「冲突即退回分解」。
6. 同步合并之后、准入之前，一律重生成投影并跑 `check:agents`：`node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts projections`。候选自己没改 agent 源也要做，因为合并进来的轨道头可能带别的卡的 agent 源改动。
7. 准入排队。同一台机器上的准入一次只跑一个，按任务信息包写明的准入锁路径排队：锁文件存在时等待，每 60 秒看一次；轮到时建锁文件，跑完删除。准入命令为 `OMNE_ADMISSION=1 pnpm run check`，它包含哪些检查归开发指南与仓库根 `package.json`。记录实际命令与退出码。准入不通过时退回该线，不改候选。
8. 推送新树的分支，让候选 PR 的 head 前进到同步后的提交。把 Stage 改为 Integrating：`node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts integrating --issue <N>`。
9. 派发 gate 并等待：

   ```sh
   gh workflow run gate-publish.yml --ref github-gate -f pr=<PR号> -f head=<PR head 完整提交号>
   gh run list --workflow gate-publish.yml --limit 1
   node --experimental-strip-types tools/dev-flow/src/integration/gate-cli.ts wait --run <运行号> --note tmp/issue-<N>/gate-note.md
   ```

   说明文件写本地运行的检查与结果、已核对的卡上条件，以及代为确认的人，最多 1024 个字符；详细内容写进卡上的评论，说明里给链接。`wait` 缺省只批准 `publish`。PR 改动仓库工具链、gate 另要 `repo-toolchain-review` 的确认时，加 `--environments repo-toolchain-review,publish`，并让说明同时写明两道确认各自要求的内容。gate 失败时把 Stage 改回 In review，退回该线。
10. 读回：目标轨道等于 gate 报告的结果，`omne/gate/*` 记录标签存在，PR 上有发布决定评论。

## 3. 接受与看板

1. 接受之前，按 review-delivery 技能核对交付边界与验收标准。
2. 有权的接受者按 delivery.md「接受、取消与重开」的决定格式写接受评论，代笔时附有权者的明确输入。评论写明修订、精确 head、范围、结论、具名例外与剩余责任。
3. 决定读回后运行 `node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts accepted --issue <N>`，再关闭卡。部分接受不关卡。

## 4. 退回与重派

集成节点与线的执行者不通信，也不改候选的代码。候选有缺陷时退回该线，例外条件归 integration.md「集成节点的清单」：

- 本波仍开放时，请调度者在同一波为该卡登记新 attempt（a2），派到空出的执行槽位。修复后的候选按本技能重走一遍。
- 本波已收口时，按 integration.md 把该线的工作项放进下一波的任务信息包。

## 5. 收口与交回

1. 全部候选合入后，运行任务信息包给出的联调命令。没有给出时写明本波没有联调。
2. 在轨道头运行 `OMNE_ADMISSION=1 FULL=1 pnpm run check`。通过时，这个提交是波的收口提交，也是下一波的冻结头。
3. 契约成员破坏性改动的允许时机与申请口子归 integration.md「里程碑内的规则」。各 PR 的「契约变化」按各自 taskBase 申报。
4. 在父卡发交回评论：合并顺序、每条线每一步的结果与命令、退回的线及原因、分解错误清单、收口提交、具名例外与剩余责任。

## 已知的坑

- 合并进来的轨道头带了别的卡的 agent 源改动时，不重生成投影就会在准入的 `check:agents` 红。第 6 步不能省。
- 准入独占机器。两棵树同时跑准入会互相拖慢、让用例超时。
- gate 说明超过 1024 字会被拒绝。超限后同一运行仍在等待确认，缩短说明后可以对同一运行再确认。
- 求交时加入不同波、已关闭的卡会报出假冲突。命令默认排除已关闭的卡。
