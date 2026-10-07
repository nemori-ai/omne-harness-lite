# evaluation-input-store 实现设计

本稿 **candidate，未接受**，2026-09-27 rev 2。源码 `packages/assets/evaluation-input-store` 尚未建立。新服务、函数、表/列及配置名均为**候选**；明确注明现有公开 API 的条目除外。本节点只投影已成稿读取端口与主线局部源选择，不增加产品治理操作、会话生命周期或第二套 EvaluationInput。

## 实现路径与精确输入

采用当前输入读取链提案的本地真实源。会话创建时捕获不可变配方；资产的已发布版本和当前层持有由可信本地发布者持久写入。每次读取都取得本地当前事实。既有 manifest 只作历史参考，本节点不依赖其表或从 EffectiveAssembly 反向构造输入。

精确依赖的当前接受状态及采用依据以 [registry catalog](../../../../registry/catalog.json) 为准；本节点仍为候选，不以本页静态标签替代登记。

| 精确坐标（baseline 均为 `omne-harness-lite-design-2026-09-15`） | 消费责任 |
| --- | --- |
| [`capability.model-request-runtime/v3`](../../../../spec/capabilities/model-request-runtime/v3/contract.md) | S-66 全部来源/读取责任；S-10/S-21/S-24/S-26/S-29/S-30 是 runtime 的消费时点，S-63 是诊断交接 |
| [`capability.asset-evaluation/v4`](../../../../spec/capabilities/asset-evaluation/v4/contract.md) | S-6/S-7 C1～C16、S-12/S-15/S-29、PRE-1～PRE-9；只组输入，求值仍用其公开纯实现 |
| [`data.agent-definition/v1`](../../../../spec/data/agent-definition/v1/contract.md) | S-1～S-10 根所选正文的两槽位、严格读取与窄规则 |
| [`capability.session-tenancy/v2`](../../../../spec/capabilities/session-tenancy/v2/contract.md) | S-5/S-6/S-8，真实会话归属与不可变性 |
| [`capability.organization-governance/v2`](../../../../spec/capabilities/organization-governance/v2/contract.md) | S-26 当前资格、S-63 显式参与与共同终结/失败边界，绑定 D-042 公开参与实现。不是本节点重新实现成员资格 |
| `data.asset-model/v3`、`data.identity-values/v1`、`data.content-blocks/v3` | 资产/持有/身份及严格无损表示。间接域与正文版本严格沿 AE4/AD1，不使用“最新 schema” |
| `data.call-accounts/v2` 对应的 core 公共数值工具 | 仅复用包根 `ExactDecimal.from/compare/isInteger` 做精确版本比较，不引入账目语义，不新建 CB 公共面 |

存储继续用已有 `core/storage` 抽象及 `infra/storage-sql`，来源为 D-026、D-042。**本轮实际组合限同一 SQLite 实例**：`AtomicStorage.atomic` 下 BEGIN IMMEDIATE 可把资格读取和输入读取排在全部本地写入之间。`StorageUnit.query` 只是 ReadTx 类型，不是数据库硬只读或 PG 快照保证；PG 的 READ COMMITTED 不能据此声称一致读取，EIS-5 保持受阻。不在普通 `storage.read` 中伪造 StorageUnit，也不在事务中嵌套调用独立提交服务。

已核仓库公开面：`packages/core/storage/src/index.ts` 导出 AtomicStorage/StorageUnit；`packages/tenancy/organization-governance/src/index.ts` 导出 MembershipsService，其 `participate(unit).standing(tenant)` 经 `unit.assertStorage` 确认同存储。调用方只使用该公开参与面，不读取组织治理私有表。上述源码核对确认接口现状，**不是本节点组合验证**。

OG2 S-63 的参与面异常必须传播到共同单元的唯一终结边界：`read` 与 `captureSessionRecipe` 不在 unit 回调里将该异常转换成 unavailable 后继续或正常返回；先等待外层 atomic 实际结束及必要回滚/排空，再由外层按已有分类映射声明的不可用。无关程序缺陷继续暴露；未确认提交不能声称无效果或自动补交。参与面正常返回的领域拒绝与抛出的异常分别处理，不能借普通操作的返回值约定提前吞参与异常。

## 契约责任到插件、服务与操作

