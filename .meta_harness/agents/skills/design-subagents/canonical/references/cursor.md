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

## 模型和权限

固定 CLI `2026.08.04-aaa8809` 的认证 `--list-models` 返回了记录中的 native IDs。
`claude-fable-5-1-xhigh`、`claude-opus-5-5-xhigh`、`claude-opus-5-5-high` 与 `claude-sonnet-5-5-high` 是宿主请求标识。
不凭相似名称推导 Codex 模型、Claude API ID、上下文或独立 effort 等价。

该 CLI 的项目 `.cursor/agents` 读取 model。插件 agents 加载器用 `stripModel: true` 并写入 `model: inherit`。
因此模型敏感角色须使用项目视图，或在 Task 调用中明确覆盖并取得本次证据。
原生 `subagentStart.subagent_model` 说明选择结果，不能排除后端回退。精确实际模型需任务卡或宿主用量证据。
证据不足时角色只具请求配置与结构支持，不取得其它宿主的评估资格，也不能承担要求该资格的独立接受门。

`readonly: true` 请求宿主只读模式，不保证按路径隔离。需要执行检查或写 tmp 的角色使用 `readonly: false`，仍受任务写范围约束。
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
