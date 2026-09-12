---
kind: research
id: R-personal-edition-requirement-gap-audit
scope: 个人版与 SYS/PF-001 至 PF-016 的固定基线比对；保留原建议及本轮用户对 GAP 的取舍
---

# 个人版产品要求的本质比对与 GAP 处置

[研究索引](README.md) · [当前产品要求](../requirements/product/README.md) · [系统目标](../requirements/system/README.md)

2026-09-12 用户要求：先完成动态装载、制品管理要求，再与
`omne-next/omne_harness_product_personal_edition` 作能力层面的比对，识别尚未记录
的要求并提交确认。随后新增的在线插件开发 PF-016 也纳入本次比对。

**原审计候选与用户后续处置分开保留。** GAP 当前范围以下表及链接的需求正文
为准；原建议不是新增确认依据。SUP-01～06 与 ENG-01 仍待确认，本轮没有
整包接受。需求落盘不改变架构或规格接受状态。SYS-CONTINUITY 的整体继承方向不作为
“每一个具体能力已经落盘”的证据；同样，未建模、未实现与未记录是不同缺口。

## 2026-09-12 用户处置

| 原编号 | 本轮裁定与唯一需求归属 |
|---|---|
| GAP-01 | **重新定义并拆为两项**：[PF-017](../requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md) Agent 跨会话历史状态检索及后台通信协调；[PF-018](../requirements/product/agent/PF-018-selfound-knowledge-and-cognition-use.md) 使用 omne-selfound，主要为 Engram/Cognition。原建议的全部自动记忆产品行为不随名称一并接受 |
| GAP-02 | **并入 PF-017** 的跨会话检索/通信部分，不另建用户因果面板要求 |
| GAP-03 | **既有能力组合**：[PF-013.C11](../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#状态权限与跨端一致性) 补充按发起者等条件过滤检索，结合 Session/Run 生命周期和 [PF-011](../requirements/product/agent/PF-011-future-planning-calendars-and-reminders.md) 面向用户的日程管理；不另立自主总控 PF |
| GAP-04 | **扩展租户管理**：[PF-019](../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md) 维护订阅、额度/用量、账单、预算及逐 Agent Step 金额，[PF-010](../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) 作管理入口引用 |
| GAP-05 | **本轮暂不纳入**完整安装/认领/运维产品旅程；不撤销既有部署、运行和恢复要求 |
| GAP-06 | **本轮暂不纳入**用户备份/恢复产品能力；不撤销已有持久状态或制品保存要求 |
| GAP-07 | **结合 Cordis 细化**为 [PF-020](../requirements/product/environment/PF-020-dependency-availability-and-degradation.md)：按装配及必要/可选依赖判断局部可用性、诚实降级与恢复，保留 OpenRouter 约束 |
| GAP-08 | **纳入并结合 Cordis 细化**为 [PF-021](../requirements/product/environment/PF-021-multi-machine-deployment-and-assembly.md)：机器接入/撤回、工作落点和逻辑装配与物理部署的区别；首次完整交付仍为单机 |
| GAP-09 | **新增 Agent 多模态输出** [PF-022](../requirements/product/agent/PF-022-multimodal-response-and-output.md)，主维度智能体；包含模型原生/工具产出、流式回复和受权原件交付 |

同轮另增 [PF-023](../requirements/product/user/PF-023-session-model-selection-and-continuity.md)
会话级合法模型切换后继续新一轮，以及
[SYS-OBSERVABILITY](../requirements/system/observability-and-logging.md) 工程全链路
可观测与日志完备；后者不等于自动接受原 GAP-02 的用户披露方案或 ENG-01 的
CI/发布要求。补充事实、来源版本和推导边界见[本轮来源核对](requirements-gap-resolution-sources.md)。

## 比对基线与方法

| 一侧 | 固定范围 |
|---|---|
| 来源 | `omne-next` 提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；[能力地图][map]登记的 9 份正式能力要求（均 Accepted · committed-future），含正文中的后续 amendment；另有 1 份 Accepted · current 工程约束 |
| 本项目 | `docs/system-goals` 提交 `2303cfc` 的 `docs/requirements/system/` 及 PF-001～PF-016；索引、来源解释和待设计项辅助判断，候选架构不冒充已确认产品承诺 |
| 辅查 | [Provider request 索引][requests]的 37 项请求映射、requested-outcome 及重点请求 R12/R27/R28/R31/R35 的内容或处置；用于识别遗漏含义，不把 API、缺陷、排期或 provider 边界逐条搬成产品能力 |

逐项比较用户能达到的结果、管理权、生命周期、失败与恢复边界。名称不同但
含义已覆盖的合并映射；已有原子机制但缺完整用户结果的记为部分覆盖；仅有
宽泛目标而缺相应能力的记为未明确记录。界面样式、库/API、固定默认值、旧工程
路径和实现缺陷不计作新的能力要求。此处没有评估本项目实现完成度。

## 九项能力的逐项结果（原审计基线）

| 来源能力及条款 | 当前本质覆盖 | 尚缺什么 / 本页去向 |
|---|---|---|
| [持久可解释记忆][memory] PEK-1～7 | SYS-LONG-RUNNING/SYS-ALIGNMENT 给出方向；PF-010 管理信息资产，PF-015 保存工作材料 | **未明确记录**：自动形成并跨会话使用记忆、检索及逐层依据、受治理纠正、有效性与不确定性。GAP-01；普通历史/制品保存不等于记忆 |
| [可见与可撤授权][visibility] PEV-1～8 | PF-006、PF-010 已覆盖授权查看/撤销与当前生效；PF-003 观察单工具，PF-005.C10 对照批准与动作；已有多项真实性、脱敏边界 | **部分覆盖**：跨操作使用历史、从任一回复进入完整因果依据、只读追溯、追加式纠正与分级披露仍未统一承诺。GAP-02；不重提授权 CRUD |
| [主动调查与告知][proactive] PEP-1～7 | PF-002.C8/C9 感知与触发归因；PF-005/007/008 请求及决定；PF-011.C10 耐久通知、送达和免打扰 | **部分覆盖**：全部自主活动的可见总控及停止新触发 GAP-03；货币用量/预算 GAP-04；调查依据归 GAP-02；通知管理细化 SUP-06 |
| [支持的产品生命周期][lifecycle] PE-1～9 | SYS-DEPLOY 单机首版及未来扩展，SYS-RUNTIME-CONTINUITY 状态接续，PF-001 租户，PF-013 会话旅程 | **部分覆盖**：面向最终用户的安装、显式认领、登录、配置、启停、升级/重装与诊断 GAP-05；可核验备份恢复 GAP-06；断公网运行边界 GAP-07。PE-7 的 Session 管理已覆盖，不导入固定 Gateway/SSE/loopback 实现 |
| [多机器工作放置][machines] PEM-1～6，3a/3b amendment | SYS-DEPLOY 未来可扩展；PF-012 可辨执行目标；PF-013 可辨 Session/Run | **部分覆盖**：显式接入/撤回其他自有机器、名册与资格/容量、执行落点 GAP-08；PF-012 的“操作哪台机器”不等于整个 Agent 工作实际运行落点 |
| [对话委托][delegation] PED-1～11 | PF-003/012/013 执行和控制；PF-005.C10、PF-007、PF-008 自包含请求及批准约束；PF-009.C1/C3/C4 多模态输入与附件 | **大部分覆盖**：对话与可视管理同一事实 SUP-01；整条回复的流式交付与非文本结果原件 GAP-09；无进展/拥堵 SUP-05；可委托性依赖真实就绪归 GAP-05。输入与输出不能混算 |
| [定时信源简报][briefing] PEB-1～10 | PF-002 信源安装/供给/状态；PF-011 时间规则、草稿转正、原子改期、仅提醒、通知路径、错过与异常；PF-004 定时派发 | **原子能力已覆盖，结果组织部分缺失**：每条简报到具体供给、当时内容回看、空/失败/错过的简报结果 SUP-02；不新增第二套日程或 Connector |
| [长期事务陪跑][affair] PEL-1～7 | PF-011.C1/C2/C5 已含结果驱动的非线性重规划、分阶段继续、自唤醒，C8～11 含检查点管理及历史；PF-015 可保存工作材料 | **规划机制已覆盖，事务整体结果部分缺失**：有终点的目标、步骤依赖、整体进度/追问、终结与一并撤下 SUP-03；不把全部日历/自唤醒重复记为新增 |
| [集中批阅][review] PER-1～6 | PF-007.C6/C7 已完整纳入暂行资格、非阻塞、超时不决定、撤销级联与按类回传；PF-008 集中呈现及直接作答 | **核心机制已覆盖**：PF-008.C4 目前只说“某类支持批量时逐项结算”，尚未承诺必须提供该批量能力；加上完整待办可达、预览和依赖阅读 SUP-04。无需再建独立决定池 |

## 原审计能力候选（按基线保留）

以下保留提交用户时的建议含义，**当前确认范围以上方处置表为准**；“建议”
不表示还需对已经裁定的 GAP 再确认，也不把已排除项重新放回产品要求。

### GAP-01：自动积累、跨会话使用且可解释可纠正的长期记忆

建议主维度 **智能体**，副维度用户。Agent 随正常协作保留用户偏好、背景、
决策与相关知识，在新会话中实际使用；用户可检索记忆，逐层查看支持观察、
来源快照及时刻，辨认不确定、失效和后继版本，并通过受治理路径纠正错误。
记忆不可用与确实没有记忆分别呈现。依据：[PEK-1～7][memory]。

缺口不由“有会话历史”“支持文件存储”或“资产可管理”覆盖。不沿用来源必须
仓外 cognition provider 的部署边界；直接编辑/删除、遗忘/擦除、导出和跨租户
记忆也不能由本候选自动推导。建议成为独立 PF。

### GAP-02：用户可追问的使用历史与回答因果依据

建议主维度 **用户**，副维度智能体、环境。用户可查询实际能力使用与结果，
从回复沿输入、供给、工具、授权和工作步骤追溯到已有证据，分层展开并复制
受控关联坐标；查看不重执行，证据缺失明确显示，修正追加而不悄悄改写过去。
秘密值脱敏，来源与时刻可辨。依据：[PEV-3～8][visibility]、[PEP-7][proactive]。

PF-003 目前限单工具，PF-005 限批准动作对照；缺的是完整链路。这里指可记录
的事件和证据，不要求暴露模型隐私推理过程，不承诺任意模型都能给出其内部
决策证明。数据擦除仍需独立治理。建议独立 PF，引用既有局部观察要求。

### GAP-03：自主活动的统一总控

建议主维度 **用户**。用户能查看进行中/待触发的自主工作及原因，停用单项，
并一键暂停本权限范围内的全部自主新活动；在途工作有真实结局。依据：
[PEP-1 及 Failure semantics][proactive]。PF-013 的单 Session 强停、PF-002 的
信源暂停和 PF-011 的逐日程管理都不等于跨会话的自主活动总控。暂停新触发
与中断既有 Run 保留不同效果，组织范围和管理资格沿 PF-001/PF-010 定义。

### GAP-04：用量、开销及预算治理

建议主维度 **用户**，副维度智能体。用户可看用量/花费、设置预算及触顶策略，
区分已结算、估计、预留和未知；触顶明确限制后续自主开销并保留用户主动协作
入口。依据：[PEP-5][proactive]、[R12 的用量/预算请求][budget]。

已有“执行预算”“容量满拒绝”不是货币预算。需要进一步明确主动对话的保留
范围，以及硬预算与仍需付费的主动对话之间如何分配；不能宣称花费绝不超限
又允许无限付费对话。计量延迟、在途调用与停止新接纳分开。建议独立 PF，
不采用来源产品侧临时记账或固定金额/统计窗口。

### GAP-05：可安装、可认领、可运维的完整产品

建议主维度 **用户**，副维度环境。最终用户从版本化发布物完成安装和显式
认领，取得稳定身份/个人租户及默认 Agent，完成登录、续期/退出；有统一配置、
启动、停止、重启、更新/重装及移除旅程，非破坏操作保留已承诺数据，卸载与
数据清除分开。初始化重试/崩溃恢复不重复创建身份。依据：[PE-1～5/7][lifecycle]。

各发布版本说明适配/支持范围；就绪、部分不可用、配置/迁移/认证失败和进程
存活有实际区别，用户可定位需要修复的部分并取得不泄密的诊断入口；局部依赖
不可用不能伪报整体就绪。[PED-6][delegation] 补充具体工作可委托性。

SYS-RUNTIME-CONTINUITY 已有恢复目标，缺的是可独立安装与操作的用户旅程。
不采用 Electron、Compose、macOS、单一 Gateway、首发仅个人租户等旧产品选择，
也不引入后台自动下载/安装、零停机升级或全部 OS 同时支持的隐含承诺。

### GAP-06：用户可操作且真实性可核验的备份/恢复

建议主维度 **用户**，副维度环境。提供明确范围的备份及恢复旅程，可取出、
重新交入归档；恢复前核对来源和完整性，区分可核验未变、已变、无法核验、
非本安装来源，验证不通过时在破坏现有数据前拒绝。跨安装归档不能伪装成本机
可信归档。依据：[PE-4/8/9][lifecycle]。

运行时重建、制品保存和系统备份不是同一承诺；PF-015 没有拥有全系统归档。
建议独立 PF 或产品运维的专项条目，不采用具体密码学、密钥托管、归档格式，
不扩张为静态加密、异地备份或 RPO/RTO 数值。

### GAP-07：断公网时局部能力继续工作、远端依赖诚实降级

建议主维度 **环境**。在主机供电及本地服务连通仍成立时，公网中断不应无故
使本地登录、历史、运行状态、管理、已有日历和通知读取失效；依赖公网的模型、
信源和送达显示不可用而不伪造成功。依据：[PE-6][lifecycle] 及各能力的离线段。

**必须按本项目约束调整。** SYS-LLM 要求所有模型请求统一经 OpenRouter，
因此来源“所有依赖含模型都本地化后，离线仍能运行完整 Agent”的变体不能
直接继承。建议确认本地读面/不需模型的能力及局部降级，把完全离线推理留作
另一个需要明确处理 SYS-LLM 的选择。本候选不改变该已确认约束，也不承诺
断电、完全网络分区或离线多主写入。

### GAP-08：多机器接入、撤回及实际工作落点

建议主维度 **环境**，副维度用户、智能体。用户可显式接入自己的其他机器，
查看名册、有效信任、工作资格/容量和状态，撤回其承接新工作的资格，查看
工作实际执行落点及在途结果。信任设备、执行节点、可操作资源的状态和撤回
效果不能互相冒充。依据：[PEM-1～6 与 3a/3b][machines]。

这是比“未来可分布式扩展”的结构目标更具体的产品能力。建议列入未来产品
范围，**保持 SYS-DEPLOY 第一完整版本为单机**。来源自身在 v1 推迟机器落点
呈现，等待公开读面，首个 profile 的外部节点仍实验性；本页不把原文读成
多机已经受支持，也不要求本项目复制其接口造成的延期条件。高可用、自动故障
转移、第三方 harness 委派与组织共享设备不由本候选自动确认。

### GAP-09：回复的流式交付与多模态结果原件

建议主维度 **用户**，副维度智能体。用户在运行中收到实际逐步生成的回复；
终态、晚到或重连读回与同一耐久回复一致。生成的图片/文件作为可打开、保存、
之后从历史取回的原件交付，文本与非文本保序，权限同历史读取。依据：
[PED-11][delegation]、[R35 的既有权威覆盖处置][reply]。

PF-009 明确聚焦输入，PF-003 的流是工具内部帧，PF-015 是工作材料存储和
加载；都不能替代用户收到多模态答案和完整回复流。建议扩展对话输出要求，
不指定 SSE、块字段和转码，也不从来源推广到音视频生成的全部范围。

## 既有能力的待确认补充

以下有明确产品差异，但不宜再当作全新基础机制；确认后优先补充现有 PF，
条目体量确需独立时再保持单一正文并引用。

| 编号 | 建议补充及当前缺口 | 来源 / 建议归属 |
|---|---|---|
| **SUP-01** | 自然语言对话是委托、配置和审批的一等入口，与可视管理操作同一事实；行动前用户可读懂计划及影响。现有 PF-010 承诺管理，尚未普遍承诺对话可达及双入口一致 | [PED-1][delegation]、[PEB-1/2、AC-1][briefing]；补 PF-010/相关管理条目，不暗示 Agent 可代用户完成专属同意 |
| **SUP-02** | 关注信源后形成可回看的简报，每个条目指向具体供给和时刻，综合判断与原始事实分开；区分无新增、源失败、错过，按通知偏好呈现。已具备供给/调度/通知，缺的是这份结果的可追问组织 | [PEB-3/5][briefing]；补 PF-002/PF-011 的组合场景，详细因果规则引用 GAP-02，不新增调度器 |
| **SUP-03** | 多周/月事务作为有终点的整体：阶段及依赖经用户确认，能追问整体进度/依据，看到为何调整计划，完成或撤下整件事使其未来检查点收口。已有非线性规划与自唤醒，尚无完整目标/阶段管理结果 | [PEL-1/3/4/7][affair]；补 PF-011 的整体事务层次，结构及进度知识不等于简单日程列表 |
| **SUP-04** | 暂行批阅明确支持按类/事务/选择集批量准驳，每项独立结算；可查看产物预览与依赖链；所有仍待答项都可到达，不因列表容量静默隐藏。当前批量仅是条件约束而非支持承诺 | [PER-3/4/6][review]、[R31 既有权威覆盖][backlog]；补 PF-008，引用 PF-007 的暂行后果，不重建池 |
| **SUP-05** | 无进展、失败/部分完成和审批累积造成的拥堵可见；能以暂停新自主派发缓解，不丢弃或代答已有请求。来源 R27 另提出重试中、单工具失败与整轮失败分层；精确重试标记仍属 draft 请求 | [PED-3/4/5][delegation]、[R27][anomaly]；补 PF-013/PF-003，拥堵总控关联 GAP-03，精确分层不伪写为来源已接受新承诺 |
| **SUP-06** | 耐久通知有可管理的未读/已读、检索、回到来源；投递失败不丢通知，已读不结算决定。PF-011.C10 已有主要耐久与送达机制，但未显式承诺通知的检索和用户读状态管理 | [PEP-3][proactive]；补 PF-011 的通用通知部分，PF-008 继续拥有决定 |

## 工程约束另行确认

**ENG-01：按受影响成员及共享边界运行检查，保持发布独立与成本可见。** 来源
[PECI-1～10 及 amendment][ci]要求仅产品改动不运行无关项目 CI，真实共享边界
覆盖双方检查，未知路径不能漏检；轻量 PR 检查与昂贵资格/发布检查分开，发布
响应明确范围。本项目[验证规范](../maintenance/verification.md)已有各类检查，
尚未定义这一按变更归属的自动 CI/发布约束。

它属于维护/交付要求，建议单独确认其原则；不作为用户产品 PF，不复制源 Python
workspace 排除、路径白名单、固定 job 数量/超时、全局标签或发布流程批准机制。

## 差异与剩余确认范围

GAP-01～09 已按本轮裁定分别落盘、合并或暂不纳入。SUP-01～06 和 ENG-01
尚未得到逐项裁定；新 PF-018 的认知/目标使用不等于已接受 SUP-03 的全部
用户事务管理旅程，SYS-OBSERVABILITY 也不代替 SUP-05 的具体用户呈现要求。

以下不作为缺口：既有三类 HITL 及暂行撤销、工具前后台及控制、sub-agent、
输入附件、租户与资产管理、日历及非线性安排，均有对应正文；PF-014～16 的
开发/装载/制品扩展也不因个人版没有同名条目而撤回。

来源的个人单 owner、首发无组织管理，不能覆盖本项目已明确的多组织租户
能力；来源提醒/执行互斥不能覆盖 PF-011 的“和/或”；本机未隔离使用的旧
未决项不能撤回 PF-012；固定架构/技术选择、例子中的具体信源与事务模板、
provider 暂时缺接口、原系统缺陷及未经接受的扩张，均不转成这里的新产品要求。

## 核对记录

九份能力正文（含修订）、工程约束及能力地图均按固定提交读取；已读的来源文件
与本地 Git blob 逐字节核对。Provider request 索引部分摘要仍使用早期 draft
措辞，而 R31/R35 正文已有后续 receipt；本页采用具体文件的处置，R27 保留 draft。
没有把来源“Accepted”转换成实现/支持状态，没有运行原产品验收。本页是可审阅
差异清单，不是完整 omne-next 全仓能力继承审计。原审计没有检索仓外 cognition；
后续本轮补充读取了 omne-selfound 的要求和概览，具体范围归[来源核对](requirements-gap-resolution-sources.md)。

[map]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capability-map.md
[requests]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/provider-requests/omne_harness/README.md
[memory]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-durable-explainable-memory.md
[visibility]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-visible-and-revocable-agent-authorization.md
[proactive]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-proactive-investigation-and-notice.md
[lifecycle]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-supported-product-lifecycle.md
[machines]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-multi-machine-work-placement.md
[delegation]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-consented-task-delegation.md
[briefing]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-scheduled-source-briefing.md
[affair]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-long-horizon-affair-stewardship.md
[review]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-owner-review-desk.md
[ci]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/constraints/independent-product-ci-and-release-automation.md
[budget]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/provider-requests/omne_harness/owner-governed-spend-visibility-and-budget.md
[reply]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/provider-requests/omne_harness/reply-reaches-the-live-stream-as-it-is-produced.md
[backlog]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/provider-requests/omne_harness/whole-decision-backlog-and-only-what-still-awaits-the-owner.md
[anomaly]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/provider-requests/omne_harness/tiered-run-anomaly-perception-on-the-published-faces.md
