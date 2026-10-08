# #65 现状地图：各包在模块顶层编译固定 Schema（仓库 a7ea39135，2026-10-02）

**取代状态：** 原貌存档。本文件是子代理报告，是模型输出而不是证据；主线逐条核对的结果在 [evidence.md](../evidence.md)，当前该信什么只看 [research.md](../research.md)。

- 执行者与日期：子代理（主会话为 #65 派发的只读调查），2026-10-02
- 调查范围：本仓库哪些位置在模块顶层编译固定 Schema、编译结果怎样导出、哪些测试与设计正文依赖「加载时编译」
- 输入与方法：只读源码与设计正文，基于 `a7ea39135` 的工作树；报告自标「已核实」与「推测」
- 处置的既有结论：首次调查。
- 收录说明：原件 `tmp/test-tiers-mutation/lazy-schema-survey.md`（工作树 `test-tiers-mutation`，Git 忽略），sha256 `a6c782718781985c142109afb34685c27c0ab41ab9c33e76a99b28dfc4388df2`。原文一级标题改为本页标题，原文的二级小节下移为三级；除此之外正文逐字未改，无删节。

## 完整报告正文

路径相对仓库根；「已核实」＝读过源码或原文，「推测」单独标出。

### Ajv 行为（已核实，ajv@8.20.0 `dist/core.js`）

- `getSchema` 当场编译（273-285）；默认 `validateSchema: true` 时 `addSchema` 当场做元校验（435-461），会编译 2020-12 元 Schema。
  只在顶层 `addSchema`、把 `getSchema` 推迟的包，导入时仍付元校验的钱。
- `createSchemaRuntime` 每调用一次新建两个 Ajv 实例（`createExactMetaValidator` 一个＋主实例一个），并对每份资源做元校验（`schema-runtime.ts:63,75,89-98`）。

### 1. 顶层编译的位置

| 包 | 位置 | 顶层做了什么 |
|---|---|---|
| content-blocks | `src/schema.ts:34-49` | `new Ajv2020`、`addSchema`，`getSchema` 22 个定义，存冻结数组 |
| content-blocks | `src/exact-schema.ts:424-440` | **不编译**：只把 8 份标准元 Schema 做无损复制固定下来（`fixedMetaResources`）；`createExactMetaValidator`（442）是函数 |
| content-blocks | `src/schema-runtime.ts` | **顶层什么都不做**；`createSchemaRuntime`（59）调用时才干活 |
| loop-extension | `src/schema.ts:99-102`、`237-241` | **两个运行时**：`runtime` 21 份资源编 43 个；`earlyRuntime`（238）20+1 份再编 43 个 |
| messages | `src/schema.ts:76-89` | 1 个运行时（9 份），编 54 个 |
| model-response | `src/schema.ts:76-81` | 1 个运行时（9 份规范＋1 份 memberSchema），编 25 个公开＋2 个私有成员定义 |
| arrival-events | `src/schema.ts:30-33` | 1 个运行时（4 份），编 14 个 |
| tool-definition | `src/schema.ts:39-52` | 直接 Ajv：3 次 `addSchema`，`getSchema` 21 个 |
| model-profile | `src/schema.ts:34-50` | 直接 Ajv：4 次 `addSchema`，`getSchema` 14 个 |
| call-accounts | `src/schema.ts:62-63` | `compile(false)`、`compile(true)` 两个 Ajv 实例，各 `getSchema` 13 个（函数体 37-60） |
| skill-package | `src/schema.ts:56-57`、`60` | `bind(3)`、`bind(2)` 两个运行时各编 5 个；60 行 `one` 第三个运行时编 `{const:1}` |
| asset-evaluation | `src/defaults.ts:42` | `export const assetJudge = createAssetModelJudge(defaultBodyContracts)` |
| asset-model | `src/judge.ts` | **本文件顶层不编译**；工厂 `createAssetModelJudge`（288-294）每次建 1 个运行时（12 份），编 25 个 |
| client-local-state | `src/record.ts:11-26` | 直接 Ajv：3 次 `addSchema`，`compile` 7 个 |
| governance-client-operations | `src/validation.ts:14-34` | 直接 Ajv：5 次 `addSchema`，`compile` 6 个 |
| tools/asset-registry | `src/records.ts:27` | `assetJudge = createAssetModelJudge(...)`（与 AE 重复） |
| assets/evaluation-input-store | `src/data.ts:44` | 同上，第三份 |
| mcp-endpoint | `src/schema.ts:23-33` | 1 个运行时（6 份），编 7 个，放 Map |
| slash-command | `src/schema.ts:24-27` | 1 个运行时（3 份），编 9 个 |
| agent-definition | `src/index.ts:37-47` | 1 个运行时（8 份），编 1 个（`AgentDefinitionBody`） |
| session-tenancy-table | `src/values.ts:14` | 1 个运行时，编 1 个（`SessionRef`） |
| governance-center-client | `src/governance.ts:18-29` | 直接 Ajv：3 次 `addSchema`，`compile` 2 个 |
| apps/cli | `src/validation.ts:5-22` | 直接 Ajv：5 次 `addSchema`，`compile` 2 个 |
| apps/cli | `src/tui/forms.ts:35-40` | `compile` 表单 Schema，**加载时校验 `forms.json`**，不合格抛错（39），然后 `export const forms = metadata` |
| identity-values | `src/validate.ts:30-31` | 顶层只有 Ajv＋`addSchema`（会元校验）；`getSchema` 已首用并 Map 缓存（35-44） |
| offer-expiry | `src/validate.ts:14-17` | 同上，推迟在 `validate` 内（26-32） |
| governance-center-entry | `src/routing/schema.ts:32-45` | 同上：顶层 3 次 `addSchema`，`entryValidator` 首用并 Map 缓存（47-58） |

