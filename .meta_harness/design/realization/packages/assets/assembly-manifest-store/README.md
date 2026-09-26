# assembly-manifest-store

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.assembly-manifest · v1`（[契约](../../../../spec/capabilities/assembly-manifest/v1/contract.md)，状态 `accepted`，已接受、已冻结）的**全部条款**（四个操作：`readHead`、`append`、`readHistory`、`dependencyPresence`），作为它第十一节说的「本版的最小提供者」（[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）
- 源码位置：`packages/assets/assembly-manifest-store`——**尚未建包**。第一层 `assets` 由 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/README.md) 拍板；本节点放在这里是本批的划分，真承接者 PF-004 那一程到来时若归别的领域，搬动是「实现换方案」（缺口 AMS-9）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是条件追加的判定与在场作答（纯函数），以及不依赖 Cordis 的闭包 `createAssemblyManifestStore(storage, options)`（候选名，给它任一符合 `core/storage` 协议的存储即可用）与两张表的迁移片段；**Cordis 服务面** `assemblyManifest` 是闭包的一种消费者（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，必需 inject `storage`，不 inject `clock`**（表时刻由写入方给，本节点只比较；求值引用用随机数铸，不用时刻）。两张表经 [`core/storage`](../../core/storage/README.md) 落在据点那一份 `storage` 里；**条件追加的判定与写入在同一个写事务里**，共同存储对象是 (会话, 序号) 主键（契约 [S-12](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-12-条件追加判定与写入是同一步)）。
  **`dependencyPresence` 是本服务的一个查询，不另设服务键**（[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37 ②）；在场事实由装配以配置交进来——**验收装配给测试种子，产品装配没有来源**（契约 G-2），那时每次都答 `unavailable`。
  **只兑现窄口，不扩展契约**：服务上恰是契约的四个操作——没有写在场事实的方法、没有删除、不解释记录内容，派发器读链与模型请求运行时读求值结果本版不给（契约 G-4）。
  它**取代**据点装配[验收装配](../../../apps/cli/design.md#验收装配)里「装配清单」那个替身；**真承接者**是 PF-004 那一程（契约 [G-1](../../../../spec/capabilities/assembly-manifest/v1/contract.md#十已知缺口)，据点装配缺口 C-2）。产品据点清单本版不装它（据点装配[关键选择 5](../../../apps/cli/design.md#关键选择)）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**设计已接受**（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-041 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)，并逐条接住会话资产注册表的 [R-M1～R-M9](design.md#会话资产注册表的要求r-m1r-m9的承接互指)。**尚未建包、没有一行源码**。
  **有前提**：在场事实只在给了来源的装配里答得出（本版只有验收装配，AMS-2）；提交即持久在操作系统崩溃或断电时按 D-027 的 `NORMAL` 口径有边界（契约 G-3，AMS-4）；升级快照被恢复时确认之前写下的记录消失（AMS-5，归装配）；派发器读链与模型请求运行时读求值结果**本版读不出**——记录内容原样存、原样交回，读法未约定（契约 G-4，AMS-3）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（契约 S-25），没有可绑的 formal task；本节点没有源码、没有测试
- 实际验证：**尚无**

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 两张表长什么样、条件追加怎样在一个事务里判、共同存储对象与反证 | [实现设计](design.md) |
| 注册表的 R-M1～R-M9 落在哪 | [实现设计：互指](design.md#会话资产注册表的要求r-m1r-m9的承接互指) |
| 对存储提供者要什么 | [实现设计：要求清单](design.md#对存储提供者的要求清单) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
