# Skill 契约规格

本规格拥有 `@omne-harness/skill-contract` 公开类型以外的行为：检查 Skill 包的规则与拒绝次序、快照的构造、内容摘要、读取的形状规则、需求端口的要求、符合性套件，以及 `skill` 类别端口的可加扩展。数据形状的唯一来源是 `src/` 的公开类型，本规格不重抄类型，只写每一项何时出现与怎样表现。组的分解、读取步骤与失败映射归[组工程设计](../docs/architecture.md)。本规格不点名调用方。

## 范围与依据

本规格是候选，尚未取得技术接受。下文「本版本」指成员版本 0.0.0。

| 依据 | 修订 | 本规格采用的范围 |
| --- | --- | --- |
| [组工程设计](../docs/architecture.md) | `21175c9f9` | 模型、资产正文与 Skill 包、端口、应用服务、检查与发现、包格式规则、读取、失败种类、验证 |
| 领域设计裁定 | 2026-11-03 | 入口与各入口的内容；内容摘要算法；`SafeReason` 的形状；读取内容是文本或字节；正文起点；每页 65536 字节；中止为 `aborted`；`.omne/skill.json` 的形状与格式版本；四个设置类别；声明项编码；声明的 JSON 预算；YAML 头部的解析；`skillBodyContract` 只做可加扩展；`SkillResolution.adopted` 只交两种答复；快照只能经 `sealSnapshot` 构造。评审之后的裁定见[与组页的差异](#group-differences) |
| 资产公开类型 `@omne-harness/assets` | `21175c9f9` | `BodyContract`、`CapabilityId`、`Declarations` |
| [官方 Agent Skills 规格](https://agentskills.io/specification) | 2026-11-03 读取 | `SKILL.md` 的头部字段与目录结构 |

各裁定的内容写在下文对应的条款里。裁定编号（例如 G3、C19）只是过程标签，决定的内容已经写全在本页。

<a id="entries"></a>

### 入口

本成员有三个入口。三个入口都在 `package.json` 的 `exports` 中写明 `source`、`types` 与 `import`。

| 入口 | 给谁 | 内容 |
| --- | --- | --- |
| `@omne-harness/skill-contract` | 调用方；端口实现方另读 `./provider` | 值、守卫、失败、`SkillCatalog` 与 `SkillAccess` 的接口及结果值、纯函数、`skillBodyContract` |
| `@omne-harness/skill-contract/provider` | 来源、资产登记与端口的实现方 | 三个需求端口及其答复类型、`PackageInspection` 接口、`SkillRef`、`PackageLocator`、`sealSnapshot`、`SnapshotDefect` |
| `@omne-harness/skill-contract/testing` | 端口实现方的测试 | 三个端口的符合性套件、内存替身、`ConformanceCase`、`NotApplicable`、`runConformanceCase`、`isNotApplicable` |

- 公开根与 `./provider` 都不导入 `./testing`。三个入口都不导入测试框架。
- 公开根不导出 `SkillRef`、`PackageLocator`、`PackageInspection` 与 `sealSnapshot`。调用方拿不到包定位。

<a id="closed-items"></a>

### 本页封闭的组页未定项

| 组页位置 | 未定项 | 本页条款 |
| --- | --- | --- |
| 第 71 行 | 值的精确类型 | `src/values.ts`；[值与守卫](#values) |
| 第 77 行 | 媒体类型推断的精确规则 | [媒体类型](#media-type) |
| 第 87 行 | `SafeReason` 的精确形状 | [值与守卫](#values) |
| 第 306 行 | 精确的诊断编号与预算数值 | 预算见[`.omne/skill.json`](#declaration)与[`SKILL.md`](#manifest)；诊断编号不设：拒绝只带原因码与 `detail`，见[检查 Skill 包](#parse) |
| 第 324 行 | 脚本声明的精确规则 | [`.omne/skill.json`](#declaration) |
| 第 346 行 | 中止结果的表示 | [读取的形状规则](#read-shape) |
| 第 491 行 | 精确类型；`target` 的形状；字节范围的单位；按 UTF-8 切页的规则；二进制条目在 `ContentBlock` 中的表示；读取的默认上限；中止结果的表示；`export` 的上限与分批；内容摘要的算法；媒体类型推断的精确规则；`SafeReason` 的形状 | [值与守卫](#values)、[内容摘要](#digest)、[媒体类型](#media-type)、[读取的形状规则](#read-shape) |
| 第 524 行 | 运行种类的取值、设施需要的写法、参数形状的表示 | [`.omne/skill.json`](#declaration) |
| 第 539 行 | 受支持方言、转换限制与真实支持矩阵 | [方言与支持范围](#dialects) |

第 492 行（`skillBodyContract` 扩展的技术接受，以及同步资产规格中 `skill` 一段）不在本页封闭。它的拥有者是资产规格的拥有者。

<a id="group-differences"></a>

### 与组页的差异

下列条款与组页现文不同。组页拥有者写回组页之前，以本页为准。

| 差异 | 本页条款 | 依据 |
| --- | --- | --- |
| `PackageInspection` 的接口在 `./provider`，不在公开根。它的调用方是来源与资产登记一侧，不是读者 | [入口](#entries) | 领域设计裁定 G3（2026-11-03） |
| `SkillReadCheck.check` 答带 `kind` 的判别联合，不答文本联合 | [需求端口](#ports) | 领域设计裁定 C19（2026-11-03） |
| `SourceFailure` 多一种 `entry-unreadable`，组页「链接与非常规文件拒绝为 `malformed`」经它进入 | [需求端口](#ports) | 领域设计裁定 E10（2026-11-03） |
| `sealSnapshot` 收文件字节，不收来源算好的条目事实。代价：来源须整包读入内存才能交出快照 | [快照](#snapshot) | 领域设计裁定，第 1 轮偏离 8（2026-11-03） |
| `sealSnapshot` 拒绝空的或含 `/` 的包根目录名 | [快照](#snapshot) | 领域设计裁定 E12（2026-11-03） |
| 头部 YAML 读不出时不判 `name-mismatch`，判 `malformed` | [拒绝次序](#rejection-order) | 领域设计裁定 C22′（2026-11-03） |
| 含 `..` 段的脚本入口判 `malformed`，不判 `outside-package` | [`.omne/skill.json`](#declaration) | 领域设计裁定 C2（2026-11-03） |
| 控制字节与快照不对应时 `parseSkillPackage` 答 `version-changed` | [前提与版本](#parse-preconditions) | 领域设计裁定 C1（2026-11-03） |
| 只做检查的值公开守卫 `isX`，`toPackagePath` 仍规范化并答 `Outcome` | [值与守卫](#values) | 领域设计裁定，品牌授予规则（2026-11-03） |
| `./testing` 的套件是无框架的用例列表 | [符合性套件](#conformance) | 领域设计裁定 C18（2026-11-03） |
| 本版本的 `./testing` 没有 `SkillAccess` 的套件 | [符合性套件](#conformance) | 不在本成员这次交付的范围内：`SkillAccess` 的套件随 `@omne-harness/skill` 的实现，以可加改动加入 `./testing` |
| `description`、`scripts`、`settings` 与 `package` 是 `skill` 资产正文的保留字段 | [`skill` 类别端口](#category-port) | 领域设计裁定 C3（2026-11-03） |
| `list` 与 `export` 也收 `signal`，也可以答 `aborted`；组页只给 `read` 写了 `signal` | [读取的形状规则](#read-shape) | 领域设计裁定 S3-16（2026-11-03） |
| `SkillPackageSource.snapshot` 可以答 `outside-package`（包内链接解析后落在根外）。有这种链接的包整包不可读 | [需求端口](#ports) | 领域设计裁定 S3-6（2026-11-03） |
| 来源在快照阶段答 `entry-unreadable` 或 `outside-package` 时，检查以对应原因结束，不按拒绝次序判其余原因 | [拒绝次序](#rejection-order) | 领域设计裁定 S3-4（2026-11-03） |
| 类别端口要求 `name` 合 `SkillName` 的词法，否则拒绝 `name-invalid`。这收紧了资产规格中 `skill` 一段 | [`skill` 类别端口](#category-port) | 领域设计裁定 S3-17（2026-11-03） |
| 本成员不依赖 `@omne-harness/content-block`：读取交出文本或字节 | [读取的形状规则](#read-shape) | 领域设计裁定，读取内容（2026-11-03） |
| `unsupported` 本版本只有 `no-readable-package` 一种：文本与字节都能表示，检查没有方言 | [读取的形状规则](#read-shape) | 领域设计裁定 S2-6（2026-11-03） |

## 结果与不变量

<a id="values"></a>

### 值与守卫

每个品牌只有一个守卫授予。只做检查的值公开守卫 `isX(value: unknown)`。`toPackagePath` 还会规范化输入，所以它答 `Outcome`，失败为 `bad-path`。守卫不改写类型。

| 值 | 授予处 | 规则 |
| --- | --- | --- |
| `SkillName` | `isSkillName` | 长 1 到 64 个字符。只含 `a`–`z`、`0`–`9` 与连字符。不以连字符开头或结尾，不含连续的连字符。`a`–`z` 之外的小写字母不合法 |
| `PackagePath` | `isPackagePath`；`toPackagePath` 规范化后经它授予 | 相对路径。拒绝空串、以 `/` 开头、反斜杠、空段（含结尾的 `/`）、`.` 段、`..` 段、C0 控制字符、DEL、C1 控制字符与孤立代理项。`toPackagePath` 先去掉 `.` 段再检查，只剩 `.` 段时拒绝 |
| `EntryDigest` | `computeDigest` | 见[内容摘要](#digest) |
| `PackageDigest` | `isPackageDigest` | 逐字符合 `^sha256:[0-9a-f]{64}$`。`sealSnapshot` 经同一守卫得到快照的内容摘要 |
| `SafeReason` | `isSafeReason` | 长 1 到 256 个字符（按码点计）。不含 C0 控制字符、DEL 与 C1 控制字符，不含孤立代理项 |
| `AssetVersion` | `isAssetVersion` | 规则同 `SafeReason`。Skill 不解释资产版本 |
| `MediaType` | `inferMediaType` | 见[媒体类型](#media-type) |
| 控制文件 | `isControlFile` | 包内路径逐字等于 `SKILL.md` 或 `.omne/skill.json`。控制文件不是资源 |
| `SkillPackageSnapshot` | `sealSnapshot` | 见[快照](#snapshot) |

- `isSafeReason` 只判词形。它不判断原因是否向该主体披露了无权知道的内容。这一义务归 `SkillResolution` 的实现，见[需求端口](#ports)。
- `SkillMaterialBasis` 只指明一份材料，不授予访问，不含包定位。
- `SkillRef` 只在 Skill 与 `SkillResolution` 之间传递。`SkillRef` 没有内容摘要表示资产正文没有 `package.digest`，也就是没有可读的包。

<a id="digest"></a>

### 内容摘要

- 条目的内容摘要是 `sha256:` 加条目原字节的 SHA-256，十六进制小写。
- 快照的内容摘要按下列步骤算出：
  1. 按包内路径的 UTF-16 码元序排列条目。
  2. 对每个条目依次取 `<包内路径>\0<条目内容摘要>\n`，按 UTF-8 编码拼接。
  3. 对拼接结果取 SHA-256，写成 `sha256:` 加十六进制小写。
- 包根目录名不进入内容摘要。条目的输入次序不影响内容摘要。
- 包内路径不含 NUL，条目内容摘要的长度固定，所以拼接结果唯一对应一组条目。

<a id="snapshot"></a>

### 快照

`sealSnapshot({ rootName, files })` 是快照唯一的构造器。来源交出快照时必须用它。`files` 的每一项是一个包内路径与该条目的全部字节。`sealSnapshot` 按下列次序判断：

1. `rootName` 为空或含 `/` 时，答 `invalid-root-name`。根名只用来与清单的 name 比较，所以只拦这两种不可能是目录名的写法，不另加词法。
2. 两个文件的包内路径相同时，答 `duplicate-path`，带重复的路径。
3. 一个文件的路径是另一个路径的祖先目录时，答 `prefix-conflict`，带两个路径。检查对每个路径逐级查它的每个祖先，不靠排序后相邻比较。所以 `a`、`a-b`、`a/b` 三个条目报 `a` 与 `a/b` 冲突。
4. 否则，`sealSnapshot` 从字节算出每个条目的大小、内容摘要、媒体类型与 `encoding`，并算出快照的内容摘要。

- 条目的 `encoding`：字节是严格 UTF-8（不允许无效序列）且不含 NUL 字节时为 `text`，否则为 `binary`。字节开头的 BOM 不改变这一判定。
- 快照、条目集合与每个条目都冻结。条目按包内路径的 UTF-16 码元序排列。快照不保存字节。

<a id="snapshot-credential"></a>

`sealSnapshot` 把每个快照登记在本模块的私有 `WeakSet` 中。`parseSkillPackage` 只接受登记过的快照：字段相同的复制品不是快照，传入时抛出 `TypeError`。类型上，`SkillPackageSnapshot` 带一个模块私有的品牌，不经类型断言就写不出它。这一登记是进程内的凭证：

- 快照不能序列化后传到另一个进程再使用。另一个进程须自己调用 `sealSnapshot`。
- 同一进程把本成员加载为两份模块实例时，一份实例造出的快照不被另一份承认。装配方必须保证本成员只加载一份。

<a id="media-type"></a>

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

<a id="parse"></a>

### 检查 Skill 包

`parseSkillPackage` 收一个快照、控制文件的字节、可选的期望名字与可选的声明预算。它答 `SkillDefinition`、一个拒绝原因，或 `version-changed`。

- 拒绝带一个 `detail`。`detail` 是给包作者看的说明，不是契约字段。调用方不得据 `detail` 分支。
- 拒绝的包不折成替换件，也不当作空包。

<a id="parse-preconditions"></a>

#### 前提与版本

调用方先从来源取得快照与控制文件的字节：`SKILL.md` 与 `.omne/skill.json`。来源失败（例如 `entry-unreadable`、`outside-package`、`unavailable`）由调用方先按[映射](#ports)处理，处理之后才调用 `parseSkillPackage`。

- 快照不是 `sealSnapshot` 造出的时，`parseSkillPackage` 抛出 `TypeError`。这是唯一抛出的情形。
- 控制字节与快照不对应时，`parseSkillPackage` 答 `version-changed`，不做其余判断。「不对应」指下列任一情形：
  - 字节的内容摘要不等于快照中该条目的内容摘要。
  - 快照列出某个控制文件，但字节缺席。
  - 快照没有某个控制文件，但字节在场。

<a id="rejection-order"></a>

#### 拒绝次序

拒绝原因的集合与次序：

<a id="set-inspect-rejections"></a>

```text
manifest-missing
name-mismatch
declaration-format-unsupported
outside-package
tool-ref-invalid
setting-category-unknown
malformed
```

各原因何时出现：

1. `manifest-missing`：快照没有 `SKILL.md`。
2. `name-mismatch`：头部能读出 name，且 name 不逐字等于包根目录名。带期望名字时，name 不逐字等于它也是这一种。
3. `declaration-format-unsupported`：`.omne/skill.json` 是 JSON 对象，但 `formatVersion` 不是词形为 `1` 的数。这时不做声明的其余判断。
4. `outside-package`：脚本入口是绝对路径；或者来源在快照阶段答 `outside-package`（由调用方映射）。
5. `tool-ref-invalid`：依赖声明的类别不是 `tool`，或名字为空。
6. `setting-category-unknown`：设置声明的类别不是四个设置项类别之一。
7. `malformed`：其余格式错误；或者来源在快照阶段答 `entry-unreadable`（由调用方映射）。

- 次序的例外：来源在快照阶段答 `entry-unreadable` 或 `outside-package` 时，检查没有快照可判，以对应的原因结束，不再按次序判其余原因。
- 「头部能读出 name」指：头部的 YAML 解析没有错误与警告，内容是映射，且 `name` 的值是文本。否则不判 `name-mismatch`，头部的问题判为 `malformed`。
- name 等于包根目录名、但不合 `SkillName` 的词法时，判为 `malformed`。
- 同一个包违反几条规则时，`parseSkillPackage` 先读完全部可读的部分，再取次序最前的一条。

<a id="manifest"></a>

#### `SKILL.md`

- 字节按严格 UTF-8 解码。解码失败为 `malformed`。文本以 BOM 开头为 `malformed`。
- 第一行必须逐字为 `---`，以 LF 或 CRLF 结束。
- 头部到第一个逐字为 `---` 的行结束。这一行以 LF 或 CRLF 结束，或者是文件的最后一行。行内有其他字符（包括结尾空格）的行不是定界行。找不到闭合行为 `malformed`。
- 正文从闭合定界行的行终止符之后开始。闭合行是最后一行且没有行终止符时，正文为空。正文保留原字，Skill 不解释它。
- 头部用 `yaml` 2.9.1 解析，采用 YAML 1.2 core schema，开启重复键检测，不展开合并键 `<<`。解析有错误或警告（例如无法解析的标签、第二个文档）时为 `malformed`。
- 头部必须是映射。整个图中的映射键都必须是文本标量。标量只能是 null、布尔值、有限数或文本。`!!binary`、`.inf` 与 `.nan` 为 `malformed`。
- 别名按所指节点展开。展开后的图最多 4096 个节点：映射、序列与标量各算一个，键不算。映射与序列最多嵌套 16 层，头部的根映射算第 1 层。超出为 `malformed`。
- 重复键在整个图中都是 `malformed`，包括 Skill 原样保留、不解释的值内部。
- 核心字段不强转类型：

  | 字段 | 规则 |
  | --- | --- |
  | `name` | 必需。文本，合 `SkillName` 的词法 |
  | `description` | 必需。文本，长 1 到 1024 个字符（按码点计） |
  | `license` | 可选。文本 |
  | `compatibility` | 可选。文本，长 1 到 500 个字符（按码点计） |
  | `metadata` | 可选。键与值都是文本的映射 |
  | `allowed-tools` | 可选。文本，原样保存。它只是元数据，不授予任何许可 |

- 其余字段原样保存在 `SkillManifest.extra`，Skill 不解释它们。名为 `__proto__` 的字段也作为普通字段保存。

<a id="declaration"></a>

#### `.omne/skill.json`

形状的机读描述是 [schema/skill-declaration.schema.json](schema/skill-declaration.schema.json)，类型是 `SkillDeclaration`。本节是行为的唯一正文。

- 字节经 `@omne-harness/json-text` 的 `readJsonBytes` 严格读取。读取失败（非 UTF-8、BOM、空输入、语法错误、注释、尾逗号、重名键、超出预算）为 `malformed`。
- 默认预算是 `maxBytes` 65536、`maxDepth` 16、`maxItems` 4096、`maxMembers` 256、`maxStringLength` 4096、`maxNumberLength` 32。调用方可以给出另一份预算。
- 根不是对象为 `malformed`。
- `formatVersion` 缺席，或者不是词形为 `1` 的数（例如 `"1"`、`1.0`、`1e0`、`2`），为 `declaration-format-unsupported`。
- 根与每个声明项都不允许其他字段。多出的字段为 `malformed`。校验不填缺省值，也不删字段。
- `dependencies`、`scripts` 与 `settings` 都可以缺省。缺省按空数组处理，这是形状规则。在场但不是数组为 `malformed`。
- 「词」指 `^[a-z][a-z0-9-]{0,31}$`。运行种类与设施名都是词。Skill 不解释它们，也不判定设施是否齐备。
- 依赖声明：类别与名字都是文本，否则为 `malformed`。类别不是 `tool` 或名字为空为 `tool-ref-invalid`。同名的依赖重复为 `malformed`。
- 脚本声明：
  - 入口必需。绝对路径为 `outside-package`。其他不合 `PackagePath` 的入口为 `malformed`，含 `..` 段的入口（例如 `scripts/../run.sh`）也是。入口按 `toPackagePath` 规范化，所以可以写 `./run.sh`。
  - 入口必须是快照中的条目，且不是控制文件，否则为 `malformed`。
  - 规范化后入口重复为 `malformed`。
  - 运行种类必需，是词。设施需要必需，是不重复的词组成的数组。
  - 参数形状可选，原样保存为 JSON 树，Skill 不解释。
- 设置声明：名字是非空文本。类别是四个设置项类别之一，其他文本为 `setting-category-unknown`。同名的设置重复为 `malformed`。声明不含设置值。

设置项类别的集合：

<a id="set-setting-categories"></a>

```text
preference
binding
placement-identity
governance
```

<a id="dialects"></a>

#### 方言与支持范围

本版本只支持一种原生格式：按[官方 Agent Skills 规格](https://agentskills.io/specification)的 `SKILL.md`，加可选的、格式版本为 1 的 `.omne/skill.json`。本版本没有兼容方言，也不做格式转换。不符合原生格式的包按上文拒绝，不另报「方言不受支持」。增加方言时，本节增加一行支持范围与转换限制。

<a id="read-shape"></a>

### 读取的形状规则

读取由 `SkillAccess` 的实现兑现。读取步骤与失败映射见[组工程设计「读取」](../docs/architecture.md#读取)。本节封闭组设计留给本成员的形状规则。

- 读取目标指明能力标识，以及正文或一个资源的路径。资源路径是调用方的原始文本，读取在边界经 `toPackagePath` 校验，不合法为 `bad-path`。按资源路径请求控制文件时为 `bad-path`。
- 字节范围是起点加长度，单位是字节。
  - 每页最多 65536 字节。不给范围时，起点为 0，长度为 65536。
  - 长度超过 65536 时，实际范围向内收到 65536 字节。
  - 起点大于或等于总长时，交出空内容，实际范围报为起点等于总长、长度 0，`complete` 为真。
  - 长度为 0 时交出空内容。按下文 `complete` 的规则，这时只有起点大于或等于总长才为真。
  - 起点或长度为负数或非整数时，是调用方的错误，读取抛出 `TypeError`。
  - 本版本的每页上限不可配置。
- 读正文时，内容摘要核对整个 `SKILL.md` 条目。字节范围与总长都相对正文起点，不含头部。
- 结果写出实际范围，它这样确定：
  - 实际起点是不小于请求起点的第一个字符边界。二进制条目的每个字节都是边界，所以实际起点就是请求起点。实际起点超过总长时截到总长。
  - 实际长度是实际交出的字节数。文本条目的终点前移到不大于请求终点的上一个字符边界，所以实际长度可以小于请求长度。
  - 请求的长度短于起点处的一个字符时，文本收成空范围：实际范围报为已后移的实际起点与长度 0。调用方从实际范围的终点继续读，实际范围为空时用至少 4 字节的长度重读。
- 文本条目保留 BOM：BOM 是正文或资源的一部分，文本与字节范围对齐。
- 读取内容是文本或字节。文本条目交出文本，二进制条目交出字节。Skill 不产出 `ContentBlock`，内容块的组装归接收方。
- `complete` 为真，当且仅当实际范围的终点（起点加长度）不小于总长，也就是这一页之后没有剩余字节。部分结果不是失败。
- `read`、`list` 与 `export` 在每次调用端口之前与每次端口返回之后各检查一次 `signal`。任一次发现已中止，操作答 `aborted`，不再调用端口，也不交部分内容。`describe` 不收 `signal`。
- `unsupported` 本版本只有 `no-readable-package` 一种：资产正文缺 `package.digest` 时的 `read`、`list` 与 `export`。
- `export` 不分批：一次结果交出所钉快照的全部条目，或者一个失败，不交部分包。本版本的 `export` 没有总量上限。以后增加上限是破坏性改动，需要另行裁定。

失败种类的集合（每一种何时出现见[组工程设计「失败种类」](../docs/architecture.md#失败种类)，`aborted` 见上文）：

<a id="set-skill-failures"></a>

```text
not-available-to-you
unavailable-stand-in
bad-path
outside-package
resource-missing
basis-unavailable
adopted-material-changed
version-changed
source-unavailable
unsupported
aborted
unknown
```

`unsupported` 所说的不支持之处的集合：

<a id="set-unsupported"></a>

```text
no-readable-package
```

<a id="category-port"></a>

### `skill` 类别端口

`skillBodyContract()` 交出 `skill` 类别的 `BodyContract`。资产正文是 Skill 包的声明投影：名字、说明、必需的工具、脚本声明、设置声明与包的内容摘要。

- 原有规则不变：正文必须经 `readBodyText` 读取；名字为空、工具引用不是 Tool 身份时拒绝为 `incomplete-reference`；名字不等于能力名时拒绝为 `name-mismatch`。
- 名字必须合 `SkillName` 的词法，否则拒绝为 `name-invalid`。这收紧了资产规格中 `skill` 一段：那一段只要求名字非空。判断次序是：正文与名字为空（`incomplete-reference`）、`name-mismatch`、`name-invalid`、工具引用（`incomplete-reference`），然后是扩展字段。
- 扩展字段 `description`、`scripts`、`settings` 与 `package` 都可以缺省，所以没有它们的旧正文仍然合法。这四个字段名从此是 `skill` 资产正文的保留字段：它们在场时必须合下列规则，否则拒绝。
- `description` 是长 1 到 1024 个字符（按码点计）的文本。
- `scripts` 与 `settings` 的每一项与 `.omne/skill.json` 的规则相同，跨项规则也相同：重复为 `malformed`。脚本入口不核对是否在包中，但必须已经规范化，也不得是控制文件：`./run.sh` 这类未规范化的写法与 `SKILL.md` 都为 `malformed`。
- `package` 是只有 `digest` 一个字段的对象，`digest` 合 `PackageDigest` 的形式。
- 扩展字段的拒绝原因是 `outside-package`、`setting-category-unknown` 与 `malformed`，按此次序取第一个。
- 正文的其他顶层字段不判断。
- `deriveDeclarations` 对每项设置声明按出现次序产出一个条目 `setting:<类别>:<名字>`。依赖与脚本不产出声明项。
- `deriveDeclarations` 与 `references` 在判断失败时抛出 `TypeError`，消息含 `failed judgment: <原因>`。

`projectAssetBody(definition)` 从 `SkillDefinition` 派生资产正文，返回 JSON 树。字段依次是 `name`、`description`、`tools`、`scripts`、`settings` 与 `package`。`package.digest` 取自快照的内容摘要。三个数组为空时也写出。调用方用 `writeJsonText` 写成文本，再经 `readBodyText` 读取后交给类别端口判断。

## 所有权、失败与生命周期

本成员只有纯函数、类型与测试设施。它没有异步资源，没有外部效果。它只持有一项状态：快照登记的私有 `WeakSet`，见[快照](#snapshot-credential)。纯函数的失败都是返回值。下列情形例外，它们抛出 `TypeError`：

- `parseSkillPackage` 收到不是 `sealSnapshot` 造出的快照。
- 类别端口的 `deriveDeclarations` 与 `references` 在判断失败后抛出，这是资产的约定。

快照登记的所有权见[快照](#snapshot-credential)。

<a id="ports"></a>

### 需求端口

端口的签名归 `src/ports.ts`。每个端口的要求如下，括号里是符合性套件的用例编号。

`SkillPackageSource`：

- `snapshot` 必须交出 `sealSnapshot` 造出的快照（PS1）。包不变时，两次快照相等（PS2）。
- 找不到包答 `package-not-found`（PS4），来源此刻不可达答 `unavailable`。
- `snapshot` 遇到设备、管道、套接字、无法解析或成环的链接时答 `entry-unreadable`。
- `snapshot` 遇到解析后落在包根之外的包内链接时答 `outside-package`（PS8）。连带后果：有这种链接的包整包不可读，这是包的缺陷。
- 包不变时，`open` 交出的字节与快照中该条目的事实相符：内容摘要、大小、`encoding` 与 `inferMediaType` 的结果（PS3）。
- `open` 找不到包答 `package-not-found`（PS5）。条目不在答 `entry-not-found`（PS6）。条目解析后落在包根之外答 `outside-package`。来源自己发现字节与条目内容摘要不符时答 `bytes-mismatch`。
- `open` 的 `digest` 是调用方已经核对过的快照内容摘要。按内容摘要存放字节的来源找不到该摘要时答 `package-not-found`（PS7）。不按内容摘要存放的来源可以不看它：Skill 会按条目内容摘要核对字节。

`SkillResolution`：

- `resolve` 按下列次序答复：先 `known-unavailable`，再 `adopted` 或 `basis-not-lawful`，再 `none`，再 `unknown`。`known-unavailable` 与是否带依据无关（PR7）。
- 已采用的身份答 `adopted`，带内部引用与声明投影（PR1）。身份对该主体没有对应时答 `none`，带依据也答 `none`（PR2）。
- 没有已知集合的实现，对已不在当前集合里的身份不答 `known-unavailable`，这时不出现替换件。「资产版本不可表示」是例外（见下文）：这时身份仍在集合里、name 已知，任何实现都答 `known-unavailable`。
- 带依据时，`resolve` 不比较内容摘要：内容摘要由 Skill 在读取时与当前快照比较。依据带资产版本时，`resolve` 核对该资产版本是不是这个主体在此作用域可读的、该能力的合法版本。依据不带资产版本时，`resolve` 核对该能力在依据的来源层对这个主体合法可读。
- 身份对该主体合法对应时：依据合法就答 `adopted`，其中的内部引用（包定位与内容摘要）指向依据所指的材料，而不是当前采用的材料（PR3）；依据不合法就答 `basis-not-lawful`（PR4）。
- 资产版本不合 `AssetVersion` 的词法时，Skill 无法表示这份材料。这时端口答 `known-unavailable`，原因是「资产版本不可表示」。
- `known-unavailable` 带的原因必须可以向该主体说明：它不含秘密，也不披露该主体无权知道的内容。这一义务归端口的实现，`isSafeReason` 只核对词形。
- `adopted` 只交 `adopted` 与 `known-unavailable` 两种答复，每个身份一个（PR6）。集合为空时答空数组，不是失败。
- 唯一的失败是 `unknown`，即此刻无法判定。

`SkillReadCheck`：

- 能读答 `granted`（PC1），不能读答 `refused`（PC2），此刻无法判定答 `unknown`。

两个判定端口共有：对无权主体，`SkillResolution` 与 `SkillReadCheck` 的答复不随该身份是否存在而变（PR5、PC3）。

来源失败、读取判定与快照缺陷的集合：

<a id="set-source-failures"></a>

```text
package-not-found
entry-not-found
bytes-mismatch
outside-package
unavailable
entry-unreadable
```

<a id="set-read-verdicts"></a>

```text
granted
refused
unknown
```

<a id="set-snapshot-defects"></a>

```text
invalid-root-name
duplicate-path
prefix-conflict
```

下列映射补充组工程设计的映射表：

- `snapshot` 答 `entry-unreadable`：检查（`inspect`）映射为拒绝 `malformed`；`read`、`list` 与 `export` 映射为 `source-unavailable`。
- `snapshot` 答 `outside-package`：检查映射为拒绝 `outside-package`；`read`、`list` 与 `export` 映射为 `outside-package`。

### 不在本成员

- `PackageInspection`、`SkillCatalog` 与 `SkillAccess` 只有接口与结果值，实现在 `@omne-harness/skill`。
- `SkillAccess` 的符合性套件不在本版本。
- 目录来源 `DirectorySource` 在 `@omne-harness/skill-host-local`。

## 组合与验证

<a id="conformance"></a>

### 符合性套件

三个套件是 `skillPackageSourceConformance()`、`skillResolutionConformance()` 与 `skillReadCheckConformance()`。每个套件交出一组用例，每个用例有名字、条款编号与 `run(fixture)`。

- 实现方为每个用例新建一份夹具，在自己的测试框架里逐个登记并运行 `run(fixture)`。`runConformanceCase` 运行一个用例并答结果。
- 用例失败时抛出 `node:assert` 的 `AssertionError`。
- 夹具缺少用例需要的东西时，用例抛出 `NotApplicable`。这不算通过，也不算失败，实现方要单独计数。来源不按内容摘要存放时，PS7 不适用。夹具没有 `escaping` 时，PS8 不适用。夹具没有 `earlier` 时，PR3 的早先版本一例不适用。所采用材料没有资产版本时，PR4 的资产版本一例不适用；夹具没有 `unlawfulLayer` 时，PR4 的来源层一例不适用。夹具没有 `standIn` 时，PR7 不适用。
- 本成员对内存替身的测试把 `NotApplicable` 当作失败：替身必须覆盖全部用例。

| 套件 | 夹具 | 用例 |
| --- | --- | --- |
| `skillPackageSourceConformance` | `source`；`present`：来源持有、用例运行期间不变的包；`absent`：不对应任何包的定位；`addressing`：是否按内容摘要存放；`escaping`：可选，有一个链接解析后落在根外的包 | PS1–PS8 |
| `skillResolutionConformance` | `resolution`；`permitted`、`refused` 两个主体与作用域；`adopted`：对 `permitted` 已采用的身份；`missing`：对谁都不存在的身份；`standIn`：可选，对 `permitted` 合法已知、此刻不可用的身份；`earlier`：可选，`adopted` 的一个早先合法版本的依据；`unlawfulLayer`：可选，`adopted` 对 `permitted` 不合法的来源层 | PR1–PR7 |
| `skillReadCheckConformance` | `readCheck`；`permitted`、`refused`；`readable`：`permitted` 能读的身份；`missing` | PC1–PC3 |

无披露用例 PR5 与 PC3 的名字都是 `answers a principal without the right the same for an existing and a missing identity`。它们比较 `refused` 问已存在的身份与问 `missing` 的答复，两者必须完全相同。PR5 同时比较带依据的答复，并要求 `refused` 的当前合法集合不含 `adopted` 与 `standIn`。

内存替身 `createMemorySource`、`createMemoryResolution` 与 `createMemoryReadCheck` 通过各自的全部用例。`createMemorySource` 按快照的内容摘要存放字节，并可以模拟包内链接：链接读目标的字节，目标落在根外时快照答 `outside-package`，目标不是包内文件时答 `entry-unreadable`。替身通过不证明真实来源、真实读取权、真实求值或耐久。

### 持续验证

命令：在成员目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。

| 义务 | 测试 |
| --- | --- |
| 入口与导出集合，公开根不导入 `./testing` | `tests/public-entry.spec.ts`、`tests/types.spec-d.ts`、`tests/provider-types.spec-d.ts` |
| 本页的封闭集合与类型相等 | `tests/closed-sets.spec.ts` |
| 值、守卫与纯函数的边界 | `tests/values.spec.ts` |
| 检查 Skill 包与拒绝次序，每个拒绝原因一个包样本 | `tests/parse-*.spec.ts`、`tests/fixtures/packages/` |
| 快照构造 | `tests/snapshot.spec.ts` |
| 端口套件、内存替身，以及套件对泄露身份的替身在进程内变红 | `tests/conformance.spec.ts` |
| `skill` 类别端口 | `tests/contract.spec.ts`、`tests/contract-extension.spec.ts` |
| Schema 与解析一致 | `tests/declaration-schema.spec.ts` |

未覆盖：

- 读取的形状规则由 `SkillAccess` 的实现兑现。本成员没有它的实现，也没有它的符合性套件。
- `entry-unreadable` 与 `bytes-mismatch` 没有替身会答，套件也不核对它们。
- 替身通过不证明真实来源、读取权、求值或耐久。
- 仓库没有 JSON Schema 校验器。Schema 与解析的一致性按规则逐条比较，不是完整的等价证明。Schema 表达不了的规则写在它的 `description` 中。
