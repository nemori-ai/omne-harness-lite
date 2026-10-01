# D-109 后继：图片准备清理与原计量依据接缝

2026-09-29，主调度沿原 [D-109](decision.md) 相同的实施与技术验收授权，接受下列精确附页。此为新增的局部接受记录，不改原决定或已采用 v15 r4/v21 r3，不代表用户完成交付签收。

## 精确范围与依据

采用 [runtime scope cleanup r2](../../../realization/packages/model/model-request-runtime/image-preparation-scope-cleanup-candidate.md)、[transport scope cleanup r2](../../../realization/packages/model/pi-ai-transport/image-preparation-scope-cleanup-candidate.md)、[basis applicability r3](../../../realization/packages/model/pi-ai-transport/image-preparation-basis-applicability-candidate.md)，连同 [PF-013 projection/v7](../../../product/PF-013-model-profiles-and-invocation/projection/v7/projection.md)。五项资源的完整 SHA 由 [接受摘要](scope-and-basis-acceptance.json) 固定，分别继承候选提交 `4ebcd9c0`、`361ed8f0`；候选标签与 provenance.acceptance 保留快照时事实。

主调度回读三正文和[双独立评审记录](../../proposals/model-request-image-preparation/scope-and-basis-followup-review.md)，核对九个设计来源及六个精确提交源码摘要。架构和表达评审在最终摘要均无其范围阻断。原表来源误标、void 接口误接 async、fallback 首原因顺序的发现及修正全部保留。

采用 acquirer/service 必需同步清理口，理由是闲置 lease 已释放后缓存责任仍存在；把清理放到 lease 上不能覆盖这段寿命，直接注入图片实现则让通用 runtime 依赖实现类型。固定装配持有原 service 闭包，无需通用历史代际注册表。清理失败、非 undefined 和 thenable 错接必须留责；不能把错误接线当成正常异步协议。

采用共享 relation 的内部纯 originalApplies 参数和同一有限家族表，理由是原 O 可解释性与原 I 兼容性是两种性质。共享算法不按 modelId 分派，InputMeter 公共面不增加历史表。未知原依据不能被标成 changedEffective；通用 fallback 依 RT10 既有优先级尝试 full，full 仍须证明原 O 可解释。已知来源矛盾或坏 compound 不借回退放行。

## 实施和验收

释放 runtime 与 transport 的必需端口、实际返回值留责、scope 淘汰与关闭迁移，以及 shared relation/full/new/φ 的窄适用表接线。所有构造者和消费者直接迁移，不保留缺方法兼容。沿 RT10/MR9，不新增契约版本、业务操作、服务键、持久对象或实际 bindings；catalog/frozen/covers/formal-tasks 无新条目。

SC1～9、BR1～7 与原 IP-V1～10 是未完成的工程义务。真实缓存释放、实际取消排空、撤回后闭包可清理、错误 async 留责、有限原 O 可用而 I 失效及 fallback 优先级都必须在真实组合验收；仅接口编译或调用计数不足。每个改动包同步交付双语公开说明。T29 与完整 Session/Run 不作为本附页实施前置。
