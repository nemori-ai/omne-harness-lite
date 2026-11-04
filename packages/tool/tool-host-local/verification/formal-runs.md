# 启动围栏与推送退避模型的运行记录

本页记录 [StartFence.tla](models/StartFence.tla) 与 [DeliveryBackoff.tla](models/DeliveryBackoff.tla) 的 TLC 运行。性质与映射见 [formal-mapping.md](formal-mapping.md)。

结论只在所列常量范围内成立。它不是证明，也不表示源码符合模型。原始日志不进本包，保存在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`。入口 [run-tlc.sh](models/run-tlc.sh)，它先把模型和配置复制到 WSL 自己的文件系统，跑完再把日志复制回任务目录 |
| JDK | Temurin `21.0.12.1+1` |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先；`-workers 4`；`-Xmx4g`；`-XX:+UseParallelGC`；`-deadlock`（不检查死锁）；配置里 `CHECK_DEADLOCK FALSE` |
| 预算 | 每个配置 600 秒。全部在预算内结束，没有缩小范围 |
| 运行时间 | 2026-11-04（北京时间） |

调用命令（Git Bash；`MSYS_NO_PATHCONV=1` 防止改写 `/mnt/...`）：

```sh
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 --exec bash -l -c \
  'bash <WSL 视角的工作树>/packages/tool/tool-host-local/verification/models/run-tlc.sh <WSL 视角的工作树> <WSL 视角的输出目录>'
```

## 输入摘要

| 文件 | SHA-256 |
| --- | --- |
| `StartFence.tla` | `10505a1778674697a2adf88e7c8bbb7a1c8937ba31726de8e7a49064c62d2778` |
| `StartFence.cfg` | `90b9bc93cd2e4a5d6c6850171aa3cf460d4da1070d7a83d3a47ce62ff4e52ede` |
| `StartFence-wide.cfg` | `d974286be99a36b26f6c2dece408630c18c89a8e9a32563edf45586870f3ba71` |
| `DeliveryBackoff.tla` | `ceb19c3a0236ab1dc164d4805bf96bd0307a30f86cd830cf26da264dce9cbcc5` |
| `DeliveryBackoff.cfg` | `552ee48a1f29f6ebbf24aa9ae9ff73040192f5b9fbe5bdd9e4e56acc8d745d1a` |

## 常量范围

- `StartFence.cfg`：MaxPrepares=2，MaxInvalidations=2，MaxConsumes=4，五个负控开关为 FALSE。
- `StartFence-wide.cfg`：MaxPrepares=3，MaxInvalidations=3，MaxConsumes=6，其余同上。
- `DeliveryBackoff.cfg`：D0=1，Cap=4，Horizon=14，MaxPushes=8，五个负控开关为 FALSE。
- 每个负控配置只打开一个开关，只检查它点名的一条不变量。

## 结果

| 配置 | 期望 | TLC 结论 | 退出码 | 生成 / 不同状态 | 深度 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `StartFence` | 无反例 | No error has been found | 0 | 51,900 / 12,026 | 11 | 2 | 正控通过 |
| `StartFence-wide` | 无反例 | No error has been found | 0 | 3,923,720 / 595,294 | 15 | 5 | 正控通过 |
| `StartFence-unsafe-stale-guard` | `FenceHolds` | `FenceHolds` 违反 | 12 | 69 / 62 | 5 | 1 | 命中。Prepare → Invalidate → Consume 受理旧 permit |
| `StartFence-unsafe-double-accept` | `OneAcceptancePerStart` | 同名违反 | 12 | 238 / 213 | 5 | 1 | 命中。Prepare → Consume → Consume 产生第二条受理 |
| `StartFence-unsafe-inspect-keeps-permit` | `NotStartedExcludes` | 同名违反 | 12 | 341 / 278 | 6 | 1 | 命中。not-started 之前签发的 permit 之后被受理 |
| `StartFence-unsafe-resend-readvances` | `GuardAdvancesPerOperation` | 同名违反 | 12 | 73 / 73 | 4 | 2 | 命中。Invalidate（答复丢失）→ Resend，守卫前进两次 |
| `StartFence-unsafe-exclude-accepted` | `ExclusionAndAcceptanceExclusive` | 同名违反 | 12 | 287 / 219 | 5 | 1 | 命中。Prepare → Consume 受理 → Exclude |
| `DeliveryBackoff` | 无反例 | No error has been found | 0 | 483,402 / 114,867 | 31 | 2 | 正控通过 |
| `DeliveryBackoff-unsafe-hot-loop` | `PushesPaced` | 同名违反 | 12 | 214 / 97 | 5 | 1 | 命中。同一时刻连推两次 |
| `DeliveryBackoff-unsafe-no-cap` | `DelayCapped` | 同名违反 | 12 | 22,320 / 7,423 | 14 | 0 | 命中。第 4 次 unavailable 后等待 8 > Cap |
| `DeliveryBackoff-unsafe-no-reset` | `ResetAfterAnswer` | 同名违反 | 12 | 553 / 233 | 7 | 1 | 命中。denied 之后等待未清除 |
| `DeliveryBackoff-unsafe-drop` | `OwedUntilSaved` | 同名违反 | 12 | 100 / 45 | 5 | 1 | 命中 |
| `DeliveryBackoff-unsafe-silent` | `WarnPerPacedPush` | 同名违反 | 12 | 67 / 34 | 5 | 1 | 命中 |

`OneDecision` 没有单独的负控。正控检查了它；它的违背需要同时删掉两条规则，由 P1、P2 的负控间接触及。

负控的状态数和深度是找到第一个反例时的读数。多个 worker 时，两次运行之间可能不同。判读只看被违反的不变量名。

## 机读守卫的运行

| 守卫 | 命令 | 结果 |
| --- | --- | --- |
| `tests/start-fence-properties.spec.ts` | `pnpm exec vitest run --mode fast tests/start-fence-properties.spec.ts`（经测试名额脚本） | 46 项通过：40 个种子的正控，6 个负控各命中点名性质 |
| `tests/delivery/backoff-bound.spec.ts` | 同上，换文件 | 36 项通过：30 个种子的正控，6 个负控各命中点名性质 |

## 观察

这两条不违背所选性质，记下来交拥有者判断。

- **O1 确定失败不留痕迹。** 接收方对推送持续答 `denied` 或 `invalid` 时，交付保持待推，退避被清除，也不写 warn（`push` 的 `paced.delete` 分支）。每次驱动都会再推一次，节奏只受 driver 的重试间隔约束，日志里没有这条交付的痕迹。SPEC 的「确定失败不退避」是有意的，但「失败不静默」在这条分支上没有兑现。建议拥有者：tool-host-local，考虑对确定失败也写一条具名 warn，或把交付记成可见的失败。
- **O2 `paced` 表项可能不回收。** 表项只在推送成功或答复不是 unavailable 时删除。交付被暂停退避后，若它此后不再经 `push` 推送成功（例如调用撤权后 `current` 一直答 denied），表项会留到进程结束。增长上界是进程生命期内进入过退避、之后没有再被推送成功的交付数。建议拥有者：tool-host-local，在交付离开待推时一并删除表项，或给表项加回收。
