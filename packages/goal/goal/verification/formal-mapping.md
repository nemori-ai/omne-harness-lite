# 形式模型与规格的对应

模型 `models/Goal.tla` 守 [Goal 规格](../../SPEC.md#不变式)里能用有限状态穷举的那几条。跑法：`TLA2TOOLS_JAR=<钉住的 tla2tools.jar> python3 check.py`。范围与没有覆盖的东西写在 `models.json` 的 `scope` 里。

两个正例：`attended`（目标的主人是会话里的人）、`unattended`（主人是建立者，由它设、取消、中止；无人值守的会话里的目标，与建立者在有人值守的会话里设下的作业目标，都是这一例）。常量 `Attended` 说的是目标为谁而立，不是会话里有没有人。九个负控各经常量 `Faults` 打开模型里的一处毛病，只查它对应的那条不变式，必须变红。

另两个正例 `examined-attended`、`examined-unattended`：正文里有一条要等的判据。`epoch` 是干活的 agent 写文件的次数，对应规格里「最后一次写文件的位置」；`batch` 是交给查验一方的那一批，带着它交出去时的目标、修订号与 `epoch`；`exam` 是交回的读数，带着查验的一方当时看的是哪一批；`exams` 是用掉的查验次数。查验一方的读数取它交回那一刻的真相，或「判不了」：模型管的是批的更替、写文件、修订与交回之间的先后，不管查验的一方查得准不准。这两个正例只开一个目标、一次修订。

| 模型里的不变式 | 规格里的不变式 | 负控：打开什么毛病它应当变红 |
| --- | --- | --- |
| `SettledOnce`、`OutcomeMatches` | GL-2 | `settle-twice`：已收场的目标还能再取消 |
| `AchievedIsFresh` | GL-3 | `stale-revision`：落结局时不核修订号 |
| `NoSilentPass` | GL-5 | `stale-pass`：观察过期时放行这一轮 |
| `CountedOnce` | GL-6 | `replayed-round`：记一轮时不核轮数；`duplicate-reminder`：会话对同一个身份的提醒不去重 |
| `RoundsBounded` | GL-7 | `no-budget`：不算预算 |
| `NoPauseUnattended` | GL-8 | `pause-unattended`：没有人的会话里判定也暂停 |
| `NeverByAgent` | GL-9 | `agent-pause`：给 agent 一个暂停命令 |
| `CardIsCurrent` | GL-10 | `stale-card`：确认卡片不核起草时的修订号 |
| `ExamBeforeAchieve` | GL-13 | `skip-exam`：不等查验就落达成；`stale-exam`：写过文件之后旧的读数还算数；`stale-submit`：不是在等的那一批也算数；`no-epoch-check`：落结局时不核最后一次写文件的位置 |
| `BatchOnce` | GL-14 | `resend`：那一批已经交出去了还再交一次 |
| `ExamsBounded` | GL-15 | `no-exam-budget`：不算查验的次数 |
| `OnlyExaminerReads` | GL-16 | `worker-submit`：给干活的 agent 一条交读数的命令 |

模型里的名字与规格的对应：`state` 是目标的状态；`gen` 是这个会话的第几个目标，`rev` 是修订号，`round` 是已用的轮数；`obs` 是一次在途的观察，带着它开始时的目标、修订号与轮数；`lastObs` 与动作 `Replay` 是扩展调用在崩溃之后的重放；`reserved` 是本组记下的轮，`accepted` 是会话受理过的提醒；`card` 是一张确认卡片；`runAlive`、`runDied` 是那一轮；`cause` 是最近一次状态变化是谁引起的。

要等的判据在实现里的名字（都在 `goal-contract`）：`epoch` 是观察与一批的身份里的 `written`，取会话里最后一次写文件的那次调用；`batch` 是记录里的 `examination.batch`，身份 `BatchKey` 是修订号与 `written`，目标由记录自己定；`exam` 是 `examination.read` 里每条判据最后一次读数与它的身份，`awaitedReading` 把它读成规格那张读数表；`exams` 是 `examination.used`。`Verdicts` 的 `wait` 与 `examine` 是 `rule` 的第 2 行，`hand` 为空是等、不为空是交出这一批；`ObsCurrent` 是转移表里观察那一格的四项比较；`ExaminerSubmit` 是 `evidence`。七个负控在实现上各改一处都要变红：`skip-exam`、`resend`、`no-exam-budget` 改在 `verdict.ts`，`stale-exam` 改在 `awaited.ts`，`stale-submit` 改在 `observe.ts`，`no-epoch-check` 改在 `transition.ts`，`worker-submit` 改在工具的命令表。

模型没有覆盖：一批里有几条判据；查验会话与它的花费；复跑的程序；正文的内容与校验；指标、读数与差距表；退出的种类与算成功还是失败（GL-4）；进展清单；决策调用与它的失败；停滞的计数；卡片的创建；几个会话。判定的结论取自观察开始那一刻的真相，所以模型不说明判定判得准不准，那归评测台。没有查活性，也没有到实现的精化证明。
