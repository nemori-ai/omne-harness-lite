# iTerm 第二终端提供路径 · 待独立审阅

输入为PF016 rev7、CQ2与D051；只扩大CQ2 §1所允许的具名profile集合，不修改领域语义或冻结规格。前身为已有终端适配器，领域性质仍是D051的可信输入分帧、未展示预览不能确认、真实结束后配对恢复；这是已有领域读数的机制扩展，不宣称新双盲。源码与实测归[精确版本研究](../../../../research/agent-harness-cli-tui/reports/2026-09-25-iterm-input/README.md)。

拟增加名称`iterm-3.7.1beta1`，只在macOS准入。用户选择表示明确采用该版本、UTF8、直接独占同一TTY、普通键和普通GUI CmdV、无会话广播/tmux/自定义字节注入/特殊粘贴；用户不在粘贴中启用keystroke passthrough或取消终端自身粘贴，不在IME未提交组合时发起粘贴、不在粘贴过程中提交IME。中文输入法只覆盖已观察的WeType Pinyin普通可打印文本提交，不能把Apple Pinyin或其他模拟器登记成实测通过。

额外前提是NoSyncTurnOffBracketedPasteOnHostChange不为true；未设置时出现提示不得选Yes/Always，不能在使用中手动关闭2004。false或明确不接受提示关闭均保持已观察的输入模式。应用不读写用户iTerm全局偏好，不假装从TERM或DECRQM推导这些前提。是否这种用户约束足以采用是本次独立评审对象；若必须可执行检查或更强配置，则先修节点，不能把未知藏进allowlist。

来源绑定：iTermPasteHelper普通清理后加括号、完整buffer分块、末块write后才dequeue普通键；PTYTextView shouldHandleKeyDown在isPasting且未passthrough时排队；PTYSession bracketedPastePending初块与后续普通写同dataQueue。源路径对不支持来源没有承诺。现有分帧器/严格UTF8/64KiB上界/原生Input256历史、修订和真实write屏障全部复用；新增profile不启额外终端模式，不借新插件改变CG/CLS拥有关系。

对账四表：①已有CQ2输入/输出/关闭性质归同一DirectTerminal，源前提由profile声明，不是协议认证；②跨进程终端字节顺序与OS恢复仍由外部终端/适配器兑现，Cordis不提供；③原xterm profile、原CG固定Use和写提交边界保持；④不增加服务/owner/状态模型，只增加一个有条件提供路径，运行环境约束是实际代价。撤除仍等inputDone、CG静止、输出真实完成，随后2004答复与termios恢复，不按模拟器名字跳过握手。断开/错误处理保持失败，不清空未完帧。

实施及验收门槛：独立架构核对精确源码顺序/自动关闭前提；采用后才改allowlist、纯help/归档README及显式支持条件。实际iTerm运行产品TUI，真实普通粘贴含伪ESC、中文IME编辑、缩窗暂停恢复、Ctrl+C/termios/2004恢复，不能以本研究原语探针顶替；新制品独立QA复验。模式/字节注入单元测试只证明适配器，不提升GUI范围。尚未采用或实施，不宣称macOS完整TUI已支持。

## R2：控制答复先分帧的修订候选

独立R1阻断成立：模式答复reporting:YES与普通键队列不同，可能插入begin/end甚至UTF8字节间。主线真实GUI源探针普通758字符粘贴收到了768字节（尾ESC[20）、11字节模式答复、2字节1~；原framer仍inPaste。本修订不再要求模式答复服从完整粘贴顺序。

拟在DirectTerminal字节入口增加仅iTerm profile启用的有界控制答复拆分器：五个精确2004 DECRQM答复是唯一识别集合，候选最多11字节；完整匹配直接交当前查询等待者，其他字节按原顺序回送既有InputFramer。新ESC使旧非匹配候选按序回送并开始新候选，因此答复可从普通帧前缀/尾/UTF8中移除，原内容的字节序保持。源普通纯文本粘贴先过滤ESC是前提，不宣称鉴别恶意脚本注入。文件URL、auto-composer和其他粘贴形态明确不支持。

拆分器在本次终端拥有期间始终生效，不随query计时器关闭；完整无等待者答复只丢弃其控制意义，不产生业务键。这样query超时不等于撤掉迟到答复的收场者。xterm继续原路径；原InputFramer的paste正文控制码拒绝不改。Terminal查询仍只接受实际pending查询的结果。

停止顺序：DirectTerminal立即关闭非控制语义事件交付，先等待拆分器当前已拥有候选变成完整答复或按原序交回普通分帧器，再调用InputFramer.stop等待原paste/首前缀。期间原InputFramer仍有界解析但不能把事件交给已关闭界面；完整mode继续用于控制握手。真实EOF让拆分器把未匹配候选交回原分帧器再触发eof；error不清候选、不充当EOF。调用stop之后才开始的新按键不排队到未来界面。恢复2004仍经过同一拆分器，实际输出和模式答复结束后才撤监听/关闭拆分器。

必须反例驱动验证：在START每个切口、END每个切口、UTF8每个字节切口插入所有5种精确答复并按每字节投递；取消时已持有半答复/半begin/半end，query超时后迟到答复，真实EOF与input error区别，64KiB丢弃仍能结束。普通模式下paste内控制答复继续invalid。真实iTerm同一源交错探针先证修复，再产品GUI和独立QA。候选只细化CQ2 S7/S11拥有者，不修改固定Use、字段、业务确认/关闭后置条件；仍须独立复审后采用。
