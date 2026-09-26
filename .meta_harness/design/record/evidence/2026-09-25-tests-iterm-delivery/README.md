# D054 iTerm控制分帧与治理表单独立增量验收

2026-09-25。新源码、冻结契约和探针随source.tar.gz，所有运行及两轮独立QA完整报告/驱动/失败尝试随runs.tar.gz，保持原目录可解包阅读。新CLI归档SHA256 `4fd9f7c946b1cc1f5472728568025969469524a3b54e743c0cf39597d345c131`、BUILD_ID `ee664ae701a2e8b398ccd029d28cf2408658ddd6e2efe4f1753bbfeaf787cc6a`；逐项审计4362文件/软链、无额外成员、无运行数据/凭据或artifact-builder。Node24.21.0/pnpm10.28.1。主线133项CLI测试、types、20条结构规则通过，不声称全部工作区在本增量重新运行。

D054实现iTerm profile专用最多11字节控制答复拆分器，完整2004答复先移除，其余字节按原序交原framer；stop先停止业务事件并排当前候选，restore超时/失败也不丢半答复。原xterm路径保持。所有begin/end及UTF8切口插五种回复、原768+11+2反例、取消/EOF/error/超限反例通过；架构/计划/源码独立复核无阻断，不代实际验收。

独立D053 r4（tui-qa-r4/report.md/json）判Pass with issues，仅真实治理成功语义增量：38次TUI调用覆盖30/30治理表单，35成功与3精确拒绝；原31路由映射及4个setup表单另有D051-r3证据。真实中心后验包括邀请/隶属全部终结、唯一超管保护、撤销登录、改密旧凭据失效、新凭据同账号、logout及S37后S36现读。该轮使用旧D053固定CLI与中心，其制品归[既有固定包](../2026-09-25-tests-host-startup/README.md)；未被D054源码替换。原oracle错误/尝试和清理证据保留，不能把纯预览当成功。

独立D054 r5（tui-qa-r5/report.md/json）判Pass with issues，仅4项增量，严格汇总exit1：实际iTerm3.7.1beta1产品GUI 8/8通过（普通CmdV过滤/Unicode、WeType Pinyin你好、缩窗/恢复、CtrlC与2004/termios恢复）；真实PTY startup/restore两项半答复均超过实际query timeout仍持输入，后续完成才恢复；精确分块PTY也通过。实际iTerm额外查询插paste尾三次中两次命中且都保持完整正文/恢复，一次未命中，QA自行发的额外query尚未等答复就restore而失败，记录为设施/时序问题，未判产品缺陷或纯Pass。不可把条件交错的2/2写成三次全通过。

QA前三次GUI驱动把相对证据路径交给新iTerm进程，窗口创建后探针失败；修订采用绝对路径/逐参数shell quoting后，一次又把app目录当JS入口，随后真实产品场景通过。失败、未知stderr的限制和新fixture版本均保留，不覆盖或扣掉失败。自建窗口/进程已清理，剪贴板只内存暂存并在未被别人改动时恢复；报告未记录用户剪贴板。原始精确交错反例归[独立研究](../../../../research/agent-harness-cli-tui/reports/2026-09-25-iterm-report-interleave/README.md)，未混称产品启动时机复现。

主线另在新制品真实Linux XTerm379/Xvfb、UTF8/allowPasteControls=false完成普通PRIMARY粘贴Unicode+伪ESC、缩窗暂停/恢复、CtrlC退出2与termios/2004恢复；同场景旧脚本文件名仍r4，实际制品为D054，运行目录tui-xterm-d054-r1-evidence。新Mac产品GUI同项通过（tui-probe/mac-product-r1.json）；产品自动退出后再次关测试窗返回不存在，先前实际观察和恢复已完成，无遗留该窗。startup/restore超时PTY主线与独立QA分别有结果，不互相代验。

接受与限制：profile只限已采用精确模拟器/普通纯文本来源及配置，不认证任意脚本/特殊粘贴/复用器/文件URL/自动composer，不覆盖所有macOS终端或Apple Pinyin；没有逐单元格字体视觉oracle。不同制品的累积证据按源码变更范围消费，不将r4旧制品自动重标新版本。完整服务管理/每日备份/隔离恢复仍未实现；本包不构成第一版生产整体完成。最终Claude Code模型别名fable，须全目标完成后执行，尚未执行。没有提交、推送或真实中心部署。