| 契约责任 | 公开操作、服务或构件（候选） | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| runtime3 S-66 ①②③；session-tenancy2 S-8 | `createEvaluationInputReader(...).read(session, tenant)`；`currentEvaluationInputs` | 先真实 holdingTenant，再同原子单元读取 recipe；尚未建包 | 两次传入租户、recipe 租户与真实归属必须相等；EIS-V2，不从参数猜权限 |
| S-66 来源前提1；AE4 S-6/PRE-3 | `captureSessionRecipe` 与现有 `memberships.participate(unit).standing` | 捕获和现读复用 OG2/D-042 | 当前资格有效才可读，但输入 standing 保留创建时捕获值；EIS-1、EIS-V3 |
| S-66 ④；AE4 PRE-1、S-29 | 一个 AtomicStorage 单元包含资格、全部当前持有、定义版本和配方读取 | D-042 同 SQLite 范围；本读路径只 query/standing，不调用 mutate | 无混合输入；EIS-V4。锁占用是成本，不宣称并发读性能 |
| S-66 来源前提2/3；AE4 S-6、S-7 C5/C9/C15/C16、PRE-9；AD1 S-2 | 当前资产/持有 SQL 记录 → 共享根源选择 → 实际版本正文 → AD1 提取 | AM3、AE4/AD1 公开纯构件；尚无完整组件 | 不修改 current/pinned、不拼 root.source；EIS-2、EIS-V1/V5 |
| S-66 ⑤⑥⑦⑧；AE4 S-7、S-12/S-15 | 真实完整输入经已有 evaluate 作纯准入，再由只读闭包交回 input | 不新增输入 judge，不输出 E、不写 manifest、不发 HTTP | 任一纯失败/提供者缺席均 unavailable，保留原诊断；不把 selector ok 当完整合法；EIS-V2/V5/V8 |
| AE4 PRE-2/PRE-4/PRE-5/PRE-7/PRE-8 | 真实本地持有资格核对、显式出厂清单、来源分支守卫 | 支持 official/owned 及来源已在本快照内成立的 organization；其他受限分支见下文 | 不把未知分享或 workspace 丢成空集；EIS-3，EIS-V6 |
| S-66 ⑨、runtime3 S-63；SYS-OBSERVABILITY | 显式诊断端口 | 固定会话/租户、捕获及当前资格、根资产/版本、输入修订/失败阶段 | 不输出正文、配值或秘密；EIS-V9，观测不能制造业务成功 |
| S-66 持久来源、重读与失败 | 发布子入口、迁移片段、单 fiber 撤除 | 本地开发验收/框架存储原语；无产品服务写面 | SQL 重开保留真实源；完整 Promise 和资源结束归提供者/装配，EIS-V7/V10 |

## 公开面、发布责任与作用域

公开根入口提供 `createEvaluationInputReader({ storage, memberships, sessionTenancy, diagnostics })` 和可独立使用的纯装配构件；Cordis 插件只把同一闭包作为 `currentEvaluationInputs` 发布。该端口只服务 runtime 的 S-66，不成为模型独立函数 invokeModel 的隐式依赖。不建立 LLM、Agent 或 session 类包装。纯求值与 BodyContracts 固定到同一 AE4 制品闭包，由装配同时交给源节点和 runtime；不允许两端各自按“最新”选解释器。

子入口 `./publication` 提供 `publishLocalInputs`、`captureSessionRecipe`、`readPublicationRevision` 与迁移片段，均为**本提供者技术面候选**，不登记成新的领域操作。`publishLocalInputs` 接显式预期修订、资产版本追加和明确的层持有替换；不接 EffectiveAssembly、回调函数或预造的完整 EvaluationInput 作为权威。`captureSessionRecipe` 接会话及创建请求中的根能力、可选工作区、会话配值，standing 由实际 memberships 读取并捕获，不能让调用方捏造一个 effective 常量。

发布由 `apps/model-request-acceptance` 的可信启动/更新流程调用；普通 runtime 只获得读闭包，不能从服务键取得发布能力。框架直接消费者可以显式采用这些存储原语，但必须自己承担授权及同库前提。此写面不执行 registerOfficial、资产分享、治理权限或复制协议，不把开发验收控制台变成产品治理 API。将来采用 asset-governance 实际写源时须明确迁移/映射与单一权威，不能让两份独立资产表都被称为当前。

