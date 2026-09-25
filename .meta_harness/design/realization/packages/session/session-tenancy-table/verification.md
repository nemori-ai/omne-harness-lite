# session-tenancy-table 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/session-tenancy/verification.md`](../../../../spec/capabilities/session-tenancy/verification.md)：本版不建形式工件（契约 S-12），证据全部是三条规范场景。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务。**本节点尚未建包，一切未开始。**

**共同前提**：跑在 `infra/storage-sql` 的 sqlite 临时文件库上（D-026 不提供 in-memory），映射由 `./seed` 写——**只在测试种子上跑通的场景记「有前提：测试种子代会话那一程写映射」**（[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-35 ①），不计入实际验证完成数。

## 证据义务

### 契约的规范场景（三条，全部未开始）

| 场景 | 在本节点上怎样跑 | 状态 |
|---|---|---|
| [S-13 答出的就是记下的那一个，而且不变](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-13-答出的就是记下的那一个而且不变) | 种子写 `s1 → T1`；连读两次；撤掉插件与存储、在同一库文件上重装再读 | 未开始 |
| [S-14 没有记录不是没有租户](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-14-没有记录不是没有租户) | 读 `s9` 得 `sessionNotFound`；种子写 `s9 → T2` 后再读得 `T2` | 未开始 |
| [S-15 读不到就是读不到](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-15-读不到就是读不到) | 故障注入：交给闭包一个 `read` 一律抛 `StorageUnavailable` 的存储包装（或关掉存储实例），读 `s1` 与 `s9` 都得 `unavailable`；本节点不缓存，所以 `s1` 也是 `unavailable` | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| V-1 | **结构检查**：产品包里没有对 `session_tenancy` 的 UPDATE／DELETE；`./seed` 只被 `apps/cli` 的测试代码 import（STT-4） | 结构检查（`tools/ts-checks` 的规则，候选），带「故意违反就失败」的自测 | 未开始 | 本节点 ＋ ts-checks owner |
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
- **断电与升级恢复下的「答案不变」**（design STT-3）不在任何演练里：断电测不出；升级恢复那一半归据点装配的开闸次序。
- 契约 S-10 右列（协议须给）本节点一条都不兑现。

## 独立评审

**尚未评审。**
