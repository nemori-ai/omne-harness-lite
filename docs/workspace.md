# 源码布局与开发 workspace

本页维护 monorepo 的源码归属、包边界与开发环境组织。产品实现以 TypeScript 为主；
Python 当前服务于开发工具。

> 目标分组与包边界见[产品包组织](package-organization.md)，新骨架见[packages/README](../packages/README.md)、[apps/README](../apps/README.md)，旧成员查[legacy包](../packages.0.0.1.legacy/README.md)及[legacy应用](../apps.0.0.1.legacy/README.md)。领域责任从[领域入口](domains/README.md)定位，未迁契约仍从[原维护入口](../.meta_harness/design/architecture/README.md)定位。本页维护顶层归属与workspace操作规则，不另存成员总数或第二份目标包树。

项目要求与已接受技术架构从[docs入口](README.md)定位；产品、统一语言及持续研究保持meta源。公开类型、行为契约、必要理由和验证资源随成员拥有者维护。
目录和包的划分不直接决定插件、服务或部署边界。

## 目录与内容归属

| 位置 | 职责 | 放置判断 |
|---|---|---|
| [packages/](../packages/README.md) | 产品的可复用包，以 TS 为主 | 有明确职责、依赖和对外入口；消费者通过包入口使用 |
| [apps/](../apps/README.md) | 可启动的产品应用与装配入口 | 组合包、加载配置、启动宿主；可复用行为回到所属包 |
| [tools/](../tools/README.md) | 开发、验证和维护工具 | 工具也可拥有独立包、CLI、资源和测试；以 TS 编写也归此处 |
| [scripts/](../scripts/README.md) | 仓库级开发与 CI/CD 自动化 | 串联现有工具、准备构建输入、整理产物；复杂检查逻辑归工具包 |
| 各包或应用内的 `src/` | 该成员的实现源码 | TS、Python 都可采用；源码跟随所属包，不汇入根 `src/` |
| 各成员的 `tests/` | 该成员的验证 | 测试夹具就近维护；共享测试工具按实际消费边界提取 |
| 各成员的 `acceptance/` | 产品验收场景的可执行验收 | 放在承载那些场景用户入口的成员里；见下面「可执行验收」 |
| [docs/](README.md) | 项目要求、工程、技术架构、领域关系及任务文档 | 各层拥有自己的正文，精确成员承诺随实际拥有者 |
| [.meta_harness/](../.meta_harness/README.md) | 可独立迁出的私有设计工作区 | 产品、独立目标、统一语言、领域对象、持续研究及agent方法；未迁源保持原责任 |
| 根 `.agents/`、`.claude/`、`.codex/` | 指向 `.meta_harness/` 内同名目录的相对软链接 | 只暴露生成产物；源与检查归工作区 |

按用途和所有权选择顶层位置，再按实际依赖选择语言与构建工具。独立包不等于
独立发布、独立进程或独立微服务，也不要求每个 Cordis 插件单独成包。

产品包采用 `packages/<能力组>/<成员>/` 两层。第一层按相关知识组织维护位置，不是workspace成员；它拥有包群工程关系及维护文档。第二层拥有package.json、src、依赖、公开入口和验证，以及完整的使用、契约、设计和维护文档。两层文档要求归[成员文档规范](member-documentation.md)。目标组、包边界与新增路径由[产品包组织](package-organization.md)维护。

能力的契约、实现、专属提供者、集成与验证就近维护，Service定义随契约的唯一拥有者；不再要求全部集中core。业务消费依赖公开契约，装配选择提供者，包根保持独立使用入口。Cordis形状及绑定规则仍由[集成约定](architecture/cordis-integration-conventions.md)拥有，目录治理不能扩大生命周期或同提交例外。

