# 接受边界、时钟、时隙处置与 Job 执行：性质、模型与实现的对应

[CalendarScheduleBoundary.tla](models/CalendarScheduleBoundary.tla) 是接受边界的有限抽象：两个所有者、两份日历、两代环境与发布、一个语义来源请求，正常时至多一个 Job。[ScheduleClockBoundary.tla](models/ScheduleClockBoundary.tla) 是时钟消费的有限抽象：两个运行代际、单调读数 0 到 3、可以任意前后跳的民用读数 0 到 2、本地截止 2、操作的完成资格与任意唤醒。[models.json](models.json) 声明每份配置的预期，[check.py](check.py) 按它判读。性质归[包组规格](../../SPEC.md#不变式)。

这两个模型只检查安全性：没有活性与公平调度，没有次数、额度与 outbox 的原子性，没有取消与外部启动、介质耐久或分布式栅栏。次数、取消与外部启动在后两个模型里。原子的 `Accept` 是对接受协调的要求，不是已有的跨进程事务。模型与源码之间没有精化证明；有限检查的通过不等于任意规模的证明。

## 性质

| 规格不变式         | 模型性质                                        | 实现与用例                                                                                |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| INV-SJ02           | `TenantIsolation`、`AuthorityAtAcceptance`      | 管理与查询的资格核对；`queries/disclosure`、`management/application` 用例；接受侧只有模型 |
| INV-SJ07           | `EnvironmentCoherence`                          | `src/prediction/basis.ts` 的依据捕获；`prediction/dependencies` 用例                      |
| INV-SJ07           | `LatestAtAcceptance`、`PinnedVersionIdentity`   | `src/prediction/calendar.ts`；`prediction/calendar-identity` 用例                         |
| INV-SJ07、INV-SJ10 | `ControlAtAcceptance`                           | 管理决定的控制状态；接受侧只有模型                                                        |
| INV-SJ08           | `AtMostOneJob`                                  | 接受侧只有模型                                                                            |
| INV-SJ09           | `FrozenBasis`                                   | 接受侧只有模型                                                                            |
| SC-1               | `NoEpochReuse`、`NoExpiredRead`、`NoClosedRead` | `src/prediction/budget.ts` 的单调时钟与到期复核；`prediction/budgets` 用例                |

## 动作

| 模型动作或状态                                 | 实现                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `env`、`Observe`                               | `src/prediction/basis.ts` 的依据捕获；日历查询的解析                           |
| `pub`、`Publish`                               | 日历的不可变版本与当前发布投影                                                 |
| `authorized`、`active`                         | 当前资格与安排控制的布尔投影                                                   |
| `Accept`、`jobs`                               | Job 的接受与冻结（对接受协调的要求）                                           |
| `RetryOriginal`、`RecoverOriginal`、`response` | 按原语义键重试与回执恢复；只建模「已提交而回执丢失」                           |
| `epoch`、`Restart`                             | 本地时间轴；重启后不比较旧截止                                                 |
| `mono`、`Tick`                                 | `src/prediction/budget.ts` 的单调时钟                                          |
| `wall`、`WallJump`                             | 民用时间不参与耗时判断                                                         |
| `open`、`Close`                                | 这一个操作的完成资格被终止，不是服务的准入开关                                 |
| `wake`、`Timer`                                | 可重复、丢失、任意时刻的唤醒                                                   |
| `Settle`、`witness`                            | 在同一步记录资格检查时的观察；`ok` 只表示资格满足，不表示结果正确或 Job 已接受 |

## 配置预期

| 配置                      | 角色 | 预期                                             |
| ------------------------- | ---- | ------------------------------------------------ |
| `follow-latest`           | 正控 | 完整通过                                         |
| `follow-pinned`           | 正控 | 完整通过                                         |
| `explicit-latest`         | 正控 | 完整通过                                         |
| `explicit-pinned`         | 正控 | 完整通过                                         |
| `negative-owner`          | 负控 | 去掉所有者守卫，命中 `TenantIsolation`           |
| `negative-environment`    | 负控 | 去掉环境守卫，命中 `EnvironmentCoherence`        |
| `negative-publication`    | 负控 | 去掉发布守卫，命中 `LatestAtAcceptance`          |
| `negative-authority`      | 负控 | 去掉资格守卫，命中 `AuthorityAtAcceptance`       |
| `negative-control`        | 负控 | 去掉控制守卫，命中 `ControlAtAcceptance`         |
| `negative-dedupe`         | 负控 | 允许两个 Job，命中 `AtMostOneJob`                |
| `negative-freeze`         | 负控 | 去掉冻结，命中 `FrozenBasis`                     |
| `negative-pinned`         | 负控 | 去掉 `pinned` 守卫，命中 `PinnedVersionIdentity` |
| `clock-positive`          | 正控 | 类型与三条时钟不变式通过                         |
| `clock-negative-epoch`    | 负控 | 去掉代际守卫，命中 `NoEpochReuse`                |
| `clock-negative-deadline` | 负控 | 去掉截止守卫，命中 `NoExpiredRead`               |
| `clock-negative-close`    | 负控 | 去掉关闭守卫，命中 `NoClosedRead`                |

负控的「通过」表示检出了预期的缺陷，不表示错误模型满足性质。解析错误、错打的不变式、工具缺失、超时或中断都不算通过。

## 时隙处置

[ScheduleSlotDisposition.tla](models/ScheduleSlotDisposition.tla) 是一份安排的时隙与处置它们的调度者的有限抽象：至多四个时隙、一到两个调度者、一次暂停。时间只前进；调度者可以随时丢掉内存里的东西；定时器可以丢。它检查安全性，另有一条进展性质：周期扫描不依赖定时器时，每个时隙最终有结局。分拣是模型里的一个原子步，实现里候选的枚举在事务之外，由提交时核修订来守。没有依赖受阻、提醒窗口、一次性安排的错过策略与计算预算：这几样是纯判定，由契约用例守。

| 规格不变式 | 模型性质 | 实现 |
| --- | --- | --- |
| INV-SJ08 | `AtMostOneJob`、`DispositionFixed` | 接受的提交在锁内核时隙没有结局；回执按（安排，时隙）唯一 |
| INV-SJ07、INV-SJ10 | `AcceptedWhileActive`、`StoppedIsFinal` | 接受的判定核控制状态与修订 |
| INV-SJ08 | `EligibleBound`、`JobBound` | 两种次数与接受同提交 |
| INV-SJ11、INV-SJ26 | `CatchUpBounded`、`InOrder` | 心跳与看护起点；分拣的一次提交；接受时核前面没有更早的待处置时隙 |
| INV-SJ26 | `AllSettled` | 周期扫描；到点的等待只是提示 |

| 模型动作或状态 | 实现 |
| --- | --- |
| `Tick`、`now` | 时间源的墙钟读数 |
| `Beat`、`heartbeat`、`span` | 一轮开头的心跳提交；看护记录 |
| `watched`、`Resume` | 调度状态里「从哪一刻起被连续看着」；恢复暂停的管理提交 |
| `Classify`、`settled`、`disp` 的 `selected` 与 `missed` | 分拣的提交；「处置到哪了」；选中的时隙与漏过区间 |
| `Prepare`、`prep` | 事务之外的准备：候选、依据、执行方的前提、资格 |
| `Commit`、`Abort` | 接受的提交；锁内核对不过时退出 |
| `open`、`Conclude` | 主动作还没收场的 Job；收场 |
| `Crash` | 调度者丢掉内存里的准备与本轮的时刻，耐久状态不变 |
| `seen`、`lapsed`、`episodes`、`fixed`、`accepts`、`acceptCtl` | 只为陈述性质而记的事实，实现里没有 |

## Job 执行

[ScheduleJobExecution.tla](models/ScheduleJobExecution.tla) 是同一份安排前后两份 Job 与执行方的有限抽象。`st`、`out`、`stop` 是协调记下的；`ex`、`starts`、`goal` 是执行方那边真实发生的。它只检查安全性。三个环境前提写在模型里：接受是一次原子的提交；进程结束时它发出而没有到的调用也没有了（`Crash` 清掉 `flight`）；执行方对同一份 Job 的开始是幂等的，执行收场之后再来的开始也认回原来那一份。

| 规格不变式 | 模型性质 | 实现 |
| --- | --- | --- |
| INV-SJ13、INV-SJ21 | `StartAtMostOnce`、`RunningIsReal` | 开始的意图先落库；执行方按 Job 的身份认回；只有执行方答执行中才记为开始 |
| INV-SJ18、INV-SJ19 | `CancelIsReal`、`OutcomeFixed` | 「开始未定」时取消只记意图；收场之后结局不改 |
| INV-SJ14 | `SuccessHasEvidence`、`FailureIsReal` | 收场的结局表；执行方答不知道时不收场 |
| INV-SJ12、INV-SJ18 | `StopIsReal`、`PredecessorEnded` | 停止状态只有执行方报告才到已确认；前序安静只认已收场 |

| 模型动作或状态 | 实现 |
| --- | --- |
| `Accept`、`Release` | 接受时按重叠策略定新 Job 的初态并给前序记停止的意图；前序都收场后放行 |
| `Intend`、`Issue`、`flight` | 开始的意图落库；调用执行方的 `start`；在途的调用 |
| `ExecStart`、`ExecRefuse`、`ExecFinish`、`ExecStop` | 执行方那边：承接、不承接、结束、停下 |
| `LearnStarted`、`LearnNotStarted`、`Record` | 协调按 `inspect` 的答复落库 |
| `Cancel`、`SendStop`、`StopUnknown` | 取消命令；`requestStop`；执行方答不知道 |

## 时隙处置与 Job 执行的配置预期

| 配置 | 角色 | 预期 |
| --- | --- | --- |
| `slot-positive-controls`、`slot-positive-catchup`、`slot-positive-two-scanners` | 正控 | 完整通过 |
| `slot-positive-live` | 正控（进展） | 完整通过 |
| `slot-negative-dedupe` | 负控：提交不核时隙有没有结局 | `AtMostOneJob` |
| `slot-negative-control` | 负控：提交不重核控制与修订 | `AcceptedWhileActive` |
| `slot-negative-eligible` | 负控：跳过不计合格次数 | `EligibleBound` |
| `slot-negative-joblimit` | 负控：不核 Job 次数 | `JobBound` |
| `slot-negative-paged` | 负控：分拣不封住区间 | `CatchUpBounded` |
| `slot-negative-gap` | 负控：心跳断了不改看护起点 | `CatchUpBounded` |
| `slot-negative-resume` | 负控：恢复暂停不更新看护时刻 | `CatchUpBounded` |
| `slot-negative-order` | 负控：提交不核更早的待处置时隙 | `InOrder` |
| `slot-negative-backfill` | 负控：跳过之后从错过的里补位 | `DispositionFixed` |
| `slot-negative-revive` | 负控：结束的安排被恢复 | `StoppedIsFinal` |
| `slot-negative-timer` | 负控：只靠定时器，没有周期扫描 | `AllSettled` 被打破（清单里记 `temporal`） |
| `job-positive-wait`、`job-positive-replace`、`job-positive-parallel` | 正控 | 完整通过 |
| `job-negative-restart` | 负控：重试用新的身份开始 | `StartAtMostOnce` |
| `job-negative-running` | 负控：调用发出就记为开始 | `RunningIsReal` |
| `job-negative-cancel` | 负控：「开始未定」时取消立刻记已取消 | `CancelIsReal` |
| `job-negative-goal` | 负控：一轮结束就记成功 | `SuccessHasEvidence` |
| `job-negative-unknown` | 负控：不知道记成失败 | `FailureIsReal` |
| `job-negative-confirmed` | 负控：停止送达就记已确认 | `StopIsReal` |
| `job-negative-stop` | 负控：停止送达或未知就当前序安静 | `PredecessorEnded` |
| `job-negative-overwrite` | 负控：收场之后取消改写结局 | `OutcomeFixed` |
