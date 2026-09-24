# data.asset-model v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.asset-model, 1)`——
  `family = data`、`topic = asset-model`、规范路径 `spec/data/asset-model/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-002 rev 16、PF-001 rev 16、PF-003 rev 4、PF-015 rev 11** 为准；PF-004 rev 10 只作指路
- **精确语义依赖**：

  | 坐标 | 消费的条款 | 取它的什么 | 本契约怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [S-3](../../identity-values/v1/contract.md#s-3-organizationid)、[S-5](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)、[S-6](../../identity-values/v1/contract.md#s-6-tenantid-无生灭路径)、[S-11](../../identity-values/v1/contract.md#s-11-scopelayeridentity)、[S-12](../../identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)、[S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)、[S-22](../../identity-values/v1/contract.md#s-22-路径是地址不是钥匙)、[S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[S-34](../../identity-values/v1/contract.md#s-34-语义身份与实现地址分开) | 组织与租户的标识、作用域层身份的两个变体、合法缺席、判别式不压平、路径是地址、不透明标识的表示与空白码点集合 | `$ref` 它的 `$defs/OrganizationId`、`TenantId`、`ScopeLayerIdentity`；四个不透明标识按 S-31 的散文自定义，**不 `$ref` 它的 `OpaqueIdentifier`** |
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | [S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围) | 时刻的规范形式 | `$ref` 它的 `$defs/Instant`：`publishedAt`、`importedAt`、`since` |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | [S-20](../../content-blocks/v1/contract.md#s-20-派生表示的产出者与能力标识) | 能力标识的形状、相等规则与八个类别 | `$ref` 它的 `$defs/CapabilityId`，再收紧 `name` 的词法（[S-2](#s-2-能力标识名的词法)）；类别取值集经 JSON Pointer 引它，不另抄 |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（续） | [S-8](../../identity-values/v1/contract.md#s-8-tenantrole) | `TenantRole` 两值 | `usableBy` 的取值域取它的两值再加 `self`（[S-36](#s-36-usableby-是保留项名)） |

  **六类正文的壳 `$ref` 各自的正文契约**（[S-10](#s-10-八类正文的外壳)）：`data.tool-definition`、`data.loop-extension`、`data.skill-package`、`data.mcp-endpoint`、`data.slash-command`、`data.connector`。
  **这不登为本契约的依赖**：那几份正文契约反过来取本契约的名字词法、属性声明与设置项类别——方向是它们 → 本契约；壳的 `$ref` 只是把它们的形状装进记录，是结构上的前提（catalog 须无环）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.asset-model/v1#S-18`。
  本文引另一份契约的条款一律带坐标，**`S-31` 这类裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 八类资产；身份是「类别 ＋ name」，其余归实现 | [PF-002 §4 八类资产](../../../../product/PF-002-assets-settings-and-permissions/design.md#八类资产) · [身份是「类别 ＋ name」](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) · [PF-001 §4 资产的种类](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#资产的种类) | S-1、S-3、S-10 |
| 斜杠命令的保留名在 `omne-official` 前缀下，分隔符与拼法归规格 | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) | S-2 |
| Tool、MCP、Connector、Loop Extension、Skill、Agent Definition 各自是什么、自带哪些属性 | [PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) · [MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) · [Connector](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector) · [Loop Extension](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) · [Skill](../../../../product/PF-002-assets-settings-and-permissions/design.md#skill) · [Agent Definition](../../../../product/PF-002-assets-settings-and-permissions/design.md#agent-definition) | S-10、S-12 |
| MCP 凭据：一份持有一份值、不跨租户身份共用、值永不呈现、续期不算换值、组织层能否持有未决 | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) · [§9 未决项](../../../../product/PF-002-assets-settings-and-permissions/design.md#九未决项) | S-23、[G-10](#八已知缺口) |
| Plugin：打包分发、内含成员不取得独立生命周期、能组合哪几类；刻意不做的组合 | [PF-002 §4 Plugin](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin) · [谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁) · [几个刻意不做的组合](../../../../product/PF-002-assets-settings-and-permissions/design.md#几个刻意不做的组合) | S-11、[G-9](#八已知缺口) |
| 组合是一种关系；组合的引用指向能力标识 | [PF-002 §5.1](../../../../product/PF-002-assets-settings-and-permissions/design.md#51-组合是一种关系不是几种) · [§6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识) | S-11 |
| 工作区：一级归属、不是目录、挂在租户下、会话选用、挂上之后特定命名的文件自动进来 | [PF-002 §4 工作区](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区) · [工作区不是目录](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区不是目录) · [它挂在租户下](../../../../product/PF-002-assets-settings-and-permissions/design.md#它挂在租户下) · [它是会话选用的](../../../../product/PF-002-assets-settings-and-permissions/design.md#它是会话选用的不指定就是空) · [挂上之后自动进来](../../../../product/PF-002-assets-settings-and-permissions/design.md#挂上之后它的内容在装配时自动进来) · [PF-015 §6.13](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#613-工作区在创建时显式指定不指定就是空) | S-16、S-17、S-24 |
| 三方分工：资产定形状、各层配值、运行时求值；配值挂在持有上；「组织的设置」是视图 | [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性) · [三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · [「组织的设置」是视图](../../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象) | S-12、S-14、S-18 |
| 设置项分四类，资产声明每一项时必须标类别 | [PF-002 §5.2 设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) | S-13 |
| 权限是允许集合，选择就是收窄；收空不是禁用；默认取作者给的那一个 | [PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) | S-12、S-14 |
| 默认与强制：一个 `immutable` 标记管设置、权限与替换；禁用是「布尔设置 ＋ 真即 immutable」 | [PF-002 §5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用) · [PF-001 §6.2](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) | S-14、S-15 |
| 锁替换：持有它的那一层以下不许再替换，不问被锁的是不是 official | [PF-002 §5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级) | S-18、S-20 |
| 工作区那一级不参与权限；落点与身份类设置、`immutable` 与权限一起滤掉 | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) | S-20、S-24 |
| 三条层序；工作区不多一重身份 | [PF-002 §5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题) · [它不因此多一重身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份) | S-16 |
| 移除与禁用是两个动作；禁用是逐层配的布尔设置；official 不可禁 | [PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作) · [禁用是逐层配的布尔设置](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见) | S-15、S-18 |
| 一个资产在某个范围里；一份持有上的一个属性配值；一个资产定义的版本 | [PF-002 flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里) · [§3.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值) · [§3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本) · [§1.2](../../../../product/PF-002-assets-settings-and-permissions/flows.md#12-配置一个资产的设置或权限) | S-9、S-14、S-18、S-24 |
| 创作与归属：作者用租户身份标识、所有者与作者分记、提升到组织不可逆、agent 产出要能分辨 | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) · [作者用租户身份标识](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识) | S-6、S-7、S-8 |
| official 与 customized；official 不需要授权、不可禁用 | [PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized) | S-5、S-15、S-19 |
| 拥有、获权、选用三件事 | [PF-001 §4 拥有、获权、选用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#拥有获权选用) | S-18、S-19 |
| 路径是地址，不是钥匙 | [PF-001 §6.5](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙) | S-17 |
| 复制血缘：首次产生此后不变、不传递、对目标只见「谁、何时、第几版」 | [PF-003 §4 复制血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘) | S-21、S-22 |
| 首次复制：所有者是目标组织、作者是 (目标组织, 执行者)、版本线独立、不暴露源组织 | [PF-003 §6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象) · [§6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制) | S-9、S-21 |
| 判首次还是重复只看血缘、撞标识无血缘是新增 | [PF-003 §6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘) | S-18、S-21 |
| 分享：给的是获权不是拥有、分享在组织之间 | [PF-003 §4 分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#分享) · [§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有) | S-19、S-22 |
| 资产持有的键、作者与所有者分记、工作区宿主为租户；目录那一半留给资产领域 | `data.identity-values/v1` 的 [CS-1](../../identity-values/v1/contract.md#cs-1-资产持有的键与属性配值)、[CS-2](../../identity-values/v1/contract.md#cs-2-作者与所有者分记)、[CS-6](../../identity-values/v1/contract.md#cs-6-工作区宿主为租户)、[G-07](../../identity-values/v1/contract.md#十已知缺口) | S-6、S-16、S-17、S-18 |
| 规格形式；部署边界；租户隔离 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) · [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 见下方引文 |
| 统一语言正式名 | [能力与构成](../../../../ubiquitous_language/terms/capabilities-and-composition.md) · [作用域与求值](../../../../ubiquitous_language/terms/scope-and-resolution.md) · [流转与获权](../../../../ubiquitous_language/terms/circulation-and-entitlement.md) | 全部英文名 |
| 资产与资产版本的宿主、身份依据与「正文未述」 | [domain_objects 资产](../../../../domain_objects/objects.md#ul-asset--资产) · [资产版本](../../../../domain_objects/objects.md#ul-asset-version--资产版本) · [工作区](../../../../domain_objects/objects.md#ul-workspace--工作区) | S-4、S-9、S-17、[G-1](#八已知缺口) |

> **没有产品行、或产品行不足以单独支撑的条款，逐条点名：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-4](#s-4-资产记录号) 资产记录号、[S-12](#s-12-属性声明由正文推出) 声明由正文推出、[S-22](#s-22-血缘号与分享号) 血缘号、[S-23](#s-23-凭据引用) 凭据引用、[S-24](#s-24-工作区承载清单) 承载清单的位置与格式 | 主线 2026-09-23 对块 A 形状的五项自决（A1、A3、A7、A4、A8）。产品正文只到「具体资产自身靠什么标识正文未述」「哪些文件、什么格式本版不定义」为止。**这五项自决尚未落进设计链里任何一处**，本表无处可链——见 [G-13](#八已知缺口) |
> | [S-2](#s-2-能力标识名的词法) 名字不含斜杠、许冒号、[S-3](#s-3-能力标识与它的规范串) 的规范串 `<category>/<name>` | **主线裁定 2026-09-23，待产品负责人确认**（账本 S9-c）：`data.content-blocks/v1` 的 G-5 把 `name` 的词法留给本契约；斜杠命令的 `omne-official:` 与 MCP 动作条目名要用冒号。产品正文只说「分隔符与拼法归规格」——见 [G-13](#八已知缺口) |
> | [S-8](#s-8-资产记录) 的 `byAgent`、[S-18](#s-18-资产持有) 的 `versionSelection`、[S-19](#s-19-使用权来路) 的五支、[S-27](#s-27-表示层拒绝值) 吸收正文契约的拒绝值、[S-36](#s-36-usableby-是保留项名) 的 `usableBy` | **主线裁定 2026-09-23，待产品负责人确认**（账本 S9-b、A-G3、A-G7、A-G14、A-M13/M16、S18-c、S21）——见 [G-13](#八已知缺口) |
> | [S-7](#s-7-所有者至多变一次) 第 4 条（作者与所有者同属一个组织）、[S-15](#s-15-disabled-是保留项名) 的 `immutable` 恒假与默认值 `false`、[S-20](#s-20-出厂格与工作区格的持有) 出厂格不配值、[S-21](#s-21-复制血缘) 那四项随重复复制改写 | **规格层推导**，依据写在各条正文里 |
> | [S-25](#s-25-规范表示)～[S-28](#s-28-表示层拒绝不是判定也不修补) | **SYS-SPEC**：规范表示、闭合枚举、表示层拒绝值与「表示层不等于判定」是规格形式的要求 |
> | [第四节](#四装配给与协议给) | **SYS-DEPLOY** |

## 一、目的与消费者

### 这份契约拥有什么

**资产领域的全部静态数据形状**：能力标识的词法、资产记录与它的版本线、八类正文的外壳、
属性声明与属性配值、持有范围与工作区键、资产持有与它的使用权来路、复制血缘（作为记录的一项属性），
以及工作区承载目录里那份清单文件的形状——还有一个值不合这些形状时，**拒绝值叫什么**。

它是一份**数据契约**：没有操作、没有提交点、没有状态转移，**因此不需要插件**。
求值、治理写面与流转三份能力契约都读写这些形状，写两遍必然分叉，所以它们**引用本契约的 `$defs` 名，不复述定义**。

**它不拥有**：

| 不拥有 | 归谁 |
|---|---|
| 四步求值（资产求值、组装、投影、层级计算）与工作区清单的读入规则 | [`capability.asset-evaluation`](../../../capabilities/asset-evaluation/v1/contract.md)（候选） |
| 创作、发布、提升、删除、持有与配值的写操作，角色矩阵，读面 | [`capability.asset-governance`](../../../capabilities/asset-governance/v1/contract.md)（候选） |
| 复制通知、分享邀请、确认之后的分享；「团队资产不出那棵树」的守卫 | [`capability.asset-transfer`](../../../capabilities/asset-transfer/v1/contract.md)（候选） |
| 八类正文的内部 | tool：`data.tool-definition`；loop_extension：`data.loop-extension`；skill：`data.skill-package`；mcp：`data.mcp-endpoint`；slash_command：`data.slash-command`；connector：`data.connector`；agent_definition：PF-004 的契约（见 [S-10](#s-10-八类正文的外壳)） |
| 会话与运行时的注册表 | [`capability.asset-registry`](../../../capabilities/asset-registry/v1/contract.md)（候选） |
| 凭据本体的存储、加密与续期 | 提供者设计（[S-23](#s-23-凭据引用)） |
| 「组织的设置」那种视图 | 不是对象，是[属性投影](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)，由求值与读面算出 |

### 消费者

| 消费者 | 消费什么 |
|---|---|
| `capability.asset-evaluation` v1（候选） | 求值的全部输入形状：`AssetHolding`、`AssetDefinition`、`AttributeAssignment`、`AttributeDeclaration`、`HoldingScope`、`WorkspaceKey`；读入的 `WorkspaceCarrierManifest`；[S-12](#s-12-属性声明由正文推出) 的投影义务、[S-15](#s-15-disabled-是保留项名) 的保留项、[S-20](#s-20-出厂格与工作区格的持有) 的层限制 |
| `capability.asset-governance` v1（候选） | 写的就是这些记录：[S-6](#s-6-所有者与作者分记)～[S-9](#s-9-版本线)（记录、所有者、版本线）、[S-14](#s-14-属性配值)～[S-20](#s-20-出厂格与工作区格的持有)（配值与持有） |
| `capability.asset-transfer` v1（候选） | `AssetRecordId`、`CapabilityId`、`CopyLineage`、`LineageId`、`SharingId`、`AssetHolding`、`HoldingBasis`；[S-21](#s-21-复制血缘)、[S-22](#s-22-血缘号与分享号) |
| 各类正文契约（`data.tool-definition`、`data.loop-extension`、`data.skill-package`、`data.mcp-endpoint`、`data.slash-command`、`data.connector`，以及 PF-004 将起草的 Agent Definition） | [S-2](#s-2-能力标识名的词法)（可再收窄，不得放宽）、[S-12](#s-12-属性声明由正文推出) 的投影义务、[S-13](#s-13-设置项类别)、[S-15](#s-15-disabled-是保留项名)（不得声明 `disabled`）、[S-23](#s-23-凭据引用)（凭据类项的值用 `CredentialRef`） |
| `capability.asset-registry` v1（候选）、Agent 装配（PF-004，契约未建立） | `CapabilityId`、`AssetRecordId`、`AssetContent` |
| 租户领域：`data.identity-values` v1 | 反向的兑现：它的 [CS-1](../../identity-values/v1/contract.md#cs-1-资产持有的键与属性配值)、[CS-2](../../identity-values/v1/contract.md#cs-2-作者与所有者分记)、[CS-6](../../identity-values/v1/contract.md#cs-6-工作区宿主为租户) 点名「资产领域的 owner」为第一消费者，本契约是那几条走查落地的地方；它的 G-07「目录那一半」由 [S-17](#s-17-工作区键) 闭合 |
| `data.call-accounts` v1 | [S-3](#s-3-能力标识与它的规范串) 的规范串：`CostItem.service` 写一个 MCP 接入点时用它（那边的采用是一处对齐，见[验证入口](../verification.md#对齐义务)） |
| 设置页（PF-002 §6.1，无契约） | `AttributeDeclaration`（表单从哪长出来）、`AttributeAssignment`（这一格配了什么） |

> 上表没有一行是本契约的依赖：方向一律是消费者 → 本契约，登记在各消费者自己的 catalog 条目里。

## 二、含义与使用范围

**适用范围**：一个部署之内。本版完整交付是单机，但每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论在单机由装配给出、分布式后必须由协议重新兑现，列在[第四节](#四装配给与协议给)。

### 规格层 token 与词条的对应

交换表示用 token，对外文档用词条名，**两者不得互相替代**。

| 规格层 token | 词条 |
|---|---|
| `AssetDefinition`（一份资产记录） | [资产 · Asset](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset--资产--asset) 的一份具体实现——[领域对象条目](../../../../domain_objects/objects.md#ul-asset--资产)说的「下层」 |
| `AssetVersion` | [资产版本 · Asset Version](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version) |
| `CapabilityId`、`CapabilityName` | [能力标识 · Capability Identifier](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) 与它的 name 分量 |
| `AssetCategory` 的八个值 | 八类资产：`skill` [技能](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill) · `tool` [工具](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-tool--工具--tool) · `mcp` [MCP](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) · `connector` [连接件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-connector--连接件--connector) · `loop_extension` [拓展件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) · `slash_command` [斜杠命令](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command) · `plugin` [插件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-plugin--插件--plugin) · `agent_definition` [Agent 定义](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-agent-definition--agent-定义--agent-definition) |
| `AssetOrigin`：`official` · `customized` | [资产来源 · Asset Origin](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-origin--资产来源--asset-origin)：[官方件](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) · [自定义件](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-customized-asset--自定义件--customized-asset) |
| `AssetOwner` / `author` | [定义所有权](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership) / 作者（PF-001 §6.7） |
| `AttributeKind`：`setting` · `permission` | [设置 · Setting](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting--设置--setting) · [权限 · Permission](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-permission--权限--permission) |
| `SettingCategory`：`preference` · `binding` · `placement_identity` · `governance` | [设置项类别 · Setting Category](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)：偏好 · 绑定 · 落点与身份 · 治理 |
| `AttributeAssignment` | [属性配值 · Attribute Assignment](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-assignment--属性配值--attribute-assignment) |
| `immutable` | [不可覆盖标记 · Immutable Marker](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker) |
| `disabled` 项 | [资产禁用 · Asset Disable](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable) |
| `AssetHolding` | [资产持有 · Asset Holding](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding) |
| `HoldingBasis`：`owned` · `organization` · `official` · `shared` · `carrier` | [定义所有权](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership) · 官方件「不需要授权」 · 经[资产分享](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)得来的[使用权](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-usage-right--使用权--usage-right)；`organization`、`carrier` 两支**无词条**（外层持有、工作区提供） |
| `HoldingScope.layer = "factory"` | [作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)的「出厂默认」那一格 |
| `HoldingScope.layer = "workspace"`、`WorkspaceKey` | [工作区 · Workspace](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace) |
| `CopyLineage` | [复制血缘 · Copy Lineage](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-copy-lineage--复制血缘--copy-lineage) |
| `plugin` 的 `members` | [资产组合 · Asset Composition](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition) |
| `AssetHolding.versionSelection` | [版本选用 · Version Selection](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-version-selection--版本选用--version-selection) |
| `usableBy` 项 | 谁可以使用它（词条链接待合流后补） |
| `CredentialRef` 指向的那一份 | [MCP 凭据 · MCP Credential](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential) |

**下列是规格层的名字，不是统一语言词条**，因此本契约与 Schema 里**不给它们「中文 · English」那种词条式标题**：
`AssetRecordId`（资产记录号，**无词条**）、`AttributeDeclaration`（属性声明——资产「自带的那一个属性项」，**无词条**）、
`AttributeDomain`（取值域）、`PermissionValue`（权限的配值）、`HoldingScope`（持有范围——资产归属那条层序的一格，**无词条**）、
`WorkspaceKey`（工作区键，**无词条**）、`LineageId`（血缘号，**无词条**）、`SharingId`（分享号——「确认之后的分享」本身**无词条**）、
`CredentialRef`（凭据引用，**无词条**）、`WorkspaceCarrierManifest`（承载清单——「承载目录里那份特定命名的文件」，**无词条**）、
`byAgent`（agent 产出标记，**无词条**）。

### 与相近概念的差异

- **能力标识 ≠ 资产记录号。**前者答「是不是同一个东西」，后者答「是哪一份实现」。同一个能力标识下可以并存 official、组织自定义、租户自定义、复制进来的多份记录（[S-4](#s-4-资产记录号)）。
- **资产记录 ≠ 资产版本 ≠ 草稿。**记录是一份实现的全部；版本是它某一次发布定下的那份内容；草稿还在变，不是版本（[S-9](#s-9-版本线)）。
- **持有 ≠ 所有权。**被分享来的也持有；持有的是哪份、资格从哪来，是 `asset` 与 `basis` 两件事（[S-18](#s-18-资产持有)、[S-19](#s-19-使用权来路)）。
- **持有范围 ≠ 作用域层身份。**持有范围是资产归属那条层序的四格；作用域层身份只有组织与租户两个变体，本契约原样引用它，**不给它加变体**（[S-16](#s-16-持有范围)）。
- **属性声明 ≠ 属性配值 ≠ 属性投影。**声明是资产定的形状（有哪一项、什么取值域、默认什么）；配值是某一格为某一项配下的值；投影是一格的设置或权限作为视图算出来的样子——**只有配值是被存下来读写的最小单位**。
- **禁用 ≠ 移除 ≠ 收空权限。**禁用是持有上的一项布尔配值，持有与其余配值都在；移除是持有没了；收空权限的资产照样装得上、每次调用被拒（[S-15](#s-15-disabled-是保留项名)）。
- **工作区键 ≠ 承载目录。**键里的路径是**指认**那份工作区的地址，不是它本身，更不是钥匙（[S-17](#s-17-工作区键)）。
- **承载清单 ≠ 工作区。**清单是目录里一份文件的形状；工作区是租户持有的一级归属，清单读进来才成为它这一格的持有与配值（[S-24](#s-24-工作区承载清单)）。
- **复制血缘 ≠ registry 里的血缘。**后者是设计对象的新旧身份对应，与本条无关。
- **凭据引用 ≠ 凭据。**引用可以存、可以随配值流动；凭据本体不进任何一份配值（[S-23](#s-23-凭据引用)）。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `AssetCategory` | 资产的八类 | [S-1](#s-1-资产类别恰八类) |
| `CapabilityName` | 能力标识的 name 分量的词法 | [S-2](#s-2-能力标识名的词法) |
| `CapabilityId` | 能力标识 | [S-3](#s-3-能力标识与它的规范串) |
| `AssetRecordId` | 一份资产记录的标识 | [S-4](#s-4-资产记录号) |
| `AssetOrigin` | 资产来源 | [S-5](#s-5-资产来源) |
| `AssetOwner`、`author` | 所有者与作者 | [S-6](#s-6-所有者与作者分记)、[S-7](#s-7-所有者至多变一次) |
| `AssetDefinition` | 一份资产记录 | [S-8](#s-8-资产记录) |
| `AssetVersion` | 一个已发布版本 | [S-9](#s-9-版本线) |
| `AssetContent` | 八类正文的外壳 | [S-10](#s-10-八类正文的外壳)、[S-11](#s-11-plugin-的成员) |
| `AttributeDeclaration`、`AttributeKind`、`AttributeDomain` | 资产自带的一个属性项 | [S-12](#s-12-属性声明由正文推出) |
| `SettingCategory` | 设置项类别 | [S-13](#s-13-设置项类别) |
| `AttributeAssignment`、`PermissionValue` | 属性配值 | [S-14](#s-14-属性配值)、[S-15](#s-15-disabled-是保留项名) |
| `HoldingScope` | 持有与配值的归属格 | [S-16](#s-16-持有范围) |
| `WorkspaceKey` | 工作区键 | [S-17](#s-17-工作区键) |
| `AssetHolding` | 资产持有 | [S-18](#s-18-资产持有)、[S-20](#s-20-出厂格与工作区格的持有) |
| `HoldingBasis` | 使用权来路 | [S-19](#s-19-使用权来路) |
| `CopyLineage` | 复制血缘 | [S-21](#s-21-复制血缘) |
| `LineageId`、`SharingId` | 血缘号、分享号 | [S-22](#s-22-血缘号与分享号) |
| `CredentialRef` | 凭据引用 | [S-23](#s-23-凭据引用) |
| `WorkspaceCarrierManifest` | 工作区承载清单 | [S-24](#s-24-工作区承载清单) |

### S-1 资产类别恰八类

**资产恰八类，闭合：`skill`、`tool`、`mcp`、`connector`、`loop_extension`、`slash_command`、`plugin`、`agent_definition`。**
这就是[资产词条](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset--资产--asset)说的「恰有八类，这八类是穷尽的」。

- **取值集只有一份**：它就是 `data.content-blocks/v1` 的 [S-20](../../content-blocks/v1/contract.md#s-20-派生表示的产出者与能力标识) 给 `CapabilityId.category` 定的那八个。
  Schema 经 JSON Pointer 引用那个定义，**不另抄一份枚举**。
- 大小写不同也是另一个值；未知取值在本契约的上下文里拒绝值是 `category_unknown`（[S-27](#s-27-表示层拒绝值)）。

### S-2 能力标识名的词法

**`CapabilityName` 是能力标识的 name 分量。本版的词法恰是四条：**

1. **非空。**
2. **任何位置都不含空白**——「空白」恰是 `data.identity-values/v1` 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 逐个列出的那个码点集合，**不是某个正则引擎的 `\s`**。
3. **不含斜杠 `/`（U+002F）。**
4. **区分大小写**：相等是逐码点精确相等，不做 Unicode 规范化、大小写折叠或裁剪。

**禁斜杠的理由只有一条**：让 [S-3](#s-3-能力标识与它的规范串) 的规范串 `<category>/<name>` 单射——类别取值里没有斜杠，名字里也没有，第一个斜杠就把两段分开。
**冒号允许**：斜杠命令的保留前缀 `omne-official:` 与 MCP 动作条目名「接入点名:动作名」都要用它（主线裁定 2026-09-23，待产品负责人确认；账本 S9-c）。

- **各类正文契约可以在这四条之内再收窄**（例如斜杠命令要能在交付面上敲出来、MCP 接入点的 name 要拼得出工具条目名），**不得放宽**；收窄出的拒绝值由 [S-27](#s-27-表示层拒绝值) 原名携带（它的第三种情形）。
- **斜杠命令的保留前缀怎么拼归斜杠命令的契约**：`data.slash-command/v1` 的 S-3 定为 `omne-official:`，合本条词法（原 G-11）。
- 本条闭合 `data.content-blocks/v1` 的 G-5 里「`CapabilityId.name` 的词法」那一半。
- **本版不设长度上限**，也不再限字符集；需要更窄的，按上面第一个要点由正文契约收窄。

### S-3 能力标识与它的规范串

**`CapabilityId` 是[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)的表示：`{ category, name }`。**
形状与相等规则就是 `data.content-blocks/v1` 的 [S-20](../../content-blocks/v1/contract.md#s-20-派生表示的产出者与能力标识)——两个分量、逐码点相等、类别不同名字相同的两个不相等；
本契约在它之上**只加** [S-2](#s-2-能力标识名的词法) 的词法。Schema 是 `$ref` 那边的定义再收紧 `name`，**不复制一份同义定义**。

它回答[「是不是同一个东西」](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)：
类别相同、name 相同的两份，就是同一个东西的两种实现；其余一切（参数、说明、子命令、由哪个包提供）都不参与这个判断。

**规范串**：需要把一个能力标识写成**一个字符串**的地方，写法恰是 `<category>` ＋ `/` ＋ `<name>`，例如 `mcp/github`（主线裁定 2026-09-23，待产品负责人确认；账本 S9-c）。

- 它是**单射**的：不同的能力标识得到不同的串，一个合法的串只有一种拆法——在第一个斜杠处拆开（[S-2](#s-2-能力标识名的词法) 第 3 条）。
- 它**恒含一个斜杠**，所以**永远不等于**任何不含斜杠的保留字面量——例如 `data.call-accounts/v1` 的 [`CostItem`](../../call-accounts/v1/contract.md#s-9-costitem一次工具执行里的一笔) 里的 `model_call`。
- 它**不是 `CapabilityId` 的交换表示**：交换与存储里能力标识恒是两分量对象，把它拼成一个串交上来是 `malformed`。
  规范串只在「这里只能放一个字符串」的地方用；哪些地方用它，由那份契约自己写（`CostItem.service` 那一处是[一项对齐](../verification.md#对齐义务)）。

### S-4 资产记录号

**`AssetRecordId` 是一份具体资产记录的标识：不透明、部署内唯一、由存储在产生这份记录那一刻生成、不回收不复用**——记录删除之后它的号也不再发给任何别的记录。
**唯一的例外是工作区提供的资产**：它的记录号由 `(WorkspaceKey, capability)` 确定地导出，同一对永远得到同一个号（[S-19](#s-19-使用权来路) 的 `carrier` 支），导法归实现。

- **能力标识与记录号并存，缺一不可**：同一个能力标识在出厂、组织、租户、工作区可以各有一份实现，持有必须指到「哪一份」——只有能力标识指不到；
  只有记录号，又丢了「这两份是不是同一个东西」。**一份记录恰实现一个能力标识**（[S-8](#s-8-资产记录)）。
- 交换表示按 `data.identity-values/v1` 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)：非空字符串，首字符与末字符都不属于那个空白码点集合，逐码点相等。
  **消费者不得解析它**：不得从中读出所有者、类别、创建次序，也不得按前缀分组。
- 它**不来自运行时对象**——运行实例身份只在一次运行内有效，不能充当持久身份。
- 词法（长度、字符集、生成方式）归实现。

### S-5 资产来源

**`AssetOrigin` 恰两个值：`official`、`customized`，闭合。**

- **产生这份记录时定死，此后不变。**没有一条写路径把 `customized` 改成 `official` 或反过来。
- **不得靠请求自报**（[来源词条](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-origin--资产来源--asset-origin)的注意）：`official` 只能由登记官方件的那条写路径产生（`capability.asset-governance`），不能由调用方在一次创作里声称。
- **工作区从承载目录提供的资产是 `customized`**（主线裁定 2026-09-23，待产品负责人确认；账本 S9-b）：所有者是挂上这份工作区的那个租户（[S-19](#s-19-使用权来路) 的 `carrier` 支）。

### S-6 所有者与作者分记

**`customized` 的记录必带 `owner` 与 `author`；`official` 的记录两者都缺席。**

| 情形（[PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)） | `owner` | `author` |
|---|---|---|
| 成员在组织范围创作 | `{ "kind": "organization", "organization": O }` | 那个租户 (O, 账号) |
| 成员在自己的租户范围创作 | `{ "kind": "tenant", "tenant": (O, 账号) }` | 同一个租户 |
| 人在自己的个人组织里创作 | 他的个人组织 | 该租户 |
| agent 产出 | 它运行所在范围的所有者 | 它运行所在的那个租户；**另记 `byAgent: true`**（[S-8](#s-8-资产记录)） |
| 首次复制落下的那份（[PF-003 §6.5](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)） | 目标组织 | (目标组织, 执行者) |
| official 资产 | **缺席** | **缺席** |

- **official 的两处缺席是合法缺席，不是空值**（`data.identity-values/v1` 的 [S-12](../../identity-values/v1/contract.md#s-12-缺席与空值都不是身份值) 与 [CS-2](../../identity-values/v1/contract.md#cs-2-作者与所有者分记)）：
  平台不是一个身份对象，**不得给它铸一个「平台租户」或「平台组织」**。读到它的消费者按「平台所有、没有作者租户」呈现，**不是**拒绝这次读，也**不是**补一个默认租户。
- `owner` 的判别成员是 `kind`，恰两个值 `organization`、`tenant`；未知取值是 `owner_kind_unknown`。
- **作者是历史事实**：[角色不进租户身份](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)，升降职不改署名；
  [租户身份无销毁路径](../../identity-values/v1/contract.md#s-6-tenantid-无生灭路径)，成员退出之后署名也不悬空。

### S-7 所有者至多变一次

1. **所有者是组织的，永不再变。**
2. **所有者是租户 (O, 账号) 的，至多变一次，且只能变成组织 O**——那是[从租户范围提升到组织范围](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识)，**不可逆**。
   没有一条写路径把组织所有改回租户所有、改成另一个组织、或改成另一个租户。
3. **作者永不变，提升也不改作者。**
4. **作者与所有者同属一个组织**：所有者是组织 O 时，作者的组织分量是 O；所有者是租户时，作者就是那个租户。
   这一条是 PF-001 §6.7 那张表的每一行的共同结论（规格层推导）；违反即 `malformed`。

**为什么要写成数据层的不变量**：[组织级的资产不能复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)，
一份已提升的资产若能退回租户级，就能被带出组织——第 2 条堵的就是这个口子。
**谁在写路径上守它**：`capability.asset-governance` 的提升操作；本契约只定它必须成立。

### S-8 资产记录

**`AssetDefinition` 是一份具体资产：**

| 成员 | 必填 | 含义 |
|---|---|---|
| `id` | 是 | 记录号（[S-4](#s-4-资产记录号)） |
| `capability` | 是 | 它实现的那个能力标识（[S-3](#s-3-能力标识与它的规范串)） |
| `origin` | 是 | 来源（[S-5](#s-5-资产来源)） |
| `owner`、`author` | customized 必有，official 必无 | [S-6](#s-6-所有者与作者分记) |
| `byAgent` | customized 必有，official 必无 | 这份记录是不是 agent 产出（[PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识)）：`true` 是 agent 创作的，`false` 是人创作的；**缺席不读作 `false`**，产生时定死、此后不变（主线裁定 2026-09-23，待产品负责人确认；账本 S9-b） |
| `lineage` | 否 | 复制血缘，只在复制产生的记录上有（[S-21](#s-21-复制血缘)） |
| `draft` | 否 | 草稿，一份 `AssetContent`，可反复改 |
| `versions` | 是 | 已发布的版本线，可以为空数组（[S-9](#s-9-版本线)） |

- **`capability` 在记录的一生中不变**（规格层推导）：持有以 `(holder, capability)` 为键且要求与所指记录一致（[S-18](#s-18-资产持有)），
  改了它，这份实现在所有持有它的地方替换的东西就悄悄换了。换一个能力标识就是另一份记录。
- **草稿与每一版正文的 `category` 都等于 `capability.category`。**
- **一份记录至少有草稿或一个已发布版本**——两样都没有的记录没有任何内容可言（规格层推导）。
- **属性声明不存在这里。**它们由正文按类别推出（[S-12](#s-12-属性声明由正文推出)）；实现若缓存一份，缓存不是权威，必须等于从它所缓存的那份内容推出的结果。
- **记录不记「哪一格在用哪一版」**——那是版本选用，是持有上的事（[S-18](#s-18-资产持有) 的 `versionSelection`）。
- 记录怎样被删除、删除之后怎样，不在本契约（`capability.asset-governance`；[领域对象条目](../../../../domain_objects/objects.md#ul-asset--资产)记为正文未述）。

### S-9 版本线

**`AssetVersion` 是一次发布定下的那份内容：`{ number, content, publishedAt, publishedBy? }`。**

- **每份记录一条自己的版本线**：`versions` 按数组次序的 `number` 恰是 1, 2, …, n——从 1 起、连续、无重复；
  **违反即 `version_sequence_broken`**（`number` 不是 ≥ 1 的整数则是 `malformed`）。
  复制过去的资产落在**目标侧自己的线上**，源侧的 v7 在那边可能是 v2（[PF-003 §6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)）。
- **已发布的版本整条不变**：`number`、`content`、`publishedAt`、`publishedBy` 一经写下再不改；版本线**只在末尾追加**。
  要改只能在它之上发一个新的（[PF-002 flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)）。
  **版本能不能被退役或撤下，产品正文未述**——[G-1](#八已知缺口)；在那之前没有任何路径删除一个已发布版本。
- `publishedBy` 是发布它的租户：**customized 的每一版必有，official 的每一版必无**（同 [S-6](#s-6-所有者与作者分记) 的理由）。
- `publishedAt` 是 `data.offer-expiry/v1` 的 `Instant`（[S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围)）。
- **草稿不是版本**：它还在变，复制与分享只认已发布的（[资产版本词条](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset-version--资产版本--asset-version)的别混 ②）。

### S-10 八类正文的外壳

**`AssetContent` 按 `category` 判别，恰八个形状：**

| `category` | 成员 | 正文的家 | 本版状态 |
|---|---|---|---|
| `tool` | `definition` | `data.tool-definition` v1 的 `ToolDefinition` | 已落（原 G-8） |
| `loop_extension` | `extension` | `data.loop-extension` v1 的 `LoopExtensionDefinition` | 已落（原 G-8） |
| `skill` | `body` | `data.skill-package` v1 的 `SkillPackage` | 已落（原 G-5） |
| `mcp` | `body` | `data.mcp-endpoint` v1 的 `McpEndpoint` | 已落（原 G-5） |
| `slash_command` | `body` | `data.slash-command` v1 的 `SlashCommandDefinition` | 已落（原 G-5） |
| `connector` | `body` | `data.connector` v1 的 `ConnectorDefinition` | 已落（原 G-7） |
| `agent_definition` | `body`（不透明） | PF-004 的契约 | [G-6](#八已知缺口) |
| `plugin` | `members` | 本契约（[S-11](#s-11-plugin-的成员)） | 部分：[G-9](#八已知缺口) |

- **正文的形状与表示层拒绝归各自的正文契约**：一份记录的正文不合它那份正文契约，拒绝值取那份契约闭合集合里的值、原名携带（[S-27](#s-27-表示层拒绝值)）；
  属性声明由那份契约的推出规则得出（[S-12](#s-12-属性声明由正文推出)）。
- **不透明的 `body`（本版只剩 `agent_definition`）在它的正文契约成立之前，任何一方都不得解释它**——不读其中的字段、不从中推属性项、不从中推名字。
  直接后果：**这一类资产推不出属性声明**（[S-12](#s-12-属性声明由正文推出)），消费者**停在缺口**，**不得把「推不出」当成「没有项」**。
- **身份只在 `capability`。**正文里若另有一个名字字段，它不是身份；它与 `capability.name` 不一致的记录是 `malformed`。
  正文契约最好不另立名字字段——这是一处[对齐义务](../verification.md#对齐义务)。
- 八个形状在 Schema 里内联在 `AssetContent` 的 `oneOf` 下，**本版不给壳单独的 `$defs` 名**；消费者引用 `AssetContent`。

### S-11 plugin 的成员

**plugin 的正文是 `{ category: "plugin", members: CapabilityId[] }`：它包的是哪些能力标识。**

- **成员是能力标识，不是记录**（[PF-002 §6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)）：组织换上自己的同标识实现之后，含它的 plugin 自动用上新的；plugin 作者不能假定零件不被替换。
- **成员的类别只能是 `skill`、`tool`、`slash_command`、`mcp`、`connector`、`loop_extension`**——[谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)那张表的 Plugin 一行。
  - 成员是 `plugin`：**`plugin_member_is_plugin`**。
  - 成员是 `agent_definition`：**`malformed`**（账本没有为它单列一个拒绝值）。
  - 两条都出自[「几个刻意不做的组合」](../../../../product/PF-002-assets-settings-and-permissions/design.md#几个刻意不做的组合)的原话（Plugin 嵌套 Plugin、Plugin 含 Agent Definition）；那张表自注**是 PM 按最小正确模型推的，不是产品负责人裁决**，将来加是加法。
- **成员不重复**（重复即 `malformed`）；**本版不设下限**——空 plugin 形状合法，它什么也不带来。
- **本版的 plugin 只有内含**：成员随 plugin 一并进来；「一份资产引用另一份资产」这种引用型组合归 skill、agent_definition 的正文，不归 plugin（对账块 A）。
- **成员不取得独立的顶层生命周期**：持有层面的后果（不能单独移除一个成员、随 plugin 一并进来）归 `capability.asset-governance` 与 `capability.asset-evaluation`。
- **本版表达不了的三样**（[G-9](#八已知缺口)）：成员的实现落在哪份记录、是否随 plugin 的版本一起定死；Rules 这类声明性成员；plugin 自己的属性项（启用哪些成员、成员的默认配置、谁可以启用它）。

### S-12 属性声明由正文推出

**`AttributeDeclaration` 是一份资产自带的一个属性项：`{ item, kind, category?, domain, default }`。**
资产定形状、持有它的各格配值、运行时求值——[三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值)里「定形状」的那一方，落成的就是这一组声明。

| 成员 | 含义 |
|---|---|
| `item` | 项名，非空；**在同一份资产内唯一**，逐码点比较 |
| `kind` | `setting` 或 `permission`，闭合 |
| `category` | **设置项必带、权限项必无**（[S-13](#s-13-设置项类别)） |
| `domain` | 设置：`{ kind: "open", schema }`——一份 JSON Schema，只有锁与不锁两态；权限：`{ kind: "enum", values }`——非空、各不相同，能收窄成子集（[PF-002 §5.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)） |
| `default` | 作者给的那一份。设置项：一个合 `schema` 的值；权限项：`values` 里的一个，必在。**`placement_identity` 类设置项可以不带**——缺席即这一项没有作者默认（见下） |

**它不存在资产记录上，由正文推出**（主线自决 A3）。每一份正文契约给出一条推出规则 `声明(正文) → AttributeDeclaration[]`，这条规则必须：

1. **是正文的确定函数**：同一份正文永远推出同一组声明，不依赖谁持有它、在哪一格、什么时候推、运行在哪个环境；
   **`mcp` 类另有一个显式输入**——那份持有的动作清单副本（`data.mcp-endpoint/v1` 的 S-15：逐动作项随对端此刻的动作而有）；给定正文与副本，推出仍是确定的（主线裁定 2026-09-23，待产品负责人确认；账本 S19-a）；
2. 推出的 `item` **互不相同**；
3. **不产出 `disabled` 与 `usableBy`**（[S-15](#s-15-disabled-是保留项名)、[S-36](#s-36-usableby-是保留项名)），也**不产出治理类的项**（[S-13](#s-13-设置项类别)）；
4. 每一条都合本条的形状。

**一份资产的全部属性项 = 推出的那组 ∪ 本契约保留的 `disabled` 那一条 ∪（类别是 `skill`、`mcp`、`slash_command` 时）本契约保留的 `usableBy` 那一条**（[S-36](#s-36-usableby-是保留项名)）。
正文契约不存在的类别（[S-10](#s-10-八类正文的外壳) 的 `agent_definition`）与 plugin 自己的项（[G-9](#八已知缺口)）**推不出来**——那是「判不出来」，不是「没有项」。

**`default` 的含义**：它是这一项在设置层序最外一格（出厂默认）上的值，不论这份资产是不是 official（[PF-002 §5.2 推论二](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论)）。
**「未配」只有缺席一种写法**（主线裁定 2026-09-23，待产品负责人确认；账本 S21-b）：没有自然出厂值的落点与身份类项（凭据、连接件的投递目标）**不带 `default`**；
各格都没为它配值时，求值得到的是**缺席**，读作「未配」——连不上、送不到，**不补一个值、不回退到别的来路**。这类项的取值域里**没有**一个表示「还没配」的特殊值。
**权限项多一句**（规格层推导，依据是 [PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) 的例子——「组织没有收窄、租户配成自动，生效是自动」）：
**权限的 `default` 是作者给的那一个取值，它不是出厂那一格的允许集合；出厂那一格对允许集合不收窄**，给出的就是整个 `values`。
各格的允许集合求交之后取哪一个值、`default` 不在交集里怎么办，归 `capability.asset-evaluation`。

**项的存在性由组装决定**——哪些资产被装上，才有哪些项；那是求值第 2、3 步的事，不是本契约的。

### S-13 设置项类别

**`SettingCategory` 恰四个值，闭合**——[设置项类别词条](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)：

| token | 类别 | 管什么 |
|---|---|---|
| `preference` | 偏好 | 做得合不合口味，改错顶多难用 |
| `binding` | 绑定 | 指向本系统内的另一份资产或一个位置 |
| `placement_identity` | 落点与身份 | 东西在哪执行、连到哪、送到哪、以谁的名义、用哪把凭据 |
| `governance` | 治理 | 管别的设置 |

- **类别决定这项值能从哪些格来**：`placement_identity` 不从工作区来（[S-20](#s-20-出厂格与工作区格的持有)；过滤在读入时，归 `capability.asset-evaluation`）。
- **本版治理类恰有一项：本契约保留的 `disabled`**（[S-15](#s-15-disabled-是保留项名)）。产品正文列的治理类只有禁用与 `immutable` 两样，而 `immutable` **不是一个项**，是配值与持有上的标记。
  **各类正文契约的推出规则不产出治理类的项**；真需要，先回 PF-002 定它管什么。

### S-14 属性配值

**`AttributeAssignment` 是某一格在一份持有上、为一个属性项配下的一个值：`{ item, value, immutable, since }`，四个成员都必填。**

- **`value`**：设置项是一个合该项取值域的 JSON 值；权限项是一个 `PermissionValue`——`{ allowed: string[] }`，
  是该项 `values` 的**子集**，元素各不相同，**可以为空**（[收窄为空集](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)不是禁用：装得上、每次调用被拒）；选定一个值就是收窄成单元素集。
- **`immutable`**：`true` 即「**必须**这样」，更具体的格改不了；`false` 即「**默认**这样」。**缺席不当作 `false`**，是 `malformed`。
  解锁（改回 `false`）[不回溯](../../../../product/PF-002-assets-settings-and-permissions/flows.md#32-一份持有上一个属性项的属性配值)：只影响此后的求值。
- **`since`**：这条配值**此刻的值**被写下的时刻（`Instant`，`data.offer-expiry/v1#S-22`）；只加锁、解锁不改值，它不动（主线裁定 2026-09-23，待产品负责人确认；账本 S11-G14：MCP 凭据要呈现「什么时候取的」）。
- **配值挂在持有上**，因此**配值没有自己的租户字段**——它的归属由宿主持有决定（`data.identity-values/v1` 的 [CS-1](../../identity-values/v1/contract.md#cs-1-资产持有的键与属性配值)）；
  持有被移除，它随之消失；持有被禁用，它原样保留。
- **写下它的那一刻它必须合当时的声明**——那是写入方（`capability.asset-governance`）的义务。
- **留存的配值是合法的**：资产出了新版本或被[重复复制全量覆盖](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)之后，某一项**不再被声明**，挂在持有上的那条配值**照样合法、照样留着**，只是那一项不存在、它不参与求值；
  **读到它的一方不得删它、不得改它、不得替它「修好」**。项还在、取值域却变了、旧值不再合的情形怎么求值，见 [G-12](#八已知缺口)。

### S-15 `disabled` 是保留项名

**[禁用](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)是每份持有上一项名为 `disabled` 的布尔设置。它不是一个独立成员，也不是另一类对象。**

1. **每一份资产的属性项都含它，声明由本契约写死**：
   `{ "item": "disabled", "kind": "setting", "category": "governance", "domain": { "kind": "open", "schema": { "type": "boolean" } }, "default": false }`。
   `default` 为 `false` 是规格层推导：禁用按析取合成，`false` 是析取的单位元；official 永不被禁，它的最外一格只能是 `false`。
2. **各类正文契约不得声明名为 `disabled` 的项**（[S-12](#s-12-属性声明由正文推出) 第 3 条）。
3. **配在它上面的值只能是布尔，且 `immutable` 恒为 `false`**（规格层推导）：析取已经让「真」不可被更具体的格撤销，
   而[「配假只是默认，下层照样可以配真」](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)——一个锁住的 `false` 没有含义，一个锁住的 `true` 与不锁的 `true` 是同一件事。**一个含义只留一种写法。**
4. **official 的持有上没有 `disabled` 这一项**：[official 不可被禁用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)，那是结构性的，任何格都没有这项权力；配一个 `false` 也没有意义。
5. **工作区格配的禁用只对工作区自己提供的那批资产生效**——那是求值规则（`capability.asset-evaluation`），承载清单的 `disabled` 列表是它的来路（[S-24](#s-24-工作区承载清单)）。

### S-36 `usableBy` 是保留项名

**[谁可以使用它](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)是 `skill`、`mcp`、`slash_command` 三类资产各有的一项权限，项名 `usableBy`，声明由本契约写死**
（主线裁定 2026-09-23，待产品负责人确认；账本 S18-c、A-G14）：

```json
{ "item": "usableBy", "kind": "permission", "domain": { "kind": "enum", "values": ["superAdministrator", "member", "self"] }, "default": "self" }
```

1. **取值域是 `data.identity-values/v1` 的 [`TenantRole`](../../identity-values/v1/contract.md#s-8-tenantrole) 的两个值再加 `self`**。`self` 在求值里指谁、怎样对上发起这次使用的那个租户身份，归 `capability.asset-evaluation`（它的 G-15）；本契约只定这个 token。
2. **只有这三类有它**：其余五类的属性项里没有 `usableBy`；那几类的正文契约若要「谁可以用」，先回 PF-002。
3. **各类正文契约不得声明名为 `usableBy` 的项**（[S-12](#s-12-属性声明由正文推出) 第 3 条）——同 `disabled` 的理由：一个意思只有一份声明，三类共用同一个项名与同一个取值域。
4. **`default` 是 `self`**：作者不另给；这是保留声明的一部分，不是某一类正文的推出结果。
5. **配在它上面的值是一个 `PermissionValue`**（[S-14](#s-14-属性配值)），与别的权限项一样收窄、一样可锁；**工作区格不配它**（[S-20](#s-20-出厂格与工作区格的持有)：工作区没有权限项的配值）。

### S-16 持有范围

**`HoldingScope` 是持有与配值的归属格，恰四格，按 `layer` 判别：**

| `layer` | 携带 | 是什么 |
|---|---|---|
| `factory` | **什么也不带** | 出厂默认——official 所在的那一格 |
| `organization` | 一个 `OrganizationId` | 组织 |
| `tenant` | 一个 `TenantId` | 租户 |
| `workspace` | 一个 `WorkspaceKey`（[S-17](#s-17-工作区键)） | 工作区 |

- **中间两格就是 `data.identity-values/v1` 的 [`ScopeLayerIdentity`](../../identity-values/v1/contract.md#s-11-scopelayeridentity) 的两个变体，原样引用**——本契约不改它、不给它加变体。
- **`HoldingScope` 不是作用域层身份。**它是[资产归属那条层序](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)（official < 组织 < 租户 < 工作区）的四格；
  那条层序 `ScopeLayerIdentity` [明说不表达](../../identity-values/v1/contract.md#s-11-scopelayeridentity)。
  **工作区与出厂两格都不是一重身份**：出厂那一格没有身份对象，本契约**不给它铸一个身份值**；工作区[不因此多一重身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#它不因此多一重身份)。
- **会话不是持有格。**设置层序最里面那一格（会话）的值由求值的输入另带，不是一份持有（`capability.asset-evaluation`）。
- **判别式不压平**（`data.identity-values/v1` 的 [S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)）：不写成几个可空字段加一句「谁不为空算谁」。
- **相等**：`layer` 相同且载荷相等——组织按 `OrganizationId`，租户按 `TenantId` 的两个分量，工作区按 `WorkspaceKey`（[S-17](#s-17-工作区键)），出厂格只有一个。

### S-17 工作区键

**`WorkspaceKey = { tenant: TenantId, directory: string }`：在一个租户之内指认一份[工作区](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-workspace--工作区--workspace)。**

- `tenant` 是持有这份工作区的租户；`directory` 是**承载目录的绝对路径的规范形式**。**规范化归实现**（本版单机），**相等按字面**：两个分量都相等才是同一份，`directory` 逐码点比较。
- **由此**：同一个目录被两个租户身份挂上是[两份工作区](../../../../product/PF-002-assets-settings-and-permissions/design.md#它挂在租户下)；同一个租户下同一个目录被两个会话挂上是同一份。
- **路径是指认，不是资格**（[PF-001 §6.5](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#路径是地址不是钥匙)；`data.identity-values/v1` 的 [S-22](../../identity-values/v1/contract.md#s-22-路径是地址不是钥匙)）：
  拿着这个键、或进得了那个目录，都**不产生任何资格**；能不能用这份工作区，看的是 `tenant` 那个分量与它此刻的成员资格效力。
- **路径不被回读成身份**（`data.identity-values/v1` 的 [S-34](../../identity-values/v1/contract.md#s-34-语义身份与实现地址分开)）：不得从 `directory` 推出它属于哪个租户，也不得因为两个目录相邻就认为它们同属一处。
- 本条闭合 `data.identity-values/v1` 的 [G-07](../../identity-values/v1/contract.md#十已知缺口) 的「目录那一半」——那一条写明键的形状归资产领域的契约。
  **目录之外的承载形态**本版不定义（PF-002 非目标）；**多台宿主时这个键缺一个宿主分量**，见[第四节](#四装配给与协议给)。

### S-18 资产持有

**`AssetHolding` 是一格与一份资产之间的[持有关系](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)：**

| 成员 | 必填 | 含义 |
|---|---|---|
| `holder` | 是 | 哪一格持有（[S-16](#s-16-持有范围)） |
| `capability` | 是 | 持有的是哪个能力标识 |
| `asset` | 是 | 这一格用的是哪一份实现（自己的、official 的、被分享来的） |
| `basis` | 是 | 资格从哪来（[S-19](#s-19-使用权来路)） |
| `versionSelection` | 是 | 这一格用那份实现的哪一版：`{ kind: "current" }` 跟随最新已发布版，`{ kind: "pinned", number }` 固定在第 `number` 版（`number` ≥ 1）（主线裁定 2026-09-23，待产品负责人确认；账本 A-G7） |
| `immutable` | 是 | 锁替换：**持有它的这一格以下不许再替换这个能力标识**，不问被锁的是 official 还是自定义（[PF-002 §5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)） |
| `assignments` | 是 | 这一格为它配下的值，可以为空数组（[S-14](#s-14-属性配值)） |
| `since` | 是 | 这份持有成立的时刻（`Instant`） |

1. **持有的键是 `(holder, capability)`；同一个键至多一份持有。**一格之内，一个能力标识只用一份实现。
   撞了标识而没有血缘的复制会让一个组织**拥有**两份同标识的记录（[PF-003 §6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘)），但**持有仍然只有一份**——用哪一份由这一格自己决定。
2. **`asset` 所指记录的 `capability` 等于本持有的 `capability`。**
3. **`assignments` 里 `item` 互不相同**；重复即 `assignment_item_duplicate`。禁用就是其中名为 `disabled` 的那一项（[S-15](#s-15-disabled-是保留项名)）。
4. **持有没有自己的标识**：键就是它的身份（`data.identity-values/v1` 的 [CS-1](../../identity-values/v1/contract.md#cs-1-资产持有的键与属性配值) 说的「持有的键是 (归属层身份, 资产)」，本契约把「资产」一侧定为能力标识）。
5. **状态流转**（加入、禁用、启用、移除，[PF-002 flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)）**只引不复述**：存在即持有；`disabled` 为真即「持有·禁用」；移除即这条持有与它的配值一起不在了。写路径归 `capability.asset-governance`。
6. **版本选用是持有上的一项，缺席不读作 `current`**（原 G-2）：
   - `current` 跟随所指记录**此刻**的最新已发布版；所指记录还没有已发布版时它指不到任何一版——那是求值上的缺席，归 `capability.asset-evaluation` 明确收场，**不回退到草稿**；
   - `pinned` 的 `number` 须是所指记录版本线上已有的那一版（版本线只增，写下时合法就一直合法）；不合即 `malformed`，Schema 管不到；
   - **`basis` 是 `shared` 或 `carrier` 时只能是 `current`**：分享给的是那份实现的当前版（账本 A-G7）；工作区提供的记录只有一版且随目录内容变（[S-19](#s-19-使用权来路) 的 `carrier` 支，规格层推导）。
   - **`pinned` 就是[「发现有新版本不静默替换已选用的版本」](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)的落点**：新版发布不改任何一份 `pinned` 持有；从 `pinned` 改到别的一版或改成 `current` 是一次写，归 `capability.asset-governance`。

### S-19 使用权来路

**`HoldingBasis` 恰五支，按 `kind` 判别，闭合**（主线裁定 2026-09-23，待产品负责人确认；账本 S9-b、A-G3、A-M13/M16）：

| `kind` | 含义 | 在哪几格 | 约束 |
|---|---|---|---|
| `owned` | 持有这一格就是这份资产的定义所有者——[自己拥有的定义可直接作为权利依据](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-definition-ownership--定义所有权--definition-ownership) | 组织、租户 | `asset` 的 `owner` 与 `holder` 对得上：组织格对 `{ kind: organization }` 且组织相同，租户格对 `{ kind: tenant }` 且租户相同 |
| `organization` | 资格来自本组织：这份实现归本组织所有，或外层某一格持有**同一份实现**，本格为了给它配值或锁它而持有 | 租户、工作区 | 租户格：**记录归它所在的组织所有**，或它所在组织的组织格持有同一个 `capability`、同一个 `asset`（经分享持有的那一份也算——主线裁定 2026-09-23，待产品负责人确认；账本 S11-G2：租户格持有本组织可用的，拥有的或被分享的）；工作区格：它所挂租户的租户格，或那个租户所在组织的组织格，持有同一个 `capability`、同一个 `asset` |
| `official` | 它是 official 资产，[不需要授权](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized) | 任一格 | **双向**：`official` 的记录只以这一支被持有；这一支只指 `official` 的记录 |
| `shared` | 经一段确认之后的[资产分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)获得使用权，带那段分享的 `SharingId` | 组织 | 分享是在组织之间；那段分享的被分享方、所指资产与状态归 `capability.asset-transfer` |
| `carrier` | 工作区从承载目录提供的资产（[S-24](#s-24-工作区承载清单)） | 工作区 | **双向**：工作区提供的那份记录只以这一支、只在提供它的那份工作区的那一格被持有；这一支只指那样的记录 |

- **配值只挂在本格自己的持有上**（账本 A-G3）：租户或工作区要给外层持有的资产配值或加锁，先以 `organization` 这一支持有它，再在这份持有上配。
  **资格只来自外层那份持有时，外层那份不在了，本格这份 `organization` 持有随之失效，它上面的配值一起不在**（[PF-002 flows §3.1](../../../../product/PF-002-assets-settings-and-permissions/flows.md#31-一个资产在某个范围里)）——被分享来的那一份就是这样；外层那份在而此刻不可用（分享不再生效），本格这份随之不可用（`capability.asset-transfer` 的判据）。记录归本组织所有的，不靠外层持有。连带收场归 `capability.asset-governance`，
  读到一份外层已不在的 `organization` 持有的一方，把它当作这一格没有持有，**不得把它读成 `owned`**。
- **`carrier` 那份记录**（账本 A-M13/M16）：
  - 所有者 `{ kind: tenant, tenant: WorkspaceKey.tenant }`，作者同一个租户，`origin` 是 `customized`，`byAgent` 是 `false`（它不是本系统里一次 agent 运行产出的）；
  - 记录号由 `(WorkspaceKey, capability)` 确定地导出（[S-4](#s-4-资产记录号)）；
  - 版本线恰一版，`number` 是 1，内容是最近一次读入时承载目录提供的那一份，`publishedBy` 是那个租户、`publishedAt` 是那次读入的时刻。**它不走发布**：目录内容变了，下一次读入得到的仍是第 1 版、内容不同——
    [S-9](#s-9-版本线) 的「已发布不变」**对它不成立**。两次读入是不是同一份内容，按内容指纹判（指纹的算法归实现）；**不得按「记录号＋版本号」缓存它的内容**。
  - 它由读入承载清单的一方产生（`capability.asset-evaluation`），不经 `capability.asset-governance` 的创作与发布。
- 出厂格只有 `official` 一支（[S-20](#s-20-出厂格与工作区格的持有)）。
- **消费者碰到一格与一支对不上**（例如工作区格上的 `owned`、租户格上的 `shared`），那是 `malformed`，**不挑一支充数**。

### S-20 出厂格与工作区格的持有

**出厂格**（规格层推导，依据是 [PF-002 §5.2 推论二](../../../../product/PF-002-assets-settings-and-permissions/design.md#由此得到两个推论)与 [flows §1.4](../../../../product/PF-002-assets-settings-and-permissions/flows.md#14-组织锁死一个自定义资产)）：

- `basis` 恒为 `official`；
- **`immutable` 为真，当且仅当这个能力标识是 [meta 能力](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)**：[meta 能力不可替换](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)，落成的就是出厂格上那一把锁；哪些是 meta 由部署的官方件清单给出，写它的是 [`capability.asset-governance` 的官方件登记](../../../capabilities/asset-governance/v1/contract.md#s-29-registerofficial-登记官方件)，读它的是 [`capability.asset-evaluation` 的截断](../../../capabilities/asset-evaluation/v1/contract.md#s-18-第一步之二再取最具体的一份锁在最外那一把处截断)（2026-09-24 整批对齐；原先恒为 `false` 与求值的前提相抵）。**其余官方件的出厂格持有恒为 `false`**——没有谁在出厂格上锁一份非 meta 的官方件，[不存在「把 official 锁住」这回事](../../../../product/PF-002-assets-settings-and-permissions/flows.md#14-组织锁死一个自定义资产)；要锁，是组织或租户在自己那一格锁自己对它的持有。**是不是 meta，Schema 判不出**：它只管出厂格的另两条；
- **`assignments` 恒为空**——出厂格的值就是声明里的 `default`（[S-12](#s-12-属性声明由正文推出)），不另配第二份。

**工作区格**（[PF-002 §5.2 设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)、[§5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)）：

- **`basis` 只有 `official`、`organization`、`carrier` 三支**（[S-19](#s-19-使用权来路)）；
- **`immutable` 恒为 `false`**，**每一条配值的 `immutable` 恒为 `false`**——`immutable` 不能从工作区来；
- **没有权限项的配值，没有落点与身份类设置项的配值**——它们在读入时就被滤掉（`capability.asset-evaluation`）；一份带着它们的工作区格持有是 `malformed`。
  工作区**自己带来的**资产，它的落点类设置随资产的正文与声明一起来，不是配值——这条限定挡的是改别人资产的落点。

### S-21 复制血缘

**`CopyLineage = { lineage, sourceVersion, importedBy, importedAt, imports }`，是目标侧这份记录的一项属性**（[复制血缘词条](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-copy-lineage--复制血缘--copy-lineage)，主线自决 A7）。

| 成员 | 含义 | 何时写 |
|---|---|---|
| `lineage` | 血缘号（[S-22](#s-22-血缘号与分享号)）——**这就是词条说的「首次复制时产生，此后不变」的那条对应** | 首次复制，此后永不改 |
| `sourceVersion` | 最近一次送入的是**源侧**第几版（≥ 1，与目标侧的版本号无关） | 首次复制；每次重复复制改写 |
| `importedBy` | 最近一次执行复制的人**在目标组织里的租户身份** | 同上 |
| `importedAt` | 最近一次送入的时刻 | 同上 |
| `imports` | 送入过几次：首次为 1，每次重复复制加 1 | 同上 |

1. **有没有血缘在记录产生时就定了**：复制产生的记录一出生就带着它；**已有的记录不会得到一条，也不会失去它**——撞标识无血缘的复制是**新增一份带血缘的新记录**，原来那份照旧没有（[PF-003 §6.8](../../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘)）。
2. **`lineage` 永不改。**另外四项只随一次**重复复制**改写，且与目标侧新增的那一版一起成立——提交边界归 `capability.asset-transfer`（规格层推导：词条说的「此后不变」是那条对应关系；「由某租户在某时送进来第几版」按最近一次读）。
3. **`importedBy` 是执行者在目标侧的租户身份，不是他在源侧的那个**——与[首次复制时作者记成 (目标组织, 执行者)](../../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制) 同一个理由：**它不暴露源组织**。因此 `importedBy` 的组织分量等于记录的所有者组织（违反即 `malformed`）。
4. **有血缘的记录是 `customized`、所有者是组织**——复制的目标是一个团队组织（[PF-003 §4 资产复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#资产复制)）。
5. **一个血缘号至多挂在一份现存的记录上**——「再复制一次该更新哪一份」必须只有一个答案。守它的是 `capability.asset-transfer`。
6. **不传递**：一份带血缘的记录若成了另一次复制的源，新目标得到的是一条新的血缘，不继承这一条。本版这条不会被走到——有血缘的记录归组织所有，而[组织级的资产不能复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)。
7. **目标组织从它看得到的只有「谁、何时、送进来第几版、送了几次」**，看不到源资产本身（[PF-003 §4 复制血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘)）。
8. **首次还是重复，只按血缘判，不按能力标识判**——那是 `capability.asset-transfer` 的规则；本契约给的是那个判据的把手。

### S-22 血缘号与分享号

**`LineageId`：系统在首次复制时发出的一条复制血缘的标识。**

- 不透明、部署内唯一、不回收不复用。
- **不可解引用回源**：它的值**不是**源记录号、源组织标识，也**不是**二者的任何可逆编码；**对目标组织的任何读面都不提供从它到源记录或源组织的解引用**。
  「这个血缘号对应哪个源」只由 `capability.asset-transfer` 自己保管、只用于它自己的首次／重复判定——理由是[目标组织不该拿到能推出源组织的引用](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘)（主线自决 A7）。

**`SharingId`：一段确认之后的资产分享的标识。**

- 由 `capability.asset-transfer` 在分享被确认时产生；**那段分享的含义、状态与生灭归那份契约**，本契约只定它的交换表示，供 `HoldingBasis` 引用。
- 不透明、部署内唯一、不回收不复用。

两者的交换表示都按 `data.identity-values/v1` 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文自定义；消费者不得解析其内容。

### S-23 凭据引用

**凭据类设置项的配值值是一个 `CredentialRef`——指向凭据本体的不透明引用，不是凭据本身。**本版的凭据类项就是 [MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)（主线自决 A4）；其他正文契约若有同性质的项，用同一个类型。

1. **不得为明文。**凭据本体不进任何一份配值、任何一份求值结果、任何一份呈现。
2. **声明怎么写**：正文契约把这类项声明为 `placement_identity` 类设置，取值域引用 `<本契约 Schema 的 $id>#/$defs/CredentialRef`。
   **凭据类项没有一个自然的出厂值**：声明不带 `default`（[S-12](#s-12-属性声明由正文推出)），取值域只有 `CredentialRef`；**「还没取」就是各格都没配、求值得到缺席**——[还没取就是连不上](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)（主线裁定 2026-09-23，待产品负责人确认；账本 S21-b：「未配」的唯一拼法是缺席）。
3. **不透明、部署内唯一、不回收不复用**（规格层推导）：一个被复用的引用会把新配的值解引用成别人的凭据。
4. **只在它被配上去的那一份持有上有效**：抄到另一份持有上**不产生取用资格**——MCP 凭据[一份持有一份，不跨租户身份共用](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)。解引用时由凭据本体的保管方按调用方的持有判定。
5. **引用本身也不作为呈现内容**（规格层推导）：产品正文说那个值[永不呈现，呈现得出的只有有没有、哪一层的、什么时候取的](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)；引用能换来凭据，把它呈现出去就等于绕开了那一句。
6. **经 OAuth 取得的那一份续期不算换值**：续期换的是保管方那边的本体，**这条配值不变**。
7. 凭据本体存在哪、怎么加密、谁来续、多台据点上的副本——**归提供者设计**。**组织格能不能持有一份 MCP 凭据**产品未决（[G-10](#八已知缺口)）；两种答案下本条的形状都不变。
8. [重复复制不动配值](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)，所以它不会被一次复制冲掉。

交换表示按 `data.identity-values/v1` 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文自定义。

### S-24 工作区承载清单

**承载目录里那份特定命名的文件是 `<承载目录>/.omne/workspace.json`：一份清单，显式列举，不扫目录、不猜文件**（主线自决 A8）。
产品只定了[「至少有一种特定命名的配置文件，挂上就自动加载」](../../../../product/PF-002-assets-settings-and-permissions/design.md#挂上之后它的内容在装配时自动进来)；本条定它的位置与形状。

**它是一份 UTF-8 编码的 JSON 文档，形状是 `WorkspaceCarrierManifest`：**

| 成员 | 必填 | 含义 |
|---|---|---|
| `format` | 是 | 恒为 `1` |
| `assets` | 是 | 目录内提供的资产包：`[{ capability, source }]`；`source` 是相对承载目录的路径 |
| `assignments` | 是 | 这一格的配值：`[{ capability, item, value, immutable? }]` |
| `disabled` | 是 | 这一格配的禁用：`CapabilityId[]` |

**本契约只定形状与下面几条表示层约束**；清单怎样读成这一格的持有与配值、滤掉什么、留下什么痕迹，**归 `capability.asset-evaluation`**。

1. **`format` 不是 `1` 即 `manifest_format_unsupported`**，而且**先于一切别的判定**——格式不认得，其余成员怎么读就无从谈起。`format` 缺席是 `malformed`。
2. **三个列表都必须在，可以为空。**缺一个不当作空列表（缺席不补）。
3. **`source` 必须留在承载目录之内**：是相对路径，分隔符只用 `/`；**不以 `/` 开头、不以盘符（如 `C:`）开头、没有 `..` 这一段、不含反斜杠**——违反任一条即 **`manifest_source_escapes`**。
   另外它须是规范写法：每一段非空、不以 `/` 结尾；不合的（如 `a//b`）是 `malformed`。
   **这只挡字面上的逃逸**：符号链接之类解析之后才越出目录的情形，由读入方在解析之后判（`capability.asset-evaluation` 与提供者）。
4. **`assets` 里同一个能力标识至多出现一次**（否则 `malformed`）；**`assignments` 里同一个 `(capability, item)` 至多出现一次**（否则 `assignment_item_duplicate`）；**`disabled` 不重复**（否则 `malformed`）。
5. **不在形状层拒的**：`assignments` 里写了 `immutable`、写了权限项、写了落点与身份类设置项；`disabled` 列了不是本目录提供的资产；`assignments` 指向本目录与各格都没有的能力标识。
   这些**形状合法**，读入时由读入方**滤掉并留下可见的痕迹**——**不静默丢，也不在这里拒**。`immutable` 允许出现，正是为了让读入方看得见它、滤得掉它。
6. **对象里成员名重复是 `malformed`**——不同的 JSON 解析器会取不同的那一个。
7. **文件缺席不是一份空清单。**承载目录里没有这份文件时怎么收，归读入方；本契约只说两者不是一回事。

## 四、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的保证**——单机由装配（同一存储、同一进程、同一台宿主）顺带给出的那些；
> 右列写分布式后**必须由协议重新兑现什么**，以及**做不到会怎样**。不在表里的条款在任何部署形态下一律成立，**不在表里不等于不适用**。
> **这张表是契约的一部分，不是流程笔记**：装配给的那些，演化到分布式时不会自动成立。

| 保证 | 单机由谁给 | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **四种不透明标识部署内唯一**（[S-4](#s-4-资产记录号)、[S-22](#s-22-血缘号与分享号)、[S-23](#s-23-凭据引用)） | 单一生成点 ＋ 存储的唯一约束 | 跨节点标识分配；唯一是承诺，不是「碰撞概率足够低」 | 两份记录同一个号：持有指到错的实现，**装出来的 agent 用了别人的工具，没有任何报错** |
| **一格一个能力标识至多一份持有**（[S-18](#s-18-资产持有)） | 存储在 `(holder, capability)` 上的唯一约束 | 同一个键的写入**跨节点串行化**，或以条件写兑现「已有即失败」 | 一格两份持有：求值取哪份取决于读到的次序，**同一输入两次装配结果不同** |
| **版本线只增、编号连续、已发布不变**（[S-9](#s-9-版本线)） | 同一存储里对一份记录的事务 | 对一份记录的追加**串行化**；副本与每一跳的重新序列化保持同一个值 | 两个 v3：「选用 v3」指不清；重复复制覆盖到错的那一版 |
| **所有者至多变一次**（[S-7](#s-7-所有者至多变一次)） | 同一存储、带前置条件的写 | 提升是一次带前置条件（此刻仍是租户所有）的写，跨节点不可交错 | 一份已提升的资产退回租户级，**被带出组织** |
| **血缘产生后不变、一个血缘号只在一份记录上**（[S-21](#s-21-复制血缘)） | 同一存储 | 首次与重复的判定和写入跨节点串行化 | 重复复制更新了错的那份，或两份记录都自称是某个源的复制 |
| **血缘号不可解引用回源**（[S-22](#s-22-血缘号与分享号)） | 同一进程里只有一处保管那份对应 | 每一个跨节点的读面、日志与导出都**不带**那份对应 | 目标组织从一个血缘号推出源组织——组织之间默认互不可见被绕开 |
| **凭据引用不是明文、只在它那份持有上有效**（[S-23](#s-23-凭据引用)） | 同一进程里的凭据保管方，解引用时就地判定持有 | 引用跨节点传递时**不得变成持票即可用的令牌**；解引用处按持有重判 | 一个抄走的引用在另一个租户那边换出了凭据 |
| **工作区键指认一个目录**（[S-17](#s-17-工作区键)） | 只有一台宿主：同一条路径只指一个目录 | 键里**缺一个宿主分量**；多台据点时须由协议补上（或出新版） | 两台机器上同一条路径被当成同一份工作区 |
| **表示层校验在每个接收边界重做**（[S-27](#s-27-表示层拒绝值)） | 写入前校验一次 | 每个接收边界各自重验，不信任上游「已校验过」 | 一份非法记录进了存储，此后每一次求值都要面对它 |

## 五、表示与边界校验

### S-25 规范表示

- **规范表示**：[`asset-model.schema.json`](asset-model.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/asset-model/v1/asset-model.schema.json`
- **定义项（25 项）**：`AssetCategory`、`CapabilityName`、`CapabilityId`、`AssetRecordId`、`AssetOrigin`、`AssetOwner`、`AssetContent`、`AssetVersion`、
  `LineageId`、`CopyLineage`、`AssetDefinition`、`AttributeKind`、`SettingCategory`、`AttributeDomain`、`AttributeDeclaration`、`PermissionValue`、
  `AttributeAssignment`、`WorkspaceKey`、`HoldingScope`、`SharingId`、`HoldingBasis`、`VersionSelection`、`AssetHolding`、`CredentialRef`、`WorkspaceCarrierManifest`。
- **全部值可序列化，没有进程内身份**：每一个值都能原样写出、读回、跨进程传递而相等；没有一个成员指向某个运行时对象。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。**根模式不约束任何文档**：本文件是共享定义的登记处。
- **成员名一律 camelCase**，枚举值一律 snake_case 字符串；判别成员：正文与能力标识用 `category`，所有者、取值域与使用权来路用 `kind`，持有范围用 `layer`。
- **外部引用**：`CapabilityId` 与类别取值集取自 `data.content-blocks/v1`；`TenantId`、`OrganizationId`、`ScopeLayerIdentity` 取自 `data.identity-values/v1`；`Instant` 取自 `data.offer-expiry/v1`；
  六类正文取自各自的正文契约（[S-10](#s-10-八类正文的外壳)）。`usableBy` 取值域里的两个角色是 `TenantRole` 的取值，写成字面量（它们在一个枚举取值域里，不是一个 `TenantRole` 值）。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-26 判别式与枚举闭合

`AssetCategory`（含 `AssetContent.category`）、`AssetOrigin`、`AssetOwner.kind`、`AttributeKind`、`SettingCategory`、`AttributeDomain.kind`、
`HoldingScope.layer`、`HoldingBasis.kind`、`VersionSelection.kind`、清单的 `format` 各是一个**闭合集合**，没有「其他」。

遇到未知取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。
每个未知值都可能是一种更宽的东西——一个未知的 `basis` 被当成 `owned`，一个未知的 `layer` 被当成租户——**静默降级就是放行**。

### S-27 表示层拒绝值

**一个值不合本契约的形状时，拒绝值恰为下面十个之一，集合闭合：**

| 拒绝值 | 什么时候 | 条款 |
|---|---|---|
| `manifest_format_unsupported` | 清单的 `format` 在，但不是 `1` | [S-24](#s-24-工作区承载清单) |
| `category_unknown` | 某个 `category`（能力标识的，或正文外壳的）出现了，但不是八个取值之一（大小写不同也算不是） | [S-1](#s-1-资产类别恰八类) |
| `origin_unknown` | 记录的 `origin` 出现了，但不是 `official`、`customized` 之一 | [S-5](#s-5-资产来源) |
| `owner_kind_unknown` | 所有者的 `kind` 出现了，但不是 `organization`、`tenant` 之一 | [S-6](#s-6-所有者与作者分记) |
| `name_invalid` | 能力标识的 `name` 是字符串，但违反 [S-2](#s-2-能力标识名的词法)：空串、含空白、含斜杠 | [S-2](#s-2-能力标识名的词法) |
| `plugin_member_is_plugin` | 某个 plugin 正文的 `members` 里有 `category` 为 `plugin` 的成员 | [S-11](#s-11-plugin-的成员) |
| `version_sequence_broken` | 版本的 `number` 都是 ≥ 1 的整数，但按数组次序不恰是 1, 2, …, n | [S-9](#s-9-版本线) |
| `assignment_item_duplicate` | 同一份持有的 `assignments` 里两条同 `item`；或清单的 `assignments` 里两条同 `(capability, item)` | [S-18](#s-18-资产持有)、[S-24](#s-24-工作区承载清单) |
| `manifest_source_escapes` | 清单里某个 `source` 以 `/` 或盘符开头、有 `..` 这一段、或含反斜杠 | [S-24](#s-24-工作区承载清单) |
| `malformed` | 其余一切不合形状：缺必填成员（含判别成员缺席）、多出成员、类型不对、未知的其他判别值、`immutable` 缺席、`disabled` 配了非布尔或配了锁、official 带所有者或作者、正文与能力标识的类别对不上、plugin 含 Agent Definition、`source` 不是规范写法、一格与使用权来路那一支对不上、`byAgent` 或 `versionSelection` 缺席、以及第三节里 Schema 管不到的跨成员与跨对象约束。**判据只有一条**：不合 Schema，或违反本契约第三节的约束；上面只是举例 | 各条 |

**一份输入里有多处违例时，拒绝值取其中优先级最高的那个**，次序固定：

```text
manifest_format_unsupported  >  category_unknown  >  origin_unknown  >  owner_kind_unknown  >  name_invalid
  >  plugin_member_is_plugin  >  version_sequence_broken  >  assignment_item_duplicate  >  manifest_source_escapes  >  malformed
```

这个次序让两个实现对同一份输入给出**同一个**拒绝值，与遍历次序无关；越靠前越说明这份值在根上不可读——
格式不认得、认不出是哪一类、认不出来源与所有者、身份拼错，就谈不上别的。
**`malformed` 是剩余项，不是「其他」**：它有确定的判据，只是不再细分。

**嵌在本契约值里的别家的值**（主线裁定 2026-09-23 要求本条吸收连接件的拒绝值，待产品负责人确认；账本 S21；下面是它的一般读法，规格层推导）：

- **一份正文不合它那份正文契约**（[S-10](#s-10-八类正文的外壳)），或**一条配值不合一个取值域指向某份正文契约定义项的设置项**（例如连接件的投递目标），
  或**一份记录的能力标识 `name` 不合它那一类正文契约对名字的收窄**（[S-2](#s-2-能力标识名的词法)「各类正文契约可以在这四条之内再收窄」；主线裁定 2026-09-24）——
  例如 `data.mcp-endpoint/v1` 的 S-26（接入点的 name 要拼得出条目名，不合即 `name_not_projectable`）、`data.slash-command/v1` 的命令名词法与保留区（`name_invalid`、`name_reserved`）：
  先按那份契约自己的次序得出它对这份值的**那一个**拒绝值 v。第三种情形交给那份契约判的，是**记录的 name 连同那一份正文**——名字的收窄有时要看正文（斜杠命令的保留区看绑定种类），所以名字随草稿与每一版各判一次，与正文的违例在那份契约的次序里一起排。
- **v 原名携带**，不改名、不另起同义值：它排在本契约次序里 `name_invalid` 之后、`plugin_member_is_plugin` 之前；**v 是 `malformed` 时，就是本契约的剩余项 `malformed`**。
  这样本契约的集合仍闭合：它是上表十个值并上六份正文契约各自闭合集合里的非 `malformed` 值。
  **同名的值同义**：`category_unknown`、`origin_unknown`、`name_invalid` 在正文契约里出现时，意思与本表同名那一行相同——一个类别判别、一个来源判别取了未知值，一个名字违反词法——报在本表那一行的位置。
- **一份输入里有多份这样的值违例**（草稿与各版本，plugin 的各个成员），按草稿、再按 `versions` 的数组次序、plugin 再按 `members` 的次序，取第一份 v 不是 `malformed` 的值；都是 `malformed` 就是 `malformed`。
- **连接件的三个值**：`channel_empty` 只从正文的来源标识来；`target_unknown` 只从投递目标那一项的配值来（主线裁定 S21-b：投递目标不进正文）；
  **`envelope_empty` 在本契约的值里不会出现**——入站信封不在正文里（`data.connector/v1`）。

拒绝值怎样落进各个操作自己的失败集合（写面、读入、流转），归那些契约；**它们引用本条的名字，不另起一套同义值**。

### S-28 表示层拒绝不是判定，也不修补

- **表示非法的输入在进入任何判定之前被拒绝。**这次拒绝**不表示**「这份资产不存在」「这一格没有资格」，也**不得被记成一次判定结果**
  ——与 `data.identity-values/v1` 的 S-33 是同一条规矩。
- **不修补、不降级、不尽力而为**：不补 `immutable`、不补缺的列表、不把大写的类别改成小写、不把带冒号的名字「清洗」一下、不丢掉坏的那一条配值留下其余的、
  不把未知的 `basis` 当成 `owned`。**修补等于替写入方做了一个它没做的决定。**
- **表示合法不表示任何资格**：Schema 校验通过只说明形状合规，不说明这一格有权持有它、有权配这个值、有权用这份工作区。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-1](#s-1-资产类别恰八类)、[S-2](#s-2-能力标识名的词法)、[S-3](#s-3-能力标识与它的规范串) | **管得到**：八类闭合、名字的四条词法、两分量 | 拒绝值的名字由 [S-27](#s-27-表示层拒绝值) 定；规范串不是一个形状 |
| [S-4](#s-4-资产记录号)、[S-22](#s-22-血缘号与分享号)、[S-23](#s-23-凭据引用) | 只管「非空、首尾不属于那个空白码点集合」 | 唯一、不回收、不可解引用、不是明文、只在一份持有上有效——全是行为约束，归存储、保管方与[第四节](#四装配给与协议给) |
| [S-5](#s-5-资产来源)、[S-6](#s-6-所有者与作者分记) | **管得到**：两值闭合；customized 必有所有者与作者、official 必无 | 「不得自报」「作者不变」归写路径 |
| [S-7](#s-7-所有者至多变一次) | 第 4 条管不到（跨成员比较组织） | 接收边界判 `malformed`；第 1～3 条是写路径的事 |
| [S-8](#s-8-资产记录) | **管得到**：正文类别与能力标识一致、草稿或版本至少一样、`byAgent` 按来源有无 | `capability` 一生不变归写路径 |
| [S-9](#s-9-版本线) | 管单个版本的形状、`publishedBy` 按来源有无 | **编号连续**管不到（`version_sequence_broken` 由接收边界判）；「已发布不变」归写路径 |
| [S-10](#s-10-八类正文的外壳)、[S-11](#s-11-plugin-的成员) | **管得到**：八个形状、六类正文按各自的正文 Schema、plugin 成员不是 plugin 或 Agent Definition、不重复 | 各正文契约自己的 Schema 之外那一步；正文里另立的名字与 `capability.name` 一致 |
| [S-12](#s-12-属性声明由正文推出)、[S-13](#s-13-设置项类别)、[S-36](#s-36-usableby-是保留项名) | 管声明的形状：设置必带类别且取值域开放、权限不带类别且取值域为枚举、`default` 只在落点与身份类设置上可缺、`disabled` 与 `usableBy` 的声明只能是那一份 | `default` 合取值域、同一资产内 `item` 唯一、推出规则确定、`usableBy` 只在三类上——管不到 |
| [S-14](#s-14-属性配值)、[S-15](#s-15-disabled-是保留项名) | 管三个成员必填、`disabled` 只能是布尔且不锁 | 值合那一项的取值域、权限值是 `values` 的子集——要看声明，管不到 |
| [S-16](#s-16-持有范围)、[S-17](#s-17-工作区键) | **管得到**：四格闭合、判别式与载荷对得上 | 「绝对、规范形式」与平台相关，由写下这个键的一方兑现 |
| [S-18](#s-18-资产持有)～[S-20](#s-20-出厂格与工作区格的持有) | 管出厂格只有 official、不配值；工作区格不锁、只有 official、organization、carrier 三支；`owned` 只在组织与租户格、`organization` 只在租户与工作区格、分享只在组织格、`carrier` 只在工作区格；`shared` 与 `carrier` 只选 `current`；official 持有上没有 `disabled` | **键唯一**、`asset` 与 `capability` 一致、`item` 不重复、`owned` 时所有者对得上、`organization` 时外层确有同一份持有、`carrier` 时记录是那份工作区提供的、`pinned` 的版本存在、工作区格没有权限与落点配值、出厂格的锁只在 meta 能力上——要看记录、整个存储或部署清单，管不到 |
| [S-21](#s-21-复制血缘) | 管成员形状、有血缘即 customized 且组织所有 | `lineage` 不变、`importedBy` 的组织等于所有者组织、一个血缘号只在一份记录上——管不到 |
| [S-24](#s-24-工作区承载清单) | 管 `format`、三个列表必填、`source` 的写法、`disabled` 不重复 | `assets` 与 `assignments` 的按键不重复；符号链接逃逸 |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**本契约的一个值 ⇒ 按 [S-27](#s-27-表示层拒绝值) 取拒绝值、按 [S-28](#s-28-表示层拒绝不是判定也不修补) 收场。
**Schema 通过也可能仍然非法**——上表「管不到」那一列里属于形状的那些，由接收边界的校验兑现。

## 六、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 能力标识的相等恰由两个分量决定；名字不含斜杠，规范串单射 | 不变量 | [PF-002 §4 身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) | Schema ＋ 各方的比较实现（[S-2](#s-2-能力标识名的词法)、[S-3](#s-3-能力标识与它的规范串)） | 两份同标识的实现互不替换；或一笔账的 `service` 串拆出两种能力标识 |
| P-2 | 一份记录恰实现一个能力标识，一生不变 | 不变量 | 主线自决 A1 · 规格层推导 | Schema（类别一致）＋ 写路径（[S-8](#s-8-资产记录)） | 某一格替换掉的东西在没人操作的情况下变了 |
| P-3 | official 没有所有者、没有作者租户、没有发布者租户 | 不变量 | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属) | Schema（[S-6](#s-6-所有者与作者分记)、[S-9](#s-9-版本线)） | 归属字段里出现一个没有自然人对应的「平台租户」 |
| P-4 | 所有者至多变一次、只从租户到它的组织；作者不变 | 安全 | [PF-001 §6.7](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#作者用租户身份标识) | 写路径（`capability.asset-governance`）＋ 接收边界（第 4 条）（[S-7](#s-7-所有者至多变一次)） | 一份组织资产回到租户手里后被复制出组织 |
| P-5 | 已发布版本不变；版本线只增、从 1 连续（工作区提供的记录除外：它恰一版、随目录内容变，[S-19](#s-19-使用权来路)） | 不变量 | [PF-002 flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本) | 写路径 ＋ 接收边界（[S-9](#s-9-版本线)） | 同一个版本号前后两次读到不同内容 |
| P-6 | plugin 不含 plugin，也不含 Agent Definition | 不变量 | [PF-002 §4 几个刻意不做的组合](../../../../product/PF-002-assets-settings-and-permissions/design.md#几个刻意不做的组合) | Schema（[S-11](#s-11-plugin-的成员)） | 内含成员的版本与使用权要跨层解释 |
| P-7 | 属性声明由正文确定地推出，不另存第二份 | 不变量 | [PF-002 §5.2 三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · 主线自决 A3 | 各类正文契约的推出规则（[S-12](#s-12-属性声明由正文推出)） | 设置页长出来的表单与资产正文对不上 |
| P-8 | 一格一个能力标识至多一份持有 | 不变量 | 起草简报裁定 · [PF-002 §5.5](../../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级) | 存储的唯一约束（[S-18](#s-18-资产持有)；[第四节](#四装配给与协议给)） | 同一输入两次装配出不同的 agent |
| P-9 | official 的持有上没有禁用；禁用只是一个布尔、不加锁 | 安全 | [PF-001 §4 来源](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized) · [PF-002 §6.4](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见) | Schema（[S-15](#s-15-disabled-是保留项名)） | 某一格把底座关掉，agent 组装不出来 |
| P-10 | 工作区格不加锁、出厂格只在 meta 能力上加锁；工作区格没有权限与落点身份类配值 | 安全 | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) | Schema（工作区格的锁）＋ 官方件登记按部署清单写（出厂格的锁）＋ 读入方的过滤与接收边界（配值）（[S-20](#s-20-出厂格与工作区格的持有)） | 一个仓库给自己提权，或锁死了用户自己会话级的设置 |
| P-11 | 血缘产生后不变且只在一份记录上；目标组织推不出源 | 安全 | [PF-003 §4 复制血缘](../../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘) | `capability.asset-transfer` ＋ 读面（[S-21](#s-21-复制血缘)、[S-22](#s-22-血缘号与分享号)） | 重复复制冲掉了对方自己做的同名组件；或目标组织看到了源组织 |
| P-12 | 凭据不进配值；引用不跨持有、不呈现 | 安全 | [PF-002 §4 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) | 写入方 ＋ 凭据保管方（[S-23](#s-23-凭据引用)） | 凭据出现在一份求值结果或一次呈现里 |
| P-13 | 清单里的来路字面上不出承载目录 | 安全 | 主线自决 A8 · [PF-002 §4 工作区不是目录](../../../../product/PF-002-assets-settings-and-permissions/design.md#工作区不是目录) | 接收边界（[S-24](#s-24-工作区承载清单)）；解析后的逃逸归读入方 | 一个仓库把宿主机上别处的文件（可能是另一个租户的工作区）读成自己提供的资产 |
| P-14 | 缺席不补、表示非法即拒、拒绝值唯一 | 安全 | SYS-SPEC | 每个接收边界（[S-27](#s-27-表示层拒绝值)、[S-28](#s-28-表示层拒绝不是判定也不修补)） | 两个实现对同一份坏输入报不同的拒绝值；或缺的 `immutable` 被当成 `false` 落进存储 |
| P-15 | 「谁可以使用它」在三类资产上恰一项、声明写死、正文契约不另声明 | 不变量 | 主线裁定 S18-c、A-G14 | 本契约的保留声明 ＋ 各正文契约的推出规则（[S-36](#s-36-usableby-是保留项名)） | 同一个「谁可以用」在技能与斜杠命令上取值域不同，或一类资产有两项 |
| P-16 | 新版发布不改任何一份 `pinned` 持有；分享来的与工作区提供的只跟当前 | 安全 | [PF-002 flows §3.3](../../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本) · 主线裁定 A-G7 | 写路径（`capability.asset-governance`）＋ Schema（[S-18](#s-18-资产持有)） | 某一格在没人操作的情况下换用了新版 |

**进展性质：本契约不拥有任何进展性质。**值不会「最终成为」别的值；一切与时间有关的推进（发布、提升、复制落地、分享失效）归三份能力契约。

**不建形式工件。**本契约没有状态转移；它的结构约束 Schema 与条款即可表达，求值链上的结构性质（团队资产不出那棵树、锁截断、禁用析取、工作区滤权）归 `capability.asset-evaluation` 的 Alloy 模型——那份模型消费本契约的值定义，本契约不另造一份平行模型。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。
每条给一个**正例**与一个**反例**，实例在 [`examples.md`](examples.md)。

#### S-29 名字里的斜杠

正例：`{"category": "mcp", "name": "github"}` 被接受，规范串是 `mcp/github`，拆回来是同一个能力标识；`{"category": "slash_command", "name": "omne-official:reload-skills"}` 被接受，规范串是 `slash_command/omne-official:reload-skills`，在第一个斜杠处拆开。
反例：`{"category": "mcp", "name": "gh/issues"}`——拒绝值 **`name_invalid`**，**不被改写成别的分隔符后接受**。
**这条反例是规范串单射的回归用例**：名字里一旦允许斜杠，`mcp/gh/issues` 就有两种拆法。

#### S-30 official 没有所有者与作者

正例：一份 `origin: "official"`、没有 `owner` 与 `author`、两个版本都没有 `publishedBy` 的 tool 记录被接受。
反例：同一份记录加上 `"author": {"organization": "org_platform", "account": "acc_platform"}`——`malformed`。
**反例的判据是「拒绝」，不是「照收、呈现时忽略」**：一个收下它的实现，就在存储里多了一个没有自然人对应的租户。

#### S-31 版本编号断了即拒

正例：`number` 依次为 1、2 的记录被接受。
反例：`number` 依次为 1、3——Schema 通过，**接收边界仍须拒绝**，拒绝值 **`version_sequence_broken`**；
依次为 2、1——同样 `version_sequence_broken`。**两个反例必须同跑**：只跑缺号的那一个，一个只查「最大号等于长度」的实现也会全过。

#### S-32 禁用只是一个布尔

正例：一份组织格持有带 `{"item": "disabled", "value": true, "immutable": false, "since": "2026-09-16T09:30:00Z"}` 被接受。
反例一：同一条配值写成 `"immutable": true`——`malformed`。反例二：`"value": "yes"`——`malformed`。
反例三：一份 `basis: {"kind": "official"}` 的持有带 `{"item": "disabled", "value": false, "immutable": false, "since": "2026-09-16T09:30:00Z"}`——`malformed`，**配 `false` 也不行**。

#### S-33 一格一个能力标识一份持有

正例：组织 O 持有 `skill:code-review` 用它自己那份记录；租户 (O, a) 持有同一个能力标识用租户自己那份——两个键，互不冲突。
反例：组织 O 再写入第二份 `holder` 相同、`capability` 相同、`asset` 不同的持有——**存储必须拒绝**，存储里只剩原来那一份。
**这一条 Schema 管不到**：两份持有各自形状都合法，冲突只在存储里看得见。

#### S-34 清单里的来路不出目录

正例：`"source": "skills/review"` 被接受。
反例：`"../shared/skills/review"`、`"/etc/skills"`、`"C:/skills"`、`"skills\\..\\..\\x"`——拒绝值一律 **`manifest_source_escapes`**。
另一个反例 `"skills//review"`——**`malformed`**（不是逃逸，是写法不规范）。

#### S-35 重复复制只改最近一次那四项

正例：一份带血缘的记录，重复复制前 `{lineage: "lin_40e9", sourceVersion: 2, imports: 1, …}`，之后 `{lineage: "lin_40e9", sourceVersion: 5, imports: 2, …}`，同时版本线多了一版。
反例：之后的 `lineage` 变成另一个号——**写入方必须拒绝**；或 `imports` 没有加 1 而 `sourceVersion` 变了——同样拒绝。
**必须观察存储里的那份记录**，只看复制操作返回成功会漏掉「血缘号被悄悄换掉」。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约；停在一个已登记的缺口不算走不通，如实记为「本版到此为止」。

#### CS-1 求值读一格的持有

`capability.asset-evaluation` 在**第 1 步按禁用滤、按替换层序取最具体的一份**时，依赖 [S-16](#s-16-持有范围)、[S-18](#s-18-资产持有)、[S-15](#s-15-disabled-是保留项名)、[S-20](#s-20-出厂格与工作区格的持有)，得到：
每一格每个能力标识恰一份持有；`disabled` 的值只在那一项上、只是布尔；锁替换在组织与租户格出现，出厂格只在 meta 能力上出现（[S-20](#s-20-出厂格与工作区格的持有)）。
第 3 步按持有的 `versionSelection` 取那一版的正文（[S-18](#s-18-资产持有)），由六份正文契约的推出规则得声明；**只有 `agent_definition` 停在 [G-6](#八已知缺口)**。

#### CS-2 创作、发布、提升

`capability.asset-governance` 在**成员在组织范围创作一份 skill、发布两版、之后退出组织**时，依赖 [S-6](#s-6-所有者与作者分记)、[S-7](#s-7-所有者至多变一次)、[S-9](#s-9-版本线)，得到：
记录的所有者是组织、作者是那个租户；两个版本编号 1、2，不可变，各带发布者；成员退出之后作者照旧指得回一个存在的租户身份。
agent 创作的那一份另记 `byAgent: true`（[S-8](#s-8-资产记录)）。

#### CS-3 首次复制与重复复制

`capability.asset-transfer` 在**一个人把团队 T1 里他租户级的 skill 复制到有共同上级的 T2、之后再复制一次**时，依赖 [S-21](#s-21-复制血缘)、[S-22](#s-22-血缘号与分享号)、[S-18](#s-18-资产持有)，得到：
首次在 T2 产生一份新记录，所有者 T2、作者与 `importedBy` 都是 (T2, 他)、带一个新血缘号、`imports` 为 1；重复复制按血缘号找到这一份，追加一版、改写最近一次那四项、`lineage` 不动；T2 为它配的值不动。
**若 T2 此前已持有一份同标识、无血缘的 skill**：新记录照样产生，但 T2 这一格已经有那个键——**新记录不会自动被持有**（[S-18](#s-18-资产持有) 第 1 条），用哪一份由 T2 决定。[PF-003 flows §3.1](../../../../product/PF-003-asset-transfer-and-sharing/flows.md#31-一份复制来的资产在目标组织里) 画的「首次复制 → 持有·v1」在这种情形下怎样呈现，归 `capability.asset-transfer`。

#### CS-4 分享确认之后

`capability.asset-transfer` 在**集团 G 把一个工具分享给子公司 C、C 确认**时，依赖 [S-19](#s-19-使用权来路)、[S-22](#s-22-血缘号与分享号)，得到：
C 的组织格上多一份 `basis: { kind: "shared", sharing: <分享号> }` 的持有，`asset` 指 G 的那份记录；所有者不动。
这份持有的 `versionSelection` 只能是 `{ kind: "current" }`——**C 追随 G 当前发布的那一版**（[S-18](#s-18-资产持有)）。

#### CS-5 读入一份承载清单

`capability.asset-evaluation` 在**会话挂上一份工作区、装配时读 `.omne/workspace.json`**时，依赖 [S-24](#s-24-工作区承载清单)、[S-17](#s-17-工作区键)、[S-20](#s-20-出厂格与工作区格的持有)，得到：
一份形状合法的清单；清单里写了 `immutable`、权限项、落点项的，形状照样合法，由它滤掉并留痕；`source` 字面上不出目录。
清单里每一份资产读成一份记录（所有者是挂上工作区的那个租户、记录号由 `(WorkspaceKey, capability)` 导出、恰一版）和这一格上一份 `basis: { kind: "carrier" }`、`versionSelection: { kind: "current" }` 的持有（[S-19](#s-19-使用权来路)）。

#### CS-6 一笔账记到一个 MCP 接入点

`data.call-accounts` 在**一次工具执行里记一笔 MCP 对端收的钱**时，依赖 [S-3](#s-3-能力标识与它的规范串)，得到：
`service` 写 `mcp/<接入点的 name>`，与保留值 `model_call` 永不相撞、能拆回唯一的能力标识。那份契约采用这条写法是[一项对齐](../verification.md#对齐义务)。

#### CS-7 租户领域的三条走查

`data.identity-values/v1` 的 [CS-1](../../identity-values/v1/contract.md#cs-1-资产持有的键与属性配值)、[CS-2](../../identity-values/v1/contract.md#cs-2-作者与所有者分记)、[CS-6](../../identity-values/v1/contract.md#cs-6-工作区宿主为租户) 在本契约上走通：
持有的键带判别式、组织级与租户级互不相等、配值没有自己的租户字段（[S-16](#s-16-持有范围)、[S-18](#s-18-资产持有)）；official 的作者合法缺席（[S-6](#s-6-所有者与作者分记)）；工作区键含 `TenantId` 分量、目录只是地址（[S-17](#s-17-工作区键)）。

#### CS-8 正文契约写推出规则

`data.tool-definition` 在**给工具定义写属性项的推出规则**时，依赖 [S-12](#s-12-属性声明由正文推出)、[S-13](#s-13-设置项类别)、[S-15](#s-15-disabled-是保留项名)、[S-23](#s-23-凭据引用)，得到：
它要交出一个确定函数，产出 `AttributeDeclaration[]`；目标环境是 `placement_identity`、转后台阈值与超时是 `preference`、执行权限是一个 `enum` 取值域的权限项；不产出 `disabled` 与 `usableBy`。
**它自己若另立一套设置项类别或声明的形状，就与本契约的 `SettingCategory`、`AttributeDeclaration` 是同一件事两个名字**——[对齐义务](../verification.md#对齐义务)。

## 七、缺席怎么收

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席各自是什么意思：

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| 判别成员（`category`、`kind`、`layer`、`origin`） | **拒绝**（`malformed`）——判别不出是哪一种 | [S-26](#s-26-判别式与枚举闭合) |
| customized 记录的 `owner` 或 `author` | **拒绝**（`malformed`），不补成创作者或当前租户 | [S-6](#s-6-所有者与作者分记) |
| official 记录的 `owner` 与 `author` | **合法**：平台不是身份对象。按「平台所有、没有作者租户」呈现，不补 | [S-6](#s-6-所有者与作者分记) |
| customized 版本的 `publishedBy` | **拒绝**（`malformed`） | [S-9](#s-9-版本线) |
| `lineage` | **合法**：这份记录不是复制来的 | [S-21](#s-21-复制血缘) |
| `draft` | **合法**：此刻没有在改的内容（但草稿与版本不能都没有） | [S-8](#s-8-资产记录) |
| 配值或持有的 `immutable` | **拒绝**（`malformed`），**从不当作 `false`** | [S-14](#s-14-属性配值)、[S-18](#s-18-资产持有) |
| 设置项声明的 `category` | **拒绝**（`malformed`）——资产声明每一项设置时必须标类别 | [S-12](#s-12-属性声明由正文推出) |
| 声明的 `default` | `placement_identity` 类设置项：**合法**，这一项没有作者默认，求值得到缺席即「未配」；其余一切：**拒绝**（`malformed`） | [S-12](#s-12-属性声明由正文推出) |
| 一格上某一项没有配值 | **合法**：这一格没意见，沿用外面一格的结果（求值的事） | [S-14](#s-14-属性配值) |
| 清单的三个列表之一 | **拒绝**（`malformed`），不当作空列表 | [S-24](#s-24-工作区承载清单) |
| 承载目录里没有清单文件 | **不是一份空清单**；怎么收归读入方 | [S-24](#s-24-工作区承载清单) |
| `agent_definition` 的属性声明 | **判不出来**，不是「没有项」；消费者停在缺口 | [S-10](#s-10-八类正文的外壳)、[S-12](#s-12-属性声明由正文推出) |
| customized 记录的 `byAgent` | **拒绝**（`malformed`），不当作 `false` | [S-8](#s-8-资产记录) |
| 持有的 `versionSelection` | **拒绝**（`malformed`），不当作 `current` | [S-18](#s-18-资产持有) |
| `current` 所指记录还没有已发布版 | **指不到任何一版**：求值上的缺席，归 `capability.asset-evaluation` 明确收场，不回退到草稿 | [S-18](#s-18-资产持有) |
| `organization` 持有的外层那份已不在 | **这份持有随之失效**，读作这一格没有持有，不读成 `owned` | [S-19](#s-19-使用权来路) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 八、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **已发布版本能不能被退役或撤下**：产品正文只说已发布不可变、再改形成新版本（[领域对象条目](../../../../domain_objects/objects.md#ul-asset-version--资产版本)记为「版本有没有终结，正文未述」） | 需要下架一个坏版本的写面；在那之前没有任何路径删除已发布版本 | **PF-002 的 owner** |
| **G-2** | **已闭合（2026-09-24 整批对齐）**：持有上加 `versionSelection`（`current` ｜ `pinned{number}`；分享来的只能 `current`）——主线裁定 2026-09-23，待产品负责人确认（账本 A-G7）；见 [S-18](#s-18-资产持有) | — | — |
| **G-3** | **已闭合（2026-09-24 整批对齐）**：`HoldingBasis` 五支——加 `organization`（外层持有同一份实现，本格为配值而持有）与 `carrier`（工作区从承载目录提供）；工作区提供的记录算 customized、归挂上工作区的那个租户、记录号由 `(WorkspaceKey, capability)` 导出、恰一版随目录内容——主线裁定 2026-09-23，待产品负责人确认（账本 S9-b、A-G3、A-M13/M16）；见 [S-19](#s-19-使用权来路) | — | — |
| **G-4** | **已闭合（2026-09-24 整批对齐）**：记录上加 `byAgent`（customized 必有、official 必无）——主线裁定 2026-09-23，待产品负责人确认（账本 S9-b）；见 [S-8](#s-8-资产记录)。版本上不另记：一份记录的作者与 `byAgent` 一生不变 | — | — |
| **G-5** | **已闭合（2026-09-24 整批对齐）**：`data.skill-package`、`data.mcp-endpoint`、`data.slash-command` 三份正文契约已成稿，`skill`、`mcp`、`slash_command` 的壳改为 `$ref` 它们（[S-10](#s-10-八类正文的外壳)）；本版目录未冻结，原地改 | — | — |
| **G-6** | **Agent Definition 的正文没有契约** | 同上；装配从一个 Agent Definition 展开 | **PF-004 的 owner** 与其契约 |
| **G-7** | **已闭合（2026-09-24 整批对齐）**：`data.connector` 已成稿，`connector` 的壳改为 `$ref` 它的 `ConnectorDefinition`（[S-10](#s-10-八类正文的外壳)）；鉴权绑定与投递目标是持有上的配值（主线裁定 S21-a、S21-b） | — | — |
| **G-8** | **已闭合（2026-09-24 整批对齐）**：`tool` 与 `loop_extension` 的壳改为 `$ref` `data.tool-definition` v1 与 `data.loop-extension` v1（[S-10](#s-10-八类正文的外壳)）；那两份反过来消费本契约，壳的 `$ref` 不登为本契约的依赖（见头部依赖表下的说明） | — | — |
| **G-9** | **plugin 的正文不完整**：成员的实现落在哪份记录、是否随 plugin 的版本一起定死（[PF-002 §4 Plugin](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin) 说成员随 plugin 的版本治理，[§6.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识) 又说引用指向能力标识）；Rules 这类声明性成员无处可放；plugin 自己的属性项（启用哪些成员、成员的默认配置、谁可以启用它）没有推出规则 | 持有一个 plugin 时成员怎样一并进来；plugin 的设置页 | **PF-002 的 owner**（成员与 Rules 的产品含义）；随后由主线定形状 |
| **G-10** | **组织格能不能持有一份 MCP 凭据**：[PF-002 §9](../../../../product/PF-002-assets-settings-and-permissions/design.md#九未决项) 唯一未决 | 组织格上 MCP 凭据配值的写面；**本契约的形状两种答案下都不变**（[S-23](#s-23-凭据引用)） | **产品负责人** |
| **G-11** | **已闭合（2026-09-24 整批对齐）**：名字词法改为禁斜杠、许冒号（主线裁定 S9-c）；保留前缀的拼法 `omne-official:` 由 `data.slash-command/v1` 的 S-3 定，合 [S-2](#s-2-能力标识名的词法) | — | — |
| **G-12** | **项还在、取值域却变了的留存配值怎么求值**：资产出新版或被重复复制之后，某一项仍被声明但取值域变了，旧配值不再合（[PF-003 §6.7](../../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动) 只答了项被删、项新增、项不变三种） | 求值第 4 步；设置页怎样呈现一条失效的值 | **`capability.asset-evaluation`** 定求值；是否要告知配值方归 **PF-002 的 owner** |
| **G-13** | **主线的自决与裁定没有设计链内的依据**：A1（记录号）、A3（声明由正文推出）、A4（凭据引用）、A7（血缘号）、A8（承载清单）是主线自决；S9-b（五支来路、`byAgent`）、S9-c（禁斜杠许冒号）、A-G3、A-G7、A-G14、S18-c（`usableBy`）、S21（吸收连接件的拒绝值）是主线 2026-09-23 的裁定、**待产品负责人确认**。都还没落进任何决定或产品正文，[设计依据](#设计依据)无处可链 | 本契约接受时这些条款（S-2、S-3、S-4、S-8、S-18、S-19、S-27、S-36）的可追溯性 | **主线**：落一份决定记录；**产品负责人**确认 2026-09-23 那几项 |

## 九、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **求值**：四步怎么走、三条层序怎么合成、工作区清单怎样读成持有、权限的允许集合求出来之后取哪一个值——归 `capability.asset-evaluation`。
- **写操作**：创作、发布、提升、删除、登记官方件、加入与移除持有、禁用与启用、配值与加锁，以及谁能做哪一样——归 `capability.asset-governance`。
- **流转**：复制通知、分享邀请、确认之后的分享、首次与重复的判定、隶属关系解除之后分享失效——归 `capability.asset-transfer`。
- **八类正文的内部**——归各自的正文契约（[S-10](#s-10-八类正文的外壳)）。
- **注册表**、**装配**、**设置页**的形状与行为。
- **凭据本体**的存储、加密、续期与多据点副本——归提供者设计（[S-23](#s-23-凭据引用)）。
- **路径规范化的算法**与**符号链接逃逸的判定**——归实现与读入方（[S-17](#s-17-工作区键)、[S-24](#s-24-工作区承载清单)）。
- **四种不透明标识的词法**：字符集、长度上限、生成方式——归实现。
- **体积上限**：记录、版本数、配值与清单的长度上限本版不设；若将来要设，它是一个具名的政策参数，由消费者的契约定。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`asset-model.schema.json`](asset-model.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`**：理由在[性质一节](#性质)末尾——没有状态转移，结构约束 Schema 与条款即可，求值链上的结构性质归 `capability.asset-evaluation` 的模型。
**这不是把义务省掉**：本契约触发的义务是 Schema 正反实例校验、接收边界的校验、规范场景与静态检查，逐条登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#八已知缺口)里 G-6、G-9 任一项被裁决，都会改变本契约的表示，**出 v2**。
G-2、G-3、G-4、G-5、G-7、G-8、G-11 在本版接受之前闭合，原地改（2026-09-24 整批对齐，影响记在[验证入口](../verification.md#变化的影响)）。**推荐版本不自动升级消费者。**
