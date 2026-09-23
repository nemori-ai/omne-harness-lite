# 规范实例：合法与非法

属于 `data.tool-definition` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`tool-definition.schema.json`](tool-definition.schema.json) 的主要定义项在这里各有正反实例，非法的一律注明**被哪一条挡住、报哪个拒绝值**。

**怎么读**：

- 每节开头的「校验对象」给出该节实例要拿去求值的 `$defs`。完整的正例写成 `json` 代码块，标题写明预期；反例写在表里，
  第一列是实例（JSON 内联代码），第二列是 **Schema 这一关**的预期，第三列是按 [S-26](contract.md#s-26-表示层拒绝值与判定次序) 的次序应报的拒绝值与依据。
- **`通过` 只说形状合规**，不表示任何条款成立——[S-8](contract.md#s-8-说明与用法)、[S-19](contract.md#s-19-由定义得出的依赖声明)、[S-24](contract.md#s-24-结果与声明对得上)、[S-27](contract.md#s-27-表示层拒绝不是判定) 一条也不在 Schema 的能力范围内。
- **块与附件引用的写法照 `data.content-blocks` 的账本**（`id`、`kind`、`visibility: { toHuman, toModel }`、`text`；`storage`、`key`、`mediaType`、`bytes`）。
  那份契约**尚未定型**，它一改，第 7、8 节要重核（[验证入口](../verification.md#变化的影响)）。
- **示例里的名字只是占位**。名字的字符集未定（[G-1](contract.md#十已知缺口)），不要从 `notes`、`issue_search` 这样的写法推出任何规则。

下文用 **B** 指这份最小的合法单函数定义，反例都从它改一处得来：

```json
{"name": "t", "description": "d", "paradigm": "single", "input": {"type": "object"}, "permissions": {"execute": {"default": "ask"}}, "origin": {"kind": "authored"}}
```

## 1. 单函数工具

**校验对象**：`$defs/ToolDefinition`。**预期：通过。**依据 [S-3](contract.md#s-3-两种范式)、[S-4](contract.md#s-4-单函数工具)：`input` 就是参数 schema，原样即模型面的 input（[S-6](contract.md#s-6-模型面只有一个条目)）。

```json
{
  "name": "fetch_page",
  "description": "取回一个网址的正文，返回纯文本。",
  "paradigm": "single",
  "input": {
    "type": "object",
    "properties": { "url": { "type": "string" } },
    "required": ["url"],
    "additionalProperties": false
  },
  "permissions": { "execute": { "default": "ask" } },
  "origin": { "kind": "authored" }
}
```

没有 `needs`：不依赖外部服务、不产附件、调用端与结果端都只要文本（[S-9](contract.md#s-9-四项依赖名)）。没有 `allowBackground`：不能后台（[S-12](contract.md#s-12-后台许可与转后台阈值)）。
没有 `settings`：这个工具没有任何设置项，各层无从配值（[S-10](contract.md#s-10-设置项声明)）。

## 2. 三命令的多命令工具

**校验对象**：`$defs/ToolDefinition`。**预期：通过。**依据 [S-5](contract.md#s-5-多命令工具)：非空 `commands`、不带 `input`；`read` 带了一份 `help`（[S-8](contract.md#s-8-说明与用法)）。

```json
{
  "name": "notes",
  "description": "读写本会话的笔记。先选命令，再给那个命令的参数。",
  "paradigm": "multi",
  "commands": {
    "write": {
      "description": "写入或覆盖一条笔记。",
      "input": {
        "type": "object",
        "properties": { "id": { "type": "string" }, "text": { "type": "string" } },
        "required": ["id", "text"],
        "additionalProperties": false
      }
    },
    "list": {
      "description": "列出全部笔记的标识。",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    "read": {
      "description": "读一条笔记。",
      "input": {
        "type": "object",
        "properties": { "id": { "type": "string" } },
        "required": ["id"],
        "additionalProperties": false
      },
      "help": "read 收一个 id，返回那条笔记的全文。"
    }
  },
  "permissions": { "execute": { "default": "auto" } },
  "origin": { "kind": "authored" }
}
```

`commands` 在这里**有意不按字母序写**：生成规则的次序不依赖作者写成什么样（[S-7](contract.md#s-7-多命令-input-的生成规则) 第 4 条）。
它按 [S-7](contract.md#s-7-多命令-input-的生成规则) 生成的模型面 input 如下（**校验对象**：`$defs/JsonSchema`，**预期：通过**——它是一份合法的 schema）：

```json
{
  "type": "object",
  "properties": {
    "command": { "enum": ["list", "read", "write"] },
    "args": {
      "oneOf": [
        { "type": "object", "properties": {}, "additionalProperties": false },
        {
          "type": "object",
          "properties": { "id": { "type": "string" } },
          "required": ["id"],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": { "id": { "type": "string" }, "text": { "type": "string" } },
          "required": ["id", "text"],
          "additionalProperties": false
        }
      ]
    }
  },
  "required": ["command", "args"],
  "additionalProperties": false
}
```

逐字核对在[第 9 节](#9-生成规则的逐字核对)。

## 3. MCP 来源的工具

**校验对象**：`$defs/ToolDefinition`。**预期：通过。**依据 [S-17](contract.md#s-17-来源)：单函数、不带 `composes`、端点类别是 `mcp`、`remoteName` 原样保留对端给的名字。

```json
{
  "name": "issue_search",
  "description": "在问题跟踪系统里按关键字搜索问题。",
  "paradigm": "single",
  "input": {
    "type": "object",
    "properties": { "query": { "type": "string" } },
    "required": ["query"]
  },
  "permissions": { "execute": { "default": "ask" } },
  "origin": {
    "kind": "mcp",
    "endpoint": { "category": "mcp", "name": "issue-tracker" },
    "remoteName": "search_issues"
  }
}
```

**`name` 与 `remoteName` 故意不同**：`name` 怎样从 `(endpoint, remoteName)` 得出归 MCP 桥接契约（[G-8](contract.md#十已知缺口)），这里的 `issue_search` 只是占位，**不是一条规则**。
这份定义**没有能力标识**（[S-2](contract.md#s-2-身份是-name)）；`permissions.execute.default` 取 `ask` 同样只是占位——桥取什么值也在 G-8。

## 4. 带全部六项声明的工具

**校验对象**：`$defs/ToolDefinition`。**预期：通过。**
六项是：外部服务、附件存储、调用端模态、结果端模态（[S-9](contract.md#s-9-四项依赖名)），执行环境（[S-11](contract.md#s-11-目标环境)），能不能后台 ＋ 转后台阈值（[S-12](contract.md#s-12-后台许可与转后台阈值)）；
另带 PF-002 Tool 行的超时与并发（[S-13](contract.md#s-13-超时与并发)）、组合（[S-16](contract.md#s-16-组合)）与 `help`。

```json
{
  "name": "render_chart",
  "description": "照一张草图与一份数据画图表，产出一张 PNG 附件。",
  "paradigm": "single",
  "input": {
    "type": "object",
    "properties": {
      "sketchBlockId": { "type": "string" },
      "data": { "type": "array", "items": { "type": "object" } }
    },
    "required": ["sketchBlockId", "data"]
  },
  "help": "给一张草图的块标识与一组数据行；返回图表的缩略描述，图本身在附件里。",
  "needs": {
    "externalServices": ["chart-render-service"],
    "attachmentStorage": "artifact-store",
    "inputModalities": ["image"],
    "outputModalities": ["image"]
  },
  "settings": {
    "targetEnvironment": {
      "category": "placement_identity",
      "default": { "bindingLayer": "session_sandbox", "facilities": ["browser", "command_line"] }
    },
    "backgroundThreshold": { "category": "preference", "default": "PT30S" },
    "timeout": { "category": "preference", "default": "PT10M" },
    "concurrency": { "category": "preference", "default": 2 }
  },
  "allowBackground": true,
  "permissions": { "execute": { "default": "ask" } },
  "composes": { "skills": ["chart-style-guide"] },
  "origin": { "kind": "authored" }
}
```

由它得出的依赖声明（[S-19](contract.md#s-19-由定义得出的依赖声明)）：`chart-render-service`、`artifact-store`（连同「有工具读得出它」）、调用端 `image`、结果端 `image`，
以及**目标环境求值后**的那一份——若没有任何一层配值，就是默认值「会话级沙箱 × 浏览器、命令行」。`chart-style-guide` **不在其中**（组合不是依赖）。

## 5. 定义的反例：每个拒绝值至少一个

**校验对象**：`$defs/ToolDefinition`。**预期一律：拒绝。**第三列是按 [S-26](contract.md#s-26-表示层拒绝值与判定次序) 的次序应报的值。

| 实例 | 预期 | 拒绝值 · 依据 |
|---|---|---|
| `"notes"` | 拒绝 | `malformed`（①）：不是 JSON 对象 |
| `{"name": "t", "description": "d", "input": {"type": "object"}, "permissions": {"execute": {"default": "ask"}}, "origin": {"kind": "authored"}}` | 拒绝 | `malformed`（①）：缺 `paradigm`——没有缺省范式 |
| B 的 `paradigm` 换成 `"pipeline"` | 拒绝 | `paradigm_unknown`（②）：[S-3](contract.md#s-3-两种范式)、[S-28](contract.md#s-28-判别式与枚举闭合) |
| B 加 `"commands": {"go": {"description": "d", "input": {"type": "object"}}}` | 拒绝 | `commands_forbidden`（③）：[S-4](contract.md#s-4-单函数工具) |
| `{"name": "t", "description": "d", "paradigm": "multi", "permissions": {"execute": {"default": "ask"}}, "origin": {"kind": "authored"}}` | 拒绝 | `commands_missing`（④）：[S-5](contract.md#s-5-多命令工具) |
| 上一行加 `"commands": {}` | 拒绝 | `commands_missing`（④）：空映射就是没有命令 |
| B 的 `input` 换成 `{"type": 5}` | 拒绝 | `input_not_schema`（⑤）：不合 Draft 2020-12 元 schema |
| 第 2 节的例子，`list.input` 换成 `{"required": "id"}` | 拒绝 | `input_not_schema`（⑤）：`required` 必须是数组；命令的 `input` 同样按元 schema 判 |
| B 加 `"settings": {"targetEnvironment": {"category": "placement_identity", "default": {"bindingLayer": "vm", "facilities": []}}}` | 拒绝 | `binding_layer_unknown`（⑥）：[S-11](contract.md#s-11-目标环境)、[S-28](contract.md#s-28-判别式与枚举闭合) |
| B 加 `"settings": {"timeout": {"category": "security", "default": "PT1M"}}` | 拒绝 | `category_unknown`（⑦）：[S-10](contract.md#s-10-设置项声明) |
| B 的 `permissions.execute.default` 换成 `"allow"` | 拒绝 | `permission_unknown`（⑧）：[S-15](contract.md#s-15-执行权限)；**不得**被当成 `auto` |
| B 的 `origin` 换成 `{"kind": "plugin"}` | 拒绝 | `origin_unknown`（⑨）：[S-17](contract.md#s-17-来源) |
| B 的 `paradigm` 换成 `"pipeline"`，**同时** `permissions.execute.default` 换成 `"allow"` | 拒绝 | **`paradigm_unknown`**：两处都不合时报次序靠前的那一个（S-26） |
| B 去掉 `permissions` | 拒绝 | `malformed`（⑩）：执行权限必填、**不补任何一档**（[S-15](contract.md#s-15-执行权限)） |
| B 去掉 `origin` | 拒绝 | `malformed`（⑩）：来源必填，没有缺省的「作者写的」（[S-17](contract.md#s-17-来源)） |
| 第 2 节的例子加 `"input": {"type": "object"}` | 拒绝 | `malformed`（⑩）：多命令工具的 input 由 `commands` 生成，**不存第二份**（[S-5](contract.md#s-5-多命令工具)） |
| B 加 `"settings": {"targetEnvironment": {"category": "preference", "default": {"bindingLayer": "host_machine", "facilities": []}}}` | 拒绝 | `malformed`（⑩）：目标环境的类别恒为 `placement_identity`——标成偏好就让工作区配得到它（[S-10](contract.md#s-10-设置项声明)） |
| 第 3 节的例子，`paradigm` 换成 `"multi"`、去掉 `input`、加 `"commands": {"search": {"description": "d", "input": {"type": "object"}}}` | 拒绝 | `malformed`（⑩）：MCP 来源恒为单函数（[S-17](contract.md#s-17-来源)） |
| 第 3 节的例子加 `"composes": {"skills": ["triage-guide"]}` | 拒绝 | `malformed`（⑩）：MCP 来源不组合（[S-16](contract.md#s-16-组合)） |
| 第 3 节的例子，`endpoint.category` 换成 `"tool"` | 拒绝 | `malformed`（⑩）：端点必须是一个 MCP 接入点的能力标识（[S-17](contract.md#s-17-来源)） |
| B 加 `"allowBackground": true, "settings": {"backgroundThreshold": {"category": "preference", "default": "P1D"}}` | 拒绝 | `malformed`（⑩）：不收日历单位，写 `PT24H`（[S-14](contract.md#s-14-时长的表示)） |
| B 加 `"settings": {"concurrency": {"category": "preference", "default": 0}}` | 拒绝 | `malformed`（⑩）：并发是正整数（[S-13](contract.md#s-13-超时与并发)） |
| B 的 `name` 换成 `""` | 拒绝 | `malformed`（⑩）：名字非空（[S-18](contract.md#s-18-名字的表示与相等)） |
| B 加 `"waitsForReply": true` | 拒绝 | `malformed`（⑩）：等待态不在定义里（[S-29](contract.md#s-29-不在定义里的三样)） |
| B 加 `"emitsFrames": true` | 拒绝 | `malformed`（⑩）：发帧不在定义里（[S-29](contract.md#s-29-不在定义里的三样)） |
| B 加 `"implementation": {"module": "./fetch_page.js"}` | 拒绝 | `malformed`（⑩）：实现不在定义里（[S-30](contract.md#s-30-实现不在定义里)） |
| B 加 `"settings": {"targetEnvironment": {"category": "placement_identity", "default": {"bindingLayer": "stateless_sandbox", "facilities": ["browser", "browser"]}}}` | 拒绝 | `malformed`（⑩）：设施不重复 |
| B 加 `"needs": {"inputModalities": ["pdf"]}` | 拒绝 | `malformed`（⑩）：不是一种模态（取值集归 `data.content-blocks` 的 `Modality`）；**本契约的账本没有给它一个专名** |

## 6. 小值的正反实例

**`$defs/Duration`**（[S-14](contract.md#s-14-时长的表示)）

| 实例 | 预期 | 依据 |
|---|---|---|
| `"PT30S"` | 通过 | 秒 |
| `"PT1H30M"` | 通过 | 时、分，按次序 |
| `"PT0.5S"` | 通过 | 只有秒可带小数 |
| `"PT0S"` | 通过 | 非负；零对某一项意味着什么归那一项 |
| `"PT48H"` | 通过 | 两天就这么写 |
| `"PT"` | 拒绝 | 至少一段 |
| `"P1D"` | 拒绝 | 日是日历单位 |
| `"P1M"` | 拒绝 | 月的长度随起点而变——这正是不收它的理由 |
| `"PT1.5H"` | 拒绝 | 只有秒可带小数 |
| `"PT30M1H"` | 拒绝 | 次序是时、分、秒 |
| `"-PT5S"` | 拒绝 | 不收负号 |
| `"30s"` | 拒绝 | 不是 ISO 8601 时长 |
| `30` | 拒绝 | 交换表示是字符串 |
| `"PT30S\n"` | 拒绝 | 尾随换行；pattern 以 `(?![\s\S])` 收尾，两种引擎都拒 |

`"PT60S"` 与 `"PT1M"` 都通过，且**是同一个时长**——比较按时长值，不按字面。

**`$defs/BindingLayer`**（[S-11](contract.md#s-11-目标环境)）

| 实例 | 预期 | 依据 |
|---|---|---|
| `"host_machine"` · `"stateless_sandbox"` · `"session_sandbox"` · `"tenant_sandbox"` | 通过（各一条） | PF-005 §5.1 的四种执行环境 |
| `"session"` | 拒绝 | 不做「最接近」映射（[S-28](contract.md#s-28-判别式与枚举闭合)） |
| `"sandbox"` | 拒绝 | 沙箱不是一种绑定层，是隔离的那三种的统称 |

**`$defs/SettingCategory`**（[S-10](contract.md#s-10-设置项声明)）

| 实例 | 预期 | 依据 |
|---|---|---|
| `"preference"` · `"binding"` · `"placement_identity"` · `"governance"` | 通过（各一条） | 恰四值 |
| `"placement"` | 拒绝 | 正式 token 是 `placement_identity` |
| `"Preference"` | 拒绝 | 区分大小写 |

**`$defs/ExecutePermission`**（[S-15](contract.md#s-15-执行权限)）

| 实例 | 预期 | 依据 |
|---|---|---|
| `{"default": "forbid"}` · `{"default": "auto"}` · `{"default": "ask"}` | 通过（各一条） | 恰三档 |
| `{}` | 拒绝 | 默认值必填，不补 |
| `{"default": "auto_place"}` | 拒绝 | 那是执行环境权限的档位，另一维 |
| `{"default": "ask", "remember": true}` | 拒绝 | 「记住这次授权」是授权表达的事，不是定义里的权限默认值 |

## 7. 返回值的正例

**校验对象**：`$defs/ToolReturn`。**预期一律：通过。**

**裸字符串**（[S-20](contract.md#s-20-两种写法与等价规则)）：

```json
"找到 3 条笔记：n1、n2、n3。"
```

它**等价于**下面这份 `ToolResult`（块的 `id` 由运行时给，这里写 `b0` 只是占位；两个标注取两边都给）：

```json
{ "content": [ { "id": "b0", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "找到 3 条笔记：n1、n2、n3。" } ] }
```

**空内容**——合法的「这次没给出内容」，与「被卸载了」分得开（[S-21](contract.md#s-21-toolresult-的三样)）：

```json
{ "content": [] }
```

**带卸载、引用形式、作者写了摘要**（[S-23](contract.md#s-23-卸载)）——`content` 照常进消息；`raw` 不进消息，占位里是 `summary` 加大小与取回途径：

```json
{
  "content": [
    { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "查询完成，共 48 213 行。" }
  ],
  "offload": {
    "raw": { "storage": "offload-store", "key": "run-7/call-3/raw", "mediaType": "application/json", "bytes": 5242880 },
    "summary": [
      { "id": "b2", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "前 20 行：……（按金额降序）" }
    ]
  }
}
```

**带卸载、内联形式、没写摘要**——占位由运行时给，只说明大小与取回途径，**不是系统写的摘要**：

```json
{
  "content": [],
  "offload": { "raw": { "inline": "eyJyb3dzIjogW119", "mediaType": "application/json" } }
}
```

**带附件**——只能出自声明了 `needs.attachmentStorage` 的工具（[S-24](contract.md#s-24-结果与声明对得上)；这一条 Schema 管不到）；
第 4 节的 `render_chart` 可以这样返回，因为它声明了 `artifact-store` 与结果端 `image`：

```json
{
  "content": [
    { "id": "b1", "kind": "text", "visibility": { "toHuman": true, "toModel": true }, "text": "已画出柱状图，见附件。" }
  ],
  "attachments": [
    { "storage": "artifact-store", "key": "charts/2026-09-23/c1.png", "mediaType": "image/png", "bytes": 20480, "name": "chart.png" }
  ]
}
```

## 8. 返回值的反例

**校验对象**：`$defs/ToolReturn`。**预期一律：拒绝。**

| 实例 | 预期 | 拒绝值 · 依据 |
|---|---|---|
| `{"content": [{"id": "b1", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "callId": "c9", "tool": "notes", "arguments": {}, "complete": true}]}` | 拒绝 | `result_call_in_content`（③）：结果里不发起调用（[S-22](contract.md#s-22-结果内容里没有工具调用)） |
| `{"content": [], "offload": {"raw": {"inline": "eA==", "mediaType": "text/plain"}, "summary": [{"id": "b3", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "rawArguments": "{\"id\":", "complete": false}]}}` | 拒绝 | `result_call_in_content`（③）：半截的调用块同样不行，摘要里同样不行 |
| `42` | 拒绝 | `malformed`（①）：既不是字符串也不是对象 |
| `null` | 拒绝 | `malformed`（①）：没有「空返回」这一写法；什么都不给就写 `{"content": []}` |
| `{}` | 拒绝 | `malformed`（④）：`content` 必填 |
| `{"content": [], "outcome": "failed"}` | 拒绝 | `malformed`（④）：返回值不带收场（[S-25](contract.md#s-25-toolresult-不是收场)）；「失败」怎么表达是 [G-9](contract.md#十已知缺口) |
| `{"content": [], "offload": {"summary": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "摘要"}]}}` | 拒绝 | `malformed`（④）：卸载必须给出原始结果 |
| `{"content": [], "offload": {"raw": {"inline": "eA==", "mediaType": "text/plain"}, "summary": []}}` | 拒绝 | `malformed`（④）：摘要给了就非空——空摘要与没写摘要不是同一件事 |
| `{"content": [], "offload": {"raw": {"inline": "eA=="}}}` | 拒绝 | `malformed`（④）：内联的原始结果必带媒体类型（[S-23](contract.md#s-23-卸载)） |
| `{"content": [{"id": "b1", "kind": "text", "text": "缺标注"}]}` | 拒绝 | **以 `data.content-blocks` 的拒绝值报**（②）：块本身不合那份契约（缺两个标注），块的权威在那里 |

## 9. 生成规则的逐字核对

**对象**：第 2 节的三命令工具 `notes`，与它下面那份生成出的 input；规则是 [S-7](contract.md#s-7-多命令-input-的生成规则) 的六条。
**方式**：起草者逐字对读（2026-09-23），**不是机检**——本次没有运行任何 Schema 校验器（[验证入口](../verification.md#证据义务) V-2）。

| S-7 | 要求 | 在第 2 节那份生成结果里 | 对得上吗 |
|---|---|---|---|
| 第 1 条 | 判别成员名恰为 `command`，取值集恰为全部命令名 | `properties.command.enum` = `["list", "read", "write"]`；`commands` 的键恰是 `write`、`list`、`read` 三个 | 是 |
| 第 2 条 | 参数成员名恰为 `args` | `properties.args` | 是 |
| 第 3 条 | 每个命令的 `input` 原样进 `oneOf`，不改写、不合并 | 三个分支与 `commands.list.input`、`commands.read.input`、`commands.write.input` 逐字相同；`read` 的 `help` 与三个命令的 `description` **都没有**进来——它们不是 `input` 的一部分 | 是 |
| 第 4 条 | 按码点升序，`enum` 与 `oneOf` 同序 | `l`（U+006C）< `r`（U+0072）< `w`（U+0077）：`list`、`read`、`write`；第 1、2、3 个分支依次是它们的 `input`；**与作者在 `commands` 里写的次序（`write`、`list`、`read`）无关** | 是 |
| 第 5 条 | 命令只来自 `commands`，不为 `help` 生成命令 | `read` 带了 `help`，`enum` 里**没有** `help` | 是 |
| 第 6 条 | 恰含 `type`、`properties`、`required`、`additionalProperties` 四个成员 | 四个，不多不少；`required` = `["command", "args"]`，`additionalProperties` = `false` | 是 |

**结论：第 2 节那份生成结果与 S-7 逐条一致。**

**同一个实例也演示了 [G-3](contract.md#十已知缺口) 的缺陷 ①**——规则照做了，得到的 schema 却挡不住命令与参数错配：

| 调用 | 过这份生成出的 input 吗 | 过所选命令自己的 `input` 吗 |
|---|---|---|
| `{"command": "read", "args": {}}` | **过**：`{}` 恰只命中 `list` 那一支（`read` 缺 `id`、`write` 缺 `id` 与 `text`），`oneOf` 成立 | **不过**：`read` 要 `id` |
| `{"command": "list", "args": {"id": "n1"}}` | **过**：恰只命中 `read` 那一支 | **不过**：`list` 不收参数 |
| `{"command": "read", "args": {"id": "n1"}}` | 过 | 过 |

**缺陷 ②** 要改一处才看得见：把 `list.input` 换成宽松的 `{"type": "object"}`（PF-006 明许的「只带命令清单」就是这种写法），
那么 `{"command": "read", "args": {"id": "n1"}}` **同时命中 `list` 与 `read` 两支，`oneOf` 不成立——一次完全正确的调用被拒**。

这正是 [S-7](contract.md#s-7-多命令-input-的生成规则) 要求消费者**以 `commands[command].input` 判参数、不以过了 `modelInput` 代替**的原因。

## 10. Schema 挡不住、但同样非法的

**本节不参与机检**——没有「校验对象」。它们形状上一概合法，只能由规范场景、消费者走查或评审拒绝。

| 做了什么 | 违反 |
|---|---|
| 两份 `name` 相同、`input` 不同的定义被当成两个工具，同时出现在动作空间里 | [S-2](contract.md#s-2-身份是-name)：同名即同一个工具的两份表示 |
| 定义里带了 `help`，`Tools().inspect` 对同一个工具说的是另一套用法 | [S-8](contract.md#s-8-说明与用法) |
| 一个声明了阈值、却没有 `allowBackground: true` 的工具，因阈值到了被转后台 | [S-12](contract.md#s-12-后台许可与转后台阈值)：阈值不授予许可 |
| 替换件的 `input` 与原件不同，或它的 `name` 变了 | [S-6](contract.md#s-6-模型面只有一个条目)：同形，只换 `description` |
| 没声明 `needs.attachmentStorage` 的工具返回了 `attachments` | [S-24](contract.md#s-24-结果与声明对得上) |
| 没在 `outputModalities` 里声明 `image` 的工具返回了图块 | [S-24](contract.md#s-24-结果与声明对得上) |
| 运行时对一个没写 `summary` 的卸载生成了一段「内容概要」放进占位 | [S-23](contract.md#s-23-卸载)：系统不替作者写摘要 |
| 会话日志里出现了 `offload.raw` | [S-23](contract.md#s-23-卸载) |
| 运行时把一个看起来像 JSON 的裸字符串解析成 `ToolResult` | [S-20](contract.md#s-20-两种写法与等价规则) |
| 一份被表示层拒绝的定义被装成替换件，或从动作空间里静默消失 | [S-27](contract.md#s-27-表示层拒绝不是判定) |
| 运行时为了决定解不解析帧，先去查定义里有没有「会发帧」一格 | [S-29](contract.md#s-29-不在定义里的三样) |
| 从 `issue_search` 这类名字里拆出「来自哪个接入点」 | [S-18](contract.md#s-18-名字的表示与相等)：来源在 `origin`，不在名字里 |
| 以 `{"command": "read", "args": {}}` 过了生成出的 input 为由执行 `read` | [S-7](contract.md#s-7-多命令-input-的生成规则)：参数以所选命令自己的 `input` 为准 |

## 核对记

起草者逐条对过（2026-09-23，**人工**）：第 1～4 节的正例满足 [S-3](contract.md#s-3-两种范式)～[S-17](contract.md#s-17-来源) 的每一条形状要求；
第 5、8 节每个反例恰违反一处，且第三列的拒绝值与 [S-26](contract.md#s-26-表示层拒绝值与判定次序) 的次序一致；
第 6 节的时长实例与 [S-14](contract.md#s-14-时长的表示) 的写法一致。**这不是 Schema 校验**：机检未运行，块与附件引用的实例还要等 `data.content-blocks` 定型后重核。
