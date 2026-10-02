# 开发指南

本页帮助开发者和 coding agent 从当前检出开始工作：准备环境、找到该改的地方、
跑对应的检查。贡献范围与交付要求见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

> **本页只管开发。**产品设计、系统架构与规格设计、产品/系统/算法的 research
> 的权威正文都不在这里，也不在 `docs/` ——它们归 [`.meta_harness/`](../.meta_harness/AGENTS.md)。
> 需要做那些事时从那里进入，加载 `harness-design-handbook` skill，**不要在这边落字**。

个人技术博客通过 `docs/blogs/` 子模块接入；归属见[源码布局](workspace.md#目录与内容归属)，
操作见下文[博客子模块](#博客子模块)。

## 运行入口

**先构建，再按所属应用的 README 启动。**治理中心的命令与配置见
[tenancy-host](../apps/tenancy-host/README.md)，从零部署并完成账号/组织旅程的演练见
[黑盒端到端入口](../apps/tenancy-host/tests/e2e/README.md)。后者使用实际构建产物，包含网络、证书和临时数据目录的环境要求。

产品包的构建、类型检查与测试分别为 `pnpm run build`、`pnpm run typecheck`、`pnpm run test`；
结构检查为 `pnpm run lint:rules`。开发工具、agent 产物与形式模型的检查入口见下文。
成员的实现及验证状态归[实现映射](../.meta_harness/design/realization/README.md)，本页不维护另一份进度清单。

## 准备可用的检出

先确认自己在哪个检出、有没有未提交改动。隔离规则加载 `worktree-discipline` skill，要点是**一个会话一棵工作树**：
在主检出就为手上这个单元建一棵并 `cd` 进去；已经在一棵里，就在它里面做到并入主线，不开第二棵：

```sh
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

完整检查需要 Git、Bash、Make、[uv](https://docs.astral.sh/uv/getting-started/installation/)，
以及根 `package.json` 的 `engines`/`packageManager` 指定的 Node 与 pnpm。
Python 范围由 [pyproject.toml](../pyproject.toml) 声明，uv 管理解释器与虚拟环境——
**不要依赖系统 `python` 恰好存在**。进入目标检出后：

```sh
uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
make check
```

安装依据锁文件且禁用依赖脚本。`make check` 组合 agent 产物与链接、文档导航、
设计链登记、工具测试与格式检查，**不调用真实模型**。
已有环境时，日常修改按受影响范围选择单项检查即可。

### 形式工具链

TLA+/TLC 与 Alloy **已装在系统全局路径**，不需要在仓库里准备任何东西：

```sh
make formal-tools      # 检查 JAR 与 Java 是否就位
tlc -h                 # /usr/local/bin/tlc
alloy exec <file>      # /usr/local/bin/alloy
```

安装位置与环境变量见[验证与证据](verification.md#环境与实际执行)。
登录后的 session 自动继承 `JAVA_BIN`、`TLA2TOOLS_JAR`、`ALLOY_ANALYZER_JAR`；
**非登录 shell 读不到**，在 CI 步骤或 `bash -c` 里需要显式传入。

### 格式化

TS/JS 格式由根配置和锁定的本地 Prettier 统一处理：

```sh
pnpm format:check
pnpm format:write
```

局部修改只传入本次有写权限的仓库相对文件，例如
`pnpm format:write -- tools/spec-tools/src/x.ts`。
范围包括 `packages/`、`apps/`、`tools/`、`scripts/` 下的 TS/JS 源码、测试及所属配置，
和根 TS/测试配置；**不含**上游原件、provenance、JSONL 黄金文件、依赖、构建输出与临时目录。

需要本地提交检查时，确认没有既有 `pre-commit` hook 后运行 `pnpm format:hook:install`。
安装器不覆盖已有 hook；所装检查只读 Git index 中已暂存的文件，**不 stash、不改工作区**。

## 博客子模块

`docs/blogs/` 是独立的个人博客仓库，地址由根 `.gitmodules` 记录。
本项目的开发和构建不要求初始化它；博客仓库私有时，读取权限需要单独授予，
拥有本项目权限不会自动获得博客权限。只做产品开发时可保留普通的非递归克隆方式。

需要阅读或编辑博客时，在项目根执行：

```sh
git submodule update --init -- docs/blogs
```

这会检出本项目记录的博客 commit。开始编辑前，在博客仓库切到写作分支；
若直接维护其主分支，执行 `git -C docs/blogs switch main`。
文章的修改、提交和推送都在博客仓库中完成，推送父仓库不会代替这一步。

博客提交已经推送到远程后，在父仓库更新采用版本：

```sh
git add docs/blogs
git commit -m "chore(docs): update blog submodule"
```

该提交只记录子模块的新 commit；博客内容和历史仍由博客仓库管理。
父仓库更新后，其他已有检出重复执行上述初始化命令即可切到相同版本。
博客仓库改为公开后，只要仓库地址不变，无需重新添加子模块。

## 定位修改位置

| 要改什么 | 去哪 |
|---|---|
| 文档导航与技能镜像检查器 | [tools/spec-tools/](../tools/spec-tools/README.md) 的 `src/` 与 `tests/` |
| 设计链检查、agent 编译与根链接工具 | [.meta_harness/tooling/](../.meta_harness/tooling/README.md) |
| 本地与 CI 共用的自动化调用 | [scripts/](../scripts/README.md)；复杂检查行为回到工具包 |
| Skill、subagent 或宿主适配 | [.meta_harness/agents/](../.meta_harness/agents/README.md) 的**源**，不改生成物 |
| 环境、布局、检查含义、编码防御 | 本目录各份正文，见[阅读地图](README.md) |
| **产品设计、架构与规格、research** | **[.meta_harness/](../.meta_harness/AGENTS.md)，不是这里** |

各目录局部 `AGENTS.md` 补充其工作边界；完整布局归[源码布局](workspace.md)。
根 Python workspace 只管理开发环境，与 pnpm 管理的 TS 工具链并存。

## 修改与验证

先找到内容或行为的所有者，在任务范围内修改，再按变化选择检查：

| 变化或目的 | 检查入口 |
|---|---|
| 跨仓库 Markdown 链接、锚点与技能镜像 | `make docs-check` |
| Skills/roles 源、生成产物与根软链接 | `make agents-check` |
| 设计链的身份、登记、冻结与形式任务 | `make design-check`（`FORMAL=run` 才真跑模型） |
| 统一语言词条、领域对象条目，或某个产品 topic 的 rev | `make design-check`；本地迭代用 `STALE=report` 看待复核队列 |
| 检查器或生成器行为 | `make test` |
| TS/JS 格式 | `pnpm format:check`；局部写入 `pnpm format:write -- <文件...>` |
| 某个产品包的源码或测试，迭代中 | `pnpm --filter @omne-harness-lite/<包名> run test`（含 `*.spec-d.ts` 类型测试），或在包目录里 `pnpm exec vitest run <文件>` 只跑一个文件 |
| 产品源码或测试改完，要知道波及了谁 | `make test-affected BASE=<任务基线提交>`：只构建并测试变更成员与依赖它们的成员，不必跑全量；`PLAN=1` 先看范围。改了公开入口再跑 `pnpm run build && pnpm run typecheck` |
| 测试红了，想知道是不是「单独跑能过」 | `make test-triage RUN=<那次运行打印的运行目录>`：逐条单独重跑并归类。**把红灯归因于并行或机器负载，要附它的输出**；「隔离稳定通过」的含义与边界见[验证与证据](verification.md#检查入口) |
| 想知道测试时间花在哪 | 每次 `test-affected`、`pnpm run test` 与 `make check` 都写耗时账本（成员、文件、用例三级，路径在运行末尾打印），摘要里列出最慢的成员、超线的文件、导入耗时最多的成员，以及耗时达到自身时限一半的用例（带各自的时限） |
| 产品源码的结构约束（墙钟、`bail`、受限调用点、跨组依赖方向） | `pnpm run lint:rules`；规则与自测见 [tools/ts-checks](../tools/ts-checks/README.md) |
| 实现类交付前后看结构与度量（本仓库的结构度量入口） | `make metrics BASE=<任务基线提交>`，秒级；要 CRAP 加 `COVERAGE=1`（会跑变更成员的测试，先构建）。它只报告、不判失败；把打印的摘要原样附进交付说明，审讯页路径在摘要末行 |
| 交付前看各项整洁指标落在哪条带上、这次变更里有哪些红项要解释 | `make loop-status BASE=<任务基线提交>`：只报告，只有硬线（方向违规或环、验收锁不过）被破才退出 1。把「这次变更里要解释的红项」一段原样附进交付说明并逐条交代；它列出的超预算成员与清理草稿不是给实施者的任务，带位与谁动见[整洁回路](clean-loop.md#回路怎么转) |
| 接受一份配了可执行验收的交付之前，核对验收没被实施者动过 | `make acceptance-lock BASE=<任务基线提交>`：列出基线以来碰过各成员 `acceptance/` 的提交与其来源；实施角色的提交或未提交的验收改动在其中就退出 1。它认的是提交里自己写的 `Agent-Role`，列出来的仍要人过目，见[验证与证据](verification.md#检查入口) |
| 一张故事卡到了提出、第一次能跑或被接受的时点 | `make loop-card CARD=<卡号> EVENT=proposed\|runnable\|accepted`：往台账里记一笔时间与当时的提交；`accepted` 只在负责人说了接受之后记。台账只供度量，接受以删卡提交上的 `Accepted-Card` 为准 |
| 一张卡被接受或作废，要从 `stories.md` 删掉 | 删卡的提交带 `Accepted-Card: <卡号>` 或 `Voided-Card: <卡号>`，「已发到」那一行不动；`make card-retire BASE=<任务基线提交>` 核对范围里删掉的卡都有记录。规矩见[故事卡的格式契约](../.meta_harness/design/product/conventions.md#卡的一生) |
| 写或改了可执行验收，或想知道哪些场景已经交付 | 验收开头要有一行 `// covers: PF-016 S5`，`pnpm run lint:rules` 核对声明的场景存在；`make acceptance` 只跑验收；`make scenario-status` 按 topic 列出每条场景是已交付、交付中、已立卡还是还没切到。约定见[源码布局](workspace.md) |
| 想看流程本身走得怎么样（卡的前置时间、每周接受数、债的走向） | `make loop-health`：只读、只报告，出一张离线可开的页面，末行给路径；每块怎么读见[写给负责的人](development_human.md#每周看一次体检页) |
| 规格还没定，想先看一条主路径走不走得通 | 做探路件：放 [examples/](../examples/README_ZH.md) 或任务的 `tmp/`，不进 `packages/`、`apps/`；跑通后带回设计的是事实清单，不是代码 |
| 存储提供者或迁移 | `pnpm --filter @omne-harness-lite/storage-sql run test`：sqlite 上跑一致性套件；pg 需设 `OMNE_TEST_PG_URL`，否则跳过 |
| 形式工具是否可用 | `make formal-tools` |
| 跨入口改动、合并前 | `make check`。它占一个机器级的[运行名额](../scripts/README.md#运行名额)：别的检出正在跑时会排队，不要为了绕开排队而手工并行起多套 |

覆盖与退出含义归[验证与证据](verification.md)——**那里写明了每个入口不能声称什么**。

全量测试在本机约十几分钟，是合并前的门，不是迭代中的反馈手段：迭代时跑一个文件或一个包，
改完跑受影响范围，合并前才跑 `make check`。并行度的初值在
[test-runs.config.json](../tools/ts-checks/test-runs.config.json)，临时调整用环境变量，见[测试运行](../tools/ts-checks/README_ZH.md#测试运行)。

对检查器做局部迭代时，可从仓库根运行一组测试：

```sh
PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest tools/spec-tools/tests/
```

检查器 CLI 默认从当前工作目录定位受检仓库；检查另一个检出时传 `--root PATH`。

保留失败的实际输出与影响判断，修正后重跑受影响的检查。
交付时说明检查针对哪个源码状态与范围。临时日志放 `tmp/`，测试组合用 `tmp/test-runs/`，测试运行器的账本在主检出的 `tmp/test-ledger/`；
**临时目录不承担长期证据归档**。

## 使用 coding agents

从根 [AGENTS.md](../AGENTS.md) 和目标目录的局部约定开始。
Claude Code 通过同级 `CLAUDE.md` 的 `@AGENTS.md` 读取同一份约定。

| 当前任务 | 加载什么、在哪工作 |
|---|---|
| 产品需求、能力分析、架构/规格设计与交接 | `harness-design-handbook` skill；在 `.meta_harness/design/` 接续 |
| 起草或修订产品设计正文 | `product-design` skill；**做技术设计的人只读正文，不加载它** |
| 创建或修改 skill | 环境提供的官方 `skill-creator`；源在 `.meta_harness/agents/skills/<name>/canonical/` |
| 创建或修改 role、宿主配置 | `design-subagents` skill；源在 `.meta_harness/agents/roles/<role>/` |
| 编写或调整 AGENTS.md | `write-agents-md` skill；改实际作用域的源文件 |
| 创建、使用或清理隔离检出 | `worktree-discipline` skill；一个会话一棵工作树，建好先 `cd` 进去，不建 HUB 与 spoke |

**派发有写权限的 agent 之前**：它就在本会话的这棵工作树里写，一次只派一个，不给它另开工作树。简报写明工作树的路径与分支，
要它第一步 `cd` 进去并核对分支；它交回之前，主会话不在这条分支上写或提交。只读的研究、评审与验收可以同时派。
几件互不相干的事要同时推进，由负责人另开会话；被要求开 HUB、开 spoke 或并行派几个写入者时，按那份 skill 说明理由后拒绝，
对方坚持也不照办。简报各栏写什么见[开发者派发说明](../.meta_harness/agents/roles/developer-task.md)。

**派发的一方在 agent 交回之后做什么**：核对提交确实落在它说的分支上、写入范围没越界；读交付说明里附的度量摘要与回路状态，
没有交代的红项退回；配了可执行验收的跑验收锁；按[接受级别](development_human.md#接受级别)决定要不要另派评审或验收。
回路给出的清理草稿报给负责人，批准后才按[清理任务派发说明](../.meta_harness/agents/roles/cleanup-task.md)派——主会话不替负责人批。

**收工钩子替不了上面这一步。**实施类的 subagent 收工时，宿主可能已经把这次变更的红项作为事实反馈给它一次（见[整洁回路](clean-loop.md#回路怎么转)）；
那份反馈只到 subagent、到不了派发它的会话，同一组读数也只说一次。所以派发方照旧自己跑 `make loop-status BASE=<任务基线>`，
对着交付说明逐条核。合并前的三条硬线由 `make check` 的最后一步判。

根 `.agents`、`.claude`、`.codex` 分别软链接到 `.meta_harness/` 内同名目录，
向宿主暴露生成的 skills/subagents。**先改源与适配，再按[编译工具](../.meta_harness/tooling/README.md)生成**；
编译器拒绝覆盖不同内容，**不要手工编辑输出修补漂移**。
改完运行 `make agents-check` 核对生成一致性与三个软链接，`make docs-check` 核对导航与镜像。

## 常见问题

| 现象 | 应检查什么 |
|---|---|
| `python` 不存在，或系统 Python 缺模块 | 用 `uv run --locked python ...`；确认已在当前检出 `uv sync --locked` |
| 找不到工具成员或 workspace 依赖 | 从仓库根同步；依赖变更按 [workspace 规则](workspace.md#使用与维护)更新成员声明与锁文件 |
| `cannot locate repository` | 切到受检仓库内，或给 CLI 传明确的 `--root`；安装位置不代表受检位置 |
| 链接、技能镜像或 agent 产物检查失败 | 修正源及其引用，按编译工具更新产物；**不要手改镜像或移出检查范围掩盖错误** |
| `UNCOVERED` | 尚无相应模型任务——那是覆盖缺口，不是失败 |
| 形式工具检查失败 | `make formal-tools` 看 Java/JAR 是否就位；缺环境、覆盖缺口与执行失败是三件事 |
| `No projects matched the filters` | 核对 `pnpm-workspace.yaml` 和成员 `package.json` 的实际包名；应用包括 `@omne-harness-lite/cli`、`@omne-harness-lite/tenancy-host` |
| `storage conformance · postgres` 显示 skipped | 未设 `OMNE_TEST_PG_URL`；跳过不是通过（[验证与证据](verification.md)） |
| 不知道如何启动产品 | 先构建，再按 [CLI](../apps/cli/README.md) 或 [治理中心](../apps/tenancy-host/README.md) 的命令启动；制品打包不自动安装或发布服务 |

## 保持本页可用

改变环境、命令或目录时，**先改实现再改本页**，并把改动过的那条路径实际跑一遍。
版本与依赖从包配置和锁文件读取，本页不复制版本号；
完整命令表归 [Makefile](../Makefile) 与 [scripts/](../scripts/README.md)，
本页只解释顺序与选择。
