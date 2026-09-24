# 规范实例：合法与非法

属于 `data.asset-model` v1 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`asset-model.schema.json`](asset-model.schema.json) 的定义项在这里各有一组正反实例，
非法的一律注明**拒绝值**与**被哪一条挡住**。

**怎么读**：

- 每节开头的「校验对象」给出该节全部实例要拿去求值的 `$defs`。
- **表格行**：第一列是实例（JSON 内联代码）；第二列是 **Schema 这一关**的预期（`通过`／`拒绝`）；
  第三列是按 [S-27](contract.md#s-27-表示层拒绝值) 定出的**拒绝值**（合法的写 `—`）；第四列是依据条款。
- **大实例**写成带编号的 JSON 代码块，块上方一行写明三列；**变体行**写「在 X 上改动 Y」，机检时把改动应用到那个基准实例再求值。
- 这个格式也是机检格式：逐节按「校验对象」把实例喂给 Draft 2020-12 校验器、拿「Schema」一列比对。**「拒绝值」一列不参与 Schema 机检**——Schema 只说通过与否，拒绝值的名字与优先级是契约的规则。

**四条读法上的边界：**

- **`通过` 只说形状合规。**版本编号连续、同一持有上 `item` 不重复、作者与所有者同属一个组织、持有与记录的能力标识一致、一格一个能力标识一份持有——都不在 Schema 的能力范围内，见[第 14 节](#14-schema-挡不住但同样非法的)。
- **示例里的标识串只是占位**，词法归实现；不要从 `ast_`、`org_`、`lin_` 这样的前缀推出任何规则。
- **六类正文按各自的正文契约校验**（[S-10](contract.md#s-10-八类正文的外壳)）；这里的正文取自那几份契约的正例并删到最小。正文不合它那份契约时，拒绝值是那份契约的值、原名携带（[S-27](contract.md#s-27-表示层拒绝值)）。
- **除[第 13 节](#13-几处违例同时出现时取哪个拒绝值)外，每个非法实例只违反一条规则**，拒绝值因此不需要优先级就能定；第 13 节专门演示优先级。

下文反复出现的几个值，在实例里一律原样写全：
租户 `(T1, a1)` = `{"organization": "org_t1", "account": "acc_a1"}`；租户 `(T2, a1)` = `{"organization": "org_t2", "account": "acc_a1"}`；
时刻一律写成 UTC 的 RFC 3339 串。

## 1. CapabilityId 与它的名字

**校验对象**：`$defs/CapabilityId`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"category": "tool", "name": "read_file"}` | 通过 | — | [S-3](contract.md#s-3-能力标识与它的规范串) |
| `{"category": "mcp", "name": "github"}` | 通过 | — | [S-3](contract.md#s-3-能力标识与它的规范串)：规范串是 `mcp/github`，拆回来是同一个能力标识（[S-29](contract.md#s-29-名字里的斜杠) 正例） |
| `{"category": "skill", "name": "Code-Review"}` | 通过 | — | [S-2](contract.md#s-2-能力标识名的词法) 第 4 条：区分大小写——它与 `code-review` **不是**同一个能力标识 |
| `{"category": "skill", "name": "代码审查"}` | 通过 | — | [S-2](contract.md#s-2-能力标识名的词法)：本版不限字符集 |
| `{"category": "slash_command", "name": "omne-official:reload-skills"}` | 通过 | — | [S-2](contract.md#s-2-能力标识名的词法)：冒号允许；规范串是 `slash_command/omne-official:reload-skills`（[S-29](contract.md#s-29-名字里的斜杠) 正例） |
| `{"category": "mcp", "name": "gh/issues"}` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-能力标识名的词法) 第 3 条：含斜杠。**规范串单射的回归用例**（[S-29](contract.md#s-29-名字里的斜杠) 反例）；**不被改写成别的分隔符后接受** |
| `{"category": "tool", "name": "read file"}` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-能力标识名的词法) 第 2 条：中间的空白也不行 |
| `{"category": "tool", "name": "read_file\n"}` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-能力标识名的词法)：**这一条是 `$` 的回归用例**——pattern 以 `(?![\s\S])` 收尾，理由同 `data.identity-values/v1#S-31` |
| `{"category": "tool", "name": "\ufeffread_file"}` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-能力标识名的词法)：前导 U+FEFF 属于那个显式空白码点集合——**这一条是 `\s` 的回归用例** |
| `{"category": "tool", "name": ""}` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-能力标识名的词法) 第 1 条 |
| `{"category": "tool", "name": 7}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-能力标识与它的规范串)：不是字符串，谈不上词法 |
| `{"category": "converter", "name": "image-describer"}` | 拒绝 | `category_unknown` | [S-1](contract.md#s-1-资产类别恰八类)：转换件本版不是资产 |
| `{"category": "Tool", "name": "read_file"}` | 拒绝 | `category_unknown` | [S-1](contract.md#s-1-资产类别恰八类)：大小写不同也是另一个值，**不被折成 `tool`** |
| `{"category": "tool"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-能力标识与它的规范串)：身份是类别**加** name |
| `{"name": "read_file"}` | 拒绝 | `malformed` | [S-26](contract.md#s-26-判别式与枚举闭合)：判别成员缺席 |
| `"tool/read_file"` | 拒绝 | `malformed` | [S-3](contract.md#s-3-能力标识与它的规范串)：**规范串不是交换表示**，能力标识恒是两分量对象 |
| `{"category": "tool", "name": "read_file", "version": 2}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-能力标识与它的规范串)：版本不参与身份 |

## 2. 四种不透明标识

**校验对象**：`$defs/AssetRecordId`；`$defs/LineageId`、`$defs/SharingId`、`$defs/CredentialRef` 同形，下表对四者一律成立。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"ast_7c11"` | 通过 | — | [S-4](contract.md#s-4-资产记录号) |
| `"ast 7c11"` | 通过 | — | `data.identity-values/v1#S-31`：中间的空白不受限 |
| `" ast_7c11"` | 拒绝 | `malformed` | `data.identity-values/v1#S-31`：禁止首尾空白 |
| `"ast_7c11\n"` | 拒绝 | `malformed` | 同上：尾随换行，`$` 的回归用例 |
| `""` | 拒绝 | `malformed` | 同上：非空 |
| `42` | 拒绝 | `malformed` | 同上：是字符串 |

## 3. 所有者与来源

**校验对象**：`$defs/AssetOwner`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"kind": "organization", "organization": "org_t2"}` | 通过 | — | [S-6](contract.md#s-6-所有者与作者分记) |
| `{"kind": "tenant", "tenant": {"organization": "org_t1", "account": "acc_a1"}}` | 通过 | — | [S-6](contract.md#s-6-所有者与作者分记) |
| `{"kind": "account", "account": "acc_a1"}` | 拒绝 | `owner_kind_unknown` | [S-6](contract.md#s-6-所有者与作者分记)：账号不充当任何一格，一个人的东西放在那个租户里 |
| `{"kind": "platform"}` | 拒绝 | `owner_kind_unknown` | [S-6](contract.md#s-6-所有者与作者分记)：平台不是身份对象——official 的所有者**缺席**，不铸一个值 |
| `{"organization": "org_t2"}` | 拒绝 | `malformed` | [S-26](contract.md#s-26-判别式与枚举闭合)：判别成员缺席 |
| `{"kind": "organization", "tenant": {"organization": "org_t1", "account": "acc_a1"}}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-所有者与作者分记)：判别式与载荷对不上 |
| `{"kind": "tenant", "tenant": {"organization": "org_t1"}}` | 拒绝 | `malformed` | `data.identity-values/v1#S-12`：TenantId 缺一个分量即非法 |

**校验对象**：`$defs/AssetOrigin`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `"official"` | 通过 | — | [S-5](contract.md#s-5-资产来源) |
| `"customized"` | 通过 | — | [S-5](contract.md#s-5-资产来源) |
| `"builtin"` | 拒绝 | `origin_unknown` | [S-5](contract.md#s-5-资产来源) |
| `"Official"` | 拒绝 | `origin_unknown` | [S-5](contract.md#s-5-资产来源)：大小写不同也是另一个值 |

## 4. 资产记录

**校验对象**：`$defs/AssetDefinition`

**4.1 一份 official 工具，两个版本**——Schema：通过 · 拒绝值：— · 依据：[S-6](contract.md#s-6-所有者与作者分记)、[S-8](contract.md#s-8-资产记录)、[S-9](contract.md#s-9-版本线)（[S-30](contract.md#s-30-official-没有所有者与作者) 正例）

```json
{
  "id": "ast_0001",
  "capability": { "category": "tool", "name": "read_file" },
  "origin": "official",
  "versions": [
    {
      "number": 1,
      "content": { "category": "tool", "definition": { "name": "read_file", "description": "Read one file.", "paradigm": "single", "input": { "type": "object", "properties": { "path": { "type": "string", "description": "File path." } }, "required": ["path"] }, "permissions": { "execute": { "default": "auto" } }, "origin": { "kind": "authored" } } },
      "publishedAt": "2026-09-01T00:00:00Z"
    },
    {
      "number": 2,
      "content": { "category": "tool", "definition": { "name": "read_file", "description": "Read one file, with offset and limit.", "paradigm": "single", "input": { "type": "object", "properties": { "path": { "type": "string", "description": "File path." }, "offset": { "type": "integer", "description": "First line to read." }, "limit": { "type": "integer", "description": "Max lines to read." } }, "required": ["path"] }, "permissions": { "execute": { "default": "auto" } }, "origin": { "kind": "authored" } } },
      "publishedAt": "2026-09-20T00:00:00Z"
    }
  ]
}
```

没有 `owner`、没有 `author`、没有 `byAgent`、两版都没有 `publishedBy`——**四处都是合法缺席**，按「平台所有、没有作者租户」呈现。

**4.2 一份租户自建的 skill：团队 T1 里 a1 租户级的，人写的**——Schema：通过 · 拒绝值：— · 依据：[S-6](contract.md#s-6-所有者与作者分记)、[S-10](contract.md#s-10-八类正文的外壳)

```json
{
  "id": "ast_7c11",
  "capability": { "category": "skill", "name": "code-review" },
  "origin": "customized",
  "owner": { "kind": "tenant", "tenant": { "organization": "org_t1", "account": "acc_a1" } },
  "author": { "organization": "org_t1", "account": "acc_a1" },
  "byAgent": false,
  "draft": { "category": "skill", "body": { "manifest": { "name": "code-review", "description": "Review a code change." }, "body": "# Code review (draft)\n", "resources": [] } },
  "versions": [
    {
      "number": 1,
      "content": { "category": "skill", "body": { "manifest": { "name": "code-review", "description": "Review a code change." }, "body": "# Code review\n", "resources": [] } },
      "publishedAt": "2026-09-05T09:00:00Z",
      "publishedBy": { "organization": "org_t1", "account": "acc_a1" }
    },
    {
      "number": 2,
      "content": { "category": "skill", "body": { "manifest": { "name": "code-review", "description": "Review a code change." }, "body": "# Code review\n\nBehaviour first.\n", "resources": [] } },
      "publishedAt": "2026-09-12T09:00:00Z",
      "publishedBy": { "organization": "org_t1", "account": "acc_a1" }
    }
  ]
}
```

正文按 `data.skill-package` v1 校验；清单头的 `name` 等于 `capability.name`（那份契约的 S-6）。`byAgent: false`：这份是人写的。

**4.3 4.2 那份的 v2 被 a1 复制到有共同上级的团队 T2，带血缘**——Schema：通过 · 拒绝值：— · 依据：[S-6](contract.md#s-6-所有者与作者分记)、[S-9](contract.md#s-9-版本线)、[S-21](contract.md#s-21-复制血缘)

```json
{
  "id": "ast_8e20",
  "capability": { "category": "skill", "name": "code-review" },
  "origin": "customized",
  "owner": { "kind": "organization", "organization": "org_t2" },
  "author": { "organization": "org_t2", "account": "acc_a1" },
  "byAgent": false,
  "lineage": {
    "lineage": "lin_40e9",
    "sourceVersion": 2,
    "importedBy": { "organization": "org_t2", "account": "acc_a1" },
    "importedAt": "2026-09-13T10:00:00Z",
    "imports": 1
  },
  "versions": [
    {
      "number": 1,
      "content": { "category": "skill", "body": { "manifest": { "name": "code-review", "description": "Review a code change." }, "body": "# Code review\n\nBehaviour first.\n", "resources": [] } },
      "publishedAt": "2026-09-13T10:00:00Z",
      "publishedBy": { "organization": "org_t2", "account": "acc_a1" }
    }
  ]
}
```

- 所有者是 **T2**，作者与 `importedBy` 都是 **(T2, a1)**——不是源侧的 (T1, a1)，所以**看不出源组织**。
- 源侧的 **v2** 在这边是 **v1**：`sourceVersion` 记源侧第几版，`versions` 是目标侧自己的线。
- **带血缘的记录只能是组织所有**：「一份租户所有、带血缘的记录」不是任何一次合法复制的产物，见下表第 4 行。

**4.4 4.3 那份被重复复制一次之后**——Schema：通过 · 拒绝值：— · 依据：[S-21](contract.md#s-21-复制血缘)（[S-35](contract.md#s-35-重复复制只改最近一次那四项) 正例）

在 4.3 上改动：`lineage` 改为 `{"lineage": "lin_40e9", "sourceVersion": 5, "importedBy": {"organization": "org_t2", "account": "acc_a1"}, "importedAt": "2026-09-20T10:00:00Z", "imports": 2}`；
`versions` 末尾追加 `{"number": 2, "content": {"category": "skill", "body": {"manifest": {"name": "code-review", "description": "Review a code change."}, "body": "# Code review (v5 of source)\n", "resources": []}}, "publishedAt": "2026-09-20T10:00:00Z", "publishedBy": {"organization": "org_t2", "account": "acc_a1"}}`。
`lineage.lineage` **没变**；v1 **一个字节也没变**。

**4.5 一份 plugin**——Schema：通过 · 拒绝值：— · 依据：[S-11](contract.md#s-11-plugin-的成员)

```json
{
  "id": "ast_6a55",
  "capability": { "category": "plugin", "name": "review-kit" },
  "origin": "customized",
  "owner": { "kind": "organization", "organization": "org_t1" },
  "author": { "organization": "org_t1", "account": "acc_a1" },
  "byAgent": true,
  "versions": [
    {
      "number": 1,
      "content": {
        "category": "plugin",
        "members": [
          { "category": "skill", "name": "code-review" },
          { "category": "tool", "name": "read_file" },
          { "category": "slash_command", "name": "review" }
        ]
      },
      "publishedAt": "2026-09-14T00:00:00Z",
      "publishedBy": { "organization": "org_t1", "account": "acc_a1" }
    }
  ]
}
```

成员是**能力标识**：T1 若换上自己的 `tool/read_file`，这个 plugin 用的就是 T1 那份。`byAgent: true`：这份是 a1 所在的一次 agent 运行产出的（[S-6](contract.md#s-6-所有者与作者分记) 的 agent 那一行）。

**4.6 工作区 `/home/a1/repos/svc` 提供的一份 skill**——Schema：通过 · 拒绝值：— · 依据：[S-5](contract.md#s-5-资产来源)、[S-19](contract.md#s-19-使用权来路) 的 `carrier` 支

```json
{
  "id": "ast_wk01",
  "capability": { "category": "skill", "name": "svc-conventions" },
  "origin": "customized",
  "owner": { "kind": "tenant", "tenant": { "organization": "org_t1", "account": "acc_a1" } },
  "author": { "organization": "org_t1", "account": "acc_a1" },
  "byAgent": false,
  "versions": [
    {
      "number": 1,
      "content": { "category": "skill", "body": { "manifest": { "name": "svc-conventions", "description": "Conventions of the svc repository." }, "body": "# svc conventions\n", "resources": [] } },
      "publishedAt": "2026-09-22T12:00:00Z",
      "publishedBy": { "organization": "org_t1", "account": "acc_a1" }
    }
  ]
}
```

所有者与作者是挂上工作区的那个租户，恰一版；记录号由 `(WorkspaceKey, capability)` 导出——这里的 `ast_wk01` 只是占位。**目录内容变了，下一次读入得到的仍是第 1 版、内容不同**：它不走发布（[S-19](contract.md#s-19-使用权来路)）。

**变体（在上面的基准实例上改动）：**

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| 在 4.1 上加 `"author": {"organization": "org_platform", "account": "acc_platform"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-所有者与作者分记)：不铸「平台租户」（[S-30](contract.md#s-30-official-没有所有者与作者) 反例） |
| 在 4.1 上给第 1 版加 `"publishedBy": {"organization": "org_t1", "account": "acc_a1"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-版本线)：official 的版本没有发布者租户 |
| 在 4.2 上删去 `owner` | 拒绝 | `malformed` | [S-6](contract.md#s-6-所有者与作者分记)：customized 必有所有者，**不补成作者的租户** |
| 在 4.2 上删去 `byAgent` | 拒绝 | `malformed` | [S-8](contract.md#s-8-资产记录)：customized 必有，**缺席不读作 `false`** |
| 在 4.2 上把 `byAgent` 改为 `"no"` | 拒绝 | `malformed` | [S-8](contract.md#s-8-资产记录)：布尔 |
| 在 4.1 上加 `"byAgent": false` | 拒绝 | `malformed` | [S-8](contract.md#s-8-资产记录)：official 必无 |
| 在 4.3 上把 `owner` 改为 `{"kind": "tenant", "tenant": {"organization": "org_t2", "account": "acc_a1"}}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-复制血缘) 第 4 条：有血缘即组织所有 |
| 在 4.1 上加 4.3 的那个 `lineage` | 拒绝 | `malformed` | [S-21](contract.md#s-21-复制血缘) 第 4 条：official 不是复制来的 |
| 在 4.2 上把 `origin` 改为 `"builtin"` | 拒绝 | `origin_unknown` | [S-5](contract.md#s-5-资产来源) |
| 在 4.2 上把 `owner.kind` 改为 `"account"` | 拒绝 | `owner_kind_unknown` | [S-6](contract.md#s-6-所有者与作者分记) |
| 在 4.2 上把 `draft` 改为 4.1 第 1 版的 `content` | 拒绝 | `malformed` | [S-8](contract.md#s-8-资产记录)：正文类别与能力标识对不上 |
| 在 4.2 上删去 `draft`，并把 `versions` 改为 `[]` | 拒绝 | `malformed` | [S-8](contract.md#s-8-资产记录)：草稿与版本不能都没有 |
| 在 4.2 上删去 `versions` 的两项，保留 `draft`（`versions` 为 `[]`） | 通过 | — | [S-8](contract.md#s-8-资产记录)：刚创作、尚未发布 |
| 在 4.2 上删去 `versions` 成员 | 拒绝 | `malformed` | [S-8](contract.md#s-8-资产记录)：版本线必在，空线写 `[]` |
| 在 4.2 上删去第 2 版的 `publishedBy` | 拒绝 | `malformed` | [S-9](contract.md#s-9-版本线) |
| 在 4.2 上把第 1 版的 `number` 改为 `0` | 拒绝 | `malformed` | [S-9](contract.md#s-9-版本线)：不是 ≥ 1 的整数，谈不上编号连不连续 |
| 在 4.2 上加 `"attributes": []` | 拒绝 | `malformed` | [S-8](contract.md#s-8-资产记录)：属性声明不存在记录上 |
| 在 4.2 上把 `capability.name` 改为 `"code review"` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-能力标识名的词法) |

## 5. 八类正文的外壳

**校验对象**：`$defs/AssetContent`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"category": "skill", "body": {"manifest": {"name": "code-review", "description": "Review a code change."}, "body": "", "resources": []}}` | 通过 | — | [S-10](contract.md#s-10-八类正文的外壳)：按 `data.skill-package` v1 |
| `{"category": "skill", "body": {"note": "opaque"}}` | 拒绝 | `manifest_missing` | [S-27](contract.md#s-27-表示层拒绝值)：正文不合 `data.skill-package` v1，拒绝值是那份契约的值、**原名携带** |
| `{"category": "connector", "body": {}}` | 通过 | — | [S-10](contract.md#s-10-八类正文的外壳)：按 `data.connector` v1，正文只有可选的默认来源标识 |
| `{"category": "connector", "body": {"target": {"kind": "session", "session": "ses_4c1e"}}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-八类正文的外壳)：投递目标是持有配值、不在正文里（`data.connector` v1 的 S-2）；**它的 `kind` 不被当作投递目标去判** |
| `{"category": "connector", "body": {"source": {"channel": "", "externalAccount": "U07BOT9QX"}}}` | 拒绝 | `channel_empty` | [S-27](contract.md#s-27-表示层拒绝值)：连接件的拒绝值原名携带 |
| `{"category": "mcp", "body": {"transport": {"kind": "websocket", "url": "wss://x.example"}, "timeouts": {"connect": "PT15S", "call": "PT2M"}, "permissions": {"execute": {"default": "ask"}}}}` | 拒绝 | `transport_unknown` | [S-27](contract.md#s-27-表示层拒绝值)：MCP 接入点的拒绝值原名携带 |
| `{"category": "slash_command", "body": {"description": "x", "binding": {"kind": "macro"}}}` | 拒绝 | `binding_unknown` | [S-27](contract.md#s-27-表示层拒绝值)：斜杠命令的拒绝值原名携带 |
| `{"category": "agent_definition", "body": {"model": "x"}}` | 通过 | — | [S-10](contract.md#s-10-八类正文的外壳)：**`body` 里的 `model` 谁也不读**（[G-6](contract.md#八已知缺口)） |
| `{"category": "loop_extension", "extension": {"name": "prod-db-guard", "position": "before_action", "power": "veto", "implementation": {"kind": "builtin", "capability": "prod-db-guard"}}}` | 通过 | — | [S-10](contract.md#s-10-八类正文的外壳)：按 `data.loop-extension` v1 |
| `{"category": "loop_extension", "extension": {"position": "before_model_call"}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-八类正文的外壳)：拓展件的声明缺必有成员——那份契约的 `malformed` 就是本契约的 `malformed` |
| `{"category": "tool", "definition": "read_file"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-八类正文的外壳)：工具定义是对象 |
| `{"category": "tool", "body": {}}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-八类正文的外壳)：tool 的成员叫 `definition` |
| `{"category": "skill"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-八类正文的外壳)：`body` 必在，**缺席不当作空** |
| `{"category": "plugin", "members": []}` | 通过 | — | [S-11](contract.md#s-11-plugin-的成员)：本版不设下限 |
| `{"category": "plugin", "members": [{"category": "plugin", "name": "base-kit"}]}` | 拒绝 | `plugin_member_is_plugin` | [S-11](contract.md#s-11-plugin-的成员) |
| `{"category": "plugin", "members": [{"category": "agent_definition", "name": "reviewer"}]}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-plugin-的成员)：Plugin 不含 Agent Definition；账本没有为它单列拒绝值 |
| `{"category": "plugin", "members": [{"category": "skill", "name": "code-review"}, {"category": "skill", "name": "code-review"}]}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-plugin-的成员)：成员不重复 |
| `{"category": "plugin", "members": [{"category": "skill", "name": "code/review"}]}` | 拒绝 | `name_invalid` | [S-2](contract.md#s-2-能力标识名的词法)：成员也是能力标识 |
| `{"category": "widget", "body": {}}` | 拒绝 | `category_unknown` | [S-1](contract.md#s-1-资产类别恰八类) |
| `{"body": {}}` | 拒绝 | `malformed` | [S-26](contract.md#s-26-判别式与枚举闭合)：判别成员缺席 |

## 6. 版本

**校验对象**：`$defs/AssetVersion`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"number": 1, "content": {"category": "plugin", "members": []}, "publishedAt": "2026-09-05T09:00:00Z", "publishedBy": {"organization": "org_t1", "account": "acc_a1"}}` | 通过 | — | [S-9](contract.md#s-9-版本线) |
| `{"number": 3, "content": {"category": "plugin", "members": []}, "publishedAt": "2026-09-05T09:00:00+08:00"}` | 通过 | — | [S-9](contract.md#s-9-版本线)：单独看一版，没有发布者是合法的（official 的版本）；有没有由记录按来源约束 |
| `{"number": 0, "content": {"category": "plugin", "members": []}, "publishedAt": "2026-09-05T09:00:00Z"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-版本线) |
| `{"number": 1.5, "content": {"category": "plugin", "members": []}, "publishedAt": "2026-09-05T09:00:00Z"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-版本线) |
| `{"number": 1, "content": {"category": "plugin", "members": []}, "publishedAt": "2026-09-05"}` | 拒绝 | `malformed` | `data.offer-expiry/v1#S-22`：日期不是时间点 |
| `{"number": 1, "content": {"category": "plugin", "members": []}}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-版本线)：发布时刻必在 |

## 7. 属性声明

**校验对象**：`$defs/AttributeDeclaration`。**项名与取值只是示意**——哪一类资产有哪些项、取什么名字，归各自的正文契约。

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"item": "concurrency", "kind": "setting", "category": "preference", "domain": {"kind": "open", "schema": {"type": "integer", "minimum": 1}}, "default": 4}` | 通过 | — | [S-12](contract.md#s-12-属性声明由正文推出) |
| `{"item": "execute", "kind": "permission", "domain": {"kind": "enum", "values": ["ask", "auto", "forbid"]}, "default": "ask"}` | 通过 | — | [S-12](contract.md#s-12-属性声明由正文推出)：`default` 是作者给的**那一个值**，**不是**出厂那一格的允许集合 |
| `{"item": "disabled", "kind": "setting", "category": "governance", "domain": {"kind": "open", "schema": {"type": "boolean"}}, "default": false}` | 通过 | — | [S-15](contract.md#s-15-disabled-是保留项名) 第 1 条：本契约写死的那一份。**它合法，但不得由正文契约的推出规则产出**（第 14 节） |
| `{"item": "disabled", "kind": "setting", "category": "governance", "domain": {"kind": "open", "schema": {"type": "boolean"}}, "default": true}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-disabled-是保留项名)：`disabled` 的声明只能是那一份 |
| `{"item": "usableBy", "kind": "permission", "domain": {"kind": "enum", "values": ["superAdministrator", "member", "self"]}, "default": "self"}` | 通过 | — | [S-36](contract.md#s-36-usableby-是保留项名)：本契约写死的那一份。**它合法，但不得由正文契约的推出规则产出**（第 14 节） |
| `{"item": "usableBy", "kind": "permission", "domain": {"kind": "enum", "values": ["superAdministrator", "member", "self"]}, "default": "member"}` | 拒绝 | `malformed` | [S-36](contract.md#s-36-usableby-是保留项名) 第 4 条：默认是 `self`，作者不另给 |
| `{"item": "usableBy", "kind": "permission", "domain": {"kind": "enum", "values": ["superAdministrator", "member"]}, "default": "member"}` | 拒绝 | `malformed` | [S-36](contract.md#s-36-usableby-是保留项名) 第 1 条：取值域恰三个，不另收窄 |
| `{"item": "concurrency", "kind": "setting", "domain": {"kind": "open", "schema": {"type": "integer"}}, "default": 4}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：设置项必须标类别，**不补成 `preference`** |
| `{"item": "execute", "kind": "permission", "category": "preference", "domain": {"kind": "enum", "values": ["ask", "auto"]}, "default": "ask"}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：权限项不带类别 |
| `{"item": "concurrency", "kind": "setting", "category": "preference", "domain": {"kind": "enum", "values": ["1", "2"]}, "default": "1"}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：设置的取值域是开放的 |
| `{"item": "execute", "kind": "permission", "domain": {"kind": "enum", "values": ["ask", "auto"]}, "default": ["ask"]}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：权限的 `default` 是一个取值，不是集合 |
| `{"item": "execute", "kind": "permission", "domain": {"kind": "enum", "values": []}, "default": "ask"}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：取值域非空 |
| `{"item": "execute", "kind": "permission", "domain": {"kind": "enum", "values": ["ask", "ask"]}, "default": "ask"}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：取值各不相同 |
| `{"item": "concurrency", "kind": "setting", "category": "security", "domain": {"kind": "open", "schema": true}, "default": 4}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-设置项类别)：设置项类别恰四个。**不是 `category_unknown`——那个名字只指资产的八类** |
| `{"item": "concurrency", "kind": "flag", "domain": {"kind": "open", "schema": true}, "default": 4}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：`kind` 闭合 |
| `{"item": "concurrency", "kind": "setting", "category": "preference", "domain": {"kind": "open", "schema": true}}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：`default` 必在 |
| `{"item": "credential", "kind": "setting", "category": "placement_identity", "domain": {"kind": "open", "schema": {"$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/asset-model/v1/asset-model.schema.json#/$defs/CredentialRef"}}}` | 通过 | — | [S-12](contract.md#s-12-属性声明由正文推出)、[S-23](contract.md#s-23-凭据引用) 第 2 条：落点与身份类项可以没有作者默认——**「未配」只有缺席一种写法** |
| `{"item": "execute", "kind": "permission", "domain": {"kind": "enum", "values": ["ask", "auto"]}}` | 拒绝 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：权限项的 `default` 必在 |

## 8. 属性配值

**校验对象**：`$defs/AttributeAssignment`；最后两行是 `$defs/PermissionValue`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"item": "concurrency", "value": 2, "immutable": false, "since": "2026-09-15T08:00:00Z"}` | 通过 | — | [S-14](contract.md#s-14-属性配值)：默认这样，下层可以改 |
| `{"item": "execute", "value": {"allowed": ["ask"]}, "immutable": true, "since": "2026-09-15T08:00:00Z"}` | 通过 | — | [S-14](contract.md#s-14-属性配值)：收窄到单元素集并锁住——「必须问一下」 |
| `{"item": "execute", "value": {"allowed": []}, "immutable": true, "since": "2026-09-15T08:00:00Z"}` | 通过 | — | [S-14](contract.md#s-14-属性配值)：收空——装得上、每次调用被拒；**不是禁用** |
| `{"item": "disabled", "value": true, "immutable": false, "since": "2026-09-15T08:00:00Z"}` | 通过 | — | [S-15](contract.md#s-15-disabled-是保留项名)（[S-32](contract.md#s-32-禁用只是一个布尔) 正例） |
| `{"item": "concurrency", "value": null, "immutable": false, "since": "2026-09-15T08:00:00Z"}` | 通过 | — | 形状合法；`null` 合不合这一项的取值域要看声明（第 14 节） |
| `{"item": "disabled", "value": true, "immutable": true, "since": "2026-09-15T08:00:00Z"}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-disabled-是保留项名) 第 3 条（[S-32](contract.md#s-32-禁用只是一个布尔) 反例一） |
| `{"item": "disabled", "value": "yes", "immutable": false, "since": "2026-09-15T08:00:00Z"}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-disabled-是保留项名)（[S-32](contract.md#s-32-禁用只是一个布尔) 反例二） |
| `{"item": "concurrency", "value": 2, "since": "2026-09-15T08:00:00Z"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-属性配值)：`immutable` 缺席**不当作 `false`** |
| `{"item": "concurrency", "immutable": false, "since": "2026-09-15T08:00:00Z"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-属性配值)：没有值就不是一条配值——要表达「这一格没意见」，就是不配 |
| `{"item": "", "value": 2, "immutable": false, "since": "2026-09-15T08:00:00Z"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-属性配值) |
| `{"item": "concurrency", "value": 2, "immutable": false}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-属性配值)：`since` 缺席——这个值什么时候写下的必须答得出 |
| `{"allowed": ["ask", "ask"]}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-属性配值)：允许集合元素各不相同 |
| `{"allowed": "ask"}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-属性配值)：选一个也写成单元素集 |

## 9. 持有范围与工作区键

**校验对象**：`$defs/HoldingScope`；最后三行是 `$defs/WorkspaceKey`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"layer": "factory"}` | 通过 | — | [S-16](contract.md#s-16-持有范围)：出厂格什么也不带 |
| `{"layer": "organization", "organization": "org_t1"}` | 通过 | — | [S-16](contract.md#s-16-持有范围)：就是 `ScopeLayerIdentity` 的组织变体 |
| `{"layer": "tenant", "tenant": {"organization": "org_t1", "account": "acc_a1"}}` | 通过 | — | [S-16](contract.md#s-16-持有范围) |
| `{"layer": "workspace", "workspace": {"tenant": {"organization": "org_t1", "account": "acc_a1"}, "directory": "/home/a1/repos/svc"}}` | 通过 | — | [S-16](contract.md#s-16-持有范围)、[S-17](contract.md#s-17-工作区键) |
| `{"layer": "session", "session": "ses_1"}` | 拒绝 | `malformed` | [S-16](contract.md#s-16-持有范围)：会话不是持有格 |
| `{"layer": "factory", "organization": "org_platform"}` | 拒绝 | `malformed` | [S-16](contract.md#s-16-持有范围)：出厂格不带身份值——不铸「平台组织」 |
| `{"layer": "workspace", "directory": "/home/a1/repos/svc"}` | 拒绝 | `malformed` | [S-16](contract.md#s-16-持有范围)：工作区格带的是一个工作区键 |
| `{"organization": "org_t1", "tenant": null}` | 拒绝 | `malformed` | `data.identity-values/v1#S-16`：不压平成两个可空字段 |
| `{"tenant": {"organization": "org_t1", "account": "acc_a1"}, "directory": "/home/a1/repos/svc"}` | 通过 | — | [S-17](contract.md#s-17-工作区键) |
| `{"directory": "/home/a1/repos/svc"}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-工作区键)：工作区挂在租户下，**不按目录全局唯一** |
| `{"tenant": {"organization": "org_t1", "account": "acc_a1"}, "directory": ""}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-工作区键) |

## 10. 资产持有

**校验对象**：`$defs/AssetHolding`

**10.1 出厂格持有 official 的 `read_file`**——Schema：通过 · 拒绝值：— · 依据：[S-20](contract.md#s-20-出厂格与工作区格的持有)

```json
{
  "holder": { "layer": "factory" },
  "capability": { "category": "tool", "name": "read_file" },
  "asset": "ast_0001",
  "basis": { "kind": "official" },
  "versionSelection": { "kind": "current" },
  "immutable": false,
  "assignments": [],
  "since": "2026-09-01T00:00:00Z"
}
```

**10.2 组织 T1 持有自己的安全审计 skill，锁替换，一项设置也锁住**——Schema：通过 · 拒绝值：— · 依据：[S-18](contract.md#s-18-资产持有)、[S-19](contract.md#s-19-使用权来路)

```json
{
  "holder": { "layer": "organization", "organization": "org_t1" },
  "capability": { "category": "skill", "name": "security-audit" },
  "asset": "ast_9d02",
  "basis": { "kind": "owned" },
  "versionSelection": { "kind": "pinned", "number": 3 },
  "immutable": true,
  "assignments": [
    { "item": "strictness", "value": "high", "immutable": true, "since": "2026-09-15T08:00:00Z" }
  ],
  "since": "2026-09-15T08:00:00Z"
}
```

`immutable: true`：租户与工作区都替换不了 `skill/security-audit`；`strictness` 那项租户与工作区也改不了。`pinned` 第 3 版：那份记录发了第 4 版，这一格照样用第 3 版（[S-18](contract.md#s-18-资产持有) 第 6 条）。

**10.3 组织 T1 持有自己的一个工具，禁用着**——Schema：通过 · 拒绝值：— · 依据：[S-15](contract.md#s-15-disabled-是保留项名)、[S-18](contract.md#s-18-资产持有)

```json
{
  "holder": { "layer": "organization", "organization": "org_t1" },
  "capability": { "category": "tool", "name": "deploy" },
  "asset": "ast_5b31",
  "basis": { "kind": "owned" },
  "versionSelection": { "kind": "current" },
  "immutable": false,
  "assignments": [
    { "item": "disabled", "value": true, "immutable": false, "since": "2026-09-16T09:30:00Z" },
    { "item": "concurrency", "value": 1, "immutable": false, "since": "2026-09-15T08:00:00Z" }
  ],
  "since": "2026-09-15T08:00:00Z"
}
```

禁用着，持有与 `concurrency` 那条配值**都在**；再启用回来，值还是原来那些。

**10.4 子公司 C 持有集团 G 分享来的工具**——Schema：通过 · 拒绝值：— · 依据：[S-19](contract.md#s-19-使用权来路)、[S-22](contract.md#s-22-血缘号与分享号)

```json
{
  "holder": { "layer": "organization", "organization": "org_c" },
  "capability": { "category": "tool", "name": "lint" },
  "asset": "ast_3f44",
  "basis": { "kind": "shared", "sharing": "shr_0b17" },
  "versionSelection": { "kind": "current" },
  "immutable": false,
  "assignments": [
    { "item": "execute", "value": { "allowed": ["ask"] }, "immutable": false, "since": "2026-09-18T00:00:00Z" }
  ],
  "since": "2026-09-18T00:00:00Z"
}
```

所有者仍是 G；C 配的是**自己这一格**的值（[PF-003 §6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)）；分享来的只跟当前版。

**10.5 租户 (T1, a1) 持有自己那份 `code-review`**——Schema：通过 · 拒绝值：— · 依据：[S-18](contract.md#s-18-资产持有)

在 10.2 上改动：`holder` 为 `{"layer": "tenant", "tenant": {"organization": "org_t1", "account": "acc_a1"}}`，`capability` 为 `{"category": "skill", "name": "code-review"}`，`asset` 为 `"ast_7c11"`，`versionSelection` 为 `{"kind": "current"}`，`immutable` 为 `false`，`assignments` 为 `[]`。

**10.6 工作区格持有它自己提供的那份 skill**——Schema：通过 · 拒绝值：— · 依据：[S-19](contract.md#s-19-使用权来路) 的 `carrier` 支、[S-20](contract.md#s-20-出厂格与工作区格的持有)

```json
{
  "holder": { "layer": "workspace", "workspace": { "tenant": { "organization": "org_t1", "account": "acc_a1" }, "directory": "/home/a1/repos/svc" } },
  "capability": { "category": "skill", "name": "svc-conventions" },
  "asset": "ast_wk01",
  "basis": { "kind": "carrier" },
  "versionSelection": { "kind": "current" },
  "immutable": false,
  "assignments": [
    { "item": "disabled", "value": true, "immutable": false, "since": "2026-09-22T12:00:00Z" }
  ],
  "since": "2026-09-22T12:00:00Z"
}
```

`asset` 是 4.6 那份记录；禁用来自清单的 `disabled` 列表（[S-24](contract.md#s-24-工作区承载清单)）。

**10.7 租户为组织持有的 Agent Definition 配默认模型**——Schema：通过 · 拒绝值：— · 依据：[S-19](contract.md#s-19-使用权来路) 的 `organization` 支

在 10.2 上改动：`holder` 为 `{"layer": "tenant", "tenant": {"organization": "org_t1", "account": "acc_a1"}}`，`capability` 为 `{"category": "agent_definition", "name": "code-assistant"}`，`asset` 为 `"ast_2c66"`（所有者是组织 T1，组织 T1 的组织格持有它），`basis` 为 `{"kind": "organization"}`，`versionSelection` 为 `{"kind": "current"}`，`immutable` 为 `false`，`assignments` 为 `[{"item": "default_model", "value": "b", "immutable": false, "since": "2026-09-19T10:00:00Z"}]`。
这就是 [PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) 的那个例子：值挂在租户**自己的**持有上（主线裁定 A-G3）。记录归组织 T1 所有，所以组织那一格不持有它时这份持有照样成立；若它是被分享给 T1 的那一份，组织那一格不再持有它，这份持有与它的配值随之不在（[S-19](contract.md#s-19-使用权来路)，主线裁定 S11-G2）。

**变体：**

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| 在 10.1 上把 `basis` 改为 `{"kind": "owned"}` | 拒绝 | `malformed` | [S-20](contract.md#s-20-出厂格与工作区格的持有)：出厂格只持有 official |
| 在 10.1 上把 `immutable` 改为 `true` | 通过 | —（`read_file` 不是 meta 能力时是 `malformed`，Schema 判不出） | [S-20](contract.md#s-20-出厂格与工作区格的持有)：出厂格只在 meta 能力上带锁；是不是 meta 由部署清单给出，写它的一方按清单写 |
| 在 10.1 上把 `assignments` 改为 `[{"item": "timeout", "value": "PT5S", "immutable": false, "since": "2026-09-15T08:00:00Z"}]` | 拒绝 | `malformed` | [S-20](contract.md#s-20-出厂格与工作区格的持有)：出厂格的值就是声明里的 `default` |
| 在 10.6 上把 `immutable` 改为 `true` | 拒绝 | `malformed` | [S-20](contract.md#s-20-出厂格与工作区格的持有)：`immutable` 不从工作区来 |
| 在 10.6 上把 `basis` 改为 `{"kind": "owned"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-使用权来路)：`owned` 不在工作区格 |
| 在 10.6 上把 `versionSelection` 改为 `{"kind": "pinned", "number": 1}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有) 第 6 条：工作区提供的只跟当前 |
| 在 10.2 上把 `basis` 改为 `{"kind": "carrier"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-使用权来路)：`carrier` 只在工作区格 |
| 在 10.2 上把 `basis` 改为 `{"kind": "organization"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-使用权来路)：`organization` 只在租户与工作区格——组织格的外面没有别的持有格 |
| 在 10.4 上把 `versionSelection` 改为 `{"kind": "pinned", "number": 2}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有) 第 6 条：分享来的只跟当前（主线裁定 A-G7） |
| 在 10.6 上把那条配值的 `immutable` 改为 `true` | 拒绝 | `malformed` | [S-20](contract.md#s-20-出厂格与工作区格的持有)、[S-15](contract.md#s-15-disabled-是保留项名) |
| 在 10.4 上把 `holder` 改为 `{"layer": "tenant", "tenant": {"organization": "org_c", "account": "acc_b2"}}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-使用权来路)：分享在组织之间 |
| 在 10.1 上把 `holder` 改为 `{"layer": "organization", "organization": "org_t1"}`，`assignments` 改为 `[{"item": "disabled", "value": false, "immutable": false, "since": "2026-09-15T08:00:00Z"}]` | 拒绝 | `malformed` | [S-15](contract.md#s-15-disabled-是保留项名) 第 4 条：official 的持有上没有 `disabled`，**配 `false` 也不行**（[S-32](contract.md#s-32-禁用只是一个布尔) 反例三） |
| 在 10.1 上把 `holder` 改为 `{"layer": "organization", "organization": "org_t1"}`，`immutable` 改为 `true` | 通过 | — | [S-18](contract.md#s-18-资产持有)：组织锁住自己对 official 的持有——租户与工作区替换不了它 |
| 在 10.2 上把 `basis` 改为 `{"kind": "inherited"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-使用权来路)：五支闭合，**不自造第六支** |
| 在 10.4 上把 `basis` 改为 `{"kind": "shared"}` | 拒绝 | `malformed` | [S-19](contract.md#s-19-使用权来路)：经分享的必带分享号 |
| 在 10.2 上删去 `immutable` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有)：锁不锁必须明说 |
| 在 10.2 上删去 `since` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有) |
| 在 10.2 上加 `"version": 2` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有)：版本选用只有 `versionSelection` 一种写法，不接受一个自造的成员 |
| 在 10.2 上删去 `versionSelection` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有) 第 6 条：**缺席不读作 `current`** |
| 在 10.2 上把 `versionSelection` 改为 `{"kind": "pinned", "number": 0}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有)：版本号 ≥ 1 |
| 在 10.2 上把 `versionSelection` 改为 `{"kind": "latest"}` | 拒绝 | `malformed` | [S-26](contract.md#s-26-判别式与枚举闭合)：两支闭合 |
| 在 10.2 上把 `versionSelection` 改为 `{"kind": "current", "number": 3}` | 拒绝 | `malformed` | [S-18](contract.md#s-18-资产持有)：跟随当前就不带版本号 |

## 11. 复制血缘

**校验对象**：`$defs/CopyLineage`

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `{"lineage": "lin_40e9", "sourceVersion": 2, "importedBy": {"organization": "org_t2", "account": "acc_a1"}, "importedAt": "2026-09-13T10:00:00Z", "imports": 1}` | 通过 | — | [S-21](contract.md#s-21-复制血缘) |
| `{"lineage": "lin_40e9", "sourceVersion": 2, "importedBy": {"organization": "org_t2", "account": "acc_a1"}, "importedAt": "2026-09-13T10:00:00Z", "imports": 0}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-复制血缘)：首次即 1 |
| `{"lineage": "lin_40e9", "sourceVersion": 2, "importedAt": "2026-09-13T10:00:00Z", "imports": 1}` | 拒绝 | `malformed` | [S-21](contract.md#s-21-复制血缘)：「谁送进来的」必在 |
| `{"lineage": "lin_40e9", "source": "ast_7c11", "sourceVersion": 2, "importedBy": {"organization": "org_t2", "account": "acc_a1"}, "importedAt": "2026-09-13T10:00:00Z", "imports": 1}` | 拒绝 | `malformed` | [S-22](contract.md#s-22-血缘号与分享号)：**不带源记录号**——目标组织不该拿到能推出源组织的引用 |
| `{"lineage": "", "sourceVersion": 2, "importedBy": {"organization": "org_t2", "account": "acc_a1"}, "importedAt": "2026-09-13T10:00:00Z", "imports": 1}` | 拒绝 | `malformed` | [S-22](contract.md#s-22-血缘号与分享号) |

## 12. 工作区承载清单

**校验对象**：`$defs/WorkspaceCarrierManifest`

**12.1 `/home/a1/repos/svc/.omne/workspace.json`**——Schema：通过 · 拒绝值：— · 依据：[S-24](contract.md#s-24-工作区承载清单)

```json
{
  "format": 1,
  "assets": [
    { "capability": { "category": "skill", "name": "svc-conventions" }, "source": "skills/svc-conventions" },
    { "capability": { "category": "mcp", "name": "repo-db" }, "source": ".omne/mcp/repo-db.json" }
  ],
  "assignments": [
    { "capability": { "category": "agent_definition", "name": "code-assistant" }, "item": "default_model", "value": "b" },
    { "capability": { "category": "tool", "name": "shell" }, "item": "execute", "value": { "allowed": ["auto"] } },
    { "capability": { "category": "mcp", "name": "repo-db" }, "item": "callTimeout", "value": "PT20S", "immutable": true }
  ],
  "disabled": [
    { "category": "skill", "name": "svc-conventions" }
  ]
}
```

**形状合法**。其中第二条配值是**权限项**、第三条带了 `immutable`——**不在这里拒**，读入时由读入方滤掉并留下可见的痕迹（[S-24](contract.md#s-24-工作区承载清单) 第 5 条）。
第一条配值给一份别的格提供的 Agent Definition 配设置——读入之后落到这一格上一份 `organization` 支的持有（[S-19](contract.md#s-19-使用权来路)；读法归 `capability.asset-evaluation`）。

**变体（在 12.1 上改动）：**

| 实例 | Schema | 拒绝值 | 依据 |
|---|---|---|---|
| `format` 改为 `2` | 拒绝 | `manifest_format_unsupported` | [S-24](contract.md#s-24-工作区承载清单) 第 1 条 |
| `format` 改为 `"1"` | 拒绝 | `manifest_format_unsupported` | [S-24](contract.md#s-24-工作区承载清单) 第 1 条：在，但不是整数 `1` |
| 删去 `format` | 拒绝 | `malformed` | [S-24](contract.md#s-24-工作区承载清单) 第 1 条 |
| 删去 `disabled` | 拒绝 | `malformed` | [S-24](contract.md#s-24-工作区承载清单) 第 2 条：**不当作空列表** |
| 第一项 `source` 改为 `"../shared/skills/review"` | 拒绝 | `manifest_source_escapes` | [S-24](contract.md#s-24-工作区承载清单) 第 3 条（[S-34](contract.md#s-34-清单里的来路不出目录) 反例） |
| 第一项 `source` 改为 `"/etc/skills"` | 拒绝 | `manifest_source_escapes` | 同上：绝对路径 |
| 第一项 `source` 改为 `"C:/skills"` | 拒绝 | `manifest_source_escapes` | 同上：盘符 |
| 第一项 `source` 改为 `"skills\\..\\..\\x"`（JSON 字面量，串里是反斜杠） | 拒绝 | `manifest_source_escapes` | 同上：反斜杠 |
| 第一项 `source` 改为 `"skills/.."` | 拒绝 | `manifest_source_escapes` | 同上：`..` 这一段在末尾也算 |
| 第一项 `source` 改为 `"skills/..hidden"` | 通过 | — | [S-24](contract.md#s-24-工作区承载清单)：`..hidden` 是一个普通的段名，不是 `..` |
| 第一项 `source` 改为 `"skills//svc-conventions"` | 拒绝 | `malformed` | [S-24](contract.md#s-24-工作区承载清单) 第 3 条：不是逃逸，是写法不规范 |
| 第一项 `source` 改为 `"skills/svc-conventions/"` | 拒绝 | `malformed` | 同上 |
| `disabled` 改为两个相同的能力标识 | 拒绝 | `malformed` | [S-24](contract.md#s-24-工作区承载清单) 第 4 条 |
| 加 `"include": ["**/SKILL.md"]` | 拒绝 | `malformed` | [S-24](contract.md#s-24-工作区承载清单)：显式列举，**不扫目录** |
| `disabled` 改为 `[{"category": "tool", "name": "shell"}]` | 通过 | — | [S-24](contract.md#s-24-工作区承载清单) 第 5 条：`shell` 不是本目录提供的——形状合法，读入时它不参与（[S-15](contract.md#s-15-disabled-是保留项名) 第 5 条） |

## 13. 几处违例同时出现时取哪个拒绝值

按 [S-27](contract.md#s-27-表示层拒绝值) 的次序，**取优先级最高的那一个**；与发现的先后无关。

| 实例 | 违反了哪几条 | 拒绝值 |
|---|---|---|
| 在 12.1 上：`format` 改为 `2`，第一项 `source` 改为 `"../x"` | `manifest_format_unsupported`、`manifest_source_escapes` | `manifest_format_unsupported` |
| `{"category": "widget", "name": "a/b"}`（按 `$defs/CapabilityId`） | `category_unknown`、`name_invalid` | `category_unknown` |
| 在 4.2 上：`origin` 改为 `"builtin"`，`owner.kind` 改为 `"account"` | `origin_unknown`、`owner_kind_unknown` | `origin_unknown` |
| 在 4.2 上：`owner.kind` 改为 `"account"`，`capability.name` 改为 `"code review"` | `owner_kind_unknown`、`name_invalid` | `owner_kind_unknown` |
| 在 4.5 上：`capability.name` 改为 `"review/kit"`，第 1 版 `members` 加 `{"category": "plugin", "name": "base-kit"}` | `name_invalid`、`plugin_member_is_plugin` | `name_invalid` |
| 在 4.2 上：`capability.name` 改为 `"code review"`，草稿的 `body` 删去 `manifest` | `name_invalid`、正文的 `manifest_missing` | `name_invalid` |
| 在 4.2 上：草稿的 `body` 删去 `manifest`，第 2 版的 `number` 改为 `3` | 正文的 `manifest_missing`、`version_sequence_broken` | `manifest_missing` |
| 在 4.2 上：草稿的 `body` 删去 `resources`，第 1 版的 `body` 删去 `manifest` | 草稿的 `malformed`、第 1 版的 `manifest_missing` | `manifest_missing`——草稿在前，但它的值是 `malformed`，取第一份不是 `malformed` 的 |
| 在 4.5 上：第 1 版 `members` 加 `{"category": "plugin", "name": "base-kit"}`，再在末尾追加一版（内容、时刻、发布者同第 1 版，`number` 为 `3`） | `plugin_member_is_plugin`、`version_sequence_broken` | `plugin_member_is_plugin` |
| 在 12.1 上：`assignments` 的第一条再抄一份，第一项 `source` 改为 `"/etc/x"` | `assignment_item_duplicate`、`manifest_source_escapes` | `assignment_item_duplicate` |
| 在 12.1 上：第一项 `source` 改为 `"/etc/x"`，加 `"include": []` | `manifest_source_escapes`、`malformed` | `manifest_source_escapes` |
| 下一节的记录 M，`capability.name` 改为 `"gh/__x"` | `name_invalid`、名字的 `name_not_projectable` | `name_invalid`——本契约的 `name_invalid` 排在携带的值之前（S-27 第三种情形） |
| 记录 M，草稿正文的 `transport.kind` 改为 `"websocket"` | 正文的 `transport_unknown`、名字的 `name_not_projectable` | `transport_unknown`——名字连同那一份正文交给 `data.mcp-endpoint` 判，按那边的次序（第 2 行先于第 7 行） |
| 记录 M，草稿正文的 `transport.command` 改为 `""` | 正文的 `command_empty`、名字的 `name_not_projectable` | `command_empty`——同上（第 4 行先于第 7 行） |

## 14. Schema 挡不住，但同样非法的

这些实例**Schema 都放行**，但违反第三节的约束。它们是[验证入口](../verification.md) V-3 的输入：**接收边界必须拒绝**，只信 Schema 的实现会全过。

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| 在 4.2 上把第 2 版的 `number` 改为 `3` | 通过 | `version_sequence_broken` | [S-9](contract.md#s-9-版本线)（[S-31](contract.md#s-31-版本编号断了即拒) 反例） |
| 在 4.2 上把两版对调（`number` 依次为 2、1） | 通过 | `version_sequence_broken` | 同上：**必须与上一行同跑** |
| 在 10.3 上把 `concurrency` 那条改为 `{"item": "disabled", "value": false, "immutable": false, "since": "2026-09-15T08:00:00Z"}` | 通过 | `assignment_item_duplicate` | [S-18](contract.md#s-18-资产持有) 第 3 条：同一持有上两条 `disabled` |
| 在 12.1 上把第三条配值的 `capability` 与 `item` 改成与第一条相同 | 通过 | `assignment_item_duplicate` | [S-24](contract.md#s-24-工作区承载清单) 第 4 条 |
| 在 12.1 上把第二项 `assets` 的 `capability` 改成与第一项相同 | 通过 | `malformed` | [S-24](contract.md#s-24-工作区承载清单) 第 4 条 |
| 在 4.3 上把 `author` 改为 `{"organization": "org_t1", "account": "acc_a1"}` | 通过 | `malformed` | [S-7](contract.md#s-7-所有者至多变一次) 第 4 条：所有者是 T2，作者却在 T1 |
| 在 4.2 上把 `author` 改为 `{"organization": "org_t1", "account": "acc_b2"}` | 通过 | `malformed` | [S-7](contract.md#s-7-所有者至多变一次) 第 4 条：租户所有的，作者就是那个租户 |
| 在 4.3 上把 `lineage.importedBy` 改为 `{"organization": "org_t1", "account": "acc_a1"}` | 通过 | `malformed` | [S-21](contract.md#s-21-复制血缘) 第 3 条：那是源侧的身份，会暴露源组织 |
| 在 4.1 上把第 1 版 `definition` 的 `name` 改为 `"write_file"`（正文里的名字与 `capability.name` 不一致） | 通过 | `malformed` | [S-10](contract.md#s-10-八类正文的外壳)：身份只在 `capability` |
| 在 4.2 上把第 1 版正文的 `manifest.name` 改为 `"Code-Review"` | 通过 | `name_mismatch` | [S-27](contract.md#s-27-表示层拒绝值)：`data.skill-package` v1 的值，原名携带 |
| 10.2，但 `ast_9d02` 所指记录的 `capability` 是 `skill/code-review` | 通过 | `malformed` | [S-18](contract.md#s-18-资产持有) 第 2 条 |
| 10.2，但 `ast_9d02` 所指记录的所有者是组织 T2 | 通过 | `malformed` | [S-19](contract.md#s-19-使用权来路)：`owned` 时所有者与持有方对得上 |
| 10.1，但 `ast_0001` 所指记录是 customized | 通过 | `malformed` | [S-19](contract.md#s-19-使用权来路)：`official` 一支双向 |
| 10.2，但 `ast_9d02` 所指记录只有两版 | 通过 | `malformed` | [S-18](contract.md#s-18-资产持有) 第 6 条：`pinned` 的那一版在版本线上 |
| 10.7，但组织 T1 的组织格没有持有 `ast_2c66` | 通过 | **这份持有失效**，读作这一格没有持有 | [S-19](contract.md#s-19-使用权来路)：`organization` 支要外层确有同一份持有 |
| 10.6，但 `ast_wk01` 是组织 T1 自建的一份 skill | 通过 | `malformed` | [S-19](contract.md#s-19-使用权来路)：`carrier` 一支双向，只指工作区提供的那份记录 |
| 10.6，但 `assignments` 里有一条 `{"item": "execute", "value": {"allowed": ["auto"]}, "immutable": false, "since": "2026-09-22T12:00:00Z"}`（`execute` 是权限项） | 通过 | `malformed` | [S-20](contract.md#s-20-出厂格与工作区格的持有)：工作区格没有权限项的配值 |
| 第 7 节的权限声明，`default` 改为 `"yolo"` | 通过 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：权限的 `default` 在 `values` 里 |
| 第 7 节的 `concurrency` 声明，`default` 改为 `"4"` | 通过 | `malformed` | [S-12](contract.md#s-12-属性声明由正文推出)：`default` 合那份 `schema` |
| 某个正文契约的推出规则对一份正文产出了 `disabled` 或 `usableBy` 那一条 | 通过 | 推出规则违约 | [S-12](contract.md#s-12-属性声明由正文推出) 第 3 条 |
| 一份 tool 资产的属性项里有 `usableBy`（本契约保留的那一条，不是推出的） | 通过 | — 合法 | [S-36](contract.md#s-36-usableby-是保留项名) 第 2 条：八类都有它（主线裁定 2026-09-24；原先按「只有三类」判为违约，已改正例） |
| 一份 connector 资产的属性项里既有保留的 `usableBy`、又有推出的 `install` | 通过 | 推出规则违约 | [S-36](contract.md#s-36-usableby-是保留项名) 第 2、3 条：Connector 的「能不能安装」就是 `usableBy`，正文契约不另声明（`data.connector` 待主线收口） |
| 同一组织格写入第二份 `capability` 相同、`asset` 不同的持有 | 各自通过 | **存储拒绝** | [S-18](contract.md#s-18-资产持有) 第 1 条（[S-33](contract.md#s-33-一格一个能力标识一份持有) 反例） |
| 两份现存记录的 `lineage.lineage` 都是 `"lin_40e9"` | 各自通过 | **写入方拒绝** | [S-21](contract.md#s-21-复制血缘) 第 5 条 |
| `"lineage": "ast_7c11"`——血缘号的值就是源记录号 | 通过 | **发号方违约** | [S-22](contract.md#s-22-血缘号与分享号)：不是源记录号或它的可逆编码 |
| **记录 M**：在 4.2 上把 `capability` 改为 `{"category": "mcp", "name": "gh__issues"}`、`draft` 改为 `{"category": "mcp", "body": <data.mcp-endpoint 实例 1.1 的正文>}`、`versions` 改为 `[]` | 通过 | `name_not_projectable` | [S-27](contract.md#s-27-表示层拒绝值) 第三种情形（主线裁定 2026-09-24）：名字合本契约 [S-2](contract.md#s-2-能力标识名的词法)，却不合 `data.mcp-endpoint/v1#S-26`（含 `__`）——那份契约的值，**原名携带** |
| 记录 M，`capability.name` 改为 `"gh.issues"` | 通过 | `name_not_projectable` | 同上：`.` 拼不出工具条目名 |
| 记录 M，`capability.name` 改为 `"github"` | 通过 | — | 合 `data.mcp-endpoint/v1#S-26` |
| 在 4.2 上把 `capability` 改为 `{"category": "slash_command", "name": "omne-official:summarize"}`、`draft` 改为 `{"category": "slash_command", "body": {"description": "总结", "binding": {"kind": "prompt", "template": "Summarize $ARGUMENTS"}}}`、`versions` 改为 `[]` | 通过 | `name_reserved` | [S-27](contract.md#s-27-表示层拒绝值) 第三种情形：`data.slash-command/v1` 的 S-4——提示词命令的名字在保留区里；**这一条要连同正文判**（看绑定种类），所以名字随正文交给那份契约 |
| 一条 MCP 凭据配值的 `value` 是 `"ghp_16C7e42F292c6912E7710c838347Ae178B4a"`（一枚明文令牌） | 通过 | **写入方违约** | [S-23](contract.md#s-23-凭据引用) 第 1 条：形状判不出它是不是明文；守在写入方——只接受凭据保管方发出的引用 |
| 一条设置配值在**写入时**不合当时的取值域 | 通过 | **写入方拒绝**（它自己的失败值） | [S-14](contract.md#s-14-属性配值) |
| 同一条配值写入时合法，资产出了新版本之后那一项的取值域变了、它不再合 | 通过 | **合法留存；怎么求值见 [G-12](contract.md#八已知缺口)** | [S-14](contract.md#s-14-属性配值)：**不得被读者删掉或「修好」** |

## 15. 起草者逐条自核

「Schema」一列在 2026-09-24 整批对齐时用 Draft 2020-12 校验器跑过一遍（本地自检，不是登记的证据），结果与局限见[验证入口](../verification.md#结果与反例)。
「拒绝值」一列仍是手核：它与 [S-27](contract.md#s-27-表示层拒绝值) 的次序自洽，**手核不是证据**。
