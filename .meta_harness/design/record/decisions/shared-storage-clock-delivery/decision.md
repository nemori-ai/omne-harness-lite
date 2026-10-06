# Storage/Clock 公共 Service 与提供者迁移的限定接受

状态：本切片产品实现已技术接受，完整领域整改未完成。

负责人 panqiwei 在本会话授权实施整改、按增量验收并合入。主会话于 2026-10-04 16:19:25 UTC 在该委托内接受产品候选 `a18ed435bcc244b50ffd4070e805a560e0912044`，实施 BASE 为 `e22311713b1a94d2e54e9976483d2f94f9a12ea6`。这不表示负责人已亲自逐条审阅或系统级验收完成。

设计依据为[限定设计采用](../shared-storage-clock-integration/decision.md)、[D-114](../cordis-integration-conventions/decision.md) 与 [D-115](../actual-architecture-and-thin-spec/decision.md)。来源研究为 [architecture-judgment-aids](../../../../research/architecture-judgment-aids/research.md)。实际依据见[本次运行](../../evidence/2026-10-04-tests-shared-storage-clock-integration/README.md)。

## 接受和切换范围

- StorageService、ClockService、唯一服务键及 Context 类型由各公共定义的 `./cordis` 拥有。纯根不引入 Cordis 装载闭包；Storage 只强制 read/write。
- SQL 独立能力继续可用，拥有插件和借用 Service 的关闭责任分开。局部不可改写身份投影保持 raw/正式面双向同提交和确切存储实例判断，原错误优先、污染、通知、提交点和维护协议不变。
- 租约时钟提供者改为 clock-lease，限定插件名、纯根和绑定入口一致；原租约与时间算法保持。旧 clock 产品包、旧根插件入口和重复公共键删除，实际消费者同步。
- 本次四包集成承诺由[承诺归属表](../../../architecture/pilots/shared-storage-clock-ownership.md)定位公开类型与薄规格。旧事务、租约及其他尚未迁移的行为源继续有效，不整体退役旧 realization 或冻结模型。

接口与装配变化没有授予新的租户权限，不增加分布式事务保证，不把所有 Storage 强制扩为 AtomicStorage。调用方效应、在途和独立资源责任保持设计的精确边界。

## 接受理由与限制

独立 L3 QA 的 B1～B8/76 条必需观察闭合；适用套件去重 1345 passed、0 failed、17 skipped。真实 SQLite、TLS、Unix、CLI、正式服务换代、启动失败/在途撤除、同提交两方向以及实际 tarball 的四层公开边界均有证据。52 个保护文件字节相同。独立实施评审及最终补审无代码阻断，四共同硬线通过。

两处本批迁移遗漏已修复并独立复验。QA 原报告 B5.protected 的 clock.ts 注释差分是一处文字误差，另附勘误；原报告和冻结清单不改写。接受采用原机读字节证据。

全局偏离 124→148，是移除 14/新增 38 条静态路径，没有新违规成员；四共享成员偏离为 0。其余未迁纯根仍须在 R1/R2 整改。变异 70 survived、64 no-coverage 及 asset-registry 无快层报告均保留，不能称变异全绿。原 48 成员回归与修正三成员结果按两个修订读取，不冒充同候选一次全跑。

原 IR-CC-1 归 R1-T2/R1-T5，完整 W6 的 QA-FAC-1 归 N6；EIS 原超时、A5/QA-N4-I1 冷恢复原因与 PostgreSQL 完整恢复未关闭。冷恢复 17 项通过且原 45 秒阈值不变，只支持本切片适用路径；R2-T5 仍须补原失败的阶段因果证据。早期 QA 设施失败与驱动逐次字节缺失如实保留，最终成功输入已冻结并可恢复。

上述保留问题没有遮蔽本切片必需观察，因此不阻断这一限定接受；它们不能通过改称已知问题关闭各自阶段的必要验收。

## 取代与未接受范围

本事件接续先前设计采用的产品待验证状态，只接受上述精确候选。N1～N4 和 R1-T1a 的历史坐标不改写。R1-T1 的完成还须有实际合入与保全记录；下一设计交付为 R1-D0，先完成身份领域服务、包、薄规格及组合责任设计，再释放业务实现。

身份/登录/凭据与注册、ActionIntent、插件树、完整模型十五操作和 Session 机制均未由本次接受。R1-T5、R2、R3 和 N5～N8 保留原完成门。未运行全量 make check、队列、真实付费模型或完整基准。
