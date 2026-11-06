# W4 上下文包：Cordis 服务定义与 host-local 插件

状态：只读调研，2026-11-06。取证位置：父分支 `PanQiWei/skill-mcp` 头 `9b60aad9e`；MCP 调用口读 `.worktrees/w3-mcp-call`（头 `deb5a977e`，未合入），传输读 `.worktrees/w3-mcp-host`（头 `54a2377cb`，未合入）。路径无前缀者相对 `.worktrees/skill-mcp`。包路径简写：`pk/` 即 `packages/`。本页是事实，不是决定；开波设计的四件事（`waves/w4/plan.md:208` 起的 W4-0）仍待定。

## 结论摘要

1. 必需项（四个先例共有）：每键一个抽象 `Service`，`static readonly provide = '键'`，构造 `super(ctx, <类>.provide)`，导出键常量取自它；JSDoc 写 `@owner <成员路径>`（四个先例都用 `@owner`，没有一处用 `@contract`）；`declare module '@deepseek-ai/cordis'` 增补 `Context`；根入口不导入 Cordis，`./cordis` 是唯一定义入口；`tests/public-entry.spec.ts` 与 `tests/cordis-entry.spec.ts`；`SPEC.md`、`docs/cordis.md`（含 IC 符合性映射与验证义务）。
2. 推荐照 `execution-environment-cordis-contract`（`src/cordis.ts` 240 行、4 键）与它的提供者 `execution-environment-host-local/src/cordis.ts`。不要照搬它的 intercept 调用方类、`CallerClassMismatch`、`operationFaces`（执行环境专有）。
3. 需求端口交付方式（先例一致）：他域实现的端口是定义成员里的独立服务键（接口在契约成员，键与抽象类在 cordis-contract），由装配或适配器插件装载其子类提供；提供者插件对必需端口写 `static inject`，对可缺席端口在装载时的上下文每次 `ctx.get(键)` 现取，缺席答 `unavailable`/`unknown`。不可序列化的本地运行时对象（函数、域）经工厂参数交入，不走服务键，也不进配置。
4. 服务键数：Skill 服务键 3（`PackageInspection`、`SkillCatalog`、`SkillAccess`）；MCP 服务键 3 到 5（`ActionDiscovery`、`ActionInvoker`、`EndpointStatus`；`EndpointInspection` 与 `Connections` 是否要键未定，见 5.3、6）。端口键另算：Skill 2 或 3（`SkillReadCheck`、`SkillResolution`，可含 `SkillPackageSource`）；MCP 4（`AdoptionView`、`UseEligibility`、`CredentialUse`、`ProcessLanding`）。端口要不要建键是 W4-0 的决定，先例倾向要。
5. 一个插件提供几个键：两组的服务共用状态（Skill 共用三端口；MCP 共用一张连接表），先例的第一种写法（插件体里逐个 `new` 子类，共 fiber）适合。MCP 撤除只需在插件体登记一个 effect，其内顺序调用 `closeAll()`，并自己捕获 `AggregateError` 写 `ctx.logger`（Cordis 只记日志，见 3.3）。
6. `EndpointInspection` 不需要服务键：它是 `BodyContract`，资产的类别注册表是普通对象，由消费者 `createCategoryRegistry().register(...)`，资产包无 Cordis 也无键（见 6）。
7. 工具：`pnpm package:template create --group <组> --name <名> --variant service-contract [--write]`；`scan` 查结构、标识、IC-1～5 静态规则；IC-6/9/13/14/16/18/19 仍靠人审，IC-8 无机械规则。两个 host-local 现为 `module` 变体且无模板标记，加 `./cordis` 要另行清点（见 1.3）。
8. 未确认项集中在 7 节。

## 1 规则

### 1.1 IC 条款对两类成员的要求

出处 `docs/architecture/cordis-integration-conventions.md`（下称 IC 文，行号如下）。

| 条款（行） | 服务定义成员（`*-cordis-contract`）必须 | 提供者插件（`*-host-local` 的 `./cordis`）必须 |
|---|---|---|
| IC-1 (11-15) | 每个接缝恰一个 Service 定义，随契约形状拥有者就近维护；不因拆提供者或消费者复制定义 | 引用同一定义，不自拥一份 |
| IC-2 (17-19) | 抽象 `Service` 的 `static readonly provide` 是键的唯一书写处；`super(ctx, X.provide)`；导出键常量取自它 | `extends` 这个抽象类，不另写键，不自己 `ctx.provide` 这个键。一个插件提供多键：插件体里逐个 `new` 子类（登记在同一 fiber），或每个子类各自当插件（每键一条 fiber）；按撤除与在途承诺选，写明理由 |
| IC-3 (21-23) | 抽象 `Service`（或含登记逻辑的具体注册表 Service），不可只用 `interface`；类 `implements` 根入口的操作类型，同一组签名不写两份；JSDoc 写 `@contract <ID>` 或 `@owner <成员路径>`（二选一，路径须真实） | 子类的签名随抽象类 |
| IC-4 (25-31) | 根入口不导入 `@deepseek-ai/cordis`，也不导入本包 Cordis 入口；Service 类、键、`Context`/`Events` 增补在同包 `./cordis`。契约与提供者共置时可另设定义子入口（本场景不需要：定义与提供者是不同成员） | 具体插件从自己的 `./cordis` 发布；根入口同样无 Cordis |
| IC-5 (33-37) | 公开定义值闭包不得引入被选择的业务提供者实现 | 消费者按键取用，不依赖提供者实现入口；选择提供者归装配 |
| IC-6 (45-47) | — | 同一 isolate 标签下一个接缝一个提供者；两份并存须分 isolate 并在装配拥有者规格里写明 |
| IC-7 (49-51) | 键用 camelCase 名词表达能力，不写实现名 | 独立提供者包用限定名 |
| IC-8 (53-55) | — | 必需依赖写 `inject` 数组字面量，元素为字符串字面量或定义包导出的键常量；只有一段工作需要它时用 `ctx.inject([...], cb)` 放进子 fiber |
| IC-9 (57-59) | 导出供 `import type {}` 的增补，默认路径 `<定义包>/cordis` | 可选依赖不写 `inject`，调用时 `ctx.get(键)` 或 kernel-basis `resolveOptional` 现取，接受 `undefined`，按契约缺席默认答案收场；写明换代时如何处置已持有的旧引用 |
| IC-13 (73-81) | 注册表型 Service 的 `register()` 在方法里 `this.ctx.effect(...)`，登记落在调用方 fiber（Skill、MCP 没有注册表，不适用） | 须验证贡献者卸载后其登记已撤除（同上不适用）。资源撤除走 effect：单个 effect 内逆序、不同 effect 并发（见 3.3） |
| IC-14 (83-85) | — | 配置用 Standard Schema 校验（函数插件经 kernel-basis `definePlugin`，`Service` 子类写静态 `Config`）；重试、上界、超时是配置字段；配置错误加载失败 |
| IC-16 (91-93) | — | 运行时对象（回调、端口、域）不进插件树，由装配 provide 成服务、插件 inject；配置只放可序列化数据 |
| IC-19 (132-134) | — | 靠同进程、同 Context 才成立的保证，由拥有者在行为规格写明此刻靠什么兑现；拆多进程时由协议重新兑现。两组：连接表、任务表、在途表都是进程内对象 |

