# 规范实例：合法与非法

属于 `data.tool-definition` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`tool-definition.schema.json`](tool-definition.schema.json) 的主要定义项在这里各有正反实例，非法的一律注明**被哪一条挡住、报哪个拒绝值**。

**怎么读**：

- 每节开头的「校验对象」给出该节实例要拿去求值的 `$defs`。完整的正例写成 `json` 代码块，标题写明预期；反例写在表里，
  第一列是实例（JSON 内联代码），第二列是 **Schema 这一关**的预期，第三列是按 [S-26](contract.md#s-26-表示层拒绝值与判定次序) 的次序应报的拒绝值与依据。
- **`通过` 只说形状合规**，不表示任何条款成立——[S-8](contract.md#s-8-说明与用法)、[S-19](contract.md#s-19-由定义得出的依赖声明)、[S-24](contract.md#s-24-结果与声明对得上)、[S-27](contract.md#s-27-表示层拒绝不是判定) 一条也不在 Schema 的能力范围内。
- **块与附件引用的写法照 `data.content-blocks` v1（候选）的 Schema**（`id`、`kind`、`visibility: { toHuman, toModel }`、`text`；`storage`、`key`、`mediaType`、`bytes`）。
  那份契约一改，第 7、8 节要重核（[验证入口](../verification.md#变化的影响)）。
- **`name` 的字符集已定**（[S-18](contract.md#s-18-名字的表示与相等)）：示例里的名字都合它；除第 3、11 节那个按桥的规则拼出的 MCP 条目名外，名字本身只是占位，不要从 `notes`、`fetch_page` 这样的写法推出别的规则。

下文用 **B** 指这份最小的合法单函数定义，反例都从它改一处得来：

```json
{"name": "t", "description": "d", "paradigm": "single", "input": {"type": "object", "properties": {}}, "permissions": {"execute": {"default": "ask"}}, "origin": {"kind": "authored"}}
```

## 1. 单函数工具

**校验对象**：`$defs/ToolDefinition`。**预期：通过。**依据 [S-3](contract.md#s-3-两种范式)、[S-4](contract.md#s-4-单函数工具)：`input` 就是参数 schema，原样即模型面的 input（[S-6](contract.md#s-6-模型面只有一个条目)）；顶层 `type: "object"` 带 `properties`、每个参数带说明、只用可呈现子集（三条硬要求）。

```json
{
  "name": "fetch_page",
  "description": "取回一个网址的正文，返回纯文本。",
  "paradigm": "single",
  "input": {
    "type": "object",
    "properties": { "url": { "type": "string", "description": "要取回的网址，http 或 https。" } },
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
        "properties": {
          "id": { "type": "string", "description": "笔记的标识。" },
          "text": { "type": "string", "description": "笔记的全文，整条覆盖。" }
        },
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
        "properties": { "id": { "type": "string", "description": "笔记的标识。" } },
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

`commands` 在这里**有意不按字母序写**：生成规则的次序不依赖作者写成什么样（[S-7](contract.md#s-7-多命令-input-的生成规则) 第 2 条）。
它按 [S-7](contract.md#s-7-多命令-input-的生成规则) 生成的模型面 input 如下（**校验对象**：`$defs/JsonSchema`，**预期：通过**——它是一个顶层 `type: "object"`、带 `properties` 的 JSON 对象；它也是一份合法的 Draft 2020-12 schema、每个参数带说明、只用可呈现子集，那是 Schema 之外那一步的事）：

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "enum": [
        "list",
        "read",
        "write"
      ],
      "description": "list — 列出全部笔记的标识。\nread — 读一条笔记。\nwrite — 写入或覆盖一条笔记。"
    },
    "args": {
      "type": "object",
      "description": "所选命令的参数；各命令的参数用法经 Tools().inspect 取得"
    }
  },
  "required": [
    "command"
  ],
  "additionalProperties": false
}
```

三个命令的参数（`id`、`text`）**都不在**这份生成结果里：模型面只有命令表，参数 schema 只用于判定与 `Tools().inspect`（[S-7](contract.md#s-7-多命令-input-的生成规则) 第 1、3 条）。逐字核对在[第 9 节](#9-生成规则的逐字核对)。

## 3. MCP 来源的工具

**校验对象**：`$defs/ToolDefinition`。**预期：通过。**依据 [S-17](contract.md#s-17-来源)：单函数、不带 `composes`、端点类别是 `mcp`、`remoteName` 原样保留对端给的名字。

```json
{
  "name": "issue-tracker:search_issues",
  "description": "在问题跟踪系统里按关键字搜索问题。",
  "paradigm": "single",
  "input": {
    "type": "object",
    "properties": { "query": { "type": "string", "description": "搜索关键字，按空格分词。" } },
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

**`name` 按 `data.mcp-endpoint/v1#S-11` 拼出**：接入点能力标识的 name `issue-tracker` ＋ `:` ＋ 对端动作名 `search_issues`（`capability.mcp-bridge` v1 S-17；原 G-8 已关闭）；它合 [S-18](contract.md#s-18-名字的表示与相等) 对 `name` 的限制。
这份定义**没有能力标识**（[S-2](contract.md#s-2-身份是-name)）；`description` 与 `input` 是桥的投影——对端给全了说明、没带子集外关键字时就是对端原话（这里如此）；
对端缺说明、带 `$schema`／`title`、只写 `{"type": "object"}` 的，桥先做最小规范化（`capability.mcp-bridge/v1#S-17`，主线裁定 2026-09-24），**交到这里的定义照常过 [S-4](contract.md#s-4-单函数工具) 的三条硬要求**，规范化之后仍不合的由桥排除；`permissions.execute.default` 取接入点正文给的那一档，这里写 `ask`。

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
      "sketchBlockId": { "type": "string", "description": "草图那个图块的块标识。" },
      "data": { "type": "array", "description": "数据行，每行一个对象。", "items": { "type": "object" } }
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

**校验对象**：`$defs/ToolDefinition`。**预期：表示层一律拒绝。**第二列是 Schema 这一关：标「Schema 通过」的两行由 Schema 之外那一步拒（[S-4](contract.md#s-4-单函数工具)）。
第三列是按 [S-26](contract.md#s-26-表示层拒绝值与判定次序) 的次序应报的值；`malformed` 注明是 `M1`～`M15`、`M24`～`M27` 的哪一条。

| 实例 | 预期 | 拒绝值 · 依据 |
|---|---|---|
| `"notes"` | 拒绝 | `malformed`（M1）：不是 JSON 对象 |
| `{"name": "t", "description": "d", "input": {"type": "object", "properties": {}}, "permissions": {"execute": {"default": "ask"}}, "origin": {"kind": "authored"}}` | 拒绝 | `malformed`（M2）：缺 `paradigm`——没有缺省范式 |
| B 的 `paradigm` 换成 `"pipeline"` | 拒绝 | `paradigm_unknown`：[S-3](contract.md#s-3-两种范式)、[S-28](contract.md#s-28-判别式与枚举闭合) |
| B 加 `"commands": {"go": {"description": "d", "input": {"type": "object", "properties": {}}}}` | 拒绝 | `commands_forbidden`：[S-4](contract.md#s-4-单函数工具) |
| `{"name": "t", "description": "d", "paradigm": "multi", "permissions": {"execute": {"default": "ask"}}, "origin": {"kind": "authored"}}` | 拒绝 | `commands_missing`：[S-5](contract.md#s-5-多命令工具) |
| 上一行加 `"commands": {}` | 拒绝 | `commands_missing`：空映射就是没有命令 |
| B 的 `input` 换成 `true` | 拒绝 | `input_not_schema`：布尔 schema 合法，但不是对象——本契约只收对象（[S-4](contract.md#s-4-单函数工具)） |
| B 的 `input` 换成 `{"type": 5}` | 拒绝 | `input_not_schema`：是对象，却不合 Draft 2020-12（Schema 这一关也不过——顶层 `type` 须恰是 `"object"`，但报的值按次序是第 5 行） |
| 第 2 节的例子，`list.input` 换成 `{"type": "object", "properties": {}, "required": "id"}` | **Schema 通过** · 表示层拒绝 | `input_not_schema`：`required` 必须是数组——合法性由实现判，命令的 `input` 同样 |
| B 的 `input` 换成 `{"type": "object", "properties": {"q": {"type": "string"}}}` | **Schema 通过** · 表示层拒绝 | `parameter_description_missing`：参数 `q` 没带说明（[S-4](contract.md#s-4-单函数工具) 第 2 条） |
| B 的 `input` 换成 `{"type": "object", "properties": {"filter": {"type": "object", "description": "过滤条件", "properties": {"field": {"type": "string", "description": ""}}}}}` | **Schema 通过** · 表示层拒绝 | `parameter_description_missing`：嵌套对象里的参数说明是空串——任何一处 `properties` 都算 |
| B 的 `input` 换成 `{"type": "object", "properties": {"rows": {"type": "array", "description": "数据行", "items": {"type": "object", "properties": {"v": {"type": "number"}}}}}}` | **Schema 通过** · 表示层拒绝 | `parameter_description_missing`：数组 `items` 是对象时，它的参数同样要说明 |
| B 的 `input` 换成 `{"type": "object", "properties": {"q": {"type": "string"}}}`，**同时** `permissions.execute.default` 换成 `"allow"` | 拒绝 | **`parameter_description_missing`**：第 6 行排在 `permission_unknown`（第 9 行）之前 |
| B 的 `input` 换成 `{"type": "object", "properties": {"m": {"type": "object", "description": "附加字段", "additionalProperties": {"type": "object", "properties": {"k": {"type": "string"}}}}}}` | **Schema 通过** · 表示层拒绝 | `parameter_description_missing`：对象形的 `additionalProperties` 是一个位置，它的 `properties` 里的 `k` 没带说明（[S-4](contract.md#s-4-单函数工具)「schema 的位置」） |
| B 的 `input` 换成 `{"type": "object", "properties": {"q": {"type": "string", "description": "查询词", "allOf": [{"properties": {"z": {"type": "string"}}}]}}}` | **Schema 通过** · 表示层拒绝 | `malformed`（M27）：`allOf` 不在可呈现子集里；它下面的 `z` 缺说明**不算**第 2 条违反——清单外的地方不走进去 |
| B 的 `input` 换成 `{"type": "object", "properties": {"q": {"type": "string", "title": "Q"}}}` | **Schema 通过** · 表示层拒绝 | **`parameter_description_missing`**：`q` 没带说明，又用了子集外的 `title`（M27）——第 2、3 条同时违反报前者（S-4 末段、S-26 第 6 行先于第 12 行） |
| B 加 `"settings": {"targetEnvironment": {"category": "placement_identity", "default": {"bindingLayer": "vm", "facilities": []}}}` | 拒绝 | `binding_layer_unknown`：[S-11](contract.md#s-11-目标环境)、[S-28](contract.md#s-28-判别式与枚举闭合) |
| B 加 `"settings": {"timeout": {"category": "security", "default": "PT1M"}}` | 拒绝 | `setting_category_unknown`：[S-10](contract.md#s-10-设置项声明) |
| B 的 `permissions.execute.default` 换成 `"allow"` | 拒绝 | `permission_unknown`：[S-15](contract.md#s-15-执行权限)；**不得**被当成 `auto` |
| B 的 `origin` 换成 `{"kind": "plugin"}` | 拒绝 | `tool_origin_unknown`：[S-17](contract.md#s-17-来源) |
| B 的 `name` 换成 `"search__issues"` | 拒绝 | `name_reserved_sequence`：`__` 是转写留给 `:` 的写法，转写之后对不回唯一的名字（[S-18](contract.md#s-18-名字的表示与相等) 第 2 条） |
| B 的 `name` 换成 `"a_:b"` | 拒绝 | `name_reserved_sequence`：`a_:b` 与 `a:_b` 都转写成 `a___b`——只禁 `__` 不够 |
| B 的 `paradigm` 换成 `"pipeline"`，**同时** `permissions.execute.default` 换成 `"allow"` | 拒绝 | **`paradigm_unknown`**：两处都不合时报次序靠前的那一行（S-26） |
| B 去掉 `permissions` | 拒绝 | `malformed`（M3）：执行权限必填、**不补任何一档**（[S-15](contract.md#s-15-执行权限)） |
| B 去掉 `origin` | 拒绝 | `malformed`（M3）：来源必填，没有缺省的「作者写的」（[S-17](contract.md#s-17-来源)） |
| B 加 `"waitsForReply": true` | 拒绝 | `malformed`（M4）：等待态不在定义里（[S-29](contract.md#s-29-不在定义里的三样)） |
| B 加 `"emitsFrames": true` | 拒绝 | `malformed`（M4）：发帧不在定义里（[S-29](contract.md#s-29-不在定义里的三样)） |
| B 加 `"implementation": {"module": "./fetch_page.js"}` | 拒绝 | `malformed`（M4）：实现不在定义里（[S-30](contract.md#s-30-实现不在定义里)） |
| B 加 `"allowBackground": "yes"` | 拒绝 | `malformed`（M5）：许可是布尔 |
| B 的 `name` 换成 `""` | 拒绝 | `malformed`（M6）：名字非空（[S-18](contract.md#s-18-名字的表示与相等)） |
| B 的 `name` 换成 `"fetch.page"` | 拒绝 | `malformed`（M25）：`.` 不在字符集里——Anthropic 的工具名不收它（[S-18](contract.md#s-18-名字的表示与相等) 第 1 条） |
| B 的 `name` 换成 `"x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:x:yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"` | **Schema 通过** · 表示层拒绝 | `malformed`（M25）：100 个码点、其中 30 个 `:`，转写之后 130 个字符（第 3 条；`:` 算两个，Schema 管不到） |
| B 加 `"settings": {"targetEnvironment": {"category": "placement_identity", "default": {"bindingLayer": "stateless_sandbox", "facilities": ["browser", "browser"]}}}` | 拒绝 | `malformed`（M7）：设施不重复 |
| B 加 `"needs": {"inputModalities": ["pdf"]}` | 拒绝 | `malformed`（M8）：不是一种模态（取值集归 `data.content-blocks` 的 `Modality`） |
| 第 3 节的例子，`endpoint.category` 换成 `"tool"` | 拒绝 | `malformed`（M9）：端点必须是一个 MCP 接入点的能力标识（[S-17](contract.md#s-17-来源)） |
| B 加 `"settings": {"targetEnvironment": {"category": "preference", "default": {"bindingLayer": "host_machine", "facilities": []}}}` | 拒绝 | `malformed`（M10）：目标环境的类别恒为 `placement_identity`——标成偏好就让工作区配得到它（[S-10](contract.md#s-10-设置项声明)） |
| B 加 `"allowBackground": true, "settings": {"backgroundThreshold": {"category": "preference", "default": "P1D"}}` | 拒绝 | `malformed`（M11）：不收日历单位，写 `PT24H`（[S-14](contract.md#s-14-时长的表示)） |
| B 加 `"settings": {"concurrency": {"category": "preference", "default": 0}}` | 拒绝 | `malformed`（M12）：并发是正整数（[S-13](contract.md#s-13-超时与并发)） |
| 第 2 节的例子加 `"input": {"type": "object", "properties": {}}` | 拒绝 | `malformed`（M13）：多命令工具的 input 由 `commands` 生成，**不存第二份**（[S-5](contract.md#s-5-多命令工具)） |
| 第 3 节的例子，`paradigm` 换成 `"multi"`、去掉 `input`、加 `"commands": {"search": {"description": "d", "input": {"type": "object", "properties": {}}}}` | 拒绝 | `malformed`（M14）：MCP 来源恒为单函数（[S-17](contract.md#s-17-来源)） |
| 第 3 节的例子加 `"composes": {"skills": ["triage-guide"]}` | 拒绝 | `malformed`（M14）：MCP 来源不组合（[S-16](contract.md#s-16-组合)） |
| B 加 `"settings": {"backgroundThreshold": {"category": "preference", "default": "PT30S"}}` | 拒绝 | `malformed`（M15）：有阈值没有许可——声明一个永远用不上的值只会误导（[S-12](contract.md#s-12-后台许可与转后台阈值)） |
| 上一行再加 `"allowBackground": false` | 拒绝 | `malformed`（M15）：许可必须恰为 `true` |
| 第 2 节的例子加 `"settings": {"backgroundThreshold": {"category": "preference", "default": "PT30S"}}` | 拒绝 | `malformed`（M15）：多命令工具同样适用 |
| 第 2 节的例子，`list.input` 换成 `{"type": "object", "properties": {"q": {"$ref": "#/$defs/query", "description": "查询词"}}, "$defs": {"query": {"type": "string"}}}` | **Schema 通过** · 表示层拒绝 | `malformed`（M24、M27）：命令 `input` 存在一份更大的定义里，根相对 `$ref` 按它自己作根还是按所在文档解析会给出两种结果（[S-7](contract.md#s-7-多命令-input-的生成规则) 第 5 条）；`$ref`、`$defs` 也不在可呈现子集里 |
| 第 2 节的例子，`list.input` 换成 `{"$id": "urn:example:list", "type": "object", "properties": {}}` | **Schema 通过** · 表示层拒绝 | `malformed`（M24、M27）：`$id` 同样改变解析基准，也不在可呈现子集里 |
| B 的 `input` 换成 `{"type": "array", "properties": {}}` | 拒绝 | `malformed`（M26）：顶层须恰是 `"type": "object"`——两家的参数 schema 都要一个对象（[S-4](contract.md#s-4-单函数工具) 第 1 条） |
| B 的 `input` 换成 `{"type": "object"}` | 拒绝 | `malformed`（M26）：顶层没带 `properties`——空对象也要写出来 |
| B 的 `input` 换成 `{"type": "object", "properties": {"q": {"type": "string", "description": "查询词", "title": "Query"}}}` | **Schema 通过** · 表示层拒绝 | `malformed`（M27）：`title` 不在可呈现子集里（[S-4](contract.md#s-4-单函数工具) 第 3 条） |
| B 的 `input` 换成 `{"type": "object", "properties": {}, "$schema": "http://json-schema.org/draft-07/schema#"}` | **Schema 通过** · 表示层拒绝 | `malformed`（M27）：`$schema` 同样不在——本契约对任何来源都这样判；不少 MCP 服务端的参数 schema 带着它，**桥在投影时先剥掉**（`capability.mcp-bridge/v1#S-17` 的最小规范化），交到这里的 MCP 来源定义里已经没有它 |

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

**`data.asset-model` 的 `$defs/SettingCategory`**（本契约 `$ref` 它，[S-10](contract.md#s-10-设置项声明)）

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
| `{"content": [{"id": "b1", "kind": "tool_call", "visibility": {"toHuman": true, "toModel": true}, "callId": "c9", "tool": "notes", "arguments": {}, "complete": true}]}` | 拒绝 | `result_call_in_content`（第 3 行）：结果里不发起调用（[S-22](contract.md#s-22-结果内容里没有工具调用)） |
| `{"content": [], "offload": {"raw": {"inline": "eA==", "mediaType": "text/plain"}, "summary": [{"id": "b3", "kind": "tool_call", "visibility": {"toHuman": false, "toModel": false}, "rawArguments": "{\"id\":", "complete": false}]}}` | 拒绝 | `result_call_in_content`（第 3 行）：半截的调用块同样不行，摘要里同样不行 |
| `42` | 拒绝 | `malformed`（M16）：既不是字符串也不是对象 |
| `null` | 拒绝 | `malformed`（M16）：没有「空返回」这一写法；什么都不给就写 `{"content": []}` |
| `{}` | 拒绝 | `malformed`（M17）：`content` 必填 |
| `{"content": [], "outcome": "failed"}` | 拒绝 | `malformed`（M18）：返回值不带收场（[S-25](contract.md#s-25-toolresult-不是收场)）；「失败」怎么表达是 [G-9](contract.md#十已知缺口) |
| `{"content": [], "offload": {"summary": [{"id": "b1", "kind": "text", "visibility": {"toHuman": true, "toModel": true}, "text": "摘要"}]}}` | 拒绝 | `malformed`（M17）：卸载必须给出原始结果 |
| `{"content": [], "offload": {"raw": {"inline": "eA==", "mediaType": "text/plain"}, "summary": []}}` | 拒绝 | `malformed`（M20）：摘要给了就非空——空摘要与没写摘要不是同一件事 |
| `{"content": [], "offload": {"raw": {"inline": "eA=="}}}` | 拒绝 | `malformed`（M17）：内联的原始结果必带媒体类型（[S-23](contract.md#s-23-卸载)） |
| `{"content": "找到 3 条"}` | 拒绝 | `malformed`（M19）：`content` 是块的数组；只给一段文本就直接返回字符串 |
| `{"content": [], "offload": {"raw": "eyJyb3dzIjogW119"}}` | 拒绝 | `malformed`（M21）：原始结果只有引用与内联两种形式，裸串不是其一 |
| `{"content": [], "offload": {"raw": {"inline": "不是 base64", "mediaType": "text/plain"}}}` | 拒绝 | `malformed`（M22）：内联字节按 base64 表示 |
| `{"content": [], "attachments": [{}]}` | 拒绝 | `malformed`（M23）：附件的地址必须是一个合法的 `AttachmentRef` |
| `{"content": [{"id": "b1", "kind": "text", "text": "缺标注"}]}` | 拒绝 | **以 `data.content-blocks` 的拒绝值报**（第 2 行）：块本身不合那份契约（缺两个标注），块的权威在那里 |

## 9. 生成规则的逐字核对

**对象**：第 2 节的三命令工具 `notes`，与它下面那份生成出的 input；规则是 [S-7](contract.md#s-7-多命令-input-的生成规则) 的五条（flat 形，产品负责人裁定 2026-09-24；[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡) rev 19「模型面前只有紧凑的命令清单一种样子」）。
**方式**：起草者逐字对读（2026-09-23；2026-09-24 按 flat 形重做）；**另经暂存区脚本机检**——从第 2 节的 `commands` 按 S-7 重算一遍，与第 2 节那份生成结果作 JSON 值比较，
并对它走 Schema 之外那一步（合法性、三条硬要求）；结果记在[验证入口](../verification.md#本地自检schema-正反实例整批对齐2026-09-24)。

| S-7 | 要求 | 在第 2 节那份生成结果里 | 对得上吗 |
|---|---|---|---|
| 第 1 条 | 成员恰此；`args` 不带 `properties` | 顶层恰 `type`、`properties`、`required`（`["command"]`）、`additionalProperties`（`false`）四个；`properties` 恰 `command`、`args`；`command` 恰 `type`（`"string"`）、`enum`、`description`；`args` 恰 `type`（`"object"`）与 `description`——**三个命令的 `id`、`text` 都不在** | 是 |
| 第 1 条 | `args` 的说明逐字是那一句 | `所选命令的参数；各命令的参数用法经 Tools().inspect 取得` | 是 |
| 第 2 条 | `enum` 恰是 `commands` 的全部键、码点升序；不为 `help` 多加值 | `["list", "read", "write"]`：`l`（U+006C）< `r`（U+0072）< `w`（U+0077），**与作者在 `commands` 里写的次序（`write`、`list`、`read`）无关**；`read` 带了 `help`，`enum` 里**没有**多出值 | 是 |
| 第 2 条 | 命令表：每行 `n — 命令说明`，行序同 `enum`，一个换行相连、末行后无换行 | `list — 列出全部笔记的标识。\nread — 读一条笔记。\nwrite — 写入或覆盖一条笔记。`；整个工具的 `description` **不在**生成结果里（它是条目的说明，[S-6](contract.md#s-6-模型面只有一个条目)） | 是 |
| 第 3、4 条 | 判定以 `commands[c].input` 为准；`args` 缺席按 `{}` 判 | 见下面的调用表 | 是 |
| 第 5 条 | 命令 `input` 不带根相对 `$ref` 与 `$id` | 三个命令的 `input` 都没有；反例在[第 5 节](#5-定义的反例每个拒绝值至少一个)（M24） | 是 |
| [S-4](contract.md#s-4-单函数工具) 三条 | 生成结果也满足三条硬要求 | 顶层 `type: "object"` 带 `properties`；`command`、`args` 各带非空说明，`args` 没有 `properties`、没有更深的参数；用到的关键字只有 `type` `properties` `required` `additionalProperties` `enum` `description` | 是 |

**结论：第 2 节那份生成结果与 S-7 逐条一致。**

**模型面只管命令名，参数由所选命令判**（对读，未机检）：

| 调用 | 过生成出的 input 吗 | 按所选命令自己的 `input` 判 |
|---|---|---|
| `{"command": "read", "args": {"id": "n1"}}` | **过** | 过 |
| `{"command": "read", "args": {}}` | **过**：`args` 是一个对象 | **不过**：缺 `id` |
| `{"command": "read"}` | **过**：`args` 不在 `required` 里 | 按 `{}` 判（第 4 条），**不过**：缺 `id` |
| `{"command": "list"}` | **过** | 按 `{}` 判，过 |
| `{"command": "list", "args": {"id": "n1"}}` | **过** | **不过**：`list` 的 `input` 不收成员 |
| `{"command": "delete", "args": {}}` | **不过**：`delete` 不在 `enum` 里 | —（不是命令） |
| `{"command": "read", "args": {"id": "n1"}, "note": "x"}` | **不过**：顶层 `additionalProperties: false` | — |
| `{"command": "read", "args": 5}` | **不过**：`args` 须是一个对象 | — |
| `"read"` | **不过**：顶层 `type` 是 `object` | — |

第二、三、五条调用**过了模型面、判定不过**——这正是 [S-7](contract.md#s-7-多命令-input-的生成规则) 第 3 条的义务：过模型面不等于参数合格，参数只由 `commands[c].input` 判。

**只带命令清单的写法**：把三个命令的 `input` 都换成 `{"type": "object", "properties": {}, "additionalProperties": true}`（[S-5](contract.md#s-5-多命令工具)），生成结果**逐字不变**——`enum` 与命令表只来自命令名与命令说明；这正是 PF-006 §5.3「两种写法在模型面前一模一样」。
变的只是判定：第二、三、五条调用此时判定也过——**参数对不对由工具自己判**（PF-006 §5.3 那张表第一行）；`{"command": "read", "args": 5}` 仍在模型面就不过，`{"command": "delete", "args": {}}` 仍不过。

**`additionalProperties` 没写时按 `false` 判**（[S-5](contract.md#s-5-多命令工具) 末条，主线裁定 2026-09-24）——换成 `{"type": "object", "properties": {}}`（不写 `additionalProperties`）时，生成结果同样逐字不变，判定却与上一段不同：

| 调用 | 按所选命令的 `input` 判 |
|---|---|
| `{"command": "read", "args": {}}`、`{"command": "read"}` | 过：没有键 |
| `{"command": "list", "args": {"id": "n1"}}` | **不过**：`id` 不在 `properties` 里，而 `input` 没显式收 |
| `{"command": "read", "args": {"id": "n1"}}` | **不过**：同上——这样写的三个命令都是「不收任何参数键」 |

第 2 节 `read` 的 `input` 若去掉 `"additionalProperties": false`，判定**不变**：`{"id": "n1", "ignore_case": true}` 照样不过（`ignore_case` 不在 `properties` 里）。

## 10. Schema 挡不住、但同样非法的

**本节不参与机检**——没有「校验对象」。它们形状上一概合法，只能由规范场景、消费者走查或评审拒绝。

| 做了什么 | 违反 |
|---|---|
| 两份 `name` 相同、`input` 不同的定义被当成两个工具，同时出现在动作空间里 | [S-2](contract.md#s-2-身份是-name)：同名即同一个工具的两份表示 |
| 定义里带了 `help`，`Tools().inspect` 对同一个工具说的是另一套用法 | [S-8](contract.md#s-8-说明与用法) |
| 一个没有 `allowBackground: true` 的工具，被用户手动切到后台，或随插队顺带转了后台 | [S-12](contract.md#s-12-后台许可与转后台阈值)：三个触发源都不绕开许可（有阈值无许可的定义已被 M15 拒在表示层） |
| `Tools().inspect` 把 `help` 当成一个命令来调，或装配为它在模型面多生成一支 | [S-8](contract.md#s-8-说明与用法)：`help` 是文本字段，由 `inspect` 呈现 |
| 替换件的 `input` 与原件不同，或它的 `name` 变了 | [S-6](contract.md#s-6-模型面只有一个条目)：同形，只换 `description` |
| 没声明 `needs.attachmentStorage` 的工具返回了 `attachments` | [S-24](contract.md#s-24-结果与声明对得上) |
| 没在 `outputModalities` 里声明 `image` 的工具返回了图块 | [S-24](contract.md#s-24-结果与声明对得上) |
| 运行时对一个没写 `summary` 的卸载生成了一段「内容概要」放进占位 | [S-23](contract.md#s-23-卸载)：系统不替作者写摘要 |
| 会话日志里出现了 `offload.raw` | [S-23](contract.md#s-23-卸载) |
| 运行时把一个看起来像 JSON 的裸字符串解析成 `ToolResult` | [S-20](contract.md#s-20-两种写法与等价规则) |
| 一份被表示层拒绝的定义被装成替换件，或从动作空间里静默消失 | [S-27](contract.md#s-27-表示层拒绝不是判定) |
| 运行时为了决定解不解析帧，先去查定义里有没有「会发帧」一格 | [S-29](contract.md#s-29-不在定义里的三样) |
| 从 `issue-tracker:search_issues`（或模型交回的 `issue-tracker__search_issues`）里拆出「来自哪个接入点」 | [S-18](contract.md#s-18-名字的表示与相等)：来源在 `origin`，不在名字里；逆转写只把 `__` 换回 `:`，不拆 |
| 传输适配为某一家挪动、删改参数 schema 里的关键字或说明（例如给某一家去掉 `enum`、改写命令表） | [S-6](contract.md#s-6-模型面只有一个条目)：投影是纯键名映射，不改写 schema |
| 运行时以「过了生成出的 input」代替按 `commands[c].input` 判参数 | [S-7](contract.md#s-7-多命令-input-的生成规则) 第 3 条：生成出的 input 不展示任何命令的参数，过了它只说明命令名对、`args` 是对象 |
| 装配把某个命令的参数 schema 放进 `args` 的 `properties`，或给每个命令各生成一支 `oneOf` | [S-7](contract.md#s-7-多命令-input-的生成规则) 第 1 条：模型面只支持 flat 形（产品负责人裁定 2026-09-24） |

## 11. 一份定义投成三家的线上形状

**对象**：第 3 节那份 MCP 来源的定义。它的名字带 `:`，正好走一遍转写（[S-6](contract.md#s-6-模型面只有一个条目)、[S-18](contract.md#s-18-名字的表示与相等)）。

它的模型面条目（**校验对象**：`$defs/ModelToolEntry`，**预期：通过**）：

```json
{
  "name": "issue-tracker__search_issues",
  "description": "在问题跟踪系统里按关键字搜索问题。",
  "parameters": {
    "type": "object",
    "properties": { "query": { "type": "string", "description": "搜索关键字，按空格分词。" } },
    "required": ["query"]
  }
}
```

| 实例 | 预期 | 依据 |
|---|---|---|
| 上面那份，`name` 换成 `"issue-tracker:search_issues"` | 拒绝 | 条目里的名字是转写之后的——`:` 不会出现在模型面 |
| 上面那份，去掉 `parameters` | 拒绝 | 三样都必有 |

**三家的线上形状**——下面三块**不参与机检**（校验对象：无，它们是供应商的形状，不是本契约的定义项）。**三块里的参数 schema 与上面 `parameters` 逐字相同，名字与说明逐字相同**，变的只有键名与外壳：

OpenAI Responses：

```json
{
  "type": "function",
  "name": "issue-tracker__search_issues",
  "description": "在问题跟踪系统里按关键字搜索问题。",
  "parameters": {
    "type": "object",
    "properties": { "query": { "type": "string", "description": "搜索关键字，按空格分词。" } },
    "required": ["query"]
  }
}
```

OpenAI Chat Completions ／ OpenRouter：

```json
{
  "type": "function",
  "function": {
    "name": "issue-tracker__search_issues",
    "description": "在问题跟踪系统里按关键字搜索问题。",
    "parameters": {
      "type": "object",
      "properties": { "query": { "type": "string", "description": "搜索关键字，按空格分词。" } },
      "required": ["query"]
    }
  }
}
```

Anthropic：

```json
{
  "name": "issue-tracker__search_issues",
  "description": "在问题跟踪系统里按关键字搜索问题。",
  "input_schema": {
    "type": "object",
    "properties": { "query": { "type": "string", "description": "搜索关键字，按空格分词。" } },
    "required": ["query"]
  }
}
```

**回来的调用**：模型交回名字 `issue-tracker__search_issues` ⇒ 逆转写得 `issue-tracker:search_issues` ⇒ 第 3 节那份定义；这一步唯一（[S-18](contract.md#s-18-名字的表示与相等) 第 2 条）。
**逆转写只在工具执行运行时起执行者之前做**（[S-6](contract.md#s-6-模型面只有一个条目)）：在那之前，调用块、日志与放行判断里流转的都是 `issue-tracker__search_issues`（`$defs/ModelToolName`）。
**Anthropic 的名字正则 `^[a-zA-Z0-9_-]{1,128}$` 收得下它**；转写之前的 `issue-tracker:search_issues` 它收不下——这就是要转写的原因（研究 V-2）。

**多命令工具一样只有一个条目**：第 2 节的三命令工具 `notes`。它的名字不带 `:`，`modelName` 就是 `notes`；`parameters` 是第 2 节那份生成结果。

它的模型面条目（**校验对象**：`$defs/ModelToolEntry`，**预期：通过**）：

```json
{
  "name": "notes",
  "description": "读写本会话的笔记。先选命令，再给那个命令的参数。",
  "parameters": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "enum": [
          "list",
          "read",
          "write"
        ],
        "description": "list — 列出全部笔记的标识。\nread — 读一条笔记。\nwrite — 写入或覆盖一条笔记。"
      },
      "args": {
        "type": "object",
        "description": "所选命令的参数；各命令的参数用法经 Tools().inspect 取得"
      }
    },
    "required": [
      "command"
    ],
    "additionalProperties": false
  }
}
```

三家的线上形状——下面三块**不参与机检**（校验对象：无）。三块里的参数 schema 与上面 `parameters` 逐字相同：

OpenAI Responses：

```json
{
  "type": "function",
  "name": "notes",
  "description": "读写本会话的笔记。先选命令，再给那个命令的参数。",
  "parameters": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "enum": [
          "list",
          "read",
          "write"
        ],
        "description": "list — 列出全部笔记的标识。\nread — 读一条笔记。\nwrite — 写入或覆盖一条笔记。"
      },
      "args": {
        "type": "object",
        "description": "所选命令的参数；各命令的参数用法经 Tools().inspect 取得"
      }
    },
    "required": [
      "command"
    ],
    "additionalProperties": false
  }
}
```

OpenAI Chat Completions ／ OpenRouter：

```json
{
  "type": "function",
  "function": {
    "name": "notes",
    "description": "读写本会话的笔记。先选命令，再给那个命令的参数。",
    "parameters": {
      "type": "object",
      "properties": {
        "command": {
          "type": "string",
          "enum": [
            "list",
            "read",
            "write"
          ],
          "description": "list — 列出全部笔记的标识。\nread — 读一条笔记。\nwrite — 写入或覆盖一条笔记。"
        },
        "args": {
          "type": "object",
          "description": "所选命令的参数；各命令的参数用法经 Tools().inspect 取得"
        }
      },
      "required": [
        "command"
      ],
      "additionalProperties": false
    }
  }
}
```

Anthropic：

```json
{
  "name": "notes",
  "description": "读写本会话的笔记。先选命令，再给那个命令的参数。",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "enum": [
          "list",
          "read",
          "write"
        ],
        "description": "list — 列出全部笔记的标识。\nread — 读一条笔记。\nwrite — 写入或覆盖一条笔记。"
      },
      "args": {
        "type": "object",
        "description": "所选命令的参数；各命令的参数用法经 Tools().inspect 取得"
      }
    },
    "required": [
      "command"
    ],
    "additionalProperties": false
  }
}
```

**回来的调用**：模型交回 `notes` 与 `{"command": "read", "args": {"id": "n1"}}` ⇒ 第 2 节那份定义的 `read` 命令，参数按 `commands.read.input` 判（[S-7](contract.md#s-7-多命令-input-的生成规则) 第 3 条、[第 9 节](#9-生成规则的逐字核对)的调用表）。

## 核对记

起草者逐条对过（2026-09-23，**人工**；同日按主线裁定修订后重对一次）：第 1～4 节的正例满足 [S-3](contract.md#s-3-两种范式)～[S-17](contract.md#s-17-来源) 的每一条形状要求；
第 5、8 节每个反例恰违反一处，且第三列的拒绝值与 M 编号与 [S-26](contract.md#s-26-表示层拒绝值与判定次序) 的次序一致；
第 6 节的时长实例与 [S-14](contract.md#s-14-时长的表示) 的写法一致；第 9 节按修订后的 S-7 重做，2026-09-24 按 flat 裁定再重做。**2026-09-24 整批对齐另做了机检**（Schema 一关与 Schema 之外那一步，结果与范围见[验证入口](../verification.md#本地自检schema-正反实例整批对齐2026-09-24)）；第 11 节的三块供应商形状不在机检之内。