内部调用权限由装配只向获准 runtime/context 交付读闭包承担，不以裸 tenant 参数授予权限，也不将 Cordis isolate 当沙箱。membership 的当前事实复用现有 OG2；本节点不存第二份 membership 表、不以可注入 true 谓词代替。无本机真实治理权威或已明确采用的副本时不开放此能力；本候选没有另一个副本协议可用。

## 实际存储对象与发布点

表/列是候选物理绑定，不是新领域契约。所有表由本节点维护，同一 AtomicStorage 实例；身份键用既有规范交换表示。正文与值用 CB3 严格无损 JSON 文本，禁止 SQL JSON 提取先舍入。版本号比较复用现有公开 `ExactDecimal.from(value).compare(other)` 和 `isInteger`，不转 Number、不展开指数个零；内部连续序位/修订用精确整数，不借文本字典序判最新。

| 表（候选） | 最小列与约束 | 写入者与权威 |
| --- | --- | --- |
| `evaluation_input_head` | `store_key` 主键、`revision`、`factory_manifest` | `publishLocalInputs`；显式部署 official 集合与当前局部源修订。缺行是未发布，空 manifest 也须通过部署完整性核对 |
| `evaluation_input_asset` | `(store_key, asset_id)` 主键，`metadata`、可选 `draft`；capability/origin/owner 等来自 AM3 同一记录 | 发布面；资产记录元信息，不包含第二份属性声明。draft 保真但不用于版本选择 |
| `evaluation_input_version` | `(store_key, asset_id, version_position)` 主键，完整 `version` 无损文本；外键到 asset，RESTRICT | position 是从 1 连续的内部精确序位，须与 version.number 精确相等，避免 2 与 2e0 成两个键。发布面只能追加连续版本；整条已发布内容不可改删，含 publishedAt/publishedBy，不只比较正文 hash |
| `evaluation_input_scope` | `(store_key, layer, scope_key)` 主键，完整 `holdings` 无损文本 | 发布面一次替换该层当前集合，含 versionSelection/assignments/since；**存在且空**是确知空，缺行是不可读/未建立，不补空 |
| `evaluation_input_recipe` | `(store_key, session)` 主键，`tenant`、`standing_at_creation`、`root_definition`、可选 workspace、会话 assignments、创建时来源诊断 | `captureSessionRecipe` 只插不改。根能力固定，创建时 root source 只作来源记录；S-66 不据它钉住未来根版本 |

`store_key` 为装配明确绑定的本地源身份，不从环境默认推导。读者只查该源内本会话租户的 factory、organization、tenant 范围，以及由实际 recipe 指明的其他范围；definitions 只取这些持有所需记录，不把别租户未被持有的定义作为“可多带”输出。

发布在一次 `atomic`/`unit.mutate` 中：先取本节点按 store_key 的哨兵，再锁定已有 `evaluation_input_head` 行（首次在哨兵后建行），然后核预期 revision、AM3 结构、既有版本前缀完全不变、追加连续、持有引用与角色范围、factory manifest 完整且 meta 锁正确；写资产/版本/层记录并推进同一 head，确认后才返回。factory 集合与装配实际部署的官方资产清单精确对照，该清单由可信装配显式给定，不能由发布请求自称“齐全”。新版本及需要同步调整的配值可以同批提交。没有多个文件落盘后再补“已发布”标志的窗口。预期修订冲突或非法输入明确拒绝，提交未知交调用者读修订核对，不自动重试；不能以 timeout 声称回滚。

发布技术拒绝以明确错误与阶段交调用方，不扩充 S-66 的失败枚举；读取外部损坏/来源矛盾按 S-66 unavailable。非法静态配置、制品或迁移启动失败，与本批政策一致；非法发布内容拒绝该批，不静默修补或改成全空。

**共同对象**：本节点所有可变发布者都在 `evaluation_input_head(store_key)` 与其目标表同一提交排序，旧/新 fiber 的发布也不能靠各自内存锁避开它。资格读取使用 OG 的实际 membership/organization 持久事实，经公开参与面和同一 SQLite 事务取得；撤销写者也在同一库的写事务上相遇，本节点不复制列名或另造资格影子表。跨库部署没有此保证。本节点与 manifest/SessionLog 没有同一提交要求。

