# D051-r3 TUI修复、独立验收与Mac/Linux互联

2026-09-25，Node24.21.0/pnpm10.28.1。源码/冻结规范/输入脚本随source.tar.gz；原始运行随runs.tar.gz；固定CLI与实际中心闭包随归档。当前CLI BUILD_ID `a22d9a120e14f841d615b8de4fff08cd922a49de1fdfd0dde111b05935e9019d`，归档SHA256 `90f5b283673d8ec9a66cfa86b3d2faae914fe5a8e9c1c4541dc5e1e87d4077dd`，4358清单项逐一核对。主线126项应用/工具测试、类型检查和20条结构规则通过。

独立QA的[完整判决](independent-qa.md)为Unable to verify完整TUI，所执行53个观察通过：34表单逐项在真实TUI进入原CG Preview并核字段/Intent，秘密文件登录/拒绝0644/主动改密3场景，生命周期4、纯入口5、真实中心治理旅程4、真实PTY缩放/背压2和旧修订确认1。表单预览不是全部目标操作成功，真实模拟器/IME也不由合成PTY替代。报告中的任务区相对路径须到runs.tar.gz里的tui-qa展开读取；原r1/r2失败与各测试设施错误保留。

修复范围：不再以ESC超时结清粘贴前缀，Ctrl+G取消；stdin错误不等同EOF、同步setRawMode错误与stdout非回调错误不能伪报恢复；无CG报告的信号取消返回2；S37只有成功Ack才附带现读S36，取消/拒绝不多访问。后者由独立QA在r2真实中心复现并在r3复验，主线新增成功/取消/拒绝三条应用回归。r1的115项通过不能覆盖这些反例，旧证据不改写。

主线跨系统：两个独立新中心分别位于Docker Linux arm64和macOS arm64，每个中心均由Mac与Linux两个独立状态客户端经真实验证HTTPS访问。最终r3客户端在linux-center-r3、mac-center-r2两组通过邀请/角色/权限/隶属治理、并发身份隔离、改密、撤销和退出；SIGTERM与SIGKILL后状态保留，停机时读取不伪报在线、写失败不在恢复后重放。Mac TUI真实PTY也访问Linux中心并恢复终端，模式回复为测试脚本。容器客户端只挂客户端制品和本地目录，不挂中心数据库或私钥。端口只在Mac回环发布，反向经host.docker.internal抵达Mac回环服务；这是Docker Desktop虚拟机网络边界，不是两台物理机或公司DNS/防火墙验收。

跨系统首轮linux-center-r1的坏CA断言错误保留：先已有可信绑定，再失败替换CA，原绑定按CG契约保留，随后登录仍能请求原中心。修正测试为全新目录坏CA配置被拒、无配置登录不能发送；没有改产品或弱化信任保证。后续两轮成功分开保存。

主线Linux实际终端：XTerm379/Xvfb、allowPasteControls=false、UTF8、普通PRIMARY粘贴和xdotool按键；输入带CJK/组合字符/emoji及伪尾ESC，真实终端过滤正文ESC；窗口过小暂停、放大恢复、Ctrl+C exit2、2004与termios恢复。r3探针未启用UTF8致文字转换而失败，r4显式-u8与LC_ALL=C.UTF-8后通过；两份原始记录均保留。stdout只做透明记录，write回调与真实TTY未替换。未验证逐单元格渲染/字体和IME，不能宣称Mac模拟器通过。

运行复现：展开对应制品到新目录，cross-os/run.mjs的hostApp/cli路径分别指向归档；在Mac Node24用TMPDIR=/tmp运行linux-center或mac-center并给新证据目录，须Docker Desktop/Python3/OpenSSL。固定Linux镜像node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6。QA脚本及其帮助/调用留runs，修改路径后新建run，不覆盖本包。XTerm脚本只在专用容器显示器运行，实际apt依赖版本在日志。主线未上传、安装真实服务或触及用户中心数据。

尚缺：Mac真实模拟器/IME、第二模拟器、全34目标成功语义独立逐项验证、最终宿主分发/服务管理、每日备份与隔离恢复。安全再开放及整机损毁灾备仍沿已接受产品边界。本包不是最终生产接受，用户指定的最终Claude Code fable 5.1 code review在全目标完成之后，尚未执行。
