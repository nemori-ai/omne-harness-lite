# CLI开发入口

从仓库根执行 `pnpm install --frozen-lockfile` 与 `pnpm build`，然后 `node apps/cli/dist/main.js --help`。工具链版本归[开发指南](../../docs/development.md)。正式治理动作是center add、tenant create、tenant add和tenant switch；账号动作包含login、register、logout、logins list／revoke及credential change。具体参数见帮助，行为归本应用[SPEC](SPEC.md)。

非TTY治理命令须使用 `--json` 并给齐必要输入，TTY中的JSON模式也不补交互答案。TTY中不带JSON的治理动作补齐缺输入并确认。发行装配要求显式部署环境输入 `OMNE_TERMINAL_PROFILE=xterm-379`，该配置要求XTerm379、`allowPasteControls=false`、直接且独占的真实TTY，普通键盘与普通剪贴板粘贴。缺少或不支持的配置拒绝进入交互，JSON命令不要求终端配置；不能仅凭TERM变量认定支持。至少60列16行，身份过长时按提示扩大窗口。PgUp/PgDn翻页，写操作完整显示预览后明确确认；Ctrl+G取消当前步骤，Ctrl+C退出。单独Esc不作取消键，避免把迟到的粘贴前缀误认成取消；已开始的粘贴须实际完成才能归还终端。

中心先经实际公共体检，再确认身份和信任指纹。租户候选及收到的邀请来自当前账号对应的实际中心；选择后由业务动作重新核资格。创建或添加租户不自动切换，注册不自动登录，登录不建Session。秘密字段只输入权限受保护的凭据文件路径，不输入凭据本身。会话解析面包含裸入口、`--session`及`--message-file <path> --json`；裸入口准备身份与模型配置，再启动或附着当前租户的独立宿主；`--session`附着指定会话。B01正式支持Linux；macOS留待后续实现和实机验收。不能把原语探针或PTY结果外推为任意终端支持。

生成本地可搬运归档：`./scripts/package-cli.sh /absolute/new/omne-cli.tar.gz`。输出父目录须已存在，目标文件不得存在；先完成CLI依赖构建，再从本机pnpm存储离线收集生产依赖。部署沿用根工作区的原生构建白名单，并在发布前从部署目录加载实际Host的node-pty；缺失原生模块则打包失败。当前Shell要求Linux、可用的systemd用户管理器及scope、/usr/bin/env、/usr/bin/stty和/bin/bash。执行期间不要并发修改源、锁或dist。命令只写指定新归档和自有暂存，不安装、不上传、不读取CLI登录目录。归档附运行说明、文件/软链清单和BUILD_ID；`--version`显示该标识，仓库构建无标识时显示development。

已配置并运行的租户宿主支持`omne --message-file <path> --json [--session <session-id>]`。
消息文件须是完整JSON UserMessage。带Session时提交与观察既有会话；未带时读取宿主的实际创建偏好，
可靠创建后再提交消息。配置缺失不创建；创建结果不明保留原请求，不重发或提交消息。
客户端退出只结束等待，不停止宿主原工作。裸终端使用独立宿主，官方会话定义包含Shell。
工具成功结果显示输出、退出状态和截断计数；原日志和模型输入不受显示处理影响。具体状态与退出码见[SPEC](SPEC.md)。

使用可信渠道取得归档及摘要，在新空目录解压，预装要求的Node版本后执行 `node <目录>/app/bin/omne.js --help`。推荐将代码放在 `~/.local/share/omne/builds/<BUILD_ID>/app`，并将 `~/.local/bin/omne` 链接到其中的 `bin/omne.js`。将 `~/.local/bin` 加入PATH后直接运行 `omne`。归档README提供完整命令；安装目录或命令链接已存在时不覆盖。代码升级用另一个新目录，沿用明确的 `--home <绝对路径>`；保留旧代码不保证能读取新格式状态。状态根依次选用显式home、OMNE_HOME或当前用户的~/.omne，根配置为config.sqlite，每租户有独立中心／租户绑定与auth目录。构建异常可能留下暂存；若已完成发布，后续输出失败仍可能留下有效归档，应核摘要，不能直接重跑覆盖。

应用装配实际CG、CLS与HTTPS传输；成员`test`／`typecheck`用于开发验证。CLI退出码区分完成、拒绝、不可用、不明与缺陷，原业务成功不能覆盖关闭或终端恢复失败。旧文件CLI或原终端的历史平台结果不能代替当前正式入口的部署、GUI／IME和备份恢复验收。提供者识别终端配置也不表示真实终端矩阵已验证。

B01的正式终端配置为Linux上的XTerm379。底层保留的iTerm配置属于后续平台准备，不构成macOS产品支持。

凭据使用文件的完整 UTF-8 文本，包括末尾换行、空格和 BOM；不会 trim 或规范化。`echo` 默认附加换行，与不加换行的 `printf` 结果是不同凭据。创建时检查编辑器/导出工具的尾换行设置，后续登录保留相同内容；本期没有管理员密码重置。

集成边界及生命周期见本模块 [SPEC](SPEC.md)。控制模块消费公共操作和应用内句柄，具体提供者只由 `src/assembly.ts` 选择。

已有宿主运行时，重新执行 `omne` 或 `omne --session <id>` 会复用该宿主的初始模型，不重复模型和凭据准备。已有通道异常时明确失败，不强占运行库或重建宿主。
