# session-tenancy-table

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.session-tenancy · v1`（[契约](../../../../spec/capabilities/session-tenancy/v1/contract.md)，状态 `candidate`，未接受、未冻结）的**全部条款**（S-5～S-11，一个读），作为它第十一节说的「本版的最小提供者」（[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）
- 源码位置：`packages/session/session-tenancy-table`——**尚未建包**。第一层 `session` 已由产品负责人接受（[D-044 ⑱](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是不依赖 Cordis 的闭包 `createSessionTenancyReader(storage)`（候选名，给它任一符合 `core/storage` 协议的存储即可用）与这张表的迁移片段；另有**只供验收装配**的子入口 `./seed`（测试种子代会话那一程写映射，不进产品代码）。**Cordis 服务面** `sessionTenancy` 是闭包的一种消费者（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，必需 inject `storage`，不 inject `clock`**（没有要读时刻的地方）；一张（会话 → 租户身份）的表，经 [`core/storage`](../../core/storage/README.md) 落在据点那一份 `storage` 里，迁移片段由装配合成。
  它**取代**据点装配[验收装配](../../../apps/cli/design.md#验收装配)里「会话持有租户读面」那个替身；**真承接者**是会话那一程 PF-015（契约 [G-1](../../../../spec/capabilities/session-tenancy/v1/contract.md#十已知缺口)，据点装配缺口 C-13）。
  **只兑现窄口，不扩展契约**：服务上只有 `holdingTenant` 一个读，不补会话存在与否、归档、会话其余事实。
  **写入方不在本契约**（契约 G-2）：验收装配由测试种子写；**产品装配没有写入方**，本版产品据点清单也不装本节点（据点装配[关键选择 5](../../../apps/cli/design.md#关键选择)）——装上它每一次读都答 `sessionNotFound`，依赖方如实失败，不填默认租户

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**未接受（候选）**。契约仍是 `candidate`，本节点的设计同样未被接受；经过一次 architecture-reviewer 独立评审（N6，无阻断），起草者的处置见 [verification 的「独立评审 N6」](verification.md#独立评审-n6)——**处置未经评审方复核，评审不代替接受**
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)。**尚未建包、没有一行源码**。
  「答出之后不变」（S-6）**有前提**：表没有改与删的路径、存储持久——后者在操作系统崩溃或断电时按 D-027 的 `NORMAL` 口径有边界，升级快照被恢复时也会撤掉确认之前写下的行（缺口 STT-3；升级恢复那一半由「开闸在确认之后」挡住，已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点））。
  **可实施的前置**：结构检查「只有 `apps/cli` 的测试代码 import `./seed`」（缺口 STT-4，[verification](verification.md#证据义务) V-1）落地之前，本节点**不声称可实施**——没有它，`./seed` 就是产品包里一段无守卫的写代码（[关键选择三](design.md#关键选择)）。
  **产品装配里没有一行数据**（STT-1）：本节点的「可实施」只在验收装配的测试种子上成立
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（契约 S-12），没有可绑的 formal task；本节点没有源码、没有测试
- 实际验证：**尚无**

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 表长什么样、读怎样映射失败、为什么不缓存、种子为什么是子入口 | [实现设计](design.md) |
| 对存储提供者要什么 | [实现设计：要求清单](design.md#对存储提供者的要求清单) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
