---
name: omne-card
description: 在本项目发卡、开工、进轨道与接受时的步骤与命令：设计段把交接信息包写成卡，交付会话照卡开工、同步轨道头、跑合入检查、开 PR、请求 gate 确认，人接受后关卡。研发的方法归 pqw 技能，本技能只写本项目的命令与判据。设计段末尾要发卡、交付会话开工或准备合入、负责人说「接受」「关卡」时加载。
---

# 发卡与进轨道

研发流程走 pqw `single-session-dev-flow`。本技能只补本项目在 GitHub 与轨道上的操作：做法归 pqw，命令与参数以各工具的说明为准，这里只写顺序与判据。

## 卡就是交接信息包

设计段过了交接点，把 pqw 的交接信息包写成卡正文：用卡模板 `.github/ISSUE_TEMPLATE/card.md`，九节齐，`check-plan --handoff` 退出 0。卡正文就是交付会话的全部输入；会话里讨论过而没写进卡的，交付会话看不到。

现行的 `dispatch-cli` 与 `start` 还按旧卡模板（`work-item.md`、`task.md`）读卡正文。在准入的写范围检查与绑定退役之前，卡正文仍用旧模板，交接信息包贴成卡上一条标题为「交接信息包」的评论。

发卡时：

1. 卡挂到父卡与交付 Project，打 `kind:` 与 `line:` 标签，设里程碑（现行 `start` 缺任一项就拒绝）。
2. 只有人能定的事写进「只有人能定的待决」，交付会话开工时一次问齐。

## 开工

现行工具要求先登记执行记录再开工。调度者（负责人，或他在卡上委派的会话）：

1. `dispatch-cli post` 发派发评论，`dispatch-cli bind` 把绑定写进卡正文，先 `--dry-run`。参数与 spec 文件格式见 交付工具说明 `tools/dev-flow/src/delivery/README.md`「派发命令」。
2. `worktree-cli prepare --issue <卡号> --tree .worktrees/<卡>` 建工作树，进去先 `git submodule update --init`（pqw 技能集是子模块，`prepare` 不初始化它，没有它投影会报错），再全量构建并生成投影；`start` 开工，`status` 读回。见 集成工具说明 `tools/dev-flow/src/integration/README.md`。
3. 写范围不够时扩写范围要重新登记、换树（`worktree-cli swap`）。设计段列消费者时跑 pqw 的 `consumers.mjs`，把这一步留在设计段。

## 实施与收口

按 pqw 交付期做。收口的命令全部在根 `AGENTS.md`「pqw-skills 接入」。

## 进轨道

1. 同步轨道头：`git fetch` 后 `git merge origin/integration/mainline`，轨道头有破坏性改动时先读它的 PR。
2. 先跑改动成员的合入检查（接入节那一格），再 `pnpm run preflight`，最后在最终 head 上 `pnpm run admission`。准入独占机器、不读缓存，不是第一道检测器；失败后用 `--resume-from` 接续。
3. 开 PR 进 `integration/mainline`，用 PR 模板 `.github/pull_request_template.md`，写「所含的卡」与「契约变化」两节。
4. gate：请负责人确认 `publish`。负责人在卡上授权代为确认时，`gh workflow run gate-publish.yml --ref github-gate -f pr=<号> -f head=<完整 head>`，再用 `gate-cli wait --run <运行号> --note <说明文件> --environments publish`。说明按 UTF-8 字节不超过 1024。
5. 看板：`board-cli integrating`，合入后 `board-cli delivered`。

## 交回与接受

1. 验收标准要求的证据贴到卡评论：命令、输出尾部、摘要与关键行，原件位置与哈希写在评论里。贴完再清理原件。
2. 交回报告写每条验收的达到与否、没做的及原因、过程偏差。
3. 接受由有权者决定。决定评论按交付协议 `docs/engineering/delivery.md`「4. 接受、取消与重开」的字段写，读回后 `board-cli accepted`，再关卡。代笔时写明授权人原话。