会话租户的映射仍由 session-tenancy owner 写。验收装配先用其允许的真实种子入口提交映射，再调用本节点捕获；两步不冒充一次会话创建领域事务。中间缺 recipe 的读取 unavailable。映射一经成功不改，故捕获前在事务外取得 holdingTenant 后，不会在下一事务变成另一租户。`./seed` 对新验收 app 的允许范围必须由原 owner 更新采用，EIS-4 在此保留。

## 完整动作链

### 初始资产、配方与赋值

1. 验收装配安装真实 account/organization-governance、其 clock 等依赖和同一 SQLite；通过真实公开治理操作建立本地有效 tenant。它从本次实际创建结果取得身份，不用临时 tenant 字串或恒真 membership 替身。
2. 装配显式给出部署 official manifest，发布 root 资产 A 的第 1 版完整正文及实际引用资产。各层 holdings 显式带 versionSelection 与 assignments；没有组织/租户持有也写确知空的层快照。AM3 通用校验后根正文调用 AD1 窄判定，正文未知字段完整保存。官方件缺项不能悄悄通过。
3. 装配提交真实 session→tenant 后调用 captureSessionRecipe。函数先核 holdingTenant，再在一个 atomic 单元内调用 `memberships.participate(unit).standing(tenant)`；非 effective/读不到不捕获。recipe 已存在时，只将请求中的创建字段与其原值比较：相同交回原捕获事实，不同明确拒绝，不拿新角色覆盖。首次捕获才读取当前局部源并核创建 recipe，把这次真实 standing、root 能力、会话创建配值与 workspace 状态一并只写一次；两路首次捕获在主键处排序。
4. 本次无挂载工作区、无动作集的真实 recipe 可走完整模型设置链。需要 workspace/mcpActionSets 而无其真实来源时，在明确阶段拒绝，不能改写成“未挂载/无动作集”。初始 selectModel 的日志记录另由验收应用调用 runtime 创建，发布根 model 不代写初选。

### 每次读取与根版本选择

读者先核参数形状，并用真实 sessionTenancy 验证归属；它不在本节点事务内嵌套调用普通 holdingTenant。进入一个 atomic 单元，依次 query recipe 与 head、调用 `memberships.participate(unit).standing(tenant)`、读取完整本地层集合和所需资产/全部版本。当前资格只作资格门；**input.standing 使用捕获值**，不会把成员此刻角色写回会话。单位内各查询串行 await，不并行运行 StorageUnit 的子操作。退出前把这次全部源值无损复制为操作自有快照；后续纯选择、正文提取与求值准入只读该副本，不再次 IO，不延长 SQL 写锁到纯计算阶段。

持有资格按 AM3 的公开表示与真实同快照关系核对：official 必须指 official；owned 必须确实属于该层；organization 必须有组织所有权或同实现的有效外层持有。已知外层资格消失按 AM3 不交失效持有；来源不可判不能当作合法不存在。共享/工作区等受限来源遇到后整体 unavailable，不能过滤后悄悄继续。

