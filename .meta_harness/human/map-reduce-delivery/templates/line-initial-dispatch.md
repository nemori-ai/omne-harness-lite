这是供 reduce 具体化的模板，不是已获准的派发。Reduce 填完全部字段后，只把下方「消息正文」写入每线临时文件，再打开供人转发。协作规则归[集成清单](../../../../docs/engineering/integration.md#集成节点的清单)。派发状态与生成规则归[负责人状态](../../../../docs/engineering/map-reduce-states.md#6-初始派发消息的生成与人工转发)。

填写规则：

- 每个 {{…}} 都替换成实际值。不适用的字段写「不适用」和原因。
- 分支、taskBase 和写范围只写 binding 的引用，不抄写值。
- Line 要运行的每条命令都放在 `sh` 代码块里。行内代码只写名字和路径。
- 命令字段不适用时，在代码块里写一行以 `#` 开头的注释说明原因。
- 命令代码块从行首开始，不放进列表或引用。缩进 4 个以上空格的围栏不算代码块，`validate` 不要求其中的命令有演练证据。
- 只放 reduce 能在本机演练的命令。接收器的 `init` 与 `serve` 会创建 webhook、启动常驻服务，不放进消息。
- 派发前，reduce 在本机同布局运行消息里的每条命令。演练证据是 `validate` 的必需输入，格式见[交付工具](../../../../tools/dev-flow/src/delivery/README.md#首次派发临时消息)。

# 消息正文

你是里程碑 {{milestone_name}} 的 {{line_name}} 线负责人。你在同一个会话里逐波工作或轮空，直到读到明确的 terminal delta。唯一的 reduce 会话是 {{reduce_session_ref}}。你负责本域本波的细化、实施和验证。全局设计、消费者迁移、跨线联调、集成冲突和交回后的问题归 reduce。

## 1 身份与唯一执行

| 项目 | 本次值 |
| --- | --- |
| 仓库 | {{repository_url}} |
| 里程碑卡 | {{milestone_issue_url}} |
| 线父卡 | {{line_parent_issue_url}} |
| 首次消息修订 | {{dispatch_revision}} |
| 机器与宿主 | {{machine_and_host}} |
| 工作目录 | {{working_directory}} |
| 任务卡与 binding | {{binding_refs}} |
| 线包 | {{line_pack_ref}} |

分支、taskBase、工作树和写范围只从 binding 读取。本消息不抄写这些值。同一修订被重复转发时，接续已有执行，不新建执行。本消息与 binding 或线包不一致时，按第 6 节交回 blocked。

## 2 先加载

在工作目录运行下列准备命令，然后加载技能。

```sh
{{prepare_commands}}
```

按顺序加载：

1. `line` 技能。先读它的 `references/work-paradigm.md`。这份范式给出三层准备、方法地图、推进循环、证据、交回与等待。
2. 每张卡按 `claim` 技能推进。
3. 写 spec 的「原则与约束」或写、改代码前加载 `ub-mode`。它是用户级技能，按 `docs/development.md`「初始化 coding agent 插件」初始化。先确认宿主能发现 `ub-mode`，发现不了时报告缺口。
4. 交回前加载 `review-code`、`review-docs` 和 `review-delivery`，按风险级别评审。
5. 改文档前加载 `asd-ste100`。

技能、工具和策略的版本：{{skill_source_ref}}。你只在开工边界采用新版本。

## 3 长程目标

| 项目 | 本次值 |
| --- | --- |
| 里程碑卡的关闭条件 | {{milestone_close_condition}} |
| 本线后续波的预案 | {{line_later_wave_plan}} |

每个局部决定都回到里程碑的关闭条件核对。预案不授予开工。只有 delta 改变本线的分工。

## 4 方法地图

本线的主工作类型：{{line_work_kind}}。

研发方法分三层：流程用 pstack `poteto-mode` 的 playbook，写法用 Matt `to-spec`、`to-tickets`、`writing-for-agents` 加 `claim` 技能的 spec 与 plan 模板，品味用 `ub-mode`。分工与项目差异归 `docs/engineering/skills.md`「三层分工」，本线的方法地图在 `line` 技能的 `references/work-paradigm.md`。

进度按固定格式记录。格式归下列拥有者，本消息不复述：

- 卡级：按 `claim` 技能 plan 模板的「进度更新」，维护 `tmp/issue-<号>/plan.md` 的进度总览。
- 线级：按 `line` 范式的「进度记录」，维护 `tmp/line-<线>/state.md` 开头的「本波进度」。
- 每个切片完成和每张卡交付时都更新，不攒到交回。

项目规矩与拥有者见 `work-paradigm.md`「最常碰到的项目规矩」。

### 按宿主选择角色模型

角色策略与解析结果：{{role_policy_ref}}。

1. 先写下自己的宿主与版本。
2. 按卡的工作类型与风险取角色模型。拿不准时上调一档。
3. Claude Code：每次调用 Agent 工具都传 `model` 参数。
4. Codex：developer 与 qa 的角色文件不钉模型。派发这两个角色时，你必须显式给模型。不给模型时，子代理继承父会话的模型，宿主不报错。
5. requested 与 observed 分开记录。宿主不报告 observed 时写 unknown。

### 开发为主的线：工程准则

准则与拥有者见 `work-paradigm.md`「开发为主的线：工程准则」。本消息不复述规则。

## 5 当前分工与冻结点

| 项目 | 本次值 |
| --- | --- |
| 当前波与收口卡 | {{current_wave_and_closeout}} |
| assignment 与原因 | {{assignment_and_reason}} |
| 收口点 F | {{frozen_point_f}} |
| 本波任务队列 | {{wave_queue_ref}} |
| 写范围 | {{write_set_ref}} |

binding 齐全且任务卡开放时，你就可以开工。事件接收器的健康状态和自检结果不阻止开工。

- active：从 F 建本波批次分支，按队列逐卡推进。
- idle：不建分支，不交空 PR。直接进入第 6 节的等待。

波中输入冻结。你不向人提问，不用普通评论向 reduce 求方案，不读取别线未集成的产出。

## 6 交回与等待

交回阶段归 `docs/engineering/map-reduce-states.md` 第 4 节，交回物与五节交接报告的格式归 `docs/engineering/integration.md`「线会话记录」。

1. 一张卡做完后，把它合入本线批次分支。在卡上发五节交接报告。五节格式见上。
2. 本线本波全部交完后，开批次 PR。零差异时没有 PR。批次 PR 的说明按「进轨道 PR 的说明」手写两节，逐张列本批次的卡。
3. 在线父卡发一条交回记录。首行是 `<!-- line-handoff -->`。固定项归 `integration.md`「线会话记录」。
4. 交回记录发布后，你停写。

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
4. 退出码 3 表示超时，不表示条件不成立。在新的前台调用里立即重跑同一条命令。起点 `--since` 不变。
5. 退出码 2 表示等待失败。在 {{line_state_path}} 写明等待状态是 unknown，然后等人转告。等待失败不算轮空，也不算成功。
6. 等待返回后，按 delta 处理。active 开工，idle 再次前台等待，redo 按新 attempt 重开，terminal 交最终报告。
7. 只有读到明确的 terminal delta 并交完最终报告，你才结束会话。超时、空队列和预案里没有后续任务都不结束会话。
8. 等自己派出的子代理时，前台没有别的工作就阻塞等它，不结束回合。

唯一允许的后台进程是本机事件接收器。每台机器只有一个接收器，由本机第一个开工的会话启动。启动方法见 `tools/dev-flow/src/delivery/README.md`「事件等待」开头的接收器命令。下列只读命令查看本机接收器的健康状态：

```sh
{{events_receiver_health_command}}
```

健康检查只报告事实，不阻止开工。

每次交回、停下或压缩上下文前，更新 {{line_state_path}}：开头的「本波进度」、身份、已消费的 delta、当前 attempt 与 head、未完成的操作、等待命令、下一步。替换会话只读它和线父卡就能接续。

## 7 停止条件

- 缺必要的全局输入、授权或共享物修改时，暂停依赖部分，继续无依赖工作。
- 没有工作可继续时，按第 6 节交回 blocked 或 failed，然后停写。
- 普通评论、超时和旧 attempt 都不授予返工。只有 redo delta 使本线同波重做。
- 只有明确的 terminal delta 结束本线。最终报告：{{final_report_ref}}。写明完成、限定接受或取消。停止不写成完成。

现在开始。先加载技能，完成会话级准备，再按第 5 节进入执行或等待。
