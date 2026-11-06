# 闭包规格 w4-mcp-cordis

## 身份与位置
- 闭包：w4-mcp-cordis（W4 MCP 线切片 02）
- 卡与修订：#1119 r1，波段 W4
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis
- 分支：PanQiWei/skill-mcp-w4-mcp-cordis
- 基线：8446c4588f0e2400f2e905179ec252473f7b1066
- 清晰度：定

基线是父分支 `PanQiWei/skill-mcp` 的头：W4 冻结输入 F（`60acfc28b`，reduce 共享写）加小卡 #1155 的两个文档提交。共享写已经生成草稿成员 `packages/mcp/mcp-cordis-contract/`（模板 `service-contract` 变体），写好它对 `@omne-harness/mcp-contract` 与 `@deepseek-ai/cordis` 的依赖，并在 `mcp-host-local` 加了依赖（`@deepseek-ai/cordis`、`@omne-harness/mcp-cordis-contract`；`@omne-harness/mcp` 从 devDependencies 移到 dependencies）。本闭包填内容，并在写 `src/cordis.ts` 的同一提交里给 `mcp-host-local/package.json` 的 `exports` 加 `./cordis` 一项（写法同 `mcp-cordis-contract` 的 `./cordis`）。

切片 01（闭包 `w4-mcp-unusable`）在另一棵树上同时进行，它改 `mcp-contract`、`mcp` 与 `mcp-host-local` 的 `src/session.ts`、用例和 `SPEC.md` 里写答复形状的段。本闭包不碰这些文件与段，两者由派发者按 01、02 的顺序合入父分支。

依据是 W4 MCP 规格第 9–12 条、D-W4M-1、D-W4M-3，与 W4 波包决定 1–4。

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5（claude-opus-5-5），effort high。policy_version 947.1，policy_revision 0fe161ac874e0b538876a8b1e580b5c15e9bdd492178f703aaa9bcabedac3f67，role_source_revision c0a49e85629301ba225d65c857d6e9a88a14e75affcec153d11e333488c41299，宿主 Claude Code。策略按 work `provider`、risk `multi-package` 解析为 Fable 5.1 high。实际按负责人分档规则派 Opus high：写两个成员，撤除与在途调用、端口缺席要在真实 `Context` 上做对；键名、配置、工厂参数与撤除次序都由本规格写定（W4 MCP plan「角色与模型分配」）。同一失败出现两次或 10 分钟没有进展时，派发者介入。

## 目标边界
目标：宿主在真实 Cordis `Context` 上装 MCP 插件。消费者按三个服务键取到服务，在本地传输与脚本化对端进程上走「刷新 → 调用」。四个他域端口按调用现取，缺席时依赖它的操作答 `unknown`。撤除插件时，连接与进程经 `closeAll` 收口。只做下面列的事，`mcp`、`mcp-contract` 不改。

### 已定的事（不重新裁定）

1. **键名与键常量全表（IC-2、IC-7）。** 写在 `packages/mcp/mcp-cordis-contract/src/cordis.ts`，`Context` 增补用同样的键名：

   | 键 | 键常量 | 抽象 Service | `implements` | 接口出处 |
   | --- | --- | --- | --- | --- |
   | `mcpActionDiscovery` | `mcpActionDiscoveryKey` | `ActionDiscoveryService<P>` | `ActionDiscovery<P>` | `@omne-harness/mcp-contract` |
   | `mcpActionInvoker` | `mcpActionInvokerKey` | `ActionInvokerService<P>` | `ActionInvoker<P>` | `@omne-harness/mcp-contract` |
   | `mcpEndpointStatus` | `mcpEndpointStatusKey` | `EndpointStatusService<P, S>` | `EndpointStatus<P, S>` | `@omne-harness/mcp-contract` |
   | `mcpAdoptionView` | `mcpAdoptionViewKey` | `AdoptionViewService<P, S>` | `AdoptionView<P, S>` | `@omne-harness/mcp-contract/provider` |
   | `mcpUseEligibility` | `mcpUseEligibilityKey` | `UseEligibilityService<P>` | `UseEligibility<P>` | `@omne-harness/mcp-contract/provider` |
   | `mcpCredentialUse` | `mcpCredentialUseKey` | `CredentialUseService<P>` | `CredentialUse<P>` | `@omne-harness/mcp-contract/provider` |
   | `mcpProcessLanding` | `mcpProcessLandingKey` | `ProcessLandingService<P>` | `ProcessLanding<P>` | `@omne-harness/mcp-contract/provider` |

   接口与泛型参数按 `mcp-contract` 的 `src/services.ts`、`src/ports.ts`、`src/provider.ts`。`ActionInvoker<P>` 是类型别名 `ActionCalls<P> & TaskControl<P>`，抽象类照样 `implements` 它。`CredentialUse<P>['acquire']` 有两个重载，抽象类用 `abstract readonly acquire: CredentialUse<P>['acquire']` 保留两个重载（先例 `model-cordis-contract` 的 `ModelCredentialService`）。`Context` 增补里泛型取 `unknown`，同先例。
   `EndpointInspection` 与 `Connections` 不建键（波包决定 2）。
