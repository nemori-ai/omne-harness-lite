# 有效性核对：九个否定配置都必须出反例

**这一目录里的执行都不是 formal task，它们的结果是反例，而且反例正是预期。**
它们与同级正配置那次执行**只有配置不同**（模型逐字节相同），且必须成对报告：
只报正配置无反例，读者无从判断十五条断言里哪些是平凡的。

## 为什么不登记为 formal task

[`registry/formal-tasks.json`](../../../../../registry/README.md) 里的任务由 `check_design.py --formal run` 执行、**退出码非零即判失败**。
这里的变异无 `-continue` 时按预期**退出 12**；可达性核对要用 `-continue`，而 `-continue` 下 TLC 即使违反了断言也**退出 0**。
登记前者，任务永远失败；登记后者，任务永远通过——两种都与清单的语义相反。
[契约 formal 入口](../../../../../spec/compositions/governance-center-entry/v1/formal/README.md#tla-与-tlc)写明九个否定配置不登记。

## 输入

[`input/`](input/SHA256SUMS)：`EntryDecision.tla`（与同级 `input/` 的那一份逐字节相同，`05006b6c…`）与九个 `Validity_*.cfg`。
十个文件的哈希与当前 `spec/`、`registry/frozen.json` 逐一对照过，[对照表在 run README](../../README.md#输入快照哈希与当前-spec-的对照)。

命令与正配置相同（`-workers 1 -cleanup -noGenerateSpecTE`，工作目录设计根），只换 `-config` 与 `-metadir`，另按下文加不加 `-continue`；
逐条命令在 [`commands.txt`](../../commands.txt)，退出码在 [`exit-codes.tsv`](../../exit-codes.tsv)。

## 可达性核对

[`Validity_Reachability.cfg`](input/Validity_Reachability.cfg)，`Mutation = "none"`，`-continue`：
九条「从不」谓词**全部被违反**（[原文](output/tlc-Validity_Reachability.continue.log)），状态空间与正配置相同（804 / 776 / 0，深度 9）。

| 谓词 | 违反状态数 |
|---|---|
| `NeverVersionMismatch` | 96 |
| `NeverInvalidInput` | 70 |
| `NeverHealth` | 64 |
| `NeverDefect` | 36 |
| `NeverUnavailable` | 34 |
| `NeverRejected` | 28 |
| `NeverResult` | 12 |
| `NeverGatePassed` | 8 |
| `NeverLateRevocation` | 4 |

**支持**：六类答复与「认人之后才读到撤销」「记了缺陷」「补授权通过」三处分支在这个模型里都可达，
正配置下依赖这些前件的断言不是因为前件到不了而平凡成立。
**计数是 `-continue` 下每个违反状态只报第一条谓词得到的**（配置文件里写明了次序是有意的），它们不是「各类答复各有多少状态」的度量。

## 八个变异

每个变异无 `-continue` 跑一次（机器可判：退出 12 ＋ 被违反的断言名），再以 `-continue` 跑一次（看同一改坏还牵连哪几条）。
断言集合与时序性质都与正配置相同，只改 `Mutation`。

| 配置 | 改坏的是 | 预期被违反 | 无 `-continue`：退出码、报出的断言、停下时的规模 | `-continue`：全部违反（次数） |
|---|---|---|---|---|
| `passthroughStateNotValid` | ③ 读到登录状态已不作数时原样透传 | `LateRevocationUniform` | **12**，`LateRevocationUniform`；789 / 764 / 12 left，深度 8（[原文](output/tlc-Validity_passthroughStateNotValid.log)） | 只有它，2（[原文](output/tlc-Validity_passthroughStateNotValid.continue.log)） |
| `unavailableAsRejected` | ② 读不到时答「无效」 | `CannotJudgeIsUnavailable` | **12**，`CannotJudgeIsUnavailable`；631 / 617 / 71 left，深度 4（[原文](output/tlc-Validity_unavailableAsRejected.log)） | 只有它，20（[原文](output/tlc-Validity_unavailableAsRejected.continue.log)） |
| `readPresentationBeforeVersion` | 核版本之前先看出示物 | `VersionFirst` | **12**，`VersionFirst`；353 / 353 / 239 left，深度 2（[原文](output/tlc-Validity_readPresentationBeforeVersion.log)） | `VersionFirst` 64、`EnvelopeBeforeAuth` 64（[原文](output/tlc-Validity_readPresentationBeforeVersion.continue.log)） |
| `inputBeforeAuth` | 要认人的路由先看载荷再认人 | `RejectionUniform` | **12**，`RejectionUniform`；631 / 617 / 71 left，深度 4（[原文](output/tlc-Validity_inputBeforeAuth.log)） | `RejectionUniform` 12、`InputAfterAuth` 4（[原文](output/tlc-Validity_inputBeforeAuth.continue.log)） |
| `gateUnavailableAsDenied` | 补授权读不到时答成拒绝 | `CannotJudgeIsUnavailable` | **12**，`CannotJudgeIsUnavailable`；777 / 755 / 9 left，深度 7（[原文](output/tlc-Validity_gateUnavailableAsDenied.log)） | 只有它，2（[原文](output/tlc-Validity_gateUnavailableAsDenied.continue.log)） |
| `defectAsResult` | 缺陷原样当结果交出 | `DefectIsUnavailable` | **12**，`DefectIsUnavailable`；632 / 618 / 72 left，深度 4（[原文](output/tlc-Validity_defectAsResult.log)） | 只有它，36（[原文](output/tlc-Validity_defectAsResult.continue.log)） |
| `authBeforeEnvelope` | 要认人的路由先认人再核信封 | `EnvelopeBeforeAuth` | **12**，`EnvelopeBeforeAuth`；533 / 529 / 143 left，深度 3（[原文](output/tlc-Validity_authBeforeEnvelope.log)） | 只有它，84（[原文](output/tlc-Validity_authBeforeEnvelope.continue.log)） |
| `deriveBeforePayload` | 先做身份推导与补授权，再核载荷 | `PayloadBeforeDerive` | **12**，`PayloadBeforeDerive`；732 / 713 / 81 left，深度 5（[原文](output/tlc-Validity_deriveBeforePayload.log)） | 只有它，22（[原文](output/tlc-Validity_deriveBeforePayload.continue.log)） |

**八个变异都在预期那条断言上失败**，无一先报出别的断言。`-continue` 那次的时序性质 `EventuallyAnswered` 都检查完、未被违反——
这八处改坏只动次序与映射，不让请求停在半路。

三处读法：

1. **无 `-continue` 那一列的规模不是状态空间的度量**：TLC 见到第一个反例就停，队列里还剩状态（`left on queue` 非零）。
2. **`-continue` 那一列的收尾句是 `Model checking completed. No error has been found.`、退出 0**，与上表并不矛盾：
   `-continue` 下 TLC 记下违反、继续探索，收尾句不反映违反。这一列的证据是日志里 `Error: Invariant … is violated.` 的条数。
3. 反例轨迹（`Error: The behavior up to this point is:` 之后的逐状态值）都在各自日志里，**本 README 不复述**；
   它们对应契约哪一条，由变异定义与 [formal 入口的变异表](../../../../../spec/compositions/governance-center-entry/v1/formal/README.md#tla-与-tlc)给出，**这一步是人读配置做的对应，不是工具输出的一部分**。

## 这次执行支持什么结论，不支持什么

**支持**：在这个模型、这个规模上，正配置的八条被变异过的断言
（`LateRevocationUniform`、`CannotJudgeIsUnavailable`、`VersionFirst`、`EnvelopeBeforeAuth`、`RejectionUniform`、`InputAfterAuth`、`DefectIsUnavailable`、`PayloadBeforeDerive`）
**不是平凡的**——改坏对应那一处，它们在 2～8 步之内就被违反。

**不支持**：
- 没有专门变异的五条断言（`HealthUnconditional`、`ExemptIgnoresPresentation`、`ExemptInputWithoutLookup`、`RejectionOnlyWhenJudged`、`NoDomainWithoutGates`）
  只有可达性核对撑着「前件可达」，**没有任何执行证明它们会失败**。
- 反例不说明任何实现有这些缺陷；实现侧的次序与映射证据在同日[测试 run](../../../2026-09-23-tests-tenancy-leg-2/README.md)。

返回[本次运行](../../README.md)。
