# 验证义务

本文件列出本包的持续验证义务：性质、方法、前提与未覆盖。每一项都是后继实现必须通过的可观察结果，不是已经执行的测试。条款编号指 [SPEC](../SPEC.md)。数值目标在实测之前不写。

## 组 D：派生等于重算

| 编号 | 性质 | 方法 | 前提 | 条款 |
| --- | --- | --- | --- | --- |
| VS-D01 | 任一已提交前缀的七个派生索引等于从 `sl_entry` 重算的行集合 | 随机命令序列提交后，重算到影子表，按主键做集合差，差为空 | 真实 SQLite 或 PostgreSQL 提供者；没有内存替身 | [C-01](../SPEC.md#c-01) |
| VS-D02 | `sl_state` 等于从创建批次起 `reduce` 全部批次 | 每次提交后抽样比对；归约版本切换后重建得到同一快照 | 同上 | [C-01](../SPEC.md#c-01)、[R9](../SPEC.md#r9) |
| VS-D03 | `sl_model_view` 的每个 epoch 等于按 CM-01 朴素推导的模型视图 | 随机消息与压缩序列，比较视图行与直接推导的可见序列、`seq` 与 `prefix_digest` | CM-01 的朴素推导可用；压缩提交经 `decide` 的压缩分支形成 | [W4](../SPEC.md#w4) |
| VS-D04 | `sl_resident_idx` 对未归档、冻结未归档、已归档有未终结 Run、已归档无 Run 四类会话分别为有、有、有、无 | 四类会话各一，查 `references` | 登记键到能力身份的绑定成立 | [W3](../SPEC.md#w3)、[R10](../SPEC.md#r10) |
| VS-D05 | `sl_released_scope_idx` 只含已归档会话的释放读回，重复读回不重复 | 同一作用域读回两次，归档前读回一次 | — | [W3](../SPEC.md#w3)、[R11](../SPEC.md#r11) |
| VS-D06 | 不一致是 `StorageDefect`，不被忽略 | 人为改坏一行索引，符合性套件必须报缺陷并指出键 | — | [C-01](../SPEC.md#c-01) |

## 组 R：读路径的复杂度与退化

基准前提：N 从 10³ 到 10⁶，同一介质，同一硬件，按 benchmark 清单复核限制因素、可重复性与是否真的执行了工作。只报告趋势，数值进入 SPEC 的声明边界后才算目标。

| 编号 | 性质 | 方法 | 条款 |
| --- | --- | --- | --- |
| VS-R01 | R1、R3、R7、R8 的延迟不随 N 增长 | 基准 | [R1](../SPEC.md#r1)、[R3](../SPEC.md#r3)、[R7](../SPEC.md#r7)、[R8](../SPEC.md#r8) |
| VS-R02 | R2 的延迟随 K 与 B 线性，与 N 无关 | 基准，分无过滤、单 kind、多 kind、backward 四组 | [R2](../SPEC.md#r2) |
| VS-R03 | R2 在过滤极稀疏时按 `maxScanPerPage` 封顶并返回进度，不空转 | 稀疏 kind，核对 K、`scannedThrough` 与 `exhausted` | [R2](../SPEC.md#r2) |
| VS-R04 | R5 一页的延迟随 p 与 B 线性；压缩后旧依据立即得到 `epoch-changed` | 分页期间提交压缩 | [R5](../SPEC.md#r5) |
| VS-R05 | R9 全量重建为 O(N log M)，内存只需快照大小 | 10⁶ 条目的会话重建，记录峰值内存 | [R9](../SPEC.md#r9) |
| VS-R06 | 重建期间 R1、R8、R10、R11 返回 `unavailable` 带进度，R2、R3、R5、R7 照常 | 重建中并发读 | [R9](../SPEC.md#r9) |
| VS-R07 | R10、R11 每页 O(T log M + limit)，跨事务域游标不重不漏 | 多租户部署，分页取全集 | [R10](../SPEC.md#r10)、[R11](../SPEC.md#r11) |
| VS-R08 | 固定上界下分页完整，并发追加不进入本轮 | 属性测试：随机追加交错随机分页，拼接等于 H 内全集 | [C-02](../SPEC.md#c-02) |
| VS-R09 | 篡改游标一律 `invalid` | 换会话、换租户、扩过滤、改 H、改方向、改主体 | [C-03](../SPEC.md#c-03) |
| VS-R10 | 同前缀摘要相等，不同前缀以压倒性概率不等 | 属性测试 | [C-04](../SPEC.md#c-04) |
| VS-R11 | 每页的 `annotations` 恰为 H 之内、目标与本页条目相交、不在本页里且该主体可见的标注 | 在中间位置 `begin` 跳转读取，标注晚于目标提交；分别核对标注在本页内、在本页外、超过 H、主体不可见四种情形；与按 SE33 全量扫描得到的集合比较 | [R6](../SPEC.md#r6)、[R2](../SPEC.md#r2) |
| VS-R12 | 事务域目录缺席时 `references` 与 `releasedScopes` 返回 `unavailable`，不返回空页，也不返回部分租户 | 装配不给目录；多租户部署 | [XP-6](../SPEC.md#xp-table)、[R10](../SPEC.md#r10)、[R11](../SPEC.md#r11) |

## 组 W：写路径与并发写裁定

| 编号 | 性质 | 方法 | 条款 |
| --- | --- | --- | --- |
| VS-W01 | 每个 JC 行提交后，派生行与 `sl_state` 与 [W3](../SPEC.md#w3) 一致 | 每个 JC 行一个用例 | [W1](../SPEC.md#w1)、[W3](../SPEC.md#w3) |
| VS-W02 | 两个进程基于同一 `tail` 提交，只有一个成功，另一个得到 `changed` | SQLite 与 PostgreSQL 各一组交错用例 | [W6](../SPEC.md#w6) |
| VS-W03 | `receive` 的 `readThrough` 回退得到 `changed`；游标与条目同一事务 | 乱序事件 | [W5](../SPEC.md#w5) |
| VS-W04 | 材料缺项或多项时不写任何行 | 缺身份桥材料的 `accept` | [W1](../SPEC.md#w1) 第 3 步 |
| VS-W05 | 参加者路径下提交方失败时 Session 一侧不保存 | 注入 Agent 参加者语句失败 | [W2](../SPEC.md#w2) |
| VS-W06 | 压缩提交任一步失败整体回滚，旧 epoch 仍为当前 | 注入新 epoch 写入失败 | [W4](../SPEC.md#w4) |
| VS-W07 | 载荷超过内联阈值时先写 blob 再写条目，读回一致 | 阈值两侧各一 | [TB-04](../SPEC.md#tb-04) |
| VS-W08 | 读事务看不到未提交尾部 | 提交途中并发读 | 事务与并发 |
| VS-W09 | `rolled_back` 后退路重算的拒绝与事务内的结局相同；状态已变时为 `changed` | 对比模块内 `decide` 的结局与事务外再次调用 `decide` 的结局 | [W1](../SPEC.md#w1) 第 9 步 |
| VS-W10 | `decide` 往返：`reduce(前状态, decide(...) 的批次)` 得到命令要求的后态，且等于提交后 `readWork` 读到的快照 | 随机命令序列，每个 JC 行至少一例。对每次提交比较三者：命令要求的后态、`reduce` 结果、`sl_state`。`quarantined` 计为失败 | [W1](../SPEC.md#w1) 第 6、7 步、[编码与归约的拥有者](../SPEC.md#编码与归约的拥有者) |
| VS-W11 | 参加者模块不在 `decide` 之外调用领域服务，也不另写编码 | 实现的导入核对：参加者模块只从 `session-contract` 导入 OP-00 派生、`decide` 与 `reduce`，不直接导入 message 包的判定函数 | [编码与归约的拥有者](../SPEC.md#编码与归约的拥有者) |

## 组 F：失败分类与耐久

| 编号 | 性质 | 方法 | 条款 |
| --- | --- | --- | --- |
| VS-F01 | 失败分类表的每一行各得到表中的结果 | 每行一个注入用例 | [失败分类](../SPEC.md#失败分类) |
| VS-F02 | `unknown`、`writer_not_current`、锁等待超时都是 `commit-unknown`，不是 `not-committed` | 注入 | [W1](../SPEC.md#w1) |
| VS-F03 | 只有提供者的 `not_committed` 五项证明齐全时 R7 才给 `not-committed` | 旧写代际未排除时查询 | [R7](../SPEC.md#r7) |
| VS-F04 | `sl_entry` 缺口时该会话隔离，读写都 `unavailable`，不清空 | 人为删除中间一行 | [R9](../SPEC.md#r9) |
| VS-F05 | 已确认提交在普通进程终止后仍可读 | 回执已写、响应未回时结束 Worker，重启后 `queryOperation` | 提供者的进程级持久 |
| VS-F06 | 断电耐久 | 只在声明介质上的故障试验记录之后声明。普通重启、普通 kill、`synchronous=FULL` 的读回都不是断电试验 | [SQL-T01](../../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) |

## 未覆盖

- 对象存储作为 blob 去向。
- 多实例恢复扫描者并发读 `pending` 的租约协议。
- SQLite 独立读连接下的吞吐。现行存储契约只有写连接，基准只能在串行读写下取数。
- 任何数值目标。实测之前不写。