不在顶层、但每次调用整套重编：`asset-model/src/manifest.ts:11`、`declarations.ts:130` 每次重新 `createAssetModelJudge`；
`asset-model/src/judge.ts:505`、`skill-package/src/judge.ts:64` 针对作者 Schema 新建运行时（设计要求）；`tool-definition/src/judge.ts:261` 没传 judge 时新建 `createParameterJudge()`。

间接迫使导入时编译：pi-ai-transport `src/official-models/` 下 `anthropic.ts:69`、`google.ts:65`、`openai.ts:76`、`moonshot.ts:59`、`deepseek.ts:50`、`zai.ts:152`、
`xai.ts:58`、`qwen.ts:330` 顶层调 `ownDefinitions(...)` → `definitions.ts:280,283,296` → model-profile 的 `validate`／`judgeModelProfileDocument`。

推测：导入 asset-evaluation 会顺带拉起 tool-definition、loop-extension、skill-package/v2、mcp-endpoint、slash-command 等的 schema 模块，外加三份 AM 运行时。

### 2. 导出形状

| 包 | 编译结果放在哪 | 对外导出、与校验相关的符号 |
|---|---|---|
| content-blocks | 私有冻结数组 `{name, validator}`，`validate` 用 `.find` 查 | `validate(defName, v) → {valid}`、`schemaId`、`SCHEMA_DEF_NAMES`；子入口 `./schema-runtime`：`createSchemaRuntime`、类型 `SchemaRuntime{metaValidate, compile}`、`SchemaValidator{validate}` |
| loop-extension | 私有 `validators`、`earlyValidators` | `validate → {valid}`；`ordinaryShape`（只在 schema.ts 导出，judge.ts:163,278,301 用） |
| messages、arrival-events、slash-command | 私有数组 | `validate → {valid}`、`schemaId`、`SCHEMA_DEF_NAMES` |
| model-response | 私有数组＋`memberValidator`、`pendingMemberValidator` | `validate`；schema.ts 另导出 `membersValid`、`pendingMembersValid`、`responseValid`、`pendingResponseValid`（judge.ts:5-26 当函数值组装进内核配置）、`normativeSchemaResources`（纯 JSON，测试直接用） |
| mcp-endpoint | 私有 Map | `validate` |
| tool-definition | 私有数组（Ajv 函数） | `validate`；`createParameterJudge()` 返回调用方持有的 `{metaValidate, compile, judgeCallArguments}` |
| model-profile | 私有冻结数组（Ajv 函数） | `validate` |
| call-accounts | 私有 `full`、`structural` | `validate`；`structureValid`、`snapshotJson` 只在 schema.ts 导出，judge.ts:11 用 |
| skill-package | `bind()` 返回对象里的私有 Map | 绑定对象 `{schema, schemaId, createRuntime, validate}`；**`validate`、`schemaId` 在导入时从绑定对象上取出**（schema.ts:58-59，v2.ts:25-26），`skillBodyContract.schema = binding.schema`（body.ts:21） |
| asset-model / AE / 注册表 / 输入库 | `AssetModelJudge{judgeAssetValue, validate}` 冻结对象，闭包持 Map | `assetJudge` 模块级值：AE defaults.ts 不经 index 导出；注册表、输入库包内导出，被 registry.ts、tables.ts、registry-history.ts、publication.ts、registry-inputs.ts 引用 |
| agent-definition | 私有 `bodyValidator` | `judgeAgentDefinitionBody` 等 |
| session-tenancy-table | 私有 `validator` | `sessionValue` |
| identity-values、offer-expiry | 私有 Map（Ajv `ValidateFunction`） | `validate → {valid, errors: string[]}`，内部读 `fn.errors`（identity 60，offer 36） |
| governance-center-entry | 私有 Map | **`entryValidator(defName): ValidateFunction` 直接返回 Ajv 原函数**；`conformsTo`、`ENTRY_SCHEMA_ID` |
| governance-center-client | 私有 `envelopeSchema`、`exchangeSchema` | `exchangeGovernance`（91、111） |
| governance-client-operations | 私有 6 个 Ajv 函数，当值传进 `capture(input, valid)`（53、56、59） | `captureAction`、`captureIntent`、`capturePrompt`、`validPreview`、`validReport`、`validInstant` |
| client-local-state | 私有 7 个 Ajv 函数，被顶层 zod `.refine` 闭包引用（62-79） | `validRecord` 等 |
| apps/cli | 私有 `intent`、`report`、`check` | `validIntent`、`validReport`；**`forms` 是加载时校验过的数据值** |

