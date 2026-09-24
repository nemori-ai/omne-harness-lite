# asset-governance

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿。兑现两份契约：`omne-harness-lite-design-2026-09-15 · capability.asset-governance · v1`（[契约](../../../../spec/capabilities/asset-governance/v1/contract.md)）与 `omne-harness-lite-design-2026-09-15 · capability.asset-transfer · v1`（[契约](../../../../spec/capabilities/asset-transfer/v1/contract.md)），两份都是 `candidate`、未接受、未冻结；形状取自被接受的拆分候选 B（[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3)；[提案装配草图](../../../../record/proposals/capability-split-assets/design.md#装配草图可独立引用)）
- 源码位置：`packages/assets/asset-governance`——**尚未建包**。领域名 `assets` 由 D-039 拍板；本页出现的插件名、服务名、方法名、表名与列名一律是**候选**，没有一行源码
- 契约采用与边界依据：治理中心一侧**一个 Cordis 插件、一条 fiber**，提供**同一实例的四个服务面**（候选服务名 `assets`、`asset-holdings`、`asset-transfer`、`asset-snapshot`），由 [`apps/tenancy-host`](../../../apps/tenancy-host/README.md) 装配；两份契约的落地、删除与提升要在**同一次提交**里写对方的记录（[AG S-46](../../../../spec/capabilities/asset-governance/v1/contract.md#s-46-组合入口资产流转的确认步骤)、[AT S-18](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-18-确认是一次提交同一落点的确认序列化)、[AT S-52](../../../../spec/capabilities/asset-transfer/v1/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)），内核不提供跨 fiber 事务，所以不拆（[提案 N-1](../../../../record/proposals/capability-split-assets/design.md#n-1-资产治理与资产流转契约两份提供者一个插件)）。**会话据点不 import 本包**（结构检查，[design](design.md#实施缺口与消费者影响)）。跨 owner 的那几处「同一提交」落在组织治理的隶属哨兵、组织行与它导出的事务内读函数上（[design](design.md#跨-owner-的同一提交组织治理的隶属哨兵组织行与事务内读)）

## 分层状态

四项分别陈述，不互相补齐。

- **语义接受范围：未接受（候选，待 D-041）。**两份契约都是 `candidate`（[D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md) 草案未签）；本节点的设计也未被任何决定接受为实现路径
- **可实施范围（声称兑现的条款）**：`capability.asset-governance/v1` 的 S-1～S-65——二十四个操作（S-24～S-45、S-64、S-65）的九件事、S-14～S-22 七条贯穿规矩、S-46 组合入口、S-47 解除成员不动持有、S-48 五个通知事件与 S-3 审计条目同提交、S-49 不开控制事件、S-50 左列十二行在单机上的兑现、S-51／S-52；`capability.asset-transfer/v1` 的 S-1～S-53——十二个操作（S-20～S-30、S-48）的九件事、S-7 存在性读面、S-9 判据、S-15～S-18 四条规矩、S-31／S-32／S-52 关系变化之后、S-33 不发事件、S-34 左列十三行、S-35～S-37。**不兑现**：两份契约的右列（协议给）全部；AG S-29 不是任何服务面上的方法（官方件由插件体按装配给的清单登记，[design](design.md#官方件登记插件体按装配给的清单登记)）；两份契约登记的开放缺口（AG G-3、G-5、G-6、G-7、G-12、G-13、G-16、G-20、G-21、G-22、G-26，AT G-3、G-5、G-8）照契约收场。**第四个服务面（快照面）没有契约条款**，只是两份契约读面在一次读事务里的投影（[design](design.md#快照面两份契约读面的一次读事务投影)，缺口 N-4）。AG S-38～S-41 的写时守卫调 asset-evaluation 节点单独导出的 S-23 三个函数；**本插件不调 `evaluate`**。**尚未建包**：以上都只是设计
- **绑定与证据**：[`bindings.yaml`](bindings.yaml) **二十条**，全部绑到已登记的 formal task `asset-transfer-v1-transfer`／`-share`／`-revival`（运行 [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md)，三个任务退出 0、无反例）；它们证的是**契约模型**，前提是存储兑现了序列化、时刻严格递增，不证本节点的实现。`capability.asset-governance` 不建形式工件，没有 formal 绑定；两份契约的规范场景与并发演练**全部未开始**（[verification](verification.md#证据义务)）
- **实际验证：无。**源码不存在

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 一个插件四个服务面、每条契约责任落在哪、同一提交碰哪些存储对象、锁次序、事件会不会越过租户边界、官方件怎么登记、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml) |
| 要证什么、实际跑过什么、还缺什么 | [验证与证据](verification.md) |
| 为什么是一个插件而不是两个、为什么不与组织治理合并 | [提案装配草图](../../../../record/proposals/capability-split-assets/design.md#为什么不拆为什么不合可独立引用) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
