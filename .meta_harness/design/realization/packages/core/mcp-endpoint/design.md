# mcp-endpoint 实现设计

> 本批设计已接受（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-065](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

契约：[`data.mcp-endpoint` v2](../../../../spec/data/mcp-endpoint/v2/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律为**已接受的设计**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)（`malformed` 带 M 编号，清单项即 M 编号）。
条目名合不合 `data.tool-definition/v2#S-18` 用 [tool-definition](../tool-definition/README.md) 那一份 `ToolName` 判，**不另写**。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 公开面

**全部即公开函数面**（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）：不依赖 Cordis、会话、租户或存储，单独 `import` 即用；**没有 Cordis 服务面**（[下表](#cordis-原语本节点一样也不用)）。核对：[依赖表](#依赖作用域与绑定)只有本批纯模块、已实现的 identity-values 与 offer-expiry、`ajv`，不 import `@deepseek-ai/cordis`、`kernel-basis`、`storage`，不解析任何服务键；不连对端、不拉进程。主要导出（候选名）：

| 导出 | 契约坐标 |
|---|---|
| 类型 `McpEndpoint`、`ActionSnapshot`（`fetched`／`not_fetched` 两支）、`McpToolDescriptor` | [S-1](../../../../spec/data/mcp-endpoint/v2/contract.md#s-1-接入点正文)～[S-10](../../../../spec/data/mcp-endpoint/v2/contract.md#s-10-对端动作描述)、[S-12](../../../../spec/data/mcp-endpoint/v2/contract.md#s-12-oauth-绑定)、[S-13](../../../../spec/data/mcp-endpoint/v2/contract.md#s-13-凭据配值的取值域) |
| `actionEntryName(endpointName, remoteName) → { ok } \| { notProjectable }` | [S-11](../../../../spec/data/mcp-endpoint/v2/contract.md#s-11-动作条目名) |
| `mcpBodyContract`（asset-model 端口的那一份：名字收窄、推属性） | [S-26](../../../../spec/data/mcp-endpoint/v2/contract.md#s-26-接入点-name-登记时收窄)、[S-14](../../../../spec/data/mcp-endpoint/v2/contract.md#s-14-推出规则五类项)～[S-17](../../../../spec/data/mcp-endpoint/v2/contract.md#s-17-工作区格上的这些项) |
| `deriveMcpDeclarations(body, actionSnapshot?) → McpDeclarations` | 同一 S-14～S-17 纯推出；结果使用 asset-model 的 `DeclarationResult<'mcp'>`，保留实际快照的 `fetched`／`not_fetched` 知识标记，不把未取得动作集当成空集 |
| `judgeMcpEndpoint(value) → { ok } \| { rejected, m? }`；`judgeMcpValue(definition, value)` 覆盖冻结 Schema 七个公开定义 | [S-18](../../../../spec/data/mcp-endpoint/v2/contract.md#s-18-规范表示)～[S-21](../../../../spec/data/mcp-endpoint/v2/contract.md#s-21-表示层拒绝不是判定也不修补) |

**函数层不承诺**：OAuth 绑定号部署内唯一且不可猜、stdio 在据点机上拉起——归 MCP 桥（[装配给 vs 协议给](#装配给-vs-协议给)）。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。资产治理、MCP 桥、注册表、求值各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；`mcpBodyContract`（asset-model 端口的那一份）是普通值 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听** | — |
| 存储 | **无**：动作清单副本按持有保存、只由桥写（`capability.mcp-bridge/v2#S-7`），调用方把它交进推出规则 | S-9 |

### 装配给 vs 协议给

[第五节](../../../../spec/data/mcp-endpoint/v2/contract.md#五装配给与协议给)三行里，本节点只在「表示层校验在每个接收边界重做」一行出力（`judgeMcpEndpoint` 这一个纯入口）；
「OAuth 绑定号部署内唯一、不可猜」归单一生成点（MCP 桥，`capability.mcp-bridge/v2#S-22`；N-32 改正），「stdio 在据点机上拉起」归 MCP 桥。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/mcp-endpoint/v2/contract.md#s-1-接入点正文)～[S-10](../../../../spec/data/mcp-endpoint/v2/contract.md#s-10-对端动作描述)、[S-12](../../../../spec/data/mcp-endpoint/v2/contract.md#s-12-oauth-绑定)、[S-13](../../../../spec/data/mcp-endpoint/v2/contract.md#s-13-凭据配值的取值域) 正文、连接目标、动作清单副本、对端动作描述、OAuth 绑定、凭据配值域 | 类型 `McpEndpoint`、`ActionSnapshot`（`fetched`／`not_fetched` 两支类型上分开）、`McpToolDescriptor`（其余成员原样保留） | 正文类型里没有任何成员装得下凭据；`inputSchema` 在这里只判「是对象」 | V-1、V-3；SC-1、SC-3 |
| [S-11](../../../../spec/data/mcp-endpoint/v2/contract.md#s-11-动作条目名) 动作条目名 | `actionEntryName(endpointName, remoteName) → { ok } \| { notProjectable }` | 拼 `endpointName + ":" + remoteName`，用 tool-definition 的 `ToolName` 判；**不改写**拼不出的名字 | V-2 |
| [S-26](../../../../spec/data/mcp-endpoint/v2/contract.md#s-26-接入点-name-登记时收窄) 登记时收窄 | `mcpBodyContract` 的名字收窄，报 `name_not_projectable` | 四条逐条判（字符集、三种相邻、不以 `_` 结尾、转写后 ≤ 125） | V-2 |
| [S-14](../../../../spec/data/mcp-endpoint/v2/contract.md#s-14-推出规则五类项)～[S-17](../../../../spec/data/mcp-endpoint/v2/contract.md#s-17-工作区格上的这些项) 推出规则（正文＋动作集） | `mcpBodyContract` 的推属性（显式收动作集副本） | 逐动作项的键 = `execute:` ＋ 对端动作名原样 | SC-2、SC-4 |
| [S-18](../../../../spec/data/mcp-endpoint/v2/contract.md#s-18-规范表示)～[S-21](../../../../spec/data/mcp-endpoint/v2/contract.md#s-21-表示层拒绝不是判定也不修补) 七个拒绝值、M1～M13 | `judgeMcpEndpoint(value)` | `url` 的四条（S-5）用 WHATWG `URL` 解析后逐条判，带 userinfo 即 `url_invalid` | V-2 |

**远端参数 schema 不在这里判**：本模块照 [S-10](../../../../spec/data/mcp-endpoint/v2/contract.md#s-10-对端动作描述) 把 `inputSchema` **原样存下**、只判「是对象」。它能不能成为工具定义的参数，由 MCP 桥在投影时用 [tool-definition](../tool-definition/design.md#schema_unsupported-的上限登记g-16) 判：过了 `data.tool-definition/v2#S-26` 前十二行、却编不出来或 `pattern` 超出 tool-definition 登记的上限 ⇒ `schema_unsupported`——**不被排除**，以同形替换件出现、原因 `schema_unsupported`（注册表的 `stand_in{for: schema_unsupported}`），同形照的正是这里原样存下的 `inputSchema`（S-10 末段，[D-060 §八 M37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。**上限用的是 tool-definition 那一份登记，本节点不另登记**——同一份 schema 在投影与判参数两处必须得出同一个结论。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.asset-model` v2、`data.tool-definition` v2、`data.identity-values` v1、`data.offer-expiry` v1 | [asset-model](../asset-model/README.md)、[tool-definition](../tool-definition/README.md)、已实现的 identity-values 与 offer-expiry | 随包版本 | 静态 import |
| 中性 JSON／Schema 技术依赖（不新增领域契约边） | [content-blocks](../content-blocks/README.md) 的 `JsonValue`、无损表示与 `./schema-runtime` 公开入口；仅表示／校验层使用，不消费块语义 | 随包版本；遵该技术入口固定 meta 与编译器生命周期边界 | 静态 import；推出规则模块仍只 import 类型（SC-2） |
| 被消费 | 资产治理、MCP 桥、注册表、asset-evaluation | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

领域依赖与 catalog 的契约依赖同构（[D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；CB 中性技术边另列，采用与 D-060 M52 的 asset-evaluation 无损写工具依赖相同的归属，不向 catalog 虚增块语义消费。主调度于 2026-09-26 技术接受，独立 architecture-reviewer 已核无阻断；该边已有经 AM／tool 的可达路径，不增加环。**没有配置项**。

MCP 推出结果采用 [AM 部分已知端口协议](../asset-model/design.md#mcp-部分已知声明的进程内端口协议实施细化2026-09-26)：四固定项始终照常，显式 `not_fetched` 不当空清单；未提供动作集保留自有 `actionSnapshotKind: undefined`，已获取空／非空清单均标 `'fetched'`。不得整体 `underivable` 丢失已知固定项。远端 `inputSchema` 仍只判对象并原样保留，不用引入的适配器编译远端作者 Schema；投影限制仍归 tool／MCP 桥。

## 状态、并发与失败映射

`validate(definition, value)` 与 `schemaId`／冻结的 `SCHEMA_DEF_NAMES` 给同一七项冻结定义的公开 Schema 面；值判定不从 Schema 错误反推出具名拒绝。技术上消费 content-blocks 中性 JSON／Schema 入口，不由 MCP 编译或修补对端作者的 `inputSchema`。

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值, m? }`（恰一个，`malformed` 另带 M 编号作诊断）；拼不出条目名 ⇒ `{ notProjectable }`。两者类型不相容，**都不抛异常**。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/data/mcp-endpoint/verification.md#静态检查义务)：

| 检查 | 形式 | 谁跑 |
|---|---|---|
| SC-1 前一半（正文装不下凭据） | 类型：正文类型里没有凭据成员 | 编译期 |
| SC-2（推出规则只读正文与动作集） | import 白名单（候选）：推出规则模块只许 import 类型 | 本包 |
| SC-3（`not_fetched` 不当空清单） | 两支在类型上分开，没有把 `not_fetched` 变成数组的入口 | 编译期 |
| SC-4 前一半（逐动作项的键只由前缀与原名拼成） | 键只由一个函数产出 | 本包；「不按当前动作集清理配值」归资产治理写路径 |
| SC-1 后一半（拉起不经 shell） | — | MCP 桥 |

规则都**尚无**。

## 实施缺口与消费者影响

契约的已知缺口（第八节，G-2、G-4、G-7、G-8 未决）不重抄。本节点自己的：

- **ME-1 已关闭**：`schema_unsupported` 已落进 `data.tool-definition/v2#S-4` 末段、`#S-26` 第 13 行与本契约 S-10 末段；上限的登记在 [tool-definition](../tool-definition/design.md#schema_unsupported-的上限登记g-16)（契约 G-16）。打「只能以替换件出现」标记的是 `capability.mcp-bridge` S-17 的投影——那份契约尚未同步（契约验证入口已报主线），**不在本节点**。
- **ME-2 端口的组合根**：见 [asset-model AM-5](../asset-model/design.md#实施缺口与消费者影响)。