2. **抽象 Service 的写法（IC-2、IC-3）。** `static readonly provide = '<键>'` 是键的唯一书写处。构造 `super(ctx, X.provide)`。类 `implements` 上表接口。JSDoc 写 `@owner packages/mcp/mcp-cordis-contract`。紧随每个类导出键常量 `export const <键常量> = X.provide`，消费者（插件与用例）只用键常量取键，不写键的字面量。不写 `static inject`（IC-8）。不导入任何提供者（IC-5）。先例：`packages/model/model-cordis-contract/src/cordis.ts`（键常量）、`packages/skills/skill-cordis-contract/src/cordis.ts`（同波的 Skill 组，在闭包分支 `PanQiWei/skill-mcp-w4-skill-cordis` 上，可能还没合入父分支）。
3. **根入口（IC-4）。** `src/index.ts` 没有运行导出，不导入 Cordis。定义都在 `./cordis`。不设 `./testing`（同 Skill 组的 D-W4S-2：契约成员已有 `./testing` 的端口替身）。
4. **插件工厂与配置（IC-14、IC-16，波包决定 1）。** `packages/mcp/mcp-host-local/src/cordis.ts` 导出插件工厂 `createMcpPlugin(parts)`，返回插件对象（`name: 'mcp'`、`Config`、`apply(ctx, config)`），写法同先例 `execution-environment-host-local/src/cordis.ts` 的插件对象与手写 Standard Schema。不引入 `@omne-harness/kernel-basis`（依赖段不改）。
   - 工厂参数 `McpPluginParts`（函数与本地对象，不进配置）：`principalKey: (principal: unknown) => string`（必填）、`checkOutput: OutputValidator`（必填）、`clock?: McpClock`、`fetch?: typeof fetch`。可选项缺席时按 `createMcp` 与 `createLocalTransportFactory` 现有的缺省处理，插件不另设值。
   - 插件配置 `McpPluginConfig`（可序列化，全部必填，无默认值）：`maxListingPages`、`maxActions`、`instructionsByteLimit`、`probeTimeoutMs`、`clientInfo: { name, version }`。
   - `Config` 的 Standard Schema 只查形状：五个字段都在、类型对、`clientInfo` 的两个字段都在且是文本、没有多余字段。不合形状时交 `issues`。取值范围不在 Schema 里重写：由 `createMcp` 的配置检查与 `createLocalTransportFactory` 的选项检查在 `apply` 里抛 `RangeError`，插件加载照样失败（IC-14）。这样范围规则只有一处来源。
   - 两类类型与 `createMcpPlugin` 从 `mcp-host-local` 的 `./cordis` 导出。
5. **`apply` 做的事（波包决定 1、3、4）。**
   - 造四个端口适配器。每次调用时从 `apply` 收到的 `ctx` 取对应键常量（`ctx.get(<键常量>)`）。取到就把调用原样转过去，答复原样交回。取不到就答该端口的 `unknown`：`AdoptionView` 的 `endpoints` 与 `endpoint` 答 `fail('unknown')`；`UseEligibility.check` 答 `{ kind: 'unknown' }`；`CredentialUse.acquire` 答 `fail('unknown')`；`ProcessLanding.start` 答 `fail('unknown')`（`fail` 来自 `@omne-harness/operation-result`）。不缓存取到的引用，不取服务方法里调用方的上下文。
   - `store` 用 `@omne-harness/mcp` 的 `createInMemoryCatalogStore()`。`transports` 用本包的 `createLocalTransportFactory({ clientInfo, probeTimeoutMs, fetch })`（`fetch` 只在工厂参数给了时传）。
   - 调一次 `createMcp(ports, { principalKey, maxListingPages, maxActions, instructionsByteLimit })`。
   - 逐个 `new` 三个服务子类，挂在同一个 `ctx` 上，共一条 fiber（决定 3）。子类在 `mcp-host-local` 内，继承上表的抽象 Service，把每个方法转给 `createMcp` 交出的 `discovery`、`invoker`、`status`。`inspection` 与 `connections` 不提供成服务。
   - 登记一个撤除函数，内容只有一步：`await connections.closeAll()`。不捕获，`AggregateError` 原样抛出，由 Cordis 写入日志（决定 4）。写法：`ctx.effect(() => async () => { await services.connections.closeAll() }, '<标签>')`。依据（派发者读 Cordis 4.0.4 `lib/index.js`）：fiber 卸载的 `_unload` 对全部撤除函数做 `Promise.all`，逐个 `await runDisposable(dispose)`，拒绝由 `catch` 交 `this.ctx.logger.error(reason)`；`await()` 等 `inertia`（卸载任务）结束才返回。仓库先例：`packages/context/agent-context/src/cordis.ts:105`、`packages/context/request-context-cordis/src/cordis.ts:79`。
