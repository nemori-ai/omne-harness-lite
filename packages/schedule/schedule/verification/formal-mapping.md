# 接受边界与时钟：性质、模型与实现的对应

[CalendarScheduleBoundary.tla](models/CalendarScheduleBoundary.tla) 是接受边界的有限抽象：两个所有者、两份日历、两代环境与发布、一个语义来源请求，正常时至多一个 Job。[ScheduleClockBoundary.tla](models/ScheduleClockBoundary.tla) 是时钟消费的有限抽象：两个运行代际、单调读数 0 到 3、可以任意前后跳的民用读数 0 到 2、本地截止 2、操作的完成资格与任意唤醒。[models.json](models.json) 声明每份配置的预期，[check.py](check.py) 按它判读。性质归[包组规格](../../SPEC.md#不变式)。

两个模型都只检查安全性：没有活性与公平调度，没有次数、额度与 outbox 的原子性，没有取消与外部启动、介质耐久或分布式栅栏。原子的 `Accept` 是对接受协调的要求，不是已有的跨进程事务。模型与源码之间没有精化证明；有限检查的通过不等于任意规模的证明。

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
