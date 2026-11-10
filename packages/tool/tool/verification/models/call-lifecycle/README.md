# CallLifecycle：调用域的生命周期

本目录是调用域生命周期的有限模型。它守护 [SPEC](../../../SPEC.md) 中调用状态按期限删除的规则。

## 1. 建模的对象

一个调用标识。调用标识是消费位置的函数，所以没有保存结果的消费者在重启后会用同一标识再发一次。

| 变量 | 含义 |
| --- | --- |
| `cons` | 消费者自己的耐久记录：未发起、想要结果、已保存结果 |
| `dom` | 调用域：不存在、只有排除记录、已受理、已执行、已结算、已释放 |
| `due` | 该域在到期索引里的时刻 |
| `body` | 卸载正文必须可读到的时刻 |
| `execs` | 函数执行的次数，这是外部效果 |

## 2. 动作

`Issue`、`Admit`（含重发）、`Execute`、`Settle`、`Save`（消费者落盘保存）、`Ack`（确认，释放交付并排期）、`Sweep`（清扫删除整个域）、`LateOperation`（对空域的迟到查询或控制写下排除记录并排期）、`Tick`。

## 3. 性质

| 性质 | 含义 |
| --- | --- |
| `AtMostOnce` | 同一标识的函数至多执行一次 |
| `RemovedOnlyAfterSaved` | 调用域只在消费者保存结果之后删除 |
| `NoOrphanDue` | 没有记录的域没有到期项 |
| `IdleIsScheduled` | 不再被写的域有删除时刻 |
| `BodyKept` | 卸载正文在保存期限内可读 |
| `RemovalNotEarly` | 带正文的调用不早于正文期限删除 |
| `EventuallyAcked`、`EventuallyRemoved` | 已保存的结果会被确认；已排期的域到点后不再停留 |

## 4. 配置

| 配置 | 期望 |
| --- | --- |
| `positive` | 全部不变式成立 |
| `progress` | 两条活性成立 |
| `reclaim-before-ack` | 违反 `RemovedOnlyAfterSaved`：未确认就删除 |
| `ack-before-save` | 违反 `RemovedOnlyAfterSaved`：消费者未落盘就确认 |
| `consumer-resends-after-save` | 违反 `AtMostOnce`：消费者保存后重发 |
| `release-ignores-body` | 违反 `BodyKept`：排期不顾正文期限 |
| `sweep-before-due` | 违反 `BodyKept`：未到时刻就清扫 |
| `delete-without-unschedule` | 违反 `NoOrphanDue`：删除记录不删到期项 |
| `exclusion-without-due` | 违反 `IdleIsScheduled`：排除记录没有删除时刻 |

`ack-before-save` 与 `consumer-resends-after-save` 是对消费者的两条前提的负控。Tool 不能自己守住它们，它们写在结果交付的契约里。

## 5. 运行

```sh
TLA2TOOLS_JAR=<TLC 1.7.4 的 jar> python3 check.py --out <输出目录>
```

`check.py` 要求固定摘要的 TLC 1.7.4。日志与状态目录写到 `--out`，不写进本目录。

## 6. 模型到代码

实现后在此登记每个动作对应的源码位置和最后一次确认一致的提交。

## 7. 模型不覆盖的

- 清扫的删除与并发写入的竞争。删除是带期望修订号的一次条件提交，由存储的串行化保证。
- 多个租户与多个调用之间的关系。
- 正文的写入许可与封存，归 [BodyLifecycle](../../../../tool-contract/verification/models/body-lifecycle/README.md)。
- 消费者永不确认的调用。它们不被删除。
