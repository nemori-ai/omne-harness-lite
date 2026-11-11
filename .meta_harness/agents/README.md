# Agent 源资产

本目录是技能、钩子、云端环境与外部技能集的源。执行仓库根 `.agents/`、`.claude/`、`.codex/`、`.cursor/` 通过相对软链接暴露生成物；接入状态由工具核对。研发方法怎样分层、外部来源钉哪一版，归[技能入口](../../docs/engineering/skills.md#三层分工)。

| 源 | 内容 | 输出（相对显式指定的输出根） |
|---|---|---|
| `skills/<name>/canonical/` + `adapters/<host>/strategy.yaml` | 项目自有技能，只装本项目独有的知识 | `.agents/skills/<name>/`、`.claude/skills/<name>/`、`.cursor/skills/<name>/` |
| [`vendor/<技能集>/`](../tooling/README.md#外部技能集) | 钉了提交的外部技能集（git 子模块），现在是 pqw-skills | 原样复制到每个所选宿主的技能目录；与项目技能同名时项目技能优先 |
| [`hooks/hooks.yaml`](hooks/README.md) | 宿主无关的钩子声明：收工与 Claude Code 会话开始 | `.claude/settings.json`、`.codex/hooks.json`、`.cursor/hooks.json` 及 Cursor bridge 资源 |
| [`cloud/<host>/`](cloud/README.md) | 按宿主分的云端环境源：`cursor/` 与 `claude-code/` | Cursor 的 `Dockerfile`、`environment.json`、`install.sh` 投影到 `.cursor/` 并提交；`claude-code/` 只做检查，不投影 |
| [`pqw/`](pqw/spec-addendum.md) | pqw spec 与 plan 模板的本项目附加节 | 不生成，由根 `AGENTS.md`「pqw-skills 接入」引用 |
| [`roles/engineering-taste.md`](roles/engineering-taste.md) | 研发品味的项目补充 | 不生成 |

[`research/`](research/README.md) 保存方法仍依赖的上游事实、适用版本与限制，不保存本项目如何讨论、迁移或验证这些方法的过程。规矩本身归 canonical skills。过程材料放哪归[位置与唯一源](../../docs/engineering/documentation.md#位置与唯一源)。

## 编译

skills 的共享正文与资源放在 `canonical/`。即使各端直接复制，也分别提供显式策略；局部宿主差异通过策略声明的 Markdown slots 表达。包内相对引用保持不变，不猜测或自动重写外部路径；确需宿主路径时使用经过验证的局部适配，不发明运行时变量。生成后的目录名与 frontmatter 的 `name` 一致，`name`、`description` 和正文必填。

只有 canonical 运行资源进入产物，`adapters/`、`.design/`、`evals/`、`research/` 与维护入口不分发。正文 slot 展开后再次校验，未解析或未使用的 slot 都报错；非 Markdown 文件不作文本替换。两端一致是无差异策略的结果，不是禁止适配的全局约束。

编译遍历 skills 的直接子目录；缺少必要文件、重复输出名称、符号链接等均报错，不静默跳过坏源。缓存目录不会成为资源。所有输入完成验证之后才写入输出。外部技能集的子模块没有初始化时预检失败。工具说明与实际命令见 [tooling](../tooling/README.md)。

创建或修改 skill 时加载当前环境提供的官方 `skill-creator`，按其实际安装位置读取；它是编写工具，不假定已经随本工作区分发。

## Skills

项目自有技能的清单、何时加载与规则拥有者归[项目技能](../../docs/engineering/skills.md#项目技能)。使用时按名加载，不按路径读源；只有维护源时才进 `skills/<name>/canonical/` 与 `skills/<name>/adapters/<host>/`。研发流程的环节技能来自 pqw，入口是 `single-session-dev-flow`。

外部项目依赖必须作为明确工作区或执行仓库输入，不暗接父仓库。编译保留草稿状态，生成不代表接受、安装、宿主加载或模型行为已验证。
