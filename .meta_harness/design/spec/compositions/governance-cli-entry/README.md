# 治理CLI入口

候选`composition.governance-cli-entry/v1`（CQ1），持续消费者为apps/cli的治理命令、机器呈现和终端适配。消费CG2交互动作，复用CG1冻结Input/Output表示，不定义治理权限、身份或本地存储规则。尚未接受，不能据此开应用实现。

[契约](v1/contract.md) · [命令表](v1/commands.json) · [验证](verification.md)。依据CLI-TUI §12。

2026-09-25：D049接受CQ1 S1～10并冻结；应用仅采用受保护文件路径，TTY候选未采用。上文候选状态为首稿历史。

CQ2 [TUI候选](v2/contract.md)与[表单](v2/forms.json)接续单次CLI；尚未采用，原CQ1接受状态不变。

2026-09-25：D051接受并冻结CQ2；旧CQ1不自动升级。
