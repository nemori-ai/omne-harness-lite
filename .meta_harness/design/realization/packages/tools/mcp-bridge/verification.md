# mcp-bridge 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/mcp-bridge/verification.md`](../../../../spec/capabilities/mcp-bridge/verification.md)：本版**不建形式工件**（[S-31](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-31-本版选用哪些形式工件)），证据是七条规范场景与静态检查。OAuth 完成与保管方清扫的交错，本节点的证据是保管方契约的规范场景 S-28 在本节点上的真并发演练（N-2）；那份契约的形式模型证的是契约，不借来绑定，[bindings](bindings.yaml) 为空。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（连接表在一个 effect 里、执行者贡献插件、OAuth 绑定行与保管方凭据行、单一续期调度器）。**本节点尚未建包，一切未开始。**

## 证据义务

### 规范场景（七条，全部未开始）

| 场景 | 本节点上另外受阻于 | 状态 |
|---|---|---|
| [S-32](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-32-连不上时照上一份清单装替换件) 连不上照上一份清单装替换件 | 注册表那一半（`packages/tools/asset-registry`，整批 `PENDING`）；本节点那一半（交出旧副本、副本不动）可单测 | 未开始 |
| [S-33](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-33-从没连上过的接入点没有条目) 从没连上过的没有条目 | —— | 未开始 |
| [S-34](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-34-仓库的同名接入点拿不到租户的凭据) 仓库的同名接入点拿不到租户的凭据 | 求值交来的 `provenance` 要替身（`core/asset-evaluation` 未建包）；断言保管方**没有被调到** | 未开始 |
| [S-35](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-35-调用途中断线不重发) 调用途中断线不重发 | —— | 未开始 |
| [S-36](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-36-续期不打扰任何人) 续期不打扰任何人 | **本版跑不了**：续期写回保管方本版不收（[G-4](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口)，C-5）；SDK 的 OAuth 钩子待取证（B-1） | 未开始；受阻 |
| [S-37](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-37-oauth-取到的引用配不上就作废) OAuth 引用配不上就作废 | 「过了 `unassignedCredentialRetention` 仍没配上」要读配值副本（B-3）——**本批判不了** | 未开始；受阻 |
| [S-38](../../../../spec/capabilities/mcp-bridge/v2/contract.md#s-38-桥换代时在途调用落异常中断) 桥换代时在途调用落异常中断 | 执行运行时一侧的收场（`packages/tools/tool-execution-runtime` 未建包）；执行者接口（B-5） | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **副本条件写**（R-B1）：同一键两次并发刷新、首插撞主键；断言留下的是后开始那一次、中途失败的那一次不写、读失败不被当成 `not_fetched` | **真并发**演练：两个存储连接、同一库文件；sqlite 与 pg 各一遍 | 未开始 | 本节点 |
| N-2 | **发起与完成交错、完成两次**（[跨 owner 一节](design.md#跨-owner-的同一提交oauth-绑定行与保管方的凭据行)的两条反证）：断言旧流程的完成得 `oauthDenied`、那份凭据解引用交不出、清扫删掉；同一绑定完成两次只有一份可用凭据；**清扫与完成交错**（第三条反证，M72）：绑定 `pending` 未过期时清扫不删待生效行、完成照常；**恰在边界**（钉住时间源，让两边锁到之后读到的都是 `since + oauthPendingTtl`）时两边都判未过期——清扫不删、完成迁 `granted` 且解引用交得出；刚过期时清扫删掉、完成随后得 `oauthDenied`——各种次序下都没有「`granted` 却解引用不出」。另有 `isPendingExpired` 的单元用例：`now` 取 `since + ttl - 1`、`since + ttl`、`since + ttl + 1` 三点，只有第三点为真（X-3） | **真并发** ＋ 故障注入（在「保管方收下」与「迁 `granted`」之间强杀） | 未开始；受阻于保管方最小提供者 `credential-custodian-local` 尚未建包（B-2；节点已立，它那一侧是 verification N-1）。清扫与完成交错这一支就是保管方契约的规范场景 [S-28](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-28-清扫与完成交错)（真并发、未过期与恰好过期各多轮），本节点在自己的绑定表与保管方最小提供者上跑它——**这是 S-23 的证据**；保管方契约的 `Sweep.tla` 证的是契约模型、不证本节点在绑定行上排序，不借来绑定 | 本节点 ＋ 保管方最小提供者（互指 C-1～C-3） |
| N-3 | **解引用与作废交错**（反证不了的那一条）：迁 `revoked`（本版的来路：新发起作废旧 `pending` 以外，授权服务器拒绝）与一次 `resolve` 并发；断言只有「交出（在迁移之前读到）」与「不交出」两种结果（保管方 [S-17](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-17-resolve)「在途的照常完成」） | 真并发 | 未开始；受阻于 B-2（最小提供者 `credential-custodian-local` 尚未建包） | 本节点 ＋ 保管方最小提供者 |
| N-4 | **撤除序列的次序**：在途 `invoke` 先得 `bridgeWithdrawn`（带是否已发出）再关连接；停在提交段的 `refreshActions` 按自己的结果返回、没进提交段的不写副本；撤除之后没有一次无结局的调用 | 演练：可控对端（挂住应答）、可控存储（挂住提交） | 未开始 | 本节点 |
| N-5 | **收口之后进程与后代都不在**（P-12）：对端程序故意派生子进程并忽略退出请求 | 真实进程演练 | 未开始；受阻于 B-1（进程组） | 本节点 |
| N-6 | **孤儿回收**：强杀据点进程后重启，按登记行终止整组；进程号被复用时核对不过、不误杀 | 故障注入 ＋ 真实进程 | 未开始；受阻于 B-1、B-7 | 本节点 |
| N-7 | **stdio 环境恰是三部分的并**（P-8）：据点进程环境里放一个白名单外的变量，断言子进程读不到——**连同 SDK 可能另并的默认变量一起核** | 真实进程演练 | 未开始；受阻于 B-1 | 本节点 |
| N-8 | **凭据不进呈现**（P-3）：对端在 stderr、日志通知、协议错误里回显出示过的凭据；断言留存、日志、失败值里只有遮罩；结构化日志的字段里没有 `settings.credential` | 演练 ＋ 静态检查（日志调用不接收凭据类型，候选 `tools/ts-checks` 规则） | 未开始 | 本节点 ＋ ts-checks owner |
| N-9 | **连接不跨五元组复用**（P-1）：两个租户、同一接入点同一持有格同一目标；同一租户换凭据引用 | 演练：可控对端记下每条连接出示的凭据 | 未开始 | 本节点 |
| N-10 | **执行者贡献的换代，两个方向**：① 执行运行时换代 ⇒ 只有贡献插件重跑、桥的在途 `invoke` 不受影响、新执行者表里有 MCP 那一格；执行运行时还在 `recovering` 时贡献插件的登记照样被收下、不重试（M71）；② **桥换代**（M73）：撤桥 ⇒ 贡献插件先回 `PENDING`、注销已跑，挂着的 `invoke` 仍以 `bridgeWithdrawn` 经交回原语送到执行运行时、收成 `failed{abnormal_interruption}`——**没有一次调用挂着不收场**；故意让包装在贡献插件的 `ctx` 上建 effect 的变体应当失败（`INACTIVE_EFFECT` 或挂住），证明这条演练会失败 | 演练 | 未开始；② 的执行运行时一侧受阻于执行者接口（B-5） | 本节点 |
| N-11 | **中断**：执行运行时的停止请求到达 ⇒ 对端收到取消通知、这次调用不向执行运行时交回任何东西、此后到达的应答被丢弃 | 演练 | 未开始；受阻于 B-1（按请求取消） | 本节点 |
| N-12 | 配置错误同一政策：八项任一缺席或非法（`stdioEnvAllowlist` 按 execution-environments S-13 的 `EnvAllowlist` 形状校验）⇒ 装配启动失败 | 单元测试 | 未开始 | 本节点 |
| N-13 | 假设 A-1（与执行运行时节点同一条）与 `provide-is-effect-managed` 升格，一起列 kernel-basis 待补（M73；前者是续期者唯一的前提，后者是 N-10 ② 里「撤桥 ⇒ 贡献插件先回 `PENDING`」的依据） | `core/kernel-basis` 的 probe | 未开始（**待核对主张**） | `core/kernel-basis` owner |
| N-14 | 静态检查：两个插件都不 `emit`、不监听；桥本体不 inject 执行运行时、执行运行时包不 inject 桥；`write(fn)` 内不调用保管方（P-13）；JSON 列只经 `readJsonStrict`／`writeJsonLossless` 读写（R-B9）；**保管方的 `depositOAuth`、`resolve` 只由桥本体解析**；**`./tx-reads` 只许 `credential-custodian-local` 与本包测试 import**（B-10）；本包里判 `pending` 过期只经 `isPendingExpired`，不另写对 `since` 与 `oauthPendingTtl` 的比较（X-3），执行者贡献插件不解析 `credentialCustodian`（保管方 [S-19](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 3 行；与模型档案目录节点 MPD-N4 同一类，那边管 `readReplica`） | 结构检查，带「故意违反就失败」的自测 | 未开始 | 本节点 ＋ ts-checks owner |
| N-15 | **`schema_unsupported` 的替换件口子**（M37）：对端动作的参数 schema 过了前十二道、只是编不出来（或 `pattern` 超出 `core/tool-definition` 登记的上限）⇒ 不进 `excluded`，投影成同形的一项、标「只能以替换件出现」、原因 `schema_unsupported`；过不了前十二道的仍进 `excluded{input_rejected}`；同一副本投影两次逐字相同；**两种原因同时成立**（`taskSupport = required` 且参数 schema 判不了）⇒ 原因是 `schema_unsupported`、不是「执行方式本版不支持」（N-24） | 单元测试（纯函数） | 未开始 | 本节点 ＋ `core/tool-definition`（上限的值） |
| N-16 | **JSON 每一跳无损**（M36）：对端 `inputSchema` 里有超出 ±2^53 的数，副本落盘回读逐字不变；调用参数里的大数送到对端逐字不变；对端应答里有重复键 ⇒ `protocolError`，不挑一个 | 单元测试 ＋ 可控对端 | 未开始；线上那两跳受阻于 B-1（SDK 的编解码能否换） | 本节点 |
| N-17 | **公开函数面单独可用**（[design 的公开面](design.md#公开面)）：不装 Cordis、不给存储与保管方，`connectEndpoint` 对一个可控 stdio 对端与一个可控 HTTP 对端各建一条连接、`listActions` 分页到底（超 `maxListPages` ⇒ `protocolError`）、`call` 交回应答或带「是否已发出」的失败、`close` 按 S-26 收口；`projectActions`、`toToolResult` 对 examples 的每一例单测；**反证**：`connectEndpoint` 收到一个 `CredentialRef` 时不解引用（类型上就收不进）；两次 `connectEndpoint` 同参数是两条连接（函数层不按五元组复用、不承诺 S-6） | 单元测试 ＋ 可控对端演练 | 未开始；进程与环境那几项受阻于 B-1 | 本节点 |
| N-18 | **S-23 ④ 的两次提交**（[跨 owner 一节](design.md#跨-owner-的同一提交oauth-绑定行与保管方的凭据行)「比字面的同一提交弱的地方」）：在「保管方 `depositOAuth` 收下」与「绑定行迁 `granted`」之间强杀据点进程；断言重启后那份凭据对任何读者都不可用（`resolve` 得 `notResolvable`）、绑定仍 `pending`、过期后清扫丢掉那一行（保管方 [S-18](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-18-清扫) 表第 2 行）；同一绑定重发起之后旧的那一行永不生效。另一支：迁 `granted` 那一次提交失败（注入 `StorageUnavailable`）⇒ `completeOAuth` 得 `dependencyUnavailable`、同样不留可用凭据 | 故障注入 ＋ 真实存储（sqlite 临时文件库；pg 另一遍） | 未开始；受阻于 B-2 | 本节点 ＋ 保管方最小提供者 |

### SDK 能力的来源核对（B-1）

每一项在钉版之后各给一条 probe，结果进 basis 或登待核对主张；**任一项不成立，那一格改为自写，不改契约**：

| 要核对的 SDK 能力 | 本节点哪里用 | 不成立时 |
|---|---|---|
| 精确版本（D-037：尚无决定；实施开工前出决定，M73） | 全部 | —— |
| 线上 JSON 的读写能否换成严格无损的那一对（M36） | S-19、S-20 | 自写传输层的编解码 |
| stdio 传输：子进程标识、独立进程组、环境是否另并默认变量、stderr 接管 | S-6、S-26、S-28 | 自己拉起进程，只借 SDK 的消息分帧 |
| 按请求的取消通知与进度回调 | S-19 | 自写请求层的取消与进度路由 |
| 分页游标 API | S-16 | 自写分页循环 |
| 列举结果是否原样保留 `execution.taskSupport` | S-17 | 从原始应答读 |
| OAuth 客户端钩子（令牌读写、PKCE、401 时续期） | S-22～S-24 | 自写授权码流程与续期 |

## 覆盖缺口

- **全部条款没有任何实现证据**：源码、测试、集成运行都不存在。
- **受阻**：凭据保管方（B-2，**接口已定、真承接者未到**；最小提供者节点 `credential-custodian-local` 已立、尚未建包、本版只进验收装配）——产品装配里带凭据的接入点与 OAuth 全路；最小提供者装上之后仍受阻：要静态凭据的接入点（C-4，保管方 G-2）、续期（C-5，G-4）、出示名（C-6，G-3），三项本版不收；配值副本读面（B-3）——S-8 两条迁移、S-24 ③④、S-37（两者按 D-060 §八 M43 本程不补）；原 B-6（执行运行时交来的接入点持有没有来路）已随 M33 闭合，但执行运行时 `submit` 要的报告来自注册表，而注册表本批 `PENDING`，所以真实装配里 `invoke` 仍到不了。受阻消费者：会话资产注册表（MCP 动作条目）、执行运行时（MCP 调用）、交付面（OAuth 取凭据）。
- **待核对主张与假设**：SDK 的六项能力（上表）；A-1、`provide-is-effect-managed`（N-13）；续期者唯一只到 A-1 为止（design 关键选择四）。
- **形式结论**：本契约没有形式工件；[bindings](bindings.yaml) 为空。S-23 的证据是场景：N-2（保管方 S-28 的真并发交错）与 N-18（S-23 ④ 两次提交之间强杀），都未开始、受阻于 B-2。
- **契约 S-30 右列（协议须给）**本节点一条都不兑现；跨进程逐行重开。
- **断电边界**：sqlite `synchronous = NORMAL` 下丢最后一段已提交事务会丢进程登记行或 `granted` 迁移（design R-B7）；没有证据形式。

## 修订波（2026-09-25 公开面）

依据：D-063 R-1、R-2，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，D-060 §八 N-37 ⑤⑩。本波只改节点；契约侧（本契约 G-7 改指保管方接口）由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-063 R-2 | 新开「公开面」：`connectEndpoint`、`projectActions`、`toToolResult`、`createMcpExecutor` 四样公开；两个插件是它们的一种消费者；运行时层才成立的不变量逐条列出、函数层不承诺 | design.md「公开面」；README；本页 N-17 |
| 保管方接线 | `capability.credential-custodian` v2 S-16～S-19 | S-9、S-23、S-24 行，跨 owner 一节，依赖表，R-B5，C-1～C-6 加「接口契约兑现条款」一列，失败映射（`notResolvable` ⇒ `credentialUnavailable`；`unavailable`／`custodianWithdrawn` ⇒ `dependencyUnavailable`；`bindingUnknown`／`invalidInput` ⇒ 缺陷），装配给一节，归装配 | design.md 对应各处；B-2 |
| C-4～C-6 本版不收 | 保管方 G-2、G-4、G-3；N-37 ⑩ | C-4 静态凭据（引用一律 `notResolvable`）、C-5 续期写回（本版不续期，令牌到期人重取；关键选择四的调度器本版不触发）、C-6 出示名，三项标「本版不收」 | design.md C-4～C-6、S-9 与 S-24 行、关键选择四、B-2；本页 S-36 行、覆盖缺口 |
| 最小提供者的落处 | N-37 ⑤ | OAuth 条目以密文落在 `mcp_oauth_binding` 所在的同一存储、本机只放密钥——C-1 的引用约束与三条反证所靠的那一行锁由此成立 | design.md 跨 owner 一节第 2 条、R-B5、归装配 |
| 取值问法的静态检查 | 保管方 S-19 第 3 行 | `depositOAuth`、`resolve` 只由桥本体解析 | design.md C 清单末段；本页 N-14 |
| 绑定一条借来的形式证据 | 保管方契约 S-21；run `2026-09-25-formal-credential-custodian` | `capability.mcp-bridge/v2#S-23` 绑 `formal:credential-custodian-v2-sweep`（`CompleteFreshTime` 即本节点「过期按锁到之后的时刻判」；去掉即反例） | [bindings](bindings.yaml)；README 绑定层；本页 N-2 |
| 两份白名单同一形状类型（主线 2026-09-25 裁定） | 主线裁定：`stdioEnvAllowlist` 与 hooks-import 的 `hookEnvAllowlist` 两个配置项、同一形状类型，由 execution-environments 定一次 | config 一段写明；那份契约尚无此类型，登 B-9 | design.md config、B-9 |
| 撤回借来的形式绑定（主线 2026-09-25 第二轮） | 模型证的是契约不是代码；「在绑定上排序」是模型前提 | `bindings.yaml` 改为空表、文件头写明不借的理由；S-23 的证据改登场景：N-2 引保管方 S-28 真并发交错，新增 N-18（S-23 ④ 两次提交之间强杀、迁移那一次提交失败）；上一行的处置由本行取代 | bindings.yaml；README 绑定层与阅读表；本页 N-2、N-18、覆盖缺口 |
| 对齐契约第二轮（`47e36d14`）：`EnvAllowlist` | `capability.execution-environments/v2#S-13` 表下 `EnvAllowlist` 一条；`capability.mcp-bridge/v2#S-6` | B-9 闭合；config 一段改指那一条 | design.md config、B-9 |
| 保管方最小提供者节点立起（主线 2026-09-25，按 `credential-custodian-local` 的 CCL-1） | `packages/infra/credential-custodian-local`（candidate）的 K-3～K-5、CCL-1～CCL-3 | 导出存储级子入口 `./tx-reads`（`readOAuthBinding`、`lockOAuthBinding`，候选）；`mcp_oauth_binding` 的四列 `binding_id`、`state`、`since`、`credential_ref` 与绑定行锁登记为有外部消费者的实现细节（X-1、X-2）；R-B4、R-B5、C-1～C-3 改指它的 K-4、K-3、K-5；B-2 改「最小提供者节点已立」；导入限定登 B-10 | design.md 公开面、跨 owner 一节、外部依赖登记、R-B4、R-B5、C-1～C-3、依赖表、装配给表、归装配、B-2、B-10、报给主线；README；本页 N-2、N-3、N-14、覆盖缺口 |
| 独立评审 N7 F-1：过期谓词在两个 owner 各写一份 | D-060 §八 N-42 ②（谓词只一份；契约写明运算符） | `./tx-reads` 再导出 `isPendingExpired(binding, now, ttl)`（`now > since + ttl`，严格大于，同 `Sweep.tla`），本插件的 S-8 判定与保管方清扫共用；登记为 X-3；S-8、S-23 行、C-3、第三条反证改用它，反证加「恰在边界」一格与两边运算符分叉时的反例 | design.md 公开面 `./tx-reads` 一段、S-8 行、S-23 行、给凭据保管方的外部依赖（X-3 与末段）、C-3、跨 owner 一节第三条反证；README 受阻一段；本页 N-2（边界一支与三点单元用例）、N-14（谓词只经 X-3 的静态检查） |
| 独立评审 N7 D-1：`oauthPendingTtl` 双持还是写成绑定行一列 | D-060 §八 N-42 ③（主线裁：维持双持＋相等装配测试） | 本节点没记替代形状；归装配那一句标「已裁」，表不改 | design.md 归装配 |
