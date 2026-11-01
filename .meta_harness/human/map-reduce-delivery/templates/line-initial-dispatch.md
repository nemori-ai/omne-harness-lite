这是供 reduce 具体化的模板，不是已获准的派发。Reduce 填完全部字段后，只把下方「消息正文」写入每线临时文件，再按本次授权直接发送或打开供人转发。协作规则归[集成清单](../../../../docs/engineering/integration.md#集成节点的清单)。派发状态与生成规则归[负责人状态](../../../../docs/engineering/map-reduce-states.md#6-初始派发消息的生成与人工转发)。

填写规则：

- 每个 {{…}} 都替换成实际值。不适用的字段写「不适用」和原因。
- 分支、taskBase 和写范围只写 binding 的引用，不抄写值。
- Line 要运行的每条命令都放在 `sh` 代码块里。行内代码只写名字和路径。
- 命令字段不适用时，在代码块里写一行以 `#` 开头的注释说明原因。
- 命令代码块从行首开始，不放进列表或引用。缩进 4 个以上空格的围栏不算代码块，`validate` 不要求其中的命令有演练证据。
- 只放 reduce 能在本机演练的命令。接收器的 `init` 与 `serve` 会创建 webhook、启动常驻服务，不放进消息。
- 派发前，reduce 在本机同布局运行消息里的每条命令。演练证据是 `validate` 的必需输入，格式见[交付工具](../../../../tools/dev-flow/src/delivery/README.md#首次派发临时消息)。

# 消息正文

先加载 `line`、`pstack:poteto-mode` 和 `asd-ste100`。阅读 {{working_directory}} 中的 `AGENTS.md`、`docs/orientation.md`，以及 {{line_pack_ref}} 指向的线级上下文地图与拥有者入口。派发子代理前加载 `delegate`，本波另有几张卡时加载 `claim`，实施前读取 `ub-mode`；本线专项技能按 {{line_work_kind}} 加载。

你是里程碑 {{milestone_name}} 的 {{line_name}} 线负责人。你在同一个会话里逐波工作或轮空，直到读到明确的 terminal delta。唯一的 reduce 会话是 {{reduce_session_ref}}。你负责本线本波的细化、实施和验证，包括线内跨领域的集成与联调。全局设计、跨线的消费者迁移与联调、集成冲突和交回后的问题归 reduce。

分工：reduce 是项目总负责人，你是本线的 dev team lead。reduce 每波只给你三样：线包、线父卡上本波的一个 attempt、这条消息或之后的 delta。reduce 在线包里定目标、边界与验收：本线里程碑要达到什么，本波交什么、用什么判据、明确不做什么、哪些设计点要 reduce 批复、何时停止。你定怎样拆闭包、排顺序、派子代理与并行，并负责线内的合并与联调。理由：边界牵动别的线和整个里程碑，只有 reduce 看得到全局。怎样切得干净，离代码最近的你最清楚。线包附录的「建议闭包与依赖」只作参考。想做线包没写的事时，先交回，不自行扩大。展开见 `work-paradigm.md`「Reduce 与你的分工」。

工作哲学：你是派发者和判断者，不是主写者。用切得干净的闭包高度并行地派出子代理，写范围不相交，点不出争用就并行。规格与验收写死边界，子代理只在边界内发挥，交回是证据不是接受。模型从经济档起步，追加纠偏，不行再升档。以线包的本波交付边界为边界，先让它工作，够了就收口，不追加机制，不提前优化。展开见 `work-paradigm.md`「线负责人的思维模型」。

## 1 身份与唯一执行

| 项目 | 本次值 |
| --- | --- |
| 仓库 | {{repository_url}} |
| 里程碑卡 | {{milestone_issue_url}} |
| 线父卡 | {{line_parent_issue_url}} |
| 首次消息修订 | {{dispatch_revision}} |
| 机器与宿主 | {{machine_and_host}} |
| 工作目录 | {{working_directory}} |
| 线父卡本波的 attempt 与 binding | {{binding_refs}} |
| 线包 | {{line_pack_ref}} |

分支、taskBase、工作树和写范围只从 binding 读取。本消息不抄写这些值。同一修订被重复转发时，接续已有执行，不新建执行。本消息与 binding 或线包不一致时，按第 6 节交回 blocked。

## 2 先加载

在工作目录运行下列准备命令，然后加载技能。

```sh
{{prepare_commands}}
```

按顺序加载：

1. `line`、`pstack:poteto-mode` 和 `asd-ste100`。先读 `line` 的 `references/work-paradigm.md`。这份范式给出分工、思维模型、三层准备、方法地图、本波计划、推进循环、证据、交回与等待。
2. 本波另有几张卡时，按 `claim` 技能一次认领。
3. 派发子代理时加载 `delegate`。
4. 写 spec 的「原则与约束」或写、改代码前加载 `ub-mode`。它是用户级技能，按 `docs/development.md`「初始化 coding agent 插件」初始化。先确认宿主能发现 `ub-mode`，发现不了时报告缺口。
5. 交回前加载 `review-code`、`review-docs` 和 `review-delivery`，按风险级别评审。
6. 改文档前加载 `asd-ste100`。

技能、工具和策略的版本：{{skill_source_ref}}。你只在开工边界采用新版本。

## 3 长程目标

| 项目 | 本次值 |
| --- | --- |
| 里程碑卡的关闭条件 | {{milestone_close_condition}} |
| 本线后续波的预案 | {{line_later_wave_plan}} |

每个局部决定都回到里程碑的关闭条件核对。预案不授予开工。只有 delta 改变本线的分工。

## 4 方法地图

本线的主工作类型：{{line_work_kind}}。

研发方法分三层：流程用 pstack `poteto-mode` 的 playbook，写法用 Matt `to-spec`、`to-tickets`、`writing-for-agents`，格式借用 `claim` 技能的 spec 与 plan 模板，品味用 `ub-mode`。分工与项目差异归 `docs/engineering/skills.md`「三层分工」，本线的方法地图在 `line` 技能的 `references/work-paradigm.md`。

进度按固定格式记录。格式归下列拥有者，本消息不复述：

- 波级：`tmp/line-<线>/w<波>/plan.md` 的闭包表。
- 线级：按 `line` 范式的「进度记录」，维护 `tmp/line-<线>/state.md` 开头的「本波进度」。
- 在途子代理：已派出、尚未合回的闭包写在「本波进度」之后，格式归 `claim` 技能 plan 模板「进度更新」第 4 部分。
- 每个闭包派出和合入父分支时都更新，不攒到交回。

项目规矩与拥有者见 `work-paradigm.md`「最常碰到的项目规矩」。

### 按宿主选择角色模型

角色策略与解析结果：{{role_policy_ref}}。

会话级准备时写下自己的宿主与版本。派发子代理按 `delegate`「选模型」；规则、钉值与宿主传值机制归 `.meta_harness/agents/roles/README.md`「模型配置与本次派发」。

### 开发为主的线：工程准则

准则与拥有者见 `work-paradigm.md`「开发为主的线：工程准则」。本消息不复述规则。

## 5 当前分工与冻结点

| 项目 | 本次值 |
| --- | --- |
| 当前波与收口卡 | {{current_wave_and_closeout}} |
| assignment 与原因 | {{assignment_and_reason}} |
| 收口点 F | {{frozen_point_f}} |
| 本波交付边界 | {{wave_boundary_ref}} |
| 写范围 | {{write_set_ref}} |

线父卡上本波 attempt 的 binding 齐全、线父卡开放且线轨道同步点已读回时，你就可以开工。事件接收器的健康状态和自检结果不阻止开工。

- active：核对从 F 到线轨道的 FI 结果与固定同步点。从 binding 的 taskBase 建本波的线父分支（binding 的 branch，形如 `<用户名>/<线短名>-w<波号>`）并推送，你是它的唯一写者。在父分支工作树上对本波的 attempt 运行 `start`，再用 `status` 读回。然后按线包的本波交付边界写本波计划、切闭包。闭包分支从父分支头开出。
- 本波另有几张卡时：一次认领全部的卡，在同一条父分支上推进，只开一个集成 PR。这些卡不运行 `start`，原因是一个工作树只有一个 context。做法归 `integration.md`「本波有几张卡」。
- idle：不建分支，不交空 PR。直接进入第 6 节的等待。

波中输入冻结。你不向人提问，不用普通评论向 reduce 求方案，不读取别线未集成的产出。

执行中，你在前台推进本线工作，同时关注几条并行的事件流：在途子代理、闭包的依赖、线包「需 Reduce 批复」的设计点、写范围、验收证据、准入名额、gate、线轨道同步和宿主负载。任何一条有变化，都在下一次工具调用前处理。完整清单见 `work-paradigm.md`「执行中前台并行关注的事」，先读它。其中四点已经决定：

1. 准入名额：全机准入一次一个，由 `scripts/with-test-slot.mjs` 的运行名额排队保证；准入命令自动排队，不需要人工互斥。名额的覆盖缺口由 L-ENG 核实。每线每波只跑一次准入。
2. 需 reduce 批复的设计点：不另建卡。把候选与评审报告贴到线父卡上，reduce 监视线父卡评论并批复。等批复期间推进不依赖它的闭包。
3. gate 审批：由 reduce 代 PanQiWei 确认。你在 PR 上写清本地检查与线父卡上的条件，不自己确认。
4. 线内并发：不预设上限。你在额度与宿主负载内自定，重负载步骤串行。

## 6 交回与等待

交回阶段归 `docs/engineering/map-reduce-states.md` 第 4 节，交回物与五节交接报告的格式归 `docs/engineering/integration.md`「线会话记录」。

1. 一个闭包做完、达到门槛后，你把它合入父分支。这一步不跑准入，不开 PR，不走 gate。闭包门槛归 `integration.md`「线父分支」。合并提交写 `Agent-Role: main`。合入父分支不算被接受。
2. 本波的闭包都合入后，父分支合并线轨道新头（如有）并运行 `task-sync`。在父分支头跑线包「线内联调」一项，再只跑一次准入。准入命令自动排队，不需要人工互斥。
3. 开一个 PR，从父分支进入本线轨道。「所含的卡」列线父卡的 revision 与本波 attempt，本波另有卡时逐张列出各自的 revision 与 attempt。走一次 gate，读回合入。
4. 开线轨道到联调轨道的提升 PR。零差异时没有 PR。用 ri-notes 生成并核对「所含的卡」与「契约变化」，保存实际来源 head 和目标 head。
5. 在线父卡发本波的五节交接报告，每波一份。再发一条交回记录，首行是 `<!-- line-handoff -->`。固定项归 `integration.md`「线会话记录」。
6. 交回记录发布后，你停写。

交回记录用下列命令发布：

```sh
{{handoff_post_command}}
```

做不了时，用同一个入口交回 blocked 或 failed。写清原因、已完成部分和剩余工作，然后停写。没有远端通路时，在本机保存交回记录并打开供人带回。不声称记录已发布。

用下列命令等线父卡上的下一条 delta：

```sh
{{wait_command}}
```

1. 用宿主的 shell 或 bash 工具运行等待命令。这是一次前台阻塞的工具调用。
2. 不加 `nohup`、`&`、`setsid` 或 `disown`。不用任何后台任务模式，例如 Claude Code 的 `run_in_background`。
3. 等待命令带 `--timeout`。值略小于宿主单次工具调用的时长上限。
4. 退出码 3 表示超时，不表示条件不成立。先按第 6 条读回一次；没有未处理的 delta，就在新的前台调用里立即重跑同一条命令，起点 `--since` 不变。
5. 退出码 2 表示等待失败。在 {{line_state_path}} 写明等待状态是 unknown，然后等人转告。等待失败不算轮空，也不算成功。
6. 等待返回只是唤醒。先读回本线父卡上的全部 `line-delta`，与 {{line_state_path}} 里已处理的评论 id 比对，按发布顺序逐条处理，不跳过 idle delta。全部处理完、最后一条是 idle 时才再次前台等待。active 开工，redo 按新 attempt 重开，terminal 交最终报告。重挂起点归 `docs/engineering/integration.md`「等待监督」。
7. 只有读到明确的 terminal delta 并交完最终报告，你才结束会话。超时、空队列和预案里没有后续任务都不结束会话。
8. 等自己派出的子代理时，前台没有别的工作就阻塞等它，不结束回合。

唯一允许的后台进程是本机事件接收器。每台机器只有一个接收器，由本机第一个开工的会话启动。启动方法见 `tools/dev-flow/src/delivery/README.md`「事件等待」开头的接收器命令。下列只读命令查看本机接收器的健康状态：

```sh
{{events_receiver_health_command}}
```

健康检查只报告事实，不阻止开工。

每次交回、停下或压缩上下文前，更新 {{line_state_path}}：开头的「本波进度」、身份、已消费的 delta、当前 attempt 与 head、未完成的操作、等待命令、下一步。替换会话只读它和线父卡就能接续。

## 7 停止条件

- 按线包「停止条件」一节停止。需要做线包「明确不做」里的事时，停止依赖部分，交回时写明。
- 缺必要的全局输入、授权或共享物修改时，暂停依赖部分，继续无依赖工作。
- 没有工作可继续时，按第 6 节交回 blocked 或 failed，然后停写。
- 普通评论、超时和旧 attempt 都不授予返工。只有 redo delta 使本线同波重做。
- 只有明确的 terminal delta 结束本线。最终报告：{{final_report_ref}}。写明完成、限定接受或取消。停止不写成完成。

现在开始。先加载技能，完成会话级准备，再按第 5 节进入执行或等待。
