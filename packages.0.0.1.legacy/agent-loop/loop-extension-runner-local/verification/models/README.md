# Runner 有限回放与失败历史模型

本模型约束 [公共行为](../../../../core/loop-extension-runner/SPEC.md) 的耐久结论、回放、等待、提醒和调用关联。[真实组合义务](../README.md)另验日志、授权、贡献、取消及资源撤除。模型没有完整 Session／Agent 生产者，不保存某次运行摘要。

## 状态与有限范围

Runner 的 log、cards、answered、reminders/reminderDone 是耐久事实；worker 输出、主体及尝试身份是可丢内存。Crash 保留耐久字段是采用前提，不证明介质持久性。Begin 从耐久前缀取下一件，Commit 独立追加；两个 worker 竞争由原子判重限制一个 final。Supersede 保旧待提交输出而写入分别核 fence。无运行配置可关闭 fence，仍须同锚耐久判重。

ask 与补卡、final 与补提醒各自可被 crash 分开；效果须等提醒齐备，主体及效果须从原 initial 与耐久结论重建。retry 保存原 allowed，后续权限丧失不回写旧结论。每 piece 最多一次 ask、subject 二值，最多两 attempt／一次 crash。

| 正控 | 有限覆盖 |
| --- | --- |
| Runner.cfg | 两 piece、一 worker；结论先提交、回放、停止及提醒等TypeOK 及九个业务不变量 |
| RunnerConcurrent.cfg | 一 piece、两 worker；竞争 final 与旧 attempt fence |
| RunnerUnfenced.cfg | 一 piece、两 worker、一 attempt；UsesFence=FALSE，耐久判重仍有效，栅栏断言无非平凡覆盖 |
| RunnerProgress.cfg | 一 piece、一 worker；FairSpec 加 AskEventuallyHasCard／AnsweredPassCompletes |
| FailureHistory.cfg | 两 call、五结局、最多两 retry 历史、四 dispatch call 序列、最多一次 commit 后 crash；含相同 at 与完全相同两条历史 |

Spec 不加公平，只验安全。FairSpec 对 Begin、Commit、丢过期输出、更新 attempt、return、补 card/reminder 弱公平，不要求人必须答；AnsweredPassCompletes 只从已答开始。故障有限、贡献最终返回是前提。CHECK_DEADLOCK FALSE 允许终态静止，不等于进展证明。四 Runner 配置不是任意 2×2 覆盖，也不证明任意链长、重启数或多轮 ask。

## 负控

负控须给指定性质反例，不以非零退出或 TypeOK 代替。安全反例预期 exit12；时序反例预期 exit13。

| validity-check 配置 | 指定性质 |
| --- | --- |
| duplicate-final.cfg | OneFinalConclusionPerPiece |
| start-before-commit.cfg | CommitBeforeNext |
| volatile-replay.cfg | ReplayReproducesEffect |
| duplicate-reminder.cfg | RemindersExactlyOnce |
| duplicate-card.cfg | OneCardPerAsk |
| stale-write.cfg | StaleAttemptCannotWrite |
| answered-stalls.cfg | AnsweredPassCompletes |
| volatile-subject.cfg | InputsFromDurablePrefix |
| continue-after-stop.cfg | ControlStopsChain |
| unchecked-retry.cfg | RetryPassedGuard |
| mixed-model-call.cfg | CallAssociation |
| lost-retry-history.cfg | LosslessHistory |
| return-before-conclusion.cfg | WriteBeforeReturn |
| reevaluate-concluded.cfg | ReplayNoReevaluation |

最后四项使用 FailureHistory.tla，其余用 Runner.tla。FailureHistory 的合法完整 prefix、session 授权、原子耐久 append 是外部前提；模型不生产真实来源，不含网络发送、policy 计次、JSON 逐字段 copy、真实 Schema 或介质证明。ask 参与关联，但答后重求值及其恢复由 Runner 模型承担。

badStart/badInput/badStale 是观察违反动作前提的历史位，不是生产隐藏守卫。模型未覆盖 E1/E2、immutable body、真实授权/代际、提醒 ID race、嵌套 veto、重复 ask、整批准入、取消、unknown 物理日志停止或环境资源。

## 执行

从仓库根运行，工具路径沿开发环境提供，状态和日志写工作树 tmp：

```sh
"${JAVA_BIN}" -XX:+UseParallelGC -Xmx2g -cp "${TLA2TOOLS_JAR}" tlc2.TLC \
  -workers 1 -noGenerateSpecTE -metadir tmp/tlc/runner-chain \
  -config packages/agent-loop/loop-extension-runner-local/verification/models/Runner.cfg \
  packages/agent-loop/loop-extension-runner-local/verification/models/Runner.tla
```

其他配置替换 config、metadir 与相应模型。必须运行五个正控及适用的十四负控，记录实际命令、输入、工具版本与有限前提。输出不进入 Git，也不声称无条件形式化证明。
