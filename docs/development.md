# 开发指南

本页提供本仓库的开发操作路径，供人和coding agent准备环境、实施变更、验证并形成可审阅交付。贡献范围与报告要求归[CONTRIBUTING](../CONTRIBUTING.md)，工作约束归[工程规范](engineering/README.md)，系统保证与组合验证责任归[架构符合性](architecture/assurance.md)。本页说明操作顺序和检查选择，不维护另一套规则、技能方法或完成状态。

已有明确任务时，从下表选择入口；准备环境后无需通读所有专题。

| 当前要做什么 | 本页入口 | 需要进一步判断时 |
| --- | --- | --- |
| 第一次参与或更换执行环境 | [准备可用的检出](#准备可用的检出) | [源码与workspace](workspace.md)、[技能来源](engineering/skills.md#来源与项目采用) |
| 开始修复、功能或重构任务 | [开始一次交付](#开始一次交付) | [工程场景](engineering/scenarios/README.md)、[任务地图](context-map.md) |
| 修改后选择验证、准备交付 | [修改与验证](#修改与验证)、[一次交付的验证与整洁回路](#一次交付的验证与整洁回路) | [验证边界](verification.md)、[整洁回路](clean-loop.md) |
| 新建能力组或整改产品包 | [创建和整改产品包](#创建和整改产品包) | [包组织](package-organization.md)、[成员文档](member-documentation.md) |
| 启动产品、排查开发环境 | [运行入口](#运行入口)、[常见问题](#常见问题) | 所属应用或工具的实际说明 |
| 委派agent或准备提交与PR | [使用coding agents](#使用-coding-agents)、[准备提交与PR](#准备提交与-pr) | [协作交接](engineering/workflow.md#责任与协作交接)、[贡献接受](../CONTRIBUTING.md#评审与接受) |

## 准备可用的检出

先确认实际检出、任务分支和已有改动。隔离及清理条件归[协作交接](engineering/workflow.md#责任与协作交接)：每个写者在明确写范围的隔离树工作，先进入该树再执行；共享对象单写，耦合任务串行。检查和依赖环境在实际使用的树准备，不能用别树的结果或 editable 安装冒称本树验证。创建与接续的方法按[playbook 入口](engineering/skills.md#playbook-入口)选择。

```sh
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

完整检查需要 Git、Bash、[uv](https://docs.astral.sh/uv/getting-started/installation/)，
以及根 `package.json` 的 `engines`/`packageManager` 指定的 Node 与 pnpm。

支持在 macOS、Linux 与 Windows 上开发。`pnpm run check`、格式化脚本与 pre-commit 钩子是 Bash 脚本：Windows 上在 WSL2 的 Linux 发行版里检出仓库并运行它们，不支持在 PowerShell 或 cmd 中直接运行。TypeScript 工具只用 Node 标准库与跨平台依赖；运行名额由 [with-test-slot.mjs](../scripts/with-test-slot.mjs) 实现，不依赖 `flock`。
Python 范围由 [pyproject.toml](../pyproject.toml) 声明，uv 管理解释器与虚拟环境——
**不要依赖系统 `python` 恰好存在**。使用coding agent参与本项目迭代维护时，先完成下一节的插件初始化。仓库依赖在实际使用的检出中准备：

```sh
uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
pnpm -r rebuild node-pty
```

安装依据锁文件且禁用依赖脚本。随后仅显式构建workspace白名单中的node-pty；这一步由 node-gyp 构建，需要 Make；使用Node 24及以上版本时还需要支持C++20的编译器，已有系统编译器过旧时在实际环境选择合适的CC/CXX，不修改依赖源码或跳过原生检查。依赖准备后按[任务影响面](#修改与验证)选择检查；需要核对完整交付候选时使用[组合检查](#交付与合并前的检查)。`pnpm run check`不调用真实模型，构建、成员测试及验收范围由实际计划决定。

### Cursor Cloud Agent 镜像

镜像按宿主分目录，手写源在 [`.meta_harness/agents/cloud/`](../.meta_harness/agents/cloud/README.md)。Cursor 的源在 [cursor](../.meta_harness/agents/cloud/cursor/README.md)。不要在仓库根创建实体 `.cursor` 目录。编译把 `Dockerfile`、`environment.json` 和 `install.sh` 投影到 `.meta_harness/.cursor/`。`link_agents.py` 在仓库根创建 `.cursor`，它是指向该投影的相对软链接。Cursor 从检出中的 [`.cursor/environment.json`](../.cursor/environment.json) 读取环境。Build 在仓库根运行 [`.cursor/install.sh`](../.cursor/install.sh)。该脚本先执行上面的三条依赖命令，再编译被 Git 忽略的 agent 生成物。脚本可以重复执行。成功的 Build 保留磁盘上的依赖和生成物。进程和 shell 变量不进入下一次 agent 运行。

这份 `.cursor` 投影需要提交。Cursor 在安装脚本之前就要读到它。改源后删除旧的 `.meta_harness/.cursor`，再按[根软链接](../.meta_harness/tooling/README.md#根软链接)重新编译并链接。`pnpm run check:agents` 核对投影与根链接。手改投影或根目录会失败。

镜像提供 Git、Bash、Make、rsync、支持 C++20 的编译器、GitHub CLI、uv 0.13.0，以及根 `package.json` 的 `engines` 与 `packageManager` 所要求的 Node 和 pnpm。角色评估用 rsync 复制检出副本，因此 `pnpm run test:python` 需要本机有 rsync。精确版本写在源 Dockerfile 的 `NODE_VERSION` 与 `PNPM_VERSION`。当前分别是 26.12.0 和 10.28.1。

镜像为 ubuntu 用户安装 Matt skills 1.3.1。revision 与[技能来源表](engineering/skills.md#来源与项目采用)相同。`npx skills` 不能把该 revision 当成分支克隆。镜像先取出这个 commit，再以 `-a cursor -g` 安装。正文在 `~/.agents/skills`，并链接到 `~/.cursor/skills`。安装完整插件不扩大方法采用范围。镜像不运行 `setup-matt-pocock-skills`。

Git 的 author 与 committer 是潘其威(William)。邮箱是 `46810637+PanQiWei@users.noreply.github.com`。这是 GitHub 账号 PanQiWei 的 noreply 身份。`/usr/local/bin/git` 在每次调用前写回这个姓名和邮箱，并关闭 `commit.gpgsign`。`~/.gitconfig` 里的其他键保留。镜像环境变量 `GIT_AUTHOR_*` 与 `GIT_COMMITTER_*` 使用同一身份。直接调用 `/usr/bin/git` 时，作者仍是这个人。这些变量写在镜像里，不是安装脚本的临时 shell 变量。环境构建如果复用已有基础镜像，就只运行 `install.sh`。脚本在当前用户是 ubuntu 且 `sudo` 不询问密码时，从 Dockerfile 取出同一身份和同一个 revision 再安装一次。其他账户不改。

此镜像不安装 Java、TLC、Alloy 或 Postgres。缺少这些工具时，按[失败与未知的处理](#失败与未知的处理)报告未执行。密钥和令牌放在 Cursor Cloud Agents 的 Secrets。不要把它们写入仓库。

对已经包含这份投影和根链接的分支，直接启动 Cloud Agent。交互式 Set up agent 会忽略 Dockerfile。仓库内这份 `environment.json` 优先于仪表盘里保存的个人或团队环境。更换根 `engines` 或 `packageManager` 时，同步修改源 Dockerfile 里的对应版本，并重新投影。

### Claude Code on the web 环境

手写源在 [`.meta_harness/agents/cloud/claude-code/`](../.meta_harness/agents/cloud/claude-code/README.md)。把其中 `setup.sh` 的全文粘贴到云端环境设置的 Setup script。平台缓存 setup 的结果，所以每次会话都要做的工作放在 `session-start.sh`。setup 把它登记成 user 作用域的 SessionStart 钩子。

setup 安装 rsync、Node 26.12.0、pnpm 10.28.1、uv 0.13.0，以及 pstack 与 Matt 两个 Claude Code 插件。检出已存在时，它再执行上面的三条依赖命令并生成 agent 投影。

每次会话启动或恢复时，`session-start.sh` 把 Node 26 放到 Bash 工具的 PATH 最前。Git 作者与提交者优先使用云端环境的 `GIT_AUTHOR_NAME` 与 `GIT_AUTHOR_EMAIL`，各缺值才从开会话的 GitHub 账号补足。脚本还会取完整历史，把本地 `main` 快进到 `origin/main`，按需重装依赖和重新生成投影，并把两个插件更新到上游最新版本。插件更新在下一次会话生效。

`main` 已分叉或不能快进时，脚本只输出诊断，不丢弃本地工作。此环境不安装 Java、TLC、Alloy 或 Postgres。缺少这些工具时，按[失败与未知的处理](#失败与未知的处理)报告未执行。密钥和令牌放在云端环境设置里，不要写入仓库。

### 初始化 coding agent 插件

本项目的迭代维护依托pstack主线与已选Matt补充。人和agent参与项目迭代维护前，须在自己实际使用的coding agent harness安装并启用对应插件。这项前提适用于研发维护，普通应用操作或独立消费成员公开API不因此要求安装插件。精确版本、固定revision、采用子集及必要依赖只由[技能来源表](engineering/skills.md#来源与项目采用)维护；这里提供初始化步骤。

1. 确认实际harness及其版本，打开它的插件管理入口。根据技能来源表选择固定revision，不以原版pstack、同名技能或上游最新版代替项目指定来源。
2. 注册固定来源并安装两份插件。支持Git revision的宿主直接指定来源表中的revision；支持本地marketplace但不能固定远程revision的宿主，可先在仓库外准备对应revision的检出，再注册其marketplace。按固定源的安装说明操作，避免把插件正文复制到本仓的技能源或同时安装另一份同名技能。
3. 新开会话，核对两份插件的安装版本、启用状态、发现路径，以及本次需要的技能和参考文件是否可读。安装成功、宿主发现、正文读取与实际行为分别判断，详见[阅读与实际加载](engineering/skills.md#阅读与实际加载)。
4. 按实际harness完成所用方法的配置。需要pstack子代理流程时沿其 `setup-pstack` 正文选择可用模型和宿主映射；使用SessionStart自动路由时，沿[hooks说明](engineering/skills.md#hooks-与证明层次)核对宿主要求的审阅、信任与实际执行。尚未配置或观察到的功能保留未覆盖，不把安装当作已生效。

Codex CLI支持下列命令形态。先将两处revision占位符替换为技能来源表中的完整revision，再执行：

```sh
codex plugin marketplace add michael-denyer/pstack-claude --ref <pstack-revision>
codex plugin add pstack@pstack-claude
codex plugin marketplace add mattpocock/skills --ref <matt-revision>
codex plugin add mattpocock-skills@mattpocock
```

命令语法以实际CLI的 `codex plugin --help`、`codex plugin marketplace add --help` 和 `codex plugin add --help` 为准。其他harness沿固定源的宿主安装说明操作，不能把Codex命令直接套用。若当前宿主缺少项目所需插件机制或技能依赖，报告具体缺口并交agent能力维护者处理；已明确且不依赖缺失能力的工作可以继续，不能声称插件初始化已完成。

更换机器、cloud镜像或harness时重新核对。插件更新或自动更新后也核对实际版本；不匹配时先恢复指定版本，或由技能拥有者明确版本与采用变更，再继续依赖该方法的工作。临时安装与加载记录留任务tmp，不修改来源表来掩盖环境差异。

### Cursor 项目与 Cloud 初始化

Cursor 官方 pstack/Matt 按[来源表](engineering/skills.md#来源与项目采用)安装；本项目资产从 canonical 生成。CLI、IDE 和 Cloud 的项目视图、外部物理插件及首会话前 setup 命令归 [tooling](../.meta_harness/tooling/README.md#cursor-原生包与项目视图)。只启用同一资产的一种接入方式；本地安装不证明 Cloud 初始化或角色模型资格。

### 形式工具链

只有任务需要形式模型时才准备和运行相应工具。先确认实际执行环境：

```sh
pnpm run check:formal-tools
```

Java、TLC、Alloy的查找路径、JAR及环境变量归[环境与实际执行](verification.md#环境与实际执行)。本地已有安装不代表新工作树、cloud镜像或CI具备同一环境；非登录shell须显式传入所需变量。

`pnpm run check:formal-tools`只检查环境，`pnpm run check:design`只检查设计材料结构和登记，二者都不执行模型。实际模型命令从所属规格及验证资源读取，记录工具、输入和范围；环境缺失、模型未覆盖与执行失败分别报告。

### 格式化

TS/JS 格式由根配置 `.oxfmtrc.json` 和锁定的本地 oxfmt 统一处理：

```sh
pnpm format:check
pnpm format:write
```

局部修改只传入本次有写权限的仓库相对文件，例如
`pnpm format:write -- tools/spec-tools/src/x.ts`。
范围包括 `tools/`、`scripts/`、`examples/`、`packages/`、`apps/` 下的 TS/JS 源码、测试及所属配置，
和根 TS/测试配置；**不含**上游原件、provenance、JSONL 黄金文件、依赖、构建输出与临时目录。
Markdown 不在范围内。

编辑器装 `oxc.oxc-vscode` 扩展（`.vscode/extensions.json` 推荐），它调用工作区里的 oxfmt，与命令行同一版本、同一配置。

需要本地提交检查时，确认没有既有 `pre-commit` hook 后运行 `pnpm format:hook:install`。
安装器不覆盖已有 hook；所装检查只读 Git index 中已暂存的文件，**不 stash、不改工作区**。

### 通用静态检查

```sh
pnpm lint:oxlint   # oxlint 正确性规则，范围 tools/、scripts/、packages/、apps/
pnpm lint:deps     # dependency-cruiser：无法解析的导入、文件级运行时循环与 legacy 引用，范围 tools/、scripts/、packages/、apps/
pnpm lint:report   # 只报告：全部目录的 oxlint（含 vitest 测试风格规则）与 knip
```

tsconfig、oxlint 与 dependency-cruiser 的共享规则在 [repo-config](../tools/repo-config/README.md) 预设里维护。根目录的配置文件只引用安装的预设，版本见[仓库工具链的版本](#仓库工具链的版本)。oxfmt 不支持 `extends`，配置留在根目录。

`lint:oxlint` 与 `lint:deps` 违反即失败，`pnpm run check` 每次都跑。oxlint 检查工具、脚本、源码包与应用；dependency-cruiser 对这些目录的依赖违规同样失败。
dependency-cruiser 用类型检查的 `source` 条件解析跨包导入，`dist` 与依赖只作叶子不深入；它自带一份 TypeScript 6 解析 `.ts`（见 `pnpm-workspace.yaml` 的 `packageExtensions`）。方向规则按[产品包组织](package-organization.md#依赖方向与cordis集成)写成成员路径，成员与组之间的环由 repo-toolchain 在同一张图上算；`lint:deps` 运行钉住的 repo-toolchain 的 `omne-deps`。
自 0.0.12 起，`omne-deps` 还执行 `docs/architecture/constraints.json` 的方向行。规则与角色只从运行检查器的仓库读取，被检查的检出改不了它们。命中方向行失败；方向行引用的角色没有文件时也失败。没有方向行时，命令只输出一行说明。详见 repo-toolchain README 的[依赖方向](../tools/repo-toolchain/README.md#dependency-directions)一节。
Cordis 服务关系、领域规则，以及 `package.json`、workspace 清单和源码字符串里的 legacy 路径，仍由 `pnpm run lint:rules` 检查；legacy 的导入边归 `lint:deps`。

### 仓库工具链的版本

检查器 `@omne-harness/repo-toolchain` 与配置预设 `@omne-harness/repo-config` 发布在 npm。`pnpm-workspace.yaml` 的 catalog 钉它们的精确版本。根 `package.json` 与 `tools/product-checks`、`tools/dev-flow`、`tools/test-runner` 用 `catalog:` 引用它们。`linkWorkspacePackages: false` 让普通版本号只从 registry 解析，所以安装的是 npm 上的包，不是工作区 `tools/repo-toolchain`、`tools/repo-config` 的源码。锁文件记录每个包的 integrity，可以与 npm 上的 `dist.integrity` 对照。

钉住的版本承担这些检查：

- 根脚本 `check:declarations`、`contract:api`、`lint:deps`、`metrics`、`loop:status`、`loop:health`、`acceptance:lock` 运行安装包的命令：`omne-declarations`、`omne-contract-api`、`omne-deps`、`omne-metrics`、`omne-loop-status`、`omne-loop-health`、`omne-acceptance-lock`。
- 三个工具成员导入的也是钉住的版本。`lint:rules`、影响面计划与成员测试的编排都不读工作区的 repo-toolchain。
- 根 `tsconfig.base.json` 与 `.dependency-cruiser.cjs` 按包名引用预设。`.oxlintrc.json` 的 `extends` 只接受相对路径，所以写成 `./node_modules/@omne-harness/repo-config/oxlint.json`，指向的仍是安装的预设。

改工作区的 `tools/repo-toolchain` 或 `tools/repo-config` 不改变这些检查的结果，只影响这两个成员自己的构建、类型检查与测试。收工钩子（`.meta_harness/agents/hooks`）仍运行执行检出里的 `tools/repo-toolchain` 源码。它给 agent 读数，不是准入检查。

升级按下面的顺序做：

1. 在一个 PR 里改 `tools/repo-toolchain` 或 `tools/repo-config`，并提高它 `package.json` 里的版本号。这个 PR 改到仓库工具链路径，经变更闸门确认；它仍由当前钉住的版本检查。
2. 这个 PR 进入轨道或 main 以后，经 `gate-release` 发布新版本，见[现行准入](engineering/integration.md#现行准入)。
3. 再开一个只改 catalog 钉子与锁文件的 PR。它改到 `pnpm-workspace.yaml` 与 `pnpm-lock.yaml`，经仓库工具链变更闸门确认。确认者核对它的改动只有这两处；只有这样，用旧版本检查目标分支才等价于用旧版本检查候选。
4. 用旧版本在目标分支上、用新版本在组合候选上各跑一遍 `pnpm run check`。PR 说明写两次的结果与差别，以及新版本删除或放宽的每一项检查；确认说明引用 PR 说明。旧版本的失败如实保留。
5. 新版本在组合候选上的结果不得比旧版本在目标分支上的结果多出失败；两边都有的既有失败如实列出。不满足时不确认。
6. 新版本有问题时，再开一个 PR 把钉子改回旧版本，同样按第 3 至 5 步运行与确认。npm 上已经发布的版本不再修改。

这一流程的决定来源是 [RFC-0008](rfcs/RFC-0008-repo-toolchain-trust.md)。

## 开始一次交付

1. 明确本次目标、写范围、长期承诺拥有者和完成判断。按[任务地图](context-map.md)选择主场景；已有契约足够的局部修改直接推进，新保证或含义冲突先回拥有者。
2. 固定任务基线、实际分支与候选状态。用不可变提交作为比较依据；当前未提交及未跟踪文件属于候选，不能把HEAD当作这些字节的版本。
3. 识别实际消费者与验证责任。公开接口、装配、配置、生成和间接读取变化都可能扩大影响面，不能只按修改的文件夹选测试。
4. 确定本次需要的检查和证据、复用条件及未覆盖。纯文字修订、行为改变、跨边界保证和性能任务分别选择方法，不默认执行完整矩阵。
5. 独立写者按[协作交接](engineering/workflow.md#责任与协作交接)隔离，共享接口、登记和集成拓扑由单一负责人维护。原有改动不属于本任务时保留，不为得到干净状态移除它们。

单次交付规格整理本次实施与验收，长期规格维护持续有效的承诺。两者的落位和承接沿[规格分类](engineering/documentation.md#单次交付规格与长期规格)；已有契约足够时无需另造任务规格。成果与过程材料的具体归属见[终态与过程材料](#终态与过程材料)。

### 开工时确定交付报告

固定任务 BASE 与影响范围后，按[提交与 PR 表达](../CONTRIBUTING.md#提交与-pr-表达)判断报告触发条件。
需要表达或审阅方法时从[工程技能入口](engineering/skills.md#playbook-入口)选择 Opening a PR，项目报告内容仍归贡献指南。修改产品源码时，从首个可运行候选及正常复查点保存适用结构快照到本任务 tmp；
等到开 PR 才采集，无法恢复中途引入后解决的数量。报告实际工具的 BASE/merge-base、范围与规则版本，
没有快照的数据保留未知。最终候选再核对，不要求每个 commit 全量测量。

## 定位修改位置

| 要改什么 | 去哪 |
|---|---|
| 文档导航与技能镜像检查器 | [tools/spec-tools/](../tools/spec-tools/README.md) 的 `src/` 与 `tests/` |
| 设计链检查、agent 编译与根链接工具 | [.meta_harness/tooling/](../.meta_harness/tooling/README.md) |
| 本地与 CI 共用的自动化调用 | [scripts/](../scripts/README.md)；复杂检查行为回到工具包 |
| 仓库命令入口 | 命令入口只在根 [package.json](../package.json) 的 `scripts` 中新增 |
| Skill、subagent 或宿主适配 | [.meta_harness/agents/](../.meta_harness/agents/README.md) 的**源**，不改生成物 |
| 环境、布局、检查含义、编码防御 | 本目录各份正文，见[阅读地图](README.md) |
| 项目要求、系统技术架构与领域责任 | [项目要求](requirements.md)、[架构](architecture/README.md)、[领域](domains/README.md)，按已接受范围维护 |
| 精确公开类型、行为规格及验证资源 | 对应实际packages、apps或tools成员；从[领域责任](domains/README.md)定位拥有者 |
| 产品、独立目标、统一语言、领域对象与research | [.meta_harness/](../.meta_harness/AGENTS.md)的相应正文 |

各目录局部 `AGENTS.md` 补充其工作边界；完整布局归[源码布局](workspace.md)。
根 Python workspace 只管理开发环境，与 pnpm 管理的 TS 工具链并存。

## 创建和整改产品包

产品包先明确已接受的职责、公开接口与行为依据。建包时使用[版本化包模板](../tools/dev-flow/templates/package/README_ZH.md)，不要手写另一套结构。模板不能替代架构设计或技术接受。

目标组及包边界先按[产品包组织](package-organization.md)确定。成员的必选文件和导出形状以[成员的必选结构](package-organization.md#成员的必选结构)为准。两层文档内容按[成员文档要求](member-documentation.md)组织。当前生成器的文件槽和操作由[包模板](../tools/dev-flow/templates/package/README_ZH.md)和[组模板](../tools/dev-flow/templates/domain/README.md)维护。生成器已经写出先删除 `dist` 的 build、`erasableSyntaxOnly`，以及 `source` 条件。发布时去掉 `source`。旧包不自动升级，新文档义务不重判旧版。

新能力组先有明确工程责任，再从仓库根预览和创建入口草稿：

```sh
pnpm package:template create-domain --group example-capabilities
pnpm package:template create-domain --group example-capabilities --write
pnpm package:template scan --group example-capabilities --check --json
```

组默认只生成README.md与documentation.json，不创建假成员、空专题、源码或采用标识。完成实际内容后再运行检查。组内已有成员的能力组不能用创建命令覆盖，按模板要求逐项整改。

service-contract的创建与扫描不限制能力组，公共Service定义随能力契约拥有者落入所属组。不通过手写骨架或伪造标识绕过模板。

从仓库根先预览，再创建草稿：

```sh
pnpm package:template create --group identity --name example-capability --variant service-contract
pnpm package:template create --group identity --name example-capability --variant service-contract --write
```

按职责选择module、cordis-module、service-contract或service-provider。公共Service定义随能力契约拥有者，独立能力从纯根导出，Cordis集成默认放 ./cordis。源码、行为契约、Schema、模型及必要说明的归属详见模板说明；能力组和成员包两层维护各自完整必要文档。生成草稿只报告模板来源，不写采用标识；占位须由真实承诺与验证替换，不生成空测试或假Service。

当前模板 `typescript-package@3.0.0` 一次生成[完整骨架](package-organization.md#完整生成树)：包根 `index.md` 与 `SPEC.md`、docs 六个专题，以及每个固定目录的 `README.md` 与 `index.md`。各文件的职责见[成员文档](member-documentation.md#固定骨架)。草稿读数分两类：

- 代码与包根 README 带 `PACKAGE_TEMPLATE_DRAFT`。扫描报告 `draft`，结构判失败，`--check` 退出 1，不能写采用标识。
- 其余 Markdown 带文档占位标记，并已登记在 `documentation.json`。它们不阻止采用标识，但 inventory 读作 `placeholder-only` 并计为缺项。

刚生成的 `acceptance/` 只有入口文件，没有可执行场景。此时不要求验收配置，扫描读作“无可执行验收场景”，测试运行器也不选这个成员跑验收。写入第一个 `*.acceptance.ts` 场景时，由验收的拥有者一并加入 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本。

测试按[包级测试责任与边界](verification.md#包级测试责任与边界)选择。默认准备单元测试，以及从公开入口做的契约测试。实现具体存储或应用服务时，再增加集成测试。拥有关键用户旅程时，再增加旅程测试。生成器写出 `tests/public-entry.spec.ts`，从包名核对当前公开导出。它不为每个包生成集成目录、端到端目录或全系统启动脚本。这些入口的目录名尚未决定。公开契约替换草稿导出时，替换这份入口测试。

现存包整改先做只读盘点，再按精确版本核对实际结构：

```sh
pnpm package:template scan --json
pnpm package:template scan --member packages/common/json-text --check
```

未标识的现有成员按当前模板判定，因此会报告缺少骨架节点；这一读数不是迁移要求，迁移须另行授权。逐包核对全部目录、文件和资源归属，完成模板全量适配及适用集成责任的人工核验后，才能添加 omneHarness.packageTemplate 的 id/version/variant。保留原公开能力、源码、Schema 身份及模型义务，不批量抬升标识。不完整、未核对和仍有适用偏离的包保持无标识。[逐包核对记录](../tools/dev-flow/templates/package/adoption-review.md)只记录此前版本采用范围，不表示已完成当前模板迁移。标识表示完整模板采用，不表示全系统或业务验收。

TS检查目录、必需文件、草稿及精确版本；Python文档盘点检查局部登记、必要章节和占位。组与成员各自维护一份documentation.json，工具默认发现两层登记，不在项目根重复登记成员目标。普通盘点退出0只表示执行成功，须阅读缺项和unknown；显式组检查不提供历史采用认证，也不替代成员扫描。

```sh
uv run --locked omne-documentation inventory --root . --out tmp/documentation-inventory
```

扫描遍历全部源码节点，按精确版本与变体实例化模板树，未声明路径、错位资源、空目录和软链接均报失败；不沿 Git ignore 隐藏源码。只排除模板声明的根构建/依赖/临时目录并报告清单。标识状态、完整结构及静态集成结果分别显示。普通盘点退出 0 不表示合规；--check 的 0/1/2 分别表示当前完整结构通过且无已知集成偏离、采用/结构/偏离失败、规则未覆盖或输入错误。集成 unknown 仍须人工核对，0 不表示生命周期或业务验收。创建不覆盖已有目标，扫描不改文件。

## 运行入口

**先构建，再按所属应用的 README 启动。**治理中心的命令与配置见
[tenancy-host](../apps.0.0.1.legacy/tenancy-host/README.md)，从零部署并完成账号/组织旅程的演练见
[黑盒端到端入口](../apps.0.0.1.legacy/tenancy-host/tests/e2e/README.md)。后者使用实际构建产物，包含网络、证书和临时数据目录的环境要求。

产品包的构建、类型检查与测试分别为 `pnpm run build`、`pnpm run typecheck`、`pnpm run test`；
结构检查为 `pnpm run lint:rules`。开发工具、agent 产物与形式模型的检查入口见下文。
成员的公开承诺、实现及验证义务归实际包/应用；[架构维护入口](../.meta_harness/design/architecture/README.md)导航其归属。本页不维护另一份进度清单。

## 修改与验证

迭代中先运行能发现本次目标缺陷的检查，再随消费者和候选变化扩展必要范围。方法按[工程质量](engineering/quality.md#按成果和风险验证)选择，命令的覆盖与局限归[验证说明](verification.md#检查入口)。

### 按改动选择检查

| 本次改动 | 首选操作与进一步判断 |
| --- | --- |
| 文档文字、链接与锚点 | `pnpm run check:docs`；变动涉及应有文件、必要章节或占位时，加`pnpm run docs:inventory`并阅读缺项和unknown |
| skills、roles、生成输入或宿主适配 | `pnpm run check:agents`；改变工具行为时运行受影响工具测试。源与生成一致不证明宿主发现、加载或模型遵循 |
| 产品topic、统一语言、领域对象或设计登记 | `pnpm run check:design`；本地待复核队列可用`pnpm run check:design --stale report`。需要模型证据时另行执行实际模型 |
| 检查器、生成器或自动化行为 | 对受影响工具运行测试；`pnpm run test:python`是Python工具与生成链的组合入口，TS工具沿所属成员测试 |
| TS或JS源码、测试、配置 | `pnpm format:check`及受影响构建、类型检查和测试；读取或修改TS时加载[pstack TypeScript方法](engineering/skills.md#pstack-方法入口) |
| 产品行为或公开入口 | 运行受影响快慢层及适用公开消费、组合或验收；构建和类型检查按计划选择，公开入口变化不自动等于全仓检查 |
| 租户、权限、并发、恢复或资源生命周期 | 从[架构质量场景](architecture/assurance.md#系统级代表场景)和实际契约选行为、故障或交错验证。单组件通过不能代替跨边界责任闭合 |
| 性能或资源变化、较大或复杂功能、交互主路径变化 | 按[贡献报告触发](../CONTRIBUTING.md#pr-正文与报告)选择有界profiling，按[性能场景](engineering/scenarios/performance.md)及pstack benchmark-checklist核对测量；不自动运行完整基准或付费调用 |
| 产品源码结构与断言效力 | 取得适用的metrics、覆盖、差分变异及loop-status结果，按[整洁回路操作](#一次交付的验证与整洁回路)处置，不用数值下降替代行为保持 |

`docs:inventory`的`--base`是独立基线目录；测试与度量的`--base`是Git比较依据，不能混用。缺项计量只观察已登记结构，不判断正文充分或实现符合。

### 迭代中的受影响测试

`check`、`check:plan`、`test:affected` 与 `mutation` 按同一规则取基线：显式给的（`--base` 参数，再取环境变量 `BASELINE`），再取工作树 task context 固定的 `targetBase`，再取 `origin/main`，最后取 `main`。已绑定任务的工作树不必传基线，并且只接受等于 `targetBase` 的显式基线。同步过目标分支以后，开工时的任务基线不再等于 `targetBase`，显式传入会被拒绝，命令在标准错误写出原因后以 2 退出，不运行任何检查。

没有绑定任务的工作树才需要显式基线。在仓库根将占位符替换为完整任务基线提交。以下命令使用同一个比较依据：

```sh
TASK_BASE='<完整任务基线提交>'
pnpm run check:plan --base "$TASK_BASE"
pnpm run test:affected --base "$TASK_BASE" --plan-only
pnpm run test:affected --base "$TASK_BASE"
pnpm run test:affected --base "$TASK_BASE" --tier slow
```

`check:plan`只输出计划。`test:affected`先构建选中成员及其上游，默认只跑快层；慢层由`--tier slow`选择，`--tier all`合跑两层。选择依据包括实际改动、依赖关系及显式读者规则，不能仅凭“没修改那个包”省略消费者验证。

按 [RFC-0002 revision 2](rfcs/RFC-0002-engineering-toolchain.md#影响面选择)，改了哪些成员、哪些成员依赖它们，由 turbo 的 `--affected` 给出；构建由 `turbo run build` 编排，按依赖先构建上游，本机读写 `.turbo/` 缓存。类型检查由 `turbo run typecheck` 运行，不先构建，按输入缓存（依赖上游成员的 `typecheck`，上游源码改动后下游重新检查；准入时只写不读），运行前由 `tools/test-runner` 核对嵌套归档目录已在成员的 `tsconfig.test.json` 排除。类型检查的缓存键只覆盖成员目录、`workspace:` 依赖的上游成员和根 `turbo.json` 的 `globalDependencies`。成员的类型检查经相对路径读取其他成员的文件时，要把这些文件列入 `globalDependencies`，否则单独运行会命中过时的结果。现在列入的是仓库根的 `vitest.tiers.mts`，以及 `tools/dev-flow`、`tools/test-runner` 测试读取的 `tools/repo-toolchain/src/**` 与 `tools/repo-toolchain/tests/fixtures/**`。成员测试由 `turbo run test:fast`、`test:slow` 或 `test` 运行，层由 vitest 的 mode 选择；`tools/test-runner` 负责计划、调用 turbo，并照旧写出测试耗时账本。可执行验收仍由 `tools/test-runner` 逐成员执行。

turbo 不提供的规则留在 `tools/test-runner/test-runs.config.json`：全局文件改动判全量；测试读取成员目录以外的文件时带上对应成员；Python 工具、常驻检查和 legacy 排除；没有规则认得的文件判全量，不按猜的范围少跑。`turbo` 2.11.7 的 `--affected` 默认不参考任务 `inputs` 里指向成员目录外的文件，所以读者规则不能改写成 `inputs`。

下面几条规则让计划更小，不改变两条硬线：改代码跑那个成员及其下游的测试，没有规则认得的文件判全量。
- `.meta_harness/human/**` 是常驻路径。那里只有给人读的 `.md`。只有常驻检查 `check:docs` 读它，成员测试、pytest 与影响面规则都不读。只改它时只跑常驻检查。
- 成员根目录与 `apps/*/deploy/` 下的 `.md`（`memberDocuments`）不算成员改动。turbo 按包计改动，会选中那个成员与它的全部下游。计划用 turbo 的依赖图，把只改了文档的成员及其下游中不是代码改动成员下游的那些拿掉：不进测试、类型检查与验收。同一成员既改文档又改代码时，照旧选中它与下游。计划说明把拿掉的成员列在「只改了文档、不选的成员」下。拿掉之前，计划核对 turbo 选中的每个成员都在代码改动成员或只改了文档的成员的下游里（含它们自己）。有解释不了的成员时，turbo 的种子里有规则没认出的改动，计划判全量，理由点名这些成员。
- 只改一个不被任何测试读的成员 `SPEC.md` 或 `README.md` 时，计划只跑常驻检查。被测试读的文档由 `tools/test-runner/test-runs.config.json` 的读者规则逐份点名。改这样的文档时，计划只选规则点名的成员，不带下游。测试新读一份成员根目录文档或成员目录外的文件时，同时补一条读者规则，否则改它时漏选。
- `tools/dev-flow/src/integration/**` 是 dev-flow 的成员文件，不是全局路径。改这里跑 dev-flow 的测试。`scripts/check.sh` 用 `tools/test-runner` 的 `baseline` 取基线，不执行这里的代码。`check:lines` 导入其中的 `parse.ts` 与 `policy.ts`，它是常驻检查，每次都跑。
- 常驻构建（`residentBuild`）包含 `packages/agent/agent`。`lint:deps` 解析它的验收夹具 `acceptance/fixtures/executor.mjs` 对 `dist/index.js` 的导入。没有它，在没有旧构建产物的检出上，只需常驻检查的计划会在 `lint:deps` 失败。

RFC-0002 的四条约束这样落实：
- 选择规则不能由 PR 改写：turbo 用运行检查器仓库的 `turbo.json`（`TURBO_ROOT_TURBO_JSON`）；`packages/*`、`tools/*` 等成员目录下出现 `turbo.json` 直接报错，`apps/*` 下的由检查器按下面的成员配置规则核对合成后的任务定义；`**/turbo.json` 和本配置文件都是全局文件。根配置的预设和检查器来自钉住的 npm 包，改版本就是改锁文件与 `pnpm-workspace.yaml`，它们也是全局文件。
- 基线显式传入：合并点经 `TURBO_SCM_BASE` 传给 turbo，不让它自己推断。
- 未识别文件按全量处理：由上面的规则判。
- 准入检查不读 turbo 任务缓存：`OMNE_ADMISSION=1` 时构建与类型检查只写本地缓存，不读缓存（`--cache=local:w`）。进入任何一条主干之前的检查都带这个变量，规则见[集成规则](engineering/integration.md#检查责任)。

`apps/*` 下的成员 `turbo.json` 要满足下面七条。`tools/test-runner` 的校验器按规则核对：规则 1、2 读成员原文；规则 3 至 6 读 `turbo run --dry=json` 给出的 `resolvedTaskDefinition`，合成时用的根配置与准入时相同；规则 7 两处都核对。规则 6 后半句不由校验器判断，由评审核对：
1. `extends` 只能是 `["//"]`。
2. `tasks` 只能覆盖根已定义的任务名。
3. `build`、`typecheck`、`test:fast`、`test:slow`、`test` 的 `dependsOn` 必须包含根定义的条目，只能增加（用 `$TURBO_EXTENDS$`）。
4. `test:fast`、`test:slow`、`test` 不能设 `cache: true`。
5. `outputs`、`inputs` 只能指向本成员目录内。
6. `env` 只能增加；`passThroughEnv` 只放不影响结果的变量。
7. 上面这些任务都不能设 `persistent: true`。

规则 3、4、7 只列当前根配置里的任务。以后加入根配置的任务按同样类别适用：进检查的任务按规则 3，测试类任务按规则 4，`dev` 一类不进检查的任务可以不受规则 7 约束。在规则范围内修改 `apps/*/turbo.json` 不需要仓库工具链变更闸门；修改校验器本身需要。这些规则是暂行规则，目前没有成员使用成员配置。第一个需要的应用出现时，先修订这里的规则，再改校验器，不直接改校验器。

检查脚本调用 turbo 时关闭遥测与升级提示。

不要用 `vitest --changed` 按文件选择测试。包 B 的测试可能经导出读取包 A 的 `dist`。turbo 会选中 B，但 B 可能一个测试都不跑并报告成功。至少等测试直接读源码之后再评估。

局部定位可直接运行一个成员或测试文件：

```sh
pnpm turbo run test:fast --filter=@omne-harness/<包名>   # 先构建该成员及其依赖，再跑快层
pnpm --filter @omne-harness/<包名> exec vitest run <测试文件>  # 不构建，依赖的 dist 须已就绪
```

测试归层、时限和耗时账本归[测试运行器](../tools/test-runner/README_ZH.md#测试运行)及[分层定义](../vitest.tiers.mts)。新增真实等待、子进程、网络或重CPU用例时，按真实成本选择层并说明原因，不把慢任务藏在快层。

### 失败与未知的处理

测试失败先保留原始输出和候选状态。需要判断隔离重跑是否稳定时，使用那次运行打印的目录：

```sh
pnpm run test:triage --run <实际运行目录>
```

将失败归因于并行或机器负载时附归因结果，隔离通过不证明原场景正确。缺后端、工具、数据或权限时报告未执行或无法验证；例如未设置`OMNE_TEST_PG_URL`的Postgres跳过不算通过。修复后复跑受影响检查，不为变绿弱化断言、改冻结验收或关闭传感器。

检查耗时和环境消耗可从实际账本观察。整套重检查遵循[运行名额](../scripts/README.md#运行名额)；等待名额超时意味着被包命令没有执行，不能算验证通过或产品失败。

## 一次交付的验证与整洁回路

交付时沿“有效承诺 → 实际消费者与装配 → 验证资源 → 本次证据”核对结果，并反向检查新增入口或依赖是否遗漏契约。架构的论证责任归[符合性](architecture/assurance.md#文档与实现的符合性)，整洁指标、带位与硬线归[clean-loop](clean-loop.md#回路怎么转)，完整报告条件归[CONTRIBUTING](../CONTRIBUTING.md#pr-正文与报告)。

### 从候选到可审阅交付

先按[迭代检查的设置](#迭代中的受影响测试)固定`TASK_BASE`，将命令中的`<task>`替换为本次任务目录。同一变量不意味着各工具的比较算法相同，报告保留实际BASE或merge-base。已绑定任务的工作树省略下面命令里的`--base "$TASK_BASE"`，基线取固定的`targetBase`。

1. 在首个可运行候选及正常复查点保存适用快照，最终候选再核对。报告实际BASE或merge-base、dirty状态、输入、规则与范围；没有中间快照就不宣称统计了全过程整改。
2. 对最终候选运行受影响行为、构建、类型及组合验证。复用旧结果须说明契约、代码、配置、依赖和假设仍适用；变化使其失效时补跑对应检查。
3. 修改产品源码时，按贡献要求取得结构摘要、覆盖、差分变异和回路读数。下列命令是相应入口，依本次触发条件执行；覆盖测量前先保证实际构建产物对应当前源码。

   ```sh
   pnpm run metrics --base "$TASK_BASE" --out tmp/<task>/metrics-final
   pnpm run metrics --base "$TASK_BASE" --coverage --out tmp/<task>/coverage-final
   pnpm run mutation --base "$TASK_BASE"
   pnpm run loop:status --base "$TASK_BASE" --out tmp/<task>/loop-final
   ```

4. 原样保留要求提供的摘要和入口，对本次红项逐条说明已处理或保留理由。存量问题、本次引入、已解决与仍保留分别表达；存活及无覆盖变异保留结果，复跑确认和后续处置分开。缺数据保持未知，不填写零或虚构改善比例。
5. 对清理草稿先交负责人决定，不自动扩大成全仓整改。一般度量越线只报告；硬线失败须修复才能合并，不能用解释代替通过。钩子没有提醒不代表没有红项。
6. 提供脱离本次对话也能审阅的交付说明，并按风险选择独立判断。普通局部修改不默认派完整评审阵容，L2、L3或未交代红项按[接受级别](engineering/quality.md#按成果和风险验证)展开；独立评审不替代有权负责人的接受。

纯文档修订不为凑报告执行产品变异、性能基准或完整模型矩阵。结构、语义、宿主行为、公开消费和真实组合的结论分别表达；设计接受、实现完成、验证通过与发布状态也分别判断。

metrics只报告结构与配置范围内的覆盖；mutation只观察其选择的改动源码行和快层。它们不能替代所有消费者和慢层行为验证。“只报告”指坏指标不新增质量硬线，工具执行错误仍须处理。完整覆盖与退出限制沿[验证入口](verification.md#检查入口)核对。

### 交付与合并前的检查

同一基线下先检查计划，再执行最终候选所需的组合检查。已绑定任务的工作树不传基线，两条命令都取固定的 `targetBase`：

```sh
pnpm run check:plan
OMNE_ADMISSION=1 pnpm run check
```

没有绑定任务的工作树（例如进入 stable 的 PR）显式给同一个基线：

```sh
pnpm run check:plan --base "$TASK_BASE"
OMNE_ADMISSION=1 BASELINE="$TASK_BASE" pnpm run check
```

进入任何一条主干之前的检查都带 `OMNE_ADMISSION=1`，规则见[集成规则](engineering/integration.md#检查责任)。不带这个变量的运行会读缓存，不作为准入检查结论。

两条命令按同一规则取基线，因此不给基线时它们比较的范围相同。传显式基线的方式不同：`check:plan`用`--base`参数（也读环境变量`BASELINE`），`check`只读环境变量`BASELINE`。

`pnpm run check`先打印影响面，运行常驻检查，再按计划执行Python、构建、类型检查、成员快慢层及可执行验收，最后执行严格回路状态。它通过时只支持已执行范围；计划中的跳过不算通过。无选中验收时记录显式跳过，不为凑数据运行无关验收。全局变更、未知路径或负责人明确要求可触发全量；`FULL=1`用于显式全量，不是每次交付的默认值。

四条硬线是依赖方向与环、验收锁、主线所需检查绿、启用传感器有数据。严格回路状态核对第一、第二和第四项，第三项由实际所需检查支撑。若手动组合检查，也须完成这些共同硬线，并确保严格传感器所需账本属于同一候选：

```sh
pnpm run loop:status --strict --base "$TASK_BASE" --out tmp/<task>/loop-strict
```

组合检查已经产出同一候选的有效严格报告时可直接引用，不为形式重复执行。临时dirty候选的验收耗时账本目前没有内容指纹，不能仅凭同一HEAD或`-dirty`标记证明最终字节已验收；候选改变后重新执行受影响检查，实际证据绑定沿[工具限制](../tools/repo-toolchain/README_ZH.md#验收耗时)核对。

开发自查可以面向未提交字节。合并前在最终提交和干净检出上核对影响面并执行所需检查；当前仓库工作流配置不能代替实际CI运行证据，本地通过也不表示远端已通过。合并后不自动补跑全量。提交、推送、合并及发布仍按任务授权执行。

### 交付说明与完成声明

交付说明至少让审阅者确定：本次目标与实际改变、有效承诺与采用范围、被验候选、执行的检查及结果、红项处置、未覆盖与下一责任。适用时附公开消费、组合、模型、profiling或demo入口；准确字段和触发条件沿[贡献报告](../CONTRIBUTING.md#pr-正文与报告)，不另填重复表单。

源码或说明新增保证但还没有行为证据时，明确尚未验证。缺必要环境且影响接受时报告无法验证；可以独立交付的部分说明边界。未完成、部分完成、受阻与完成分开，不把文件存在、结构通过或单个组件成功写成全系统符合。

普通任务按[agent交付操作](engineering/agent-delivery.md)核对启用范围和授权；配置未启用时只形成获准草稿。持续验收的锁与覆盖声明沿[clean-loop入口](clean-loop.md#入口)和[源码布局](workspace.md#目录与内容归属)维护。`pnpm run acceptance:scenarios`只观察长期产品场景，不从任务关闭、Stage或覆盖声明授予接受。

## 使用 coding agents

从根[AGENTS](../AGENTS.md)、目标目录局部约定和[任务地图](context-map.md)展开；需要选择首轮角色路径时，沿[角色查询](../tools/spec-tools/README.md#按角色读取上下文)取得入口，仍按任务核对必要承诺；插件初始化沿[准备步骤](#初始化-coding-agent-插件)。按[技能采用入口](engineering/skills.md)读取实际方法，安装、发现、正文读取、hook执行与结果遵循分别取证。

技术设计出现新边界或保证时加载`harness-design-handbook`；产品正文起草加载`product-design`；维护skill、role或AGENTS时分别加载其编写技能。完整触发和写入归属由[工程场景](engineering/scenarios/README.md)及目标局部入口维护，不在本页复制所有技能步骤。

派发按[协作交接](engineering/workflow.md#责任与协作交接)明确目标、检出与分支、写范围、必要输入、完成判断及停止条件。接收后核对实际落点、diff、验证输入与红项处置；执行者自报或其hook提醒不能替代主会话复核。自动清理草稿仍交负责人决定。

skills和subagents维护canonical源与适配，按[编译工具](../.meta_harness/tooling/README.md)生成，根软链接向宿主暴露产物。修改后核对生成、链接和导航；生成一致不代表新实例已加载，更不能消除旧会话携带的提示。

## 准备提交与 PR

标题、报告要求与 squash 规则归[CONTRIBUTING](../CONTRIBUTING.md#提交与-pr-表达)。
按主要结果选项目模板；准备方法从[技能入口](engineering/skills.md#playbook-入口)选择 Opening a PR，Matt code-review 按需核对固定点审阅，语言加载 `asd-ste100`。
源码和数据不足以支持的结论写未知，不从教学示例抄数字或接受状态。

浏览器使用 `.github/PULL_REQUEST_TEMPLATE/` 下的
[feature](../.github/PULL_REQUEST_TEMPLATE/feature.md)、[docs](../.github/PULL_REQUEST_TEMPLATE/docs.md)、
[fix](../.github/PULL_REQUEST_TEMPLATE/fix.md)、[refactor](../.github/PULL_REQUEST_TEMPLATE/refactor.md)。
比较页面的查询参数可选 `template=feature.md` 等；未选择时使用[短默认入口](../.github/pull_request_template.md)。
模板要合入默认分支后才在正常创建入口生效，候选分支上的文件不能证明已生效。
机制依据见 [GitHub 文档](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)。

从执行仓库根将所选模板复制到自己的任务 tmp，填写并移除提示后，再通过 body file 创建：

```sh
mkdir -p tmp/pr-delivery
cp .github/PULL_REQUEST_TEMPLATE/docs.md tmp/pr-delivery/pr-body.md
# 编辑 pr-body.md，使其对应最终 diff 与真实报告。
gh pr create --base main --head <自己的工作分支> \
  --title 'docs(pr): 提供分类模板与交付写作 skill' \
  --body-file tmp/pr-delivery/pr-body.md
```

`gh pr create --template <文件>` 可作为交互填写入口；agent 使用完成的 body file，避免把未填模板提交出去。
已有 PR 改用 `gh pr edit <PR号> --body-file tmp/pr-delivery/pr-body.md`，按最终结果更新而非追加流水。
`--fill/--fill-verbose` 产生的 commit 汇总仍需整理；`--dry-run` 可能推送，不能当无副作用预览。
参数依据见 [GitHub CLI](https://cli.github.com/manual/gh_pr_create)。

提交信息也可先写任务文件，再用 `git commit -F <文件>`，保留适用来源trailer。
获准 squash 时用最终标题与简短正文，保留这些 trailer；正文文件不能直接复制 PR 长表。
开 PR 与合入各按已有授权，不因模板而扩大权限。

先看可用的编写预览，再核对唯一真实 PR 的表、图、折叠、链接和体验步骤；不创建试验 PR。
实际 diff 或报告改变时同步正文，短 docs 可以几句话，重大缺口保持可见。

## 常见问题

| 现象 | 应检查什么 |
|---|---|
| `python` 不存在，或系统 Python 缺模块 | 用 `uv run --locked python ...`；确认已在当前检出 `uv sync --locked` |
| 找不到工具成员或 workspace 依赖 | 从仓库根同步；依赖变更按 [workspace 规则](workspace.md#使用与维护)更新成员声明与锁文件 |
| `cannot locate repository` | 切到受检仓库内，或给 CLI 传明确的 `--root`；安装位置不代表受检位置 |
| 链接、技能镜像或 agent 产物检查失败 | 修正源及其引用，按编译工具更新产物；**不要手改镜像或移出检查范围掩盖错误** |
| `UNCOVERED` | 尚无相应模型任务——那是覆盖缺口，不是失败 |
| 形式工具检查失败 | `pnpm run check:formal-tools` 看 Java/JAR 是否就位；缺环境、覆盖缺口与执行失败是三件事 |
| `No projects matched the filters` | 核对 `pnpm-workspace.yaml` 和成员 `package.json` 的实际包名；应用包括 `@omne-harness/cli`、`@omne-harness/tenancy-host` |
| `storage conformance · postgres` 显示 skipped | 未设 `OMNE_TEST_PG_URL`；跳过不是通过（[验证与证据](verification.md)） |
| 不知道如何启动产品 | 先构建，再按 [CLI](../apps.0.0.1.legacy/cli/README.md) 或 [治理中心](../apps.0.0.1.legacy/tenancy-host/README.md) 的命令启动；制品打包不自动安装或发布服务 |

## 通过对话维护交付卡

研发环境初始化后，先读[agent交付操作](engineering/agent-delivery.md)及[配置](engineering/github-delivery.json)的启用范围，再按[工作类型](engineering/work-types.md)选择必要输入和验证。配置未启用时，只做获准的草稿、只读观察或接入准备；不从封存PF或Git历史重新继承任务。平台配置完成不能代替默认分支模板、凭证、具名写者和真实任务验证。

协议启用后的建卡、取任务、更新与决定记录由操作页提供顺序；卡或模板不替代当前SPEC和设计。只读工具的完整输入、输出与限制由实际[dev-flow](../tools/dev-flow/README.md)维护，不能靠一次工具通过自动派发或接受。

## 终态与过程材料

Git维护当前终态；正式RFC保留进入审议的方案与最小决定关系，真实Issue保留本次交付记录，范围见[四类长期成果与普通任务](engineering/documentation.md#四类长期成果与普通任务)。其他开发流水与决策形成史不作为永久正文。领域与成员各自维护完整必要文档；公开类型表达形状，`SPEC.md` 承担必要行为契约，不重复类型。新成员的使用定位、机制设计与对象模型有固定专题位置，其余指南与选择理由按需另文维护；薄 SPEC 不是整个体系的厚度上限。测试、模型及可复跑验证资源随实际拥有者维护；ADR 只说明当前选择、必要理由和复核条件。项目要求与系统技术预期分别归[项目要求](requirements.md)和[架构](architecture/README.md)，产品与独立设计输入保持meta原源。尚未交接的具体旧技术承诺继续原责任，不复制成包内第二份权威。

未进入正式RFC的候选、逐轮讨论和评审、临时计划、进度及某次执行的输入与输出，写在本工作树`tmp/<task>/`。RFC与Issue的规定记录由其拥有者维护，不将全部过程材料提交。不要求永久追溯，不提交这些材料，不通过改名、搬进 research/ADR/fixtures 或建立 Git 历史链接台账继续入库。`.meta_harness/design/record/` 整体被忽略，不是新材料的落点。

单次交付规格组织本次实施与验收，长期规格维护持续有效的承诺。按[两类规格的归属与承接](engineering/documentation.md#单次交付规格与长期规格)选择位置；任务产生的持续保证经接受后须写回长期拥有者，不能只留在临时任务输入中。

长期验证文档写验证义务、操作方法、前提和局限；单次结果留 `tmp/`。确有运行消费者需要的小型夹具随消费者维护，不复制整份开发证据。获准改变承诺后只更新其现行拥有者；接受、实现和验证仍分别判断，删除形成史不会撤销不变式或降低验证要求。

## 保持本页可用

命令、参数或环境事实变化时先核对实际实现，再更新本页并验证相应入口。规范变化先取得对应拥有者的接受，再同步操作指引，不以当前实现便利改低系统目标。

版本和依赖从配置、锁文件及技能来源表读取；工具算法、完整参数、退出语义和检查限制随实际工具及[验证说明](verification.md)维护。本页保留开发顺序、选择与关键前提，不复制完整规则。变动章节或导航时同步必要登记及入向消费者，单次检查结果留任务tmp。

## 多层分支操作

先从[集成规则](engineering/integration.md)核任务路线，再按[工具指南](../tools/dev-flow/src/integration/README.md)运行 status、start 和 task-sync。同步目标分支时，先在工作分支上用 `git merge` 合并远端目标提交并提交，再运行 task-sync 让 `targetBase` 前进；taskBase 不变。四条主干的进入按[现行准入](engineering/integration.md#现行准入)开 PR 并派发 `gate-publish`。轨道组成以 main 为根的树，同步与提升只在一条轨道和它的上游之间进行，见[轨道树与上游](engineering/integration.md#轨道树与上游)。新建子轨道时派发 `gate-track` 并传入 `parent`。提升 PR 由轨道 owner 提出，说明中列出所含的卡及其在上一层的条件，见[现行准入](engineering/integration.md#现行准入)。说明的「所含的卡」与「契约变化」两节用 `pnpm run ri-notes --track <轨道 ID> --format markdown` 生成：两节写到标准输出，发现写到标准错误。贴进 PR 之前先处理这些发现。命令只读 Git 与 GitHub，只报告，发现不改变退出码；条款见[集成工具契约](../tools/dev-flow/src/integration/SPEC.md)的 I17，两节的规则见[进轨道 PR 的说明](engineering/integration.md#进轨道-pr-的说明)。仓库检查运行钉住的检查器版本，见[仓库工具链的版本](#仓库工具链的版本)，不需要另一个受信检出。
