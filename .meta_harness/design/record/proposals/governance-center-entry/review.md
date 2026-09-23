# 评审与处置

- 待审对象与精确修订：本包（[design.md](design.md)、[alternatives.md](alternatives.md)）2026-09-23 的工作树状态，连同建立在候选 A 上的
  契约 `composition.governance-center-entry` v1（candidate）与三个实现映射节点
  （[入口层](../../../realization/packages/tenancy/governance-center-entry/README.md)、[tenancy-host](../../../realization/apps/tenancy-host/README.md)、
  [cli 的两条边](../../../realization/apps/cli/architecture.md)）。未冻结，无 hash 可绑。
- 当前事实：**两次 architecture-reviewer 独立只读评审（2026-09-23）**，第一次以本包的边界选择为对象，第二次以候选 A 牵连改动的三个提供者节点为对象。
  两次都不提升任何状态；本包与契约仍是候选。
- 评审者与方式：architecture-reviewer 角色，按 `harness-design-handbook` 的对账四表、F 四问、候选空间与反证走查；起草者自查不写作独立评审。

## 第一次：边界选择与三个节点

**候选空间判齐**：A／B／C／D 四个实质候选，四条关键反例互不重复。**推荐方 A 的已知弱点**（评审列出）：中心标识由投影层持有、面向网络的单元握着一条原始存储通路；
「运维者没有门」只有静态守卫；契约 S-28「治理事实为空」的判定与 A「只碰一张表」的边界冲突；「起来」时刻分在装配与入口层两处；inject 八条，任一换代关门再开。
落选方最强论证与改票条件仍以 [alternatives.md](alternatives.md#推荐与改票条件) 为准。

| 发现与证据位置 | 对哪些结论/消费者有影响 | 作者处置及理由 | 修改修订与复核结果 |
|---|---|---|---|
| **B-1（阻断）** 契约 S-28 要求「有治理事实却没有标识 ⇒ 启动失败」，入口层节点的读或铸没有这一支，且它「只碰一张表」的约束在结构上禁止它读 owner 的表；恢复不全的备份会静默铸出另一个中心 | 契约 S-28／S-44；入口层节点迁移片段与 T-8；PF-017 §6.12 | 四条路（收窄契约／AI、OG 改版加「是否为空」读面／装配读表数传常量／入口层直读 owner 表）都不取。改成**本表内可判的形状**：入口层迁移片段建表时插一行「未铸」占位，启动三态——未铸 ⇒ 铸、已铸合形 ⇒ 用、行缺失或值不合形 ⇒ 启动失败；表整个丢了由存储提供者的迁移前只读核对挡（装配给，判据由入口层包导出）。理由：治理事实只经入口层路由写入，而路由只在铸造之后开，所以「行在、值为空」只可能出现在从未开过门的数据上 | 契约 S-28 重写、S-36 加「那一格立起过就不被重建」一行、S-44 场景改三句；入口层节点 `center_id` 可空、`ON CONFLICT DO NOTHING`、`lockRow` 序列化、R-GC8 与 `governanceCenterPreflight`；tenancy-host 片段插占位行并写明「有数据的片段」的幂等规则。复核：检查器 PASS；T-8 期望值待契约稿定 |
| N-1 tenancy-host 与 cli 仍按 AI v1 承接，契约与入口层已钉 AI v2；漏承接 v2 S-30 三条装配给 | tenancy-host 承接表、两处 architecture 边 | 采纳：装配装 AI v2 的提供者 | 承接表改钉 v2，新增 S-30 第 10／12／13／14 行；② 改走 S-44；「出示物不可伪造」改为「出示物猜不中」并标提供者义务 |
| N-2 storage／clock 换代后两张面的重跑次序由内核定，运维面可能永不应答 | 契约 S-34／S-36；入口层节点 N-4 | 两半：契约 S-34／S-36 加前提「本版运行中不换代存储与时钟的提供者（装配保证）」；节点加 `listening` 握手（运维面每次装载 emit，入口层若已 `serving` 则重发），不依赖重跑次序。字面「运维面自读标识行」被节点起草者以反例（普通重启也破同起同停）否决，主线接受 | 契约 V-15 同步；节点「运维面重跑之后怎么恢复应答」对比表、T-18 两个次序的换代演练 |
| N-3 SC-2 导入白名单挡不住按字符串名订阅治理事件 | 入口层节点约束 5、SC-2 | 采纳：SC-2 扩到事件订阅——运维面只许 `on`／`once` 本包导出的三个通知名常量，只许 `emit listening`，不许字面或计算名 | 约束 5 与 verification SC-2 行改；自测加两例 |
| N-4 `openSignal` 以 config 承载运行时 Promise，依赖未列出的内核假设 | 入口层节点两步开闸 | 采纳：列为假设，按 source-check 取证 | 「依赖的上游机制语义」表加一行 |
| N-5 入口层 inject 边从提案的 6 增到节点的 8，代价未回写；第 8 条「换代或不可用」夸大了 inject 给的东西 | 本包 alternatives 代价表、design 第 8 条 | 采纳 | 本包回写：inject 8（`credentials`、`clock` 只为等它就位）、任一换代关门再开；第 8 条把换代（卸载重跑）与不可用（只是返回值）分开 |
| N-6 升级整体性（§6.9）与启动前只读核对（§6.10 第 1 行）没有契约条款，只活在装配节点 | PF-017 覆盖可见性；pg 上 U-3 | 登为显式缺口 **G-12**（无契约家，owner 架构主线；闭合条件：立一份部署级契约或并入入口契约新版本）；covers 以「缺口登记型」登 §6.9 → S-34 | 契约 S-34 新增声明；registry covers 两条 note 指 G-12 |
| N-7 开门续延的等钟轮询是否每 tick 重核 `fiberIsActive`；U-4「钟读不到，重启即可」在回拨时不成立 | 入口层节点、tenancy-host U-4 | 采纳 | 轮询每 tick 核 `fiberIsActive` 与闸仍 `closed`；U-4 改「钟读不到或回拨：重启前先核钟」，八处同改 |

**范围外待裁决（评审列出）**：传输分歧（cli 提案 D11 bearer 头 vs 入口信封在体）在 G-10 冻结时定；G-10／G-11 开着能否接受入口契约 v1，归产品负责人在接受决定上定。
评审时 PF-017 rev 1 与 AI v2 都未接受；PF-017 已于同日稍后接受，AI v2 仍是候选。

## 第二次：候选 A 牵连的三个提供者节点

对象：[account-identity 节点](../../../realization/packages/tenancy/account-identity/README.md)（v2 修订）、
[storage-sql 节点](../../../realization/packages/infra/storage-sql/README.md)（升级守卫）、[clock 节点](../../../realization/packages/infra/clock/README.md)（现读墙钟）。
**无阻断**。九条非阻断与主线处置：

| 发现 | 处置 |
|---|---|
| N-1 AI 把异步 scrypt 放进 sqlite 库级写锁，storage-sql「无外部等待」与 clock「至多一次锁等待」两条前提失真，登录负载耦合到时钟可用性 | 凭据校验与派生移出提交：S-15 事务外校验、事务内重读「已激活」并插入；S-13 事务外派生。两条前提不改 |
| N-2 「只有 S-44 认出示物」沿 OG S-36／S-37（参数 `unknown`）没有会失败的检查 | OG 节点把这两个参数收窄为 IV 品牌 `LoginStateId`，不再自 parse |
| N-3 「不导出派生函数」被写成挡绕行的机制；出示物进诊断输出只有动态检查 | 非导出改记「派生规则只有一处」；加包内规则：出示物品牌类型不得进 logger／emit／错误构造实参 |
| N-4 `confirmUpgrade(config)` 以 config 为键，交错实例时静默丢答复过的写 | 守卫对象随 config 传入：`upgrade: { checks, guard }`，`guard.confirm()` 返回 `{ migrated, snapshotRemoved }`，装配断言 `migrated ⇒ snapshotRemoved` |
| N-5 守卫缺席静默 | 有 `migrations` 时 `upgrade` 必须显式给（`{ checks, guard }` 或 `false`），缺席即配置错误 |
| N-6 非守卫实例不参与排他 | 写成运维约定「生产库不得被非守卫实例打开」，owner 装配 |
| N-7 R-C2 把 `synchronous=NORMAL` 的丢失窗口低估为「最近一次续约」 | 改写为自上次检查点起、受 OS 回写延迟约束的真实窗口；D-027 不复议，量级报产品负责人 |
| N-8 墙钟前跳后校正 ⇒ 停摆等于跳幅、无运维出口，不在代价表 | 加入代价表；运维出口归产品 |
| N-9 快照半成品无人清理 | 启动时清临时名 |

评审列出的范围外事项：W-1（启动窄带内不报原因）、W-2（跨 OS 崩溃的例外是否回写 PF-017 §6.10 与入口契约）归产品负责人与入口契约；
W-3 由 N-2 的处置闭合；W-4 各节点已登记。

## 仍未闭合的事项

- 两次评审都不产生接受；本包与契约的接受归 `record/decisions/`。
- 上表的处置正在各文件落地，落地后由检查器与各节点 verification 的「变化的影响」记录；评审时所依据的工作树状态未冻结。
- 设计层面的未决项在 [design.md 交接缺口](design.md#交接缺口)；会让落选方重新上桌的条件在 [alternatives.md](alternatives.md#推荐与改票条件)。
