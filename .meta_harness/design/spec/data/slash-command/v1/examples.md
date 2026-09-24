# 规范实例与判定用例集

属于 `data.slash-command` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`slash-command.schema.json`](slash-command.schema.json) 的定义项在这里各有一组正反实例，非法的一律注明**拒绝值**与**被哪一条挡住**；
[识别文法与解析规则](contract.md#四识别文法)是函数，它们的规范表达是[第 4 节的判定用例集](#4-判定用例集)。

**怎么读第 1～3 节**：每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
每张表第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
第三列是按 [S-28](contract.md#s-28-表示层拒绝值) 定出的**拒绝值**（合法的写 `—`）；第四列是依据条款。
**这个格式也是机检格式**——逐节按「校验对象」把第一列喂给 Draft 2020-12 校验器（要能按 `$id` 解析到 `data.asset-model` v1 与它引用的 Schema）、拿第二列比对，不另抄一份清单。
**第三列不参与 Schema 机检**：Schema 只说通过与否，拒绝值的名字与优先级是契约的规则。

**三条读法上的边界：**

- **`通过` 只说形状合规。**参数名不重复、位置参数的次序、模板占位符对得上声明、`CommandInvocation` 与 `raw` 一致、所在记录的命令名与保留区对得上，都不在 Schema 的能力范围内——见[第 5 节](#5-schema-挡不住但同样非法的)。
- **示例里的名字只是示意。**`omne-official:reload-skill`、`omne-official:list-executions` 这两条 ③ 型命令与它们的 `ServiceName` 是为了演示形状编的；
  reload 一族有哪几条、各叫什么归 `capability.asset-registry`，系统业务流程本版只点名 reload 一族（[PF-002 §2 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)）。
- **除[第 6 节](#6-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**，拒绝值因此不需要优先级就能定；第 6 节专门演示优先级。

## 1. SlashCommandDefinition

**校验对象**：`$defs/SlashCommandDefinition`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"description": "审阅一段改动", "binding": {"kind": "prompt", "template": "Review this change: $ARGUMENTS"}}` | 通过 | — | [S-1](contract.md#s-1-斜杠命令定义是资产的正文)、[S-6](contract.md#s-6-三种绑定目标)：① 型，没有参数声明，整段文字作一个自由参数 |
| `{"description": "照代码审查技能办", "binding": {"kind": "skill", "skill": {"category": "skill", "name": "code-review"}}}` | 通过 | — | [S-6](contract.md#s-6-三种绑定目标)：② 型指向一个技能的能力标识 |
| `{"description": "按此刻的求值结果重填本会话的技能注册表", "binding": {"kind": "command", "service": "registry.reload.skill"}, "parameters": []}` | 通过 | — | [S-4](contract.md#s-4-保留区只归系统提供的命令型)：③ 型在保留区里；`[]` 是「不收任何参数」（[S-1](contract.md#s-1-斜杠命令定义是资产的正文)） |
| `{"description": "修一个 issue", "binding": {"kind": "prompt", "template": "Fix issue $0 on branch $1."}, "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": true}, {"name": "branch", "kind": "string", "required": false, "positional": true}]}` | 通过 | — | [S-8](contract.md#s-8-参数声明)～[S-10](contract.md#s-10-提示词模板与占位符)：两个位置参数都被 `$N` 引到 |
| `{"description": "报价", "binding": {"kind": "prompt", "template": "Quote \\$1.00 per unit for $ARGUMENTS"}}` | 通过 | — | [S-10](contract.md#s-10-提示词模板与占位符)：`\$1` 被转义，不算一个 `$N`，所以没有声明也合法 |
| `{"description": "审阅", "binding": {"kind": "macro", "template": "$ARGUMENTS"}}` | 拒绝 | `binding_unknown` | [S-6](contract.md#s-6-三种绑定目标)：三种之外，**不当作 `prompt` 兜底** |
| `{"description": "审阅", "binding": {"template": "$ARGUMENTS"}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-三种绑定目标)：判别成员缺席——那不是「不认得」，是「没说」 |
| `{"description": "部署", "binding": {"kind": "skill", "skill": {"category": "tool", "name": "deploy-guide"}}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-三种绑定目标)：skill 型的目标类别必为 `skill` |
| `{"description": "审阅", "binding": {"kind": "prompt", "template": ""}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-三种绑定目标)：模板非空 |
| `{"description": "重填", "binding": {"kind": "command", "service": " registry.reload.skill"}}` | 拒绝 | `malformed` | [S-7](contract.md#s-7-servicename)：首尾不得是空白 |
| `{"binding": {"kind": "prompt", "template": "$ARGUMENTS"}}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-斜杠命令定义是资产的正文)：`description` 必填 |
| `{"description": "审阅", "binding": {"kind": "prompt", "template": "$ARGUMENTS"}, "aliases": ["rv"]}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-斜杠命令定义是资产的正文)：恰三个成员，本版没有别名 |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $0"}, "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": false}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：`positional` 只取 `true`；具名参数不写这个成员 |
| `{"description": "部署", "binding": {"kind": "skill", "skill": {"category": "skill", "name": "deploy-guide"}}, "parameters": [{"name": "env", "kind": "enum", "required": true, "positional": true}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：`enum` 必带 `values` |
| `{"description": "问候", "binding": {"kind": "prompt", "template": "Hi $0"}, "parameters": [{"name": "who", "kind": "string", "values": ["a"], "required": true, "positional": true}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：只有 `enum` 带 `values` |
| `{"description": "部署", "binding": {"kind": "skill", "skill": {"category": "skill", "name": "deploy-guide"}}, "parameters": [{"name": "env", "kind": "enum", "values": ["prod", "prod"], "required": true, "positional": true}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：`values` 各不相同 |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $0"}, "parameters": [{"name": "Issue", "kind": "integer", "required": true, "positional": true}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：参数名只许小写 ASCII 起头 |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $0"}, "parameters": [{"name": "issue", "kind": "number", "required": true, "positional": true}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)、[S-27](contract.md#s-27-判别式与枚举闭合)：四种之外 |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $0"}, "parameters": [{"name": "issue", "kind": "integer", "positional": true}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：`required` 必填，**不当作 `false`** |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $0"}, "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": true, "hint": "issue 号，例如 42"}]}` | 通过 | — | [S-8](contract.md#s-8-参数声明)：参数提示在参数声明上 |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $0"}, "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": true, "hint": ""}]}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：`hint` 给出时非空 |
| `{"name": "review", "description": "审阅一段改动", "binding": {"kind": "prompt", "template": "Review this change: $ARGUMENTS"}}` | 拒绝 | `malformed` | [S-1](contract.md#s-1-斜杠命令定义是资产的正文)：**正文不带名字**——命令名是所在记录的 `capability.name` |

**校验对象**：`$defs/CommandName`——命令名不在正文里，它是所在资产记录 `capability` 的 name（[S-1](contract.md#s-1-斜杠命令定义是资产的正文)、[S-2](contract.md#s-2-命令名的词法)）；这张表单独校验名字本身。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"review"` | 通过 | — | [S-2](contract.md#s-2-命令名的词法) |
| `"omne-official:reload-skill"` | 通过 | — | [S-3](contract.md#s-3-保留区与它唯一的拼法)：保留区里唯一的拼法 |
| `"omne-official:summarize"` | 通过 | — | [S-3](contract.md#s-3-保留区与它唯一的拼法)：拼法合规；**它能不能用在一条 ① 型命令上是 [S-4](contract.md#s-4-保留区只归系统提供的命令型) 的事**，要看所在记录（第 5 节） |
| `"team:review"` | 通过 | — | [S-2](contract.md#s-2-命令名的词法)：冒号允许；不以保留前缀开头，就不在保留区 |
| `"omne-official"` | 通过 | — | [S-3](contract.md#s-3-保留区与它唯一的拼法)：保留区只认带冒号的 14 个码点，**只认前缀、不认清单** |
| `"审查"` | 通过 | — | [S-2](contract.md#s-2-命令名的词法)：本契约不收窄字符集 |
| `"OMNE-OFFICIAL:reload-skill"` | 拒绝 | `name_invalid` | [S-3](contract.md#s-3-保留区与它唯一的拼法) 第 2 条：在保留区里（按 ASCII 不区分大小写），但拼法不是小写的那一种。**不被改成小写后接受** |
| `"Omne-Official:review"` | 拒绝 | `name_invalid` | [S-3](contract.md#s-3-保留区与它唯一的拼法)：**这一条是冒充系统名的回归用例**——只认小写前缀的实现会放它通过，人眼里它就是系统那条 |
| `"omne-official:"` | 拒绝 | `name_invalid` | [S-3](contract.md#s-3-保留区与它唯一的拼法) 第 2 条：前缀之后至少还要有一个码点 |
| `"review/pr"` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-命令名的词法) 第 3 条：含 `/` 的名字敲不出来——识别文法把它当路径放行成普通文字 |
| `"code review"` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-命令名的词法) 第 2 条：名字在第一个空白处就断了 |
| `""` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-命令名的词法) 第 1 条 |
| `42` | 拒绝 | `malformed` | [S-28](contract.md#s-28-表示层拒绝值)：`name_invalid` 只在 `name` 是字符串时适用 |

## 2. CommandInvocation

**校验对象**：`$defs/CommandInvocation`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"raw": "/fix-issue 42 main", "name": "fix-issue", "argumentText": "42 main", "span": {"start": 0, "end": 10}}` | 通过 | — | [S-14](contract.md#s-14-commandinvocation-与位置) |
| `{"raw": "/OMNE-OFFICIAL:reload-skill", "name": "OMNE-OFFICIAL:reload-skill", "argumentText": "", "span": {"start": 0, "end": 27}}` | 通过 | — | [S-14](contract.md#s-14-commandinvocation-与位置)：`name` 只是输入里的那一段，**不必是合法的命令名**；它会在解析时得到 `unknown_command` |
| `{"raw": "//review x", "name": "/review", "argumentText": "x", "span": {"start": 0, "end": 8}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-识别的三种结果)：`//` 开头是字面发送，不是一次命令尝试 |
| `{"raw": "review x", "name": "review", "argumentText": "x", "span": {"start": 0, "end": 6}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-识别的三种结果)：不以 `/` 开头就不是命令尝试 |
| `{"raw": "/review x", "name": "review", "argumentText": " x", "span": {"start": 0, "end": 7}}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-commandinvocation-与位置)：`argumentText` 去掉了首尾空白 |
| `{"raw": "/review x", "name": "review", "argumentText": "x"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-commandinvocation-与位置)：`span` 必填 |
| `{"raw": "/review x", "name": "review", "argumentText": "x", "span": {"start": 0, "end": 7, "length": 7}}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-commandinvocation-与位置)：位置恰两个成员 |

## 3. ParseResult

**校验对象**：`$defs/ParseResult`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "expanded", "text": "Fix issue 42 on branch main."}` | 通过 | — | [S-21](contract.md#s-21-提示词型的展开) |
| `{"kind": "skill", "skill": {"category": "skill", "name": "code-review"}}` | 通过 | — | [S-22](contract.md#s-22-技能型的引用与两块展开物) |
| `{"kind": "command", "service": "execution.list", "arguments": {"state": "running", "limit": 5, "verbose": true}}` | 通过 | — | [S-23](contract.md#s-23-命令型的参数) |
| `{"kind": "command", "service": "registry.reload.skill", "arguments": {}}` | 通过 | — | [S-23](contract.md#s-23-命令型的参数)：声明了参数、这次一个没给 |
| `{"kind": "command", "service": "registry.reload.skill"}` | 通过 | — | [S-23](contract.md#s-23-命令型的参数)：`arguments` 缺席 = 这条命令不声明参数。**Schema 分不出它与上一行对不对得上那条命令**——要看定义 |
| `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 12}, "explanation": "这个会话没有 /nonexistent 这个命令"}` | 通过 | — | [S-16](contract.md#s-16-名字只按会话斜杠命令集认) |
| `{"kind": "failed", "reason": "missing_required", "explanation": "缺少必填参数 issue"}` | 通过 | — | [S-18](contract.md#s-18-参数的绑定与取值) 第 4 步：没有可指的位置 |
| `{"kind": "failed", "reason": "permission_denied", "explanation": "你不能用这个命令"}` | 拒绝 | `malformed` | [S-16](contract.md#s-16-名字只按会话斜杠命令集认)、[S-27](contract.md#s-27-判别式与枚举闭合)：**没有「你不能用」这第二种失败** |
| `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 13}, "explanation": "这个会话没有 /secret-audit 这个命令", "hint": "它在组织层存在，但你没有权限"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-parseresult-四支)：恰这几个成员。**这一条是 P-5 的回归用例**——多出的那一句正是产品正文刻意去掉的 |
| `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 11, "end": 14}}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-parseresult-四支)：`explanation` 必填——当场要说得出哪里不对 |
| `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 11, "end": 14}, "explanation": ""}` | 拒绝 | `malformed` | 同上，非空 |
| `{"kind": "command", "service": "execution.list", "arguments": {"limit": null}}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-参数的绑定与取值)：没给的参数缺席，**不写成 `null`** |
| `{"kind": "command", "service": "execution.list", "arguments": {"limit": 9007199254740992}}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-参数的绑定与取值)：整数的界 |
| `{"kind": "command", "service": "execution.list", "arguments": {"Limit": 5}}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-参数声明)：键是参数名，合参数名的词法 |
| `{"kind": "skill", "skill": {"category": "tool", "name": "read_file"}}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-parseresult-四支)：skill 支所指的类别必为 `skill` |
| `{"kind": "text", "text": "hello"}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-识别的三种结果)：普通文字是识别的结果之一，**不是 `ParseResult` 的一支** |
| `{"kind": "expanded", "text": "Review this change: x", "raw": "/review x"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-parseresult-四支)：原文在 `CommandInvocation` 里，**不重复携带** |

## 4. 判定用例集

**这是识别文法（[S-12](contract.md#s-12-只识别经交付面的输入)～[S-15](contract.md#s-15-一条输入至多一条命令)）与解析规则（[S-16](contract.md#s-16-名字只按会话斜杠命令集认)～[S-23](contract.md#s-23-命令型的参数)）的规范表达。**
每一个实现——交付面的人读、机读两种形式，与受理面——都要**逐行跑通**（[第六节](contract.md#六装配给与协议给)第一行）。

### 固定的会话斜杠命令集

下面每一行都以这一份 `S` 为会话斜杠命令集：八对「命令名 → 正文」，命令名两两不同，每一份正文都合第 1 节的形状（命令名是各自记录的 `capability.name`，[S-1](contract.md#s-1-斜杠命令定义是资产的正文)）：

```json
{
  "review": {"description": "审阅一段改动", "binding": {"kind": "prompt", "template": "Review this change: $ARGUMENTS"}},
  "standup": {"description": "写一段昨日小结", "binding": {"kind": "prompt", "template": "Summarize what I did yesterday."}},
  "fix-issue": {"description": "修一个 issue", "binding": {"kind": "prompt", "template": "Fix issue $0 on branch $1."},
    "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": true},
                   {"name": "branch", "kind": "string", "required": false, "positional": true}]},
  "quote-price": {"description": "报价", "binding": {"kind": "prompt", "template": "Quote \\$1.00 per unit for $ARGUMENTS"}},
  "code-review": {"description": "照代码审查技能办", "binding": {"kind": "skill", "skill": {"category": "skill", "name": "code-review"}}},
  "deploy-guide": {"description": "照部署指南办", "binding": {"kind": "skill", "skill": {"category": "skill", "name": "deploy-guide"}},
    "parameters": [{"name": "env", "kind": "enum", "values": ["staging", "prod"], "required": true, "positional": true}]},
  "omne-official:reload-skill": {"description": "按此刻的求值结果重填本会话的技能注册表", "binding": {"kind": "command", "service": "registry.reload.skill"}, "parameters": []},
  "omne-official:list-executions": {"description": "列出后台在跑的执行（示意）", "binding": {"kind": "command", "service": "execution.list"},
    "parameters": [{"name": "state", "kind": "enum", "values": ["running", "finished"], "required": true},
                   {"name": "limit", "kind": "integer", "required": false},
                   {"name": "verbose", "kind": "boolean", "required": false}]}
}
```

### 机检格式

每一行：

- **「输入」**是一个 JSON 字符串字面量，解码后就是交付面收到的那段文字 `T`（`\n`、`﻿` 这类转义是为了让看不见的码点写得出来）。
- **「识别」**恰是 `Recognition` 的 `kind`：`text`（普通文字）、`literal`（字面发送）、`invocation`（一次命令尝试）之一。
- **「交出的文字 / 命令尝试」**：`text` 与 `literal` 行是一个 JSON 字符串——**逐码点**等于识别交出去的那段文字；`invocation` 行是一个 `CommandInvocation`，逐成员相等。
- **「解析结果」**：`invocation` 行是以上面那份 `S` 解析得到的 `ParseResult`，**不含 `explanation`**——比对时除 `explanation` 外逐成员相等，`explanation` 只查非空；其余行是 `—`。
- 位置一律以码点计、左闭右开、相对输入（[S-14](contract.md#s-14-commandinvocation-与位置)）。

**不在表里、但同样要守的一条**：不经交付面的来源（连接件、定时到点、别的会话捎话）送来的文字**根本不交给识别文法**，其中的 `/xxx` 原样是内容（[S-12](contract.md#s-12-只识别经交付面的输入)）——它是调用方的义务，不是这张表能验的，见[验证入口 SC-1](../verification.md#静态检查义务)。

### 识别：普通文字与字面发送

| # | 输入 | 识别 | 交出的文字 / 命令尝试 | 解析结果 | 依据 |
|---|---|---|---|---|---|
| D-1 | `"hello /review world"` | `text` | `"hello /review world"` | — | [S-13](contract.md#s-13-识别的三种结果)：只看第一个码点；中间的 `/xxx` 是正文 |
| D-2 | `" /review add retry"` | `text` | `" /review add retry"` | — | [S-13](contract.md#s-13-识别的三种结果)：前导空白即不是命令，**原样送出、前导空白不被裁掉** |
| D-3 | `"﻿/review add retry"` | `text` | `"﻿/review add retry"` | — | [S-13](contract.md#s-13-识别的三种结果)：第一个码点是 U+FEFF。**脚本从文件读进来的输入常带它** |
| D-4 | `"/"` | `text` | `"/"` | — | [S-13](contract.md#s-13-识别的三种结果)：名字为空 |
| D-5 | `"/ review"` | `text` | `"/ review"` | — | [S-13](contract.md#s-13-识别的三种结果)：名字为空 |
| D-6 | `"/usr/bin/python3 --version"` | `text` | `"/usr/bin/python3 --version"` | — | [S-13](contract.md#s-13-识别的三种结果)：名字里有 `/`，路径放行（借 Codex） |
| D-7 | `"//review is a command name"` | `literal` | `"/review is a command name"` | — | [S-13](contract.md#s-13-识别的三种结果)：字面发送，恰去掉第一个 `/` |
| D-8 | `"///x"` | `literal` | `"//x"` | — | [S-13](contract.md#s-13-识别的三种结果)：只去掉一个 |

### 识别与解析：提示词型

| # | 输入 | 识别 | 交出的文字 / 命令尝试 | 解析结果 | 依据 |
|---|---|---|---|---|---|
| D-9 | `"/review"` | `invocation` | `{"raw": "/review", "name": "review", "argumentText": "", "span": {"start": 0, "end": 7}}` | `{"kind": "expanded", "text": "Review this change: "}` | [S-10](contract.md#s-10-提示词模板与占位符)：`$ARGUMENTS` 展开为空串；**不追加** `ARGUMENTS:` 一行 |
| D-10 | `"/review   add retry to the uploader  "` | `invocation` | `{"raw": "/review   add retry to the uploader  ", "name": "review", "argumentText": "add retry to the uploader", "span": {"start": 0, "end": 7}}` | `{"kind": "expanded", "text": "Review this change: add retry to the uploader"}` | [S-14](contract.md#s-14-commandinvocation-与位置)：参数文字去掉首尾空白，中间原样 |
| D-11 | `"/review\nsecond line"` | `invocation` | `{"raw": "/review\nsecond line", "name": "review", "argumentText": "second line", "span": {"start": 0, "end": 7}}` | `{"kind": "expanded", "text": "Review this change: second line"}` | [S-13](contract.md#s-13-识别的三种结果)：换行也是空白，名字到此为止 |
| D-12 | `"/review \"unterminated"` | `invocation` | `{"raw": "/review \"unterminated", "name": "review", "argumentText": "\"unterminated", "span": {"start": 0, "end": 7}}` | `{"kind": "expanded", "text": "Review this change: \"unterminated"}` | [S-17](contract.md#s-17-参数文字的切分)：**没有参数声明的命令不切分**，一个没闭合的引号原样是自由参数的一部分 |
| D-13 | `"/standup"` | `invocation` | `{"raw": "/standup", "name": "standup", "argumentText": "", "span": {"start": 0, "end": 8}}` | `{"kind": "expanded", "text": "Summarize what I did yesterday."}` | [S-21](contract.md#s-21-提示词型的展开) |
| D-14 | `"/standup finished the parser"` | `invocation` | `{"raw": "/standup finished the parser", "name": "standup", "argumentText": "finished the parser", "span": {"start": 0, "end": 8}}` | `{"kind": "expanded", "text": "Summarize what I did yesterday.\n\nARGUMENTS: finished the parser"}` | [S-21](contract.md#s-21-提示词型的展开)：模板没有占位符，人附带的文字追加在末尾，**不被吞掉** |
| D-15 | `"/quote-price widgets"` | `invocation` | `{"raw": "/quote-price widgets", "name": "quote-price", "argumentText": "widgets", "span": {"start": 0, "end": 12}}` | `{"kind": "expanded", "text": "Quote $1.00 per unit for widgets"}` | [S-10](contract.md#s-10-提示词模板与占位符)：`\$1` 转义成字面的 `$1`，转义用的 `\` 被去掉 |
| D-16 | `"/fix-issue 42 main"` | `invocation` | `{"raw": "/fix-issue 42 main", "name": "fix-issue", "argumentText": "42 main", "span": {"start": 0, "end": 10}}` | `{"kind": "expanded", "text": "Fix issue 42 on branch main."}` | [S-10](contract.md#s-10-提示词模板与占位符)、[S-18](contract.md#s-18-参数的绑定与取值)：`$N` 从 0 起 |
| D-17 | `"/fix-issue 42"` | `invocation` | `{"raw": "/fix-issue 42", "name": "fix-issue", "argumentText": "42", "span": {"start": 0, "end": 10}}` | `{"kind": "expanded", "text": "Fix issue 42 on branch ."}` | [S-10](contract.md#s-10-提示词模板与占位符)：可选的位置参数没给，`$1` 展开为空串 |
| D-18 | `"/fix-issue 42 \"feature branch\""` | `invocation` | `{"raw": "/fix-issue 42 \"feature branch\"", "name": "fix-issue", "argumentText": "42 \"feature branch\"", "span": {"start": 0, "end": 10}}` | `{"kind": "expanded", "text": "Fix issue 42 on branch feature branch."}` | [S-17](contract.md#s-17-参数文字的切分)：双引号把两个词拼成一个记号 |
| D-19 | `"/fix-issue 42 feature\\ branch"` | `invocation` | `{"raw": "/fix-issue 42 feature\\ branch", "name": "fix-issue", "argumentText": "42 feature\\ branch", "span": {"start": 0, "end": 10}}` | `{"kind": "expanded", "text": "Fix issue 42 on branch feature branch."}` | [S-17](contract.md#s-17-参数文字的切分) 第 2 条：`\` 让空白失去分隔的意思 |
| D-20 | `"/fix-issue \"42\""` | `invocation` | `{"raw": "/fix-issue \"42\"", "name": "fix-issue", "argumentText": "\"42\"", "span": {"start": 0, "end": 10}}` | `{"kind": "expanded", "text": "Fix issue 42 on branch ."}` | [S-17](contract.md#s-17-参数文字的切分)：引号只管分组，引起来的 `42` 照样是整数 |
| D-21 | `"/fix-issue -7"` | `invocation` | `{"raw": "/fix-issue -7", "name": "fix-issue", "argumentText": "-7", "span": {"start": 0, "end": 10}}` | `{"kind": "expanded", "text": "Fix issue -7 on branch ."}` | [S-18](contract.md#s-18-参数的绑定与取值)：`-7` 是位置值，不是选项 |
| D-22 | `"/fix-issue abc"` | `invocation` | `{"raw": "/fix-issue abc", "name": "fix-issue", "argumentText": "abc", "span": {"start": 0, "end": 10}}` | `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 11, "end": 14}}` | [S-18](contract.md#s-18-参数的绑定与取值)：整数要的是数字 |
| D-23 | `"/fix-issue"` | `invocation` | `{"raw": "/fix-issue", "name": "fix-issue", "argumentText": "", "span": {"start": 0, "end": 10}}` | `{"kind": "failed", "reason": "missing_required"}` | [S-18](contract.md#s-18-参数的绑定与取值) 第 4 步：没有 `at` |
| D-24 | `"/fix-issue 42 main extra"` | `invocation` | `{"raw": "/fix-issue 42 main extra", "name": "fix-issue", "argumentText": "42 main extra", "span": {"start": 0, "end": 10}}` | `{"kind": "failed", "reason": "unexpected_argument", "at": {"start": 19, "end": 24}}` | [S-18](contract.md#s-18-参数的绑定与取值) 第 2 步：位置参数已取满 |
| D-25 | `"/fix-issue --issue 42"` | `invocation` | `{"raw": "/fix-issue --issue 42", "name": "fix-issue", "argumentText": "--issue 42", "span": {"start": 0, "end": 10}}` | `{"kind": "failed", "reason": "unexpected_argument", "at": {"start": 11, "end": 18}}` | [S-18](contract.md#s-18-参数的绑定与取值) 第 1 步：`issue` 是位置参数，不能写成具名 |
| D-26 | `"/fix-issue 42 \"feature branch"` | `invocation` | `{"raw": "/fix-issue 42 \"feature branch", "name": "fix-issue", "argumentText": "42 \"feature branch", "span": {"start": 0, "end": 10}}` | `{"kind": "failed", "reason": "unterminated_quote", "at": {"start": 14, "end": 29}}` | [S-17](contract.md#s-17-参数文字的切分)：引号没闭合，从开引号到末尾 |

### 识别与解析：技能型

| # | 输入 | 识别 | 交出的文字 / 命令尝试 | 解析结果 | 依据 |
|---|---|---|---|---|---|
| D-27 | `"/code-review"` | `invocation` | `{"raw": "/code-review", "name": "code-review", "argumentText": "", "span": {"start": 0, "end": 12}}` | `{"kind": "skill", "skill": {"category": "skill", "name": "code-review"}}` | [S-22](contract.md#s-22-技能型的引用与两块展开物)：`argumentText` 为空，受理时**只展开一块** |
| D-28 | `"/code-review focus on error handling"` | `invocation` | `{"raw": "/code-review focus on error handling", "name": "code-review", "argumentText": "focus on error handling", "span": {"start": 0, "end": 12}}` | `{"kind": "skill", "skill": {"category": "skill", "name": "code-review"}}` | [S-22](contract.md#s-22-技能型的引用与两块展开物)：受理时展开两块，第二块是 `focus on error handling` |
| D-29 | `"/deploy-guide prod"` | `invocation` | `{"raw": "/deploy-guide prod", "name": "deploy-guide", "argumentText": "prod", "span": {"start": 0, "end": 13}}` | `{"kind": "skill", "skill": {"category": "skill", "name": "deploy-guide"}}` | [S-22](contract.md#s-22-技能型的引用与两块展开物)：有声明的 skill 型先验参数；第二块仍是 `prod` 原样 |
| D-30 | `"/deploy-guide qa"` | `invocation` | `{"raw": "/deploy-guide qa", "name": "deploy-guide", "argumentText": "qa", "span": {"start": 0, "end": 13}}` | `{"kind": "failed", "reason": "enum_out_of_range", "at": {"start": 14, "end": 16}}` | [S-18](contract.md#s-18-参数的绑定与取值)：三种绑定一条规则 |
| D-31 | `"/deploy-guide"` | `invocation` | `{"raw": "/deploy-guide", "name": "deploy-guide", "argumentText": "", "span": {"start": 0, "end": 13}}` | `{"kind": "failed", "reason": "missing_required"}` | [S-18](contract.md#s-18-参数的绑定与取值) |

### 识别与解析：命令型

| # | 输入 | 识别 | 交出的文字 / 命令尝试 | 解析结果 | 依据 |
|---|---|---|---|---|---|
| D-32 | `"/omne-official:reload-skill"` | `invocation` | `{"raw": "/omne-official:reload-skill", "name": "omne-official:reload-skill", "argumentText": "", "span": {"start": 0, "end": 27}}` | `{"kind": "command", "service": "registry.reload.skill", "arguments": {}}` | [S-23](contract.md#s-23-命令型的参数)：声明了「不收参数」，`arguments` 是空表 |
| D-33 | `"/omne-official:reload-skill now"` | `invocation` | `{"raw": "/omne-official:reload-skill now", "name": "omne-official:reload-skill", "argumentText": "now", "span": {"start": 0, "end": 27}}` | `{"kind": "failed", "reason": "unexpected_argument", "at": {"start": 28, "end": 31}}` | [S-1](contract.md#s-1-斜杠命令定义是资产的正文)：`[]` 与「没有声明」不同 |
| D-34 | `"/omne-official:list-executions --state running --limit 5 --verbose"` | `invocation` | `{"raw": "/omne-official:list-executions --state running --limit 5 --verbose", "name": "omne-official:list-executions", "argumentText": "--state running --limit 5 --verbose", "span": {"start": 0, "end": 30}}` | `{"kind": "command", "service": "execution.list", "arguments": {"state": "running", "limit": 5, "verbose": true}}` | [S-18](contract.md#s-18-参数的绑定与取值)：具名写法 `--name value`；`boolean` 只写名字即 `true` |
| D-35 | `"/omne-official:list-executions --state=finished --verbose=false"` | `invocation` | `{"raw": "/omne-official:list-executions --state=finished --verbose=false", "name": "omne-official:list-executions", "argumentText": "--state=finished --verbose=false", "span": {"start": 0, "end": 30}}` | `{"kind": "command", "service": "execution.list", "arguments": {"state": "finished", "verbose": false}}` | [S-18](contract.md#s-18-参数的绑定与取值)：`--name=value`；没给的 `limit` **缺席** |
| D-36 | `"/omne-official:list-executions --limit=5"` | `invocation` | `{"raw": "/omne-official:list-executions --limit=5", "name": "omne-official:list-executions", "argumentText": "--limit=5", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "missing_required"}` | [S-18](contract.md#s-18-参数的绑定与取值) 第 4 步：`state` 必填 |
| D-37 | `"/omne-official:list-executions --state=paused"` | `invocation` | `{"raw": "/omne-official:list-executions --state=paused", "name": "omne-official:list-executions", "argumentText": "--state=paused", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "enum_out_of_range", "at": {"start": 31, "end": 45}}` | [S-18](contract.md#s-18-参数的绑定与取值)：`=` 写法出错，`at` 是整个记号 |
| D-38 | `"/omne-official:list-executions --state running --limit five"` | `invocation` | `{"raw": "/omne-official:list-executions --state running --limit five", "name": "omne-official:list-executions", "argumentText": "--state running --limit five", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 55, "end": 59}}` | [S-18](contract.md#s-18-参数的绑定与取值)：空格写法出错，`at` 是值那个记号 |
| D-39 | `"/omne-official:list-executions --state running --state finished"` | `invocation` | `{"raw": "/omne-official:list-executions --state running --state finished", "name": "omne-official:list-executions", "argumentText": "--state running --state finished", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "unexpected_argument", "at": {"start": 47, "end": 54}}` | [S-18](contract.md#s-18-参数的绑定与取值)：同一具名参数给了两次，指第二次 |
| D-40 | `"/omne-official:list-executions --state running --color"` | `invocation` | `{"raw": "/omne-official:list-executions --state running --color", "name": "omne-official:list-executions", "argumentText": "--state running --color", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "unexpected_argument", "at": {"start": 47, "end": 54}}` | [S-18](contract.md#s-18-参数的绑定与取值)：没声明过的具名参数 |
| D-41 | `"/omne-official:list-executions --state"` | `invocation` | `{"raw": "/omne-official:list-executions --state", "name": "omne-official:list-executions", "argumentText": "--state", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "missing_required", "at": {"start": 31, "end": 38}}` | [S-18](contract.md#s-18-参数的绑定与取值) 第 1 步：具名写法后面没有值，`at` 指这个具名写法 |
| D-42 | `"/omne-official:list-executions --state running --verbose=yes"` | `invocation` | `{"raw": "/omne-official:list-executions --state running --verbose=yes", "name": "omne-official:list-executions", "argumentText": "--state running --verbose=yes", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 47, "end": 60}}` | [S-18](contract.md#s-18-参数的绑定与取值)：`boolean` 只认 `true` 与 `false` |
| D-43 | `"/omne-official:list-executions --state running --limit 9007199254740992"` | `invocation` | `{"raw": "/omne-official:list-executions --state running --limit 9007199254740992", "name": "omne-official:list-executions", "argumentText": "--state running --limit 9007199254740992", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 55, "end": 71}}` | [S-18](contract.md#s-18-参数的绑定与取值)：2^53 超出界，**不舍入** |
| D-44 | `"/omne-official:list-executions --state running --limit="` | `invocation` | `{"raw": "/omne-official:list-executions --state running --limit=", "name": "omne-official:list-executions", "argumentText": "--state running --limit=", "span": {"start": 0, "end": 30}}` | `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 47, "end": 55}}` | [S-18](contract.md#s-18-参数的绑定与取值)：`=` 后是空串，空串不是整数 |

### 识别与解析：这个会话没有的名字

| # | 输入 | 识别 | 交出的文字 / 命令尝试 | 解析结果 | 依据 |
|---|---|---|---|---|---|
| D-45 | `"/nonexistent do it"` | `invocation` | `{"raw": "/nonexistent do it", "name": "nonexistent", "argumentText": "do it", "span": {"start": 0, "end": 12}}` | `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 12}}` | [S-16](contract.md#s-16-名字只按会话斜杠命令集认)：**不当普通文字发出去** |
| D-46 | `"/secret-audit"` | `invocation` | `{"raw": "/secret-audit", "name": "secret-audit", "argumentText": "", "span": {"start": 0, "end": 13}}` | `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 13}}` | [S-16](contract.md#s-16-名字只按会话斜杠命令集认)：**设想它在组织层存在、只是这个人没权限**——它不在 `S` 里，结果与 D-45 同形；函数看不到「别处有没有」，这正是要的 |
| D-47 | `"/Review add retry"` | `invocation` | `{"raw": "/Review add retry", "name": "Review", "argumentText": "add retry", "span": {"start": 0, "end": 7}}` | `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 7}}` | [S-16](contract.md#s-16-名字只按会话斜杠命令集认)：大小写不同即不同名 |
| D-48 | `"/OMNE-OFFICIAL:reload-skill"` | `invocation` | `{"raw": "/OMNE-OFFICIAL:reload-skill", "name": "OMNE-OFFICIAL:reload-skill", "argumentText": "", "span": {"start": 0, "end": 27}}` | `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 27}}` | [S-3](contract.md#s-3-保留区与它唯一的拼法)：这个拼法的名字根本发布不出来 |
| D-49 | `"/a /b hi"` | `invocation` | `{"raw": "/a /b hi", "name": "a", "argumentText": "/b hi", "span": {"start": 0, "end": 2}}` | `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 2}}` | [S-15](contract.md#s-15-一条输入至多一条命令)：一条输入至多一条命令，`/b hi` 是参数文字 |
| D-50 | `"/--"` | `invocation` | `{"raw": "/--", "name": "--", "argumentText": "", "span": {"start": 0, "end": 3}}` | `{"kind": "failed", "reason": "unknown_command", "at": {"start": 0, "end": 3}}` | [S-13](contract.md#s-13-识别的三种结果)：名字不含 `/` 就是一次命令尝试；拼错的动作不会悄悄变成一句话 |

## 5. Schema 挡不住但同样非法的

**这些实例 Schema 这一关通过，接收边界必须拒绝**；拒绝值按 [S-28](contract.md#s-28-表示层拒绝值)。
**只跑 Schema 的实现会把它们全部放进来**——所以它们单列一节，机检时拿去验接收边界，不验 Schema。

| 实例 | 校验对象 | 拒绝值 | 依据 |
|---|---|---|---|
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $0 as $1"}, "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": true}, {"name": "issue", "kind": "string", "required": true, "positional": true}]}` | `SlashCommandDefinition` | `parameter_duplicate` | [S-9](contract.md#s-9-参数声明的结构约束) |
| `{"description": "部署", "binding": {"kind": "prompt", "template": "Deploy $0 $ARGUMENTS"}, "parameters": [{"name": "dry-run", "kind": "boolean", "required": false}, {"name": "target", "kind": "string", "required": true, "positional": true}]}` | `SlashCommandDefinition` | `positional_after_named` | [S-9](contract.md#s-9-参数声明的结构约束) |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix $1 on $0"}, "parameters": [{"name": "branch", "kind": "string", "required": false, "positional": true}, {"name": "issue", "kind": "integer", "required": true, "positional": true}]}` | `SlashCommandDefinition` | `malformed` | [S-9](contract.md#s-9-参数声明的结构约束) 第三条：必填位置参数排在可选的之后 |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix issue $0"}}` | `SlashCommandDefinition` | `malformed` | [S-10](contract.md#s-10-提示词模板与占位符) 第 1 条：没有声明，模板里就不得有没被转义的 `$N` |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix issue $2"}, "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": true}, {"name": "branch", "kind": "string", "required": false, "positional": true}]}` | `SlashCommandDefinition` | `malformed` | [S-10](contract.md#s-10-提示词模板与占位符) 第 1 条：只有两个位置参数，`$2` 指不到 |
| `{"description": "部署", "binding": {"kind": "prompt", "template": "Deploy now."}, "parameters": [{"name": "target", "kind": "string", "required": true}]}` | `SlashCommandDefinition` | `malformed` | [S-10](contract.md#s-10-提示词模板与占位符) 第 2 条：声明了具名参数，模板里却没有 `$ARGUMENTS`——验过的参数会被悄悄丢掉 |
| `{"description": "修", "binding": {"kind": "prompt", "template": "Fix issue $0."}, "parameters": [{"name": "issue", "kind": "integer", "required": true, "positional": true}, {"name": "branch", "kind": "string", "required": false, "positional": true}]}` | `SlashCommandDefinition` | `malformed` | [S-10](contract.md#s-10-提示词模板与占位符) 第 2 条：`branch` 没有去处 |
| 上面第 1 节第三行那份定义，所在资产记录的能力标识是 `slash_command/omne-official:reload-skill`、`origin` 是 `customized` | 资产记录（`data.asset-model` v1） | `name_reserved` | [S-4](contract.md#s-4-保留区只归系统提供的命令型) 第三行：③ 型本版只由系统提供 |
| 一份能力标识为 `{"category": "slash_command", "name": "omne-official:summarize"}` 的记录，正文 `{"description": "摘要", "binding": {"kind": "prompt", "template": "$ARGUMENTS"}}` | 资产记录（`data.asset-model` v1） | `name_reserved` | [S-4](contract.md#s-4-保留区只归系统提供的命令型)：① 型在保留区里。**不论记录是不是 `official`** |
| 一份能力标识为 `{"category": "slash_command", "name": "omne-official:code-review"}` 的记录，正文 `{"description": "审查", "binding": {"kind": "skill", "skill": {"category": "skill", "name": "code-review"}}}` | 资产记录（`data.asset-model` v1） | `name_reserved` | [S-4](contract.md#s-4-保留区只归系统提供的命令型)：② 型同理 |
| 一份能力标识为 `{"category": "slash_command", "name": "reload-skill"}` 的记录，正文 `{"description": "重填", "binding": {"kind": "command", "service": "registry.reload.skill"}}` | 资产记录（`data.asset-model` v1） | `name_reserved` | [S-4](contract.md#s-4-保留区只归系统提供的命令型)：③ 型必须在保留区里 |
| `{"raw": "/review x", "name": "reviews", "argumentText": "x", "span": {"start": 0, "end": 8}}` | `CommandInvocation` | `malformed` | [S-14](contract.md#s-14-commandinvocation-与位置)：按 `raw` 重新识别，名字是 `review` |
| `{"raw": "/review x", "name": "review", "argumentText": "x", "span": {"start": 0, "end": 6}}` | `CommandInvocation` | `malformed` | [S-14](contract.md#s-14-commandinvocation-与位置)：`span` 恒为 `{0, 1 + 名字的码点数}` |
| `{"kind": "failed", "reason": "type_mismatch", "at": {"start": 14, "end": 11}, "explanation": "这里要一个整数"}` | `ParseResult` | `malformed` | [S-14](contract.md#s-14-commandinvocation-与位置)：`start > end` |
| `{"kind": "failed", "reason": "type_mismatch", "explanation": "这里要一个整数"}` | `ParseResult` | `malformed` | [S-20](contract.md#s-20-parseresult-四支)：只有「必填参数没给」那一种失败没有 `at` |

## 6. 几处违例同时出现时取哪个拒绝值

每行是一份资产记录的命令名与正文，都有不止一处违例；拒绝值按 [S-28](contract.md#s-28-表示层拒绝值) 的次序取最前的那个。
**校验对象**：`$defs/SlashCommandDefinition`——只对第二列的正文，结果写在第三列；命令名与保留区要看记录，由接收边界判。

| 命令名 | 正文 | 正文过 Schema | 同时违反 | 拒绝值 |
|---|---|---|---|---|
| `omne-official:x` | `{"description": "x", "binding": {"kind": "macro", "template": "$ARGUMENTS"}}` | 拒绝 | 绑定种类不认得；保留区规则因此无从判起 | `binding_unknown` |
| `review/pr` | `{"description": "x", "binding": {"kind": "prompt", "template": "$ARGUMENTS"}, "parameters": [{"name": "a", "kind": "string", "required": true}, {"name": "a", "kind": "string", "required": true}]}` | 通过 | 名字含 `/`；参数同名 | `name_invalid` |
| `omne-official:x` | `{"description": "x", "binding": {"kind": "prompt", "template": "$ARGUMENTS"}, "parameters": [{"name": "b", "kind": "string", "required": false}, {"name": "a", "kind": "string", "required": true, "positional": true}]}` | 通过 | ① 型在保留区里；位置参数排在具名参数之后 | `name_reserved` |
| `x` | `{"description": "x", "binding": {"kind": "prompt", "template": "$ARGUMENTS"}, "parameters": [{"name": "b", "kind": "string", "required": false}, {"name": "b", "kind": "string", "required": true, "positional": true}]}` | 通过 | 参数同名；位置参数排在具名参数之后 | `parameter_duplicate` |
| `omne-official:x` | `{"description": "x", "binding": {"template": "$ARGUMENTS"}}` | 拒绝 | 绑定种类缺席；名字在保留区里 | `malformed`——**`kind` 缺席时保留区规则不判**（[S-4](contract.md#s-4-保留区只归系统提供的命令型)），不报 `name_reserved` |

## 7. 起草者的自核不是证据

起草时，判定用例集第 4 节的「交出的文字 / 命令尝试」与「解析结果」两列，是起草者按条款手写、再用自己对文法的一份一次性演算核对过的——
**那份演算与写条款的是同一个人、同一种读法**，它只能说明表里的值与起草者的读法不互相矛盾，**不能**说明条款无歧义，也**不是**任何实现的符合性证据。
第 1～3 节与第 5、6 节里的实例在 2026-09-24 整批对齐时用 Draft 2020-12 校验器跑过一遍（本地自检，只判 Schema 通过与否）；判定用例集仍只有起草者的演算。实际状态见[验证入口](../verification.md)。