审阅表（IC 文 138-148）：要求「每个提供者自行说明装载、停止准入、取消、实际完成及撤除的配对责任」；服务图和事件矩阵从源码派生；公开类型同形不证明 LSP 或生命周期正确。

IC 文 7-9：规则不新增合并硬线；静态读数分「有限静态符合、偏离、unknown」；不得放宽预期或改声明来消红。

### 1.2 `docs/package-organization.md` 对 `service-contract` 与 `./cordis`

- `cordis-module`、`service-contract`、`service-provider` 三个变体再加 `src/cordis.ts`；`module` 不加（`docs/package-organization.md:36`）。`src/index.ts` 不导入 Cordis，绑定只从 `src/cordis.ts` 导出（同行）。
- 完整生成树与必需节点（56-78）：`SPEC.md`、`docs/{architecture,flows,object-model,public-api,context,cordis}.md`（每个专题 `.md` 与同名目录二选一）、`tests/public-entry.spec.ts`、绑定变体另有 `tests/cordis-entry.spec.ts`；13 个固定目录各有 `README.md`+`index.md`。
- 完整骨架只用于新建包；现有成员不自动迁移，须先清点差异、另行给范围与时点；未迁移成员继续只要求必选文件（`docs/package-organization.md:86`）。
- `service-contract` 创建与结构扫描不再限制 core；IC-1/IC-5 按已采用责任与公开入口判断（354）。
- 成员根入口提供类型、纯函数或显式依赖的工厂；Cordis 绑定在 `./cordis`（250）。「源码无 Cordis 边、生成声明无 Cordis 类型、独立运行不启动 Cordis、安装不引入 Cordis 是不同检查」（同段）。
- 依赖方向：Skill 组 README 已写「`skill-cordis-contract` 只依赖 `skill-contract` 与 Cordis 4.0.4；`skill` 与它互不依赖；`skill-host-local` 指向两者」（`pk/skills/README.md:33-35`）。MCP 同形：`mcp-host-local → {mcp, mcp-cordis-contract} → mcp-contract`，`mcp` 与 `mcp-cordis-contract` 互不依赖（`pk/mcp/README.md:22`）。两组都没有在 `constraints.json` 登记方向行。

### 1.3 包模板命令与 `scan`

出处 `tools/dev-flow/templates/package/README_ZH.md`。

- 创建：`pnpm package:template create --group <组> --name <名> --variant service-contract`（预览），加 `--write` 落盘（README_ZH.md:10-11, 17）。先校验模板再写，失败清理；不安装依赖、不运行包代码（17）。草稿不写采用标识；代码与根 README 带 `PACKAGE_TEMPLATE_DRAFT` 占位，真实接口、已接受行为与有效验证完成后才可删（19）。不生成假 Service 或伪通过测试（19）。
- `service-contract` 变体生成的两个源码文件与一个测试都是空草稿：`src/cordis.ts` 为 `export {}`，`tests/cordis-entry.spec.ts` 只断言 `Object.keys(cordis)` 为空（`tools/dev-flow/templates/package/variants/service-contract/`）。`service-provider` 变体同形（`variants/service-provider/`）。变体由实际责任判断，不凭一条 provide 裁定（README_ZH.md:40）。
- `scan`：`pnpm package:template scan --json`，或 `--member packages/<组>/<成员>`（13-14）。
  - 结构：遍历全部文件、目录、空目录、节点种类，按变体实例化模板核对完整节点集合；未声明路径、错位文件、空目录、软链接均失败（23）；`docs/` 专题缺失报 `topic-missing`，目录缺入口 `topic-entry-missing`，并存 `topic-duplicate`；`acceptance/` 有 `*.acceptance.ts` 时须 `vitest.acceptance.config.ts` 与 `acceptance` 脚本。
  - 依赖：`undeclared-dependency`（类型导入未声明依赖，`deviation`）、`member-cycle`（经 `./cordis` 子路径与相对导入成环，`deviation`）（65-67）。
  - 集成静态规则（`tools/repo-toolchain/src/arch/CONFORMANCE.md`）：IC-1（同键多处定义、定义未从真实 exports 公开）、IC-2（旧式 `ctx.provide`）、IC-3（定义是 `Context` 增补或缺 contract/owner）、IC-4（根 exports 闭包引入 Cordis 或本包集成入口）、IC-5（消费者引用私有入口或外侧实现；公开定义值闭包引入独立提供者）机械判断（102-106）；IC-6/9/10/11/13/14/16/18/19 保留行为义务靠人审，IC-7 人审，IC-8 与 IC-12 尚未接入机械规则（125-126）。`unknown` 保持 `unknown`，`--check` 不把它当通过（README_ZH.md:46-47）。
  - 退出码：普通盘点退出 0 只表示报告完成；`--check` 的 0 表示当前标识、完整结构通过且无已知静态集成偏离（103）。草稿无标识，所以草稿阶段 `--check` 会因缺标识退出 1。
  - 全部结构适配与适用集成核对完成后，才在 `package.json` 写 `omneHarness.packageTemplate`（`id/version/variant`）（README_ZH.md:97 起「标识与人工采用门」）。
