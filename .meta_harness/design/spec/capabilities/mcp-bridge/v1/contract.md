# capability.mcp-bridge v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.mcp-bridge, 1)`——
  `family = capabilities`、`topic = mcp-bridge`、规范路径 `spec/capabilities/mcp-bridge/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 整批对齐，同日按第一轮独立评审修订——处置表在[验证入口](../verification.md#独立评审)；2026-09-25 修复波 1b 闭合 G-14，同日修复波 2 按第二轮独立复评改 S-5、S-12、CS-4；同日修复波 3 跨批对齐按 M37 改 S-17，处置见[验证入口](../verification.md#实现映射反推2026-09-25)；同日「公开面」修订波把凭据保管方改指 `capability.credential-custodian` v1、写明本版不收的三项，见[验证入口](../verification.md#修订波2026-09-25-公开面)）——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**（PF-002 rev 20、PF-006 rev 19 为主责；PF-012 rev 14、PF-016 rev 6、PF-005 rev 5、PF-001 rev 17、PF-008 rev 7 只引；2026-09-24 逐版复核到当前 rev，变化与落点记在[验证入口](../verification.md#变化的影响)）：
  [PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)、
  [§4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)、
  [§5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)、
  [acceptance §一](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)；
  [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)（两小节）、
  [§5.3 可自带实现](../../../../product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)（经 [PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)「它可以自带实现」）、
  [§5.3 工具说明与每个参数的说明必填](../../../../product/PF-006-tools-and-skills/design.md#工具说明与每个参数的说明必填)（rev 19）、
  [§5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)、
  [§6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)、
  [§6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)；
  [PF-012 §5.7 每一次尝试开始都要做四件事](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)；
  [PF-016 §5.6](../../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)、[§6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)（据点一侧、秘密不呈现，只引）；
  [PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许)（只引）；
  [D-037](../../../../record/decisions/mcp-client-adoption/decision.md)（官方 SDK 上自写薄桥、本版桥接范围的复选卡片、stdio 一律在据点机拉起）
- **产品正文已写的**：动作集在每一次执行尝试开始前重算、一次尝试之内不变（[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)，rev 17 起；PF-006 §6.13 rev 18）
- **主线裁定**（长期落点 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)，产品负责人尚未逐条追认）：桥被替换或卸载时经它在途的调用各自落「失败 · 异常中断」、不迁移不重发，桥的换代时机由装配给——[D-040 §块 B](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-b-拆分提案报回的推荐-c按拥有者分领域) PB-4；以及下一行的 S19-a～g——[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的)；
  `fetchedAt` 取列举开始时刻（K34）、逐动作执行权限与执行时的接入点持有取自会话资产注册表钉住的报告（K30）——[D-040 §五](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)
- **主线裁定**（见 [D-040 §六 N-10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)，原 G-14 闭合）：`ConnectionHandle` 不上签名、`invoke` 按持有寻址、连接的收口次序是义务；OAuth 流程本版落在据点一侧、只写义务与状态、交互归 PF-016；由桥做最小规范化（下文）。机制读数的连接归属（桥下每条连接各自收口）作「装配给」一列的输入
- **S19-a～g**：副本、OAuth 绑定、凭据都按持有存放（S19-a，原 G-1 闭合）；四个新失败值与 `oauthDenied` 四来由合一采纳（S19-b）；工作区提供的 stdio 接入点默认禁用、租户层显式启用（S19-c，原 G-2 闭合）；桥换代时在途调用落 `failed{abnormal_interruption}`（S19-d，原 G-16 闭合）；两端模态由桥投影、投不出即「任意」（S19-e，原 G-3 闭合）；凭据保管方作装配给、求值交出 `provenance`（S19-f，原 G-9 闭合、G-7 收窄）；多据点下 OAuth 凭据跟机器（S19-g，原 G-8 闭合，后果见 G-17）
- **主线裁定（修复波 2）**——[D-040 §七 M8、M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)：报告里逐动作执行权限以动作条目的模型面名字为键；报告里查不到条目的调用（含失去生效持有的接入点的动作）不进放行判断、由执行运行时收场 `unavailable{no_such_entry}`，`not_in_composition` 不适用于 MCP 动作（[CS-4](#cs-4-放行判断需要知道本契约做什么)）
- **主线裁定（修复波 3）**——[D-040 §八 M37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：参数 schema 过了 `data.tool-definition` 表示层前十二行、只是这个实现编不出（或 `pattern` 超出实现上限）的动作，**不排除**，标「只能以替换件出现」、原因 `schema_unsupported`（[S-17](#s-17-projectactions)）
- **主线裁定 2026-09-24**（原 [G-18](#十已知缺口) 关闭；见 [D-040 §六 N-10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）：**由桥做最小规范化**——缺说明的动作与参数补占位说明「对端未提供说明」、在动作条目上标 `normalized: true`；剥掉 `$schema`／`title`；`{"type": "object"}` 视为无参数；规范化之后仍不合的才排除（[S-17](#s-17-projectactions)）。
  缘起是 [PF-006 decisions §四](../../../../product/PF-006-tools-and-skills/decisions.md#四已知的来源问题)「MCP 对端给的动作若不带说明……正文未述它算什么」——那一行记为交产品负责人、规格侧留缺口；**主线自定：不当它不可用**
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)）：
  - `omne-harness-lite-design-2026-09-15 · data.mcp-endpoint · v1`（**candidate**）
  - `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1`（**candidate**）
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1`（**candidate**）
  - `omne-harness-lite-design-2026-09-15 · data.asset-model · v1`（**candidate**）
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`
  - `omne-harness-lite-design-2026-09-15 · capability.asset-evaluation · v1`（**candidate**；只取落点设置的来处与工作区 stdio 默认禁用两条，2026-09-24 整批对齐登记）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `capability.mcp-bridge/v1#S-19`。
  缺口 `G-n`、性质 `P-n`、消费者核对场景 `CS-n` 同此范围。**本文引另一份契约的条款一律带坐标，裸号只指本契约**

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**本系统与外部 MCP 对端之间的那座桥**——据点一侧的一项能力：

