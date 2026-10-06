# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.asset-model` v2 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> 起草时只做了手核；**整批对齐（2026-09-24）跑过一次 V-1 的本地自检**（只判 Schema 通过与否，见[结果与反例](#结果与反例)）——**那次结果已作废、待重跑**：其后 Schema 又改过两次（PF-002 rev 20 的治理类、修订第二轮 R2-10），每次只核了改动的那几行；
> 七条规范场景、八条消费者核对场景、六条静态检查**一条都未执行**——文件存在不代替结果。
> 唯一跑过的是 `make design-check`：它解析了本包 Schema 的 JSON、核对了 `$id` 与全部 `$ref`／JSON Pointer 指得到、核对了 Markdown 链接与锚点——**它不校验任何实例**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～14 节逐行（含变体行，按「在 X 上改动 Y」构造）过 Schema，比对「Schema」一列 | Draft 2020-12 校验器（能按 `$id` 解析到 `data.identity-values/v1`、`data.offer-expiry/v1`、`data.content-blocks/v2` 与六份正文契约的 Schema）＋ 按节绑定的 `$defs` | [S-1](v2/contract.md#s-1-资产类别恰八类)～[S-24](v2/contract.md#s-24-工作区承载清单) 的**形状那一面** | **作废，待重跑**（2026-09-24 独立评审第一轮改判）：整批对齐那次本地自检（200 处 0 不符）对应的是 PF-002 rev 20 与修订第二轮之前的 Schema；此后两次改 Schema 各只核了改动的几行（见[变化的影响](#变化的影响)），**整体没有重跑**，那次结果不再支持当前的 Schema。拒绝值是哪一个从未机检 |
| V-2 | **拒绝值的具名与优先级**：对每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 13 节十四行专验优先级 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-27](v2/contract.md#s-27-表示层拒绝值)、[S-28](v2/contract.md#s-28-表示层拒绝不是判定也不修补) | **未开始。**需要一个实现了接收边界校验的提供者。**只验 Schema 通过与否不够**——两个实现可以都拒绝、却报不同的名字 |
| V-3 | **Schema 管不到的约束**：[`examples.md` 第 14 节](v2/examples.md#14-schema-挡不住但同样非法的)逐行——版本编号连续、`item` 不重复、作者与所有者同属一个组织、`importedBy` 在目标侧、持有与记录一致、`owned`／`official` 与记录对得上、工作区格没有权限配值、声明的 `default` 合取值域 | 接收边界的校验 ＋ 第 14 节 | [S-7](v2/contract.md#s-7-所有者至多变一次)、[S-9](v2/contract.md#s-9-版本线)、[S-10](v2/contract.md#s-10-八类正文的外壳)、[S-12](v2/contract.md#s-12-属性声明由正文推出)、[S-14](v2/contract.md#s-14-属性配值)、[S-18](v2/contract.md#s-18-资产持有)～[S-21](v2/contract.md#s-21-复制血缘)、[S-24](v2/contract.md#s-24-工作区承载清单) | **未开始。**看记录的那几条落在 `capability.asset-governance` 的写入边界，看整个存储的那几条（键唯一、血缘号唯一）落在存储 |
| V-4 | **规范场景** [S-29](v2/contract.md#s-29-名字里的斜杠)～[S-35](v2/contract.md#s-35-重复复制只改最近一次那四项)：每条一个正例一个反例 | 规范场景演练：真实接收边界、真实存储 | [S-2](v2/contract.md#s-2-能力标识名的词法)、[S-6](v2/contract.md#s-6-所有者与作者分记)、[S-9](v2/contract.md#s-9-版本线)、[S-15](v2/contract.md#s-15-disabled-是保留项名)、[S-18](v2/contract.md#s-18-资产持有)、[S-21](v2/contract.md#s-21-复制血缘)、[S-24](v2/contract.md#s-24-工作区承载清单) | **未执行。**S-31 的两个反例**必须同跑**；S-33 与 S-35 **必须观察存储里的那份记录**，只看操作返回会漏掉「写了第二份」「血缘号被换掉」 |
| V-5 | **消费者路径走查**（[CS-1～CS-8](v2/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | [S-3](v2/contract.md#s-3-能力标识与它的规范串)、[S-6](v2/contract.md#s-6-所有者与作者分记)、[S-7](v2/contract.md#s-7-所有者至多变一次)、[S-9](v2/contract.md#s-9-版本线)、[S-12](v2/contract.md#s-12-属性声明由正文推出)～[S-24](v2/contract.md#s-24-工作区承载清单) | **未开始。**走查**不需要提供者**，现在就做得了；**CS-1 停在 G-6（`agent_definition`）、G-9（plugin）与 G-15（connector 两个「谁能用」）**，`loop_extension` 那一类按 `data.loop-extension/v2#S-40` 走——停在缺口不算走不通，如实记为「本版到此为止」 |
| V-6 | **跨进程**：[第四节](v2/contract.md#四装配给与协议给)右列九行逐行演练 | 规范场景演练 | [S-4](v2/contract.md#s-4-资产记录号)、[S-7](v2/contract.md#s-7-所有者至多变一次)、[S-9](v2/contract.md#s-9-版本线)、[S-17](v2/contract.md#s-17-工作区键)、[S-18](v2/contract.md#s-18-资产持有)、[S-21](v2/contract.md#s-21-复制血缘)～[S-23](v2/contract.md#s-23-凭据引用)、[S-27](v2/contract.md#s-27-表示层拒绝值) | **未开始，且本版装配下无法演练**——单机同进程不构成接收边界。**这不是免除**：跨进程演化启动时必须补做，登记在[变化的影响](#变化的影响) |
| V-7 | **静态检查**（[SC-1～SC-6](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 存储的写路径里不存在修改已发布版本的操作，也不存在从版本线中间删除一项的操作 | [S-9](v2/contract.md#s-9-版本线) | 未开始 |
| SC-2 | 改所有者的写路径只有一条（租户 → 该租户的组织），且带「此刻仍是租户所有」的前置；不存在改 `author`、`origin`、`capability` 的写路径 | [S-5](v2/contract.md#s-5-资产来源)、[S-7](v2/contract.md#s-7-所有者至多变一次)、[S-8](v2/contract.md#s-8-资产记录) | 未开始 |
| SC-3 | 持有的存储在 `(holder, capability)` 上有唯一约束；它的写入不绕过这个约束 | [S-18](v2/contract.md#s-18-资产持有) | 未开始 |
| SC-4 | 不存在改写 `lineage.lineage` 的路径；给一份已有记录添上或去掉 `lineage` 的路径不存在 | [S-21](v2/contract.md#s-21-复制血缘) | 未开始 |
| SC-5 | 面向目标组织的读面、日志与导出里不出现从血缘号到源记录号或源组织的映射；凭据配值的写入只接受凭据保管方发出的引用，任何呈现里不出现 `CredentialRef` 的值 | [S-22](v2/contract.md#s-22-血缘号与分享号)、[S-23](v2/contract.md#s-23-凭据引用) | 未开始 |
| SC-6 | 各类正文契约的推出规则不读正文以外的任何输入（持有方、所在格、时间、环境），不产出 `disabled`、`usableBy`，治理类的项只在产品点名的那几项上产出（本版只有连接件的触发会话的默认运行模式，且不带 `default`）；`agent_definition` 的 `body` 在它的正文契约成立之前没有读取点 | [S-10](v2/contract.md#s-10-八类正文的外壳)、[S-12](v2/contract.md#s-12-属性声明由正文推出)、[S-13](v2/contract.md#s-13-设置项类别)、[S-15](v2/contract.md#s-15-disabled-是保留项名)、[S-36](v2/contract.md#s-36-usableby-是保留项名) | 未开始 |

## 对齐义务

**这些是本契约与同批或上游契约之间要在整批对齐时处理的事**，不是本契约自己的证据义务；列在这里，免得散在各处被漏掉。

| 对齐什么 | 涉及 | 现状 |
|---|---|---|
| 六类正文的 `$ref` | `data.tool-definition`、`data.loop-extension`、`data.skill-package`、`data.mcp-endpoint`、`data.slash-command`、`data.connector`（均 v1） | **已落**（2026-09-24 整批对齐）：壳改为 `$ref`；**不登为本契约的 catalog 依赖**——那几份反过来消费本契约，方向是它们 → 本契约 |
| `CapabilityId.name` 的词法 | `data.content-blocks` v2（它的 G-5 把词法留给本契约） | 本契约在 `$ref` 之上收紧；content-blocks 自己用到的 `CapabilityId` 与 `origin.command`／`skill` 仍只到「非空」，**同一个值在两份契约里一收一拒**，那边须在下一版采用 [S-2](v2/contract.md#s-2-能力标识名的词法)；那边的说明已随本轮改为「禁 `/`、许 `:`」 |
| 同一违例两个名字 | `data.content-blocks` v2 | 未知类别的能力标识，在那边是 `malformed`，在本契约是 `category_unknown`；各自的失败集合闭合，不算冲突，但读者要知道 |
| `CostItem.service` 写 MCP 接入点 | `data.call-accounts` v2（它的 G-4） | 本契约给出规范串 `<category>/<name>`（[S-3](v2/contract.md#s-3-能力标识与它的规范串)）；那边已采用 |
| 工具定义里的设置项与权限项 | `data.tool-definition` v2 | 若那边另立 `SettingCategory`、设置项声明的形状或权限项的形状，就与本契约的 [`SettingCategory`](v2/contract.md#s-13-设置项类别)、[`AttributeDeclaration`](v2/contract.md#s-12-属性声明由正文推出) 是同一件事两个名字；那边应给出推出规则、引用本契约的名字 |
| 正文里另立的名字字段 | `data.tool-definition` v2、`data.loop-extension` v2、`data.skill-package` v2（清单头的 `name`） | 身份只在 `AssetDefinition.capability`（[S-10](v2/contract.md#s-10-八类正文的外壳)）；正文里的名字字段若保留，须与 `capability.name` 一致 |
| reload 一族的命令名 | `data.slash-command` v2、注册表 | 冒号允许、斜杠禁止（[S-29](v2/contract.md#s-29-名字里的斜杠)）；保留前缀 `omne-official:` 合本契约词法 |
| 「谁可以用」那一项 | 全部六份正文契约；`capability.asset-evaluation`（第 1 步的滤、`values` 里恒有的那一条） | 本契约保留 `usableBy`（[S-36](v2/contract.md#s-36-usableby-是保留项名)），**八类都有**（D-060 §二 S-U24-7，原 G-14 关闭）；正文契约的推出规则都不声明它；Loop Extension 的「谁能挂」即此项。`capability.asset-evaluation` 已按八类写（它的 S-25、S-39 与实例开头）。**connector 的 `install` 与它怎样对应未定**，登为 [G-15](v2/contract.md#八已知缺口)（owner 主线 ＋ `data.connector`，专项讨论后 connector 收口） |
| 连接件的拒绝值 | `data.connector` v2 | 本契约 [S-27](v2/contract.md#s-27-表示层拒绝值) 原名携带正文契约的值；`envelope_empty` 不会出现在本契约的值里 |
| 正文契约对能力标识 name 的收窄 | `data.mcp-endpoint` v2（S-26，`name_not_projectable`）、`data.slash-command` v2（命令名词法与保留区，`name_invalid`、`name_reserved`） | **已落**（主线裁定 2026-09-24）：[S-27](v2/contract.md#s-27-表示层拒绝值) 加第三种情形，名字连同那一份正文交给那份契约判、原名携带；**写面的失败集合**要引用这几个名字，归 `capability.asset-governance`（另有人在改） |
| `usableBy` 的词条链接 | 统一语言 | **已落**（2026-09-24 独立评审第一轮）：token 表那一行链到 [UL-usable-by](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-usable-by--谁可以使用它--usable-by) |
| 「推出规则」的覆盖 | `data.loop-extension` v2 | 那份契约同批新增 [S-40 属性项的推出规则](../loop-extension/v2/contract.md#s-40-属性项的推出规则)（`position`、`dimension` 绑定类，`power` 权限，其余不出项）；本契约 CS-1 已链到它 |

## 结果与反例

### 本地自检：Schema 正反实例（整批对齐，2026-09-24）

**工具**：Draft 2020-12 校验器（`jsonschema`，按仓库 `uv.lock`），以对齐后整棵设计树的全部 Schema 建 registry；脚本在任务暂存区，不入库。
**输入**：[`examples.md`](v2/examples.md) 第 1～14 节——表格里的内联实例按节绑定的 `$defs`；编号的 JSON 块；「在 X 上改动 Y」的变体行按行文构造（第 12 节的变体行以 12.1 为基准）。
第 14 节只取能构造成实例的那些行，比对「Schema」一列（它们都应通过）；其余是存储、写入方或推出规则的事，不是实例。

| 预期通过 | 预期拒绝 | 不符 |
|---|---|---|
| 66 | 134 | **0** |

**只判通过与拒绝**：给出的是不是「拒绝值」一列那个值，校验器不回答。六类正文按对齐后各正文契约的 Schema 校验——那几份契约在本轮后续又各改了一次（斜杠命令去掉 `name`、MCP 去掉 `use`、连接件正文收窄为 `{ source? }`），每改一份都重跑了本项；上表是最后一次（配值加 `since` 之后，第 8 节加了缺 `since` 的一行；出厂格允许带锁之后，第 10 节「10.1 改 `immutable` 为真」一行由拒转收）。
**这不是 V-2 以后任何一条义务的证据。**

### 尚无的记录

V-2～V-7 **一条执行记录也没有**。手核只保证 `examples.md` 的实例与它们的标注在起草者眼里不互相矛盾，
**不支持**任何一条规范场景、任何一条跨成员约束的实现、任何一条消费者走查。

首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；原始产物归 record/evidence/。
记录时分开陈述：Schema 校验的结果、接收边界的拒绝值、规范场景演练的结果、真实组合的符合性。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约的性质一节](v2/contract.md#性质)末尾：
没有状态转移；结构约束 Schema 与条款即可表达；求值链上的结构性质归 `capability.asset-evaluation` 的 Alloy 模型，那份模型消费本契约的值定义。
**这不是把义务省掉**：它们被改写成了 V-1～V-7。本契约**不拥有任何进展性质**；`formal-tasks.json` 里没有、也不应有本契约的任务——**「未运行」如实登记**。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-002 rev 16、PF-001 rev 16、PF-003 rev 4、PF-015 rev 11 上（PF-004 rev 10 只作指路）。
  **依赖 `data.identity-values` v1**（已接受、已冻结）的九条与 **`data.offer-expiry` v1**（已接受、已冻结）的 `S-22`——那两版不可原地改，**这些引用的目标不会漂移**；它们若出 v2，本契约不自动跟随。
  **依赖 `data.content-blocks` v2**（`candidate`，未冻结）的 `S-20`：那边若在评审中改 `CapabilityId` 的形状或类别集合，本契约的 `CapabilityId`、`AssetCategory` 随之变，须同轮复核 V-1。
  **三份同批能力契约引用本契约的 `$defs` 名**：本契约在评审中若改名或改形状，须同轮通知它们。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单（账本 S9-b、S9-c、A-G3、A-G7、A-G14、A-M13/M16、S18-c、S21），可追溯性挂 [G-13](v2/contract.md#八已知缺口)。
  - **名字词法翻转**：[S-2](v2/contract.md#s-2-能力标识名的词法) 禁斜杠、许冒号，[S-3](v2/contract.md#s-3-能力标识与它的规范串) 规范串改 `<category>/<name>`；Schema `CapabilityName` 的 pattern 随之改；[S-29](v2/contract.md#s-29-名字里的斜杠) 改名、正反例互换。**表示改变**：带冒号的名字从拒到收，带斜杠的从收到拒。消费者：`data.content-blocks`（说明）、`data.call-accounts`（`service` 串）、`data.slash-command`（保留前缀）、`data.mcp-endpoint`（动作条目名）。
  - **记录加 `byAgent`**（[S-8](v2/contract.md#s-8-资产记录)，customized 必有、official 必无）；**持有加 `versionSelection`**（[S-18](v2/contract.md#s-18-资产持有)，新 `$defs` `VersionSelection`，共 25 项定义）；**`HoldingBasis` 五支**（[S-19](v2/contract.md#s-19-使用权来路)，加 `organization`、`carrier`，每一支限定在哪几格）；**新条款 [S-36](v2/contract.md#s-36-usableby-是保留项名)** 保留 `usableBy`。四处都是必填或闭合集合的扩张——**旧实例不再合法**，已随本轮改写。
  - **六类正文改 `$ref`**（[S-10](v2/contract.md#s-10-八类正文的外壳)），G-5、G-7、G-8 闭合；**[S-27](v2/contract.md#s-27-表示层拒绝值) 加一段**：正文契约的拒绝值原名携带、排在 `name_invalid` 之后（吸收连接件三值的一般读法，规格层推导，已报主线）。
  - G-2、G-3、G-4、G-11 闭合；[S-4](v2/contract.md#s-4-资产记录号)、[S-5](v2/contract.md#s-5-资产来源)、[S-11](v2/contract.md#s-11-plugin-的成员)、[S-25](v2/contract.md#s-25-规范表示) 补对账块 A 的几句（记录号不复用、工作区提供的算 customized、plugin 只有内含、值可序列化）。
  - **对证据的影响**：V-1 首次有了本地自检；V-5 的停点从五处缩到一处（G-6）；V-3 新增三行（`pinned` 的版本存在、`organization` 的外层持有在、`carrier` 双向）。
  - **（同日续）「未配」只有缺席一种写法**（账本 S21-b）：[S-12](v2/contract.md#s-12-属性声明由正文推出) 允许 `placement_identity` 类设置项不带 `default`，[S-23](v2/contract.md#s-23-凭据引用) 第 2 条改为「还没取 = 缺席」（原文要求「不是缺席」，与裁定相反）；Schema 的 `AttributeDeclaration` 随之把 `default` 改为条件必填。**表示放宽**：此前拒的「落点类项无默认」现在收。S-12 第 1 条为 `mcp` 写明第二个输入（动作清单副本）。消费者：`data.mcp-endpoint`、`data.connector`。
  - **（同日续）实例 12.1 的项名 `call_timeout` 改为 `callTimeout`**：与 `data.mcp-endpoint` 推出的项名同一个（同一件事一个名字）；形状判定不变，本地自检重跑仍 0 不符。
  - **（同日续）第 5 节加连接件两行**：`body` 为 `{}` 通过、正文里带 `target` 拒（`malformed`）——跟随 `data.connector` 的正文收窄；本地自检 199 处 0 不符。
  - **（同日续，资产治理与流转对齐）配值加必填 `since`**（[S-14](v2/contract.md#s-14-属性配值)；账本 S11-G14：MCP 凭据要呈现「什么时候取的」）；**`organization` 支在租户格改为「记录归本组织所有，或本组织的组织格持有同一份」**（[S-19](v2/contract.md#s-19-使用权来路)；账本 S11-G2：被分享给本组织的那一份也覆盖）。**表示改变**：不带 `since` 的配值不再合法——本契约实例第 8、10、14 节与 `data.mcp-endpoint`、`data.connector`、`capability.asset-evaluation` 实例里的配值已同轮补上；本地自检 200 处 0 不符。消费者：`capability.asset-governance`（写入时填它）、`data.mcp-endpoint`（G-9 随之闭合）。
  - **（同日续，资产治理对齐）出厂格的 `immutable` 改为「当且仅当 meta 能力为真」**（[S-20](v2/contract.md#s-20-出厂格与工作区格的持有)）：原先恒为 `false`，与 `capability.asset-evaluation` 的前提 PRE-4「meta 能力的出厂持有带锁」相抵——那一版里 meta 能力的锁没有任何合法写法。Schema 出厂分支去掉 `immutable` 的 `const: false`（是不是 meta 它判不出，归写它的官方件登记按部署清单写）；实例第 10 节变体行一行由拒转收；P-10、V-3 的分工行随之改。**表示改变**：出厂格带锁的持有从拒到收。消费者：`capability.asset-governance`（S-29 按清单写它）、`capability.asset-evaluation`（S-18 读它）。本地自检 200 处 0 不符。顺手把消费者表里「同批并行起草」「块 B」「此刻不在本工作树」的旧说法换成候选坐标。
  - **（同日续，随 `data.tool-definition` 的供应商 payload 要求）实例第 4 节两版 `read_file` 的 `input` 补成顶层带 `properties`、每个参数带说明的写法**：`data.tool-definition/v2#S-4` 的三条硬要求让原来的 `{"type": "object"}` 从收到拒。本契约的条款与 Schema 不变；本地自检重跑，200 处 0 不符。
- **2026-09-24 主线裁定：S-27 加第三种情形（候选，未冻结，原地改）**：一份记录的能力标识 `name` 不合它那一类正文契约对名字的收窄——`data.mcp-endpoint/v2#S-26` 的 `name_not_projectable`、`data.slash-command/v2` 的命令名收窄同路——拒绝值原名携带，与前两种情形同一位置（`name_invalid` 之后）；名字随草稿与每一版、连同那一份正文交给那份契约判（斜杠命令的保留区要看绑定种类），与正文的违例按那份契约的次序一起排。[S-2](v2/contract.md#s-2-能力标识名的词法) 那一条补一句指过来。
  `examples.md` 第 13 节加三行（`name_invalid` 先于携带值；`transport_unknown`、`command_empty` 按 `data.mcp-endpoint` 的次序先于 `name_not_projectable`），第 14 节加四行（记录 M 的三个名字、一份名字在保留区里的提示词命令）；[对齐义务](#对齐义务)加一行。
  **表示**：Schema 不变（这几条都在 Schema 之外那一步）；拒绝值集合的构成不变（仍是上表十个值并上六份正文契约各自的非 `malformed` 值），只是明写了名字这一条来路。**对消费者**：没有已采用的消费者，无迁移；`data.mcp-endpoint` 的对齐义务那一行由此闭合。
  **证据**：暂存区脚本核了新加各行的「Schema」一列（记录 M 与三个名字变体、斜杠命令那一份按 `AssetDefinition` 判；`gh/__x` 被 `CapabilityName` 拒）与名字合不合 `data.mcp-endpoint` 的 `McpEndpointName`，**0 处不符**；拒绝值是哪一个仍未机检（V-2）。
- **2026-09-24 同日第三轮（主线裁定；候选未冻结，原地改）**：产品依据由 PF-002 rev 16 对到 **rev 19**——按 changelog rev 17→19 逐条核过：rev 18「组织那一层不持有 MCP 凭据与连接件鉴权绑定」落进 [S-23](v2/contract.md#s-23-凭据引用) 第 7 条、设计依据表那一行，**G-10 关闭**，covers 删去那条缺口登记型条目、「MCP 凭据」一条改注；
  rev 17 §5.2「谁可以使用它」**每一类资产都有**与 [S-36](v2/contract.md#s-36-usableby-是保留项名) 只给三类相左——**未自行改**，新缺口 [G-14](v2/contract.md#八已知缺口)（owner 主线），S-36 那处产品链接改指正确的小节；其余各条（身份与持有、界与挑选、替换、工作区、Skill／Connector 的设置与权限、拓展件不可用处置）不涉本契约的条款。
  V-2 的「第 13 节八行」改为当前的十四行。**形状与实例不变**；语义收紧只在组织格那两项（从「待裁」变为不配）。
- **G-14 主线裁定（2026-09-24，同日第四轮；候选未冻结，原地改）**：以 PF-002 rev 19 §5.2「每一类资产都有这一项，而且是同一项」为准——[S-36](v2/contract.md#s-36-usableby-是保留项名) 由三类改为**八类都有 `usableBy`**；第 2 条写明各处别名（Skill「谁可以使用它」、Slash Command「谁可以用这个入口」、**Connector「能不能安装」即 `data.connector` 的 `install`**、Loop Extension「谁能挂」）与 official 不受它管；[S-12](v2/contract.md#s-12-属性声明由正文推出) 的「全部属性项」一句、P-15、头部依据注记随之改；**G-14 关闭**。
  `examples.md` 第 14 节「tool 资产带 `usableBy`」由违约改为合法，另加一行（connector 推出 `install` 与保留的 `usableBy` 并存 → 推出规则违约，待那份契约收口）。
  **语义扩张**：tool、loop_extension、connector、agent_definition、plugin 五类的属性项多了 `usableBy` 一条（默认 `self`）。**对消费者**：`data.connector`（`install` 改名）、`capability.asset-evaluation`（第 1 步的滤与 `values` 恒有的那一条从三类扩到八类）要跟上——已报主线；Schema 不变（`usableBy` 那条声明的形状本来就不按类别判）。
- **2026-09-24 随 `capability.asset-evaluation` 对齐 PF-002 rev 19 第一步三小步（候选未冻结，原地改；不改语义与表示）**：[S-36](v2/contract.md#s-36-usableby-是保留项名) 第 1 条原指向那份契约的 G-15（已关闭），改指它的 S-39 并写明 `self` 的两种所指；第十节「Schema 管不到」那一行残留的「`usableBy` 只在三类上」改为八类（G-14 那轮漏改）；[S-20](v2/contract.md#s-20-出厂格与工作区格的持有) 里指向那份契约 S-18 的链接随它的标题改名（「第一步之二」→「第一步之三」）改锚点。Schema、实例与 V-1～V-6 不受影响。
- **2026-09-24 随 PF-002 rev 20 的治理类（主线派发；候选未冻结，原地改）**：产品依据 rev 19 → **rev 20**。[S-13](v2/contract.md#s-13-设置项类别)：治理类由「恰有一项 `disabled`」改为「`disabled`（保留项）加各正文契约推出的治理类项」，本版推得出的只有连接件的触发会话的默认运行模式；治理类里除 `disabled` 之外的项不从工作区来（[S-20](v2/contract.md#s-20-出厂格与工作区格的持有) 同改）。[S-12](v2/contract.md#s-12-属性声明由正文推出)：推出规则第 3 条改为治理类只产出产品点名的那几项；**`governance` 类设置项与 `placement_identity` 一样可以不带 `default`**（「作者声明的默认也不算数」）。
  **Schema 改了**：`AttributeDeclaration` 的「可不带 `default`」由 `placement_identity` 扩到 `governance`，保留项 `disabled` 的那一支加 `required: ["default"]`（否则它借这条规则就能不带默认值）。`examples.md` 第 7 节加两行（不带默认值的 `disabled` 拒绝、不带默认值的治理类项通过），本地用 `jsonschema` Draft 2020-12 对 `$defs/AttributeDeclaration` 核了这两行与五行旧行，**结论与表里一致**；**V-1 整体未重跑**。SC-6 同步。
  **对消费者**：`data.connector` 的推出规则要产出这一项、且不带 `default`（它现在写着「不产出治理类的项」，已报主线）；`capability.asset-evaluation` 同轮在 S-24 滤工作区的治理类配值。
- **2026-09-24 修订第二轮（主线裁定 R2-10、R2-11；候选未冻结，原地改）**：产品依据 PF-003 rev 4 → **rev 5**；**流转语义以 `capability.asset-transfer` v2 为准，本契约只承载形状**（头部依据注记写明）。
  - **R2-10 分享的接收方有组织与租户两种**：[S-19](v2/contract.md#s-19-使用权来路) 的 `shared` 支由「只在组织格」改为「组织、租户格」；此刻生不生效（分享记录有效、关系此刻成立、自确认以来未断过）归那份契约，本契约不判。Schema `AssetHolding` 的 `shared` 分支 `holder.layer` 由 `const organization` 改为 `enum [organization, tenant]`，`HoldingBasis` 与 `AssetHolding` 的说明随之改。**表示放宽**：租户格上的 `shared` 持有从拒到收。
  - **R2-10 复制血缘按（源, 落进的那一层）**：[S-21](v2/contract.md#s-21-复制血缘) 改写——血缘挂在落进目标组织某一层的那一份上；`importedBy` 本人型是本人、组织型是确认的那位超管；**「有血缘即组织所有」「组织级不能复制」两句删去**，改为「所有者是落进的那一层的所有者」（普通成员落租户级、超管选层、组织型落组织级）；第 3 条加一句「所有者是租户时 `importedBy` 就是它」；第 5 条写明层与层各算各的。[S-6](v2/contract.md#s-6-所有者与作者分记) 的所有者／作者两行、[S-7](v2/contract.md#s-7-所有者至多变一次) 的理由、[S-22](v2/contract.md#s-22-血缘号与分享号) 的对应（源 → （源, 层））、P-11、CS-3、CS-4 同轮改。Schema `AssetDefinition` 的「有 `lineage` 则所有者是组织」约束删去，`CopyLineage` 说明改写。**表示放宽**：带血缘、租户所有的记录从拒到收。
  - **R2-11 工作区格上的权限、落点与身份类、治理类配值不是 `malformed`**：[S-20](v2/contract.md#s-20-出厂格与工作区格的持有) 改写——形状照样合法、照常读入，由 `capability.asset-evaluation` 第 4 步滤掉并以 `FilterReason`（`workspace_permission`、`workspace_placement`、`workspace_governance`）留痕；P-10、「Schema 管不到」那一行、CS-5 同改。Schema 本来就不拒它们，`AssetHolding` 的 `$comment` 删去「工作区格上没有权限项与落点与身份类的配值」、改写为不拒的那一句。**判定改变**（接收边界由拒到收），**表示不变**。
  - 顺手：缺席表「声明的 `default`」一行与「Schema 管不到」那一行漏了 rev 20 的治理类（`governance` 也可不带 `default`，`disabled` 除外），`SettingCategory` 的说明残留「本版治理类恰有 disabled 一项」——一并改正（上一轮漏改，不是新语义）。
  - `examples.md`：4.3 改为普通成员本人型复制、所有者 (T2, a1)；第 4 节变体「4.3 改所有者为组织」由拒改为正例（组织型那一份、另一个血缘号），第 14 节加「所有者是租户而 `importedBy` 是别人」一行；第 10 节「10.4 改为租户格」由拒改为正例，另加「10.4 改为工作区格」拒；第 14 节「10.6 带 `execute`」由 `malformed` 改为「不是 `malformed`、由求值滤掉」。本地用 `jsonschema` Draft 2020-12（仓库 `uv.lock` 的 4.26.0，以整棵设计树的全部 Schema 建 registry）核了这七个实例的「Schema」一列，**结论与表里一致**；**V-1 整体未重跑**。
  - **对消费者**：`capability.asset-transfer`（形状的承载方，本轮对齐它 v2 的矩阵）；`capability.asset-evaluation`（PRE-2 同轮按 asset-transfer 的 S-9 改写，第 4 步的过滤不变）；`capability.asset-governance`（写面的 `shared` 行随之指租户格）。
- **2026-09-24 独立评审第一轮（处置表；候选未冻结，原地改）**：产品依据 PF-001 rev 16 → **rev 19**、PF-004 rev 10 → **rev 12**（复核结论在页首）；[S-14](v2/contract.md#s-14-属性配值) 权限值的措辞由「选定一个值就是收窄成单元素集」改为界与挑选；[S-20](v2/contract.md#s-20-出厂格与工作区格的持有)、[S-24](v2/contract.md#s-24-工作区承载清单) 第 5 条与 `capability.asset-evaluation` S-24 写成同一句（每一种条目只在一处丢）；[S-36](v2/contract.md#s-36-usableby-是保留项名) 第 2 条与 G-14 改写、**新 G-15**；**G-13 闭合**；CS-1 改写；`identity-values` S-33 补登依赖；token 表链 UL-usable-by；依据改引 D-060。
  **形状、Schema 与实例都不变**（`examples.md`、`asset-model.schema.json` 本轮未动），所以不重跑本地自检——V-1 仍是「作废，待重跑」。**对消费者**：没有已采用的消费者；`data.connector` 与主线要答 G-15；`capability.asset-evaluation` 同轮改 S-24 同一句。
- **[G-6](v2/contract.md#八已知缺口)、[G-9](v2/contract.md#八已知缺口) 被裁决**（Agent Definition 的正文、plugin 的正文）：`AssetContent` 相应的变体换成引用或加成员 ⇒ 表示改变；接受前闭合则原地改并重跑 V-1、V-3、V-5，接受后闭合则**出 v2**。
- **D-060 补录那几条主线裁定**（词法、五支、`byAgent` 等）：只改页首与各条的依据链接，语义与表示不变。
- **[G-15](v2/contract.md#八已知缺口) 闭合**（connector 收口）：若留 `usableBy`、删 `install`，本契约只删 S-36 第 2 条那一段；若另作对应，S-36 与 `data.connector` 同轮改。
- **跨进程演化启动**：V-6 从「无法演练」转为**必须演练**；[第四节](v2/contract.md#四装配给与协议给)右列九行从「待兑现」转为「须由协议兑现」，其中工作区键缺宿主分量那一行**多半要出新版**。
  **本版的全部证据只保留其单机范围，不得外推。**

- **2026-09-24 修复波 1b（主线裁定 D-060 §六 L2、L11；候选未冻结，原地改）**：
  - **L2**：`data.loop-extension` 把装配进来的实现那一格由 `implementation.capability` 改名 `implementation.builtinName`；本契约 loop_extension 那一支的壳 `$ref` 它的 `LoopExtensionDefinition`，**形状随之生效、本 Schema 不改**；实例第 5 节那一行（第 272 行）的成员名同改。
  - **L11**：实例里「按 `data.mcp-endpoint` 的次序」那两行的行号对到那份契约 S-20 现在的表——`transport_unknown`（第 2 行）、`command_empty`（第 3 行）都先于 `name_not_projectable`（第 6 行）；原写「第 7 行」「第 4 行」是 mcp-endpoint S-20 重排之前的号。报出的拒绝值不变。
  - **证据**：实例第 5 节 **20 行**（含第 272 行，经壳 `$ref` 到 `data.loop-extension`）按 `$defs/AssetContent` 重跑 `jsonschema` 4.26.0（锁定 uv 环境，全部 Schema 按 `$id` 登表，脚本在会话暂存区），**0 处不符**；其余各节未改、未重跑（L11 那两行在第 13 节，是拒绝值优先级的文字说明，不过 Schema）。

- **2026-09-25 第二轮独立评审的处置（修复波 2；候选未冻结，原地改）**：CS-5 一处措辞（B3）与依据改链（应修 6），见独立评审第二轮。**语义与表示都不变**——CS-5 是消费者走查，改的是它对 S-20、S-24 的转述，条款本身未动；Schema 与实例未改，不重跑。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-001／PF-003／PF-015），不在这里改契约。
