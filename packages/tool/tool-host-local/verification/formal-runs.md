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
| `DeliveryBackoff.tla` | `532963cda3c8274ce2951bc068abe76e5d27c16a208811b08c6a4b91c80ba5b2` |
| `DeliveryBackoff.cfg` | `aced1a50fddc5cdba6ddfb2243005b92240a75c3c73d2f29d10497ffef1aae27` |
| `DeliveryBackoff-table.cfg` | `0eb030c940f0bb597f39d5fee284b0f575ad080f677d75c494fa393a582b171c` |

## 常量范围

- `StartFence.cfg`：MaxPrepares=2，MaxInvalidations=2，MaxConsumes=4，五个负控开关为 FALSE。
- `StartFence-wide.cfg`：MaxPrepares=3，MaxInvalidations=3，MaxConsumes=6，其余同上。
- `DeliveryBackoff.cfg`：一个交付，D0=1，Cap=4，Horizon=14，MaxPushes=8，八个负控开关为 FALSE。
- `DeliveryBackoff-table.cfg`：两个交付，D0=1，Cap=2，Horizon=5，MaxPushes=3，开关同上。接收方可答 unavailable、saved、denied、throws；交付可被撤权、排除或放弃。
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
| `DeliveryBackoff` | 无反例 | No error has been found | 0 | 2,208,748 / 378,984 | 32 | 3 | 正控通过（一个交付） |
| `DeliveryBackoff-table` | 无反例 | No error has been found | 0 | 63,984,448 / 6,315,952 | 20 | 52 | 正控通过（两个交付，含 `TableFollowsDelivery`、`TableBounded`） |
| `DeliveryBackoff-unsafe-hot-loop` | `PushesPaced` | 同名违反 | 12 | 420 / 162 | 5 | 0 | 命中。同一时刻连推两次 |
| `DeliveryBackoff-unsafe-no-cap` | `DelayCapped` | 同名违反 | 12 | 60,551 / 15,048 | 13 | 1 | 命中。等待超过 Cap |
| `DeliveryBackoff-unsafe-no-reset` | `ResetAfterAnswer` | 同名违反 | 12 | 1,215 / 403 | 6 | 1 | 命中。确定失败之后等待未清除 |
| `DeliveryBackoff-unsafe-drop` | `OwedUntilSaved` | 同名违反 | 12 | 196 / 82 | 4 | 1 | 命中。unavailable 结束了交付 |
| `DeliveryBackoff-unsafe-silent` | `WarnPerPacedPush` | 同名违反 | 12 | 162 / 69 | 4 | 1 | 命中。退避没有 warn |
| `DeliveryBackoff-unsafe-silent-failure` | `WarnPerDefiniteFailure` | 同名违反 | 12 | 64 / 32 | 3 | 0 | 命中（O1）。Push 答 denied 或抛异常，没有 warn |
| `DeliveryBackoff-unsafe-drop-on-failure` | `OwedUntilSaved` | 同名违反 | 12 | 64 / 32 | 3 | 1 | 命中（O1）。确定失败结束了交付 |
| `DeliveryBackoff-unsafe-keep-on-end` | `TableBounded` | 同名违反 | 12 | 2,884 / 951 | 4 | 1 | 命中（O2）。d1 退避后被撤权，d2 也被撤权，表里留一项而在途为零 |
| `DeliveryBackoff-unsafe-keep-on-end-entry` | `TableFollowsDelivery` | 同名违反 | 12 | 374 / 138 | 4 | 1 | 命中（O2）。Push 进入退避，随后 End，表项留下 |

`OneDecision` 没有单独的负控。正控检查了它；它的违背需要同时删掉两条规则，由 P1、P2 的负控间接触及。

负控的状态数和深度是找到第一个反例时的读数。多个 worker 时，两次运行之间可能不同。判读只看被违反的不变量名。

## 机读守卫的运行

| 守卫 | 命令 | 结果 |
| --- | --- | --- |
| `tests/start-fence-properties.spec.ts` | `pnpm exec vitest run --mode fast tests/start-fence-properties.spec.ts`（经测试名额脚本） | 46 项通过：40 个种子的正控，6 个负控各命中点名性质 |
| `tests/delivery/backoff-bound.spec.ts` | 同上，换文件 | 37 项通过：30 个种子的正控，7 个负控各命中点名性质（新增 Q6） |
| `tests/delivery/receiver-failure.spec.ts` | 同上，换文件 | 12 项通过：确定失败的 warn 与结局，退避表项随交付释放 |

## 源码变异负控

每个变异在源码里恢复旧行为，跑 `tests/delivery` 与 `tests/executor-retirement.spec.ts`，确认用例变红，再还原源码。

| 变异（`src/result-delivery.ts`、`src/runtime-executor.ts`） | 对应旧行为 | 变红的用例 |
| --- | --- | --- |
| `failed` 不写 warn | O1：确定失败没有痕迹 | `receiver-failure` 的 denied、invalid、throws、查找异常四项，`absent-receiver` 的 denied 查找，`unavailable-receiver` 的复位用例，`backoff-bound` 的 30 个种子（Q6） |
| `push` 不收束接收方的异常（重新抛出） | O1：异常没有诊断，并停掉同一 run | `receiver-failure` 的 throws、退避复位、warn 写不出三项 |
| 确定失败只清表项，不写 warn（原分支） | O1 | `receiver-failure` 的 denied、invalid，`unavailable-receiver` 的复位用例，`backoff-bound` 的种子 |
| 撤权时不释放（`current` 与 `drive` 的 `denied` 分支） | O2：撤权后表项留到进程结束 | `receiver-failure` 的撤权两项 |
| run 结束不 `retainPaced` | O2：不再待推的交付表项不回收 | `receiver-failure` 的「不再待推」 |
| `release` 方法为空 | O2：放弃的调用表项不回收 | `receiver-failure` 的「执行器放弃」 |
| `close` 不清表 | O2 | `receiver-failure` 的「关闭」 |
| 执行器改由他实例分支不调用 `release` | O2：执行器放弃调用 | `executor-retirement` 的 R2-D327 用例 |

## 观察的处置

- **O1 确定失败不留痕迹：已解决（R2-D327）。** 接收方对推送或查找答确定失败，或抛出异常时，交付保持待推，不退避，写一条带租户、调用、交付与原因的具名 warn。异常在这次推送内收束，不使同一调用的其他交付停止。规则见 [SPEC](../SPEC.md#确定失败r2-d327)。模型：`WarnPerDefiniteFailure`、`OwedUntilSaved`，各有负控。
- **O2 `paced` 表项不回收：已解决（R2-D327）。** 表项的生命期跟随交付：保存、不再待推、撤权、执行器放弃调用、worker 关闭时释放。模型：`TableFollowsDelivery`、`TableBounded`，负控 `DeliveryBackoff-unsafe-keep-on-end*`。规则见 [SPEC](../SPEC.md#退避表项的生命期r2-d327)。

## 剩余限制

- 释放发生在 worker 观察到离开的时刻，不是转移的瞬间，见 [Q7 的范围外](proofs/README.md#q7-退避表项的生命期)。
- 确定失败不退避，所以每次再推写一条 warn，数量随 driver 重试间隔（缺省 1 秒）增长。SPEC 明确确定失败不退避；是否对 warn 本身限流，由拥有者另行判断。
- 模型是有限范围：`DeliveryBackoff-table` 只有两个交付，Horizon=5。