公共Harness SDK、共同系统契约与服务端接入组织在access组，三者的职责和安装依赖分别核对。目标目录尚未全部实现，当前模板和静态检查的旧路径限制见[工具适配范围](package-organization.md#现有成员与工具适配)。

**可执行验收**放在成员的 `acceptance/` 目录，与 `tests/` 分开，因为两者的主人不同：

- **它持续验证产品场景。**任务结束后仍须维护相应场景，文件名与内容不绑定任务身份。文件名是 `<完整 PD 身份>.<一句话>.acceptance.ts`
  （如 `PD-cli.no-screen-points-to-machine-entry.acceptance.ts`），内容从用户入口驱动真实组合。
- **每份验收在开头的注释里声明它覆盖哪些场景**，恰好一行：`// covers: PD-cli S5`，多条用逗号隔开（`// covers: PD-cli S5, PD-cli S6`）。
  身份采用产品 README 的 `PD-<slug>`，slug 以小写字母开头，后续为小写字母或数字，可用单个连字符分段。旧 PF 编号不作为别名。
  声明的场景必须在那个 topic 的 `acceptance.md` 里存在——场景含义变了会换新编号，覆盖旧编号的验收于是被点名，要跟着改或删。
  **覆盖声明只表示有验收程序声称覆盖该场景**，实际运行、结果及负责人接受分别核对，不由声明推定交付。
- **数量跟着场景走，不跟着卡走。**新卡加强一条已有验收覆盖的流程时，改那份验收、把新场景加进它的声明；不为每张卡新建一份。
- **长期留下的只有场景本身要成立的断言。**只在一张卡交付那一刻有意义的断言（如「与做这张卡之前一字不差」的快照比对）
  写的时候就标出来，卡接受时由拥有者删掉——留着它，以后任何一次正当的改动都会在这里变红。
- **实现重构不动它**——它不导入内部模块。入口搬到别的成员，它跟着搬，由拥有者搬。
- **写权归负责的人、主会话与独立验收角色。**实施的 agent 只运行它，不改它；验收写得不对、跑不通，报回来由拥有者改。
  这一条由[验收锁](../tools/repo-toolchain/README_ZH.md#验收锁)核对：它列出任务基线以来碰过验收文件的提交，实施角色的提交在其中就判锁被破。
- **不在成员的 `test` 脚本范围内**（那里只收 `tests/**/*.spec.ts`）；成员有了第一份验收时另给一个 `acceptance` 脚本和 `vitest.acceptance.config.ts` 单独跑它。包模板生成的 `acceptance/README.md`、`index.md` 与 `acceptance/fixtures/` 的入口只是占位，不是验收：它们不要求配置，仍带文档占位标记时也不计入验收锁。

同源、同批 fork、共同构建或实验阶段**都不是**聚合不相关职责的理由。
共享类型和有身份的运行时原语保持唯一拥有者，其他包通过公开入口复用。

> **只为承诺和职责已明确、且确实要写代码的责任建成员。**新单元按[架构维护规则](../.meta_harness/design/architecture/README.md)就近维护类型与完整行为承诺；
> 不为尚未实现的承诺建空成员；
> 新组按稳定责任及维护任务成立，不能从原节点布局或现有包名反推目标。使用模板前核对其实际支持范围。

## 目标骨架与封存实现

新packages与apps只提供文档入口和缺项登记，没有真实产品成员或可启动应用。最小 CLI 的依赖方向见[包组织](package-organization.md#最小-cli-的接入边界)。旧产品正文、应用及包分别保持在product.0.0.1.legacy、apps.0.0.1.legacy和packages.0.0.1.legacy；后缀不是发布版本。这些目录留在仓库里供核对。活动工具及其测试不能读取其中的源码或产物。规则测试使用工具自己拥有的最小夹具；隔离运行与历史链接检查分开，见[检查器运行说明](../tools/product-checks/README.md#independence-from-archived-implementations)。它们不是 pnpm workspace 成员，工具不再声明它们的包名。旧源不授予架构采用。

新包区按目标能力组维护工程关系，已具名目标成员维护长期 SPEC 与内部设计。尚未具名的行为规格承接继续计缺项。新产品区的[正式正文](../.meta_harness/design/product/README.md)包含需求、能力及实现状态、阶段承诺和未决四块。文档落位不建立可执行成员，也不授予设计或实现接受；常规新增成员的公开承诺与模板准入要求保持。

## 现存实现与工具位置

下面列的是封存实现及现存开发工具的位置。封存目录不在 pnpm workspace 里，不能算作新树的支持能力。静态遍历及默认检查、测试和验收目标排除任意层级中以`.legacy`结尾的目录。`make check`的按影响面和全量计划均遵守此规则。完整旧产品构建不属于新骨架验收。

```text
package.json / pnpm-workspace.yaml     TypeScript workspace、版本 catalog 与根聚合命令
pnpm-lock.yaml                         TypeScript 依赖统一锁文件
tsconfig.base.json                     全体 TS 成员共用的编译选项（NodeNext、strict、.ts 后缀导入）
packages.0.0.1.legacy/core/{identity-values,offer-expiry,kernel-basis,storage}
                                       契约纯模块、Cordis 共用件与 probe、存储协议与一致性套件
packages.0.0.1.legacy/infra/{storage-sql,clock}     存储与时钟提供者（sqlite/pg、租约时钟）
packages.0.0.1.legacy/tenancy/{credential-verification,account-identity,organization-governance-sql,account-registration}
                                       tenancy 插件与公开服务实现；完整成员从 packages.0.0.1.legacy/README 查找
packages.0.0.1.legacy/frontend/governance-center-client-https
packages.0.0.1.legacy/frontend/client-local-state-sqlite
packages.0.0.1.legacy/frontend/governance-client-operations-local
                                       治理协议运输、本地完整状态与共享治理用例
apps.0.0.1.legacy/cli/                             治理CLI应用；文件输入增量
tools/artifact-builder/                TS 开发成员；应用归档文件校验与独占发布
tools/repo-toolchain/                  TS 开发成员；检查器包，发布到 npm
tools/product-checks/                  TS 开发成员；本仓库的产品规则与 lint:rules，不发布
tools/dev-flow/                        TS 开发成员；开工准入、任务绑定与包模板，不发布
tools/test-runner/                     TS 开发成员；影响面计划、成员测试与变异，不发布
tools/repo-config/                     配置成员；共享的 tsconfig、oxlint 与 dependency-cruiser 预设
pyproject.toml                         Python 开发环境聚合，package = false
uv.lock                                Python workspace 统一锁文件
tools/spec-tools/                      Python 开发成员；跨仓库 Markdown 导航与工具环境检查
  pyproject.toml                       包元数据、依赖、构建与 CLI
  src/omne_harness_lite_spec_tools/    可安装模块及检查器格式
  tests/                               工具包测试
scripts/check.sh                       本地和 CI 共用的检查编排
scripts/format.sh                      TS/JS 格式化与暂存区检查
.meta_harness/tooling/                 设计链检查、skills/roles 编译与根链接工具
  src/ tests/
.meta_harness/agents/skills/design-subagents/canonical/scripts/
                                       技能自带的生成器及离线测试源
.agents / .claude / .codex             指向工作区内生成目录的相对软链接
```

根 Makefile 提供短命令，`scripts/check.sh` 顺序组合现有检查，工具包拥有检查算法。
CI 配置（`.github/workflows/`）只负责触发条件、执行环境和调用这些入口，
见[自动化入口](../scripts/README.md#ci)；构建、发布、部署脚本
有实际交付对象后再增加，**不能因目录存在就声称流水线或部署能力已经完成**。

## Workspace 与依赖

根 Python 项目名为 `omne-harness-lite`，不构建或安装根包；运行依赖为空。
开发组引用本地 `omne-harness-lite-spec-tools`、跨包测试所用 pytest，以及 skill
生成器所需 PyYAML。工具包自行声明 jsonschema、Markdown/YAML 解析与构建依赖。
`tool.uv.workspace.members` 指向 `tools/spec-tools`，`workspace = true` 绑定本地成员。

TS workspace 由 pnpm 管理，成员范围由[`pnpm-workspace.yaml`](../pnpm-workspace.yaml)声明，
并用 `catalog` 把第三方依赖以及仓库检查器与预设的版本钉一次
（成员写 `catalog:`）。每个成员自带 `build`／`typecheck`／`test` 脚本；根命令的构建与类型检查用 `pnpm -r` 聚合，
测试由 [tools/test-runner 的测试运行入口](../tools/test-runner/README_ZH.md#测试运行)逐成员调用各自的 `test` 脚本
（成员清单仍读 `pnpm-workspace.yaml`）。测试框架是 vitest（`*.spec.ts` 运行时、`*.spec-d.ts` 类型测试）。
Node 与 pnpm 的精确版本由根 `package.json` 的
`engines` 和 `packageManager` 声明，**以那里为准**；uv 管理的 Python 环境与之独立并存。

产品运行时与构建路线由[技术基础](architecture/technical-foundations.md#共同技术选择)维护。产品开发和部署环境须支持Node24；现有开发工具的engines及packageManager仍以根声明为准。TS7/NodeNext/strict、库ESM与声明、应用bundle各自验证真实消费者，bundle不代替类型检查。新增依赖在具名实施任务同步成员声明、catalog及锁，本次文档采用不直接修改它们。

不把工具加入产品运行依赖；新增成员须符合叶子布局，**新增其他类别时显式更新 workspace 范围**。

仓库工具链分为四个成员：

- `tools/repo-toolchain` 是检查器包 `@omne-harness/repo-toolchain`，发布到 npm。它只依赖 npm 包，不依赖其他工具成员。
- `tools/product-checks`、`tools/dev-flow` 和 `tools/test-runner` 不发布。它们只经 `@omne-harness/repo-toolchain` 的子路径导入它，不互相导入。
- 根目录和这三个成员都用 catalog 钉住的 npm 版本，不链接到工作区的 `tools/repo-toolchain`。版本与升级流程见[开发指南](development.md#仓库工具链的版本)。
- 工具链的仓库专用配置在仓库根的 `repo-toolchain.config.json`。

这些方向由 dependency-cruiser 预设的 `toolchain-*` 规则检查，包内分层见 [repo-toolchain 的说明](../tools/repo-toolchain/README_ZH.md#包内分层)。改动这四个成员或这份配置的 PR 经仓库工具链变更闸门确认，见[现行准入](engineering/integration.md#现行准入)。

uv 的 [workspace 文档](https://docs.astral.sh/uv/concepts/projects/workspaces/)说明成员、
统一锁定与 `--package`；[配置文档](https://docs.astral.sh/uv/concepts/projects/config/#project-packaging)
说明 `package = false`。

## 使用与维护

首次准备检出与常见问题见[开发指南](development.md)，交付要求见
[贡献指南](../CONTRIBUTING.md)。本节拥有成员依赖、跨包访问和产物位置的规则。

在根执行 `uv sync --locked` 与 `pnpm install --frozen-lockfile --ignore-scripts`
安装两套开发环境；`make check` 运行当前完整检查组合。
单项检查与覆盖解释见[验证与证据](verification.md)，工具包使用和构建见
[spec-tools](../tools/spec-tools/README.md)，自动化入口见 [scripts](../scripts/README.md)。
CLI 从当前工作目录定位受检仓库；从外部目录执行时用 `--root` 明确目标。

修改依赖先改成员声明，再更新统一锁文件；同处 workspace 不产生隐式跨包依赖。
调用其他包时使用其公开入口，**避免通过兄弟目录的 `src/` 路径绕过包边界**。
构建产物和临时结果放在 Git 忽略的 `.dist/`、`build/`、`dist/`、`tmp/` 等约定位置。
