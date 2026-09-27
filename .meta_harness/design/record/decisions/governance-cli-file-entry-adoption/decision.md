# D-049 · 治理CLI受保护文件增量

2026-09-25，主线按用户完整治理CLI/TUI授权，接受composition.governance-cli-entry/v1 S1～10规范资源；实现路径仅部分采用[CLI节点](../../../realization/apps/cli/governance.md)末节的受保护秘密文件增量。依据[CLI-TUI提案§12](../../proposals/cli-tui/governance-client.md#12-2026-09-25治理cli装配与终端边界接续)，全部命令、CG2预览、人读/机器报告与资源收场由apps/cli装配既有提供者，不新定义治理规则。

规范正文c709ffba5f46d8eb4a1f4b14a13fe60057dc3f0614c54deb70e06b25fa4f8abd、命令表f9375c3fa4e310a6469555b109f9b2caddb3960e7ff8a0be649cabd52d99f434；spec-reviewer最终无剩余表达阻断，逐命令选项、CG2条款登记、S10失败矩阵与NoEarlyEcho负控已闭合。候选字样保留原受审稿来源，接受以本决定和registry为准。[模型运行](../../evidence/2026-09-25-formal-cli-entry/README.md)r3为44个distinct states/六负控，只有抽象输入结束和实际工作完结的有限范围，不是终端安全证明。

架构reviewer已确认HOME单层、原捕获Preview、CG→CLS→输出的责任；文件路径无剩余架构阻断。文件打开采用非阻塞/不接管设备方式，fd上先核regular，再读取；秘密再核当前euid/组与其他人无权限。实际FIFO/设备拒绝仍待验证，不将O_NONBLOCK说成普通磁盘IO有界保证。

明确不采用上方TTY候选：2004模式答复不能证明内嵌end marker或模式答复来源可信。本增量不进入raw/2004，来源缺席明确tty-unsupported，不在帮助声称有交互密码。TTY/TUI仍是用户本期目标，并非删去；后续先建立支持模拟器/配置/可信输入前提或另选协议，不能用局部字符串补丁继续伪造保证。安装、部署升级、每日备份恢复也尚未完成。

plan-reviewer无计划阻断。验证分两类：真实CLI子进程+HTTPS中心+CLS的治理旅程、文件/PTY/机器管道/EPIPE；应用内部明确测试入口的确定读取/CAS停顿、CG/CLS close异常、stderr失败。后者不开放用户故障开关，不能冒称黑盒自然故障。构建完成再运行类型/测试/两平台驱动，期间不并发改dist。

本决定批准实施，不代表任何CLI已经存在、能安装或生产验收完成。正常输入策略及程序说明沿CQ1；治理结果与时限政策沿D048及中心既有决定，应用不得自行重试或改写CAS/远端事实。
