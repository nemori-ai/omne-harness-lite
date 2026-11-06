# 闭包规格 w4-skill-cordis

## 身份与位置
- 闭包：w4-skill-cordis（W4 Skill 线切片 01）
- 卡与修订：#1119 r1，波段 W4
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-skill-cordis
- 分支：PanQiWei/skill-mcp-w4-skill-cordis
- 基线：60acfc28b640a1535585df1ebccd22bdc87e4d7c
- 清晰度：定

基线是 W4 的冻结输入 F：父分支 `PanQiWei/skill-mcp` 在 W3 全部合入（`706152690`）与 reduce 共享写之后的头。共享写已经生成草稿成员 `packages/skills/skill-cordis-contract/`（模板 `service-contract` 变体），写好它对 `@omne-harness/skill-contract` 与 `@deepseek-ai/cordis` 的依赖，并在 `skill-host-local` 加了依赖（`@deepseek-ai/cordis`、`@omne-harness/skill-cordis-contract`；`@omne-harness/skill` 从 devDependencies 移到 dependencies）。本闭包填内容，并在写 `src/cordis.ts` 的同一提交里给 `skill-host-local/package.json` 的 `exports` 加 `./cordis` 一项（写法同 `skill-cordis-contract` 的 `./cordis`）。

依据是 W4 Skill 规格（第 1–4 条、D-W4S-1、D-W4S-2）与 W4 波包决定 1–4。

## 模型与推理强度
developer，implementation_kind product，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。policy_version 947.1，policy_revision 0fe161ac874e0b538876a8b1e580b5c15e9bdd492178f703aaa9bcabedac3f67，role_source_revision c0a49e85629301ba225d65c857d6e9a88a14e75affcec153d11e333488c41299，宿主 Claude Code。策略按 work `provider`、risk `multi-package` 解析为 Fable 5.1 high。实际按负责人分档规则派 Sonnet high：键名、适配器答法与插件形状都由本规格写定，没有撤除的资源。第一次纠偏不行时升 Opus 5.5 high。

## 目标边界
目标：消费者在真实 Cordis `Context` 上装 Skill 插件，按三个服务键取到服务；两个他域端口按调用现取，缺席答 `unknown`。只做下面列的事，`skill` 与 `skill-contract` 不改。

### 已定的事（不重新裁定）

1. **键名全表（IC-7）。** 写在 `packages/skills/skill-cordis-contract/src/cordis.ts`，`Context` 增补用同样的名字：

   | 键 | 抽象 Service | `implements` | 接口出处 |
   | --- | --- | --- | --- |
   | `skillPackageInspection` | `PackageInspectionService` | `PackageInspection` | `@omne-harness/skill-contract/provider` |
   | `skillCatalog` | `SkillCatalogService<P, S>` | `SkillCatalog<P, S>` | `@omne-harness/skill-contract` |
   | `skillAccess` | `SkillAccessService<P, S>` | `SkillAccess<P, S>` | `@omne-harness/skill-contract` |
   | `skillReadCheck` | `SkillReadCheckService<P, S>` | `SkillReadCheck<P, S>` | `@omne-harness/skill-contract/provider` |
   | `skillResolution` | `SkillResolutionService<P, S>` | `SkillResolution<P, S>` | `@omne-harness/skill-contract/provider` |

   接口出处与泛型参数按 `skill-contract` 的 `src/services.ts`、`src/ports.ts`、`src/provider.ts`（父分支 `706152690`）。`Context` 增补里泛型取 `unknown`，同先例。
