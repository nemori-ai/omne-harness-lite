# CLI开发入口

从仓库根执行 `pnpm install --frozen-lockfile` 与 `pnpm build`，然后 `node apps/cli/dist/main.js --help`。工具链版本归[开发指南](../../docs/development.md)。正式治理动作是center add、tenant create、tenant add和tenant switch；账号动作包含login、register、logout、logins list／revoke及credential change。具体参数见帮助，行为归本应用[SPEC](SPEC.md)。

非TTY治理命令须使用 `--json` 并给齐必要输入，TTY中的JSON模式也不补交互答案。TTY中不带JSON的治理动作补齐缺输入并确认。发行装配要求显式部署环境输入 `OMNE_TERMINAL_PROFILE=xterm-379`，该配置要求XTerm379、`allowPasteControls=false`、直接且独占的真实TTY，普通键盘与普通剪贴板粘贴。缺少或不支持的配置拒绝进入交互，JSON命令不要求终端配置；不能仅凭TERM变量认定支持。至少60列16行，身份过长时按提示扩大窗口。PgUp/PgDn翻页，写操作完整显示预览后明确确认；Ctrl+G取消当前步骤，Ctrl+C退出。单独Esc不作取消键，避免把迟到的粘贴前缀误认成取消；已开始的粘贴须实际完成才能归还终端。

中心先经实际公共体检，再确认身份和信任指纹。租户候选及收到的邀请来自当前账号对应的实际中心；选择后由业务动作重新核资格。创建或添加租户不自动切换，注册不自动登录，登录不建Session。秘密字段只输入权限受保护的凭据文件路径，不输入凭据本身。会话解析面包含裸入口、`--session`及`--message-file <path> --json`；未安装会话执行能力时返回capability-not-installed，不能把治理交互当作Agent会话。macOS按下述iTerm配置验证，不能把原语探针或PTY结果外推为任意终端支持。

生成本地可搬运归档：`./scripts/package-cli.sh /absolute/new/omne-cli.tar.gz`。输出父目录须已存在，目标文件不得存在；先完成CLI依赖构建，再从本机pnpm存储离线收集生产依赖。执行期间不要并发修改源、锁或dist。命令只写指定新归档和自有暂存，不安装、不上传、不读取CLI登录目录。归档附运行说明、文件/软链清单和BUILD_ID；`--version`显示该标识，仓库构建无标识时显示development。

已配置并运行的租户宿主支持`omne --message-file <path> --json [--session <session-id>]`。
消息文件须是完整JSON UserMessage。带Session时提交与观察既有会话；未带时读取宿主的实际创建偏好，
可靠创建后再提交消息。配置缺失不创建；创建结果不明保留原请求，不重发或提交消息。
客户端退出只结束等待，不停止宿主原工作。独立宿主的生产启动、配置准备及裸终端仍待完成，
不能将该机读路径当作完整会话产品交付。具体状态与退出码见[SPEC](SPEC.md)。

使用可信渠道取得归档及摘要，在新空目录解压，预装要求的Node版本后执行 `node <目录>/app/dist/main.js --help`。代码升级用另一个新目录，沿用明确的 `--home <绝对路径>`；保留旧代码不保证能读取新格式状态。状态根依次选用显式home、OMNE_HOME或当前用户的~/.omne，根配置为config.sqlite，每租户有独立中心／租户绑定与auth目录。构建异常可能留下暂存；若已完成发布，后续输出失败仍可能留下有效归档，应核摘要，不能直接重跑覆盖。

应用装配实际CG、CLS与HTTPS传输；成员`test`／`typecheck`用于开发验证。CLI退出码区分完成、拒绝、不可用、不明与缺陷，原业务成功不能覆盖关闭或终端恢复失败。旧文件CLI或原终端的历史平台结果不能代替当前正式入口的部署、GUI／IME和备份恢复验收。提供者识别终端配置也不表示真实终端矩阵已验证。

macOS使用显式部署输入 `OMNE_TERMINAL_PROFILE=iterm-3.7.1beta1`，要求精确iTerm版本、UTF8、直接独占TTY和普通纯文本粘贴。不得使用特殊粘贴、文件URL、auto-composer、广播、tmux、粘贴期间的按键直通或终端取消粘贴；先完成输入法组合再粘贴，粘贴中不提交输入法。`NoSyncTurnOffBracketedPasteOnHostChange`不得为true，若出现关闭粘贴保护提示，不选Yes/Always。程序不改用户全局偏好；profile是明确环境前提，不是自动认证。模式答复先独立分帧，关闭与查询失败仍等待已收到的半答复结束；不能仅因allowlist存在认定GUI和独立验收已完成。

凭据使用文件的完整 UTF-8 文本，包括末尾换行、空格和 BOM；不会 trim 或规范化。`echo` 默认附加换行，与不加换行的 `printf` 结果是不同凭据。创建时检查编辑器/导出工具的尾换行设置，后续登录保留相同内容；本期没有管理员密码重置。

集成边界及生命周期见本模块 [SPEC](SPEC.md)。控制模块消费公共操作和应用内句柄，具体提供者只由 `src/assembly.ts` 选择。
