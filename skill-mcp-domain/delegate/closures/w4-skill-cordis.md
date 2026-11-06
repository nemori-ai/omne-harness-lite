# 闭包规格 w4-skill-cordis

## 身份与位置
- 闭包：w4-skill-cordis（W4 Skill 线切片 01）
- 卡与修订：#1119 r1，波段 W4
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w4-skill-cordis
- 分支：PanQiWei/skill-mcp-w4-skill-cordis
- 基线：<F>
- 清晰度：定

基线是 W4 的冻结输入 F：父分支 `PanQiWei/skill-mcp` 在 W3 全部合入（`706152690`）与 reduce 共享写之后的头。共享写已经生成草稿成员 `packages/skills/skill-cordis-contract/`（模板 `service-contract` 变体），写好它对 `@omne-harness/skill-contract` 与 `@deepseek-ai/cordis` 的依赖，并在 `skill-host-local` 加了依赖（`@deepseek-ai/cordis`、`@omne-harness/skill-cordis-contract`；`@omne-harness/skill` 从 devDependencies 移到 dependencies）与 `exports` 的 `./cordis`。本闭包只填内容。

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
- `packages/skills/skill-cordis-contract/src/cordis.ts` — 第 1、2 条
- `packages/skills/skill-cordis-contract/src/index.ts` — 第 3 条
- `packages/skills/skill-cordis-contract/tests/cordis-entry.spec.ts`、`tests/public-entry.spec.ts` — 验收第 2 条
- `packages/skills/skill-cordis-contract/` 下模板生成的文档文件（`SPEC.md`、`README.md`、`README_ZH.md`、`docs/`、`documentation.json`、各目录的 `README.md` 与 `index.md`） — 第 6 条
- `packages/skills/skill-host-local/src/cordis.ts`（新建） — 第 4 条
- `packages/skills/skill-host-local/src/index.md`、`src/README.md` — 列出新文件
- `packages/skills/skill-host-local/tests/cordis-entry.spec.ts`（新建） — 验收第 3 条
- `packages/skills/skill-host-local/tests/index.md`、`tests/README.md` — 列出新文件
- `packages/skills/skill-host-local/docs/cordis.md` — 第 5 条
- `packages/skills/skill-host-local/SPEC.md`、`README.md`、`README_ZH.md` — 只加 `./cordis` 入口的一行与插件的用法
- `packages/skills/skill-host-local/documentation.json` — 仅当 `lint:rules` 或 `check:docs` 要求

### 仓库之外的任务产物
无。

### 排除的调用方
- `packages/skills/skill/`、`packages/skills/skill-contract/` 全部文件：本闭包只消费它们。
- 两个成员的 `package.json` 与锁文件：reduce 已写。需要再加依赖时停下（停止条件第 1 条）。
- `packages/skills/docs/`、`docs/domains/skills/`：组页与领域页由 reduce 在切片 02 写回。
- MCP 组：本闭包不碰。

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
6. `git diff --name-only <F>..HEAD` 只含写范围内的文件。

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
