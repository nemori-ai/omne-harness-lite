# credential-custodian-local 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/credential-custodian/verification.md`](../../../../spec/capabilities/credential-custodian/verification.md)：一份 TLA+ 模型（已运行）加七条规范场景（未开始）。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（锁同一绑定行、附加认证数据、密钥现读与启动时生成、存储异常剥值）。**本节点尚未建包，一切未开始。**

## 证据义务

### 契约的形式工件：已运行，不作本节点的绑定

formal task `credential-custodian-v1-sweep`（[run 2026-09-25-formal-credential-custodian](../../../../record/evidence/2026-09-25-formal-credential-custodian/README.md)：正配置无反例，三份去保护配置与两个探针按预期）证的是**契约模型**：「只丢三种」与「按排到之后读的时刻判」缺一即有反例。它把「在绑定上排序」建成每个动作的原子性——**这条被建模方式吸收，模型不检查它**；而本节点对 S-18 的份额恰是这一条（锁同一绑定行、锁到之后取时刻）。所以它是本节点设计的依据，不是本节点实现的证据；[bindings](bindings.yaml) 不登记它。本节点那一份的证据是下面的 S-28 与 N-1。

### 规范场景（七条，全部未开始）

契约 verification 列每条的证据形式；本表只写**在本节点上**额外受阻于什么、前提是什么。