6. **`mcp-host-local` 的变体清点（spec 第 12 条）。** 派发者在 F 上的读数（`tmp/closures/w4-shared/scan-mcp-host-local.json`）：`adoption` `unmarked`，`variant` `module`，`structure` `pass`，`findings` 0，`integration` `unknown`（`architectureUnknowns` 311 条）。没有「升为提供者」的命令。按 `docs/package-organization.md`「现有成员不自动迁移」手工补 `src/cordis.ts`、`tests/cordis-entry.spec.ts`，改写 `docs/cordis.md`（现写本包没有 Cordis 绑定）。不贴模板标识（D-W4M-1）。交回时再跑一次 `scan` 并贴读数。
7. **新成员的文档。** `mcp-cordis-contract` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/` 下模板生成的文件按模板的占位填写：依赖分类表（只依赖 `mcp-contract` 与 Cordis）、IC 符合性映射（IC-1～IC-9、IC-14、IC-16 逐条：做到、不适用及理由）、验证义务（下面验收第 2 条）。删去所有占位标记，`documentation.json` 按模板维护。`acceptance/` 的占位由派发者处理，写者不改。
8. **换代时旧引用的处置（IC-9 末句）。** `mcp-host-local/docs/cordis.md` 写明：端口提供者换代后，下一次端口调用取新的提供者；已建连接持有的凭据句柄与进程句柄是旧提供者交出的，连接存续期间照旧使用，连接关闭时按 MC-10 释放。

### 写范围
- `packages/mcp/mcp-cordis-contract/` — 草稿新成员的全部内容（第 1–3、7 条与验收第 2 条）；`package.json` 的依赖段不改；`acceptance/` 不改
- `packages/mcp/mcp-host-local/src/cordis.ts`（新建） — 第 4、5 条
- `packages/mcp/mcp-host-local/package.json` — 只加 `exports` 的 `./cordis` 一项；依赖段不改
- `packages/mcp/mcp-host-local/src/index.md` — 列出新文件
- `packages/mcp/mcp-host-local/src/README.md` — 列出新文件
- `packages/mcp/mcp-host-local/tests/cordis-entry.spec.ts`（新建） — 验收第 3、4 条
- `packages/mcp/mcp-host-local/tests/index.md` — 列出新文件
- `packages/mcp/mcp-host-local/tests/README.md` — 列出新文件
- `packages/mcp/mcp-host-local/docs/cordis.md` — 第 6、8 条
- `packages/mcp/mcp-host-local/docs/context.md` — 只改第 13 行一带「没有 Cordis 绑定」的句子
- `packages/mcp/mcp-host-local/docs/public-api.md` — 只改第 11 行一带，加 `./cordis` 入口、`createMcpPlugin` 与两类类型
- `packages/mcp/mcp-host-local/docs/architecture.md` — 只改写到 Cordis 绑定或 `module` 变体的句子
- `packages/mcp/mcp-host-local/README.md` — 只改第 41 行一带与入口列表，加 `./cordis` 与插件的用法
- `packages/mcp/mcp-host-local/README_ZH.md` — 同上
- `packages/mcp/mcp-host-local/documentation.json` — 仅当 `lint:rules` 或 `check:docs` 要求

### 仓库之外的任务产物
无。

### 排除的调用方
- `packages/mcp/mcp/`、`packages/mcp/mcp-contract/` 全部文件：本闭包只消费它们。
- `packages/mcp/mcp-host-local/src/` 里除 `cordis.ts` 与两份目录文件外的全部文件，`tests/` 里除新文件与两份目录文件外的全部文件（含 `fixtures/`、`e2e/`、`model/`）：切片 01 在改其中几份。新用例只导入、不修改夹具。夹具不够用时停下（停止条件第 1 条）。
- `packages/mcp/mcp-host-local/verification/`：切片 01 在改。
- `packages/mcp/mcp-host-local/SPEC.md`：切片 01 在改。`./cordis` 入口的一行由派发者在两个闭包都合入之后补，写者在交回里给出要加的句子。
- 两个成员 `package.json` 的依赖段与锁文件：reduce 已写。
- `packages/mcp/docs/`、`packages/mcp/README.md`、`docs/domains/mcp/`：组页与领域页由 reduce 在切片 03 写回。
- Skill 组：本闭包不碰。
- 简报检查对 `unknown`、`ctx`、`fail`、`get`、`as`、`draft`、`dist`、`pass`、`start`、`check` 报的 `caller-outside-scope` 是通用词的同名匹配：这些词出现在规格的说明里，不是本闭包要改的符号。本闭包不改任何现有符号的定义，只新增文件、`exports` 一项与文档句子。

## 验收清单
1. `pnpm package:template scan --member packages/mcp/mcp-cordis-contract --json` 报完整结构 `pass`，集成没有 `deviation`（D-W4M-1）。交回贴原样输出。同时贴 `mcp-host-local` 的同一命令输出（该命令曾超过 120 秒，给足时间）。
2. `mcp-cordis-contract` 的用例：`tests/cordis-entry.spec.ts` 断言 `./cordis` 的运行导出恰为七个抽象 Service 类与七个键常量，每个键常量等于对应类的 `provide`，七个键互不相同；`tests/public-entry.spec.ts` 断言根入口没有运行导出、源码不导入 `@deepseek-ai/cordis`。
3. `mcp-host-local` 的 `tests/cordis-entry.spec.ts`，在真实 Cordis `Context` 上：
   - **旅程。** 四个端口键用 Service 子类提供：采用、资格、凭据包 `@omne-harness/mcp-contract/testing` 的内存替身（`createMemoryAdoptionView`、`createMemoryUseEligibility`、`createMemoryCredentialUse`）；落点按 `tests/e2e/assembly.ts` 的写法用 `tests/fixtures/process.ts` 起脚本化对端进程（`tests/fixtures/scripted/`）。装 `createMcpPlugin` 的插件，按三个键常量取到服务，采用一个 stdio 端点，`refresh` 之后调用一个动作得到成功答复（D-W4M-3）。
   - **端口缺席。** 四个端口键逐个缺席（其余三个照常提供），依赖它的操作按契约对该端口 `unknown` 的规定答复，不建连、不交动作。凭据端口只在端点需要凭据时才被调用：用一个需要凭据的端点（写者按 `mcp-contract` 的端点体与 `settings.credential` 选择）。交回时每条写出所依据的契约条号。
   - **端口换代。** 先提供一个准许的资格替身，撤下后换一个拒绝的，下一次操作答拒绝。
   - **配置。** 缺一个字段、多一个字段、`clientInfo.name` 不是文本，各使插件加载失败；`maxActions: 0` 与 `probeTimeoutMs: 0` 各使插件加载失败（`RangeError` 来自现有检查）。断言的写法参照 Skill 组闭包分支上 `skill-host-local` 的 Cordis 入口用例里的配置用例（`git show PanQiWei/skill-mcp-w4-skill-cordis:packages/skills/skill-host-local/tests/cordis-entry.spec.ts`）。
4. 同一文件的撤除用例：
   - 旅程之后连接在用、对端进程在跑时 `dispose()`。`dispose()` 返回时对端进程已退出（落点交出的 `ProcessHandle.exited` 已兑现），三个键常量取到 `undefined`。
   - 一个调用在途（对端脚本对该请求答契约 `PeerReply` 的 `{ kind: 'silent' }`，`stdio-peer.mjs` 支持）时 `dispose()`：该调用结算，答复是契约 S8 与 MC-10 规定的那一个。交回写出条号。
   - 机制探针：`AggregateError` 经 `closeAll` 抛出的路径从插件外部无法触发（只有本包编程错误才产生它，见 `packages/mcp/mcp/SPEC.md` MC-10 与 `packages/mcp/mcp/tests/shutdown.spec.ts`）。用一个用例内的探针插件，其撤除函数以 `AggregateError` 拒绝，断言 `dispose()` 照常返回、`ctx.logger` 收到这个错误。用例标题写明这是 Cordis 机制探针。插件不捕获的这一半由评审逐行核对，写进 `docs/cordis.md` 的「未覆盖」。
   每条用例在交回里写一处让它变红的改动（例如适配器缓存首次取到的引用、缺席时答准许、撤除函数不 `await`），在副本上做，不提交。
5. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-cordis-contract` 退出 0；同一组 `--filter` 的 `pnpm turbo run test:slow` 退出 0。`pnpm run lint:deps` 对本闭包两个成员没有违规（其他组成员未构建造成的 `no-unresolvable` 列出，不处理）。
6. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 退出 0。交回每条的输出尾部与日志哈希。
7. `git diff --name-only 8446c4588f0e2400f2e905179ec252473f7b1066..HEAD` 只含写范围内的文件。