根源选择复用 [AE4 候选公开组件](../../core/asset-evaluation/v4-design.md#正文读取前的根来源选择) `selectEvaluationRootSource`，其输入/结果按该 owner 的精确设计。它与完整 evaluate 共享第 1 步的禁用、usableBy、替换层序与锁、versionSelection；只表明根来源可选，不证明完整 C1～C16。missing/invalidInput/unavailable 均使本次端口 unavailable，保留诊断区别。**不得在本节点复制选择算法，也不得先 evaluate 一个伪造空 root 再据结果补正文。**

按选定 `(asset, version)` 从已读取的实际 version 取得同一份 `AssetContent.body`；经 AM3 通用核对、CB3 `readOpaqueJson`、AD1 候选 `extractAgentDefinitionInputs` 得 references/attributes，source 取这条实际记录的资产号与版本。根无可确定源、指定版本缺失或正文读不到即 unavailable，不能用创建时旧正文或草稿补齐。完整 input 构造后，调用**已有 AE4 evaluate 作本次纯准入**；invalidInput、compositionCycle、categoryUnsupported 及真实正文构件不可用均使端口 unavailable，保留原失败类别/阶段；程序缺陷不伪装成领域拒绝。只有求值成功才交回原拥有的 `{ input }`，不返回 E、不缓存成功作后续默认值。该次 evaluate 检查纯输入，不补证 IO、权限、不可变正文或任何 PRE 来源保证。

runtime 在成功返回后仍对这份 input 调用 AE4 evaluate，承担其设置消费、必需时限缺席及零 HTTP 的收场。装配为两次纯计算绑定**同一采用版本和同一纯 BodyContracts 构件集**，使用同一份自有源快照的值，不在两次之间重读外部事实或更换正文解释器；防御性复制不得改变值。根合法空 attributes 不在 provider 补值，可选 model 缺席也不在此视作失败。不同读取之间允许发布发生，已返回的 input 保持那次值；没有承诺从读取到 HTTP 之间冻结所有源。

两次完整纯计算是本轮明确成本，EIS-V8 记录生产者准入与 runtime 求值的次数、耗时及输入规模；不伪称只求一次。同一用例还须从真实事务边界量测 atomic 申请至实际取得 SQL 事务锁的排队时间、取得锁至实际提交/回滚释放的持锁时间，关联本次相关持有数、资产数、读取版本数与版本正文总字节数；覆盖不同发布规模及有竞争的读取，不能以两次纯计算耗时反推 SQL 成本。测量不记录正文内容，不新增缓存、validated-input 包装或另一套输入 judge；确有成本证据后由对应 owner 提优化再走采用。

**两个调用方不混用**：runtime S-66 按当前持有选择根；registry refresh 的既有固定原根配方属于它自己的输入规则。不得让该调用借 S-66 暗更新固定配方，也不能为了让旧根通过 C16 把 current 持有改 pinned。需要固定原根的调用若与实际持有选择冲突，应按其契约失败/由 owner 重组，不由本节点兼容修补。

## 支持范围与拒绝边界

| 来源 | 本轮实际绑定 | 无法满足时 |
| --- | --- | --- |
| 当前成员资格 / 捕获 standing | OG2 当前资格同原子单元读；捕获值在 recipe | 当前 ineffective/缺记录/不可读均 unavailable，不更新捕获角色，不向中心补查 |
| official/owned/organization 本地持有与配值 | 本节点明确发布的本机权威集合，当前 SQL 行；组织来源追到真实所有权或当前外层同资产 | 不判明或所需层未初始化 unavailable，不能补空 |
| shared 及沿 shared 得来的 organization | 尚无分享、关系与建立时刻的完整公开同快照读取绑定 | 整次 unavailable，EIS-3；不实现分享判断的新副本，不将未知持有删掉继续 |
| workspace | 本轮正常路径明确未挂载；已挂载必须有真实文件与挂载来源 | 已挂载而来源未实现 unavailable，EIS-3；不以 SQL 自报路径冒充 PRE-5/PRE-7，不把 carrier 的第 1 版当永久不可变 |
| mcpActionSets | 模型设置读取正常输入明确不带本次动作集；本端口没有 attempt 身份 | 需要尝试动作集的调用不由该端口承接，EIS-3；不提供空 fetched 快照，不声称执行权限就绪 |

上述范围不扩大 AE 对 Connector/sub-agent/plugin 正文的既有支持；pure evaluate 的真实不支持分支仍可到达。完整治理 UI、中心/据点复制、工作区同步与 Agent Loop 均未因此交付。

## 对存储提供者的要求

| # | 要求与条款 | 本轮承接 / 外部 owner |
| --- | --- | --- |
| EIS-R1 | AE4 PRE-1/PRE-3、runtime3 S-66：资格、recipe、层持有和版本处于同一有效快照 | 同一个 AtomicStorage 实例、D-042 SQLite BEGIN IMMEDIATE；OG participate 必须 assertStorage。同库相干保证不等于普通 query 类型；PG 未准入 |
| EIS-R2 | AM3 S-8/S-9/S-18：记录身份、版本连续不可改、持有单值；发布全有全无 | head 行/哨兵序列化 + 一次写事务；PK、版本→资产 RESTRICT 外键、严格 JSON 和事务内前缀比较；唯一约束显式命名沿 core/storage P-11 |
| EIS-R3 | S-66：所有成功声明来自实际持久内容；确定空与缺源不同 | 必要 scope 行显式存在；全部版本正文随事务读取，不回调文件/网络补；无独立投影缓存 |
| EIS-R4 | S-66 捕获前提、session-tenancy2 S-6：recipe 不可改、重开不改租户与捕获事实 | 只插不改 recipe；sessionTenancy 先真读，映射单调不变；不要求两个 owner 的创建跨事务原子性 |
| EIS-R5 | S-66 失败/撤除：必要 IO 不可用可识别，事务实际结束才释放 | core/storage 四型失败与 AtomicStorage 污染/排空规则；只映射声明不可用和输入来源错误，无关程序缺陷继续显式暴露 |
| EIS-R6 | 版本/配方重开耐久、迁移/恢复可识别 | 沿 P-7 与 D-027 NORMAL 边界；装配合成迁移，升级确认前不受理；不宣称断电不丢 |

资格与输入事实需要同一约束域的要求也应由验收装配及 OG 消费采用记录互指；本节点不修改另一 owner 的设计或让不同存储实例“碰巧同文件”绕过 assertStorage。

## 状态、失败、观测与成对装卸

无后台轮询、追尾器或过期缓存；权威状态只有上述表与治理事实。读准入前校验参数，缺闭包/当前源/捕获配方、资格失效、跨租户、版本内容不符、无法证明一致均 unavailable；畸形端口参数 invalidInput。严格内容校验拒绝保留原阶段，不归类为模型上游错误。源结构程序缺陷不 catch 成“缺模型”；消费者按 S-66 维持零发送和原调用状态。

按 [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md)记录 read/publish/capture、源修订、session/tenant、根实际 asset/version、资格检查与根提取阶段、实际事务结果；完整正文、配值原文、凭据不入日志。诊断端口与保留/尺寸由装配显式配置；观测故障单独显露，不变更业务提交结果、不虚报读结束，不以诊断代替源表。

| 取得的资源/贡献 | owner、可用时点 | 部分失败 | 撤除 / 仍为真 |
| --- | --- | --- | --- |
| 迁移与 storage/OG/sessionTenancy 依赖 | 装配持有；迁移/升级确认后开放应用准入 | 配置/制品非法启动失败；依赖缺席插件 PENDING | 本节点不关闭借来的 DB/clock/治理服务，不删除本地事实 |
| `currentEvaluationInputs` 单一读服务 | 一个 fiber 必需 inject storage、memberships、sessionTenancy；schema 构件构造成功后 provide | 部分构造未就绪不发布；provide 纳管为待核对主张 | 一个组合 effect 关闭准入；旧引用新调用 unavailable；无事件订阅/定时器 |
| 正在执行的 atomic 单元与 Promise | 每次操作持有；storage 拥有实际事务，发布方/调用方 await 全部 Promise | 异常经最外层收口，污染单元不可提交；不把子任务脱离 | 取消请求或停止等待不取消已进入事务；跑完实际提交/回滚/只读结果再释放，不能提前标静止 |
| 发布闭包与诊断端口 | 可信装配持有；不作为 runtime 服务公开 | 发布/观测各自故障具名可见 | 装配先停新发布/读取并等实际在途，最后关闭 OG/storage；重开重新建闭包，记录保留 |

Cordis 4.0.4 采用 D-025。basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)、[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)、[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)分别约束依赖、重跑、启动失败与清理顺序，均有已有 probe；不是本节点证明。`ctx.provide` 纳管沿 kernel-basis 的待核对主张，本节点真实宿主测试另做。发布/读没有内部重试、退避或默认时限；装配停止等待若有策略必须配置，不写死期限。

