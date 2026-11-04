# 固定请求恢复与压缩结局模型的运行记录

本页记录 [FixedReplay.tla](models/replay/FixedReplay.tla) 与 [CompactionFit.tla](models/compaction/CompactionFit.tla) 的 TLC 运行、守卫的变异负控与发现的缺陷。性质与映射见 [formal-mapping.md](formal-mapping.md)。

结论只在所列常量范围内成立。它不是证明，也不表示源码符合模型。原始日志不进本包，保存在任务过程目录。

## 工具与参数

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL 2 `Ubuntu-24.04`。入口 [run-tlc.sh](models/run-tlc.sh)，它把一个模型目录复制到 WSL 的文件系统再跑 |
| JDK | OpenJDK `21.0.12.1` LTS（Temurin） |
| TLC | `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`，即 tla2tools 1.7.4。JAR SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |
| 参数 | 广度优先；`-workers 4`；`-Xmx4g`；`-XX:+UseParallelGC`；配置里 `CHECK_DEADLOCK FALSE` |
| 预算 | 每个配置 600 秒 |
| 判读 | 正控要求 `Model checking completed. No error has been found.`。负控要求日志点名预期性质：`Invariant <名> is violated`、`Action property <名> is violated`，或活性配置只声明一条性质并出现 `Temporal properties were violated` |
| 运行时间 | 2026-11-04（北京时间） |

输入摘要：`FixedReplay.tla` SHA-256 `9eab35e1f3fd3edce7744213b431c99163d415cded6bd6a6b19d9a25b2cbb6bc`，`CompactionFit.tla` SHA-256 `affb9b82f6edb124e9d04819f24d945f0ca5bad85404d9d832a569fe61612782`。

## FixedReplay

常量：`design` 等配置为 MaxHist 2、MaxLive 1、MaxClock 1、MaxCrashes 2、MaxAttempts 3。`design-wide` 为 MaxHist 3、MaxLive 2、MaxClock 2、MaxCrashes 3、MaxAttempts 4。

`design-wide` 最初取 4、3、3、4、5。它在 573 秒时被 600 秒预算截断，当时已有 26,548,370 个不同状态，超过约 500 万的上限。所以缩小到上述范围，并只记录缩小后的结果。

| 配置 | 期望 | 结果 | 退出码 | 生成 / 不同状态 | 深度 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `replay-ideal` | 通过 | 通过 | 0 | 23 / 21 | 9 | 1 | 五个环境开关全关时 `ReplayEqual` 成立 |
| `design` | 通过 | 通过 | 0 | 4,269 / 2,934 | 16 | 2 | 正控。全部环境开关打开、检查可答 unknown：四条不变量与活性 `Progress` 成立 |
| `design-wide` | 通过 | 通过 | 0 | 471,124 / 294,324 | 23 | 8 | 正控，放大范围 |
| `refute-window-usage` | `ReplayEqual` | 命中 | 12 | 16 / 16 | 7 | 2 | 反驳 FR-1：M0 改变已采用事实，第六层随之改变 |
| `refute-clock` | `ReplayEqual` | 命中 | 12 | 59 / 45 | 8 | 1 | 反驳 FR-1：逐请求时钟块 |
| `refute-adapter-memory` | `ReplayEqual` | 命中 | 12 | 21 / 20 | 9 | 1 | 反驳 FR-1：崩溃后完整读取，锚点从 0 移到 1 |
| `refute-live-groups` | `ReplayEqual` | 命中 | 12 | 63 / 51 | 8 | 2 | 反驳 FR-1：第四至第七组修订 |
| `refute-new-input` | `ReplayEqual` | 命中 | 12 | 54 / 41 | 8 | 1 | 反驳 FR-1：新输入 |
| `bad-naive-readmit` | `SentMatchesRecord` | 命中 | 12 | 259 / 160 | 7 | 2 | 负控：not-accepted 后在原身份下受理另一份内容 |
| `bad-naive-unknown` | `NoConflict` | 命中 | 12 | 327 / 206 | 8 | 1 | 负控：unknown 时重发，Model 答 conflict |
| `bad-naive-progress` | `Progress` | 命中 | 13 | 2,861 / 1,837 | — | 2 | 负控：conflict 后卡死 |
| `bad-compare-tokens` | `SentMatchesRecord` | 命中 | 12 | 336 / 207 | 7 | 1 | 负控：只比来源修订，第六层变化漏过 |
| `bad-keep-voided` | `AdoptedNotVoided` | 命中 | 12 | 197 / 133 | 6 | 1 | 负控：已采用视图保留被作废的 attempt |

