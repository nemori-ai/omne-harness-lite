# 形式模型与规格的对应

模型 `models/handoff/NotificationHandoff.tla` 守 [Notification 规格](../../SPEC.md#不变式)里能用有限状态穷举的那几条。跑法：`TLA2TOOLS_JAR=<钉住的 tla2tools.jar> python3 check.py`。范围与没有覆盖的东西写在 `models.json` 的 `scope`。

三个正例：`one-recipient`（两个事件共用一个替换键，都强）、`no-replace-key`（没有替换键，两条通知可以同时没了结）、`two-recipients`（两个收件人互不干扰）。八个变异各改模型里的一处，只查它对应的那条不变式，必须变红。

| 模型里的不变式 | 规格里的不变式 | 变异：改掉什么它应当变红 |
| --- | --- | --- |
| `OneNotificationPerRecipient` | INV-NO03 | 去掉认回 |
| `AcceptedIsBoxed` | INV-NO02 | 入箱不在接下的那次提交里 |
| `OneLivePerKey` | INV-NO06 | 顶替时只标没了结的旧通知 |
| `OneInputPerUnit` | INV-NO14 | 重投时换一个提交标识 |
| `OneUnitPerStrong` | INV-NO14、INV-NO30 | 不记一条强通知进过哪个单元 |
| `BeatCarriesAllLive` | INV-NO18 | 节拍只带上一拍之后新来的 |
| `NoEmptyBeat` | INV-NO17 | 箱空也形成单元 |
| `StrongPaced` | INV-NO19 | 去掉最小间隔的判断 |
| `DeliveredIsReal` | 投递记成功时会话里确有那条输入 | 没有变异 |

模型里的名字与规格的对应：`accepted` 是已接下的发送；`count` 是一个收件人箱里这次发送留下的通知数；`resolved` 与 `superseded` 是通知的了结与被顶替标记；`units` 是投递单元；`log` 是会话日志里由本组送进的输入，`sub` 是提交标识；`lastStrong` 是一个去处上一个强单元形成的时刻；`beat` 是下一拍的序号。

模型没有覆盖：通知订阅与收件人的选择；资格；一个收件人有几个去处；退避重投与「投递受阻」；持续事项；「强通知最终被投」这类活性。这些只有文字与实现时的用例守。
