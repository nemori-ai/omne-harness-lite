# Skill 契约规格

本规格拥有 `@omne-harness/skill-contract` 公开类型以外的行为：检查 Skill 包的规则与拒绝次序、快照的构造、内容摘要、读取的形状规则、需求端口的要求与符合性套件、`skill` 类别端口的可加扩展。精确的数据形状归 `src/` 的公开类型。组的分解、读取步骤与失败映射归[组工程设计](../docs/architecture.md)。本规格不点名调用方。

## 范围与依据

本规格是候选，尚未取得技术接受。下文「本版本」指成员版本 0.0.0。本规格封闭组工程设计列给本成员的未定项，依据如下：

- 组工程设计 [packages/skills/docs/architecture.md](../docs/architecture.md)，修订 `21175c9f9`：模型、资产正文与 Skill 包、端口、应用服务、检查与发现、包格式规则、读取、失败种类、验证。
- 第一波 Skill 线的已定事项 1–15（负责人 2026-11-03 会话内裁定）：入口、内容摘要算法、`SafeReason`、读取内容、正文起点、默认读取上限、中止、`.omne/skill.json` 的形状、设置类别、声明项编码、声明的 JSON 预算、YAML 头部、`skillBodyContract` 的扩展、`SkillResolution.adopted` 的答复类型、`sealSnapshot`。
- 资产公开类型 `@omne-harness/assets`：`BodyContract`、`CapabilityId`、`Declarations`。
- [官方 Agent Skills 规格](https://agentskills.io/specification)：`SKILL.md` 的头部字段与目录结构。

### 入口

本成员有三个入口。三个入口都在 `package.json` 的 `exports` 中写明 `source`、`types` 与 `import`。

| 入口 | 给谁 | 内容 |
| --- | --- | --- |
| `@omne-harness/skill-contract` | 调用方 | 值、失败、服务接口与结果值、纯函数、`skillBodyContract` |
| `@omne-harness/skill-contract/provider` | 端口实现方 | 三个需求端口、`Resolution`、`CatalogResolution`、`Reply`、`SourceFailure`、`ReadVerdict`、`SkillRef`、`PackageLocator`、`sealSnapshot`、`SnapshotDefect` |
| `@omne-harness/skill-contract/testing` | 端口实现方的测试 | 三个端口的符合性套件与内存替身 |

- 公开根不导入 `./testing`，也不导入 `vitest`。`./provider` 也不导入它们。
- 公开根不导出 `SkillRef`、`PackageLocator` 与 `sealSnapshot`。调用方拿不到包定位。
- `./testing` 在运行时导入 `vitest` 的 `describe`、`it` 与 `expect`。消费 `./testing` 的成员必须自己安装 `vitest`。

## 结果与不变量

### 值与品牌

每个品牌只有一个校验函数授予。校验不改写类型，只有 `toPackagePath` 去掉 `.` 段。

| 值 | 授予处 | 规则 |
| --- | --- | --- |
| `SkillName` | `toSkillName` | 长 1 到 64 个字符。只含 `a`–`z`、`0`–`9` 与连字符。不以连字符开头或结尾，不含连续的连字符。`a`–`z` 之外的小写字母不合法。 |
| `PackagePath` | `toPackagePath` | 相对路径。拒绝空串、以 `/` 开头、反斜杠、空段（含结尾的 `/`）、`..` 段、C0 控制字符、DEL、C1 控制字符与孤立代理项。去掉 `.` 段。只剩 `.` 段时拒绝。 |
| `EntryDigest` | `computeDigest` | 见「内容摘要」。 |
| `PackageDigest` | `toPackageDigest` | 文本必须逐字符合 `^sha256:[0-9a-f]{64}$`。`sealSnapshot` 经同一校验得到快照的内容摘要。 |
| `SafeReason` | `toSafeReason` | 长 1 到 256 个字符（按 Unicode 码点计）。不含 C0 控制字符、DEL 与 C1 控制字符，不含孤立代理项。 |
| `AssetVersion` | `toAssetVersion` | 规则同 `SafeReason`。Skill 不解释资产版本。 |
| `MediaType` | `inferMediaType` | 见「媒体类型」。 |
| `SkillPackageSnapshot` | `sealSnapshot` | 见「快照」。 |

`toSkillName`、`toPackagePath`、`toSafeReason`、`toAssetVersion` 与 `toPackageDigest` 返回 `Outcome`。失败依次是 `invalid-name`、`bad-path`、`invalid-reason`、`invalid-asset-version` 与 `invalid-digest`。

`SkillMaterialBasis` 只指明一份材料，不授予访问，不含包定位。`SkillRef` 只在 Skill 与 `SkillResolution` 之间传递。`SkillRef.digest` 缺席表示资产正文没有 `package.digest`，也就是没有可读的包。

### 内容摘要

- 条目的内容摘要是 `sha256:` 加条目原字节的 SHA-256，十六进制小写。
- 快照的内容摘要按下列步骤算出：
  1. 按包内路径的 UTF-16 码元序排列条目。
  2. 对每个条目依次取 `<包内路径>\0<条目内容摘要>\n`，按 UTF-8 编码拼接。
  3. 对拼接结果取 SHA-256，写成 `sha256:` 加十六进制小写。
- 包根目录名不进入内容摘要。条目的输入次序不影响内容摘要。
- 包内路径不含 NUL，条目内容摘要的长度固定，所以拼接结果唯一对应一组条目。

### 快照

`sealSnapshot({ rootName, files })` 是快照唯一的构造器。来源实现交出快照时必须用它。`files` 的每一项是一个包内路径与该条目的全部字节。

1. 两个文件的包内路径相同时，返回 `{ kind: 'duplicate-path', path }`。
2. 一个文件的路径是另一个路径的祖先目录时，返回 `{ kind: 'prefix-conflict', file, nested }`。检查对每个路径逐级查它的每个祖先，不靠排序后相邻比较。所以 `a`、`a-b`、`a/b` 三个条目报 `a` 与 `a/b` 冲突。
3. 否则，`sealSnapshot` 从字节算出每个条目的事实：`size` 是字节数，`digest` 是条目内容摘要，`mediaType` 由 `inferMediaType` 推断，`encoding` 见下文。
4. 快照、条目表与每个条目都冻结。条目按包内路径的 UTF-16 码元序排列。快照不保存字节。

条目的 `encoding`：字节是严格 UTF-8（不允许无效序列）且不含 NUL 字节时为 `text`，否则为 `binary`。字节开头的 BOM 不改变这一判定。

`parseSkillPackage` 只接受 `sealSnapshot` 造出的快照。快照对象带有运行时登记。字段相同的复制品不是快照，传入时 `parseSkillPackage` 抛出 `TypeError`。类型上，`SkillPackageSnapshot` 带一个模块私有的品牌，对象字面量不能赋给它。

### 媒体类型

`inferMediaType(path, head)` 按下列次序推断：

1. 取路径最后一段中最后一个 `.` 之后的扩展名，不分大小写。以 `.` 开头且没有其他 `.` 的文件名没有扩展名。

   | 扩展名 | 媒体类型 |
   | --- | --- |
   | `md` | `text/markdown` |
   | `txt` | `text/plain` |
   | `json` | `application/json` |
   | `yaml`、`yml` | `application/yaml` |
   | `sh` | `application/x-sh` |
   | `py` | `text/x-python` |
   | `js`、`mjs` | `text/javascript` |
   | `ts` | `text/x-typescript` |
   | `html` | `text/html` |
   | `css` | `text/css` |
   | `csv` | `text/csv` |
   | `xml` | `application/xml` |
   | `svg` | `image/svg+xml` |
   | `png` | `image/png` |
   | `jpg`、`jpeg` | `image/jpeg` |
   | `gif` | `image/gif` |
   | `webp` | `image/webp` |
   | `pdf` | `application/pdf` |

2. 扩展名不在表中时，读开头字节的签名：PNG（`89 50 4E 47 0D 0A 1A 0A`）、JPEG（`FF D8 FF`）、GIF（`GIF8`）、PDF（`%PDF-`）、WebP（偏移 0 为 `RIFF` 且偏移 8 为 `WEBP`）。
3. 两者都没有结果时，媒体类型缺席。缺席不表示文本。

扩展名优先于内容。

### 检查 Skill 包

`parseSkillPackage({ snapshot, control, expectedName?, declarationLimits? })` 返回 `SkillDefinition`，或者 `{ kind: 'rejected', code, detail? }`。`detail` 是给包作者看的说明，不是契约的一部分。

#### 前提

调用方先从来源取得控制文件的字节，并按快照中条目的内容摘要核对。`control.manifest` 是 `SKILL.md` 的字节，`control.declaration` 是 `.omne/skill.json` 的字节。下列情形是调用方的错误，`parseSkillPackage` 抛出 `TypeError`：

- 快照不是 `sealSnapshot` 造出的。
- 快照有某个控制文件而字节缺席，或者快照没有它而字节在场。
- 字节的内容摘要不等于快照中该条目的内容摘要。

#### 拒绝次序

`parseSkillPackage` 按下列次序给出第一个拒绝原因：

1. `manifest-missing`：快照没有 `SKILL.md`。
2. `name-mismatch`：头部能读出 name，且 name 不逐字等于包根目录名。带 `expectedName` 时，name 不逐字等于它也是这一种。
3. `declaration-format-unsupported`：`.omne/skill.json` 是 JSON 对象，但 `formatVersion` 不是写作 `1` 的数。这时不做声明的其余判断。
4. `outside-package`：脚本入口以 `/` 开头，或含 `..` 段。
5. `tool-ref-invalid`：依赖声明的类别不是 `tool`，或名字为空。
6. `setting-category-unknown`：设置声明的类别不是四个设置项类别之一。
7. `malformed`：其余格式错误。

- 「头部能读出 name」指：头部的 YAML 解析没有错误与警告，内容是映射，且 `name` 的值是文本。否则不判 `name-mismatch`，头部的问题判为 `malformed`。
- name 等于包根目录名、但不合 `SkillName` 的词法时，判为 `malformed`。
- 同一个包违反几条规则时，`parseSkillPackage` 先读完全部可读的部分，再取次序最前的一条。
- 拒绝的包不折成替换件，也不当作空包。

#### `SKILL.md`

- 字节按严格 UTF-8 解码。解码失败为 `malformed`。文本以 BOM 开头为 `malformed`。
- 第一行必须逐字为 `---`，以 LF 或 CRLF 结束。
- 头部到第一个逐字为 `---` 的行结束。这一行以 LF 或 CRLF 结束，或者是文件的最后一行。行内有其他字符（包括结尾空格）的行不是定界行。找不到闭合行为 `malformed`。
- 正文从闭合定界行的行终止符之后开始。闭合行是最后一行且没有行终止符时，正文为空。正文保留原字，Skill 不解释它。
- 头部用 `yaml` 2.9.1 解析，采用 YAML 1.2 core schema，开启重复键检测，不展开合并键 `<<`。解析有错误或警告（例如无法解析的标签、第二个文档）时为 `malformed`。
- 头部必须是映射。整个图中的映射键都必须是文本标量。标量只能是 null、布尔值、有限数或文本。`!!binary`、`.inf` 与 `.nan` 为 `malformed`。
- 别名按所指节点展开。展开后的图最多 4096 个节点，最深 16 层。超出为 `malformed`。
- 重复键在整个图中都是 `malformed`，包括 Skill 原样保留、不解释的值内部。
- 核心字段不强转类型：

  | 字段 | 规则 |
  | --- | --- |
  | `name` | 必需。文本，合 `SkillName` 的词法 |
  | `description` | 必需。文本，长 1 到 1024 个字符（按码点计） |
  | `license` | 可选。文本 |
  | `compatibility` | 可选。文本，长 1 到 500 个字符 |
  | `metadata` | 可选。键与值都是文本的映射 |
  | `allowed-tools` | 可选。文本，原样保存为 `allowedTools`。它只是元数据，不授予任何许可 |

- 其余字段原样保存在 `SkillManifest.extra`，Skill 不解释它们。名为 `__proto__` 的字段也作为普通字段保存。

#### `.omne/skill.json`

形状的机读描述是 [schema/skill-declaration.schema.json](schema/skill-declaration.schema.json)。本节是行为的唯一正文。

```text
{ "formatVersion": 1,
  "dependencies"?: [{ "category": "tool", "name": <非空文本> }],
  "scripts"?: [{ "entry": <包内路径>, "runKind": <词>, "facilities": [<词>], "parameters"?: <任意 JSON> }],
  "settings"?: [{ "name": <非空文本>, "category": <设置项类别> }] }
```

- 字节经 `@omne-harness/json-text` 的 `readJsonBytes` 严格读取。读取失败（非 UTF-8、BOM、空输入、语法错误、注释、尾逗号、重名键、超出预算）为 `malformed`。
- 默认预算是 `maxBytes` 65536、`maxDepth` 16、`maxItems` 4096、`maxMembers` 256、`maxStringLength` 4096、`maxNumberLength` 32。调用方可以经 `declarationLimits` 给出另一份预算。
- 根不是对象为 `malformed`。
- `formatVersion` 缺席，或者不是词形为 `1` 的数（例如 `"1"`、`1.0`、`2`），为 `declaration-format-unsupported`。
- 根与每个声明项都不允许其他字段。多出的字段为 `malformed`。校验不填缺省值，也不删字段。
- 三个数组都可以缺省。缺省按空数组处理，这是形状规则。数组在场但不是数组为 `malformed`。
- 「词」指 `^[a-z][a-z0-9-]{0,31}$`。运行种类与设施名都是词。Skill 不解释它们，也不判定设施是否齐备。
- 依赖声明：两个字段都是文本，否则为 `malformed`。类别不是 `tool` 或名字为空为 `tool-ref-invalid`。同名的依赖重复为 `malformed`。
- 脚本声明：
  - `entry` 必需。以 `/` 开头或含 `..` 段为 `outside-package`。其他不合 `PackagePath` 的入口为 `malformed`。入口按 `toPackagePath` 规范化。
  - 入口必须是快照中的条目，且不是控制文件，否则为 `malformed`。
  - 规范化后入口重复为 `malformed`。
  - `runKind` 必需，是词。`facilities` 必需，是不重复的词组成的数组。
  - `parameters` 可选，原样保存为 `JsonValue`。
- 设置声明：名字是非空文本。类别是 `preference`、`binding`、`placement-identity` 或 `governance`，其他文本为 `setting-category-unknown`。同名的设置重复为 `malformed`。声明不含设置值。

#### 方言与支持范围

本版本只支持一种原生格式：按[官方 Agent Skills 规格](https://agentskills.io/specification)的 `SKILL.md`，加可选的、`formatVersion` 为 1 的 `.omne/skill.json`。本版本没有兼容方言，也不做格式转换。不符合原生格式的包按上文拒绝，不另报「方言不受支持」。增加方言时，本节增加一行支持范围与转换限制。

### 读取的形状规则

读取由 `SkillAccess` 的实现兑现，读取步骤与失败映射见[组工程设计「读取」](../docs/architecture.md#读取)。本节封闭组设计留给本成员的形状规则。

- `ReadTarget` 指明能力标识，以及正文 `{ kind: 'body' }` 或资源 `{ kind: 'resource', path }`。`path` 是调用方的原始文本，读取在边界经 `toPackagePath` 校验，不合法为 `bad-path`。控制文件按资源路径请求时为 `bad-path`。
- 字节范围 `ByteRange` 是起点加长度，单位是字节。不给范围时，起点为 0，长度为默认读取上限 65536 字节。
- 读正文时，内容摘要核对整个 `SKILL.md` 条目。字节范围与总长都相对正文起点，不含头部。
- 文本条目按 UTF-8 字符边界切页。实际范围向内收：起点后移到下一个字符边界，终点前移到上一个字符边界。结果写出实际范围。请求的长度短于起点处的一个字符时，实际范围可以为空。调用方从实际范围的终点继续读，实际范围为空时用至少 4 字节的长度重读。
- `ReadContent` 是文本 `{ kind: 'text', text }` 或字节 `{ kind: 'bytes', bytes }`。文本条目交出文本，二进制条目交出字节。Skill 不产出 `ContentBlock`，内容块的组装归接收方。
- `complete` 为真，当且仅当实际范围从 0 开始且长度等于总长。部分结果不是失败。
- `read`、`list` 与 `export` 在调用每个端口之前检查 `signal`。调用方中止后，操作不再调用端口，不交部分内容，结果是失败 `{ kind: 'aborted' }`。`describe` 不收 `signal`。
- `unsupported` 在本版本只有一种：`{ kind: 'unsupported', what: 'no-readable-package' }`，即资产正文缺 `package.digest` 时的 `read`、`list` 与 `export`。
- `export` 不分批：一次结果交出所钉快照的全部条目，或者一个失败，不交部分包。

### `skill` 类别端口

`skillBodyContract()` 交出 `skill` 类别的 `BodyContract`。资产正文是 Skill 包的声明投影：

```text
{ name, description?, tools: [{ category: "tool", name }], scripts?: [...], settings?: [...], package?: { digest } }
```

- 原有规则不变：正文必须经 `readBodyText` 读取；`name` 为空、`tools` 不是 Tool 身份时拒绝为 `incomplete-reference`；name 不等于能力名时拒绝为 `name-mismatch`。原有拒绝先于扩展字段的拒绝。
- 扩展字段都可以缺省，所以没有扩展字段的旧正文仍然合法。
- `description` 是长 1 到 1024 个字符的文本。`scripts` 与 `settings` 的每一项与 `.omne/skill.json` 的规则相同，只是不核对入口是否在包中。`package` 是只有 `digest` 一个字段的对象，`digest` 合 `PackageDigest` 的形式。
- 扩展字段的拒绝原因是 `outside-package`、`setting-category-unknown` 与 `malformed`，按此次序取第一个。
- 正文的其他顶层字段不判断。
- `deriveDeclarations` 对每项设置声明按出现次序产出一个条目 `setting:<类别>:<名字>`。依赖与脚本不产出声明项。
- `deriveDeclarations` 与 `references` 在判断失败时抛出 `TypeError`，消息含 `failed judgment: <原因>`。

`projectAssetBody(definition)` 从 `SkillDefinition` 派生资产正文，返回 JSON 树：依次是 `name`、`description`、`tools`、`scripts`、`settings` 与 `package.digest`。`package.digest` 取自快照的内容摘要。三个数组为空时也写出。调用方用 `writeJsonText` 写成文本，再经 `readBodyText` 读取后交给类别端口判断。

## 所有权、失败与生命周期

本成员只有纯函数、类型与测试设施。它没有异步资源，不持有状态，没有外部效果。纯函数的失败都是返回值，不抛出。下列情形例外：前提被破坏时 `parseSkillPackage` 抛出 `TypeError`，类别端口的 `deriveDeclarations` 与 `references` 按资产约定在判断失败后抛出。

### 需求端口

端口的签名归 `src/ports.ts`。每个端口的要求如下。

- `SkillPackageSource.snapshot` 必须交出 `sealSnapshot` 造出的快照。包不变时，两次快照相等。找不到包为 `package-not-found`，来源此刻不可达为 `unavailable`。
- `SkillPackageSource.open` 交出的字节必须与快照中该条目的事实相符：内容摘要、大小、`encoding` 与 `inferMediaType` 的结果。条目不在为 `entry-not-found`。解析后落在包根之外为 `outside-package`。来源自己发现字节与条目内容摘要不符时为 `bytes-mismatch`。
- `SkillResolution.resolve` 按组设计的次序答复：先 `known-unavailable`，再 `adopted` 或 `basis-not-lawful`，再 `none`，再 `unknown`。`known-unavailable` 与是否带依据无关。
- 依据带资产版本时，`resolve` 核对该资产版本。依据不带资产版本时，`resolve` 按来源层与内容摘要核对。
- `SkillResolution.adopted` 只交 `adopted` 与 `known-unavailable` 两种答复，每个身份一个。集合为空时答空数组，不是失败。
- 对无权主体，`SkillResolution` 与 `SkillReadCheck` 的答复不随该身份是否存在而变。
- `Reply<T>` 的唯一失败是 `'unknown'`，即此刻无法判定。

### 不在本成员

- `PackageInspection`、`SkillCatalog` 与 `SkillAccess` 只有接口与结果值，实现在 `@omne-harness/skill`。
- `SkillAccess` 的符合性套件不在本版本。
- 目录来源 `DirectorySource` 在 `@omne-harness/skill-host-local`。
## 组合与验证

### 符合性套件

三个套件都是 `describe*Conformance({ name, create, samples })`。`create` 每个用例调用一次，交出一个新的端口实现。套件用 `vitest` 注册用例。

| 套件 | 样本 | 用例 |
| --- | --- | --- |
| `describeSkillPackageSourceConformance` | `present`：来源持有、套件运行期间不变的包；`absent`：不对应任何包的定位 | 快照由 `sealSnapshot` 造出；两次快照相等；每个条目的字节与条目事实相符；`absent` 的 `snapshot` 与 `open` 答 `package-not-found`；不在快照中的路径答 `entry-not-found` |
| `describeSkillResolutionConformance` | `permitted`、`refused` 两个主体与作用域；`adopted`：对 `permitted` 已采用、带内容摘要的身份；`missing`：对谁都不存在的身份；`standIn`：可选，对 `permitted` 合法已知、此刻不可用的身份 | `adopted` 答 `adopted`；`missing` 答 `none`；所采用材料的依据答回该材料；内容摘要不合法的依据答 `basis-not-lawful`；无披露；`adopted()` 只交两种答复且含 `adopted`；`standIn` 带不带依据都答 `known-unavailable` |
| `describeSkillReadCheckConformance` | `permitted`、`refused`；`readable`：`permitted` 能读的身份；`missing` | `permitted` 得 `granted`；`refused` 得 `refused`；无披露 |

无披露用例的名字是 `answers a principal without the right the same for an existing and a missing identity`。它比较 `refused` 问已存在的身份与问 `missing` 的答复，两者必须完全相同。对 `SkillResolution`，它同时比较带依据的答复，并要求 `refused` 的 `adopted()` 不含 `adopted` 与 `standIn`。

内存替身 `createMemorySource`、`createMemoryResolution` 与 `createMemoryReadCheck` 通过各自的套件。替身通过不证明真实来源、真实读取权、真实求值或耐久。`createMemorySource` 只持有包的当前字节，忽略 `open` 的 `digest` 参数。

### 持续验证

命令：在成员目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。`tests/conformance-red.spec.ts` 属于慢层。它起一个子进程，运行 `tests/fixtures/violations/` 中故意泄露的替身，并核对只有无披露用例变红。

| 义务 | 测试 |
| --- | --- |
| 入口与导出集合，公开根不导入 `./testing` | `tests/public-entry.spec.ts`、`tests/types.spec-d.ts` |
| 值与纯函数的边界 | `tests/values.spec.ts` |
| 检查 Skill 包与拒绝次序，每个拒绝原因一个包样本 | `tests/parse-package.spec.ts`、`tests/fixtures/packages/` |
| 快照构造 | `tests/snapshot.spec.ts` |
| 端口套件与替身 | `tests/conformance.spec.ts`、`tests/conformance-red.spec.ts` |
| `skill` 类别端口 | `tests/contract.spec.ts`、`tests/contract-extension.spec.ts` |
| Schema 与解析一致 | `tests/declaration-schema.spec.ts` |

未覆盖：

- 读取的形状规则由 `SkillAccess` 的实现兑现。本成员没有它的实现，也没有它的符合性套件。
- 替身通过不证明真实来源、读取权、求值或耐久。
- 仓库没有 JSON Schema 校验器。Schema 与解析的一致性按规则逐条比较，不是完整的等价证明。