## CompactionFit

常量：`design` 等配置为 N 4、L 8、T 6、SysW 1、R 2、S 2、B 2。`design-wide` 为 N 5、L 9、T 7、R 3、S 3、B 3。

| 配置 | 期望 | 结果 | 退出码 | 生成 / 不同状态 | 深度 | 用时（秒） | 判读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `design` | 通过 | 通过 | 0 | 16,010 / 15,930 | 6 | 4 | 正控。十条不变量加 `AppendOnly`、`Terminates` |
| `design-wide` | 通过 | 通过 | 0 | 394,526 / 366,974 | 7 | 39 | 正控，放大范围 |
| `aligned` | 通过 | 通过 | 0 | 18,434 / 16,626 | 6 | 2 | 摘要后检查改为整请求对触发线时，`CompactionKeepsWork` 也成立 |
| `finding-keeps-work` | `CompactionKeepsWork` | 命中 | 12 | 12,594 / 12,514 | 5 | 2 | 缺陷 D-1 |
| `finding-trigger-gap` | `CompactionKeepsWork` | 命中 | 12 | 6,990 / 6,910 | 5 | 1 | 缺陷 D-1，SysW 为 0 时仍命中 |
| `bad-truncate` | `NoSilentTruncation` | 命中 | 12 | 1,524 / 1,524 | 2 | 1 | 负控 |
| `bad-replan` | `AtMostOnePlan` | 命中 | 12 | 12,595 / 12,515 | 5 | 2 | 负控 |
| `bad-rewrite` | `AppendOnly` | 命中 | 13 | 8,774 / 8,774 | 4 | 1 | 负控（动作性质） |
| `bad-ignore-open` | `OpenVisible` | 命中 | 12 | 23,874 / 21,604 | 4 | 1 | 负控 |
| `bad-split-pairs` | `NoOrphanResult` | 命中 | 12 | 14,372 / 12,702 | 4 | 2 | 负控 |
| `bad-retain-budget` | `RetainBounded` | 命中 | 12 | 15,727 / 14,057 | 4 | 1 | 负控 |
| `bad-retain-view` | `ViewBounded` | 命中 | 12 | 15,728 / 14,058 | 4 | 1 | 负控 |
| `bad-strategy-rep` | `RepresentationAdopted` | 命中 | 12 | 1,284 / 1,284 | 2 | 1 | 负控 |
| `bad-skip-resume` | `FixableFits` | 命中 | 12 | 8,776 / 8,776 | 4 | 1 | 负控 |
| `bad-retry-veto` | `Terminates` | 命中 | 13 | 28,260 / 25,950 | — | 4 | 负控（活性）：否决后重开同一步，热环 |
| `limit-mixed-fallback` | `NoRepRefusal` | 命中 | 12 | 1,284 / 1,284 | 2 | 1 | 已知限制 RA-2 的演示，不是负控 |

负控的状态数是找到第一个反例时的读数。多个 worker 时，两次运行之间可能不同。

## 守卫的变异负控

每个变异改一处源码，重新构建本包，运行 `tests/formal-guards.spec.ts`，再还原并重新构建。还原后整套测试通过。

| 变异 | 改了什么 | 变红的守卫 |
| --- | --- | --- |
| G1 | `src/placement.ts` 的 `tailOf` 去掉按键排序 | G1 |
| G2、G3 | `src/assembly-budget.ts` 计量时去掉最后一条消息 | G2、G3，另有 G6 |
| G4 上限 | `src/budget.ts` 的 `exceeds` 改成超过上限加一 | G4，另有 G5 |
| G4 余量 | `src/budget.ts` 的 `amount` 去掉估算余量 | G4 |
| G5 | `src/assembly-outcome.ts` 去掉「已进入压缩」的判断 | G5 |
| G6 | `src/model-input.ts` 的表示换成另一个名字 | G6 |

每个变异都使它点名的守卫变红。

## 发现的缺陷

**D-1 压缩成功后，请求仍可能被判装不下。** 待裁定。

