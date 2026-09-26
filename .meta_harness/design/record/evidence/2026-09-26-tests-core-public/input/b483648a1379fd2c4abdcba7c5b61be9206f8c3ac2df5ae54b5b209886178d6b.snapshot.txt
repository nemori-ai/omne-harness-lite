# D-026：基础设施持久化的四条选择

- **当前状态：已接受**——四条选择、提供者进第一程、查询层与驱动取值。**未接受**：`infra` 组名、`apps/tenancy-host` 节点名（候选）。
- **来源**：[research/agent-harness-persistence-and-identity-infra](../../../../research/agent-harness-persistence-and-identity-infra/research.md)（网络一轮 + 本机五家 CLI 一手语料一轮，2026-09-22）；
  投影 v1 [Q-16](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)；
  [AI R-1～R-7](../../../realization/packages/tenancy/account-identity/design.md#对存储提供者的要求清单) 与
  [OG R-1～R-6](../../../realization/packages/tenancy/organization-governance/design.md#对存储提供者的要求清单)。
- **需求与方法前提**：[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)（单机交付、语义不变地可扩展）；
  根 `AGENTS.md`「研发品味」「优先复用成熟实现或第三方库」「复杂度必须有收益证据」。
- **实际接受依据**：2026-09-22 实施规划会话，产品负责人（`panqiwei`）两段原话见 [README 准入核对](README.md#准入核对)，并就「SQL 存储提供者是否进第一程」选「进第一程」。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 基础设施是否提供 in-memory 实现 | **不提供**。测试与开发都跑真实提供者（sqlite 文件库） | 存储、消息队列两类；时钟不在此列（`Clock` 是契约形状，测试用可控实现不是「基础设施 in-memory 版」） | — |
| SQL 存储的形态 | **通用查询层 + 方言由配置切换**；开发期 sqlite，生产期 PostgreSQL | 取 **Kysely**：研究正文[「Drizzle 的 sqlite-core 与 pg-core 是两套类型」](../../../../research/agent-harness-persistence-and-identity-infra/research.md#drizzle-在类型层按方言分裂kysely-在构造时传方言)——切方言等于改代码，违反「只改配置」；[「同行 CLI 无一用查询构建器」](../../../../research/agent-harness-persistence-and-identity-infra/research.md#被调研的五家-cli-harness-没有一家用查询构建器)——它们不需要切 pg，本项目需要，这是引入 Kysely 的唯一理由 | `SELECT … FOR UPDATE` 在 sqlite 无对应物，由 `core/storage` 协议按方言分支（sqlite 用 `BEGIN IMMEDIATE`）；pg 方言本程只接线不跑 |
| sqlite 驱动 | **`node:sqlite`**（Node 24 内置），Kysely 方言自写薄 Driver | 研究正文[「TS 同行都用 node:sqlite」](../../../../research/agent-harness-persistence-and-identity-infra/research.md#ts-实现的同行-harness-用内置-nodesqlite不用原生插件)；社区方言包成熟度弱 | `better-sqlite3` 作退路记在 `infra/storage-sql` 节点 |
| 消息队列 | **先用 redis** | 约束记录；本程无队列消费者 | 队列协议、redis 客户端、是否用 streams 一概未定，届时另立节点与决定 |
| 本地化持久化 | **文件系统 JSONL**（会话日志一类） | 约束记录；不在租户领域第一程 | 格式、目录、压缩（同行有 zstd 帧）未定 |
| SQL 存储提供者是否进第一程 | **进** | `packages/core/storage`（协议 + 一致性测试套件）、`packages/infra/storage-sql`、`packages/infra/clock`、`apps/tenancy-host`（只写存储/时钟/密钥三半） | 入口层身份核实那一半等客户端–据点契约 |

## 理由与保留前提

- 不做 in-memory 的收益：测试直接对着真实提供者验证 R-1～R-7 的锁、约束、错误映射，不会出现「内存版通过、sqlite 上第一次跑就红」；代价是每个测试文件要开一个临时文件库，速度慢一些。
- Kysely 的前提是「只改配置切 pg」这条要求继续成立。若将来放弃 pg，Kysely 相对原生 SQL 就是无收益复杂度，应回到本决定重判。
- `node:sqlite` 的前提是 Node `>=24`（根 `package.json` engines 已定）；Bun 等其他运行时不在本版考虑。
- sqlite 运行参数（WAL、`synchronous=NORMAL`、`busy_timeout=5000`、`foreign_keys=ON`、写事务 `BEGIN IMMEDIATE`）是同行三家一致的做法，作为提供者节点的默认，不是本决定的接受对象。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用 | 闭合条件 |
|---|---|---|
| [D-023](../tenant-domain-design-acceptance/decision.md)「不表示存储已选定」 | 标已由本决定裁定 | **已完成** |
| [realization README 两层布局](../../../realization/README.md#packages-的两层布局) | 加 `infra/` 一行（候选组名）与四个新节点 | **已完成**（2026-09-22，五个候选节点落盘：`core/kernel-basis`、`core/storage`、`infra/storage-sql`、`infra/clock`、`apps/tenancy-host`） |
| 投影 v1 Q-16 | 存储/时钟/密钥三半指向本决定与新节点；入口层仍未决 | **已完成**（2026-09-22，Q-16 与 §8 第 3 步原地更新） |
| 承载仓库 `docs/workspace.md`、`docs/development.md` | 新增成员与检查入口 | **已完成**（2026-09-22，`packages/README.md` 成员表、`pnpm run check` 接入构建/类型/测试/结构规则） |

**不表示**：存储协议接口已定（归 `core/storage` 节点）；任何契约条款的实现已完成；`infra`／`tenancy-host` 名已拍板；跨进程形态下的存储协调协议已定（[Q-8](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)）。

返回[本 topic 入口](README.md)。
