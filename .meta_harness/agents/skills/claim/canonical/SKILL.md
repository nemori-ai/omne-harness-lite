---
name: claim
description: >
  执行者把一张交付卡从认领做到交回：先分清一条线开工时一次做好的线级准备，与每张卡开工前只增量做的卡级准备。卡级准备以 start 读回、上下文地图本卡附录、spec.md 与 plan.md 落盘为门槛。然后按 plan.md 的切片有序推进，按风险裁剪评审与验收。线内的卡全量准入归集成节点。不在线内的卡在最终 head 上准入一次。最后开 PR 并交回交接报告。
  用户要求认领任务、开工建工作树，线会话按线包推进一张卡，或点名 /claim 时加载。调度者给自己开的卡开工，或卡上登记了新 attempt 时，也加载。
  线会话的跨波流程用 line，建卡与派发用 dispatch，合入批次用 integrate。
---

# 认领与推进一张卡

Issue 编号来自本次输入。没有编号时问一次，然后停下。线会话不适用这一条：线会话的编号来自线包的队列。

本技能是执行者的流程。规则归下列拥有者：`docs/engineering/agent-delivery.md`（认领、派发、看板），`docs/engineering/delivery.md`（卡、修订、条件、接受），`docs/engineering/integration.md`（路线、双基线、准入、批次），`docs/engineering/quality.md`（风险级别与升级阶梯）。本技能只给顺序、产物与门槛，不另立规则。

准备分两层。线级准备在一条线开工时做一次，由 line 技能调用。卡级准备每张卡做，只做差额。没有线（单独派给你一张卡）时，两层都在这张卡上做一次。

## 线内的卡

线会话的阶段、交回与等待归 `line` 技能。claim 只承担执行阶段的卡级动作，不另创跨波状态。波中不向人提问，不用普通评论向 reduce 求方案，不吸收新的 delta。单卡交回或接受不触发新输入。

卡的局部问题在已有授权内自主决定。全局缺口先停依赖项，继续独立工作。本波无可继续项时，按 `line` 交回 blocked 或 failed。交回记录发布后写权归 reduce。只有 redo delta 与任务卡上的新 attempt 使本线同波重新准备。

## 线级一次性准备

一条线开工时做一次，产物放 `tmp/line-<线>/`。之后每张卡不重做。

1. 环境：`pnpm install --frozen-lockfile --prefer-offline`。生成 agent 投影。`pnpm run check:agents` 退出 0。记录实际的 Node、pnpm、git 版本。
2. 线级上下文地图主体，按[上下文地图模板](references/context-map.md)的主体部分写到 `tmp/line-<线>/context-map.md`：本线各卡共用的拥有者正文、系统图景入口（`docs/orientation.md`）、本线最容易踩的耦合与禁止的依赖方向、相邻线的接口、读者角色。调度者已给地图主体时只核对，不重写。
3. 线级约束 `tmp/line-<线>/constraints.md`：按[实施规格模板](references/spec-template.md)的「原则与约束」写本线适用的条目，只写一次。每张卡的 `spec.md` 引用它，只补本卡特有的条目。

4. 方法与角色：按 `docs/engineering/skills.md`「三层分工」选本线共用的技能，读它们的正文。写或改代码前读 `ub-mode`。
   - playbook 与其他 pstack 技能：按 `line` 技能 `references/work-paradigm.md` 的方法地图选。
   - Matt `to-spec`、`to-tickets` 设了 `disable-model-invocation`，不能按名加载。直接读 `docs/engineering/skills.md`「Matt 写法入口」钉住的 SKILL.md 文件。
   - 读者角色：从 `docs/README.md` 选，角色 id 以 `docs/documentation.json` 为准，然后运行 `uv run --locked omne-documentation context --root . --role <id>`。结果写进线级地图主体。
   - 执行角色从 `.meta_harness/agents/roles/README.md` 选。实现类选 `developer` 并定 `implementation_kind`。产品设计起草选 `product-design-drafter`。不把 `qa`、`implementation-reviewer`、`design-reviewer` 当开工执行者。
