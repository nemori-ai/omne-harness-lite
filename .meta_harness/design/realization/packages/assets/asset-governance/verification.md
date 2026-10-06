# asset-governance 验证与证据

契约侧的证据义务权威在两份验证入口：[`spec/capabilities/asset-governance/verification.md`](../../../../spec/capabilities/asset-governance/verification.md)（不建形式工件；规范场景 S-54～S-63，其中 S-55、S-58、S-59 有真并发一支）
与 [`spec/capabilities/asset-transfer/verification.md`](../../../../spec/capabilities/asset-transfer/verification.md)（TLA+ 行为模型三个已登记任务；规范场景 S-39～S-47、S-50、S-51、S-53）。本页按本节点的兑现点登记；**源码不存在，除主线已跑的三个 formal task 外一律「未开始」**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| AT S-7、S-8、S-9、S-10、S-12、S-17、S-18、S-22、S-31、S-32、S-49、S-52 的模型性质 | TLC：`asset-transfer-v2-transfer`、`-share`、`-revival` 三个已登记任务 | **已通过（形式，契约模型）**：运行 `2026-09-25-formal-assets-runtimes` 三个任务退出 0、无反例（[bindings](bindings.yaml)）。**它证的是契约模型在给定规模内的交错语义，前提是存储兑现了序列化、时刻严格递增**；不证本节点的锁真的兑现了 `SameCommit`，也不证时刻严格递增（N-1） | 提供者那一半是下面 D-1～D-12 的真并发演练 |
| AG [S-54](../../../../spec/capabilities/asset-governance/v2/contract.md#s-54-结构性禁止与权限判定分得开)～[S-63](../../../../spec/capabilities/asset-governance/v2/contract.md#s-63-钉住的不随发布走分享来的钉不住) 十条规范场景 | 演练；S-54 的 `S` 必须是超管；S-57 另跑一支 S-29 连登两次；S-60 另跑提升结束分享一支；S-62 两组逐字比对 | 未开始 | 本节点；源码与测试夹具（真实 `storage-sql`、真实 OG） |
| AT [S-39](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-39-两类待确认件的三种收场)～[S-47](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-47-不可用时明确失败)、[S-50](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-50-组织内分享与成员关系)、[S-51](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-51-方向矩阵逐格)、[S-53](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-53-分享方删除与提升分享随之结束) | 演练；S-39 关掉任何后台清理（本节点本来没有）；S-45 另跑「移除后再持有同一份」一支；S-46 受阻于 AT G-5 | 未开始；S-45 那一支依赖 N-1（`since` 严格递增）；S-46 受阻 | 本节点 |
| AT [S-44](../../../../spec/capabilities/asset-transfer/v2/contract.md#s-44-隶属解除之后分享失效复制留着不复活) 读序一支 | 契约写的是「读完 ① 之后、读 ② 之前注入解除—重建；颠倒两读应观察到复活」 | 未开始。**本节点在一次事务里取齐 ① 与 ②，没有「两读之间」**：改为在读事务进行中从另一连接提交「解除—重建」，观察判定与读事务开始时的状态一致（sqlite WAL、pg 各一遍）；「颠倒两读」一支在本实现上构造不出来，**不能按契约原文执行**（报主线） | 本节点 ＋ 主线（场景措辞是否按快照读改写） |
| D-1 AG S-55 并发一支 | 两连接真并发：租户层配值 vs 组织层加锁；只出现「配值先成随后被截断」或「被拒」 | 未开始 | 本节点；sqlite 与 pg 各一遍（L-3 在 pg 上才起作用） |
| D-2 AG S-58 并发一支 | 两连接真并发：读到引用方集合之后、提交之前另一方在同一组织层加入一份引用它的持有 ⇒ 移除 `hasReferrers` 且集合含新的那份 | 未开始 | 本节点；**这是 L-3 谓词保护的唯一实证** |
| D-3 AG S-59 | 两方真并发以同一 `expected` 发布：恰一方成 | 未开始 | 本节点（L-4） |
| D-4 团队 → 团队复制 vs 隶属解除（X-1） | 两连接交错：OG S-33 解除与本插件确认交错，复制不落在树外 | 未开始 | 本节点 ＋ OG 节点（外部依赖 X-1 落地之后） |
| D-5 同对分享的两次确认 | 两连接真并发确认同一 (资产, 被分享方) 的两份邀请：至多一份生效、第二份认回同一个 `SharingId` | 未开始 | 本节点（L-5 同对哨兵）；pg 一遍是必需的 |
| D-6 同一落点的两次落地、同一尝试键的两次发起 | 两连接真并发：只出现一条血缘、只多一个版本 | 未开始 | 本节点（L-5） |
| D-7 SAF-1 删除或移除 vs 确认 | 两连接真并发：只出现「先删后拒」「先确认后删」两种终态 | 未开始 | 本节点（L-4 ＋ L-3，PA-1） |
| D-8 确认 vs 成员退出再加入（X-3）与同一毫秒内的时刻 | 两连接交错：确认与 OG S-29／S-25 交错；另一支在**同一时钟分辨率内连做**「确认—退出—再加入」，那段分享必须判 `dissolved` | 未开始；同一毫秒那一支**受阻于 N-1**（`infra/clock` C-15），闭合前照原样记失败 | 本节点 ＋ OG 节点 ＋ `infra/clock` |
| D-9 锁次序不成环 | pg 上并发跑 OG S-32、S-29 与本插件确认、撤回、撤销、移除、删除、持有写，观察无死锁超时 | 未开始 | 本节点 ＋ OG 节点 |
| D-10 撤回 ‖ 确认同一份待确认件（AT S-21／S-25 vs S-22／S-26） | pg 两连接交错：确认读到 `pending` 之后、提交之前从另一连接撤回；只出现「先撤回后 `offerNoLongerValid`」或「先确认后 `alreadyConcluded`」两种终态，终结记录不被改写、撤回之后不落地 | 未开始 | 本节点（L-6 待确认件行） |
| D-11 撤销 ‖ 确认认回（AT S-28 vs S-26 ⑦） | pg 两连接交错：确认读到同对那份分享生效之后、提交之前撤销它；只出现「先撤销、确认新建一份」或「先认回、之后撤销」两种终态，被分享方不会拿到一份已撤销的分享 | 未开始 | 本节点（L-4 ＋ L-6 分享行） |
| D-12 被分享方移除 ‖ 删除（AT S-29 vs AG S-28／AT S-52） | pg 两连接交错：删除读到以它为资产的 `active` 分享之后、提交之前被分享方移除那一份；结束记录恰一条，`removed` 不被覆写成 `revoked`（反之亦然） | 未开始 | 本节点（L-6 分享行） |
| F-1 INV-1 确认一次成立 | 故障注入：落地写与终结记录之间让事务失败 ⇒ 两者都不在 | 未开始 | 本节点 |
| F-2 AT S-53 故障一支、AG S-27／S-28 ⑧ | 分享那一步写不下去 ⇒ 删除或提升整次 `unavailable`、资产与分享照旧 | 未开始 | 本节点 |
| F-3 AG S-61、AT S-47 | 故障注入：OG 服务面、存储、正文规则、时间源、事务内读各自不可用 ⇒ 一律 `unavailable`，无写入 | 未开始 | 本节点 |
| C-1 据点不 import 本包 | `tools/ts-checks` 规则 ＋ 「故意违反即失败」自测 | 未开始（N-12） | `tools/ts-checks` ＋ `apps/cli` 节点 |
| C-2 血缘对应只在流转模块（X-3） | `tools/ts-checks` 规则，或每个资产面、持有面读面一条「推不出源」的反例测试 | 未开始（N-9） | 实现者 |
| C-3 OG 事务内读入口只被本包 import | `tools/ts-checks` 规则 ＋ 自测 | 未开始（N-3） | `tools/ts-checks` ＋ OG 节点 |
| C-4 直接入口够不着 `lineage`、`sharing`；S-29 不在任何面上 | 类型测试（`@ts-expect-error`，去掉即红）与服务面方法清单的静态核对 | 未开始 | 本节点 |
| C-5 **修订波（2026-09-25 公开面）**：公开函数面只依赖纯模块（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，design「[公开面](design.md#公开面)」） | `tools/ts-checks` 规则：`./judgments` 子入口的源码只许 import `core/asset-model`、`core/asset-evaluation`、`core/identity-values`、`core/offer-expiry` 与本子入口目录内文件，带「故意违反即失败」自测；七个函数各一组单元测试，正反例取自两份契约的 examples 与规范场景（服务面场景走的是同一份实现） | 未开始；规则不存在 | `tools/ts-checks` ＋ 本节点 |
| P-1 插件可重跑、无内存事实 | 换一次 `storage` 提供者，插件体重跑，事实不丢、官方件不多出版本 | 未开始 | 本节点 |
| P-2 配置错误即启动失败 | 非正时长、非正保留期、不合法清单条目各一支 ⇒ fiber `FAILED`，一个面都不 provide | 未开始 | 本节点 ＋ tenancy-host |
| P-3 监听者抛出不改变已提交的事实 | 登记一个抛出的监听者，写操作照常返回、事实已提交、error 日志一条 | 未开始 | 本节点 |

## 覆盖缺口

- **全部实现证据缺席**：源码不存在；上表除形式三行外全部未开始。
- **模型吸收的语义不作证据、不绑**：`TypeOK`；`EffectsOnlyFromConfirmation`（效果与终结记录写在同一动作里）；`EndedStable`；AT S-52 的提升一支（`Promote` 守卫不看分享、按构造成立）；AT S-9 的两读先后（`Use` 一步原子读）；「血缘只在落进的那一层里找」（两个计数互不相干）；AT S-20 ⑦ 尝试键认回（版本数不在模型里）。它们的证据形式是上表对应的场景。
- **AT S-44 读序一支**按本节点的快照读改写执行，契约原文的「颠倒两读」一支构造不出来——报主线定场景措辞。
- **时刻严格递增**（N-1，`infra/clock` C-15）落地之前，D-8 同一毫秒那一支与 AT S-45「移除后再持有」那一支都跑不出绿——两支标「**有前提：C-15**」（C-15 已按 D-060 §八 N-34 排为实施程前置任务 W-0e，落地后这两支是通过条件），不靠「等一会儿再做」变绿。
- **pg 一侧**：L-1～L-6 在 sqlite 上都是空操作，sqlite 上的演练证不了锁；pg 不是本版部署目标，但 D-2、D-4、D-5、D-8～D-12 的 pg 一遍是这些锁的唯一实证。
- **待核对主张与假设**：H-1（`ctx.provide` 由 effect 纳管，kernel-basis probe 已过、未升格）；H-2（事件不跨进程）与 H-4（`intercept` 合并顺序）是假设、没有 probe，**待补**；H-3 是 `core/storage` 协议的前提，`lockSentinel` 在 pg 上的覆盖本节点未核。
- **受阻消费者**：资产的全部用户流程（N-5，未来资产/据点入口（版本未分配））；存量组织上的分享（N-11，半径是被分享方整个组织的快照）。