- 注意：创建命令不能把现有成员升变体。`skill-host-local`、`skill`、`mcp-host-local`、`mcp` 的 `package.json` 都没有 `omneHarness` 标记，各自 `docs/cordis.md` 写明「本包是 `module` 变体」，且都预告「以后按绑定变体另行设计」（`pk/skills/skill-host-local/docs/cordis.md:3-7`，`w3-mcp-host/.../mcp-host-local/docs/cordis.md:3-7`，`pk/skills/skill/docs/cordis.md:3-7`，`w3-mcp-call/.../mcp/docs/cordis.md:3-7`）。给它们加 `./cordis` 的写法与标记问题见 7 节。

## 2 先例对比

### 2.1 一览

| 项 | model-cordis-contract | execution-environment-cordis-contract | session-cordis-contract | tool-cordis-contract |
|---|---|---|---|---|
| `src/cordis.ts` 行数 | 409 | 240 | 418 | 644 |
| 服务键（抽象类） | 20 个（`cordis-entry.spec.ts:7-27`，18 个抽象 + 2 个具体目录）：`modelRuntime`、`modelCommands`、`modelSendBoundary`、`modelClock`、`modelCredential`、`modelInstanceHost`、`modelPublicationAuthority`、`modelHostAuthority`、`modelConverterAuthority`、`modelRetryPolicy`、`modelProfiles`、`modelProfileMaintenance`、`modelRequestPreparation`、`modelPreparationResources`、`modelMessageConversion`、`modelDiagnostics`、`modelStreamReferences`、`modelStreamObservation`；具体目录 `modelInstances`、`modelConverters` | 4 个（`src/cordis.ts:62,180,202,220`）：`executionEnvironment`、`executionRecoveryAuthority`、`executionEnvironmentAuthority`、`executionScopeBinding` | 22 个（`session/.../cordis-entry.spec.ts:68`）：`session`、`sessionAccessCheck`、`sessionTransactions`、`sessionPrincipals`、`sessionIdentity`、`sessionEvidence`、`sessionClock`、`sessionIdleInput`、`sessionContextInput`、`sessionNotifier`、`sessionAgentDrive`、`sessionScopeRelease` 等 | 22 个（`tool/.../cordis-entry.spec.ts:61`）：`toolRuntime`、`toolCommands`、`toolBindings`、`toolContributionAuthority`、`toolResidencyReader`、`toolGenerations`、`toolEnvironments`、`toolDecisions`、`toolPublicationAuthority`、`toolInstances`（具体）、`toolClock` 等 |
| `@owner` | `packages/model/model-cordis-contract`（`src/cordis.ts:52` 一带） | 同包路径（`src/cordis.ts:57,174,196,217`） | 多数写 `packages/session/session-contract`（契约成员）（`src/cordis.ts:41,54`…），个别写本成员 | `packages/tool/tool-cordis-contract`（`src/cordis.ts:59`…） |
| 导出入口 | `.`、`./cordis`、`./testing` | `.`、`./cordis`（无 `./testing`） | `.`、`./cordis`、`./testing` | `.`、`./cordis`、`./testing` |
| 事件 | 有 `Events` 增补（`src/cordis.ts:394`） | 无（`docs/cordis.md:106`） | 有（`src/cordis.ts:395`） | 有（`src/cordis.ts:613`） |
| intercept 配置 | 无 | 有：`{ caller }`，九方法模板分面（`src/cordis.ts:23-165`） | 有（`SessionIntercept`） | 无 |
| 定义自有登记表（IC-13 目录写法） | 有：实例目录、转换目录、结果接收登记 | 无（登记即效应由 host-local 实现） | 无 | 有：`toolInstances`（`src/cordis.ts:397`）与绑定登记表 |

### 2.2 每个先例的 SPEC、docs/cordis.md、tests

execution-environment-cordis-contract（最精简）
- `SPEC.md`（71 行）节：范围与依据、结果与不变量（10 条性质）、所有权失败与生命周期、组合与验证（性质→测试表）、明确缺项。性质 1 键写一次、2 `implements` 契约类型、8 根入口无 Cordis 与不导入 host-local、9/10 端口服务可选依赖现取（`SPEC.md` 性质 9、10）。
- `docs/cordis.md`（185 行）节：服务定义、intercept 配置与调用方类、登记与撤除协议、事件、依赖分类（表）、IC 符合性映射（表）、机制读数与假设、验证义务（`docs/cordis.md:27,58,84,106,110,127,143,176`）。
- `tests/`：`public-entry.spec.ts`（根入口无运行导出；源码与构建产物不导入 `execution-environment` 或 `-host-local`，`index.ts` 不含 Cordis）、`exports-inventory.spec.ts`（调 `tools/dev-flow` 的 `package-exports` 核对 `docs/public-api.md` 清单与 `tests/fixtures/exports.json`）、`cordis-entry.spec.ts`（用 `new Context()` 与 `ctx.plugin(子类)`，不是 kernel-basis 测试装配）：
  - 键写一次（`:32`）、导出名集合（`:37`）；
  - 端口三键各自子类装载后 `ctx.get(键)` 取到实例，`fiber.dispose()` 后为 `undefined`（`:55-86`、`:88-105`）；
  - 主服务子类装载登记、卸载移除（`:107`）；
  - 九方法对三类调用方、未声明、非法、祖先继承的分面核对（`:265`、`:347`）；
  - 机制探针：`inject` 对象配置到达 `resolveConfig`（`:394`）、`emit` 过滤（`:436`）、`ctx.set` 不通知（`:466`）。

