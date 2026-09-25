# center-connection-probe 实现设计

## 实现路径与来源

**自建一个小包、两个 Cordis 插件，没有可复用的上游对象**：三态可达性、计数规则与「在场不随可达性变」是本项目的契约语义（`capability.center-connection` v1）。探测用 Node 内置的 `node:https`，**不引第三方 HTTP 客户端，也不引执行器类库替本节点调度重试**（[D-040 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 口径：探测不是重试，是契约 S-6 的节拍）。

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| `https.request`（`agent: false`，`minVersion: 'TLSv1.3'`，`ca` 交入信任材料，按地址里的主机名核证书） | `node:https`／`node:tls` | 一次公开体检往来：一条连接恰一个请求—答复（传输绑定 [S-5](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-5-一条连接恰承载一个请求答复)），只有 TLS 1.3（[S-4](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-4-客户端一面的连接只有-tls服务端认证)） |
| 严格无损 JSON 读取（候选 `readJsonStrict`） | [`core/content-blocks`](../../core/content-blocks/README.md)（[D-040 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | 答复体读成 JSON；读不成即「不是一份答复」 |
| 入口契约 Schema 的 `PublicHealthReply`、`PublicHealthRequest`、`EntryAnswer` 定义 | 规范工件的**逐字节副本**随包（漂移由测试核对），ajv 校验——与 [`tenancy/governance-center-entry`](../../tenancy/governance-center-entry/README.md) 包的做法同形；**据点不 import 中心的包** | 判「读成的值属于这次请求应得的那一类」（传输绑定 [S-17](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#s-17-客户端怎样读答复) 第 3、4 步） |
| 时间源 `clock` | [`infra/clock`](../clock/README.md) | `since` 与这一次在场的起始时刻；**插件体里不读**（[关键选择五](#关键选择)）。探测节拍用本地定时器（单调计时）量，不读墙钟 |
| `definePlugin` | [`core/kernel-basis`](../../core/kernel-basis/README.md) | 插件骨架、config 校验 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；机制语义引 [basis](../../../../basis/README.md) 条目。
**Node TLS 与 HTTP 客户端的语义 basis 没有条目**，下面每一条都是**假设，须按 source-check 取证**（[CNP-8](#实施缺口与消费者影响)）：① `minVersion: 'TLSv1.3'` 使更低版本握不了手；② 给了 `ca` 时证书链不由它签发、或主机名对不上，请求以错误结束、交不出任何答复字节；③ `agent: false` 每次新开一条连接、答完即关；④ 销毁请求会关掉套接字、以错误事件收场；⑤ 答复体按 `Content-Length` 读满之前连接关闭时以错误或 `aborted` 到达，不交一个截短的体。
**配置错误一个政策**（与同批节点、`apps/cli` 同一条）：config 经 `definePlugin` 的 `Config` 在插件体之前校验，不过即 fiber `FAILED`、装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；诊断点名那一项、不含值。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：可达性的归约与一次探测以函数公开，不依赖 Cordis；两个插件是它们的消费者。名字全部**候选**，**全部尚未实现**。

**公开函数面**（包入口导出）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `observe(state, outcome, now)` | 纯归约：`{ state, since?, reachCount }`（`since` 只在 `undetermined` 且起始时刻未定时缺席）加一次有结果的往来（`reply`／`noReply`）与它的时刻 → 新的可达性。非可达 → 可达时 `reachCount` 加一、`since = now`；状态不变时原样交回（`since` 不动） | [S-5](../../../../spec/capabilities/center-connection/v1/contract.md#s-5-可达性三态) |
| `classifyProbeReply(status, body)` | 纯判定：一份读完的公开体检答复 → `reply` 或 `notAReply`，按传输绑定 S-17 第 2～4 步 | S-5 可达与不可达的分界 |
| `nextProbeAt(lastSettledAt, timing)` | 纯计算：上一次探**落定**的本地计时时刻（有结果——算数或因钟读不出而丢弃——或缺陷，都算落定；与 `since` 分开）→ 下一次开始探的本地计时时刻（`lastSettledAt + probeInterval − probeTimeout`） | [S-6](../../../../spec/capabilities/center-connection/v1/contract.md#s-6-自己探自己重连) 第 1 条 |
| `probeOnce(target, limits, signal)` | 一次公开体检往来：`reply` 或 `noReply`（带原因：超时、TLS、连接、非答复、超上限） | S-6 第 1、2 条；传输绑定 S-4、S-17 |

**Cordis 服务面**：插件 `center-connection-probe`（产品装法）与 `center-connection-replay`（验收装法），服务 `centerConnection`（一个操作 `reachability`），都必需 inject `clock`（[下节](#插件边界与服务面)）。

**只在运行时层成立、函数层不承诺**：可达性只属于这一次在场（S-5 末条——函数只归约交来的状态）；最近一次有结果的往来距今不超过 `probeInterval`（S-6 第 1 条，前提「时间源可读」——`nextProbeAt` 只算时刻，按时去探、钟读不出时丢弃结果是插件的）；可达性怎么变都不撤除、不替换（S-7）；撤除时在途那一次探的结果丢弃（S-11）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **归约、分类、节拍与一次探测都公开**（选）；落选：只公开归约 | `probeOnce` 立在待取证的 Node TLS 语义上（CNP-8），此刻公开等于交出一个会改的面 | 信任方式本版是 CA 链加主机名，改钉公钥时信任材料的形状要加一种（CNP-2） | 中：入口 v2 的据点客户端（真承接者）要的就是「按传输绑定读答复」这一段，分类函数先公开，它可以直接复用而不是另写一份 |

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个包、两个插件，同一个服务键 `centerConnection`**（候选名见契约 README，各消费者节点已用），据点根作用域恰一份（两者不同时装）：

| 插件（候选名） | inject | 往来从哪来 | 装在哪 |
|---|---|---|---|
| `center-connection-probe` | `clock`（必需） | 对 `entryUrl` 发公开体检（`probeOnce`） | 产品据点装法（本版产品清单不装，cli 关键选择 5） |
| `center-connection-replay` | `clock`（必需） | 按 config 里的脚本回放**对端行为**，不连任何地方 | 只在 `apps/cli` 的验收装配里；产品清单里出现即结构检查失败 |

两个插件的插件体只差「一次往来怎样得到结果」：都用同一个归约 `observe` 与同一个节拍；都在一个 effect 里持有观察、定时器与在途的那一次探。**都不 inject 存储**：契约 [S-11](../../../../spec/capabilities/center-connection/v1/contract.md#s-11-撤除重启与在途) 第 1 条，本能力没有耐久事实。

**config**（候选名；全部必填、代码里不放默认，缺一或非法即启动失败）：

| 配置项 | 插件 | 形状与约束 | 候选初值（由装配的配置给） | 来源条款 |
|---|---|---|---|---|
| `probeInterval` | 两者 | 正时长 | **30 s** | 契约 S-6 第 1 条、[G-3](../../../../spec/capabilities/center-connection/v1/contract.md#八已知缺口) |
| `probeTimeout` | 两者 | 正时长，**小于 `probeInterval`** | **10 s** | 契约 S-6 第 1 条、G-3 |
| `probeReplyMaxBytes` | probe | 正整数字节；答复体超过它即「不是一份答复」 | **16 KiB**（公开体检答复只有三样，远小于此） | 本节点（防对端灌入） |
| `entryUrl` | probe | `https:` 地址；主机名即核证书用的名字 | 无初值：这个据点所属中心的地址归据点配置（PF-016 §4） | 契约 S-6 第 2 条 |
| `trust.caPem` | probe | 一张或多张 PEM 证书，作信任锚 | 无初值：部署输入（本版信任方式 CA 链加主机名，CNP-2） | 契约 S-5；传输绑定 S-4 |
| `script` | replay | 按时间分段的对端行为：`answering`（立即答）／`silent`（到 `probeTimeout` 仍无答复）／`refusing`（立即断），末段一直延续 | 无初值：测试数据 | 契约 [S-13](../../../../spec/capabilities/center-connection/v1/contract.md#s-13-断线与重连)（脚本化的对端） |

**契约里没有「判定阈值」这一项**，本节点也不设（[关键选择四](#关键选择)、CNP-1）。

### 关键选择

**一、同一个包里两个插件（选）。**

| | 一个插件，config 判别联合 `transport: https \| script` | 一个插件，往来经一个可选的传输服务现取 | **两个插件，共用归约与节拍（选）** |
|---|---|---|---|
| 落选方的最强论证 | 一份插件、一份装卸表，代码最少 | 往来的来源可以在运行中替换，验收装配只加一个种子件 | —— |
| 本方弱点 | —— | —— | 多一个插件与一份 config 形状；两者的装卸表要一起维护 |
| 为什么选它 | 产品插件的 config 形状里就带着「按脚本回放」那一支，产品清单只差一个字段就走上它；结构检查要看 config 的值才判得出 | 传输服务在不在决定产品的行为，一个误装的测试件会悄悄换掉产品的探测 | 结构检查按插件身份判（产品清单里不得出现 `center-connection-replay`）；产品插件的 config 里只有探测要的东西 |
| 置信度 | 中 | | |

**二、验收装法回放的是对端行为，走同一个归约与同一个节拍（选）。**契约消费者核对写「回放一段合法的观察序列」；直接回放 `{ state, since, reachCount }` 也合法，但要另写一份不变量校验，且测不到本节点的节拍与计数。本方回放「对端此刻怎样应答」，观察由同一个 `observe` 产出——**回放出的每一个观察都按构造满足 S-5 不变量**，S-13 的计时一支也在真实定时器上跑。代价：TLS 与答复读法（S-14、S-15）回放测不到，那两条只能对 probe 插件与一个本地的脚本化 TLS 对端跑（verification）。置信度：中高。

**三、下一次探在上一次探落定之后 `probeInterval − probeTimeout` 开始，按本地定时器（选）。**

| | 固定周期：每 `probeInterval` 开始一次 | **上一次探落定之后隔 `probeInterval − probeTimeout` 再开始（选）** |
|---|---|---|
| 落选方的最强论证 | 最常见、最好读 | —— |
| 本方弱点 | —— | 要求 `probeTimeout < probeInterval`（config 校验）；对端一直慢的时候探得更密 |
| 为什么选它 | 一次探最多 `probeTimeout` 才有结果，两次结果之间最长 `probeInterval + probeTimeout`——违反 S-6 第 1 条「最近一次有结果的往来距今不超过 `probeInterval`」 | 两次结果之间不超过 `probeInterval`；对端在某一刻变了，最晚 `probeInterval + probeTimeout` 之后状态跟上（第四节两条进展的上界） |
| 置信度 | 高 | |

**节拍锚点是本地计时，与 `since` 分开**：每一次探落定时记下单调计时的那一刻（`lastSettledAt`），下一次在它之后 `probeInterval − probeTimeout` 开始——**不论那一次的结果算没算数**。于是两次探的开始之间恒不短于 `probeInterval − probeTimeout`：钟读不出、结果被丢弃的那段时间（下一段）里，节拍照走，不会因为「观察没更新」而立刻再探、对中心背靠背发请求（契约 S-6 第 1 条前提段）。

**第一次探在 effect 登记后立即开始**（不在插件体里）：还没有任何结果时读到的是 `undetermined`（S-9 ⑧），第一次结果不晚于 `probeTimeout`。

**四、可达性由最近一次有结果的往来定，不设判定阈值（契约如此；主线已裁，CNP-1）。**

| | 连续 N 次问不到才判 `unreachable`（阈值作策略配置项） | **一次有结果的往来即定状态（契约 S-5、S-6 第 1 条）** |
|---|---|---|
| 落选方的最强论证 | 一个丢包不让屏上闪一下「连不上」，`reachCount` 不因抖动虚增 | —— |
| 本方弱点 | —— | 网络抖动时状态会翻；`reachCount` 数的是每一次回到可达，抖动也算 |
| 为什么选它 | **与契约相抵**：S-5 定义 `unreachable` 为「最近一次有结果的往来落在问不到」、S-6 第 1 条「到点没有读成一份答复即问不到（`unreachable`）」——阈值大于 1 时，最近一次问不到而状态仍是 `reachable`，违反 S-5 与第四节「绝不能把问不到答成 `reachable`」一行 | 照契约兑现；要去抖须出契约新版本（CNP-1），**不在节点里写「实际按 X 做」** |
| 置信度 | 高（这是契约的字面） | |

**五、插件体不读钟、不因钟启动失败；起始时刻由 effect 在第一次读得到钟时记下，此前 `since` 缺席（选；主线裁定 [D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ③ D-3，CNP-12 裁 ①）。**

| | 插件体里读一次，`'unavailable'` 即抛出、装配启动失败（前一稿） | 服务延到读得到钟才 `provide` | **插件体只 `provide` 与登记 effect；effect 登记时读一次钟，读不到就在节拍的本地定时器点（循环开始、每一次探落定）再读（选）** |
|---|---|---|---|
| 落选方的最强论证 | 最简单；`since` 从第一刻起就是真实时刻；与治理中心「启动成功以钟可读为条件」同形 | 服务在的每一刻都答得出真实的 `since` | —— |
| 本方弱点 | —— | —— | 崩溃后快速重启落在时钟旧租约窗口里（至多一个租约宽度）时，服务已在而起始时刻还没读到：那一段 `undetermined` 的 `since` **缺席**（契约 S-5 按 [CNP-12](#实施缺口与消费者影响) ① 改写），读 `since` 的一方要处理缺席 |
| 为什么不选／选它 | 那个窗口里据点起不来，其余节点都是运行期降级（D-3） | `apps/cli` 装载时 `ctx.plugin()` 返回即同步读 fiber 状态、`PENDING` 即清单错误——必需 inject 本服务的 P-1r 在窗口里 `PENDING`，据点照样起不来，等于没有兑现 D-3 | 据点在窗口里起得来；窗口之外（绝大多数启动）effect 登记那一刻就读到起始时刻，与前一稿无差别 |
| 置信度 | | | 中高 |

**运行中**一次往来有了结果、而 `clock.now()` 答 `'unavailable'`（契约 S-6 第 1 条前提「时间源可读」）：这一次**不算有结果**，观察不变（`state`、`since`、`reachCount` 照旧），记 warn——编一个时刻会让 `since` 失真；**节拍照走**：这一次仍算落定，`lastSettledAt` 取本地计时（[关键选择三](#关键选择)末段），下一次不早于 `probeInterval − probeTimeout` 之后。起始时刻还没读到时同样如此：`undetermined` 的 `since` 保持缺席，不填任何时刻。**读到即定**：effect 登记那一刻、之后每个节拍点（循环开始、每一次探落定）各试一次，第一次读到的值就是 `undetermined` 的 `since`，此后只随状态迁移改；一次有结果的往来遇上钟读得到而起始时刻还没定，先把同一个读数记为起始时刻，再用它归约。

### 契约责任到插件、服务与操作

契约的九件事本表不复述，只写兑现点与缺口。名字除契约给的以外都是候选；全部**尚未实现**。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/center-connection/v1/contract.md#s-5-可达性三态) 三态、`since`、`reachCount` | effect 里的一份观察，只经 `observe` 改 | 尚未建包 | 恰三值；`reachCount` 只在非可达 → 可达时加一；`since` 取 `clock`（不后退，`since` 因此不减） |
| S-5 「在应答」与「问不到」的分界 | `classifyProbeReply`：答复体逐字节是 `"version-mismatch"` ⇒ `reply`（不看状态）；否则状态不是 200 ⇒ `notAReply`；体读成 JSON 且是入口答复的另三个字符串之一、或合 `PublicHealthReply` ⇒ `reply`；其余 ⇒ `notAReply`（记对端异常，不记答复内容）。连接失败、TLS 失败（含证书对不上）、读满之前关闭、超时、超上限 ⇒ `noReply` | 尚未建包；上游语义待取证（CNP-8） | 中心答 `unavailable`、`login-state-rejected`、`version-mismatch`、`invalid-input` 都是 `reachable`（S-14）；确认不了对端即 `unreachable`（S-15） |
| [S-6](../../../../spec/capabilities/center-connection/v1/contract.md#s-6-自己探自己重连) 第 1 条 有界不过时 | 节拍：effect 登记后立即探第一次，此后每次落定之后隔 `probeInterval − probeTimeout`，锚点是本地计时、与 `since` 分开（[关键选择三](#关键选择)）；每次以 `probeTimeout` 封顶 | 尚未建包 | 同一时刻至多一次在途的探；两次探的开始之间不短于 `probeInterval − probeTimeout`；前提「时间源可读」不成立的那段，结果丢弃、上界不成立（契约写明），节拍不变 |
| S-6 第 2 条 探不带出示物 | 请求体只有 `operation`（公开体检的路由标识），不带 `protocolVersion`、不带出示物；一律 `POST` | 尚未建包 | 形状取入口契约 Schema 的 `PublicHealthRequest` |
| S-6 第 3 条 断线重连就是照常再探 | `unreachable` 期间节拍不变 | 尚未建包 | 没有「叫它重连」的口 |
| S-6 第 4 条 其他往来也更新 | **本版没有**（契约 G-1） | —— | 入口 v2 的据点客户端到来时，由它把往来结果交给 `observe`（CNP-4） |
| [S-7](../../../../spec/capabilities/center-connection/v1/contract.md#s-7-在场不随可达性变) 在场不随可达性变 | 探测的一切失败都在循环里收成 `noReply`；循环里的缺陷记 error、下一拍照常；插件体从不因可达性抛出或撤除 | 尚未建包 | 装配一侧：据点不因可达性换提供者（S-10 第 1 行，cli）；**时钟换代**会让本插件重跑、连带 P-1r 那一整条链——那是装配事件，cli「运行期不换代」挡住 |
| [S-9](../../../../spec/capabilities/center-connection/v1/contract.md#s-9-reachability) `reachability` | 同步读 effect 里那一份观察，交回副本；`undetermined` 且起始时刻还没读到时 `since` 缺席（S-5 按 CNP-12 ① 改写）、不填编出来的时刻 | 尚未建包 | 失败集合为空；撤除之后经旧引用调用 ⇒ 抛出（候选 `CenterConnectionWithdrawn`）——那是「不在场」，**不是 `unreachable`**（S-7 第 2 条） |
| [S-10](../../../../spec/capabilities/center-connection/v1/contract.md#s-10-装配给的保证-vs-协议须给的保证) 装配给 vs 协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |
| [S-11](../../../../spec/capabilities/center-connection/v1/contract.md#s-11-撤除重启与在途) 撤除、重启与在途 | 撤除序列在一个 effect 里（[装卸](#成对的装载与撤除)） | 尚未建包 | 再装上从 `undetermined`、`reachCount = 0` 起 |

### 事件与过滤器

**不发、不听任何 Cordis 事件**（契约 S-9 ⑨；可达性变化的推送不在本版，G-4）。读的一方自己读。

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 时间源 `clock` | **必需 inject**；`infra/clock`，据点根一份 | 提供者换代 ⇒ 本插件重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)），观察重新从 `undetermined` 起 | 缺席 ⇒ `PENDING`；P-1r 必需 inject 本服务，也 `PENDING` |
| `composition.governance-center-entry` v1 [S-18](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-18-公开体检)、[S-6](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-6-四种入口答复)；传输绑定 v1 S-4、S-5、S-17 | 线上：probe 插件对 `entryUrl` 发请求；Schema 副本随包 | 每次探现连 | 连不上、确认不了、读不成 ⇒ `noReply` |

**被谁消费**：据点上的 P-1r（[model-profile-directory](../../model/model-profile-directory/design.md)）**必需 inject** `centerConnection`，每次取值、每次刷新前现读；本插件一换代它就连带重跑，所以「在场不随可达性变」是本节点最要紧的一条。

## 状态、并发与失败映射

**写权**：那一份观察只由本插件的循环经 `observe` 改。**并发**：JS 单线程；`reachability` 同步读、循环在回调里改，读到的总是一次完整的观察。同一时刻至多一次在途的探。**本节点没有存储，也就没有跨 owner 的「同一提交」**。

**失败映射**（`reachability` 没有失败值；下表是一次往来的收场）：

| 情形 | 这一次往来 |
|---|---|
| 读满一份答复、`classifyProbeReply` 为 `reply` | `reply` |
| 连接被拒、DNS 失败、TLS 握不了手（含版本低于 1.3）、证书链不由信任锚签发或主机名对不上、读满之前连接关闭、到 `probeTimeout` 仍未读成、答复体超过 `probeReplyMaxBytes`、`classifyProbeReply` 为 `notAReply` | `noReply`；「非答复」与「超上限」另记一条对端异常（不含答复内容） |
| 有结果而 `clock.now()` 答 `'unavailable'` | **不算有结果**，观察不变，warn；这一次仍算落定，节拍照走 |
| 撤除开始之后才到的结果 | 丢弃（S-11） |
| 循环里的缺陷（归约抛出、事件次序违反假设） | error 日志，**结构化字段带连续缺陷计数**（这是连着的第几拍缺陷；有一拍正常落定即归零），这一拍不算有结果、仍算落定，下一拍照常——**不让循环停下**（停下观察就过时，违反 S-6；也不撤除本插件，违反 S-7）。连续缺陷期间 S-6 第 1 条的上界已失守，计数让它可观察；要不要成为第四种状态归契约新版本 |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（`probeTimeout < probeInterval`、`entryUrl` 是 `https:`、`trust.caPem` 解析得出证书、`script` 合形状） | `definePlugin` 的 `Config`，插件体之前 | 不过 ⇒ `FAILED`、装配启动失败 | —— |
| `ctx.provide('centerConnection')` | 本 fiber；插件体运行即可解析，第一次读到 `undetermined`（插件体不读钟，不因钟失败，[关键选择五](#关键选择)） | 随 fiber 撤（`provide` 由 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**，CNP-11） | 服务消失；必需 inject 它的 P-1r 随之撤除 |
| 一个 effect：那一份观察与起始时刻、定时器与 `lastSettledAt`、连续缺陷计数、在途的那一次探（它的中止控制） | 本 fiber；登记那一刻读一次钟（读不到不抛，按节拍再读）并开始第一次探 | —— | **撤除序列**（同一个 effect 的 disposer 里按次序 `await`，basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）：① 置撤除标记——此后到的结果一律丢弃；② 清掉定时器；③ 中止在途的那一次探（销毁请求、关套接字），等它落定——结果丢弃、不更新观察（S-11 第 2 条）；④ 结束。**保留**：无——观察只活在这一次在场里 |

**在途的外部效果**：那一次探是一条到中心的连接，撤除时由本实例关掉；公开体检不读存储、不写任何东西（入口契约 S-18），中止它没有要回滚的。

## 装配给与协议给：本节点单机怎样兑现左列

照契约 S-10 逐行。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 可达性变化不使本能力撤除或替换 | 断线与重连只改观察，循环不停、插件体不抛 | 本节点 ＋ **装配**（不因可达性换提供者；运行期不换 `clock`，cli） |
| 可达只认确认过的对端 | 只有 TLS 1.3；证书按 `trust.caPem` 与地址里的主机名核，核不过即 `noReply` | **协议**（传输绑定 S-4）＋ 本节点 ＋ **装配**（信任材料；信任方式本版已裁为 CA 链加主机名，cli A-34，CNP-2） |
| `since` 取同一时间源 | 只从注入的 `clock` 取 | **装配**（据点根恰一份 `clock`） |
| 可达性不作准入依据 | 本节点只交观察 | 消费者 |

**归装配的事项**（点名给 `apps/cli`）：产品据点装 `center-connection-probe`、验收装配装 `center-connection-replay`，产品清单里出现后者即结构检查失败；`entryUrl` 与 `trust.caPem` 从据点配置来（这个据点所属中心的地址与信任锚）；四项时长与上限的值；运行期不换 `clock`；信任方式本版是 CA 链加主机名（cli A-34，CNP-2）。

## 实施缺口与消费者影响

契约第八节的缺口不重抄；下表是**本节点自己的**缺口，编号 CNP-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| CNP-1 | **已裁：不设阈值，去抖须契约新版本**（主线 2026-09-25）。`capability.center-connection/v1#S-5` 定义 `unreachable` 为最近一次有结果的往来落在问不到，`#S-6` 第 1 条写「到点没有读成一份答复即问不到」——状态由一次往来定，没有阈值可配；「判定阈值作策略配置项」的要求是主线误写，已撤回 | 屏上的可达性会随抖动翻（交付面，G-4）——已知后果 | —— | —— |
| CNP-2 | **已裁：本版信任方式是 CA 链加主机名，钉公钥留新版本**（D-040 §八 N-42 ③ D-4；cli A-34 承接）——`trust.caPem` 作信任锚、按 `entryUrl` 里的主机名核证书（Node 的标准核验）；传输绑定 [G-2](../../../../spec/compositions/governance-center-entry-https-json/v1/contract.md#十一已知缺口) 的另两件（确认不了时怎样不交出登录状态、怎样呈现）不在本节点——本节点不交出任何登录状态（S-6 第 2 条），呈现归 PF-016。改钉公钥时加一种信任材料、S-15 的证据重跑 | 产品装法（本版不装） | —— | —— |
| CNP-3 | **不核「连到的是不是这个据点所属的中心」**（契约 G-2）：公开体检答复里有 `centerId`，本节点不比——「可达」只说配置的地址后面、证书核得过的那个对端在应答 | S-3 第 4 条 | PF-016 owner ＋ 入口 v2 据点客户端 | 产品定下怎样确认 |
| CNP-4 | **其他往来不更新观察**（契约 S-6 第 4 条、G-1）：本版据点到中心没有别的往来 | —— | 入口 v2 的据点客户端（cli C-4） | 那一程把往来结果交给 `observe` |
| CNP-5 | **已裁：插件体不读钟、不因钟启动失败**（D-040 §八 N-42 ③ D-3）；起始时刻由 effect 在第一次读得到钟时记下，此前 `since` 缺席（CNP-12 ①）；读不到的结果按本地定时器节拍丢弃重试（[关键选择五](#关键选择)） | —— | —— | —— |
| CNP-6 | **产品清单本版不装**（cli 关键选择 5）：P-1r 必需 inject 本服务，产品据点清单里 P-1r 停在 `PENDING`；装上也只是观察，P-1r 读到 `reachable` 仍问不了中心（契约 G-1，MPD-N2） | P-1r、模型链 | 主线 ＋ `apps/cli` | 入口 v2 到来，或主线改判产品清单装最小提供者 |
| CNP-7 | **入口契约 Schema 的逐字节副本**要一条漂移测试；入口 v2 的据点客户端到来时，客户端一侧的答复读法该只有一份（本节点的 `classifyProbeReply` 是候选） | S-5 分界 | 本节点 → 入口 v2 那一程 | 漂移测试入库；那一程复用或取代本函数 |
| CNP-8 | **Node TLS 与 HTTP 客户端的语义待取证**（[实现路径](#实现路径与来源)的五条假设） | S-5、S-6、S-15 | 本节点 | 每条一个会失败的测试；需要时登 basis |
| CNP-9 | 可达性变化不推送（契约 G-4）：交付面要标明「此刻连不上中心」只能轮询读 | 交付面 | 交付面呈现契约（未立） | 那份契约定下 |
| CNP-10 | **已裁**：路径维持 `infra/`——主线把[两层布局](../../../README.md#packages-的两层布局)里 `infra/` 的定义扩为「兑现 `core/` 协议级构造，或据点／中心的窄口基础设施契约（密钥保管、进程起停、连接探测）」（D-040 §八 N-40 ①） | —— | —— | —— |
| CNP-11 | `provide` 由 effect 纳管：kernel-basis 有 probe、没有 basis 条目——**待核对主张** | 装卸表 | `core/kernel-basis` owner | 升格为 basis 条目 |
| CNP-12 | **已裁：按 ① 实施**（主线 2026-09-25；契约 [S-5](../../../../spec/capabilities/center-connection/v1/contract.md#s-5-可达性三态) 改为「`since` 是这一次在场里第一次读得到时间源的时刻，此前缺席」，规格侧落字）——effect 登记时读钟，读不到则 `since` 缺席、在节拍点再读，读到即定（[关键选择五](#关键选择)）。来由：D-3 要插件体不读钟、据点不因钟起不来，`apps/cli` 装载时 `PENDING` 即清单错误，服务必须在插件体里就出现；原 S-5 与 S-9 ⑤⑥ 在时钟旧租约窗口里要一个真实的起始时刻，给不出。落选：② cli 装本插件之前等钟；③ 服务延到钟可读才出现（与 cli 装载规矩相抵） | 读 `since` 的一方要处理缺席；当前消费者 P-1r 只读 `state` 与 `reachCount` | —— | —— |

**报给主线**：无待裁项（CNP-12 已按 ① 裁）。**产品装配里装不装**：本版不装（cli 关键选择 5）；装上之后如实探测，观察可读，但没有消费者能据它向中心发请求——如实失败，不填默认值。