- 直接读已编译校验器的属性只有一处：`tenancy/governance-center-entry/tests/decide.spec.ts:205` 读 `entryValidator('EnvelopeRouteId').schema`。
- 当值传递：`asset-evaluation/src/reader.ts:10` 把 `assetJudge` 传给 `readCarrier(..., judge)`（workspace.ts:16）；`evaluate.ts:73`、`result.ts:41` 类型位置写 `typeof assetJudge.judgeAssetValue`。
- 没有对校验器或 judge 做身份比较的地方。

### 3. 是否有东西依赖「一导入就报错」

- 没有测试断言「schema 坏了导致 import 失败」（`pi-ai-transport/tests/official-catalog.spec.ts:153-186` 断言的是目录或计量绑定缺失，与 schema 无关）。
- 加载时抛错的代码：`apps/cli/src/tui/forms.ts:39`。
- 依赖「工厂构造时就编译」的测试（工厂不能改）：`asset-evaluation/tests/current-loop-body.spec.ts:53-58`（`createAssetModelJudge(wrong)` 同步抛错）；
  `content-blocks/tests/schema-runtime.spec.ts:168-169`（非法资源构造当场抛错）；`schema-runtime.spec.ts:25-37`（导入时固定元资源副本，`fixedMetaResources` 不能推迟）。
- 推测风险：资源的「绑定时刻」挪后。`content-blocks/design.md:175` 规定「修改资源/作者Schema不改绑定validator」；`model-response/v5-design.md:138`（MR5-PV6）要求「变异已导入 JSON 后，固定编译器不串版」，全仓没有兑现它的测试。

### 4. 设计约束原文（`.meta_harness/design/realization/packages/core/` 下）