model-cordis-contract
- `SPEC.md`（137 行）：结果推送与公共观察装配边界、结果接收登记、登记输入与撤除协议、实例目录行为、配置通知与撤除、转换目录登记与资源、凭据服务、准备资源租约、验证边界、服务消费与宿主绑定。`docs/cordis.md`（77 行）：服务定义与入口、目录的 Cordis 事实（5 条，含「`register` 须是普通函数以便 `this.ctx` 换成调用方」）、依赖与定义拥有者（表，列「必需性及责任」）、结果接收登记及 IC 符合性映射、档案准备转换的装配（表）。
- `tests/`：约 38 个文件；`cordis-entry.spec.ts` 只核导出集合与键等于类 `provide`（`:3-39`）；真实 Context 的用例在 `service-definitions.spec.ts`（`:195` 键写一次、`:200` 提供者提供 `ctx.<键>` 且 fiber 卸载后消失）、`credential-service.spec.ts`、`receivers.spec.ts`、`prep-resources.spec.ts`、各 `*-harness.ts`；另有 `root-entry-closure.spec.ts`、`install-*.spec.ts`（根入口闭包与安装闭包隔离）、`exports-inventory.spec.ts`、`*.spec-d.ts` 类型测试。

session-cordis-contract
- `SPEC.md`（78 行）：唯一性、可选成员与三个受信上下文服务、当前访问检查的装配、游标签名、生命周期、实现与验证。`docs/cordis.md`（143 行）：服务定义、intercept、端口服务键（表：键、端口、谁提供、怎样取得、缺席时）、受信服务键、事件、依赖分类、靠装配兑现的保证、IC 符合性映射、机制读数、验证义务。
- `tests/cordis-entry.spec.ts`（`:67-160`）：导出恰二十二类及键、键只由类 `provide` 给出且与键表文本一致、不导出已被取代的键、真实子类装载于 `session` 键并卸载后消失（`:95-108`）、可选成员省略与给出两种子类（`:110-150`）。另有 `access-check.spec.ts`、`principals.spec.ts`、`cursor-signing.spec.ts`（含真实 Context）与 `public-entry.spec.ts`。

tool-cordis-contract
- `SPEC.md` 仅 19 行（行为正文放 `docs/cordis.md`，229 行）：服务定义与入口、登记输入与撤除协议、依赖与定义拥有者、两个动态键的 IC-6 映射、配置通知与撤除、验证义务。
- `tests/cordis-entry.spec.ts`（`:60-218`）：22 个唯一键（`:61`）、每键一个服务类（`:78`）、类名后缀 `Service`（`:88`）、定义入口不依赖 Tool 实现（`:93-120`）、在 `startTestAssembly`（`@omne-harness/kernel-basis/testing`）上经抽象定义键解析提供者（`:123-145`）、公开读取常驻读取器（`:204`）。其余为绑定登记表、换代协调、常驻读取、结果接收的专有测试。

### 2.3 共有（必需）与专有

共有，Skill 与 MCP 都应照做：
1. （`@owner` 路径写实际定义拥有者；IC-3 要求路径指向真实成员。Skill、MCP 的定义拥有者是新建的 `*-cordis-contract` 成员，故照 execution、model、tool 的写法写本成员路径，不照 session 的写法写契约成员路径。）`src/cordis.ts` 的抽象 `Service` + `static readonly provide` + `super(ctx, X.provide)` + 键常量 `X.provide`；`@owner`；`declare module '@deepseek-ai/cordis' { interface Context { 键: 类 } }`；`export {}` 的根入口（`execution/.../src/index.ts`）。
2. `tests/public-entry.spec.ts`（根入口无运行导出；入口导入边界）与 `tests/cordis-entry.spec.ts`（键常量等于类 `provide`；导出集合恰为公开名单；真实 `Context` 上装载子类后 `ctx.get(键)` 取到、`dispose()` 后取不到）。四个先例都有。
3. `SPEC.md` 的性质表对应测试（execution 的 `SPEC.md`「组合与验证」表是最清楚的写法）；`docs/cordis.md` 含「依赖分类」与「IC 符合性映射」两表和「验证义务」。
4. 依赖只引用契约成员与 Cordis（`package.json` 依赖：execution 为 `@deepseek-ai/cordis`、契约、`runtime-context-contract`）。

某组专有，不照搬：
- execution：intercept 调用方类与 `CallerClassMismatch`、模板方法与受保护钩子、`registerFacility`/`registerProvider` 登记面、`operationFaces`。
- model / tool：定义自有登记表与撤除协议（`register` 须为普通函数、`this.ctx` 换成调用方）、结果接收表、动态换代键；`./testing` 夹具；根入口/安装闭包隔离测试。
- session：二十余个端口键、受信服务键、游标签名、`./testing`。
- tool：换代协调者的 IC-5 例外（IC 文 41）、常驻读取器键 `toolResidencyReader`。
- `./testing` 入口：model、session、tool 有，execution 没有（对 Skill、MCP 不是必需）。
- `exports-inventory.spec.ts` 与 `tests/fixtures/exports.json`、`docs/public-api.md` 清单：execution、model 有，session、tool 的测试清单里没有（未逐文件核对其是否另有清单检查）。

## 3 提供者插件先例

### 3.1 `execution-environment-host-local/src/cordis.ts`（363 行）

