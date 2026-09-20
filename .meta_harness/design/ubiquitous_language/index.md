# 全部词条索引

**查重从这里开始。**加任何一个新词之前，先在这一页搜一遍——
**连[弃用说法](conventions.md#一个词条长什么样)一起搜**。

> **这一页不是定义。**每行末那句话只是**认出它**用的，
> **定义在各卷里**，以那里的为准。
> 加、改、废一个词条时**同步改这一页**，见 [conventions](conventions.md#加一个新词条)。

## [主体与归属](terms/subjects-and-ownership.md)

**谁在用这个系统，东西归谁。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-account](terms/subjects-and-ownership.md#ul-account--账号--account) | 账号 | Account | 自然人的产品身份，只管标识、鉴权、聚合 |
| [UL-organization](terms/subjects-and-ownership.md#ul-organization--组织--organization) | 组织 | Organization | 一个协作范围，能容纳多个账号 |
| [UL-personal-organization](terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization) | 个人组织 | Personal Organization | 注册时自动产生、不能邀请人的那一个 |
| [UL-team-organization](terms/subjects-and-ownership.md#ul-team-organization--团队组织--team-organization) | 团队组织 | Team Organization | 个人组织之外的所有组织 |
| [UL-parent-organization](terms/subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization) | 上级组织 | Parent Organization | 一项属性，不是一层，也不带来继承 |
| [UL-ancestor-chain](terms/subjects-and-ownership.md#ul-ancestor-chain--上级链--ancestor-chain) | 上级链 | Ancestor Chain | 顺着上级往上那条链，也是资产流转的边界 |
| [UL-tenant](terms/subjects-and-ownership.md#ul-tenant--租户--tenant) | 租户 | Tenant | (组织, 账号) 这一组合，归属与隔离的单位 |
| [UL-tenant-role](terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role) | 租户角色 | Tenant Role | 租户在其组织内当前能做什么 |
| [UL-super-administrator](terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator) | 超级管理员 | Super Administrator | 一个组织内的最高治理角色，**不是平台管理员** |

## [作用域与求值](terms/scope-and-resolution.md)

**一个值是怎么被算出来的。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-scope-layer](terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer) | 作用域层 | Scope Layer | 出厂默认 / 组织级 / 租户级 / 会话级这四层 |
| [UL-scoped-object](terms/scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object) | 范围化对象 | Scoped Object | 归属于某一层、参与求值的那类对象 |
| [UL-capability-identifier](terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) | 能力标识 | Capability Identifier | 判定两个对象能否互相覆盖的那个标识 |
| [UL-scope-evaluation](terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation) | 作用域求值 | Scope Evaluation | 沿层算出这次实际生效的那一份 |
| [UL-scope-composition-semantics](terms/scope-and-resolution.md#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics) | 作用域合成语义 | Scope Composition Semantics | 覆盖 / 收窄 / 组合三种 |
| [UL-two-pass-resolution](terms/scope-and-resolution.md#ul-two-pass-resolution--两轮求值--two-pass-resolution) | 两轮求值 | Two-Pass Resolution | 先算哪个资产，再算它的属性项 |
| [UL-immutable-marker](terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker) | 不可覆盖标记 | Immutable Marker | 把「默认这样」变成「必须这样」的那个标记 |
| [UL-attribute-projection](terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection) | 属性投影 | Attribute Projection | 「组织的设置」是视图不是对象 |
| [UL-runtime-context](terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) | 运行时 context | Runtime Context | agent 感知到的「我处在什么情形下」 |
| [UL-collaboration-scope-context](terms/scope-and-resolution.md#ul-collaboration-scope-context--协作范围-context--collaboration-scope-context) | 协作范围 context | Collaboration-Scope Context | 我在哪个组织、什么租户身份、什么角色 |
| [UL-personal-context](terms/scope-and-resolution.md#ul-personal-context--个人-context--personal-context) | 个人 context | Personal Context | 跟着人走的偏好，不参与任何层的合成 |

## [能力与构成](terms/capabilities-and-composition.md)

**agent 由什么构成，因此能做什么。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-asset](terms/capabilities-and-composition.md#ul-asset--资产--asset) | 资产 | Asset | 约束 agent 由什么组装而成、从哪被触达、在哪插手，**恰有八类** |
| [UL-setting](terms/capabilities-and-composition.md#ul-setting--设置--setting) | 设置 | Setting | 资产的一种属性，管「怎么做」 |
| [UL-permission](terms/capabilities-and-composition.md#ul-permission--权限--permission) | 权限 | Permission | 资产的一种属性，管「能做什么」 |
| [UL-skill](terms/capabilities-and-composition.md#ul-skill--技能--skill) | 技能 | Skill | 一段可复用的工作方法 |
| [UL-tool](terms/capabilities-and-composition.md#ul-tool--工具--tool) | 工具 | Tool | 一个可被调用的动作，定义与实现缺一不可 |
| [UL-mcp](terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) | MCP | MCP | 一个外部工具来源的接入点 |
| [UL-connector](terms/capabilities-and-composition.md#ul-connector--连接件--connector) | 连接件 | Connector | 一个外部消息来源的接入件，**方向相反** |
| [UL-loop-extension](terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) | 拓展件 | Loop Extension | 挂在 loop 拓展点上的一段判断或动作，**第八类资产** |
| [UL-slash-command](terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command) | 斜杠命令 | Slash Command | 用户主动发起某件事的入口 |
| [UL-plugin](terms/capabilities-and-composition.md#ul-plugin--插件--plugin) | 插件 | Plugin | 打包分发若干资产的单元，**不是 Cordis plugin** |
| [UL-agent-definition](terms/capabilities-and-composition.md#ul-agent-definition--agent-定义--agent-definition) | Agent 定义 | Agent Definition | 一个 agent 的静态定义，不是会话也不是实例 |
| [UL-asset-composition](terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition) | 资产组合 | Asset Composition | 资产之间、资产与 agent 之间的同一种关系 |
| [UL-instance-constitution](terms/capabilities-and-composition.md#ul-instance-constitution--实例构成--instance-constitution) | 实例构成 | Instance Constitution | 运行实例「是什么」的那部分 |
| [UL-action-space](terms/capabilities-and-composition.md#ul-action-space--动作空间--action-space) | 动作空间 | Action Space | 能发起哪些动作，**只由构成决定** |
| [UL-meta-capability](terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability) | meta 能力 | Meta Capability | 一整类能力的统一入口，**必定常驻、不可禁用** |
| [UL-prompt-slot](terms/capabilities-and-composition.md#ul-prompt-slot--提示词槽位--prompt-slot) | 提示词槽位 | Prompt Slot | 系统提示词里一个恒定占位的条目 |

## [流转与授权](terms/circulation-and-entitlement.md)

**东西怎么在主体之间流动，谁凭什么用它。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-definition-ownership](terms/circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership) | 定义所有权 | Definition Ownership | 这个定义是谁的 |
| [UL-usage-right](terms/circulation-and-entitlement.md#ul-usage-right--使用权--usage-right) | 使用权 | Usage Right | 谁被允许使用它 |
| [UL-version-selection](terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection) | 版本选用 | Version Selection | 某个范围当前选了哪个版本 |
| [UL-revocation-is-not-stop](terms/circulation-and-entitlement.md#ul-revocation-is-not-stop--撤销不等于强制停止--revocation-is-not-a-stop) | 撤销不等于强制停止 | Revocation Is Not a Stop | 撤权管的是下一道准入 |
| [UL-asset-origin](terms/circulation-and-entitlement.md#ul-asset-origin--资产来源--asset-origin) | 资产来源 | Asset Origin | official 还是 customized |
| [UL-official-asset](terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) | 官方件 | Official Asset | 组装的最小必需，**不可禁用** |
| [UL-customized-asset](terms/circulation-and-entitlement.md#ul-customized-asset--自定义件--customized-asset) | 自定义件 | Customized Asset | 自定义来源，对 official 只有「替代」一种关系 |
| [UL-asset-transfer](terms/circulation-and-entitlement.md#ul-asset-transfer--资产转移--asset-transfer) | 资产转移 | Asset Transfer | 同一个人两个租户身份之间的搬运，**断链** |
| [UL-asset-sharing](terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing) | 资产分享 | Asset Sharing | 主体之间的授权，所有权不动，**被动跟随** |
| [UL-transfer-lineage](terms/circulation-and-entitlement.md#ul-transfer-lineage--转移血缘--transfer-lineage) | 转移血缘 | Transfer Lineage | 再转一次该更新哪一份 |
| [UL-asset-removal](terms/circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal) | 资产移除 | Asset Removal | 不再持有，**agent 不知道有这回事** |
| [UL-asset-disable](terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable) | 资产禁用 | Asset Disable | 还在但权限收窄为空集，**拒绝可解释** |

## [Agent 运行时闭环](terms/agent-runtime-loop.md)

**一段协作怎么从触发走到收束，又怎么回到会话。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-single-active-execution](terms/agent-runtime-loop.md#ul-single-active-execution--会话内单活跃--single-active-execution) | 会话内单活跃 | Single Active Execution | **一个会话同一时刻至多一个活跃 Run、一个活跃实例**（GPT-Live 时重裁） |
| [UL-session](terms/agent-runtime-loop.md#ul-session--会话--session) | 会话 | Session | 一段协作的耐久身份与归属边界，**不要求有人说过话** |
| [UL-run](terms/agent-runtime-loop.md#ul-run--运行--run) | 运行 | Run | 一次逻辑执行请求及其结果，**成本与失败的归属单位** |
| [UL-trigger](terms/agent-runtime-loop.md#ul-trigger--触发--trigger) | 触发 | Trigger | 一次运行的起点，**不必是人说了一句话** |
| [UL-run-attempt](terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt) | 执行尝试 | Run Attempt | 同一次运行的一次实际执行，**重试不是新的 Run** |
| [UL-run-terminal-state](terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state) | 运行终态 | Run Terminal State | **恰有三种**，只从一个出口落账；**等人不是终态** |
| [UL-agent-loop](terms/agent-runtime-loop.md#ul-agent-loop--agent-loop--agent-loop) | Agent Loop | Agent Loop | 推进一次运行的那个**纯函数**，不是那个 while 循环 |
| [UL-agent-step](terms/agent-runtime-loop.md#ul-agent-step--agent-的一步--agent-step) | agent 的一步 | Agent Step | loop 转一圈；**一步之内至多一次模型调用** |
| [UL-current-conditions](terms/agent-runtime-loop.md#ul-current-conditions--当下条件--current-conditions) | 当下条件 | Current Conditions | 日志之外、此刻才成立的那些，**不落日志** |
| [UL-loop-extension-point](terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point) | Loop 拓展点 | Loop Extension Point | 一个状态点的紧前或紧后，**按位置命名不按功能**；可挂多个。**当前十一个** |
| [UL-agent-assembly](terms/agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly) | Agent 装配 | Agent Assembly | 把定义在某作用域下变成实例的那个动作 |
| [UL-agent-instance](terms/agent-runtime-loop.md#ul-agent-instance--运行实例--agent-instance) | 运行实例 | Agent Instance | 一副真正在跑的身子，可回收可重建 |
| [UL-assembly-manifest](terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest) | 装配清单 | Assembly Manifest | 「当时那个 agent 是什么样」的唯一答案 |
| [UL-runtime-injection](terms/agent-runtime-loop.md#ul-runtime-injection--运行时注入--runtime-injection) | 运行时注入 | Runtime Injection | 外面给的，换了不用重建，**不是 DI** |
| [UL-incremental-loading](terms/agent-runtime-loop.md#ul-incremental-loading--增量装载--incremental-loading) | 增量装载 | Incremental Loading | 运行中加一个可选能力，清单上追加一条 |
| [UL-instance-retirement](terms/agent-runtime-loop.md#ul-instance-retirement--实例退役--instance-retirement) | 实例退役 | Instance Retirement | 显式动作：先不接新活，等停当，再释放 |
| [UL-forced-stop](terms/agent-runtime-loop.md#ul-forced-stop--强制停止--forced-stop) | 强制停止 | Forced Stop | 立刻撤销执行资格，**外部效果收不回来** |

## [落地与隔离](terms/grounding-and-isolation.md)

**动作实际落到哪里。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-execution-environment](terms/grounding-and-isolation.md#ul-execution-environment--执行环境--execution-environment) | 执行环境 | Execution Environment | 动作落到哪里，**永远存在，且是注入的** |
| [UL-sandbox](terms/grounding-and-isolation.md#ul-sandbox--沙箱--sandbox) | 沙箱 | Sandbox | 执行环境中隔离的那些，**不是上位概念** |
| [UL-host-machine](terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine) | 宿主机 | Host Machine | 唯一不隔离的那一个，**必须被显式允许** |
| [UL-stateless-sandbox](terms/grounding-and-isolation.md#ul-stateless-sandbox--无状态沙箱--stateless-sandbox) | 无状态沙箱 | Stateless Sandbox | 用完就扔 |
| [UL-session-sandbox](terms/grounding-and-isolation.md#ul-session-sandbox--会话级沙箱--session-scoped-sandbox) | 会话级沙箱 | Session-Scoped Sandbox | 到点销毁，数据不留存 |
| [UL-tenant-sandbox](terms/grounding-and-isolation.md#ul-tenant-sandbox--租户级沙箱--tenant-scoped-sandbox) | 租户级沙箱 | Tenant-Scoped Sandbox | 共享工作空间，**只有它要求数据持久** |
| [UL-sandbox-data](terms/grounding-and-isolation.md#ul-sandbox-data--沙箱数据--sandbox-data) | 沙箱数据 | Sandbox Data | 与沙箱本体分开的那个东西 |
| [UL-environment-facility](terms/grounding-and-isolation.md#ul-environment-facility--环境设施--environment-facility) | 环境设施 | Environment Facility | 这个环境提供哪几种做事的手段 |
| [UL-terminal-session](terms/grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session) | 终端会话 | Terminal Session | `Shell()` 开的那条命令行，**与[会话](terms/agent-runtime-loop.md#ul-session--会话--session)毫无关系** |

## [取用与可用性](terms/reach-and-availability.md)

**一样能力此刻够不够得着、做不做得了。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-residency](terms/reach-and-availability.md#ul-residency--常驻--residency) | 常驻 | Residency | 始终出现在系统提示词里；**标记挂在引用上，不是资产的属性** |
| [UL-current-availability](terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability) | 当下可用性 | Current Availability | **依赖解析的结果，不是开关**；每次 run 前重算 |
| [UL-stand-in](terms/reach-and-availability.md#ul-stand-in--替换件--stand-in) | 替换件 | Stand-in | 不可用时装在它位置上的同名件，**正常返回不是错误** |
| [UL-dependency-declaration](terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration) | 依赖声明 | Dependency Declaration | 「我要成立还需要什么」，**要能表达且/或** |

## [执行与收场](terms/execution-and-outcome.md)

**一件事怎么跑、跑时跟外面说什么、跑偏了谁接手、最后怎么了结。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-tool-definition](terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition) | 工具定义 | Tool Definition | 工具的静态描述，**数据，长期** |
| [UL-tool-execution](terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) | 工具执行 | Tool Execution | 一次执行，**计算资源，绑会话不绑实例** |
| [UL-background-execution](terms/execution-and-outcome.md#ul-background-execution--后台执行--background-execution) | 后台执行 | Background Execution | 不占当前这一轮地跑，**不声明就是不能** |
| [UL-model-call](terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) | 一次模型调用 | Model Call | 发出请求到拿回完整一份；**与工具执行是兄弟** |
| [UL-wait-state](terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state) | 等待态 | Wait State | 停下来等一个应答，**「谁来应答」不是它的一部分** |
| [UL-frame-emission](terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission) | 发帧 | Frame Emission | 跑的过程中交出「我正在干什么」，**不承诺任何事** |
| [UL-execution-frame](terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) | 执行帧 | Execution Frame | 发出去的那个东西，**由协议约定，不由定义声明** |
| [UL-tool-output](terms/execution-and-outcome.md#ul-tool-output--工具产出--tool-output) | 工具产出 | Tool Output | 三部分，**读者不同**；帧只给人看，agent 看不到 |
| [UL-attachment](terms/execution-and-outcome.md#ul-attachment--附件--attachment) | 附件 | Attachment | 存进存储、不进对话，agent 自己去取 |
| [UL-result-offloading](terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading) | 结果卸载 | Result Offloading | 原始结果存起来、消息里换成带摘要的占位，**不是全卸载** |
| [UL-execution-outcome](terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome) | 执行收场 | Execution Outcome | 六种，**非完成的四种里只有一种是失败** |
| [UL-nominal-path](terms/execution-and-outcome.md#ul-nominal-path--主路径--nominal-path) | 主路径 | Nominal Path | 一层没出非常态时本该的样子，**推进式或稳态式** |
| [UL-off-nominal](terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal) | 非常态 | Off-Nominal | 某层此刻不在主路径上，**是状态不是一类事，与报错无关** |
| [UL-escalation](terms/execution-and-outcome.md#ul-escalation--上交--escalation) | 上交 | Escalation | 了结不了就把处置权交给外面一层，**交身份与分类不交正文** |
| [UL-terminal-disposition](terms/execution-and-outcome.md#ul-terminal-disposition--终局--terminal-disposition) | 终局 | Terminal Disposition | 交到头也回不去了；**落终局的是那件事，不是那一层** |

## [交互与派发](terms/interaction-and-dispatch.md)

**agent 跟人、跟别的 agent 怎么来往。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-agent-dispatch](terms/interaction-and-dispatch.md#ul-agent-dispatch--agent-派发--agent-dispatch) | agent 派发 | Agent Dispatch | `spawn` / `delegate` / `handoff` 三种，**五维取值不同** |
| [UL-inter-agent-communication](terms/interaction-and-dispatch.md#ul-inter-agent-communication--agent-间通信--inter-agent-communication) | agent 间通信 | Inter-Agent Communication | **两条规则，覆盖面不一样**；素不相识的也能通 |
| [UL-dispatch-report](terms/interaction-and-dispatch.md#ul-dispatch-report--派发报告--dispatch-report) | 派发报告 | Dispatch Report | **终结这次派发，只来一次**；与消息是两样东西 |
| [UL-hitl](terms/interaction-and-dispatch.md#ul-hitl--人在回路--human-in-the-loop) | 人在回路 | Human in the Loop | 停下来等人，**没有上限** |
| [UL-run-wait-state](terms/interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state) | 运行等待态 | Run Wait State | 系统算出来的、**直接把 run 停住**的那种等 |
| [UL-decision-card](terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) | 决策卡片 | Decision Card | 让人**当场**就能判断；**一张只能答一次** |
| [UL-decision-pool](terms/interaction-and-dispatch.md#ul-decision-pool--决策池--decision-pool) | 决策池 | Decision Pool | 租户内所有等着的卡片，**是陈列不是主体** |
| [UL-admission-decision](terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision) | 放行判断 | Admission Decision | 一个函数，**既是判官也是撰稿人**；三样输入合起来 |
| [UL-inquiry](terms/interaction-and-dispatch.md#ul-inquiry--问询--inquiry) | 问询 | Inquiry | agent 主动问人，**一次问全** |
| [UL-approval-request](terms/interaction-and-dispatch.md#ul-approval-request--请示--approval-request) | 请示 | Approval Request | 动手之前请人准不准，**固定两个选项** |
| [UL-session-authorization-context](terms/interaction-and-dispatch.md#ul-session-authorization-context--会话授权上下文--session-authorization-context) | 会话授权上下文 | Session Authorization Context | 本会话内同意过的那些事，**会话结束一起消失** |

## [记录与上下文](terms/record-and-context.md)

**留下了什么，以及怎么把它组装给读的人或模型。**

| ID | 中文 | English | 一句话 |
|---|---|---|---|
| [UL-occurrence](terms/record-and-context.md#ul-occurrence--发生的事--occurrence) | 发生的事 | Occurrence | 留下记录之前的那个东西，**判断打在它身上** |
| [UL-record-entry](terms/record-and-context.md#ul-record-entry--记录条目--record-entry) | 记录条目 | Record Entry | 一条不可变条目，**产出多条只有两个原因** |
| [UL-entry-standing](terms/record-and-context.md#ul-entry-standing--条目效力--entry-standing) | 条目效力 | Entry Standing | 丢了会怎样——**依据 / 留痕 / 瞬态** |
| [UL-session-log](terms/record-and-context.md#ul-session-log--会话日志--session-log) | 会话日志 | Session Log | **只增不改的流水账**，消息只是它的一部分 |
| [UL-message](terms/record-and-context.md#ul-message--消息--message) | 消息 | Message | 一条对话记录，**七种，按谁在说话分** |
| [UL-content-block](terms/record-and-context.md#ul-content-block--内容块--content-block) | 内容块 | Content Block | 一条消息装的是若干个块，**不是一段文本** |
| [UL-block-annotation](terms/record-and-context.md#ul-block-annotation--块标注--block-annotation) | 块标注 | Block Annotation | 给人看吗、给模型看吗——**标在块上不在消息上** |
| [UL-incremental-arrival](terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival) | 增量到达 | Incremental Arrival | 分次到达，**能长的只有四样**；半条不是消息 |
| [UL-context-assembly](terms/record-and-context.md#ul-context-assembly--上下文组装--context-assembly) | 上下文组装 | Context Assembly | 从日志拼出给某一方看的那份，**只读不写** |
| [UL-user-facing-context](terms/record-and-context.md#ul-user-facing-context--给用户看的上下文--user-facing-context) | 给用户看的上下文 | User-Facing Context | 两个动作，**方向相反、锚点不同** |
| [UL-model-facing-context](terms/record-and-context.md#ul-model-facing-context--给模型看的上下文--model-facing-context) | 给模型看的上下文 | Model-Facing Context | 两块分别组装，**只有第二块压得动** |
| [UL-system-prompt](terms/record-and-context.md#ul-system-prompt--系统提示词--system-prompt) | 系统提示词 | System Prompt | 实例存续期内恒定，**压缩碰不到它** |
| [UL-prefix-consistency](terms/record-and-context.md#ul-prefix-consistency--前缀一致--prefix-consistency) | 前缀一致 | Prefix Consistency | 开头那段与上一次逐字相同，**尽可能最大化** |
| [UL-context-compaction](terms/record-and-context.md#ul-context-compaction--上下文压缩--context-compaction) | 上下文压缩 | Context Compaction | **三个目标两两相冲**；能做两件、不能做两件 |
| [UL-compaction-record](terms/record-and-context.md#ul-compaction-record--压缩记录--compaction-record) | 压缩记录 | Compaction Record | `CompactionMessage`；**边界不是一条截断线** |

返回[统一语言入口](README.md)
