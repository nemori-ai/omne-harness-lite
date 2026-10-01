# session-tenancy-table 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/session-tenancy/verification.md`](../../../../spec/capabilities/session-tenancy/verification.md)：本版不建形式工件（契约 S-12），证据全部是三条规范场景。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务。**本节点尚未建包，一切未开始。**

**共同前提**：跑在 `infra/storage-sql` 的 sqlite 临时文件库上（D-026 不提供 in-memory），映射由 `./seed` 写——**只在测试种子上跑通的场景记「有前提：测试种子代会话那一程写映射」**（[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-35 ①），不计入实际验证完成数。

## 证据义务

### 契约的规范场景（三条，全部未开始）

| 场景 | 在本节点上怎样跑 | 状态 |
|---|---|---|
| [S-13 答出的就是记下的那一个，而且不变](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-13-答出的就是记下的那一个而且不变) | 种子写 `s1 → T1`；连读两次；撤掉插件与存储、在同一库文件上重装再读。**前提**：种子写入之前已走完存储升级确认（否则重开时快照恢复，那一行随之消失，场景失败不是本节点的错）；这一前提已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点）；测试不经那个 `boot` 自搭存储时须自己先确认（STT-3） | 未开始 |
| [S-14 没有记录不是没有租户](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-14-没有记录不是没有租户) | 读 `s9` 得 `sessionNotFound`；种子写 `s9 → T2` 后再读得 `T2` | 未开始 |
| [S-15 读不到就是读不到](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-15-读不到就是读不到) | 故障注入：交给闭包一个 `read` 一律抛 `StorageUnavailable` 的存储包装（或关掉存储实例），读 `s1` 与 `s9` 都得 `unavailable`；本节点不缓存，所以 `s1` 也是 `unavailable` | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| V-1 | **结构检查**：产品包里没有对 `session_tenancy` 的 UPDATE／DELETE；`./seed` 只被 `apps/cli` 的测试代码 import（STT-4） | 结构检查（`tools/ts-checks` 的规则，候选），带「故意违反就失败」的自测 | 未开始 | 本节点 ＋ ts-checks owner；**本节点「可实施」的前置**（design STT-4）：落地之前本节点不声称可实施 |
| V-2 | 表里存的租户值不合 `TenantId` ⇒ 抛出缺陷、error 日志；**不是** `unavailable`、**不是** `sessionNotFound` | 演练（测试直接写一行坏值） | 未开始 | 本节点 |
| V-3 | 表不存在（迁移没合成）⇒ `StorageDefect` 原样上抛，不折成 `unavailable` | 演练 | 未开始 | 本节点 |
| V-4 | 迁移片段跑两次无错；种子对同一会话写另一个租户 ⇒ `UniqueViolation.constraint = 'session_tenancy_pkey'` 抛出、旧值不变 | 演练 | 未开始 | 本节点 |
| V-5 | **公开函数面**：不装 Cordis，`createSessionTenancyReader(storage)` 直接在一份临时库上答 S-13～S-15 | 单元测试 | 未开始 | 本节点 |
| V-6 | `storage` 换代 ⇒ 插件重跑，重跑前后同一会话答案相同（契约 S-11 第 1 条） | 演练（`bootAssembly` 换一个存储实例指向同一库文件） | 未开始 | 本节点 |

## 实际执行

**无。**

## 覆盖缺口

- **全部条款没有任何实现证据**。
- **产品装配里没有写入方**（design STT-1）：一切场景都靠测试种子，产品路径上本节点只会答 `sessionNotFound`——那是契约 G-2 的如实后果，不是可演练的「通过」。
- **断电与升级恢复下的「答案不变」**（design STT-3）不在任何演练里：断电测不出；升级恢复那一半由「开闸在确认之后」挡住，已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点）——本节点这里没有演练，演练归那条义务。
- 契约 S-10 右列（协议须给）本节点一条都不兑现。

## 独立评审

### 独立评审 N6

architecture-reviewer 对本节点的独立只读评审（N6，2026-09-25），无阻断项。下表是起草者对归本节点各项的处置；**处置不等于评审方复核通过**，复核与接受另行。

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| A-3 | STT-3 引的「开闸在确认之后」由据点装配承接，而 session-log-jsonl 那一侧的承接引用有误（M48 A-1 讲撤除次序） | 改：STT-3 末列、「归装配的事项」、「报给主线」改引与 SLJ-2 同一前提 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前)（A-28）——cli 节点随后写出了这一时点，前提已有承接者；S-13 场景写明「种子写入之前已走完升级确认」这一前提 | [缺口](design.md#实施缺口与消费者影响) STT-3；design [「归装配的事项」段](design.md#装配给与协议给本节点单机怎样兑现左列)；本页 S-13、覆盖缺口 |
| B-4 | `./seed` 的对比缺第三条路：包只公开表名／列名常量与迁移片段，写函数放 `apps/cli` 测试代码 | 坚持 `./seed`：关键选择三补第三列，写明它在三处不如 `./seed`（写的语义有两个家；表形状变成跨包公开面；「零写入口」不自执行，守它的检查比 import 图规则难写）；STT-4 的结构检查列为本节点「可实施」的前置 | [关键选择三](design.md#关键选择)；缺口 STT-4；[README](README.md) 可实施范围；本页 V-1 |

A-4、B-5（cli 验收装配表）与 B-1（主线）不归本节点，本节点未动。

## 设计 rev 2 候选证据义务

[本轮设计](v2-design.md) 仍消费 ST2。以下只追加证据义务，不将旧设计已接受或 storage/OG 测试通过算作本节点已验证。此前 V-1 中“只许 CLI 测试”的旧允许范围由 rev 2 候选替代；在新采用与守卫落地前保留 STT-4 的实施阻断。

| 编号 | 条款与反例 | 当前状态及 owner |
|---|---|---|
| V2-1 | ST2 S-2/S-6：固定 seed import 允许集与无 UPDATE/DELETE；允许的 bootstrap/两处 tests 通过，其他 app、插件、包 tests、伪 test 文件、转导出、相对路径穿透失败；扫描根必须包含 apps | 未开始；本节点与 ts-checks owner，STT-6 可实施前置 |
| V2-2 | ST2 S-5/S-6：真实临时文件库 seed 同值幂等，异值抛 `session_tenancy_pkey` 且旧值不变；同值/异值双调用并发检验唯一约束 | 未开始；允许范围内的验收 app 测试，不假造领域会话创建支持 |
| V2-3 | ST2 S-7/S-8：普通独立闭包校验非法输入零查询、无记录/不可读分开、坏租户与缺表抛缺陷；重装同库答案保持；SessionRef 与冻结 messages2 公共 Schema 对齐 | 未开始；本节点实施者，沿旧 V-2～V-6 |
| V2-4 | ST2 S-8：真实 StorageUnit 内参与读与 OG/配方串行同单元；错误实例、过期单元、重叠调用必须失败；将实现换成普通 storage.read 应被嵌套拒绝/断言捕获 | 未开始；本节点及采用参与面的 input-store owner；SQLite 范围，不代证 PG |
| V2-5 | ST2 S-8/调用方提交义务：先暂存一项写再令参与读 StorageUnavailable，异常退出 run 后外层不能提交；缺陷不能映射 unavailable；两条竞争交错见 rev 2 存储要求 | 未开始；本节点、input-store 与独立验收者，共享实际对象，不以 mock 两次返回冒充事务 |
| V2-6 | ST2 S-10/S-11：所有必需 fiber ACTIVE 后 guard.confirm，成功后才 seed/受理；确认失败零 seed/受理；撤除等已进事务完成后关闭 storage，映射不删除 | 未开始；`apps/model-request-acceptance` 与旧 CLI 验收 owner，继承 STT-3 前提 |

STT-6～STT-8 的阻断与 owner 在 [rev 2 缺口](v2-design.md#缺口与受阻消费者)；完整会话写面仍 STT-1/STT-2。本轮绑定保持 0；实际运行只在执行后接续，不预填通过数。

2026-09-27 本轮实际执行设计检查 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，退出 0；所有 formal 明确跳过。新稿 v2-design.md 的 Prettier 检查与本节点 `git diff --check` 通过；旧 design.md 与基线无差异。本结果仅覆盖设计链接/登记及文本检查，没有执行 seed 守卫、存储参与读或验收应用；以上实现义务仍未开始。