## 实施规格
- 用例只断言外部行为：键是否取得到、旅程的答复、缺席时的答复、撤除后取不到、进程已退出。不断言内部结构。
- 成员测试导入 `dist`：改源码后先 `pnpm turbo run build --filter=<成员>` 再跑用例；做变红验证时同样先构建，还原后再构建一次。
- 不加 `as` 断言绕过类型。
- 起进程的用例登记到夹具的子进程集合，`afterEach` 核对没有遗留（`tests/fixtures/README.md`「维护」）。
- 中文文档按 asd-ste100 的语言无关规则，只写现状与依据。用例标题是可读的英文句子，不写阶段式注释。

## 性质及证据义务
- 「缺席不放行」由四个适配器承担：验收第 3 条的缺席用例与变红验证。
- 「撤除之后进程不留」由撤除函数与 MC-10 共同承担：验收第 4 条第一项。
- 「`AggregateError` 不被吞掉」：机制一半由探针用例证明，插件一半由评审逐行核对。
- 差分变异由派发者在最终 head 上跑，不在本闭包。

## 施工计划
1. 读方法入口；在工作树根确认四个成员已构建（`ready.json`）。
2. `mcp-cordis-contract` 的 `src/` 与用例；`scan` 读数。
3. `mcp-host-local` 的插件与用例：先旅程，再缺席与换代，再配置，最后撤除。
4. 两个成员的文档。
5. 验收第 5–7 条；变红验证；交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行四个成员的构建、类型检查、快层与慢层，`package:template scan`；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改依赖段与锁文件、跑 `admission`、仓库全量测试与差分变异。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis，已构建 `mcp-contract`、`mcp`、`mcp-host-local`、`mcp-cordis-contract`。同时有 MCP 切片 01 的写者在另一棵树上跑门禁，共用 CPU：单个用例文件用 `VITEST_MAX_WORKERS=4 pnpm exec vitest run <文件>`，四包整组只在交回前跑一次。HTTP 夹具只用 20000–59999 的端口。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- W4 MCP 规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/mcp/spec.md（第 9–12 条、D-W4M-1、D-W4M-3、跨域概念五问、失败语义）
- W4 波包决定 1–4：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/wave-pack.md §4
- W4 上下文包的 Cordis 机制事实与 MCP 服务表：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/context-pack.md §3.3、§5.2、§7
- Cordis 集成约定：`docs/architecture/cordis-integration-conventions.md` IC-1～IC-9、IC-14、IC-16
- 先例：`packages/model/model-cordis-contract/src/cordis.ts`（键常量与重载方法的抽象写法）；`packages/execution/execution-environment-host-local/src/cordis.ts` 与 `tests/cordis-entry.spec.ts`（插件对象、手写 Schema、端口现取）；同波 Skill 组的插件在分支 `PanQiWei/skill-mcp-w4-skill-cordis`（`git show PanQiWei/skill-mcp-w4-skill-cordis:packages/skills/skill-host-local/src/cordis.ts`）
- 契约与工厂：`packages/mcp/mcp-contract/src/services.ts`（服务接口、`McpPorts`、`McpConfig`、`McpServices`）、`src/ports.ts`、`src/provider.ts`、`./testing` 的替身；`packages/mcp/mcp/src/index.ts`（`createMcp`、`createInMemoryCatalogStore`）；`packages/mcp/mcp/SPEC.md` MC-10；`packages/mcp/mcp-host-local/src/factory.ts`、`src/options.ts`；`tests/e2e/assembly.ts`
- 包模板：`tools/dev-flow/templates/package/README_ZH.md`「标识与人工采用门」
- 必须加载：ub-mode、asd-ste100、pstack:typescript-best-practices

## 当前认知
- 已确认：`createMcp` 对不合法配置抛 `RangeError`，五个服务共用一张连接表、一张在途表、一张任务表，创建时不连接；`createLocalTransportFactory` 对不合法选项抛 `RangeError`；`McpPorts.clock` 与 `LocalTransportOptions.fetch` 是可选的。
- 已确认：`closeAll` 只在本包编程错误时以 `AggregateError` 拒绝（`mcp/SPEC.md` MC-10），外部无法诱发。
- 已确认（Skill 组写者，Cordis 4.0.4）：在真实 `Context` 上，插件撤除后三个键为 `undefined`；配置给非法值时插件加载失败可以断言。
- 已确认（派发者读源码）：`ctx.effect` 登记的异步撤除函数由卸载 `await`，拒绝写入 `ctx.logger.error`。验收第 4 条在真实 `Context` 上直接断言这两点。
- 未知：`mcp-cordis-contract` 的模板草稿有多少占位（Skill 组的同类成员有十余处）。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；两份 `scan` 原样输出；键名全表的最终版；`mcp-host-local/SPEC.md` 要加的 `./cordis` 一行（原文）；缺席用例各自依据的契约条号；变红验证表；未覆盖项。

## 已知会受影响的现有用例
- 无。本闭包只加文件，`mcp-host-local` 的现有源码不改。

