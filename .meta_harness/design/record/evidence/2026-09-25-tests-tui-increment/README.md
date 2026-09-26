# D051治理TUI实现增量 · 主线运行

这是主线实际执行记录，不是独立QA或完整生产接受。CQ2由D051接受，源快照source.tar.gz含应用、参与包、锁、补丁、冻结规格和复跑脚本；115项CLI/TUI/打包测试通过，类型检查及20条结构规则通过。精确原始日志保留，包括失败迭代。

覆盖：34表单与冻结CQ1/EC2精确Intent/字段/秘密槽一致；setup四动作与固定Use三十动作分责；完整可见预览/全部页面后才确认、旧修订与小窗口不能放行、输入突发不丢字符、忙碌键不重放；一份在途输出及一份最新待画状态、实际write结束前不归还；严格UTF8、补充平面字符、控制文本、64KiB粘贴容量与超限排空、跨块begin/end、取消后未完前缀仍归原输入、未知长控制序列丢弃；安装包公共Input的撤销历史实测256。

macOS真实PTY子进程：正常退出、SIGTERM、粘贴未完时SIGTERM（必须等真正尾帧）、不支持模式时拒绝，OS属性逐项还原。模式答复由驱动合成，不能当真实模拟器/IME。最初临时目录带/var软链被CLS拒绝，驱动改为realpath；没有放宽产品安全路径。

真实中心+TUI：正式keygen/serve、HTTPS、新测试TLS材料、真实时钟/默认scrypt成本；通过TUI注册、登录、建组织、切身份、退出。初始当前身份与收件箱读使用固定Use；CLI现读核切换结果及退出失效。每次PTY均核OS属性与2004恢复、输出无测试凭据。r1驱动误写Creation key，与实际标签Creation reference不符而超时；r2修驱动标签后通过，未改期望或产品。随后仓库外实际制品重复旅程通过（tui-host-artifact-r1）。不是全部31路由逐一真实按键执行，字段映射全覆盖与已有CLI/CG业务验证须分开读取。

真实XTerm379：Linux arm64固定Node24.21镜像、Xvfb、显式allowPasteControls=false，xdotool普通键入退出菜单；子进程退出0，父进程核前后stty一致。实际普通粘贴信任与同步队列证据沿既有终端研究，不从本次普通退出新增推断。Mac iTerm/IME没有本次通过结果。

制品BUILD_ID c4d55a5635b39ac5f22bf8409ebd8bbb40b3242bee226e8f1861c69fcb033d8e，归档SHA256 04f2c123ff1de3b65cb8bff4d6ec476ea5054c7b8ef8c82dd73088dab37da8e7。4354项文件/相对内部链接完整重算，清单与BUILD_ID一致，无本地登录库/凭据；真实解包Input运行1000次独立编辑后1000撤销保留744字符，证明256补丁实际在发行物中，forms/Schema与冻结源逐字节一致，tui --help脱离仓库启动。不是只检查锁或源码补丁。

独立QA两次启动、源码架构review一次启动均被宿主拒绝（refresh token revoked）；没有执行或返回审查结论，不能把先前设计评审当源码独立验收。仍缺：独立实际装配验收、Mac模拟器/IME、完整Linux/macOS制品TUI矩阵、更深入真实resize/背压交错；中心服务管理、每日备份/隔离恢复也未交付。本增量无发布/安装操作。

复跑：Node24.21.0/pnpm10.28.1安装冻结锁并构建后，执行CLI的test/typecheck与lint:rules。tui-pty.py取node绝对路径；TMPDIR=/tmp node tmp/production-cli-onboarding/tui-host.mjs <新输出.json> [仓库外app/dist/main.js]，需python3/openssl。XTerm脚本在专用Linux容器/work仓库下，以xvfb-run -a运行，需xterm379、xdotool；只能在测试专用显示器/容器执行，不控制用户桌面。中心仍来自仓库构建，客户端制品来自本包。运行时不并行改dist。
