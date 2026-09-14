# 源码布局与开发 workspace

本页维护 monorepo 的源码归属、包边界与开发环境组织，落实用户明确的目录分工。
产品实现以 TypeScript 为主；Python 当前服务于开发工具。语言无关的契约仍归
`spec/`，目录和包的划分不直接决定插件、服务或部署边界。

## 目录与内容归属

| 位置 | 职责 | 放置判断 |
|---|---|---|
| [packages/](../../packages/README.md) | 产品的可复用包，以 TS 为主 | 有明确职责、依赖和对外入口；消费者通过包入口使用 |
| [apps/](../../apps/README.md) | 可启动的产品应用与装配入口 | 组合包、加载配置、启动宿主；可复用行为回到所属包 |
| [tools/](../../tools/README.md) | 开发、验证和维护工具 | 工具也可拥有独立包、CLI、资源和测试；以 TS 编写也归此处 |
| [scripts/](../../scripts/README.md) | 仓库级开发与 CI/CD 自动化 | 串联现有工具、准备构建输入、整理产物；复杂检查逻辑归工具包 |
| 各包或应用内的 `src/` | 该成员的实现源码 | TS、Python 都可采用；源码跟随所属包，不汇入根 `src/` |
| 各成员的 `tests/` | 该成员的验证 | 测试夹具就近维护；共享测试工具按实际消费边界提取 |
| `.agents/skills/` 与 `.claude/skills/` | 自包含的 agent 技能 | 技能自己的脚本、模板和测试随技能维护，双端保持一致 |
| `.agents/roles/` | 本项目 subagent 的共享源定义 | 生成到 `.codex/agents/`、`.claude/agents/`，不手改生成物 |
| `docs/` 与 `spec/` | 设计知识与语言无关契约 | 检查器实现引用这些材料，不在产品包或工具包里复制政策 |

按用途和所有权选择顶层位置，再按实际依赖选择语言与构建工具。独立包不等于
独立发布、独立进程或独立微服务，也不要求每个 Cordis 插件单独成包。
只为已明确的实现职责创建成员；当前 agent 成员提供实验来源基线，`apps/` 尚无产品应用；不预置未设计的模块。

成员的当前实现设计及包/应用之间的装配正文按
[设计归属](organization.md#当前实现设计的归属)随成员维护；设计文件不自动新增
workspace 成员，源码类型和公开接口也不取代语言无关的 spec。

## 当前可执行代码

```text
package.json / pnpm-workspace.yaml     TypeScript workspace 与根聚合命令
pnpm-lock.yaml                        TypeScript 依赖统一锁文件
packages/agent/                       自有 agent fork，拥有 src/tests/构建配置
pyproject.toml                         Python 开发环境聚合，package = false
uv.lock                                Python workspace 统一锁文件
tools/spec-tools/
  pyproject.toml                       包元数据、依赖、构建与 CLI
  src/omne_harness_lite_spec_tools/     可安装模块及检查器格式
  tests/                              工具包测试
scripts/check.sh                      本地和 CI 共用的检查编排
.agents/skills/design-subagents/
  scripts/                            技能的生成器及离线测试
.claude/skills/design-subagents/
  scripts/                            对应技能的同内容镜像
```

根 Makefile 提供短命令，`scripts/check.sh` 顺序组合现有检查，工具包拥有检查算法。
未来 CI 平台配置负责触发条件、执行环境和调用这些入口；构建、发布、部署脚本
有实际交付对象后再增加，不能因目录存在就声称流水线或部署能力已经完成。

## Workspace 与依赖

根 Python 项目名为 `omne-harness-lite`，不构建或安装根包；运行依赖为空。
开发组引用本地 `omne-harness-lite-spec-tools`、跨包测试所用 pytest，以及 skill
生成器所需 PyYAML。工具包自行声明 jsonschema、Markdown/YAML 解析与构建依赖。
`tool.uv.workspace.members` 指向 `tools/spec-tools`，`workspace = true` 绑定本地成员。

根 Python 配置只组合开发环境。TS workspace 由 pnpm 管理，当前显式包含
`packages/agent`；成员自行声明依赖与构建，根 package.json 聚合命令，pnpm-lock.yaml
固定依赖树。采用 Node.js 24 与 packageManager 指定的 pnpm，和 uv 独立并存。
不把所有工具加入产品运行依赖；新增成员时显式更新 workspace 范围。

参考了 `omne-next` 各成员独立声明 pyproject 的做法；
[DSH workspace](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/pnpm-workspace.yaml)
展示包、应用和其他目录可分别成为成员，而非统一塞入根源码目录。
uv 的[workspace 文档](https://docs.astral.sh/uv/concepts/projects/workspaces/)说明成员、
统一锁定与 `--package`；[配置文档](https://docs.astral.sh/uv/concepts/projects/config/#project-packaging)
说明 `package = false`。这些是组织机制的参考，不直接移植上游的包分组或部署方式。

## 使用与维护

首次准备检出与常见问题见[开发指南](../development.md)，交付要求见
[贡献指南](../../CONTRIBUTING.md)。本节拥有成员依赖、跨包访问和产物位置的规则。

在根执行 `uv sync --locked` 与 `pnpm install --frozen-lockfile --ignore-scripts`
安装两套开发环境；`make check` 运行当前完整检查组合。
单项检查与覆盖解释见[验证规范](verification.md)，工具包使用和构建见
[spec-tools](../../tools/spec-tools/README.md)，自动化入口见 [scripts](../../scripts/README.md)。
CLI 从当前工作目录定位受检仓库；从外部目录执行时用 `--root` 明确目标。
wheel 包含检查器格式，评估政策仍从目标仓库读取，不携带另一份隐藏政策。

修改依赖先改成员声明，再更新统一锁文件；同处 workspace 不产生隐式跨包依赖。
调用其他包时使用其公开入口，避免通过兄弟目录的 `src/` 路径绕过包边界。
构建产物和临时结果放在 Git 忽略的 `.dist/`、`build/`、`dist/`、`tmp/` 等约定位置，
不混入规范工件。历史迁移记录中的 `spec/tools/` 保留当时含义；当前路径以本页
和各层索引为准，不保留旧脚本路径的兼容包装。