## 停止条件
- 需要改写范围外的文件（含夹具）、依赖段或锁文件。
- `scan` 报模板缺口（必需文件或规则与本规格冲突）：缺口归模板拥有者，交回，不改模板（波包 §3.4）。
- 契约接口的实际形状与第 1 条的表对不上，且不是泛型参数的差别。
- 验收第 4 条在真实 `Context` 上显示 `dispose()` 不等 `ctx.effect` 的异步撤除函数结算：决定 4 依赖它，交回，不改用别的收口办法。
- 基线上的用例在本工作树失败。

## 追加记录

- 2026-11-06 13:30 追加 1（Skill 组同类闭包的关口评审 C 面 F1 与 A、C 面的用例缺口；写者在 13:29 已提交 `9fd44721e`，插件未提交）。
  1. **插件经 `definePlugin`（IC-14）。** 第 4 条「不引入 `@omne-harness/kernel-basis`、照先例手写 Standard Schema」作废。IC-14 写明「函数插件经 kernel-basis 的 `definePlugin`」，先例 `execution-environment-host-local` 没有这样做，在它的 `docs/cordis.md` 登记了偏离；本闭包不沿用偏离。派发者已在父分支做共享写 `9a108964544a7c36e05323d18b0734e793996bbb`：`mcp-host-local`（与 `skill-host-local`）的依赖段加 `@omne-harness/kernel-basis`，锁文件随之更新。写者先把手头的改动提交，然后在本分支执行 `git merge --no-edit 9a108964544a7c36e05323d18b0734e793996bbb`（合并提交的作者与 trailer 同提交约定，`Agent-Role: developer`），再 `pnpm install --offline` 并构建 `@omne-harness/kernel-basis`。插件写成 `definePlugin<McpPluginConfig>({ name: 'mcp', Config, apply })`（`@omne-harness/kernel-basis/cordis`），`Config` 的类型是 `StandardSchema<McpPluginConfig>`，不再自己声明 Standard Schema 的类型。先例：`packages/agent/agent-host-local/src/host-plugin.ts:190`。这一次合并与依赖段的变化不算越界。
  2. **每个转发方法都要有用例区分。** Skill 组的评审发现：子类的 `list`、`export` 没有任何用例调用，`search` 只在端口缺席时调用（缺席时它与 `summaries` 答复相同，转错也不变红）。本闭包的三个服务子类（`ActionDiscovery`、`ActionInvoker` 含 `TaskControl`、`EndpointStatus`）的每个方法，至少在一条能区分它的路径上调用一次并断言答复。任务操作若在脚本化对端上走不通，写进「未覆盖」并说明原因，不算停止条件。
  3. **配置的接受与拒绝两半都要有用例。** 除了验收第 3 条的拒绝用例，再加一条用完整合法配置装载成功并取到服务的用例（旅程已含则写明）。直接调用 `Config['~standard'].validate` 的表格用例可以加，断言精确答复。
  4. **换代用例要走缓存最可能藏身的路径。** 资格端口的换代用例之外，再加一条：采用端口换代后，下一次 `refresh` 读到新的采用视图。
  5. **用例里不重写键名字面量**，类型位置也用 `typeof <键常量>`。
  改完按原验收清单与「返回与恢复」交回。

