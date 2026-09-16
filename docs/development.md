# 开发指南

本页帮助开发者和 coding agents 从当前检出开始工作。贡献范围与交付要求见
[CONTRIBUTING.md](../CONTRIBUTING.md)，需求与设计工作从 [.meta_harness](../.meta_harness/AGENTS.md)
及其 [harness-design-handbook](../.meta_harness/agents/skills/harness-design-handbook/canonical/SKILL.md) 进入。
源码归属、验证含义和治理规则由各自的维护文档拥有，本页负责上手顺序和按问题导航。

## 目录

- [准备可用的检出](#准备可用的检出)
- [定位修改位置](#定位修改位置)
- [需求与设计的工作入口](#需求与设计的工作入口)
- [修改与验证](#修改与验证)
- [使用 coding agents](#使用-coding-agents)
- [常见问题](#常见问题)
- [保持指南可用](#保持指南可用)

## 准备可用的检出

产品以 TypeScript 为主；当前可运行 Python 开发工具、形式验证及
[各职责包源码基线](../packages/README.md)的构建/测试。尚无完整智能体应用或产品启动命令。
目标范围从[当前核心架构](architecture/core-capabilities.md)进入，具体实现映射和
验证责任由成员设计拥有；[首批实施来源](proposals/core-capabilities/implementation/README.md)
保留历史路线与接受依据。包基线可运行不代表目标产品已实现。

在实际工作的仓库根确认位置和已有改动；隔离规则见
[worktree-discipline](../.meta_harness/agents/skills/worktree-discipline/canonical/SKILL.md)：

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
pnpm --filter @omne-harness-lite/diagnostics rebuild fs-ext
make check
```

安装依据锁文件且禁用依赖脚本；随后只构建已列入允许清单的 `fs-ext`。
原生构建需要适配 Node 24 的 C++20 编译器及 node-gyp 环境；本机 GCC 10 的
实际设置与失败/成功边界见[原生接入证据](proposals/core-capabilities/implementation/evidence/p1-diagnostics-hub/native-dependency/README.md)。
必须指定消费它的 diagnostics 成员，根目录无成员选择的 rebuild 退出 0 不证明
addon 已生成；安装后以该成员实际加载结果判断。
最后一条执行 agent 产物与链接、文档、规格、工具测试与产品包检查组合，
不调用真实模型。已有环境时，日常修改按受影响范围选择检查即可。
正式行为模型的覆盖与 Java/JAR 环境分开报告；详细要求见
[验证规范](maintenance/verification.md#环境与实际执行)。

TS/JS 格式由根配置和锁定的本地 Prettier 统一处理。检查或格式化整个受维护范围时运行：

```sh
pnpm format:check
pnpm format:write
```

agent 和局部修改应只传入本次有写权限的仓库相对文件，例如
`pnpm format:write -- packages/model/llm/src/message.ts`。默认范围包括 `packages/`、
`apps/`、`tools/` 和 `scripts/` 下的 TS/JS 源码、测试及所属配置，以及根 TS/测试配置和
格式化工具自己的根配置；不包含 `spec/`、上游原件、provenance、JSONL 黄金文件、
依赖、构建输出和临时目录。

需要本地提交检查时，在确认没有既有 `pre-commit` hook 后显式运行
`pnpm format:hook:install`。安装器不会覆盖已有 hook；所安装检查只读取 Git index 中
已暂存的受维护文件，不 stash、不改工作区或暂存区。编辑器推荐设置使用工作区安装的
[Prettier VS Code 扩展](https://github.com/prettier/prettier-vscode#prettier-resolution)的
workspace 设置显式指向 `./node_modules/prettier`，并使用同一根配置保存时格式化 TS/JS；
缺少本地安装时该路径加载失败，不改用扩展内置版本。该设置在未信任 workspace 中被
扩展禁用，推荐设置本身也不证明宿主执行过保存动作。

## 定位修改位置

| 要修改的内容 | 入口 |
|---|---|
| 产品实现包、应用装配 | [packages/](../packages/README.md)、[apps/](../apps/README.md)；先确定实际成员职责 |
| 文档、规格与评估证据检查器 | [tools/spec-tools/](../tools/spec-tools/README.md)，在成员 `src/` 和 `tests/` 中工作 |
| 本地与 CI 共用的自动化调用 | [scripts/](../scripts/README.md)，复杂检查行为回到工具包 |
| 产品需求 intake、研究、候选、决定、架构或规格设计 | [.meta_harness/design/](../.meta_harness/design/README.md) 的对应 family；按[下节](#需求与设计的工作入口)接续已有正文 |
| Skill、专用 subagent 或宿主适配 | [.meta_harness/agents/](../.meta_harness/agents/README.md) 的源；技能选择见[下方 agent 指引](#使用-coding-agents) |
| Agent 编译与项目根链接工具 | [.meta_harness/tooling/](../.meta_harness/tooling/README.md) |
| 已有产品材料的局部修正、源码使用与开发说明 | 定位[文档地图](README.md)或[规格索引](../spec/README.md)中的现有拥有者；保持接受状态和精确版本 |

各目录局部 AGENTS.md 补充其工作边界，完整布局由
[workspace 规范](maintenance/workspace.md)维护。包内实现、依赖、构建和测试随成员维护；
跨包使用公开入口。根 Python workspace 只管理开发环境，与 pnpm 管理的 TS 工具链并存。

## 需求与设计的工作入口

`.meta_harness/` 保存可独立迁出的设计方法、产品设计链与 agent 能力。根 `docs/` 的目标职责
是源码使用和维护说明；目前既有产品需求、设计与 `spec/` 正文尚未整体迁入，不能把目标布局
当成已完成的迁移。本节拥有这一接入导航，实际正文仍由各自入口说明接受与采用范围。

1. **接收需求。** 读取 [.meta_harness/AGENTS.md](../.meta_harness/AGENTS.md)，加载
   [harness-design-handbook](../.meta_harness/agents/skills/harness-design-handbook/canonical/SKILL.md)，
   从 intake 参考页整理可观察结果、来源、确认范围与未决项；需求信息包进入
   [design/requirements](../.meta_harness/design/requirements/README.md)。已有主题先接续，
   新主题从 family 内的 `.templates/` 起步；需求访谈或有长期价值的需求语境可先接续可选的
   [访谈记录](../.meta_harness/design/requirements/interviews/README.md)，但不因此成为正式要求或决定。
   不把一句愿望直接命名为新插件。
2. **开展设计。** 按手册分析现有能力及组合的覆盖，再判断扩展或新增责任。研究、候选、
   决定、规格、能力地图、提供者和装配分别进入 [design 的相应 family](../.meta_harness/design/README.md)，
   只创建本次需要的信息包；加载相关 references 后回到当前问题，不通读全部资料。
3. **明确现有输入。** 为本项目工作时，任务显式提供 [docs/requirements](requirements/README.md)、
   [当前架构](architecture/README.md)、相关决定与 [spec/catalog.json](../spec/catalog.json)
   中实际采用的路径、版本和范围。工作区内尚缺材料不表示系统没有现有能力，手册也不从父目录推断这些事实。
4. **接续与迁移。** 已有主题未迁移时，修订其当前拥有者并在新工作中引用；新增语义若属于已有条款，
   先定位该条款，避免两处各写一份。迁移某项正文时再明确来源、身份、接受依据、消费者和旧入口退役，
   尤其不能复制 catalog 或改写已冻结版本；本次 skills/roles 接入没有迁移产品正文。

正式 proposal topic 的候选门槛、决定的真实接受记录与规格的证据义务由 family 和手册维护，
本页只导航。产品实现仍在 `packages/`、`apps/`；把精确设计与执行上下文交给实现者，
不把加载手册当成设计已就绪。

## 修改与验证

先找到内容或行为的所有者，在任务范围内修改，再根据变化选择验证：

| 变化或目的 | 检查入口 |
|---|---|
| 本地文档链接、导航与 skill 镜像 | `make docs-check` |
| Skills/roles 源、生成产物与根软链接 | `make agents-check` |
| 契约登记、Schema 或形式任务 | `make spec-check` |
| 检查器或 skill 生成器行为 | `make test`，或按下方说明运行相关测试 |
| TS/JS 源码、测试及所属配置的格式 | `pnpm format:check`；局部写入使用 `pnpm format:write -- <有写权限的文件...>` |
| 产品职责包或 TS workspace | `make product-check`；构建、严格类型检查、来源/组合案例、依赖边界与逐包独立产物消费，详见各包 README |
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

| 当前任务 | 应加载的 skill 与工作位置 |
|---|---|
| 产品需求 intake、能力分析、架构/spec 设计与交接 | [harness-design-handbook](../.meta_harness/agents/skills/harness-design-handbook/canonical/SKILL.md)；在 `.meta_harness/design/` 接续，按当前缺口选择 intake、设计选择、规格演进或交付规划等 references |
| 创建或修改 skill | 当前环境提供的官方 `skill-creator`；在 `.meta_harness/agents/skills/<name>/canonical/` 维护正文及资源，宿主差异进入相邻 `adapters/`；按环境提供的实际技能位置加载，不假定它已打包进本项目 |
| 创建或修改 role、宿主配置或模型专属提示 | [design-subagents](../.meta_harness/agents/skills/design-subagents/canonical/SKILL.md)；源归 `.meta_harness/agents/roles/<role>/`，共同边界见[角色索引](../.meta_harness/agents/roles/README.md) |
| 编写或调整 AGENTS.md 的心智与继承范围 | [write-agents-md](../.meta_harness/agents/skills/write-agents-md/canonical/SKILL.md)；修改实际作用域的源文件 |
| 创建、使用、集成或清理隔离检出 | [worktree-discipline](../.meta_harness/agents/skills/worktree-discipline/canonical/SKILL.md)；操作本次明确的执行仓库 |

原 architecture-design、implementation-planning、spec-maintenance、engineering-taste 和
cordis-authoritative-docs 的有效方法已经按新范式吸纳进手册；它们不再是独立安装的入口。
需要 Cordis/DSH 事实时，由手册进入来源核对，而非重新加载旧 skill。

根 `.agents`、`.claude`、`.codex` 分别软链接到 `.meta_harness/` 内同名目录，
向宿主暴露生成的 skills/subagents；共享角色正文在源目录中，不再位于 `.agents/roles/`。
先修改源与适配，再按[编译工具](../.meta_harness/tooling/README.md#使用)在新暂存目录生成、
比较并更新所属产物；编译器拒绝覆盖不同内容，不手工编辑输出修补漂移。
最后运行 `make agents-check` 核对生成一致性与三个相对链接，`make docs-check` 核对导航和技能镜像。
技能自带脚本和测试随 canonical 源维护；文件一致性、宿主实际加载与模型行为分别验证，
普通检查不隐式启动模型评估。

## 常见问题

| 现象 | 应检查什么 |
|---|---|
| `python` 不存在，或系统 Python 缺模块 | 使用 `uv run --locked python ...`；确认已在当前检出 `uv sync --locked` |
| 找不到工具成员或 workspace 依赖 | 从仓库根运行同步；核对成员的 pyproject 和锁文件，依赖变更按 [workspace 规则](maintenance/workspace.md#使用与维护)更新 |
| `cannot locate repository` | 切到受检仓库内，或给 CLI 传明确的 `--root`；安装位置不代表受检位置 |
| 本地链接、skill 镜像或 agent 产物检查失败 | 修正源及其引用，按编译工具更新产物并核对根软链接；不要手改镜像或移出检查范围掩盖错误 |
| `UNCOVERED`，或形式工具检查失败 | 前者表示尚无相应模型任务，后者检查实际 Java/JAR；按[验证规范](maintenance/verification.md)区分覆盖缺口、缺环境与执行失败 |
| 不知道如何启动产品或执行发布 | 先看当前成员与脚本索引；当前包提供构建/测试，产品启动和发布入口尚未提供 |

## 保持指南可用

改变环境、命令或目录时，同步其所有者、受影响的上手示例及索引，并实际验证
改变的路径。版本与依赖从包配置和锁文件读取；常用示例之外的完整命令表归脚本，
不在 AGENTS.md 复制。贡献与开发入口的维护分工见[组织规范](maintenance/organization.md)。
