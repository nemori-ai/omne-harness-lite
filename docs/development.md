# 开发指南

本页帮助开发者和 coding agents 从当前检出开始工作。贡献范围与交付要求见
[CONTRIBUTING.md](../CONTRIBUTING.md)，架构设计方法见[架构指南](architecture-guide/README.md)。
源码归属、验证含义和治理规则由各自的维护文档拥有，本页负责上手顺序和按问题导航。

## 目录

- [准备可用的检出](#准备可用的检出)
- [定位修改位置](#定位修改位置)
- [修改与验证](#修改与验证)
- [使用 coding agents](#使用-coding-agents)
- [常见问题](#常见问题)
- [保持指南可用](#保持指南可用)

## 准备可用的检出

产品以 TypeScript 为主；当前可运行 Python 开发工具、形式验证及
[agent 来源基线](../packages/agent/README.md)的构建/测试。尚无完整智能体应用或产品启动命令。

在实际工作的仓库根确认位置和已有改动；隔离规则见
[worktree-discipline](../.agents/skills/worktree-discipline/SKILL.md)：

```sh
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

当前完整检查需要 Git、Bash、Make、Node.js 24、npm、根 package.json 所指定的 pnpm，
以及 [uv](https://docs.astral.sh/uv/getting-started/installation/)。
Python 范围由 [pyproject.toml](../pyproject.toml) 声明，uv 管理解释器与虚拟环境；
不要依赖系统 `python` 命令恰好存在。进入目标检出后执行：

```sh
uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
make check
```

前两条依据锁文件安装开发环境；第三条执行文档、规格、工具测试与产品包检查组合，
不调用真实模型。已有环境时，日常修改按受影响范围选择检查即可。
正式行为模型的覆盖与 Java/JAR 环境分开报告；详细要求见
[验证规范](maintenance/verification.md#环境与实际执行)。

## 定位修改位置

| 要修改的内容 | 入口 |
|---|---|
| 产品实现包、应用装配 | [packages/](../packages/README.md)、[apps/](../apps/README.md)；先确定实际成员职责 |
| 文档、规格与评估证据检查器 | [tools/spec-tools/](../tools/spec-tools/README.md)，在成员 `src/` 和 `tests/` 中工作 |
| 本地与 CI 共用的自动化调用 | [scripts/](../scripts/README.md)，复杂检查行为回到工具包 |
| 研究、提案、决定或正式规格 | [文档地图](README.md)、[spec/](../spec/README.md)，核对接受状态和精确版本 |
| Skill 或专用 subagent | [下方 agent 指引](#使用-coding-agents) |

各目录局部 AGENTS.md 补充其工作边界，完整布局由
[workspace 规范](maintenance/workspace.md)维护。包内实现、依赖、构建和测试随成员维护；
跨包使用公开入口。根 Python workspace 只管理开发环境，与 pnpm 管理的 TS 工具链并存。

## 修改与验证

先找到内容或行为的所有者，在任务范围内修改，再根据变化选择验证：

| 变化或目的 | 检查入口 |
|---|---|
| 本地文档链接、导航与 skill 镜像 | `make docs-check` |
| 契约登记、Schema 或形式任务 | `make spec-check` |
| 检查器或 skill 生成器行为 | `make test`，或按下方说明运行相关测试 |
| agent、dsh-baseline 包或 TS workspace | `make product-check`；构建、严格类型检查、来源/组合案例与独立产物消费，详见包 README |
| 当前检查组合、跨入口改动 | `make check` |
| 形式工具是否可用 | `make spec-tools` |

这张表是使用导航；准确目标由 [Makefile](../Makefile) 和
[scripts/check.sh](../scripts/check.sh) 维护，覆盖与退出含义归[验证规范](maintenance/verification.md)。
涉及已发布规范或冻结表的变更，使用 `make docs-check BASELINE=<git-ref>` 或
`make check BASELINE=<git-ref>`，基线选变更前可解析的提交，不能用修改后的哈希自证一致。

对检查器做局部迭代时，可从仓库根运行一组测试：

```sh
PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest tools/spec-tools/tests/test_documentation_checks.py
```

其他用法以所属测试与工具帮助为准。检查器 CLI 默认定位当前受检仓库；需要检查
另一个检出时传 `--root PATH`。独立成员运行、构建 wheel/sdist 的命令由
[工具包 README](../tools/spec-tools/README.md#使用与开发)维护。

保留失败的实际输出与影响判断，修正后运行受影响检查。交付时说明检查针对哪个
源码状态、配置和范围；已有证据仍覆盖同一状态时可引用，变化使其失效时补跑。
临时日志放在 `tmp/`，测试组合使用 `tmp/test-runs/`；清理或移除工作树前保留任务
需要的证据。临时目录不承担长期证据归档，长期材料按[组织规范](maintenance/organization.md)归属。

## 使用 coding agents

从根 AGENTS.md 和目标目录局部约定开始。Claude Code 通过同级 CLAUDE.md 的
`@AGENTS.md` 读取同一份约定；其他文档由任务导航按需加载。

- `.agents/skills/` 与 `.claude/skills/` 提供同内容的技能与资源。修改技能时同步两端，
  通过 `make docs-check` 核对镜像；技能自带的脚本和测试继续随技能维护。
- 架构任务使用 [architecture-design](../.agents/skills/architecture-design/SKILL.md)，
  核对 Cordis/DSH 原语时沿 [cordis-authoritative-docs](../.agents/skills/cordis-authoritative-docs/SKILL.md) 查证。
- Subagent 的共享正文、宿主适配和生成入口由[角色索引](../.agents/roles/README.md)维护。
  修改角色先使用 [design-subagents](../.agents/skills/design-subagents/SKILL.md)，再生成原生文件；
  文件一致性、宿主加载与模型行为分别验证，普通检查不隐式启动模型评估。

## 常见问题

| 现象 | 应检查什么 |
|---|---|
| `python` 不存在，或系统 Python 缺模块 | 使用 `uv run --locked python ...`；确认已在当前检出 `uv sync --locked` |
| 找不到工具成员或 workspace 依赖 | 从仓库根运行同步；核对成员的 pyproject 和锁文件，依赖变更按 [workspace 规则](maintenance/workspace.md#使用与维护)更新 |
| `cannot locate repository` | 切到受检仓库内，或给 CLI 传明确的 `--root`；安装位置不代表受检位置 |
| 本地链接或 skill 镜像检查失败 | 修正拥有内容的文件及其引用，或同步对应技能资源；不要移出检查范围掩盖错误 |
| `UNCOVERED`，或形式工具检查失败 | 前者表示尚无相应模型任务，后者检查实际 Java/JAR；按[验证规范](maintenance/verification.md)区分覆盖缺口、缺环境与执行失败 |
| 不知道如何启动产品或执行发布 | 先看当前成员与脚本索引；当前包提供构建/测试，产品启动和发布入口尚未提供 |

## 保持指南可用

改变环境、命令或目录时，同步其所有者、受影响的上手示例及索引，并实际验证
改变的路径。版本与依赖从包配置和锁文件读取；常用示例之外的完整命令表归脚本，
不在 AGENTS.md 复制。贡献与开发入口的维护分工见[组织规范](maintenance/organization.md)。
