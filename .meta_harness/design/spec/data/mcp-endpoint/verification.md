# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.mcp-endpoint` v2 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> 起草时只做了手核（[`examples.md` 第 10 节](v2/examples.md#10-起草者逐条自核)）；**整批对齐（2026-09-24）跑过一次 V-1 的本地自检**（只判 Schema 通过与否，见[结果与反例](#结果与反例)）。
> 四条规范场景、四条消费者核对场景、四条静态检查**一条都未执行**——文件存在不代替结果。
> 2026-09-24 第一轮独立评审（基线 HUB `765b01dc`）的处置见独立评审；改动的实例行补跑了本地自检（见[结果与反例](#本地自检第一轮独立评审处置2026-09-24)）。
> 唯一跑过的检查器是 `make design-check`：它解析了本包 Schema 的 JSON、核对了 `$id` 与全部 `$ref` 指得到、核对了 Markdown 链接与锚点——**它不校验任何实例**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～6 节逐行（含变体行）过 Schema，比对「Schema」一列；第 7 节逐条过 `data.asset-model` 的 `AttributeDeclaration` | Draft 2020-12 校验器（能按 `$id` 解析到 `data.asset-model/v2`、`data.tool-definition/v2`、`data.offer-expiry/v1` 及它们各自引用的 Schema）＋ 按节绑定的 `$defs` | [S-1](v2/contract.md#s-1-接入点正文)～[S-14](v2/contract.md#s-14-推出规则五类项) 的**形状那一面** | **本地自检已跑一次**（整批对齐，2026-09-24）：105 处 0 不符；拒绝值是哪一个未机检。**修订批（同日）只补跑新增的 4.1 节**：12 行的 Schema 一列与拒绝值一列都机检、0 不符（见[结果与反例](#本地自检接入点-name修订批2026-09-24)）；第 1～7 节的 JSON 未改、未重跑。**第一轮独立评审处置（同日）**：第 2、4、6 节的内联行（45 行）Schema 一列重跑、0 不符，第 4、6 节与第 2 节 userinfo 那一行的拒绝值一列按规则机检、0 不符；第 1 节两条 `credential` 变体与第 8 节新行构造后过 Schema，都拒绝，与表一致 |
| V-2 | **拒绝值的具名与优先级**：对每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 8 节专验优先级 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-20](v2/contract.md#s-20-表示层拒绝值与判定次序)、[S-21](v2/contract.md#s-21-表示层拒绝不是判定也不修补) | **未开始。**需要一个实现了接收边界校验的提供者。**只验 Schema 通过与否不够**——`name_reserved_sequence` 与 `malformed`、`url_invalid` 与 `malformed` 在 Schema 那里都只是「拒绝」 |
| V-3 | **Schema 管不到的约束**：[`examples.md` 第 9 节](v2/examples.md#9-schema-挡不住但同样非法的)逐行 | 接收边界的校验 ＋ 写入方（治理写面、桥）的用例 | [S-9](v2/contract.md#s-9-动作清单副本)、[S-12](v2/contract.md#s-12-oauth-绑定)、[S-13](v2/contract.md#s-13-凭据配值的取值域)、[S-17](v2/contract.md#s-17-工作区格上的这些项) | **未开始。**「副本完整、次序原样」落在桥的写入边界，「凭据引用是保管方发出的」落在治理写面 |
| V-4 | **规范场景** [S-22](v2/contract.md#s-22-正文里写凭据被拒)～[S-25](v2/contract.md#s-25-仓库带来的接入点没有凭据)：每条一个正例一个反例 | 规范场景演练：真实接收边界、真实推出规则、真实求值 | [S-6](v2/contract.md#s-6-正文不收凭据)、[S-9](v2/contract.md#s-9-动作清单副本)、[S-15](v2/contract.md#s-15-推出规则的输入正文与动作集)～[S-17](v2/contract.md#s-17-工作区格上的这些项) | **未执行。**S-24 **必须观察存储里的那条配值**：只看求值结果会漏掉「配值被清掉之后动作回来是默认值」 |
| V-5 | **消费者路径走查**（[CS-1～CS-4](v2/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | [S-13](v2/contract.md#s-13-凭据配值的取值域)～[S-16](v2/contract.md#s-16-逐动作项按动作名键) | **未开始。**走查**不需要提供者**，现在就做得了；CS-1 走到资产治理写面的 `valueOutOfDomain`（`capability.asset-governance/v2` 的 S-38 ②），CS-2 停在求值，CS-4 走得通（原 G-9 已闭合）——停在别的能力不算走不通 |
| V-6 | **静态检查**（[SC-1～SC-4](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 接入点正文的类型里没有任何一个成员能装下凭据；stdio 的 `command` 与 `args` 在拉起时不经 shell 展开、不做变量插值 | [S-4](v2/contract.md#s-4-stdio)、[S-6](v2/contract.md#s-6-正文不收凭据) | 未开始 |
| SC-2 | 推出规则只读正文与传进来的那份动作集，不读持有方、所在格、时间、环境；不产出 `disabled`、`usableBy` 与治理类的项；四个固定项的类别是字面常量 | [S-14](v2/contract.md#s-14-推出规则五类项)、[S-15](v2/contract.md#s-15-推出规则的输入正文与动作集) | 未开始 |
| SC-3 | 不存在「把 `not_fetched` 当作空清单」的分支：副本两支在类型上分开，消费处按两支分别处理 | [S-9](v2/contract.md#s-9-动作清单副本) | 未开始 |
| SC-4 | 逐动作项的键只由 `execute:` 前缀与对端动作名原样拼成；不存在按「当前动作集」清理配值的写路径 | [S-16](v2/contract.md#s-16-逐动作项按动作名键) | 未开始 |

## 对齐义务

**这些是本契约与同批或上游契约之间要在整批对齐时处理的事**，不是本契约自己的证据义务。

| 对齐什么 | 涉及 | 现状 |
|---|---|---|
| mcp 那一支正文由不透明 `body` 换成 `McpEndpoint` | `data.asset-model` v2 的 S-10 | **已落**（2026-09-24 整批对齐）：那边的壳 `$ref` 本契约 `McpEndpoint`（原 G-10） |
| 能力标识名的词法（允许 `:`、禁 `/`） | `data.asset-model` v2 的 S-2 | **已落**：两边同一套（原 G-6） |
| 推出规则的第二个输入（动作集） | `data.asset-model` v2 的 S-12 第 1 条 | **已落**：那边为 `mcp` 写明第二个输入（原 G-1） |
| 副本与凭据的住处 | `capability.mcp-bridge` v2 的 S-7 | **已落**：两者都按持有存放（主线裁定，见 D-060 §S19 S19-a） |
| 「能不能用」的取值域与默认 | `data.asset-model` v2 的 S-36；`capability.asset-evaluation` | **已落**：各类正文契约不再各自声明，统一为 asset-model 保留的 `usableBy`（D-060 §S18 S18-c；八类共用见 asset-model S-36）；`self` 怎样对上答在 asset-evaluation 的 S-39 |
| 「还没取」的写法 | 本契约的凭据取值域；`data.connector` 的投递目标与凭据 | **已统一**：「未配」只有缺席一种写法（D-060 §S21 S21-b）；`not_fetched` 这个 token 只剩副本那一支（[S-9](v2/contract.md#s-9-动作清单副本)），与凭据不再共用 |
| **`name_not_projectable` 的原名携带**：本契约在 `data.asset-model/v2#S-2` 之内收窄 `mcp` 资产的 name（[S-26](v2/contract.md#s-26-接入点-name-登记时收窄)），拒绝值要由那边的 S-27 原名携带、排在它的次序里 | `data.asset-model` v2 的 S-2、S-27 | **已落**：S-27 加了第三种情形「记录的能力标识 name 不合它那一类正文契约对名字的收窄」，名字连同那一份正文交给本契约判、原名携带；S-2 补一句指过去；那边实例第 13、14 节各有本契约的行。本契约对 `data.asset-model` 的依赖加 S-27（抬头依赖表与 catalog） |
| **登记时判 name** | `capability.asset-governance` v2 的写面（新建、导入、登记官方件）；`data.asset-model` 的工作区承载清单读入 | **待那边落**：写面的失败集合里要有这个值（按 `data.asset-model` S-27 原名携带），本契约不替它写 |
| **「凭据位写了非引用值」只有一个拒绝值** | `capability.asset-governance` v2 的 S-38 ②、S-18 | **已落**（2026-09-24 第一轮独立评审的处置）：那边写明凭据类项（取值域为 `CredentialRef`）的非引用值报 `valueOutOfDomain`；本契约删去 `credential_plaintext`，[S-13](v2/contract.md#s-13-凭据配值的取值域) 改为指过去 |
| **`name_reserved_sequence` 原名携带** | `data.tool-definition` v2 的 S-18 第 2 条、S-26 第 11 行 | **已落**（同上）：条目名含三种相邻时报那边的值、同名同义（[S-20](v2/contract.md#s-20-表示层拒绝值与判定次序) 第 7 行）；那边改名或改次序，这里同轮改。catalog 对 `data.tool-definition` 加登 S-26 |

## 结果与反例

### 本地自检：Schema 正反实例（整批对齐，2026-09-24）

**工具**：Draft 2020-12 校验器（`jsonschema`，按仓库 `uv.lock`），以对齐后整棵设计树的全部 Schema 建 registry；脚本在任务暂存区，不入库。
**输入**：[`examples.md`](v2/examples.md) 第 1～7 节——内联实例按节绑定的 `$defs`（第 6 节表 6 按 `data.asset-model` 的 `CredentialRef`，6.1、6.2 按它的 `AssetHolding`；第 7 节 7.1 逐条按它的 `AttributeDeclaration`）；1.1、1.2、3.1～3.3 各块；「在 X 上改动 Y」的变体行按行文构造；第 8 节六行各构造一份（都应被拒）；第 9 节那一行变体（应通过）。

| 预期通过 | 预期拒绝 | 不符 |
|---|---|---|
| 34 | 73 | **0** |

**只判通过与拒绝**：给出的是不是「拒绝值」一列那个值（含 M 编号），校验器不回答。第 9 节其余各行不是单份实例能判的，不参与。**这不是 V-2 以后任何一条义务的证据。**

### 本地自检：接入点 name（修订批，2026-09-24）

**工具**：暂存区脚本（不入库）；Draft 2020-12 校验器（`jsonschema` 4.26.0，按仓库 `uv.lock`），以本工作树整棵设计树的全部 Schema 建 registry。
**输入与做法**：[`examples.md` 4.1 节](v2/examples.md#41-接入点的-name) 12 行——「Schema」一列按 `$defs/McpEndpointName` 判；「拒绝值」一列按「先 `data.asset-model` 的 `CapabilityName`（不过即 `name_invalid`），再判 `name ＋ ":x"` 合不合 `data.tool-definition` 的 `ToolName` 且转写后 ≤ 128」算出，与表比对。
另对字母表 `{a, _, :, -, .}` 上长 1～5、合 `CapabilityName` 的全部 3 905 个串，核 [S-26](v2/contract.md#s-26-接入点-name-登记时收窄) 的四条展开与「`name ＋ ":x"` 合 `data.tool-definition/v2#S-18`」逐个等价、且与 `McpEndpointName` 的 Schema 判定一致。
**结果**：3 917 处，**0 处不符**。**这是拒绝值一列第一次被机检**，只对 4.1 节；**不是** V-2（接收边界的实现）的证据。

### 本地自检：第一轮独立评审处置（2026-09-24）

**工具**：暂存区脚本（不入库）；Draft 2020-12 校验器（`jsonschema` 4.26.0，按仓库 `uv.lock`），以本工作树整棵设计树的全部 Schema 建 registry。
**输入与做法**：[`examples.md`](v2/examples.md) 第 2 节（`$defs/McpTransport`）、第 4 节（`$defs/McpActionName`）、第 6 节表 6（`data.asset-model` 的 `CredentialRef`）的内联行，Schema 一列逐行比对；
「拒绝值」一列按规则算——第 4 节：含 `__`、`_:`、`:_` 为 `name_reserved_sequence`，其余为 `malformed`；表 6 一律 `valueOutOfDomain`；第 2 节带 userinfo 的为 `url_invalid`。
另把第 1 节两条「加 `credential`」变体应用到 1.1、第 8 节新增的条目名构造出来，各过一次 Schema。
**结果**：45 行 0 处不符；三份构造实例都拒绝，与表一致。**不是** V-2（接收边界的实现）的证据。

### 尚无的记录

V-2～V-6 **一条执行记录也没有**。起草时的手核只保证 `examples.md` 的实例与它们的标注在起草者眼里不互相矛盾，
**不支持**任何一条规范场景、任何一条跨成员约束的实现、任何一条消费者走查。

本页维护验证义务、方法、前提与覆盖限制。单次执行的工具与版本、环境、配置、输入范围、步骤和原始结果留本工作树 `tmp/`，不建立永久运行索引。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约的性质一节](v2/contract.md#性质)末尾。
`formal-tasks.json` 里没有、也不应有本契约的任务——**「未运行」如实登记**。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-002 rev 16、PF-006 rev 17 上（PF-016 rev 5、PF-005 rev 5、PF-012 rev 10 只引）。
  **依赖 `data.identity-values` v2 与 `data.offer-expiry` v1**（已接受、已冻结）——那两版不可原地改，引用目标不会漂移。
  **依赖 `data.asset-model` v2 与 `data.tool-definition` v2**（`candidate`，未冻结）：那边若在评审中改 `CredentialRef`、`AttributeDeclaration`、`Duration`、`ExecutePermission` 的名字或形状，本契约的 Schema 引用与第 6、7 节实例须同轮复核 V-1。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单（账本 S19-a、S19-c、S18-c、S21-b、S9-c）。
  - **副本与凭据的住处采纳为「按持有存放」**（S19-a）：[S-6](v2/contract.md#s-6-正文不收凭据)、[S-9](v2/contract.md#s-9-动作清单副本) 的「已报主线改判」改为采纳；形状不变。
  - **「能不能用」移出本契约**（S18-c）：`permissions.use` 删掉，[S-8](v2/contract.md#s-8-执行权限的作者默认) 改为只有执行权限；[S-14](v2/contract.md#s-14-推出规则五类项) 不再产出 `use`，全部属性项＝五类推出项＋`disabled`＋`usableBy`。对 `data.identity-values` 的 `TenantRole` 依赖随之去掉。**表示改变**：旧实例里带 `use` 的正文都不再合法（M4），已改写。
  - **凭据「还没取」改为缺席**（S21-b）：[S-13](v2/contract.md#s-13-凭据配值的取值域) 的取值域只剩 `CredentialRef`，`credential` 一项不带默认；`{"kind": "not_fetched"}` 作凭据配值改判 `credential_plaintext`；「撤掉」是删掉那条配值。**表示改变**：表 6 与 7.1 已改写。
  - **工作区提供的 stdio 接入点默认禁用**（S19-c）：[S-17](v2/contract.md#s-17-工作区格上的这些项) 加一条；怎样落进求值归 `capability.asset-evaluation`。
  - **G-1、G-6、G-10 闭合，G-5 移交**（`data.asset-model` 已为 `mcp` 写明第二个输入、改了能力标识名词法、壳 `$ref` 本契约；「能不能用」的默认归它的 `usableBy` 与 asset-evaluation 的 G-15）。
  - 实例里的两份持有补上 `versionSelection`（`data.asset-model` 本轮加的必填成员）；同轮稍后，配值补上 `since`（`data.asset-model` 的 S-14 加的必填成员，账本 S11-G14），G-9 随之闭合——静态凭据的「什么时候取的」就是那条配值的 `since`。
  - **对证据的影响**：V-1 首次有了本地自检；CS-1、CS-2、CS-4 按新写法改写。
- **2026-09-24 随 `data.tool-definition` 的供应商 payload 要求（产品负责人 2026-09-24 要求；候选，未冻结，原地改）**：
  - **条目名的词法改为取 `data.tool-definition/v2#S-18` 对 `name` 的收窄**（[S-11](v2/contract.md#s-11-动作条目名) 第 1 条；Schema 的 `McpActionName` 改为 `$ref` 它的 `$defs/ToolName`、另要求含 `:`）：条目名就是那份工具定义的 `name`，收窄只有一个家。
    **表示改变**：带 `.`、`__`，拼接处成 `_:`／`:_`，或转写后过长的名字从收到拒——实例第 4 节 `"github:issues.list"` 由通过改为拒绝，另加两行。MCP 协议建议里有 `.`，这类对端动作从此拼不出条目（桥 S-17 排除），后果已报主线。
  - 「供应商对工具名的限制不由本条承担」改为由 `data.tool-definition/v2` 的 S-6、S-18 承担；**G-2 收窄**到只剩撞名。**新缺口 G-11**：接入点的 name 要不要收窄到同一套词法。
  - 实例 3.1 两个动作的参数补上说明——否则桥投影出的定义过不了那边的三条硬要求（副本原样保存对端给的东西，本契约不要求它们带说明）。
  - **对证据的影响**：V-1 本地自检重跑，107 处（预期通过 34、拒绝 73）0 处不符。
- **2026-09-24 修订批第五节：主线裁定 G-11（候选，未冻结，原地改）**：
  - **新条款 [S-26](v2/contract.md#s-26-接入点-name-登记时收窄)**（放在 S-11 之后，编号只追加）：`mcp` 资产的 name 在 `data.asset-model/v2#S-2` 之内收窄——接上 `:` 与一个字母要合 `data.tool-definition/v2#S-18`，展开为四条（字符集、三种相邻、不以 `_` 结尾、转写后 ≤ 125）；不合即拒，**新拒绝值 `name_not_projectable`**（[S-20](v2/contract.md#s-20-表示层拒绝值与判定次序) 由六个变七个，排在第 7 行、`malformed` 剩余项之前）；**G-11 关闭**；新性质 P-8。
  - [S-11](v2/contract.md#s-11-动作条目名) 的「接入点 name 不合则每一个动作都拼不出」改为「接入点那一段不会是拼不出的原因」；拥有清单、消费者表（资产治理登记时判 name）、元素表、Schema 管得到什么各加一处。
  - **Schema**：新 `$defs/McpEndpointName`（7 项）——`$ref` `data.asset-model` 的 `CapabilityName`，加 `pattern` 与 `maxLength: 125`；根 `$comment` 的计数与外部引用随之改。实例新增 4.1 节 12 行、第 8 节两行。
  - **产品依据**升到 PF-006 rev 19：设计依据表两行的「产品修订待落」改为指 PF-006 rev 18 §6.13，[S-15](v2/contract.md#s-15-推出规则的输入正文与动作集) 同。catalog 对 `data.tool-definition` 的依赖加 S-18（S-11 早已 `$ref` 它的 `ToolName`，原先漏登；S-26 由它推出）。
  - **表示改变**：name 带 `.`、含 `__`／`_:`／`:_`、以 `_` 结尾、或转写后超过 125 的 `mcp` 资产从「登得上、用不了」变为登不上。**对消费者**：没有已采用的消费者，无迁移；资产治理的写面与 `data.asset-model` 的携带规则要跟上（[对齐义务](#对齐义务)）。
  - **已按 `data.tool-definition/v2#S-6` 维持**（主线 2026-09-24 裁定：简报那句「反向转写由桥拥有」作废）：逆转写由收到调用的一方做；本契约 S-11 照旧「不另做呈现与映射」。
  - **证据**：4.1 节本地自检，3 917 处 0 不符（见[结果与反例](#本地自检接入点-name修订批2026-09-24)）。
- **2026-09-24 主线对修订批报回项的裁定（候选，未冻结，原地改）**：
  - **G-3 关闭**（PF-002 rev 18「组织那一层不持有 MCP 凭据」，主线 2026-09-24 落）：[S-12](v2/contract.md#s-12-oauth-绑定) 末条由「组织格能否持有未决」改为「组织格上没有 OAuth 绑定、没有凭据配值，写面拒、beginOAuth 拒，推出规则不变」；抬头、设计依据表那一行、G-4 的措辞各一处。**形状不变**：Schema 与实例都没动（实例里的持有本来都在租户格）。
  - **`name_not_projectable` 的承载**：主线裁定由 `data.asset-model` S-27 原名携带；[对齐义务](#对齐义务)那两行改写——S-27 的文字仍待那边补一种情形，资产治理写面另有人在改。
  - **反向转写**：已按 `data.tool-definition/v2#S-6` 维持（上一条末项）。
  - **对消费者**：没有已采用的消费者，无迁移。**语义收紧**：组织格上的凭据配值与 OAuth 绑定从「待裁」变为不存在。
  - **（同日第二轮）`data.asset-model` S-27 落了第三种情形**：对齐义务 `name_not_projectable` 那一行闭合；抬头依赖表与 catalog 对 `data.asset-model` 加 S-27。
- **跨进程演化启动**：[第五节](v2/contract.md#五装配给与协议给)右列从「待兑现」转为「须由协议兑现」；本版的全部证据只保留其单机范围，不得外推。
- **（2026-09-24 整批对齐收尾，不改语义）**：「不拥有」与消费者表里「同批」「不在本工作树」的旧说法换成候选坐标（资产治理、求值、注册表、MCP 桥）；README 同步。
- **2026-09-24 第一轮独立评审的处置（候选，未冻结，原地改）**：逐条见独立评审。
  - **拒绝值集合改了两处（仍是七个）**：删 `credential_plaintext`——凭据配值的非引用值归资产治理写面的 `valueOutOfDomain`，正文上的 `credential` 成员落 `malformed`（M4），`url` 带 userinfo 落 `url_invalid`；加 `name_reserved_sequence`——条目名含三种相邻时原名携带 `data.tool-definition` 的值。S-20 次序重排为 `malformed`（M1、M2）› `transport_unknown` › `command_empty` › `url_invalid` › `snapshot_missing_time` › `name_not_projectable` › `name_reserved_sequence` › `malformed`（其余）。
  - **表示改变**：同一份坏输入的拒绝值变了——带 `credential` 成员的正文从 `credential_plaintext` 变为 `malformed`，并且不再排在别的毛病前面（与 `command_empty` 同在时报 `command_empty`）；带 userinfo 的 `url` 从 `credential_plaintext` 变为 `url_invalid`；含 `__`、`_:`、`:_` 的条目名从 `malformed` 变为 `name_reserved_sequence`。**Schema 的通过与否一处未变**（只改了三处说明）。
  - **依据改链**：产品依据升到 PF-002 rev 20、PF-016 rev 8、PF-012 rev 14（逐 rev 复核见独立评审表）；主线裁定改链 D-060／D-059；已进产品正文的（按尝试重算、本地命令型接入点默认不启用）改引产品小节；三项 D-060 未收录的标出并报主线。词条链接补齐；G-5 改指 asset-evaluation S-39；S-8 改引 asset-model S-36 的八类共用。
  - **对消费者**：没有已采用的消费者，无迁移。`capability.asset-governance` 已在它的 S-38 ② 写明凭据类项的 `valueOutOfDomain`；`capability.mcp-bridge` 对本契约的消费（S-20、S-21）不涉拒绝值的名字，不用改。catalog 对 `data.tool-definition` 加登 S-26。
  - **证据**：改动的实例行补跑本地自检，45 行 0 不符（见[结果与反例](#本地自检第一轮独立评审处置2026-09-24)）。
- **2026-09-24 同日稍后（不改语义）**：K 裁定收进 D-060 §五 之后，设计依据注表里「凭据位写了非引用值」那一行改链 D-060 §五 K7。

- **2026-09-25 第二轮独立评审的处置（修复波 2；候选未冻结，原地改）**：只把设计依据注表三行改链 D-060 §六 N-3（第二轮）。**语义与表示都不变**，Schema 与实例未改，不重跑。

- **2026-09-25 修复波 3（候选未冻结，原地改）**：见下节[实现映射反推](#实现映射反推2026-09-25)。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-006），不在这里改契约。

## 实现映射反推（2026-09-25）

起因：realization-drafter 戊报回 TM-2、TM-3；主线裁定 D-060 §八 M37（「MCP 动作条目据此 `stand_in{for: schema_unsupported}`，mcp-endpoint 同步」）。**裁定不代替接受**，本契约仍是 candidate。

| 裁定 | 落点 | 本契约推导的部分（已报主线） |
|---|---|---|
| **M37**（本契约这一半） | [S-10](v2/contract.md#s-10-对端动作描述) `inputSchema` 那一条后加一段：投影判出 `schema_unsupported` 的动作不被排除、以同形替换件出现、原因 `schema_unsupported`，同形照的是本契约原样存下的 `inputSchema`；设计依据表 `data.tool-definition` 一行补 `S-4`、`S-27`；examples §3 加一行 | 本契约不改自己的拒绝值与副本的形状——动作描述原样存下这一条本来就给替换件留着同形的依据；打标记的是桥，本契约只写结论 |

**语义与表示**：本契约的形状、拒绝值与推出规则都不变；变的是「一项参数 schema 不合格」里多了一种**不被排除**的情形。

**对证据的影响**：没有既有证据受影响；新加的 examples 行是一个 Schema 通过的正例，下一次本地自检一并跑。

**对消费者**：`capability.mcp-bridge` S-17 `projectActions` 要把这一种与「被排除」分开、打「只能以替换件出现」的标记并带原因——**本轮没有 drafter 负责那份契约，已报主线**；`capability.asset-registry` S-12 第一行照用桥给的原因，不改。

**registry**：catalog 本契约 → `data.tool-definition` 的 clauses 补 `S-4`、`S-27`（S-10 那一段据 S-4 末段与 S-27 末段写）；covers、formal-tasks、id-namespaces 不变。

**examples 对 Schema 的机检（2026-09-25，跨批对齐，drafter 丑）**：暂存区脚本（不入库），`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境），设计根下全部 `*.schema.json` 按 `$id` 登表；逐节按「校验对象」取实例——表里的字面值，以及「在 1.1／1.2／3.1 上改一处」派生出的行（按那一句改写基准实例）——与 1.1～7.1 各代码块（7.1 逐条按 `data.asset-model` 的 `AttributeDeclaration`），拿「Schema」列比对；另补四处：第 4.1 节「126 个 `a`」、第 9 节「形状恰是一个引用的明文令牌」、第 3a 表「把第二项的 `inputSchema` 改为 `true`」、第 9 节「第二项改成与第一项同名」（Schema 通过）。**112 处，0 不符**。第 7 节结论表、第 8 节（次序）、第 9 节其余几行是契约判定，不参与。只核形状，不是 V- 义务的执行证据。
