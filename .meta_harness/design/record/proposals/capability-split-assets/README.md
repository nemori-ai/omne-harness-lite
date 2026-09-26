# 块 A 资产的能力拆分：几份能力、几个 Cordis 插件

**选择对象**：[PF-002](../../../product/PF-002-assets-settings-and-permissions/README.md) 与 [PF-003](../../../product/PF-003-asset-transfer-and-sharing/README.md) 里落在 #8 的两个对象——
具体资产与[资产持有](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)——以及挂在它们上面的[资产复制](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)与[资产分享](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)，
**切成几份能力契约、由几个 Cordis 插件兑现、各自落在哪一处进程与哪个包**。它决定「确认一次成立」「再复制不碰目标组织的配置」「目标侧拿不到源」「离线照常求值」这几条由哪个结构点保护，
也决定资产领域的提供者节点怎么立。**这条边界会被资产领域后续每一份设计引用。**

**作者推荐 B**（数据形状与求值做纯模块落 `core`、两侧 import；资产治理与资产流转由中心一个插件提供）——这是主线裁定的方向。
理由、每个落选方的改票条件与仍待区分的事项见[候选与取舍](alternatives.md#推荐与改票条件)。**推荐不是接受。**

- **当前状态：候选。**没有评审、没有决定；[`record/decisions/`](../../decisions/README.md) 无对应决定文件。
- **本次终点与范围**：五个实质候选（A 一个插件提供四份契约；B 纯部分落 `core`、治理与流转一个插件；C 治理与流转各一个插件；D 按中心／据点两侧拆；E 按记录／持有拆）
  加一个契约层变体，各自怎样承载性质表、哪条性质失去保护点、哪个反查信号出现、可计数的代价；推荐与改票条件；
  以及**装配草图与「为什么不拆、为什么不合」（N-1～N-8）的长期家**——提供者设计将引用它们。领域名与包布局写成**待产品负责人拍板**。
  **不写**契约、提供者设计、装配节点修订；**不改**产品正文、词条、领域对象条目与 [proposals 索引](../README.md)。
- **输入基线**（本工作树，2026-09-23）：
  - 产品正文：PF-002 rev 16、PF-003 rev 4、[PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/README.md) rev 16（§6.1、§6.7）；
    邻接 [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md) rev 5（§5.6、§6.9、§6.17）、[PF-017](../../../product/PF-017-governance-center-as-deployable-application/README.md) rev 2（§6.6）。
  - 候选契约：[`data.asset-model` v2](../../../spec/data/asset-model/README.md)、[`capability.asset-transfer` v2](../../../spec/capabilities/asset-transfer/README.md)（都未接受）；
    `capability.asset-governance` v2 与 `capability.asset-evaluation` v2 **同批起草、不在本工作树**，本包只按契约身份称呼。
  - 已接受契约：`data.identity-values` v1、`data.offer-expiry` v1、`capability.organization-governance` v1（[D-023](../../decisions/tenant-domain-design-acceptance/README.md)）；
    `composition.governance-center-entry` v1（[D-028](../../decisions/governance-center-design-acceptance/README.md)）。
  - 实现映射：[realization 的两层布局](../../../realization/README.md#packages-的两层布局)；[组织治理节点](../../../realization/packages/tenancy/organization-governance/README.md)（「一个插件多个服务面」「跨 owner 同一提交」的先例）；
    [apps/tenancy-host](../../../realization/apps/tenancy-host/README.md)；[`core/storage`](../../../realization/packages/core/storage/README.md) 的协议与消费者义务 P-13。
  - [basis](../../../basis/README.md) 七条条目（probe 都在 4.0.4 上通过）；Cordis 4.0.4（[D-025](../../decisions/cordis-adoption-version/README.md)）；[D-026](../../decisions/infrastructure-persistence-choices/README.md)。
  - 本批的双盲领域读数、机制读数与对账结论，以及主线的裁定账本——**它们是任务区过程材料，本包不以它们为依据**；被引用的理由、草图与主线裁定（[MR-1～MR-10](design.md#本包依赖的主线裁定尚无决定记录)）都已写进本包。
    本包作者读了两份读数（提案段的输入），**不是双盲执行者**；双盲只约束读数本身。
  - **未读 `design_legacy/`**。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：三个轴——纯部分做模块还是服务；中心侧一个插件还是两个、沿什么切；两份契约还是一份 |
| 现有能力覆盖 | 见 [design.md](design.md#现有能力如何承载)：组织治理只承载成员资格、角色、组织变体、上级链；资产记录与持有的治理、复制与分享的落地、求值**没有已接受的承载者**；资产流转有候选契约，但它的落地写面对方未定 |
| 剩余责任 | 见 [design.md](design.md#剩余责任与能力演化)：三份新能力（资产治理、资产流转、求值）加一份数据契约；两处组合（入口契约 v2、据点装配） |
| 三个实质候选 | **齐，五个**，外加一个契约层变体。A、C、D、E 的关键反例[互不重复](alternatives.md#反例是否互不重复)，各引自产品正文、已接受契约或 `core/storage` 协议，不是陪衬；B 的关键反例与 A、D、E 共有，已如实标明 |
| 接受权限 | **本包不产生接受。**作者推荐、主线裁定、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要选的是什么、必须保留哪些性质、现有能力承载到哪、剩下什么责任 | [设计正文](design.md) |
| 22 个对象各落在 #几、为什么前面几个不是 | [对象与落点](design.md#对象与落点可独立引用) |
| 候选 B 在两处进程里是什么形状：插件、服务面、inject、事件、装卸、同一提交与共同存储对象 | [装配草图](design.md#装配草图可独立引用)（可独立引用） |
| 为什么治理与流转一个插件、求值不进 ctx、不与组织治理合并、不开 isolate、不建监听者、工作区不进中心、记录与持有不拆 | [为什么不拆、为什么不合](design.md#为什么不拆为什么不合可独立引用)（N-1～N-8，每条可单独引用） |
| 五个候选差在哪、各失去哪条保护点、什么证据会翻盘 | [候选与取舍](alternatives.md) |
| 领域名、节点名与包布局怎么定 | [待产品负责人拍板](design.md#待产品负责人拍板领域名与包布局) |
| 评审了什么、怎么处置 | [评审记录](review.md)（尚无） |

## 后续消费

以下全部**待立或待修订**，本包只是它们的候选依据：

- **三份能力契约的对齐**：`capability.asset-governance` 与 `capability.asset-transfer` 写明「落地写入由同一提供者在确认的同一次提交内完成」（[交接缺口第 2 行](design.md#交接缺口)）；
  `capability.asset-evaluation` 的「装配给」表写明两侧同一份代码与据点副本的新鲜度读法。
- **提供者节点**：候选 `realization/packages/assets/asset-governance/`（一个插件，兑现两份能力契约），`packages/core/asset-model`、`packages/core/asset-evaluation` 两个纯模块节点——路径里的领域名待拍板。
- **待修订**：[apps/tenancy-host](../../../realization/apps/tenancy-host/README.md)（装载清单、迁移合成、官方件启动登记、两类邀约的默认时长）；
  入口契约出 v2 追加资产路由；[组织治理节点](../../../realization/packages/tenancy/organization-governance/README.md)登记隶属哨兵与上级链列成为另一个 owner 的依赖（X-1）。
- **需要他方裁定的**：领域名、节点名与 `tenancy-host` 的名实（产品负责人）；本包依赖的十条主线裁定落一份决定记录（主线）；
  「资产不存在」的范围、提升时持有怎么变、个人组织被清除时资产的去向（产品 owner）——坐标见 [design.md 交接缺口](design.md#交接缺口)。
- **本包未登进 [proposals 索引](../README.md)**：本次可写范围只有本目录，索引一行由主线补。
