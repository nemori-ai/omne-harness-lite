# mcp-endpoint 实现设计

契约：[`data.mcp-endpoint` v1](../../../../spec/data/mcp-endpoint/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)（`malformed` 带 M 编号，清单项即 M 编号）。
条目名合不合 `data.tool-definition/v1#S-18` 用 [tool-definition](../tool-definition/README.md) 那一份 `ToolName` 判，**不另写**。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。资产治理、MCP 桥、注册表、求值各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；`mcpBodyContract`（asset-model 端口的那一份）是普通值 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听** | — |
| 存储 | **无**：动作清单副本按持有保存、只由桥写（`capability.mcp-bridge/v1#S-7`），调用方把它交进推出规则 | S-9 |

### 装配给 vs 协议给

[第五节](../../../../spec/data/mcp-endpoint/v1/contract.md#五装配给与协议给)三行里，本节点只在「表示层校验在每个接收边界重做」一行出力（`judgeMcpEndpoint` 这一个纯入口）；
「OAuth 绑定号部署内唯一、不可猜」归单一生成点（资产治理），「stdio 在据点机上拉起」归 MCP 桥。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/mcp-endpoint/v1/contract.md#s-1-接入点正文)～[S-10](../../../../spec/data/mcp-endpoint/v1/contract.md#s-10-对端动作描述)、[S-12](../../../../spec/data/mcp-endpoint/v1/contract.md#s-12-oauth-绑定)、[S-13](../../../../spec/data/mcp-endpoint/v1/contract.md#s-13-凭据配值的取值域) 正文、连接目标、动作清单副本、对端动作描述、OAuth 绑定、凭据配值域 | 类型 `McpEndpoint`、`ActionSnapshot`（`fetched`／`not_fetched` 两支类型上分开）、`McpToolDescriptor`（其余成员原样保留） | 正文类型里没有任何成员装得下凭据；`inputSchema` 在这里只判「是对象」 | V-1、V-3；SC-1、SC-3 |
| [S-11](../../../../spec/data/mcp-endpoint/v1/contract.md#s-11-动作条目名) 动作条目名 | `actionEntryName(endpointName, remoteName) → { ok } \| { notProjectable }` | 拼 `endpointName + ":" + remoteName`，用 tool-definition 的 `ToolName` 判；**不改写**拼不出的名字 | V-2 |
| [S-26](../../../../spec/data/mcp-endpoint/v1/contract.md#s-26-接入点-name-登记时收窄) 登记时收窄 | `mcpBodyContract` 的名字收窄，报 `name_not_projectable` | 四条逐条判（字符集、三种相邻、不以 `_` 结尾、转写后 ≤ 125） | V-2 |
| [S-14](../../../../spec/data/mcp-endpoint/v1/contract.md#s-14-推出规则五类项)～[S-17](../../../../spec/data/mcp-endpoint/v1/contract.md#s-17-工作区格上的这些项) 推出规则（正文＋动作集） | `mcpBodyContract` 的推属性（显式收动作集副本） | 逐动作项的键 = `execute:` ＋ 对端动作名原样 | SC-2、SC-4 |
| [S-18](../../../../spec/data/mcp-endpoint/v1/contract.md#s-18-规范表示)～[S-21](../../../../spec/data/mcp-endpoint/v1/contract.md#s-21-表示层拒绝不是判定也不修补) 七个拒绝值、M1～M13 | `judgeMcpEndpoint(value)` | `url` 的四条（S-5）用 WHATWG `URL` 解析后逐条判，带 userinfo 即 `url_invalid` | V-2 |

**远端参数 schema 不在这里判**：对端 `inputSchema` 能不能成为工具定义的参数，由 MCP 桥在投影时用 [tool-definition](../tool-definition/design.md#参数判定用-ajv-编译作者的-schema) 判；编译不了或 `pattern` 超出实现上限 ⇒ `schema_unsupported`，那一条动作条目在注册表里是 `stand_in{for: schema_unsupported}`（[D-040 §八 M37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；契约条款由修复波落，本节点在条款落定后对齐引用）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.asset-model` v1、`data.tool-definition` v1、`data.identity-values` v1、`data.offer-expiry` v1 | [asset-model](../asset-model/README.md)、[tool-definition](../tool-definition/README.md)、已实现的 identity-values 与 offer-expiry | 随包版本 | 静态 import |
| 被消费 | 资产治理、MCP 桥、注册表、asset-evaluation | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

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

- **ME-1 `schema_unsupported` 的引用坐标**：M37 裁定的拒绝值由修复波落进 `data.tool-definition/v1#S-4` 与本契约；落定之前本节点的说法以 D-040 §八 M37 的措辞为准。owner：本节点（条款落定后对齐）。
- **ME-2 端口的组合根**：见 [asset-model AM-5](../asset-model/design.md#实施缺口与消费者影响)。
