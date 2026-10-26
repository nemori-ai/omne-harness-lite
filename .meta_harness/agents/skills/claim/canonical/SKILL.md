---
name: claim
description: >
  认领用户给出的 Issue，先在远端从卡上 binding 的 taskBase 创建工作分支，再在本地开工作树并切过去，运行 start 写入任务上下文，用 bro 介绍完整交付，再按任务选 pstack 技能和项目角色，把开工上下文地图写入工作树 tmp。
  用户要求认领任务、开工建工作树，或点名 /claim 时加载。调度者给自己开的卡开工，或卡上登记了新 attempt 时，也加载。
  地图落盘后停下。不开始实现，不提交，不开 PR。
---

# 认领

Issue 编号来自本次输入。没有编号时问一次，然后停下。

1. 按 `docs/engineering/agent-delivery.md` 认领。认卡评论写明负责人、宿主、会话、当前修订、授权依据和已有执行核对。已有派发就引用该决定。评论本身不授予执行权。卡还没有派发、执行区还没有 binding 时，认卡后停下，请调度者派发，不建分支。
2. 基线取卡上 binding 的 `taskBase`，分支名取 binding 的 `branch`。派发时这枚提交已经固定。目标分支之后前进了，也不要改用它现在的最新提交。直接目标分支按 `docs/engineering/integration.md` 和 binding 的 route 核对。
3. 先在远端创建工作分支，指向这枚基线提交。本地还没有这根分支时，用 `git push origin <基线提交>:refs/heads/<工作分支>`。远端已经有同名分支时，核对其尖端就是这枚基线。不是这枚基线就停下并报告，不要覆盖远端。
4. 远端分支就位后，再在本地为它开工作树，并让本地分支跟踪这根远端分支。按 `docs/engineering/workflow.md` 把工作放进这棵独立工作树，一张卡一棵。然后把当前会话的工作根切到这棵工作树。切换发生在远端分支已经存在之后。
5. 在这棵工作树里运行 `start`，写入任务上下文。输入和准入见 `tools/dev-flow/src/integration/README.md`：`authority` 是派发评论的 URL，`issue`、`revision` 和 `attempt` 取 binding。用 `status` 读回 context，核对分支、issue、revision、attempt 和 taskBase 与 binding 一致，targetBase 是开工时远端目标分支的提交。`start` 拒绝时停下并报告原因，不手写 context。在 Claude Code 云端会话里，`start` 会自动派发 `delivery-facts` 读取派发资格与 Project 事实，最多等 3 分钟；卡上随之出现一条交付身份发的开工事实评论，这是预期结果。
6. 读取并遵循 `pstack:bro`。用白话介绍这个任务要完整交付的成果。依据是该 Issue 的现行正文和验收条件。不把实现计划说成已经交付。
7. 介绍之后，不等下一条指令，自己准备开工上下文。从仓库根的 `AGENTS.md` 和 `docs/context-map.md` 选这次要读的入口，读到能确定拥有者、写范围和停止点为止。
8. 按 `docs/engineering/skills.md` 的采用表，只加载和这次任务匹配的 pstack 技能，并读它们的正文。主工作类型对应一个 playbook：feature、bug、refactor、performance、investigation、maintenance 分别对上 feature、bug-fix、refactoring、perf-issue、investigation，以及文档或工具维护所用的实际 playbook。改现有代码或要判断落点时加载 `pstack:how`。要查已有决定的理由时加载 `pstack:why`。写范围含 `.ts` 或 `.tsx` 时加载 `pstack:typescript-best-practices`。交付主要是文档时加载 `pstack:technical-writing` 和 `pstack:unslop`。没有贴合的 playbook 时才加载 `pstack:figure-it-out`。不要在认领时加载实施、Babysit、Shipping 或 Orchestrate，也不要开始执行 playbook 的实现步骤。
9. 选一个做这张卡的角色，不选评审角色来开工。读者入口从 `docs/README.md` 选，角色 id 以 `docs/documentation.json` 的登记为准，再运行 `uv run --locked omne-documentation context --root . --role <id>`。执行角色从 `.meta_harness/agents/roles/README.md` 选。实现类任务选 `developer`，并写明 `implementation_kind` 是 `product`、`terminal` 还是 `verification`。产品设计起草选 `product-design-drafter`。不要把 `qa`、`implementation-reviewer` 或 `design-reviewer` 写成开工执行者。
10. 把地图写到本工作树的 `tmp/issue-<编号>/context-map.md`，按[上下文地图模板](references/context-map.md)出。派发者已在这个位置放了地图时，保留它的第 1 到第 5 节，只补第 6 节「本次加载」与第 7 节「仍未知」，并把第 1 节的 context 读回改为实际结果。没有派发者地图时，按模板写全部七节：Issue、修订、attempt、route、taskBase、分支、写范围和 context 读回写进第 1 节，选中的读者角色、执行角色和实际读过的 pstack 技能写进第 6 节。第 3 节的第一项固定是 `docs/orientation.md`。写不出的项写「未知」，不猜。查询 JSON 放在同一目录。不提交 `tmp/`。派发者给出的 `task-pack.md` 只读不改，格式见[任务信息包模板](references/task-pack.md)。派发者写包时按[自包含检查](references/self-contained-check.md)核对，认领会话不做这项检查。
11. 报告 Issue、基线提交、远端分支、工作树路径、会话是否已切过去、`start` 是否成功，以及地图路径。然后停下，等下一条指令。不开始实现，不提交，不开 PR。
