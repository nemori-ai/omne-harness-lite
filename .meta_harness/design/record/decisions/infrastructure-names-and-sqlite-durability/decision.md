# D-027：`infra` 组名、`apps/tenancy-host` 节点名拍板，sqlite 持久性政策取 `NORMAL`

- **当前状态：已接受，两个名字与一个参数取值。**
- **来源**：[D-026](../infrastructure-persistence-choices/decision.md)「准入核对」把 `infra` 与 `apps/tenancy-host` 记为候选名；
  四个基础设施节点的 architecture-reviewer 评审（2026-09-22）把「`synchronous=FULL` 是否本版需要」列为范围外待裁决（W-2），
  [storage-sql](../../../realization/packages/infra/storage-sql/design.md#实施缺口与消费者影响)、[clock](../../../realization/packages/infra/clock/design.md#对存储提供者的要求清单)、
  [tenancy-host](../../../realization/apps/tenancy-host/design.md#实施缺口与消费者影响) 三个节点各自记了这条缺口。
- **需求与方法前提**：根 `AGENTS.md`「研发品味」「复杂度必须有收益证据」；[D-026 第二条](../infrastructure-persistence-choices/decision.md#选择与范围)「sqlite 运行参数与同行一致」。
- **实际接受依据**：2026-09-23 第二程规划会话，产品负责人（`panqiwei`）原话：「infra 组名 和 apps/tenancy-host 节点名 确认同意」「sqlite synchronous 政策用 normal」。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 第一层组名 `infra` | **确认**：基础设施提供者与 `core`（协议）、`tenancy`（领域）并列，第一层不是 workspace 成员 | `packages/infra/`、`design/realization/packages/infra/` | — |
| 装配节点名 `apps/tenancy-host` | **确认**：名字不变；它是治理中心那一侧的装配，交付面 PF 另开题（第二程阶段 1） | `design/realization/apps/tenancy-host/`；建包时 `apps/tenancy-host/` | 该节点与准入规则的张力由治理中心 PF 开题闭合，不由本决定闭合 |
| sqlite `synchronous` | **取 `NORMAL`**：三家同行一致的默认；WAL 下进程崩溃不丢已提交事务；OS 崩溃／断电可能丢最后一段已提交事务但不破坏一致性。`FULL` 每次提交多一次 fsync，换来的断电级持久在开发期没有消费者 | `PRAGMA synchronous = NORMAL`（写句柄与读句柄），storage-sql 不暴露 config 项 | 「`now` 不后退」跨 OS 崩溃不承诺；生产期 pg 的持久性归服务器配置，不在此 |

## 理由与保留前提

名字拖着不定，每份节点 README 都要带「候选」，消费者引用也要带条件；两名在第一程已按候选落盘、评审无异议，确认是零成本闭合。
`synchronous` 选 `NORMAL` 的前提是**边界如实写在正文里**：storage-sql P-7／R-4、clock R-C2、core/storage verification 三处已写「OS 崩溃可丢最后一段」；
将来若有消费者要求断电级持久（例如生产期不用 pg 而用 sqlite），改 `FULL` 须新决定并给 storage-sql 加 config 项，本决定不预留那个开关。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用 | 闭合条件 |
|---|---|---|
| [D-026 准入核对](../infrastructure-persistence-choices/README.md)「两名是候选」 | 标已由本决定拍板 | **已完成**（2026-09-23） |
| [realization README 两层布局](../../../realization/README.md#packages-的两层布局)、六个节点 README、承载仓库 `packages/README.md`／`docs/workspace.md`／`apps/README.md` | 去掉「候选组名」「名字候选」措辞 | **已完成**（2026-09-23，同批） |
| storage-sql、clock、tenancy-host 三节点的「`FULL` 待裁」条目 | 改为指向本决定；边界措辞保留 | **已完成**（2026-09-23，同批） |

**不表示**：治理中心那一侧的交付面已有 PF（第二程阶段 1 开题）；断电级持久已被承诺；pg 的持久性已定。

返回[本 topic 入口](README.md)。
