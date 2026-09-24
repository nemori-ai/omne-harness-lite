# 规范实例：合法与非法

属于 `data.skill-package` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`skill-package.schema.json`](skill-package.schema.json) 的定义项在这里各有一组正反实例，
非法的一律注明**拒绝值**与**被哪一条挡住**；[S-20](contract.md#s-20-skillmd-的文本形式与定界)、[S-21](contract.md#s-21-包的目录形式) 两种承载形式另有规则实例。

**怎么读**：

- 每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
- **表格行**：第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
  第三列是按 [S-24](contract.md#s-24-表示层拒绝值与判定次序) 定出的**拒绝值**（合法的写 `—`；`malformed` 带上它的来由编号 M1～M17）；第四列是依据条款。
- **大实例**写成带编号的 JSON 代码块，块上方一行写明三列；**变体行**写「在 X 上改动 Y」，机检时把改动应用到那个基准实例再求值。
- 这个格式也是机检格式：逐节按「校验对象」把实例喂给 Draft 2020-12 校验器、拿「Schema」一列比对。**「拒绝值」一列不参与 Schema 机检**——Schema 只说通过与否，拒绝值的名字与优先级是契约的规则。
- **第 6 节（文本形式）与第 10 节（目录形式）不是 JSON 实例**，不参与 Schema 机检；它们的预期是按条款读出的值或拒绝值。

**五条读法上的边界：**

- **`通过` 只说形状合规。**资源路径互不相同、设置项的项名互不相同、`default` 合取值域、清单头的名字等于所属能力标识——都不在 Schema 的能力范围内，见[第 9 节](#9-schema-挡不住但同样非法的)。
- **`name_mismatch` 需要上下文**：一份包单独过 Schema 时没有「所属能力标识」，这个值无从判；凡用到它的行都写明上下文。
- **技能名就是 `data.asset-model` 的 `CapabilityName`**（禁 `/`、允许 `:`，[S-2](contract.md#s-2-技能名的词法)）。
- **示例里的名字只是占位**：工具名 `read_file`、`run_tests`，依赖名 `github-api`，设施名 `python` 都不来自任何清单。
- **除[第 8 节](#8-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**，拒绝值因此不需要优先级就能定；第 8 节专门演示优先级。

## 1. 技能名

**校验对象**：`$defs/SkillName`。「拒绝值」一列按**不知道所属能力标识**填；知道时，这些名字作为 `manifest.name` 一律是 `name_mismatch`（它们必然不等于一个合法的能力标识名，[S-24](contract.md#s-24-表示层拒绝值与判定次序)）。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"code-review"` | 通过 | — | [S-2](contract.md#s-2-技能名的词法) |
| `"Review_Checklist"` | 通过 | — | [S-2](contract.md#s-2-技能名的词法)：**不收窄到开放格式的名字规则**（大写与下划线在开放格式里不合格，在本系统里合法） |
| `"review:strict"` | 通过 | — | [S-2](contract.md#s-2-技能名的词法) 第 3 条：允许 `:`（主线裁定） |
| `"代码审查"` | 通过 | — | [S-2](contract.md#s-2-技能名的词法)：本版不限字符集 |
| `"Code-Review"` | 通过 | — | [S-2](contract.md#s-2-技能名的词法) 第 4 条：与 `code-review` **不是**同一个名字 |
| `"code/review"` | 拒绝 | `malformed`（M6） | [S-2](contract.md#s-2-技能名的词法) 第 3 条：含 `/` |
| `"code review"` | 拒绝 | `malformed`（M6） | [S-2](contract.md#s-2-技能名的词法) 第 2 条 |
| `"code-review\n"` | 拒绝 | `malformed`（M6） | [S-2](contract.md#s-2-技能名的词法)：**这一条是 `$` 的回归用例**——pattern 以 `(?![\s\S])` 收尾，理由同 `data.identity-values/v1#S-31` |
| `"\ufeffcode-review"` | 拒绝 | `malformed`（M6） | [S-2](contract.md#s-2-技能名的词法)：前导 U+FEFF 属于那个显式空白码点集合——**这一条是 `\s` 的回归用例** |
| `""` | 拒绝 | `malformed`（M6） | [S-2](contract.md#s-2-技能名的词法) 第 1 条 |
| `7` | 拒绝 | `malformed`（M4） | [S-2](contract.md#s-2-技能名的词法)：不是字符串，谈不上词法 |

## 2. 清单头

**校验对象**：`$defs/SkillManifest`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"name": "code-review", "description": "Review a code change for correctness. Use when asked to review a diff, a PR or a commit."}` | 通过 | — | [S-4](contract.md#s-4-清单头开放格式的六个键)：只有两个必填键 |
| `{"name": "pdf-processing", "description": "Extract PDF text. Use when handling PDFs.", "license": "Apache-2.0", "compatibility": "Requires Python 3.14+ and uv", "metadata": {"author": "example-org", "version": "1.0"}, "allowed-tools": "Bash(git:*) Read"}` | 通过 | — | [S-4](contract.md#s-4-清单头开放格式的六个键)：六键齐全；`allowed-tools` 进表示但**不生效**（[S-5](contract.md#s-5-键的四类处置)） |
| `{"name": "code-review", "description": "d", "license": ""}` | 通过 | — | [S-4](contract.md#s-4-清单头开放格式的六个键)：开放格式对 `license` 只说是字符串 |
| `{"name": "code-review"}` | 拒绝 | `malformed`（M2） | [S-4](contract.md#s-4-清单头开放格式的六个键)：`description` 必填 |
| `{"description": "d"}` | 拒绝 | `malformed`（M2） | [S-4](contract.md#s-4-清单头开放格式的六个键)：`name` 必填 |
| `{"name": "code-review", "description": ""}` | 拒绝 | `malformed`（M5） | [S-4](contract.md#s-4-清单头开放格式的六个键)：1–1024 个字符 |
| `{"name": "code-review", "description": "<1025 个 a>"}` | 拒绝 | `malformed`（M5） | [S-4](contract.md#s-4-清单头开放格式的六个键)。机检时生成一个 1025 个码点的串；**1024 个的那一个须通过**——两条同跑，只跑一条看不出上限在哪 |
| `{"name": "code-review", "description": "d", "compatibility": ""}` | 拒绝 | `malformed`（M5） | [S-4](contract.md#s-4-清单头开放格式的六个键)：给出时 1–500 个字符 |
| `{"name": "code-review", "description": "d", "metadata": {"version": 1}}` | 拒绝 | `malformed`（M4） | [S-4](contract.md#s-4-清单头开放格式的六个键)：`metadata` 的值只许字符串——**不强转**（[S-25](contract.md#s-25-表示层拒绝不是判定也不修补)） |
| `{"name": "code-review", "description": "d", "metadata": {"a": {"b": "c"}}}` | 拒绝 | `malformed`（M4） | 同上：嵌套映射 |
| `{"name": "code-review", "description": "d", "allowed-tools": ["Read"]}` | 拒绝 | `malformed`（M4） | [S-4](contract.md#s-4-清单头开放格式的六个键)：开放格式写的是一个字符串 |
| `{"name": "code-review", "description": "d", "user-invocable": false}` | 拒绝 | `malformed`（M3） | [S-4](contract.md#s-4-清单头开放格式的六个键)：表示里没有第七个键。**从文本形式读入时这个键会被丢掉并留痕、包照样收下**——见[第 6 节](#6-skillmd-的文本形式) |
| `{"name": "code-review", "description": "d", "allowedTools": "Read"}` | 拒绝 | `malformed`（M3） | [S-22](contract.md#s-22-规范表示)：清单头的键逐字取开放格式，不改写成 camelCase |

## 3. 资源条目

**校验对象**：`$defs/ResourceEntry`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"path": "references/checklist.md"}` | 通过 | — | [S-9](contract.md#s-9-资源条目与包内路径) |
| `{"path": "scripts/extract.py", "mediaType": "text/x-python"}` | 通过 | — | [S-10](contract.md#s-10-资源只被读取不因读取而运行)：脚本的条目上也没有执行位——**表示不携带执行资格**；它在脚本集合里（[S-11](contract.md#s-11-脚本集合)） |
| `{"path": "assets/logo.png", "mediaType": "image/png"}` | 通过 | — | [S-9](contract.md#s-9-资源条目与包内路径) |
| `{"path": "agents/openai.yaml"}` | 通过 | — | [S-5](contract.md#s-5-键的四类处置) 第 3 条：外部生态的侧车文件**只是一份普通资源** |
| `{"path": ".hidden/..notes"}` | 通过 | — | [S-9](contract.md#s-9-资源条目与包内路径)：以点开头的段不是 `.` 或 `..` 段 |
| `{"path": "skill.md"}` | 通过 | — | [S-9](contract.md#s-9-资源条目与包内路径)：逐码点比较，它不是 `SKILL.md`（大小写不敏感文件系统上的撞名归读入方，[契约第十节](contract.md#十明确不承诺)） |
| `{"path": "scripts/extract.py", "executable": true}` | 拒绝 | `malformed`（M3） | [S-10](contract.md#s-10-资源只被读取不因读取而运行) 第 3 条：条目上没有执行位，**不被丢掉这一位后收下** |
| `{"path": "scripts/extract.py", "executable": false}` | 拒绝 | `malformed`（M3） | 同上：写 `false` 也不行——原来那个恒为 `false` 的成员已删（[D-040 §S18 S18-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s18skill-package报回的)） |
| `{"path": "a.md", "mediaType": "Text/Markdown"}` | 拒绝 | `malformed`（M9） | `data.content-blocks/v1#S-7`：媒体类型要小写 |
| `{"path": "a.md", "sha256": "9f86"}` | 拒绝 | `malformed`（M3） | [S-9](contract.md#s-9-资源条目与包内路径)：本版表示里没有摘要（[G-6](contract.md#九已知缺口)） |
| `{"path": "../other-skill/SKILL.md"}` | 拒绝 | `resource_escapes` | [S-9](contract.md#s-9-资源条目与包内路径) 第 2 条：`..` 段 |
| `{"path": "a/../../b"}` | 拒绝 | `resource_escapes` | 同上：中间的 `..` 段也算 |
| `{"path": "/etc/passwd"}` | 拒绝 | `resource_escapes` | 同上：以 `/` 开头 |
| `{"path": "C:/skills/x"}` | 拒绝 | `resource_escapes` | 同上：以盘符开头 |
| `{"path": "scripts\\run.py"}` | 拒绝 | `resource_escapes` | 同上：含反斜杠 |
| `{"path": "scripts//run.py"}` | 拒绝 | `malformed`（M7） | [S-9](contract.md#s-9-资源条目与包内路径) 第 3 条：空段——**写法不规范，不是逃逸** |
| `{"path": "./a.md"}` | 拒绝 | `malformed`（M7） | 同上：`.` 段 |
| `{"path": "references/"}` | 拒绝 | `malformed`（M7） | 同上：以 `/` 结尾 |
| `{"path": ""}` | 拒绝 | `malformed`（M7） | 同上：空串 |
| `{"path": "SKILL.md"}` | 拒绝 | `malformed`（M7） | [S-9](contract.md#s-9-资源条目与包内路径) 第 5 条：`SKILL.md` 不是资源 |
| `{"path": ".omne/skill.json"}` | 拒绝 | `malformed`（M7） | 同上：定义记录的保留路径不是资源 |

## 4. 定义记录

**校验对象**：`$defs/SkillDefinitionRecord`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"format": 1}` | 通过 | — | [S-12](contract.md#s-12-定义记录) 第 4 条：与缺席同义 |
| `{"format": 1, "tools": [{"category": "tool", "name": "read_file"}, {"category": "tool", "name": "run_tests"}]}` | 通过 | — | [S-13](contract.md#s-13-组合的工具清单) |
| `{"format": 1, "dependencies": ["github-api"]}` | 通过 | — | [S-14](contract.md#s-14-外部服务依赖) |
| `{"format": 1, "tools": [], "dependencies": [], "settings": []}` | 通过 | — | [S-13](contract.md#s-13-组合的工具清单)～[S-15](contract.md#s-15-设置项声明)：空数组与缺席同义 |
| `{"format": 2}` | 拒绝 | `definition_format_unsupported` | [S-12](contract.md#s-12-定义记录) 第 1 条 |
| `{"format": "1"}` | 拒绝 | `definition_format_unsupported` | 同上：在，却不是数 `1` |
| `{}` | 拒绝 | `malformed`（M15） | [S-12](contract.md#s-12-定义记录) 第 1 条：`format` 缺席 |
| `{"format": 1, "tools": [{"category": "skill", "name": "style-guide"}]}` | 拒绝 | `tool_ref_invalid` | [S-13](contract.md#s-13-组合的工具清单) 第 2 条：刻意不做 Skill 组合 Skill |
| `{"format": 1, "tools": [{"category": "mcp", "name": "github"}]}` | 拒绝 | `tool_ref_invalid` | 同上：Skill 不组合 MCP |
| `{"format": 1, "tools": [{"category": "converter", "name": "x"}]}` | 拒绝 | `tool_ref_invalid` | 同上：不是 `tool` 就是不合法的引用，不论它是不是八类之一 |
| `{"format": 1, "tools": [{"category": "tool", "name": "read/file"}]}` | 拒绝 | `tool_ref_invalid` | 同上：name 不合能力标识名的词法 |
| `{"format": 1, "tools": ["tool/read_file"]}` | 拒绝 | `malformed`（M10） | [S-13](contract.md#s-13-组合的工具清单)：能力标识恒是两分量对象 |
| `{"format": 1, "tools": [{"category": "tool"}]}` | 拒绝 | `malformed`（M10） | 同上：缺 name |
| `{"format": 1, "tools": [{"category": "tool", "name": "read_file"}, {"category": "tool", "name": "read_file"}]}` | 拒绝 | `malformed`（M10） | [S-13](contract.md#s-13-组合的工具清单)：不重复 |
| `{"format": 1, "dependencies": [""]}` | 拒绝 | `malformed`（M11） | [S-14](contract.md#s-14-外部服务依赖)：依赖名非空 |
| `{"format": 1, "dependencies": ["github-api", "github-api"]}` | 拒绝 | `malformed`（M11） | 同上：不重复 |
| `{"format": 1, "resident": true}` | 拒绝 | `malformed`（M3） | [S-18](contract.md#s-18-常驻不在包里)：**常驻不在包里**（[S-31](contract.md#s-31-常驻与预批准不从内容生效) 反例） |
| `{"format": 1, "permissions": []}` | 拒绝 | `malformed`（M3） | [S-12](contract.md#s-12-定义记录) 第 5 条：本版不收权限项，**空的也不收**——这一位不存在 |
| `{"format": 1, "environmentRequirement": {"bindingLayer": "stateless_sandbox", "facilities": ["python"]}}` | 通过 | — | [S-32](contract.md#s-32-执行环境要求)：执行环境要求是定义记录里的固定成员；**放进一份包时这份包必须有脚本**（第 5 节 5.3） |
| `{"format": 1, "environmentRequirement": {"bindingLayer": "host_machine", "facilities": []}}` | 通过 | — | [S-32](contract.md#s-32-执行环境要求) 第 1 条：`facilities` 可以为空——对设施没有要求 |
| `{"format": 1, "environmentRequirement": {"bindingLayer": "cloud_vm", "facilities": []}}` | 拒绝 | `binding_layer_unknown` | [S-24](contract.md#s-24-表示层拒绝值与判定次序)：绑定层四值之外——`data.tool-definition` 的值，原名携带；同一违例两处同名 |
| `{"format": 1, "environmentRequirement": {"bindingLayer": "stateless_sandbox"}}` | 拒绝 | `malformed`（M13） | [S-32](contract.md#s-32-执行环境要求) 第 1 条：`facilities` 必有——「对设施没有要求」写空数组 |
| `{"format": 1, "environmentRequirement": {"bindingLayer": "stateless_sandbox", "facilities": ["python", "python"]}}` | 拒绝 | `malformed`（M13） | 同上：设施不重复 |
| `{"format": 1, "environmentRequirement": {"bindingLayer": "stateless_sandbox", "facilities": [], "default": {"bindingLayer": "host_machine", "facilities": []}}}` | 拒绝 | `malformed`（M13） | [S-32](contract.md#s-32-执行环境要求) 第 2 条：它不是设置项，没有「默认值」这一说——多出成员即拒 |

**设置项声明**：以下几行都是 `{"format": 1, "settings": [<这一格>]}`。

| 实例（`settings` 的那一项） | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"item": "checklist", "kind": "setting", "category": "binding", "domain": {"kind": "open", "schema": {"type": "string", "enum": ["references/strict.md", "references/lenient.md"]}}, "default": "references/strict.md"}` | 通过 | — | [S-15](contract.md#s-15-设置项声明)：一项绑定类设置——指向包里的一个位置 |
| `{"item": "tone", "kind": "setting", "category": "preference", "domain": {"kind": "open", "schema": {"type": "string"}}, "default": "concise"}` | 通过 | — | 同上：偏好类 |
| `{"item": "targetEnvironment", "kind": "setting", "category": "preference", "domain": {"kind": "open", "schema": {"type": "string"}}, "default": "sandbox"}` | 通过 | — | [S-15](contract.md#s-15-设置项声明)：**本版没有保留项名**——一项叫这个名字的作者设置只是普通设置，类别由作者标，**不决定脚本落在哪**、不进依赖声明；执行环境要求走定义记录的 `environmentRequirement`（[S-32](contract.md#s-32-执行环境要求)，D-040 §四 L3′、§六 N-13） |
| `{"item": "reviewers", "kind": "permission", "domain": {"kind": "enum", "values": ["a", "b"]}, "default": "a"}` | 拒绝 | `malformed`（M12） | [S-15](contract.md#s-15-设置项声明) 第 1 条：设置项清单里没有权限 |
| `{"item": "lockdown", "kind": "setting", "category": "governance", "domain": {"kind": "open", "schema": {"type": "boolean"}}, "default": false}` | 拒绝 | `malformed`（M12） | 同上第 2 条：正文契约不产出治理类的项 |
| `{"item": "disabled", "kind": "setting", "category": "governance", "domain": {"kind": "open", "schema": {"type": "boolean"}}, "default": false}` | 拒绝 | `malformed`（M12） | 同上第 3 条：`disabled` 由 `data.asset-model` 保留，**照抄那一份声明也不行**（同时违反第 2 条；两条都归 M12，拒绝值不变） |
| `{"item": "tone", "kind": "setting", "domain": {"kind": "open", "schema": {"type": "string"}}, "default": "concise"}` | 拒绝 | `malformed`（M2） | [S-15](contract.md#s-15-设置项声明)：资产声明每一项设置时必须标类别 |
| `{"item": "usableBy", "kind": "setting", "category": "preference", "domain": {"kind": "open", "schema": {"type": "string"}}, "default": "self"}` | 拒绝 | `malformed`（M12） | [S-15](contract.md#s-15-设置项声明) 第 3 条：`usableBy` 由 `data.asset-model` 保留 |
| `{"item": "tone", "kind": "setting", "category": "security", "domain": {"kind": "open", "schema": {"type": "string"}}, "default": "concise"}` | 拒绝 | `setting_category_unknown` | [S-24](contract.md#s-24-表示层拒绝值与判定次序)：设置项类别四值之外——与 `data.tool-definition` 同名同义 |

## 5. 技能包

**校验对象**：`$defs/SkillPackage`

**5.1 一份只有 `SKILL.md` 的最小包**——Schema：通过 · 拒绝值：— · 依据：[S-3](contract.md#s-3-技能包的四个部分)、[S-4](contract.md#s-4-清单头开放格式的六个键)、[S-8](contract.md#s-8-正文逐字不展开不执行)

```json
{
  "manifest": {
    "name": "code-review",
    "description": "Review a code change for correctness and readability. Use when asked to review a diff, a pull request or a commit."
  },
  "body": "\n# Code review\n\n1. Read the whole change before commenting.\n2. Check behaviour first, style last.\n3. Say what you would change and why.\n",
  "resources": []
}
```

| 变体 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| 在 5.1 上删去 `manifest` | 拒绝 | `manifest_missing` | [S-3](contract.md#s-3-技能包的四个部分) |
| 在 5.1 上删去 `body` | 拒绝 | `malformed`（M2） | [S-3](contract.md#s-3-技能包的四个部分)：正文可以为空串，**不能缺席** |
| 在 5.1 上把 `body` 改成 `""` | 通过 | — | [S-8](contract.md#s-8-正文逐字不展开不执行) 第 3 条：空正文合法 |
| 在 5.1 上删去 `resources` | 拒绝 | `malformed`（M2） | [S-3](contract.md#s-3-技能包的四个部分)：没有资源写 `[]` |
| 在 5.1 上加 `"resident": true` | 拒绝 | `malformed`（M3） | [S-18](contract.md#s-18-常驻不在包里) |
| 在 5.1 上加 `"capability": {"category": "skill", "name": "code-review"}` | 拒绝 | `malformed`（M3） | [S-1](contract.md#s-1-技能包是什么)：身份不在包里 |
| 5.1 作为能力标识 `{"category": "skill", "name": "code-review"}` 那份记录的草稿 | 通过 | — | [S-6](contract.md#s-6-名字与所属能力标识一致)（[S-26](contract.md#s-26-名字对不上即拒) 正例） |
| 5.1 作为能力标识 `{"category": "skill", "name": "Code-Review"}` 那份记录的草稿 | 通过 | `name_mismatch` | [S-6](contract.md#s-6-名字与所属能力标识一致)（[S-26](contract.md#s-26-名字对不上即拒) 反例）：**Schema 看不到上下文**，由知道能力标识的接收边界拒；不被折成相等，也不被改名后收下 |

**5.2 带定义记录：组合两个工具，声明一项绑定类设置**——Schema：通过 · 拒绝值：— · 依据：[S-12](contract.md#s-12-定义记录)、[S-13](contract.md#s-13-组合的工具清单)、[S-15](contract.md#s-15-设置项声明)

```json
{
  "manifest": {
    "name": "code-review",
    "description": "Review a code change for correctness and readability. Use when asked to review a diff, a pull request or a commit.",
    "license": "Apache-2.0"
  },
  "body": "\n# Code review\n\nFollow the checklist named by the `checklist` setting.\nRead the files the change touches, then run the tests.\n",
  "definition": {
    "format": 1,
    "tools": [
      { "category": "tool", "name": "read_file" },
      { "category": "tool", "name": "run_tests" }
    ],
    "settings": [
      {
        "item": "checklist",
        "kind": "setting",
        "category": "binding",
        "domain": { "kind": "open", "schema": { "type": "string", "enum": ["references/strict.md", "references/lenient.md"] } },
        "default": "references/strict.md"
      }
    ]
  },
  "resources": [
    { "path": "references/strict.md", "mediaType": "text/markdown" },
    { "path": "references/lenient.md", "mediaType": "text/markdown" }
  ]
}
```

它的依赖声明（[S-16](contract.md#s-16-由包得出的依赖声明)）恰两项：能力标识 `tool/read_file`、`tool/run_tests` 下各有一个生效且可用的工具。
它推出的属性项（[S-17](contract.md#s-17-属性项投影规则)）是 `checklist` 一项；这份技能的全部属性项另有 `data.asset-model` 保留的 `disabled` 与 `usableBy`。

| 变体 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| 在 5.2 上把 `definition.format` 改成 `2` | 拒绝 | `definition_format_unsupported` | [S-12](contract.md#s-12-定义记录)（[S-30](contract.md#s-30-定义记录的格式不认得即拒且先于其余) 反例） |
| 在 5.2 上往 `tools` 加 `{"category": "skill", "name": "style-guide"}` | 拒绝 | `tool_ref_invalid` | [S-13](contract.md#s-13-组合的工具清单)（[S-29](contract.md#s-29-组合清单只收工具) 反例） |
| 在 5.2 上往 `resources` 加 `{"path": "../shared/strict.md"}` | 拒绝 | `resource_escapes` | [S-9](contract.md#s-9-资源条目与包内路径)（[S-28](contract.md#s-28-资源路径不出包) 反例） |
| 在 5.2 上往 `definition` 加 `"permissions": []` | 拒绝 | `malformed`（M3） | [S-12](contract.md#s-12-定义记录) 第 5 条 |
| 在 5.2 上把 `checklist` 的 `default` 改成 `"references/other.md"` | 通过 | `malformed`（M12） | [S-15](contract.md#s-15-设置项声明) 第 5 条：**Schema 管不到**——`default` 不合它自己的取值域 |

**5.3 带脚本与执行环境要求、依赖一项外部服务**——Schema：通过 · 拒绝值：— · 依据：[S-11](contract.md#s-11-脚本集合)、[S-14](contract.md#s-14-外部服务依赖)、[S-32](contract.md#s-32-执行环境要求)

```json
{
  "manifest": {
    "name": "pr-triage",
    "description": "Triage open pull requests and label them. Use when asked to sort or label the PR queue.",
    "compatibility": "Needs network access to the code host"
  },
  "body": "\n# PR triage\n\nRun `scripts/triage.py` to list open pull requests, then label each one.\n",
  "definition": {
    "format": 1,
    "dependencies": ["github-api"],
    "environmentRequirement": { "bindingLayer": "stateless_sandbox", "facilities": ["python"] }
  },
  "resources": [
    { "path": "scripts/triage.py", "mediaType": "text/x-python" },
    { "path": "references/labels.md", "mediaType": "text/markdown" }
  ]
}
```

脚本集合恰为 `scripts/triage.py` 一份；`references/labels.md` 不能经 `exec_script` 运行。
依赖声明恰两项：外部服务 `github-api`、声明的执行环境要求（`stateless_sandbox` × `python`，原样，不经求值）。**`compatibility` 那句话不进依赖声明**（[S-16](contract.md#s-16-由包得出的依赖声明)）。
这份要求是内容：任何一层都不能为它配值；要改它就发一版新内容（[S-32](contract.md#s-32-执行环境要求)）。

| 变体 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| 在 5.3 上删去 `scripts/triage.py` 那条资源 | 拒绝 | `malformed`（M14） | [S-32](contract.md#s-32-执行环境要求) 第 4 条：没有脚本就不得声明执行环境要求 |
| 在 5.3 上把 `scripts/triage.py` 改成 `bin/triage.py` | 拒绝 | `malformed`（M14） | [S-11](contract.md#s-11-脚本集合)：只有 `scripts/` 下的算脚本 |
| 在 5.3 上把 `scripts/triage.py` 改成 `scripts`（包根下一个就叫 `scripts` 的文件） | 拒绝 | `malformed`（M14） | [S-11](contract.md#s-11-脚本集合)：只有一段的 `scripts` 不是脚本——与 Schema 的 `^scripts/` 同一判据 |
| 在 5.3 上删去 `environmentRequirement` | 通过 | — | [S-32](contract.md#s-32-执行环境要求) 第 3 条：脚本对执行环境没有特殊要求；依赖声明只剩 `github-api` |
| 在 5.3 上往 `definition` 加 `"settings": [{"item": "targetEnvironment", "kind": "setting", "category": "placement_identity", "domain": {"kind": "open", "schema": {"type": "object"}}}]` | 通过 | — | [S-15](contract.md#s-15-设置项声明)：一项普通的作者设置；**依赖声明与脚本的落点要求仍只看 `environmentRequirement`**（[P-7](contract.md#性质)） |
| 在 5.3 上往 `definition` 加 `"tools": [{"category": "mcp", "name": "github"}]` | 拒绝 | `tool_ref_invalid` | [S-13](contract.md#s-13-组合的工具清单) 第 3 条：要那个对端在场，声明的是外部服务（本例已有 `github-api`） |

## 6. SKILL.md 的文本形式

**不是 JSON 实例，不参与 Schema 机检。**第一列是 `SKILL.md` 的全文（JSON 字符串转义写法）；第二列是按 [S-20](contract.md#s-20-skillmd-的文本形式与定界) 读出的 `manifest`（或拒绝值）；第三列是读出的 `body`；第四列是依据与读入方要留的痕迹。

| `SKILL.md` 全文 | `manifest` | `body` | 依据 |
|---|---|---|---|
| `"---\nname: code-review\ndescription: see a---b here\n---\n\n# Review\nRun $ARGUMENTS\n"` | `{"name": "code-review", "description": "see a---b here"}` | `"\n# Review\nRun $ARGUMENTS\n"` | 第 3、4 条：行中的 `---` 不闭合；正文开头的空行保留，`$ARGUMENTS` 原样（[S-27](contract.md#s-27-正文逐字) 正例） |
| `"---\r\nname: x\r\ndescription: d\r\n---\r\nbody\r\n"` | `{"name": "x", "description": "d"}` | `"body\r\n"` | 第 2、4 条：CRLF 是行终止符；正文里的 CRLF 原样 |
| `"---\nname: x\ndescription: d\n---"` | `{"name": "x", "description": "d"}` | `""` | 第 4 条：闭合行之后没有字符 |
| `"---\nname: no\ndescription: d\n---\n"` | `{"name": "no", "description": "d"}` | `""` | 第 5 条：YAML 1.2 下 `no` 是字符串（YAML 1.1 会读成布尔——**这一条是解析器版本的回归用例**） |
| `"---\nname: x\ndescription: d\nuser-invocable: false\nversion: 1.2.0\n---\nbody"` | `{"name": "x", "description": "d"}` | `"body"` | [S-5](contract.md#s-5-键的四类处置)：两个键不生效、不进表示；**读入方留痕**：`user-invocable`（外部属性类）、`version`（未知） |
| `"---\nname: x\ndescription: d\nallowed-tools: Bash(git:*) Read\n---\n"` | `{"name": "x", "description": "d", "allowed-tools": "Bash(git:*) Read"}` | `""` | [S-5](contract.md#s-5-键的四类处置)：六键之一，进表示、**不生效**（[S-31](contract.md#s-31-常驻与预批准不从内容生效) 正例） |
| `"name: x\ndescription: d\n"` | `malformed`（M16） | — | 第 1 条：没有开头行 |
| `"\ufeff---\nname: x\ndescription: d\n---\n"` | `malformed`（M16） | — | 第 1 条：**不去 BOM** |
| `"---\nname: x\ndescription: d\n"` | `malformed`（M16） | — | 第 3 条：找不到闭合行——**不截到某个 `---` 为止** |
| `"---\nname: x\ndescription: d\n--- \nbody"` | `malformed`（M16） | — | 第 3 条：`--- ` 带尾随空格，不是闭合行；此后再无闭合行 |
| `"---\nname: x\nname: y\ndescription: d\n---\n"` | `malformed`（M16） | — | 第 5 条：键重复 |
| `"---\n---\n"` | `malformed`（M16） | — | 第 5 条：空的 frontmatter 不是映射 |
| `"---\n- name\n---\n"` | `malformed`（M16） | — | 第 5 条：是列表，不是映射 |
| `"---\nname: x\ndescription: 123\n---\n"` | `malformed`（M16） | — | 第 6 条：`description` 解析成整数，**不强转** |
| `"---\nname: x\ndescription: d\nmetadata:\n  version: 1.0\n---\n"` | `malformed`（M16） | — | 第 6 条：`metadata` 的值解析成数 |

**反例的判据是「读出的值」，不是「解析成功」**：一个按子串找 `---` 的实现，第一行会读出 `description: "see a"`、正文从 `b here` 开始，而且报成功（[S-27](contract.md#s-27-正文逐字) 反例一）。

## 7. 每个拒绝值一个反例

| 拒绝值 | 反例 | 上下文 | 依据 |
|---|---|---|---|
| `manifest_missing` | `{"body": "x", "resources": []}` | —— | [S-3](contract.md#s-3-技能包的四个部分) |
| `name_mismatch` | 5.1 | 所属能力标识 `{"category": "skill", "name": "Code-Review"}` | [S-6](contract.md#s-6-名字与所属能力标识一致) |
| `definition_format_unsupported` | 5.2，`definition.format` 为 `2` | —— | [S-12](contract.md#s-12-定义记录) |
| `resource_escapes` | 5.1，`resources` 为 `[{"path": "/etc/passwd"}]` | —— | [S-9](contract.md#s-9-资源条目与包内路径) |
| `tool_ref_invalid` | 5.1 加 `"definition": {"format": 1, "tools": [{"category": "skill", "name": "style-guide"}]}` | —— | [S-13](contract.md#s-13-组合的工具清单) |
| `binding_layer_unknown` | 5.3，`environmentRequirement.bindingLayer` 为 `"cloud_vm"` | —— | [S-24](contract.md#s-24-表示层拒绝值与判定次序)：`data.tool-definition` 的值，原名携带 |
| `setting_category_unknown` | 5.2，`checklist` 的 `category` 为 `"security"` | —— | [S-24](contract.md#s-24-表示层拒绝值与判定次序)：与 `data.tool-definition` 同名同义 |
| `malformed` | 5.1，`body` 为 `null` | —— | [S-3](contract.md#s-3-技能包的四个部分)（M4） |

## 8. 几处违例同时出现时取哪个拒绝值

次序：`manifest_missing` > `name_mismatch` > `definition_format_unsupported` > `resource_escapes` > `tool_ref_invalid` > `binding_layer_unknown` > `setting_category_unknown` > `malformed`（[S-24](contract.md#s-24-表示层拒绝值与判定次序)）。
**这一节的实例故意各违反两条以上**；拒绝值只有一个，就是次序里最靠前的那个。

| 实例 | 同时违反 | 拒绝值 |
|---|---|---|
| `{"body": "x", "resources": [{"path": "/etc/passwd"}], "definition": {"format": 2}}` | 缺清单头；资源逃逸；格式不认得 | `manifest_missing` |
| 5.1 把 `resources` 改成 `[{"path": "../x"}]`，所属能力标识 name 为 `other` | 名字对不上；资源逃逸 | `name_mismatch` |
| 5.2 把 `definition.format` 改成 `2`、`tools` 加一个 `skill` | 格式不认得；工具引用不合法 | `definition_format_unsupported`——**格式不认得，其余成员不再判**（[S-30](contract.md#s-30-定义记录的格式不认得即拒且先于其余)） |
| 5.2 往 `resources` 加 `{"path": "C:/x"}`、`tools` 加一个 `mcp` | 资源逃逸；工具引用不合法 | `resource_escapes` |
| 5.2 往 `tools` 加一个 `skill`、往 `definition` 加 `"dependencies": ["a", "a"]` | 工具引用不合法；依赖名重复 | `tool_ref_invalid` |
| 5.2 往 `tools` 加一个 `mcp`、把 `checklist` 的 `category` 改成 `"security"` | 工具引用不合法；类别不认得 | `tool_ref_invalid` |
| 5.3 把 `environmentRequirement.bindingLayer` 改成 `"cloud_vm"`、往 `definition` 加 `"tools": [{"category": "mcp", "name": "github"}]` | 绑定层不认得；工具引用不合法 | `tool_ref_invalid` |
| 5.3 把 `environmentRequirement.bindingLayer` 改成 `"cloud_vm"`、往 `definition` 加 `"dependencies": [""]` | 绑定层不认得；依赖名为空 | `binding_layer_unknown` |
| 5.2 把 `checklist` 的 `category` 改成 `"security"`、再加一项同名的 `checklist` | 类别不认得；项名重复 | `setting_category_unknown` |
| 5.1 把 `manifest.name` 改成 `"code/review"`，所属能力标识 name 为 `code-review` | 名字词法；名字对不上 | `name_mismatch` |
| 同上，不知道所属能力标识 | 名字词法 | `malformed`（M6） |

## 9. Schema 挡不住，但同样非法的

**这一节的实例 Schema 全部通过，接收边界仍须拒绝**——只跑 Schema 的实现会全部放过。

| 实例 | 拒绝值 | 为什么 Schema 挡不住 | 依据 |
|---|---|---|---|
| 5.1，`resources` 为 `[{"path": "a.md"}, {"path": "a.md", "mediaType": "text/markdown"}]` | `malformed`（M8） | 两项不全等，`uniqueItems` 看不出它们指同一个路径 | [S-9](contract.md#s-9-资源条目与包内路径) 第 4 条 |
| 5.1，`resources` 为 `[{"path": "scripts"}, {"path": "scripts/a.py"}]` | `malformed`（M8） | 前缀关系要跨两项比 | 同上：一个路径不能既是文件又是目录 |
| 5.2，`settings` 里两项都叫 `checklist` | `malformed`（M12） | `item` 相同、其余成员不同，`uniqueItems` 看不出 | [S-15](contract.md#s-15-设置项声明) 第 4 条 |
| 5.2，`checklist` 的 `default` 为 `"references/other.md"` | `malformed`（M12） | 要拿 `default` 去过它自己的那份 schema | [S-15](contract.md#s-15-设置项声明) 第 5 条 |
| 5.1 作为能力标识 name 为 `Code-Review` 的记录的内容 | `name_mismatch` | 包里没有所属能力标识 | [S-6](contract.md#s-6-名字与所属能力标识一致) |

## 10. 包的目录形式

**不是 JSON 实例，不参与 Schema 机检。**第一列描述一个目录（`→` 后是符号链接的目标）；第二列是按 [S-21](contract.md#s-21-包的目录形式) 读出的结果。

| 目录 | 读出 | 依据 |
|---|---|---|
| `SKILL.md`（5.1 的文本形式）、`references/a.md`、`scripts/run.sh`（文件系统上带执行位） | 一份包：`resources` 两条，**文件系统的执行位不进表示**；脚本集合为 `scripts/run.sh` | 第 3、6 条 |
| `skill.md`、`references/a.md`（没有 `SKILL.md`） | `manifest_missing`——**不按大小写放宽** | 第 1 条 |
| `SKILL.md`、`references/shared` → `../../other-skill` | `resource_escapes`，由读目录的一方在解析之后判（[S-28](contract.md#s-28-资源路径不出包) 目录反例） | 第 4 条 |
| `SKILL.md`、`references/loop` → `references/loop` | `malformed`（M17） | 第 4 条：成环 |
| `SKILL.md`、`agents/openai.yaml` | 一份包：`agents/openai.yaml` 是一条普通资源，**其中的 `policy`、`dependencies` 不生效** | 第 3 条；[S-5](contract.md#s-5-键的四类处置) 第 3 条 |
| `SKILL.md`、`.omne/skill.json`（内容是 `{"format": 1}`） | 一份包：`definition` 是 `{"format": 1}`，`.omne/skill.json` **不是**一条资源 | 第 2 条 |
| `SKILL.md`、`skill.json`（包根下，作者想当定义记录用） | 一份包：**那个文件只是一条资源**，这份包没有定义记录——定义记录只在 `.omne/skill.json` | 第 2 条 |
| `SKILL.md`、`.DS_Store` | 一份包：`.DS_Store` 是一条资源——**不按名字过滤任何文件** | 第 3 条 |

## 11. 起草者逐条自核

- **Schema 列跑过本地自检**（整批对齐 2026-09-24 一次；修复波 1b 把执行环境要求改为定义记录的固定成员后重跑一次，结果都在[验证入口](../verification.md#结果与反例)）；「拒绝值」一列仍是手核，**手核不是证据**。
- 手核时特别看过的几处：`SkillName` 与 `ResourceEntry.path` 两条 pattern 的首尾（`(?![\s\S])` 收尾、`..` 段在中间与末尾都被挡、以点开头的普通段不被挡）；
  5.3 的 `if`／`then` 只在定义记录带 `environmentRequirement` 时要求 `scripts/` 资源。
- **跨契约的 `$ref`**（`content-blocks` 的 `MediaType`，`asset-model` 的 `CapabilityName`、`CapabilityId`、`AttributeDeclaration`，`tool-definition` 的 `DependencyName`、`TargetEnvironment`）按它们此刻的候选文本校验；
  那几份契约在评审或对齐中改了这些定义，本节须同轮重核。
