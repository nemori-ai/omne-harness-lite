# mcp-bridge 实现设计

> 本批设计已接受（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-045](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

## 实现路径与来源

**官方 MCP SDK 之上自写薄桥**（[D-037](../../../../record/decisions/mcp-client-adoption/decision.md)）：握手、JSON-RPC、两种传输、分页、取消与通知交官方 `@modelcontextprotocol/sdk`，作一般第三方依赖、**不 fork**；本节点自写的是契约拥有的部分——按持有键控的连接、完整列举与持久副本、投影与最小规范化、收场映射、两项超时、OAuth 绑定与续期、收口次序。

**SDK 采用版本**：D-037 明写「精确钉版未定」，**采用版本尚无决定**；钉版时不用 `^` 宽范围（D-037 保留前提）。
**本节点用到的 SDK 能力全部待取证**（契约 G-6；basis 没有 MCP 条目，每一项是「假设，须按 source-check 取证」，登在[缺口 B-1](#实施缺口与消费者影响)）：stdio 传输能否拿到子进程标识并让它成为独立进程组、它在给定环境之外是否另并默认变量、stderr 能否接管；按请求的取消与进度回调；OAuth 客户端钩子（令牌的读写、PKCE、401 时续期）；列举分页的游标 API；列举结果里 `execution.taskSupport` 是否原样保留。
**同行避坑清单**（D-037「只借鉴，目的是避坑」）逐条落到下文：跨连接清单缓存且凭据类排除 → 副本按 (租户, 接入点, 持有格) 键控；翻页守卫 → `maxListPages`；四种超时分开 → 连接超时、调用超时、收口宽限、续期间隔各自一项；断连收掉全部挂起请求、不重放 → S-26／S-27 行；进程组终止、stderr 排空、环境白名单 → S-6、S-26 行；错误保留分类与原始码 → `protocolError{raw}`。

**复用的本仓库节点**：存储协议 [`core/storage`](../../core/storage/README.md)（实例 [`infra/storage-sql`](../../infra/storage-sql/README.md)）；时间源 [`infra/clock`](../../infra/clock/README.md)；[`core/kernel-basis`](../../core/kernel-basis/README.md) 的 `definePlugin`、`resolveOptional`；工具定义形状与表示层校验（含 `schema_unsupported` 的实现上限，它的 TD-2）[`core/tool-definition`](../../core/tool-definition/README.md)、接入点形状与动作清单副本 [`core/mcp-endpoint`](../../core/mcp-endpoint/README.md)、结果块与**严格的无损 JSON 读写**（候选 `readJsonStrict`／`writeJsonLossless`，[D-040 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）[`core/content-blocks`](../../core/content-blocks/README.md)（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：一契约一包）。
**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）。
**配置错误一个政策**：config 经 `definePlugin` 的 `Config` 在插件体之前校验，不过即 fiber `FAILED`、装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：连 MCP 对端、投影动作、把应答译成结果是可单独取用的构件，不依赖 Cordis、会话、租户或存储；本包的两个插件是它们的一种消费者。名字全部**候选**，**全部尚未实现**；连接构件的形状随 SDK 取证（B-1）定。

**公开函数面**（包入口导出）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `connectEndpoint(target, presentation?, limits, signal) → McpConnection` | 在官方 SDK 之上建**一条**连接：stdio 不经 shell、子进程环境恰是交来的那一份；HTTP 带交来的请求头；`connection.listActions()` 分页列举到底（超 `maxListPages` ⇒ `protocolError`）、`connection.call(remoteName, arguments, onProgress, signal)` 交回应答或带「是否已发出」的失败、`connection.close()` 按 [S-26](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-26-连接的收口次序) 的次序收口。**凭据只收已经解出的本体与出示方式**，不收引用、不解引用 | 连接目标与接入点形状：`data.mcp-endpoint/v1`；参数与应答的 JSON：`data.content-blocks/v1`（严格无损，M36；线上两跳待取证 B-1）；失败值的词汇借 `capability.mcp-bridge/v1` [S-21](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-21-失败值与收场的对应)（不含 `bridgeWithdrawn`、`dependencyUnavailable`——它们只在服务层出现） |
| `projectActions(snapshot, limits)` | 三样最小规范化 → 名字 → 参数 schema → `entries`／`excluded`／「只能以替换件出现」 | [S-17](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-17-projectactions)；`data.tool-definition/v1`（上限归 `core/tool-definition`） |
| `toToolResult(response)` | 对端应答 → `ToolResult` ＋ `isError` | [S-20](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-20-对端结果怎样成为-toolresult) |
| `createMcpExecutor(invoke)` | 按执行运行时的执行者接口（它的 T-14）包一个调用函数：停止请求转成取消通知、进度转成帧、失败带「是否已发出」 | 执行运行时节点的 `ToolExecutor`（候选形状，无契约） |

**存储级子入口 `./tx-reads`**（包的子路径导出，**不属函数面**，同 organization-governance 的 `./tx-reads` 体例）：`readOAuthBinding(tx, bindingId)`、`lockOAuthBinding(tx, bindingId)`（候选）——在**调用方交来的事务句柄**里读、或锁定读 `mcp_oauth_binding` 的一行，交回 `{ state, since, credentialRef? }` 或「没有这一行」；只读、不自己开事务、不经桥的服务面（存储协议 P-13：事务里不调别的插件的服务）。同一子路径再导出**过期谓词** `isPendingExpired(binding, now, ttl)`（候选）：纯函数，`now > binding.since + ttl`——**严格大于，恰等于那一刻不算过期**，与契约 S-8 迁移表「过期」一格、保管方 S-18 第 2 条和 `Sweep.tla` 的 `Expired` 同一个谓词；只判时刻那一半，`state` 由调用方先判；`now` 与 `since` 取自同一时间源 `clock`、同一单位。**本插件自己的 S-8 判定与保管方的清扫共用这一份实现**（[D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ②：谓词只一份），两边不各写一个比较。唯一的消费者是凭据保管方最小提供者 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#跨-owner-的同一提交桥的绑定行与引用约束)：`resolve` 的读事务用前者（它的 K-5），清扫的写事务用后者（它的 K-4），清扫判过期用 `isPendingExpired`。四列与谓词的登记见[给凭据保管方的外部依赖](#给凭据保管方的外部依赖登记)。

**Cordis 服务面**：桥本体 `mcp-bridge`（服务 `mcpBridge`，六个操作；必需 inject `storage`、`clock`）与执行者贡献 `mcp-bridge-executor`（[下节](#插件边界与服务面)）。桥本体的每条连接都由 `connectEndpoint` 建、每次投影都调 `projectActions`、每次结果都经 `toToolResult`；贡献插件交给执行运行时的就是 `createMcpExecutor(桥本体.invoke)`。

**只在运行时层成立、函数层不承诺**：连接按 (租户, 接入点, 持有格, 连接目标, 凭据引用) 区分、不跨租户复用（S-6，连接表的键）；凭据按持有解引用（S-9）；副本单调整份替换（S-7）；OAuth 的「同一提交」与续期、续期者唯一（S-23、S-24）；桥换代时在途调用落 `bridgeWithdrawn`（S-27）；据点重启后回收 stdio 孤儿（S-28）；每次执行尝试重新列举、尝试内钉住（S-12，钉住归注册表）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **连接构件 `connectEndpoint` 也公开**（选）；落选：只公开 `projectActions` 与 `toToolResult` 两个纯函数，连接留在桥本体里 | 连接的实现细节全押在 SDK 取证上（B-1：进程组、环境合并、按请求取消、无损编解码），此刻公开等于把一个还没定形的面交出去 | 形状随 B-1 的结论可能改（例如自己拉起进程、只借 SDK 的分帧）；candidate 期要跟着改公开入口 | 中：「传输适配」是 SYS-OPEN 点名的可单独取用构件；外部包装者最想要的正是「给我一条连得上的 MCP 连接」 |

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个包、两个插件**：

| 插件（候选名） | inject | 持有 | 对外 |
|---|---|---|---|
| `mcp-bridge`（桥本体） | `storage`、`clock`（必需） | 一个宿主 effect：连接表、在途操作登记、续期调度、孤儿回收 | provide 服务（候选名 `mcpBridge`），方法与契约第四节一一对应：`refreshActions`、`projectActions`、`availability`、`invoke`、`beginOAuth`、`completeOAuth`；`projectActions` 同时作纯函数由包导出 |
| `mcp-bridge-executor`（执行者贡献） | `mcpBridge`、`toolExecution`（必需） | **无状态** | 在自己的 effect 里向执行运行时登记「MCP 来源」那一格执行者，拿回注销函数包进同一个 effect。**交出去的执行者包装不依赖本插件 fiber 的存活**（[D-040 §八 M73](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：它只闭包桥本体的服务引用，每次执行的结算走执行运行时随那一次执行交来的交回原语；不在本插件的 `ctx` 上建 effect、不读本插件的状态 |

**config**（桥本体；契约 G-12 的具名参数加本节点一项，**全部必填、无默认**，缺一或非法 ⇒ 启动失败）：
`stdioEnvAllowlist`（一份 [`EnvAllowlist`](../../../../spec/capabilities/execution-environments/v1/contract.md#s-13-startprocess)：可空、不可缺席；与 hooks-import 的 `hookEnvAllowlist` 同一形状、各自配值）、`maxListPages`（正整数）、`oauthPendingTtl`、`unassignedCredentialRetention`、`stdioTerminateGrace`、`renewalRetryInterval`（正时长）、`stderrBound`（正字节数）；本节点加 `idleConnectionTimeout`（正时长：S-6 ⑤「何时关」归提供者设计）。值由装配给，契约不填。

**迁移**：包导出迁移片段（候选名 `mcpBridgeMigrations`），由 `apps/cli` 经 `composeMigrations` 合成。

### 关键选择

**一、连接表由宿主的一个 effect 持有（选），不开「每条连接一条 fiber」。**

| | 每个连接键一条子 fiber，插件体什么都不 inject，一个收口 effect（草图原样） | **连接表是宿主 effect 里的一张表，每条连接一个关闭例程（选）** |
|---|---|---|
| 落选方的最强论证 | 每条连接的生命周期被 fiber 显式框住，父卸载带走子（草图 H-1），写漏了也不留孤儿 | —— |
| 本方弱点 | —— | 「一条不漏」要宿主自己保证：撤除序列必须遍历整张表 |
| 为什么选它 | 契约 [S-27](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-27-桥被替换或卸载) ④ 要求**先**给每一次在途调用交出 `bridgeWithdrawn`、**再**逐条按 S-26 收口；fiber 卸载时各 effect 由 `Promise.all` 并发驱动（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)），子 fiber 各自的关传输会与父的「先交出结局」并发。连接不 inject 任何东西，fiber 给不出依赖追踪；选子 fiber 还要先补 H-1、H-3 两条没有 probe 的假设 | 次序在一个 effect 里 `await` 出来，只依赖有 probe 的那条 basis |
| 置信度 | 中。**与执行运行时节点同一处对草图的偏离**，交 architecture-reviewer 一并判 | |

**二、执行者经零状态的贡献插件登记（选），桥与执行运行时互不 inject。**

| | 桥 inject 执行运行时，在自己的 effect 里登记 | 桥经 `ctx.get` 现取执行运行时登记 | **另一个零状态插件 inject 两者、只做登记（选）** |
|---|---|---|---|
| 落选方的最强论证 | 少一个插件 | 少一个插件、桥不随执行运行时换代 | —— |
| 本方弱点 | —— | —— | 多一个插件与一行装配 |
| 为什么选它 | 执行运行时换代 ⇒ 桥重跑 ⇒ 全部连接撤下、在途调用全落 `bridgeWithdrawn`——把别人的换代变成本节点的停机 | 执行运行时换代时桥不知道，新实例的执行者表里没有 MCP 那一格，此后每次 MCP 调用都 `failed{start_failed}`，直到桥自己重跑 | 任一方换代只重跑这个零状态插件、重新登记；桥与执行运行时的在途工作都不动（草图「贡献的统一形状」） |
| 置信度 | 高 | | |

**三、OAuth 完成的「同一提交」落在绑定行的状态列上（选）。**契约 [S-23](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-23-completeoauth) ④ 要求保管方收下凭据、发出引用与绑定迁到 `granted`「落在同一提交里」；保管方是另一个 owner（装配给），存储协议 P-13 禁止在本插件的写事务里调用它的服务面。

| | 保管方的写口加入本插件的事务（跨插件传事务句柄） | 先迁绑定、再请保管方收下 | **保管方先把凭据收成「待生效」、行上以引用约束指着绑定；本插件再在绑定行上迁 `granted` 并记下那个引用；保管方解引用时在同一事务里读绑定行（选）** |
|---|---|---|---|
| 落选方的最强论证 | 字面上的同一提交 | 简单 | —— |
| 本方弱点 | —— | —— | 两次提交；留下「待生效」的孤儿行要清扫；保管方必须与绑定表在同一存储、同一约束域 |
| 为什么选它 | 改两份公开面、跨进程即作废（与执行运行时节点不用跨插件事务句柄同一理由） | 绑定 `granted` 而凭据没收下：此刻崩溃，绑定指着一个解引用不出的引用、却不再 `pending`，人不知道要重取 | **可见效果只在一次提交里发生**：凭据可用 ⇔ 绑定行 `granted` 且记着这个引用——那是被读的那一行上的一列；保管方的「待生效」行在那之前对任何读者都不可用 |
| 置信度 | 中高；**C-1～C-3 已由保管方接口接住**（`capability.credential-custodian` v1 [S-16](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-16-depositoauth)～[S-18](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-18-清扫)，candidate；清扫与完成的交错有那份契约的形式模型，[跨 owner 一节](#跨-owner-的同一提交oauth-绑定行与保管方的凭据行)），真承接者 `infra/secrets` 未到，最小提供者节点 `credential-custodian-local` 已立（经本包 `./tx-reads` 读与锁绑定行） | | |

**四、续期者唯一：宿主 effect 里的一个调度器，撤除时等在途续期结束（选）。**

| | 绑定行上加一列续期认领，锁下认领、完成时清掉 | **一个进程里一份桥、一个调度器；撤除序列等在途续期结束（选）** |
|---|---|---|
| 落选方的最强论证 | 次序落在存储里，旧实例与新实例都排进去；不依赖任何内核假设 | —— |
| 本方弱点 | —— | **依赖假设 A-1**（内核等旧实例的撤除结算完才跑新实例的插件体）：不成立时，换代窗口里新旧两份可能同时拿同一份续期令牌去续，授权服务器若轮换续期令牌就会把两边一起作废——人要重取一次（看得见、可恢复，不串号） |
| 为什么选它 | 认领要有「持有者已死」的判法：同一进程里旧实例还活着，进程崩溃后认领又要有人清——不引入时间租约就说不清谁来清，引入了就是用 `now` 定次序 | 单机单进程里只有换代窗口会有两个续期者；契约 S-30 把「只有一个续期者」写在协议给那一列 |
| 改选触发 | A-1 的 probe 不成立；或运行日志出现换代窗口里的双续期 | |
| 置信度 | 中低。**交 architecture-reviewer 判** | |

**本版调度器不触发**：保管方契约本版不收续期写回（[G-4](../../../../spec/capabilities/credential-custodian/v1/contract.md#十一已知缺口)，C-5），没有到期时刻、也没有写回口；这一选择在续期写回进来那一版才生效，A-1 的依赖随之推迟、不消失。

### 持久记录（逻辑名，候选）

| 记录（候选表名） | 键与列（候选） | 对应条款 |
|---|---|---|
| 动作清单副本 `mcp_action_snapshot` | 主键 `(tenant, endpoint, scope_key)`（`scope_key` 是持有格的规范串）；`fetched_at`、`tools`（对端原话，逐项 `McpToolDescriptor`）。**行不存在 = `not_fetched`**——只在一次成功的读里成立，读失败不是它 | S-7 |
| OAuth 绑定 `mcp_oauth_binding` | 主键 `binding_id`；`tenant`、`endpoint`、`scope_key`、`state ∈ pending · granted · revoked`、`since`、`credential_ref?`（`granted` 时）、`revoked_reason?`；**本节点的内部列**：PKCE 校验值与状态参数（S-13：不进任何呈现）、授权服务器元数据、连接目标（续期时要）。条件唯一：同一 `(tenant, endpoint, scope_key)` 至多一行 `pending` | S-8、S-22、S-23、S-24 |
| stdio 进程登记 `mcp_stdio_process` | 主键 `(process_group, started_at)`；`connection_key_digest`（不含凭据）、`spawned_at`。拉起之后写、S-26 第 2 步完成后删 | S-28 孤儿回收 |

### 契约责任到插件、服务与操作

契约的九件事本表不复述，只写兑现点与缺口。**外部效果（建连、拉起进程、列举、调用、授权服务器）一律在存储事务之外；每个写操作至多一次写事务**（存储协议 P-13）。方法名取契约，其余名字标候选；全部**尚未实现**。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-5-接入点持有的寻址) 按持有寻址 | 每个方法先表示层校验 `endpointHolding`（三个身份参数、`provenance` 与 `settings.credential` 的一在一缺）；工作区格或非租户格却带凭据引用 ⇒ `credentialUnavailable` | 尚未建包 | 本节点不求值；执行运行时交来的持有就是它 `submit` 带的那份报告里钉住的那一份（M33，原 B-6 闭合） |
| [S-6](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-6-连接归桥不上签名不跨租户) 连接 | 连接表：键 = (租户, 接入点, `scope_key`, 连接目标的规范值, 凭据引用或「缺席」)；惰性建立，同键的并发建立共用一次；`connectTimeout` 封顶建立加第一份清单。stdio：据点机上拉起，**不经 shell**，环境恰是「白名单变量 ∪ 正文 env ∪ 凭据 env」、后者压前者 | 尚未建包；SDK 的 stdio 传输是否另并默认变量**待取证**（B-1）——若并，本节点自己拉起进程、只借 SDK 的消息分帧 | 同键之外一律不复用（P-1）；设置换值、凭据换引用 ⇒ 新键新连接，同一 (租户, 接入点, 持有格) 的旧连接转入「排空」：不接新调用，在途归零即按 S-26 关；闲置 `idleConnectionTimeout` 即关 |
| [S-7](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-7-动作清单持久副本) 副本 | `mcp_action_snapshot`；条件写见 R-B1；`tools` 列是对端原话，严格无损读写（R-B9） | 尚未建包 | 持有移除后不再读到；删行是整理，**本批不做**（没有「持有已移除」的读面，B-3） |
| [S-8](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-8-oauth-绑定状态与迁移) OAuth 绑定 | `mcp_oauth_binding`；过期是读时判定：`isPendingExpired(binding, clock.now(), oauthPendingTtl)`，即 `now > since + oauthPendingTtl`（严格大于，X-3），不靠定时器 | 尚未建包 | 「引用不再被配着」「取得之后迟迟没配上」两条迁移要读据点上的配值副本——**没有读面**（B-3），本批这两条不触发 |
| [S-9](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-9-凭据的出示与取用) 凭据出示 | 建连前：缺席 ⇒ 不出示；有引用 ⇒ 先判来处规则（第 3 条），再现取保管方（服务键 `credentialCustodian`，[D-040 §八 M69](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）`resolve(ref, holding)`（[`capability.credential-custodian/v1#S-17`](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-17-resolve)）按租户格解引用；stdio 作环境变量、HTTP 作请求头、OAuth 取得的作持有者令牌 | 尚未建包；**保管方接口已定**（`capability.credential-custodian` v1），真承接者 `infra/secrets` 未到，最小提供者节点 `credential-custodian-local` 已立（契约 G-7，B-2）；**本版只有 OAuth 条目交得出**——静态凭据的引用一律 `notResolvable`（那份契约的 G-2），出示名（C-6）也不在本版 | 保管方缺席、`unavailable`、`custodianWithdrawn` ⇒ `dependencyUnavailable`，**不改成不带凭据去连**；`notResolvable`（不在那份持有上、已作废、绑定不是 `granted`、记下的不是它、本版的静态引用）⇒ `credentialUnavailable` |
| [S-10](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-10-对端可用性不由本系统掌握)、[S-11](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-11-缺席时的默认答案) 不可用不是故障、缺席默认 | 失败映射表 | 尚未建包 | 见[状态、并发与失败映射](#状态并发与失败映射) |
| [S-12](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-12-每次执行尝试重新列举尝试内不变) 每次尝试重新列举 | `refreshActions` 每次真列举；不缓存 | 尚未建包 | 钉住归注册表 |
| [S-13](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-13-凭据与引用不进任何呈现) 凭据不进呈现 | 每条连接记下它出示过的凭据文字；stderr、日志通知、协议错误原文留存之前逐段替换成固定遮罩；结构化日志只写接入点、持有格、失败值名，不写 `settings.credential` | 尚未建包 | 引用只在 `completeOAuth` 的返回里出现一次；**不承诺遮得掉对端变形过的秘密**（契约原话） |
| [S-14](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-14-桥不做放行判断) 不做放行 | `invoke` 不读执行权限、不核 `action` 是否在最新副本里 | —— | —— |
| [S-16](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-16-refreshactions) `refreshActions` | 取 `fetchedAt = clock.now()`（发出第一页之前）→ 取用或建立连接 → 分页列举到底（页数 > `maxListPages` ⇒ `protocolError`）→ 逐项核形状与名字不重复 → 一次写事务做条件写 → 返回 | 尚未建包 | 判定类失败交出现存副本（一次读事务）；「这一次的条件写被更晚的丢弃」⇒ 同一事务里读回存储那份交出 |
| [S-17](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-17-projectactions) `projectActions` | 纯函数：三样最小规范化 → 名字 → 参数 schema（表示层校验借 `core/tool-definition`）→ `entries`／`excluded`／副本那一支；`execution.taskSupport = required` ⇒ 「只能以替换件出现」。**参数 schema 过了前十二道、只是这个实现编不出来或 `pattern` 超上限（`data.tool-definition` 的 `schema_unsupported`，第 13 行）⇒ 不排除**，照常投影成同形的一项、标「只能以替换件出现」、原因 `schema_unsupported`（M37；`data.mcp-endpoint` S-10 同步）；过不了前十二道的照旧进 `excluded` 的 `input_rejected`。**两种原因同时成立**（`taskSupport = required` 且参数 schema 判不了）⇒ 原因报 `schema_unsupported`：投影里**先判定义、后判执行方式**，与「先判名字、再判参数 schema」同一个方向（契约 S-17 末段，[D-040 §八 N-24](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），上限相同的两个实现对同一个动作给出同一个原因 | 尚未建包；上限的值与筛查清单归 `core/tool-definition`（TD-2），本节点只照它的判定打标记 | 被排除的动作写一条结构化日志（不静默丢）；`taskSupport` 能否从 SDK 的列举结果读到**待取证**（B-1）。同一个实现、同一份登记的上限，对同一份副本投影结果恒同——原件与替换件出自同一次投影，同形照样成立 |
| [S-18](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-18-availability) `availability` | 取用或建立连接、握手，不列举；已建立且未出错的连接即 `available` | 尚未建包 | 与 `refreshActions` 同一套连接与失败判定 |
| [S-19](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-19-invoke) `invoke` | 取用或建立连接 → 在途登记 → 发出（此刻起「已发出」）→ 等应答，`callTimeout` 到点 ⇒ 发取消通知、`callTimedOut`；进度通知经执行运行时交来的发帧原语发帧；日志通知遮掉后记日志 | 尚未建包；按请求取消与进度路由**待取证**（B-1）；**参数送出与应答读入是两跳**（M36）：交来的参数是无损值（大数保留原文），SDK 若以普通 `JSON.stringify`／`JSON.parse` 读写线上消息，送出时须经无损写、读入对端应答时严格无损读、重复键即 `protocolError`——SDK 能不能换掉这一层**待取证**（B-1） | **中断**：执行运行时的停止请求到达 ⇒ 发取消通知、在途登记撤掉，这次调用以一个内部的「无结局」值结算，执行者贡献把它丢弃、不向执行运行时交回（执行运行时那时已写下 `interrupted`，契约 S-18「先落后发」）。任何失败都带「是否已发出」 |
| [S-20](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-20-对端结果怎样成为-toolresult)、[S-21](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-21-失败值与收场的对应) 结果映射、收场对应 | 纯函数：应答 → `ToolResult` ＋ `isError`；执行者贡献把 `bridgeWithdrawn` 交回为「异常中断」、其余失败交回为执行者失败，带「是否已发出」 | 尚未建包；执行者接口是执行运行时节点定的候选形状（执行运行时节点缺口 T-14） | 非图、非音的内嵌二进制只留一行说明（契约 G-4）。**桥换代时交回仍到得了**（M73）：撤桥让贡献插件先回 `PENDING`、它的注销 effect 已跑，但在途那一次的包装不靠它——桥撤除序列第 3 步结算出的 `bridgeWithdrawn` 经执行运行时交来的交回原语送到，执行运行时收成 `failed{abnormal_interruption}`；否则那次调用挂在一份已不存在的桥上、永不收场（契约 S-30 第 6 行） |
| [S-22](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-22-beginoauth) `beginOAuth` | ③ 判 → 取授权服务器元数据（事务外）→ 生成 PKCE 与状态参数 → 一次写事务：取持有哨兵（R-B3）、把这份持有上的 `pending` 迁 `revoked`、插入新的 `pending` | 尚未建包；SDK 的 OAuth 钩子**待取证**（B-1） | 不幂等（⑦）；同意地址只含协议的一次性参数 |
| [S-23](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-23-completeoauth) `completeOAuth` | 读事务：绑定 `pending`、未过期、状态参数一致 → 事务外用授权码换凭据 → 保管方 `depositOAuth(holding, binding, body)` 收成「待生效」、交回新引用（[`capability.credential-custodian/v1#S-16`](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-16-depositoauth)）→ 一次写事务：锁绑定行、仍 `pending` 且未过期（**过期按锁到之后取的 `clock.now()` 经 `isPendingExpired` 判**——与保管方清扫同一个谓词、同一份实现，X-3、C-3）⇒ 迁 `granted`、记下引用、`since = now` | 尚未建包；**保管方接口已定**，最小提供者节点 `credential-custodian-local` 已立（B-2） | [关键选择三](#关键选择)；交错反证见[下节](#跨-owner-的同一提交oauth-绑定行与保管方的凭据行) |
| [S-24](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-24-续期清值与作废) 续期、清值与作废 | 续期调度器（宿主 effect）：对 `granted` 绑定，按保管方给的到期时刻提前一个 `renewalRetryInterval` 续；对端以鉴权失效拒绝时当场续；授权服务器明确拒绝 ⇒ 锁绑定行迁 `revoked`、请保管方丢弃；够不着 ⇒ 按间隔重试、期间 `credentialUnavailable` | 尚未建包；**续期写回与到期时刻本版不收**（保管方契约 [G-4](../../../../spec/capabilities/credential-custodian/v1/contract.md#十一已知缺口)，C-5）——调度器无从得知到期时刻，也无处写回新本体：**本版不续期**，令牌到期后对端以鉴权失效拒绝 ⇒ 那一次 `credentialUnavailable`，人要重新取；授权服务器明确拒绝一支照常（锁绑定行迁 `revoked`，保管方的清扫随后丢那一条，S-18）；续期者唯一依赖 A-1（[关键选择四](#关键选择)），在续期写回进来之前不触发 | 续期不改引用、不改绑定、不改 `since`；「换值、清值、持有移除」三条要读配值副本（B-3），本批不触发 |
| [S-25](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-25-对端来的通知与请求) 对端通知与请求 | `tools/list_changed` 合并记一条日志；elicitation、sampling、roots 不声明、来了按协议回不支持 | 尚未建包 | 不改任何钉住的东西 |
| [S-26](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-26-连接的收口次序) 收口次序 | 每条连接一个关闭例程（一个 async 函数）：关传输 → 对进程组先请求退出、`stdioTerminateGrace` 后强制 → 排空 stderr（遮掉、`stderrBound` 封顶）→ 删进程登记行。stderr 在连接活着时持续排空 | 尚未建包；进程组与 stderr 接管**待取证**（B-1） | 在途调用：换值、闲置 ⇒ 等它们结束再关；对端断开 ⇒ 各自 `endpointUnreachable`（已发出） |
| [S-27](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-27-桥被替换或卸载) 桥被替换或卸载 | 宿主 effect 的撤除序列（[成对的装载与撤除](#成对的装载与撤除)） | 尚未建包 | 次序在一个 effect 里 `await` 出来 |
| [S-28](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-28-据点停机与重启) 停机与重启 | 宿主 effect 起来后在后台扫 `mcp_stdio_process`：逐行核对进程身份（进程组号 ＋ 起始时刻），对得上才终止整组、删行；对不上只删行 | 尚未建包 | **拉起到写下登记行之间有一个窗口**：此刻被强杀，那个进程不在登记里、回收不了（B-7，同执行运行时的 X-5） |
| [S-29](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-29-依赖的提供者不可用) 依赖不可用 | 失败映射表 | 尚未建包 | —— |
| [S-30](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-30-装配给与协议给) 装配给与协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |

### 跨 owner 的「同一提交」：OAuth 绑定行与保管方的凭据行

两个写入者：本插件（绑定行）与凭据保管方（OAuth 条目，另一个 owner；**接口已定**——`capability.credential-custodian` v1，真承接者未到，最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#跨-owner-的同一提交桥的绑定行与引用约束) 已立（candidate），它那一侧的同一节与本节互指）。那份契约把本节规矩写成了它的装配给保证（[S-19](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行：OAuth 条目与绑定同一存储、同一约束域，读绑定与迁绑定排得出先后）。**共同触碰的存储对象**：

1. **绑定行上的 `state` 与 `credential_ref` 两列**：「这份凭据可用」的判定就落在这一行上——保管方解引用时，在它自己的读事务里读这一行，只有 `state = granted` 且 `credential_ref` 等于被解引用的那个引用才交出本体（C-2；保管方 [S-17](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-17-resolve) ④ 的「一次一致的读」与 ⑥ 的后两种 `notResolvable`）。
2. **保管方凭据行对绑定行的引用约束**（C-1）：凭据行指着一个存在的 `binding_id`；绑定行不能在凭据行还指着它时被删（保管方 [S-16](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-16-depositoauth) ④、S-19 第 2 行；交来的绑定号不存在 ⇒ `bindingUnknown`）。**最小提供者上它成立的前提**：条目以密文落在与 `mcp_oauth_binding` 同一存储、本机只放密钥（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤，保管方 G-9）——分在两份存储就没有这条约束，也没有下面三条反证所靠的那一行锁。

**反证三条交错**：

- **新的一次发起与旧的完成交错**：旧流程的完成已让保管方收下凭据（「待生效」，指着旧绑定），此时新发起的写事务把旧绑定迁 `revoked`、插入新的 `pending`；旧流程的写事务随后锁旧绑定行，读到 `revoked` ⇒ `oauthDenied`。那份凭据一直指着一个 `revoked` 的绑定，**任何一次解引用都交不出它**，清扫时删掉（C-3）。两个写事务在旧绑定那一行上排出次序（新发起的迁移与完成的锁定读撞同一行），不靠时间、不靠进程内锁。
- **同一个绑定完成两次**：两次各自换取（按协议授权码只能用一次，第二次多半在授权服务器那里就失败 ⇒ `oauthDenied`）；即便两次都换到了、都让保管方收成「待生效」，两个写事务锁同一绑定行，先到的迁 `granted` 并记下自己的引用，后到的读到 `granted` ⇒ `oauthDenied`（⑦）。后到那份凭据行的引用不等于绑定行上记的那个，**解引用交不出**，清扫时删掉。
- **保管方清扫与完成交错**（独立评审 MB-1 构造的那一条）：凭据已收成「待生效」、绑定仍 `pending`，此时清扫跑过。按 M72，清扫与完成**锁同一绑定行**、各自在锁到之后取时刻：完成先到 ⇒ 迁 `granted` 记下引用，清扫随后读到 `granted` 且引用相符 ⇒ 不删；清扫先到而未过期 ⇒ 不删，完成照常；清扫先到而已过期 ⇒ 删掉凭据行，完成随后锁到同一行、取到的时刻不早于清扫那一次 ⇒ 同样判过期 ⇒ 不迁、`oauthDenied`；**恰在边界**（两边读到的都是 `since + oauthPendingTtl`）⇒ 两边都判「未过期」——清扫不删、完成照常迁 `granted`。这一格只在两边用**同一个谓词**时成立：一边写 `≥`、一边写 `>`，清扫在那一刻按 `≥` 删掉条目，完成读到同一时刻按 `>` 迁 `granted`，「`granted` 却解引用不出」就出现了，模型看不见（它两侧共用一个 `Expired`）——所以谓词只一份（X-3）。**不会出现「`granted` 却解引用不出」**。前提：两边取的是同一个时间源、读数不回退（`infra/clock` 的进程内保证）、同一个 `oauthPendingTtl`（cli A-30）、同一个谓词（X-3）——时刻只用来判状态，次序由绑定行上的锁给，不由时刻给。保管方契约的 `Sweep.tla` 在模型层检查了这条交错，但「在绑定行上排序」是那份模型的前提、不是它检查的东西，所以不借来当本节点的证据；本节点的证据是在自己的绑定表与保管方最小提供者上跑保管方规范场景 [S-28](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-28-清扫与完成交错)（verification N-2）。

**反证不了、要真并发演练的**：保管方的解引用读与本插件迁 `revoked`（续期被拒）交错——解引用读到 `granted` 的那一次仍交出本体；契约 S-24 ③「在途的照常完成、撤销管下一道准入」允许，但要演练确认没有第三种结果（verification N-3）。
**它比字面的「同一提交」弱的地方**：两次提交之间有一段「凭据已收下、绑定未迁」；那一段里凭据对任何读者都不可用，崩溃留下的是一行永不生效的凭据，不是一个半成的可用凭据。

### 给凭据保管方的外部依赖（登记）

保管方的清扫与解引用要与本插件的绑定迁移在同一存储对象上排次序（[上节](#跨-owner-的同一提交oauth-绑定行与保管方的凭据行)）。本节点据此把下列两项登记为**有外部消费者的实现细节**：改动须先告知 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#实施缺口与消费者影响)（它的 CCL-1 由本节闭合）。

| # | 依赖对象 | 本节点里它是什么 | 依据 |
| --- | --- | --- | --- |
| X-1 | `mcp_oauth_binding` 的四列 `binding_id`、`state`、`since`、`credential_ref` | 主键；S-8 的三状态；过期判定的起点；`granted` 时记下的那一个引用 | 保管方 S-17 ④、S-18 第 1～3 条；那个节点的 K-3、K-5 |
| X-2 | 绑定行锁（`lockOAuthBinding`，与 R-B4 锁的是同一行） | 完成、续期被拒、作废与清扫的共同排序点 | 保管方 S-18 第 2 条、S-19 第 2 行；那个节点的 K-4 |
| X-3 | 过期谓词 `isPendingExpired(binding, now, ttl)`：`now > since + ttl`（严格大于） | S-8「过期」一格的唯一实现；本插件的完成（S-23 ⑦）与其余读时判定都经它 | 契约 S-8 迁移表、保管方 S-18 第 2 条（同一时间源、同一 `oauthPendingTtl`、同一谓词）、S-19 第 2 行；[D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ② |

三项都只经 `./tx-reads` 暴露，列名不出本包；改 X-3 的运算符或开闭区间就是改契约 S-8 的「过期」，不是本节点的实现细节；引用约束的方向是保管方的条目表指向本表（它的 K-3），所以本表的迁移片段要先于它的合成（它的 CCL-2）。

### 事件与过滤器

**两个插件都不 `emit`、不监听任何 Cordis 事件。**

| 通道 | 派发 | 越界 |
|---|---|---|
| 对端的进度通知 → 帧 | 经执行运行时交给**这一次执行**的发帧原语，只到这一次执行的装配状态 | 不越界：按请求路由（SDK 的按请求进度回调**待取证**）。不用 Cordis 事件——那会把一个租户的对端进度广播给整棵树 |
| 对端的日志通知、`tools/list_changed`、被排除的动作、每次刷新的结果 | 结构化日志（JSONL），先遮掉凭据文字 | 日志行带租户与接入点；不带凭据、不带引用 |

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 存储（`storage`） | 桥本体**必需 inject**；实例 `infra/storage-sql` | 提供者换代 ⇒ 桥重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）⇒ 按 S-27 撤下全部连接、在途调用全落 `bridgeWithdrawn` | 缺席 ⇒ `PENDING`。契约把「本版不换代」留给装配（S-30 第 6 行） |
| 时间源（`clock`） | 桥本体**必需 inject**。**草图只写了存储**：契约 [S-29](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-29-依赖的提供者不可用) 把时间源列为依赖——`fetchedAt`（K34）、`since`、待定绑定的过期、续期时刻都要同一时间源 | 同上 | `'unavailable'` ⇒ 要时刻的操作 `dependencyUnavailable` |
| `capability.credential-custodian/v1` [S-16](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-16-depositoauth) `depositOAuth`、[S-17](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-17-resolve) `resolve`（服务键 `credentialCustodian`，M69 定、与 `apps/cli` 及模型档案目录节点同名） | **可选**：每次要出示凭据、完成 OAuth 时 `resolveOptional` 现取（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）；续期写回本版不收（G-4） | 现取；保管方换代不让桥重跑，已建立连接上出示过的凭据照用到连接关闭 | 缺席、`unavailable`、`custodianWithdrawn` ⇒ 要凭据的操作 `dependencyUnavailable`；`notResolvable` ⇒ `credentialUnavailable`；`bindingUnknown` 与 `invalidInput` ⇒ 缺陷（本插件交来的绑定号与持有不该错）；不带凭据的接入点照常。**接口已定、真承接者未到，最小提供者节点 `credential-custodian-local` 已立**（B-2） |
| 执行运行时的执行者登记（`capability.tool-execution-runtime/v1#S-37`；[`packages/tools/tool-execution-runtime`](../tool-execution-runtime/README.md)） | 执行者贡献插件**必需 inject** `toolExecution` 与 `mcpBridge` | 任一换代 ⇒ 只有贡献插件重跑、重新登记 | 执行运行时缺席 ⇒ 贡献插件 `PENDING`，MCP 那一格没有执行者（执行运行时收成 `failed{start_failed}`） |
| 据点上的配值副本（「引用还配没配着」；无契约） | **可选**；**没有读面**（B-3） | —— | 本批不触发依赖它的两条迁移 |
| 调用方（会话资产注册表、执行运行时、交付面） | 不依赖它们；它们现取本服务 | —— | —— |

### 对存储提供者的要求清单

| # | 要求 | 对应条款 | 协议兑现点 |
|---|---|---|---|
| R-B1 | **副本条件写**：一次写事务里对键锁定读；行在 ⇒ 新 `fetchedAt` 更晚才整份替换；行不在 ⇒ 插入，两次并发首插撞主键之后在同一事务里重读、按同一规则判（撞键不废事务） | S-7 ③④、S-16 ⑤⑦ | P-3、P-4（行不在则锁不住，靠主键兜）、P-2、P-11 |
| R-B2 | 单次提交原子：`beginOAuth` 的「旧 `pending` 作废 ＋ 新 `pending` 插入」；`completeOAuth` 的「迁 `granted` ＋ 记引用」 | S-22 ④、S-23 ④ | P-1 |
| R-B3 | **同一持有的发起串行**：`beginOAuth` 的写事务开头取 `lockSentinel('mcp-bridge/oauth/<租户>/<接入点>/<scope_key>')`（候选名）；条件唯一「同一持有至多一行 `pending`」作兜底，撞了是缺陷 | S-8「至多一个 `pending`」 | P-5、P-11 |
| R-B4 | 绑定行的锁定读：完成、续期被拒、作废都在一个写事务里锁这一行再判再写 | S-23 ②⑦、S-24 | P-4；保管方清扫锁的是同一行（[`credential-custodian-local`](../../infra/credential-custodian-local/design.md#对存储提供者的要求清单) K-4，经 `./tx-reads` 的 `lockOAuthBinding`） |
| R-B5 | **引用约束与保管方同域**：保管方的凭据行对 `mcp_oauth_binding.binding_id` 的引用约束，要求两张表在同一存储、同一约束域（与保管方契约 [S-19](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行、最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#对存储提供者的要求清单) 的 **K-3**（引用约束 `ON DELETE RESTRICT`、不延迟）与 K-9（同一 `storage` 实例）互指；落处按 N-37 ⑤：密文进绑定所在的存储） | S-23 ④、S-30 第 4 行 | P-10（`ReferenceViolation` 两向） |
| R-B6 | 只读事务快照一致 | S-16 ⑥、S-23 ② | P-6 |
| R-B7 | 持久：副本、绑定、进程登记跨重启仍在。**边界**：sqlite `synchronous = NORMAL` 下操作系统崩溃或断电可能丢最后一段已提交事务（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md)）——丢的若是进程登记行，那个进程成了回收不了的孤儿；丢的若是 `granted` 迁移，人要重取一次 | S-7 ⑤、S-28 | P-7 |
| R-B8 | 不可用可识别：读失败不当 `not_fetched`、不当空清单 | S-11、S-16 ⑧ | P-8 |
| R-B9 | **JSON 列按文本存、严格无损读写**：副本的 `tools`（对端原话，`inputSchema` 里可能有超出 ±2^53 的数）、绑定的授权服务器元数据以文本落盘，经 `core/content-blocks` 的 `writeJsonLossless`／`readJsonStrict`；不交给方言的 JSON 类型解析 | 副本是替换件同形的唯一依据（S-7 ⑤）；`data.content-blocks/v1#S-24`（M36：每一跳严格、数无损） | 存储协议只见文本列；无损由本节点在列的两端兑现 |

### 对凭据保管方的要求清单

保管方的窄口接口 2026-09-25 起**已定**：`capability.credential-custodian` v1（candidate；那份契约的[消费者核对](../../../../spec/capabilities/credential-custodian/v1/contract.md#十二消费者核对)已逐条对过下表）。真承接者 `infra/secrets` 那一程未到（那份契约 G-1；本契约 G-7，[D-040 S19-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的)），**最小提供者节点 [`credential-custodian-local`](../../infra/credential-custodian-local/design.md#对存储提供者的要求清单) 已立（candidate）**：C-1～C-3 与它的 K-3（引用约束）、K-4（锁定读）、K-5（一致快照读）逐条互指。**最小提供者的落处**（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤）：OAuth 条目以密文落在 `mcp_oauth_binding` 所在的同一存储，本机只放密钥——C-1～C-3 的共同对象由此成立。

| # | 要求 | 为什么 | 接口契约兑现条款 |
|---|---|---|---|
| C-1 | 收下一份 OAuth 凭据时写一行「待生效」，以引用约束指着 `mcp_oauth_binding.binding_id`，交回一个新的 `CredentialRef`；与绑定表同一存储（R-B5） | [关键选择三](#关键选择)的共同对象 | [S-16](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-16-depositoauth) ④⑤⑦（不看绑定状态、不幂等，多出的由清扫丢）；[S-19](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行；最小提供者：K-3 |
| C-2 | 解引用 OAuth 取得的引用时，在同一个读事务里读绑定行：`state = granted` 且 `credential_ref` 等于它才交出本体 | 可见效果只在绑定迁 `granted` 那一次提交里发生 | [S-17](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-17-resolve) ④⑥⑧（五种 `notResolvable` 不分；读不到是 `unavailable`）；最小提供者：K-5（条目行与绑定行同一快照，经 `readOAuthBinding`） |
| C-3 | **清扫只删三种「待生效」行**（[D-040 §八 M72](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：指着的绑定已 `revoked`；指着的绑定仍 `pending` 但已过 `oauthPendingTtl`（经 `isPendingExpired`，X-3）；指着的绑定已 `granted` 而记的引用不是它。**绑定仍 `pending` 且未过期的不删**——它正等着本插件迁 `granted`。判定在清扫自己的写事务里对绑定行做锁定读（与本插件完成时锁的是同一行，R-B4），过期按锁到之后取的 `clock.now()` 经同一个 `isPendingExpired` 判；不另立反向引用约束 | 崩溃与交错留下的孤儿；与完成交错时不留下「`granted` 却解引用不出」（[跨 owner 一节](#跨-owner-的同一提交oauth-绑定行与保管方的凭据行)第三条反证） | [S-18](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-18-清扫) 第 1～3 条；`oauthPendingTtl` 取本插件的同一个值（保管方 G-8）；最小提供者：K-4（清扫的写事务里经 `lockOAuthBinding` 锁同一行） |
| C-4 | 按持有解引用静态凭据：引用只在它被配上去的那份持有上有效（`data.asset-model/v1#S-23`）；「不在那份持有上／已作废」与「此刻够不着」两种答复分得开 | S-9 第 2 条 | **本版不收**（保管方 [G-2](../../../../spec/capabilities/credential-custodian/v1/contract.md#十一已知缺口)）：交出的条件与失败值已有（S-17 的持有相等、`notResolvable`／`unavailable`），**条目没有**——静态凭据的引用一律 `notResolvable`，要静态凭据的接入点本版连不上 |
| C-5 | 续期写回：同一个引用、本体换新；给出到期时刻供调度器用 | S-24 ①、[关键选择四](#关键选择) | **本版不收**（保管方 [G-4](../../../../spec/capabilities/credential-custodian/v1/contract.md#十一已知缺口)）：令牌到期即 `credentialUnavailable`，人要重取 |
| C-6 | 静态凭据本体里带出示的名字（哪个环境变量、哪个请求头） | S-9 第 4 条（契约 G-7 仍缺的形状） | **本版不收**（保管方 [G-3](../../../../spec/capabilities/credential-custodian/v1/contract.md#十一已知缺口)，形状归本契约 G-7） |

**取值问法只许本插件够得着**（保管方 [S-19](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 3 行）：`depositOAuth` 与 `resolve` 只许桥本体解析，执行者贡献插件与别的插件都不许——由结构检查守（verification N-14，与模型档案目录节点 MPD-N4 同一类）。

## 状态、并发与失败映射

**写权**：副本、绑定、进程登记只由桥本体写。**连接表**只在宿主 effect 里；它不是任何事实的权威——重启之后它是空的，本来就该是空的（S-28）。**并发**：同一连接上的多个 `invoke` 由 SDK 的请求号区分；同键建立共用一次；副本与绑定的并发写由 R-B1、R-B3、R-B4 定序。**桥的服务状态**：`serving` → `withdrawn`（撤除开始，单调）。

**失败映射**（没有 catch-all）：

| 情形 | 映射 |
|---|---|
| 表示层不合、`action` 与接入点对不上、`arguments` 不是对象 | `invalidInput`（未发出） |
| 拉不起、网络不通、`connectTimeout` 内没建成、调用途中断线 | `endpointUnreachable`（带是否已发出） |
| 保管方答 `notResolvable`（不在那份持有上、已作废、绑定不是 `granted`、记下的不是它、本版的静态引用）；来处规则不过；对端拒绝了出示的凭据（含 OAuth 令牌到期，本版不续期） | `credentialUnavailable` |
| 没出示凭据、对端要 OAuth | `oauthRequired` |
| 对端说没有这个动作 | `actionUnknown`（已发出） |
| 对端违例或回协议错误；页数超 `maxListPages`、列举项不合形状、对端名重复 | `protocolError{raw}`（遮掉之后） |
| `callTimeout` 到点 | `callTimedOut`（已发出），先发取消通知 |
| 存储读写失败、保管方缺席或答 `unavailable`／`custodianWithdrawn`、`clock` 答 `'unavailable'` | `dependencyUnavailable`（带是否已发出）；`completeOAuth` 里 `depositOAuth` 答 `custodianWithdrawn` 时那一条是否已收下不确知——绑定留 `pending`，多出的条目由保管方清扫（它的 S-20） |
| 撤除开始之后到达、或撤除时仍在途 | `bridgeWithdrawn`（带是否已发出） |
| `StorageDefect`、条件唯一「至多一个 `pending`」被撞；保管方答 `bindingUnknown` 或 `invalidInput`（本插件交来的绑定号与持有不该错） | 缺陷：原样上抛、error 日志；**不折成 `dependencyUnavailable`** |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验 | `definePlugin` 的 `Config`，插件体之前 | 不过 ⇒ `FAILED`，启动失败 | —— |
| `ctx.provide('mcpBridge')` | 桥本体 fiber；插件体运行即可解析 | 随 fiber 撤（`provide` 由 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**） | 服务消失；已拿到引用的调用方此后得 `bridgeWithdrawn` |
| 宿主 effect：连接表、在途登记、续期调度器、孤儿回收 | 桥本体 fiber；登记即开始后台回收 | 回收失败只记日志，不挡服务 | **撤除序列**（下文），全在这一个 effect 的 disposer 里，内部捕获一切错误记日志（basis `effect-disposal-concurrent-not-ordered`）。**保留**：副本、绑定、保管方的凭据、未回收的进程登记行——接替者照旧读到（S-27 ①） |
| 每条连接：SDK 客户端、传输、stdio 子进程、stderr 读取、进程登记行 | 连接表；第一份清单拿齐、登记行写下之后可用 | 建立失败 ⇒ 按失败映射；已拉起的进程按 S-26 关、删行 | 关闭例程：关传输 → 终止进程组（宽限后强制）→ 排空 stderr → 删登记行。外部效果不回滚 |
| 执行者登记 | `mcp-bridge-executor` 的 fiber；登记在它自己的 effect 里；执行运行时还在 `recovering` 时照样收下（执行运行时 S-37 行，M71），**不需要重试** | 登记抛出（执行运行时说那一格已有人）⇒ 贡献插件 `FAILED`，看得见；这是唯一的抛出 | 注销；本插件与执行运行时都在时重跑即重新登记。**在途执行不随本插件撤除**：交出去的包装只持桥本体引用与交回原语（M73），本插件先于桥的撤除序列卸载也不丢结局 |
| 迁移片段 | 装配合成、存储提供者在 `provide('storage')` 之前跑 | 迁移失败 ⇒ 存储提供者启动失败，桥 `PENDING` | 不随本插件撤除 |

**撤除序列**（契约 [S-27](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-27-桥被替换或卸载)；一个 effect 内按次序 `await`）：

1. **置 `withdrawn`**：此后到达的调用一律 `bridgeWithdrawn`；续期调度器不再起新的续期。
2. **等提交段**：正停在写事务里的 `refreshActions`、`beginOAuth`、`completeOAuth` 等它们的事务结束——提交了的按各自结果返回（它们在撤下之前已完成）；**还没进入提交的**，此后不再进入（进入提交前核对 `withdrawn`）。
3. **交出结局**：其余在途操作各自以 `bridgeWithdrawn` 结算（带是否已发出）；在途 `invoke` 此后到达的应答丢弃。**到这一步为止，不留一次既没有结局、也不会再有结局的调用。**
4. **等在途续期**：已发出的续期请求等它回来或到 `renewalRetryInterval`；回来的续期结果照常写回（它属于那份持有，不属于这一份桥）。
5. **逐条关连接**：各连接的关闭例程并发跑（每条内部按 S-26 的次序），全部结束或各自的宽限加强制到了才返回。

**提供者换代时收掉什么**（F 第二问，对齐契约 S-27）：存储或时钟换代 ⇒ 上面的序列跑完、桥本体重跑、新任从零建连；**全部在途调用落 `bridgeWithdrawn` ⇒ 执行运行时收成 `failed{abnormal_interruption}`**；持久的副本与绑定原样留给新任。**假设 A-1**（与执行运行时节点同一条，待补 probe）：内核等旧实例的 async disposer 结算完才跑新插件体；不成立时，新任可能在旧任第 5 步之前起一条同键连接（多一个进程，互不串号）、并与旧任的续期重叠（[关键选择四](#关键选择)）。

## 装配给与协议给：本节点单机怎样兑现左列

照契约 [S-30](../../../../spec/capabilities/mcp-bridge/v1/contract.md#s-30-装配给与协议给) 逐行；右列本节点一条都不兑现。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 连接不跨租户、按五元组区分 | 连接表的键 | 本节点 ＋ **装配**：一个进程只装一份桥 |
| 副本单调整份替换 | R-B1 | 本节点 ＋ 存储提供者 |
| 凭据引用按持有解引用 | 就地现取保管方 `resolve`（[S-17](../../../../spec/capabilities/credential-custodian/v1/contract.md#s-17-resolve)）；本版只有 OAuth 条目，静态引用 `notResolvable`（C-4 本版不收） | **保管方**（接口已定；最小提供者节点 `credential-custodian-local` 已立） |
| OAuth 绑定与令牌在据点一侧、绑定与保管方记录同一提交 | 绑定行状态列 ＋ 引用约束（[跨 owner 一节](#跨-owner-的同一提交oauth-绑定行与保管方的凭据行)） | 本节点 ＋ 保管方 ＋ **装配**：两张表同一存储（最小提供者按 N-37 ⑤ 落在绑定所在的存储） |
| 已发出不重放 | 在途登记里「已发出」一位；断线不重发 | 本节点 |
| 桥换代时在途调用落异常中断 | 撤除序列第 3 步 | 本节点 ＋ **装配**：何时换代（本版不在运行期换） |
| 中断送得到对端 | 执行者贡献把停止转成取消通知 | 本节点 ＋ 执行运行时 |
| stdio 服务端在据点机上 | 桥在据点进程里拉起 | **装配**（`apps/cli` 装本插件） |

**归装配的事项**（点名给 `apps/cli`）：装一份桥、一份执行者贡献；config 八项的值；存储属主排他；运行期不换存储与时钟；撤除次序——装配须**显式**先撤执行运行时与桥，再撤存储与时钟；依赖驱动的卸载不满足此次序（桥的撤除序列与存储自己的关闭并发，第 2 步等提交段会落空）；`apps/cli` 已按 [D-040 §八 M48](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) A-1 承接（M71）；保管方的最小提供者（`capability.credential-custodian` v1，服务键 `credentialCustodian`；OAuth 条目以密文落在与 `mcp_oauth_binding` 同一存储、本机只放密钥，[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤；它的 `oauthPendingTtl` 与本插件同一个值、从同一配置源交给两边，保管方 G-8、它的 CCL-3——**已裁**：维持双持，由 cli 同源配置加 A-30 相等装配测试守，不改本节点的表（[D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ③ D-1）；它的迁移片段排在本插件的片段之后、**没装本插件的装配也要合成本插件的片段**，它的 CCL-2）；配值副本读面（不存在，B-3）；OAuth 的交互面（交付面，PF-016）。

## 实施缺口与消费者影响

契约第十节的缺口不重抄；下表是**本节点自己的**缺口，编号 B-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| **B-1** | **SDK 能力待取证**（契约 G-6 在本节点上的展开）：精确钉版；stdio 子进程标识、独立进程组、环境是否另并默认变量、stderr 接管；按请求取消与进度回调；OAuth 钩子（令牌读写、PKCE、401 续期）；分页游标；`execution.taskSupport` 是否保留；**线上 JSON 的读写能否换成严格无损的那一对**（M36：参数里的大数不被舍入、对端应答的重复键被拒）。**任一项不成立，那一格改为自写**（如自己拉起进程、只借 SDK 的消息分帧，或自写传输层的编解码），不改契约 | S-6、S-17、S-19、S-20、S-22～S-26、S-28 | 实现者（按来源核对取证，结果进 basis 或登待核对主张）；钉版归主线 | 每项一条 probe；**精确钉版在实施开工前出一份决定**（D-037 保留前提；[D-040 §八 M73](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 的 MB-4），不用 `^` 宽范围 |
| **B-2** | **凭据保管方：接口已定、真承接者未到，最小提供者节点 `credential-custodian-local` 已立（candidate）**。C-1～C-3 由 `capability.credential-custodian` v1 S-16～S-18 接住、由那个节点的 K-3～K-5 兑现（经本包 `./tx-reads` 读与锁绑定行）；它本版只进验收装配；**C-4～C-6 本版不收**（保管方 G-2、G-4、G-3） | 产品装配里：一切带凭据引用的接入点（`dependencyUnavailable`）、OAuth 全路；装上之后（验收装配）仍受阻：要静态凭据的接入点（`credentialUnavailable`）、续期（令牌到期人要重取）、出示名 | `infra/secrets` 那一程（真承接者；C-4～C-6，M43 C-5：下一程） | 真承接者收下或取代保管方 v1；C-4～C-6 随保管方契约新版本 |
| **B-3** | **据点上的配值副本读面没有节点**：「引用还配没配着」「持有是否已移除」 | S-8 两条迁移、S-24 ③④、S-37 场景；副本整理 | 主线（[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) C-3：随入口组合 v2，下一程）＋ `apps/cli`（与注册表节点缺口 A-2 同一个读面） | 读面落定 |
| B-4 | 续期者唯一依赖 A-1（[关键选择四](#关键选择)）；独立评审 MB-3 同意这一选择、条件是 A-1 成立。**A-1 与 `provide-is-effect-managed` 的升格一起列 kernel-basis 待补 probe**（M73） | S-24、S-30 第 4 行；撤桥时贡献插件先回 `PENDING`（`provide-is-effect-managed`） | `core/kernel-basis` | probe 成立并升格 basis 条目，或改用存储认领 |
| B-5 | 执行者接口的形状由执行运行时节点定候选（它的 T-14）；本节点依赖其中「停止请求」「发帧原语」「交回失败带是否已发出」「交回异常中断」四样 | S-19、S-21 | 执行运行时节点 | 形状进执行运行时包的公开入口 |
| B-6 | **已闭合（修复波 3，M33）**：执行运行时的 `submit` 带这一次尝试的报告，MCP 动作的接入点持有取自它、原样记进执行记录，再交给本节点的 `invoke` | —— | —— | —— |
| B-7 | 拉起到写下进程登记行之间的窗口（同执行运行时的 X-5） | S-28 孤儿回收 | 实现者 | 实验定下窗口大小；必要时改为先写意图行 |
| B-8 | 闲置关闭 `idleConnectionTimeout` 是本节点加的一项 config，契约 G-12 没列 | S-6 ⑤ | 主线（给值） | 装配给值 |
| B-9 | **已闭合**（2026-09-25 修订波第二轮）：`stdioEnvAllowlist` 是一份 [`EnvAllowlist`](../../../../spec/capabilities/execution-environments/v1/contract.md#s-13-startprocess)——形状与取法定在 execution-environments S-13 表下一条（有限的变量名集合，可空、每个名非空；只取名字在集合里且据点进程环境此刻有的，原名原值，不补空值），与 hooks-import 的 `hookEnvAllowlist` 同一形状、各自配值；本插件的 `Config` 校验与取法改指那一条 | — | — | — |
| B-10 | **`./tx-reads` 的导入限定没有规则**：须一条 `tools/ts-checks` 规则只许 `packages/infra/credential-custodian-local`（与本包自己的测试）import `./tx-reads`，带「故意违反即失败」的自测（同 OG 的 V2-4） | 未写之前，任何包都能绕过桥的服务面读或锁绑定行 | 本节点 ＋ `tools/ts-checks` owner | 规则写成、在 CI 里跑 |

**报给主线**（不在本节点改）：B-2（最小提供者节点已立、本版只进验收装配；C-4～C-6 本版不收，要静态凭据的 MCP 接入点本版连不上——这是否可接受归产品负责人看验收场景）、B-3（缺节点，M43 下一程）；关键选择四（续期者唯一只到 A-1 为止）；M36 在桥上多出两跳（参数送出、应答读入），SDK 能否换编解码待取证（B-1）。关键选择一（连接表不用子 fiber）与三（OAuth 的「同一提交」读作两次提交一个可见提交点）已由 [D-040 §八 M44](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 接受为推导；B-6 已随 M33 闭合；M37 的替换件口子已进 S-17 行。独立评审 N3 之后：保管方清扫条件（M72，C-3）、执行者包装不依赖贡献者存活（M73）、保管方服务键 `credentialCustodian`（M69）已落字；SDK 钉版的决定排在实施开工前（B-1）。
