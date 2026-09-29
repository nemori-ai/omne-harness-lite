# 领域对象地图

> **这一页由生成器产出，没有人手写，也没有人手改；不得引为依据。**
> 要引用，引[领域对象条目](../domain_objects/objects.md)、[统一语言词条](../ubiquitous_language/index.md)或它们指向的产品正文。

- derived-from：`ubiquitous_language/terms/*.md`（形态、变体的父）· `domain_objects/objects.md` · `domain_objects/pending.md` · `product/PF-*/{README,design,flows}.md`（rev、指向词条的链接）
- 生成时间：2026-09-29
- 生成：`python tooling/src/domain_objects.py --root design --write`

对象 **48** 个，变体 **27** 个，形态未定的词条 **0** 个，待裁 **9** 项。

**按统一语言的分卷排**——分卷「按它回答什么问题」，是全链里唯一不随对象重新分解而搬家的维度。这不是能力边界，也不是限界上下文；那是系统架构设计的事。

「依据所在」「还有谁在讲」里标着**（草稿）**的 topic，front-matter 的 `status` 还是 `draft`——**那份产品正文尚未被接受**，建在它上面的对象骨架随时可能跟着变。

## Agent 运行时闭环

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [会话](../domain_objects/objects.md#ul-session--会话) | [UL-session](../ubiquitous_language/terms/agent-runtime-loop.md#ul-session--会话--session) | —（归属于[租户](../domain_objects/objects.md#ul-tenant--租户)：**创建那一刻捕获并持有的那个租户身份**，此后不随这个账号切换而变） | 主会话、子会话、作业会话 | PF-015 | 002 007 011 012 014 016 |
| [运行](../domain_objects/objects.md#ul-run--运行) | [UL-run](../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run) | [会话](../domain_objects/objects.md#ul-session--会话)（附着在恰好一个会话上） | — | PF-012 | 011 014 015 016 |
| [agent runtime](../domain_objects/objects.md#ul-agent-runtime--agent-runtime) | [UL-agent-runtime](../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) | [会话](../domain_objects/objects.md#ul-session--会话)；所推进的工作归 Run／尝试，Model／Tool runtime 不寄宿于它 | — | PF-012 | 011 015 |
| [装配清单](../domain_objects/objects.md#ul-assembly-manifest--装配清单) | [UL-assembly-manifest](../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest) | —（为恰好一个[会话](../domain_objects/objects.md#ul-session--会话)求值） | — | PF-004 | — |

## 能力与构成

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [资产](../domain_objects/objects.md#ul-asset--资产) | [UL-asset](../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset--资产--asset) | — | 技能、工具、MCP、连接件、拓展件、模态转换件、斜杠命令、插件、Agent 定义、官方件、自定义件 | PF-002 | 001 |
| [资产版本](../domain_objects/objects.md#ul-asset-version--资产版本) | [UL-asset-version](../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version) | [资产](../domain_objects/objects.md#ul-asset--资产)——每一份资产有自己独立的一条版本线 | — | PF-002 | 003 |
| [meta 能力](../domain_objects/objects.md#ul-meta-capability--meta-能力) | [UL-meta-capability](../ubiquitous_language/terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability) | 正文未述。只说每个 agent 装配起来之后，十三个各恒定占一个常驻槽位 | — | PF-007 | 002 |
| [模型档案](../domain_objects/objects.md#ul-model-profile--模型档案) | [UL-model-profile](../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) | —。建在出厂默认、组织或租户自己那一层；它不是资产，「用哪个模型」那项设置记的是路由名，同名的几条在范围链上按层取最具体一格的那一条（租户 > 组织 > 官方） | 官方档案、自建档案 | PF-013 | — |

## 流转与授权

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [复制通知](../domain_objects/objects.md#ul-copy-notice--复制通知) | [UL-copy-notice](../ubiquitous_language/terms/circulation-and-entitlement.md#ul-copy-notice--复制通知--copy-notice) | 正文未述。由源组织的超级管理员发起、指向目标组织；它指向的那份资产不存在了它随即过期，但正文没说它的寿命跟着哪一头的组织走 | — | PF-003 | — |
| [分享邀请](../domain_objects/objects.md#ul-sharing-invitation--分享邀请) | [UL-sharing-invitation](../ubiquitous_language/terms/circulation-and-entitlement.md#ul-sharing-invitation--分享邀请--sharing-invitation) | 正文未述。由分享方发起、指向接收方（一个组织，或一个租户）；它指向的那份资产不存在了它随即过期 | — | PF-003 | — |
| [分享关系](../domain_objects/objects.md#ul-sharing-relationship--分享关系) | [UL-sharing-relationship](../ubiquitous_language/terms/circulation-and-entitlement.md#ul-sharing-relationship--分享关系--sharing-relationship) | 正文未述。它建立在某层关系上——两个组织的隶属关系，或任一方作为租户的成员关系——那层关系断了它就结束，但正文没说它寄宿于分享方还是接收方 | — | PF-003 | — |

## 执行与收场

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行) | [UL-tool-execution](../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) | [会话](../domain_objects/objects.md#ul-session--会话)（前后台都是；它有自己独立的 runtime）——前台只说明当前步骤仍须等它的结果，[agent runtime](../domain_objects/objects.md#ul-agent-runtime--agent-runtime) 在场时通过句柄等待，那一笔记在 Run 里 | — | PF-006 | 012 014 |
| [一次模型调用](../domain_objects/objects.md#ul-model-call--一次模型调用) | [UL-model-call](../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) | [会话](../domain_objects/objects.md#ul-session--会话)；主流程、拓展件与压缩调用归所属 Run，旁路提问等 Run 外调用直接归会话。Agent runtime 只持有句柄，销毁不取消执行。**转换件本版不发起模型调用** | — | PF-013 | 011 012 014 |
| [模型响应体](../domain_objects/objects.md#ul-model-response--模型响应体) | [UL-model-response](../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response) | [会话日志](../domain_objects/objects.md#ul-session-log--会话日志)——它是一条效力为留痕的[记录条目](../domain_objects/objects.md#ul-record-entry--记录条目)的载荷，随日志留着；试过又失败的那几条不进方程、不进模型的上下文 | — | PF-013 | 000 |
| [附件](../domain_objects/objects.md#ul-attachment--附件) | [UL-attachment](../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment) | 产出它的那次[工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行)；实际存放在工具定义声明的那个存储里 | — | PF-006 | 016 |
| [被卸载的原始结果](../domain_objects/objects.md#ul-offloaded-result--被卸载的原始结果) | [UL-offloaded-result](../ubiquitous_language/terms/execution-and-outcome.md#ul-offloaded-result--被卸载的原始结果--offloaded-result) | 正文未述。它由一次[工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行)产出，却从来没进过[会话日志](../domain_objects/objects.md#ul-session-log--会话日志)——日志里只有那条占位；物理存放归属未述；原始全文持续可回取，不因卸载、压缩、Run 结束或会话归档过期 | — | PF-006 | 012 |
| [日程](../domain_objects/objects.md#ul-schedule--日程) | [UL-schedule](../ubiquitous_language/terms/execution-and-outcome.md#ul-schedule--日程--schedule) | 正文未述；系统或租户归属不等于生命周期宿主 | 系统日程 | PF-021 | — |
| [定时作业](../domain_objects/objects.md#ul-scheduled-job--定时作业) | [UL-scheduled-job](../ubiquitous_language/terms/execution-and-outcome.md#ul-scheduled-job--定时作业--scheduled-job) | 正文未述；与来源日程和执行会话的关联不等于随它们消失 | — | PF-021 | — |

## 落地与隔离

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [执行环境](../domain_objects/objects.md#ul-execution-environment--执行环境) | [UL-execution-environment](../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment--执行环境--execution-environment) | — | 沙箱、宿主机 | PF-005 | 004 |
| [沙箱实现](../domain_objects/objects.md#ul-sandbox-implementation--沙箱实现) | [UL-sandbox-implementation](../ubiquitous_language/terms/grounding-and-isolation.md#ul-sandbox-implementation--沙箱实现--sandbox-implementation) | 正文未述——正文只说它是**装配时可选装配**的，没说装配之后它的寿命跟着谁 | — | PF-005 | — |
| [无状态沙箱](../domain_objects/objects.md#ul-stateless-sandbox--无状态沙箱) | [UL-stateless-sandbox](../ubiquitous_language/terms/grounding-and-isolation.md#ul-stateless-sandbox--无状态沙箱--stateless-sandbox) | 一次[工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行) | — | PF-005 | — |
| [会话级沙箱](../domain_objects/objects.md#ul-session-sandbox--会话级沙箱) | [UL-session-sandbox](../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-sandbox--会话级沙箱--session-scoped-sandbox) | [会话](../domain_objects/objects.md#ul-session--会话) | — | PF-005 | 015 |
| [租户级沙箱](../domain_objects/objects.md#ul-tenant-sandbox--租户级沙箱) | [UL-tenant-sandbox](../ubiquitous_language/terms/grounding-and-isolation.md#ul-tenant-sandbox--租户级沙箱--tenant-scoped-sandbox) | [租户](../domain_objects/objects.md#ul-tenant--租户) | — | PF-005 | — |
| [沙箱数据](../domain_objects/objects.md#ul-sandbox-data--沙箱数据) | [UL-sandbox-data](../ubiquitous_language/terms/grounding-and-isolation.md#ul-sandbox-data--沙箱数据--sandbox-data) | [租户](../domain_objects/objects.md#ul-tenant--租户)（寿命上）；[租户级沙箱](../domain_objects/objects.md#ul-tenant-sandbox--租户级沙箱)（归属上） | — | PF-005 | — |
| [终端会话](../domain_objects/objects.md#ul-terminal-session--终端会话) | [UL-terminal-session](../ubiquitous_language/terms/grounding-and-isolation.md#ul-terminal-session--终端会话--terminal-session) | [执行环境](../domain_objects/objects.md#ul-execution-environment--执行环境)（环境销毁，里面的终端会话全没） | — | PF-007 | 016 |
| [会话据点](../domain_objects/objects.md#ul-session-base--会话据点) | [UL-session-base](../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base) | 正文未述——正文只给了一条消失路径「这一处的那份数据被清除」，没说身份里那个账号那一头没了它怎么办（账号本版无注销，那一问正文无从谈起）。**它不寄宿于任何进程**：「此刻有没有进程在服务它」与「它在不在」是两件事 | — | PF-016 | — |
| [治理中心](../domain_objects/objects.md#ul-governance-center--治理中心) | [UL-governance-center](../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center) | —（独立于任何人的机器。会话据点的身份里带着它，那是**据点依赖它**，不是它寄宿于谁） | — | PF-016 | 017 |

## 交互与派发

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [派发报告](../domain_objects/objects.md#ul-dispatch-report--派发报告) | [UL-dispatch-report](../ubiquitous_language/terms/interaction-and-dispatch.md#ul-dispatch-report--派发报告--dispatch-report) | 它所属的那次派发 | — | PF-007 | — |
| [决策卡片](../domain_objects/objects.md#ul-decision-card--决策卡片) | [UL-decision-card](../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) | [会话](../domain_objects/objects.md#ul-session--会话)（归属）；被它阻塞的是一次[工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行)或一次[运行](../domain_objects/objects.md#ul-run--运行) | — | PF-008 | — |
| [会话授权上下文](../domain_objects/objects.md#ul-session-authorization-context--会话授权上下文) | [UL-session-authorization-context](../ubiquitous_language/terms/interaction-and-dispatch.md#ul-session-authorization-context--会话授权上下文--session-authorization-context) | [会话](../domain_objects/objects.md#ul-session--会话)（与会话同寿，归档不丢，撤销归档后原样还在） | — | PF-007 | 015 |
| [授权表达](../domain_objects/objects.md#ul-authorization-expression--授权表达) | [UL-authorization-expression](../ubiquitous_language/terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression) | [会话授权上下文](../domain_objects/objects.md#ul-session-authorization-context--会话授权上下文)——作用域为「这一次」「本会话」的那些落在它里面；**作用域为「全局」的那一笔不落在这里**，它[落成租户层的权限设置值](../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度) | — | PF-007 | — |
| [入站到达](../domain_objects/objects.md#ul-inbound-arrival--入站到达) | [UL-inbound-arrival](../ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival) | [会话](../domain_objects/objects.md#ul-session--会话)（恰好一个；没有「飘着的到达」） | 控制指令、插队 | PF-014 | 015 |

## 记录与上下文

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [记录条目](../domain_objects/objects.md#ul-record-entry--记录条目) | [UL-record-entry](../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry) | 它声明的寿命宿主——首批取值是会话 · 运行 · 执行尝试 · agent runtime · 租户，默认会话，取值表未封板 | — | PF-000 | — |
| [会话日志](../domain_objects/objects.md#ul-session-log--会话日志) | [UL-session-log](../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log) | [会话](../domain_objects/objects.md#ul-session--会话)（归会话，不归运行） | — | PF-012 | 015 |
| [消息](../domain_objects/objects.md#ul-message--消息) | [UL-message](../ubiquitous_language/terms/record-and-context.md#ul-message--消息--message) | [会话日志](../domain_objects/objects.md#ul-session-log--会话日志)——**`SystemMessage` 除外**：它不落日志，每次组装时按装配时定下的成分现算，没有落盘之后的那一段生灭 | 中断提醒、占位消息、压缩记录 | PF-009 | 015 |
| [内容块](../domain_objects/objects.md#ul-content-block--内容块) | [UL-content-block](../ubiquitous_language/terms/record-and-context.md#ul-content-block--内容块--content-block) | [消息](../domain_objects/objects.md#ul-message--消息) | — | PF-009 | 014 |
| [待办条目](../domain_objects/objects.md#ul-todo-item--待办条目) | [UL-todo-item](../ubiquitous_language/terms/record-and-context.md#ul-todo-item--待办条目--todo-item) | [会话](../domain_objects/objects.md#ul-session--会话)——它活在一次会话里，不跨会话继承 | — | PF-007 | 015 |
| [业务日历](../domain_objects/objects.md#ul-business-calendar--业务日历) | [UL-business-calendar](../ubiquitous_language/terms/record-and-context.md#ul-business-calendar--业务日历--business-calendar) | 正文未述 | — | PF-021 | — |
| [业务日历版本](../domain_objects/objects.md#ul-business-calendar-version--业务日历版本) | [UL-business-calendar-version](../ubiquitous_language/terms/record-and-context.md#ul-business-calendar-version--业务日历版本--business-calendar-version) | 正文未述；所属业务日历可追溯，未规定随其退出而删除 | — | PF-021 | — |

## 作用域与求值

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [工作区](../domain_objects/objects.md#ul-workspace--工作区) | [UL-workspace](../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace) | 寿命宿主正文未述。Omne Host 托管工作区的治理所有者为一个[租户](../domain_objects/objects.md#ul-tenant--租户)，登记外部仓库的工作区则无 Omne 治理所有者、各接入租户均为参与者；治理归属及参与关系不据此成为寿命宿主 | Git 工作区 | PF-020 | 002 |
| [工作区实例](../domain_objects/objects.md#ul-workspace-instance--工作区实例) | [UL-workspace-instance](../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace-instance--工作区实例--workspace-instance) | 部署节点上的一次工作区装载，可接入用户已有的本地目录；它代表一个工作区，但不拥有工作区 | — | PF-020 | — |

## 主体与归属

| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |
|---|---|---|---|---|---|
| [账号](../domain_objects/objects.md#ul-account--账号) | [UL-account](../ubiquitous_language/terms/subjects-and-ownership.md#ul-account--账号--account) | — | — | PF-001 | — |
| [登录状态](../domain_objects/objects.md#ul-login-state--登录状态) | [UL-login-state](../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state) | [账号](../domain_objects/objects.md#ul-account--账号)——它是以这个账号的身份通过鉴权的一次登录。账号本版无注销，「账号没了它怎么办」正文无从谈起 | — | PF-001 | — |
| [组织](../domain_objects/objects.md#ul-organization--组织) | [UL-organization](../ubiquitous_language/terms/subjects-and-ownership.md#ul-organization--组织--organization) | — | 个人组织、团队组织 | PF-001 | 013 |
| [邀请](../domain_objects/objects.md#ul-invitation--邀请) | [UL-invitation](../ubiquitous_language/terms/subjects-and-ownership.md#ul-invitation--邀请--invitation) | [组织](../domain_objects/objects.md#ul-organization--组织)——**发出它的那个组织**：它不存在了，这份邀请随即自动过期。它指向一个账号，但那个账号在接受之前对它没有任何持有；个人组织发不出邀请 | — | PF-001 | — |
| [隶属请求](../domain_objects/objects.md#ul-affiliation-request--隶属请求) | [UL-affiliation-request](../ubiquitous_language/terms/subjects-and-ownership.md#ul-affiliation-request--隶属请求--affiliation-request) | 正文未述。由一个[组织](../domain_objects/objects.md#ul-organization--组织)的超级管理员发出、指向另一个组织；个人组织不参与隶属关系，既发不出也收不到 | — | PF-001 | — |
| [租户](../domain_objects/objects.md#ul-tenant--租户) | [UL-tenant](../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant) | —（身份由[组织](../domain_objects/objects.md#ul-organization--组织)与[账号](../domain_objects/objects.md#ul-account--账号)共同确定） | — | PF-001 | 011 013 |
| [租户—工作区关系](../domain_objects/objects.md#ul-tenant-workspace-relation--租户工作区关系) | [UL-tenant-workspace-relation](../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant-workspace-relation--租户工作区关系--tenantworkspace-relation) | 关联一个租户与一个工作区；独立宿主及租户端终止时的处理正文未述；中心托管工作区确认销毁后删除其全部租户关系，地址不可达不自动表示关系失效 | — | PF-020 | — |

## 谁寄宿在谁身上

从各条目「宿主」里的链接倒排出来。会换宿主的对象会出现在不止一行。

| 宿主 | 寄宿在它身上的 |
|---|---|
| [会话](../domain_objects/objects.md#ul-session--会话) | [运行](../domain_objects/objects.md#ul-run--运行)、[agent runtime](../domain_objects/objects.md#ul-agent-runtime--agent-runtime)、[装配清单](../domain_objects/objects.md#ul-assembly-manifest--装配清单)、[会话级沙箱](../domain_objects/objects.md#ul-session-sandbox--会话级沙箱)、[工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行)、[一次模型调用](../domain_objects/objects.md#ul-model-call--一次模型调用)、[决策卡片](../domain_objects/objects.md#ul-decision-card--决策卡片)、[会话授权上下文](../domain_objects/objects.md#ul-session-authorization-context--会话授权上下文)、[入站到达](../domain_objects/objects.md#ul-inbound-arrival--入站到达)、[会话日志](../domain_objects/objects.md#ul-session-log--会话日志)、[待办条目](../domain_objects/objects.md#ul-todo-item--待办条目) |
| [租户](../domain_objects/objects.md#ul-tenant--租户) | [工作区](../domain_objects/objects.md#ul-workspace--工作区)、[会话](../domain_objects/objects.md#ul-session--会话)、[租户级沙箱](../domain_objects/objects.md#ul-tenant-sandbox--租户级沙箱)、[沙箱数据](../domain_objects/objects.md#ul-sandbox-data--沙箱数据) |
| [工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行) | [无状态沙箱](../domain_objects/objects.md#ul-stateless-sandbox--无状态沙箱)、[附件](../domain_objects/objects.md#ul-attachment--附件)、[被卸载的原始结果](../domain_objects/objects.md#ul-offloaded-result--被卸载的原始结果)、[决策卡片](../domain_objects/objects.md#ul-decision-card--决策卡片) |
| [组织](../domain_objects/objects.md#ul-organization--组织) | [邀请](../domain_objects/objects.md#ul-invitation--邀请)、[隶属请求](../domain_objects/objects.md#ul-affiliation-request--隶属请求)、[租户](../domain_objects/objects.md#ul-tenant--租户) |
| [会话日志](../domain_objects/objects.md#ul-session-log--会话日志) | [模型响应体](../domain_objects/objects.md#ul-model-response--模型响应体)、[被卸载的原始结果](../domain_objects/objects.md#ul-offloaded-result--被卸载的原始结果)、[消息](../domain_objects/objects.md#ul-message--消息) |
| [账号](../domain_objects/objects.md#ul-account--账号) | [登录状态](../domain_objects/objects.md#ul-login-state--登录状态)、[租户](../domain_objects/objects.md#ul-tenant--租户) |
| [资产](../domain_objects/objects.md#ul-asset--资产) | [资产版本](../domain_objects/objects.md#ul-asset-version--资产版本) |
| [租户级沙箱](../domain_objects/objects.md#ul-tenant-sandbox--租户级沙箱) | [沙箱数据](../domain_objects/objects.md#ul-sandbox-data--沙箱数据) |
| [执行环境](../domain_objects/objects.md#ul-execution-environment--执行环境) | [终端会话](../domain_objects/objects.md#ul-terminal-session--终端会话) |
| [agent runtime](../domain_objects/objects.md#ul-agent-runtime--agent-runtime) | [工具执行](../domain_objects/objects.md#ul-tool-execution--工具执行) |
| [记录条目](../domain_objects/objects.md#ul-record-entry--记录条目) | [模型响应体](../domain_objects/objects.md#ul-model-response--模型响应体) |
| [运行](../domain_objects/objects.md#ul-run--运行) | [决策卡片](../domain_objects/objects.md#ul-decision-card--决策卡片) |
| [会话授权上下文](../domain_objects/objects.md#ul-session-authorization-context--会话授权上下文) | [授权表达](../domain_objects/objects.md#ul-authorization-expression--授权表达) |
| [消息](../domain_objects/objects.md#ul-message--消息) | [内容块](../domain_objects/objects.md#ul-content-block--内容块) |

## 还悬着的

### 形态未定的词条

无。

### 待裁

全文在 [pending.md](../domain_objects/pending.md)。

| 待裁项 | 谁来裁 |
|---|---|
| [存储](../domain_objects/pending.md#存储) | PF-006 的 owner |
| [跨会话的那个对象](../domain_objects/pending.md#跨会话的那个对象) | 产品负责人——它要不要做、归哪个 topic，都还没有人说过；已记入 PF-007 decisions「已知的来源问题」 |
| [runtime context 的一块](../domain_objects/pending.md#runtime-context-的一块) | PF-015 的 owner |
| [一次派发](../domain_objects/pending.md#一次派发) | 系统架构设计；PF-007 提供派发工作、一次报告和显式撤回的产品语义 |
| [agent 之间的消息](../domain_objects/pending.md#agent-之间的消息) | PF-007 与 PF-014 的 owner |
| [外部 harness 的 agent](../domain_objects/pending.md#外部-harness-的-agent) | PF-007 的 owner |
| [使用成本明细](../domain_objects/pending.md#使用成本明细) | 产品负责人——「观测与计量」这一块还没有 topic |
| [压缩策略](../domain_objects/pending.md#压缩策略) | PF-010 与 PF-015 的 owner |
| [通知发送与投递结果](../domain_objects/pending.md#通知发送与投递结果) | 系统架构与规格，按 PF-021 已定查询单位、租户边界和送达判据决定记录分解及身份；不得以技术重试改变通知条数或业务历史范围 |

### 没有任何产品正文链接到的对象词条

产品正文提到它却没有链到词条，「还有谁在讲」那一列就是空的——这一列的空，多半是链接稀疏，不是没人讲。

装配清单、资产、资产版本、模型档案、复制通知、分享邀请、分享关系、模型响应体、被卸载的原始结果、执行环境、沙箱实现、无状态沙箱、租户级沙箱、沙箱数据、派发报告、决策卡片、会话授权上下文、记录条目、待办条目、工作区、工作区实例、账号、登录状态、邀请、隶属请求、租户—工作区关系。
