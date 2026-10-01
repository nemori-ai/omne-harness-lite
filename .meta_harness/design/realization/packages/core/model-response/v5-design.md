# model-response v5 公开接收增量设计

2026-09-27，rev 1，**candidate，未采用、未实现、未验证**。节点仍为 `packages/core/model-response`（kind: provider）。本页是原节点的窄增量；原 [design.md](design.md)、[v4-design.md](v4-design.md)、[README](README.md)、[bindings.yaml](bindings.yaml) 与 [verification.md](verification.md) 保留各自历史范围。本次已读机制，**不声称双盲**。

## 分层状态与精确输入

| 层次 | 本增量的事实与限制 |
|---|---|
| 语义接受 | **无 MR5 接受。**`omne-harness-lite-design-2026-09-15 · data.model-response · 5`（下称 MR5）及 `capability.model-request-runtime · 5`（RT5）在 catalog 中均为 candidate、acceptance 为 null。规范成稿和独立表达评审不代替接受 |
| 可实施范围 | 本页给出 MR5 完整纯值接收、固定 Schema 图、显式版本入口与制品责任的候选。须主线接受精确规范和提供者投影后施工；外部事实门只阻断相应消费链，不把本包扩成运行时 |
| 绑定证据 | **新增 0 条。**本页的 MR5-PV1～PV9 是待实施证据义务；现有 MR3 测试绑定不换标签，规格探针不冒充生产实现 |
| 实际验证 | **本增量尚无产品运行。**没有 v5 源码、独立制品、双语示例执行或真实 IO 证据；设计结构检查只证明其实际检查范围 |

前身为既有 TypeScript 纯模块。D-062／D-065 接受原节点；MR4 及其提供者精确采用由 [D-078](../../../../record/decisions/model-main-integration-coordination/decision.md) 承接历史模型 D-070／D-071，原 [提供者采用](../../../../record/decisions/model-value-provider-adoption/decision.md) 明定根/schema 为 MR4、显式 v3 保留。历史设计页上的“candidate／尚未实施”按当时事件读取：本次现场源码 `packages/core/model-response/package.json`、`src/index.ts`、`src/judge.ts`、`src/schema.ts` 已有 MR4 根及 v3 子入口，本稿不把目录存在当作 MR5 验收。

| 本次候选输入 | SHA-256（供核对，不是接受凭据） |
|---|---|
| [MR5 contract](../../../../spec/data/model-response/v5/contract.md) | `c4cba40c4cbe9bf0c725cb47d0587d9672fb058a456ef14925dcce638eba065e` |
| [MR5 Schema](../../../../spec/data/model-response/v5/model-response.schema.json) | `acfd0652805dcecc3e97b34a39375eda9042044fc42fe64b0dc83d1af18ec8d7` |
| [MR5 规范实例](../../../../spec/data/model-response/v5/examples.md) | `2f66ca0cdc0065101494e8d03f47a731984179bc28043333e38d12151d0c645d` |
| [RT5 contract](../../../../spec/capabilities/model-request-runtime/v5/contract.md) | `21c3ef25ae703c7230b709f5a445bdd8daad9d9a808784c8824b2f98878a733e` |
| [头事实交接提案 rev 1](../../../../record/proposals/model-request-adaptation/header-handoff.md) | `96749d7d17e05558525b85294d478d5f0119416fbc9f5a7eb8e2a83174277f01` |

