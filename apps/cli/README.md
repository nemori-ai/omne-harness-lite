# 治理CLI开发入口

Node 24.21.0、pnpm 10.28.1 下从仓库根执行 `pnpm install --frozen-lockfile` 与 `pnpm build`，然后 `node apps/cli/dist/main.js --help`。凭据使用受保护文件；TUI限定终端配置及其验收范围见下文与[CLI节点](../../.meta_harness/design/realization/apps/cli/README.md)。

TUI入口为 `node apps/cli/dist/main.js tui --terminal-profile xterm-379 --state-dir <绝对目录>`。当前profile要求XTerm379、`allowPasteControls=false`、直接且独占的真实TTY，普通键盘与普通剪贴板粘贴；不能仅凭TERM变量认定支持。至少60列16行，身份过长时按提示扩大窗口。PgUp/PgDn翻页，写操作完整显示预览后明确确认；Ctrl+G取消当前步骤，Ctrl+C退出。单独Esc不作取消键，避免把迟到的粘贴前缀误认成取消；已开始的粘贴须实际完成才能归还终端。

首次无配置/登录时进入设置；已有登录则以固定身份进入治理界面。用 `tui --terminal-profile xterm-379 --setup` 明确重新配置、体检、注册或登录，每次完成一项后重新运行。秘密字段只输入权限受保护的凭据文件路径，不输入凭据本身。没有Agent工作会话；macOS按下述iTerm配置验证，不能把原语探针或PTY结果外推为任意终端支持。

生成本地可搬运归档：`./scripts/package-cli.sh /absolute/new/omne-cli.tar.gz`。输出父目录须已存在，目标文件不得存在；先完成CLI依赖构建，再从本机pnpm存储离线收集生产依赖。执行期间不要并发修改源、锁或dist。命令只写指定新归档和自有暂存，不安装、不上传、不读取CLI登录目录。归档附运行说明、文件/软链清单和BUILD_ID；`--version`显示该标识，仓库构建无标识时显示development。

使用可信渠道取得归档及摘要，在新空目录解压，预装相同Node版本后执行 `node <目录>/app/dist/main.js --help`。代码升级用另一个新目录，沿用明确的 `--state-dir`；保留旧代码不保证能读取新格式状态。构建异常可能留下暂存；若已完成发布，后续输出失败仍可能留下有效归档，应核摘要，不能直接重跑覆盖。

设计与行为权威见[CLI节点](../../.meta_harness/design/realization/apps/cli/README.md)。应用只装配CG2与CLS；成员`test`/`typecheck`用于开发验证。D050文件CLI归档验证平台为macOS arm64、Linux arm64/amd64，macOS Intel尚未验证；新增TUI不得继承旧版所有平台通过状态。完整部署、TUI与备份恢复的验收状态以节点证据为准。

macOS新增已采用的实现路径 `--terminal-profile iterm-3.7.1beta1`，要求精确iTerm版本、UTF8、直接独占TTY和普通纯文本粘贴。不得使用特殊粘贴、文件URL、auto-composer、广播、tmux、粘贴期间的按键直通或终端取消粘贴；先完成输入法组合再粘贴，粘贴中不提交输入法。`NoSyncTurnOffBracketedPasteOnHostChange`不得为true，若出现关闭粘贴保护提示，不选Yes/Always。程序不改用户全局偏好；profile是明确环境前提，不是自动认证。模式答复先独立分帧，关闭与查询失败仍等待已收到的半答复结束。产品GUI和独立验收状态见设计节点，不能仅因allowlist存在认定已验证。

凭据使用文件的完整 UTF-8 文本，包括末尾换行、空格和 BOM；不会 trim 或规范化。`echo` 默认附加换行，与不加换行的 `printf` 结果是不同凭据。创建时检查编辑器/导出工具的尾换行设置，后续登录保留相同内容；本期没有管理员密码重置。