## 关键选择与反例

| 选择 | 落选方最强论证 | 本方弱点 / 复查信号 | 置信度 |
| --- | --- | --- | --- |
| 一个有状态 SQL 源插件，独立读闭包与受限发布子入口 | 沿历史 E 能少建源；将每类事实拆插件可分别更新 | 新源必须建立真实写入与所有权；与完整治理源接入时须重新明确唯一权威 | 高：历史 E 不能回答无 reload 配值变化，S-66 要真实当前输入 |
| 复用 memberships 公开参与面，同 SQLite atomic 读取 | 自建资格表或恒真谓词接线简单；普通 standing + ReadTx 可并发读 | atomic 当前占写者通道，可能影响并发，需要实测；PG 不能自动支持 | 高：现有 D-042 真实组合保护相干快照；独立读会留下资格/配置混合窗口 |
| 捕获 standing/会话配值，另现查资格；当前持有选择实际根版本 | 每次刷新角色/固定旧版本可简化输入组装 | 维护捕获值与当前资格两种事实；registry 固定配方不能直接复用 current 读 | 高：分别兑现 S-66 和 AE4 PRE-3/C16，不借旧捕获放行或改写配方 |
| 复用 AE 根 selector/完整 evaluate 准入与 AD1 提取 | 新公开输入 judge 可省掉一次完整计算；就地选择根也少一个 API | 当前两次纯 evaluate 增加计算成本，须量测；根 selector 尚未实施 | 高：选择算法不复制，完整失败沿同一实现；先正确交付，再凭实测考虑复用优化 |
| 明确 no-workspace/no-MCP 的正常输入，其余无来源则 unavailable | 给空集合能让演示覆盖更多调用路径 | 部分会话不能使用此节点；需要明确受阻消费者 | 高：缺来源与合法空不同，不能用演示抹去 PRE-2/PRE-7/PRE-8 |

