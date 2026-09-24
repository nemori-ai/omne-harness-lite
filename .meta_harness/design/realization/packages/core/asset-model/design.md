# asset-model 实现设计

契约：[`data.asset-model` v1](../../../../spec/data/asset-model/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块。**契约拥有的是资产领域的静态形状、词法、闭合的拒绝值与固定次序，没有成熟库表达；能复用的：

- **JSON Schema 校验**：`ajv` 8.20.0 的 Draft 2020-12 入口（与 identity-values 同一依赖、同一版本）；`asset-model.schema.json` 从 spec 原样复制进包、包内测试逐字节核对。它 `$ref` 的外部定义（`data.identity-values`、`data.offer-expiry`、`data.content-blocks` 的 `$defs`）从各自包的 `./schema` 子入口取。
- **身份值、时刻、能力标识**：`@omne-harness-lite/identity-values`、`@omne-harness-lite/offer-expiry`（都已实现）；`CapabilityId` 的形状与相等从 [content-blocks](../content-blocks/README.md) 取（家在 `data.content-blocks/v1#S-20`），本模块只加 S-2 的词法与 S-3 的规范串。
- **严格无损 JSON**：清单文本与内容指纹用 content-blocks 的 [`readJsonStrict`／`writeJsonLossless`](../content-blocks/design.md#严格的无损-json-读写)（[D-040 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：重复键即解析失败）。
- 拒绝值的判法沿用 [content-blocks 的写法](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)：按 S-27 的次序逐条判，Schema 只判剩余项。
- **Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。中心的资产治理与据点的装配、注册表、求值各自 `import` | 契约[「这份契约拥有什么」](../../../../spec/data/asset-model/v1/contract.md#这份契约拥有什么) |
| 服务键 | 无 | — |
| `inject` 关系 | **无**。本模块唯一的「外部能力」是正文契约的判定，它经**构造参数**注入（[下文](#正文契约的判定经端口注入不-import-正文包)），不是 Cordis 服务；提供者换代时没有任何在途事实在本模块里 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。没有事件能越过租户或会话边界。值里带租户的只有所有者、作者、`WorkspaceKey.tenant` 与 `HoldingScope`——它们是被写下的事实，谁读得到归资产治理的读面 | — |
| 存储 | **无**：本模块不读写任何存储，不拥有任何表。契约第四节左列里的「存储的唯一约束」「对一份记录的事务」都归资产治理的存储，要求清单写在 [asset-governance](../../assets/asset-governance/README.md) 节点 | — |

### 装配给 vs 协议给：单机时本节点提供了什么

[第四节](../../../../spec/data/asset-model/v1/contract.md#四装配给与协议给)九行里，本节点只在三行出力：

| 行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| 四种不透明标识部署内唯一 | 工作区提供的资产的记录号：**单射**的导法，与存储生成的号**词法上不相交**（[下文](#工作区提供的资产的记录号用单射编码不用摘要)） | 其余三种（记录号、血缘号、分享号、凭据引用）的单一生成点与唯一约束：资产治理、资产流转与凭据保管方 |
| 工作区键指认一个目录 | `normalizeWorkspaceDirectory(path)`：单机上的**字面**规范化 | 谁在什么时候写下这个键：会话创建（PF-015，无契约） |
| 表示层校验在每个接收边界重做 | `judgeAssetValue` 这一个纯入口 | 在哪些边界调：资产治理写面、流转、清单读入、注册表 |

其余六行（一格一份持有、版本线、所有者至多变一次、血缘不变、血缘号不可解引用、凭据引用）全在写路径与存储，**不在本节点**。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/asset-model/v1/contract.md#s-1-资产类别恰八类) 八类 | `AssetCategory`（取值集引 content-blocks 的那一份，不另抄） | — | V-1 |
| [S-2](../../../../spec/data/asset-model/v1/contract.md#s-2-能力标识名的词法)、[S-3](../../../../spec/data/asset-model/v1/contract.md#s-3-能力标识与它的规范串) 名字词法、规范串 | `isCapabilityName(s)`；`capabilityCanonicalString(id)`；`parseCapabilityCanonicalString(s)`（在第一个斜杠处拆） | 「空白」用 `data.identity-values/v1#S-31` 那个码点集合，**不用正则的 `\s`** | V-1、S-29；那个集合由 identity-values 补导出（实现期事项，[AM-1](#实施缺口与消费者影响)） |
| [S-4](../../../../spec/data/asset-model/v1/contract.md#s-4-资产记录号) 例外支、[S-19](../../../../spec/data/asset-model/v1/contract.md#s-19-使用权来路) `carrier` 支 | `carrierRecordId(workspace, capability)` | 单射编码，[下文](#工作区提供的资产的记录号用单射编码不用摘要) | 契约把导法交给实现；「部署内唯一」对这一支由构造成立 |
| S-19 `carrier` 支的内容指纹 | `contentFingerprint(content)` | SHA-256（Node 内置 `crypto`）作用在正文的规范 JSON 上：成员名按码点升序、无空白、数字按原文（经 content-blocks 的 `writeJsonLossless`，M36） | 契约把算法交给实现；「不得按记录号＋版本号缓存」是消费者的义务 |
| [S-5](../../../../spec/data/asset-model/v1/contract.md#s-5-资产来源)～[S-11](../../../../spec/data/asset-model/v1/contract.md#s-11-plugin-的成员) 来源、所有者与作者、记录、版本线、八类外壳、plugin 成员 | 类型 `AssetDefinition`、`AssetOwner`、`AssetVersion`、`AssetContent`（八个判别变体） | S-7 第 4 条（作者与所有者同属一个组织）、S-9 编号连续、S-10 正文名与 `capability.name` 一致在接收边界判 | V-1、V-3、S-30、S-31；S-7 第 1～3 条、S-9「已发布不变」**归写路径**（资产治理，SC-1、SC-2） |
| [S-12](../../../../spec/data/asset-model/v1/contract.md#s-12-属性声明由正文推出)、[S-13](../../../../spec/data/asset-model/v1/contract.md#s-13-设置项类别)、[S-15](../../../../spec/data/asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-36](../../../../spec/data/asset-model/v1/contract.md#s-36-usableby-是保留项名) 属性声明 | `attributeDeclarationsOf(content, actionSnapshot?) → { declarations } \| { underivable: category }`；常量 `DISABLED_DECLARATION`、`USABLE_BY_DECLARATION` | 推出的那组来自正文契约的规则（经端口），再并上两条保留声明；端口也可交回 `underivable`（本版的 connector：`data.connector/v1#S-11` 两项权限在它的 G-4 上），原样透出；推出结果里出现 `disabled`、`usableBy` 或重复项名 ⇒ 视为正文规则的缺陷，抛出 | S-12「推不出不是没有项」：`agent_definition`、plugin 自己的项与本版 connector 返回 `underivable`，**不返回空集**（G-6、G-9） |
| [S-14](../../../../spec/data/asset-model/v1/contract.md#s-14-属性配值)、[S-16](../../../../spec/data/asset-model/v1/contract.md#s-16-持有范围)～[S-18](../../../../spec/data/asset-model/v1/contract.md#s-18-资产持有)、[S-20](../../../../spec/data/asset-model/v1/contract.md#s-20-出厂格与工作区格的持有)～[S-23](../../../../spec/data/asset-model/v1/contract.md#s-23-凭据引用) 配值、持有范围、工作区键、持有、层限制、血缘、两种号、凭据引用 | 类型 `AttributeAssignment`、`HoldingScope`、`WorkspaceKey`、`AssetHolding`、`HoldingBasis`、`CopyLineage`、`LineageId`、`SharingId`、`CredentialRef`；`normalizeWorkspaceDirectory(path)` | 目录规范化只做**字面**的：输入须已是绝对路径（否则拒绝，不拿当前目录去补），按 `path.normalize` 一类的纯字面运算去掉 `.`、`..`、重复分隔符与结尾分隔符；不解析符号链接、不折叠大小写 | V-1、V-3、S-32～S-35；键唯一、`organization` 支的外层确有同一份持有、`pinned` 的版本存在——要看整个存储，归资产治理。符号链接一支是缺口 [AM-3](#实施缺口与消费者影响) |
| [S-24](../../../../spec/data/asset-model/v1/contract.md#s-24-工作区承载清单) 工作区承载清单 | `parseWorkspaceManifestText(text) → { ok: WorkspaceCarrierManifest } \| { rejected }` | 用 content-blocks 的 `readJsonStrict` 读（**同一对象里的重复成员名即解析失败 ⇒ `malformed`**，M36；普通 `JSON.parse` 静默取后一个、看不见它），再按 S-27 判；`source` 只判字面逃逸 | S-24 第 6 条、V-1；**符号链接逃逸**不在此（读目录一方判） |
| [S-25](../../../../spec/data/asset-model/v1/contract.md#s-25-规范表示)～[S-28](../../../../spec/data/asset-model/v1/contract.md#s-28-表示层拒绝不是判定也不修补) 规范表示、闭合、十个拒绝值、次序、不修补 | `createAssetModelJudge(bodies: BodyContracts)` → `judgeAssetValue(defName, value) → { ok } \| { rejected }` | 次序：`manifest_format_unsupported` 起、`malformed` 止；**嵌着的正文与名字收窄的值 v 排在 `name_invalid` 之后、`plugin_member_is_plugin` 之前**，草稿先于各版本、plugin 按成员次序 | V-2（examples 第 13 节十四行专验次序）；不修补、不交出修好的值 |

### 正文契约的判定经端口注入，不 import 正文包

S-27 要求：一份记录的正文不合它那份正文契约、或名字不合那一类的收窄时，那份契约给的拒绝值 v **原名进本契约的次序**。所以本模块的判定必须看得见六份正文契约的判定。
而六份正文契约（[tool-definition](../tool-definition/README.md)、[loop-extension](../loop-extension/README.md)、[skill-package](../skill-package/README.md)、[slash-command](../slash-command/README.md)、[mcp-endpoint](../mcp-endpoint/README.md)、[connector](../connector/README.md) 六个包）反过来依赖本契约的名字词法与属性声明——**本模块直接 import 它们就成环**（契约自己也写明壳的 `$ref`「不登为依赖、是结构前提」）。这一选择已由 [D-040 §八 M44](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 接受。

| | 本模块直接 import 正文包的判定 | 本模块只判外壳，正文由消费者另调 | **端口注入（本节点选）**：`createAssetModelJudge(bodies)` 收一个按类别给出「判正文与名字 → 拒绝值或通过」「推属性声明（或推不出）」「列引用」三样的端口 `BodyContracts`（候选名）；六个正文包**各导出本类那一份**（`toolBodyContract`、`loopExtensionBodyContract`、`skillBodyContract`、`slashCommandBodyContract`、`mcpBodyContract`、`connectorBodyContract`，候选名），由消费者组合 |
|---|---|---|---|
| 包级依赖 | asset-model → tool-definition 等 → asset-model，**成环** | 无环 | 无环：本模块只依赖端口的类型 |
| S-27 一次恰一个、次序固定 | 成立 | **不成立**：两次调用各给一个值，合并次序落到每个消费者手里，各写各的 | 成立：次序在本模块里排 |
| 缺一类的实现 | — | — | 构造时就发现：`bodies` 缺六类中任何一类 ⇒ **构造抛出**，宿主插件启动失败——与本批节点「配置错误启动失败」同一政策。`agent_definition` 与 plugin 自己的项不在端口里，按契约是「推不出」，不是缺实现 |

**落选方（只判外壳）的最强论证**：最简单，本模块完全不知道正文契约存在。**它输给 S-27 的次序**：把次序交给消费者，资产治理的写面、流转、清单读入、注册表四处会各排一遍。
**本方弱点**：多一个端口形状要与六个正文包对齐；组合根（谁把六份实现组合起来交给本模块）落在每个消费者的装配里——候选是资产治理插件与据点侧的注册表各自在插件体里构造一次（[AM-5](#实施缺口与消费者影响)）。置信度：**高**。

### 工作区提供的资产的记录号：用单射编码，不用摘要

S-4 把 `(WorkspaceKey, capability)` → 记录号的导法交给实现，要求确定、部署内唯一、消费者不得解析。

| | 摘要（SHA-256 截断成定长串） | 存储里登记一张对应表、首次读入时分配 | **单射编码（本节点选）**：固定前缀 `wsc1.` ＋ base64url（无填充）编码 `[组织, 账号, 目录, 类别, 名字]` 这个五元 JSON 数组的 UTF-8 字节 |
|---|---|---|---|
| 唯一 | 概率唯一；撞上时「持有指到错的实现，没有任何报错」（第四节第 1 行的后果） | 由唯一约束保证 | **构造上唯一**：编码可逆即单射；前缀含 `.`，而存储生成的号（`generateOpaqueIdentifier()`，26 位小写 base32）不含 `.`，两类号词法上不相交 |
| 纯度 | 纯 | **不纯**：读入是纯计算（`capability.asset-evaluation/v1#S-11`），分配要写存储；且读入在据点、存储在中心 | 纯 |
| 长度、可读性 | 定长 | 定长 | 随目录路径变长；编码可解开，读得出目录与租户 |

**落选方（摘要）的最强论证**：定长、不透露目录路径，碰撞概率在实践中可忽略。**它输给契约的措辞与后果**：第四节把「碰撞概率足够低」明写为不算数，而撞上的后果是静默装错实现；单射编码不需要任何概率论证。
**本方弱点**：号长、可被解码。契约只禁止**消费者**解析，没有要求它不可解码；它透露的目录与租户正是同一份持有上 `WorkspaceKey` 已经带着的东西，不越出那一份持有的读者范围。置信度：**中高**；已由 D-040 §八 M44 接受。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values` v1、`data.offer-expiry` v1 | 已实现的两个 core 包 | 随包版本 | 静态 import |
| `data.content-blocks` v1（`CapabilityId`、严格无损 JSON） | [content-blocks](../content-blocks/README.md) | 随包版本 | 静态 import |
| 六份正文契约的判定与推出规则 | 端口 `BodyContracts`，六份实现由六个正文包各自导出、由消费者组合后在构造时交进来 | 构造时绑定，此后不变；换一套实现就是构造一个新的判定对象 | 缺一类 ⇒ 构造抛出（启动失败）；**不在运行期具名拒绝** |
| 被消费 | 六个正文包、call-accounts、asset-evaluation、资产治理、资产流转（经治理插件）、注册表、MCP 桥、拓展件派发、兼容层、模型档案目录 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**判定对象构造之后不可变，可被任意多个调用方并发使用。

**失败映射**：表示层拒绝 ⇒ `{ rejected: 值 }`，恰一个；推不出属性声明 ⇒ `{ underivable }`（判出来的「不知道」，不是拒绝，也不是空集）；构造时端口不全 ⇒ 抛出（配置错误）；正文规则交回违约的结果（含保留项名、重复项名）⇒ 抛出（那是对应正文包的缺陷，不能折成某个拒绝值）。**都不写日志代替返回**。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-6](../../../../spec/data/asset-model/verification.md#静态检查义务)：SC-1～SC-5 约束的是**存储的写路径与读面**，全部落在资产治理（与流转）节点；本节点只承载 SC-6 的一半：

| 检查 | 形式 | 现状 |
|---|---|---|
| SC-6 推出规则不读正文以外的输入、不产出 `disabled`／`usableBy`、治理类只在点名处产出 | 运行期：`attributeDeclarationsOf` 对端口交回的结果查保留项名与重复项名（违约即抛）；静态：规则（候选）限制六个正文包推出规则模块的 import，只许正文类型 | 都不存在 |
| SC-1～SC-5 | 资产治理节点的 verification | 不在本节点 |

## 实施缺口与消费者影响

契约的 G-1、G-6、G-9、G-12、G-15 不重抄。本节点自己的缺口（编号不重排，别的节点按编号引用）：

- **AM-1 空白码点集合的导出（实现期事项）**：S-2 第 2 条要用 `data.identity-values/v1#S-31` 逐个列出的那个集合；identity-values 包里它是模块内常量、尚未导出。本节点不自抄（那会成为同一概念的第二份定义）。[D-040 §八 M44](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 登记为实现期事项：identity-values 补一个导出，不另出决定。owner：identity-values 节点落包时。同一需求还在 [slash-command](../slash-command/design.md#实施缺口与消费者影响)（识别文法 S-13）。
- **AM-2 已关闭**：原「包级依赖成环」由 [D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)（一契约一包）解开；正文契约那一条仍由端口解开。
- **AM-3 目录规范化不解析符号链接**：`normalizeWorkspaceDirectory` 只做字面规范化，同一目录经符号链接的两条路径会成为两份工作区。契约把规范化交给实现；本节点选字面、不碰文件系统（纯）。若要解析链接，须由写下键的一方在读文件系统之后交来规范路径。owner：会话创建一侧（PF-015，无契约）；在那之前如实记为「本版字面规范化」。
- **AM-4 清单文本的读入方**：`parseWorkspaceManifestText` 要由**读 `.omne/workspace.json` 的那一方**调用（`capability.asset-evaluation/v1#S-2`：读文件、解析 JSON 归提供者）；读方若绕过它、用普通 `JSON.parse` 读，就看不见重复成员名。owner：据点侧读工作区的节点（注册表或据点装配，由主线指派）。
- **AM-5 端口的组合根**：`BodyContracts` 由谁组合六个正文包的导出、交给谁——候选：资产治理插件与据点侧注册表各自在插件体里构造一次。跨节点交接：asset-governance 与 asset-registry 节点的设计各写一行。
- **AM-6 凭据引用解到哪（下一程）**：本模块只定义 `CredentialRef` 的形状（S-23）；它由凭据保管方解引用，那个提供者（`infra/secrets`）**本程不补**，[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) C-5 登记为下一程缺口。owner：主线。本模块不受阻；受阻的是出示凭据的消费者（MCP 桥、连接件接入端）。
