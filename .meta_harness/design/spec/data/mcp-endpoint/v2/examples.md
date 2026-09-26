# 规范实例：合法与非法

属于 `data.mcp-endpoint` v2 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`mcp-endpoint.schema.json`](mcp-endpoint.schema.json) 的七个定义项在这里各有一组正反实例，
非法的一律注明**拒绝值**与**被哪一条挡住**。连接、投影、调用与 OAuth 流程的实例在 [`capability.mcp-bridge` v2 的实例](../../../capabilities/mcp-bridge/v2/examples.md)。

**怎么读**：

- 每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
- **表格行**：第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
  第三列是按 [S-20](contract.md#s-20-表示层拒绝值与判定次序) 定出的**拒绝值**（合法的写 `—`）；第四列是依据条款。
- **大实例**写成带编号的 JSON 代码块；**变体行**写「在 X 上改动 Y」，机检时把改动应用到那个基准实例再求值。
- **「拒绝值」一列不参与 Schema 机检**——Schema 只说通过与否，拒绝值的名字与优先级是契约的规则。

**三条读法上的边界：**

- **`通过` 只说形状合规。**对端动作名不重复、凭据引用是不是保管方发出的——都不在 Schema 的能力范围内，见[第 9 节](#9-schema-挡不住但同样非法的)。
- **示例里的标识串只是占位**，词法归实现；不要从 `cred_`、`oab_`、`ast_` 这样的前缀推出任何规则。
- **除[第 8 节](#8-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**；第 8 节专门演示优先级。

下文反复出现的租户：`(T1, a1)` = `{"organization": "org_t1", "account": "acc_a1"}`；`(T2, a1)` = `{"organization": "org_t2", "account": "acc_a1"}`。时刻一律写成 UTC 的 RFC 3339 串。

## 1. 接入点正文

**校验对象**：`$defs/McpEndpoint`

**1.1 一个 stdio 接入点**（能力标识 `mcp:github`）——Schema：通过；拒绝值：—；依据 [S-1](contract.md#s-1-接入点正文)、[S-4](contract.md#s-4-stdio)

```json
{
  "transport": {
    "kind": "stdio",
    "command": "github-mcp-server",
    "args": ["stdio"],
    "env": { "GITHUB_TOOLSETS": "issues,repos" }
  },
  "timeouts": { "connect": "PT10S", "call": "PT60S" },
  "permissions": { "execute": { "default": "ask" } }
}
```

**1.2 一个 streamable_http 接入点**（能力标识 `mcp:linear`，对端要 OAuth）——Schema：通过；拒绝值：—；依据 [S-1](contract.md#s-1-接入点正文)、[S-5](contract.md#s-5-streamable_http)

```json
{
  "transport": { "kind": "streamable_http", "url": "https://mcp.linear.app/mcp" },
  "timeouts": { "connect": "PT15S", "call": "PT2M" },
  "permissions": { "execute": { "default": "ask" } }
}
```

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| 在 1.1 上删掉 `env` | 通过 | — | [S-4](contract.md#s-4-stdio)：不声明＝作者不加任何变量 |
| 在 1.1 上 `args` 改为 `[]` | 通过 | — | [S-4](contract.md#s-4-stdio)：可以为空数组 |
| 在 1.2 上 `permissions.execute.default` 改为 `"auto"` | 通过 | — | [S-8](contract.md#s-8-执行权限的作者默认)：作者可以声明自动；**被工作区提供时这个值不被认**（[S-17](contract.md#s-17-工作区格上的这些项)） |
| 在 1.1 上加 `"credential": "ghp_16C7e42F292c6912E7710c838347Ae178B4a"` | 拒绝 | `malformed`（M4） | [S-6](contract.md#s-6-正文不收凭据)：**正文里没有凭据的位置**，不忽略这个成员后接受（[S-22](contract.md#s-22-正文里写凭据被拒)） |
| 在 1.1 上加 `"credential": "cred_77f0"`（一个引用） | 拒绝 | `malformed`（M4） | [S-6](contract.md#s-6-正文不收凭据)：**引用也不行**——凭据只在持有上 |
| 在 1.2 上加 `"oauth": {"id": "oab_3e1f", "state": "granted", "since": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed`（M4） | [S-6](contract.md#s-6-正文不收凭据)：OAuth 绑定按持有保存，不在正文 |
| 在 1.2 上加 `"actions": {"kind": "not_fetched"}` | 拒绝 | `malformed`（M4） | [S-9](contract.md#s-9-动作清单副本)：副本不在正文 |
| 在 1.2 上加 `"name": "linear"` | 拒绝 | `malformed`（M4） | [S-2](contract.md#s-2-身份只在能力标识上)：身份只在能力标识上 |
| 在 1.1 上删掉 `timeouts` | 拒绝 | `malformed`（M3） | [S-7](contract.md#s-7-两项超时的作者默认)：必填、没有缺省 |
| 在 1.1 上 `timeouts.connect` 改为 `"PT0S"` | 拒绝 | `malformed`（M8） | [S-7](contract.md#s-7-两项超时的作者默认)：不为零 |
| 在 1.1 上 `timeouts.call` 改为 `"PT0H0M"` | 拒绝 | `malformed`（M8） | [S-7](contract.md#s-7-两项超时的作者默认)：零的另一种写法 |
| 在 1.1 上 `timeouts.call` 改为 `"P1D"` | 拒绝 | `malformed`（M8） | `data.tool-definition/v2#S-14`：不收日历单位 |
| 在 1.1 上 `timeouts.call` 改为 `60` | 拒绝 | `malformed`（M8） | 同上：不是时长字符串 |
| 在 1.2 上删掉 `permissions.execute` | 拒绝 | `malformed`（M3） | [S-8](contract.md#s-8-执行权限的作者默认)：**不补成任何一档** |
| 在 1.2 上 `permissions.execute.default` 改为 `"yolo"` | 拒绝 | `malformed`（M6） | [S-8](contract.md#s-8-执行权限的作者默认) |
| 在 1.2 上 `permissions` 加 `"use": {"default": "member"}` | 拒绝 | `malformed`（M4） | [S-8](contract.md#s-8-执行权限的作者默认)：「能不能用」是 `data.asset-model` 保留的 `usableBy`，不在正文 |
| 在 1.2 上 `permissions.execute` 改为 `{"default": ["ask", "forbid"]}` | 拒绝 | `malformed`（M6） | [S-8](contract.md#s-8-执行权限的作者默认)：`default` 是一个取值，不是集合 |
| `[]` | 拒绝 | `malformed`（M1） | [S-1](contract.md#s-1-接入点正文) |

## 2. 连接目标

**校验对象**：`$defs/McpTransport`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/srv/docs"]}` | 通过 | — | [S-4](contract.md#s-4-stdio) |
| `{"kind": "stdio", "command": "/usr/local/bin/mcp server", "args": []}` | 通过 | — | [S-4](contract.md#s-4-stdio)：程序路径里的空格是路径的一部分，不是分词——**`command` 不被当成 shell 命令行** |
| `{"kind": "stdio", "command": "srv", "args": ["$HOME/x"]}` | 通过 | — | [S-4](contract.md#s-4-stdio)：`$HOME` 原样是五个字符，**不插值** |
| `{"kind": "stdio", "command": "srv", "args": [""]}` | 通过 | — | [S-4](contract.md#s-4-stdio)：单项可以是空串 |
| `{"kind": "streamable_http", "url": "http://127.0.0.1:8931/mcp"}` | 通过 | — | [S-5](contract.md#s-5-streamable_http)：不强制 https（[G-8](contract.md#八已知缺口)） |
| `{"kind": "streamable_http", "url": "http://[::1]:3000/mcp?tenant=a"}` | 通过 | — | [S-5](contract.md#s-5-streamable_http)：IPv6 字面量与查询串都合形状 |
| `{"kind": "streamable_http", "url": "https://mcp.example.com/mcp?api_key=sk_live_9f"}` | 通过 | — | [S-5](contract.md#s-5-streamable_http)：**查询串里的秘密挡不住**——只按形状判 |
| `{"kind": "sse", "url": "https://mcp.example.com/sse"}` | 拒绝 | `transport_unknown` | [S-3](contract.md#s-3-连接目标两种闭合)：旧式 SSE 不桥（D-037） |
| `{"kind": "Stdio", "command": "srv", "args": []}` | 拒绝 | `transport_unknown` | [S-19](contract.md#s-19-判别式与枚举闭合)：**不被折成 `stdio`** |
| `{"kind": "websocket", "url": "wss://mcp.example.com"}` | 拒绝 | `transport_unknown` | [S-3](contract.md#s-3-连接目标两种闭合) |
| `{"command": "srv", "args": []}` | 拒绝 | `malformed`（M2） | [S-19](contract.md#s-19-判别式与枚举闭合)：判别成员缺席，**不按有 `command` 猜成 stdio** |
| `{"kind": "stdio", "command": "", "args": []}` | 拒绝 | `command_empty` | [S-4](contract.md#s-4-stdio) |
| `{"kind": "stdio", "command": " 　 ", "args": []}` | 拒绝 | `command_empty` | [S-4](contract.md#s-4-stdio)：全是空白（含全角空格） |
| `{"kind": "stdio", "command": "srv"}` | 拒绝 | `malformed`（M3） | [S-4](contract.md#s-4-stdio)：`args` 必填，缺席不当作空数组 |
| `{"kind": "stdio", "command": "srv", "args": "--port 1"}` | 拒绝 | `malformed`（M5） | [S-4](contract.md#s-4-stdio)：参数是数组，不是一条要切分的字符串 |
| `{"kind": "stdio", "command": "srv", "args": [], "env": {"A=B": "c"}}` | 拒绝 | `malformed`（M9） | [S-4](contract.md#s-4-stdio)：变量名不含 `=` |
| `{"kind": "stdio", "command": "srv", "args": [], "env": {"LEVEL": 3}}` | 拒绝 | `malformed`（M5） | [S-4](contract.md#s-4-stdio)：值是字符串 |
| `{"kind": "stdio", "command": "srv", "args": [], "cwd": "/tmp"}` | 拒绝 | `malformed`（M4） | [S-4](contract.md#s-4-stdio)：本版没有工作目录这一项 |
| `{"kind": "streamable_http", "url": "https://bot:ghp_16C7e42F@mcp.example.com/mcp"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http) 第 4 条、[S-6](contract.md#s-6-正文不收凭据)：**不删掉 userinfo 后接受** |
| `{"kind": "streamable_http", "url": "ftp://mcp.example.com/"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http) 第 1 条 |
| `{"kind": "streamable_http", "url": "HTTPS://mcp.example.com/"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http) 第 1 条：scheme 只收小写，**不被改写** |
| `{"kind": "streamable_http", "url": "mcp.example.com/mcp"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http) 第 1 条：不是绝对地址 |
| `{"kind": "streamable_http", "url": "https:///mcp"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http) 第 2 条：没有主机 |
| `{"kind": "streamable_http", "url": "https://mcp.example.com/mcp#tools"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http) 第 3 条：带片段 |
| `{"kind": "streamable_http", "url": "https://mcp.example.com/m cp"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http) 第 3 条：含空白 |
| `{"kind": "streamable_http", "url": "https://mcp.example.com/mcp\n"}` | 拒绝 | `url_invalid` | [S-5](contract.md#s-5-streamable_http)：**`$` 的回归用例**——pattern 以 `(?![\s\S])` 收尾 |
| `{"kind": "streamable_http", "url": "https://mcp.example.com/", "headers": {"Authorization": "Bearer x"}}` | 拒绝 | `malformed`（M4） | [S-6](contract.md#s-6-正文不收凭据)：请求头不是正文的成员，鉴权经凭据配值 |

## 3. 动作清单副本与对端动作描述

**校验对象**：`$defs/ActionSnapshot`（3.1～3.3 与表 3a）；`$defs/McpToolDescriptor`（表 3b）

**3.1 一份已取得的副本**（`mcp:github` 在租户 `(T1, a1)` 那份持有上）——Schema：通过；拒绝值：—；依据 [S-9](contract.md#s-9-动作清单副本)、[S-10](contract.md#s-10-对端动作描述)

```json
{
  "kind": "fetched",
  "fetchedAt": "2026-09-23T08:00:00Z",
  "tools": [
    {
      "name": "list_issues",
      "description": "List issues in a GitHub repository.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "owner": { "type": "string", "description": "Repository owner." },
          "repo": { "type": "string", "description": "Repository name." }
        },
        "required": ["owner", "repo"]
      }
    },
    {
      "name": "create_issue",
      "description": "Create a new issue in a GitHub repository.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "owner": { "type": "string", "description": "Repository owner." },
          "repo": { "type": "string", "description": "Repository name." },
          "title": { "type": "string", "description": "Issue title." },
          "body": { "type": "string", "description": "Issue body." }
        },
        "required": ["owner", "repo", "title"]
      },
      "annotations": { "destructiveHint": false, "openWorldHint": true }
    }
  ]
}
```

**3.2 还没取过**——Schema：通过；拒绝值：—；依据 [S-9](contract.md#s-9-动作清单副本) 第 1 条

```json
{ "kind": "not_fetched" }
```

**3.3 取到了，对端没有动作**——Schema：通过；拒绝值：—；依据 [S-9](contract.md#s-9-动作清单副本)：**与 3.2 不是一回事**（[S-23](contract.md#s-23-还没取过与空清单不是一回事)）

```json
{ "kind": "fetched", "fetchedAt": "2026-09-23T08:05:00Z", "tools": [] }
```

**表 3a：副本**

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "fetched", "tools": []}` | 拒绝 | `snapshot_missing_time` | [S-9](contract.md#s-9-动作清单副本) 第 2 条：**不补成现在** |
| `{"kind": "fetched", "fetchedAt": "2026-09-23", "tools": []}` | 拒绝 | `malformed`（M7） | `data.offer-expiry/v1#S-22`：日期不是时间点 |
| `{"kind": "fetched", "fetchedAt": "2026-09-23T08:00:00Z"}` | 拒绝 | `malformed`（M3） | [S-9](contract.md#s-9-动作清单副本)：`tools` 必填，缺席不是空清单 |
| `{"tools": []}` | 拒绝 | `malformed`（M2） | [S-19](contract.md#s-19-判别式与枚举闭合) |
| `{"kind": "stale", "fetchedAt": "2026-09-23T08:00:00Z", "tools": []}` | 拒绝 | `malformed`（M6） | [S-19](contract.md#s-19-判别式与枚举闭合)：两支闭合 |
| `{"kind": "not_fetched", "tools": []}` | 拒绝 | `malformed`（M4） | [S-9](contract.md#s-9-动作清单副本)：「不知道」那一支不带清单 |
| 在 3.1 上加 `"resources": []` | 拒绝 | `malformed`（M4） | [S-9](contract.md#s-9-动作清单副本) 第 6 条：本版只记 tools（D-037） |
| 在 3.1 上把第二项的 `inputSchema` 改为 `true` | 拒绝 | `malformed`（M5） | [S-10](contract.md#s-10-对端动作描述)：参数 schema 是对象 |
| `null` | 拒绝 | `malformed`（M1） | [S-9](contract.md#s-9-动作清单副本)：**`null` 不是「还没取」** |

**表 3b：对端动作描述**

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"name": "search", "inputSchema": {"type": "object"}}` | 通过 | — | [S-10](contract.md#s-10-对端动作描述)：`description` 可选 |
| `{"name": "search", "description": "", "inputSchema": {"type": "object"}}` | 通过 | — | [S-10](contract.md#s-10-对端动作描述)：可以为空串 |
| `{"name": "repo/admin", "inputSchema": {"type": "object"}}` | 通过 | — | [S-10](contract.md#s-10-对端动作描述)：**原样存得下**；它拼不出条目名（[S-11](contract.md#s-11-动作条目名)），那是投影的事 |
| `{"name": "run", "inputSchema": {"type": "string"}}` | 通过 | — | [S-10](contract.md#s-10-对端动作描述)：这里只要求是对象；能不能成为工具参数在投影时判 |
| `{"name": "grep", "description": "按正则搜", "inputSchema": {"type": "object", "properties": {"q": {"type": "string", "description": "正则", "pattern": "^(a+)+$"}}}}` | 通过 | — | [S-10](contract.md#s-10-对端动作描述)：**原样存下**。投影时它过了 `data.tool-definition` 表示层的前十二道，在一个回溯保护不收嵌套无界量词的实现上是 `schema_unsupported`——**不被排除**，以同形替换件出现、原因 `schema_unsupported`（M37）；同形照的就是这里存下的 `inputSchema` |
| `{"name": "run", "inputSchema": {"type": "object"}, "execution": {"taskSupport": "required"}}` | 通过 | — | [S-10](contract.md#s-10-对端动作描述)：**其余成员原样保留**，投影可能要读它 |
| `{"name": "", "inputSchema": {"type": "object"}}` | 拒绝 | `malformed`（M11） | [S-10](contract.md#s-10-对端动作描述) |
| `{"name": "search"}` | 拒绝 | `malformed`（M3） | [S-10](contract.md#s-10-对端动作描述)：协议里的必填项；**不补一个 `{}`** |
| `{"name": "search", "description": 5, "inputSchema": {}}` | 拒绝 | `malformed`（M11） | [S-10](contract.md#s-10-对端动作描述) |

## 4. 动作条目名

**校验对象**：`$defs/McpActionName`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"github:create_issue"` | 通过 | — | [S-11](contract.md#s-11-动作条目名)：接入点 `mcp:github` ＋ 对端 `create_issue` |
| `"github:issues.list"` | 拒绝 | `malformed`（M13） | [S-11](contract.md#s-11-动作条目名) 第 1 条：`.` 不在 `data.tool-definition/v2#S-18` 的字符集里——MCP 协议建议里有 `.`，**这个对端动作拼不出条目名** |
| `"github:_private"` | 拒绝 | `name_reserved_sequence` | [S-11](contract.md#s-11-动作条目名) 第 1 条：拼接处成 `:_`，转写后与别的名字对不回唯一一个 |
| `"github:list__all"` | 拒绝 | `name_reserved_sequence` | [S-11](contract.md#s-11-动作条目名) 第 1 条：含 `__` |
| `"a:b:c"` | 通过 | — | [S-11](contract.md#s-11-动作条目名)：**拼法不可拆**——它可能是 `a`＋`b:c`，也可能是 `a:b`＋`c`，这就是 [G-2](contract.md#八已知缺口) 的撞名 |
| `"github:repo/admin"` | 拒绝 | `malformed`（M13） | [S-11](contract.md#s-11-动作条目名) 第 1 条：含 `/`——**这个对端动作拼不出条目名，本契约不改写它** |
| `"github:create issue"` | 拒绝 | `malformed`（M13） | [S-11](contract.md#s-11-动作条目名) 第 1 条：含空白 |
| `"create_issue"` | 拒绝 | `malformed`（M13） | [S-11](contract.md#s-11-动作条目名)：少了接入点那一段 |
| `"mcp:github/create_issue"` | 拒绝 | `malformed`（M13） | [S-11](contract.md#s-11-动作条目名)：**不是能力标识规范串**，也不嵌一个 |

**说明**：`McpActionName` 是一个派生出来的名字，不是一份被写入存储的输入；这一节的「拒绝」是说**这个串不是一个合法的条目名**。它的拒绝值（`malformed`（M13）；含 `__`、`_:`、`:_` 的是 `name_reserved_sequence`，与 `data.tool-definition` 对工具定义 `name` 的同一种违规同值）只为让表格完整——实际上它由投影生成，**生成不出时怎样收归 `capability.mcp-bridge`**，不存在「有人交来一个坏条目名」这条路。

### 4.1 接入点的 name

**校验对象**：`$defs/McpEndpointName`（[S-26](contract.md#s-26-接入点-name-登记时收窄)）。这些串是登记一份 `mcp` 资产时它能力标识的 name。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"github"` | 通过 | — | 接上 `:x` 得 `github:x`，合 `data.tool-definition/v2#S-18` |
| `"issue-tracker"` | 通过 | — | `-` 在字符集里 |
| `"acme:search"` | 通过 | — | 名字里可以再有 `:`（`data.asset-model/v2#S-2` 许冒号）；撞名归 [G-2](contract.md#八已知缺口) |
| `"acme:"` | 通过 | — | 以 `:` 结尾不犯规：拼出 `acme::x`，转写成 `acme____x`，逆转写唯一 |
| `"git.hub"` | 拒绝 | `name_not_projectable` | 第 1 条：`.` 不在字符集里——合 `data.asset-model/v2#S-2`，却一个动作也拼不出 |
| `"my_mcp_"` | 拒绝 | `name_not_projectable` | 第 3 条：以 `_` 结尾，拼接处成 `_:` |
| `"a__b"` | 拒绝 | `name_not_projectable` | 第 2 条：含 `__` |
| `"a:_b"` | 拒绝 | `name_not_projectable` | 第 2 条：含 `:_` |
| 126 个 `a` | 拒绝 | `name_not_projectable` | 第 4 条：码点数已超过 125 |
| `"x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x"` | **通过** · 表示层拒绝 | `name_not_projectable` | 第 4 条：85 个码点、其中 42 个 `:`，转写后 127 个字符——`:` 算两个的那一半 Schema 管不到 |
| `"git/hub"` | 拒绝 | **`name_invalid`**（`data.asset-model` 的） | 违反 `data.asset-model/v2#S-2` 本身（含 `/`），报那边的值，不是本契约的 |
| `""` | 拒绝 | **`name_invalid`**（`data.asset-model` 的） | 同上：空串 |

**不修补**：`"git.hub"` 不会被改成 `"git_hub"` 接受，`"my_mcp_"` 不会被去掉结尾的 `_`（[S-26](contract.md#s-26-接入点-name-登记时收窄)）。

## 5. OAuth 绑定

**校验对象**：`$defs/OAuthBinding`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"id": "oab_3e1f", "state": "granted", "since": "2026-09-23T08:10:00Z"}` | 通过 | — | [S-12](contract.md#s-12-oauth-绑定)：`since` 就是「什么时候取的」 |
| `{"id": "oab_52a0", "state": "pending", "since": "2026-09-23T08:09:00Z"}` | 通过 | — | [S-12](contract.md#s-12-oauth-绑定) |
| `{"id": "oab_52a0", "state": "revoked", "since": "2026-09-23T08:40:00Z"}` | 通过 | — | [S-12](contract.md#s-12-oauth-绑定)：终态 |
| `{"id": "oab_3e1f", "state": "expired", "since": "2026-09-23T08:10:00Z"}` | 拒绝 | `malformed`（M6） | [S-12](contract.md#s-12-oauth-绑定)：三值闭合；过期是 `revoked` 的一种来由，不是第四个状态 |
| `{"id": "oab_3e1f", "state": "granted", "since": "2026-09-23T08:10:00Z", "credential": "cred_91c2"}` | 拒绝 | `malformed`（M4） | [S-12](contract.md#s-12-oauth-绑定)：**绑定里没有凭据引用**——它可以被呈现，引用不可以 |
| `{"id": "oab_3e1f", "state": "granted", "since": "2026-09-23T08:10:00Z", "accessToken": "…"}` | 拒绝 | `malformed`（M4） | 同上：更不含凭据本体 |
| `{"id": " oab_3e1f", "state": "granted", "since": "2026-09-23T08:10:00Z"}` | 拒绝 | `malformed`（M12） | [S-12](contract.md#s-12-oauth-绑定)：首字符是空白 |
| `{"state": "granted", "since": "2026-09-23T08:10:00Z"}` | 拒绝 | `malformed`（M3） | [S-12](contract.md#s-12-oauth-绑定) |

## 6. 凭据配值

**校验对象**：[S-13](contract.md#s-13-凭据配值的取值域) 那份取值域 `schema`（它引用 `data.asset-model` v2 的 `$defs/CredentialRef`）；6.1、6.2 两份持有按 `data.asset-model` v2 的 `$defs/AssetHolding` 校验。

**6.1 stdio 接入点带一个静态凭据引用**：租户 `(T1, a1)` 持有 `mcp:github`（正文 1.1），凭据配值是保管方为它发出的一个引用——Schema（`AssetHolding`）：通过；依据 [S-13](contract.md#s-13-凭据配值的取值域)、`data.asset-model/v2#S-23`

```json
{
  "holder": { "layer": "tenant", "tenant": { "organization": "org_t1", "account": "acc_a1" } },
  "capability": { "category": "mcp", "name": "github" },
  "asset": "ast_4b20",
  "basis": { "kind": "owned" },
  "versionSelection": { "kind": "current" },
  "immutable": false,
  "assignments": [
    { "item": "credential", "value": "cred_77f0", "immutable": false, "since": "2026-09-20T09:00:00Z" },
    { "item": "execute:create_issue", "value": { "allowed": ["ask"] }, "immutable": false, "since": "2026-09-20T09:00:00Z" }
  ],
  "since": "2026-09-20T02:00:00Z"
}
```

这份凭据是静态的：一个人在配值处填了一个值，保管方收下、发出 `cred_77f0`。**它怎样作 stdio 环境变量出示归 `capability.mcp-bridge`**；正文 1.1 的 `env` 里没有它，也不能有。

**6.2 streamable_http 接入点经 OAuth 取得**：租户 `(T1, a1)` 持有 `mcp:linear`（正文 1.2）；这份持有上的凭据配值是 `cred_91c2`，桥为这份持有记着一个绑定 `{"id": "oab_3e1f", "state": "granted", "since": "2026-09-23T08:10:00Z"}`（第 5 节第一行）——Schema（`AssetHolding`）：通过；依据 [S-12](contract.md#s-12-oauth-绑定)、[S-13](contract.md#s-13-凭据配值的取值域)

```json
{
  "holder": { "layer": "tenant", "tenant": { "organization": "org_t1", "account": "acc_a1" } },
  "capability": { "category": "mcp", "name": "linear" },
  "asset": "ast_8c31",
  "basis": { "kind": "owned" },
  "versionSelection": { "kind": "current" },
  "immutable": false,
  "assignments": [ { "item": "credential", "value": "cred_91c2", "immutable": false, "since": "2026-09-23T08:10:00Z" } ],
  "since": "2026-09-23T08:00:00Z"
}
```

**同一个人在另一个租户身份 `(T2, a1)` 下**持有 `mcp:linear`：那一份持有有它自己的凭据配值（比如 `cred_c05d`）与它自己的绑定，对端看到的是另一个账号；**`cred_91c2` 抄到那一份上不产生取用资格**（`data.asset-model/v2#S-23` 第 4 条）。

**表 6：凭据配值的值**（按 [S-13](contract.md#s-13-凭据配值的取值域) 的取值域 `schema`）。**这一表的「拒绝值」不是本契约的值**：取值域之外的值由写这条配值的资产治理写面判 `valueOutOfDomain`（`capability.asset-governance` v2 的 [S-38](../../../capabilities/asset-governance/v2/contract.md#s-38-assign-配值) ②），「凭据位写了非引用值」只有这一个拒绝值。

| 实例 | Schema | 拒绝值（资产治理写面） | 依据 |
|---|---|---|---|
| `"cred_77f0"` | 通过 | — | [S-13](contract.md#s-13-凭据配值的取值域)：取值域恰是 `CredentialRef` |
| `{"kind": "not_fetched"}` | 拒绝 | `valueOutOfDomain` | [S-13](contract.md#s-13-凭据配值的取值域)：**还没取是缺席**，不是一个值；撤掉是删掉那条配值 |
| `{"token": "ghp_16C7e42F292c6912E7710c838347Ae178B4a"}` | 拒绝 | `valueOutOfDomain` | [S-13](contract.md#s-13-凭据配值的取值域) |
| `{"kind": "static", "value": "ghp_16C7e42F"}` | 拒绝 | `valueOutOfDomain` | [S-13](contract.md#s-13-凭据配值的取值域)：**静态值不是另一种取值**，它经保管方成为一个引用 |
| `{"kind": "fetched"}` | 拒绝 | `valueOutOfDomain` | [S-13](contract.md#s-13-凭据配值的取值域)：取值域里没有对象 |
| `null` | 拒绝 | `valueOutOfDomain` | [S-13](contract.md#s-13-凭据配值的取值域)：**`null` 不是缺席**——还没取就是不写这条配值 |
| `""` | 拒绝 | `valueOutOfDomain` | `data.asset-model/v2#S-23`：引用非空 |
| `" cred_77f0"` | 拒绝 | `valueOutOfDomain` | `data.asset-model/v2#S-23`：首字符是空白 |
| `{"kind": "revoked"}` | 拒绝 | `valueOutOfDomain` | [S-13](contract.md#s-13-凭据配值的取值域) 末条：**失效不写回配值** |

## 7. 推出的属性声明

**校验对象**：`data.asset-model` v2 的 `$defs/AttributeDeclaration`，逐条。

**7.1 正文 1.2（`mcp:linear`）配上一份含 `list_issues`、`save_issue` 两个动作的动作集，推出的六条声明**（再加 `disabled`、`usableBy` 两条共八条）——依据 [S-14](contract.md#s-14-推出规则五类项)

```json
[
  { "item": "connectionTarget", "kind": "setting", "category": "placement_identity",
    "domain": { "kind": "open", "schema": { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/mcp-endpoint/v2/mcp-endpoint.schema.json#/$defs/McpTransport" } },
    "default": { "kind": "streamable_http", "url": "https://mcp.linear.app/mcp" } },
  { "item": "credential", "kind": "setting", "category": "placement_identity",
    "domain": { "kind": "open", "schema": { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/asset-model/v2/asset-model.schema.json#/$defs/CredentialRef" } } },
  { "item": "connectTimeout", "kind": "setting", "category": "preference",
    "domain": { "kind": "open", "schema": { "allOf": [
      { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v2/tool-definition.schema.json#/$defs/Duration" },
      { "not": { "pattern": "^PT(?:0+H)?(?:0+M)?(?:0+(?:[.]0+)?S)?(?![\\s\\S])" } } ] } },
    "default": "PT15S" },
  { "item": "callTimeout", "kind": "setting", "category": "preference",
    "domain": { "kind": "open", "schema": { "allOf": [
      { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v2/tool-definition.schema.json#/$defs/Duration" },
      { "not": { "pattern": "^PT(?:0+H)?(?:0+M)?(?:0+(?:[.]0+)?S)?(?![\\s\\S])" } } ] } },
    "default": "PT2M" },
  { "item": "execute:list_issues", "kind": "permission",
    "domain": { "kind": "enum", "values": ["forbid", "auto", "ask"] }, "default": "ask" },
  { "item": "execute:save_issue", "kind": "permission",
    "domain": { "kind": "enum", "values": ["forbid", "auto", "ask"] }, "default": "ask" }
]
```

| 实例 | 结论 | 依据 |
|---|---|---|
| 同一份正文配上 `{"kind": "not_fetched"}` | 只推出前四条（加两条保留项共六条）；**逐动作项推不出来，这是「不知道」，不是「没有」** | [S-15](contract.md#s-15-推出规则的输入正文与动作集) |
| 同一份正文配上 3.3（空清单） | 只推出前四条；**这是「对端确实没有动作」** | [S-15](contract.md#s-15-推出规则的输入正文与动作集) |
| 动作集里多了一项 `{"name": "delete_issue", …}` | 多一条 `execute:delete_issue`，其余六条逐字不变 | [S-14](contract.md#s-14-推出规则五类项) 第 1 条：确定 |
| 某个实现推出了 `{"item": "credential", …, "category": "preference"}` | **推出规则违约**——类别由本契约定死 | [S-14](contract.md#s-14-推出规则五类项) |
| 某个实现推出了 `{"item": "execute", …}`（一个接入点级的执行权限） | **推出规则违约**——执行权限是逐动作的 | [S-14](contract.md#s-14-推出规则五类项) |
| 某个实现把 `credential` 的 `default` 推成 `""` 或 `{"kind": "not_fetched"}` | **推出规则违约**——`credential` 不带默认，还没取是缺席 | [S-13](contract.md#s-13-凭据配值的取值域) |
| 某个实现推出了 `{"item": "use", …}` 或 `{"item": "usableBy", …}` | **推出规则违约**——「能不能用」是 `data.asset-model` 保留的 `usableBy`，不由本规则产出 | [S-14](contract.md#s-14-推出规则五类项) 第 3 条 |

## 8. 几处违例同时出现时取哪个拒绝值

按 [S-20](contract.md#s-20-表示层拒绝值与判定次序) 的次序，**取最靠前的那一行**；与发现的先后无关。

| 实例 | 违反了哪几条 | 拒绝值 |
|---|---|---|
| 在 1.1 上 `transport` 改为 `{"kind": "sse", "url": "https://x/sse"}`，再加 `"credential": "tok"` | `transport_unknown`、`malformed`（M4） | `transport_unknown` |
| 在 1.1 上加 `"credential": "tok"`，`transport.command` 改为 `""` | `command_empty`、`malformed`（M4） | `command_empty`（第 3 行先于第 8 行；**凭据写错地方没有插队的专门值**） |
| 在 1.2 上 `transport.url` 改为 `"HTTPS://u:p@x/"`，`timeouts.call` 改为 `"PT0S"` | `url_invalid`（userinfo 与大写 scheme 同在这一行）、`malformed`（M8） | `url_invalid` |
| 在 1.1 上 `transport.command` 改为 `" "`，`timeouts.call` 改为 `"PT0S"` | `command_empty`、`malformed`（M8） | `command_empty` |
| `{"kind": "fetched", "tools": [{"name": "a"}]}`（缺时刻，唯一一项缺 `inputSchema`） | `snapshot_missing_time`、`malformed`（M3） | `snapshot_missing_time` |
| 登记一份 `mcp` 资产：能力标识的 name 为 `"git.hub"`，正文是在 1.1 上 `transport.command` 改为 `""` | `command_empty`、`name_not_projectable` | `command_empty`（第 3 行先于第 6 行） |
| 登记一份 `mcp` 资产：name 为 `"git.hub"`，正文是 1.1 原样 | `name_not_projectable` | `name_not_projectable` |
| `{"transport": {"command": "srv", "args": []}, "credential": "tok", "timeouts": {"connect": "PT1S", "call": "PT1S"}, "permissions": {"execute": {"default": "ask"}}}` | `malformed`（M2：连接目标缺 `kind`）、`malformed`（M4：`credential`） | `malformed`（第 1 行） |
| 一个派生出的条目名 `"github:list__all.v2"`（`$defs/McpActionName`） | `name_reserved_sequence`（`__`）、`malformed`（M13：`.`） | `name_reserved_sequence`（第 7 行先于第 8 行，与 `data.tool-definition` 的次序同向） |

## 9. Schema 挡不住，但同样非法的

这些实例**Schema 都放行**，但违反契约。它们是[验证入口](../verification.md) V-3 的输入：**接收边界必须拒绝**，只信 Schema 的实现会全过。

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| 在 3.1 上把第二项的 `name` 改为 `"list_issues"` | 通过 | `malformed`（M10） | [S-9](contract.md#s-9-动作清单副本) 第 3 条：同一份副本里对端动作名不重复 |
| 一条凭据配值的值是 `"ghp_16C7e42F292c6912E7710c838347Ae178B4a"`（一枚明文令牌，形状恰是一个引用） | 通过 | **写入方违约** | [S-13](contract.md#s-13-凭据配值的取值域)：形状判不出；守在写入方——只接受保管方发出的引用 |
| 一份工作区承载清单里写 `{"capability": {"category": "mcp", "name": "linear"}, "item": "credential", "value": "cred_91c2"}` | 通过（清单形状） | **读入时滤掉并留痕** | [S-17](contract.md#s-17-工作区格上的这些项)、`data.asset-model/v2#S-24` 第 5 条 |
| 一份 `fetched` 副本是拿到一半的分页 | 通过 | **写入方违约**——它不该被写成副本 | [S-9](contract.md#s-9-动作清单副本) 第 5 条 |
| 一份 `fetched` 副本的 `tools` 被写入方按名字重排了 | 通过 | **写入方违约**——次序原样 | [S-9](contract.md#s-9-动作清单副本) 第 4 条 |
| 续期之后绑定的 `since` 变了 | 通过 | **违约**——续期不改 `since` | [S-12](contract.md#s-12-oauth-绑定) |

## 10. 起草者逐条自核

起草时逐行手核了第 1～9 节每一行的「Schema」一列与「拒绝值」一列是否与 Schema 文本、[S-20](contract.md#s-20-表示层拒绝值与判定次序) 的次序自洽；
**手核不是证据**。整批对齐（2026-09-24）时「Schema」一列跑过一次本地自检，「拒绝值」一列未机检；执行状态见[验证入口](../verification.md#结果与反例)。

已知的局限：

- 第 6、7 节引用 `data.asset-model` v2 与 `data.tool-definition` v2 的定义项；那两份是**同批候选**，它们的 `$defs` 名或形状若在评审中改了，这两节要同轮重核。
- 第 4 节的「拒绝值」只为表格完整（见该节说明）；4.1 节的拒绝值是登记时真会报出的值（[S-26](contract.md#s-26-接入点-name-登记时收窄)）。