2. **抽象 Service 的写法（IC-2、IC-3）。** `static readonly provide = '<键>'` 是键的唯一书写处；构造 `super(ctx, X.provide)`；类 `implements` 上表接口；JSDoc 写 `@owner packages/skills/skill-cordis-contract`。不写 `static inject`（IC-8）。不导入任何提供者（IC-5）。先例：`packages/execution/execution-environment-cordis-contract/src/cordis.ts`。
3. **根入口（IC-4）。** `src/index.ts` 没有运行导出，不导入 Cordis。定义都在 `./cordis`。不设 `./testing`（D-W4S-2）。
4. **插件。** `packages/skills/skill-host-local/src/cordis.ts` 导出插件对象 `skillPlugin`（`name` 与 `apply(ctx)`），不收配置与工厂参数：目录来源唯一的选项 `fs` 只给测试用，插件用 `createDirectorySource()` 的默认值。配置 Schema 只接受缺席或空对象（先例 `execution-environment-host-local/src/cordis.ts` 第 34 行一带）。`apply` 做三件事：
   - 造两个端口适配器。每次调用时从 `apply` 收到的 `ctx` 取 `skillReadCheck` 或 `skillResolution`（`ctx.get(<键>)`），取到就把调用原样转过去，答复原样交回；取不到就答该端口 `Reply` 的 `unknown`。不缓存取到的引用，不取服务方法里调用方的上下文。
   - `createDirectorySource()` 作为 `SkillPackageSource`。
   - 用 `@omne-harness/skill` 的 `createPackageInspection`、`createSkillCatalog`、`createSkillAccess` 构造三个服务，逐个 `new` 三个服务子类（子类在 `skill-host-local` 内，继承上表的抽象 Service，把调用转给构造好的服务），挂在同一个 `ctx` 上，共一条 fiber（决定 3）。
   - 不登记撤除函数（决定 4）。
