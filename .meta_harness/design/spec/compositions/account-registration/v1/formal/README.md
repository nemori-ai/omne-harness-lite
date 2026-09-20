# 注册组合的形式工件

`Registration.tla` 是本契约的行为权威规格，表达「以激活为单一提交点」这一核心结构。

## 条款到工件的映射

| 契约条款 | 形式表达 | 由哪个配置检查 |
|---|---|---|
| S-1 | `ActivatedHasTenant`、`OnePersonalPerAccount` | basic |
| S-2 | `ActivatedHasTenant`（故障注入下） | crash |
| S-3 | `NoFalseSuccess` | basic、crash |
| S-5 | `ConvergentOutcome` | crash |
| S-4 | `EventualOutcome`（时序性质） | progress |
| 三步次序 | `TenantBeforeActivation` | basic、crash |

## 三个配置为什么不同

| 配置 | `Failures` | `Abandoning` | 规格 | 检查什么 |
|---|---|---|---|---|
| `basic` | FALSE | TRUE | `Spec` | 正常路径的安全性质 |
| `crash` | **TRUE** | TRUE | `Spec` | 存储故障注入下安全性质仍成立 |
| `progress` | FALSE | **FALSE** | `ProgressSpec` | 进展性质，**在其前提成立时** |

`progress` 关闭故障与放弃，正对应契约 S-4 的前提 (e) 与 (d)。
**这不是为了让检查通过而放松条件**——有前提的进展性质本来就只在前提下成立，
把前提写进配置是它唯一的正确表达方式。若在 `Failures=TRUE` 下检查，
`<>[]storageUp` 可能不成立，性质会平凡满足，检查失去意义。

`Retry` 刻意**不加公平性**：放弃后是否重试由用户决定，系统不得假设它必然发生。

## 执行结果

见[验证与覆盖](../../verification.md)，含一次确认不变式有效性的变异测试。
