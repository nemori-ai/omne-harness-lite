---
kind: research
id: R-requirements-gap-resolution-sources
scope: GAP 取舍后跨会话、selfound、租户财务、Cordis 可用性与部署、输出、模型切换和观测的来源解释
---

# GAP 取舍与新增要求的来源核对

[研究索引](README.md) · [原始查漏与用户处置](personal-edition-requirement-gap-audit.md) · [产品要求](../requirements/product/README.md)

2026-09-12 用户重新定义 GAP-1～4，暂不纳入 GAP-5/6，要求结合 Cordis 细化
GAP-7/8，接受多模态输出，并新增会话合法模型切换和工程全链路可观测要求。
本页记录为这次落盘采用的事实和推导，不另作确认依据，不选择具体系统架构。

## 固定来源与证据范围

| 来源 | 采用版本与读取范围 |
|---|---|
| omne-next | `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；以下 Harness 要求、明确修订及观测设计，个人版候选保留[原审计](personal-edition-requirement-gap-audit.md)的基线 |
| omne-selfound | `a425e08eb032092fcecdf2e801b562dd89ae48aa`；仓库入口、六份独立要求与 Cognition 概览。上游要求区分 current/committed-future，所读条目 realization 均为 unassessed |
| DeepSeek Harness / Cordis | `c291e7961a515f6d7af9304e7fd1d257929aef26`；官方 Services、Composition and HMR 教程，沿[此前机制核对](agent-developed-cordis-plugin-sources.md)已固定的来源，不把 master 当稳定版本 |

本轮核对了 16 份 omne-next/selfound 文件与固定提交的 Git blob，逐字节一致；
Cordis 两篇复用此前对官方树/blob 核验的副本。这里是文档及静态机制证据，没有
运行上游产品验收或跨机/断网实验，也没有证明来源实现已满足全部要求。

## 跨会话历史、通信与自主工作管理

用户直接拥有新的定义：[PF-017](../requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md)
的 Agent 跨会话检索和后台通信成立，不需要从旧产品的记忆 UI 或用户因果
面板反推。GAP-2 并入此项；没有把原 GAP-1 的“自动积累全部协作记忆”或
GAP-2 的独立终端用户全链路面板静默加入。

来源[会话目录与生命周期][sessions]限定根 `user_chat`，子会话由派发关系
发现；这是来源自己的目录边界。用户这次明确要按用户/Agent 发起过滤会话，
故 [PF-013.C11](../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#状态权限与跨端一致性)
扩展获准工作发现范围，发起者、owner 和租户分别表达。GAP-3 按用户裁定组合
既有生命周期、过滤检索与面向用户的 PF-011 日程管理，不另立全局自主总控。

本次所读来源没有证明任意对等会话后台通信已经实现；其受理、寻址、唤醒和
恢复协议仍需本项目建模。父子 Sub-agent 监督也不能代替用户新定义的全部范围。

## omne-selfound：消费知识与认知，不接管执行权威

[仓库入口][selfound]区分 Engram 的可编程知识底座与 Cognition 的统一认知
含义；旧 `omne_engram/README.md` 是占位入口，本轮不以它作为能力清单。
新 [PF-018](../requirements/product/agent/PF-018-selfound-knowledge-and-cognition-use.md)
消费以下边界：

| 来源 | 可用于减少歧义的含义 |
|---|---|
| [REQ-SELF-003][engram-mutation]，current | 持久知识变更必须通过显式准入，保留归因与审计，拒绝不能部分改变活动状态；通过知识治理不证明认知为真 |
| [REQ-SELF-008][engram-readiness]，current | 查询能力、来源、就绪和新鲜度可检查；可选后端故障可局部降级，缺失/失效不能伪报成功空结果 |
| [REQ-SELF-001][cognition-grounding]，current | 持久认知保留可追溯证据及有效性，支撑失效或重算未完成须可辨，不能只保存无法解释的结论 |
| [REQ-SELF-020][cognition-surface]，current | 公开查询带租户/领域约束，效果操作有封闭语义边界；不能用通用图写代理绕过认知不变量。其五个动作名不在本轮直接变成本项目 API |
| [REQ-SELF-019][cognition-runtime]，current | 目标历史和评估不拥有 schedule/dispatch/run/retry/cancel/completion 真相，实际执行以外部 runtime 为准 |
| [REQ-SELF-021][cognition-self]，committed-future | Agent 自我认知遵循同样证据和修订规则，但自我相信具有某能力不授予权限、安装工具或证明运行时可用 |

[Cognition 概览][cognition-overview]是 current intended shape，非交付证明。
其中四路 Agent surface 与更晚要求的公开边界应按上游各自作用域处理，本轮
只采用“公开受治理查询/语义操作、执行权威仍在 harness”的共同含义；不将
内部 Engram Domain、Python 包布局或草稿工具名直接作为 TS 运行时契约。
直接接入哪些精确版本、如何映射身份/租户以及实际可用操作，留待接入设计。

## 租户财务和逐 Step 金额

来源[计量资源与花费预算][budget]为 Accepted · committed-future：区分权限、
容量和预算，支持 observe-only/soft/hard；区分实际、估算、预留和未知，硬预算
限制新计费准入而不因普通预算变更强杀已开始调用。重试、恢复、子 Agent 不能
逃逸预算，供应方真实重复收费与本系统重复记账分别判断。

该来源**明确不承诺 billing/invoice/payment 产品**，其归因清单也不能代替
逐 Agent Step 的金额要求。订阅额度、用量、账单及逐 Step 统计来自本轮用户，
由 [PF-019](../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md)
拥有，PF-010 引用其管理入口。来源要求披露 late metering 的可验证超额范围；
本项目在无法证明上界时明确未知，不将预算模式名称作为严格零超支的证明。

## Cordis 视角下的局部可用性、部署与装配

[Services][cordis-services]解释：必要服务通过 `inject` 决定消费者能否装载，
缺失时等待；提供者消失会卸载依赖者，服务返回可再装载。可选依赖可以在使用
处探测。[Composition and HMR][cordis-composition]进一步给出插件条目身份、
组与服务隔离、配置变更及卸载后重载，并展示缺依赖时 PENDING 可能没有日志。

从这些**本地运行时机制**到本项目产品要求仍有以下推导义务：

- PF-020 按必要/可选依赖限定受影响范围，并将等待和失败变为可解释状态。
  教程中的服务存在不是任意远端端点健康的保证；远端断连而本地代理仍注册，
  需要实际就绪/调用结果来表达，不能声称 Cordis 自动处理了网络故障。
- PF-021 区分逻辑插件/服务装配与机器/进程部署。Context、作用域和同名服务
  隔离不自动提供可信设备身份、跨租户授权、RPC 或工作放置；这些是本项目
  为多机能力应定义的边界，而不是上游已经提供的集群功能。
- 插件变更可影响其依赖者，卸载/重载不等于迁移所有在途调用；持久部署意图、
  状态恢复与后台工作接续分别引用 PF-016、SYS-RUNTIME-CONTINUITY、PF-003。

来源[按部署形态声明断连与降级][partition]区分公网、客户端、节点到权威方、
子系统间断边；来源[节点工作资格与兼容性][eligibility]区分信任、可承接、
针对某项工作的完整兼容与实际放置。采用这些可观察含义，不继承其固定 lease、
fleet 角色、首版同节点绑定或旧产品自包含离线模型的配置。SYS-LLM 仍要求
所有模型请求经 OpenRouter，SYS-DEPLOY 首次完整交付仍为单机。

## 多模态回复及模型切换

[模型原生多模态回复][native-output]为 Accepted · current，明确图片/音频
可直接从模型响应到用户，工具生成路径并存；流式交付不能无声丢媒体，两种
来源同样受租户/附件治理。来源没有因此承诺视频直出和音频时间轴；其旧 SDK
接缝、开关或 ADR 的解除属于来源工程，不是本项目需复制的结构。
[PF-022](../requirements/product/agent/PF-022-multimodal-response-and-output.md)
合并本轮 Agent 多模态输出方向和原 GAP-9 的流式/原件交付含义。

[会话模型选择][model-switch]须读取全部 amendment：

| 版本内条款 | 本轮采用的含义 |
|---|---|
| 原正文 AC-1～9 | 会话选择 > 用户偏好 > 定义默认；选择不外溢；模态兼容来自耐久、可重建事实，派生会话按派生点判断，不按模型档位高低决定 |
| 09-09 AC-10～12 | 选择前能看到当前候选及理由，候选与执行判据一致。并发事实变更需要重新判定；来源线性读取成本不直接变成本轮实现方案 |
| 09-09 AC-13 | 历史确有对应模态而目标能力未知时保守拒绝，与已知不支持分别呈现；这不自动变成每次模型调用的相同拒绝规则 |
| 09-10 AC-14～16 | 切换时按窗口比例检查，超限先压缩一次，保留原历史；压后仍超限拒绝且模型选择不变。窗口未知不按已知超限拒绝。该 amendment 已裁定早期留白并修正自动压缩立场 |
| 09-10 AC-17 | 每条实际 AI 回复保留生成模型标识，不能用当前会话选择改写历史 |

[PF-023](../requirements/product/user/PF-023-session-model-selection-and-continuity.md)
拥有本项目下一轮切换行为。模态安全、窗口处置、当前授权/供给和费用准入分别
成立；压缩不能借机越过模态门。Run 并发、压缩费用及失败的精确协议仍未定案。

## 工程全链路观测

来源[按 Session 的授权轨迹读取][trace]承诺在获准范围识别接受、主要阶段、
未完成、成功和失败；后续 amendment 增加 owner 读取自己 Session，但没有
批准全部原始内容披露。[观测设计][observability]含后续订正与 stub，区分
业务轨迹、通用日志/指标/追踪，并区分流程关联、因果与运维 trace；其中具体
EventLog 投影、事件集和技术栈是设计，不是完整已交付需求。

用户本轮直接提出的 [SYS-OBSERVABILITY](../requirements/system/observability-and-logging.md)
范围覆盖工程全链路，也包含无 Session 的系统活动。采用可定位的状态、失败、
因果和覆盖缺口含义；不从旧窄 Session 读面缩窄新要求，不用“日志完备”推导
无限原始内容保留、默认跨租户可读或模型内部推理的可获得性。

[sessions]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-user-chat-session-creation-directory-and-lifecycle-management.md
[selfound]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/README.md
[engram-mutation]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/requirements/REQ-SELF-003-governed-durable-knowledge-mutation.md
[engram-readiness]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/requirements/REQ-SELF-008-truthful-query-capability-introspection.md
[cognition-grounding]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/requirements/REQ-SELF-001-evidence-grounded-durable-cognition.md
[cognition-surface]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/requirements/REQ-SELF-020-bounded-cognition-published-surface.md
[cognition-runtime]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/requirements/REQ-SELF-019-objective-history-runtime-truth-boundary.md
[cognition-self]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/requirements/REQ-SELF-021-grounded-agent-self-cognition.md
[cognition-overview]: https://github.com/nemori-ai/omne-selfound/blob/a425e08eb032092fcecdf2e801b562dd89ae48aa/omne_cognition/design_docs/overview.md
[budget]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/owner-governed-metered-resource-and-spend-budget.md
[partition]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/constraints/profile-scoped-deployment-and-partition-aware-degradation.md
[eligibility]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-fleet-node-service-eligibility-and-workload-compatibility.md
[cordis-services]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md
[cordis-composition]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/06-composition-and-hmr.md
[native-output]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/northbound-model-native-multimodal-reply-content.md
[model-switch]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/durable-session-model-selection-and-non-degrading-continuity.md
[trace]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/operations-authorized-per-session-agent-trace-read.md
[observability]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/observability-design.md
