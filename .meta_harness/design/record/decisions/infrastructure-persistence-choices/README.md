# D-026：基础设施持久化的四条选择——无 in-memory、SQL 经通用查询层、队列 redis、本地日志 JSONL

产品负责人 2026-09-22 拍板四条基础设施选择，约束**全部**产品包与装配，不只租户领域：
① 存储与消息队列**不提供 in-memory 实现**；② SQL 存储开发期用 sqlite，但经通用查询层，**只改配置**即可切 PostgreSQL；
③ 消息队列先用 redis；④ 不是所有持久化都走 SQL——会话日志一类本地化数据用文件系统 JSONL。
同一场会话里另裁定：SQL 存储提供者进租户领域第一程；查询层与 sqlite 驱动按横向调研取 **Kysely + `node:sqlite`**。

- **输入与下游**：来源是 [research/agent-harness-persistence-and-identity-infra](../../../../research/agent-harness-persistence-and-identity-infra/README.md)（两轮横向取证）、
  投影 v1 [Q-16](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)、
  两个 tenancy 节点对存储提供者的要求清单（[AI R-1～R-7](../../../realization/packages/tenancy/account-identity/design.md#对存储提供者的要求清单)、
  [OG R-1～R-6](../../../realization/packages/tenancy/organization-governance/design.md#对存储提供者的要求清单)）；
  下游是 `packages/core/storage`（协议）、`packages/infra/storage-sql`、`packages/infra/clock`、`apps/tenancy-host` 四个节点，以及将来任何提供者的测试夹具。
- **范围定位**：只解决「基础设施用什么、不用什么」。**不解决**：存储协议的接口形状（归 `core/storage` 节点）、任何契约语义、第一层组名 `infra`（候选，见下）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-22 实施规划会话。原话：「所有的存储、消息队列这些基础设施的实现，都不要提供 in-memory 版本。sql 存储开发阶段可以先用 sqlite（但最好是用通用的依赖，方便只通过修改配置未来就可以用比如 pg），然后消息队列可以先用 redis」；「不是所有的数据持久化我们都用 sql，有些本地化存储的我们会用 local filesystem 先做 jsonl 的（比如 session log，但那不在这一程）」；对「SQL 存储提供者是否进第一程」选「进第一程」 |
| 精确修订 | 研究 topic 首轮（2026-09-22）；D-023 接受的两份节点要求清单（`main@26f2667`） |
| 接受范围 | 四条选择 + 「提供者进第一程」+ 查询层／驱动的具体取值 |
| 保留前提 | 单机交付（[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)）；两个 tenancy 节点的表在同一存储、同一约束域 |
| 取代关系 | 不取代任何决定；闭合 D-023「不表示存储已选定」那一句的范围 |

**`infra` 这个第一层组名与 `apps/tenancy-host` 这个装配节点名是候选**，产品负责人尚未就名字本身作答；
节点按候选名落盘，拍板后若改名是搬目录，不改本决定。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、不表示什么 | [决定正文](decision.md) |
| 同行 harness 各用什么、Kysely 与 Drizzle 差在哪 | [研究正文](../../../../research/agent-harness-persistence-and-identity-infra/research.md) |
| 存储协议长什么样、一致性测试套件覆盖哪些要求 | `packages/core/storage` 节点（建立中） |

返回[决定](../README.md)。