加载时编译、初始化失败、不发布部分可用图：
- `loop-extension/v6-design.md:78`（D-100）：「模块加载时编译固定 Schema 图；完整编译后提供纯函数 | 模块持有只读验证器；缺依赖/无效资源使初始化明确失败，不发布部分可用图」
- `loop-extension/v7-subject-judgment-design.md:97`；`v4-design.md:64,82`
- `messages/v4-design.md:70`；`v7-design.md:81,91,93`
- `model-response/v5-design.md:108`：「Schema 编译/模块解析只属于静态制品初始化，缺文件或编译错误必须暴露为构建/导入缺陷，不伪装为 malformed」；`v8-design.md:54`
- `call-accounts/v3-design.md:48,55`
- `agent-definition/verification.md:9`
- `tool-definition/design.md:126`：「模块级只有本包自己 Schema 的校验函数，加载时编一次，有界、不变」
- `asset-evaluation/design.md:123`；`asset-model/design.md:109`
- `messages/public-definition-resource-closure-followup.md:16`

允许模块持有编译产物：`model-response/v4-design.md:58`、`model-profile/v3-design.md:62`、`agent-definition/design.md:26`、`content-blocks/design.md:129`、`tool-definition/design.md:41,79-86`。

「no module-level author cache」：`content-blocks/design.md:169`；适用范围由上述模块的当前承诺维护；
`tool-definition/design.md:81`；`tool-definition/verification.md:33`：「编译作者 schema 的 ajv 实例不得出现在模块顶层；本包自己 Schema 的校验函数是有界常量，不在此列」。
含义：以作者／MCP 对端输入为键、随输入增长、无 owner 的模块级编译缓存；不管本包固定 Schema。

spec 区：content-blocks v2/v3 契约与 verification 对编译时机、缓存无要求；`spec/data/tool-definition/v3/contract.md:795` 的「加载时编一次」说的是作者参数 schema。

### 5. 已有的「全部校验器可编译」类测试

经过模块里的校验器：`content-blocks/tests/schema.spec.ts:20-21`（22 个）、`loop-extension/tests/adaptation.spec.ts:47-49`（43 个）、
`messages/tests/schema-graph-v7.spec.ts:40-52`（54 个）、`model-response/tests/schema-graph-v10.spec.ts:42-50`、`current-response.spec.ts:84`（25 个）、
`skill-package/tests/adopted-v3.spec.ts:198-205`、`slash-command/tests/projections.spec.ts:105-108`、`identity-values/tests/schema.spec.ts:29-33`、
`governance-center-entry/tests/basis.spec.ts:110-123`、`asset-evaluation/tests/adopted-v3.spec.ts:20-36`、`current-loop-body.spec.ts:21-23`。

只在测试自建运行时上遍历：`model-response/tests/schema-graph-v10.spec.ts:34-40`、`current-response.spec.ts:89-90`、`call-accounts/tests/v3.spec.ts:94-108`、
`messages/tests/schema-graph-v7.spec.ts:68-77`、`stream-assembly/tests/fixtures.spec.ts:125-136`、`agent-definition/tests/resource-closure.spec.ts:46-59`。

部分：`offer-expiry/tests/schema.spec.ts:32-45`。没有全定义遍历：tool-definition、model-profile、arrival-events、mcp-endpoint（只靠夹具）；
session-tenancy-table、governance-center-client、governance-client-operations、client-local-state、apps/cli（没有相关测试）；
私有校验器：loop-extension 的 `ordinaryShape`（early 那套 43 个）、call-accounts 的 `structural`、skill-package 的 `one`。

## 本轮结论

见上文各节；主线抽查过的条目与核对结果列在 [evidence.md 的 E2](../evidence.md#e2-本仓库在模块顶层编译固定-schema-的位置) 与 [E21](../evidence.md#e21-设计正文对加载时编译的要求)。

## 本轮局限

只读，未计各处耗时；报告第 1 节「推测」一条（导入 asset-evaluation 会顺带拉起哪些 schema 模块）未验证；第 4 节所列约十处设计正文，主线只逐句核对了五处。
