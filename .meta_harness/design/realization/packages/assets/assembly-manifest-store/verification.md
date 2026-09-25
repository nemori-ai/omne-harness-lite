# assembly-manifest-store 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/assembly-manifest/verification.md`](../../../../spec/capabilities/assembly-manifest/verification.md)：本版不建形式工件（契约 S-25），证据全部是六条规范场景与故障注入，其中 S-26 必须是真并发。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（按会话哨兵、`owned_ref` 唯一索引、随机铸引用、在场事实作配置）。**本节点尚未建包，一切未开始。**

**共同前提**：跑在 `infra/storage-sql` 的 sqlite 临时文件库上（D-026 不提供 in-memory）；pg 那一半只在 `OMNE_TEST_PG_URL` 可连时跑，**跳过不是通过**。在场事实由测试种子给——S-31 记「**有前提：测试种子给在场事实**」（[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-35 ①）。

## 证据义务

### 契约的规范场景（六条，全部未开始）

| 场景 | 在本节点上怎样跑 | 状态 |
|---|---|---|
| [S-26 条件追加：两路并发恰一路成](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-26-条件追加两路并发恰一路成) | **两个存储实例**（同一库文件；pg 上两条连接）各起一个闭包，同时以 `expectedHead: 3` 追加，写事务里在判定与插入之间 `await` 让出。故障注入支：拿掉哨兵**并**拿掉主键（判定拆成「先读头、再写」）——**必须出现两条序号 4** | 未开始 |
| [S-27 装配那一次的回执丢了](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-27-装配那一次的回执丢了) | 子进程提交之后、回执之前被 `SIGKILL`；重开同一库文件后同参数重交；另一会话以同一引用 `given` | 未开始 |
| [S-28 按表时刻读回历史](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-28-按表时刻读回历史) | 演练 | 未开始 |
| [S-29 头与各类最后一条出自同一刻](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-29-头与各类最后一条出自同一刻) | 一个实例持续追加、另一实例反复 `readHead` | 未开始 |
| [S-30 读不到不是没有](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-30-读不到不是没有) | 故障注入：交给闭包一个读写一律抛 `StorageUnavailable` 的存储包装；恢复之后按 S-22 分清 `append` 上次写没写下 | 未开始 |
| [S-31 在场判定三种答](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-31-在场判定三种答) | 测试种子作 `presenceSource` | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| V-1 | **两个会话同时以同一引用 `given`**（[关键选择一](design.md#关键选择)第三条交错）：恰一个成，另一个 `evaluationRefConflict`；表里 `owned_ref` 只有一行 | 真并发演练（pg 上才会走重判路径；sqlite 上由库级写锁串行，走直判） | 未开始 | 本节点；pg 那一支待 `OMNE_TEST_PG_URL`（AMS-6） |
| V-2 | **哨兵是序列化点、主键是兜底**：只拿掉哨兵 ⇒ 两路仍恰一路成（后者撞主键、重判得 `headMismatch`）；重判路径上的判定次序与直判相同（构造同时命中 `recordNotFound` 与 `headMismatch` 的输入） | 故障注入，pg | 未开始 | 本节点（AMS-6） |
| V-3 | 在场事实：没有 `presenceSource` ⇒ `unavailable`；来源答读不到 ⇒ `unavailable`；快照缺一个名字 ⇒ `unavailable`，**不是**部分答复或 `absent`；来源抛出 ⇒ 缺陷上抛 | 单元测试 | 未开始 | 本节点 |
| V-4 | **静态检查**：本包没有对两张表的 UPDATE／DELETE；服务对象恰是契约的四个方法，没有写在场事实的方法；产品据点清单里本插件的配置不带 `presenceSource` | 结构检查（`tools/ts-checks` 候选规则，带故意违反即失败的自测）＋ 据点装配的清单检查 | 未开始 | 本节点 ＋ ts-checks owner ＋ 据点装配 |
| V-5 | **原样存**：超出 ±2^53 的整数、长小数在 `composition` 与 `content` 里原样读回；交来的值不是合法 JSON 值 ⇒ `invalidInput`；表里一行 JSON 文本被改坏 ⇒ 缺陷上抛，不折成 `unavailable` | 单元测试 ＋ 演练 | 未开始 | 本节点 |
| V-6 | `CHECK` 兜底：测试直接写一条 `reuse` 却带 `owned_ref` 的行 ⇒ `StorageDefect`；删记录行而表行还在 ⇒ `ReferenceViolation` | 演练 | 未开始 | 本节点 |
| V-7 | **铸引用**：十万次 `mint` 两两不同；注入一个撞既有引用的铸号器 ⇒ 缺陷上抛、表不变，**不**静默复用 | 单元测试 ＋ 故障注入 | 未开始 | 本节点 |
| V-8 | **公开函数面**：不装 Cordis，`judgeManifestAppend` 的五道次序（构造同时命中多道的输入，`alreadyRecorded` 先于 `headMismatch`）；`answerPresence` 的整次 `unavailable` | 单元测试 | 未开始 | 本节点；有实现即可跑 |
| V-9 | **与注册表互指的两条**：注册表节点 N-2（两个写入者撞条件追加）、N-9（被顶替快照的留存）在本节点上跑，不用测试替身 | 演练（随注册表节点） | 未开始 | 本节点 ＋ 注册表节点（R-M1、R-M9） |

## 实际执行

**无。**

## 覆盖缺口

- **全部条款没有任何实现证据**。
- **在场事实在产品装配里没有任何证据可取**（design AMS-2）：唯一能跑的是验收里的测试种子。
- **派发器读链与模型请求运行时读求值结果**（契约 G-4、design AMS-3）不在本节点的证据范围：本节点只证「原样存、原样交回」。
- **断电与升级恢复**（AMS-4、AMS-5）不在任何演练里：断电测不出；升级恢复那一半归据点装配的开闸次序。
- 契约 S-21 右列（协议须给）本节点一条都不兑现。

## 独立评审

**尚未评审。**