- 反例（`finding-trigger-gap`）：历史权重 1、2、2、2，触发线 6，硬上限 8。策略覆盖第 1 条，摘要权重 1。摘要后检查得 7，不超过硬上限，所以给出压缩转换。提交后 resume 重判得 7，超过触发线，`judgeBudget` 给 `needs-compaction`。因为已有转换，`assemblyOutcome` 给 `cannot-fit`（`after-compaction`）。工作失败，而请求其实在硬上限之内。
- 出处：`src/compaction-step.ts` 的 `deriveFrom` 只按硬上限检查保留、摘要与其后条目，不含系统提示词、工具、第四与第六层，也不比触发线。`src/assembly-outcome.ts` 在已有转换时把 `needs-compaction` 一律转成 `cannot-fit`。`src/budget.ts` 的 `needs-compaction` 同时包括超限与超触发线。
- SPEC 有两种读法。RQ-06 说「补入后仍超限，返回结局装不下」，只说超限。组装结果表说「本次准备已进入过压缩计划仍不通过」，不通过可以包括触发线。所以这是要裁定的 SPEC 歧义，不只是实现错误。
- 建议拥有者：本成员（RQ-06 与组装结果表）。候选做法有两个：摘要后检查改为整请求对触发线（`aligned` 配置表明此时 `CompactionKeepsWork` 成立）；或 resume 之后只在超过硬上限时给 `cannot-fit`。本次没有改产品代码。

**D-2 恢复的接缝义务（交给 agent，不是本成员的缺陷）。** 去掉 checkpoint 里整份请求的副本后，恢复在原身份下重新受理之前必须比较 `coverage.budget.inputDigest`，不能比较 `fixed.digest` 或来源修订。`bad-compare-tokens` 与 `bad-naive-readmit` 给出反例。建议拥有者：agent 的恢复路径。

**已知限制 RA-2。** 回退档案里有不同家族的供应商时，单一的 `definition.representation` 会被另一家族拒绝，整份准备不可用。只建模，没有守卫。

## 迁移

下列守卫属于别的成员，本次没有写。它们在 Journal 终态合入之后放进对应成员：

- D-2 的恢复守卫放进 agent 协调器的恢复用例。注入点三个：崩在 M0 与 admit 之间；inspect 答 not-accepted；inspect 答 unknown。判据：重新受理前比较 `inputDigest`；不等则等权威 not-accepted 再换 attempt+1；unknown 时不重发。
- FR-3 放进 session 已采用分区的用例。负控：保留作废的 attempt 时，下一次准备读到它。

## 候选缓存模型的复核

request-context 成员的 [CandidateCache.tla](../../request-context/verification/cache/CandidateCache.tla) 已覆盖历史续读：同 epoch 只读新增尾，跨 epoch 不拼接，撤代清空，发布前复核。本次核对它的说明与 request-context SPEC 的现行条款：候选缓存、已实现的候选缓存（CX-14）与 CACHE-SLOT-POSITION 偏离都仍然存在，说明里的差异（槽位不分消费位置、每代际 32 个槽位）已经写明。本次重跑了它的全部配置，结果见下节。

### 重跑结果

入口是该目录的 `run-models.py`（`--workers 4 --timeout 600`），它把模型打包送进 WSL 的临时目录再跑。全部十个配置按预期。负控的状态数是找到第一个反例时的读数。

| 配置 | 期望 | 退出码 | 生成 / 不同状态 | 深度 | 用时（秒） |
| --- | --- | --- | --- | --- | --- |
| `valid-pairs` | 通过 | 0 | 4,696,289 / 1,017,408 | 22 | 7 |
| `valid-cache` | 通过 | 0 | 57,305,241 / 12,272,112 | 27 | 184 |
| `bad-publish-check` | `NoStalePublication` | 12 | 23,334 / 9,092 | 7 | 1 |
| `bad-retire-clear` | `Equivalence` | 12 | 6,726,335 / 1,789,347 | 13 | 19 |
| `bad-auth-hit` | `Authorized` | 12 | 1,754,295 / 489,114 | 12 | 4 |
| `bad-gap` | `Equivalence` | 12 | 5,818,619 / 1,538,692 | 13 | 11 |
| `bad-shared-key` | `HitBelongsToPrincipal` | 12 | 71,852 / 24,277 | 8 | 1 |
| `bad-epoch` | `Equivalence` | 12 | 6,402,592 / 1,697,861 | 13 | 10 |
| `bad-overwrite` | `NoRegression` | 12 | 2,828,932 / 760,007 | 12 | 5 |
| `bad-skip-recheck` | `RecheckedEligible` | 12 | 22,826 / 8,986 | 7 | 1 |

`valid-cache` 的状态数超过约 500 万，但它是该模型原有的范围，用时远在预算内，所以没有缩小。
