# MCP 客户端复用：现在该信什么

- 调查对象与日期：DSH `c291e7961a515f6d7af9304e7fd1d257929aef26` 的 `packages/mcp/mcp-client`（`0.1.5-rc.2`）；
  Codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f` 的 `codex-rs/rmcp-client` 与 `core/src` 会话层；
  Codex 文档离线副本 2026-09-20。2026-09-23 取证。
- 消费者：本程 proposal「MCP 客户端采用」（待出现）。
- 最近核对：2026-09-23 / 上述两个 commit。
- 当前结论：DSH 的**连接监督与协议调用**这一层（连接、重连、列举、调用、超时、取消）形状可用，
  但包的另一半——**把每个 MCP 动作登记成一个独立工具、把失败抛成错误、把图片落进 DSH 附件库**——
  直接压在 DSH 的工具管线上，而产品在身份、授权粒度、可用性时点、不可用收场、宿主与租户五处与它不同向。
  Codex 在「运行时挂会话」「每步按脏标记重投影」「OAuth 与进程组」上是更贴近的形状参照，
  但它的授权粒度比产品更细，且连接管理层不在本轮归档里。**两源都没有租户维度。**

## 问题与区分条件

六个问题：两源对象模型逐条对产品要求；MCP 动作怎么变成工具条目；resources / prompts / sampling / 通知；
凭据的存与注入；复用 DSH 包会连带什么；短板与代价。

区分条件是：**一个产品要求能否在不改动该客户端对外行为的前提下成立**（可承载）；
要改它的行为但不必推翻它的对象划分（需改）；它的对象划分本身与要求相抵（不可承载）；
它根本没有这个维度（未覆盖）。判为「不可承载」的每一格都写明是哪个结构事实挡住的。

## 证据入口

[evidence.md](evidence.md) 按来源分 E-1～E-16；产品条款是对照输入，列在 evidence.md 末尾「对照输入」。
逐行论证在 [2026-09-23 报告](reports/2026-09-23-mcp-client-reuse.md)。

## 产品条款 × 两源对照

「可承载 / 需改 / 不可承载 / 未覆盖」的判据见上节。Codex 一列标「推断」的，依据是调用面与配置文档，
`codex_mcp` 源码未见。

| # | 产品条款 | DSH mcp-client | Codex rmcp-client + 会话层 |
|---|---|---|---|
| 1 | 接入点 name 是身份，连接参数不是（[PF-002 §4 MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#mcp)（rev 10）） | **可承载**：`serverName` 是本地配置，不取对端 `serverInfo.name`（E-2、E-6） | **可承载**：配置键 `mcp_servers.<id>`；但托管允许列表要求 **name 与 command/url 同时匹配**，连接目标进入准入判断（E-16） |
| 2 | 动作不是资产、随接入点被持有（同上） | **需改**：每个动作以 `mcp__<server>__<tool>` 登记为独立 `ToolDefinition`（E-4） | **需改**：每个动作一个 `ToolSpec`，可逐动作启停（E-13、E-16） |
| 3 | 设置：连接目标、超时等，走层级求值（同上；[PF-002 §5.2](../../design/product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)） | **需改**：静态插件配置，每实例一份，无平台/组织/租户层（E-2） | **需改**：有 user/project/managed 配置层，不是平台/组织/租户（E-16） |
| 4 | 权限：能不能用（同上） | **未覆盖**：没有启停项，只能装载/卸载插件实例（E-2） | **可承载**（形状）：`enabled` + 托管允许列表（E-16） |
| 5 | 执行权限三档，MCP 动作走接入点那一份（[PF-007 §5.6](../../design/product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)（rev 16）） | **未覆盖**：包内无审批；审批在 DSH 通用 ToolGuard，按工具名匹配，可细到单个动作（E-6、E-8） | **需改**：`auto/prompt/writes/approve` 四档，且有逐动作 `tools.<tool>.approval_mode` 覆盖（E-14） |
| 6 | 对端漂移不是故障（PF-002 §4 MCP） | **可承载**（部分）：`tools/list_changed` 触发整代原子替换；拉取失败保留上一代（E-3、E-4） | **未覆盖**（rmcp-client 层）：`on_tool_list_changed` 只写日志；目录刷新由会话脏标记驱动（E-12、E-15，推断） |
| 7 | 可用性每次 run 开始前重算（[PF-006 §6.2](../../design/product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算)（rev 14）） | **未覆盖**：包内没有 run 的概念，列举只在连接时与推送时发生（E-3） | **可承载**（形状）：每一步前 `mcp_runtime_for_step` 按脏标记重投影，调用前 `refresh_mcp_if_dirty`（E-12） |
| 8 | 不可用装同名替换件，不是不装（[PF-006 §6.3](../../design/product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)） | **不可承载**（首连失败时）：从未连上就没有任何动作形状可以「同形」；**需改**（断连时）：断连期间留上一代、调用失败，预算耗尽后撤销注册即「不装」（E-3、E-6） | **需改**：调用时找不到返回「not available to the model」普通结果；服务没起来时其动作是否在目录里未见源码（E-14，推断） |
| 9 | 六种收场、只有一种是失败（[PF-006 §5.5](../../design/product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)） | **需改**：MCP `isError` 与断连都抛错→「失败」；没有「不可用」收场（E-4） | **需改**：鉴权失效转成 `isError` 结果；「不可用」有文本无分类（E-9、E-14） |
| 10 | 依赖声明（外部服务）与解析（[PF-006 §6.4](../../design/product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)） | **未覆盖** | **需改**：技能可声明 MCP 依赖，缺了**提示安装**而非判不可用；`required` 服务起不来整个会话失败（E-12、E-13、E-16） |
| 11 | 工具执行绑 session（[PF-006 §6.5](../../design/product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)） | **需改**：连接归 Cordis 插件作用域（全局或 Agent）；ACP 路径下归 Agent，即 agent runtime（E-2、E-7） | **可承载**（形状）：MCP 运行时是会话服务（E-12） |
| 12 | 宿主换手、停机不重来（[PF-006 §6.12](../../design/product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)） | **需改**：重连不重放调用（合）；但连接宿主是 Agent 作用域，已转后台、宿主为会话的执行会随 agent 卸载失去连接（E-3、E-7） | **可承载**（部分）：只在 HTTP 会话过期 404 时重建并重发；瞬态重试只限 `tools/list`（E-9） |
| 13 | 两端模态（[PF-006 §6.11](../../design/product/PF-006-tools-and-skills/design.md#611-工具两端各要什么模态)） | **需改**：结果端图片只在模型声明图像输入时入库，否则转诊断文本——判断写在桥里，不走依赖声明（E-4） | **未覆盖**（本轮未核） |
| 14 | 落点不可用即拒绝（[PF-005 §6.9](../../design/product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)（rev 5）） | **未覆盖**：stdio 子进程由 SDK 在宿主机直接拉起（E-5） | **需改**（形状）：`experimental_environment = local \| remote`，stdio 可交远端执行器（E-11、E-16） |
| 15 | 动作空间只由构成决定（[PF-004 I-4](../../design/product/PF-004-agent-definition-and-assembly/design.md#61-不变式)（rev 9）） | **需改**：逐动作登记下，对端增删动作直接改变 agent 面前的条目集合（E-4） | **需改**：同左（E-13） |
| 16 | 租户隔离（[系统目标与全局约束](../../design/foundation/README.md)） | **需改**：全局装载的实例被所有 agent 共用一条连接一份凭据；只有 Agent 作用域能分开（E-2、E-7） | **未覆盖**：凭据键是「服务名 + URL」，存本机钥匙串或 `CODEX_HOME`（E-10） |

## 当前结论

### 整包直接复用 DSH mcp-client 会连带六个 DSH 包与 DSH 的工具契约，而工具协议按 SYS-KERNEL 归本项目自定

`package.json` 的 `peerDependencies` 列了六个 DSH 包 `dsh-attachment`、`dsh-llm`、`dsh-scope`、`dsh-subprocess`、
`dsh-timeout`、`dsh-tools`，外加 `cordis`；`dependencies` 里还有 vendored 的 `schemastery`（配置 schema）；
`tools.ts` 另以纯类型引用了清单里**没有声明**的 `dsh-util-values`。源码层面的耦合比清单更深：`tools.ts` 产出的是 `dsh-tools` 的
`ToolDefinition`（含 `finalizeContent`、`output.render` 这些 DSH 管线专有钩子），读 `exec.agent?.session`
取模型路由，调 `ctx.get('llm').resolveModelInfo` 与 `ctx.get('attachments').saveImages`。
**只和官方 SDK 打交道的部分**是 `connection.ts` 的连接代际与重连、`tools.ts` 里 `listToolsUncached` /
`callToolUncached` 两个函数、`transport.ts` 的两个传输构造——这部分只依赖 `cordis` 的 `ctx.logger`、
`dsh-timeout` 的一个常量与 `dsh-subprocess` 的环境过滤函数。

而 [SYS-KERNEL](../../design/foundation/cross-system-constraints/requirements.md#sys-kernel) 写明
「工具协议……由本项目自行定义和实现」，复用的只有 Cordis 与 DSH `agent` 原语。

- 适用范围：`dsh-mcp-client@0.1.5-rc.2`（DSH `c291e796`）。不推广到 DSH 其他版本。
- 代价与不适用：整包复用等于把 `dsh-tools` 的工具定义形状（`output` 必填、`finalizeContent`、
  `presentCall`）引进来当工具契约；只取协议层则 `tools.ts`（569 行）的登记、结果投影与图片入库要按本项目的
  工具管线重写，`connection.ts`（351 行）与 `transport.ts`（50 行）可基本保留。
  DSH 的决策记录自己说「没有可预见的第二个 MCP 客户端实现，不预先拆包」，所以包内**没有**现成的
  「协议层 / 桥接层」分界可切。
- 撞上这条事实会怎样：整包引入后再按本项目工具契约改，会在 fork 里形成一份与上游 `dsh-tools` 同名不同义的类型，
  上游每次改 `ToolDefinition` 都要人工合并。
- 来源：E-1、E-4、E-8；[报告 §5](reports/2026-09-23-mcp-client-reuse.md#五与-dsh-工具管线的耦合)。
- 最近核对：2026-09-23 / DSH `c291e796`。

### 两源都以本地配置的名字作为 MCP 服务身份，不采用对端自报的名字

DSH 的 `serverName` 是必填本地配置，格式 `[A-Za-z0-9_-]{1,32}`，同一注册作用域内唯一，重复则后装的实例
在装载时失败；决策记录明说不取对端 `serverInfo.name`，理由是它不可信、跨部署不唯一、升级会变。
Codex 以配置表键 `mcp_servers.<id>` 为名。这与 [PF-002 §4 MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#mcp)
「接入点的 name 是身份，连接参数不是」同向。

Codex 的托管允许列表多走了一步：**name 与 identity（stdio 的 command、HTTP 的 url）必须同时匹配**，
否则禁用。也就是连接目标虽不是身份，却进了「能不能用」的判断。

- 适用范围：两源在上述 commit。
- 代价与不适用：DSH 的唯一性只在一个 Cordis 注册作用域内成立，**不同 Agent 作用域可以重名**，
  它没有平台/组织/租户层的「同名即替代」语义——产品的[同标识替代](../../design/product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)
  在它那里没有对应物。
- 来源：E-2、E-6、E-16。
- 最近核对：2026-09-23 / 两源上述 commit。

### 两源都把 MCP 的每个动作登记成一个独立的模型可见工具条目，产品没有说死 MCP 的呈现方式

DSH：列举到的每个动作变成一个 `ToolDefinition`，公开名 `mcp__<serverName>__<rawName>`（超长或含非法字符时
截断并追加 12 位 SHA-256），整代原子注册；README 自述「工具定义进入每一次请求」。
Codex：每个动作一个 `ToolSpec`，包在以服务命名空间命名的 `Namespace` 里（每个 Namespace 只放这一个函数）；
暴露方式三种——`Direct`（直接占位）、开了工具搜索时 `Deferred`（经搜索够得着）、
超出 agent 插件字节预算时 `Hidden`。

产品这一侧：[PF-002 §4 MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#mcp)
说 MCP 与 Tool 的关系跟「多命令 tool 与它的子命令」**同形**，所指是「随接入点被持有、配置与授权」；
[PF-002 §4 Tool](../../design/product/PF-002-assets-settings-and-permissions/design.md#tool) 说多命令工具
「整套命令在组装时只占一个槽位」，[PF-006 §5.3](../../design/product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)
说「多命令范式把一族动作压进一个槽位」——**但这句是对 Tool 说的，产品没有写 MCP 占几个槽位、
能否标常驻、它的动作怎样出现在 `Tools().search` 里**。把「同形」读成「一个 MCP 占一个槽位」是推断，不是正文。

- 适用范围：两源上述 commit；产品 PF-002 rev 10、PF-006 rev 14。
- 代价与不适用：逐动作登记的直接代价是**对端增删一个动作就改变 agent 面前的条目集合**，这与
  [PF-004 I-4「动作空间只由构成决定」](../../design/product/PF-004-agent-definition-and-assembly/design.md#61-不变式)
  的读法相关：若接入点整体算一个条目，对端漂移只改其内部命令集，I-4 不受影响；若逐动作算条目，
  漂移就是构成之外的原因在改动作空间。Codex 的 `Deferred` 形状与 [PF-007 `Tools()`](../../design/product/PF-007-meta-capabilities/design.md#61-tools通向任意非常驻工具)
  「不占槽位、经取用入口够得着」同构。
- 撞上这条事实会怎样：照搬逐动作登记而产品后来按「一个槽位」裁，登记层、命名、权限规则的寻址方式要一起改；
  反过来按一个槽位做而逐动作的参数格式塞进定义，预算按动作数线性涨（DSH README 的 token 自述即是）。
- 来源：E-4、E-6、E-13；[报告 §2](reports/2026-09-23-mcp-client-reuse.md#二mcp-动作怎样变成工具条目)。
- 最近核对：2026-09-23 / 两源上述 commit。

### DSH 的动作列举由连接与推送驱动，没有「run 开始前」这个时点；Codex 在每一步前按脏标记重投影

DSH：连接成功后做一次完整分页列举并登记；此后只在收到 `notifications/tools/list_changed` 或重连成功时重做。
所有同步经一条队列串行，拉取失败保留上一代。包里没有任何「run」「turn」的钩子。
Codex：会话持有一份 MCP 运行时；每一步开始前 `mcp_runtime_for_step` 先检查环境选择、鉴权、选中的能力根是否变了，
变了就标脏并在发请求前刷新；每次调用前 `prepare_mcp_call` 再 `refresh_mcp_if_dirty` 一次。
但 rmcp-client 层收到 `tools/list_changed` 只写一行日志，**不触发重列举**。

- 适用范围：两源上述 commit。Codex 目录缓存（`McpToolCatalogCache`）的失效规则在 `codex_mcp`，未见源码。
- 代价与不适用：DSH 的推送驱动意味着工具集合可以在**一次 run 进行中**被异步换掉，与
  [PF-004 I-3「同一个 Run 的各次尝试照同一份装配清单」](../../design/product/PF-004-agent-definition-and-assembly/design.md#61-不变式)
  需要对账；要得到 [PF-006 §6.2](../../design/product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算)
  的时点，包内没有任何可挂的读点——那个时点只能在包外取得。Codex 的每步重投影只由本地输入（配置、鉴权、环境）变化触发，
  **对端主动改清单它不跟**，即对端漂移要等下一次别的原因标脏才被看见（推断）。
- 来源：E-3、E-12、E-15。
- 最近核对：2026-09-23 / 两源上述 commit。

### 两源都没有「同名替换件」，DSH 在断连预算耗尽后把动作撤掉，正是 PF-006 §6.3 排除的「不装」

DSH 断连期间保留上一代登记、调用失败（README：「tools stay listed but calls fail」）；连续失败达
`maxAttempts`（默认 10）后撤销全部登记并停止重连，直到重载或重启；`reconnect.enabled: false` 时留着条目一直失败。
首次连接就失败时**一个动作都没登记**。DSH 的决策记录考虑过「断连即撤、恢复再登」并否掉，理由是每次崩溃会让
工具清单抖两次、失效两次前缀缓存。
Codex：调用时若拿不到这个服务的当前绑定，返回一条「MCP tool `server/tool` is not available to the model」
的普通结果（不是抛错）。

- 适用范围：两源上述 commit。
- 代价与不适用：[PF-006 §6.3](../../design/product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)
  要求替换件与原件**同形**（名字与调用参数一模一样）。MCP 动作的形状只能从对端列举得到，
  **从未连上过的接入点没有任何形状可以「同形」**——这一格不是改 DSH 行为能解决的，而是要一个此前列举结果的持久副本，
  两源都没有。断连期间「留着、调用失败」接近替换件的外形，但说明不换、收场是「失败」不是「不可用」。
- 撞上这条事实会怎样：直接复用 DSH 的默认策略，agent 会先经历「有、调用失败」十次左右，然后动作从清单里消失，
  即 PF-006 §6.3 表里「不知道自己少了什么」那一行。
- 来源：E-3、E-6、E-14。
- 最近核对：2026-09-23 / 两源上述 commit。

### DSH 把 MCP 的错误与断连都映射成「失败」，没有「不可用」收场；Codex 把鉴权失效折成错误结果

DSH：对端返回 `isError: true` 时执行器直接抛错，由 DSH 注册表产出一个 `isError` 结果；断连时 SDK 抛
「Not connected」，同样是失败；超时由 SDK 的请求 `timeout` 抛出；取消经 `exec.signal` 传给 SDK。
需要「任务式执行」扩展的 MCP 工具在调用时抛错。
Codex：鉴权需要时返回带 `mcp/www_authenticate` 元数据的 `isError` 结果，提示重连，**不重放**被拒的调用。

- 适用范围：两源上述 commit。
- 代价与不适用：[PF-006 §5.5](../../design/product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)
  的「不可用」与「失败」对 agent 的下一步相反（绕路 vs 重试）。两源都没有把「接入点当下不可达」和
  「对端说这次调用失败了」分开交给 agent；产品要求的六种收场，两源的现有映射都给不出其中的「不可用」。
- 来源：E-4、E-9、E-14。
- 最近核对：2026-09-23 / 两源上述 commit。

### 两源的授权粒度都比产品细：动作可被单独授权或单独启停

产品：[PF-007 §5.6](../../design/product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)（rev 16）
写明 MCP 带进来的动作「随接入点一起被授权，所以走的是接入点那一份执行权限」，三档「问一下 / 自动 / 禁止」。
DSH：包内不做审批；它的公开名设计明说是为了让权限规则能写成 `mcp__*`、`mcp__github__*`，
也就能写到单个动作。Codex：`default_tools_approval_mode` 是服务级，`tools.<tool>.approval_mode`
是**逐动作覆盖**；另有 `enabled_tools` / `disabled_tools` 逐动作允许/拒绝列表；取值四档
`auto | prompt | writes | approve`，其中 `writes` 依赖对端自报的只读/破坏性注解。

- 适用范围：两源上述 commit 与 Codex 文档 2026-09-20 副本。
- 代价与不适用：照搬 Codex 的逐动作覆盖，会让「动作不是资产」在权限面失守——一个不是资产的东西拥有了自己的权限项；
  照搬 DSH 的名字模式，同样能写出逐动作规则。`writes` 这一档把判断交给对端自报的注解，而产品说对端
  「不由本系统掌握」。**产品有没有逐动作启停（允许列表）这一层，正文没有说**——只说了执行权限走接入点。
- 来源：E-6、E-14、E-16。
- 最近核对：2026-09-23 / 两源上述 commit。

### DSH 的连接宿主是 Cordis 插件作用域，Codex 的是会话，两者都不是租户

DSH：一个插件实例一条连接；在 `cordis.yml` 里全局装载时，**所有 agent、所有会话共用这一条连接和它的 env/headers**；
ACP 路径下按会话新建一个 Agent，并在该 Agent 作用域里逐个装载会话声明的 MCP 客户端——连接随 Agent 卸载而关闭。
Codex：会话（thread）持有 MCP 运行时，`shutdown` 终止它拥有的 stdio 进程。

- 适用范围：两源上述 commit。
- 代价与不适用：[PF-006 §6.5](../../design/product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)
  与 [§6.12](../../design/product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)
  说已转后台的工具执行宿主是会话。DSH 在 ACP 路径下连接挂在 Agent（即 agent runtime）上，
  **执行的宿主比它所依赖的连接活得长**；DSH 的 MCP 工具本身也不声明后台。
  产品没有定义 **MCP 服务端连接（及 stdio 子进程）本身的宿主**——它不是一次工具执行。
  租户维度两源都没有：DSH 全局实例跨租户共享一份凭据，Codex 的凭据归本机用户。
- 来源：E-2、E-7、E-9、E-12。
- 最近核对：2026-09-23 / 两源上述 commit。

### DSH 只桥接 tools；Codex 另有 resources 与 elicitation；两源都没有 prompts 与 sampling 的消费路径

DSH：README 与决策记录都写明 resources、prompts 延后；连接时客户端能力声明为空对象，即不声明
sampling、elicitation、roots；只监听 `tools/list_changed`。结果里的 `resource_link` 转成一行文本，
内嵌 `resource` 与音频转诊断文本。
Codex：rmcp-client 有 `list_resources` / `list_resource_templates` / `read_resource`，会话层暴露成三个内建工具
`list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`；支持 MCP elicitation 与若干 OpenAI 扩展表单，
转给审批/提问界面；2026-07-28 协议模式下的多轮工具输入（MRTR）会解析 `CreateMessage`（即 sampling）与
`ListRoots` 请求，但在可见代码里没有找到处理 sampling 的实现；`prompts` 在 rmcp-client 里只有
`on_prompt_list_changed` 写日志。

- 适用范围：两源上述 commit。rmcp 默认 `ClientHandler` 对未处理请求的回应不在归档里，未核。
- 代价与不适用：产品只讲「动作」。Codex 把 resources 做成**跨所有服务的三个通用工具**——这等于在接入点之外
  另立了与具体接入点无关的动作条目，与「动作随接入点被持有与授权」如何对上，产品没有说。
  elicitation 是对端在一次调用**中途**向人要输入，与 [PF-006 等待态](../../design/product/PF-006-tools-and-skills/design.md#等待态)
  和 PF-008 的人机交互相邻，两源的映射方式都不能直接搬。sampling 意味着对端借本系统的模型发请求，
  要走 OpenRouter 与[模型凭据](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)，两源都没做。
- 来源：E-5、E-6、E-13、E-15。
- 最近核对：2026-09-23 / 两源上述 commit。

### 两源都把 MCP 凭据当作接入点的连接参数，归属都不到租户，本项目也还没有它的名字

DSH：stdio 的凭据走 `env`，HTTP 的走静态 `headers`，示例在 `cordis.yml` 里用 `!!js process.env.X` 在装载时插值；
子进程环境从宿主环境起步，**先滤掉名字匹配 `KEY|PASSWORD|SECRET|TOKEN` 的变量**，再合并配置的 `env`。
没有 OAuth（包内无 `auth`/`authProvider`）。
Codex：`bearer_token_env_var`、`env_http_headers`、`http_headers_helper`（本地命令打印头）；OAuth 登录后令牌存
OS 钥匙串（服务名「Codex MCP Credentials」），钥匙串不可用时退到 `CODEX_HOME/.credentials.json`，
存储键由服务名与 URL 等算出；`mcp_oauth_credentials_store = auto | file | keyring`；
stdio 的 `env_vars` 是环境变量白名单。

- 适用范围：两源上述 commit。
- 代价与不适用：本项目统一语言里「裸写『凭据』不作数」
  （[UL-model-credential 别混 ②](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)），
  已有账号的登录凭据、模型凭据、连接件的接入凭据三种；**MCP 接入点连对端用的那份凭据还没有名字**。
  [PF-002 §4 MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#mcp) 的「自带属性」
  只列连接目标与超时，凭据是接入点的**设置**、还是像模型凭据那样挂在**范围**上，正文没有定；
  两源的做法（连接参数里的一个字段）对应前者，而模型凭据的先例是后者。本轮只报告，不取名。
- 来源：E-5、E-10、E-16。
- 最近核对：2026-09-23 / 两源上述 commit。

### DSH 只覆盖 stdio 与 Streamable HTTP，且自动重连只对 stdio 生效

DSH 的传输只有 `stdio` 与 `streamable-http` 两种（没有旧式 SSE）；重连只由传输关闭触发，stdio 子进程退出会触发，
HTTP 传输只在主动关闭时触发，所以**不可达的 HTTP 服务端不会被监督器重建**，只按单次请求失败。
连接与发现超时不可配，继承 SDK 每请求 60 秒默认。关闭一代时依赖 SDK 自带的两段 2 秒终止宽限，
再多等 1 秒看到关闭信号，否则停止重连以免两个子进程重叠。
Codex：本地 stdio 服务端放进独立进程组，关闭时先 terminate 再 kill 整组；也可交远端执行器拉起；
HTTP 有初始化与 `tools/list` 的瞬态重试（250ms、1000ms）和会话过期 404 后的重新初始化；
启动超时默认 10 秒、调用超时默认 60 秒，`required` 服务起不来会让会话启动失败。

- 适用范围：两源上述 commit。
- 代价与不适用：DSH 的 stdio 子进程由 SDK 在宿主机上直接拉起，与 [PF-005 §6.9](../../design/product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)
  的落点计算没有接口；Codex 的执行器路径是形状参照但为实验性且 HTTP 远端落点未实现。
- 来源：E-3、E-5、E-6、E-9、E-11、E-16。
- 最近核对：2026-09-23 / 两源上述 commit。

### DSH 锁定的官方 SDK 是 1.29.0，声明范围只到 ^1.12.0；Codex 已有 2026-07-28 协议模式，其 rmcp 版本本轮取不到

DSH `package.json` 声明 `"@modelcontextprotocol/sdk": "^1.12.0"`，`pnpm-lock.yaml` 在 `packages/mcp/mcp-client`
下解析为 `1.29.0`（peer `zod ^3.25 || ^4.0`）。同一 lockfile 里 `subagent-claude-code` 声明 `^1.29.0`、
`llm-pi-ai` 经 pi-ai 间接带入同一版本。DSH 决策记录自承「SDK 仍在演进，破坏性变更要改桥」，
并绕开了 SDK 的输出 schema 缓存（`client.request` 直发 `tools/list` / `tools/call`）。
Codex `rmcp` 用 `workspace = true`，版本在 workspace `Cargo.toml` / `Cargo.lock`，二者不在钉住的归档里；
它的 `McpProtocolMode` 有 `Legacy`（2025-06-18）与 `V20260728` 两档。

- 适用范围：DSH lockfile 与 Codex `rmcp-client/Cargo.toml` 在上述 commit。
- 代价与不适用：`^1.12.0` 的宽范围意味着 fork 后若不锁 lockfile，任何 1.x 小版本都会被装进来；
  DSH 绕开 SDK 的高层 `callTool` 本身就说明 SDK 行为曾与桥的契约冲突。TS SDK `1.29.0` 是否支持 2026-07-28 协议，
  钉住的源里没有答案。
- 来源：E-1、E-6、E-9。
- 最近核对：2026-09-23 / 两源上述 commit。
- 状态标记：待核实（TS SDK 1.29.0 支持的协议版本；Codex `rmcp` 版本）——钉住的归档不含 `node_modules` 与 Codex workspace 清单。

### Codex rmcp-client 只能作为形状参照：Rust 实现，且依赖十余个 codex 内部 crate

`codex-rmcp-client` 依赖 `codex-api`、`codex-config`、`codex-exec-server`、`codex-http-client`、`codex-keyring-store`、
`codex-network-proxy`、`codex-protocol`、`codex-secrets` 与若干 `codex-utils-*`，以及 `rmcp`、`keyring`、`oauth2`。
它上面还有一层 `codex_mcp`（连接管理、目录缓存、绑定），本轮归档里只有 `core` 对它的调用面。

- 适用范围：Codex `5c5308fc`。
- 代价与不适用：能借的是对象划分与生命周期规则（`Connecting → Ready → Closed` 三态、传输配方可重建、
  会话过期重新初始化、进程组终止、OAuth 刷新与持久化的时点），不能借代码；
  它的连接管理层缺席，意味着「服务起不来时目录怎么表示」这类最贴近 PF-006 §6.3 的问题，本轮对 Codex 只有推断。
- 来源：E-9、E-12。
- 最近核对：2026-09-23 / Codex `5c5308fc`。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| 「工具协议归本项目自定」在采用时仍有效（SYS-KERNEL） | 「整包直接复用……连带六个 DSH 包」的代价判断——若决定采纳 `dsh-tools` 作为工具契约，耦合就不是代价 | 已核对 SYS-KERNEL 正文；采纳与否不归本研究 |
| PF-002「同形」不被后续产品修订解释成「逐动作即条目」 | 「两源都把每个动作登记成独立条目」一条里关于 I-4 的对账 | 未核对，产品未说死 |
| Codex `codex_mcp` 对未就绪服务不把其动作放进目录 | 对照表第 8 行 Codex 一格 | 未核对，源码不在归档 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| TS SDK `1.29.0` 支持哪些 MCP 协议版本，是否有 2026-07-28 生命周期 | 读 SDK `1.29.0` 发布包 `LATEST_PROTOCOL_VERSION` / `SUPPORTED_PROTOCOL_VERSIONS` | 协议版本跟进成本；proposal 定版本范围前 | 取 SDK 发布包并记 SHA |
| Codex `codex_mcp` 对启动失败服务、`tools/list_changed` 与目录缓存失效的处理 | 取同 commit 的 `codex-rs/codex-mcp`（或对应 crate）源码 | 对照表第 6、8 行 Codex 格 | 补钉归档 |
| rmcp 默认 `ClientHandler` 对 sampling / roots 请求的回应 | 读 `rmcp` 源码的默认实现 | Q3 里「Codex 不支持 sampling」的强度 | 取 rmcp 版本与源码 |
| 产品是否要 MCP 动作级启停（允许列表） | 产品负责人裁决 | 权限面建模 | 产品侧；本研究只报告 |
| MCP 连接（及 stdio 子进程）的宿主归谁 | 产品/架构裁决 | 连接的生灭与会话、agent runtime、租户的关系 | 架构侧 |

## 采用与后续核对

尚无消费者；预期由本程 proposal「MCP 客户端采用」消费。DSH 或 Codex 换 commit、DSH 升级 SDK、
或产品 PF-002 / PF-006 / PF-007 升 rev 触及 MCP 条款时，先判断是否触及上面任何一条结论，触及则按
[演进事件词](../README.md#演进事件词) 记 changelog。
