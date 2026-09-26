# D-051 · 治理TUI交互入口

2026-09-25，主线按用户完整治理CLI/TUI设计开发授权，接受composition.governance-cli-entry/v2 S1～12及其表单/Schema/模型，保留CQ1旧消费者。依据[CLI-TUI§14](../../proposals/cli-tui/governance-client.md)候选A、[节点tui.md](../../../realization/apps/cli/tui.md)受审快照6478bad292a96d2ecf14943b5fbda6caf2258d13ef2a2ef037292bd8edb3e618。正文2d31eb40d7b2a0fcab7c081c3c1600fcd7b4b3fe22b1fcf63eb8b81642e4c0ee；候选字样作为受审稿原文保留，状态以本决定和registry为准。

采用公共pi-tui0.86.1 Input/宽字符/普通键组件与应用拥有的最小终端适配器；精确包为@earendil-works/pi-tui，允许项目单点UndoStack 256快照补丁，字段64KiB、单Input、无kill/yank。没有采用默认ProcessTerminal/TUI生命周期或另立领域服务。首次支持profile命名xterm-379，前提为该版本、allowPasteControls=false、直接PTY、独占输入与普通键/普通剪贴板粘贴。用户选择profile不是模拟器或输入来源认证。

[实际终端研究](../../../../research/agent-harness-cli-tui/reports/2026-09-25-tui-terminal-boundaries/README.md)限定证明XTerm379普通粘贴正文过滤、真实begin/body/end同步入队及DECRQM/termios配对；来源版本和失败记录均保留。Mac iTerm创建窗口AppleEvent超时，无实际验证；Mac/Linux是最终目标，首个Linux profile的采用不删Mac要求、不冒称TUI交付完整。特殊保留控制码粘贴、脚本注入、复用器、任意模拟器不在该profile前提内。秘密沿CQ1受保护文件，未提供TTY键入凭据。

阶段分责：setup无Use，configure/health/register/login至多一次根动作后退出；治理持有固定Use只invoke/logout，根health不能暗换绑定。初始/明确刷新S36/S57/适用S60；全部34表单、原捕获Preview、完整可见后确认、S37 Ack后现读身份。应用不自行授权、CAS、换登录或重放。关闭必须等输入帧、CG实际静止、在途输出结束，再恢复本次模式/OS属性，最后CLS。

独立architecture-reviewer与spec-reviewer本范围最终无阻断；阶段边界、CG正常失败集合不由代码扩张、256undo与输出所有权已闭合。计划另经plan-reviewer，只读评审不等于接受或实际验证。[形式与表单运行](../../evidence/2026-09-25-formal-tui-delivery/README.md)正配置112状态、五反例、39Schema例，仅其有限范围；模型未验证setup、真实终端/IME与异常关闭。

本决定批准按该范围实施，尚无产品TUI源码或验收。真正应用、全部表单与真实CG/中心/CLS组合、实际PTY/模拟器恢复、Linux/macOS及最终制品仍须交付。已完成CLI/打包证据继续有效，不因新增TUI推定可生产部署；中心服务管理与每日备份/隔离恢复仍为独立后续工作。
