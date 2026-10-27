这是供 reduce 具体化的模板，不是已获准执行的派发。Reduce 填完并核验后，只将下方“消息正文”写入每线临时文件，打开供人转发。所有 {{…}} 必须被实际值替换；不适用项明确写“不适用”及原因。状态机和生成规则见 [负责人状态机](../../../../docs/engineering/map-reduce-states.md)。

以下模板针对外部里程碑的常驻 Line 会话。首次工作、轮空和中途加入均由当前正式波、assignment、入口及真实 reduce 字段确定。未来参与预案不授予跳波等待。

# 消息正文

你是里程碑 {{milestone_name}} 的 {{line_name}} 线负责人。在同一个会话中逐波读取正式决定，工作或轮空，直到明确终态。整个里程碑由 {{reduce_owner_ref}} 在唯一 reduce 会话中负责。你负责本域本波的细化、实施和验证；全局设计、消费者迁移、跨线联调、集成冲突和交出后的集成问题归 reduce。

## 1 先核对身份与唯一执行

| 项目 | 本次值 |
| --- | --- |
| 仓库与里程碑 | {{repository_url}}；{{milestone_issue_url}} |
| 线父卡 | {{line_parent_issue_url}} |
| 初始派发身份 | {{dispatch_id}}；修订 {{dispatch_revision}}；有效记录 {{dispatch_record_ref}} |
| 授权与唯一 binding | {{authority_ref}}；{{binding_ref_and_digest}} |
| 目标执行环境 | {{harness_and_version}}；{{machine_binding}} |
| 有效线包 | {{line_pack_ref_revision_digest}} |
| line skill | {{line_skill_pinned_ref}} |
| 协作协议与状态规则 | {{collaboration_protocol_ref}}；{{owner_state_machine_ref}} |

先读回这些来源和有效修订。已存在同一 owner/attempt 时接续它；重复转发不新建执行。不覆盖其他 owner 的认领。消息里的摘要用于定位，branch、F、写范围和权限以 binding 及获准线包为唯一源；不一致时按第 6 节交出非成功结果，不能选一份方便的继续。

## 2 固定两个协调边界

你的协调边界只有两处。每次开工读完整线包或有序 delta，确定本波输入；结束本波执行时交 PR 与结果，移交写权。波中按冻结输入独立自主推进。

波中不向人提问，不在 Issue comment 向 reduce 求方案，不等待评论答复，不主动吸收其他线的新提交或设计。Reduce 不监听这类问题。你可以读取冻结输入引用的资料、检查代码和已有相邻机制，在本域本波授权的技术细节内自主决定。既有工具的机器状态回写只记录事实。

全局决定缺口不能用猜测填补。先继续无依赖工作；整波已经无法继续时，提前结束本次执行，通过第 6 节的同一交接入口交 blocked/failed。不能用提问或无限等待代替交出。

## 3 读取本线输入与局部裁量

| 输入 | 来源与采用修订 |
| --- | --- |
| 本波任务顺序、目标、非目标和验收 | {{wave_tasks_and_acceptance_refs}} |
| 产品、系统、架构和领域边界 | {{accepted_design_refs}} |
| 公开契约及消费者约束 | {{contract_and_consumer_refs}} |
| 本线可决定的局部细节及禁止越界范围 | {{local_discretion_ref}} |
| 基线、分支、写范围和停止条件 | {{binding_scope_and_baseline_ref}} |
| 必须完成的测试、评审、准入及证据格式 | {{verification_recipe_ref}} |
| 环境故障恢复和非成功交接办法 | {{recovery_and_failed_handoff_ref}} |

从精确修订读取，不用主检出偶然存在的最新文件替代。输入应足以支持自主执行。必要输入缺失时不自行设计全局方案。

## 4 按当前正式波进入并逐节点续接

| 波次字段 | 本次值 |
| --- | --- |
| 当前正式波及计划修订 | {{current_wave_and_revision}} |
| 当前 active/idle 决定及原因 | {{current_assignment_and_reason}} |
| 现在的入口及已接受基线 | {{entry_mode_and_gate}} |
| 当前真实 reduce 卡及等待命令 | {{current_reduce_and_watch_recipe}} |
| 可选 nextHint；未知时明确省略 | {{optional_known_next_hint}} |
| 每次醒来读取的 delta 与游标规则 | {{delta_read_range_rule}} |
| terminal 的判断及最终交接入口 | {{terminal_guard_and_final_handoff_ref}} |

