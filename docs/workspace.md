# 源码布局与开发 workspace

本页维护 monorepo 的源码归属、包边界与开发环境组织。产品实现以 TypeScript 为主；
Python 当前服务于开发工具。

> 成员入口见 [packages/README](../packages/README.md)、[apps/README](../apps/README.md)；承诺和证据沿[架构维护入口](../.meta_harness/design/architecture/README.md)查找，未迁单元仍查旧节点。本页维护归属与 workspace 规则，不另存易过期的成员总数。

系统级要求与架构预期归 `.meta_harness/`；公开类型、薄 SPEC、必要 ADR 和验证资源随成员拥有者维护。
未迁规格仍归[旧 spec 区](../.meta_harness/design/spec/README.md)；
目录和包的划分不直接决定插件、服务或部署边界。

## 目录与内容归属

| 位置 | 职责 | 放置判断 |
|---|---|---|
| [packages/](../packages/README.md) | 产品的可复用包，以 TS 为主 | 有明确职责、依赖和对外入口；消费者通过包入口使用 |
| [apps/](../apps/README.md) | 可启动的产品应用与装配入口 | 组合包、加载配置、启动宿主；可复用行为回到所属包 |
| [examples/](../examples/README_ZH.md) | 可运行的开发示例 | 使用已接受的包公开面演示有限的闭环；不作为正式产品应用或新的设计权威 |
| [tools/](../tools/README.md) | 开发、验证和维护工具 | 工具也可拥有独立包、CLI、资源和测试；以 TS 编写也归此处 |
| [scripts/](../scripts/README.md) | 仓库级开发与 CI/CD 自动化 | 串联现有工具、准备构建输入、整理产物；复杂检查逻辑归工具包 |
| 各包或应用内的 `src/` | 该成员的实现源码 | TS、Python 都可采用；源码跟随所属包，不汇入根 `src/` |
| 各成员的 `tests/` | 该成员的验证 | 测试夹具就近维护；共享测试工具按实际消费边界提取 |
| 各成员的 `acceptance/` | 产品验收场景的可执行验收 | 放在承载那些场景用户入口的成员里；见下面「可执行验收」 |
| [docs/](README.md) | 项目开发文档：环境、布局、检查、防御指导；另接入 `blogs/` 子模块 | 设计与 research 的权威正文归 `.meta_harness/` |
| `docs/blogs/` | 个人技术博客的独立 Git 子模块 | 工程复盘与开发者技术专题；内容和历史由个人博客仓库维护 |
| [.meta_harness/](../.meta_harness/README.md) | 可独立迁出的私有设计工作区 | 需求、产品、统一语言、全局架构预期、决定、研究与 agent 能力的唯一源；未迁规格仍在其中 |
| 根 `.agents/`、`.claude/`、`.codex/` | 指向 `.meta_harness/` 内同名目录的相对软链接 | 只暴露生成产物；源与检查归工作区 |

按用途和所有权选择顶层位置，再按实际依赖选择语言与构建工具。独立包不等于
独立发布、独立进程或独立微服务，也不要求每个 Cordis 插件单独成包。