- 2026-11-06 14:56 追加 2（关口修复轮，C-SM-08 的唯一一轮；候选 head `f5ead35f4`）。评审原文：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/reviews/` 下的 `mcp-cordis-r1-B.md`、`mcp-cordis-r1-C.md`、`mcp-cordis-r1-E.md`，汇总与派发者裁定在同目录 `mcp-cordis-r1.md`。下列各项是裁定后的要求；评审原文里与下列冲突的，以下列为准。
  1. **写范围扩大（B1）。** 「写范围」与「排除的调用方」按下面改。增加的路径：
     - `packages/mcp/mcp-host-local/SPEC.md`：只改第 3 行的状态句、「范围与依据」表（第 16 行 `@omne-harness/mcp` 一行改成现状：它是 `dependencies`，`./cordis` 插件在产品源码里调用 `createMcp`，`tests/e2e/` 照旧作调用方；加一行 Cordis 依据，写法照 `skill-host-local/SPEC.md` 表的末行：IC-2、IC-3、IC-6、IC-7、IC-8、IC-9、IC-14、IC-16 与 W4 MCP 波包决定 1–4）、第 19 行「调用方」段（把「本包不起进程、不停进程、不读设置、不取凭据」收窄到根入口的传输，并指向新一节）、新增 `### Cordis 插件`（放在「## 所有权、失败与生命周期」之前，作「结果与不变量」的最后一节）、新增 `### Cordis 插件的验证`（放在「组合与验证」末尾、`<a id="properties"></a>` 之前）、第 218 行「真实组合只由 `tests/e2e/` 覆盖」改成现状。其余段落不改：切片 01 在改第 92、104、167–190、201、216、246 行一带，合入时的冲突由派发者解决。
     - `packages/mcp/mcp-host-local/docs/architecture.md`：模块图、模块表、依赖方向、验证表里与 `cordis.ts` 及其四个包外依赖（`@omne-harness/mcp`、`@omne-harness/mcp-cordis-contract`、`@omne-harness/kernel-basis`、`@deepseek-ai/cordis`）、两个用例文件有关的行与句。
     - `packages/mcp/mcp-host-local/docs/object-model.md`：第 34 行「没有继承层次」，对象图与对象表加四个端口适配器、三个服务子类与撤除函数。
     - `packages/mcp/mcp-host-local/docs/context.md`：第 9 行与第 13 行一带，把「不起进程、不停进程」收窄到传输，写明插件撤除时经 `closeAll` 请落点交出的句柄停止进程、不声称已停。
     - `packages/mcp/mcp-host-local/README.md`、`README_ZH.md`：第 5 行用途句、第 9 行框定句（收窄到传输入口）、状态表加插件一行（已实现；只在脚本化 stdio 对端上验证；HTTP 上的插件旅程未执行；未接受）、第 43 行一带的配置叫法（「四个上界与 `clientInfo`」，不叫「五项上界」）、第 57 行一带示例注释（不写「stops the processes」，改为经 `closeAll` 关闭连接并请落点停止进程，见 MC-10）。
     - `packages/mcp/mcp-host-local/package.json`：只改 `description`，写传输与 Cordis 插件两件事，不写模板草稿句。
     - `packages/mcp/mcp-host-local/tests/cordis-journey.spec.ts`（新建，见第 5 项）。
     原写范围里 `docs/architecture.md`「只改写到 Cordis 绑定或 `module` 变体的句子」、README「只改第 41 行一带与入口列表」的限制由上面取代。`mcp-host-local` 的 `src/` 其余文件、`tests/` 其余文件与 `fixtures/`、`verification/`、`docs/flows.md` 仍排除。
  2. **插件行为的唯一规范正文是 `mcp-host-local/SPEC.md` 的 `### Cordis 插件`（B 的 N1、范围外第 3 条）。** 写法照 `packages/skills/skill-host-local/SPEC.md` 的同名一节（父分支 `PanQiWei/skill-mcp` 上，在本工作树用 `git show PanQiWei/skill-mcp:packages/skills/skill-host-local/SPEC.md` 读）。内容：
     - 插件工厂 `createMcpPlugin(parts)` 经 `definePlugin` 定义；工厂参数与配置的切分；Schema 的判据与确切答复（第 3 项改后的形状）；取值范围由 `createMcp` 与 `createLocalTransportFactory` 的现有检查抛 `RangeError`。
     - `apply` 做的事（闭包规格第 5 条）。
     - <a id="port-absent"></a> 四个端口缺席时适配器答什么（逐个写出），以及「实际调用了缺席端口的那一步得到 `unknown`，操作按 `mcp-contract` SPEC 的 S1、S2、R6、S8 答复，不放行」。不写「端口缺席时操作答 `unknown`」一类全称句（B 的 N2）：S1 不含任务操作与 `cancel`；S2 复用现有连接时不问采用与资格；落点缺席时 `refresh` 答 `landing-unavailable`（R6）。逐条引用契约条款，链接到 `../mcp-contract/SPEC.md` 的锚点。
     - 换代粒度：每次端口调用现取。已转给旧提供者的调用照用它的答复；同一操作里换代之后发出的端口调用用新实例；已建连接持有的凭据句柄与进程句柄是旧提供者交出的，连接存续期间照旧使用，连接关闭时按 MC-10 释放（B 的 N6，统一用「下一次端口调用」，不写「下一次操作」）。
     - 撤除：撤除函数一步收口 `closeAll`，不捕获；第 4 项的警告；撤除之后到达的操作按 S8 答复（引 S8，不写「关停的答复」）。
     - 已知限制（B 的 N3，派发者裁定不加期限）：插件不设期限。落点的 `stop()` 或凭据句柄的 `release()` 不答复时 `closeAll` 不答复，撤除函数不结算，`fiber.dispose()` 不返回（`../mcp/SPEC.md` 已知限制）。期限由卸载该 fiber 的宿主承担。
     `docs/cordis.md`、`mcp-cordis-contract/SPEC.md` 性质 9、`mcp-cordis-contract/docs/cordis.md` 与 `docs/flows.md` 里的同类句子改为引用这一节，不再写规范语气的缺席答复。`mcp-cordis-contract` 只说「这条规则由提供者成员兑现」，不说「本成员规定它」。`docs/public-api.md:3`、`README.md:62`、`src/README.md:11`「非类型行为的唯一正文是 SPEC.md」照旧成立，不改。
  3. **配置 Schema（C 的 C-2、C-4、C-5）。**
     - plain record 的判据与 Skill 组一致：原型是 `Object.prototype` 或 `null`。多余字段用 `Reflect.ownKeys` 找（symbol 键也算多余），缺少的字段用 `Object.hasOwn` 判。拒绝表加 `new Date()`、`Object.create(<完整合法配置>)` 两行，断言确切的 `issues`。
     - 数值字段按名字取值，不按 `BOUNDS` 的位置解构；类型错误的消息点名第一个出错的字段。
     - `McpPluginParts`、`McpPluginConfig` 用 `Pick`／`Omit` 从 `McpConfig`、`McpPorts`、`LocalTransportOptions` 推出；字段清单由 `Record<keyof McpPluginConfig, true>` 一类的写法与类型在编译期相连，`clientInfo` 的两个字段同理。推出后公开类型的形状不变时照旧导出；`LocalTransportOptions` 不在包根导出时从 `./options.ts` 内部取，不新增公开导出。
     - `clientInfo` 内多余字段被拒，加一条用例（E5、B 的 N7）。
     - 拒绝用例断言 Cordis 4.0.4 的 `ValidationError` 与消息（C-3）；`RangeError` 的两条照旧断言错误类。每一行写明：去掉 Schema 时这一行是否仍会失败、因为什么失败。
  4. **撤除函数用上 `closeAll` 的报告（C 的 C-1，派发者采纳）。** 仍是一步收口、不捕获：`const report = await services.connections.closeAll()`，对 `process` 为 `root-only` 或 `unconfirmed` 的每一条，用 `ctx.logger('mcp').warn(...)` 写一条警告，带端点引用与范围。`tree-confirmed` 与 `no-process` 不写。加用例：落点交出的句柄 `stop()` 答 `unconfirmed`（在用例文件里包一层夹具交出的 `ProcessHandle`，不改夹具），`dispose()` 之后日志收到一条带该范围的警告；`tree-confirmed` 时不收到。`AggregateError` 的路径与探针不变。
  5. **用例拆成快层与慢层两个文件（D）。** 差分变异只跑快层；现在整份文件标了 `@module-tag slow`，变异体 161 个全部无人执行。
     - `tests/cordis-entry.spec.ts` 去掉 `@module-tag slow`，放所有不起进程的用例：配置的接受与拒绝、Schema 的表格、键、四个端口的缺席、端口换代、`AggregateError` 探针。
     - `tests/cordis-journey.spec.ts`（新建，`@module-tag slow`）放要起进程的用例：旅程、各服务方法的转发、撤除与在途调用、第 4 项的警告用例、`clientInfo` 外的需要对端答复的用例。
     - 缺席与换代用例里「补上端口后能 `publish`」一类要起进程的一半移到慢层文件，快层文件里用不起进程的观察守住缓存类缺陷：例如落点用一个记录调用、答 `fail('facility-missing')` 的替身，补上端口后断言替身被调用；资格从准许换成拒绝时，准许的那次走到落点替身（答 `landing-unavailable`），拒绝的那次在落点之前答拒绝。写者按契约选择可观察的答复，交回写出每条依据的条号。
     - 每个转发方法在慢层由能区分它的路径守住（追加 1 第 2 项不变）。
  6. **证据与验证义务（E1–E3、C 的 Testing Decisions）。**
     - 新一节 `### Cordis 插件的验证` 写「判据｜反例：使用例变红的缺陷｜用例」表，照 `skill-host-local/SPEC.md` 的同名一节，并写「没有覆盖」。`docs/cordis.md` 的「验证义务」改为引用它。
     - 变红验证重做一遍，覆盖修复后每一条用例（含两个文件、契约成员的七个类与根入口用例）。每一条留运行输出：命令、退出码、失败用例名，存 `tmp/w4-mcp-cordis/mut/r2/`；`run.mjs` 解析失败用例名的正则要先修好，exit 1 而失败名为空的记录不算数。机制探针写明它测的是 Cordis，变红证据是第一次运行（插件不参与）。交回给一张表：变异、文件、命令、退出码、变红的用例名、日志 sha256 前 12 位。
     - 撤除用例断言句柄已释放（E3）：用一个需要凭据的 stdio 端点（`auth: 'static'` 一类，写者按 `mcp-contract` 端点体选择），断言 `dispose()` 之后凭据句柄的 `release()` 与进程句柄的 `stop()` 都被调用过。
  7. **定义成员（C 的 C-6；B 的 N4、N7）。** `mcp-cordis-contract/tests/cordis-entry.spec.ts` 改成覆盖七个类的表格用例：每个类一个最小具体子类，装载后 `ctx.get(<键常量>)` 是该子类的实例，`dispose()` 之后答 `undefined`。`docs/cordis.md` 的 IC 映射逐行写出 `scan` 的读数与人工核对的内容（IC-1、IC-3、IC-5 的 `unknown`），加「未覆盖」一节；`:75` 一带的验证范围按实际写。`SPEC.md:11` 的依据范围补 IC-8 并去掉冗余写法。`index.md:15`、`src/README.md:3` 的模板残句（「公开定义、运行时校验与内部实现」）改为现状。
  8. **`mcp-host-local/docs/cordis.md`（B 的 N4、N5、N7）。** IC 映射补 IC-3、IC-6、IC-7 三行：IC-3 写三个子类继承定义成员的抽象类；IC-7 写提供者成员的限定名；IC-6 写「同一 isolate 重复装载未定、未验证，由装配承担只装一次的前提」。IC-5 一行写出 `scan` 的 `unknown` 与人工核对内容。`:30` 一带 `clientInfo` 多余字段的声明由第 3 项的用例支撑，验证清单列出它。
  9. **用例卫生（C 的 C-7）。** `firstLanded` 不再无上限轮询：落点替身在第一次 `start` 时兑现一个 promise，用例等它。采用换代用例断言 `toEqual(['other'])`。
  验收清单照旧，另加：第 7 条按本追加的写范围核对；`pnpm package:template scan` 两个成员在最终 head 上各跑一次，结构 `pass`；快层文件在 `pnpm turbo run test`（快层）里执行，慢层文件只在 `test:slow` 里执行，交回贴两者的用例数。修复提交按项拆分，提交信息写所闭合的评审编号。派发者在最终 head 上重跑差分变异，写者不跑。
  10. **A 面（14:57 交回，原文同目录 `mcp-cordis-r1-A.md`）。** 无阻断。A-N1 由第 3 项的用例闭合。A-N2：`mcp-host-local/src/cordis.ts` 的 `validate` 现在圈复杂度 11（warn 10），按第 3 项改写后在交回里贴 `pnpm run metrics --coverage --base 8446c4588f0e2400f2e905179ec252473f7b1066` 对本闭包改动函数的读数（只在交回前跑一次；跑之前确认工作树里没有 `packages/.stryker-tmp*`）；仍超 warn 时写处置与理由。A-N3 由第 6 项闭合。
  11. **简报检查的同名匹配。** `brief-check` 对 `error`、`clock`、`Context`、`effect`、`as`、`dist`、`closeAll`、`createLocalTransportFactory`、`createMcp` 报 `caller-outside-scope`：前六个是通用词；后三个是本闭包调用、不改定义的现有符号。本追加不改任何现有符号的定义。

