# 规范场景

这里写操作层面的输入、预期与依据。示例里的标识串只是占位（`cred_`、`oab_`），词法归实现。具名参数在示例里取的值只为演示，不是设计的取值。

租户：`(T1, a1)` 是组织 `org_t1` 下的账号 `acc_a1`，`(T2, a1)` 是组织 `org_t2` 下的同一个账号。

## 1. 凭据出示的来处

持有 H：租户 `(T1, a1)` 的接入点 `linear`，连接目标是 `https://mcp.linear.app/mcp`，凭据配值是 `cred_91c2`，两项配值都来自租户格。

| 输入 | 操作 | 结局 | 依据 |
| --- | --- | --- | --- |
| H | 任一要出示凭据的操作 | 照常出示 | 来处同层 |
| H，但仓库经工作区带来一份同名 `linear`，连接目标是 `https://collector.example/mcp`，来处是工作区格，凭据仍是租户格上的 `cred_91c2` | 任一要出示凭据的操作 | `credentialUnavailable`。`cred_91c2` 没有交给保管方解引用 | 连接目标的来处比凭据的来处更具体 |
| H，连接目标的来处是组织格 | 任一要出示凭据的操作 | 照常出示 | 组织格比租户格靠外 |
| H，配值的来处整个缺席 | 任一操作 | `invalidInput` | 来处不合形状不当作「来处未知、照常出示」 |
| H，凭据配值缺席而凭据的来处是租户格 | 任一操作 | `invalidInput` | 两者一个在一个缺 |
| H，凭据的来处是会话格 | 任一要出示凭据的操作 | `credentialUnavailable`，不出示 | 会话格不持有资产 |
| H，凭据的来处是组织格 | 任一要出示凭据的操作 | `credentialUnavailable`，不出示，引用不交给保管方 | 组织那一层不持有 MCP 凭据 |
| H，连接目标的来处是会话格 | 任一要出示凭据的操作 | `credentialUnavailable`，不出示 | 会话格比租户格更具体 |
| H，持有在工作区格上，凭据配值是 `cred_91c2` | 任一要出示凭据的操作 | `credentialUnavailable`，不出示 | 工作区格上凭据恒缺席 |

## 2. 条目投影

接入点是 `github`。表里每一行是清单里的一项，或者清单本身。

对端给全了说明、没有带 `$schema` 与 `title` 时，条目照对端的定义写出，`normalized` 为假。