- 读可选端口的写法：execution 与 model 的提供者都直接 `ctx.get(键)`，没有一处用 kernel-basis 的 `resolveOptional`（它只是 `ctx.get` 加类型断言，`pk/assembly/kernel-basis/src/cordis.ts:resolveOptional`；`model-host-local/src/plugins/*` 内 grep 无命中）。IC-9 允许两种，先例只用前一种。
- 依赖入口：`ExecutionEnvironmentRegistry<P> extends ExecutionEnvironmentService<P>`，类本身可直接当插件装载（`:197`）。静态 `Config = emptyConfig`（Standard Schema，只接受缺省或空对象，`:34-56,198`）；宿主文件插件另有自己的 Schema（`:58-175`）。
- 必需依赖：设施声明插件与宿主文件插件用对象形式 `inject: { [executionEnvironmentKey]: { caller: 'provider' } }`（`:308,318,328,348`）。
- 可选依赖（他域端口）：构造函数里造三个适配器对象，每次调用才 `ctx.get(executionRecoveryAuthorityKey)` / `…AuthorityKey` / `…ScopeBindingKey`，取不到答 `'unavailable'`，不放行（`:203-229`）；取自「自己装载时的上下文」`ctx`，不取服务方法里的 `this.ctx`（调用方上下文），否则调用方自己给自己授权（`execution/.../SPEC.md` 性质 9，`docs/cordis.md` 依赖分类表）。再把适配器交给与 Cordis 无关的 `createEnvironmentRegistry({ recovery, authority, bindings })`（`:230`）。不持有旧引用，端口换代后下次现取新的。
- 工厂参数：不可序列化对象不进配置。`createHostFilesPlugin(domain)` 的责任域由进程宿主创建一次并保存，经工厂参数交入；配置只放可序列化字段，回调由插件体接到 `ctx.logger`（`:344-362`；`docs/cordis.md:30-34`）。
- 撤除收口：构造函数里 `ctx.effect(() => async () => { const closed = await registry.close(); if (closed.kind === 'pending') throw new RetirementPending(...) }, 'executionEnvironment.close')`（`:232-239`）。关闭次序在 Cordis 无关的登记表内：先拒新落点、获取与登记，再使全部租约以 `registryClosed` 失效，再并发退役全部提供者（`docs/cordis.md:60-74`，`execution-environment/SPEC.md` 的「关闭」节）。同一个效应内部有次序，不同效应之间并发（见 3.3）。登记面方法在 `this.ctx.effect` 上登记，登记落调用方 fiber（`:276-301`）。
- 在途：`drainBoundMs` 配置字段给排空上界（`:58-68`，初值 10000 ms，`docs/cordis.md:30`）。排空未结清时撤除抛 `RetirementPending`，由 Cordis 写入 `ctx.logger` 的错误，卸载本身总完成（`docs/cordis.md:106-115`）。
- 断言撤除完成的用例（`execution-environment-host-local/tests/cordis-entry.spec.ts`）：
  - `:257` `await registry.dispose()` 之后 `ctx.get(键)` 为 `undefined`，租约的 `invalidated` 已 resolve 为 `{ source: 'registry', reason: 'registryClosed' }`，新获取答 `ownerStopped`；
  - `:391` 在退役或关闭待处置时 `await provider.dispose()` 与 `await registry.dispose()` 都 resolve 为 `undefined`，`retired.count` 在 dispose 返回之后已增加（证明 `dispose()` 等到异步撤除函数结束），`recordErrors(ctx)` 收到 `RetirementPending`；
  - `:491` 排空顺利时不写日志；
  - `drain` 超界另有 `host-provider-drain.spec.ts`。
- 验证义务表：`docs/cordis.md:125-140`（12 条，写明哪些未覆盖：同 isolate 重复装载失败、配置失败使 fiber `FAILED`）。

### 3.2 `model-host-local/src/cordis.ts`（248 行；插件在 `src/plugins/`）

- 必需依赖用 `static readonly inject = [modelCommandsKey, modelClockKey, modelHostAuthorityKey]`（`plugins/host.ts:498`），`modelPublicationAuthorityKey`（`plugins/instances.ts:18`），`[modelCommandsKey]`（`plugins/preparation.ts:221`）；键常量取自定义包。
- 不可序列化对象经工厂选项：`createModelRuntimeLocalPlugin(options)`、`createModelRequestPreparationPlugin(options)` 返回类；选项含运行提供者、观察资格、推送账本、凭据补全等，「不是可序列化配置」（`docs/cordis.md:17-18` 表后一句；`plugins/host.ts:288-330`）。工厂返回的类自带 `static inject` 与 `static Config`。
- 撤除：`ctx.fiber.effect(() => () => { detach?.(); custodian?.close() }, ...)`（`src/cordis.ts:118-123`）；宿主插件在 `Service.init` 里 `await host.bind(...)`，一个外层 effect 的列表按逆序等待关闭流程与贡献撤除，「这个跨 fiber 次序归入口组合者，不能由一个宿主 fiber 或多个并发 effect 推导」（`docs/cordis.md:27-33`）。
- 配置：`PluginConfig` 经 Standard Schema `parseConfig`（`:45-71`）。

### 3.3 机制事实（Cordis 4.0.4，basis）

- effect 之间并发释放，逆序只约束取出；异常只写日志不上抛；`UNLOADING` 后再建 effect 抛 `INACTIVE_EFFECT`（`.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md`）。所以 MCP 的撤除顺序（先停准入，再 `closeAll`，再其余）要写在同一个撤除函数里，并在函数内自己捕获并记录 `closeAll` 的 `AggregateError`，否则 Cordis 只把它记成日志（可借鉴 `RetirementPending` 的做法，但这是推断，先例没有 `AggregateError` 的写法）。
- `inject` 没有可选形式（`inject-has-no-optional-form.md`）；`Service` 子类静态 `Config` 失败使 fiber `FAILED` 的路径没有单独核验（IC 文 85；`docs/cordis.md:110` 一带的「机制读数」两行假设）。
- 同一 isolate 标签下重复 `provide` 抛出，源码读数，execution 没有测试覆盖。

## 4 需求端口的交付方式

先例里交付方式分三类。