- 2026-11-06 16:27 追加 3（D 面补测；修复轮之后 D 面第一次有效测量，不是同一批阻断的第二轮）。派发者在 head `45658242e` 上跑差分变异（工作树 `tmp/closures/w4-mcp-cordis/gate-r2/mutation.log`，`9f20c7253589`）：`mcp-cordis-contract` 7/7；`mcp-host-local` 197 个变异体，被杀 145，存活 47，无覆盖 5。派发者逐行分类（裁定见 `waves/w4/reviews/mcp-cordis-r1.md`「D 面（修复后）」）：
  - 组合层面等价，不补测：四个适配器缺席分支改成「调用 undefined」或「答空串」（`mcp` 把端口违约与不合法的答复读成 `unknown`，与 Skill 组同型）；`credentialsOf` 两个相同分支（`cordis.ts:208`）；`FIELD_SET` 的 `true` 值；`fieldsIssue` 的符号键判断（`:100`）；Schema 的 `vendor`（`:141`，没有消费者）。
  - 只在慢层可测，不补测：撤除函数与停止范围的警告（`:322–328`）、日志器名（`:320`）。差分变异只跑快层；慢层由修复轮的手工变异 S17–S21 证明。
  - 真缺口，本追加补测。写者是新开的 developer（Sonnet 5.5 high）。只改下列文件：`packages/mcp/mcp-host-local/tests/cordis-entry.spec.ts`、`packages/mcp/mcp-host-local/tests/cordis-journey.spec.ts`、`packages/mcp/mcp-host-local/SPEC.md`（只改「Cordis 插件的验证」一节）。`src/` 不改；产品行为有缺陷时停下交回。
    1. **配置的类型行补齐**（存活 `:85`、`:112`、`:113`，无覆盖 `:112`、`:113` 的字段名）：拒绝表加 `null`、`undefined` 两行（`configuration must be an object`），加 `maxActions` 与 `instructionsByteLimit` 不是数的两行（点名该字段）。每行断言确切的 `issues`，并有加载失败的一半（`ValidationError` 与消息）。
    2. **插件名**（存活 `:297`）：断言 `createMcpPlugin(parts).name` 是 `mcp`（SPEC「Cordis 插件」写了 `name` 是 `mcp`）。
    3. **`fetch` 参数真被用上，凭据按 HTTP 用途被问**（存活与无覆盖 `:309`；`credentialsOf` HTTP 分支覆盖 75%）：快层加一条，不起进程。采用一个 Streamable HTTP 端点，凭据 `auth` 是需要凭据的那一种（写者按 `mcp-contract` 的端点体选择），工厂参数给一个记录请求的 `fetch` 替身，替身答一次网络失败或一个 5xx（写者按契约选能让 `refresh` 结算的答复）。断言：`fetch` 替身收到了该端点地址的请求；凭据替身被以 HTTP 用途问到；`refresh` 的答复是契约对这种失败规定的那一个（写出条号）。不给 `fetch` 时取缺省，不测。
    4. **`clock` 参数真被用上**（存活与无覆盖 `:312`）：慢层旅程给工厂参数一个固定时刻的 `clock`，断言发布的清单的 `acquiredAt` 等于这个时刻（`mcp/src/discovery.ts` 用 `deps.clock.now()` 盖戳）。差分变异测不到慢层，变红证据靠手工变异。
    5. **SPEC「Cordis 插件的验证」**：表里加上面四类的行；「没有覆盖」写明上面两类不补测的存活及理由（组合层面等价；只在慢层可测）。
    6. **变红验证**：每条新用例写一处让它变红的源码改动（例如 `:309` 永远不传 `fetch`、`:312` 永远不传 `clock`、`name` 改名、去掉 `null` 判断），在工作树上改、构建、跑、按字节还原，沿用 `tmp/w4-mcp-cordis/mut/r2/run.mjs`，输出存 `tmp/w4-mcp-cordis/mut/r3/`。交回给表（变异、命令、退出码、变红的用例名、日志 sha256 前 12 位）。
  - 验收：`mcp-host-local` 的 `build typecheck test`（`VITEST_MAX_WORKERS=4`）与 `test:slow` 退出 0；`typecheck`、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 退出 0；`git diff --name-only 45658242e..HEAD` 只含上面三个文件。派发者在最终 head 上重跑差分变异。提交作者与 trailer 同前，`Agent-Role: developer`。
  - 16:27 补入 B 面窄复核（16:26:48 交回，原文 `waves/w4/reviews/mcp-cordis-r2-B.md`）的两条阻断，并入本追加由同一写者做。两条都属 B1 同一类：成员原来只有根入口，以「本包」为主语的全称句在加了 `./cordis` 之后要逐句判定范围。同一类第二次出现，所以不再逐句点名，改为系统清查：
    7. **两条阻断。** `packages/mcp/mcp-host-local/SPEC.md` 第 117 行（H13）「本包不写日志」：改为根入口的传输不写日志；凭据值不进任何日志，`./cordis` 插件撤除时的警告只带端点引用与停止范围（核对 `src/cordis.ts` 的警告参数确实不含凭据值）。H13 的承诺本身不改。`README.md` 第 71 行与 `README_ZH.md` 第 70 行「配置只有 `LocalTransportOptions`」「不写日志」：收窄到根入口，并写明插件的配置是 `McpPluginConfig`（链接 `SPEC.md#cordis-plugin`）。
    8. **系统清查成员级全称句。** 读 `packages/mcp/mcp-host-local/` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/*.md`、`src/README.md`、`src/index.md`、`tests/README.md`、`tests/index.md`，列出每一句以整个成员为主语或为范围的说法（「本包」「本成员」「This package」「only」「只有」「不…」、消费者与依赖清单、维护与重核条件、验证命令清单）。逐句判定：对根入口与插件都成立；收窄到一个入口；或扩写把插件加进去。B 面非阻断列的几处一并处理：`SPEC.md` 第 3 行的内容清单与第 341 行一带「维护」的重核条件（加 mcp-contract 的 S1、S2、S8、R6、AV6、UE5、CU6、PL4，mcp 的 MC-5、MC-10，Cordis 升版）；`README.md` 第 63、77–78、85 行一带（中文版对应行）；`docs/context.md` 第 7、17–21、23 行一带；`docs/architecture.md` 第 65 行一带。交回给清查表：位置、原句、判定、新句。
    写范围随之加：`packages/mcp/mcp-host-local/README.md`、`packages/mcp/mcp-host-local/README_ZH.md`、`packages/mcp/mcp-host-local/docs/` 下的页、`packages/mcp/mcp-host-local/src/README.md`、`packages/mcp/mcp-host-local/src/index.md`、`packages/mcp/mcp-host-local/tests/README.md`、`packages/mcp/mcp-host-local/tests/index.md`；`SPEC.md` 不再只限验证一节，但只改第 7、8 项要求的句子与第 5 项的验证一节，其余段落不改（切片 01 在改第 92、104、167–190、201、216、246 行一带）。本追加「验收」一条里 `git diff --name-only` 的文件清单相应放宽到这些路径。