| 场景 | 本节点上的形式与前提 | 另外受阻于 | 状态 |
|---|---|---|---|
| [S-22](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-22-离线用副本) 离线用副本 | 验收装配：测试登录状态经 `storeReplica` 写种子，切断中心连接后调模型 | P-1r 向中心取值不在本版（MPD-N2）：只能验「副本在就交出」那一半，**有前提：测试种子** | 未开始 |
| [S-23](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-23-另一个账号的据点读不到) 另一个账号的据点读不到 | 两个据点各一份 `storage` 与各自的 `keyFile`；把 A 的两张表的行拷进 B 的库再读 | 读法：拷的是条目、B 的密钥不变（CCL-7）；连密钥文件一起拷属契约 S-3 不挡 | 未开始 |
| [S-24](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-24-登录状态结束副本随之清除) 登录状态结束，副本随之清除 | 集成测试（sqlite 与 pg 两方言） | 产品里没有调用方（CCL-4）：测试直接调 `discardLoginState` | 未开始 |
| [S-25](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-25-oauth-条目待生效时不交出granted-才交出) 待生效不交出，`granted` 才交出 | 对真实存储：绑定行由桥的迁移建表、测试按桥的写法迁状态；故障注入：绑定读失败 ⇒ `unavailable` | 桥的事务内读函数（CCL-1） | 未开始 |
| [S-26](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-26-加密落地) 加密落地 | 以已知原文逐字节扫库文件（sqlite 主文件与预写日志都扫）；**运行期**让密钥文件读不到（改权限或挪走）⇒ 四个操作 `unavailable` | —— | 未开始 |
| [S-27](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-27-秘密不出本契约) 秘密不出本契约 | 哨兵扫全部返回、失败值、工程记录与结构化日志；**加一支**：在 pg 上造一次引用主键冲突与一次引用约束失败，断言日志里没有引用（N-4） | —— | 未开始 |
| [S-28](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-28-清扫与完成交错) 清扫与完成交错 | **真并发**：见 N-1；按装配给的 `sweepInterval` 计时，前提「一轮在 `sweepInterval / 2` 内做完」（CCL-8） | 桥（本体或按它的写法迁状态的测试件）；桥的事务内读函数（CCL-1） | 未开始 |
| [examples §4](../../../../spec/capabilities/credential-custodian/v1/examples.md#4-每个失败值一个反例) 失败值与次序 | 每个失败值一个反例 ＋ 三条次序回归例；**加一条**：密钥读不到且这个租户没有副本 ⇒ `unavailable`（不是 `absent`） | —— | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **清扫与完成在绑定行上排序**（[跨 owner 一节](design.md#跨-owner-的同一提交桥的绑定行与引用约束)）：pg 上两个连接，一边按桥的写法锁绑定行迁 `granted`，一边清扫，在恰好过期那一刻反复跑；断言每轮要么「`granted` 且交得出」、要么「未迁 `granted` 且条目被删」。**变异**：清扫不锁绑定行（或在锁之前删）时这条演练要能红 | 真并发演练（pg；sqlite 由库级写锁天然排序，另跑一遍作回归） | 未开始 | 本节点 ＋ 桥节点（CCL-1） |
| N-2 | **`discardLoginState` 与改归属的 `storeReplica` 并发**（[副本表一节](design.md#同一张副本表上的两个写入者)）：pg 上断言被并发改归 `L2` 的那一行不被 `L1` 的删除带走 | 真并发演练（pg） | 未开始 | 本节点 |
| N-3 | **附加认证数据绑条目身份**：把租户甲那一行的 `sealed_body` 写进租户乙那一行 ⇒ 乙 `readReplica` 得 `absent` 并留一条记录；OAuth 条目挪到另一份持有的行上 ⇒ `notResolvable`。**变异**：去掉附加认证数据时这条要红 | 单元 ＋ 集成测试 | 未开始 | 本节点 |
| N-4 | **存储异常剥值**：pg 上造一次 OAuth 条目主键冲突（注入固定的「随机」引用）与一次 `missing-target`；断言上抛的异常与日志里没有引用串、没有本体 | 集成测试（pg），哨兵 | 未开始 | 本节点 |
| N-5 | **密钥文件的启动判定**（[关键选择四](design.md#关键选择)）：缺席 ⇒ 生成、`0600`、32 字节；两个实例同时启动只生成一份（`EEXIST` 转读）；对 group 可读、长度不对、读不到 ⇒ 启动失败、诊断不含内容；缺席而表里已有条目 ⇒ 生成并留 error 级记录（写条数，不写引用） | 集成测试 | 未开始 | 本节点 |
| N-6 | **撤除**：撤除开始后到达的与还没进事务的得 `custodianWithdrawn`；已进事务的跑完、按那一次提交收场；存储同时撤除时在事务里失败的收成 `custodianWithdrawn`；撤除前后两张表与密钥文件逐字节不变 | 演练 | 未开始 | 本节点 |
| N-7 | **配置错误一个政策**：`keyFile` 缺席或不是绝对路径、`sweepInterval` 或 `oauthPendingTtl` 缺席或非正 ⇒ 装配启动失败、诊断点名那一项不含值；`oauthPendingTtl` 与桥的那一项相等（装配测试） | 单元测试 ＋ `apps/cli` 装配测试 | 未开始 | 本节点 ＋ `apps/cli`（CCL-3） |
| N-8 | **公开函数面**：`sweepVerdict` 恰三种交回 `discard`（逐格穷举绑定三态 × 过期与否 × 记的是不是它）；`resolveVerdict` 五种都交回同一个 `notResolvable`；`openBody` 对错钥、错身份、截断都交回 `unopenable` 不抛；都不装 Cordis、不给存储即可调 | 单元测试 | 未开始 | 本节点；有实现即可跑 |
| N-9 | **调用点限定**：`readReplica` 只许 P-1r、`depositOAuth`／`resolve` 只许桥本体解析；本包不 `emit`、不监听；本包源码不出现 `Math.random` | 结构检查（`tools/ts-checks`，候选规则），带「故意违反就失败」的自测 | 未开始 | MPD-N4 ＋ 桥 N-14 ＋ ts-checks owner；本节点提供方法名 |
| N-10 | **桥的事务内读函数与本节点的约定**：桥改 `mcp_oauth_binding` 的四列之一而不改读函数时，本节点的 S-25 集成测试要红 | 集成测试（引用桥的迁移片段与读函数） | 未开始；受阻于 CCL-1 | 本节点 ＋ 桥节点 |
| N-11 | 上游语义取证（CCL-11）：GCM 认证失败在 `final()` 抛、`'wx'` 不覆盖、同一句柄 `fstat` | 各一条会失败的测试（Node 24.18.0 起） | 未开始 | 本节点 |

## 实际执行

**无。**本节点没有源码；契约模型的那一次运行见上文，不计入本节点。

## 覆盖缺口

- **全部条款没有任何实现证据**：源码、测试、集成运行都不存在；[bindings](bindings.yaml) 为空。
- **受阻**：桥的事务内读函数（CCL-1）挡着 S-25、S-28、N-1、N-10——受阻消费者：桥的 `resolve` 与 `completeOAuth`、P-1r 离线取凭据的验收（S-22 那一半）。
- **只能在测试种子上跑通的**（D-040 §八 N-35 ①）：S-22（副本来路 G-6）、S-24（调用方 G-5）——记「有前提：测试种子」，不计入实际验证完成数。
- **契约读法已裁、待契约措辞**：S-23 只拷条目、密钥不变（CCL-7）；S-18 第 4 条上界的前提是一轮在 `sweepInterval / 2` 内做完（CCL-8）。S-23、S-28 两行按这两条读法演练。
- **契约 S-19 右列（协议须给）**本节点一条都不兑现。

## 独立评审

**尚无。**本节点首稿未经独立评审；评审意见与处置落在这里，处置不等于评审闭合。
