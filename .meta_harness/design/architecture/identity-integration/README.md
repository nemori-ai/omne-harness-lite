# 身份与组织租户的集成整改设计

状态：R1-D0 设计已限定采用，T2 产品已通过独立 L3 并获
[限定技术接受](../../record/decisions/identity-capabilities-delivery/decision.md)。
八个管理绑定与真实宿主已接入。T3 公共操作、客户端及 CLI 生命周期已获
[限定产品接受](../../record/decisions/governance-clients-delivery/decision.md)。T4 插件树仍待实施，
完整身份领域尚未验收。设计采用范围见
[决定](../../record/decisions/identity-integration-design/decision.md)。输入基线为
`588628544ab92bd542f24efa1801634eb6eee56e`。
T2 的精确管理绑定坐标及 entry 提前物理改名由
[补充采用](../../record/decisions/identity-t2-binding-coordinates/decision.md)接续；不改变原业务或关闭机制。

本设计落实 [D-114](../../record/decisions/cordis-integration-conventions/decision.md) 与
[D-115](../../record/decisions/actual-architecture-and-thin-spec/decision.md)。
目标是保持现有能力与业务承诺，修正公共定义、提供者、绑定和装配之间的责任。
范围包括完成身份领域所必需的客户端公共接口和插件树机制。

| 阅读目的 | 本包正文 |
|---|---|
| 有效语义、操作与迁移边界 | [保持与对应](preservation.md) |
| 服务定义、包、依赖和 Cordis 投影 | [目标设计](design.md) |
| 跨消费者排空、关闭结果及开闸代际 | [有序收尾](retirement.md) |
| 新插件树及具名运行资源的精确候选 | [装配协议](plugin-tree.md) |
| T4 宿主错误/观察、独立工厂与资源配置接缝 | [宿主集成](host-integration.md) |
| T3 精确工厂、绑定、Schema 和 CLI 关闭投影 | [客户端集成](client-integration.md) |
| CG关闭拒绝、启动前缀和终端恢复次序 | [CLI生命周期](cli-lifecycle.md) |
| 类型外承诺及薄规格落点 | [行为迁移](behavior.md) |
| 实施顺序、验证和释放条件 | [施工与验收](delivery.md) |

这里维护跨模块设计，不复制一套现行业务契约。候选形状以精确旧公开类型和明确变更表达。
实现增量把形状与类型外行为迁入对应成员后，本包保留选择理由和跨模块关系。
旧契约、模型及 Schema 的消费者和验证义务没有全部切换前，旧源继续有效。
本次不预建空成员，不把候选文件存在当作接口已发布。

设计采用、实际代码、行为验收、领域完成分别记录。OG3 未实现部分、PostgreSQL 整体恢复、
完整 Agent/Tool Runtime 与 Session 新机制不因本设计变为已实现。
全局事实由源码视图生成；本文中的图是目标关系。

启动中异步 apply 撤除的新反例及其限定补差，见[启动期投影采用](../../record/decisions/identity-startup-lifecycle/decision.md)。原业务与数据语义保持，实际管理提供者及宿主的 T2 验证见
[本次运行](../../record/evidence/2026-10-04-tests-identity-capabilities/README.md)。