1. **连接**：按一份接入点持有求值出的连接目标与凭据，建立、复用、关闭到对端的连接（含在据点机上拉起 stdio 服务端）；
2. **列举与副本**：完整拿到对端的动作清单，写成这份持有的**动作清单副本**（`data.mcp-endpoint/v1` 的 [`ActionSnapshot`](../../../data/mcp-endpoint/v1/contract.md#s-9-动作清单副本)）；
3. **投影**：把一份副本算成一组[工具定义](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-definition--工具定义--tool-definition)，交给会话资产注册表——**对端动作 → `ToolDefinition` 的投影规则归本契约**，它回答 `data.tool-definition/v1` 的 [G-8](../../../data/tool-definition/v1/contract.md#十已知缺口)；
4. **调用**：作为这些工具定义的**自带实现**被[工具执行](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)运行时调用，把一次调用送到对端、把应答带回来；
5. **可用性**：此刻连不连得上——**对端的可用性不由本系统掌握，连不上是「不可用」，不是故障**（[S-10](#s-10-对端可用性不由本系统掌握)）；
6. **OAuth 那一路的落点**：发起与完成一次经 OAuth 取得 [MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)的流程，保管它的状态，并在无人参与的情况下续期（[S-8](#s-8-oauth-绑定状态与迁移)、[S-24](#s-24-续期清值与作废)）。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 接入点正文、副本、条目名、OAuth 绑定、凭据取值域的**形状** | `data.mcp-endpoint` v1 |
| **放行判断**：这一次调用许不许执行、要不要问人 | 放行判断（`capability.tool-admission` v1）。**动作随接入点持有与授权**；本契约不做放行（[S-14](#s-14-桥不做放行判断)） |
| **属性求值**：连接目标、凭据、两项超时、能不能用、逐动作执行权限各格怎样合成 | `capability.asset-evaluation` v1；本契约拿它的结果（[S-5](#s-5-接入点持有的寻址)） |
| **一次尝试里 agent 面前有哪些条目、按尝试钉住、装替换件；这一次尝试用哪份接入点持有、逐动作执行权限是什么** | [会话资产注册表](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-session-asset-registry--会话资产注册表--session-asset-registry)（`capability.asset-registry` v1，[S-12](../../asset-registry/v1/contract.md#s-12-mcp-动作条目在一次尝试内钉住)） |
| **工具执行**的派发、收场判定、前后台、账、送达 | 工具执行运行时（`capability.tool-execution-runtime` v1）。本契约只是它的一个自带实现（[S-19](#s-19-invoke)） |
| **凭据配值的写入**（含 OAuth 取得之后把引用配上去） | 资产治理的写面（`capability.asset-governance` v1 的 `assign`／`clearAssignment`）——**取值就是配值**，那一次写由有配值资格的人在配值处经它完成（[S-23](#s-23-completeoauth)） |
| **凭据本体的存储、加密与解引用** | 凭据保管方（`data.asset-model/v1#S-23` 第 7 条）——**装配给**（[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-f）。**据点上那一份的面**：窄口接口契约 `capability.credential-custodian` v1（收下 OAuth 凭据 S-16、按持有交出 S-17、清扫 S-18；2026-09-25 修订波）——那份契约以坐标依赖本契约，本契约作定义引用、**不反向登记**；本契约只写对它的要求（[S-9](#s-9-凭据的出示与取用)、[S-30](#s-30-装配给与协议给)、[G-7](#十已知缺口)） |
| **OAuth 的人机交互**（在哪里给人看同意地址、怎样接住回来的应答） | 交付面（PF-016） |
| **MCP 协议本身**（握手、JSON-RPC、分页、通知的线上形状） | 官方 SDK（D-037）；本契约不复述协议，只在需要时引协议版本（[G-6](#十已知缺口)） |
| **本操作面在进程之间的线上形状** | 把它送过进程边界的那份组合契约（本版无：桥与它的调用方都在据点进程里） |

### S-3 本契约明确不承诺什么

- **不承诺对端可用、对端的动作集与版本不变、对端的应答真实**——那不由本系统掌握（[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)）。
- **不承诺外部效果可逆**：发出的调用、拉起的进程、在授权服务器上用掉的授权码都已经发生；本契约只承诺**不重放**（[S-19](#s-19-invoke)）与按次序收口（[S-26](#s-26-连接的收口次序)）。
- **不承诺替换件**：条目不可用时装什么，是会话资产注册表与工具执行运行时的事；本契约给它们装替换件所需的那份副本（[S-16](#s-16-refreshactions)）。
- **不承诺桥接 D-037 未勾选的能力**：resources 作为条目、prompts、sampling、roots、任务式执行的动作、旧式 SSE；**elicitation 本版不向对端声明**（[S-25](#s-25-对端来的通知与请求)）。
- **不承诺在任何呈现里给出凭据**（[S-13](#s-13-凭据与引用不进任何呈现)）。

### S-4 依赖方向与被消费的面

**依赖方向单向：桥 → 下列契约。**能力契约里本契约**只依赖求值与执行环境**：求值取它交来的两条（落点设置的来处、工作区 stdio 默认禁用）；执行环境只取 `EnvAllowlist` 的形状与取法（2026-09-25 修订波，主线裁定）；放行、会话资产注册表、工具执行运行时、资产治理都是它的调用方或它结果的接收方，
它们与本契约之间的操作面由它们各自的契约引用本契约——本契约提到它们只为指路，**不登依赖**。

| 坐标 | 消费的条款 | 取它的什么 |
|---|---|---|
| `data.mcp-endpoint · v1` | [S-1](../../../data/mcp-endpoint/v1/contract.md#s-1-接入点正文)、[S-3](../../../data/mcp-endpoint/v1/contract.md#s-3-连接目标两种闭合)～[S-14](../../../data/mcp-endpoint/v1/contract.md#s-14-推出规则五类项)、[S-17](../../../data/mcp-endpoint/v1/contract.md#s-17-工作区格上的这些项)、[S-20](../../../data/mcp-endpoint/v1/contract.md#s-20-表示层拒绝值与判定次序)、[S-21](../../../data/mcp-endpoint/v1/contract.md#s-21-表示层拒绝不是判定也不修补)、[S-26](../../../data/mcp-endpoint/v1/contract.md#s-26-接入点-name-登记时收窄) | 全部形状；凭据不在正文、「还没取」即缺席；逐动作执行权限的默认；推出规则（投影出的执行权限默认与它一致）；工作区格上凭据恒缺席、工作区提供的 stdio 接入点默认禁用；表示层拒绝值与不修补；**登得上的接入点 name 都拼得出条目名的前缀**（拼不出只可能因为对端动作名） |
| `data.tool-definition · v1` | [S-2](../../../data/tool-definition/v1/contract.md#s-2-身份是-name)、[S-4](../../../data/tool-definition/v1/contract.md#s-4-单函数工具)、[S-5](../../../data/tool-definition/v1/contract.md#s-5-多命令工具)（末条：判参数时未知键的读法）、[S-6](../../../data/tool-definition/v1/contract.md#s-6-模型面只有一个条目)、[S-8](../../../data/tool-definition/v1/contract.md#s-8-说明与用法)、[S-12](../../../data/tool-definition/v1/contract.md#s-12-后台许可与转后台阈值)、[S-15](../../../data/tool-definition/v1/contract.md#s-15-执行权限)～[S-17](../../../data/tool-definition/v1/contract.md#s-17-来源)、[S-18](../../../data/tool-definition/v1/contract.md#s-18-名字的表示与相等)、[S-20](../../../data/tool-definition/v1/contract.md#s-20-两种写法与等价规则)、[S-21](../../../data/tool-definition/v1/contract.md#s-21-toolresult-的三样)、[S-23](../../../data/tool-definition/v1/contract.md#s-23-卸载)、[S-24](../../../data/tool-definition/v1/contract.md#s-24-结果与声明对得上)、[S-26](../../../data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序)、[S-27](../../../data/tool-definition/v1/contract.md#s-27-表示层拒绝不是判定)（末段） | 投影的目标形状（单函数、说明非空、来源 `mcp`、不组合、不声明后台）；执行权限三档；名字的字符集、保留序列与长度（条目名拼不拼得出）；返回值的形状与两个标注；卸载的第二条来路；MCP 条目的两端模态按本契约的投影判（S-24 第 3 条）；表示层拒绝值（`excluded` 的原因带它）；**只在第 13 行被拒的 `schema_unsupported` 不排除、只能以替换件出现**（S-27 末段给 MCP 来源开的口子，M37） |
| `data.content-blocks · v1` | [S-7](../../../data/content-blocks/v1/contract.md#s-7-媒体类型的规范形式)、[S-8](../../../data/content-blocks/v1/contract.md#s-8-文本块与来路标记)、[S-10](../../../data/content-blocks/v1/contract.md#s-10-语音块与图块)、[S-17](../../../data/content-blocks/v1/contract.md#s-17-六种收场)、[S-18](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格) | 对端结果映射成的三类块与媒体类型的规范写法；失败值对到的收场；`failed` 只在异常中断时带原因码，桥换代是异常中断的一条来路 |
| `data.asset-model · v1` | [S-16](../../../data/asset-model/v1/contract.md#s-16-持有范围)、[S-18](../../../data/asset-model/v1/contract.md#s-18-资产持有)、[S-23](../../../data/asset-model/v1/contract.md#s-23-凭据引用) | 持有的格与键；凭据引用只在它被配上去的那份持有上有效、续期不算换值 |
| `capability.execution-environments · v1`（窄口接口契约） | [S-13](../../execution-environments/v1/contract.md#s-13-startprocess) 表下 `EnvAllowlist` 一条 | `stdioEnvAllowlist` 的形状与取法：从据点进程环境里只取名字在集合里、且此刻有的那几个（[S-6](#s-6-连接归桥不上签名不跨租户) 第 3 条）。**本契约不经它起进程**：stdio 服务端仍由据点进程拉起 |
| `capability.asset-evaluation · v1` | [S-5](../../asset-evaluation/v1/contract.md#s-5-层与三条层序)、[S-17](../../asset-evaluation/v1/contract.md#s-17-第一步之一先按禁用滤)、[S-40](../../asset-evaluation/v1/contract.md#s-40-落点与身份类设置的来处) | `provenance` 的取值（`Layer`）与设置层序；工作区提供的 stdio 接入点在第一步被禁用、不会交到本契约；落点设置各出自哪一格 |
| `data.identity-values · v1` | [S-5](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)、[S-17](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[S-30](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)、[S-31](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[S-33](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | 租户身份；身份参数没有默认值；跨边界重验；空白码点（条目名拼不出）；表示层校验与判定分开 |

**本契约不依赖 `data.offer-expiry`**：时刻值都经 `data.mcp-endpoint` 的形状取得，本契约自己不写出时刻的表示。

---

## 二、概念、身份与必要状态

**本契约用到的名字**（标「无词条」的是规格层的名字，已报主线并接受（D-040 §七 N-18）；本契约不给它们下词条式定义）：

| 名字 | 指什么 | 词条 |
|---|---|---|
| 桥 | 本契约这项能力的一份在运行的兑现（D-037 的「薄桥」） | **无词条** |
| 据点、据点机、据点进程 | [会话据点](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)所在的那台机器与那个进程；那台机器是[宿主机](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-host-machine--宿主机--host-machine) | 「据点」是会话据点的简称；机器与进程**无词条** |
| 接入点持有（`endpointHolding`） | 一份 [MCP](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 的[资产持有](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)，连同求值交来的[属性配值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment)结果（[S-5](#s-5-接入点持有的寻址)） | 寻址值本身**无词条** |
| 连接目标、动作清单副本、对端动作、动作条目名、OAuth 绑定 | 同 `data.mcp-endpoint` v1 的同名形状 | **无词条**（那边已登） |
| 凭据保管方 | `data.asset-model/v1#S-23` 第 7 条的保管方 | **无词条** |

### S-5 接入点持有的寻址

**本契约的操作按「接入点持有」寻址，不按任何活的对象寻址。**一个 `endpointHolding` 是下面这组值，**由求值的一方交来**：会话资产注册表在执行尝试开始时求值（配方同装配、持有与配值取此刻）得出、钉进那一次报告的那一份（[`capability.asset-registry/v1#S-11`](../../asset-registry/v1/contract.md#s-11-一次执行尝试的可用性报告) 的 `endpointHoldings`；求值本身归 `capability.asset-evaluation`；读法见 [D-040 §六 L8、N-10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）——**不是装配那一次的结果**：

| 成员 | 含义 | 是不是身份参数 |
|---|---|---|
| `tenant` | 用它的那个租户身份（`TenantId`） | **是** |
| `endpoint` | 接入点的能力标识，类别必须是 `mcp` | **是** |
| `scope` | 这个租户此刻生效的那份持有所在的格（`data.asset-model/v1` 的 `HoldingScope`）——哪一份实现在用，就是它 | **是** |
| `body` | 生效的那一版正文（`McpEndpoint`） | 否 |
| `settings` | 四项设置的求值结果：`connectionTarget`（`McpTransport`）、`credential`（`CredentialRef`；各格都没配时**缺席**——还没取，`data.mcp-endpoint/v1#S-13`）、`connectTimeout`、`callTimeout` | 否 |
| `provenance` | 两项落点与身份类设置的来处，恰是求值交出的那两个 `provenance`（[`capability.asset-evaluation/v1#S-40`](../../asset-evaluation/v1/contract.md#s-40-落点与身份类设置的来处)，`Layer` 值）：`connectionTarget` 必有；`credential` **恰在** `settings.credential` 在时出现 | 否 |

- **身份参数没有默认值**（`data.identity-values/v1#S-17`）：`tenant`、`endpoint`、`scope` 缺一即 `invalidInput`，**不从环境、进程上下文或「当前会话」补齐**。`provenance` 不合上表（缺 `connectionTarget`，或 `credential` 与 `settings.credential` 一在一缺）同样是 `invalidInput`——**不当它是「来处未知、照常出示」**。
- **本契约不求值**：它不读各格的配值、不判谁覆盖谁；拿到的 `settings` 就是它用的值。**求值错了是求值的错**，本契约照着用——但下面两条它自己守：
  凭据只出示给来处不更具体的连接目标（[S-9](#s-9-凭据的出示与取用) 第 3 条）；工作区格上凭据恒缺席（`data.mcp-endpoint/v1#S-17`）、组织格不持有凭据（`data.mcp-endpoint/v1#S-12`）——`scope` 是工作区格、或 `provenance.credential` 不是租户那一格，而交来了一个凭据引用，**不出示，`credentialUnavailable`**。
- **`provenance` 由求值交出**（`capability.asset-evaluation/v1#S-40`；[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-f；原 G-9 闭合）。`scope` 由求值结果里这份生效资产的 `from` 与 `tenant`（工作区格另加工作区键）得出。

### S-6 连接：归桥，不上签名，不跨租户

**连接是本契约自己的资源，不出现在任何操作的签名里。**调用方拿不到、也不需要一个「连接句柄」：每个操作按 `endpointHolding` 寻址，连接在桥内部被取用或建立。

1. **一条连接只为一组 (`tenant`, `endpoint`, `scope`, 连接目标的值, 凭据配值) 服务**——凭据配值指 `settings.credential` 那个 `CredentialRef` **引用本身**（或它的缺席），**不是**解引用出来的秘密：续期不换引用（[S-24](#s-24-续期清值与作废) 第 1 条），不因此换连接；换值、清值换了引用，旧连接不再用于新调用（同条第 3 条）。这五样里任何一样不同，**不复用**这条连接。**不跨租户身份共用连接**，也不跨持有共用（[PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)「不跨租户身份共用」）。
   同一个租户、同一份持有下的几个会话共用一条连接是允许的——**它们各自的动作集按尝试钉住**（[S-12](#s-12-每次执行尝试重新列举尝试内不变)），共用连接不破坏这一条。
2. **惰性建立**：某个操作需要、而对应的连接不在时才建；**建立到拿齐第一份清单为止以连接超时封顶**（`settings.connectTimeout`，[S-16](#s-16-refreshactions)）。
3. **stdio 连接目标**：由据点进程在据点机上拉起那个程序（[D-037](../../../../record/decisions/mcp-client-adoption/decision.md)；`data.mcp-endpoint/v1#S-4`）。
   据点机是宿主机，[PF-005 §6.2](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许) 要求它**必须被显式允许**；本契约把「这份持有被求值判为这个租户能用、且没有被禁用」读作那一次允许。**工作区提供的 stdio 接入点在求值第一步就被禁用**（`capability.asset-evaluation/v1#S-17` 第三条；`data.mcp-endpoint/v1#S-17`；[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-c：权力不从项目来），不会交到本契约——克隆一个仓库、开一次尝试，不会在宿主机上跑仓库写的命令；租户层怎样显式启用它，那份契约尚无表示（它的 G-19）。本契约不再判一次（[S-5](#s-5-接入点持有的寻址)：求值错了是求值的错）。它的完整环境**恰是**三部分的并：
   据点进程环境里**名字在白名单上**的那几个变量（具名参数 `stdioEnvAllowlist`，值未定，[G-12](#十已知缺口)；它是一份 `EnvAllowlist`，形状与取法定在 `capability.execution-environments/v1#S-13`，与兼容件的 `hookEnvAllowlist` 是两个策略点、同一个形状）；正文 `transport.env`；凭据作为环境变量出示的那一部分（[S-9](#s-9-凭据的出示与取用)）。
   **同名时后者压前者**。**据点进程环境里的其余变量一个也不传下去**——那里可能有别的租户、别的接入点的秘密。
   程序**不经 shell 启动、不做变量插值**（`data.mcp-endpoint/v1#S-4`）。
4. **streamable_http 连接目标**：连到那个地址；凭据作为请求头出示（[S-9](#s-9-凭据的出示与取用)）。
5. **何时关**（闲置、设置换值、对端断开、持有移除）归提供者设计；桥被替换或卸载时它名下的连接全部随它关（[S-27](#s-27-桥被替换或卸载)）。**关的时候怎样收口**是本契约的义务（[S-26](#s-26-连接的收口次序)）。

> 连接在运行时以什么形态存在（例如每条连接各自一段可独立收口的生命周期），归提供者设计；本条只定它对外的性质。

### S-7 动作清单持久副本

**每份接入点持有、每个租户各有一份动作清单副本，形状是 `data.mcp-endpoint/v1` 的 [`ActionSnapshot`](../../../data/mcp-endpoint/v1/contract.md#s-9-动作清单副本)。**

1. **键是 (`tenant`, `endpoint`, `scope`)**。不跨租户身份共用：同一个人的两个租户身份用两份凭据，对端给的清单不必相同（[PF-002 acceptance §一](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)）。
2. **初值是 `not_fetched`**：一个键上从没完整列举成功过，副本就是「还没取过」——**不是空清单**。
3. **只有本契约写它，只由 [S-16](#s-16-refreshactions) 的一次完整列举写它**：分页全部拿完、每一项都合 `McpToolDescriptor`、对端动作名不重复，才写；**拿到一半的、有一项不合的，一律不写**，原来那份原样留着。
4. **整份替换，单调**：新的一份整份换掉旧的；**`fetchedAt` 取这一次列举开始的那一刻**——发出第一页列举请求之前，从部署的同一时间源取（[D-040 §五](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) K34）。**一次写入若它的 `fetchedAt` 不晚于已存那份的，丢弃**——两次并发的刷新，先开始、后完成的那一次拿到的是更早那一刻起的清单，它的 `fetchedAt` 更早，**不会盖掉后开始那一次已写下的新清单**。
5. **持久**：据点重启之后它还在（[D-026](../../../../record/decisions/infrastructure-persistence-choices/README.md) 不设内存实现）；**它是替换件同形的唯一依据**（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)）。
6. **随持有生灭**：那份持有被移除之后，求值不再交出这个键，这份副本**不再被任何操作读到**；删掉它是整理，**不担正确性**。
7. **在据点一侧**：写它的桥在据点进程里；它不回写到治理中心（装配给，[S-30](#s-30-装配给与协议给)）。

**为什么副本在这里、不在正文里**：见 `data.mcp-endpoint/v1` 的 [S-9](../../../data/mcp-endpoint/v1/contract.md#s-9-动作清单副本) 末段——**[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-a 采纳**（A-M11「读正文里的动作快照」改判为「读持有上的副本」；原 G-1 闭合）。

### S-8 OAuth 绑定：状态与迁移

**一个 OAuth 绑定（`data.mcp-endpoint/v1` 的 [`OAuthBinding`](../../../data/mcp-endpoint/v1/contract.md#s-12-oauth-绑定)）属于恰一份被配值的持有：(`tenant`, `endpoint`, `scope`)。`scope` 与 [S-5](#s-5-接入点持有的寻址) 同义，而本操作面只为租户格上的持有发起（[S-22](#s-22-beginoauth) ①③），所以它恒是租户格——凭据要配上去的那一格。**

| 从 | 到 | 由什么 |
|---|---|---|
| （无） | `pending` | [S-22 beginOAuth](#s-22-beginoauth) |
| `pending` | `granted` | [S-23 completeOAuth](#s-23-completeoauth) 成功 |
| `pending` | `revoked` | 人拒绝了或授权服务器报错（S-23）；同一份持有上又发起了一次（S-22，旧的在同一提交内作废）；**过期**：`since` 起过了具名参数 `oauthPendingTtl` 还没完成（读时判定，不靠定时器） |
| `granted` | `revoked` | 续期被授权服务器明确拒绝（[S-24](#s-24-续期清值与作废)）；它取得的那个引用**不再被配在那份持有上**——被清掉、被换成别的值、持有被移除；取得之后过了具名参数 `unassignedCredentialRetention` 仍没被配上 |

- **`revoked` 是终态**；要再取，是一次新的发起、一个新的绑定号。
- **续期不迁移状态、不改 `since`**（`data.mcp-endpoint/v1#S-12`；PF-002「续期不算换值」）。
- **同一份持有上至多一个 `pending`**：新的一次发起作废旧的——回来的应答只认最新那一次流程。
- **绑定存在据点一侧**（主线裁定，见 [D-040 §六 N-10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)：OAuth 流程本版落在据点侧）。**OAuth 取得的凭据跟机器**（[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-g，同 [PF-016 §6.20](../../../../product/PF-016-cli-tui-delivery-surface/design.md#620-每台机器上只有自己那一把凭据) 的「每台机器只有自己那一把」；原 G-8 闭合）：一个租户换一台机器，那台机器上没有这个绑定，引用解引用不出（`credentialUnavailable`），要在那台机器上再取一次——**再取的那一次配上之后，原先那台机器上的绑定按上表作废**（[G-17](#十已知缺口)）。

### S-9 凭据的出示与取用

**连对端时出示的凭据，只来自 `endpointHolding.settings.credential`：**

1. **缺席**（还没取；`data.mcp-endpoint/v1#S-13`）：什么也不出示，照连。对端要鉴权，它会拒绝——那是 `oauthRequired` 或 `credentialUnavailable`（[S-16](#s-16-refreshactions)），不是桥替它补一个。
2. **一个 `CredentialRef`**：交给凭据保管方，**按租户格上这个租户自己的那份持有解引用**（`provenance.credential` 必须是 `tenant`；`data.asset-model/v1#S-23` 第 4 条：只在它被配上去的那一份持有上有效）。那一格不是租户格 ⇒ 不出示，`credentialUnavailable`——**组织格不持有 MCP 凭据**（[PF-002 rev 18 §4 MCP 凭据「归谁」](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)：组织接入的接入点由每个成员在自己的租户层取；原 G-13 闭合），工作区格与出厂格配不了凭据，会话格不持有资产、没有可解引用的持有。
   解引用得出凭据本体 ⇒ 出示；**保管方说这个引用不在那份持有上、已作废、续不上** ⇒ `credentialUnavailable`；**保管方此刻够不着** ⇒ `dependencyUnavailable`——两者不合并（[S-11](#s-11-缺席时的默认答案)）。
   本版据点上的保管方是 `capability.credential-custodian` v1：解引用即它的 `resolve`（S-17），`{ body }` 即得出、`notResolvable` 即上面的前一种、`unavailable` 与 `custodianWithdrawn` 即后一种。**本版只有 OAuth 取得的凭据交得出**：静态凭据的引用一律 `notResolvable`（那份契约 G-2）——**要静态凭据的接入点本版以 `credentialUnavailable` 连不上**（[G-7](#十已知缺口)）。
3. **来处规则：凭据只出示给来处不比它更具体的连接目标。**`provenance.connectionTarget` 那一格必须与 `provenance.credential` 那一格相同、或在设置层序上更靠外（`capability.asset-evaluation/v1#S-5`：`factory` < `organization` < `tenant` < `workspace` < `session`）；**否则不出示，以 `credentialUnavailable` 收场**。
   这一条是本契约的推导，挡的是一个具体的泄漏：租户在自己那一格给 `mcp:linear` 配了凭据；一个仓库经工作区提供一份**同名**的 `mcp:linear`，正文里的连接目标指向别处——
   按能力标识逐层覆盖，生效的连接目标来自工作区、凭据来自租户格，**不加这一条，租户的凭据就被出示给了仓库指定的地址**。
   依据是 [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)「落点与身份类不从工作区来、一个仓库不能给自己提权」与「凭据一份持有一份」的合取；**已报主线并接受（D-040 §七 N-18）**。
4. **怎样出示**：stdio 作为子进程的环境变量，streamable_http 作为请求头；OAuth 取得的作为 MCP 授权规范的持有者令牌请求头。
   **静态凭据本体里是哪几个名字（哪个环境变量、哪个请求头）**，是保管方交出的凭据本体的一部分，**不在接入点正文里**（`data.mcp-endpoint/v1#S-6`）；它的形状**本版不收**（保管方那一侧的 G-3，本契约 [G-7](#十已知缺口)）。
5. **出示之后本体只留在那条连接里**：不写日志、不进帧、不进结果、不进错误（[S-13](#s-13-凭据与引用不进任何呈现)）。

### S-10 对端可用性不由本系统掌握

**对端连不上、拒绝鉴权、协议出错，都不是本系统的故障，也不是一次执行的「失败」——在一次尝试开始时，它们让这个接入点带来的动作「不可用」。**（[PF-006 §6.13 连不上就是不可用](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)；[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)「这不是故障」。）

- 本契约**把这些情形如实报成具名的失败值**（[S-15](#s-15-这一节每个操作写全九件事) 的失败值表），**判不判「不可用」、装不装替换件归会话资产注册表**；
- 同一个情形出现在一次**已经在执行的调用**里（对端中途断开），它是那一次执行的「失败」（[S-21](#s-21-失败值与收场的对应)）——**不可用只出自尝试开始时的判定**（[PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)：替换件只有一种行为）。

---

## 三、贯穿全部操作的规矩

### S-11 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退。**三类分开：

| 情形 | 结果 | 为什么不能合并 |
|---|---|---|
| **判定得出一个结论**（连不上、凭据不可用、对端说要 OAuth、对端说没有这个动作……） | 那个具名的失败值 | 这是一次成立的判断 |
| **判不出来**（存储、凭据保管方、时间源此刻不可用） | **`dependencyUnavailable`** | 不是结论，是没有结论；按实际状态重试可能不同 |
| **输入不合形状**（身份参数缺席、正文或副本不合 `data.mcp-endpoint`、参数不是对象……） | **`invalidInput`**，带上 `data.mcp-endpoint/v1#S-20` 的那个具名拒绝值（若是它的形状） | 表示层校验，**不是一次判定结果**（`data.identity-values/v1#S-33`）；重试一万次也不会好 |

- **这一份桥在操作进行中被撤下**：`bridgeWithdrawn`（[S-27](#s-27-桥被替换或卸载)）——同属「没有结论」，与 `dependencyUnavailable` 分开，因为调用方的去处不同：换到接替的那一份桥上重来（`invoke` 除外），而不是等依赖恢复。
- **读不到副本，不当它是 `not_fetched`，更不当它是空清单**：那是 `dependencyUnavailable`。
- **刷新失败，不把旧副本当作这一次的成功结果交出去**：旧副本随失败值一起交出、标明它是旧的（[S-16](#s-16-refreshactions) ⑥）。
- **凭据解引用不到，不改成不带凭据去连**：那会让对端以匿名身份给出另一份清单。

### S-12 每次执行尝试重新列举，尝试内不变

**动作集在每一次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)开始前与可用性一起重算，一次尝试之内不变。**
（[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) rev 17 起；[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作) rev 18「每一次执行尝试开始前重取、一次尝试之内不变」，与 [PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)「每一次尝试也算作一次开始」一致。）

- **本契约的那一半**：会话资产注册表在尝试开始时调 [S-16](#s-16-refreshactions)，本契约交出**在这一次调用里完整拿到**的清单，或一个失败值连同那份旧副本。**唯一的例外**是 [S-16](#s-16-refreshactions) ⑤：同一份持有上一次并发、开始得更晚的列举已写下更新的副本，这一次的条件写因 `fetchedAt` 不更晚而被丢弃——那时交出的是**存储里那份更新的**，而不是这一次拿到的（两份都是完整拿到的，交更新的那份不让钉住的动作集倒退）。
- **会话资产注册表的那一半**：把交来的那份钉在这次尝试上，照它投影、照它装替换件；**钉住的那份此后不因副本被别的会话刷新而变**。它调 [S-16](#s-16-refreshactions) 用的 `endpointHolding` 出自那次尝试开始时以此刻的持有与配值做的求值，并与逐动作执行权限一起钉进那一次的报告（`capability.asset-registry/v1#S-11`、`#S-24`；K30）——所以凭据改值在下一次尝试生效（P-9），这一次尝试里的调用与列举用的是同一份持有。
- **本契约不因对端的通知改动任何已钉住的东西**（[S-25](#s-25-对端来的通知与请求)）。

### S-13 凭据与引用不进任何呈现

**凭据本体、OAuth 的令牌与授权码与校验值，任何时候不出现在：**本契约的任何返回值、失败值与其 `raw`、日志、帧、调用结果、stdio 服务端 stderr 的留存、对端通知的留存里。

- **凭据引用只出现在一处**：[S-23 completeOAuth](#s-23-completeoauth) 交回给配值写面的那一次——它是一次交接，不是一次呈现；配值写面照 `data.asset-model/v1#S-23` 第 5 条不呈现它。
- **留存对端给的文字之前先遮掉**：这条连接出示过的每一段凭据文字，在 stderr、日志通知、协议错误的原文里出现时，替换成固定的遮罩再留存。**不承诺遮得掉对端自己变形过的秘密**（编码、截断）。
- 可以呈现的只有「有没有、哪一层的、什么时候取的」（[PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现)）——它们来自配值与 OAuth 绑定，不来自本契约的任何秘密。

### S-14 桥不做放行判断

**本契约不判断一次调用该不该执行、要不要问人。**动作随接入点持有与授权（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)）；
逐动作执行权限是那个条目的执行权限，由放行判断在调用之前判；它的值是会话资产注册表在尝试开始时钉进报告的那一项（`capability.asset-registry/v1#S-11` 的 `effectivePermissions`，[D-040 §五](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) K30）。**到达 [S-19](#s-19-invoke) 的调用已经被放行**——那是调用方（工具执行运行时）的前置，不是本契约再判一次。

**「能不能用」同样不由本契约判**：求值与会话资产注册表只为能用的租户交出 `endpointHolding`、装出条目；本契约拿到的就是判过的结果（[S-5](#s-5-接入点持有的寻址)）。

---

## 四、操作

### S-15 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | **输入** |
| ② | **前置与授权** |
| ③ | **结构性禁止**（不是权限判定；不适用写「无」） |
| ④ | **提交点与原子性** |
| ⑤ | **成功返回** |
| ⑥ | **失败集合**（枚举封闭，**没有「其他」**） |
| ⑦ | **幂等与重复** |
| ⑧ | **缺席时的默认答案**（[S-11](#s-11-缺席时的默认答案)） |
| ⑨ | **事件** |

**本契约的失败值恰十一个，闭合**：

| 失败值 | 含义 | 出自哪些操作 |
|---|---|---|
| `invalidInput` | 输入不合形状（[S-11](#s-11-缺席时的默认答案) 第三行） | 全部 |
| `endpointUnreachable` | 连不上对端：stdio 程序拉不起来或退出、网络不通、握手或列举没在连接超时之内完成、连接在调用途中断了 | refresh、availability、invoke、beginOAuth、completeOAuth |
| `credentialUnavailable` | 有凭据却用不了：解引用不到（不在那份持有上、已作废、续不上）、违反来处规则（[S-9](#s-9-凭据的出示与取用) 第 3 条）、对端拒绝了出示的凭据 | refresh、availability、invoke |
| `oauthRequired` | 没有出示凭据，对端答以要经 OAuth 鉴权 | refresh、availability、invoke |
| `actionUnknown` | 对端说没有这个动作（协议层的未知工具错误） | invoke |
| `protocolError{raw}` | 对端违反协议或回了协议层错误；`raw` 原样带对端给的错误对象（先按 [S-13](#s-13-凭据与引用不进任何呈现) 遮掉），本契约判出的违例（分页超出上限、列举项不合形状、对端名重复）写成违例说明 | refresh、availability、invoke、beginOAuth、completeOAuth |
| `callTimedOut` | 一次调用在单次调用超时之内没有应答 | invoke |
| `oauthNotApplicable` | 这份持有上不能经 OAuth 取凭据：连接目标不是 streamable_http，或它在工作区格、出厂格 | beginOAuth |
| `oauthDenied` | 这一次 OAuth 取值没有成：人拒绝了同意、授权服务器报了错、应答与流程对不上，或这次流程已不再有效（已完成、已作废、被新的一次取代、已过期） | completeOAuth |
| `dependencyUnavailable` | 判不出来：存储、凭据保管方或时间源此刻不可用 | 除 projectActions 外全部 |
| `bridgeWithdrawn` | 这一份桥在操作进行中被替换或卸载，没有结论（[S-27](#s-27-桥被替换或卸载)） | 除 projectActions 外全部 |

**与起草时名字清单的差别**：清单给的是前七个；**`callTimedOut`、`oauthNotApplicable`、`dependencyUnavailable`、`bridgeWithdrawn` 四个是本契约加的**——
`callTimedOut` 是「单次调用超时」这一项设置到点之后必须有的名字（不能说成连不上）；`oauthNotApplicable` 是 OAuth 那一路的结构性禁止（不是权限判定）；
`dependencyUnavailable` 是「判不出来与判为拒绝永远是两个值」的那一半；`bridgeWithdrawn` 是主线追加的「桥换代时在途调用落异常中断」要一个能与普通失败分开的结局（它对到的收场带原因码，别的失败不带）。
**`oauthDenied` 收了四种来由**，理由同 `capability.asset-transfer` 的「不再有效」口径：对调用方它们只有一个后果——重新发起。**[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-b 采纳。**

### S-16 refreshActions

**完整列举一份接入点持有的对端动作，写成它的副本。**会话资产注册表在每次执行尝试开始时对这次会话要装的每个接入点各调一次（[S-12](#s-12-每次执行尝试重新列举尝试内不变)）；交付面要给人看「此刻有什么」时也可以调。

| # | 内容 |
|---|---|
| ① | `endpointHolding`（[S-5](#s-5-接入点持有的寻址)） |
| ② | **本操作不做授权判定**（[S-14](#s-14-桥不做放行判断)）；前置是调用方只拿求值交出的 `endpointHolding` 调它。凭据按 [S-9](#s-9-凭据的出示与取用) 取用 |
| ③ | 无 |
| ④ | **外部效果先于提交**：取用或建立连接（stdio 会拉起进程）、发出列举请求——这些不回滚。**提交只有一处**：列举**完整**成功后，对键 (`tenant`, `endpoint`, `scope`) 的副本做一次条件写（[S-7](#s-7-动作清单持久副本) 第 3、4 条）。整次操作（含建连与全部分页）以 `settings.connectTimeout` 封顶；分页页数以具名参数 `maxListPages` 封顶 |
| ⑤ | **这次写下的那份副本**（一定是 `fetched`；`tools` 可以为空）。条件写因 `fetchedAt` 不更晚而被丢弃时，返回的是**存储里那份更新的** |
| ⑥ | `invalidInput` · `endpointUnreachable` · `credentialUnavailable` · `oauthRequired` · `protocolError{raw}` · `dependencyUnavailable` · `bridgeWithdrawn`。**中间四个判定类失败随值交出这个键上现存的那份副本**（可能是 `not_fetched`，也可能是一份更早的 `fetched`）——会话资产注册表据它装替换件（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)）；`invalidInput`、`dependencyUnavailable` 与 `bridgeWithdrawn` 不交副本 |
| ⑦ | **每次调用都真的列举一次**，不以缓存充当「这一次拿到的」。并发的两次调用各自列举、各自条件写，存储里留下 `fetchedAt` 较晚的那份——**后开始的那一次**（[S-7](#s-7-动作清单持久副本) 第 4 条）。**不去重** |
| ⑧ | 身份参数缺席 ⇒ `invalidInput`；存储读不到或写不进、时间源不可用、保管方够不着 ⇒ `dependencyUnavailable`。**不得**把读不到的副本当成 `not_fetched`，**不得**在列举失败时把旧副本当作这一次的成功返回 |
| ⑨ | 不发。每次刷新的结果（成功、失败值、耗时）作为可观测记录留下，不是契约事件 |

**哪些对端答复让整次列举失败**（`protocolError`）：某一页的某一项缺 `name` 或 `inputSchema`、`name` 不是非空字符串、`inputSchema` 不是对象；两项同名；页数超过 `maxListPages`；分页游标出错。
**一项有毛病就整份不写**——不丢掉坏的那一项、留下其余的（`data.mcp-endpoint/v1#S-21` 不修补）。对端动作名拼不出条目名、参数 schema 不成立，**不在此列**：它们照样进副本，在投影时处理（[S-17](#s-17-projectactions)）。

### S-17 projectActions

**把一份副本算成一组工具定义。纯函数。**

| # | 内容 |
|---|---|
| ① | 接入点的能力标识 `endpoint`（类别 `mcp`）；生效那一版的正文 `body`（`McpEndpoint`）；一份副本 `snapshot`（`ActionSnapshot`） |
| ② | 无授权前置 |
| ③ | 无 |
| ④ | 只算，无提交、无外部效果 |
| ⑤ | **三样**：`entries`——按副本里 `tools` 的次序，每个能投影的对端动作一项，每项是一份工具定义，外加「**只能以替换件出现**」的标记与原因、以及**是否经过最小规范化**的标记 `normalized`（布尔，恒在；见下）；`excluded`——投影不了的对端动作，每项是 (对端动作名, 原因)，原因恰两种、闭合（见下）；以及副本本身的那一支（`fetched` / `not_fetched`），**消费者据它分辨「没有条目」是哪一种** |
| ⑥ | `invalidInput`（三个输入任一不合形状） |
| ⑦ | 纯函数：同样的三个输入，逐字相同的输出。**唯一依实现而变的一判**是参数 schema 编不编得出（`data.tool-definition/v1#S-26` 第 13 行，上限由实现登记，那份契约的 G-16）：同一实现、同一份登记的上限下，同样的三个输入逐字相同的输出；上限不同的两个实现，可以一个把某个动作投成普通条目、一个把它标成只能以替换件出现（见下） |
| ⑧ | 输入缺席 ⇒ `invalidInput` |
| ⑨ | 不发 |

**`snapshot` 是 `not_fetched` 时**：`entries` 与 `excluded` 都为空——**这是「不知道有哪些」，不是「没有」**；从没连上过的接入点因此在 agent 面前没有条目，也没有替换件可装（[G-11](#十已知缺口)）。

**一份对端动作 `d` 投影成的工具定义，恰是：**

| 工具定义的成员 | 取值 | 依据 |
|---|---|---|
| `name` | 动作条目名：`endpoint.name` ＋ `:` ＋ `d.name` | `data.mcp-endpoint/v1#S-11` |
| `description` | `d.description`，若它是非空字符串；否则固定文本 `对端未提供说明`（最小规范化第 1 样） | `data.tool-definition/v1#S-8` 要求非空；[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#工具说明与每个参数的说明必填) 说明必填；**占位说的是「对端没给」，不替对端编一句说明** |
| `paradigm` | `single` | `data.tool-definition/v1#S-17` 第 1 条：MCP 来源恒为单函数 |
| `input` | `d.inputSchema` 经最小规范化（见下）；三样都用不上时就是 `d.inputSchema` 原样 | 替换件同形的依据（[PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)）：规范化是本函数的一部分，原件与替换件出自同一次投影 |
| `permissions.execute.default` | `body.permissions.execute.default` | 与 `data.mcp-endpoint/v1` 推出的 `execute:<d.name>` 那一项的 `default` 是**同一个值** |
| `origin` | `{ "kind": "mcp", "endpoint": endpoint, "remoteName": d.name }` | `data.tool-definition/v1#S-17` |
| `help`、`needs`、`settings`、`allowBackground`、`composes` | **全部不带** | 见下 |

- **不带 `settings`**：两项超时是接入点持有上的设置（`data.mcp-endpoint/v1#S-14`），不是每个条目自己的；条目在定义里声明设置项，就会凭空多出一批无处可配的项（对端动作没有持有）。**单次调用超时由本契约在 [S-19](#s-19-invoke) 按 `settings.callTimeout` 执行。**
- **不带 `allowBackground`**：后台许可是作者对自己代码时序的担保，对端无从声明、接入点作者也担保不了对端（[`data.tool-definition/v1#S-12`](../../../data/tool-definition/v1/contract.md#s-12-后台许可与转后台阈值)「不声明就是不能后台」）。**MCP 条目本版不转后台。**
- **不带 `needs`**：对端描述没有声明依赖与模态的途径。**两端模态由本条投影**（[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-e）：
  入参那一端，对端要的是一个 JSON 对象，有效模型只需给出文本——不带 `inputModalities`（「只要文本」）就是它的投影；
  结果那一端，对端描述里没有可投的东西，**投不出，读作「任意」**（`data.tool-definition/v1#S-24` 第 3 条）：本版每一个 MCP 条目的结果端都是「任意」，结果里的图块、语音块不判违反。**不把「任意」写成 `outputModalities` 的一组取值**——那会成为「只有这几种」的声明。
- **不带 `composes`**：MCP 不组合任何资产（`data.tool-definition/v1#S-16`）。

**最小规范化**（主线裁定 2026-09-24；原 [G-18](#十已知缺口)）：投影之前，对 `d` 恰做下面三样改写，**不做别的**：

1. **缺说明补占位**：`d.description` 缺席或为空串 ⇒ 条目的 `description` 取固定文本 `对端未提供说明`；`d.inputSchema` 里任何一处 `properties` 的某个成员 schema 是 JSON 对象、却没有 `description` 或它是空串 ⇒ 给它补 `"description": "对端未提供说明"`。
   「任何一处 `properties`」与「schema 的位置」都按 `data.tool-definition/v1#S-4` 第 2、3 条数；成员 schema 是布尔 schema 的补不上、不改。
2. **剥掉 `$schema` 与 `title`**：在 `d.inputSchema` 的每一个 schema 位置上删掉这两个关键字。`properties` 下名为 `title` 或 `$schema` 的是**参数名**，不是关键字，不动。
3. **`{"type": "object"}` 视为无参数**：做完第 2 样之后，`d.inputSchema` 顶层恰是 `{"type": "object"}` ⇒ 取 `{"type": "object", "properties": {}}`。顶层另有别的关键字而没有 `properties` 的，不在此列。

- **`normalized`**：三样里至少做了一样 ⇒ 这个条目 `normalized: true`；一样都没做 ⇒ `false`（这一判据主线裁定 2026-09-24 确认）。**消费者据它知道这份定义不是对端原话**（呈现、可观测记录、排查「说明为什么是占位」）；它不改变条目能不能用、也不改变它的形状。
- **三样都不改变参数 schema 收哪些值**：`description`、`title` 是注解，`properties: {}` 不收窄一个没写 `properties` 的对象 schema——同一次调用的参数，规范化前后判得一样；按 `data.tool-definition/v1#S-5` 末条的读法（`input` 顶层没写 `additionalProperties` 即不收未知键，主线裁定 2026-09-24）判，前后同样一样。
  **那条读法对 MCP 条目的后果**：对端 schema 大多不写 `additionalProperties`，这些动作收到未知键时由执行运行时拒回（`arguments_invalid`），不送到对端——哪怕对端本来收；**桥不替对端补也不删 `additionalProperties`**（那是第四样改写）。
  剥掉 `$schema` 之后一律按 Draft 2020-12 读：对端按别的草案写、在 2020-12 下读法不同的写法（例如数组形 `items`），过不了合法性一关，照第 2 种原因排除。
- **替换件同形照样成立**：规范化是 `projectActions` 这个纯函数的一部分，只读输入；原件与替换件都由同一份副本经同一次投影得出（`capability.asset-registry/v1#S-12`），改写一字不差。**副本仍存对端原话**（`data.mcp-endpoint/v1#S-10`），规范化不回写副本。
- **只有这三样**：删别的关键字（`$ref`、`$defs`、`$id`、`allOf`……）、补 `required`、改 `type`、展开或合并子 schema，一概不做——那些会改变参数 schema 收哪些值，交出的定义就与对端对参数的说法各执一词。

**只能以替换件出现**：一个动作照样投影成一份工具定义（形状照常、`normalized` 照常），但**标记为只能以替换件出现**并带原因——**原因恰两种，闭合**：

1. **执行方式本版不支持**：对端声明这个动作**必须以任务方式执行**（MCP 协议 2025-11-25 版的 `execution.taskSupport` 为 `required`，从副本里原样保留的那一项读），本版不桥这类动作（D-037）；原因是「本版不支持这个动作的执行方式」。**能否在列举结果里可靠地识别它，D-037 记为未核**（[G-6](#十已知缺口)）；识别不出的，按普通动作投影，调用时对端报错落 `protocolError`。
2. **`schema_unsupported`：参数 schema 这个实现判不了**（主线裁定，见 [D-040 §八 M37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：名字拼得出，以**规范化之后**的 `d.inputSchema` 作 `input` 的那份定义过了 `data.tool-definition/v1` 的 [S-26](../../../data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序) 前十二行，只在第 13 行被拒——这个实现编不出它，或其中某个 `pattern` 超出实现登记的上限。**形状合法，所以不进 `excluded`**（[`data.tool-definition/v1#S-27`](../../../data/tool-definition/v1/contract.md#s-27-表示层拒绝不是判定) 末段给 MCP 来源开的那个口子；[`data.mcp-endpoint/v1#S-10`](../../../data/mcp-endpoint/v1/contract.md#s-10-对端动作描述) 同句）：原因写 `schema_unsupported`，会话资产注册表据此装 `stand_in{for: schema_unsupported}`（`capability.asset-registry/v1#S-12`「原因取桥给的」）——**看得见、说得出原因、调了一定落「不可用」**，不会把一次判不了参数的调用送到对端。同形照的仍是这一次投影出的定义，规范化一字不差（最小规范化里「替换件同形照样成立」那一条）。

**两种同时成立时报 `schema_unsupported`**（本契约推导，已报主线）：先判定义、后判执行方式，与「先判名字、再判参数 schema」同一个方向；两个实现（上限相同）对同一个对端动作因此给出同一个原因。

**`excluded` 的原因恰两种，闭合**；每种都带 `data.tool-definition/v1` 的 [S-26](../../../data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序) 对那份投影出的定义报出的**那一个表示层拒绝值**——判法全在那份契约，本条不另列一份清单（下面的例子不是穷举）。两种都**不改写对端动作名、不丢掉副本里的那一项**：

1. **`name_unformable{rejection}`：条目名拼不出**。`endpoint.name` ＋ `:` ＋ `d.name` 作 `name`，过不了 `data.tool-definition/v1` 的 [S-18](../../../data/tool-definition/v1/contract.md#s-18-名字的表示与相等)（`data.mcp-endpoint/v1#S-11` 取的就是它）：`rejection` 是 `name_reserved_sequence`（含 `__`、拼接处成 `_:`／`:_`），或 `malformed`（空串，或字符集之外的字符如 `.`、空白、`/`，或转写后过长）。
   **接入点的 name 在登记时已收窄**（`data.mcp-endpoint/v1#S-26`，主线裁定 2026-09-24），所以拼不出只可能因为对端动作名；名字不做规范化——改写名字会让两个对端动作撞到同一个条目上；
2. **`input_rejected{rejection}`：参数 schema 不成立**。以**规范化之后**的 `d.inputSchema` 作 `input` 的那份定义，在 `data.tool-definition/v1` 的表示层校验里因参数 schema 被拒：`rejection` 是 `input_not_schema`（不是合法 schema）、`parameter_description_missing`（规范化之后只剩成员 schema 是布尔 schema 那一种），或 `malformed`（M26：顶层不是带 `properties` 的对象——恰 `{"type": "object"}` 的已由第 3 样补上；M27：用了可呈现子集之外的关键字——`$schema`、`title` 已剥掉，剩下的如 `$ref`、`$defs`、`$id`、`allOf`）；即它的 [S-4](../../../data/tool-definition/v1/contract.md#s-4-单函数工具) 与三条硬要求（产品负责人 2026-09-24 要求）。
   **`rejection` 从不是 `schema_unsupported`**：只在 S-26 第 13 行被拒的那一种形状合法，不排除，按前文「只能以替换件出现」的第 2 种原因处理（M37）。

**判定次序是本契约定的**：先判名字——拼不出即 `name_unformable`，`rejection` 是 S-26 只就这个名字判出的值；名字拼得出，再判参数 schema 的前十二行——不过即 `input_rejected`；都过了，再判第 13 行——被拒即只能以替换件出现、原因 `schema_unsupported`。一个动作两种都犯，报 `name_unformable`（没有名字就谈不上一份定义）；两个实现对同一个对端动作因此给出同一个原因（第 13 行那一判另依实现登记的上限，⑦）。

**规范化之后仍排除的，常见的是参数 schema 里用了引用**（`$ref` 加 `$defs`／`definitions`）或不合 Draft 2020-12 的写法：本版不展开引用、不改写——那会改变参数 schema 收哪些值。

**被排除的动作对 agent 不可见**——没有名字可占位；它们必须作为可观测记录留下，并由会话资产注册表决定是否告诉 agent（**不静默丢**）。

### S-18 availability

**此刻连不连得上：按 `endpointHolding` 取用或建立连接、完成握手，不列举。**给交付面与设置页「查得到原因」（[PF-002 acceptance §一](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)：「它的动作不可用，查得到原因」）。

| # | 内容 |
|---|---|
| ① | `endpointHolding` |
| ② | 同 [S-16](#s-16-refreshactions) ② |
| ③ | 无 |
| ④ | 可能建立连接（外部效果，不回滚）；**不写副本**，无提交。以 `settings.connectTimeout` 封顶 |
| ⑤ | `available`，或 `unavailable{reason}`，`reason` 恰是 `endpointUnreachable`、`credentialUnavailable`、`oauthRequired`、`protocolError{raw}` 之一 |
| ⑥ | `invalidInput` · `dependencyUnavailable` · `bridgeWithdrawn` |
| ⑦ | 每次都按此刻作答；一条已建立、未出错的连接即算 `available`，不另握一次手 |
| ⑧ | 同 [S-16](#s-16-refreshactions) ⑧；**判不出来不答 `unavailable`**，答 `dependencyUnavailable` |
| ⑨ | 不发 |

**会话资产注册表在尝试开始时不需要它**：[S-16](#s-16-refreshactions) 的结果已经包含可用与否。它与 [S-16](#s-16-refreshactions) 的判定口径相同——同一时刻、同一 `endpointHolding`，两者对「连不连得上」给同一个答案。

### S-19 invoke

**把一次已放行的调用送到对端，把应答带回来。**本契约是 MCP 条目那份工具定义的**自带实现**（[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)「它可以自带实现」），由工具执行运行时在一次工具执行里调用。

| # | 内容 |
|---|---|
| ① | `endpointHolding`；`action`——那个条目 `origin.remoteName`（它的 `origin.endpoint` 必须等于 `endpointHolding.endpoint`）；`arguments`——一个 JSON 对象，原样送出。另有工具执行运行时在这次执行里交给它的两样：**中断请求**与**发帧原语**（[PF-006 发帧](../../../../product/PF-006-tools-and-skills/design.md#发帧)） |
| ② | **调用方的前置**：这次执行已经过放行（[S-14](#s-14-桥不做放行判断)）；`endpointHolding` 是这次尝试钉住的那一份（`capability.asset-registry/v1#S-11` 的 `endpointHoldings`）；`action` 在这次尝试钉住的那份动作集里。**本契约不拿最新的副本去核 `action`**——副本可能已被别的会话刷新，而这次尝试钉住的是另一份（[S-12](#s-12-每次执行尝试重新列举尝试内不变)） |
| ③ | 无。**elicitation 本版不向对端声明**（[S-25](#s-25-对端来的通知与请求)） |
| ④ | **本契约没有提交点**：执行记录与收场归工具执行运行时。**请求一旦写进连接，就是一次已发生的外部效果**，此后在任何情形下（断线重连、据点重启、超时、中断）**都不重放**（D-037「不重放已发出的调用」；[PF-006 §6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)） |
| ⑤ | 对端的应答：一份 `ToolResult`（按 [S-20](#s-20-对端结果怎样成为-toolresult)）外加「**对端是否报告这次出错**」（协议的 `isError`）。出错的应答**照样是一次应答**，内容照样带回 |
| ⑥ | `invalidInput` · `endpointUnreachable` · `credentialUnavailable` · `oauthRequired` · `actionUnknown` · `protocolError{raw}` · `callTimedOut` · `dependencyUnavailable` · `bridgeWithdrawn`。**每个失败都写明请求是否已经发出**——发出之后的失败，对端可能已经做了那件事（工具执行运行时据此记账） |
| ⑦ | **不幂等，不去重，不重放。**同样的参数再调一次是 agent 的又一次工具调用、又一次外部效果 |
| ⑧ | 身份参数缺席、`action` 与 `endpoint` 对不上、`arguments` 不是对象 ⇒ `invalidInput`（未发出）；没有可用连接 ⇒ 当场建立（`settings.connectTimeout` 封顶），建不起来 ⇒ `endpointUnreachable`／`credentialUnavailable`／`oauthRequired`（未发出）；保管方够不着 ⇒ `dependencyUnavailable`（未发出） |
| ⑨ | 对端的**进度通知** ⇒ 经发帧原语发出一帧：**不阻塞调用、丢了不影响收场**（D-037「进度通知 → 发帧」）；**日志通知** ⇒ 可观测记录（按 [S-13](#s-13-凭据与引用不进任何呈现) 遮掉），不成帧、不进结果。不发契约事件 |

**时限**：请求发出后，`settings.callTimeout` 到点仍无应答 ⇒ 向对端发出这次请求的取消通知、不再等它，失败值 `callTimedOut`（已发出）。

**中断**：工具执行运行时送来中断请求 ⇒ 向对端发出这次请求的取消通知、不再等它的应答，**这次 `invoke` 不再交回任何东西**——收场由运行时按「被中断」落（[S-21](#s-21-失败值与收场的对应)）。
此后到达的应答**丢弃**；对端是否真的停了，本契约不承诺（取消通知是请求，不是保证）。

**连接在调用途中断了** ⇒ 这次调用以 `endpointUnreachable`（已发出）结束，**不在新连接上重发**。

### S-20 对端结果怎样成为 ToolResult

**对端应答里的 `content` 逐项、按原次序映射成 `data.content-blocks` 的块，放进 `ToolResult.content`**（`data.tool-definition/v1#S-21`）；两个标注都取「两边都给」（与 [`data.tool-definition/v1#S-20`](../../../data/tool-definition/v1/contract.md#s-20-两种写法与等价规则) 同理）。块标识的给法与任何一个工具的结果相同（那边的 G-10）。

| 对端的一项 | 映射成 | 依据 |
|---|---|---|
| 文本 | 文本块，`text` 原样 | `data.content-blocks/v1#S-8` |
| 图片（内联 base64 ＋ 媒体类型） | 图块，内联字节原样，`mediaType` 取对端给的 | `data.content-blocks/v1#S-10` |
| 音频（内联 base64 ＋ 媒体类型） | 语音块，同上 | 同上 |
| 资源链接 | 文本块：链接的名字与 URI，各占一行 | D-037「资源链接按工具产出处理、不丢」 |
| 内嵌资源，文本型 | 文本块：第一行是资源的 URI，其后原样是资源文本 | 同上 |
| 内嵌资源，二进制，媒体类型是 `image/*` 或 `audio/*` | 图块或语音块，内联 | 同上 |
| 内嵌资源，二进制，其他媒体类型 | **文本块，写明这里有一份没有带回的资源**：它的 URI、媒体类型与字节数 | **本版没有地方存放它**：附件存储未定义（[G-4](#十已知缺口)）；**不静默丢，也不假装带回了** |
| 任何一项映射不成合法的块（例如媒体类型不合 `data.content-blocks/v1#S-7` 的规范写法） | **文本块，写明这一项的类型与没有带回的原因** | **不替对端改写**媒体类型（不修补），也不因为一项坏了丢掉整份应答 |

- **结构化结果**：应答带 `structuredContent` 而 `content` 为空时，追加一个文本块，内容是它的 JSON 文本；`content` 不空时不另加（协议约定 `content` 里已有它的文本形式）。
- **不产出 `offload` 与 `attachments`**：MCP 条目不声明附件存储（[S-17](#s-17-projectactions)）；太大的结果由 agent loop 的系统兜底那一路处理（`data.tool-definition/v1#S-23` 第二条来路），不在本契约。
- **结果端模态**：图块与语音块照原样带回；MCP 条目的结果端是「任意」（[S-17](#s-17-projectactions)；[`data.tool-definition/v1#S-24`](../../../data/tool-definition/v1/contract.md#s-24-结果与声明对得上) 第 3 条），不判违反。**本契约不删掉它们**（D-037 要求不丢）。

### S-21 失败值与收场的对应

**给工具执行运行时的对照**：它据此判这一次执行的[收场](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)（`data.content-blocks/v1#S-17`）。判定仍归运行时，本表是本契约对「这些值意味着什么」的承诺。

| `invoke` 的结局 | 收场 |
|---|---|
| 应答，对端未报出错 | `completed` |
| 应答，对端报了出错（`isError`） | `failed`——内容照样进结果 |
| `endpointUnreachable`、`credentialUnavailable`、`oauthRequired`、`actionUnknown`、`protocolError`、`callTimedOut`、`dependencyUnavailable`、`invalidInput` | `failed`，失败种类由运行时定为执行者交回的失败（`capability.tool-execution-runtime/v1#S-11` 的 `implementation_error`）。**不带原因码**（`data.content-blocks/v1#S-18`：`failed` 只在异常中断时带码）；原因由运行时写进结果内容，**不含任何凭据** |
| `bridgeWithdrawn`（桥被替换或卸载，[S-27](#s-27-桥被替换或卸载)） | `failed`，原因码 **`abnormal_interruption`**。**不迁移、不重发** |
| 运行时送来中断请求 | `interrupted`（运行时的判定） |

- **`unavailable` 从不出自 `invoke`**：不可用只出自尝试开始时的判定，由替换件给出（[S-10](#s-10-对端可用性不由本系统掌握)）。调用途中对端没了，是这一次的 `failed`。
- **`no_answer` 与 `backgrounded` 本版不会出现**：elicitation 不声明（没有工具等待态），MCP 条目不声明后台许可。
- **据点停机时在途的调用**：收场由运行时的恢复按它的规矩落（`data.content-blocks/v1#S-18` 的异常中断），本契约不参与（[S-28](#s-28-据点停机与重启)）。

### S-22 beginOAuth

**为一份持有发起一次经 OAuth 取得 MCP 凭据的流程。**只由配值入口（交付面，PF-016）代表一个人调用。

| # | 内容 |
|---|---|
| ① | `endpointHolding`（[S-5](#s-5-接入点持有的寻址)，**`scope` 与那里同义**：这个租户此刻生效的那份持有所在的格），`settings.connectionTarget` 是那份持有此刻的连接目标。**凭据要配上去的那一格不是参数**：它恒是这个租户的租户格（[S-9](#s-9-凭据的出示与取用) 第 2 条）；本操作只在 `scope` 就是租户格时发起（③），这时两者是同一份持有 |
| ② | **本操作只能从配值入口到达，agent、工具、运行都不是它的调用方**（[PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)「agent 不发起，run 不触发，不出决策卡片」）——这是装配事实，本契约不在运行中辨认调用者。**配值资格不在这里判**：取到的引用只有经资产治理写面由有资格的人配上才生效（[S-23](#s-23-completeoauth)），在那之前它什么也打不开 |
| ③ | **有**：`connectionTarget.kind` 不是 `streamable_http`（stdio 服务端从环境取凭据，按 MCP 授权规范不走 OAuth）⇒ `oauthNotApplicable`；`scope.layer` 不是 `tenant` ⇒ `oauthNotApplicable`：生效的那份在组织格或出厂格，说明这个租户在租户格上还没有它的持有——配值只挂在本格自己的持有上，要先以 `organization`／`official` 那一支在租户格持有它（`data.asset-model/v1#S-19`）再来取，组织那一层本身不持有 MCP 凭据（PF-002 rev 18）；生效的那份在工作区格，连接目标来自工作区，取到的租户凭据按 [S-9](#s-9-凭据的出示与取用) 第 3 条也不会出示给它。**这不是权限判定**：这几种情形下这一次取值没有可配上去、又会被用上的那一格 |
| ④ | 向对端取授权服务器的元数据（外部读取）；然后**一次提交**：写一个 `pending` 绑定，并把同一份持有上已有的 `pending` 绑定一并作废 |
| ⑤ | 这个 `pending` 绑定，与一个**给人去点同意的地址**。地址里只有协议规定的一次性参数，不含任何凭据 |
| ⑥ | `invalidInput` · `oauthNotApplicable` · `endpointUnreachable` · `protocolError{raw}` · `dependencyUnavailable` · `bridgeWithdrawn` |
| ⑦ | **不幂等**：每次调用一个新的绑定号；旧的 `pending` 作废，它的应答回来时 `oauthDenied` |
| ⑧ | 身份参数缺席 ⇒ `invalidInput`；存储不可用 ⇒ `dependencyUnavailable`，**不留下一个半成的绑定** |
| ⑨ | 不发 |

**组织格**：生效的那份在组织格时本操作**不发起**（③，`oauthNotApplicable`）——[PF-002 rev 18](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)：组织那一层不持有 MCP 凭据，组织接入的接入点由每个成员在自己的租户层取（离职收不回、经 OAuth 取得的要在多台机器上各自续期）。
组织格上**写配值**的那一关由资产治理写面拒；本操作挡的是**为组织格发起一次取值**——两处是两个不同的入口，挡的是同一条产品规则，不是同一次判定做两遍（原 G-13 闭合）。

### S-23 completeOAuth

**接住对端同意之后回来的应答，取得凭据，交出一个凭据引用。**

| # | 内容 |
|---|---|
| ① | 绑定号；回来的授权应答（成功时是授权码与状态参数，失败时是对端给的错误） |
| ② | 那个绑定此刻是 `pending`、未过 `oauthPendingTtl`；应答里的状态参数与这次流程一致。调用方同 [S-22](#s-22-beginoauth) |
| ③ | 无 |
| ④ | 用授权码向授权服务器换取凭据（外部效果：授权码被用掉）；然后凭据保管方收下这份凭据、发出一个 `CredentialRef`，并把它与这份持有绑在一起；绑定迁到 `granted`、`since` 取此刻。**对外两件同成同败**（装配给：同一存储，[S-30](#s-30-装配给与协议给)）：本版落成保管方的两次提交——先收成「待生效」（`capability.credential-custodian/v1#S-16`），绑定迁 `granted` 并记下这个引用之前它交不出（那份契约 S-17），迁不成的那一条由它的清扫丢弃（S-18）——所以不存在「绑定 `granted` 却交不出」或「交得出而绑定不是 `granted`」（2026-09-25 修订波）。**本操作不写配值** |
| ⑤ | `granted` 的绑定，与那个 `CredentialRef`——**交给配值入口，由它经资产治理写面以这个人的身份写成那份持有上 `credential` 那一项的值**（取值就是配值）。在它被配上之前，这个引用解引用不出任何东西（[S-9](#s-9-凭据的出示与取用) 第 2 条） |
| ⑥ | `invalidInput` · `oauthDenied` · `endpointUnreachable` · `protocolError{raw}` · `dependencyUnavailable` · `bridgeWithdrawn` |
| ⑦ | **同一个绑定第二次完成 ⇒ `oauthDenied`**（流程已不在 `pending`），不产生第二份凭据；授权码按协议只能用一次，本契约**不重放换取** |
| ⑧ | 身份参数缺席 ⇒ `invalidInput`；换取成功而保管方或存储此刻不可用 ⇒ `dependencyUnavailable`，那份换来的凭据丢弃（已收成「待生效」而绑定没迁成的，由保管方的清扫丢弃）、绑定留在 `pending` 直到过期作废——**人要重新发起一次**；不把凭据暂存在别处等下次补提交 |
| ⑨ | 不发 |

**配值写面没写成**（治理中心不可达——[PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活) 离线时治理写入明确失败；或那个人没有配值资格）：引用始终没被配上，
过 `unassignedCredentialRetention` 之后保管方丢弃那份凭据、绑定迁到 `revoked`（[S-8](#s-8-oauth-绑定状态与迁移)）。**没有一个无人认领的凭据长期留在据点上。**

### S-24 续期、清值与作废

**这几件事没有操作，是本契约持续兑现的义务：**

1. **续期不要人**：`granted` 的绑定、它的引用仍被配在那份持有上，本契约在凭据到期前、或对端以鉴权失效拒绝时，向授权服务器续期，**不打扰任何人、不产生一次「设置被改」**（[PF-002 acceptance §一](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)）。
   续出来的仍归同一份持有、**引用不变、配值不变、绑定不变**（`data.asset-model/v1#S-23` 第 6 条）。
   **本版兑现不了这一条**：续出来的新本体没有地方写回——`capability.credential-custodian` v1 本版不收续期写回（它的 G-4，桥节点 C-5）。令牌到期之后这一格 `credentialUnavailable`、**人要重新取**；这不是「续不上即失效」（第 2 条），绑定不因此作废（[G-7](#十已知缺口)）。
2. **续不上即失效**：授权服务器**明确拒绝**续期 ⇒ 绑定迁到 `revoked`，此后解引用得 `credentialUnavailable`，下一次尝试开始时这个接入点的动作不可用（「续不上，就是失效」）。
   **授权服务器暂时够不着**不作废绑定：在续上之前凭据用不了（`credentialUnavailable`），续期按具名参数的间隔重试；**不把「暂时够不着」说成「已经失效」，也不在失效后继续出示旧凭据**。
3. **换、撤就是改值、清值**：那份持有上的 `credential` 被改成别的引用，或那条配值被清掉（回到缺席）⇒ 原来那个引用不再解引用得出、它的绑定迁到 `revoked`、保管方丢弃本体。**下一次尝试开始前生效**；正在用这份凭据的连接不再用于新调用，在途的照常完成（[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)：撤销管的是下一道准入）。
4. **随持有生灭**：持有被移除，同第 3 条。
5. **据点知道「引用还配没配着」靠的是它读得到的配值**：据点离线时读的是副本（[PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)），**撤掉在这台机器上的生效时刻是它再读到新值的那一刻**——这是产品已接受的代价，不是本契约的缺口。

---

## 五、对端来的通知与请求

### S-25 对端来的通知与请求

| 对端送来的 | 怎么处理 | 依据 |
|---|---|---|
| 工具清单变了（`tools/list_changed`） | **只记一笔**（可观测记录，连续的合并记）；**不改任何已钉住的动作集、不立即重新列举**——下一次 [S-16](#s-16-refreshactions) 自然拿到新的 | D-037「只记不改当前 run」；[S-12](#s-12-每次执行尝试重新列举尝试内不变) |
| 进度 | 经发帧原语发一帧（[S-19](#s-19-invoke) ⑨） | D-037 |
| 日志 | 可观测记录，先遮掉凭据文字 | D-037；[S-13](#s-13-凭据与引用不进任何呈现) |
| 要人输入（elicitation） | **本版不向对端声明这项能力**；对端仍发来，按协议回「不支持」，调用照常等它自己的应答。**不由系统或拓展件代答** | D-037：等待态与卡片契约就位前不声明；[PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) |
| 其余反向请求（sampling、roots）与本版不桥的通知 | 不声明；来了按协议回「不支持」或忽略通知 | D-037 |

---

## 六、交接、缺席与恢复

### S-26 连接的收口次序

**一条连接关闭时，恰按这个次序：**

1. **关传输**：不再发出新请求，关掉与对端的通道；
2. **终止 stdio 服务端的进程组**：它拉起的那个进程**及其全部后代**，先请求退出，过具名参数 `stdioTerminateGrace` 仍在的强制终止——**收口之后，这条连接拉起的进程一个也不在**；
3. **排空 stderr**：读完管道里剩下的输出，按 [S-13](#s-13-凭据与引用不进任何呈现) 遮掉后留存（留存量以具名参数 `stderrBound` 封顶），然后关闭。

- **这条连接上还没回来的调用，各自以 `endpointUnreachable`（已发出）结束，不重放**（D-037「断连收掉全部挂起请求、不重放已发出的调用」）。收场是「失败」，**不带原因码**——桥还在、执行也还在，是对端没了。
- **因换值或闲置而关的，等在途调用结束再关**；因对端断开、持有移除而关的，在途调用按上一条收；**因桥被替换或卸载而关的，在途调用按 [S-27](#s-27-桥被替换或卸载) 收**。
- **stderr 在连接活着的时候就持续排空**，不等到关闭——不排空的管道会把服务端挂住。

### S-27 桥被替换或卸载

**连接归桥**（[S-6](#s-6-连接归桥不上签名不跨租户)）：**桥这一份被替换（含换用另一版 SDK 的桥）或被卸载时，它名下的全部连接随它收口；经它还没回来的每一次 `invoke` 各自以 `bridgeWithdrawn` 结束，收场是「失败」、原因码 `abnormal_interruption`**（`data.content-blocks/v1#S-18`；对照见 [S-21](#s-21-失败值与收场的对应)）。

1. **不迁移**：在途调用不交给接替的那一份桥；接替者**不接手**旧桥的任何连接，按 [S-6](#s-6-连接归桥不上签名不跨租户) 第 2 条从零建连。副本、绑定与保管方记下的凭据是持久的，接替者照旧读到。
2. **不重发**：已发出的请求在任何一份桥上都不再发出（P-6）；`bridgeWithdrawn` 同样写明请求是否已经发出。
3. **与本地工具不同**：一个本地工具的实现被撤下，在途的那一次执行照常跑完——撤下只管下一次（工具执行运行时的规矩）。**MCP 条目的实现是本契约，而这一次调用能交回应答的那一端在桥名下的连接里**：桥不在了，这一次就没有了交回应答的一方。
   **这就是异常中断**：没有人叫停它（所以不是 `interrupted`），也不是对端没了（所以不是 [S-26](#s-26-连接的收口次序) 那种不带原因码的失败）。
4. **次序**：先给每一次在途 `invoke` 交出 `bridgeWithdrawn`，再按 [S-26](#s-26-连接的收口次序) 的次序收口每条连接——**桥撤下之后，不留下一次既没有结局、也不会再有结局的调用**。
5. **同一时刻正在进行的其他操作**（`refreshActions`、`availability`、`beginOAuth`、`completeOAuth`）也以 `bridgeWithdrawn` 结束：`refreshActions` 不写副本、不交副本；`beginOAuth` 与 `completeOAuth` 若还没提交，什么也不留下——`completeOAuth` 已经换来的凭据丢弃、绑定留在 `pending` 直到过期（同 [S-23](#s-23-completeoauth) ⑧），人要重新发起。**`bridgeWithdrawn` 是「这一份桥已不在、没有结论」**，调用方可以在接替的那一份上重来——`invoke` 除外，它不重来。
6. **何时替换、何时卸载**归装配（[S-30](#s-30-装配给与协议给)）；本契约只定它发生时的结局。**替换是一次看得见的中断**：想要在途调用不受影响，就等它们结束再换——那是装配的选择，不是本契约的承诺。

### S-28 据点停机与重启

- **连接与它拉起的进程随据点进程一起没了**。在途调用的收场归工具执行运行时的恢复（异常中断）；**本契约不在重启后重发任何调用**。
- **副本、绑定、保管方记下的凭据都是持久的**，重启后照旧；`pending` 绑定按 `since` 过期作废（读时判定，不需要在重启时扫描）。
- **重启后的第一次尝试**照常经 [S-16](#s-16-refreshactions) 重新建连、重新列举。
- **上次拉起的 stdio 进程若在据点进程被强杀后仍活着**（孤儿），它不属于任何一条连接；**本契约要求重启后的桥不复用它、不向它发请求**。回收它是提供者设计的义务（进程组标识随连接记下）。

### S-29 依赖的提供者不可用

| 不可用的是 | 哪些操作受影响 | 怎么收 |
|---|---|---|
| 存储（副本、绑定） | refresh、beginOAuth、completeOAuth | `dependencyUnavailable`；**不交出一份读不到的副本的替代品** |
| 凭据保管方 | refresh、availability、invoke（要出示凭据时）、completeOAuth | `dependencyUnavailable`；**不改成不带凭据去连** |
| 时间源 | refresh（`fetchedAt`）、beginOAuth、completeOAuth（`since`） | `dependencyUnavailable` |
| 治理中心 | 本契约不直接调它 | 求值交不出 `endpointHolding` 是求值与会话资产注册表的事；OAuth 取得之后配不上值见 [S-23](#s-23-completeoauth) 末段 |

`projectActions` 是纯函数，不受任何提供者影响。

---

## 七、性质与前提

### 不变量与安全性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 一个租户身份的连接只出示它自己那份持有上的凭据；连接不跨 (租户, 接入点, 持有, 连接目标, 凭据引用) 复用 | 安全 | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)「不跨租户身份共用」 | 桥的连接取用（[S-6](#s-6-连接归桥不上签名不跨租户) 第 1 条）＋ 保管方按持有解引用（[S-9](#s-9-凭据的出示与取用) 第 2 条） | 对端在一个租户身份的会话里看到另一个租户身份的账号 |
| P-2 | 凭据不出示给来处比它更具体的连接目标 | 安全 | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) ∧ PF-002 §4 MCP 凭据（推导） | [S-9](#s-9-凭据的出示与取用) 第 3 条 | 一个仓库经同名接入点拿到租户的凭据 |
| P-3 | 凭据本体、令牌、引用不出现在任何返回、错误、日志、帧、结果、stderr 留存里（引用交给配值写面那一次除外） | 安全 | PF-002 §4 MCP 凭据「值本身永不呈现」；[PF-016 §6.11](../../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) | [S-13](#s-13-凭据与引用不进任何呈现) | 任何屏、机读输出、调试输出里搜得到凭据 |
| P-4 | OAuth 取值只从配值入口发起，agent 与运行不发起；工作区格与出厂格取不了；取到的引用在被配上之前打不开任何东西 | 安全 | PF-002 §4 MCP 凭据「谁去取、在哪取」「工作区那一级」 | [S-22](#s-22-beginoauth) ②③、[S-23](#s-23-completeoauth) ⑤、[S-9](#s-9-凭据的出示与取用) 第 2 条 | 会话里出现一张问人去授权的卡片；或一个没有配值资格的人取到的凭据被用上 |
| P-5 | 副本只被一次完整列举整份替换；`fetchedAt`（列举开始的时刻）不减——后开始的那一次留下；拿到一半的清单不落下 | 不变量 | [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用) 替换件同形 | [S-7](#s-7-动作清单持久副本) 第 3、4 条（存储上的条件写） | 替换件按一份残缺或更旧的清单装 |
| P-6 | 已发出的调用不重放，也不迁移到接替的那一份桥上 | 安全 | [PF-006 §6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)；D-037 | [S-19](#s-19-invoke) ④、[S-26](#s-26-连接的收口次序)、[S-27](#s-27-桥被替换或卸载)、[S-28](#s-28-据点停机与重启) | 对端上同一件事被做了两遍 |
| P-7 | 一次尝试钉住的动作集不因对端通知、别的会话的刷新而变 | 安全 | [PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)「一次尝试之内不变」；PF-006 §6.13 | 本契约不改钉住的东西（[S-12](#s-12-每次执行尝试重新列举尝试内不变)、[S-25](#s-25-对端来的通知与请求)）＋ 会话资产注册表钉住 | agent 在一次尝试里看到两个不同的动作空间 |
| P-8 | stdio 服务端只拿到白名单变量、正文的变量与自己那份凭据，不继承据点进程的其余环境 | 安全 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 跨租户默认拒绝 | [S-6](#s-6-连接归桥不上签名不跨租户) 第 3 条 | 一个租户的 MCP 服务端读到另一个租户的秘密 |
| P-14 | 投影只做三样最小规范化，不改变参数 schema 收哪些值；做过的条目标 `normalized: true`；原件与替换件改写一字不差 | 不变量 | 主线裁定 2026-09-24 · [PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) 同形 | [S-17](#s-17-projectactions)（纯函数） | 一次调用的参数按规范化后的定义判过、对端却拒收（或反过来）；替换件的 `input` 与原件不同；说明是占位却标 `normalized: false` |

### 进展性质（全部带前提）

| # | 性质 | 前提 | 前提失效时 |
|---|---|---|---|
| P-9 | 凭据改值、清值或失效之后，**下一次执行尝试开始时**的列举按新值进行，可用 ↔ 不可用随之反映 | 下一次尝试会发生；据点读得到新配值（[PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)）；会话资产注册表在那次尝试开始时以此刻的持有与配值求值、得出新的 `endpointHolding`（`capability.asset-registry/v1#S-24` ②④，K30） | 没有下一次尝试就没有生效点（设计如此）；据点离线时生效推迟到再读到新值 |
| P-10 | 经 OAuth 取得的凭据在无人参与下续期；**授权服务器明确拒绝**即转为失效 | 授权服务器可达且允许续期 | 暂时够不着：凭据用不了、绑定不作废、按间隔重试（[S-24](#s-24-续期清值与作废) 第 2 条） |
| P-11 | 对端增删动作之后，**下一次执行尝试开始时**交出的清单反映它 | 对端可达；下一次尝试会发生 | 连不上：交出旧副本，会话资产注册表照它装替换件——多出来的替换件要等再连上才消失（PF-006 §6.13 已接受的代价） |
| P-12 | 连接收口后，它拉起的进程及其后代在 `stdioTerminateGrace` 之后都不在 | 据点进程自身在运行、有权终止自己拉起的进程 | 据点进程被强杀：孤儿归重启后的回收（[S-28](#s-28-据点停机与重启)） |
| P-13 | 一个 `pending` 绑定在 `oauthPendingTtl` 之后不再能完成 | 时间推进；读时判定用同一时间源 | — |

---

## 八、装配给与协议给

### S-30 装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。
**本表只列跨部署形态会变的保证**；右列写分布式后必须由协议重新兑现什么、做不到会怎样。**这张表是契约的一部分，不是流程笔记。**

| 保证 | 单机由谁给（装配给） | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| 连接不跨租户、按五元组区分（P-1） | 据点进程里桥自己的连接表 | 一条连接只归一个节点；按键路由到那个节点；不在节点之间共享连接或凭据 | 两个租户身份共用了一条连接，**串号** |
| 副本单调整份替换（P-5） | 同一存储上的条件写 | 每个键上的写入串行化，或以「`fetchedAt` 更晚才写」的条件写兑现 | 一份更旧的清单盖掉新的 |
| 凭据引用按持有解引用（P-1、P-4） | 据点进程里装配给的保管方就地判定（D-040 S19-f） | 引用跨节点传递时**不得变成持票即可用的令牌**；每个解引用处按持有重判（`data.identity-values/v1#S-30`） | 一个抄走的引用在别处换出了凭据 |
| OAuth 绑定与令牌在据点一侧 | 据点本地存储；绑定与保管方记录同一提交 | **同一份持有的凭据只有一个续期者**；多个据点（同一租户换机器、将来的远端节点）之间要有协议决定谁持有、谁续期 | 两处各自续期，刷新令牌被轮换坏，**两边一起失效**；本版下另一台机器解引用不到——凭据跟机器（[S-8](#s-8-oauth-绑定状态与迁移)、[G-17](#十已知缺口)） |
| 已发出不重放（P-6） | 同一进程里的连接对象知道哪些请求已写出 | 跨节点重试也不重放；**连接所在节点失联 = 这些调用失败** | 外部效果做两遍 |
| 桥换代时在途调用各自落「失败 · 异常中断」、不迁移不重发（[S-27](#s-27-桥被替换或卸载)） | **桥何时被替换或卸载由装配决定**（同一据点进程里的一次撤下）；旧的一份在收口前给每次在途调用交出 `bridgeWithdrawn` | 桥与发起调用的执行不在同一节点时：旧桥的结局要**送达**执行所在的节点；**旧桥所在节点失联，等同它已撤下**——执行一方要能自己判出这个结局，不无限等 | 调用挂在一份已不存在的桥上，那次执行**永远不收场**；或被转交给新桥**重发**，外部效果做两遍 |
| 中断送得到对端 | 同一进程里直接发取消通知 | 中断请求要送到连接所在的节点 | 被中断的调用在对端照跑、结果被丢弃 |
| stdio 服务端在据点机上 | D-037 本版取值 | 「可换落点」是将来的拓展点；换了之后终止、孤儿与环境过滤的保证随落点变，**须出新版** | 终止不到别处拉起的进程 |

---

## 九、规范表达与验证义务

### S-31 本版选用哪些形式工件

**不建 `formal/`**（起草时主线判为不触发）。理由，逐条对到可能的建模对象：

- **OAuth 绑定的四种迁移**是一张三状态的表（[S-8](#s-8-oauth-绑定状态与迁移)），唯一的并发点是「新的一次发起作废旧的 `pending`」与「旧的完成」交错——由「同一份持有上至多一个 `pending`、完成时现读状态」在一次提交里兑现，与组织治理契约里已建模检查过的「同一对象写入序列化」同形；
- **副本的单调写**是一次条件写，没有多步协议；
- **连接收口**是一个进程内的三步次序，它的性质（进程与后代都不在）要靠真实进程观察，模型检查给不出比规范场景更强的证据。

**这不是把义务省掉**：它们被改写成[验证入口](../verification.md#证据义务)的规范场景与静态检查；**任一条若在评审中被判为需要模型**（例如多据点续期协议立项时），届时建 TLA+ 并登记 formal task。

### 规范场景

#### S-32 连不上时照上一份清单装替换件

租户 `(T1, a1)` 的 `mcp:github` 副本是一份两个动作的 `fetched`；这一次尝试开始时 stdio 程序拉不起来：
[S-16](#s-16-refreshactions) 以 `endpointUnreachable` 结束、**连同那份两个动作的副本一起交出**；会话资产注册表照它装两个替换件，说明「接入点连不上」；副本**原样不动**。
**反例**：刷新失败时副本被写成 `tools: []`——下一次再连不上，agent 面前这个接入点什么都没有；或刷新失败时交出旧副本当作成功——agent 调到一个其实连不上的条目。

#### S-33 从没连上过的接入点没有条目

副本是 `not_fetched`，这一次又连不上：[S-17](#s-17-projectactions) 交出空的 `entries`，**并标明那是 `not_fetched`**。
**反例**：实现把它当成「对端没有动作」写成 `fetched`、`tools: []`——此后再连不上时，它会被当成一份真的空清单。

#### S-34 仓库的同名接入点拿不到租户的凭据

租户在租户格给 `mcp:linear` 配了凭据；挂上的工作区提供一份同名 `mcp:linear`，连接目标是 `https://collector.example/mcp`。
求值交来的 `provenance.connectionTarget` 是工作区格、`provenance.credential` 是租户格：**不出示，`credentialUnavailable`**（[S-9](#s-9-凭据的出示与取用) 第 3 条），这一次尝试里这个接入点的动作不可用。
**反例**：只按「凭据配在这个租户的持有上」判定、放行出示——租户的凭据被送到仓库指定的地址。

#### S-35 调用途中断线不重发

一次 `invoke` 已经写出请求，连接随即断开：这次调用以 `endpointUnreachable`、「已发出」结束；桥重新建连之后**不再发这次请求**。
**反例**：实现在重连后自动重发挂起的请求——对端建了两个 issue。

#### S-36 续期不打扰任何人

`mcp:linear` 的凭据到期：桥向授权服务器续上，**没有一张卡片、没有一次「设置被改」**，持有上的配值与绑定的 `since` 都没变。
授权服务器改为拒绝续期：绑定转为 `revoked`，下一次尝试这个接入点的动作不可用、查得到原因。
**反例**：续期被实现成「写一条新配值」——设置页上出现一次没有人做过的改值。

#### S-37 OAuth 取到的引用配不上就作废

`completeOAuth` 成功交回 `cred_91c2`，配值入口去写配值时治理中心不可达、写入失败；过了 `unassignedCredentialRetention`：保管方丢弃那份凭据，绑定转为 `revoked`。
**反例**：那份凭据一直留在据点上，任何一次偶然的配值写入都能把它启用。

#### S-38 桥换代时在途调用落异常中断

`mcp:github.create_issue` 的一次 `invoke` 已经发出、还没回来；装配把桥换成另一版：旧桥给这次调用交出 `bridgeWithdrawn`（已发出），再按 [S-26](#s-26-连接的收口次序) 收口；
这次执行的收场是 `failed`、原因码 `abnormal_interruption`；接替的桥从零建连，**不再发这次请求**。同一时刻一个本地工具的执行被撤下实现，照常跑完——两者不同是本契约有意的（[S-27](#s-27-桥被替换或卸载) 第 3 条）。
**反例**：接替的桥接手旧连接上挂起的请求、把应答交回——实现要求连接跨桥迁移；或在新连接上重发——对端建了两个 issue；或旧桥什么也不交就收口——那次执行永远停在「执行中」。

---

## 十、已知缺口

| # | 缺口 | 影响 | owner |
|---|---|---|---|
| **G-1** | **已闭合（2026-09-24 整批对齐）**：副本、凭据、OAuth 绑定按持有存放，[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-a 采纳 | — | — |
| **G-2** | **已闭合（2026-09-24 整批对齐）**：工作区提供的 stdio 接入点在求值第一步被禁用（[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-c；[S-6](#s-6-连接归桥不上签名不跨租户) 第 3 条）；租户层怎样显式启用它归 `capability.asset-evaluation` 的 G-19 | — | — |
| **G-3** | **已闭合（2026-09-24 整批对齐）**：两端模态由本契约投影、结果端投不出即「任意」（[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-e；[S-17](#s-17-projectactions)、`data.tool-definition/v1#S-24` 第 3 条） | — | — |
| **G-4** | **非图片、非音频的内嵌二进制资源无处存放**：附件存储未定义 | 这类资源本版只留一行说明，没有带回（[S-20](#s-20-对端结果怎样成为-toolresult)） | **PF-006 的 owner**（存储）；`data.content-blocks` 的 G-1 同一件事 |
| **G-5** | **elicitation**：工具等待态与决策卡片的契约未就位，本版不向对端声明 | 需要中途问人的 MCP 服务端用不了那一段 | **工具执行运行时与 PF-008 的契约**；就位后本契约出新版 |
| **G-6** | **SDK 与协议的来源核对**：官方 SDK 精确钉版未定（研究已核 1.29.0／1.30.0 最新协议 2025-11-25、v2 是新包名）；任务式动作能否在列举结果里识别、SDK 的鉴权提供者与自定义传输能力**未取证** | [S-17](#s-17-projectactions) 的「只能以替换件出现」第 1 种原因（执行方式）可能识别不出；OAuth 一格的实现路径未定 | **提供者设计**（basis 条目：每项给 probe） |
| **G-7** | **再收窄——接口已定，三项本版不收**（2026-09-25 修订波，[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）：保管方对本契约交出的面已由窄口接口契约 `capability.credential-custodian` v1 给出——收下 OAuth 凭据并发引用（S-16）、按持有交出（S-17）、丢弃未被配上的与被撤下的（S-18 清扫三种）。**本版不收**（那份契约 G-2～G-4，与桥节点 C-4～C-6 同口径，[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩）：**静态凭据按持有交出**（C-4：静态凭据的引用一律 `notResolvable`，要静态凭据的接入点以 `credentialUnavailable` 连不上）；**续期写回**（C-5：令牌到期续不上，[S-24](#s-24-续期清值与作废) 第 1 条本版兑现不了，人要重新取）；**静态凭据本体里的名字**（C-6：哪个环境变量、哪个请求头的形状） | [S-9](#s-9-凭据的出示与取用) 第 2、4 条的静态凭据一支；[S-24](#s-24-续期清值与作废) 第 1 条 | 主线 → `infra/secrets` 那一程（保管方的真承接者）；出示名的形状归本契约新版本 |
| **G-8** | **已闭合（2026-09-24 整批对齐）**：OAuth 取得的凭据跟机器（[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-g；[S-8](#s-8-oauth-绑定状态与迁移)）；它与「一份持有一个凭据值」合起来的后果另记 G-17 | — | — |
| **G-9** | **已闭合（2026-09-24 整批对齐）**：`provenance` 由 `capability.asset-evaluation/v1#S-40` 交出（[D-040 §S19](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) S19-f） | — | — |
| **G-10** | **条目名撞名与供应商呈现**：同 `data.mcp-endpoint/v1` 的 G-2 | 同那边 | **会话资产注册表**；**模型请求运行时的传输适配** |
| **G-11** | **从没连上过的接入点没有条目**：副本是 `not_fetched` 又连不上时没有形状可装替换件 | agent 面前这个接入点「什么都没有」，它不知道有过这回事 | **PF-006 / PF-002 的 owner**（产品面：接入时是否必须先连通一次；PF-006 decisions 已记「记下不填」） |
| **G-12** | **具名参数的取值未定**：`stdioEnvAllowlist`、`maxListPages`、`oauthPendingTtl`、`unassignedCredentialRetention`、`stdioTerminateGrace`、`stderrBound`，以及续期重试的间隔 | 部署前必须给值；**本契约不填** | **主线／提供者设计**（部署配置，配错即启动失败） |
| **G-13** | **已关闭（PF-002 rev 18，主线 2026-09-24 落）**：组织那一层不持有 MCP 凭据；[S-9](#s-9-凭据的出示与取用) 第 2 条只按租户格解引用，[S-22](#s-22-beginoauth) ③ 对组织格给 `oauthNotApplicable` | — | — |
| **G-14** | **已闭合（修复波 1b）**：按尝试重算在产品正文（PF-002 rev 17）；S19-a～g、PB-4 在 D-040 §S19、§块 B；K30、K34 在 §五；其余五条——`ConnectionHandle` 不上签名、`invoke` 按持有寻址、连接的收口次序是义务、OAuth 落点在据点一侧、由桥做最小规范化（原 G-18 的裁定）——已登进 [D-040 §六 N-10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)，设计依据与 S-8 已回链 | — | — | — |
| **G-15** | **被排除与只能以替换件出现的动作要不要告诉 agent**：本契约交出了它们，告不告诉、怎样告诉归会话资产注册表 | agent 不知道对端还有一个它看不见的动作 | **会话资产注册表**（D-040 S22-d：可用性变化不出提醒；被排除的动作是否另告 agent 仍未定，同 `capability.asset-registry` 的 G-13） |
| **G-16** | **已闭合（2026-09-24 整批对齐）**：`data.content-blocks/v1#S-18` 那一行已加桥换代的来路；`capability.tool-execution-runtime/v1` 已为 MCP 条目开例外（它的 S-37） | — | — |
| **G-17** | **OAuth 凭据跟机器，而一份持有上的 `credential` 只有一个值**：同一个租户在第二台机器上再取一次、配上之后，第一台机器上那个引用不再被配着，它的绑定按 [S-8](#s-8-oauth-绑定状态与迁移) 作废——**同一时刻只有一台机器连得上这个接入点** | 一个人在两台机器上交替用同一个要 OAuth 的接入点，每换一次机器取一次 | **PF-016 / PF-002 的 owner**（产品面：接受这个后果，还是凭据值按机器区分——后者改 `data.asset-model` 的配值形状） |
| **G-18** | **已关闭（主线裁定 2026-09-24）**：由桥做最小规范化——缺说明补占位「对端未提供说明」并标 `normalized: true`、剥 `$schema`／`title`、`{"type": "object"}` 视为无参数，仍不合的才排除；替换件同形与「不替对端编说明」怎样成立写在 [S-17](#s-17-projectactions)。产品侧 [PF-006 decisions §四](../../../../product/PF-006-tools-and-skills/decisions.md#四已知的来源问题)那一行仍记「交产品负责人」 | — | — |

**它们都不是默认值**：消费者碰上时停在缺口，不挑一个看起来合理的答案。

## 十一、消费者核对

#### CS-1 会话资产注册表在尝试开始时装一个接入点

对会话要装的 `mcp:github`：调 [S-16](#s-16-refreshactions)。成功 ⇒ 拿到新副本，调 [S-17](#s-17-projectactions) 得条目，钉在这次尝试上；
`endpointUnreachable` 等判定类失败 ⇒ 拿到随失败交出的旧副本，照它投影、全部装替换件（说明写失败值对应的原因）；
`dependencyUnavailable` ⇒ 没有副本可用，**这是会话资产注册表自己的「判不出来」**，按它的契约收。**本场景走得通**；钉住与装替换件见 `capability.asset-registry/v1#S-12`。

#### CS-2 工具执行运行时执行一次 MCP 调用

放行之后，运行时以会话资产注册表为这次尝试钉住的那份接入点持有（报告的 `endpointHoldings`，`capability.asset-registry/v1#S-11`；K30）与条目的 `origin.remoteName` 调 [S-19](#s-19-invoke)，交出中断请求与发帧原语；
拿到应答 ⇒ 按 [S-21](#s-21-失败值与收场的对应) 判收场；拿到失败值 ⇒ `failed`，并据「已发出」记账。人按下中断 ⇒ 运行时落「被中断」，桥发取消通知、不再交回东西。**本场景走得通。**

#### CS-3 交付面替一个人经 OAuth 取凭据

人在租户层 `mcp:linear` 的设置处点「取凭据」：交付面调 [S-22](#s-22-beginoauth)，把同意地址给人；人同意后，交付面接住应答调 [S-23](#s-23-completeoauth)，拿到 `cred_91c2`，
再以这个人的身份经资产治理写面把它写成那份持有的 `credential`。**本场景走得通到最后一步**；最后一步是 `capability.asset-governance` v1 的 `assign`，那一次写的资格判定归它。

#### CS-4 放行判断需要知道本契约做什么

放行判断**不需要**调本契约的任何操作：逐动作执行权限是会话资产注册表钉住动作集之后再求一次值、钉进这次尝试报告的那一项（`capability.asset-registry/v1#S-11` 的 `effectivePermissions`，K30；以动作条目的模型面名字 `ModelToolName` 为键，调用块的 `tool` 原样去查，[D-040 §七 M8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。放行判断那一侧对一个 MCP 调用会遇到这几种情形，收场归它与 runner，本契约只指路：

- 报告里那一项是一个值 ⇒ 照常判；
- 报告里那一项是 **`unavailable`**（第二次求值拿不到）⇒ 放行判断同批全拒，不补档；
- 报告里**查不到**那个名字——接入点在这次尝试没有生效的持有（被移除、被禁用、这个租户用不了），它就没有钉住的动作条目（`capability.asset-registry/v1#S-12` 末行），或钉住的动作集里没有这个动作 ⇒ 那个调用**不进放行判断**，那一次经过记 `observed{reason: no_such_entry}`，执行运行时收场 `unavailable{no_such_entry}`（[D-040 §七 M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；`capability.loop-extension-runner/v1#S-29` 第 5 条、`capability.tool-execution-runtime` v1 的 S-23 ④），同批别的调用照常判；
- **`not_in_composition` 对 MCP 动作不会出现**：它只指「条目仍在快照、能力标识不在此刻组合里」，而没有生效持有的接入点根本没有动作条目（同上）。

它需要知道的只有一句——**到达 [S-19](#s-19-invoke) 的调用本契约不再判一次**（[S-14](#s-14-桥不做放行判断)），所以放行必须在调用之前完成。

## 十二、版本差异与规范工件

**首版。**没有被取代的旧版本；`design_legacy/` 不作输入。规范工件恰两份：`contract.md`、`examples.md`。
**本契约不发布 Schema**：操作的输入与返回用散文写清含义，值类型引用 `data.mcp-endpoint`、`data.tool-definition`、`data.content-blocks`、`data.asset-model` 的 Schema；
一旦某份组合契约把这些操作投影到进程之外，线上成员名由那一份命名（[spec 入口](../../../README.md#准入门槛与停止条件)）。
执行结果、覆盖状态与变化的影响在[验证入口](../verification.md)，不写进本目录。
