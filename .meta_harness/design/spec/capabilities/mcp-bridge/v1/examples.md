# 规范实例：操作的结局

属于 `capability.mcp-bridge` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
每个操作的正常结局、每个失败值、投影与结果映射的逐项取值，在这里各有至少一个实例，并注明**依据哪一条**。
值的形状（正文、副本、条目名、OAuth 绑定、凭据配值）的正反实例在 [`data.mcp-endpoint` v1 的实例](../../../data/mcp-endpoint/v1/examples.md)，本文件直接引用那里的编号。

**怎么读**：

- **本契约不发布 Schema**：操作的输入与结局用散文与表写；出现的值（工具定义、`ToolResult`、块、副本、绑定）按各自数据契约的 Schema 成立。
  哪一行要拿去过哪个 `$defs`，写在该节开头的「值的形状」。
- 「结局」一列写**成功返回**或**失败值**；失败值恰是[契约 S-15 失败值表](contract.md#s-15-这一节每个操作写全九件事)里的一个。
- **示例里的标识串只是占位**（`cred_`、`oab_`、`blk_`），词法归实现。
- 下文的租户：`(T1, a1)` = `{"organization": "org_t1", "account": "acc_a1"}`；`(T2, a1)` = `{"organization": "org_t2", "account": "acc_a1"}`。
  **具名参数在示例里取的值只为演示**（例如 `maxListPages = 3`），不是本契约的取值——本契约不填（[G-12](contract.md#十已知缺口)）。

## 1. 接入点持有的寻址

**值的形状**：`body` 按 `data.mcp-endpoint/v1` 的 `$defs/McpEndpoint`；`scope` 按 `data.asset-model/v1` 的 `$defs/HoldingScope`；`provenance` 的两项是 `capability.asset-evaluation/v1` 的 `Layer` 值（它的 S-5、S-40）；`settings.credential` 按 `data.mcp-endpoint/v1#S-13` 的取值域（还没取即缺席）。
`endpointHolding` 自己没有 Schema：它是求值交来的一组值，不跨进程（[S-5](contract.md#s-5-接入点持有的寻址)）。

**1.1 租户 `(T1, a1)` 的 `mcp:github`**（正文 `data.mcp-endpoint` 实例 1.1，持有是那边的 6.1）：

```json
{
  "tenant": { "organization": "org_t1", "account": "acc_a1" },
  "endpoint": { "category": "mcp", "name": "github" },
  "scope": { "layer": "tenant", "tenant": { "organization": "org_t1", "account": "acc_a1" } },
  "body": "<data.mcp-endpoint 实例 1.1>",
  "settings": {
    "connectionTarget": { "kind": "stdio", "command": "github-mcp-server", "args": ["stdio"], "env": { "GITHUB_TOOLSETS": "issues,repos" } },
    "credential": "cred_77f0",
    "connectTimeout": "PT10S",
    "callTimeout": "PT60S"
  },
  "provenance": {
    "connectionTarget": "tenant",
    "credential": "tenant"
  }
}
```

**1.2 租户 `(T1, a1)` 的 `mcp:linear`**：同 1.1 的写法，`settings.connectionTarget` 是 `{"kind": "streamable_http", "url": "https://mcp.linear.app/mcp"}`，`credential` 是 `"cred_91c2"`（经 OAuth 取得，绑定 `oab_3e1f` 为 `granted`），两格来处都是租户格。

**1.3 仓库经工作区带来一份同名 `mcp:linear`**（[S-34](contract.md#s-34-仓库的同名接入点拿不到租户的凭据)）：生效的正文来自工作区，`connectionTarget` 是 `{"kind": "streamable_http", "url": "https://collector.example/mcp"}`；
`credential` 仍是租户格上那个 `"cred_91c2"`；`provenance.connectionTarget` 是 `"workspace"`、`provenance.credential` 是 `"tenant"`。

| 输入 | 操作 | 结局 | 依据 |
|---|---|---|---|
| 1.1 | `refreshActions` | 成功（见第 3 节） | [S-16](contract.md#s-16-refreshactions) |
| 1.3 | `refreshActions` | `credentialUnavailable`，随值交出现存副本；**`cred_91c2` 没有被交给保管方解引用** | [S-9](contract.md#s-9-凭据的出示与取用) 第 3 条：连接目标的来处（工作区）比凭据的来处（租户）更具体 |
| 1.3，但 `settings.credential` 缺席（还没取）、`provenance.credential` 随之缺席 | `refreshActions` | 照连，不出示凭据；对端要鉴权则 `oauthRequired` 或 `credentialUnavailable` | [S-9](contract.md#s-9-凭据的出示与取用) 第 1 条 |
| 1.1，`provenance.connectionTarget` 是 `"organization"`、`provenance.credential` 是 `"tenant"` | `refreshActions` | 照常出示：组织格比租户格靠外 | [S-9](contract.md#s-9-凭据的出示与取用) 第 3 条 |
| 1.1，但 `provenance` 整个缺席 | 任一操作 | `invalidInput` | [S-5](contract.md#s-5-接入点持有的寻址)：`provenance` 不合形状不当它是「来处未知、照常出示」 |
| 1.1，但 `settings.credential` 缺席而 `provenance.credential` 是 `"tenant"` | 任一操作 | `invalidInput` | 同上：两者一在一缺 |
| 1.1，`provenance.credential` 是 `"session"`（会话创建参数把一个引用配在了会话格） | 任一需要出示凭据的操作 | `credentialUnavailable`，不出示 | [S-9](contract.md#s-9-凭据的出示与取用) 第 2 条：会话格不持有资产，没有可解引用的持有 |
| 1.1，`provenance.credential` 是 `"organization"`（求值错把一个引用算成来自组织格） | 任一需要出示凭据的操作 | `credentialUnavailable`，不出示，引用不交给保管方 | [S-9](contract.md#s-9-凭据的出示与取用) 第 2 条：组织那一层不持有 MCP 凭据（PF-002 rev 18） |
| 1.1，`provenance.connectionTarget` 是 `"session"`、`provenance.credential` 是 `"tenant"` | 任一需要出示凭据的操作 | `credentialUnavailable`，不出示 | [S-9](contract.md#s-9-凭据的出示与取用) 第 3 条：会话格在设置层序上比租户格更具体 |
| 1.1 去掉 `tenant` | 任一操作 | `invalidInput` | [S-5](contract.md#s-5-接入点持有的寻址)：身份参数没有默认值 |
| 1.1 的 `endpoint` 改为 `{"category": "tool", "name": "github"}` | 任一操作 | `invalidInput` | [S-5](contract.md#s-5-接入点持有的寻址)：类别必须是 `mcp` |
| 1.1 的 `body.timeouts.call` 改为 `"PT0S"` | 任一操作 | `invalidInput`，带 `malformed` | [S-11](contract.md#s-11-缺席时的默认答案) 第三行；`data.mcp-endpoint/v1#S-20` |
| 1.1 的 `scope` 是工作区格而 `settings.credential` 是 `"cred_77f0"` | 任一需要出示凭据的操作 | `credentialUnavailable`，不出示 | [S-5](contract.md#s-5-接入点持有的寻址)：工作区格上凭据恒缺席，本契约自己守 |

## 2. stdio 服务端拿到的环境

**演示取值**：`stdioEnvAllowlist = ["PATH", "HOME", "LANG"]`；据点进程的环境里有 `PATH`、`HOME`、`LANG`、`OPENROUTER_API_KEY`、`LINEAR_TOKEN_T2`；
保管方为 `cred_77f0` 交出的凭据本体是「环境变量 `GITHUB_PERSONAL_ACCESS_TOKEN` = 一段秘密」。

| 变量 | 进不进 1.1 拉起的程序的环境 | 依据 |
|---|---|---|
| `PATH`、`HOME`、`LANG` | 进，取据点进程里的值 | [S-6](contract.md#s-6-连接归桥不上签名不跨租户) 第 3 条：白名单 |
| `GITHUB_TOOLSETS=issues,repos` | 进 | 正文 `transport.env` |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | 进，值是那段秘密 | 凭据作为环境变量出示（[S-9](contract.md#s-9-凭据的出示与取用) 第 4 条） |
| `OPENROUTER_API_KEY`、`LINEAR_TOKEN_T2` | **不进** | 不在白名单上；**据点进程的其余环境一个也不传**（P-8） |

| 变体 | 结果 | 依据 |
|---|---|---|
| 正文 `env` 里也写了 `PATH=/opt/bin` | 程序看到的 `PATH` 是 `/opt/bin` | 同名时后者压前者：正文压白名单 |
| 凭据本体也叫 `GITHUB_TOOLSETS` | 程序看到的是凭据里的值 | 凭据压正文 |
| 正文 `args` 是 `["$HOME/x"]` | 程序收到的参数就是字面的 `$HOME/x` | 不经 shell、不做插值（`data.mcp-endpoint/v1#S-4`） |
| 同一个人在 `(T2, a1)` 下也持有 `mcp:github`、凭据 `cred_c05d` | **另拉一个进程**，环境里是 `cred_c05d` 的本体 | [S-6](contract.md#s-6-连接归桥不上签名不跨租户) 第 1 条：不跨租户身份复用连接 |

## 3. refreshActions 的结局

**值的形状**：交出的副本按 `data.mcp-endpoint/v1` 的 `$defs/ActionSnapshot`。**演示取值**：`maxListPages = 3`。
「现存副本」指这个键上此前存下的那一份。

| 此前现存副本 | 这一次发生了什么 | 结局 | 之后存储里 | 依据 |
|---|---|---|---|---|
| `not_fetched` | 连上，两页拿完，共两项 | 成功，返回 `data.mcp-endpoint` 实例 3.1 那份（`fetchedAt` 是列举开始那刻） | 3.1 那份 | [S-16](contract.md#s-16-refreshactions) ④⑤ |
| 3.1 那份 | 连上，对端现在一项也没有 | 成功，返回 `{"kind": "fetched", "fetchedAt": "…", "tools": []}` | 那份空清单 | 空清单是一次成立的答案（`data.mcp-endpoint/v1#S-23`） |
| 3.1 那份 | stdio 程序拉不起来 | `endpointUnreachable`，**随值交出 3.1 那份** | 3.1 那份，原样 | [S-16](contract.md#s-16-refreshactions) ⑥；[S-32](contract.md#s-32-连不上时照上一份清单装替换件) |
| `not_fetched` | 连不上 | `endpointUnreachable`，随值交出 `{"kind": "not_fetched"}` | `not_fetched` | [S-33](contract.md#s-33-从没连上过的接入点没有条目) |
| 3.1 那份 | 连接超时 `PT10S` 到点时第二页还没回来 | `endpointUnreachable`，随值交出 3.1 那份 | 3.1 那份 | ④：整次操作以连接超时封顶 |
| 3.1 那份 | 对端答以要 OAuth（没有出示凭据） | `oauthRequired`，随值交出 3.1 那份 | 3.1 那份 | [S-9](contract.md#s-9-凭据的出示与取用) 第 1 条 |
| 3.1 那份 | 出示了 `cred_77f0` 的本体，对端拒绝 | `credentialUnavailable`，随值交出 3.1 那份 | 3.1 那份 | 失败值表 |
| 3.1 那份 | 第二页有一项缺 `inputSchema` | `protocolError{raw}`（违例说明：哪一页哪一项缺什么），随值交出 3.1 那份 | 3.1 那份——**第一页那几项也不落** | [S-16](contract.md#s-16-refreshactions) 末段；P-5 |
| 3.1 那份 | 两页里各有一项叫 `list_issues` | `protocolError{raw}`（违例说明：对端名重复） | 3.1 那份 | 同上 |
| 3.1 那份 | 对端给到第 4 页还有游标 | `protocolError{raw}`（违例说明：超出 `maxListPages`） | 3.1 那份 | ④ |
| 3.1 那份 | 对端有一项叫 `repos/list`、一项的 `inputSchema` 是 `{"type": "object", "minProperties": -1}` | **成功**，两项都进副本 | 新副本含这两项 | 条目名拼不出、schema 不成立在投影时处理（[S-17](contract.md#s-17-projectactions)） |
| 3.1 那份（`fetchedAt` 08:00） | 两次并发刷新：A 在 08:05 开始、08:07 完成；B 在 08:06 开始、08:06:30 完成 | 两次都成功；B 先写下 `fetchedAt` 08:06 的那份；A 的 `fetchedAt` 是 08:05，不晚于已存的，**被丢弃**，A 返回的是**存储里那份 B 写下的**（它更新）| B 那份 | [S-7](contract.md#s-7-动作清单持久副本) 第 4 条：`fetchedAt` 取**开始**时刻；不晚于已存的即丢弃；P-5 |
| 任意 | 存储读不到 | `dependencyUnavailable`，**不交副本** | 不变 | [S-11](contract.md#s-11-缺席时的默认答案)：不当它是 `not_fetched` |
| 任意 | 列举完整成功，写副本时存储不可用 | `dependencyUnavailable` | 不变 | ⑧ |
| 任意 | 保管方此刻够不着 | `dependencyUnavailable`；**没有不带凭据去连** | 不变 | [S-9](contract.md#s-9-凭据的出示与取用) 第 2 条 |
| 任意 | 列举进行中桥被替换 | `bridgeWithdrawn`，不交副本 | 不变 | [S-27](contract.md#s-27-桥被替换或卸载) 第 5 条 |

## 4. projectActions 的结局

**值的形状**：`entries` 里每一份工具定义按 `data.tool-definition/v1` 的 `$defs/SingleFunctionTool`。输入是 `endpoint = mcp:github`、正文 `data.mcp-endpoint` 实例 1.1（`permissions.execute.default` 为 `"ask"`）。

**4.1 从 `data.mcp-endpoint` 实例 3.1 那份副本投影**——`excluded` 为空，副本那一支是 `fetched`，`entries` 恰两项：

```json
[
  {
    "definition": {
      "name": "github:list_issues",
      "description": "List issues in a GitHub repository.",
      "paradigm": "single",
      "input": {
        "type": "object",
        "properties": {
          "owner": { "type": "string", "description": "Repository owner." },
          "repo": { "type": "string", "description": "Repository name." }
        },
        "required": ["owner", "repo"]
      },
      "permissions": { "execute": { "default": "ask" } },
      "origin": { "kind": "mcp", "endpoint": { "category": "mcp", "name": "github" }, "remoteName": "list_issues" }
    },
    "standInOnly": null,
    "normalized": false
  },
  {
    "definition": {
      "name": "github:create_issue",
      "description": "Create a new issue in a GitHub repository.",
      "paradigm": "single",
      "input": {
        "type": "object",
        "properties": {
          "owner": { "type": "string", "description": "Repository owner." },
          "repo": { "type": "string", "description": "Repository name." },
          "title": { "type": "string", "description": "Issue title." },
          "body": { "type": "string", "description": "Issue body." }
        },
        "required": ["owner", "repo", "title"]
      },
      "permissions": { "execute": { "default": "ask" } },
      "origin": { "kind": "mcp", "endpoint": { "category": "mcp", "name": "github" }, "remoteName": "create_issue" }
    },
    "standInOnly": null,
    "normalized": false
  }
]
```

两项都是 `normalized: false`：对端给全了说明、没带 `$schema`／`title`，三样最小规范化一样都用不上。
`definition`、`standInOnly` 两个外层名只是本实例的排版；`normalized` 是契约 [S-17](contract.md#s-17-projectactions) 用的名字（主线裁定 2026-09-24 给的）。三者都**不是线上成员名**（[十二](contract.md#十二版本差异与规范工件)：本契约不发布 Schema）。`permissions.execute` 的形状以 `data.tool-definition` 的 `ExecutePermission` 为准。

| 副本里的一项（或副本本身） | 投影结局 | 依据 |
|---|---|---|
| `{"name": "search", "inputSchema": {"type": "object", "properties": {}}}`（没有 `description`） | 条目 `github:search`，`description` 为 `"对端未提供说明"`，`normalized: true` | [S-17](contract.md#s-17-projectactions) 最小规范化第 1 样：占位说的是「对端没给」，不替对端编说明 |
| `{"name": "search", "description": "", "inputSchema": {"type": "object", "properties": {}}}` | 同上 | 同上：空串不是非空说明 |
| `{"name": "repos/list", "inputSchema": {"type": "object", "properties": {}}}` | 进 `excluded`，原因 `name_unformable{malformed}`（M25） | `data.mcp-endpoint/v1#S-11`：禁 `/` |
| `{"name": "list issues", "inputSchema": {"type": "object", "properties": {}}}` | 进 `excluded`，原因 `name_unformable{malformed}`（M25） | 含空白 |
| `{"name": "issues.list", "inputSchema": {"type": "object", "properties": {}}}` | 进 `excluded`，原因 `name_unformable{malformed}`（M25） | `.` 不在 `data.tool-definition/v1#S-18` 的字符集里——MCP 协议建议里有它 |
| `{"name": "_internal", "inputSchema": {"type": "object", "properties": {}}}` | 进 `excluded`，原因 `name_unformable{name_reserved_sequence}` | 拼出 `github:_internal`，拼接处成 `:_` |
| `{"name": "ns:tool", "description": "Tool.", "inputSchema": {"type": "object", "properties": {}}}` | 条目 `github:ns:tool`，`normalized: false` | 条目名允许再有 `:` |
| `{"name": "bulk", "description": "Bulk.", "inputSchema": {"type": "object", "minProperties": -1}}` | 进 `excluded`，原因 `input_rejected{input_not_schema}` | `data.tool-definition/v1` 的 `input_not_schema`；顶层不是恰 `{"type": "object"}`，第 3 样不适用 |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object"}}` | 条目 `github:search`，`input` 为 `{"type": "object", "properties": {}}`，`normalized: true` | 最小规范化第 3 样：视为无参数（主线裁定 2026-09-24，原 G-18） |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "additionalProperties": false}}` | 进 `excluded`，原因 `input_rejected{malformed}`（M26） | 顶层没带 `properties`（M26），而它不是恰 `{"type": "object"}`——**第 3 样只认那一种写法** |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "properties": {"q": {"type": "string"}}}}` | 条目 `github:search`，`input.properties.q` 补上 `"description": "对端未提供说明"`，`normalized: true` | 最小规范化第 1 样（参数那一半） |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "properties": {"q": true}}}` | 进 `excluded`，原因 `input_rejected{parameter_description_missing}` | `parameter_description_missing`：成员 schema 是布尔 schema，补不上说明 |
| `{"name": "search", "description": "Search.", "inputSchema": {"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {}}}` | 条目 `github:search`，`input` 为 `{"type": "object", "properties": {}}`，`normalized: true` | 最小规范化第 2 样：剥掉 `$schema`，之后按 Draft 2020-12 读 |
| `{"name": "new_issue", "description": "Open an issue.", "inputSchema": {"title": "NewIssueArgs", "type": "object", "properties": {"title": {"type": "string", "title": "Title", "description": "Issue title."}}}}` | 条目 `github:new_issue`，`input` 为 `{"type": "object", "properties": {"title": {"type": "string", "description": "Issue title."}}}`，`normalized: true` | 第 2 样：两处关键字 `title` 剥掉；**名为 `title` 的参数留着**——它是参数名，不是关键字 |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "properties": {"q": {"$ref": "#/$defs/Q"}}, "$defs": {"Q": {"type": "string", "description": "Query."}}}}` | 进 `excluded`，原因 `input_rejected{malformed}`（M27） | `$ref`、`$defs` 不在可呈现子集里（M27）；**不展开引用**——三样之外不做 |
| `{"name": "export", "inputSchema": {"type": "object", "properties": {}}, "execution": {"taskSupport": "required"}}` | 条目 `github:export`，形状照常（说明是占位、`normalized: true`），**标记只能以替换件出现**，原因「本版不支持这个动作的执行方式」 | [S-17](contract.md#s-17-projectactions)；D-037；识别依据未核（[G-6](contract.md#十已知缺口)） |
| `{"name": "export", "description": "Export.", "inputSchema": {"type": "object", "properties": {}}, "execution": {"taskSupport": "optional"}}` | 普通条目，`normalized: false` | 只有 `required` 才标记 |
| 副本 `{"kind": "not_fetched"}` | `entries` 与 `excluded` 都为空；**副本那一支是 `not_fetched`** | [S-33](contract.md#s-33-从没连上过的接入点没有条目) |
| 副本 `{"kind": "fetched", "fetchedAt": "…", "tools": []}` | `entries` 与 `excluded` 都为空；副本那一支是 `fetched` | 与上一行**必须分得开** |
| 正文改为 `permissions.execute.default = "auto"` | 每个条目的 `permissions.execute.default` 都是 `"auto"` | 与 `data.mcp-endpoint` 推出的 `execute:<对端名>` 那一项的默认是同一个值 |
| 正文里 `timeouts.call` 为 `"PT60S"` | **条目里没有 `settings`** | [S-17](contract.md#s-17-projectactions)：超时是接入点持有上的设置，由 [S-19](contract.md#s-19-invoke) 执行 |
| 任意一项 | 条目里**没有** `allowBackground`、`needs`、`help`、`composes` | [S-17](contract.md#s-17-projectactions) |
| `snapshot` 是 `{"kind": "fetched", "tools": []}`（缺 `fetchedAt`） | `invalidInput`，带 `snapshot_missing_time` | `data.mcp-endpoint/v1#S-20` |

## 5. invoke：对端结果怎样成为 ToolResult

**值的形状**：`ToolResult` 按 `data.tool-definition/v1` 的 `$defs/ToolResult`，其中的块按 `data.content-blocks/v1` 的 `$defs/ContentBlock`。块 `id` 由运行时给（示例里写 `blk_n`）。

**5.1 一次 `github:create_issue`**：`invoke(1.1, "create_issue", {"owner": "acme", "repo": "svc", "title": "Flaky test"})`；对端应答
`{"content": [{"type": "text", "text": "Created issue #42"}], "isError": false}` ⇒ 成功，对端未报出错：

```json
{
  "content": [
    { "kind": "text", "id": "blk_1", "visibility": { "toHuman": true, "toModel": true }, "text": "Created issue #42" }
  ]
}
```

收场 `completed`（[S-21](contract.md#s-21-失败值与收场的对应)）。

| 对端应答里的一项 | `ToolResult.content` 里的那一块 | 依据 |
|---|---|---|
| `{"type": "image", "data": "iVBORw0KGgo=", "mimeType": "image/png"}` | `{"kind": "image", "mediaType": "image/png", "data": {"inline": "iVBORw0KGgo="}, …}` | [S-20](contract.md#s-20-对端结果怎样成为-toolresult)；结果端是「任意」，不判违反（[S-17](contract.md#s-17-projectactions)） |
| `{"type": "audio", "data": "UklGRg==", "mimeType": "audio/wav"}` | 语音块，内联，`mediaType` `audio/wav` | 同上 |
| `{"type": "resource_link", "uri": "file:///srv/docs/a.md", "name": "a.md"}` | 文本块 `"a.md\nfile:///srv/docs/a.md"` | 资源链接不丢 |
| `{"type": "resource", "resource": {"uri": "file:///srv/docs/a.md", "text": "# A"}}` | 文本块 `"file:///srv/docs/a.md\n# A"` | 内嵌文本资源 |
| `{"type": "resource", "resource": {"uri": "file:///srv/x.pdf", "mimeType": "application/pdf", "blob": "JVBERi0="}}` | 文本块：写明这里有一份没有带回的资源、它的 URI、`application/pdf`、字节数 5 | 无处存放（[G-4](contract.md#十已知缺口)）；**不静默丢** |
| `{"type": "image", "data": "iVBORw0KGgo=", "mimeType": "IMAGE/PNG"}` | 文本块：写明一项图片没有带回、原因是媒体类型不合规范写法 | **不替对端改写**（`data.content-blocks/v1#S-7`） |
| `content` 为 `[]`、`structuredContent` 为 `{"id": 42}` | 文本块 `"{\"id\":42}"` | 结构化结果兜底 |
| `content` 为 `[{"type": "text", "text": "{\"id\":42}"}]`、另有 `structuredContent` | 只有那一个文本块 | `content` 不空时不另加 |
| `{"content": [{"type": "text", "text": "repo not found"}], "isError": true}` | 那个文本块；结局是**应答**、对端报了出错 | 收场 `failed`，内容照样进结果 |

## 6. invoke 的失败与收场

| 情形 | `invoke` 的结局 | 已发出 | 收场 | 依据 |
|---|---|---|---|---|
| `action` 为 `"create_issue"`，但 `endpointHolding.endpoint` 是 `mcp:linear`（条目的 `origin.endpoint` 是 `mcp:github`） | `invalidInput` | 否 | `failed` | [S-19](contract.md#s-19-invoke) ⑧ |
| `arguments` 是 `["acme"]` | `invalidInput` | 否 | `failed` | 同上 |
| 没有现成连接，建连超时 | `endpointUnreachable` | 否 | `failed` | 同上 |
| 对端答「没有这个工具」 | `actionUnknown` | 是 | `failed` | 失败值表 |
| 请求发出后 `PT60S` 无应答 | `callTimedOut`；向对端发取消通知 | 是 | `failed` | [S-19](contract.md#s-19-invoke) 时限 |
| 请求发出后连接断开 | `endpointUnreachable`；**重连后不重发** | 是 | `failed`（不带原因码） | [S-35](contract.md#s-35-调用途中断线不重发)；[S-26](contract.md#s-26-连接的收口次序) |
| 人按下中断 | 不交回东西；向对端发取消通知；之后到达的应答丢弃 | 是 | `interrupted`（运行时判定） | [S-19](contract.md#s-19-invoke) 中断 |
| 请求发出后装配把桥换成另一版 | `bridgeWithdrawn` | 是 | `failed`，原因码 `abnormal_interruption` | [S-27](contract.md#s-27-桥被替换或卸载)；[S-38](contract.md#s-38-桥换代时在途调用落异常中断) |
| 请求还在建连时桥被卸载 | `bridgeWithdrawn` | 否 | `failed`，原因码 `abnormal_interruption` | 同上 |
| 请求发出后据点进程停机 | （没有结局交回） | 是 | `failed`，原因码 `abnormal_interruption`（运行时的恢复追补） | [S-28](contract.md#s-28-据点停机与重启) |
| 对端在调用中途发来进度 `{"progress": 3, "total": 10}` | （不影响结局）经发帧原语发一帧 | — | — | [S-19](contract.md#s-19-invoke) ⑨ |
| 对端在调用中途发来 elicitation 请求 | 按协议回「不支持」；调用照常等对端自己的应答 | — | — | [S-25](contract.md#s-25-对端来的通知与请求) |

**`unavailable` 与 `no_answer`、`backgrounded` 不出现在本表**：前者只出自尝试开始时的判定（替换件），后两者本版不会出现（[S-21](contract.md#s-21-失败值与收场的对应)）。

## 7. OAuth：发起、完成、续期、作废

**值的形状**：绑定按 `data.mcp-endpoint/v1` 的 `$defs/OAuthBinding`；引用按 `data.asset-model/v1` 的 `$defs/CredentialRef`。**演示取值**：`oauthPendingTtl = PT10M`，`unassignedCredentialRetention = PT1H`。

**7.1 一次完整的取值**：租户 `(T1, a1)` 的 `mcp:linear`，此前没有凭据（`settings.credential` 缺席）。

| 时刻 | 谁 | 做了什么 | 结局 | 之后 |
|---|---|---|---|---|
| 08:05 | 配值入口 | `beginOAuth(1.2 的寻址，scope 为租户格)` | `{"id": "oab_3e1f", "state": "pending", "since": "2026-09-23T08:05:00Z"}` ＋ 同意地址 | 绑定 `pending` |
| 08:09 | 人 | 在授权服务器上点同意 | — | — |
| 08:10 | 配值入口 | `completeOAuth("oab_3e1f", 授权码与状态参数)` | `{"id": "oab_3e1f", "state": "granted", "since": "2026-09-23T08:10:00Z"}` ＋ `"cred_91c2"` | 保管方收下凭据、与这份持有绑定；**配值未变** |
| 08:10 | 配值入口 | 经资产治理写面，以这个人的身份把 `credential` 写成 `"cred_91c2"` | （资产治理的结局） | 配值为 `cred_91c2`（即 `data.mcp-endpoint` 实例 6.2）；**下一次尝试开始时生效** |

| 变体 | 结局 | 依据 |
|---|---|---|
| 08:11 又调一次 `completeOAuth("oab_3e1f", …)` | `oauthDenied`；不产生第二份凭据 | [S-23](contract.md#s-23-completeoauth) ⑦ |
| 08:07 人又点了一次「取凭据」，`beginOAuth` 发出 `oab_7d22`；08:10 `oab_3e1f` 的应答回来 | `oab_3e1f` 已在 08:07 作废 ⇒ `oauthDenied` | [S-8](contract.md#s-8-oauth-绑定状态与迁移)：同一份持有上至多一个 `pending` |
| 人在授权服务器上点了拒绝，应答带 `access_denied` | `oauthDenied`；绑定 `revoked` | [S-8](contract.md#s-8-oauth-绑定状态与迁移) |
| 08:16 才调 `completeOAuth("oab_3e1f", …)` | `oauthDenied`（从 08:05 起过了 `PT10M`） | 过期读时判定 |
| 应答里的状态参数与这次流程不一致 | `oauthDenied` | [S-23](contract.md#s-23-completeoauth) ② |
| 换来凭据后保管方此刻不可用 | `dependencyUnavailable`；换来的凭据丢弃；绑定留 `pending`、到 08:15 作废 | [S-23](contract.md#s-23-completeoauth) ⑧ |
| `beginOAuth` 对 `mcp:github`（stdio） | `oauthNotApplicable` | [S-22](contract.md#s-22-beginoauth) ③ |
| `beginOAuth` 的 `scope` 是工作区格（生效的那份来自工作区） | `oauthNotApplicable` | 同上：连接目标来自工作区，取到的租户凭据不会出示给它 |
| `beginOAuth` 的 `scope` 是组织格 `{"layer": "organization", "organization": "org_t1"}`（租户格上还没有这份持有） | `oauthNotApplicable`；不写绑定 | 同上：组织那一层不持有 MCP 凭据（PF-002 rev 18）；要先以 `organization` 那一支在租户格持有它、`scope` 成了租户格再来取（`data.asset-model/v1#S-19`） |
| 08:10 拿到 `cred_91c2`，但写配值时治理中心不可达；人没再试 | 09:10 保管方丢弃那份凭据，`oab_3e1f` 转 `revoked` | [S-37](contract.md#s-37-oauth-取到的引用配不上就作废) |

**7.2 续期与作废**（接 7.1，配值已是 `cred_91c2`）：

| 发生了什么 | 结果 | 依据 |
|---|---|---|
| 令牌到期前，桥向授权服务器续上 | 配值仍是 `cred_91c2`，绑定仍是 `granted`、`since` 仍是 08:10；**没有卡片、没有一次「设置被改」** | [S-24](contract.md#s-24-续期清值与作废) 第 1 条；[S-36](contract.md#s-36-续期不打扰任何人) |
| 授权服务器明确拒绝续期 | `oab_3e1f` 转 `revoked`；此后解引用得 `credentialUnavailable`；下一次尝试 `mcp:linear` 的动作不可用、原因可查 | 第 2 条 |
| 授权服务器暂时够不着 | 绑定仍 `granted`；续上之前 `credentialUnavailable`；按间隔重试；**不出示已过期的令牌** | 第 2 条 |
| 有人把那一格的 `credential` 配值清掉（`capability.asset-governance` 的 `clearAssignment`） | `cred_91c2` 解引用不出；`oab_3e1f` 转 `revoked`；保管方丢弃本体；正在用它的连接不再接新调用，在途的照常完成 | 第 3 条 |
| 同一个人切到 `(T2, a1)` | 那一份持有看不到 `cred_91c2`；抄过去也解引用不出 | P-1；`data.asset-model/v1#S-23` 第 4 条 |
| 同一个 `(T1, a1)` 在第二台机器上用 `mcp:linear` | 那台机器上没有 `oab_3e1f`，`cred_91c2` 解引用不出 ⇒ `credentialUnavailable`；在那台机器上再取一次、配上 `cred_b204` 之后，第一台机器上的 `oab_3e1f` 转 `revoked` | [S-8](contract.md#s-8-oauth-绑定状态与迁移)：凭据跟机器；后果见 [G-17](contract.md#十已知缺口) |

## 8. 通知、收口与换代

| 发生了什么 | 结果 | 依据 |
|---|---|---|
| 一次尝试进行中，对端发来 `tools/list_changed` | 记一笔；这次尝试钉住的动作集不变；不立即重新列举 | [S-25](contract.md#s-25-对端来的通知与请求)；P-7 |
| 对端发来日志通知，内容里出现了 `GITHUB_PERSONAL_ACCESS_TOKEN` 的值 | 留存时那段被替换成固定遮罩 | [S-13](contract.md#s-13-凭据与引用不进任何呈现) |
| stdio 服务端向 stderr 打印了它的令牌 | 同上；stderr 在连接活着时持续排空 | [S-26](contract.md#s-26-连接的收口次序) |
| `mcp:github` 的连接因闲置被关，它拉起的 `github-mcp-server` 又拉起了两个子进程 | 关传输 → 三个进程先被请求退出，`stdioTerminateGrace` 之后仍在的被强制终止 → 排空 stderr | [S-26](contract.md#s-26-连接的收口次序)；P-12 |
| 据点进程被强杀后重启，上次的 `github-mcp-server` 还活着 | 新的桥不复用它、不向它发请求；从零拉起一个新的 | [S-28](contract.md#s-28-据点停机与重启) |
| 装配把桥换成接替的一份，此刻 `github:create_issue` 一次在途、一次 `refreshActions` 在途 | 前者 `bridgeWithdrawn`（已发出）→ `failed{abnormal_interruption}`；后者 `bridgeWithdrawn`、不写副本；然后按 S-26 收口；接替者从零建连 | [S-27](contract.md#s-27-桥被替换或卸载)；[S-38](contract.md#s-38-桥换代时在途调用落异常中断) |
| 同一时刻一个本地工具的实现被撤下，它有一次执行在途 | 那次执行照常跑完 | [S-27](contract.md#s-27-桥被替换或卸载) 第 3 条：两者不同是有意的 |

## 9. 起草者逐条自核

**没有运行任何校验器**：第 1、3、4、5、7 节出现的值只经起草者手核与各自数据契约的 Schema 对照，**手核不是证据**；验证义务与状态在[验证入口](../verification.md)。

- 第 4.1 节两份工具定义：成员集合恰是 `SingleFunctionTool` 的必填六项；`origin.kind` 为 `mcp` 时没有 `composes`；没有 `settings`，因此不触发 `backgroundThreshold` 与 `allowBackground` 的联动。
- 第 5.1 节 `ToolResult` 只有 `content`；文本块带 `id` 与 `visibility`，没有 `renderings`／`transcript`。
- 第 7 节绑定的三个状态、`since` 的取法与 `data.mcp-endpoint` 实例第 5 节一致；7.1 走到的终点（`oab_3e1f` `granted`、`since` 08:10、配值 `cred_91c2`）就是那边实例 6.2 记下的状态。
