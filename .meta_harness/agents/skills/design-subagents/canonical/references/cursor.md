# Cursor 原生角色与资格

本页拥有 Cursor 角色字段、部署方式及本项目的资格边界。共享职责仍来自 `role.md` 和 `assembly.toml`。
来源为 [Cursor subagents](https://cursor.com/docs/subagents)、[原生插件格式](https://cursor.com/docs/reference/plugins)及 [hooks](https://cursor.com/docs/hooks)，核对日期为 2026-10-12。

## 源和输出

每个角色提供 `cursor.yaml`。必须恰好包含 `name`、`description`、`model`、`readonly`、`is_background`。
字符串必须非空，名称须与目录相同，两个权限/调度字段必须为布尔值。重复键、缺字段、未列模型和跨宿主字段使生成失败。
不接受 Claude 的 `tools`、`permissionMode`、`effort`，也不把它们静默删除。Cursor 不提供对应的独立字段。

Cursor renderer 只读取共享正文、assembly、Cursor 配置、角色集合根共享 `cursor-adaptation.md` 及可选角色内 `cursor-adaptation.md`。
`render_pair.render()` 仍只产出 Codex 与 Claude 两文件。选原宿主时继续验证完整 pair；选 Cursor 时不读取 pair 配置。
角色输出为 `.cursor/agents/<name>.md`。支持记录在 [model-support.json](model-support.json)，只收录实际角色或明确派发选项所需的 native IDs。

## 生成前的角色资格门禁

每个角色以`cursor-qualification.yaml`维护本角色的唯一资格记录。native frontmatter仍只有上述五个字段。
记录绑定`cursor.yaml`的精确字节SHA-256，以及共享正文装配和Cursor公共/角色适配段的最终提示SHA-256。
生成的资格摘要不进入提示指纹。源、宿主版本、用途或范围变更时，原采用不能自动续用。

记录须明确schema版本1、目录角色身份、CLI/IDE/Cloud版本列表、状态、生成与派发范围、证据、未证明保证、采用和原因。
未运行的IDE/Cloud版本列表为空，不从CLI推导版本或派发资格。状态只能是以下四种。

| 状态 | 生成结果与所需依据 |
| --- | --- |
| pending | 原因和缺口保留，adoption为null；只跳过该角色自己的 agent 文件 |
| unsupported | 原因保留，adoption为null；拒绝Cursor生成，不静默省略角色 |
| limited | 非空未证明保证和限定qualification-probe派发范围，必须有PanQiWei精确采用；只允许有限结构生成和探针，不承担正式角色职责 |
| proved | 无剩余缺口；每个派发范围都有role-behavior、actual-model、permissions和lifecycle证据，并有PanQiWei精确采用 |

`scope.generation`须恰好覆盖cli-project、cli-plugin、ide-project、ide-plugin、cloud-project这五种共享包部署形状。
这只允许结构资产，不表示三端运行资格。`scope.dispatch`每项写明environment、deployment、version、mode、purpose。
CLI模式为interactive或headless，IDE/Cloud模式为agent；Cloud只用项目视图。版本必须存在于相应版本列表。
purpose只能是qualification-probe或accepted-role-duty。未登记范围由派发者停止并报告。

证据每项登记相对于agent源根的文件reference、精确sha256、claims及其覆盖的dispatch列表。
生成器核对文件存在、根内路径、字节摘要和范围归属。结构或catalog证据不能填补四种完整角色保证。
采用包含owner、真实Issue评论reference和subject_sha256。subject为除adoption外整个记录的排序键紧凑JSON UTF-8字节摘要。
离线门禁核对绑定和记录，不证明评论身份、证据语义或负责人已经作决定。实际采用仍由有权负责人和交付记录确认。

直接角色投影也执行门禁。记录缺失、绑定过期或 unsupported 时，全量或混合生成在 deliver 前拒绝整次构建，保持既有输出字节和模式。pending 只省略该角色的 agent 文件。
单独选择Codex或Claude不读取Cursor资格记录。不能新增绕过参数、角色过滤或以假采用使生产构建变绿。
生成角色附带由此记录派生的限定范围。`require_dispatch`可检查具名探针的精确范围；直接原生Task没有被编译器拦截。
这些是生成和派发契约，不能声称是Cursor运行时访问控制。
`subagentStart` 另按合格 agent 文件的 SHA-256 拒绝受管角色。文件缺失、摘要不符或该角色仍是 pending 时拒绝。不在角色源目录里的类型放行。
同一角色名出现在 `.claude/agents` 或 `.codex/agents` 不构成这份摘要。

## 模型和权限

固定 CLI `2026.08.04-aaa8809` 的认证 `--list-models` 返回了记录中的 native IDs。
`claude-fable-5-1-xhigh`、`claude-opus-5-5-xhigh`、`claude-opus-5-5-high` 与 `claude-sonnet-5-5-high` 是 CLI 目录里的源 ID。
不凭相似名称推导 Codex 模型、Claude API ID、上下文或独立 effort 等价。

该 CLI 的项目 `.cursor/agents` 读取 model。插件 agents 加载器用 `stripModel: true` 并写入 `model: inherit`。
因此模型敏感角色须使用项目视图，或在 Task 调用中明确覆盖并取得本次证据。
原生 `subagentStart.subagent_model` 说明选择结果，不能排除后端回退。精确实际模型需任务卡或宿主用量证据。
证据不足时角色只具请求配置与结构支持，不取得其它宿主的评估资格，也不能承担要求该资格的独立接受门。

投影把目录里的模型请求写成 `id[effort=level]`。源 `cursor.yaml` 仍用支持记录里的目录 ID，例如 `claude-opus-5-5-high` 投影为 `claude-opus-5-5[effort=high]`。
描述不得包含冒号加空格。Cursor 会给这种描述加引号，并原样显示引号。

`readonly: true` 请求宿主 Ask 模式，不保证按路径隔离。资格记录里 IDE 与 Cloud 的 `mode` 因此写 `ask`，不写 `agent`。
`readonly: false` 的 IDE 与 Cloud 记录仍写 `agent`。需要执行检查或写 tmp 的角色使用 `readonly: false`，仍受任务写范围约束。
Cursor 没有本项目所需的逐工具 allowlist。不能把指令约束声明成与 Claude 白名单或 Codex sandbox 等价。
`is_background` 仅表达原生调度配置，不证明进程已停止或资源已释放。

## 支持与验证范围

| 环境 | 交付方式 | 必须分别报告的证据 |
| --- | --- | --- |
| CLI | 项目视图或 `--plugin-dir` 指定物理原生包 | 发现、实际技能/reference 读取、Task 调用、所选/实际模型、权限及 hooks |
| IDE | 项目视图或原生插件安装 | 本次未运行 IDE；不能由 CLI 通过推出 IDE 行为 |
| Cloud | clean clone 初始化生成项目视图，再开始会话 | 本次只检查初始化和资源路径；不依赖本机用户插件或 SessionStart |

同一会话只启用项目视图或同一插件包的一份资产。否则名称和 hooks 可能重复；发现顺序不是选择保证。
新宿主版本、模型目录、权限策略或角色任务范围变化时，重新核对受影响资格。生成通过不是角色接受。
完整命令与 native 运行驱动由明确执行仓库的 `.meta_harness/tooling/README.md` 拥有。