| 清单里的一项（或清单本身） | 投影结局 | 依据 |
| --- | --- | --- |
| `{"name": "search", "inputSchema": {"type": "object", "properties": {}}}`，没有 `description` | 条目说明是「对端未提供说明」，`normalized` 为真 | 条目说明说的是对端没给，不替对端编 |
| `{"name": "search", "description": "", "inputSchema": {"type": "object", "properties": {}}}` | 同上 | 空串不是说明 |
| `{"name": "bulk", "description": "Bulk.", "inputSchema": {"type": "object", "minProperties": -1}}` | 已知不可用，`input_rejected`：不是合法的 Schema | 顶层不是恰 `{"type": "object"}`，第 3 样不适用 |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object"}}` | 普通条目，参数 Schema 是 `{"type": "object", "properties": {}}`，`normalized` 为真 | 第 3 样：视为无参数 |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "additionalProperties": false}}` | 已知不可用，`input_rejected`：顶层没有 `properties` | 它不是恰 `{"type": "object"}`。第 3 样只认那一种写法 |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "properties": {"q": {"type": "string"}}}}` | 普通条目，`q` 补上说明「对端未提供说明」，`normalized` 为真 | 第 1 样，参数那一半 |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "properties": {"q": true}}}` | 已知不可用，`input_rejected`：参数缺说明 | 成员 Schema 是布尔 Schema，补不上说明 |
| `{"name": "search", "description": "Search.", "inputSchema": {"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {}}}` | 普通条目，参数 Schema 是 `{"type": "object", "properties": {}}`，`normalized` 为真 | 第 2 样：剥掉 `$schema`，之后按 Draft 2020-12 读 |
| `{"name": "new_issue", "description": "Open an issue.", "inputSchema": {"title": "NewIssueArgs", "type": "object", "properties": {"title": {"type": "string", "title": "Title", "description": "Issue title."}}}}` | 普通条目，参数 Schema 是 `{"type": "object", "properties": {"title": {"type": "string", "description": "Issue title."}}}`，`normalized` 为真 | 第 2 样：两处关键字 `title` 剥掉。名为 `title` 的参数是参数名，留着 |
| `{"name": "search", "description": "Search.", "inputSchema": {"type": "object", "properties": {"q": {"$ref": "#/$defs/Q"}}, "$defs": {"Q": {"type": "string", "description": "Query."}}}}` | 已知不可用，`input_rejected` | `$ref` 与 `$defs` 不在可呈现的子集里。投影不展开引用 |
| `{"name": "export", "inputSchema": {"type": "object", "properties": {}}, "execution": {"taskSupport": "required"}}` | 条目说明是占位，`normalized` 为真，已知不可用，原因是执行方式不支持 | 识别依据未核实，见设计的未决第 4 条 |
| `{"name": "export", "description": "Export.", "inputSchema": {"type": "object", "properties": {}}, "execution": {"taskSupport": "optional"}}` | 普通条目，`normalized` 为假 | 只有 `required` 才不可用 |
| `{"name": "grep", "description": "按正则搜", "inputSchema": {"type": "object", "properties": {"q": {"type": "string", "description": "正则", "pattern": "^(a+)+$"}}}}`，实现声明的编译上限不收嵌套的无界量词 | 已知不可用，`schema_unsupported`。参数 Schema 是对端原样，`normalized` 为假 | 形状合法，只在编译这一步被拒 |
| 上一行的动作，实现收得下这个 `pattern` | 普通条目，`normalized` 为假 | 编译支持取决于实现声明的上限，同一实现同一上限下结果恒定 |
| 同一个 `pattern`，对端同时声明 `"execution": {"taskSupport": "required"}` | 已知不可用，`schema_unsupported` | 编译上限先于执行方式判定 |
| `{"name": "grep", "description": "按正则搜", "inputSchema": {"type": "object", "properties": {"q": {"type": "string", "pattern": "^("}}}}` | `q` 补上说明之后仍不是合法的 Schema（`"^("` 不是合法的 ECMA-262 正则），已知不可用，`input_rejected`，不是 `schema_unsupported` | Schema 的合法性先于编译支持判定 |
| 清单未取得 | 条目与排除项都为空，标明清单未取得 | 未取得不是取得了空清单 |
| 取得了一份空清单 | 条目与排除项都为空，标明清单已取得 | 与上一行必须分得开 |
| 任意一项 | 条目不许转后台，不带每条目的设置 | 条目只有一种调用方式 |

## 3. 调用结局

| 对端应答 | 工具结果 | 依据 |
| --- | --- | --- |
| `{"content": [{"type": "text", "text": "repo not found"}], "isError": true}` | 那个文本块进工具结果，调用以失败收场 | 动作自己的错误照样交出内容 |

## 4. OAuth 取值

演示取值：`pending` 的 TTL 是 10 分钟，未配上凭据的保留期是 1 小时。

### 4.1 一次完整的取值

租户 `(T1, a1)` 的接入点 `linear`，此前没有凭据。

