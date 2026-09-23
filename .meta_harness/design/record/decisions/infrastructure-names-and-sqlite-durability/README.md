# D-027：`infra` 组名、`apps/tenancy-host` 节点名拍板，sqlite 持久性政策取 `NORMAL`

产品负责人 2026-09-23 拍板三件事：第一层组名 **`infra`**、装配节点名 **`apps/tenancy-host`** 不再是候选；
开发期 sqlite 的 `synchronous` 政策取 **`NORMAL`**（WAL 下进程崩溃不丢已提交事务，OS 崩溃／断电可能丢最后一段——
「`now` 不后退」跨 OS 崩溃因此**不承诺**，记为已知边界）。**只裁名字与一条运行参数**，不裁任何契约或节点语义。

- **输入与下游**：来源是 [D-026](../infrastructure-persistence-choices/README.md)「准入核对」明写的两个候选名，
  与四个基础设施节点评审提出的「`synchronous=FULL` 是否本版需要」（[storage-sql 实施缺口](../../../realization/packages/infra/storage-sql/design.md#实施缺口与消费者影响)、
  [clock R-C2](../../../realization/packages/infra/clock/design.md#对存储提供者的要求清单)、[tenancy-host 实施缺口](../../../realization/apps/tenancy-host/design.md#实施缺口与消费者影响)）；
  下游是 realization README 两层布局表、六个节点 README 的「候选」措辞、承载仓库 `packages/README.md` 与 `docs/workspace.md`。
- **范围定位**：只解决「叫什么」与「开发期 sqlite 的持久性档位」。**不解决**：治理中心那一侧的交付面 PF（另开题）、
  跨进程形态、生产期 pg 的持久性（服务器侧，不在此）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 第二程规划会话：「infra 组名 和 apps/tenancy-host 节点名 确认同意」「sqlite synchronous 政策用 normal」 |
| 精确修订 | 名字：`packages/infra/`、`.meta_harness/design/realization/packages/infra/`、`.meta_harness/design/realization/apps/tenancy-host/`；参数：`PRAGMA synchronous = NORMAL`（`packages/infra/storage-sql/src/sqlite/driver.ts` 打开句柄时设） |
| 接受范围 | 两个名字、一个参数取值 |
| 保留前提 | `synchronous=NORMAL` 的边界（OS 崩溃可丢最后一段已提交事务）在 storage-sql P-7、clock R-C2、core/storage verification 里如实写明；需要断电级持久时改 `FULL` 须新决定并给 storage-sql 加 config 项 |
| 取代关系 | 不取代任何决定；闭合 D-026 里「两名未拍板」与四节点评审的 W-2 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、不表示什么 | [决定正文](decision.md) |
| `NORMAL` 的边界落在哪几处正文 | [storage-sql P-7／R-4](../../../realization/packages/infra/storage-sql/design.md#要求清单到方言机制)、[clock R-C2](../../../realization/packages/infra/clock/design.md#对存储提供者的要求清单) |

返回[决定](../README.md)。