5. **`skill-host-local` 的变体。** 它现在是 `module` 变体。开工先跑 `pnpm package:template scan --member packages/skills/skill-host-local --json`，把完整结构与集成的读数写进交回。没有「升为提供者」的命令；按 `docs/package-organization.md`「现有成员不自动迁移」手工补 `src/cordis.ts`、`tests/cordis-entry.spec.ts`，改写 `docs/cordis.md`（现写「本包是 `module` 变体」）。
6. **新成员的文档。** `skill-cordis-contract` 的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/cordis.md` 按模板的占位填写：依赖分类表（只依赖 `skill-contract` 与 Cordis）、IC 符合性映射（IC-1～IC-9、IC-14、IC-16 逐条：做到、不适用及理由）、验证义务（下面验收第 2 条）。删去所有占位标记；`documentation.json` 按模板维护。

### 写范围
- `packages/skills/skill-cordis-contract/` — 草稿新成员的全部内容：`src/cordis.ts`（第 1、2 条）、`src/index.ts`（第 3 条）、`tests/`（验收第 2 条）、模板生成的文档文件（第 6 条）；`package.json` 的依赖段不改
- `packages/skills/skill-host-local/src/cordis.ts`（新建） — 第 4 条
- `packages/skills/skill-host-local/package.json` — 只加 `exports` 的 `./cordis` 一项；依赖段不改
- `packages/skills/skill-host-local/src/index.md` — 列出新文件
- `packages/skills/skill-host-local/src/README.md` — 列出新文件
- `packages/skills/skill-host-local/tests/cordis-entry.spec.ts`（新建） — 验收第 3 条
- `packages/skills/skill-host-local/tests/index.md` — 列出新文件
- `packages/skills/skill-host-local/tests/README.md` — 列出新文件
- `packages/skills/skill-host-local/docs/cordis.md` — 第 5 条
- `packages/skills/skill-host-local/SPEC.md` — 只加 `./cordis` 入口的一行与插件的用法
- `packages/skills/skill-host-local/README.md` — 只加 `./cordis` 入口的一行与插件的用法
- `packages/skills/skill-host-local/README_ZH.md` — 只加 `./cordis` 入口的一行与插件的用法
- `packages/skills/skill-host-local/documentation.json` — 仅当 `lint:rules` 或 `check:docs` 要求

### 仓库之外的任务产物
无。

### 排除的调用方
- `packages/skills/skill/`、`packages/skills/skill-contract/` 全部文件：本闭包只消费它们。
- 两个成员 `package.json` 的依赖段与锁文件：reduce 已写。需要再加依赖时停下（停止条件第 1 条）。
- `packages/skills/docs/`、`docs/domains/skills/`：组页与领域页由 reduce 在切片 02 写回。
- MCP 组：本闭包不碰。
- 简报检查对 `unknown`、`ctx`、`fail`、`get`、`as`、`draft`、`dist`、`pass` 报的 `caller-outside-scope`（几十万条）是通用词的同名匹配：这些词出现在规格的说明里，不是本闭包要改的符号。本闭包不改任何现有符号的定义，只新增文件与 `exports` 一项。

## 验收清单
1. `pnpm package:template scan --member packages/skills/skill-cordis-contract --json` 报完整结构 `pass`，集成没有 `deviation`。交回贴原样输出（D-W4S-1）。同时贴 `skill-host-local` 的同一命令输出。
2. `skill-cordis-contract` 的用例：`tests/cordis-entry.spec.ts` 断言每个键常量等于类的 `provide`，`./cordis` 的导出集合恰为五个抽象 Service 类（与它们的类型）；`tests/public-entry.spec.ts` 断言根入口没有运行导出、源码不导入 `@deepseek-ai/cordis`。
3. `skill-host-local` 的 `tests/cordis-entry.spec.ts`，在真实 Cordis `Context` 上：
   - 两个端口键用 `@omne-harness/skill-contract/testing` 的内存替身包成 Service 子类提供，装 `skillPlugin`，按三个键取到服务，在目录来源（测试内建的临时目录里的一个合法 Skill 包）上走通「描述 → 读」。
   - 两个端口键逐个缺席：依赖它的操作答 `unknown`，不交内容；`skillPackageInspection` 照常取得并能检查包。
   - 端口换代：先提供一个替身，再撤下换另一个，下一次操作用新的。
   - 插件撤除（`dispose()`）之后，三个键为 `undefined`。
   - 配置给非空对象时插件加载失败。
   每条用例在交回里写一处让它变红的改动（例如适配器缓存首次取到的引用、缺席时答 `deny`），在副本上做，不提交。
4. `pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract --filter=@omne-harness/skill --filter=@omne-harness/skill-host-local --filter=@omne-harness/skill-cordis-contract` 退出 0；同一组 `--filter` 的 `pnpm turbo run test:slow` 退出 0；`pnpm run lint:deps` 没有违规。
5. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 退出 0。交回每条的输出尾部与日志哈希。
6. `git diff --name-only 60acfc28b640a1535585df1ebccd22bdc87e4d7c..HEAD` 只含写范围内的文件。

## 实施规格
- 用例只断言外部行为：键是否取得到、旅程的答复、缺席时的 `unknown`、撤除后取不到。不断言内部结构。
- 成员测试导入 `dist`：改源码后先 `pnpm turbo run build --filter=<成员>` 再跑用例；做变红验证时同样先构建，还原后再构建一次。
- 不加 `as` 断言绕过类型。
- 中文文档按 asd-ste100 的语言无关规则，只写现状与依据。用例标题是可读的英文句子，不写阶段式注释。

## 性质及证据义务
- 「缺席不放行」由适配器承担：验收第 3 条的缺席用例与变红验证。
- 撤除时在途操作的答复：未验证，写进 `skill-host-local/docs/cordis.md` 的「未覆盖」。
- 差分变异由派发者在最终 head 上跑，不在本闭包。

## 施工计划
1. 读方法入口；在工作树根确认四个成员已构建（`ready.json`）；跑第 5 条的 `scan` 取 `skill-host-local` 读数。
2. `skill-cordis-contract` 的 `src/` 与用例；`scan` 读数。
3. `skill-host-local` 的插件与用例。
4. 两个成员的文档。
5. 验收第 4–6 条；变红验证；交回。
提交信息中文，作者 `PanQiWei <594557445@qq.com>`，trailer `Harness: claude-code`、`Agent-Role: developer`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行四个成员的构建、类型检查、快层与慢层，`package:template scan`；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改 `package.json` 与锁文件、跑 `admission`、仓库全量测试与差分变异。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w4-skill-cordis，已构建 `skill-contract`、`skill`、`skill-host-local`、`skill-cordis-contract`。同时可能有 MCP 线的一个写者在另一棵树上跑门禁，共用 CPU：单个用例文件用 `VITEST_MAX_WORKERS=4 pnpm exec vitest run <文件>`，四包整组只在交回前跑一次。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-skill-cordis/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- W4 Skill 规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/skill/spec.md（第 1–4 条、跨域概念五问、失败语义）
- W4 波包决定 1–4：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/wave-pack.md §4
- Cordis 集成约定：`docs/architecture/cordis-integration-conventions.md` IC-1～IC-9、IC-14、IC-16
- 先例：`packages/execution/execution-environment-cordis-contract/src/cordis.ts`、`tests/`；`packages/execution/execution-environment-host-local/src/cordis.ts`、`tests/cordis-entry.spec.ts`
- 契约与工厂：`packages/skills/skill-contract/src/`（三个服务接口、`./provider` 的端口与 `Reply`、`./testing` 的替身）；`packages/skills/skill/src/inspection.ts`、`catalog.ts`、访问服务的工厂；`packages/skills/skill-host-local/src/directory-source.ts`
- 包模板：`tools/dev-flow/templates/package/README_ZH.md`「标识与人工采用门」
- 必须加载：ub-mode、asd-ste100、pstack:typescript-best-practices

## 当前认知
- 已确认：基线上 Skill 四包（含草稿成员）由 reduce 构建；`skill` 的三个工厂只收端口，没有选项。
- 已确认（reduce 在 F 上的读数，`tmp/closures/w4-shared/scan-*.json`，父分支工作树）：`skill-cordis-contract` 的 `scan` 结构 `fail`，原因全是 `draft` 占位（`src/index.ts`、`src/cordis.ts`、README 等），集成 `unknown`；另有一条 `ROLE` 依赖读数 `unknown`（`docs/architecture/constraints.json` 没有映射这个新成员的入口责任，那是 integration 线的文件，本闭包不改，写进交回的未覆盖）。`scan` 把未贴标的新成员推断为 `cordis-module` 变体，这不是写者要改的。`skill-host-local` 的结构 `fail` 是基线既有：W3 的 `examples/sample-skill/` 里有模板未声明的目录（`.omne/`、`scripts/`），本闭包不改它。验收第 1 条只要求新成员结构 `pass`、集成无 `deviation`。
- 未知：撤除之后对装载时 `ctx` 的 `ctx.get` 答什么（不需要回答，写进未覆盖）；模板草稿的文档占位有多少。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；两份 `scan` 原样输出；键名全表的最终版；变红验证表；未覆盖项。

## 已知会受影响的现有用例
- 无。本闭包只加文件，`skill-host-local` 的现有源码不改。

## 停止条件
- 需要改写范围外的文件、`package.json` 或锁文件。
- `scan` 报模板缺口（必需文件或规则与本规格冲突）：缺口归模板拥有者，交回，不改模板（波包 §3.4）。
- 契约接口的实际形状与第 1 条的表对不上，且不是泛型参数的差别。
- 基线上的用例在本工作树失败。

## 追加记录

- 2026-11-06 13:06 追加 1（写者 13:04 交回 `05e54035e`，四包门禁绿、`scan` 结构 pass）。规格缺陷由派发者承担并更正：
  1. **键常量。** 第 1 条与验收第 2 条写「导出集合恰为五个抽象 Service 类」，与 [IC-2](../../../../docs/architecture/cordis-integration-conventions.md)「定义包导出的键常量取自 `provide`；消费者引用定义包的键常量」相反，先例 `model-cordis-contract` 也导出键常量（`export const modelRuntimeKey = ModelRuntimeService.provide`）。更正为：`./cordis` 另导出五个键常量 `skillPackageInspectionKey`、`skillCatalogKey`、`skillAccessKey`、`skillReadCheckKey`、`skillResolutionKey`，各取自对应类的 `provide`；`skill-host-local` 的插件与用例改用这些常量；验收第 2 条改为「导出集合恰为五个类与五个键常量，每个常量等于对应类的 `provide`」。删去 `skill-cordis-contract` 的 `docs/cordis.md` 与 `docs/architecture.md` 里对 IC-2 的偏离登记。
  2. **写范围加四份本成员文档**（写者点出的过时句子）：`packages/skills/skill-host-local/docs/README.md`（第 19 行一带）、`packages/skills/skill-host-local/docs/public-api.md`（加 `./cordis` 入口与 `skillPlugin`）、`packages/skills/skill-host-local/docs/context.md`（第 13 行一带）、`packages/skills/skill-host-local/docs/index.md`（第 12 行一带）。组页与领域页仍归 reduce 切片 02。
  3. `lint:deps` 的 8 条 `no-unresolvable` 来自本树没构建的三个别组成员，派发者在合入后的父分支（全量构建过）上复核，写者不处理。
  4. `skill-cordis-contract/acceptance/` 的占位由派发者（main）在合入时处理，写者不改。
  5. 其余自定项认可：插件 `name` 为 `'skill'`；缺席答法按接口实际返回类型逐方法给出；`erasableSyntaxOnly` 下显式声明字段。
  改完后重跑验收第 1–6 条，变红验证表补「键常量不等于 `provide`」与「导出多一个或少一个常量」两条，按「返回与恢复」交回。

- 2026-11-06 13:33 追加 2：关口修复轮（C-SM-08 的唯一一轮）。评审报告与派发者裁定在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w4/reviews/skill-cordis-r1.md`。新开写者接手，分支头 `9817e28d9`：派发者已把父分支共享写 `9a1089645`（`skill-host-local` 依赖段加 `@omne-harness/kernel-basis`，锁文件）合进本分支，并构建了 kernel-basis。下面每一项都要做；做不到的按停止条件交回，不跳过。
  **代码与用例**
  1. **插件经 `definePlugin`（IC-14，C-F1）。** `skillPlugin = definePlugin({ name: 'skill', Config: emptyConfig, apply(ctx) { … } })`，`definePlugin` 与 `StandardSchema` 来自 `@omne-harness/kernel-basis/cordis`；`emptyConfig` 标注为 `StandardSchema<object>`；删去本地的 `EmptyConfig` 类型。先例 `packages/agent/agent-host-local/src/host-plugin.ts:190`。
  2. **配置判据与用例（C-F2、A4）。** 判据改为：`undefined`、`null`，或原型是 `Object.prototype`／`null` 且没有自有键的对象，答 `{ value: {} }`；其余答 `{ issues: [{ message: 'configuration accepts no fields' }] }`。用例直接调用 `emptyConfig['~standard'].validate`，表格断言精确答复：接受 `undefined`、`null`、`{}`、`Object.create(null)`；拒绝 `{ extra: true }`、`[]`、`'x'`、`0`、`new Date()`。真实 `Context` 上保留 `{ extra: true }` 装载失败一条，失败时 `skillAccessKey` 取不到；加 `{}` 装载成功并取到服务一条。
  3. **每个转发方法都被区分（C-F3、A1–A3）。** 走通用例在 `describe`、`read` 之外再调：`list`（带 `basis`，断言答复的 `basis` 与资源列表）、`export`（带 `basis`，断言条目里有 `SKILL.md` 与摘要）、`search` 一次命中（断言命中该 Skill）一次不命中（断言 `ok: []`）。两条缺席用例各补 `list`、`export`。加一条：`skillResolution` 换代后，`skillCatalog.summaries` 用新的提供者（经 `adopted` 路径）。
  4. **键名字面量（A5、C-F4）。** `tests/cordis-entry.spec.ts:112` 的类型位置改用 `typeof <键常量>`。
  5. **定义成员用例（C-F5）。** `skill-cordis-contract/tests/cordis-entry.spec.ts` 的装载与卸载改成五个类的表格用例：每个类给一个最小具体子类，`ctx.plugin(Sub)` 之后 `ctx.get(<键常量>)` 是 `Sub` 的实例，`dispose()` 之后是 `undefined`。
  6. 每项新用例在交回里写一处让它变红的改动（副本上做、不提交），变红日志写进 `tmp/closures/w4-skill-cordis/logs/`，交回给出日志哈希。
  **文档（B 面）**
  7. **B1（阻断）：写范围加下列 `skill-host-local` 文件，改到与实现一致**：`docs/architecture.md`（第 14 行的依赖、第 31 行「没有类」、第 7–12 行的模块表加 `src/cordis.ts`）、`docs/object-model.md`（第 3 行「没有类」：三个服务子类挂在 fiber 上，随卸载撤除）、`README.md` 与 `README_ZH.md`（第 9 行职责加插件，第 91 行模块数）、`SPEC.md`（第 3 行拥有范围加插件，第 9–15 行依据表加插件的依据行：IC 约定、W4 波包决定 1–4）、`package.json` 的 `description` 字段（只改这一个字段）。
  8. **N1 收窄全称断言。** `SPEC.md:92`、`docs/cordis.md:33`、`README.md:31`、`README_ZH.md:31`、`docs/context.md:6` 改为：实际调用了缺席端口的那一步得到 `unknown`，操作按 `skill` SPEC 的规则答复（链接到它的目录与门禁条款），不放行，也不交出受该端口保护的内容。不再复述 `skill` 的规则。
  9. **N2 权威归属（派发者裁定）。** 缺席时的答复由 `skill-host-local` 的 `SPEC.md` 拥有：W4 Skill 规格跨域五问第 4 条把「缺席不放行」定给插件的适配器，定义成员没有行为。`skill-cordis-contract/SPEC.md` 性质 8 改为一句引用（「缺席时的答复由提供者兑现，`skill-host-local` 的规则见其 SPEC」），不再用规范语气写答法。`skill-host-local/docs/cordis.md:27-31` 的答法表改为链接到 SPEC 的对应节。
  10. **N3 IC 映射补全。** `skill-host-local/docs/cordis.md` 的 IC 映射加 IC-3、IC-6、IC-7、IC-8 行：IC-6 写「未验证；同一 isolate 只装一次的前提由装配承担」，其余写「做到」或「不适用」并给理由。「未覆盖」与 `SPEC.md` 的「没有覆盖」补：IC-6（同一 isolate 重复装载、多 isolate 并存）未验证；应用插件树中的装配未执行；真实端口提供者与消费者的组合未执行。删去 `docs/cordis.md:66` 的「也不需要回答」。
  11. **N4 证据栏。** 两个成员 IC 映射里 IC-1、IC-5 与 ROLE 相关的证据写成「scan 读数 `unknown`（`docs/architecture/constraints.json` 未映射入口责任），人工核对：……」并写出核对内容。`skill-cordis-contract` 的「没有覆盖」记下自己的 ROLE、IC-1、IC-5 `unknown`。
  12. **N5 锚点。** `skill-cordis-contract/SPEC.md:12`、`:54`、`README.md:56` 按接口给各自的锚点，与同成员 `docs/public-api.md:24-28` 一致（`PackageInspection` 在 skill-contract SPEC 的 `#parse`，`SkillCatalog` 与 `SkillAccess` 的行为在 `skill/SPEC.md`，三个端口在 `#ports`）。
  13. **N6 示例。** `skill-host-local/README.md:39`、`README_ZH.md:39` 改为从 `@omne-harness/skill-cordis-contract/cordis` 导入 `skillAccessKey` 再 `ctx.get(skillAccessKey)`。
  14. **N7 统一换代粒度。** `SPEC.md:91`、`:94`、`docs/cordis.md:33`、`:43` 统一成：每次端口调用都现取；同一操作中，换代之后发出的端口调用用新实例；已经交回的答复不重算。
  15. **N8 理由。** `docs/cordis.md:52` 共一条 fiber 的理由改用波包决定 3：三个服务没有共享资源，撤除没有要等的东西，一条 fiber 最简单，与 MCP 同形。
  16. **N9 残句与漂移。** `skill-cordis-contract/docs/cordis.md:64` 的归属改对（本成员用例是 `ctx.plugin(Sub)` 装载子类）；`SPEC.md:3` 与 `index.md:15` 删去「运行时校验」「内部实现」的模板残句；`SPEC.md:59` 验证表的性质编号改对，`SPEC.md:11` 依据行补 IC-8。`skill-host-local` 配置接受值的写法全页统一为「缺席、`null` 或没有字段的普通对象」（`docs/cordis.md:14`、`:56`，`SPEC.md:88`）。
  **写范围**：原写范围、追加 1 的四份文档，加第 7 条列出的文件。`package.json` 的依赖段与锁文件不改。组页与领域页仍归 reduce 切片 02。
  **验收**：原验收第 1–6 条（第 6 条的基线仍是 `60acfc28b`，合并进来的 `9a1089645` 的两个文件不算越界）在最终 head 上重跑；第 6 条另核写范围；交回给出每项的改动位置、新用例名、变红改动与日志哈希、门禁日志的完成时刻（须晚于最后一次提交）。
