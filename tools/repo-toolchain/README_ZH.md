# repo-toolchain

[English](README.md)

`@omne-harness/repo-toolchain` 是本仓库的检查器包，发布在 npm。它提供规则引擎、提交署名、依赖图、声明兼容、契约 API 快照、结构度量、实际架构抽取、审讯页与 clean loop。仓库在 `pnpm-workspace.yaml` 的 catalog 里钉它的精确版本，根目录的检查与三个工具成员都运行 npm 上的那个版本，不运行本目录的源码。改了本目录，要先发新版本，再开改钉子的 PR，见[开发指南](../../docs/development.md#仓库工具链的版本)。

三个不发布的工具成员经本包的子路径导入它，本包不引用它们：

- [dev-flow](../dev-flow/README_ZH.md)：开工准入、任务绑定、Issue 与看板读取、包模板。
- [product-checks](../product-checks/README_ZH.md)：本仓库的产品规则、验收覆盖声明与场景状态。
- [test-runner](../test-runner/README_ZH.md)：影响面计划、成员测试、耗时账本与差分变异。

## 仓库根与配置

- 被检查的仓库取 `OMNE_SUBJECT_ROOT`，未设置时取当前目录所在 Git 仓库的根。
- 运行检查器的仓库取 `OMNE_RUNNER_ROOT`，未设置时与被检查的仓库相同。依赖规则（`.dependency-cruiser.cjs`、`tsconfig.base.json`）与配置只从这个仓库读，被检查的检出改不了它们。
- 配置在仓库根的 [`repo-toolchain.config.json`](../../repo-toolchain.config.json)，可有 `loop`、`metrics`、`acceptanceLock`、`contractApi` 四节，每个命令只读自己的那一节。缺文件、缺所读的节或有认不出的节时报错，不使用默认值。`contractApi` 一节从 0.0.10 起认得，更早的版本见到它会报错。
- dependency-cruiser 需要 TypeScript 才能解析 `.ts`。用 pnpm 安装时，在 `pnpm-workspace.yaml` 的 `packageExtensions` 里给 dependency-cruiser 加上 `typescript`。找不到 TypeScript 时，依赖图检查报错退出，不会在漏掉 `.ts` 的情况下通过。

## 包内分层

下层不依赖上层，顺序为：`src/core`，检查与度量（`acceptance`、`arch`、`archive`、`declarations`、`deps`、`metrics`、`product`、`commits.ts`），`src/report`，`src/loop`。`metrics` 也不依赖 `arch`。CLI 入口负责组装，不受这几条约束。规则写在 [dependency-cruiser 预设](../repo-config/dependency-cruiser.cjs)，自测在 `tests/deps-graph.spec.ts`。

## 公开入口

`exports` 的子路径对应 `src` 下的模块，例如 `@omne-harness/repo-toolchain/core/task-context`。`.` 导出规则类型、`collectSources`、`runRules(files, rules)` 与实际架构 API；`./architecture` 导出实际架构 API。`loop/run`、`loop/hook-measure` 与 `loop/sensors/*` 只供本仓库其他工具成员的测试使用，不作公开承诺。发布时去掉指向 `src` 的 `source` 条件。

命令入口（`bin`）都指向 `dist`，从安装的包运行：

| 命令 | 源码入口 | 作用 |
| --- | --- | --- |
| `omne-deps` | `src/deps/cli.ts` | 依赖规则、`constraints.json` 的方向行，与成员、组之间的环 |
| `omne-declarations` | `src/declarations/cli.ts` | 用 TypeScript 6 读成员 dist 里的声明 |
| `omne-contract-api` | `src/declarations/api-cli.ts` | 契约成员的 API 快照：写、核对与相对基线的粗分类 |
| `omne-metrics` | `src/metrics/cli.ts` | 结构度量与审讯页 |
| `omne-loop-status` | `src/loop/cli.ts` | 回路状态 |
| `omne-loop-health` | `src/loop/health-cli.ts` | 流程体检页 |
| `omne-acceptance-lock` | `src/acceptance/cli.ts` | 验收锁 |
| `omne-architecture` | `src/arch/cli.ts` | 实际架构 JSON |

## 缺省基线

`core/task-context` 的 `resolveBaseline(root, explicitBase?, env?)` 是所有入口共用的缺省基线规则，按顺序取第一个存在的：

1. 显式基线：`explicitBase`（`--base`），没有就取环境变量 `BASELINE`。空串视为没给。
2. 任务上下文固定的 `targetBase`。工作树绑定了任务上下文时，显式基线只有等于 `targetBase` 才被接受，否则抛 `stale`。
3. `origin/main`，本地没有这个引用时：
4. `main`。

返回 `{ state, targetBase, source, audits }`；`source` 是 `explicit`、`task`、`origin/main` 或 `main`，说明基线从哪一条来。`baselines` 保持原样：它不补缺省，没有任务上下文也没有显式基线时 `targetBase` 为 `undefined`。

## 构建与测试

```sh
pnpm --filter @omne-harness/repo-toolchain build      # tsc，再把审讯页内联的第三方代码预打包到 dist
pnpm --filter @omne-harness/repo-toolchain typecheck
pnpm --filter @omne-harness/repo-toolchain test
```

审讯页内联的 React、@xyflow/react、antd 与 elkjs 在构建时写入 `dist/report/flow/architecture/page-assets.json`。从 `dist` 运行时读取这个文件，从源码运行时现场打包，所以发布的包不依赖这些界面库。

## Git 环境隔离

显式仓库的 Git 子进程由 [git-environment.ts](src/core/git-environment.ts) 隔离八项仓库定位变量。认证、Git 配置、OMNE runner/subject 与测试控制参数继续继承。Vitest 在加载测试文件前另清两个 OMNE root，防止普通 fixture 读写外部仓库；污染回归在被测入口显式注入环境。持续验证见 [repository-environment.spec.ts](tests/repository-environment.spec.ts) 与 [integration-transport.spec.ts](../dev-flow/tests/integration-transport.spec.ts)。

## 依赖图与依赖规则

仓库只有一张依赖图，由 dependency-cruiser 按根 `.dependency-cruiser.cjs` 生成，入口在 `src/deps/graph.ts`。`pnpm run lint:deps`（`src/deps/cli.ts`）、[回路状态](#回路状态)的硬线与新增跨成员依赖、[结构度量](#结构度量)和[实际架构](#全局实际架构视图)的报告都读它，本包不再自写导入解析或层位表。

- 规则：无法解析的导入、文件级运行时循环、legacy 引用，以及按[产品包组织](../../docs/package-organization.md#依赖方向与cordis集成)与[系统分层](../../docs/architecture/layers-and-dependencies.md#依赖关系与禁止方向)写成成员路径的方向规则（SDK 与 server-entry 互不导入、公开契约不依赖两端实现、业务不依赖 SDK 与装配入口、common 与 util 不依赖领域成员、产品包不依赖应用与工具）。每条规则的 `comment` 指回出处。要按角色判断的规则（契约不依赖提供者等）还没有机读的角色，没有写。
- 方向行：`docs/architecture/constraints.json` schema 3 的 `directions`，格式与校验见[符合性契约](src/arch/CONFORMANCE.md#方向行)；`omne-deps` 怎样用它见下面[依赖方向](#依赖方向)一节。
- 组环例外：同一文件 schema 3 的 `groupCycleExceptions`，格式与校验见[符合性契约](src/arch/CONFORMANCE.md#组环例外)；`omne-deps` 与回路状态怎样用它见下面[组环例外](#组环例外)一节。
- 成员边：产品源码（不含测试）解析到另一个成员的依赖，类型导入也算。成员与组之间的环由这些边算出。导入处的行号按说明符在文件里第一次出现的位置找。图里另保留成员里 dependency-cruiser 走到的模块清单（`modules`）与跨成员的文件级依赖事实（`dependencies`，含测试与 `src` 下的 testing 入口，不含 Node 内建模块），方向行的判定与架构符合性报告的方向行都只从这两项判断，不另解析导入。
- 工作树的图不含被 Git 忽略且未跟踪的目录里的模块与它们的违规（本地产物，理由同[实际架构](#全局实际架构视图)的成员规则）；不在 Git 仓库里的目录没有忽略规则，照常出图。
- 规则与解析选项（`tsconfig.base.json` 的 `source` 条件）只从运行检查器的仓库读，被检查的检出改不了。
- 基线图：把那个提交的源码导出到 git 公共目录下的临时树，按成员包名补上 `node_modules/@omne-harness/*` 链接后跑；结果按提交、规则文件摘要与图的格式版本缓存在 `<git-common-dir>/omne-dep-graph/`，同一基线只算一次，不写工作树。
- 耗时：本机全仓一次约 3 秒，基线命中缓存约 10 毫秒。
- 回路状态的硬线是依赖违规与环；方向命中只让 `lint:deps` 退出 1，回路里只报告。按具名例外放行的组环不算硬线。

自测：`tests/deps-graph.spec.ts`、`tests/direction-rules.spec.ts`、`tests/group-cycle-exceptions-cli.spec.ts`（runner 与被检树分开的临时仓库）、`tests/group-cycle-exceptions.spec.ts`；回路金丝雀种了一处 `shared-stays-pure` 违规与一对成环的成员。

### 依赖方向

`omne-deps` 从 0.0.12 起按 `constraints.json` 的方向行检查依赖方向。方向行与角色只从运行检查器的仓库读，`--root` 只改变被检查的树；被检查的树改动或删除自己的 `constraints.json` 与预设都不改变结果。

- 命中：一处已解析的导入，所在文件落在某条方向行某个 `from` 角色的 `paths` 里（按 `paths` 匹配，不取最精确的角色；方向行引用的角色的 `paths` 在校验时已保证不与别的角色相同或互相包含），并且解析后的目标文件所在的成员等于某个 `to` 角色的成员。类型导入、`export … from`（含 `export *` 与 `export { x } from`）、动态 `import()`、按包名或公开子路径导入、tsconfig 别名、跨成员相对路径都按解析后的目标判断；目标在 `src/`、`dist/` 或声明文件里都算同一成员。解析失败的导入不是方向命中，仍由 `no-unresolvable` 报出；别名只有运行检查器的 `tsconfig.base.json` 声明了 `paths` 才解析得到。
- 发现：每处命中一条 `direction-rule`，写 `[<方向行 id>] <源文件> 依赖了 <目标文件>（<源角色> → <目标角色>）：<出处>`，后面是导入处的路径与行号；一处导入同时命中几条方向行就报几条。某条方向行的某个源角色或目标角色在被检树里匹配不到任何文件时，报一条 `direction-unknown`，写明方向行、源或目标与角色：源成员或目标成员改名、迁走后，方向检查都不以「命中 0 处」通过。
- 退出码：有任何 `direction-rule` 或 `direction-unknown` 退出 1，原有发现与退出码的含义不变。
- 汇总行：`依赖方向：检查了 <n> 条方向行、<m> 个成员对，命中 <k> 处`，有角色没有文件时再写几处。
- 没有方向行：运行检查器的仓库没有 `constraints.json` 时不检查方向，写「runner 没有 docs/architecture/constraints.json，未检查」，退出码只由其他发现决定；文件是 schema 1、2，或 schema 3 缺省 `directions`，写「没有方向行」。
- 退出 2：`constraints.json` 解析失败、校验失败、来源核对失败，或 `docs/architecture/constraints.json` 与 `.meta_harness/design/architecture/constraints.json` 两份并存。先读它再运行 dependency-cruiser，所以文件坏了不出依赖图。

### 组环例外

组之间成环默认失败。负责人裁定某个组环在架构上成立时，在运行检查器的仓库的 `constraints.json` 里登记一条 `groupCycleExceptions`，写明成员边（`from`、`to` 是成员路径）、裁定链接和一句理由。例外只放行登记的边，不放行组集合。例外与方向行一样只从运行检查器的仓库读，被检查的树登记的例外不生效。

- 放行：对依赖图上的每个组环，`omne-deps` 去掉它的成员边里登记的边，再在这些组上重算强连通分量。不再成环就不算失败，另写一行 `excepted 组环 <组>、<组> 按例外 <id>（裁定 <链接>）放行 <from> → <to>、…：<理由>`。去掉后仍有环，照常报 `组之间成环` 并失败。因此两个组之间以后新增的、没有登记的成员边会让组环照常失败。
- 没用上：登记的边必须出现在某个组环里。边被删、组环已消失或边不在环上时，这条例外报一条 `unused-group-cycle-exception`，写明 id、没用上的边和裁定链接，并退出 1。要删掉或改写这条例外。
- 成员环：成员之间的环不受例外影响，照常失败。文件环与其他规则也一样。
- 汇总行：有放行的组环时，末行写「<n> 个组环按具名例外放行」。
- 回路状态：硬线读同一份例外。放行的组环不算硬线，在 `status.md` 硬线一段的「环」下面列出例外、裁定链接与放行的边，在 `status.json` 的 `hardLines.exceptedCycles` 里保留。没用上的例外算进「环」这条硬线。runner 的 `constraints.json` 坏了时，回路状态按工具错误退出 2。收工钩子的硬线同样按例外判。
- 结构度量与实际架构的报告不读例外：它们照旧把放行的组环列为环。
- 版本：已发布的 0.0.15 不认这个字段，读到它就按未知字段退出 2。登记例外要和升到支持它的版本一起做。

## 提交署名

`commit-attribution`（`src/commits.ts`）随 `pnpm run lint:rules` 执行，有违反即退出 1。它查的不是源码，
而是当前提交可达的**全部历史**，规则正文在[根 AGENTS.md 的「署名与分支」](../../AGENTS.md#署名与分支作者是人来源可追溯)。

| 报出                                                         | 放行                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `Co-Authored-By:` 行里是 coding agent 或其厂商               | 人与人的共同署名                                                       |
| `Generated with`／`Generated by` 一类把 agent 列为产出者的行 | `Harness:`、`Agent-Role:` 两条来源 trailer——它们记来源，不表示作者身份 |
| author 或 committer 的名字、邮箱是 agent                     | 提交标题与正文里提到 agent 的名字                                      |

报告写成 `commit <短号>:<提交信息里的行号>`。它认的是 `src/commits.ts` 里列出的那批名字，新出现的工具要加进去；
它**不核对**来源 trailer 有没有写、写得对不对——哪些提交有 agent 参与，工具看不出来。
浅克隆时只查克隆下来的那些提交；不在 git 检出里运行时通过提示会写明「未检查」。自测：`tests/commit-attribution.spec.ts`。本仓库已在共享历史里、不能改写的提交，由 [product-checks 的历史审计基线](../product-checks/README_ZH.md#提交署名的历史审计基线)逐条列出；本包不读基线，`attributionViolations` 照常报告全部违反。

## 验收锁

可执行验收放在成员的 `acceptance/` 目录，归负责的人、主会话与独立验收角色；实施的 agent 只运行、不修改
（约定见[源码布局](../../docs/workspace.md#目录与内容归属)）。`src/acceptance/` 核对这一条有没有被破：

```sh
pnpm run acceptance:lock --base <任务基线提交或分支>
```

不给 `--base` 时按[统一规则](#缺省基线)取基线：环境变量 `BASELINE`，再取任务上下文的基线，再取 `origin/main`，最后取 `main`。

模板生成的验收入口不算验收内容：`acceptance/` 下名为 `README.md` 或 `index.md`、变化后（删除时看变化前）仍有独立一行文档占位标记的文件，增删改都不计入；去掉标记、写入真实内容的改动照常计入（RFC-0007）。

**基线提交就是清单**：Git 按内容寻址，派发时不必另存一份哈希。工具拿基线与 HEAD 的合并点同当前工作树比，输出以下事实：

- 基线到当前工作树，验收文件的净变化（新增、修改、删除，含未提交与未跟踪）；
- 这段范围里**每一个**碰过验收文件的提交：短号、作者、来源 trailer 里的 `Agent-Role`、碰了哪些文件；
- 原始违规、已批准的精确历史例外和未解决违规。

| 判锁被破（退出 1）                                                  | 放行                                            |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| 碰过验收文件的提交，`Agent-Role` 不在拥有者角色里（如 `developer`），且没有精确历史批准 | `Agent-Role` 是拥有者角色（`main`、`qa`）的提交 |
| 工作树里有未提交或未跟踪的验收改动——说不清是谁改的                  | 没有来源 trailer 的提交：按人写的算             |

哪些根目录下的成员受管、验收目录叫什么、哪些角色算拥有者，只在
仓库根 [`repo-toolchain.config.json`](../../repo-toolchain.config.json) 的 `acceptanceLock` 一节 里定一次。用法或 Git 出错（`--base` 没给值、基线不存在）退出 2。

`LockReport.violations` 保留原始发现，`commits[].allowed` 仍表示原角色判断。
`approvedExceptions` 单列已批准历史例外，包含完整 commit、parent、path、oldBlob、newBlob、diffSha256 和 decisionUrl。
`unresolvedViolations` 表示剩余违规，独立 CLI 据它返回 0 或 1。
Loop 的 `auditRanges[].acceptance` 保留完整报告，`hardLines.acceptanceLock.violations` 只列未解决项。
Loop 的 Markdown 同时显示原始违规和批准决定；其他硬线照常判断。

固定决定编进 `src/acceptance/historical-approvals.data.ts` 的只读列表（核对器 `src/acceptance/historical-approvals.ts` 只读这份列表），每条对应一个提交里的一个受保护路径；一个提交改了几个受保护路径，就登记几条。
[D010 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6367449357)批准提交 `48ad37d292796326d65055a75e8a1fde44fe4233` 中的 `packages/agent/agent/acceptance/README.md` 改动。
[#769 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/769#issuecomment-6411908205)批准提交 `19f457a15`、`9f3967cc5`、`69bdedfab`、`837d333fd`、`14b0fcfcb`、`06acd53ca` 中的 27 个路径改动。
没有任务上下文时，验收锁把合并提交与每个父提交分别比较（`git diff-tree -m`），与任一父提交不同的路径都列出。有任务上下文时它用 `--cc`，只列与所有父提交都不同的路径，干净合并因此不列路径。#769 的六个提交里有四个是这样的合并。
登记约定是：合并提交的条目写该路径有变化的那一个父提交。工具不核对这条约定，只核对所写父提交是该提交的父提交之一。
工具读取真实 Git 对象，核对完整提交、所写父提交确是该提交的父提交、受保护路径、旧新 blob 和完整二进制 diff 的 SHA-256。某一侧没有这个路径时，blob 记为 Git 的空对象号（40 个 0，与 `git diff --raw` 的写法相同），工具核对该侧的树里确实没有这个路径。该 diff 使用 `git diff --no-ext-diff --no-textconv --no-color --binary -U3 --src-prefix=a/ --dst-prefix=b/ --text`。
调用固定 `core.abbrev=8`、`diff.noprefix=false`、`diff.mnemonicPrefix=false`、`diff.algorithm=myers`、`diff.indentHeuristic=true`、`diff.context=3`、`diff.interHunkContext=0`、`diff.suppressBlankEmpty=false`、`diff.srcPrefix=a/`、`diff.dstPrefix=b/`、`core.attributesFile=/dev/null` 与 `attr.tree`（空树），从环境中去掉 `GIT_DIFF_OPTS` 与 `GIT_ATTR_SOURCE`，并设 `GIT_ATTR_NOSYSTEM=1`。仓库大小与这些配置不会改变字节。
已知限制：`info/attributes` 中的 funcname、xfuncname 或 `binary` 属性，Git 2.43 以前版本下工作树里的 `.gitattributes`，以及对象前缀碰撞，会改变字节，该条因此不获批准。这些情况的失败方向是拒绝，不会误批准。
其他普通文档可以在原提交中一起修改。验收锁为一个提交列出的受保护路径必须恰好等于为它登记的路径，多一个或少一个，这个提交一条都不批准。
路径集合相等、但其中一条的指纹不符时，只有那一条不批准，该提交的其他条目照常批准；不符那条的路径仍是未解决违规，CLI 仍退出 1。
未提交改动、未来 developer 提交和任一指纹或决定不匹配仍失败。Git 读取失败退出 2。
仓库配置、环境变量、CLI 参数和外部 URL 都不能新增批准；运行时不访问 GitHub。
批准记录随受审查的工具制品发布，安装版本与 npm integrity 是采用边界，源码测试通过不代表已安装修复。
持续验证见 `tests/acceptance-lock.spec.ts` 和 `tests/loop-strict.spec.ts`。真实历史用例需要本仓库保留上述 Git 对象。

它**不能声称**的：角色取自提交信息里的来源 trailer，那是提交的人自己写的——一个把 `Agent-Role` 写成 `main` 的实施提交它认不出来，
所以碰过验收的提交一律列出，由接受的人过目。先改后改回的提交照样列出、照样判破，哪怕净变化为零。
它不看验收的内容对不对、有没有被运行、过没过；文件名是否带卡号也不查。自测：`tests/acceptance-lock.spec.ts`。

## 实际架构 JSON

公共入口为 `@omne-harness/repo-toolchain/architecture`。公开类型在
[`src/arch/actual.ts`](src/arch/actual.ts) 与 [`src/arch/actual-model.ts`](src/arch/actual-model.ts)。
`readActualArchitecture({ root, revision?, base? })` 读取实际源码，不依赖 realization 或意图声明。
`actualArchitectureOf(source)` 投影同一个 AST 抽取器的观测；`readArchitectureSource(root, revision?)`
提供版本内的虚拟文件树；`compareActualArchitectures(before, after)` 计算稳定身份的新增与删除。

```sh
pnpm --silent --filter @omne-harness/repo-toolchain run architecture --root "$PWD"
node --experimental-strip-types tools/repo-toolchain/src/arch/cli.ts --root "$PWD" --revision <commit> --base <commit> --out tmp/architecture.json
```

CLI 的 stdout 只有 JSON。`--out` 另写同一份 JSON。参数、Git、workspace、manifest 或配置错误退出 2，
错误写到 stderr。构建后的入口为 `omne-architecture`。`root` 必须是 Git 仓库顶层；仓库必须有
`pnpm-workspace.yaml` 和带非空 `name` 的成员 manifest。workspace 模式复用测试成员读取器：一行一个，
只支持完整路径段的 `*`，其他 glob 写法报错；重叠模式按成员路径去重。

结果为 `schemaVersion: 1`、`kind: actual-architecture`、`generatedAt` 与 `current`。给 `base`
时另有 `baseline` 与 `difference`。不传 `revision` 读取当前文件系统；传入的 revision 和 BASE
各自先解析成不可变 commit，后续只读该 Git 树。BASE 不取合并点、不从当前工作树补文件。
`source` 记录仓库、commit、读取方式与 Git `dirty`。`inputDirty` 还标记已读输入中没有进入该 commit 的文件，
包括被 Git 忽略的源码或配置；路径在 `unversionedInputs` 中。工作树输入脏时不能当作该提交的静态快照。
仓库根的 Python 虚拟环境 `.venv/` 不进入输入库存；成员中的同名目录仍按实际归属读取。
读取当前文件系统时，被 Git 忽略且未跟踪的目录（例如变异运行器的 `.stryker-tmp-*` 沙箱，或本地的 `scratch/`）是本地产物，不算成员：
它们只存在于某个本地检出，干净检出与 CI 上没有，即使 pnpm 在本地会把它们当成员。
目录自身要匹配忽略规则才算；只忽略了目录里个别文件的目录仍是成员，已跟踪的文件 Git 从不当作被忽略，提交过的成员不受影响。
这些目录里的文件仍照常按「未进入提交的输入」标记。

成员来自该版本的 workspace 和 manifest。`packages/`、`apps/` 下的成员属于产品范围；其余成员
作为 development 单列。名称取 `manifest.name`，不由目录猜包名。空成员保留；`sources` 只列成员
`src/` 内 TypeScript 文件，`dataFiles` 列其余文件。成员源码数量与实际 `analyzedFiles` 分开：
产品测试排除，开发成员可用于静态解析，但不独立抽取其插件。manifest 和配置取本版内容。
配置的 `read` 清单与 `appliedToResolution` 清单分开；后者记录实际选中及 extends 读取的配置。
每个导入先用所属成员的 tsconfig.json、tsconfig.build.json，再用根配置；应用其模块解析选项。
这不复现 compiler build：仍分析全部产品 src TypeScript，不依赖 include/exclude，不加载安装包和
标准库，也不运行 project references。workspace dist exports 静态映射到 src。
按包名写的 extends（例如 `@omne-harness/repo-config/tsconfig.base.json`）指向安装的模块，不在该版本的文件里。
抽取不应用它的选项，把它记进 `configuration.installedExtends`，格式为 `<配置文件> -> <说明符>`。

`facts` 保留服务定义、候选提供、必需与可选取用、事件、插件和静态装配；`imports` 区分类型与运行导入，
含 ESM import/export/dynamic import、空 named 子句、TypeScript `import()` 类型、外部包和成员内导入。
CommonJS require 不在本抽取器范围内。根任务容器与 node_modules 不读取；成员根的 dist/coverage 构建目录不参与解析，
成员本身或 src 子目录采用 tmp/dist/coverage 名称不会被忽略。
`unknown` 保留无法还原的表达式、原因与所有出处，不能用空集合证明不存在。每项事实和导入的
`occurrences` 保留所有来源；同一成员间、同一符号的关系可有多个出处。`candidateProviders` 保留
全部候选事实，`runtimeSelection` 为 `not-observed`，不选择未经运行观察的提供者。

实际关系 ID 用无歧义 tuple 编码；源码 path/line 不参加关系身份。文件搬迁或行号变化不会成为语义新增。
差分分别列成员、事实、导入、未知的 added/removed；完整前后文档保留位置变化和成员 manifest 变化。
复杂度直接复用 `functionMetrics`。coverage 为 `no-data`，不执行测试或推断覆盖率。
进程、外部资源、运行选择与隔离等未观察项写在 `scope.limitations` 中；静态数据不证明租户、事务或生命周期保证。
独立场景见 [`tests/actual-architecture.spec.ts`](tests/actual-architecture.spec.ts)。
旧装配意图对照消费单独的 `IntentImplementation` 投影；其阈值、strict 和声明差分通道保持原义。

## 全局实际架构视图

```sh
node --experimental-strip-types tools/repo-toolchain/src/arch/cli.ts --root "$PWD" --base <精确提交> --report tmp/architecture > tmp/architecture.stdout.json
```

`--report` 生成 `report.html`、`graph.json`、`actual.json` 和 `summary.md`。
stdout 仍只有实际架构 JSON，报告路径写到 stderr。构建后也可用 `omne-architecture`。
直接用浏览器打开 HTML，无需服务器或网络。

页面默认显示应用和目录组总览。展开后可筛选类型/运行导入、必需/可选服务、事件和装配声明。
总览默认使用依赖矩阵，行发起、列目标。数字为输入事实身份数；可切换到 ELK 关系图。
跨组边只汇总直接导入和装配声明。组内关系需展开，服务同名不推断组间绑定。
聚焦组件可显示最多两跳的邻接，排除邻居之间无关关系。点击关系查看全部出处和提交。
选择变化范围可保留精确 BASE 已删除的节点与来源。叠加圈复杂度、静态耦合后，
可进入同页的复杂度与风险面板。SVG/JSON 导出反映当前选择，未展开时导出总览。
画布可平移、缩放及适应全图，出处在右侧栏。视口变化不裁剪 SVG 导出。
绘制期间和失败时禁用导出，失败原因在页面显示；旧布局不得覆盖新选择。

视图只消费 N1 实际数据。目录组不表示运行边界；服务与事件同名不表示实际绑定。
所有提供者均为候选，确认配置选择及实际运行绑定显示“未观测”。规划与架构预期显示“未提供”。
具体 unknown 和未覆盖范围可展开查看，未知条数不能代表全部缺口。
外部代码导入不作为外部运行资源。无函数成员保留，覆盖率缺席不记为零。

公开投影为 `buildArchitectureView(document, bands)` 和 `selectArchitectureView(graph, selection)`，
经同一个 architecture 入口导出。数据类型归 [view.ts](src/arch/view.ts)，
类型表达不出的行为归 [薄规格](src/arch/SPEC.md)，回归见 [视图测试](tests/architecture-view.spec.ts)。
关系图由 React 19 与 @xyflow/react 展示（`src/report/flow/architecture/`），ELK 仍负责位置与路由，节点不可拖动。
表单控件、视图切换、折叠区与函数表由 antd 6 渲染（`flow/controls.tsx`），与 React Flow 打进同一个 bundle；页面标记仍写原生控件，加载时替换，id 与文字不变。
React 19 没有浏览器单文件构建，所以 `renderPage` 生成页面时用 esbuild 把岛打成一个 IIFE 内联（`flow/bundle.ts`），
从 `src/` 与 `dist/` 都能运行，页面仍离线自包含。关系图模式的 SVG 导出由同一份几何生成（`flow/export-svg.ts`），
回归见 [岛测试](tests/architecture-flow.spec.ts)。
布局与导航的采用理由见 [ADR](src/arch/ADR.md)，社区事实与有限探针归其中链接的调查。
复杂度算法和色带复用现有度量，色带读取运行工具版本的配置，页内说明来源。
architecture 报告的函数变化和关系变化都用精确 BASE；metrics 报告的函数变化仍用 merge-base，
架构变化用精确 BASE。页面分别显示两个坐标，非祖先 BASE 时也不混称同一范围。

## 结构度量

`pnpm run metrics` 是本包的第二入口（`src/metrics/`）。它**只报告、不判失败**，不在 `pnpm run check` 里；能让检查失败的只有上面的方向规则与提交署名。

```sh
pnpm run metrics                          # 全仓：实际架构、圈复杂度、依赖图、依赖方向与环
pnpm run metrics --base <基线提交或分支>    # 另标出基线以来变更的成员、函数、导入与提交形状
omne-metrics --plan <计划文件> --coverage   # 再对计划里要跑测试的成员逐个跑测试，取覆盖率并合成 CRAP（先构建）
```

计划文件由 test-runner 的 `plan --json` 写出，准入检查用的也是它（见 [test-runner](../test-runner/README_ZH.md)）。给 `--plan` 时，基线与合并点也取自计划，不能再给 `--base`；计划文件复制到产物目录的 `plan.json`。计划算的不是当前提交时，工具报错退出；工作树绑定了任务上下文时，计划的基线还要与上下文固定的基线一致。`--coverage` 必须带 `--plan`。算完计划后工作树又改了计划外的成员时，带覆盖率的运行报错退出，要求重算计划。改过的文件按最长的成员目录前缀归到成员；成员是 `pnpm-workspace.yaml` 的成员模式匹配到、且 `package.json` 有字符串 `name` 的目录。组根文件（`packages/<组>/README.md`、`packages/<组>/docs/**`）没有成员前缀，不算成员，改它们不触发这项检查。

本工具只读计划文件的四栏：`head`、`base.ref`、`base.mergeBase` 与 `plan.test`（成员目录的数组）。这四栏是本包的输入约定，现在由 test-runner 的 `plan --json` 写出。

产物默认落**主检出**的 `tmp/metrics/<提交短号>[-dirty]/`（在工作树里跑也落主检出，工作树退役不带走；`--out` 或环境变量 `OMNE_METRICS_OUT` 可改）：

| 文件                | 内容                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.md`        | 不超过 12 行，同时打印到标准输出；交付说明原样附它                                                                                                                     |
| `metrics.json`      | 每个成员与每个函数的圈复杂度、覆盖率、CRAP、是否变更                                                                                                                   |
| `graph.json`        | 成员间的边与导入处、方向发现、环、已登记例外                                                                                                                           |
| `review.html`       | 自包含的共同入口：默认实际架构总览，可进入结构图、风险与函数表                                                                                                         |
| `actual.json`       | N1 完整实际架构数据及精确两版差分                                                                                                                                      |
| `architecture.json` | 总览、关系与来源的派生浏览投影；与旧 graph.json 分开                                                                                                                   |
| `plan.json`         | 给 `--plan` 时复制的计划文件                                                                                                                                             |
| `coverage/`         | 开了覆盖率时各成员的原始 `<成员>/coverage-final.json` 与测试输出 `<成员>.vitest.log`；每个成员的耗时与退出码另记在 `metrics.json` 的 `meta` 里，运行时逐个打到标准错误 |

审讯页的网址后带成员路径可直接定位，例如 `review.html#packages/model/model-request-runtime-local`。

怎么算的：

- **计分单元**是有名字的函数：函数声明、类与对象字面量的方法、赋给名字的箭头函数与函数表达式；匿名回调并入它所在的单元，类与具名对象只提供限定名。
- **圈复杂度** = 1 + `if`、各类循环、`catch`、`?:`、`case`、`default`、`&&`、`||` 的个数；`??`、`?.` 与逻辑赋值不计。
- **覆盖率**取函数行范围内、且不落在更内层有名函数里的语句行的命中比例。测试经包名导入自己时执行的是 `dist/`，所以连同 `dist/**/*.js` 一起收集并由 sourcemap 映射回 `src/`。`dist/` 里的 `.map` 与 `.d.ts` 不收集。测试在子进程里执行的代码（例如测试启动的命令行进程）不计入覆盖。
- **跑谁的测试**：只跑计划里要跑测试、且在 `metrics` 配置的 `coverage.roots` 列出的根目录（现为 `packages`、`apps`）下的成员。`examples/` 是阶段性的演示，不长期维护，不为它跑测试；它照常参加圈复杂度与依赖方向的静态度量，覆盖率记为「这次没跑」。
- **CRAP** = 圈复杂度² × (1 − 覆盖率)³ + 圈复杂度。没有覆盖率数据的函数只按圈复杂度评级。
- **成员风险值** = 成员内函数评级分的均值加一个总体标准差，单个最差函数不至于把整个成员染红；它在色带点上分段线性地换成 1 到 10 的评分再取色。组框左边线取组内最差成员。
- **函数是否变更**比对函数自身文本的摘要，不看 diff 行号：挪位置、上方插入代码都不算变。
- **行内排序**用重心法：按相邻成员位置的平均值排五轮，让相连的成员靠近。
- **结构图**由 React Flow 岛展示（`src/report/flow/metrics/`），与架构视图共用同一个内联 bundle。层是横向的列，第 0 层在最左；组是层内的容器；成员是组内网格中的卡片，组内顺序沿用行内排序。几何（`flow/layout.ts`）与画哪些线（`flow/edges.ts`）都是纯函数，回归见 [结构图测试](tests/metrics-structure.spec.ts)。滚轮翻页，按住 ⌘（Windows 为 Ctrl）加滚轮缩放，拖动空白处平移。
- **扇入、扇出与不稳定度**：依赖它的成员数、它依赖的成员数、出 ÷（入 + 出）。
- 阈值与色带在 `metrics` 配置，不写死在代码里：`thresholds`（函数级的「要解释」线）、`bands`（成员着色）与 `page.changedEdgeLimit`（见下）。
- **审讯页画哪些线**：选中一个成员时只画它自己的线（指向它的用虚线），别处只留违规。悬停在成员上等同于临时选中它，离开后恢复点击定下的选中。选中或悬停时，它的线加粗发光，普通导入的线取发起成员卡片的颜色（违规、例外、变更仍为红、橙、蓝），沿线有小点从依赖方流向被依赖方，与它不相邻的成员淡化；系统设置减少动态效果时不显示小点。组间连线同样加粗发光、取发起组左边线的颜色，但没有流动小点。点画布、层或组的空白处取消选中。未选中时违规与已登记例外始终画出；本次变更触及的边不超过 `page.changedEdgeLimit` 条才逐条画，超过就只留卡片上的蓝色「入/出」标记，并在画布底部注明——大变更下逐条画只会糊成一团。连线是贝塞尔曲线，箭头指向被依赖的成员。

**超阈值怎么处置**：看职责不看数字。回答同一个问题的单个分派（一个 `switch`、一张判定表）可以留在阈值之上；嵌套或混了几件事的才拆，拆出的函数拥有自己的输入，不接收调用方本来就知道的布尔值。把函数拆碎只会换来覆盖率数字，换不来设计。

### 出处与有意的差异

这些算法按 Robert C. Martin 的工具的逻辑用 TypeScript 重写——他的仓库没有许可证，所以不搬原文，只照做法；每处在源码注释里标了仓库、提交与文件。源码注释保留具体上游仓库、提交与文件；来源核对的限制不因工具输出通过而消失。

| 做法                              | 出处                                                                         | 与原实现的差异及理由                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 判定点集合                        | crapper `languages/typescript.py`                                            | 逐项一致。阈值是按这套计数校出来的                                                                                                                             |
| 计分单元                          | 同上                                                                         | 原实现只认顶层函数、类方法、顶层箭头常量，嵌套函数并入外层。本仓库大量是「工厂函数返回一组方法」，照那样一个工厂只算一个单元；这里让有名字的内层函数各自成单元 |
| 每函数覆盖率                      | crapper `coverage.py`                                                        | 原实现按整个行区间求比例，区间内没有行记 0%。这里内层单元的行从外层扣掉，外层只剩声明时不给数                                                                  |
| CRAP 公式、风险值、评分与色带     | crapper `crap.py`；uml-viewer `domain/config.clj`、`application/overlay.clj` | 一致。原实现「缺数据一律算最差」；这里没跑覆盖率的成员按圈复杂度评级，跑了却没数据的成员单独标出                                                               |
| 父节点取最差子节点                | uml-viewer `application/hierarchy.clj`                                       | 一致                                                                                                                                                           |
| 环检测                            | dependency-checker `core/graph.clj`（Tarjan 强连通分量）                     | 一致                                                                                                                                                           |
| 扇入、扇出、不稳定度              | dependency-checker `core/stats.clj`                                          | 没有移植抽象度与主序列距离：那套判法会把稳定而没有抽象的叶子一律判进「痛苦区」，对纯数据契约包不成立                                                           |
| 行内重心法排序、最内层在底        | uml-viewer `engine/layout.clj`                                               | 布局交给浏览器的流式排版，只移植了分行与行内顺序。分层不再人工登记，由依赖图算：不依赖别的组的在第 0 层，其余在所依赖的组之上；方向违规由 dependency-cruiser 判 |
| 默认只画三角标记与悬停清单        | uml-viewer `application/hit.clj`；arch-view 删掉箭头走线的那次提交           | 没有移植走线。原作者在这上面反复返工，最后的结论就是标记加清单；这里只在选中成员时画它自己的线                                                                 |
| 函数文本摘要判变更                | mutator `functions.py`、`engine.py`                                          | 内层单元的行不算在外层头上                                                                                                                                     |
| 超阈值的处置判据                  | swarm-forge six-pack 分支 `roles/cleaner.prompt`                             | 措辞改写，判据一致                                                                                                                                             |

读数时的边界见[验证规范](../../docs/verification.md#检查入口)那一行的「不能声称」。自测：`tests/metrics-complexity.spec.ts`、`tests/metrics-report.spec.ts`、`tests/deps-graph.spec.ts`。

## 回路状态

`pnpm run loop:status` 是本包的第三入口（`src/loop/`），回答一个问题：**整洁的各项指标现在各在哪条带上，这次变更里有哪些红项要解释，哪些成员超了预算。**
它说事实（位置、数值、带位），不写该怎么改；回路本身的约定见[整洁回路](../../docs/clean-loop.md)。

```sh
pnpm run loop:status                                   # 全仓现状
pnpm run loop:status --base <任务基线>                  # 另列这次变更里要解释的红项，并核验收锁
pnpm run loop:status --snapshot                        # 干净的工作树上追加一条趋势快照
pnpm run loop:status --base <基线> --strict --out <目录>   # 严格模式，pnpm run check 的最后一步
```

**除硬线外一切只报告。**退出码 1 只在硬线被破时：依赖违规或环（与 `pnpm run metrics`、`lint:deps` 读[同一张依赖图](#依赖图与依赖规则)；无法解析的导入归 `lint:deps`，不算硬线；按[组环例外](#组环例外)放行的组环不算硬线），
或给了 `--base` 且[验收锁](#验收锁)被破，或严格模式下有开着的传感器没数据；
2 是工具自己出错（参数、配置、git）；其余报告项再多也是 0。

**严格模式**（`--strict`）另判一条硬线：配置里开着的传感器（`sensors` 下带 `enabled` 的九个）每一个都要有数据。
有哪个报「没数据」，「硬线」一段列出是哪几个、原因是什么，退出 1；配置里关掉的不算，照旧写明是关掉的。
对照表那一项没有开关、也不进指标，不在此列。「没有基线快照，与基线比未判」是趋势的事，不算传感器没数据。
它要求给 `--base` 与 `--out`（缺了按用法错退出 2），草稿写进 `--out` 目录下的 `proposals/`，不写趋势快照（与 `--snapshot` 同用也是用法错）——
回路目录里一个字节都不动。`pnpm run check` 的最后一步就是它，见[自动化入口](../../scripts/README.md)。

CLI 的范围只有 `all` 和 `engineering`，默认 `all`；工程范围必须与 strict 同用。仓库的 `pnpm run check` 不传范围，使用默认 `all`。
工具复用当前传感器的源码清单，并枚举固定 targetBase、实际 merge-base、每个任务 taskBase 的 Git 树，按同一规则统计源码和测试。相同提交去重。没有 task context 的仓库使用有效显式 base 及其 merge-base。
只有当前与全部基线的两类计数均为零，duplication、assertions 启用但无数据时才列入 `hardLines.sensors.notApplicable`，原因码为 `engineering-without-product-inputs`。
`status.json` 的 `scope.evidence` 保存当前计数和各基线的精确提交、计数。原始 `sensors` 仍是 no-data；终端与 Markdown 点名工程范围不适用。关闭项仍列 `off`，其他启用的无数据项仍列 `silent` 并失败。
最后一个输入被删除或迁入 legacy 时，历史输入仍阻止豁免。无效 context、无效基线、缺对象、读取错误及无法分类的历史链接或子模块按工具错误失败。输入范围沿现有扫描器，包括 legacy、构建产物、测试和声明文件规则。
普通本地 `pnpm run check`、默认 strict、依赖方向与环、验收锁和趋势只读边界保持。工程范围不证明产品质量通过，也不证明跳过的测试通过。

适用性与编排回归位于 `tests/loop-product-inputs.spec.ts`、`tests/loop-status.spec.ts`、`tests/loop-strict.spec.ts`、`tests/formatting-boundaries.spec.ts` 和 dev-flow 的 `tests/integration-boundaries.spec.ts`。真实 Git 与 shell fixture、受控命令替身、真实工程入口分别提供证据。

**传感器金丝雀**：`tests/fixtures/loop-canary/` 是一个最小的假仓库，每个传感器各种了一处已知违规（清单在它的 README）。
`tests/loop-canary.spec.ts` 把它建成临时 git 仓库、造出要历史的那几项，走与严格模式相同的入口（`run.ts` 的 `runLoopStatus`），
逐项断言每个传感器都报出了种下的那一处（具体到文件、成员或 topic），再断言严格模式判失败；另一条移除当前PD的slug目录，断言产品输入不足时报告「没数据」并判失败。
验收耗时传感器读的是账本而不是跑验收，所以它的那一处种在账本里：测试给假仓库的 `apps/cli` 一个 `acceptance` 脚本，
在当前提交那一格写一份「整次 130 秒、最慢一份 50 秒」的验收账本（形状就是运行器写的 `LedgerFile` 类型），断言两项指标都落在处置带。
它随本包的测试每次都跑：哪个传感器悄悄失灵——读错目录、范围漏了、算法改坏——它会指名变红。它只证明种下的那几处查得出，不证明查得全。

落点：`回路目录` = `$OMNE_METRICS_HOME`，没设就是**主检出**的 `tmp/clean-loop/`（在工作树里跑也落主检出）。

| 产物                                  | 内容                                                                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status/<提交短号>[-dirty]/status.md` | 与终端打印相同的文字，分五段：抬头（含用的哪条基线快照）、硬线、各项指标的带位、要解释的红项、超预算的成员（含比基线变差的成员）与对照表条数；`--out` 可改目录                         |
| `status/…/status.json`                | 全量：每个传感器的原始结果（有数据／没数据及原因）、每个成员的四项预算、带位与各项与基线比的结果、要解释的红项全集（函数一类每条带与基线比的结果，没变差的另列在 `functionsNotWorse`） |
| `proposals/<成员路径斜杠换成 ->.md`   | 超预算成员的清理草稿，同一成员覆盖旧稿；六个固定章节与[派发模板](../../.meta_harness/agents/roles/cleanup-task.md)同名同序（常量 `CLEANUP_SECTIONS`）                                  |
| `trend.jsonl`                         | 趋势快照，一行一条：提交、各指标的值与带位、各成员的预算值与带位                                                                                                                       |
| `hook-state.json`、`hook.log`         | [收工钩子](#收工钩子)反馈过的读数（分支与指纹）与它自己出错的原因，一行一次                                                                                                            |

**三条带**：每个指标与每项成员预算都有提醒线、处置线、解除线（数值越大越差，`release ≤ warn ≤ act`）。值到处置线进入处置；
进入之后要回落到解除线及以下才解除，低于处置线但高于解除线仍是处置，这样一个值在线附近摆动时带位不跟着来回翻。
「上一次的带位」取趋势里最近一条是当前提交祖先（或就是它）的快照。配置为「与基线比」的指标另与基线快照比：
比基线差至少是提醒；没有基线快照标「未判」，不当作没变差。基线快照是 `BASE` 合并点那个提交的快照，没有就取合并点之前最近的一条；
不给 `BASE` 时用与 `primaryBranch` 的合并点。当前提交自己的快照不拿来当基线。

**趋势快照**只在工作树干净时写：给了 `--snapshot`，或 HEAD 正是 `primaryBranch` 的头；同一提交已有一条就不再写。读的时候坏行跳过并在抬头里报出行号。

**各项指标与它们从哪来**：

| 指标                                       | 怎么量                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 红色成员数、超 alert 的函数数              | 直接取[结构度量](#结构度量)的报告（不跑覆盖率，按圈复杂度）                                                                                                                                                                                                                                                                                                                                                                                                       |
| 稳定依赖不稳定的边数                       | 成员边 `from → to` 里 `I(to) − I(from) > margin` 的条数，I 是度量报告的不稳定度                                                                                                                                                                                                                                                                                                                                                                                   |
| 一起改却分属两组的成员对数                 | HEAD 上最近 `window` 个非合并提交各碰过哪些 `packages/`、`apps/` 成员；一次碰了超过 `maxMembersPerCommit` 个的不计；分属不同组、同改次数 ≥ `minTogether` 且同改次数 ÷ 两者各自被改次数的较小者 ≥ `minRatio` 的成员对                                                                                                                                                                                                                                              |
| 新增跨成员依赖数                           | 给了 `BASE` 才有：HEAD 的边减去基线的边。基线边集 = HEAD 的边去掉导入处全在改动文件里的，再并上改动过的产品源码在合并点的文本解析出的边（含已删除的文件）；同时列出消失的边作参考                                                                                                                                                                                                                                                                                 |
| 新增、移除与元数据变化的静态装配事实数     | 完整当前源码与 BASE 源码的语义事实差分；位置移动与重复相同事实不计变化。三项都是中性计数，无绝对线、不与趋势比，不将增减解释成质量高低                                                                                                                                                                                                                                                                                                                            |
| 全局架构预期改动数                         | 全局 constraints 的语义改动，独立于实际事实及新增偏离；中性计数                                                                                                                                                                                                                                                                                                                                                                                                   |
| 未解析服务标识符数                         | 服务标识符解析尝试中的未知次数；无绝对线，只报告相对趋势基线的增长                                                                                                                                                                                                                                                                                                                                                                                                |
| 没有断言的测试数                           | 成员测试文件里的 `it`／`test` 用例（含 `.each`、`.concurrent`、`.only`；`.todo`、`.skip` 不算，外层 `describe.skip`／`describe.todo` 里的也不算），回调体里没有一次调用的最左标识符匹配 `assertionPattern` 或 `helperPattern`，也没有调用同一文件里声明的、函数体内含这种调用的函数（只解一层）。路径匹配 `typeTestPattern` 的类型测试文件里编译器就是断言者，`@ts-expect-error` 指令与「应当编译得过」的调用、带类型注解的声明、`satisfies` 也算断言。按语法树判 |
| 全仓重复行占比（%）                        | 见下「重复代码」                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 单个 topic 窗口内 rev 翻动次数             | 通过`readProductTopics(productRoot)`发现当前PD与slug目录，对其README的HEAD可达历史，以运行时当前时间减`windowDays`为窗口起点，统计`revision:`行改动提交，取最大；达到提醒线的topic全部列出。当前未提交PD的历史计数可以为0，这仅表示HEAD历史口径，不表示无产品输入、无规则或未实现                                                                                                                                                                                 |
| 并行工作树数、被多棵工作树同时改的成员数   | `git worktree list` 里主检出以外、带分支的工作树；各自相对 `primaryBranch` 合并点改过的成员（含未提交）                                                                                                                                                                                                                                                                                                                                                           |
| 验收总耗时（秒）、最慢一份验收的耗时（秒） | 见下「验收耗时」；份数跟在行尾                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 实际装配与全局架构约束

`src/arch/` 按完整版本源码抽取实际关系，回路经 `sensors.architecture` 读取。
全局预期归 `docs/architecture/constraints.json`。
当前及历史版本分别发现唯一源，同版双源或坏依据拒绝。schema 2 与 3 的依据路径从仓库根解析，文件和Markdown锚点在相同版本校验。IC-1与IC-5沿采用责任及真实公开入口判断，目录名不构成许可。
缺当前或BASE输入保留unknown或no-data，删除变化仍可见。只修改依据Markdown也触发收工测量。精确输入、范围和不能证明的性质见[符合性契约](src/arch/CONFORMANCE.md)。
符合性报告带[方向行](src/arch/CONFORMANCE.md#方向行)：方向行与角色读运行检查器仓库的 `constraints.json`（与 `omne-deps` 同一份），依赖事实读本版的依赖图，方向行引用的角色在本版里都匹配不到文件时不取图，每一行都是 unknown，文字与取图时相同，规则见[符合性契约](src/arch/CONFORMANCE.md#方向行)；取了图但图不可得时这些行是 unknown；基线的图不可得时偏离行不判新旧，每一行写明原因；方向偏离在回路里只报告，不是硬线。
集成约定归 [Cordis 集成约定](../../docs/architecture/cordis-integration-conventions.md)。
工具不反写预期，也不从目录存在性或手写绑定推断实现状态。

| 配置／输出                                                                      | 含义                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `sensors.architecture.enabled`                                                  | 关闭后不读取架构源，明确报告 no-data                                    |
| `indicators.addedAssemblyFacts`、`removedAssemblyFacts`、`changedAssemblyFacts` | 固定 `lines:null`、`baseline:false`。事实变化不等于偏离，不授予质量带位 |
| `indicators.architectureChanges`                                                | 全局预期语义改动的中性计数，同样固定无阈值、不与趋势比                  |
| `sensors.architecture.data`                                                     | 实际抽取、完整未知、按身份／元数据去重的事实及差分                      |
| `sensors.assemblyDelta`                                                         | 独立实际事实差分；缺 BASE 时 no-data，不能用零冒充已比较                |
| `sensors.conformance`                                                           | 全局静态符合性子集；偏离、unknown、有限静态符合分开报告                 |

原生插件对象需要 Context 首参、Cordis Plugin 类型或已确认 Context 的注册出处。
definePlugin 也提供出处。模块形式按公开导出的 name/apply/inject 识别，私有同名变量不构成插件。
只有 name/apply 形状的候选逐项记未知，普通参数类型不升级为 Context。
抽取使用 TypeScript AST、词法符号和官方模块解析，公开入口与常量按对应版本还原。
完整 BASE 包含已删除或移动的文件，不借当前源码补齐旧文件。

事实身份不含路径／行号，名称使用 JSON 元组编码，不以字符分隔符拼接。
事实差分使用全部 occurrences，避免提前去重丢掉不同名称。
contract、owner、layer、定义形式、提供形式和表达形状独立参与元数据比较。
同一服务改 contract 会留下 before/after。重复相同事实不增计数，冲突元数据不会被吞掉。
服务定义、提供调用、事件模式、导入导出名及 type/runtime 分别保留。

不可解析表达式保留 path/line/kind/expression/reason。服务未知率仅统计服务标识符解析尝试。
静态 inject 换成动态表达式时，报告“不再静态可见”及当前 unknown，不能推断实际依赖已释放。
实际增减与全局预期改动分别进入 explain／钩子，均不称“新增偏离”。
新增架构偏离仍对完整 BASE 预期比较，修改 HEAD 预期不能抹掉它。
IC-5 例外仅放行 BASE 点名的精确导出符号，namespace 通配符和新增符号仍不放行。
例外记录共同存储与出处，不据此证明同提交；依赖方向和环硬线保持独立。

当前或BASE全局预期缺失时，architecture是no-data，严格模式点名失败；已有 BASE 的预期删除差分仍可见。
有效预期与完整实际源码都已读取时，空事实集是真实空结果，不能和 no-data 混淆。
当前或 BASE 缺 workspace 配置时，架构通道报告具名 no-data，其他结构读数仍可运行；不借 HEAD 补 BASE。
存在却非法的配置仍报错，不统一吞解析错误。
静态分析不执行配置工厂，不证明动态撤除、隔离、运行可用性、授权或共享提交。
生命周期和事务义务由实际公共 Service、模块薄 SPEC 及行为验证负责。

自测包括 `arch-extract.spec.ts`、`loop-assembly.spec.ts`、`architecture-conformance.spec.ts`，
以及配置、严格模式、金丝雀和实际架构测试。它们保留静态新增依赖、元数据变化、名称碰撞、
未知、关闭与无基线反例，不替代行为验收。

### 验收耗时

`src/loop/sensors/acceptance.ts` 不跑验收，只读[测试运行](../test-runner/README_ZH.md#测试运行)以 `--script acceptance` 写下的账本（`pnpm run acceptance`，或 `pnpm run check` 按计划跑的验收一步）：
账本根是主检出的 `tmp/acceptance-ledger/`（`OMNE_ACCEPTANCE_LEDGER_HOME` 可改），取**当前提交那一格**（工作树不干净时是带 `-dirty` 的那一格）里最新的一次
交代了现在有 `acceptance` 脚本的每一个成员的验收运行：全量运行（`meta.base` 为 null）跑了它们，或按计划的运行跑了一部分、其余写在 `meta.scope.skipped` 里。
同一格里真跑过验收的记录优先于只有「跳过」的记录。读数三样：整次运行的墙钟、最慢一份验收文件的耗时（没出 vitest 报告的成员按一份、用成员的墙钟计）、份数；有跳过的另带跳过了谁、为什么。

- **没有任何成员有 `acceptance` 脚本**（或检出里没有 `pnpm-workspace.yaml`）：读数是「0 份」，这算有数据。
- **`pnpm run check` 的计划不含带验收的成员**：验收一步不跑，为当前提交写一份 `meta.members` 为空、`meta.scope` 写明「本次影响面不含带验收的成员」与被跳过成员的账本（目录名带 `-skipped`）。
  传感器认它，算有数据；两项耗时指标如实写没数据、写明跳过，不拿 0 秒冒充量过了。
- **有验收、却找不到这样一次运行**：没数据，原因指到 `pnpm run acceptance`；严格模式因此判失败。所以单独跑 `pnpm run loop:status --strict` 之前要先在这个提交上跑过一次验收（或 `pnpm run check` 的验收一步留下过记录）。
- 两条带在 `loop` 配置的 `indicators.acceptanceSeconds`、`acceptanceSlowestSeconds`，不与基线比。数值
  （总耗时 提醒 60／处置 120／解除 45 秒，单份 提醒 20／处置 40／解除 15 秒）是负责人 2026-10-02 按提议定的，配置的 `note` 里照实写着，还没有用真实读数校准。
- 合并前的验收已按影响面收窄（只跑被选中、带验收的成员），读数因此不是每个提交都有；全量读数来自 `pnpm run acceptance` 或 `FULL=1 pnpm run check`。

**不能声称**：耗时受机器负载影响，几次之间的差不能直接归因于代码；读数出自哪一次运行写在行尾与 `status.json` 里，
同一提交、工作树不干净时的「-dirty」格可能是更早一版未提交改动跑出来的。

**成员预算**：每个成员四项——超 alert 的函数数、风险值（度量报告的 `risk`）、重复行占比、没有断言的测试数——任一项处于处置即超预算。
`memberBudget.excludeGroups`（初值 `["examples"]`：`examples/` 是阶段性的演示，不长期维护）里的成员组不判预算、不生成草稿，也不写进趋势快照的成员一栏；
全仓指标（红色成员数、超 alert 的函数数、重复行占比、没有断言的测试数等）照样计入它们，与 `pnpm run metrics` 同一口径。
快照只记成员的总带位，各项「上一次的带位」由趋势里这个成员的历史值按同一组线重放得到。「解除之后又进入处置」达到 `relapseLimit` 次的成员标结构问题：
写明「反复变红 N 次，上报，不派清理」，不生成草稿。其余超预算成员各生成一份草稿：条目带 `路径:行`，行为锁、解除条件（当前值与解除线）、不许动的、状态（等负责人批准）。

**成员预算与基线比**（`memberBudget.baseline`，本仓库为 `true`；负责人 2026-10-02 定）：存量成员只在变差时进提醒，绝对线只管新成员与处置。
「绝对线的带位」就是上面那套三条线加滞回，一字不改；每个成员每一项这样判：

| 情形                                 | 带位                         | 与基线比                         |
| ------------------------------------ | ---------------------------- | -------------------------------- |
| 没有基线快照                         | 绝对线的带位                 | 未判（没有基线快照）             |
| 基线快照里没有这个成员               | 绝对线的带位                 | 新成员                           |
| 基线快照里这一项是 `null`            | 绝对线的带位                 | 未判（基线快照里这一项没有数据） |
| 在基线里，绝对线判出处置             | 处置                         | 好了／一样／差了                 |
| 在基线里，不是处置，比基线上的值大   | 提醒                         | 差了                             |
| 在基线里，不是处置，不比基线上的值大 | 正常（即使过了绝对的提醒线） | 好了／一样                       |

基线快照与各项指标用的是同一条（见上「三条带」）。超预算的条件（任一项处于处置）、结构问题的数法、「上一次的带位」的重放都不受它影响；
趋势快照里成员的总带位按这套判法记。终端在超预算的成员各项后面写与基线比的结果，再列两小段：**比基线变差的成员**（成员、哪一项、基线值 → 现值、带位）
与**新成员过了提醒线的**，各按 `explainTop` 截断；没有基线快照时前一段写「未判：没有基线快照」。`baseline` 为 `false` 时带位只看绝对线，这两段和各项与基线比的结果都不出。

**要解释的函数与基线比**：「这次变更里要解释的红项」里的函数一类，先取这次变更碰过、带位不是 ok 的函数（与以前相同），
再与基线提交（`BASE` 的合并点；收工钩子的基线见[收工钩子](#收工钩子)第 4 步）上同一个函数的圈复杂度比，只留下：

- 基线上没有它：新函数，或所在文件是新文件（未跟踪的、git 认作新增的）——写「新出现」；
- 基线上有、现在的圈复杂度比基线上大——写「原 N → 现 M」；
- 拿不准的：同一文件里同名函数不止一个、基线文本取不到或解析时抛错——照列，并写明原因。

基线上有、没变大的从名单里拿掉，终端写「另有 N 个碰过的函数原来就在线外、这次没有变差」，`status.json` 的 `explain.functionsNotWorse` 逐条列出。
基线上的圈复杂度用度量同一套解析与算法（`src/metrics/complexity.ts` 的 `functionMetrics`）对 `git show <基线>:<路径>` 的文本算，
只取这些函数所在的文件；函数按「同一路径、同一限定名」对上，git 认作改名的文件（`git diff -M`）拿改名前的路径去取。
顶层判定点为零的文件度量不出 `<module>` 这个单元，所以基线上没有 `<module>` 按 1 算，不算新出现。

**它量不出的**：基线快照缺失时成员预算退回绝对线，存量成员过了提醒线也照样提醒；函数改了名、类或外层函数改了名（限定名变了）就按新函数算；
只在工作树里挪了文件而没有 `git add`（git 看到的是一删一增），或改得太多 git 不认作改名的，按新文件算；
TypeScript 解析器对有语法错误的文本会尽力恢复而不抛错，基线文本有语法错误时量出的是恢复后的单元，查不出「解析不了」；
与基线比只看圈复杂度，开了覆盖率时按 CRAP 定的带位里，CRAP 变差而圈复杂度没变的函数会被当作没变差拿掉（回路状态本身不跑覆盖率，这种情形现在不出现）。

**对照表条数**：读 `docs/clean-loop.md`，表头有「归类」一栏的表，数据行这一格须是 `传感器`、`评审问法`、`归人`、`不适用`、`不采` 之一；
数各类条数、报出不合约定的行。再把对照表（首栏「条目」）的条目名逐字对回条目全表，按名字的**出现次数**比（全表里同名的条目可以有几行，对照表照着有同样几行就对得上）：
全表有而对照表缺（次数少于全表）、对照表有而全表没有、对照表比全表多出（次数多于全表），分别列出。文件不存在报没数据。

所有阈值、窗口与开关在 仓库根 [`repo-toolchain.config.json`](../../repo-toolchain.config.json) 的 `loop` 一节，代码里不写死数值；缺项、类型不对、线的次序不对、多出认不出的项一律退出 2，不悄悄用默认。
试点之后负责人定过一轮（2026-10-02）：成员预算的「超 alert 的函数数」取各成员分布的上四分位／九十分位（8／14／6）、「风险值」20／23／18；
红色成员数改成只与基线比（存量仓库上绝对线没有意义）；topic 的 rev 翻动放到 6／10／4（产品设计密集修订期）。其余仍是起步值。没有数据的传感器（配置里关了、没给基线、目录不存在……）在输出里写明原因，不拿 0 冒充量过了。

### 重复代码

检测交给 jscpd 的核心库，本包只做范围、按成员汇总与排序：

- **取的是** [`@jscpd/core`](https://www.npmjs.com/package/@jscpd/core) 与 [`@jscpd/tokenizer`](https://www.npmjs.com/package/@jscpd/tokenizer) **4.0.1**（2024-05-26 发布，MIT），
  传递依赖只有 `eventemitter3`、`reprism`、`spark-md5`；版本在根 `pnpm-workspace.yaml` 的 `catalog:` 钉一次。用法是 `Detector` + `MemoryStore` + `Tokenizer`，
  逐个文件 `detect`，后出现的相同片段与最先存下的那一份配对。
- **不取 `jscpd` 这个包本身**：5.x 是 2026-06 起的 Rust 重写，靠 `optionalDependencies` 分发各平台预编译二进制，几乎每周发版；4.x 的命令行包带进 `pug`、`colors` 与各种报告器，用不着。
- **不取 4.2.x**：它们发于 2026-06 到 08 月，与 Rust 重写同期，太新；4.0.1 已经放了两年多。
- **为什么经 `createRequire` 加载**：4.0.1 的 tokenizer 的 ESM 入口（`dist/index.mjs`）里有 141 处不带扩展名的 `reprism/languages/*` 导入，`reprism` 没有 `exports` 映射，
  Node 的 ESM 解析找不到它们；同一个包的 CommonJS 入口可用。所以只有 tokenizer 在 `src/loop/sensors/duplication.ts` 这一处经 `createRequire` 取，类型取自包自己的声明；
  `@jscpd/core` 正常导入。`tests/loop-duplication.spec.ts` 走真实的库，加载方式在当前 Node 下失效时它会变红。
- **范围**：各成员 `src/` 下的非测试、非声明 TypeScript 源（与度量同一口径）；`minTokens`、`minLines` 可配，`enabled` 可关（关了报「没数据：配置里关了」）。
  产出每个成员「落在克隆里的行数 ÷ 源码总行数」与克隆清单（两端的文件与行区间、行数），跨成员的排前面；指标值是全仓重复行占比（百分数，一位小数）。
- **库给的后一端止行有时不可信**：4.0.1 把克隆往后扩时，后一端（B 端）的止行取自存储里同一哈希最先存下的那一帧，那一帧可能在别处，
  于是 B 端止行偶尔早于起行、远超前一端的长度或超出文件末尾（全仓试跑约一成克隆如此）。前一端是连续扫过来的，可信；
  B 端止行早于起行、或跨度超过前一端两倍加两行时，按前一端的行数从 B 端起行推算，克隆清单里标出「后一端止行按前一端行数推算」（`plausibleEnd`）。
  推算假设两端版式相近，重复行占比因此是近似值。
- **它查不出的**：只查词法记号相同的片段——改了名字、调了顺序、换了写法的重复查不出；短于 `minTokens` 或 `minLines` 的不报。
- **耗时**：全仓 500 多个文件约 25 秒，是整个入口里最慢的一步，其余传感器合计几秒。

**不能声称**：带位是抽查线索，不是质量结论；超预算不等于该拆——处置看职责不看数字（见上「超阈值怎么处置」）。没有断言的测试只看语法：
断言藏在导入的辅助函数里会误报（用 `helperPattern` 消），回调是传进来的函数引用时不判；有断言不等于断言有力；
类型测试里一条编译得过的语句就算断言，它约束了什么看不出。一起改的成员对只说明历史上的共变，不说明该合并。
rev 翻动只数改了 `revision:` 行的提交，不看改了什么。自测：`tests/loop-*.spec.ts`（读 git 的部分与入口的退出码用临时仓库）。

## 收工钩子

`src/loop/stop-hook.ts` 由宿主（Claude Code、Codex）在 agent 收工时调用（`Stop` 与 `SubagentStop`），
把「这次变更里要解释的红项」作为**事实**反馈给 agent：只陈述位置与数值，不写该怎么改。
宿主配置由 `.meta_harness/agents/hooks/hooks.yaml` 生成，怎么生效、怎么关见那里的 README。

标准输入是宿主给的 JSON 对象。要反馈时向标准输出写**恰好一个** `{"decision":"block","reason":"…"}`（两端在这两个事件上都接受这个最小形状，
多一个字段在 Codex 上会让整条输出无效）；量读数时自己出了错，写**恰好一个** `{"systemMessage":"…"}`——两端都把它当作给用户看的警告，
不交给 agent、不拦收工；其余情形一个字节都不写。**所有路径都退出 0**：宿主把退出码 2 一律当拦截，
所以它由 node 直接运行、不经包装命令，也不透传任何子进程的退出码。依次：

1. `OMNE_LOOP_HOOK=off` → 什么都不做；输入解析不了、不是对象 → 不反馈。
2. `stop_hook_active` 为 `true`（这次收工已经因钩子续跑过）→ 不反馈。**每次收工至多拦一次。**
3. 工作目录取输入的 `cwd`，没有就用进程的当前目录；不在 git 仓库里 → 不反馈。`loop` 配置的 `hook.enabled` 为 `false` → 不反馈。
4. 这次变更（相对下面的基线；已提交、未提交、未跟踪都算）没碰产品源码、全局 `constraints.json` 或其引用的Markdown源 → 不反馈。
   **基线**这样取：
   - 有 task context：取它的 `taskBase`（没有 ownerTask 时取 `targetBase`），不看轨道登记。
   - 没有 task context：在 `primaryBranch` 与 [`integration-policy.json`](../../docs/engineering/integration-policy.json) 里 `status` 为 `active` 的各轨道分支之间，
     取离 HEAD 最近的合并点，即 HEAD 领先它的提交数最少的那个；并列时取 `primaryBranch`，再按登记顺序。
     每个候选先取远端跟踪分支（`<transport.location>/<分支>`），没有就取同名本地分支，都没有就跳过。
     从轨道分出、合入过轨道尖端的长期分支因此只看自己相对轨道的改动，轨道相对 `primaryBranch` 的内容不算这次变更。
     policy 读不到或读不懂时没有轨道候选，只用 `primaryBranch`（位置按 `origin`）。一个候选也求不出时基线是 `HEAD`，只看未提交的改动。
   - 直接在轨道分支上工作时，HEAD 就是轨道尖端，基线也是它，只看未提交的改动；要看相对 `primaryBranch` 的全部变更，手给 `pnpm run loop:status --base main`。
5. 量**静态那部分**读数：变更函数里超 alert、且比基线涨了或新出现的（与 `pnpm run loop:status` 同一个判法，见上「要解释的函数与基线比」，基线是这里的合并点；
   反馈的那一行末尾补「原 N」「新出现」或拿不准的原因，原来就超线、这次没变差的不反馈）、新增的跨成员依赖、其中稳定依赖不稳定的、改动过的测试文件里没有断言的用例，加依赖违规与环两条硬线（全仓的）。
   不跑重复代码（全仓二十多秒）、覆盖率、工作树与 topic 那几项。量在 worker 线程里跑，超过 `hook.timeoutSeconds`（初值 40；宿主那侧另配 60）就放弃。
   同时按 BASE 的架构预期判断新增偏离，分别报告全局及原节点预期的语义改动；机械范围见 [CONFORMANCE](src/arch/CONFORMANCE.md)。仅修改预期也可产生反馈，未发布新全局预期的节点继续由原声明传感器消费。
6. 没有红项 → 不反馈。同一分支上同一组读数已经反馈过 → 不反馈：每条取「类别＋位置（路径与函数名、或成员对）」，**不含行号**，排序后求哈希，
   连同分支名记进回路目录的 `hook-state.json`，最多记 `hook.stateLimit`（初值 200）组，超了丢最旧的。多了一项、换了分支都算新的一组。
7. 反馈的文字列前 `hook.maxItems`（初值 12）条，多的写「另有 N 条」，整段不超过 `hook.maxChars`（初值 4000）个字符；硬线排最前，截断时截掉的是报告项。

第 3 步找到仓库之后任何一步抛错或超时 → 不反馈给 agent，往回路目录的 `hook.log` 追加一行原因（写日志失败也吞掉），
并用 `systemMessage` 给用户一句警告：没量出读数、原因的前 300 个字符、日志在哪。**钩子自己出错从不拦住 agent，但不闷声**——
不出这一句，「钩子坏了」与「没有红项」在会话里看起来一模一样。

**跑的是哪一份脚本**由宿主配置里的命令定（`hooks.yaml`）：会话所在的工作树里有这份脚本且装了依赖（认 `tools/repo-toolchain/node_modules/typescript`），
跑它自己的；否则跑主检出里的那一份，量的仍是会话所在的那棵工作树。刚 `git worktree add` 出来、还没装依赖的工作树走的就是后一条——
2026-10-02 第一次在真实会话里触发时正是栽在这里：脚本在新工作树里加载不了解析器，只记了日志。主检出自己也没装依赖时，结果是上面那句警告。

每次调用都重新计算 `git merge-base <primaryBranch> HEAD`，不沿用上一次的基线。
架构读取先把基线解析成固定 commit，再按该树的 blob ID 批量读取文件；不缓存跨提交的读数，也不逐文件启动 Git。
成员源码与数据文件按最长成员路径前缀分配，文件清单只遍历一次。读取失败仍报错，不以当前工作树补齐旧提交的缺失文件。
同步主线可能让已交付的改动退出本次差分。需要核对整个任务时，用固定的任务起点运行
`pnpm run loop:status --base <任务起点commit>`；这个显式基线不改变自动钩子的基线。
没有输出时还需区分没有新红项、已反馈、递归 Stop 和测量错误，不能仅凭同步发生在先就认定基线损坏。

实测（本仓库全量，2026-10-01，8 核机器上负载很低时）：碰了产品源码、有一处红项的一次 2.5 秒；没碰产品源码的 0.8 秒。
另有一轮完整检查在跑时，前者量到过 3.2 秒。大头是解析全部产品源码（方向与稳定依赖都要全图），约 1.7 秒。
函数与基线比之后（2026-10-02，机器上另有一轮完整检查、1 分钟负载 2 到 7）：存量超线函数改一行不加分支、不反馈的三次 2.6 到 3.2 秒，
加一个分支、反馈一条的 2.5 秒；多出的一次 `git diff -M --name-status` 与每个文件一次 `git show` 合计十几毫秒，再加只解析那几个文件的基线文本。

**不能声称**：反馈过的读数被处理了——它只提醒一次，交代与否由交付说明与接受的人核对；没被反馈等于没有红项——
没碰产品源码、全局约束或原节点声明，或者钩子关了、出错或超时、`stop_hook_active` 为真时都不反馈，重复代码与覆盖率不在其中，
**改动落在会话当前目录之外的另一棵工作树里时也不反馈**（hook只量payload的 `cwd` 所在检出；每个写者须显式进入自己的检出，不能只给exec设置workdir就声称宿主cwd已迁移。shell脚本可用当前目录回退，但配置选择依脚本位置；真实host cwd未经验证仍是未覆盖。协作交接见[责任与协作交接](../../docs/engineering/workflow.md#责任与协作交接)）；宿主真的调用了它——
生成配置不等于宿主已加载、已信任，要在真实会话里另行核实（Claude Code 一端 2026-10-02 见过一次真实调用；Codex 一端还没有）；
警告一定到了用户眼前——`systemMessage` 怎样显示由宿主定，两端都只按文档核对过，没有在真实会话里看过它显示出来的样子。
自测：`tests/loop-hook.spec.ts`（判断，外部动作用替身）、`tests/loop-stop-hook.spec.ts`（入口与线程，用临时仓库与子进程）；
命令选哪一份脚本由 `.meta_harness/tooling/tests/test_compile_hooks.py` 拿真的工作树跑。

## 流程体检页

```sh
pnpm run loop:health # --out 可改产物目录
```

**体检页** `pnpm run loop:health` 把三类事实汇成一张页面：趋势快照 `trend.jsonl`、测试耗时账本、git 历史。
产物在 `<回路目录>/health/`（每次覆盖，`--out` 可改）：`health.html`（自包含：样式取审讯页的同一套，走向图是内联 SVG，不带脚本、不引任何外部地址，离线可开）、
`health.json`（各块的原始数据，每块都是「有数据」或「没数据及原因」）、`summary.md`（不超过 15 行，同时打印到终端，末行是页面路径）。

| 块                   | 内容                                                                                                                             | 数据来源                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提交与合并的大小     | `primaryBranch` 沿第一父链最近 `health.commits` 个提交各改了几个文件（合并提交按它对第一父的改动计）：中位数、最大值、最大的三个 | `git log --first-parent -m`                                                                                                                                                                                                                                                                                       |
| 测试耗时             | 最近 `health.runs` 次**全量**运行的墙钟、提交、层、是否全过；各层的墙钟不可比，一层一条走向线                                    | `<主检出>/tmp/test-ledger/*/*/ledger.json`（`OMNE_TEST_LEDGER_HOME` 可改根）；全量运行是 `meta.base` 为 null 的那些（`run --all`，或计划判为全量的 `pnpm run check` 测试一步），可以只跑一层（`pnpm run check` 的测试一步快、慢两层各记一份），层取 `meta.tier`，没有这一栏的旧账本按两层；受影响范围的运行带基线，不计入 |
| 债的走向             | 每个指标一条小折线（虚线是提醒线与处置线，蓝点是最新值）、最新值与最新带位；当前或曾经处于处置的成员，各项预算的读数走向         | `trend.jsonl`；同一提交多条取最后一条，按提交时间排                                                                                                                                                                                                                                                               |
| 对照表条数           | 五类各多少条、不合约定的行数、「现状」以「待建」开头的行数                                                                       | `docs/clean-loop.md`，与回路状态同一份解析                                                                                                                                                                                                                                                                        |
| 传感器最近一次有数据 | 每个指标最近一条带着它的值的快照是哪个提交、什么时候；从没有过数据的标出                                                         | `trend.jsonl`                                                                                                                                                                                                                                                                                                     |

**任何一块没有数据，都在那一块里写明「没有数据」与原因**（趋势快照还没有数据、账本里只有受影响范围的运行），不留空白、不画空图。
窗口与条数在 仓库根 [`repo-toolchain.config.json`](../../repo-toolchain.config.json) 的 `loop` 一节 的 `health` 一段（`commits`初值50、`runs`初值10）。

本工具的输入限于趋势快照、测试耗时账本与Git历史。
中位数在偶数个时取中间两个里较小的那个（与结构度量的提交形状同一取法）。提交大小只数文件个数，不看改了多少行。
测试耗时受机器负载影响，几次之间的差不能直接归因于代码。债的走向把不同分支上的快照按提交时间排在一条线上，分支来回切换时折线会跳。

自测：`tests/loop-health.spec.ts`（入口用临时仓库）。

## 声明兼容

成员用 TypeScript 7 构建；`pnpm run check:declarations` 用 TypeScript 6 读它们产出的声明。
它把全部有 `build` 脚本的成员 `dist/` 下的 `.d.ts` 作为根文件交给 `@typescript/typescript6` 建一个程序，选项取仓库根 `tsconfig.base.json` 并打开库检查。
检查器在全部解析里去掉仓库的 `customConditions`（现在只有 `source`），按消费者视角读每个包；成员之间的导入解析到对方的 `dist` 声明，`src` 不进程序。
成员声明里有诊断即退出 1；第三方声明里的诊断只计数。
没有 `dist/` 的成员仍列为未构建，它自己不判失败。
已构建的成员若导入未构建的成员，导入方的声明会报 TS2307 并判失败；带 `source` 条件时，这个导入落到未构建成员的 `src`，诊断被掩盖。
`pnpm run check` 在构建一步之后常驻跑它。

本工具调用 `createProgram`、`createSourceFile` 等旧编程接口的模块都从 `@typescript/typescript6` 导入，行为与 TypeScript 6 相同。

## 契约 API 快照

契约成员是[线归属表](../../docs/engineering/delivery-lines.json)各线 `contracts` 列出的成员。线内的卡对它们只做可加改动，规则见[可加改动](../../docs/engineering/integration.md#可加改动)。本命令给每个契约成员一份入库的 API 快照，并把两份快照之间的差异粗分为三类：`none` 表示没有变化；`additive` 表示改动对已有的读方与写方都不破坏；`review` 表示其余一切改动，需要人判断。它只报告，不拦截。行为契约（输入、快照内容、确定性、分类规则、已知限制、退出码与配置校验）见 [SPEC](src/declarations/SPEC.md)。

```sh
omne-contract-api --write                 # 从 dist 重写快照（先构建）
omne-contract-api --check                 # 拿 dist 现场生成的快照与快照文件比
omne-contract-api --diff <基线提交或分支>   # 基线提交上的快照对工作树的快照，逐成员粗分类
omne-contract-api --baseline-write <提交> [--milestone <名>] [--member <成员目录>]...   # 生成基线登记的机读区块
omne-contract-api --baseline <区块文件>    # 逐成员从登记的提交比到工作树的快照
```

每个动作都可加 `--json`，把结果按 JSON 写到标准输出。`--root <检出目录>` 指定被检查的检出。

配置在 `repo-toolchain.config.json` 的 `contractApi` 一节，有两个键：

- `members`：线归属表的路径。
- `snapshot`：快照路径模板，以 `.md` 结尾，至少含 `{member}`（成员目录）或 `{package}`（不带 scope 的包名）之一。

这一节有别的键、缺键或值不合条件时，命令报错退出。两个成员算出同一个快照路径时，命令也报错退出。

读法与[声明兼容](#声明兼容)用同一套 TypeScript 6 选项，另建一个程序，按消费者视角读 dist。成员 dist 有编译诊断时，不生成它的快照。

快照分两部分：每个入口导出的名字（写明声明在哪个文件或哪个外部包），以及成员 dist 里经打印器规范化的全部声明文件。声明文件保留导入、导出与模块扩充，所以快照能还原成一组能编译的声明。

分类是白名单门：只有正证据成立才是 `additive`。差异分两桶。全局作用域的任何差异整份 `review`，不跑检查器：`declare global` 与对外部模块的 `declare module` 块的增删改、脚本文件的增删改或与模块之间切换、三斜线指令的变化、导入或 `export … from` 的模块边增删（带绑定、仅类型、空导入、无绑定导入都算）、`export as namespace` 的增删改。消费者程序里全局作用域只有一份，检查器证明不了「这处改动没有影响已有导出」。模块作用域的正证据有两条。第一，每一处差异都在白名单里，白名单只有两类：新增一个旧侧不知道的名字的导出（与已有同名声明合并的不算，例如新增重载；与入口已有的导出名或该文件作用域里已有符号重名的也不算，例如遮住 `export *` 导出的名字或 lib 的 `Error`），以及在模块作用域的接口或类型字面量里新增可选属性（属性写法；对本成员模块的扩充块内的改动不算）。第二，TypeScript 检查器对涉及的每个导出证明两个方向都可赋值：新 → 旧成立表示读方不破坏，旧 → 新成立表示写方（提供者、替身、实现者）不破坏。其余一律 `review`，报告写明命中哪一条：全局作用域变了、白名单外改动、没有比较覆盖、方向不成立、检查器未完成、实例组合超限、编译诊断。它用的是 repo-toolchain 已有的 `@typescript/typescript6`，不加新依赖。规则、白名单与归一化见 [SPEC](src/declarations/SPEC.md#分类)。

不用 API Extractor 的理由：它不分析 ambient 声明，`declare module` 与 `declare global` 的扩充在它的报告里全部缺失，而 27 个契约成员里有 8 个的公开面含这类扩充。探路与复核的结论记在卡 #645 的评论里。

操作要求：

- 改了契约成员公开面的卡，在同一个 PR 里构建并运行 `--write`，把快照的变化一起提交。`--check` 报不一致时，先判断改动是否有意。
- 本工具改了快照格式（格式版本变了）时，全部快照要重新生成。
- 谁写首份快照、格式变化时谁重新生成，规则见[里程碑内的规则](../../docs/engineering/integration.md#里程碑内的规则)。

`--diff` 的前提：

- 它只比快照文件，不读 dist。先用 `--check` 确认工作树的快照与 dist 一致，或先运行 `--write`。
- 成员取基线与当前两份线归属表的并集，每侧的快照路径按那一侧的包名算。基线上没有快照的成员整份算 `additive`。
- 判断改动是否可加时，传里程碑登记的基线提交。

快照摘要是快照文件字节的 SHA-256。`--check --json` 对每个有快照文件的成员给出 `sha256`。

里程碑基线的登记：

- 登记者运行 `--baseline-write <基线提交> --milestone <名>`，把输出的 `json omne-contract-baseline:v1` 区块贴进 baseline 卡的登记评论。区块给每个成员记 `path`、`commit`、快照的 `sha256` 与 `apiTree`。基线文件不入库。
- 补登记个别成员时加 `--member <成员目录>`，只写这些成员，它们的 `commit` 可以与其他成员不同。
- 有破坏性改动的裁定读回后，调度者在区块里补 `breakingCards`，列出承接的 `integration` 卡。
- 核对时把登记合并成一个文件（JSON 对象，或含一个区块的评论正文），运行 `--baseline <文件>`。每个成员从它自己的 `commit` 比到工作树的快照。基线之后加入的成员整份算新增。下列成员判不了，命令退出 1，`breakingCards` 不能放行：登记的成员在它的 `commit` 上不是契约成员或没有快照；在基线点（全部登记提交的共同祖先）上已是契约成员却没有登记。其余情况分类为 `review` 而没有 `breakingCards` 时退出 1。登记的 `sha256` 或 `apiTree` 与那个提交对不上时只报告。
- `--baseline-write` 与 `--baseline` 从 0.0.16 起提供。仓库钉住的版本早于 0.0.16 时，从源码运行：`node --experimental-strip-types tools/repo-toolchain/src/declarations/api-cli.ts --baseline <文件>`。

`review` 不是 PR「契约变化」一节的级别。它包括两方都破坏的改动、只破坏一方的改动，也包括按「可加改动」表不破坏、但不在白名单里的改动（例如契约声明开放的联合加成员、给类型参数加默认值）。PR 的 none、additive 或 breaking 由人按「可加改动」表判定。

它**不能声称**的：它报出读方与写方两个方向，但不判定哪个方向的破坏可以接受。白名单门失败关闭，拿不准时给 `review`，所以 `review` 会比只用检查器时多。这是 P1 只报告阶段的有意取舍。它只看声明的形状，不看行为、文档或运行时校验。转导出的别的包的声明变化归那个包的快照。快照与 dist 一致只说明快照是最新的，不说明改动可加。其余限制（例如 `ToolBindings` 一类的递归启发式误报）见 [SPEC](src/declarations/SPEC.md#已知限制)。
