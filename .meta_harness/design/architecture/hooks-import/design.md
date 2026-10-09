# 兼容hook翻译：当前设计与未实现边界

产品规则归[产品入口](../../product/PF-012-agent-loop-and-run/README.md)；本页只维护尚无真实提供者的已采用技术行为及未决，不授予实现或验证状态。公开数据沿实际定义拥有者，不建空包。新增产品政策仍由产品负责人决定。

 `importHostHooks(host,document,path,scope)` 全必填，**无授权、无 IO/提交**；导入者声明来源不等于可信源。闭合失败仅 invalidInput：host/scope/path/格式、任一 matcher 坏，整份拒、零部分导出。同输入逐字同 report/name。CC pin=2.1.280（2026-09-23 快照）；Codex pin=5c5308fc，配置逐字结构/解释器/部分失败语义未核，旧同构采用前提不能写成上游事实。

操作行为：每 command handler 恰一 report，逻辑重复不默并；按事件→组→handler 原序，name = hooks.host.sha256(UTF8 path串).event.组号.条号（1起）。路径不规范化、插入导致序号变化的身份代价显式保留。report imported/degraded/skipped 闭合；skipped 仅 non_loop_event/no_mapping，defer 不由导入报告产生（运行时才有）。if/async/非 command/未识别事件/不支持 matcher/未核 CC args 或 shell → no_mapping；坏 matcher 不是 skip。声明按事件上限，unavailability 初值 skip，可否决 before 位置落地者可改 veto，不能把声明降档后容忍越档输出。来源/hash 留痕无现行资产字段家，路径归一化、不同配置顺序、越限落地拒绝仍未闭。

PF020确定工作区发现与原位采用：兼容发现默认关、workspace.json 明确 opt-in、本机关闭胜共享打开；来源只在当前 workspace，原位读、不复制/改原件、不读 HOME；候选留 workspace layer。native local>shared，同能力 native 优先；CC 与 Codex 同能力不同内容报显式冲突、人选择、不默设家族优先；同来源不重复 hook；Git/文件/配置变更只下次实际装配采用。打开来源**不授命令执行权**，必要逐件执行允许事实仍须当前拥有者定义/判定；没有 tenant enable 写面不能迁成虚假已启用。

兼容执行的当前责任（不增加公开操作）：

- 输入按位置/情形/matcher 筛选；Stop 的续跑标记从可信日志事实读，不读进程计数。当前 ToolActionHistory.inspect 只接受完整 CheckedPrefix、纯投影、不授权；调用 history 不能另造第二份 Session/Run 记录权威。
- 子进程须解析本次真实 tenant/session 环境、获当前宿主准入，明确 workingDirectory 和白名单 env（不继承全部宿主 env）。执行使用execution-environments的placement/lease/command端口；保留落点隔离、外部作用不自动重放、stop请求与物理停止分离。宿主允许政策已裁，接线/工作目录/白名单仍未齐，不误记“产品还禁止宿主”。
- 起不来（未开始）走声明 unavailability；启动后普通 timeout/exit非0非2/坏 JSON/坏输出为**固定非阻断 error ignore**，必须日志 skipped:errored/output:observed/具名成因（坏原文不能泄漏）。只有环境启动后撤除或不能判断开始等特定失联适用 power 默认错误政策、可 fails_closed_on_error。解释器不存在是起不来，脚本不存在但解释器已起（exit127）是非阻断错误。不能沿旧 fail-closed 泛化。
- exit0/exit2 与 JSON precedence 按事件映射；allow 只 observed，不是放行。改资产输出忽略、systemMessage UI 字段不当系统提示。注入归带来源 extension 的 SystemReminder；终态 stop 为 cancelled。没有 hook 代答人/MCP 卡，也没有另造 host continuation cap。
- ask+updatedInput 放 proposedRewrite；人四档答案借样式、**不写权限**，仍走独立 tool admission；允许后 rewrite 逐值等于 proposedRewrite，否决/无答/自由文本不解释为允许。回放只读日志和人的答、不重跑脚本（外部副作用）。Codex 不支持 ask 收错误。超 power 输出收 output_not_allowed_for_power，observe 按 error ignore。
- CC/Codex 完整事件表仍须保留为当前翻译说明/可复跑 fixtures，而不是只留五个常见 hook：CC UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/PostToolUseFailure/PostToolBatch/Stop/StopFailure/PreCompact/PostCompact/SessionStart compact；Codex UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/Stop/PreCompact/PostCompact/SessionStart compact/Interrupt。其余 pinned 事件各有 non_loop_event 或 no_mapping；退出2、continuefalse、blocking反馈、改写、额外上下文在事件间不等价，不能统一分支抹平。

仍未闭：Codex 同构事实、CC exec form/shell核对；DSH fork 候选的许可和改动量前提未核，不带出为已实现复用；报告留痕归属/路径规范/不同配置次序；工作目录与 hookEnvAllowlist；拓展成本无 Run 的记账家；工作区候选/逐件命令启用事实表示。旧 no_mapping 保护条件保留到前提核清。

验证义务与规范输入见[verification](verification/README.md)。尚未闭合的公共语义阻止相应提供者实施，不以迁移目录关闭业务缺口。
