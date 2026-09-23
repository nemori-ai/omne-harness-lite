# MCP 客户端复用：现在该信什么

- 调查对象与日期：DSH `c291e7961a515f6d7af9304e7fd1d257929aef26` 的 `packages/mcp/mcp-client`（`0.1.5-rc.2`）；
  Codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f` 的 `codex-rs/rmcp-client` 与 `core/src` 会话层；
  Codex 文档离线副本 2026-09-20。2026-09-23 取证。
- 消费者：提案 [MCP 客户端采用](../../design/record/proposals/mcp-client-adoption/README.md)（首轮、第二轮与第三轮）。
- 最近核对：2026-09-23 / 上述两个 commit（首轮）；2026-09-23 / 第二轮各源 commit 与版本（见[第二轮](#第二轮同行封装的借鉴与依赖)）；2026-09-23 / 第三轮各源 commit 与版本（见[第三轮](#第三轮stdio-拉起位置)）。
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

[evidence.md](evidence.md) 按来源分 E-1～E-16（首轮）、E-17～E-28（第二轮）与 E-29～E-41（第三轮）；产品条款是对照输入，列在 evidence.md「对照输入」。
逐行论证在 [2026-09-23 报告](reports/2026-09-23-mcp-client-reuse.md)、[第二轮报告](reports/2026-09-23-round2-wrapper-lessons.md) 与 [第三轮报告](reports/2026-09-23-round3-stdio-launch-site.md)；结论为什么变化见 [changelog](changelog.md)。

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

## 第二轮：同行封装的借鉴与依赖

- 调查对象与日期：DSH `c291e796`（补读决策记录与测试名）；pi `3390bd9`；pi 生态第三方扩展 `pi-mcp-adapter@2.37.0`；
  Codex `5c5308fc`（本地 `rmcp-client` + 远程同 commit `codex-mcp` 与 `Cargo.lock`）；LangChain Python `52a4535f`（0.3.2，已归档）与 JS `@langchain/mcp-adapters` 1.1.4（langchainjs `12626c25`）；
  OpenAI Agents Python `32edd3c3`（0.22.3）与 JS `a0b1c6fd`；Vercel `@ai-sdk/mcp` 2.0.56（`vercel/ai` `21b2d6c3`）；
  Claude Agent SDK Python `dce7cdac`（0.2.158）与 npm 0.3.280；Claude Code `2.1.280` 文档与 `CHANGELOG.md` @ `56f36532`；npm 上官方 SDK 各包的版本。2026-09-23 取证。
- 问题：产品负责人 2026-09-23 裁定走「官方 SDK 上自写薄桥」后，要求看同行**在 SDK 之上额外封装了什么**、自己记下了什么坑、带进来什么依赖。
  本节只写事实与「撞上会怎样」，对照的是[提案必要性质](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) N-1～N-11；**不写该借鉴哪一条**。
- 证据：[evidence.md](evidence.md) E-17～E-28；逐源与逐主题论证、依赖总表在[第二轮报告](reports/2026-09-23-round2-wrapper-lessons.md)。
- 最近核对：2026-09-23 / 上列各 commit 与版本。

### 同行做法 × 来源 × 撞上会怎样

列出不等于推荐。「撞上」指**不做这件事**时同行实际遇到的后果；每行的出处在报告 §三 与 E-17～E-28。

| 同行做法 | 来源 | 不做时同行撞上了什么 |
|---|---|---|
| 服务端限定名默认开，名字是（服务端, 原名）的纯函数，改字符或超长时加身份哈希 | DSH、Codex、Claude Code | 原名加可选前缀：撞名抛错或静默覆盖（OpenAI #464、LangChain #605） |
| 名字长度上限按下游提供方取 | Codex（反例） | 提到 128 后超过 Bedrock 的 64（Codex #46188） |
| 按前缀判断归属时防服务端名互为前缀 | Claude Code（反例） | 禁用 `foo` 误删 `foo__bar` 的工具 |
| 跨连接的清单缓存，键含连接配置指纹；凭据类服务端与声明不可缓存的服务端排除 | Codex、pi-mcp-adapter、Claude Code | 没连上的服务端整个消失；TTL 语义错让缓存永远失效或直接工具永不注册（pi-mcp-adapter #561、#569、#641） |
| 刷新失败保留上一份 | DSH、Claude Code | 瞬时错误清空命令与资源（Claude Code 2.1.214） |
| `list_changed` 限流或合并 | Claude Code（反例） | 紧循环通知导致持续高 CPU（2.1.271） |
| 翻页守卫：拒绝重复游标、页数与项数上限、失败不留部分结果 | DSH、Codex、OpenAI | 只取第一页静默少动作（Codex Legacy 模式）；游标成环 |
| 连接与调用超时分开，另设空闲超时与 OAuth 请求超时 | Claude Code、Codex、pi-mcp-adapter | 一个 5 秒值误伤长调用（OpenAI #1024）；OAuth 请求卡死 agent（pi-mcp-adapter #485、Codex #22072） |
| 传输关闭时统一收掉全部挂起请求，取消时清理挂起表项 | Vercel（修复后） | promise 永不结束且泄漏（Vercel #16580）；调用无限挂起（Claude Code 2.1.110） |
| 失败的替代连接不拆掉最后一条可用连接；重连单飞 | pi-mcp-adapter | 并发 close 与 connect 留下孤儿进程（pi-mcp-adapter 2.0.0） |
| 会话过期只在「带 session id 的 404 / `-32000`」时重试一次 | pi-mcp-adapter、Codex | 服务端重启后工具静默失效（LangChain #75） |
| 不自动重放已发出的调用 | DSH、Codex | 重放：非幂等工具重复副作用（Vercel 文档自述） |
| 部分失败不拖垮全部，失败者单独记录 | OpenAI、Codex、Claude Code | 一个服务端失败丢全部工具并留孤儿进程（LangChain #492、#551） |
| stdio 进程组终止、stderr 持续排空、单行上限、环境白名单 | Codex | 超时不杀子进程（Claude Code 2.1.15）；stderr 累积 64 MB（2.1.208）；非 JSON 输出挂住会话（2.1.105） |
| Windows 下解析 `npx` / `.cmd` | Codex、Vercel、pi-mcp-adapter | stdio 服务端起不来（Vercel #19157） |
| 图片进入历史前统一规范尺寸 | pi | 超大图让提供方拒绝整段对话（pi 注释） |
| 多段文本以分隔符合并 | DSH | 段间边界丢失 |
| 错误保留分类与原始码 | Codex、pi-mcp-adapter、Claude Code | 分不出可重试的传输错与参数错（LangChain JS #11300、Vercel 单一错误类） |
| 重定向限同源或拒绝；URL 派生名脱敏 | Codex、Vercel、OpenAI | 凭据进入模型可见输出（OpenAI #4016） |
| 令牌轮换写回的并发保护 | Codex（fail-closed）、pi-mcp-adapter | 并发刷新丢 refresh token（Claude Code 2.1.136、Codex #41133） |
| SDK 大版本分支关在一个模块里 | OpenAI Python、Claude Agent SDK Python | 无上界依赖在 SDK 大版本发布时导入即失败（LangChain #589） |
| 工具描述字节稳定、工具集变化增量追加 | pi-mcp-adapter、pi | 重新注册改写缓存的 prompt 前缀 |
| 以定义哈希为放行键 | pi-mcp-adapter | 定义被偷换后沿用旧放行（Vercel 文档「rug pull」） |

### pi 本体没有 MCP 客户端，只有通用的工具扩展点；pi 生态的 MCP 桥是第三方扩展

读遍 pi `3390bd9` 的 MCP 字样命中：README 写明「**No MCP.** … build an extension that adds MCP support」，`docs/usage.md` 写明不内置 MCP；
其余命中只是一个测试夹具里的包名 `npm:pi-mcp-adapter`、一个 OAuth scope 字符串、`@google/genai` 对官方 SDK 的可选 peer，以及一处注释。
**没有 MCP 客户端代码。**与 MCP 相关的只有两样：`pi.registerTool()` / `pi.setActiveTools()` 可在运行中增删激活工具（变化作为增量追加给模型）；
工具结果里的图片在进入历史前统一缩放，注释点名「MCP bridges」，理由是超大图会让提供方拒绝**整段对话**。
pi 生态实际在用的 MCP 桥是第三方 `pi-mcp-adapter`（作者 Nico Bailon），它建在官方 v2 拆分包上。

- 适用范围：pi `3390bd9`（`pi-coding-agent@0.86.1`）；`pi-mcp-adapter@2.37.0`。
- 代价与不适用：pi 的扩展点本身不给 MCP 任何语义（连接、清单、名字都由扩展自理）；pi-mcp-adapter 的做法是第三方的，不是 pi 作者的立场。
- 撞上会怎样：把「pi」当作 MCP 参照时，能借的只有图片规范化与动态工具集两处；其余 MCP 行为要看 pi-mcp-adapter。
- 来源：E-18、E-19。
- 最近核对：2026-09-23 / pi `3390bd9`、pi-mcp-adapter 2.37.0。

### 除 Vercel 外，本轮读到的封装都建在官方 SDK 上；官方 TS SDK 的 v2 换了包名，同行已分成钉 v1、上 v2、两版并接三群

建在官方 TS SDK 1.x：DSH（`^1.12.0`，锁 1.29.0）、LangChain JS（`^1.30.0`）、Claude Agent SDK TS（peer `^1.29.0`）。
上 v2 拆分包 `@modelcontextprotocol/client` / `core`：pi-mcp-adapter（精确 2.0.0）、OpenAI Agents JS（`^2`，可选依赖）；Claude Code 文档称有 v1 / v2 两套运行时，v2 带 2026-07-28 协议。
Python：LangChain 钉 `mcp<2.0.0`；OpenAI Agents 与 Claude Agent SDK 用 `<3` 同时接 1.x 与 2.x，并把版本分支关在一个兼容模块里。Codex 精确钉 Rust SDK `rmcp =3.2.0`。
Vercel `@ai-sdk/mcp` 自写 JSON-RPC、传输与协议版本协商，同时接受官方 SDK 的 transport 对象。
npm 上 `@modelcontextprotocol/sdk` 最新 1.30.0 与 `@modelcontextprotocol/client` 2.0.0 于 **2026-07-27 同日发布**；**v2 不是 `sdk` 包的下一个大版本，而是新包名**。

- 适用范围：上列各 commit / 版本；npm 注册表 2026-09-23。
- 代价与不适用：LangChain Python 0.3.1 未设上界，mcp 2.0.0 发布后**导入即失败**（#589），0.3.2 才补上界；
  OpenAI 与 Claude 的 Python 包为两版并接维护了字段名映射与传输分支。TS SDK 1.x 是否支持 2026-07-28 协议，本轮仍未取证（未读发布包）。
- 撞上会怎样：[提案](../../design/record/proposals/mcp-client-adoption/alternatives.md) 候选 C 以首轮研究的 `1.29.0` 为基线；选 1.x 还是 v2 包名，决定依赖清单与协议版本覆盖，不是一次小版本升级。
- 来源：E-1、E-19、E-20、E-22～E-28。
- 最近核对：2026-09-23。

### Codex 精确钉 `rmcp =3.2.0`；未就绪服务端的动作只在有目录缓存时进目录，调用时先等就绪再绑定

补首轮缺件（同一 commit 远程取回）：workspace `Cargo.toml` 与 `Cargo.lock` 均为 `rmcp 3.2.0`。连接集 `McpConnectionSet` 并发启动服务端，构造不等；
**有目录缓存**的未就绪服务端，其动作进目录但没有预绑定调用、只读注解被清空，调用时先等启动再重绑，仍不可用返回「not available to the model」；
**无缓存且超过可选宽限**（默认 1 秒，全连接集共享一个截止时间）的服务端整个不进目录；**启动已失败**的不进目录。
stdio 服务端中途退出后**没有自动重启**：只有 runtime 因配置、环境、鉴权变化或用户刷新被标脏后，下一次发布才新建连接。
源码兜底默认值为启动 30 秒、调用 300 秒，与首轮所引文档副本（10 秒、60 秒）不一致，本轮未判哪边是运行时行为。

- 适用范围：Codex `5c5308fc`。
- 代价与不适用：「有缓存才进目录」依赖进程级 LRU（TTL 30 分钟），配了 OAuth、头助手或已存凭据的服务端**不缓存**，也就没有这条路径。
  `rmcp 3.2.0` 源码未取得，issue #39149（`is_closed()` 看不到自行终止的 task）在 3.2.0 是否已修未核。
- 撞上会怎样：[N-3](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 的替换件在 Codex 的对应物只覆盖「近 30 分钟内连上过、且不带凭据类配置」的服务端；其余情形与 DSH 首连失败一样，条目消失。
- 来源：E-20。
- 最近核对：2026-09-23 / Codex `5c5308fc`。

### 同行在动作名上分成默认加服务端限定与默认原名两群；合法化、长度上限与冲突策略各不相同

默认限定：DSH（`mcp__<server>__<raw>`，不可关，64 字符，改动过则加 12 位 SHA-256）、Codex（`mcp__<server>` 命名空间，可按服务端豁免，128 字节，SHA1 12 位，撞名加哈希循环到唯一）、
Claude Code（`mcp__<server>__<tool>`，`[A-Za-z0-9_-]` 外换 `_`，总长规则未公开）、pi-mcp-adapter（默认 server 前缀，可改 short / none / mcp；冲突各方**全部丢弃**；普通名不截断）。
默认原名：OpenAI（跨服务端同名**抛错**；开关后 64 字符、sha1 8 位）、LangChain 两份（可选前缀，无冲突检测，**静默覆盖**）；Vercel 无前缀，合并时后者覆盖。
DSH 与 OpenAI 的记录都显示「原名 + 撞名时再处理」是被真实撞名推翻的；DSH 引微软研究院统计 1,470 个服务端中 775 个工具名撞名。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：Codex 把上限从 64 提到 128 后超过 Amazon Bedrock 的 64 字符上限（#46188，OPEN）；Claude Code 以前缀匹配时 `foo` 与 `foo__bar` 混淆（TS SDK 0.3.257）、
  带连字符的服务端名被 hook matcher 子串误匹配（2.1.195）。**OpenRouter 及其后端对函数名的字符集与长度限制本轮未取证。**
- 撞上会怎样：[N-7](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 的逐动作身份若以名字承载，名字的上限由最终接收它的模型提供方决定；「以前缀判归属」在服务端名含 `__` 或互为前缀时会误判。
- 来源：E-17、E-20、E-22～E-27。
- 最近核对：2026-09-23。

### 三家有跨连接的清单缓存让没连上的服务端仍有条目；键都含连接配置指纹、都不含租户，且都留了「不缓存」出口

Codex：进程内 LRU（32 条、TTL 30 分钟），键 = 服务端名 + 传输配置 SHA1 指纹（**含所引用环境变量当前值的哈希**）+ 执行环境；凭据类服务端不缓存；
服务端可在 initialize 里声明 `codex/tool-catalog-cache {cacheable:false}` 永久退出。
pi-mcp-adapter：磁盘 `mcp-cache.json`，按服务端名作键，配置指纹、7 天、服务端 `ttlMs` 三者失效（`ttlMs: 0` 不缓存）；多进程读合并写**无锁**。
Claude Code：「discovery cache」，TTL 900 秒、最大陈旧 4 小时，远程服务端「connects on first use」；重连或清除鉴权时丢弃。
DSH、LangChain 两份、OpenAI、Vercel 没有跨连接的持久清单。

- 适用范围：Codex `5c5308fc`、pi-mcp-adapter 2.37.0、Claude Code 2.1.280 文档。
- 代价与不适用：pi-mcp-adapter 围绕 `ttlMs` 连出三条 issue（#561、#569、#641：零 TTL 让直接工具永不注册、不回 `ttlMs` 的服务端缓存被永远判失效、零 TTL 让延迟启动整体失效）；
  Codex 清空缓存条目的只读注解，缓存里的对端自报信息不参与放行。
- 撞上会怎样：[N-3](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 的持久副本有三个先例，**但没有一家按租户或持有分键**；把凭据类服务端排除出缓存（Codex）意味着这类接入点连不上时没有替换件可装。
- 来源：E-19、E-20、E-27。
- 最近核对：2026-09-23。

### 支持 `tools/list_changed` 的同行都是收到即换，没有一家按 run 边界延后

自动刷新：DSH（整代替换，拉取失败留上一代）、Claude Code（刷新失败保留旧结果）、pi-mcp-adapter（热更新；另有 `freezeDirectTools` 冻结直接工具以稳定 prompt 缓存）。
只转给用户回调、不失效缓存：LangChain JS。不支持：Codex（只写日志，#10105 等五条 OPEN）、OpenAI Python（需自接 `message_handler`）、Vercel（#8189 OPEN）、LangChain Python。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：Claude Code 自述两次事故——服务端紧循环发通知导致持续高 CPU 与重复列举（2.1.271）；刷新遇瞬时错误把命令与资源清空（2.1.214，此后改为保留旧结果）。
- 撞上会怎样：[N-2](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 要求 run 内不变；同行的「收到即换」与之方向相反，唯一接近的是 pi-mcp-adapter 的冻结开关（为 prompt 缓存，不为 run 边界）。
- 来源：E-17、E-19、E-20、E-22～E-25、E-27。
- 最近核对：2026-09-23。

### Codex 默认模式下 `tools/list` 只取第一页；跟游标的同行守卫各异

Codex 在默认的 Legacy 协议模式下把 `nextCursor` 当作不存在，只取第一页；开 `Mcp20260728` 才翻页，翻页守卫为 100 页、2048 项、游标 64 KiB、游标重复即报错、整体 30 秒。
DSH 拒绝重复游标（作者自述不防不停给新游标的服务端）；OpenAI 有 `max_list_pages`，重复游标、超页、中途失败都抛错且不返回、不缓存部分结果；
LangChain Python 上限 1000 次；LangChain JS 与 Vercel 无上限；LangChain 两份的资源列举不分页。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：「只取第一页」由本轮执行者复读源码确认（`codex-mcp/src/rmcp_client.rs:673-676`），未运行验证。
- 撞上会怎样：多页服务端在「只取第一页」下**静默少动作**，agent 不知道自己少了什么；无上限实现遇到不停给新游标的服务端没有收口。
  [N-3](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 下「分页中断按这次没拿到清单处理」是提案作者建议，同行里 OpenAI 是同向的一家。
- 来源：E-17、E-20、E-22～E-25。
- 最近核对：2026-09-23。

### 同行的超时不止「连接」「调用」两项，还分出了空闲超时与 OAuth 请求超时；边界值出过错

Claude Code：启动 30 秒；每服务端调用超时是硬墙钟、progress 不续期；另有空闲超时（无响应且无 progress：远程 5 分钟、stdio 30 分钟）与远程每请求首字节计时。
OpenAI Python 只有一个会话读超时，默认 5 秒，**同时作用于工具调用**。Vercel 默认无请求超时，初始化可单独限时。LangChain JS 退回 SDK 的 60 秒默认。

- 适用范围：上列各 commit / 版本与 Claude Code 文档。
- 代价与不适用：同行自述的边界值事故——OpenAI #4017（超时设 0 被当成不限时）、Claude Code 2.1.162（小于 1000 ms 被当成 1 秒看门狗）、
  LangChain JS #9560（框架删掉超时数值，退回 60 秒）、Claude Code 2.1.142（工具超时没抬高远程每请求 fetch 超时）；
  OAuth 引导与令牌请求不在启动超时里而卡死 agent（Codex #22072 OPEN、pi-mcp-adapter #485 已修）。
- 撞上会怎样：[N-6](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 的两项超时覆盖不到空闲与 OAuth 两段；长调用与 progress 的关系（续期与否）同行做法相反。
- 来源：E-19、E-20、E-23～E-25、E-27。
- 最近核对：2026-09-23。

### 「在途请求永不收场」是同行记录最多的一类坑

Claude Code CHANGELOG 五条（缓存的连接 promise 永不 resolve、stdio 非 JSON 输出挂住会话、SSE/HTTP 中途断开调用无限挂起、远程调用 5 分钟无响应、一个调用的消息解除另一调用的看门狗）；
Vercel #16580（发出后取消，promise 永不结束且挂起表项泄漏；修复后传输关闭时统一以「Connection closed」失败全部挂起请求）；
Codex #39149（死连接显示为打开）；LangChain Python #258（并发调用同一工具请求 ID 相同，其余挂起）；OpenAI #1404（initialize 失败后流式输出挂住）；
Claude Agent SDK 的 SDK MCP 握手 ack 丢失导致会话无限挂起（改为 70 秒超时并只标该服务端失败）。
另有三条读代码推断未经运行：Vercel 的 POST-SSE 正常结束无响应时挂起请求不失败、旧式 SSE 意外断开不触发 `onclose`；Codex 已关闭的客户端仍可能被放进 binding。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：这些都是修复记录或 OPEN issue，说明发生过，不说明发生频率。
- 撞上会怎样：[N-4](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 把断连与超时归「失败」，前提是**每一个在途请求都会收场**；上面每一条都是既不失败也不成功的状态，agent 一直等。
- 来源：E-20、E-22、E-24～E-27。
- 最近核对：2026-09-23。

### 自动恢复按传输分别做、覆盖面各不相同；OpenAI Python 与 Vercel 的重试会重放已发出的调用

DSH 只对 stdio 有预算重连；Codex 只对 HTTP 做会话过期重握手与列举瞬态重试，stdio 不重启；Claude Code 远程最多 5 次退避，stdio 不重连；
pi-mcp-adapter 对会话过期（带 session id 的 404 或 `-32000`）重连一次、重试一次，替代连接先私下建好再发布、失败候选不拆最后可用连接，keep-alive 模式另有指数退避重连，其余模式下次调用时懒连接；
LangChain JS 两种都有：stdio 固定间隔 `restart`，Streamable HTTP 交给 SDK 的重连选项（重连细节在 SDK 内，本轮未取证）。
OpenAI Python 的 Streamable HTTP 在断连、超时、5xx 时**新开隔离会话重试这次调用**；Vercel `maxRetries`（默认 0）对 `tools/call` 重试，文档自述非幂等工具会重复副作用。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：pi-mcp-adapter 的会话过期重试依赖规范「会话失效时服务端先拒绝、不处理请求」，它刻意不匹配通用 400、ConnectionClosed、Abort。
- 撞上会怎样：[N-8](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 要求不重放已发出的调用——OpenAI Python 与 Vercel 的重试正是重放；
  自己写恢复逻辑、两种传输都覆盖的只有 LangChain JS 与 pi-mcp-adapter，且前者 HTTP 一半交给 SDK。
- 来源：E-3、E-19、E-20、E-23～E-25、E-27。
- 最近核对：2026-09-23。

### stdio 子进程泄漏或孤儿四家都记过；同行的防护落在进程组终止、stderr 排空、单行上限与环境过滤

泄漏或孤儿：pi-mcp-adapter（2.0.0 并发 close + connect、2.2.2、2.15.0）、Claude Code（2.1.15 超时不杀子进程）与 Agent SDK（0.2.94）、LangChain Python #551、Codex #31499（Windows 重复拉起 183 个 node.exe）；
DSH 另自述「不理信号的服务端会卡住卸载」的风险。防护：Codex 新进程组启动、SIGTERM 后 2 秒 SIGKILL，stderr 按行读走并留 250 ms 排空宽限（逃逸后代占着管道），
单行 8 MiB 上限；Claude Code 2.1.208 记 stderr 每服务端累积到 64 MB。环境：Codex 与 Vercel 用**白名单**（`HOME`、`PATH` 等），DSH 用**黑名单**（剔除名字匹配 `KEY|PASSWORD|SECRET|TOKEN` 与 `DSH_*`）。
Windows 上 `npx` / `.cmd` 需要专门解析（Codex、pi-mcp-adapter；Vercel #19157）。DSH 另记：Node 子进程在 `NODE_USE_ENV_PROXY` 下遇 `socks4://` 等值会在第一行前退出。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：交给 SDK 关闭（DSH、pi-mcp-adapter、LangChain）时，终止方式取决于 SDK 版本，本轮未读 SDK 源码。
- 撞上会怎样：[N-11](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质)（候选假设）把拉起位置交给执行环境时，终止、stderr、帧上限与环境过滤随拉起方换主；
  [N-5](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 的「不跨租户身份共用凭据」在黑名单做法下取决于名字模式的覆盖面，在白名单做法下取决于显式传入的那一份。
- 来源：E-5、E-17、E-19～E-22、E-25～E-27。
- 最近核对：2026-09-23。

### `structuredContent` 与 `content` 并存时同行方向相反；图片的预算、尺寸与入库各家不同

Codex：`structuredContent` 非空时**只输出它、丢弃 content**。OpenAI：默认只给 content（docstring 理由：多数服务端两边重复）。LangChain：结构化进 artifact 不给模型。
pi-mcp-adapter：追加在文本后。Vercel：只在没有 content 时补一段文本（#20171）。Claude Code 2.1.128 曾在两者并存时丢图。
图片：Codex 不计入截断预算、总是保留；Claude Code 带图结果不写盘；pi 本体进入历史前缩放；pi-mcp-adapter 不限大小；DSH 只在模型声明图像输入时入库；Vercel #12025 图片导致流挂起。
其他块：Codex、OpenAI、Vercel 把 audio / `resource_link` / 内嵌资源串成 JSON 文本；LangChain JS 在内嵌资源只有 uri 时**再发一次 `readResource`**；LangChain Python 音频抛 `NotImplementedError` 且不受错误兜底。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：大输出写盘（Claude Code 超 2.5 万 token、pi-mcp-adapter 超 50 KiB）各带清理问题——前者 2.1.217 截断后内存仍留全文，后者临时文件不自动清理。
- 撞上会怎样：这些落在[工具产出](../../design/ubiquitous_language/terms/execution-and-outcome.md#ul-tool-output--工具产出--tool-output)与两端模态的契约上；同行对「结构化优先还是内容优先」各有理由、方向相反。
- 来源：E-17～E-20、E-22～E-27。
- 最近核对：2026-09-23。

### 两家的桥在错误到达 agent 前就已分不出可重试的传输错与参数错

LangChain JS 把传输、超时与 `McpError` 统一包成 `ToolException` 且**丢 cause**（#11300 OPEN）；Vercel 只有一个 `MCPClientError`，超时、取消、断连、已关闭无子类无码。
能区分的：Codex（鉴权需要单列并带 `mcp/www_authenticate`；启动错误分 Cancelled / Failed / 需重新授权）、pi-mcp-adapter（`tool_error`、`call_failed`、`auth_required`、`server_backoff`…，只有三种码算失败）、Claude Code（状态五值，瞬时错误重试、4xx 与认证不重试）。
`isError` 原样给模型：Codex、OpenAI、Vercel、LangChain Python（默认转 error 状态消息）；抛错：DSH、LangChain JS。OpenAI 把调用异常默认换成不含细节的固定文本。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：同一来源内，模型端看到的与宿主端能区分的不一定相同（OpenAI 宿主可区分、模型只见固定文本）。
- 撞上会怎样：[N-4](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 要把失败、被中断、等待态分开并都以正常返回到达 agent；桥层一旦丢了分类，后面无法补回。
- 来源：E-4、E-19、E-20、E-22～E-25、E-27。
- 最近核对：2026-09-23。

### 取消通知不是同行的默认：Vercel 不发，Claude Agent SDK Python 在 mcp 1.x 下有选择地发

Vercel 把 `abortSignal` 传进调用但**不发 `notifications/cancelled`**，取消后迟到的响应抛「unknown message ID」。
Claude Agent SDK Python 在 mcp 1.x 下只对自己构建的服务端发取消，理由是 1.x 在处理函数仍回复时会停掉整个服务端；2.x 全部可取消。
LangChain Python #314 记录客户端中途取消时的 `UnboundLocalError`。pi-mcp-adapter 在 task 路径发 `tasks/cancel`。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：对端收到取消后是否停下不由客户端决定；Claude 的做法针对的是 Python SDK 1.x 服务端实现，TS 服务端是否同样受影响本轮未核。
- 撞上会怎样：提案表中「取消：桥」依赖对端正确处理取消通知；同行里已有因对端 SDK 行为而**不发**的先例。
- 来源：E-22、E-25、E-26。
- 最近核对：2026-09-23。

### 把 elicitation 交给人的同行都另建了确认界面，无界面时一律拒绝；sampling 只有一个第三方扩展做了，且请求与结果各确认一次

elicitation：Claude Code（form 与 URL；Agent SDK 无回调时自动 decline）、Codex（转审批/提问界面）、Vercel（须先声明能力再注册处理函数）、
pi-mcp-adapter（须有 UI，URL 模式须用户点开）、LangChain Python（回调；继任版用 LangGraph `interrupt()` 交给人）；LangChain JS、OpenAI、DSH 不声明。
sampling：pi-mcp-adapter 只做纯文本、请求与结果各确认一次、走 pi 自己的模型注册表；Vercel 回 `-32601`；Claude Code 公开材料里没有 sampling 一词；其余不声明。
roots：只有 Claude Code 返回启动目录与附加工作目录并在变化时通知。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：「不声明能力」与「声明后回 `-32601`」对对端是两种可观察行为；Claude Agent SDK 的进程内服务桥对 roots / sampling / elicitation 一律回 `-32601`。
- 撞上会怎样：[N-9](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 要人作答、拓展件不得代填；同行里没有一家代填，差别只在无界面时回 decline 还是回错误。
- 来源：E-15、E-19、E-22～E-27。
- 最近核对：2026-09-23。

### 同行在鉴权上反复踩的两处：重定向把凭据送往别源，轮换后的令牌被旧值覆盖

重定向：Codex 只跟同源（注释：请求带敏感头与调用体）；Vercel `redirect:'error'`（文档：防 SSRF）；OpenAI `follow_redirects=False`；
pi-mcp-adapter 不把绑定源的头交给 SDK 的 `requestInit`（注释：SDK 会拿它去请求别源的 OAuth 端点）。
轮换令牌：Claude Code 2.1.136（多服务端并发刷新丢 refresh token）、Codex #41133 / #45944（关闭时或并发刷新丢已轮换令牌；持久化失败时故意 fail-closed）、pi-mcp-adapter 2.28.0（跨进程误删刚授权的凭据）。
凭据泄漏：OpenAI #4016，URL 派生的服务端名把凭据与 query token 带进错误、trace 与模型可见输出，此后脱敏。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：提案本版不桥 OAuth，轮换一项暂不触发；重定向与脱敏两项对静态头同样适用。
- 撞上会怎样：[N-5](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 的凭据若随重定向或服务端名进入别处，隔离在客户端层就已失守；同行的存储键都是本机用户 + 服务端名/URL，与首轮「没有租户维度」一致。
- 来源：E-19、E-20、E-24、E-25、E-27。
- 最近核对：2026-09-23。

### 两家默认不把逐动作定义常驻上下文，Codex 在开工具搜索时延后；两家记录了工具定义变化会让缓存的 prompt 前缀失效

pi-mcp-adapter 默认只注册一个代理工具（README：单个服务端可能超过 1 万 token，代理约 200）；Claude Code 默认 Tool Search，只加载名字与服务端说明；
Codex 开了工具搜索时为 `Deferred`（首轮 E-13；工具搜索是否默认开启本轮未核）。DSH、LangChain、OpenAI、Vercel 逐动作直接给。
pi-mcp-adapter 让代理描述**字节稳定**、pi 本体以增量追加工具集变化，理由都是重新注册会改写已缓存的 prompt 前缀。

- 适用范围：上列各 commit / 版本。
- 代价与不适用：Claude Code 的 Tool Search 需要支持 `tool_reference` 的模型，非第一方 base URL 时自动关闭。
- 撞上会怎样：[N-1](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 已定「不常驻、经 `Tools()` 发现」，与这三处做法同类；动作集随 run 重算时，定义字节的稳定性决定缓存前缀能否保住。
- 来源：E-13、E-18、E-19、E-27。
- 最近核对：2026-09-23。

## 第三轮：stdio 拉起位置

- 调查对象与日期：MCP 规范 `c7400a07`（2025-11-25 版）；DSH `c291e796`；Codex `5c5308fc`（本地 `rmcp-client`、`core/src` + 远程同 commit `codex-mcp`、`exec-server`、`config/src`）与文档副本 2026-09-20；
  npm `@modelcontextprotocol/sdk` 1.29.0 / 1.30.0、`@modelcontextprotocol/client` 2.0.0；Python SDK v1.28.1 `777b8d06` / v2.0.0 `6f69a375`；OpenAI Agents Python `32edd3c3`；LangChain JS `12626c25` / Python `52a4535f`；
  Vercel `21b2d6c3`；Claude Code 文档七页（2026-09-23 抓取）与 `@anthropic-ai/claude-agent-sdk` 0.3.280；`docker/mcp-gateway` `a34df45d`；`sparfenyuk/mcp-proxy` `153a96a6`；`supercorp-ai/supergateway` `874951c7`。2026-09-23 取证。
- 问题：提案 [N-11](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质)（候选假设）「stdio 服务端进程在哪拉起，不焊死在宿主机上，留出由执行环境落点决定的接口」；产品负责人 2026-09-23 要求先看同行怎么做。
  本节只写事实与「撞上会怎样」，对照的是 [PF-005](../../design/product/PF-005-execution-environments-and-sandboxes/design.md)（rev 5）；**不写 N-11 该取哪一值**。
- 证据：[evidence.md](evidence.md) E-29～E-41；逐源、逐主题论证与 N-11 两种取值的完整后果在[第三轮报告](reports/2026-09-23-round3-stdio-launch-site.md)。
- 最近核对：2026-09-23 / 上列各 commit 与版本。

### 源 × 拉起位置 × 可交外部执行器 × 桥接 × 生命周期

列出不等于推荐。各格出处见报告 §二 与 E-29～E-41。

| 源 | 拉起位置 | 可交外部执行器或容器 | 桥接方式 | 谁杀、怎么杀 |
|---|---|---|---|---|
| MCP 规范 | 客户端的子进程 | 未定义 | stdin/stdout | 客户端：关 stdin → SIGTERM → SIGKILL（SHOULD） |
| DSH | harness 进程（SDK spawn） | 否；执行世界接缝存在但 SDK spawn 绕过它（作者自述） | 本机管道 | SDK `close()` + 1 秒等关闭 |
| Codex | 逐服务端：编排进程或执行器 | 是（实验性，`environment_id`，密封 trait） | 本地管道 / exec-server 搬字节，帧在编排进程 | 本地进程组 2 s 升级；远端 `process/terminate`、断连全杀；落点解析失败不回退 |
| 官方 TS SDK v1 | 调用方进程 | 仅能自写 `Transport` | 本机管道 | 直接子进程：stdin → 2 s → SIGTERM → 2 s → SIGKILL |
| 官方 TS SDK v2 | 同上；`'auto'` 协商时另起旁路探测进程 | 同上（自写则就地探测） | 本机管道 | 同 v1 |
| 官方 Python SDK | 调用方进程，新会话 | 否 | 本机管道 | 进程组 killpg |
| OpenAI Agents | agent 进程 | 子类改 `create_streams()`；`SandboxAgent` 不含 MCP | 本机管道 | Python SDK 进程组 |
| LangChain JS / Py | 调用方进程 | 否 | 本机管道 | SDK；JS 有 `restart`；Py 无显式会话时每调用一进程 |
| Vercel | 调用方进程 | 自写 `MCPTransport` | 本机管道 | abort 直接子进程（推断） |
| Claude Code | Claude Code 进程所在处 | 只能整进程搬（沙箱运行时、容器、VM、云会话、`spawnClaudeCodeProcess`） | 本机管道 | 闭源未核 |
| Docker MCP Gateway | 网关经 `docker run` 起容器 | 是（容器） | `docker run -i` 管道 / `socat` | 缺省每调用一容器；长驻按客户端会话 |
| mcp-proxy | 代理进程 | 代理可整体进容器 | stdio → SSE / Streamable HTTP | 随代理；所有客户端共用一个进程 |
| supergateway | 代理进程 | 同上（自带镜像） | stdio → SSE / WS / Streamable HTTP | 进程组 5 s 升级；按请求 / 会话 / 共用 |

### 逐服务端选择 stdio 落点的，本轮所读同行里只有 Codex 一家，且为实验性

Codex 按服务端配置的执行环境 id（源码字段 `environment_id`，缺省 `"local"`）二选一：`local` 由编排进程在新进程组里拉起；其他 id 经该环境的执行器进程 API
（`codex exec-server`，WebSocket 上的 JSON-RPC，`process/start|write|terminate`）在执行器一侧拉起，**MCP 帧仍在编排进程里做**，执行器只搬 stdin/stdout/stderr 的原始字节。
启动器 trait 是密封的。其余同行的 stdio 服务端都由客户端进程或其代理进程在**本机**拉起；Claude Code 与 Codex 的 SSH 主机模式是把整个 agent 进程搬走，不是逐服务端选。

- 适用范围：本节所列源与版本。「只有一家」是在所列源内读遍的结果，不推广到未读的客户端。
- 代价与不适用：Codex 的文档副本把该项写作 `experimental_environment = local | remote`，**同 commit 源码读遍无此字样**；文档说「streamable HTTP 远端落点未实现」，源码里非本地 HTTP 服务端走该环境的 HTTP 客户端——两处不一致只记录。
  `codex-mcp` 在选启动器处留 TODO：执行器路径尚未保留本地启动器的语义（进程组、Windows Job Object、stderr 排空）；Windows 下执行器拉起的服务端保留执行器的常规后代生命周期。
- 撞上会怎样：以 Codex 为形状参照时，终止、孤儿与 stderr 的保证**随落点不同**；它的执行器是自家协议与自家注册中心，不是通用接口。
- 来源：E-30、E-31。
- 最近核对：2026-09-23 / Codex `5c5308fc`。

### Codex 的落点解析失败时该服务端启动失败，不回退本地；远端路径要显式 cwd，环境从执行器一侧取

环境 id 未知 →「references unknown environment id」；`local` 的 stdio 在没有本地环境时也失败；环境处于 Pending / Failed 时权限判为 Unavailable。
执行器路径缺 `cwd` 即失败（cwd 以 `file:` URI 传）；argv 与 env 须为合法 Unicode；不带编排机的 `PATH`/`HOME`，改用执行器一侧的 `Core` 继承策略，只转发 `env_vars` 点名的本地变量与字面 `env`；
`env_vars` 条目可写 `source = "remote"` 从执行器环境取值，本地路径遇到它直接报错。执行器拥有的服务端不许用托管 ChatGPT 鉴权，`http_headers_helper` 只限本地。

- 适用范围：Codex `5c5308fc`。
- 代价与不适用：「不回退」只在服务端**启动**时成立；已启动的远端进程在执行器 WebSocket 断开时被 exec-server 全部终止，事件流报 `Failed`，之后按第二轮所记「stdio 中途退出不自动重启」处理（E-20）。
- 撞上会怎样：与 [PF-005 §6.9](../../design/product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)「不回退宿主机」同向；
  [N-5](../../design/record/proposals/mcp-client-adoption/design.md#必须保留的性质) 的凭据注入在这一形状下要按落点分两条来路。
- 来源：E-30、E-31。
- 最近核对：2026-09-23 / Codex `5c5308fc`。

### DSH 有「执行世界」接缝、同仓库的 LSP stdio 服务端经它落进 E2B，但 MCP 因 SDK 自持 spawn 而绕过它

DSH 以 `ctx.fs` + `ctx.subprocess` 定义一个执行世界，E2B 远端沙箱是换一对实现；`lsp-stdio` 经 `ctx.subprocess.spawn` 以管道拉起语言服务端，随执行世界落位。
`dsh-subprocess` README 明写：「由 SDK 管理的 spawn 仍在服务之外——拥有内部 spawn 的传输（SDK 客户端、MCP）无法把该调用路由到本服务」，只能共用环境过滤函数 `scrubbedParentEnv`。

- 适用范围：DSH `c291e796`。
- 代价与不适用：「E2B 组合下 MCP stdio 服务端仍在宿主机上跑」是推断——E2B 决策记录把「prompts and tools」列在宿主一侧，未提 MCP；本轮未运行该组合。
- 撞上会怎样：沿用官方 SDK 的 stdio 传输，拉起位置就由 SDK 决定；要让 MCP 服务端随落点走，DSH 的教训是必须在 SDK 之外自己持有 spawn。
- 来源：E-29。
- 最近核对：2026-09-23 / DSH `c291e796`。

### 官方 TS SDK 的 stdio 传输没有 spawn 钩子；v2 在 `'auto'` 协商下对基类传输另起一次性旁路进程

v1（1.29.0 / 1.30.0）与 v2（`@modelcontextprotocol/client` 2.0.0）的 `StdioClientTransport` 构造参数只有 `command/args/env/stderr/cwd`（1.30.0 起加 `maxBufferSize`），`cross-spawn` 在调用方进程所在机器拉起；
要放到别处只能自写 `Transport`（v1 的帧工具经 `./*` 深路径导出，v2 从包入口导出 `ReadBuffer`/`serializeMessage`/`deserializeMessage`）。
环境总是以六个白名单变量打底再叠加传入值；关闭顺序 stdin → 2 s → SIGTERM → 2 s → SIGKILL，**信号只发给直接子进程**。
v2 协商为 `'auto'` 或钉版本时，若传输恰好是基类，先按同一参数另起旁路进程发 `server/discover`、探完回收，再起会话进程；子类或自写传输就地探测；缺省 `'legacy'` 不探测。

- 适用范围：上列三个发布包。
- 代价与不适用：「孙进程不在信号范围内」是读代码推断；旁路探测的理由是 SDK 源码注释（「pre-`initialize` 请求会让某些 SDK 写的 stdio 服务端退出」），本轮未验证哪些服务端如此。
  官方 Python SDK（v1.28.1、v2.0.0）则以新会话拉起、按进程组终止——同为官方 SDK，孤儿行为不同。
- 撞上会怎样：把拉起交给执行器或容器就要自写传输，同时失去 v2 旁路探测的保护（若开 `'auto'`）；沿用基类，`'auto'` 下每次连接在本机起两个进程。
- 来源：E-32、E-33、E-34。
- 最近核对：2026-09-23 / 上列版本。

### TS SDK 1.29.0 与 1.30.0 支持的最新协议版本是 2025-11-25，不含 2026-07-28

两版 `types.js` 的 `LATEST_PROTOCOL_VERSION` 均为 `2025-11-25`，`SUPPORTED_PROTOCOL_VERSIONS` 到 `2024-10-07`；v2 2.0.0 另有 `SUPPORTED_MODERN_PROTOCOL_VERSIONS`。
这回答了首轮「[DSH 锁定的官方 SDK 是 1.29.0……](#dsh-锁定的官方-sdk-是-1290声明范围只到-1120codex-已有-2026-07-28-协议模式其-rmcp-版本本轮取不到)」里 TS SDK 那半项「待核实」与「未知与下一项证据」表第 1 行。

- 适用范围：npm 发布包 1.29.0、1.30.0 的编译产物。
- 代价与不适用：只读了常量，未核客户端在协商中如何使用它们。
- 撞上会怎样：以 1.x 为基线时，2026-07-28 协议不在支持列表里；第二轮已记 v2 是新包名而非 `sdk` 的下一个大版本。
- 来源：E-32、E-33。
- 最近核对：2026-09-23。

### Claude Code、Codex 与 OpenAI Agents 的沙箱都不约束 MCP 服务端；Claude Code 要约束它只能把整个进程搬进边界

Claude Code 文档：Bash 沙箱只约束 Bash、PowerShell、Monitor 命令及其子进程，「MCP 服务端与命令 hook 是在宿主机上不受约束的独立进程」；
沙箱禁止写 `.mcp.json` 等配置，理由是能写它们的命令「可以添加一个在沙箱之外运行的 MCP 服务端」；要约束 MCP，给的是沙箱运行时、dev container、自建容器、VM、云会话——都包住整个 Claude Code 进程。
Agent SDK 的 stdio 配置只有 `command/args/env/timeout/alwaysLoad`（无 `cwd`），它提供的 `spawnClaudeCodeProcess` 钩子搬的是整个 Claude Code 进程。
Codex：本地是普通子进程，执行器请求显式 `sandbox: None`；网络代理域名规则文档写明不限制 MCP 服务端；另以 `codex/sandbox-state-meta` 把沙箱状态经 `_meta` 交给声明了该能力的服务端自行执行。
OpenAI：读遍 `src/agents/sandbox/` 89 个文件，MCP 只作为 `SandboxAgent` 参数透传与记忆条目类型出现；官方示例把 stdio 服务端注释为「另一个本地进程」。

- 适用范围：Claude Code 文档 2026-09-23 抓取（厂商自述，本体闭源）；Codex `5c5308fc`；OpenAI `32edd3c3`。
- 代价与不适用：Claude Code 的实际进程行为无法核对，只有文档陈述。
- 撞上会怎样：「服务端落在沙箱所在的环境」与「服务端受沙箱约束」在同行里是两件事；[PF-005 §6.2](../../design/product/PF-005-execution-environments-and-sandboxes/design.md#62-宿主机不提供租户隔离因此必须被显式允许) 的宿主机约束对据点机上的 MCP 服务端进程同样成立。
- 来源：E-30、E-31、E-35、E-38。
- 最近核对：2026-09-23。

### 把 stdio 服务端放进容器或网络代理的公开做法，拉起方都是中间层，进程粒度分「每调用 / 每会话 / 全体共用」三种

Docker MCP Gateway：网关对每个本地服务端执行 `docker run --rm -i --init --security-opt no-new-privileges --cpus 1 --memory 2Gb --pull never …`，stdio 即该 CLI 的管道；
缺省**每次工具调用一个容器**，服务端声明 `LongLived` 或 `--long-lived` 时按（服务端名, 客户端会话）缓存（参数文档：「适合有状态的服务端」）；密钥只以名字进 argv，值放在 CLI 环境里，缺失时填 `<UNKNOWN>` 继续起；可 `--network none`。
mcp-proxy：每个服务端在代理启动时拉起一次、全体 HTTP 客户端共用，服务端一侧中间件只有 CORS。supergateway：无状态 Streamable HTTP 每请求一个子进程、有状态每会话一个、SSE 全体共用；子进程成组、SIGTERM 5 s 后 SIGKILL，`shell: true`、继承全部环境。

- 适用范围：上列三个 commit。
- 代价与不适用：Docker 网关只读了 `clientpool.go`、`handlers.go`、`stdio.go` 与参数参考；mcp-proxy 的「无鉴权」指读遍 `mcp_server.py` 的中间件。
- 撞上会怎样：每调用一进程让有状态服务端每次从零开始、启动开销按调用计；全体共用让多个会话（及租户）的调用落进同一个服务端进程；经代理后「连接断即进程死」的对应关系被拆开。
- 来源：E-39、E-40。
- 最近核对：2026-09-23。

### N-11 两种取值各自撞上什么

只列事实推出的后果，不给取舍；完整论证在[报告 §五](reports/2026-09-23-round3-stdio-launch-site.md#五n-11-两种取值各自撞上会怎样只列事实与后果不给推荐)。

| | 受执行环境落点约束 | 一律在据点机拉起 |
|---|---|---|
| 同行先例 | 只有 Codex（实验性、自家执行器协议） | DSH、官方 TS / Python SDK、OpenAI（含 `SandboxAgent`）、LangChain、Vercel、未搬家的 Claude Code |
| 官方 TS SDK stdio 传输 | 用不上，须自写 `Transport`；`'auto'` 协商下失去旁路探测保护 | 可直接用 |
| 终止与孤儿保证 | 随落点变（Codex 自留 TODO：两路语义不等价） | 取决于所用 SDK：TS 只杀直接子进程，Python 按进程组 |
| 与 PF-005「每次执行现算落点」 | 长驻进程与逐次落点尺度不同；同行对齐法只有「每调用一进程」（有状态服务端每次从零）或「环境选择变了就重建连接」（Codex） | 服务端进程一切副作用落在据点机；宿主机不提供租户隔离、须显式允许（§6.2） |
| 与执行环境权限（§6.8、§6.9） | 落点不可用时 Codex 的形状是启动失败、不回退 | MCP 动作若声明要用执行环境，`never-allow` 下无处可落只能拒绝；若不声明，服务端进程仍在宿主机上做事——同行无一处理这一组合 |
| 凭据来路 | 按落点分两条（Codex 本地 / 执行器来源；Docker 值在 CLI 环境） | 单一来路：据点机环境（白名单或黑名单过滤） |
| 沙箱约束 | 落进沙箱所在环境 ≠ 受沙箱约束（Codex `sandbox: None`） | 同行的沙箱都不管 MCP；Claude Code 为防借 `.mcp.json` 逃逸专门禁写配置 |

- 来源：E-29～E-41；首轮 E-12（Codex 每步按环境选择标脏）；第二轮 E-17～E-22、E-26、E-27（孤儿记录）。
- 最近核对：2026-09-23。

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

消费者：提案 [MCP 客户端采用](../../design/record/proposals/mcp-client-adoption/README.md)（首轮读数进了它的 design.md 与 alternatives.md；第二轮回应产品负责人 2026-09-23 的追加要求）。
DSH 或 Codex 换 commit、DSH 升级 SDK、第二轮的上游对象（pi-mcp-adapter、LangChain、OpenAI Agents、Vercel、Claude Agent SDK / Claude Code、官方 SDK 各包）换版本，
或产品 PF-002 / PF-006 / PF-007 升 rev 触及 MCP 条款时，先判断是否触及上面任何一条结论，触及则按
[演进事件词](../README.md#演进事件词) 记 [changelog](changelog.md)。
