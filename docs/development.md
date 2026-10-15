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

完整检查需要 Git、Bash、Make、[uv](https://docs.astral.sh/uv/getting-started/installation/)，
以及根 `package.json` 的 `engines`/`packageManager` 指定的 Node 与 pnpm。
Python 范围由 [pyproject.toml](../pyproject.toml) 声明，uv 管理解释器与虚拟环境——
**不要依赖系统 `python` 恰好存在**。使用coding agent参与本项目迭代维护时，先完成下一节的插件初始化。仓库依赖在实际使用的检出中准备：

```sh
uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
pnpm -r rebuild node-pty
```

安装依据锁文件且禁用依赖脚本。随后仅显式构建workspace白名单中的node-pty；使用Node 24时需要支持C++20的编译器，已有系统编译器过旧时在实际环境选择合适的CC/CXX，不修改依赖源码或跳过原生检查。依赖准备后按[任务影响面](#修改与验证)选择检查；需要核对完整交付候选时使用[组合检查](#交付与合并前的检查)。`make check`不调用真实模型，构建、成员测试及验收范围由实际计划决定。

### Cursor Cloud Agent 镜像

镜像按宿主分目录，手写源在 [`.meta_harness/agents/cloud/`](../.meta_harness/agents/cloud/README.md)。当前只有 [cursor](../.meta_harness/agents/cloud/cursor/README.md)。不要在仓库根创建实体 `.cursor` 目录。编译把 `Dockerfile`、`environment.json` 和 `install.sh` 投影到 `.meta_harness/.cursor/`。`link_agents.py` 在仓库根创建 `.cursor`，它是指向该投影的相对软链接。Cursor 从检出中的 [`.cursor/environment.json`](../.cursor/environment.json) 读取环境。Build 在仓库根运行 [`.cursor/install.sh`](../.cursor/install.sh)。该脚本先执行上面的三条依赖命令，再编译被 Git 忽略的 agent 生成物。脚本可以重复执行。成功的 Build 保留磁盘上的依赖和生成物。进程和 shell 变量不进入下一次 agent 运行。

这份 `.cursor` 投影需要提交。Cursor 在安装脚本之前就要读到它。改源后删除旧的 `.meta_harness/.cursor`，再按[根软链接](../.meta_harness/tooling/README.md#根软链接)重新编译并链接。`make agents-check` 核对投影与根链接。手改投影或根目录会失败。

镜像提供 Git、Bash、Make、rsync、支持 C++20 的编译器、GitHub CLI、uv 0.13.0，以及根 `package.json` 的 `engines` 与 `packageManager` 所要求的 Node 和 pnpm。角色评估用 rsync 复制检出副本，因此 `make test` 需要本机有 rsync。精确版本写在源 Dockerfile 的 `NODE_VERSION` 与 `PNPM_VERSION`。当前分别是 24.21.0 和 10.28.1。

镜像为 ubuntu 用户安装 Matt skills 1.3.1。revision 与[技能来源表](engineering/skills.md#来源与项目采用)相同。`npx skills` 不能把该 revision 当成分支克隆。镜像先取出这个 commit，再以 `-a cursor -g` 安装。正文在 `~/.agents/skills`，并链接到 `~/.cursor/skills`。安装完整插件不扩大方法采用范围。镜像不运行 `setup-matt-pocock-skills`。

Git 的 author 与 committer 是潘其威(William)。邮箱是 `46810637+PanQiWei@users.noreply.github.com`。这是 GitHub 账号 PanQiWei 的 noreply 身份。`/usr/local/bin/git` 在每次调用前写回这个姓名和邮箱，并关闭 `commit.gpgsign`。`~/.gitconfig` 里的其他键保留。镜像环境变量 `GIT_AUTHOR_*` 与 `GIT_COMMITTER_*` 使用同一身份。直接调用 `/usr/bin/git` 时，作者仍是这个人。这些变量写在镜像里，不是安装脚本的临时 shell 变量。环境构建如果复用已有基础镜像，就只运行 `install.sh`。脚本在当前用户是 ubuntu 且 `sudo` 不询问密码时，从 Dockerfile 取出同一身份和同一个 revision 再安装一次。其他账户不改。

此镜像不安装 Java、TLC、Alloy 或 Postgres。缺少这些工具时，按[失败与未知的处理](#失败与未知的处理)报告未执行。密钥和令牌放在 Cursor Cloud Agents 的 Secrets。不要把它们写入仓库。

对已经包含这份投影和根链接的分支，直接启动 Cloud Agent。交互式 Set up agent 会忽略 Dockerfile。仓库内这份 `environment.json` 优先于仪表盘里保存的个人或团队环境。更换根 `engines` 或 `packageManager` 时，同步修改源 Dockerfile 里的对应版本，并重新投影。

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
make formal-tools
```

Java、TLC、Alloy的查找路径、JAR及环境变量归[环境与实际执行](verification.md#环境与实际执行)。本地已有安装不代表新工作树、cloud镜像或CI具备同一环境；非登录shell须显式传入所需变量。

`make formal-tools`只检查环境，`make design-check`只检查设计材料结构和登记，二者都不执行模型。实际模型命令从所属规格及验证资源读取，记录工具、输入和范围；环境缺失、模型未覆盖与执行失败分别报告。

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
| Skill、subagent 或宿主适配 | [.meta_harness/agents/](../.meta_harness/agents/README.md) 的**源**，不改生成物 |
| 环境、布局、检查含义、编码防御 | 本目录各份正文，见[阅读地图](README.md) |
| 项目要求、系统技术架构与领域责任 | [项目要求](requirements.md)、[架构](architecture/README.md)、[领域](domains/README.md)，按已接受范围维护 |
| 精确公开类型、行为规格及验证资源 | 对应实际packages、apps或tools成员；从[领域责任](domains/README.md)定位拥有者 |
| 产品、独立目标、统一语言、领域对象与research | [.meta_harness/](../.meta_harness/AGENTS.md)的相应正文 |

各目录局部 `AGENTS.md` 补充其工作边界；完整布局归[源码布局](workspace.md)。
根 Python workspace 只管理开发环境，与 pnpm 管理的 TS 工具链并存。

## 创建和整改产品包

产品包先明确已接受的职责、公开接口与行为依据。建包时使用[版本化包模板](../tools/ts-checks/templates/package/README_ZH.md)，不要手写另一套结构。模板不能替代架构设计或技术接受。

目标组及包边界先按[产品包组织](package-organization.md)确定。成员的必选文件和导出形状以[成员的必选结构](package-organization.md#成员的必选结构)为准。两层文档内容按[成员文档要求](member-documentation.md)组织。当前生成器的文件槽和操作由[包模板](../tools/ts-checks/templates/package/README_ZH.md)和[组模板](../tools/ts-checks/templates/domain/README.md)维护。生成器已经写出先删除 `dist` 的 build、`erasableSyntaxOnly`，以及 `source` 条件。发布时去掉 `source`。旧包不自动升级，新文档义务不重判旧版。

新能力组先有明确工程责任，再从仓库根预览和创建入口草稿：

```sh
pnpm package:template create-domain --group example-capabilities
pnpm package:template create-domain --group example-capabilities --write
pnpm package:template scan --group example-capabilities --check --json
```

组默认只生成README.md与documentation.json，不创建假成员、空专题、源码或采用标识。完成实际内容后再运行检查。组内已有成员的能力组不能用创建命令覆盖，按模板要求逐项整改。

当前service-contract创建和扫描仍限制core，下面命令展示实际支持范围，不是新成员必须归core的目标政策。新组公共Service的模板及静态规则适配须先由工具拥有者完成，不通过手写骨架或伪造标识绕过。

从仓库根先预览，再创建草稿：

```sh
pnpm package:template create --group core --name example-capability --variant service-contract
pnpm package:template create --group core --name example-capability --variant service-contract --write
```

按职责选择module、cordis-module、service-contract或service-provider。公共Service定义随能力契约拥有者，独立能力从纯根导出，Cordis集成默认放 ./cordis。源码、行为契约、Schema、模型及必要说明的归属详见模板说明；能力组和成员包两层维护各自完整必要文档。生成草稿只报告模板来源，不写采用标识；占位须由真实承诺与验证替换，不生成空测试或假Service。

测试按[包级测试责任与边界](verification.md#包级测试责任与边界)选择。默认准备单元测试，以及从公开入口做的契约测试。实现具体存储或应用服务时，再增加集成测试。拥有关键用户旅程时，再增加旅程测试。生成器写出 `tests/public-entry.spec.ts`，从包名核对当前公开导出。它不为每个包生成集成目录、端到端目录或全系统启动脚本。这些入口的目录名尚未决定。公开契约替换草稿导出时，替换这份入口测试。

现存包整改先做只读盘点，再按精确版本核对实际结构：

```sh
pnpm package:template scan --json
pnpm package:template scan --member packages/core/storage --check
```

逐包核对全部目录、文件和资源归属，完成模板全量适配及适用集成责任的人工核验后，才能添加 omneHarness.packageTemplate 的 id/version/variant。保留原公开能力、源码、Schema 身份及模型义务，不批量抬升标识。不完整、未核对和仍有适用偏离的包保持无标识。[逐包核对记录](../tools/ts-checks/templates/package/adoption-review.md)只记录此前版本采用范围，不表示已完成当前模板迁移。标识表示完整模板采用，不表示全系统或业务验收。

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
| 文档文字、链接与锚点 | `make docs-check`；变动涉及应有文件、必要章节或占位时，加`make docs-inventory`并阅读缺项和unknown |
| skills、roles、生成输入或宿主适配 | `make agents-check`；改变工具行为时运行受影响工具测试。源与生成一致不证明宿主发现、加载或模型遵循 |
| 产品topic、统一语言、领域对象或设计登记 | `make design-check`；本地待复核队列可用`STALE=report`。需要模型证据时另行执行实际模型 |
| 检查器、生成器或自动化行为 | 对受影响工具运行测试；`make test`是Python工具与生成链的组合入口，TS工具沿所属成员测试 |
| TS或JS源码、测试、配置 | `pnpm format:check`及受影响构建、类型检查和测试；读取或修改TS时加载[pstack TypeScript方法](engineering/skills.md#pstack-方法入口) |
| 产品行为或公开入口 | 运行受影响快慢层及适用公开消费、组合或验收；构建和类型检查按计划选择，公开入口变化不自动等于全仓检查 |
| 租户、权限、并发、恢复或资源生命周期 | 从[架构质量场景](architecture/assurance.md#系统级代表场景)和实际契约选行为、故障或交错验证。单组件通过不能代替跨边界责任闭合 |
| 性能或资源变化、较大或复杂功能、交互主路径变化 | 按[贡献报告触发](../CONTRIBUTING.md#pr-正文与报告)选择有界profiling，按[性能场景](engineering/scenarios/performance.md)及pstack benchmark-checklist核对测量；不自动运行完整基准或付费调用 |
| 产品源码结构与断言效力 | 取得适用的metrics、覆盖、差分变异及loop-status结果，按[整洁回路操作](#一次交付的验证与整洁回路)处置，不用数值下降替代行为保持 |

文档inventory的`BASE`是独立基线目录；测试与度量的`BASE`是Git比较依据，不能混用。缺项计量只观察已登记结构，不判断正文充分或实现符合。

### 迭代中的受影响测试

在仓库根将占位符替换为完整任务基线提交。以下命令使用同一个比较依据：

```sh
TASK_BASE='<完整任务基线提交>'
make check-plan BASE="$TASK_BASE"
make test-affected BASE="$TASK_BASE" PLAN=1
make test-affected BASE="$TASK_BASE"
make test-affected BASE="$TASK_BASE" TIER=slow
```

`check-plan`只输出计划。`test-affected`先构建选中成员及依赖，默认只跑快层；慢层由`TIER=slow`选择，`TIER=all`合跑两层。选择依据包括实际改动、声明依赖及显式读者规则，不能仅凭“没修改那个包”省略消费者验证。

[RFC-0002 revision 2](rfcs/RFC-0002-engineering-toolchain.md#影响面选择) 接受用 `turbo run <task> --affected` 替换这份手写计算。替换还没有发生。现行命令继续使用 `tools/ts-checks` 的选择器。pnpm 的 `--filter "...[<since>]"` 在 git 工作树里匹配不到包，所以不能改用它。

替换之前，选择器必须保留这些规则。全局文件改动判全量。测试读取成员目录以外的文件时带上对应成员。Python 工具、常驻检查和 legacy 排除保持原规则。没有规则认得的文件判全量，不按猜的范围少跑。`turbo.json` 和 `docs/architecture/constraints.json` 是全局文件。改动它们就是全量。

不要用 `vitest --changed` 按文件选择测试。包 B 的测试可能经导出读取包 A 的 `dist`。turbo 会选中 B，但 B 可能一个测试都不跑并报告成功。至少等测试直接读源码之后再评估。

turbo 接入准入时，基线用 `TURBO_SCM_BASE` 和 `TURBO_SCM_HEAD` 显式传入。不依赖 turbo 自己推断。准入不读取 PR 能写入的缓存。`--affected` 是否参考 `inputs`，以及能否从工作树以外读取配置，还没有验证。在这两项有结果之前，不把 turbo 换成现行命令。

局部定位可直接运行一个成员或测试文件：

```sh
OMNE_TEST_TIER=fast pnpm --filter @omne-harness/<包名> run test
pnpm --filter @omne-harness/<包名> exec vitest run <测试文件>
```

测试归层、时限和耗时账本归[测试运行器](../tools/ts-checks/README_ZH.md#测试运行)及[分层定义](../vitest.tiers.mts)。新增真实等待、子进程、网络或重CPU用例时，按真实成本选择层并说明原因，不把慢任务藏在快层。

### 失败与未知的处理

测试失败先保留原始输出和候选状态。需要判断隔离重跑是否稳定时，使用那次运行打印的目录：

```sh
make test-triage RUN=<实际运行目录>
```

将失败归因于并行或机器负载时附归因结果，隔离通过不证明原场景正确。缺后端、工具、数据或权限时报告未执行或无法验证；例如未设置`OMNE_TEST_PG_URL`的Postgres跳过不算通过。修复后复跑受影响检查，不为变绿弱化断言、改冻结验收或关闭传感器。

检查耗时和环境消耗可从实际账本观察。整套重检查遵循[运行名额](../scripts/README.md#运行名额)；等待名额超时意味着被包命令没有执行，不能算验证通过或产品失败。

## 一次交付的验证与整洁回路

交付时沿“有效承诺 → 实际消费者与装配 → 验证资源 → 本次证据”核对结果，并反向检查新增入口或依赖是否遗漏契约。架构的论证责任归[符合性](architecture/assurance.md#文档与实现的符合性)，整洁指标、带位与硬线归[clean-loop](clean-loop.md#回路怎么转)，完整报告条件归[CONTRIBUTING](../CONTRIBUTING.md#pr-正文与报告)。

### 从候选到可审阅交付

先按[迭代检查的设置](#迭代中的受影响测试)固定`TASK_BASE`，将命令中的`<task>`替换为本次任务目录。同一变量不意味着各工具的比较算法相同，报告保留实际BASE或merge-base。

1. 在首个可运行候选及正常复查点保存适用快照，最终候选再核对。报告实际BASE或merge-base、dirty状态、输入、规则与范围；没有中间快照就不宣称统计了全过程整改。
2. 对最终候选运行受影响行为、构建、类型及组合验证。复用旧结果须说明契约、代码、配置、依赖和假设仍适用；变化使其失效时补跑对应检查。
3. 修改产品源码时，按贡献要求取得结构摘要、覆盖、差分变异和回路读数。下列命令是相应入口，依本次触发条件执行；覆盖测量前先保证实际构建产物对应当前源码。

   ```sh
   make metrics BASE="$TASK_BASE" OUT=tmp/<task>/metrics-final
   make metrics BASE="$TASK_BASE" COVERAGE=1 OUT=tmp/<task>/coverage-final
   make mutation BASE="$TASK_BASE"
   make loop-status BASE="$TASK_BASE" OUT=tmp/<task>/loop-final
   ```

4. 原样保留要求提供的摘要和入口，对本次红项逐条说明已处理或保留理由。存量问题、本次引入、已解决与仍保留分别表达；存活及无覆盖变异保留结果，复跑确认和后续处置分开。缺数据保持未知，不填写零或虚构改善比例。
5. 对清理草稿先交负责人决定，不自动扩大成全仓整改。一般度量越线只报告；硬线失败须修复才能合并，不能用解释代替通过。钩子没有提醒不代表没有红项。
6. 提供脱离本次对话也能审阅的交付说明，并按风险选择独立判断。普通局部修改不默认派完整评审阵容，L2、L3或未交代红项按[接受级别](engineering/quality.md#按成果和风险验证)展开；独立评审不替代有权负责人的接受。

纯文档修订不为凑报告执行产品变异、性能基准或完整模型矩阵。结构、语义、宿主行为、公开消费和真实组合的结论分别表达；设计接受、实现完成、验证通过与发布状态也分别判断。

metrics只报告结构与配置范围内的覆盖；mutation只观察其选择的改动源码行和快层。它们不能替代所有消费者和慢层行为验证。“只报告”指坏指标不新增质量硬线，工具执行错误仍须处理。完整覆盖与退出限制沿[验证入口](verification.md#检查入口)核对。

### 交付与合并前的检查

同一基线下先检查计划，再执行最终候选所需的组合检查：

```sh
make check-plan BASE="$TASK_BASE"
make check BASELINE="$TASK_BASE"
```

两条命令的基线变量不同：`check-plan`用`BASE`，`check`用`BASELINE`。显式传入同一提交可避免它们各自的默认值造成比较范围不同。

`make check`先打印影响面，运行常驻检查，再按计划执行Python、构建、类型检查、成员快慢层及可执行验收，最后执行严格回路状态。它通过时只支持已执行范围；计划中的跳过不算通过。无选中验收时记录显式跳过，不为凑数据运行无关验收。全局变更、未知路径或负责人明确要求可触发全量；`FULL=1`用于显式全量，不是每次交付的默认值。

四条硬线是依赖方向与环、验收锁、主线所需检查绿、启用传感器有数据。严格回路状态核对第一、第二和第四项，第三项由实际所需检查支撑。若手动组合检查，也须完成这些共同硬线，并确保严格传感器所需账本属于同一候选：

```sh
make loop-status STRICT=1 BASE="$TASK_BASE" OUT=tmp/<task>/loop-strict
```

组合检查已经产出同一候选的有效严格报告时可直接引用，不为形式重复执行。临时dirty候选的验收耗时账本目前没有内容指纹，不能仅凭同一HEAD或`-dirty`标记证明最终字节已验收；候选改变后重新执行受影响检查，实际证据绑定沿[工具限制](../tools/ts-checks/README_ZH.md#验收耗时)核对。

开发自查可以面向未提交字节。合并前在最终提交和干净检出上核对影响面并执行所需检查；当前仓库工作流配置不能代替实际CI运行证据，本地通过也不表示远端已通过。合并后不自动补跑全量。提交、推送、合并及发布仍按任务授权执行。

### 交付说明与完成声明

交付说明至少让审阅者确定：本次目标与实际改变、有效承诺与采用范围、被验候选、执行的检查及结果、红项处置、未覆盖与下一责任。适用时附公开消费、组合、模型、profiling或demo入口；准确字段和触发条件沿[贡献报告](../CONTRIBUTING.md#pr-正文与报告)，不另填重复表单。

源码或说明新增保证但还没有行为证据时，明确尚未验证。缺必要环境且影响接受时报告无法验证；可以独立交付的部分说明边界。未完成、部分完成、受阻与完成分开，不把文件存在、结构通过或单个组件成功写成全系统符合。

普通任务按[agent交付操作](engineering/agent-delivery.md)核对启用范围和授权；配置未启用时只形成获准草稿。持续验收的锁与覆盖声明沿[clean-loop入口](clean-loop.md#入口)和[源码布局](workspace.md#目录与内容归属)维护。`make scenario-status`只观察长期产品场景，不从任务关闭、Stage或覆盖声明授予接受。

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
| 形式工具检查失败 | `make formal-tools` 看 Java/JAR 是否就位；缺环境、覆盖缺口与执行失败是三件事 |
| `No projects matched the filters` | 核对 `pnpm-workspace.yaml` 和成员 `package.json` 的实际包名；应用包括 `@omne-harness/cli`、`@omne-harness/tenancy-host` |
| `storage conformance · postgres` 显示 skipped | 未设 `OMNE_TEST_PG_URL`；跳过不是通过（[验证与证据](verification.md)） |
| 不知道如何启动产品 | 先构建，再按 [CLI](../apps.0.0.1.legacy/cli/README.md) 或 [治理中心](../apps.0.0.1.legacy/tenancy-host/README.md) 的命令启动；制品打包不自动安装或发布服务 |

## 通过对话维护交付卡

研发环境初始化后，先读[agent交付操作](engineering/agent-delivery.md)及[配置](engineering/github-delivery.json)的启用范围，再按[工作类型](engineering/work-types.md)选择必要输入和验证。配置未启用时，只做获准的草稿、只读观察或接入准备；不从封存PF或Git历史重新继承任务。平台配置完成不能代替默认分支模板、凭证、具名写者和真实任务验证。

协议启用后的建卡、取任务、更新与决定记录由操作页提供顺序；卡或模板不替代当前SPEC和设计。只读工具的完整输入、输出与限制由实际[ts-checks](../tools/ts-checks/README.md)维护，不能靠一次工具通过自动派发或接受。

## 终态与过程材料

Git维护当前终态；正式RFC保留进入审议的方案与最小决定关系，真实Issue保留本次交付记录，范围见[四类长期成果与普通任务](engineering/documentation.md#四类长期成果与普通任务)。其他开发流水与决策形成史不作为永久正文。领域与成员各自维护完整必要文档；公开类型表达形状，`SPEC.md` 承担必要行为契约，不重复类型。使用说明、机制设计或选择理由按需另文维护，薄 SPEC 不是整个体系的厚度上限。测试、模型及可复跑验证资源随实际拥有者维护；ADR 只说明当前选择、必要理由和复核条件。项目要求与系统技术预期分别归[项目要求](requirements.md)和[架构](architecture/README.md)，产品与独立设计输入保持meta原源。尚未交接的具体旧技术承诺继续原责任，不复制成包内第二份权威。

未进入正式RFC的候选、逐轮讨论和评审、临时计划、进度及某次执行的输入与输出，写在本工作树`tmp/<task>/`。RFC与Issue的规定记录由其拥有者维护，不将全部过程材料提交。不要求永久追溯，不提交这些材料，不通过改名、搬进 research/ADR/fixtures 或建立 Git 历史链接台账继续入库。`.meta_harness/design/record/` 整体被忽略，不是新材料的落点。

单次交付规格组织本次实施与验收，长期规格维护持续有效的承诺。按[两类规格的归属与承接](engineering/documentation.md#单次交付规格与长期规格)选择位置；任务产生的持续保证经接受后须写回长期拥有者，不能只留在临时任务输入中。

长期验证文档写验证义务、操作方法、前提和局限；单次结果留 `tmp/`。确有运行消费者需要的小型夹具随消费者维护，不复制整份开发证据。获准改变承诺后只更新其现行拥有者；接受、实现和验证仍分别判断，删除形成史不会撤销不变式或降低验证要求。

## 保持本页可用

命令、参数或环境事实变化时先核对实际实现，再更新本页并验证相应入口。规范变化先取得对应拥有者的接受，再同步操作指引，不以当前实现便利改低系统目标。

版本和依赖从配置、锁文件及技能来源表读取；工具算法、完整参数、退出语义和检查限制随实际工具及[验证说明](verification.md)维护。本页保留开发顺序、选择与关键前提，不复制完整规则。变动章节或导航时同步必要登记及入向消费者，单次检查结果留任务tmp。

## 多层分支操作

先从[集成规则](engineering/integration.md)核实际采用与任务路线，再按[工具指南](../tools/ts-checks/src/integration/README.md)运行 status、start 和 task-sync。四条主干的进入按[现行准入](engineering/integration.md#现行准入)开 PR 并派发 `gate-publish`，不再在本机运行 prepare、verify 和 publish。未采用建设仍按既有任务工作。工作树根、runner 根和 subject 根有不同职责；检查器使用实际 subject，规则来自 adopted runner。