A. 他域实现的端口：另有服务键，在定义成员建键，由装配或适配器成员的插件装载子类，提供者读它。
- execution：`ExecutionRecoveryAuthorityService`、`ExecutionEnvironmentAuthorityService`、`ExecutionScopeBindingService`（`execution/.../src/cordis.ts:176-229`），三个都是抽象 `Service`，装配入口装载子类；host-local 的 `ExecutionEnvironmentRegistry` 每次 `ctx.get` 现取，缺席答 `unavailable`（`execution-environment-host-local/src/cordis.ts:204-229`）。装配入口提供它们，不进插件树（IC-16；`execution/.../SPEC.md` 性质 9）。
- session：`docs/cordis.md:40-62`「端口服务键」表。接口在 `session-contract`，键与抽象类在 `session-cordis-contract`，实现在 `session-adapters`，由 `session-cordis` 注入；「`session-cordis` 与 `session-adapters` 之间没有编译期依赖，靠这两个键在装配时接上」。表里每键写「谁提供」「怎样取得」「缺席时」：访问检查与内部主体进 `inject`，缺席时服务停在 `PENDING`；`sessionIdentity`、`sessionEvidence`、`sessionClock` 等「按调用现取」，缺席时对应操作返回 `unavailable`。`SessionProvider` 的 `static inject` 是五个键（`session-cordis/src/provider.ts:39-45`），其余端口现取。
- model：`modelCredential`、`modelPublicationAuthority`、`modelHostAuthority`、`modelCommands`、`modelClock` 等键（`model-cordis-contract/src/cordis.ts:54,203,328,…`），依赖表列「必需性及责任」（`model-cordis-contract/docs/cordis.md:29-41`，如「modelCredential：Context 成员可选，缺席时不发送」「modelHostAuthority：宿主必需」）。
- tool：`toolContributionAuthority`、`toolResidencyReader`、`toolPublicationAuthority`、`toolStartAuthority` 等；`createLocalToolHostPlugin` 的 `static inject: ['toolBindings','toolContributionAuthority','toolResidencyReader']`（`tool-host-local/src/cordis-host.ts:18,59-63`）。

B. 本地运行时对象（非跨域端口、不可序列化）：工厂参数，不走键也不进配置。例：`createHostFilesPlugin(domain)`（execution host-local）、`createModelRuntimeLocalPlugin(options)`（model host-local，`plugins/host.ts:445`）、`createSessionProviderPlugin({ measure })`（`session-cordis/src/provider.ts:75-86`，「`measure` 是函数，所以不是配置成员」）、`createLocalToolHostPlugin(input)`。

C. 契约成员的 `./testing` 提供「端口的内存替身与符合性套件」，端口提供者在自己的测试框架里逐个登记运行（Skill 的 `./testing` 已有，见 5.1）。

对 Skill、MCP 的含义（事实与推断分开）
- 事实：MCP 与 Skill 的所有他域端口都有失败通道可承载「端口缺席」。MCP：`AdoptionView`（`'unknown'`）、`UseEligibility`（`{kind:'unknown'}`）、`CredentialUse`（`CredentialFailure = 'missing'|'rejected'|'unknown'`）、`ProcessLanding`（`'landing-invalid'|'facility-missing'|'unknown'`）（`w3-mcp-call/pk/mcp/mcp-contract/src/ports.ts:34,39,50,84,134`）。Skill：`SkillReadCheck`、`SkillResolution` 答 `Reply<T> = Promise<Outcome<T,'unknown'>>`（`pk/skills/skill-contract/src/ports.ts:21`）。
- 事实：`createMcp(ports, config)`、`createSkillAccess(ports)` 一次收一个端口对象（`w3-mcp-call/pk/mcp/mcp-contract/src/services.ts:226-240`，`pk/skills/skill/src/ports.ts`）。所以插件若要「每次现取」，需要像 execution 那样构造一组薄适配器，每个方法里 `ctx.get(键)`，缺席答 `unknown`；若端口全写 `inject`，则端口换代整个插件重跑（IC-8 文字），连接表随之关闭重建。两种都有先例（session 两种并用）。取舍未定，见 7。
- 推断：IC-16 与先例都倾向把他域端口做成定义成员里的键（Skill 2～3 个、MCP 4 个）；`McpPorts` 里的 `store`（`@omne-harness/mcp` 的内存实现）与 `transports`（`mcp-host-local` 的 `createLocalTransportFactory`）是同组内的东西，由插件内部构造；`checkOutput`、`clock` 与 `McpConfig.principalKey` 是函数，走工厂参数（B 类）。

## 5 两组要暴露的服务

### 5.1 Skill

| 服务 | 操作类型所在入口 | 构造工厂 | 工厂所需 |
|---|---|---|---|
| `PackageInspection`（`pk/skills/skill-contract/src/services.ts:31`；`inspect(locator, options?)`） | 仅 `@omne-harness/skill-contract/provider`（`src/provider.ts` 导出类型）；公开根**不**导出它（`src/index.ts` 的服务类型清单只有 `SkillAccess`、`SkillCatalog`…） | `createPackageInspection(source)`（`pk/skills/skill/src/inspection.ts:23`） | 一个 `SkillPackageSource` |
| `SkillCatalog<P,S>`（`services.ts:62`；`summaries`、`search`） | 公开根 | `createSkillCatalog(ports)`（`pk/skills/skill/src/catalog.ts:103`） | `Pick<SkillPorts,'readCheck'\|'resolution'>` |
| `SkillAccess<P,S>`（`services.ts:141`；`describe`、`read`、`list`、`export`） | 公开根 | `createSkillAccess(ports)`（`pk/skills/skill/src/access/service.ts:81`） | `SkillPorts<P,S>` = `{ readCheck, resolution, source }`（`pk/skills/skill/src/ports.ts`） |

- 三个端口的类型在 `@omne-harness/skill-contract/provider`：`SkillPackageSource`（`pk/skills/skill-contract/src/ports.ts:39`）、`SkillResolution`（`:74`）、`SkillReadCheck`（`:92`）。`./testing` 有三端口的符合性套件与内存替身。
- `SkillPackageSource` 的本机实现是 `skill-host-local` 的 `createDirectorySource(options?: { fs?: DirectoryFs })`（`pk/skills/skill-host-local/src/directory-source.ts:34`）；`SkillReadCheck`、`SkillResolution` 由他域提供（领域交接：身份与授权、装配与交接、资产与规则，`docs/domains/skills/architecture.md:29-33`）。
- 工厂只收端口，没有选项、没有配置；没有 `closeAll`、`close`、`dispose` 一类（对 `skill`、`skill-host-local` 的 `src/` 搜 `close|dispose` 只命中无关的文件句柄关闭，`skill-host-local/src/fs.ts:50`）。所以 Skill 插件撤除时没有资源要等；无需 effect。
- 通用实现 `@omne-harness/skill` 的依赖是 `assets`、`legal-identity`、`operation-result`、`skill-contract`；`skill-host-local` 只依赖 `operation-result`、`skill-contract`（各 `package.json`）。加插件需新增 `skill`、`skill-cordis-contract`、`@deepseek-ai/cordis` 依赖。