5. 出口：自包含检查四问能答（从哪个提交开工、能改哪些文件、做到什么程度算完成、每条事实出处在哪）。

## 卡级增量准备

每张卡做。只做本卡与线级产物的差额。

1. 认卡：按 `agent-delivery.md` 在本卡评论声明认卡：负责的人、宿主与会话、当前修订与 attempt、授权依据（派发评论或线包的登记授权）、现存执行核对。卡还没有派发、执行区没有 binding 时，线内的卡只有线包明确授权，线会话才按 `dispatch` 技能「发派发评论，写回 binding」一节登记；没有授权时按 `line` 交回 blocked。不在线内的卡停下，请调度者派发。
2. 写范围：以 binding 为准。登记 attempt 时，新建成员的卡写范围要加锁文件、所属组的组页、组 `documentation.json`、组 docs 与包组织页。
3. 分支：基线取 binding 的 `taskBase`，分支名取 binding 的 `branch`。远端还没有这根分支时 `git push origin <taskBase>:refs/heads/<分支>`。已有同名分支时核对尖端等于 taskBase，不等就停下报告，不覆盖。线内的卡从批次分支头切出，taskBase 就是批次分支头。
4. 工作树：一次 attempt 一棵，放主检出的 `.worktrees/issue-<号>-r<修订>a<序号>`，跟踪远端同名分支，然后把会话的工作根切过去。调度者已用 `worktree-cli.ts prepare` 建好时直接用。
5. `start` 与读回：在工作树里按 `tools/dev-flow/src/integration/README.md` 运行 `start`（`authority` 是派发评论 URL，`issue`、`revision`、`attempt` 取 binding），再用 `status` 读回：`bound=true`，issue、revision、attempt、branch、taskBase 与 binding 一致，relation 为 `current`。拒绝时停下，按错误码处理，不手写 context。线内的卡 targetBase 与批次分支分叉是预期结果。云端会话的 `start` 成功后，交付身份会在卡上发一条「开工事实」评论，这是预期结果。
6. 看板与正文：Stage 改为 In progress。线内的卡由线会话改。不在线内的卡由调度者改，执行者在认卡评论里请求。云端会话用 `delivery-stage`，以 `gh run view` 读到 `Stage: In progress` 才算完成。然后回填卡正文的开工读回表与当前进展。
7. 本卡附录：在 `tmp/issue-<号>/context-map.md` 按[上下文地图模板](references/context-map.md)只写本卡附录（绑定、本卡依据、缺口、受影响成员），主体引用线级地图。调度者给了任务信息包 `task-pack.md` 时只读不改。
8. `spec.md`：写本卡实施规格，放 `tmp/issue-<号>/spec.md`。方法用 Matt `to-spec`，格式用[实施规格模板](references/spec-template.md)。「原则与约束」一节引用线级 `constraints.md`，只写本卡新增条目。测试接缝：线内的卡由线会话定并写进 spec。不在线内的卡须经卡负责人确认。接续已有 attempt 的卡只写已采用规格之外的差额。
9. `plan.md`：写交付计划，放 `tmp/issue-<号>/plan.md`。方法用 Matt `to-tickets`，格式用[交付计划模板](references/plan-template.md)。开头放进度总览，按模板「进度更新」维护。每个切片写端到端行为与阻塞关系、对应的卡判据与验收勾选项、文件、命令、角色与模型分配、[七步待办](references/card-loop.md#切片的七步)。每条卡判据都要有切片和验收命令。
10. 待决事项：先按「过度设计 → 自己能定 → 必须上报」筛一遍。只有产品规则、范围变化、新的破坏性契约改动、须接受者本人做的动作才上报。不在线内的卡上报写进卡评论。线内的卡把缺口写进 `line` 技能范式规定的 `tmp/line-<线>/state.md`，并按范式「进度记录：两层，固定格式」把受阻状态写进「本波进度」；不发求方案评论，不等回复。暂停依赖切片，其他工作继续。没有工作可继续时按 `line` 交回 blocked。其余自己具名裁定，写进 `spec.md`「已定事项」。
11. 核对 `plan.md` 里的依据链接：每个相对链接与锚点都能解析，「第 N 行」的引用指向正确的范围，引号中的节名能在对应文件的标题中找到。`check:docs` 不检查 `tmp/`，这一步要自己做。
12. 用 `pstack:bro` 的方式在卡评论或 `tmp/line-<线>/state.md` 里用白话写一遍这张卡要交付的成果，依据是卡的现行正文与验收条件。不把计划说成已交付。

**出口门槛：**`status` 读回一致。Stage 为 In progress。`context-map.md`（主体加本卡附录）、`spec.md`、`plan.md` 齐全。待决事项已裁定或按相应边界保存缺口。链接核对无误。卡上要求逐步确认、或你不在线内且负责人要求先看计划时，到此停下报告。否则直接进入推进。

## 按计划推进

按 `plan.md` 逐个切片做，直到全部卡判据都有证据。每个切片的七步、功能门禁、评审力度、集中修复、升级阶梯、准入与评审的节奏归[卡的推进循环](references/card-loop.md)。要点：

- 一次只有一个写者在本工作树里写。实施与评审派新上下文的子代理，简报只给指针。
- 每个切片后复跑功能门禁（至少类型检查与 lint）。评审只在高风险切片做，常规评审集中到实施完成后一次。阻断合成一轮集中修复。结构度量与差分变异若干切片后集中跑一次。
- 评审与验收按 `quality.md` 的风险级别裁剪：L0、L1 不派实现评审。纯文档的卡仍跑 `review-docs` 与 `review-delivery`。L3 逐行读热点并派独立评审。
- 准入 `OMNE_ADMISSION=1 pnpm run check`：在线内推进时，全量准入归集成节点，交回前只跑本卡成员的类型检查与测试、format、oxlint 和按改动需要的 `check:docs`／`check:agents`，交接写明「全量准入留给集成节点」。不在线内的卡在最终 head 上跑一次，按准入锁排队，准入期间不提交、不做占 CPU 的事。
- 修复轮：线内的卡两轮未闭合即停，按 line 技能处理。不在线内的卡按 card-loop 的升级阶梯进第 3 轮。

## 交回

1. 把 `plan.md` 进度总览改成最终状态，与提交历史一致。
2. 推送候选，开 PR。线内的卡 base 是本线批次分支，PR 合入批次分支即完成线内合入。不在线内的卡 base 按 binding 的 route，正文按 `integration.md`「进轨道 PR 的说明」写「所含的卡」与「契约变化」。署名与 trailer 都按 `CONTRIBUTING.md`。
3. 在卡评论发五节交接报告，五节归[任务信息包](references/task-pack.md)第 7 节：做了什么、没做什么、发现的冲突、给集成节点的提示、评审闭合。评论同时写 PR 链接与固定 head。「做了什么」逐条对照卡判据写证据与未覆盖，并原样贴进度总览。判据要求的证据贴在卡评论里，只放在任务 tmp 的证据接受者不据它判断。原件太大时贴摘要和关键行，并写明原件位置与哈希。规则归 `agent-delivery.md`「5. 提交成果供接受」。
4. 回填卡正文「成果交回」，Stage 改为 delivered。线内由线会话运行 `board-cli.ts delivered`。不在线内的卡由调度者改，执行者在交回评论里请求。
5. 线内：本线本波的卡全部交完后，批次 PR 与线父卡上的 `<!-- line-handoff -->` 交回记录按 `line` 技能「交回」阶段发布。
6. 不自己接受，不自己合入批次分支以外的分支。接受归有权者。批次合入轨道归 `integrate` 技能。不在线内的卡进轨道由调度者按 `branch-integration` 技能处理。

## 收尾

卡接受不触发线会话读取 delta 或下一波开工。线会话按 `line` 技能等待线父卡上的下一条 delta，只有明确的 terminal delta 结束本线。

卡接受后：

- 契约基线登记只在 `integration.md`「里程碑内的规则」规定的两种情形下做，其他卡跳过。
- tmp 清理：被引用的材料保留，其余归档或删除。工作树的清理条件见 `docs/engineering/workflow.md`「工作树清理条件」。

## 已知的坑

见[已知问题与常用命令](references/known-issues.md)。