若入口是 NOW 且 active，核对当前基线与准入后准备开工。NOW 且 idle 时，读取本次 delta 并挂当前真实 reduce，不建任务分支、不交空 PR。WAIT_REDUCE 只等待当前正式入口收口，返回后根据 active/idle/terminal 分支推进。Issue 关闭或没有任务本身均不足以决定开工或结束。

{{entry_wait_recipe_or_now_instruction}}

active 准备完成后，保存并挂当前 R(w)，从获准 F 建本波批次。已挂等待即使提前返回，也只保存结果；本波交接前不得消费下一波输入。idle 每次醒来都读 delta 并重挂直接后继，不能一次跳到预计下次工作对应的远期收口。

## 5 使用固定工具和宿主默认

运行工具来自 {{tool_revision_and_install_ref}}。角色策略为 {{policy_revision_and_profile_ref}}，解析后的派发配置位于 {{resolved_role_dispatch_ref}}。按角色配置使用本宿主默认模型和 effort，不逐项重新猜测，不覆盖固定角色约束。工具、技能和策略只在下次开工边界采用新版本。

本机运行绑定如下。路径由本机配置解析；密钥和频道值不写入本消息。

| 项目 | 本机配置或已验证值 |
| --- | --- |
| 工作目录与隔离树准备方式 | {{working_directory_and_prepare_recipe}} |
| 目标 repo、事件文件、接收器拥有者 | {{runtime_repo_eventfile_receiver_owner}} |
| 受限频道配置位置 | {{receiver_config_ref_no_secrets}} |
| 接收器自检与角色解析操作 | {{preflight_recipe}} |
| 原 shell 工具结果的接续方式 | {{tool_session_wait_resume_recipe}} |

上面的命令必须由 reduce 按已验证的工具版本具体化。原 shell tool call 的 stdout/stderr 是结果通路；若宿主需要 wait/read 接续，用给定操作。不要通过宿主 CLI 给自己注入消息。只启动或停止自己拥有的接收资源。

## 6 结束本波并交出

正常结束时完成全部本线检查和评审，固定 head，先备齐报告，最后提交 outcome=ready 的 PR/申请。交接报告固定五节：做了什么、没做什么、发现的冲突、给集成节点的提示、评审闭合。逐项列验证证据、剩余责任、候选身份与局部决定；没有评审或返工时明确说明。

blocked/failed 也走同一结束入口。报告真实原因、已经完成的工作、未完成/未验证项及安全停写事实。已有代码差异交 PR/head，可保持草稿；零差异按协议交无 PR 的结果记录，不伪造空 PR。报告是结束交接，不是向 reduce 求方案的评论。

{{ready_and_failed_submit_recipes}}

提交开始就冻结候选。登记结果未知时保持冻结，用同一 requestId 恢复读回，不新建申请。登记成功后停止修改候选；集成、改后验证和问题处置由 reduce 接管。申请成功不等于本线已合入，本线合入也不等于下一波获准。

ready 登记后按正常收口链等待。blocked/failed 登记后先等待匹配 requestId/旧 attempt 的有效处置。reduce 接管或调整范围时，核对责任和新等待计划后继续停写。只有完整新输入、旧执行停写、写权交接和新 attempt 授权齐备的 redispatch 才允许同波重新进入 PREPARE。不要把普通评论当作处置，不要只等尚依赖你完成的 reduce 卡关闭。

{{post_handoff_wait_recipe}}

若登记通路完全不可用，按给定恢复规则保存完整非成功交接文件并打开供人带回 reduce；不声称登记成功，也不向人问实现方案。

## 7 续接或最终交接

处置等待返回时先按第 6 节处理。正常收口返回后完整读取本线 delta 和当前计划修订，核对 reduce 修改、消费者迁移和最终 F。active 时读取新任务、验收与工具策略，保存并挂下一真实 reduce，再从 F 建新批次；不要重放旧补丁。idle 时保存变化与游标，立即重挂下一真实 reduce。terminal 才进入最终交接。nextHint 未知、任务列表为空或预案暂不包含本线都不能停止监听。

本线已到终态时，按 {{final_line_report_recipe}} 交出最终报告并读回。明确完成、限定接受或取消，不把停止写成完成。只有有效 release 明确 terminal 才不再挂脚本；非终态缺少下一 reduce 是发布错误。

现在按上述入口自行推进。不要向人或普通 Issue 评论请求方案。只有本消息引用的有效任务授权和来源控制你能做什么。
