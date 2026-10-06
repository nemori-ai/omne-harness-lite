# 验证覆盖与实际证据

`capability.credential-custodian` v2（candidate）的证据义务与执行状态。本文件可更新，位于规范版本目录之外；
结果始终绑定实际规范、模型与实现修订。

**当前状态（2026-09-25）：形式工件有证据，规范场景仍无。**没有实现，没有执行过任何场景；形式模型已执行一次（run `2026-09-25-formal-credential-custodian`，正配置无反例、五份核对全按预期）。
**通过不提升状态**（契约仍是 candidate）；有限检查不是证明，范围与前提见下表与那次 run 的「边界」。

## 证据义务

### 形式工件

| 条款与性质 | 模型与配置 | 前提 | 状态 |
|---|---|---|---|
| [S-18](v2/contract.md#s-18-清扫) 第 1、2 条：`GrantedResolvable`（绑定 `granted` ⇒ 记下的条目还在） | [`Sweep.tla`](v2/formal/Sweep.tla)，主配置 [`Sweep.cfg`](v2/formal/Sweep.cfg)（formal task `credential-custodian-v2-sweep`）；去保护配置 `Sweep_Validity_SweepNotGranted.cfg`、`Sweep_Validity_StaleCompletionTime.cfg` 须各给出反例 | 每个动作对它所碰的绑定原子（＝在绑定上排序，装配给）；同一时间源、读数不回退；`CompleteFreshTime` 是桥一侧的前提 | **已运行：主配置无反例**（`-workers 4` 那一次退出 0：7,883,874 generated · 2,303,290 distinct · 3 min 26 s；按旧登记的单 worker 那一次 300 s 超时、未得结论，不计）；`SweepNotGranted`、`StaleCompletionTime` 两份去保护配置各推翻 `GrantedResolvable`（退出 12），按预期 |
| [S-18](v2/contract.md#s-18-清扫) 第 4 条：`OrphanEventuallySwept` | 同一模型，主配置；去保护配置 `Sweep_Validity_NoSweep.cfg` 须给出反例 | 每条条目上 `Sweep` 的弱公平性（本能力在场、存储与绑定读得到）；**上界 `sweepInterval` 不在模型里** | **已运行：主配置无反例**（同上一次）；`NoSweep` 推翻 `OrphanEventuallySwept`（退出 13），按预期 |
| 两个探针（`granted` 可达、丢弃可达） | `Sweep_Reach_Granted.cfg`、`Sweep_Reach_Discard.cfg`，须各被反驳 | 同主配置 | **已运行：两个都被反驳**（退出 12，两个状态都可达） |

**证据**：run `2026-09-25-formal-credential-custodian`（模型与配置取自 `a3877671`，到 `c6aa2fed` 未改；各目录带实际命令、输入快照 `SHA256SUMS` 与 TLC 原始日志）。正配置的结论以 `-workers 4` 那一次为准：两次的输入逐字节相同，第一次只是登记的时限太紧。
**边界**（照那次 run）：常量取值（两个绑定、三个引用、`TTL = 1`、`MaxTime = 3`）与关闭的路径见 [formal 入口](v2/formal/README.md)，**有限检查不是无条件证明**；模型只覆盖 S-18 的清扫与 `granted` 的可解析；「在绑定上排序」与 `sweepInterval` 上界是前提、不在模型里，证据归场景 S-28；`OrphanEventuallySwept` 依赖 `Sweep` 的弱公平性，那是前提不是结论。**通过不提升本契约的状态。**

**运行方式**（登记在 `registry/formal-tasks.json`，`timeout_seconds` 900）：`${JAVA_BIN} -cp ${TLA2TOOLS_JAR} tlc2.TLC -metadir tmp/tlc/credential-custodian-v2-sweep -cleanup -noGenerateSpecTE -workers 4 -config spec/capabilities/credential-custodian/v2/formal/Sweep.cfg spec/capabilities/credential-custodian/v2/formal/Sweep.tla`（工作目录 `.meta_harness/design`）；去保护配置与探针换 `-config` 即可，它们不登记为 formal task。

### 规范场景

| 条款与性质 | 场景 | 证据形式与前提 | 状态 |
|---|---|---|---|
| [S-12](v2/contract.md#s-12-storereplica)、[S-13](v2/contract.md#s-13-readreplica) 离线用副本；`absent` 与 `unavailable` 分开 | [S-22](v2/contract.md#s-22-离线用副本)；[examples §1](v2/examples.md#1-副本写读离线按登录状态清除) | 验收装配：切断中心连接后调模型（cli 验证入口 M47 第 ①、② 条的这一半） | 未开始 |
| [S-6](v2/contract.md#s-6-据点隔离与按登录状态归属) 第 1 条据点隔离 | [S-23](v2/contract.md#s-23-另一个账号的据点读不到)；[examples §2](v2/examples.md#2-据点隔离与加密落地) | 同一台机器两个账号两个据点；另把落地内容拷过去再读（cli 验证入口 M47 第 ③ 条） | 未开始 |
| [S-15](v2/contract.md#s-15-discardloginstate) 只删归属它的 | [S-24](v2/contract.md#s-24-登录状态结束副本随之清除) | 集成测试 | 未开始 |
| [S-16](v2/contract.md#s-16-depositoauth)、[S-17](v2/contract.md#s-17-resolve) 待生效不交出、五种 `notResolvable` 不分、读不到是 `unavailable` | [S-25](v2/contract.md#s-25-oauth-条目待生效时不交出granted-才交出)；[examples §3](v2/examples.md#3-oauth-条目收下交出清扫) | 对真实存储的集成测试；**故障注入**（绑定读失败） | 未开始 |
| [S-7](v2/contract.md#s-7-加密落地) 加密落地、密钥取不到即 `unavailable`、打不开按「没有」并留记录 | [S-26](v2/contract.md#s-26-加密落地) | 以已知原文逐字节扫落地内容；**故障注入**（密钥取不到、条目损坏） | 未开始 |
| [S-8](v2/contract.md#s-8-秘密与引用只在各自那一个问法里出现) 秘密与引用只在各自那一个问法里 | [S-27](v2/contract.md#s-27-秘密不出本契约) | 哨兵扫全部返回、失败值、工程记录与日志（cli 验证入口 M47 第 ④ 条）；另加静态检查：`readReplica` 只许模型档案读提供者解析，`depositOAuth`、`resolve` 只许 MCP 桥 | 未开始 |
| [S-18](v2/contract.md#s-18-清扫) 清扫与完成交错、有界 | [S-28](v2/contract.md#s-28-清扫与完成交错) | **必须真跑并发**；按装配给的 `sweepInterval` 计时；前提：两边同一时间源 | 未开始 |
| [S-10](v2/contract.md#s-10-失败值) 失败值闭合与判定次序 | [examples §4](v2/examples.md#4-每个失败值一个反例) | 每个失败值一个反例 ＋ 三条次序回归例 | 未开始 |

### 由别处承担、本契约只写明要求的

| 要求 | 由谁承担 | 本契约位置 |
|---|---|---|
| OAuth 条目与绑定共有一个排序点（同一存储、同一约束域） | 提供者与桥的装配（桥节点 R-B5、C-1～C-3） | [S-19](v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行 |
| 完成时过期按排到之后的时刻判 | `capability.mcp-bridge` 的提供者（桥节点 C-3 与 `completeOAuth` 那一行） | [S-18](v2/contract.md#s-18-清扫) 第 2 条；模型的 `CompleteFreshTime` |
| 取值问法只许具名消费者解析 | 装配与静态检查（模型档案目录节点 MPD-N4 那一类） | [S-19](v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 3 行 |

## 结果与反例

- 主配置 `Sweep.cfg`：无反例（`-workers 4`，2,303,290 个不同状态）。
- 五份核对全部按预期出反例或被反驳——这是「断言能失败」的证据，不是契约的反例。
- 契约本身**尚无反例**。

## 变化的影响

- **2026-09-25 起草**：首版，无旧证据。

## 修订波（2026-09-25 公开面）

依据链：D-063 R-1（替身改为接口契约 ＋ 最小提供者）；D-060 §八 N-33～N-37。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **最小提供者的形态**：副本条目与 OAuth 条目都以密文落在绑定所在的同一存储（`core/storage`），本机只放密钥；G-9 注明这一点不改 S-7 | N-37 ⑤ | [README](README.md) 提供者映射、[G-9](v2/contract.md#十一已知缺口) | 不改语义 |
| 「尚无决定记录」改链 D-063 R-1；账本外名字标「主线已接受」 | R-1；N-37 ① | 设计依据两行 | 不改语义 |
| 消费者核对：静态检查一行加「`readReplica` 只许模型档案读提供者调」（N-37 ⑩，节点 MPD-N4 那一侧落）；MCP 桥一行写明 C-4 ↔ G-2、C-5 ↔ G-4、C-6 ↔ G-3 本版不收 | N-37 ⑩ | 第十二节两行 | 不改语义。**桥与模型档案目录都以定义引用改指本契约、不反向登记**（本契约已以坐标依赖它们，登了成环）；两边的对齐义务写在它们各自的「修订波」里 |
| **形式工件的运行结果填进**（主线另派，本波一并落）：三份配置的状态由「未运行」改为实际结果，证据指 run 2026-09-25-formal-credential-custodian；运行方式改为 `-workers 4` | N-37 ⑪ | 本文件顶部、[形式工件](#形式工件)、[实际执行](verification.md)、[结果与反例](#结果与反例) | **状态不因通过而提升**：仍 candidate；有限常量下的模型检查不是证明。`registry/formal-tasks.json` 的 worker 数与 `timeout_seconds` 由主线改，本波未动 |

**没有证据因此作废**：本波对正文的改动不触及形式模型建模的性质（交出判据、清扫三种）。

**同日追加（保管方节点反推，主线裁定 D-060 §八 N-40 ③）**：

| 变化 | 依据 | 落在哪 | 语义变不变、对证据 |
|---|---|---|---|
| **S-23「拷到 B 的据点下」写明只拷条目、B 的密钥不变 ⇒ 打不开**；连密钥文件一起拷是 S-3 明说不挡的情形，不作本场景的通过条件 | 节点 CCL-7 | [S-23](v2/contract.md#s-23-另一个账号的据点读不到)、[examples §2](v2/examples.md#2-据点隔离与加密落地) 那一行 | **不改语义**（S-3、S-7 原样）：把场景的做法写清，免得演练者连密钥一起拷、据此判一个正确的提供者失败 |
| **S-18 第 4 条的上界补前提：一轮清扫能在 `sweepInterval/2` 之内做完**（提供者按半个间隔起一轮）；写进第七节进展性质的前提列 | 节点 CCL-8 | [S-18](v2/contract.md#s-18-清扫) 第 4 条、第七节 `OrphanEventuallySwept` 一行 | **收窄保证**：一轮做不完时「不晚于 `sweepInterval`」不成立。**形式模型不受影响**：`OrphanEventuallySwept` 检查的是「终将被丢」（弱公平性作前提），不检查时间上界；上界仍只由场景 S-28 按装配给的 `sweepInterval` 计时验证 |

**N7 评审之后（主线裁定 D-060 §八 N-42）**：

| 变化 | 落在哪 | 语义变不变、对证据 |
|---|---|---|
| **过期谓词写死**：过期 ⇔ `now > since + oauthPendingTtl`（严格大于，恰等于不算），与 `formal/Sweep.tla` 的 `Expired` 同一式；**两边共用同一份谓词实现**写成装配给的保证，拆开时随协议定死一份 | [S-18](v2/contract.md#s-18-清扫) 第 2 条、[S-19](v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行；`capability.mcp-bridge/v2#S-8` 同波同一句；场景 S-28 加「恰在边界」一支；examples §3 交错表加一行 | **收紧表述、不改模型**：模型两侧本来共用一个 `Expired`，所以它看不见两边运算符不一的反例——这条由场景 S-28 的边界一支承担，不由形式模型承担 |
| **`GrantedResolvable` 补前提「记下的条目可开封」**；S-7 第三条的「由清扫丢弃」限定为副本条目——**OAuth 条目打不开本版留下、不作废绑定**；新缺口 G-10；产品后果「人重新授权之前旧绑定仍 `granted` 但交不出」 | 第七节不变量第 3 行、[S-7](v2/contract.md#s-7-加密落地)、[G-10](v2/contract.md#十一已知缺口)、第十二节 MCP 桥一行、设计依据那一行、examples §3 表下 | **收窄保证**：不变量在「密钥换了或条目损了」时不成立，本版如实写出；模型里条目恒可开封，这条前提被建模方式吸收，**不写成「已由模型覆盖」** |
| **契约正文不再引节点编号**：设计依据、第七节来源列、S-19、第十二节、G-1、G-3、G-4、G-6 与第二节里的节点要求号、节点缺口号改引桥契约条款或 D-060 各条；S-4 那句「桥 v2 不引用本契约」改为两边的真实引用关系 | 各处 | 不改语义 |

形式工件的登记与结果不变（`credential-custodian-v2-sweep`）；本轮没有重跑。
