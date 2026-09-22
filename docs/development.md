# 开发指南

本页帮助开发者和 coding agent 从当前检出开始工作：准备环境、找到该改的地方、
跑对应的检查。贡献范围与交付要求见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

> **本页只管开发。**产品设计、系统架构与规格设计、产品/系统/算法的 research
> 都不在这里，也不在 `docs/` ——它们归 [`.meta_harness/`](../.meta_harness/AGENTS.md)。
> 需要做那些事时从那里进入，加载 `harness-design-handbook` skill，**不要在这边落字**。

## 当前能跑什么

**`packages/` 有十个成员，`apps/` 还没有可启动的应用。**租户领域第一程（2026-09-22）建起了
契约纯模块、Cordis 共用件、存储协议与 sqlite/pg 提供者、租约时钟，以及四个 tenancy 插件的
服务面骨架——它们的操作实现在第二程，所以**现在没有能启动的产品**。成员与状态见
[packages/README](../packages/README.md)。

当前实际可运行的是：**产品包的构建、类型检查与测试**（`pnpm run build`／`typecheck`／`test`，
含 sqlite 上的存储一致性套件与 Cordis 4.0.4 的 probe）、**结构检查**（`pnpm run lint:rules`）、
**开发工具**（`tools/spec-tools`、`.meta_harness/tooling`）、**自动化脚本**（`scripts/`）、
**agent 产物的编译与检查**，以及**形式模型的执行**。

## 准备可用的检出

先确认自己在哪个检出、有没有未提交改动；隔离规则加载 `worktree-discipline` skill：

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

## 定位修改位置

| 要改什么 | 去哪 |
|---|---|
| 文档导航与技能镜像检查器 | [tools/spec-tools/](../tools/spec-tools/README.md) 的 `src/` 与 `tests/` |
| 设计链检查、agent 编译与根链接工具 | [.meta_harness/tooling/](../.meta_harness/tooling/README.md) |
| 本地与 CI 共用的自动化调用 | [scripts/](../scripts/README.md)；复杂检查行为回到工具包 |
| Skill、subagent 或宿主适配 | [.meta_harness/agents/](../.meta_harness/agents/README.md) 的**源**，不改生成物 |
| 环境、布局、检查含义、编码防御 | 本目录[四份正文](README.md) |
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
| 某个产品包的源码或测试 | `pnpm --filter @omne-harness-lite/<包名> run test`（含 `*.spec-d.ts` 类型测试）；改了公开入口再跑 `pnpm run build && pnpm run typecheck` |
| 产品源码的结构约束（墙钟、`bail`、受限调用点） | `pnpm run lint:rules`；规则与自测见 [tools/ts-checks](../tools/ts-checks/README.md) |
| 存储提供者或迁移 | `pnpm --filter @omne-harness-lite/storage-sql run test`：sqlite 上跑一致性套件；pg 需设 `OMNE_TEST_PG_URL`，否则跳过 |
| 形式工具是否可用 | `make formal-tools` |
| 跨入口改动 | `make check` |

覆盖与退出含义归[验证与证据](verification.md)——**那里写明了每个入口不能声称什么**。

对检查器做局部迭代时，可从仓库根运行一组测试：

```sh
PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest tools/spec-tools/tests/
```

检查器 CLI 默认从当前工作目录定位受检仓库；检查另一个检出时传 `--root PATH`。

保留失败的实际输出与影响判断，修正后重跑受影响的检查。
交付时说明检查针对哪个源码状态与范围。临时日志放 `tmp/`，测试组合用 `tmp/test-runs/`；
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
| 创建、使用或清理隔离检出 | `worktree-discipline` skill |

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
| `No projects matched the filters` | `apps/**` 当前没有成员，只对 `apps` 的过滤会这样报；`packages/**` 有成员 |
| `storage conformance · postgres` 显示 skipped | 未设 `OMNE_TEST_PG_URL`；跳过不是通过（[验证与证据](verification.md)） |
| 不知道如何启动产品 | 当前没有可启动的应用，也没有发布入口；tenancy 插件的操作实现在第二程 |

## 保持本页可用

改变环境、命令或目录时，**先改实现再改本页**，并把改动过的那条路径实际跑一遍。
版本与依赖从包配置和锁文件读取，本页不复制版本号；
完整命令表归 [Makefile](../Makefile) 与 [scripts/](../scripts/README.md)，
本页只解释顺序与选择。