| 时刻 | 谁 | 做了什么 | 结局 | 之后 |
| --- | --- | --- | --- | --- |
| 08:05 | 凭据设置入口 | 对租户格上的这份持有发起取值 | 绑定 `{"id": "oab_3e1f", "state": "pending", "since": "08:05"}` 与同意地址 | 绑定是 `pending` |
| 08:09 | 人 | 在授权服务器上点同意 | 无 | 无 |
| 08:10 | 凭据设置入口 | 以授权码与状态参数完成 `oab_3e1f` | 绑定 `{"id": "oab_3e1f", "state": "granted", "since": "08:10"}` 与引用 `cred_91c2` | 保管方收下凭据，与这份持有绑定。配值没有变 |
| 08:10 | 凭据设置入口 | 经资产治理，以这个人的身份把凭据配值写成 `cred_91c2` | 资产治理的结局 | 配值是 `cred_91c2`，下一次使用时生效 |

| 变体 | 结局 | 依据 |
| --- | --- | --- |
| 08:11 再完成一次 `oab_3e1f` | `oauthDenied`，不产生第二份凭据 | 同一绑定第二次完成 |
| 08:07 人又点了一次取凭据，发起了 `oab_7d22`。08:10 `oab_3e1f` 的应答回来 | `oab_3e1f` 在 08:07 已被撤销，答 `oauthDenied` | 同一份持有上至多一个 `pending` |
| 人在授权服务器上点了拒绝，应答带 `access_denied` | `oauthDenied`，绑定转 `revoked` | 明确拒绝 |
| 08:16 才完成 `oab_3e1f` | `oauthDenied`，从 08:05 起已过 10 分钟 | 过期在读的时候判定 |
| 应答里的状态参数与这次取值不一致 | `oauthDenied` | 状态参数须对应 |
| 换来凭据之后保管方此刻不可用 | `dependencyUnavailable`。换来的凭据丢弃，绑定留在 `pending`，过了 08:15 才过期，恰在 08:15 时仍有效 | 等号不算过期 |
| 发起取值时持有在工作区格上，生效的那份来自工作区 | `oauthNotApplicable` | 连接目标来自工作区，取到的租户凭据不会出示给它 |
| 发起取值时持有在组织格上，租户格上还没有这份持有 | `oauthNotApplicable`，不写绑定 | 组织那一层不持有 MCP 凭据。要先在租户格上持有它，再来取 |
| 08:10 拿到 `cred_91c2`，但写配值时资产治理不可达，人没有再试 | 09:10 保管方丢弃那份凭据，`oab_3e1f` 转 `revoked` | 保留期内没有配上 |

### 4.2 续期与作废

接 4.1，配值已是 `cred_91c2`。

| 发生了什么 | 结果 | 依据 |
| --- | --- | --- |
| 令牌到期之前续上 | 配值仍是 `cred_91c2`，绑定仍是 `granted`，`since` 仍是 08:10。没有卡片，没有一次「设置被改」 | 续期不打扰人 |
| 授权服务器明确拒绝续期 | `oab_3e1f` 转 `revoked`。此后解引用答 `credentialUnavailable`，下一次使用 `linear` 的动作不可用，原因可查 | 明确拒绝与暂时够不着分开 |
| 授权服务器暂时够不着 | 绑定仍是 `granted`。续上之前答 `credentialUnavailable`，按间隔重试，不出示已过期的令牌 | 同上 |
| 有人经资产治理清掉那一格的凭据配值 | `cred_91c2` 解引用不出，`oab_3e1f` 转 `revoked`，保管方丢弃凭据。用它的连接不再接新的调用，在途的照常完成 | 清值使绑定转 `revoked` |
| 同一个人切到 `(T2, a1)` | 那一份持有看不到 `cred_91c2`，抄过去也解引用不出 | 凭据按租户隔离，见 [MCP 领域](../../../../../docs/domains/mcp/README.md#模块角色与事实归属) |
| 同一个 `(T1, a1)` 在第二台机器上用 `linear` | 那台机器上没有 `oab_3e1f`，`cred_91c2` 解引用不出，答 `credentialUnavailable`。在那台机器上再取一次、配上 `cred_b204` 之后，第一台机器上的 `oab_3e1f` 转 `revoked` | 凭据跟机器，见设计的未决第 11 条 |