下文 S-n 均指 MR5；RT5 只提供消费背景，不成为本 data 包的规范依赖。38 条中增补为 S-20/S-26/S-27，其余 35 条沿原字节；需求范围继承该契约列明的 PF-013 rev13、PF-009 rev8、PF-004 rev12、PF-012 rev15、PF-001 rev19、PF-011 rev4、PF-010 rev6，不重采纳新版产品。完整实例为原 58 加新增 19，共 77；其规格检查状态从 [MR5 验证入口](../../../../spec/data/model-response/verification.md#2026-09-27-v5-多值响应头候选验证) 读取，不升级为本包证据。

## 实现路径与公开采用账本

继续使用原纯模块、content-blocks 的严格无损 JSON 与公开 Schema runtime、call-accounts 的 `ExactDecimal`。现有 runtime 源码通过 `ajv` **8.20.0** 的 Draft 2020-12 入口编译固定资源；该版本沿现有锁定依赖，不新引运行依赖、fork、时间服务或网络查询。没有需要 Cordis 承接的身份、状态、资源或运行生命周期；全局采用仍为 [D-025 的 Cordis 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)，本节点不使用其 API，也不依赖 basis 的生命周期主张。

以下新增路径、类型及内部函数均为**候选**，不是现存 API。主线本次已限定采用形状 A，待审的是它的具体兑现，不重新选择根升级。

| 路径 | 最强理由与代价 | 本轮结论、弱点与改票条件 |
|---|---|---|
| A：原包显式 `./v5`、`./schema/v5`，根及旧子面保持精确采用 | 每个实际消费者可独立说明使用 MR4 还是 MR5；同进程可对同一数组响应取得不同合法域判定 | **按主线账本起草，置信度高。**成本是多版构建、类型与资源闭包测试。若全部现存消费者另行明确采用 MR5，才重审默认根迁移 |
| B：整体根升级 MR5，旧消费者显式迁到 MR4 子面 | 默认入口最直接，未来只维护一个推荐文档入口；能统一新消费者 | 必须找到并迁移全部实际旧消费者，且新增 MR4 子面；现账本没有这种传播授权。根升级后相同 import 会改变数组拒绝结果，不能以“扩域兼容”代替采用 |
| C：另开 MR5 provider 包 | 发布及依赖完全隔离，不抽动旧包私有实现 | 没有新能力/生命周期，重复同一数据 owner、无损构件和依赖维护。只有真实独立分发/所有权需求成立才重审；本轮不新包、plugin、service 或 fiber |

| 公开入口 | 实际基线／候选落点 | 采用与发布义务 |
|---|---|---|
| `@omne-harness-lite/model-response`、`./schema` | 既有 `dist/index.js`／`.d.ts`、`schema/model-response.schema.json` | **仍精确 MR4**；根类型、拒绝优先级、完整原 Schema 和 `$id` 不改成 MR5 |
| `./v3`、`./schema/v3` | 既有 `dist/v3/index.js`／`.d.ts`、`schema/v3/model-response.schema.json` | 仍精确 MR3；其原依赖闭包保持；`./schema/v2` 原完整资源保留，不新增 `./v2` judge |
| `./v5` | 候选 `src/v5/index.ts` → `dist/v5/index.js`／`dist/v5/index.d.ts` | 完整 MR5 类型、Schema 查询/校验面、`judgeModelResponse`；不得 re-export MR4 judge 冒充 MR5 |
| `./schema/v5` | 候选 `schema/v5/model-response.schema.json` | 原规范**完整字节**及原 `$id`；无注解清理、引用重写、头值转换或私有相对路径消费 |

现 `package.json.files` 已包含 `dist`、`schema` 和两份 README；候选新增 exports 的 types/import 两支与 JSON 入口，复用 `tsconfig.build.json` 的 `src/**/*.ts` 声明构建。发布者仍需在实际 pack 中证明文件到场、完整闭包可解析、声明不引用未发布私有文件；源码 include 或 exports 文字不能代证。根 API 不新增 v5 隐式别名，也不按输入缺字段、头值形状猜版本。

## 契约责任到公开实现的投影

| ID／契约责任 | 公开操作或类型（v5 均候选） | 具体兑现点与版本 | 符合性依据或缺口 |
|---|---|---|---|
| MR5-P1：S-4～S-15、S-17～S-20、S-35～S-38 的完整单文档表示 | `ModelResponse` 及全套类型；`judgeModelResponse(value: unknown): ModelResponseJudgment` | 继承 MR4 完整条件联合、无损值、绑定精确比较；仅 RawResponse.headers 扩域，不丢回复/归属/费用等成员 | PV1～PV4；不是只校验一个 header DTO |
| MR5-P2：S-20/S-26 头表示 | `RawHeaders`、`RawResponse`；`validate('RawHeaders', value)` | `RawHeaders = Readonly<Record<string, string \| readonly string[]>>`；RawResponse 保留 headers/body 至少一项的联合；对应 MR5 `$defs` | PV1/PV3；readonly 不证明调用方值已深冻或来源合法 |
| MR5-P3：S-26 完整 Schema | `schemaId`、`SCHEMA_DEF_NAMES`、`SchemaDefName`、`SchemaValidation`、`validate` | 固定 MR5 Schema 图；公开 validate 使用完整原资源，不用私有成员阶段视图替代 | PV1/PV5/PV6；Schema 不给有序拒绝，也不检查全部写方事实 |
| MR5-P4：S-27/S-28 | `judgeModelResponse`、`ModelResponseRejection`、`ModelResponseJudgment` | 共享既有有序判定，版本固定的成员/完整 validators；返回冻结的 `{ok:true}` 或 `{rejected:原闭合集合值}` | PV2/PV4；不返回 owned 响应、不把拒绝解释为 failed 或零次发送 |
| MR5-P5：S-6/S-9～S-11/S-26 的副本与外部引用 | 同一公开 Schema 面，七项依赖的公开类型与资源 | 本包单向执行 MR-1 五组断言投影比较；各完整资源仍逐字节原样 | PV5；没有 reverse 包依赖或通用动态注册表 |
| MR5-P6：S-16/S-17/S-20～S-25/S-35～S-38 的写入/来源事实 | 本包不提供取头、脱敏、capture、日志读取、结算、Clock 或诊断事件 | transport、runtime、共同 codec、完整响应写方和宿主沿 RT5 S-17/S-54/S-58/S-59/S-64 承接 | X1～X4；本包成功不关闭 G6/G28～G31/TL-G1 |

v5 导出的完整类型名称沿现有 `src/types.ts`：`AttemptId`、`ModelCallId`、`RunId`（从 call-accounts 重导出）、`ResponseId`、`ModelCallRef`、`ReplyDisposition`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、`Route`、`ResponseOutcome`、`UpstreamError`、`Failure`、`Timing`、`RawResponse`、`ModelResponse`、`ModelResponseRejection`、`ModelResponseJudgment`，另增技术别名 `RawHeaders`。共享含义从既有精确公共类型复用，不新立词条、身份或失败值。类型必须保持原各 outcome 的互斥条件、Run 有无与 attempt/late 关系；不能用无条件可选字段或断言替代联合。

`SCHEMA_DEF_NAMES` 精确列出 MR5 的 **17** 项：ResponseId、RunId、AttemptId、ModelCallId、ReplyDisposition、ModelCallRef、SelectedBy、CredentialScope、Route、ParameterAdjustment、ResponseOutcome、UpstreamError、Failure、Timing、RawHeaders、RawResponse、ModelResponse；`SchemaDefName` 从该静态清单导出。`SchemaValidation` 仍只有 `readonly valid: boolean`；`validate(defName, unknown)` 返回该冻结结果。未知 defName 的非法 JS 调用沿原具名 `TypeError`，不降级为业务拒绝。

### 原形、无损与接收责任

同一 headers 对象可混合 string 与有序 string[]；数组的次序、重复项和空字符串、空数组、空 map 均合法。`raw.headers={}` 与 headers 缺席不同，`raw={}` 仍非法，`raw` 缺席不补任何空值。数字、布尔、null、对象、嵌套/混合数组为成员形状错误。不得 join、取首、删空、去重、排序、trim、stringify 数组或拆逗号；不引入头名格式、大小写归一化、碰撞或 HTTP 线序政策。合法字符串 `"[\"x\"]"` 不被重解释成数组，它可能是真实原串，也可能是上游写方损坏事实；core 无从替代来源证明。

现有 `src/json.ts` 通过公开 `writeJsonLossless`／`readJsonStrict` 得到严格无损快照。本版沿该边界检查 unknown，不调用自定义 getter/toJSON，不修改/冻结调用方原对象；内部分离副本只在本次判定使用，不保存到全局缓存。无损金额、计数、配置值与 opaque JSON 保持原 `LosslessNumber`／`ExactDecimal` 路径，不经普通 JSON stringify/浮点 round-trip。JSON 表示 TypeError 继续变成 malformed／valid:false；未知对象陷阱或内部缺陷的异常沿原边界传播，不能吞成成功或捏造业务故障。

judge 的 ok **不是类型谓词、捕获返回值或拥有权转移**，调用后原可变输入仍归调用者。需要跨 await/持久化持有值的 runtime/codec 必须在自己的已采用边界先完成自有无损捕获、完整判定及后续所有权，不以 `ok` 加类型断言把未知对象当作 owned ModelResponse。本节点不发明一个缺乏采用依据的 capture API，也不承担 RT5 自有不可变 rawHeaders 的生产责任。

### 实现拆分与拒绝次序

候选拆分为 v5 的 `types.ts`、`schema.ts`、`judge.ts`、`index.ts`，沿既有包风格。版本相关 Schema 和公开 type 入口独立；不让 MR5 导入根 schema 后按需放宽。未变叶类型直接复用 MR4 的精确公开声明；ModelResponse 在**分配到每个原联合分支后**只替换 raw 类型，或等价复用本包私有公共形状构件，必须经类型正反用例证明未压平条件联合。不得将 `Omit` 对整个联合的一次操作当作已证明保留所有分支。

算法复用限定为已有 `snapshot`、精确金额/JSON 相等和 S-27 有序判断。可把 MR4 judge 的同一有序内核抽为本包私有纯函数（候选），以固定的 outcomes、causes、成员 validator、完整 validator 显式组合 MR4/MR5；输入不是用户可更换策略，绑定比较仍是原 S-36。两版各持有自己的静态 Schema 编译产物。v3 入口与规则不要求同步重构；没有为不同版本复制一套状态机的理由，本节点原本也无状态机。

| 关键选择 | 落选方的最强论证 | 本方弱点、改票条件与置信度 |
|---|---|---|
| 固定 Schema 加共享有序纯内核，保留完整公开校验 | 全交 Ajv 简洁，完整资源已含大多数条件 | S-36 相等与具名拒绝先后无法由 errors 遍历承担；两阶段视图须组合反例。置信度高 |
| 从现有确定算法抽取最小共享件，而非复制第三份 judge | 全复制不会触动 MR4 的内部组织，容易比较新旧代码 | 抽取可能改变旧行为，必须守住根/v3 的真实回归和独立制品；若不能保持旧行为则暂停抽取并报具体差异，不能牺牲旧采用。置信度中高 |
| 继续纯模块，不注册动态校验服务 | 服务可运行时切换实现、集中观测 | 无独立生命周期；动态换规则会改变精确历史判定。静态消费的升级须明确、成本留在制品测试；真实独立运行责任出现再改票。置信度高 |

有序内核的固定阶段：严格快照 → outcome_unknown → dispatch_zero（精确整数小于 1）→ cause_unknown → 其余独立成员形状/精确量 malformed → reply_missing → reply_on_failure → reply_and_delivered → failure_missing → failure_on_interrupted → failure_on_success → reply_ending_mismatch → first_token_inconsistent → S-36 两处绑定比较及其余无专名跨成员 malformed → ok。头值非法处于成员阶段；合法数组不得盖掉缺回复或 ending 错配。

私有成员 Schema 只延后既有 `ModelResponse.allOf` 与 `Failure.dependentRequired`，保持 `failure.inBand` 在而 statusCode 缺席为最后的跨成员错误，不能抢先于具名 failure_on_interrupted。保留冻结完整 Schema 不动；公开 `validate('Failure', …)` 仍执行它自己的完整依赖关系。公开完整 Schema valid 与 judge ok 可以因 S-36 不同，测试必须区分二者，不从 validator 的首条错误生成拒绝值。

## 七项精确依赖与资源解析

以下均为已接受 data 依赖，与 MR4 的七条 catalog 依赖及 clauses 逐值相同；MR5 自身仍未接受。依赖方向为本包→纯模块，RT5 不反向进入该图。

| 契约版本 | 本包使用的公开面与资源 | 固定责任 |
|---|---|---|
| call-accounts/2 | 根类型、ExactDecimal、`./schema` | Usage/Cost/TrimSummary、三个归属标识，不改未知/零与金额值域 |
| content-blocks/3 | 根类型、严格无损 JSON、`./schema-runtime`、`./schema`；闭包保留 `./schema/v2` | delivered/AttachmentRef、无损捕获和固定编译器 |
| messages/4 | 根 AssistantMessage、`./schema`；其图所需 `./schema/v3` | 原回复与发出记录形状；不新增反向 response 依赖 |
| model-profile/3 | 根绑定/档案/参数类型、`./schema`；闭包保留 `./schema/v2` | 完整绑定与参数值域；不靠推荐版解析历史 |
| loop-extension/3 | `./v3` 的 FailureCause、`./schema/v3` | 八种成因；不能误用该包现根的其他版本 |
| offer-expiry/1 | `./schema/v1` 的 Instant | 时间字符串表示；不把既有毫秒 parser 或 Clock 加入 judge |
| identity-values/1 | 根 ScopeLayerIdentity、`./schema` | 归属形状及身份表示规则；不加 UUID/Unicode 归一化或安全整数限制 |

MR5 Schema 从 `./schema/v5` 自身读取；传递 `$ref` 用现有各包公开 Schema 的原 `$id` 闭包解析，本次静态引用闭包为 21 资源。沿原 schema.ts 已有的明确 root/retained 资源组合和精确 `$ref` 查找，只编译需要的定义；**21 份资源不等于新增 21 个 npm 依赖**，也不要求复制所有外包规范到本包。若依赖根今后升级且现公开版本无法解析目标，先由其 owner 提供精确资源，禁止 silently latest 或私有文件回退。模块不请求网络补资源，不建立跨包可变的全局注册表。

MR-1 五组：本包 ResponseId 分别与 messages、call-accounts；SelectedBy、CredentialScope、ParameterAdjustment 分别与 messages。沿 [原比较口径](design.md#副本定义的对齐放在依赖方)，只在 **Schema 对象位置**排除 title／description／$comment／examples 四注解，其他断言、应用器、引用与映射键保持；const/enum/default 的实例数据及其同名字段绝不删除。完整 Schema 文件各自仍须与自己的规范原字节相同，片段注解不同不等于断言不同。已有额外 droppedParameters 等回归也不因“五组”概括被删。

## 状态、失败、存储与装卸

没有领域状态、异步工作、持久提交点、配置项或环境凭据；**对存储提供者要求为 0 项**。本包不分配 ResponseId、不读写条目、不拥有比较尾/判重/批提交，因而没有本节点跨 owner 同提交存储对象或并发交错。真实写方仍共同触碰既有物理会话日志，由原 owner 验证，不把进程锁或 pure ok 当提交保障。

**受管装载贡献 0 项、撤除责任 0 项。**普通模块导入拥有固定资源编译产物，不向 Context 注册服务、fiber、effect、事件或 observer；没有连接、监听、计时器或后台任务。Schema 编译/模块解析只属于静态制品初始化，缺文件或编译错误必须暴露为构建/导入缺陷，不伪装为 malformed、不自动换版或动态降级。纯函数调用同步结束，不存在由内核取消、排空、迁移或引用计数管理的在途工作。移除新入口需要消费者明确迁移，不影响旧模块引用的历史规则。

沿 [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md)，core 在真实接收边界返回可辨的判定/异常，不自行记录 payload 或 rawHeaders、不创建 trace/log 后端。调用它的 runtime/host 负责将原拒绝与既有因果身份关联；不能把头内容放入诊断 detail、用户展示或模型上下文以“补日志”。纯函数无外部副作用不能证明整条链日志已完整。

## 消费传播、未闭门与归装配

传播沿 [RT5 consumer-impact](../../../../spec/capabilities/model-request-runtime/v5/consumer-impact.md)，按实际消费者显式采用，不以推荐版本、JSON 能存数组或一个 import 修改认作全链完成。

| 缺口／条款 | 负责产物与 owner | 本节点交接及受阻消费 |
|---|---|---|
| MR5-X1：S-20/S-21/S-22；RT5 S-54/S-58/S-59/S-64、G-6/G-31 | pi-ai-transport、runtime 公开函数及真实凭据政策 owner | v5 提供值域，不采集/脱敏/生成自有头。实际同次 send→invoke→完整响应，成功、失败、取得头后取消、门失败保留，秘密哨兵与实际停止均待；不让数组进入旧 MR4 链 |
| MR5-X2：S-6/S-14/S-22～S-25；RT5 S-17/S-69～S-73、G-29 | runtime、共同 codec、外部 persisted 回复与全部结算写方、日志 owner | 所有完整接收、encode/decode、批识别、相等及 reopen 需显式 MR5 采用。D088 的 `mrr/1` 历史格式/新格式与混用尚待共同 owner 裁定；本节点不升级 wrapper、业务键或历史解释 |
| MR5-X3：S-17/S-18/S-35；RT5 G-28/G-30、TL-G1 | loop/Run 事实 owner、会话访问授权/宿主、runtime/回复写方、offer-expiry 相关时间投影 owner | 完整合法前缀、生产 Run 终结、真实时钟来源/合法性与亚毫秒顺序仍是外部门；core 保留原 Timing 表示与 firstToken 存在性规则，不偷加时间真伪/顺序判定或以毫秒舍入放行 |
| MR5-X4：S-9/S-11/S-19/S-36～S-38 | transport、runtime、目录与官方模型验证 owner | 档案适用、实际发出参数/供应商/缓存/费用来源及历史绑定不由完整文档合法证明；37 模型真实验证仍独立，不能以合法头扩大完成范围 |
| MR5-G1：本候选未采用 | 主线、规范与 provider owner | 精确接受 MR5/RT5 及相应提供者后分阶段实现；root/schema MR4、v3 及未选择迁移的其他消费者保持 |
| MR5-G2：纯值源码/制品/文档未实现验证 | 本包实施者、验证者与发布构建 owner | 完成下列 PV1～PV9 后才可声称本包 MR5 接收交付；不等同 X1～X4 闭合 |

本包没有要注入的时钟、密钥、身份或存储；真实运行装配仍由既有 runtime/transport/日志宿主的提供者设计承接，生产完整模型验收装配的选定与接线由主线负责，本稿不新建 assembly。未确定历史格式或必需外部保证时停止对应新消费路径，不能从本包成功补默认值。旧消费者保留是精确采用责任，不另承诺已退役 adapter 格式或任意历史兼容。

## 可反驳验证义务

全部 **未执行**，无新增 bindings。以下是本节点未来实施验收的 oracle；MR5 规格已有有限样本结果、现有源码测试及旧制品结果分别保留原范围。纯单文档投影不新增 TLA+/Alloy，结构检查使用 formal=skip。

| ID／条款 | 必须能失败的验收与边界 | owner／完成证据 |
|---|---|---|
| MR5-PV1：P1/P2/P3，S-20/S-26 | 生产公开 v5 对 **全部 77 完整实例**执行完整 validate 与 judge；Schema 预期 27 接收/50 拒绝，judge 按其各自 oracle，不把 Schema 通过数当作 judge 通过数；前 58 值/预期保持。75 个有具名纯判定预期逐一精确核对；两个只给 Schema 拒绝的旧例不伪造规范专名。新数组完整样本 v5 通过、MR4 根明确拒绝；合法空串/空数组/空 map/缺席逐项区分，raw={} 拒绝 | 本包验证者；实例提取有固定计数并覆盖全文，不能只跑 v4 追加 12 行或新 headers 片段 |
| MR5-PV2：P4，S-27/S-28/S-36 | 坏头值分别叠 outcome_unknown、dispatch_zero、cause_unknown 仍前者优先；坏头先于 reply_missing。合法数组叠 reply_missing/ending/first_token 等按原序。inBand 缺码叠具名失败仍延后；绑定错配叠任一较早拒绝不抢先，完整校验 valid 与 judge malformed 的 S-36 区别保留 | 本包验证者；独立于实现控制流的预期表；原所有 order 回归与 MR4 58 实例、现有包用例一起执行 |
| MR5-PV3：P1/P2，S-19/S-20/S-28 | 可变及深冻结合法输入无变异，数组次序/重复/空形态不变；getter/toJSON 调用计数为零、陌生陷阱沿原异常边界；大整数相邻值、极小金额和配置数值不丢精度。judge 只返回判定，不伪造 owned 值或声称保存输入；公共无损读写组合前后逐值/词法按各自契约核对 | 本包与共享 JSON 验证者；明确快照只覆盖接收时值，不证明跨 await 的调用者所有权 |
| MR5-PV4：P1/P4，完整类型 | 严格编译所有 outcome/Run/Failure/RawResponse 条件联合的正反调用者；MR5 类型支持 readonly 混合头，拒非串值；旧根类型拒数组、v3 原面不变。无 any/断言掩盖 unknown 收窄，无 union 压平 | 本包实施者；真实独立消费者 `.d.ts`，预期类型拒绝需精确定位，不把偶然找不到模块当成功 |
| MR5-PV5：P3/P5，S-26 与 MR-1 | MR5 完整 Schema/$id/17 defs 与规范逐字核对；七依赖与传递引用闭合。独立 Draft2020 validator 对完整实例核 Schema 结果，并与生产完整 validate 对照；不要求它独自实现 S-27/S-36。五组副本只剔指定 Schema 注解，改约束/$ref 或 const/enum 同名实例字段必须检出，片段原 hash 留证 | 本包/依赖包验证者；不得用私有成员视图或数字舍入后的验证器作独立完整 oracle |
| MR5-PV6：公开版本隔离 | **两个 fresh、闭合依赖的公开 pack 消费目录**实际导入 root/schema、v5/schema-v5、v3/schema-v3 及原 schema/v2；无源码/仓库别名和私有路径。两个目录各自核字节/$id、真判定和严格类型；不同导入顺序及变异已导入 JSON 后，固定编译器不串版 | 发布/验证 owner；实际制品内容、依赖和入口可读记录，源码构建成功不足以关闭 |
| MR5-PV7：双语公开文档 | 包 `README.md` 与 `README_ZH.md` 明列 root=MR4、显式 v5、旧 v3，包含重要操作的 literal 示例：完整响应判定、RawHeaders 校验、混合/空值及旧根拒数组。示例用实际公开制品逐段严格编译并执行；成功结果不讲成 owned 或来源证明 | 本包实施者在实现完成时更新两份 README，验证者跑原文例子；不改写旧例为“已验证 v5” |
| MR5-PV8：行为负控 | 隔离实现制品中分别注入：①将新数组头判为单值域或错误拒绝空数组；②判定时改写调用方数组（如 join/删空）；③完整 Schema 抢先压掉原具名拒绝；④v5 错连根 MR4 Schema。基线对应 oracle exit0，每个变体必须真实编译后以指定 AssertionError 非零失败。仅导入/编译失败、超时或误跑原版不算击中 | 验证 owner；PV1/PV2/PV3/PV6 的真实调用者反例，记录变体差分和构建输入；core 不返回头值，因此端到端 array-loss 另归 X1/X2 |
| MR5-PV9：纯模块边界与回归 | 无 Cordis/存储/凭据/HTTP/Clock/全局业务观察依赖，无网络读取 Schema；制品缺资源/编译失败明确暴露。根 MR4、v3、v2 Schema 原字节、旧 judge 行为及全部现有包回归保持，既有 offer-expiry 毫秒能力/其他 core 不被修改 | 本包与集成验证者；真实包构建、类型、规则/格式与合适回归，范围以实际结果为准 |

MR5-PV8 中将数组拼成字符串但只作用于判定内部副本、最终仍返回同一 `{ok:true}` 的“变体”，不能凭无可观察差异假称 core oracle 已证明端到端原形保留。必须分别在可观察的完整接收拒绝/调用方变异边界验证本包，在真实头交接与 append/reopen 边界验证 X1/X2 的 array-loss；两者都不能省。实际采得、脱敏、同批耐久与合法历史认回的行为负控属于原真实 owner，而非本页新增绑定。