反例一：读完有效资格后，另一事务撤销成员并改层配值，随后取新配值。两独立事务可拼成现实中从未同时有效的输入；本轮同 atomic 使撤销排在整次读取之前或之后。反例二：读取 current 的 v1 后发布 v2，再把 v2 source 配 v1 声明；本轮版本查询与实际正文在同单元，三者不可混拼。反例三：两个发布者用同一预期 revision 追加不同 v2；两者必须在 head 及版本主键相遇，恰一批成功，不能各自提交不同正文。验证须真实运行这些交错及去掉保护后的负控。

## 实施缺口与消费者影响

| # | 缺口与条款 | owner / 受阻范围 | 闭合条件 |
| --- | --- | --- | --- |
| EIS-1 | S-66 来源1与 AE4 S-6/C12/PRE-3 已区分捕获配方和当前资格；精确采用状态见 catalog，实际组合仍未验 | spec 接受者、本节点与 OG owner；全部 S-66 消费 | 精确采用后 EIS-V3/V4 验证捕获角色不变、当前失效拒绝；契约对齐不等于真实保证 |
| EIS-2 | AE4 根 selector 与 AD1 实际公开提取构件尚未实施采用；完整纯输入准入沿现有 evaluate | core/asset-evaluation、core/agent-definition owners；本节点实际读路径 | 精确制品与同一 BodyContracts 接线、真实 C16/PRE-9 反例；不抄 schema/选择算法，不新造输入 judge |
| EIS-3 | shared/沿 shared 持有、已挂载 workspace、尝试动作集来源未实现 | 对应资产/工作区/MCP owners；这些分支 unavailable | 后续真实来源及同快照/来源证明被采用；本轮只验明确无这些源的正常模型输入 |
| EIS-4 | session-tenancy ./seed 原允许范围尚需采用新验收 app；完整会话创建产品写面仍无 | session-tenancy owner/主线、apps/model-request-acceptance | 更新明确导入范围并跑真实映射+捕获两步；不中途声称是产品会话创建事务 |
| EIS-5 | 同库 SQLite/D-042 是当前范围；PG/跨库/据点副本没有相干读取采用 | storage/治理/主线；这些部署无法使用此提供者 | 独立决定/提供者协议及真实竞争证据，不从 AtomicStorage 类型推保证 |
| EIS-6 | 新节点未实现，无真实来源、发布、重开、生命周期及零 HTTP 证据 | 本节点、runtime 与 apps/model-request-acceptance | EIS-V1～V10 全部适用项实施和独立验收；绑定只在实际运行后登记 |

归 `apps/model-request-acceptance`：安装真实 account/OG/clock 与同一 storage、建立有效 tenant、session 映射允许入口、明确 official 部署集合与初始根/层数据、发布权限与内部读闭包边界、升级确认后受理、显式 selectModel、诊断配置及逆依赖关闭。新应用仍是模型纵线技术验收，不声明完整治理 UI、Agent Loop 或生产据点同步交付。四层状态和测试状态分别见 README、verification，起草不代替独立评审或接受。
