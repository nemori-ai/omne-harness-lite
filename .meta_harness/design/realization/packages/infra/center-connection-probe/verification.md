# center-connection-probe 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/center-connection/verification.md`](../../../../spec/capabilities/center-connection/verification.md)：本版**不建形式工件**（[S-12](../../../../spec/capabilities/center-connection/v2/contract.md#s-12-本版选用哪些形式工件)），证据全部是对脚本化对端与真实 TLS 的场景。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（两种装法、节拍、时钟不可用的收场、撤除丢弃在途结果）。**本节点尚未建包，一切未开始。**

## 证据义务

### 规范场景（三条加实例，全部未开始）

| 场景 | 本节点上的形式与前提 | 另外受阻于 | 状态 |
|---|---|---|---|
| [S-13](../../../../spec/capabilities/center-connection/v2/contract.md#s-13-断线与重连) 断线与重连 | **replay 插件**、真实定时器：脚本「答 → 静默 → 答 → 拒 → 答」；消费者每隔一小段读一次，逐条核三态、`since` 不减、`reachCount` 恰在进入可达时加一；计时一支按装配给的 `probeInterval`、`probeTimeout` 核上界 `probeInterval + probeTimeout`；在场一支在验收装配里核本插件与 P-1r 都没有撤除、重跑 | 在场一支要验收装配里的 P-1r 与一次在途模型调用（P-1r 问中心不在本版，只核「没有重跑」） | 未开始 |
| [S-14](../../../../spec/capabilities/center-connection/v2/contract.md#s-14-在应答就是可达判不了也算) 在应答就是可达 | **probe 插件**对一个本地的脚本化 TLS 对端（测试证书作信任锚）：对端答 `unavailable`、`version-mismatch`、`login-state-rejected` ⇒ 都是 `reachable` | 上游语义取证（CNP-8） | 未开始 |
| [S-15](../../../../spec/capabilities/center-connection/v2/contract.md#s-15-确认不了对端就是问不到) 确认不了对端就是问不到 | **probe 插件**：对端用不由信任锚签发的证书、主机名对不上、只给 TLS 1.2、答一页 HTML、答复超 `probeReplyMaxBytes` ⇒ 都是 `unreachable`。**replay 插件证不了这一条** | 同上；信任方式本版是 CA 链加主机名（CNP-2 已裁），将来换成钉公钥时这一条要重跑 | 未开始 |
| [examples §1～§3](../../../../spec/capabilities/center-connection/v2/examples.md#1-起来断线重连) | §1 用 replay 插件；§2、§3 用 probe 插件与脚本化 TLS 对端 | 同上 | 未开始 |
| [examples §4](../../../../spec/capabilities/center-connection/v2/examples.md#4-本能力不在场) 本能力不在场 | 消费者一侧的测试，由各消费者的验证入口承担；本节点只证「撤除之后经旧引用调用 ⇒ 抛出，不答 `unreachable`」（N-6） | —— | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **归约的计数规则**：`observe` 逐格穷举（三个起点 × 两种往来）；`reachable` 之间没有经过非可达绝不加一；状态不变时 `since` 不动 | 单元测试（性质测试：任意往来序列上三条不变量都成立） | 未开始 | 本节点；有实现即可跑 |
| N-2 | **节拍兑现 S-6 第 1 条**（关键选择三）：对端每次都拖到 `probeTimeout` 才答时，两次有结果之间不超过 `probeInterval`。**变异**：改成固定周期时这条要红 | 集成测试（replay 插件，可控定时器） | 未开始 | 本节点 |
| N-3 | **时钟不可用**（关键选择三末段、五）：装载时 `clock` 答 `'unavailable'` ⇒ 插件照常 `ACTIVE`、服务可解析、不抛，`reachability` 答 `undetermined`、`since` 缺席（CNP-12 ①）；钟在下一个节拍点读得到 ⇒ `since` 即定为那一个读数、此后不变直到状态迁移；钟读得到之后的第一次往来若起始时刻还没定，先把同一个读数记为起始时刻再归约。运行中有结果而钟不可用 ⇒ 观察不变（`state`、`since`、`reachCount` 照旧）、warn。**节拍锚点一支**：钟持续不可用、对端每次秒答时，相邻两次探的开始间隔都不短于 `probeInterval − probeTimeout`（可控的单调计时断言），钟恢复后的第一次结果照常更新观察。**变异**：锚点改成「只在算数的结果上更新」时节拍一支要红（背靠背再探）；钟读不到时填任何时刻进 `since` 时缺席一支要红 | 单元测试（可控时钟，`core/offer-expiry` 的测试件；可控定时器） | 未开始 | 本节点 |
| N-4 | **撤除**：撤除时有一次探在途 ⇒ 套接字被关、结果不更新观察、撤除后没有定时器与连接留下 | 集成测试（probe 插件，对端静默） | 未开始 | 本节点 |
| N-5 | **循环不因缺陷停下，但持续缺陷看得见**：注入一次归约抛出 ⇒ error 日志、下一拍照常、本插件不撤除；**连续三拍缺陷** ⇒ 仍不撤除、循环不停，三条 error 记录的结构化字段「连续缺陷计数」依次是 1、2、3；再来一拍正常落定 ⇒ 计数归零（下一次缺陷记 1） | 单元测试（结构化日志捕获） | 未开始 | 本节点 |
| N-6 | **不在场不是 `unreachable`**：撤除之后经旧引用调 `reachability` ⇒ 抛出 | 单元测试 | 未开始 | 本节点 |
| N-7 | **配置错误一个政策**：`probeTimeout ≥ probeInterval`、`entryUrl` 不是 `https:`、`trust.caPem` 解析不出证书、`script` 不合形状、任一项缺席 ⇒ 启动失败、诊断点名不含值 | 单元测试 ＋ `apps/cli` 装配测试 | 未开始 | 本节点 ＋ `apps/cli` |
| N-8 | **探测请求的形状**：请求体恰是公开体检那一个成员、不带出示物与协议版本；一条连接一个请求 | 集成测试（脚本化 TLS 对端记录收到的字节） | 未开始 | 本节点 |
| N-9 | **入口契约 Schema 副本不漂移**（CNP-7） | 测试：副本与规范工件逐字节比较 | 未开始 | 本节点 |
| N-10 | **结构检查**：产品据点清单里不得出现 `center-connection-replay`；本包不 inject 存储、不 `emit`、不监听 | `apps/cli` 结构检查 ＋ `tools/ts-checks`（候选规则），带「故意违反就失败」的自测 | 未开始 | 本节点 ＋ `apps/cli` ＋ ts-checks owner |
| N-11 | **上游语义取证**（CNP-8 的五条） | 每条一个会失败的测试（Node 24.18.0 起） | 未开始 | 本节点 |

## 覆盖缺口

- **全部条款没有任何实现证据**：源码、测试、集成运行都不存在；[bindings](bindings.yaml) 为空。
- **replay 插件证不了的**：S-14、S-15 与一切传输读法——只由 probe 插件对脚本化 TLS 对端证；产品上真实中心那一侧的探测要等产品清单装本插件（CNP-6）。
- **已裁**：不设判定阈值，去抖须契约新版本（CNP-1）；S-13 按「一次有结果的往来即定状态」断言。
- **信任方式已裁**（CNP-2）：S-15 按 CA 链加主机名演练；钉公钥留新版本，届时重跑。
- **时钟租约窗口里 `undetermined` 的 `since` 缺席**（CNP-12 已裁 ①）：N-3 按「缺席、读到即定」断言；契约 S-5 的改写由规格侧落字，落定之前本节点的这一支立在主线裁定上。读 `since` 的一方要能处理缺席（当前消费者 P-1r 不读它）。
- **钟不可读期间 S-6 第 1 条的上界不成立**（契约已写明前提）：N-3 证观察如实变旧、节拍不乱，不证上界。
- **契约 S-10 右列**：「可达只认确认过的对端」是协议给的（传输绑定 S-4），本节点只兑现客户端那一半。
