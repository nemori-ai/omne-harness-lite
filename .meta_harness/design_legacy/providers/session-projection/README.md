# Session 投影提供者

本信息包把 Session/Run 的已提交事实折成可重建视图，并提供按当前读权裁剪的历史、状态和有限查询；它不拥有 Session、Run、模型 attempt 或消息流的权威事实。

- 设计对象：目标 `@omne-harness-lite/session-projection` 的 `SessionProjectionPlugin`；现有包只公开 `/baseline` 的 registry/fold 原语。
- 契约输入：[Session v1：SE-03、SE-10、SE-20](../../spec/capabilities/session/v1/contract.md)、[Run v1：RN-07、RN-08](../../spec/capabilities/run/v1/contract.md)、[核心工作协调 v1：CC-01、CC-06](../../spec/compositions/core-work-coordination/v1/contract.md)、[消息流 v1：MS-11、MS-12、MS-22](../../spec/capabilities/message-stream/v1/contract.md)。这些新坐标仍为 candidate；旧设计的接受记录不自动接受新坐标。
- 来源：原提供者设计 `packages/session/projection/design.md`（最近改动 `34251fdfdac400f4db32a2e2b62aa1578b887b04`，SHA-256 `57c09837e86dcd17dd4176b26454ca0b04f07560df41abcdf0d1d0579cf61828`）；源码公开入口（`packages/session/projection/src/index.ts`）与包导出（`packages/session/projection/package.json`）用来区分现状和目标。

`packages/` 路径是相对产品仓库根的源码定位符；文中实现现状可按产品源码提交 `74e3e48aa13b5c39c3b064537d2072dc2498b1d4` 复核，不是设计包内依赖。

## 准入与当前状态

此主题有明确的持续消费者：Session 读面、Run driver reducer、MessageStream 与恢复装配。投影服务、注册表、查询适配和缓存同属一个提供者实现边界，不另立能力维度；长期事实及披露政策仍由各能力拥有。目标 Cordis 服务 `omneSessionProjection`、Session 的受限查询适配与新 v1 的联合符合性尚未实现，详见[验证记录](verification.md)。

| 当前问题 | 阅读入口 |
|---|---|
| 责任、依赖、折叠与装卸怎样落实 | [设计映射](design.md) |
| 哪些行为有源码/测试证据，哪些仍待实现 | [验证记录](verification.md) |

相邻的[消息流提供者](../message-projection/README.md)负责订阅和投递，消费本包的授权投影；[Session 状态提供者](../session-session/README.md)拥有长期 Session 与读权，不把原事实交给本包另写。
