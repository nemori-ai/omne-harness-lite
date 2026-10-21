# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。组内落位归[组架构](../../docs/architecture.md)，表与索引的形状归[对象模型](object-model.md)，时序归[关键流程](flows.md)。

本成员没有运行实现。`src/index.ts` 与 `src/cordis.ts` 只有模板标记。下文是 SPEC 固定的结构，文件名与导出名随实现确定。

## 模块与依赖

本成员是 Session 组里唯一接触介质的成员。它把 `session-contract` 声明的 `SessionTransactionPort<P>` 翻译成存储契约的一次提交与一组事务外 SQL 读取。根入口分成下列模块。进程内对象的身份与状态见[对象模型的进程内对象](object-model.md#进程内对象)。

| 模块 | 运行位置 | 持有的状态与资源 | 承担的 SPEC 行为 |
| --- | --- | --- | --- |
| 事务端口 | 调用方进程 | 每个事务域一个实例。只有预编译语句缓存与游标签名密钥的引用 | `commit` 的身份构造与结果映射（[W1](../SPEC.md#w1) 第 1、2、8、9 步）；把读操作交给读路径 |
| 参加者模块 `session` | 存储提供者的 Worker，存储事务之内 | 无状态。每次执行只用交入的语句端口 | 材料核对、原操作认回、条件核对、调用领域判断、写条目（[W1](../SPEC.md#w1) 第 3 至 7 步、[W2](../SPEC.md#w2)、[W5](../SPEC.md#w5)、[W6](../SPEC.md#w6)） |
| 派生维护 | 与参加者模块同一事务；也由重建调用 | 无状态 | 按条目与新旧快照生成派生行（[W3](../SPEC.md#w3)），压缩时写新 epoch（[W4](../SPEC.md#w4)） |
| 读路径 | 调用方进程，经存储的事务外读入口 | 每个事务域一个实例。只缓存 [RT-04](../SPEC.md#rt-04) 允许的派生物 | 读路径 R1 至 R8、R10、R11 |
| 重建 | 调用方进程，按批小事务写回 | `sl_rebuild` 进度行在库里，进程内不持有 | 快照追赶与派生索引重建（[R9](../SPEC.md#r9)） |
| 编解码 | 纯函数 | 无 | 64 位位置与品牌字符串互转（[TB-03](../SPEC.md#tb-03)）；游标签名与校验（[C-03](../SPEC.md#c-03)） |
| 迁移片段 | 随提供者的原子迁移执行 | 按版本排序的只读列表 | 权威表与派生表的 DDL 与数据迁移 |

```mermaid
flowchart LR
  Session[session 通用实现] -->|SessionTransactionPort| Port[事务端口]
  Port -->|commit、query| StoreC[存储契约]
  Port --> Read[读路径]
  Read -->|事务外读入口| StoreC
  StoreC -->|Worker 内 execute| Part[参加者模块 session]
  Part --> Derive[派生维护]
  Rebuild[重建] --> Derive
  Rebuild -->|小事务| StoreC
  Part --> Contract[session-contract 的纯函数]
  Rebuild --> Contract
  Read --> Codec[编解码]
  Port --> Codec
  Mig[迁移片段] -->|原子迁移| StoreC
```

依赖方向：

1. 本成员实现 `session-contract` 的 `SessionTransactionPort<P>`，并导入它导出的纯函数：OP-00 的身份派生、`decide`、`reduce` 与 `openWork`。压缩分支另用 message 包的 `judgeCompaction` 与模型视图推导（[CM-01 至 CM-06](../../../common/message/SPEC.md#模型视图)）。
2. 本成员依赖存储契约：`registerCombination`、`commit`、`query` 与参加者的语句端口。写连接、事务、Worker 与写者代际都归存储提供者，本成员不打开连接。存储契约还没有可依赖的 workspace 成员，期望写在 SPEC 的 [XP 表](../SPEC.md#xp-table)。
3. SQL 用 Kysely 组成，再经语句端口执行（[技术基础](../../../../docs/architecture/technical-foundations.md#共同技术选择)）。SQLite 与 PostgreSQL 共用一套表名与列名，方言差异只在本成员内部（[介质差异表](../SPEC.md#sqlite-与-postgresql)）。
4. 根入口不导入 `@deepseek-ai/cordis`（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 绑定只在 `./cordis` 入口，见 [Cordis 集成](cordis.md)。
5. 本成员不导入 `session`、`session-cordis`、`session-adapters` 或任何邻域契约。领域判断只来自 `session-contract` 与 message 包的纯函数，本成员不另写允许或拒绝的规则。

`package.json` 现在只列出 `@deepseek-ai/cordis`。上面的依赖随实现进入。

## 关键机制与理由

### 一个参加者，材料打包进同一条命令

本成员只向存储契约登记一个参加者，名字是 `session`（[参加者模块与材料](../SPEC.md#参加者模块与材料)）。Session 为提交方时，`{ command, guards }` 进同一条 `FactCommand`。`GuardCommand.participant` 是材料拥有者的标识，不是存储参加者名（[session-contract 的身份桥与证据桥](../../session-contract/SPEC.md#身份桥证据桥与-context-输入)）。参加者模块在事务里按命令种类核对材料集合。

理由：桥的材料不是能独立执行事实语句的拥有者。让每份材料各自成为存储参加者，装配要为每个桥登记 Worker 内模块，组合版本随桥的数量增长，而它们的事实最终只写 Session 的表。

### 命令到条目只编码一次

参加者模块在事务里调用 `session-contract` 的 `decide`，得到条目批次、原回执或拒绝结局，再调用 `reduce` 得到新快照（[领域服务与归约](../../session-contract/SPEC.md#领域服务与归约)）。本成员只为批次分配位置、写行和维护派生物，不另写编码。

理由：`decide` 的编码与 `reduce` 的解码必须互逆。两者同归一个拥有者并共用归约版本号，追赶与符合性重算才会得到与提交时相同的快照。SPEC 的 W1 第 6、7 步与[明确缺项](../SPEC.md#明确缺项)仍按「编码函数没有拥有者」书写，与契约现行的 `decide` 不一致，SPEC 需要跟进。

### 派生物在提交时维护

快照（`sl_state`）与七个派生索引在条目的同一事务里写入（[W3](../SPEC.md#w3)、[TB-02](../SPEC.md#tb-02)）。压缩提交在写入时物化新 epoch 的模型视图行（[W4](../SPEC.md#w4)）。读路径只读这些行，不在请求路径上重放日志或重算视图。

理由：读路径的成本必须与历史长度 N 无关（R1、R3、R5、R7、R8）。派生物在变化时算出一次，读取只做点查与范围扫描。代价是每次提交多写派生行，压缩提交多复制 O(|retained| + 保留尾) 行索引。派生物可以从 `sl_entry` 重算，所以它们不是第二份权威，[C-01](../SPEC.md#c-01) 以影子表集合差检查两者相等。

重判条件：某个读路径的退化条件在实测中成为常态，例如 R2 的稀疏过滤经常达到 `maxScanPerPage`，再考虑为它增加派生索引。新索引必须同时进入 W3、C-01 与重建。

### 读路径固定上界并签名游标

历史分页在 `begin` 时固定上界 H，游标是签名的自描述值，服务端不保存读会话（[R2](../SPEC.md#r2)）。epoch 视图读取以 `ModelViewBasis` 固定 epoch 与上界（[R5](../SPEC.md#r5)）。

理由：长期运行的会话持续追加。固定上界使一轮分页不重不漏（[C-02](../SPEC.md#c-02)），也不受并发提交影响。游标不在服务端存状态，读者断开不留下需要回收的资源。签名使篡改的游标得到 `invalid`（[C-03](../SPEC.md#c-03)）。签名密钥归装配，缺席时依赖游标的读操作返回 `unavailable`。

### 退路与诚实的未知

存储契约没有参加者的业务响应通道（[XP-2](../SPEC.md#xp-table)）。Session 自己提交的命令得到 `rolled_back` 时，事务端口在事务外重读快照，重新求拒绝结局（[W1](../SPEC.md#w1) 第 9 步）。`unknown`、`writer_not_current` 与锁等待超时都映射为 `commit-unknown`。只有存储 `query` 给出带五项证明的未提交时，才返回 `not-committed`（[R7](../SPEC.md#r7)）。

理由：把存储层回滚写成业务拒绝，或把尝试未生效写成从未提交，都会让调用方基于错误事实重做。不能证明时返回未知，由调用方按原身份认回。

### 不删除与隔离

本成员没有删除条目、批次、回执或旧 epoch 行的操作（[RT-01](../SPEC.md#rt-01)）。`sl_entry` 出现缺口、损坏或 `tail` 不一致时，隔离该会话：读写都返回 `unavailable`，不清空尾部（[R9](../SPEC.md#r9)）。

理由：日志是会话唯一的权威历史。交付责任解除之后，SE20 是消费侧唯一可恢复的来源（[RT-02](../SPEC.md#rt-02)）。静默修剪或丢弃尾部会让恢复读到与事实不同的状态，而且无法发现。

## SOLID 与扩展边界

| 原则 | 本成员的具体选择 | 必须防止的反例 |
| --- | --- | --- |
| 单一职责 | 事务端口只做提交翻译与结果映射；参加者模块只在事务里执行事实语句；派生维护只按条目生成派生行；读路径只读；重建只解释已提交事实 | 读路径写行或发通知；参加者模块里写允许或拒绝的规则；重建调用模型、工具或外部效果 |
| 开闭 | 新的事件种类经 `decide` 与 `reduce` 进入，本成员只在 W3 表加派生规则。阈值、分页上限与重建方式是配置 | 为某个命令种类在参加者模块里写特例编码；把内联阈值或 `maxScanPerPage` 写成常量 |
| 里氏替换 | 本成员是 `SessionTransactionPort<P>` 的一个实现。另一个存储提供者实现同一端口，就能替换本成员，`session` 不改 | 返回契约没有的结局；把 `rolled_back` 写成业务拒绝；索引重建中返回空页 |
| 接口隔离 | 事务端口只暴露契约的十一个操作。语句端口、Worker 模块与迁移片段不经事务端口外露 | 让 `session` 拿到语句端口或 `sl_*` 表的读入口 |
| 依赖倒置 | 本成员依赖 `session-contract` 的端口接口与存储契约的抽象，Cordis 绑定在 `./cordis` 入口。`session` 只依赖端口接口，不依赖本成员 | 根入口导入 Cordis；从连接、事务域或 Cordis 上下文推断租户 |

## 当前设计限制

下列限制各有拥有者。本成员不自造替代实现，也不用内存实现代替缺席的入口。

| 限制 | 现在的表现 | 拥有者与依据 |
| --- | --- | --- |
| 存储契约的参加者登记入口、业务响应通道、事务外读入口、`SqlValue` 形状、迁移挂接与事务域目录 | 缺哪一项，对应操作返回 `unavailable`，`owner` 为存储参加者 | 存储线（[issue 540](https://github.com/nemori-ai/omne-harness-lite/issues/540)），见 [XP 表](../SPEC.md#xp-table) |
| SQLite 只有一条写连接 | 读路径按独立读连接设计。现行契约下读取与提交在同一 Worker 队列串行，复杂度不变，吞吐待实测 | 存储线，见[明确缺项](../SPEC.md#明确缺项) |
| 对象存储作为 blob 去向 | 只有同库 `sl_blob` | [issue 541](https://github.com/nemori-ai/omne-harness-lite/issues/541) |
| 超过 `maxCommandBytes` 的内容 | 不能内联，也不能进同事务 blob。必须先由内容拥有者保管，再以耐久引用进入条目 | 存储的拥有者与各内容拥有者，见 [TB-04](../SPEC.md#tb-04) |
| 登记键到能力身份的绑定 | 假定 SE08 的登记键按能力身份列出。不成立时 R10 不可用 | Tool 契约与事件目录 |
| 数值目标 | 不声明任何数值。没有初值的策略配置由装配给出 | 本成员，按 [verification/obligations.md](../verification/obligations.md) 实测后写进 SPEC |
| 断电耐久 | 只依赖提供者读回的 `synchronous=FULL`，不宣称断电耐久 | 存储线 SQL-T01 |

## 验证与维护

SPEC 的[自有义务的验证](../SPEC.md#自有义务的验证)列出对应关系，方法、前提与未覆盖在 [verification/obligations.md](../verification/obligations.md)。现在没有实现，也没有执行过的行为测试。

| 保证 | 现在的验证 | 后续义务 |
| --- | --- | --- |
| 两个入口没有导出 | [public-entry.spec.ts](../tests/public-entry.spec.ts) 与 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言导出为空 | 导出进入后，改为核对导出集合 |
| 派生等于重算（C-01） | 没有 | 随机命令序列加影子表集合差 |
| 分页完整、游标不可篡改、前缀摘要（C-02 至 C-04） | 没有 | 属性测试与篡改用例 |
| 写路径与并发写裁定（W1 至 W6） | 没有 | 每个共同提交行一个用例；两个进程基于同一 `tail` 提交 |
| 读路径复杂度与退化（R1 至 R11） | 没有 | 基准，N 从 10³ 到 10⁶ |
| 两种介质行为一致 | 没有 | 同一套符合性用例分别跑 SQLite 与 PostgreSQL |

维护规则：

1. `session-contract` 的事务端口、`decide`、`reduce` 或事件目录改变时，同步 SPEC 的 W1 至 W5 与读路径、本页与[关键流程](flows.md)。归约版本号改变时，按 R9 重建 `sl_state`。
2. 新增事件种类或引用种类时，同步 W3 的派生表、C-01 的重算表与重建。
3. 表或索引的结构改变时，同步[对象模型](object-model.md)与迁移片段。权威表只增列。
4. 新增配置项时，同步[公开接口导航](public-api.md)与 [Cordis 集成](cordis.md)的配置 Schema。
5. 存储契约补上 XP 表的某一项时，删除 SPEC 里对应的退路与明确缺项，同步本页的设计限制表。
