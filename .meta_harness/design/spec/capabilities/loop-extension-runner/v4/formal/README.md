# Runner 有限回放模型

本候选工件表达 [S-35](../contract.md#s-35-形式工件回放的有限行为模型) 的行为义务。运行状态和结果只在 topic verification；本目录不记接受、通过摘要或输入哈希。

## 状态与动作

`log` 是结论耐久序列，ask 与最终结论分开；`cards`、`answered`、`reminders` 和 `reminderDone` 表示已落事实。worker 的待提交输出、读到的主体和尝试身份是可丢内存。`Crash` 可发生在输出已算但未提交、ask 已提交但卡未发布、最终结论已提交但提醒未追加、效果尚未返回等间隙，丢掉全部 worker 内存而保留耐久事实。

`Begin` 从耐久前缀取得下一件与已改写主体；`Commit` 单独追加，故“算完”不等于“已落”。两个 worker 可以同时算同一件，原子判重只允许一份最终结论。`Supersede` 提高当前尝试但保留旧 worker 的待提交输出；结论和提醒写入动作分别核栅栏。无运行配置关闭尝试栅栏，仍保留同一锚/件的耐久判重。

`PublishCard` 与 ask 提交分离；答复后重新调度该件得到最终结论。`PublishReminder` 与所属结论提交分离；效果在应补提醒全补齐之后返回。`Replay` 和 `Crash` 都使局部主体可丢，返回结果与后件输入必须从耐久结论重建。`stop` 和 `retry` 是终止链的抽象控制值；retry 记录留存判定当时的 allowed，后续 `LoseRetryPermission` 不回写该结论。

## 四份正向配置

| 配置 | 常量范围 | 检查与前提 |
|---|---|---|
| [Runner.cfg](Runner.cfg) | 两件、一 worker、最多两尝试、一次 crash | 十个不变量，覆盖先提交后下一件、改写恢复与控制停止；所有保护开关开启 |
| [RunnerConcurrent.cfg](RunnerConcurrent.cfg) | 一件、两 worker、最多两尝试、一次 crash | 同一件竞争提交，含旧尝试在新栅栏后继续提交；十个不变量 |
| [RunnerUnfenced.cfg](RunnerUnfenced.cfg) | 一件、两 worker、一尝试、一次 crash | `UsesFence=FALSE`，模拟无运行经过；仍需 DurableDedupe。栅栏性质此配置不具非平凡覆盖，竞争唯一性由 OneFinalConclusionPerPiece 承担 |
| [RunnerProgress.cfg](RunnerProgress.cfg) | 一件、一 worker、最多两尝试、一次 crash | 同十个不变量，另检查 AskEventuallyHasCard、AnsweredPassCompletes；采用 FairSpec 的明确弱公平 |

`Spec` 不加入公平；安全性质允许任意停留。`FairSpec` 对 Begin/Commit/丢弃过期输出/刷新尝试/返回/补卡/补提醒施加弱公平；不要求外部人必须答复，AnsweredPassCompletes 只从已答复开始。崩溃、Supersede 和 retry 权限变动均有限，所以不会靠无限故障抹掉上述持续可执行动作的进展。实现最终返回由 Begin 产生有限待提交输出的抽象和公平 Commit 表示，这是前提，不是关于真实任意拓展件终止性的证明。

每件在本模型最多一次 ask；正文允许多轮 ask，后者仍需真实场景与后续扩模。四份配置不是两件两 worker 任意组合的穷尽检查，也不是任意链长/重启次数的证明。`CHECK_DEADLOCK FALSE` 允许完成后的合法静止状态，进展由显式 temporal property 检查，不能以没有死锁替代进展。

## 可失败的性质与 validity-check

每份负向配置只关闭指定保证，其余参数写在该文件；必须找到对应断言反例才说明这份 validity-check 达到目的。负向配置不登记为正向 formal task。

| 性质 | 对应条款 | 单一变异配置 |
|---|---|---|
| OneFinalConclusionPerPiece | S-11/S-18/S-21 | [duplicate-final](validity-check/duplicate-final.cfg)：关闭耐久最终结论判重 |
| CommitBeforeNext | S-10 | [start-before-commit](validity-check/start-before-commit.cfg)：允许从未提交前件之后开始 |
| ReplayReproducesEffect | S-15/S-18/S-28 | [volatile-replay](validity-check/volatile-replay.cfg)：返回使用可丢的 worker 主体 |
| RemindersExactlyOnce | S-19 | [duplicate-reminder](validity-check/duplicate-reminder.cfg)：已追加提醒可再追加 |
| OneCardPerAsk | S-27/S-28 | [duplicate-card](validity-check/duplicate-card.cfg)：已发布卡可再发布 |
| StaleAttemptCannotWrite | S-21 | [stale-write](validity-check/stale-write.cfg)：写入不核栅栏 |
| AnsweredPassCompletes | S-28 | [answered-stalls](validity-check/answered-stalls.cfg)：答复后永不恢复该件 |
| InputsFromDurablePrefix | S-10/S-24/S-28 | [volatile-subject](validity-check/volatile-subject.cfg)：后件使用局部旧主体 |
| ControlStopsChain | S-15/S-26 | [continue-after-stop](validity-check/continue-after-stop.cfg)：终止之后仍可提交后件 |
| RetryPassedGuard | S-14/S-26 | [unchecked-retry](validity-check/unchecked-retry.cfg)：没有 allowed 仍记 retry |

`badStart`、`badInput`、`badStale` 是观察动作前提是否违反的历史监测位，不是生产状态或禁止坏动作的隐藏守卫。其断言能被对应变异反驳。TypeOK 只检查表示范围，不是以上任何业务性质的替代。

## 外部前提与未覆盖

- 稳定且不同经过不相撞的锚、每份已落提醒/ask 的唯一身份、当前时钟和身份生成器正确。模型把它们编码为有限索引，故没有证明 UUID、MessageId 生成或时钟。
- 日志/卡片/答复具有实际耐久性；追加是原子的。Crash 保留这些字段是采用存储保证，不是该保证的证明。竞争与写入守卫的结果可被变异反驳，实际磁盘崩溃仍要另验。
- 当前链不变、真实声明来源可信；E1/E2 选择、严格 JSON 相等、适配绑定、已落提醒的后置 ID 冲突、嵌套提醒 veto、重复 ask、清单不一致、整批工具放行、取消和执行环境不在状态空间里。相关场景仍沿 contract/examples。
- `observed` 抽象了继续执行的合法结论，不证明完整不可用/报错策略表；retry 的 allowed/拒绝抽象不证明所有 runtime 操作失败名的映射或实际网络再发。

## 执行入口

从设计根运行，Java/JAR 路径由环境给出，输出目录必须在临时证据区：

```sh
"${JAVA_BIN}" -XX:+UseParallelGC -Xmx2g -cp "${TLA2TOOLS_JAR}" tlc2.TLC \
  -workers 1 -noGenerateSpecTE -metadir tmp/tlc/loop-extension-runner-v4-chain \
  -config spec/capabilities/loop-extension-runner/v4/formal/Runner.cfg \
  spec/capabilities/loop-extension-runner/v4/formal/Runner.tla
```

其他配置只替换 config 与 metadir；实际 raw、原始输入及工具版本见[验证入口](../../verification.md#v4-候选完整失败历史)。

## 失败调用关联与历史的有限模型

[FailureHistory.tla](FailureHistory.tla) 与 [FailureHistory.cfg](FailureHistory.cfg) 补充 S-53/S-54，未替换 Runner 的七项义务。两调用、五类结果、最多两条历史（default/custom、A/B 计划、相同 at，可出现完全相同的两项）、四种 dispatch 调用序列，最多一次提交后崩溃。source 是同一完整日志前缀中已生效 retry 原结论的抽象输入，真实性、会话归属及是否真有完整前缀是外部前提；模型检查 runner 接收/交付保留与调用集合核对，不能声称证明真实前缀生产。

| 断言 | 条款与性质 | 预期反例配置 |
|---|---|---|
| CallAssociation | S-53：混调用输入不能写出结论，历史不得串调用 | mixed-model-call：关闭 CheckAssociation |
| LosslessHistory | S-54：交给件的原历史顺序、重复、来源与计划不丢 | lost-retry-history：关闭 KeepHistory |
| WriteBeforeReturn | S-10/S-53：效果不能先于结论提交 | return-before-conclusion：关闭 CommitFirst |
| ReplayNoReevaluation | S-18/S-28/S-54：最终结论已落后崩溃不重求值或重写 | reevaluate-concluded：关闭 ReuseFinal |

四个变异配置位于 validity-check，仅为反驳能力检查，不登记 formal task。正向 Spec 无公平性，只检查安全；完成状态允许静止。原子耐久追加为前提；没有网络发送、默认件计次算法、真实 Schema、输出逐字段复制、会话授权或存储介质证明。ask 参与关联检查，但不会进入本补充模型的最终结论崩溃恢复动作；其答复后重求值仍由原 Runner 模型与 S-28 承担。
