---
name: dispatch
description: >
  调度者侧的建卡与派发：把人的需求整理成交付卡，打齐必填标签与里程碑，核对写范围，用 dev-flow 发派发评论、写回 binding，建分支与工作树，运行 start 并核对看板字段。
  调度者要建卡、派发一张或一波卡、为同一张卡登记新 attempt、或问「怎么派发」「怎么把这张卡交给 subagent」时加载。点名 /dispatch 时加载。
  执行者认领已派发的卡用 claim，集成节点合入候选用 integrate，不用本技能。start 读回、看板字段核对完、派发包交出后停下，不替执行者实现。
---

# 派发

本技能把调度者的建卡与派发串成可执行的步骤。规则归执行仓库的正文与工具，本技能只给顺序和命令：

- 对话判断、建卡和派发的顺序：`docs/engineering/agent-delivery.md`。
- 卡的模块、Stage、字段总表、合法组合与契约变更：`docs/engineering/delivery.md`。
- 线、轨道、里程碑与集成节点：`docs/engineering/integration.md`。
- 命令的输入、输出与退出码：`tools/dev-flow/src/delivery/README.md` 与 `tools/dev-flow/src/integration/README.md`。

开始前确认三件事：你是本卡的调度者（`publish` environment 的 reviewer，或其明确委派的会话）；本次动作有授权依据；当前目录是执行仓库的检出。缺一项时停下，向负责人要。

## 1. 整理需求，定位已有卡

按 agent-delivery.md「整理需求并定位已有卡」做。同一活动结果已有卡时更新那张卡的修订，不另建。缺产品或架构决定时，卡留在 Backlog 并写明具名问题，不编默认答案。

派发前读到的事实一律从冻结头读，不从主检出读：`git show <taskBase>:<路径>`，或在冻结头的工作树里读。主检出可能落后于轨道。

## 2. 建卡

1. 按 delivery.md「创建与对账」在交接入口登记创建操作标识，再按 `.github/ISSUE_TEMPLATE/` 的模板写正文。删除全部占位与填写提示，保留「接手本卡」。
2. 「身份与责任」写齐交付线、性质、契约变更与主工作类型。组合按 delivery.md「卡属性与合法组合」核对。线内的卡的契约变更只取 `none` 或 `additive`。
3. 建卡时打齐必填标签并设置里程碑。`start` 缺任一项时拒绝开工：
   - 唯一的 `kind:<主工作类型>`，以及 `level:delivery` 或 `level:subtask`。
   - 唯一的 `line:<交付线>`。`nature:` 与 `contract:` 两族用标签同步命令补齐：`node --experimental-strip-types tools/dev-flow/src/delivery/labels-cli.ts --issue <N> --apply`。
   - Issue 的 milestone。改里程碑用 `milestone-cli.ts carry`，不手改。
4. 把卡加入主 Project，Status 设为 Backlog。就绪复核通过后设为 Ready。
5. Needs decision 由调度者置位，工具不写。卡需要人拍板时置 `yes`，包括线内卡申请破坏性契约改动。在卡的评论中写明要裁定的问题，决定读回后置 `no`。规则见 delivery.md「契约变更与里程碑类型」。

## 3. 核对写范围

并行派发一组卡前，运行求交：

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/scope-cli.ts <卡号或 binding 文件>...
```

退出 1 时不派发这组卡，先改分解。已关闭的卡默认不参与，列在 `excluded`。还没写进 Issue 的 binding 用文件传入。

## 4. 发派发评论，写回 binding

1. 在 `tmp/issue-<N>/` 写 `spec.json`。字段见 delivery/README.md「派发命令」。只写调度者的决定：attempt、分支、taskBase、写范围、路线、终点、依据，以及每个 start 条件的确认依据。修订、属性、里程碑、条件 ID 与摘要由命令从卡上读。
2. 写 `prose.md`：派发说明的人读部分。不在文字里重抄分支、taskBase 或写范围，这些以 binding 为准，抄写会出现笔误。
3. 先演练，确认通过所有核对：

   ```sh
   node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec tmp/issue-<N>/spec.json --text tmp/issue-<N>/prose.md --dry-run
   ```

   拒绝时按消息改卡：补标签或里程碑、改协议偏离、用标签同步命令改标签、补确认依据。然后重跑。
4. 正式派发，并把 binding 写回卡：

   ```sh
   node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec tmp/issue-<N>/spec.json --text tmp/issue-<N>/prose.md --out tmp/issue-<N>/binding.json
   node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts bind --binding tmp/issue-<N>/binding.json --worktree <工作树路径>
   ```

   两个命令都读回核对。退出 1 表示读回不符，按输出修正，不重复发评论。`post` 失败时消息里有占位评论的 URL，先改写或删除它，再重新派发。

## 5. 建分支与工作树，运行 start

1. 远端工作分支指向 taskBase。远端还没有这根分支时：`git push origin <taskBase>:refs/heads/<分支>`。已有同名分支时核对尖端等于 taskBase，不等时停下，不覆盖。
2. 二选一：
   - 执行者自己认领：交出派发评论，执行者按 claim 技能建树并运行 `start`。
   - 调度者为执行者建好树：`node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts prepare --issue <N> --tree .worktrees/issue-<N>-r<修订>a<序号>`。命令安装依赖、重生成投影并运行 `start`。
3. 用 `cli.ts status` 读回 context：issue、revision、attempt、taskBase 与 binding 一致。`start` 拒绝时按原因改卡后重跑，不手写 context。

## 6. 看板字段

`start` 新建 context 后写 Dispatched at、Line、Kind 与 Wave。读 `start` 写到标准错误的报告行：

- 有 `board-skipped` 或 `board-write-failed` 时，修好原因后补写：`node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts dispatched --issue <N>`。
- Wave 被跳过，表示 Project 里没有包含今天的迭代。先在 Project 的 Wave 字段配好本波的起止日，再补写。
- Status 改为 In progress 由调度者在 Project 中设置。云端会话用 `delivery-stage`。

## 7. 交出派发包

并行的卡按 claim 技能 `references/` 中的模板写上下文地图与任务信息包，派发前做一次自包含检查。之后停下，等执行者交回。

## 本波踩过的坑

- 扩写范围后重跑求交。写范围变了，binding 就变了，按新 attempt 重新派发。
- 写范围只以卡上的 binding 为准。计划表与任务信息包从 binding 生成，不手抄。
- 任务信息包里每条「已知事实」，要么在冻结头上复核过并写明出处，要么标「未核」，让执行者自己核。旧草稿与主检出都不可信。
- 条件行改过后，旧派发评论里的摘要失效，`start` 会拒绝。重跑 `post` 发新派发，命令按现行条件行重算摘要。
- 改共享提示页（例如 roles 下的页面）的卡，自测要列 Cursor 资格测试，写范围要列资格记录。
