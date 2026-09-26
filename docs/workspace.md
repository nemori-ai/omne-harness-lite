# 源码布局与开发 workspace

本页维护 monorepo 的源码归属、包边界与开发环境组织。产品实现以 TypeScript 为主；
Python 当前服务于开发工具。

> 成员与状态以 [packages/README](../packages/README.md)、[apps/README](../apps/README.md) 和各 realization 节点为准。本页维护归属与 workspace 规则，不另存易过期的成员总数。

语言无关的契约不在这里——它们归
[`.meta_harness/design/spec/`](../.meta_harness/design/spec/README.md)；
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
| [docs/](README.md) | **只有项目开发文档**：环境、布局、检查、防御指导 | 产品设计、架构与规格设计、research 一律不进这里 |
| [.meta_harness/](../.meta_harness/README.md) | 可独立迁出的私有设计工作区 | 需求、产品正文、统一语言、规格、决定、研究与 agent 能力的**唯一**源 |
| 根 `.agents/`、`.claude/`、`.codex/` | 指向 `.meta_harness/` 内同名目录的相对软链接 | 只暴露生成产物；源与检查归工作区 |

按用途和所有权选择顶层位置，再按实际依赖选择语言与构建工具。独立包不等于
独立发布、独立进程或独立微服务，也不要求每个 Cordis 插件单独成包。

产品包采用 `packages/<能力族>/<职责包>/` 两层：**第一层只组织相关能力，不是 workspace 成员**；
第二层才拥有 `package.json`、`src`、依赖、公开入口和测试。
能力定义、具体提供者、消费扩展在具有独立职责和变化边界时分包；消费者依赖能力定义及契约，
装配负责选择提供者。不机械地为每个插件或每种角色创建包。

同源、同批 fork、共同构建或实验阶段**都不是**聚合不相关职责的理由。
共享类型和有身份的运行时原语保持唯一拥有者，其他包通过公开入口复用。

> **只为已经有接受规格、且确实要写代码的职责建成员。**每个包对应一个
> [realization 节点](../.meta_harness/design/realization/README.md)，节点先于包；
> 第一层组名（`core`、`infra`、`tenancy`、`frontend`）随节点布局。

## 当前可执行代码

```text
package.json / pnpm-workspace.yaml     TypeScript workspace、版本 catalog 与根聚合命令
pnpm-lock.yaml                         TypeScript 依赖统一锁文件
tsconfig.base.json                     全体 TS 成员共用的编译选项（NodeNext、strict、.ts 后缀导入）
packages/core/{identity-values,offer-expiry,kernel-basis,storage}
                                       契约纯模块、Cordis 共用件与 probe、存储协议与一致性套件
packages/infra/{storage-sql,clock}     存储与时钟提供者（sqlite/pg、租约时钟）
packages/tenancy/{credential-verification,account-identity,organization-governance,account-registration}
                                       四个 tenancy 插件的服务面类型与场景清单（实现在第二程）
packages/frontend/governance-center-client
packages/frontend/client-local-state
packages/frontend/governance-client-operations
                                       治理协议运输、本地完整状态与共享治理用例
apps/cli/                             治理CLI应用；文件输入增量
tools/artifact-builder/                TS 开发成员；应用归档文件校验与独占发布
tools/ts-checks/                       TS 开发成员；产品源码结构检查规则与 CLI
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
未来 CI 平台配置负责触发条件、执行环境和调用这些入口；构建、发布、部署脚本
有实际交付对象后再增加，**不能因目录存在就声称流水线或部署能力已经完成**。

## Workspace 与依赖

根 Python 项目名为 `omne-harness-lite`，不构建或安装根包；运行依赖为空。
开发组引用本地 `omne-harness-lite-spec-tools`、跨包测试所用 pytest，以及 skill
生成器所需 PyYAML。工具包自行声明 jsonschema、Markdown/YAML 解析与构建依赖。
`tool.uv.workspace.members` 指向 `tools/spec-tools`，`workspace = true` 绑定本地成员。

TS workspace 由 pnpm 管理，[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) 声明
`packages/*/*`、`apps/*`、`tools/ts-checks` 与 `tools/artifact-builder`，并用 `catalog` 把第三方依赖的版本钉一次
（成员写 `catalog:`）。每个成员自带 `build`／`typecheck`／`test` 脚本，根命令用 `pnpm -r` 聚合；
测试运行器是 vitest（`*.spec.ts` 运行时、`*.spec-d.ts` 类型测试）。
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