### 5.2 MCP（读 w3-mcp-call，未合入父分支）

| 服务 | 操作类型所在入口 | 构造工厂 |
|---|---|---|
| `EndpointInspection`（`w3-mcp-call/pk/mcp/mcp-contract/src/services.ts:43`；`extends BodyContract`，加 `inspect`、`launchesLocalCommand`） | 公开根（`src/index.ts` 服务清单，`EndpointInspection` 在 133 行一带） | `createMcp(ports, config).inspection` |
| `ActionDiscovery<P>`（`:70`） | 公开根 | `.discovery` |
| `ActionInvoker<P>` = `ActionCalls & TaskControl`（`:161`） | 公开根 | `.invoker` |
| `EndpointStatus<P,S>`（`:196`） | 公开根 | `.status` |
| `Connections<P>`（`:212`；`release`、`closeAll`）：不在你列的四个里 | 公开根 | `.connections` |

- 工厂：`createMcp<P,S>(ports: McpPorts<P,S>, config: McpConfig<P>): McpServices<P,S>`（`w3-mcp-call/pk/mcp/mcp/src/index.ts:16`）；未合法配置抛 `RangeError`；五个服务共用一张连接表、一张在途表、一张任务表，创建时不连接（`index.ts:10-15` 注释）。父分支头上还是旧的 `createMcpCore` 形（四个服务，无 invoker），所以 W4 的基线必须是 W3-C 合入之后。
- `McpPorts<P,S>`（`mcp-contract/src/services.ts:226`）：`adoption`、`eligibility`、`credentials`、`landing`、`store`、`transports: McpTransportFactory`、`checkOutput: OutputValidator`（必需）、`clock?`。前四个是他域端口，类型在 `@omne-harness/mcp-contract/provider`（`src/provider.ts`，同入口还有 `CatalogStore`、`McpTransportFactory`、`McpTransport`…）；`McpPorts`、`McpConfig`、`McpServices` 及五个服务接口在公开根。
- `McpConfig<P>`（`:246`）：`principalKey`（函数）、`maxListingPages`、`maxActions`、`instructionsByteLimit`，每项必填无默认。
- 同组内由插件自己造：`store` = `createInMemoryCatalogStore()`（`w3-mcp-call/pk/mcp/mcp/src/store/memory.ts:8`）；`transports` = `createLocalTransportFactory(options)`（`w3-mcp-host/pk/mcp/mcp-host-local/src/factory.ts:34`），`LocalTransportOptions` = `{ clientInfo:{name,version}, probeTimeoutMs, fetch? }`（`src/options.ts:3-12`，不合法抛 `RangeError`）。
- **`closeAll`**：有，在 `Connections`（`mcp-contract/src/services.ts:222-223`，注释「For the host that holds this instance, at exit」）。语义见 `w3-mcp-call/pk/mcp/mcp/SPEC.md` MC-10（行 76）：不问采用与资格；把表置为已关停（之后不再建连、`refresh`/调用不问端口，S8）；先发起在途落点句柄的释放，不等答复；再并发关闭每条连接；等全部释放与拆除结束后报告；关闭任务作用域；有本包错误时以 `AggregateError` 拒绝，不交出确认范围；再次调用不再报同一批错误；作用域关闭之后才出现的错误交 `TableRuntime.afterExit`，缺省作为未捕获异常抛出。关闭不声称进程已停，报告的是实际确认的范围。
- 另一处需要在撤除时关心：`transport.close()` 由连接表在关闭连接时调用，不由插件调用（`mcp-host-local/docs/cordis.md` 的「不适用」节）。

### 5.3 组页与领域页对应章节

- Skill 组页（`pk/skills/docs/architecture.md`）：「对外提供」58-66（服务：`PackageInspection`、`SkillCatalog`、`SkillAccess`；实现方入口 `./provider`）；「完整行为候选的正式承接缺口」577-588。表里 Cordis 两行（587-588）仍是「尚未承接」，波次「Cordis 服务键波」，`skill-cordis-contract`「暂不进应用插件树」。第一行（`method-and-resource-access.md`）的状态「候选，尚未承接」已落后于 W1–W3（`SkillCatalog` 已实现，见 5.1），文字「`SkillCatalog` 与 Cordis 插件部分还没有实现」（579）也已过时。W4-4 要写回。
- MCP 组页（`pk/mcp/docs/architecture.md`）：「对外提供」43-52（读口、调用口、状态口、类别端口，后文把「释放与全部关闭」放在状态口）；「集成与验证分工」590-594（「服务键在 mcp-cordis-contract 建立时才定，不根据本目录造服务或包」）；「完整行为候选的正式承接缺口」703-716。该表尚未列 Cordis 行；`mcp-host-local`「仍是模板草稿」、`mcp-cordis-contract` 尚未建立（705），三行状态均「未承接」。注意两处文字与代码不一致：组页状态口表（466-472）列的是 `queryTask` 等任务操作，而代码里任务操作在 `ActionInvoker`（`TaskControl`），`release`/`closeAll` 在 `Connections`；组 README 18 行写 `createMcpCore` 交出四个服务，代码已是 `createMcp` 交出五个。
- Skill 领域交接（`docs/domains/skills/architecture.md:35-43`「公开服务的消费方」）：`PackageInspection` 的消费方是「资产的候选校验、工作区扫描」；`SkillCatalog` 是 Runtime Context、工具执行（各经集成方）；`SkillAccess` 是工具执行、Slash Command、独立程序。
- MCP 领域交接（`docs/domains/mcp/architecture.md:42-50`「MCP 交出的能力」）：`EndpointInspection` 的接收方是「资产与装配」，「按 assets 类别提供方接入 MCP 类别」；`ActionDiscovery`、`ActionInvoker` 接收方「调用方」；`EndpointStatus` 接收方「管理与查询读面」。文中「状态口：任务的查询、取结果……」写在 `ActionInvoker` 一行，与代码一致；「释放与全部关闭」在组页写在状态口，在代码里是 `Connections`。
- 领域页没有 `Connections` 的消费方行；是否对外要它的键，没有来源（未确认）。