`docs/blogs/` 接入 [PanQiWei/omne-harness-blogs](https://github.com/PanQiWei/omne-harness-blogs)，
用于面向读者的工程复盘与技术传播。博客可据设计、实现和实验材料撰写，
不承担设计接受、契约定义或研究证据归档的权威职责；这些正文仍归 `.meta_harness/`。
博客仓库独立管理可见性和访问权限，父仓库只保存 `.gitmodules` 配置和采用的 commit。
它不属于产品 workspace 或构建依赖；初始化与更新方法见[开发指南](development.md#博客子模块)。

产品包采用 `packages/<能力族>/<职责包>/` 两层：**第一层只组织相关能力，不是 workspace 成员**；
第二层才拥有 `package.json`、`src`、依赖、公开入口和测试。
能力的 Cordis 服务定义一律放 `packages/core/`，具体提供者放所属领域或 `infra/`；消费者依赖服务定义及契约、不依赖提供者，
装配负责选择提供者。每个包的根入口与 Cordis 无关，Cordis 绑定放同包的 `./cordis` 入口。
这些规则与其余集成规矩的权威在 [Cordis 集成约定](../.meta_harness/design/realization/cordis-integration-conventions.md)。
不机械地为每个插件创建包。

**可执行验收**放在成员的 `acceptance/` 目录，与 `tests/` 分开，因为两者的主人不同：

- **它认的是验收场景，不是故事卡。**[故事卡](../.meta_harness/design/product/conventions.md#卡的一生)接受之后就从产品区删掉，
  验收却要一直守着那几条场景，所以文件名与内容都不带卡号。文件名是 `<topic 编号>.<一句话>.acceptance.ts`
  （如 `PF-016.no-screen-points-to-machine-entry.acceptance.ts`），内容从用户入口驱动真实组合。
- **每份验收在开头的注释里声明它覆盖哪些场景**，恰好一行：`// covers: PF-016 S5`，多条用逗号隔开（`// covers: PF-016 S5, PF-016 S6`）。
  声明的场景必须在那个 topic 的 `acceptance.md` 里存在——场景含义变了会换新编号，覆盖旧编号的验收于是被点名，要跟着改或删。
  **一条场景交付了没有，就看有没有验收声明覆盖它**，不另外手写。
- **数量跟着场景走，不跟着卡走。**新卡加强一条已有验收覆盖的流程时，改那份验收、把新场景加进它的声明；不为每张卡新建一份。
- **长期留下的只有场景本身要成立的断言。**只在一张卡交付那一刻有意义的断言（如「与做这张卡之前一字不差」的快照比对）
  写的时候就标出来，卡接受时由拥有者删掉——留着它，以后任何一次正当的改动都会在这里变红。
- **实现重构不动它**——它不导入内部模块。入口搬到别的成员，它跟着搬，由拥有者搬。
- **写权归负责的人、主会话与独立验收角色。**实施的 agent 只运行它，不改它；验收写得不对、跑不通，报回来由拥有者改。
  这一条由[验收锁](../tools/ts-checks/README_ZH.md#验收锁)核对：它列出任务基线以来碰过验收文件的提交，实施角色的提交在其中就判锁被破。
- **不在成员的 `test` 脚本范围内**（那里只收 `tests/**/*.spec.ts`）；成员有了第一份验收时另给一个 `acceptance` 脚本单独跑它。

同源、同批 fork、共同构建或实验阶段**都不是**聚合不相关职责的理由。
共享类型和有身份的运行时原语保持唯一拥有者，其他包通过公开入口复用。

> **只为承诺和职责已明确、且确实要写代码的责任建成员。**新单元按[架构维护规则](../.meta_harness/design/architecture/README.md)就近维护类型与薄规格；
> 未迁单元继续采用精确 spec/realization，不要求新建空节点；
> 第一层组名（`core`、`infra`、`tenancy`、`frontend`）随节点布局。

## 当前可执行代码

```text
package.json / pnpm-workspace.yaml     TypeScript workspace、版本 catalog 与根聚合命令
pnpm-lock.yaml                         TypeScript 依赖统一锁文件
tsconfig.base.json                     全体 TS 成员共用的编译选项（NodeNext、strict、.ts 后缀导入）
packages/core/{identity-values,offer-expiry,kernel-basis,storage}
                                       契约纯模块、Cordis 共用件与 probe、存储协议与一致性套件
packages/infra/{storage-sql,clock}     存储与时钟提供者（sqlite/pg、租约时钟）
packages/tenancy/{credential-verification,account-identity,organization-governance-sql,account-registration}
                                       tenancy 插件与公开服务实现；完整成员从 packages/README 查找
packages/frontend/governance-center-client
packages/frontend/client-local-state
packages/frontend/governance-client-operations
                                       治理协议运输、本地完整状态与共享治理用例
apps/cli/                             治理CLI应用；文件输入增量
examples/model-invocation-minimal-demo/ 真实模型调用、持久多轮交互示例
tools/artifact-builder/                TS 开发成员；应用归档文件校验与独占发布
tools/ts-checks/                       TS 开发成员；产品源码结构检查规则与 CLI
tools/core-verification/               TS 开发成员；core 真实组合与验证套件有效性自测
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

TS workspace 由 pnpm 管理，[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) 声明
`packages/*/*`、`apps/*`、`examples/*`、`tools/ts-checks`、`tools/artifact-builder` 与 `tools/core-verification`，并用 `catalog` 把第三方依赖的版本钉一次
（成员写 `catalog:`）。每个成员自带 `build`／`typecheck`／`test` 脚本；根命令的构建与类型检查用 `pnpm -r` 聚合，
测试由 [tools/ts-checks 的测试运行入口](../tools/ts-checks/README_ZH.md#测试运行)逐成员调用各自的 `test` 脚本
（成员清单仍读 `pnpm-workspace.yaml`）。测试框架是 vitest（`*.spec.ts` 运行时、`*.spec-d.ts` 类型测试）。
Node 与 pnpm 的精确版本由根 `package.json` 的
`engines` 和 `packageManager` 声明，**以那里为准**；uv 管理的 Python 环境与之独立并存。

不把工具加入产品运行依赖；新增成员须符合叶子布局，**新增其他类别时显式更新 workspace 范围**。

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
