# @omne-harness-lite/meta-shell

[English](README.md)

正式 Shell 工具实现五个命令：help、create_session、execute、close_session、info。工具消费注入的 Runtime Context 和选中环境的 command facility，不导入具体宿主实现。

纯根导出 createShellTool、SHELL_CONTEXT_KEY 及公开类型。./cordis 只通过原工具实现注册表登记，登记撤除归调用者 effect，没有 ShellService。

默认 shell.initial 值是 {cwd, envs}。初始目录和环境来自这个 Runtime Context 数据。未来 Workspace 可以提供该来源，本包没有 Workspace 注册表。持久终端只接受本次显式覆盖，不重新套用初始值。

ToolDefinition 声明 allowBackground=true，settings.backgroundThreshold 默认 PT10M，可以配置。10 分钟约束上层等待，不是停止命令的执行 timeout。Tool Runtime 和作者闭包不增加后台模式。

输出按有界块增量展示给用户。PTY 使用合并 terminal 通道，更新可含半行、多行、回车和 ANSI。最终结果保留真实退出状态和丢弃计数，提供给模型。详细行为见 [SPEC.md](SPEC.md)。

新包由版本化 cordis-module 模板生成。构建、类型和测试命令见 [英文说明](README.md)；临时方案和每次运行证据留工作树 tmp。