## 6 `EndpointInspection` 接入资产类别

- 类别提供方一节：`pk/assets/assets/SPEC.md:181-199`；公开类型 212-222。协议是登记，不是服务键：资产导出 `createCategoryRegistry()`，返回 `{ register(contract: BodyContract): void; lookup(category): BodyContract | undefined }`（`pk/assets/assets/src/registry.ts:4-19`、`src/identity.ts:24-36`）。`register` 拒绝空类别名与重复登记。
- SPEC 原文：「Cordis 按组合挂载提供者。提供者向装配侧的注册表登记。注册表不导入提供者的实现包」（`SPEC.md:194`）；内部设计 `docs/internals.md#category-provider-seam`：「注册表若导入每个类别的实现包，共同治理就要识别每一种专有正文。提供者自己登记。注册表只接收候选项」。
- 现行先例都是纯值：`agentBodyContract()` 返回 `BodyContract`，「消费者向资产包的类别注册表登记它：`createCategoryRegistry().register(agentBodyContract())`……登记由装配一侧执行，本包不持有注册表」（`pk/agent/agent-contract/SPEC.md:552`）；`mcpEndpointBodyContract()`（`w3-mcp-call/pk/mcp/mcp-contract/src/endpoint.ts:241`）与 `skillBodyContract()`（`pk/skills/skill-contract/src/contract.ts:50`）同形。资产本地提供者 `assets-local` 以选项字段 `categories: CategoryRegistry` 接收注册表（`pk/assets/assets-local/src/types.ts:20`）。资产包 `src/` 无 Cordis 引用，`pk/assets/` 下无 `provide = '`（已搜）。
- 结论（有依据）：`EndpointInspection` 不需要服务键。接入资产的方式是装配一侧把 `McpServices.inspection`（它 `extends BodyContract`）传给注册表的 `register`。
- 未确认：`EndpointInspection extends BodyContract` 带非方法字段（`category`、`schema`），若硬做成抽象 `Service` 键，`implements` 要写这些字段；先例的抽象类成员都是方法或只读函数属性，没有数据字段先例。资产 SPEC 的 `deriveDeclarations(body, context)` 不接受动作清单，逐动作权限项的声明路径是领域页登记的剩余义务（`docs/domains/mcp/architecture.md:52`），与本波无关但会影响 `EndpointInspection` 的形状。

## 7 未确认与待 W4-0 裁定

查过哪里附在括号里。

1. 需求端口要不要建键（`plan.md` W4-0 的第一件）。先例倾向建键（4 节 A），但 `plan.md:87-88` 只列「服务键与抽象 Service」给三个服务。MCP README 36 行写「进入插件树排在后续交付，等四个由组外提供的需求端口都有提供者」，暗示端口提供者在组外；这不决定端口键放不放在 `mcp-cordis-contract`。
2. 必需还是可选：他域端口写 `inject`（缺席则插件 `PENDING`，换代则重跑并关闭连接表）还是薄适配器每次 `ctx.get`、缺席答 `unknown`。MCP 的 `closeAll` 之后不再建连（S8），所以插件重跑意味着连接表整体重建；先例里 session 两种并用。没有现成规则替这两组选，需开波设计写明理由。
3. `Connections` 是否有键（5.2、5.3）。`closeAll` 注释说是给持有实例的宿主在退出用的，没有消费者来源要求把它作为服务提供（查：`docs/domains/mcp/architecture.md`、`pk/mcp/docs/architecture.md`、`pk/mcp/README.md`）。
4. host-local 现为 `module` 变体、无 `omneHarness` 标记（`package.json`、`docs/cordis.md`），`scan` 对它们的现行读数未取（我起了一次 `scan --member` 超过 120 秒被我中止，没有结果；未再跑）。加 `src/cordis.ts` 与 `tests/cordis-entry.spec.ts` 时，包模板 README 与 `docs/package-organization.md` 只写了「新建」包用 `create`，「现有成员不自动迁移，先清点差异、另行给范围与时点」；没有找到「把 module 升 service-provider」的命令或规则（查：模板 README_ZH 全文、`package-organization.md` 全文关键词 `service-provider`）。
5. `skill-cordis-contract`、`mcp-cordis-contract` 的 `./testing` 入口：model、session、tool 有，execution 没有；Skill 与 MCP 契约已各有 `./testing` 的端口夹具，是否还需要 Cordis 层的测试入口没有来源。
6. Skill 组页/MCP 组页「正式承接缺口」表的措辞与状态更新由 W4-4 做，本页只指出 5.3 的过时处。MCP 表缺 Cordis 行，需要新增；Skill 表已有两行。
7. 撤除时 `AggregateError` 的记录方式没有先例（只有 `RetirementPending`）；`closeAll` 之后 `ctx.logger` 是否仍可用、effect 内抛出是否被 Cordis 记日志，basis 条目说「异常只写日志不上抛」（3.3），但没有对 `AggregateError` 的探针。需在 W4-3 的撤除用例里直接断言。
8. 配置：MCP 的 `maxListingPages`、`maxActions`、`instructionsByteLimit`、`probeTimeoutMs`、`clientInfo` 可序列化，应入配置（IC-14：可调参数写成配置字段）；`principalKey`、`checkOutput`、`fetch` 是函数，应走工厂参数。先例（`createModelRuntimeLocalPlugin`）这样分，但具体字段名与默认值无来源，`McpConfig` 注明「每项必填、无默认」（`mcp-contract/src/services.ts:243-246`），所以插件配置也不应隐藏默认值，除非开波设计另定（对照 IC-14「默认值只是初值」）。
9. 本页未读：`docs/architecture/layers-and-dependencies.md#外域概念的进入方式`、各契约 SPEC 的 Cordis 相关节、`docs/architecture/technical-foundations.md`。
