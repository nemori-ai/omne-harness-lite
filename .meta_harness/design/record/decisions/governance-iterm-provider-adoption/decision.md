# D-054 · iTerm 第二终端及控制答复拥有者

2026-09-25，主线按用户Mac/Linux治理CLI/TUI闭环授权，依据[候选A接续](../../proposals/cli-tui/governance-client.md)、[R1反例与R2独立评审](../../proposals/cli-tui/review.md)，接受[节点R2](../../../realization/apps/cli/iterm.md)，SHA256 7f401784727a5e2b517143d56d818b349d001605434fa1c6660615cdd96faae8。仅扩具名iterm-3.7.1beta1提供路径，CQ2 S7/S11性质不变，冻结契约不改。

沿D051最小适配器A，不切换为canonical菜单B或外层拥有者C。iTerm精确版本的普通纯文本粘贴/普通键与WeType Pinyin可打印提交采用具名环境前提：UTF8直接独占TTY；无特殊粘贴、文件URL/auto-composer、broadcast/tmux、自定义控制注入、passthrough或终端取消粘贴，IME组合与粘贴不并发。NoSyncTurnOffBracketedPasteOnHostChange不得true，未设置时不接受Yes/Always关闭2004；应用不读写全局偏好或从TERM猜认证。

R1只加allowlist被否决：真实合法DECRQM可拆散paste尾。R2在iTerm路径先以最多11字节的控制拆分器移除精确答复，再交原分帧器，整个拥有期持续收场。停止立即关闭业务事件，排上层既有候选后等待原输入帧；恢复失败/超时也不能丢半答复或以计时器称静止。EOF可以终结，input error不可以。xterm既有路径和业务CG/CLS不变。

[真实原语反例](../../../../research/agent-harness-cli-tui/reports/2026-09-25-iterm-report-interleave/README.md)与[正常粘贴/IME源观察](../../../../research/agent-harness-cli-tui/reports/2026-09-25-iterm-input/README.md)只证明各自有限输入，不能代替产品TUI。采用前独立架构R2无阻断，源码/所有切口反例、真实GUI产品、缩窗/恢复与新制品独立QA仍需完成；本决定只准实施，不是完整Mac支持验收或最终fable review。
