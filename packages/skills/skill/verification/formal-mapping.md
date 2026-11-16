# 读取闸门：性质、模型与实现的对应

[ReadGate.tla](models/ReadGate.tla) 是读取与目录的行为模型。它用自组合表示无披露：两个运行共用一个请求与一份日程（端口故障、中止点、来源变化点）。`Mode` 为 `twin` 时两个运行看见只在被考察身份的不可用方式上不同的两个世界，为 `same` 时看见同一个世界、只在读取判定的完成次序上不同，为 `single` 时只有一个运行。模型把每次端口调用与紧接其后的中止检查合成一个动作。对真实实现的有界穷举探索器在 `tests/model/`（`explore.spec.ts`）。性质归[包组规格](../../SPEC.md#不变式)。模型与探索器之间没有精化证明；有限检查的通过不等于实现符合。

模型没有表示：字节范围（S4）、检查、映射表中找不到包、条目缺失与没有作答以外的行、逐字段的解析、不终止的端口、引用写明的身份与它的包定位不符（S7 的前提，由端口负责）。这些由探索器与用例承担。

## 性质

| 规格不变式 | 模型性质                                                  | 实现与探索器                                                                          |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| S1         | `SameObservation`（`twin`）                               | `src/access/gate.ts` 的三条无权路径；探索器 `disclosure.ts`                           |
| S2         | `WholeUnknown`                                            | `src/port-answer.ts` 的 `answered`、`src/source-answer.ts`；探索器 `whole-unknown.ts` |
| S3         | `NoMixedVersion`、`NoContentOnFailure`                    | `src/access/pin.ts`、`src/access/bytes.ts`；探索器 `basis.ts`                         |
| S4         | 模型不覆盖                                                | `src/access/range.ts`；探索器 `range.ts`                                              |
| S5         | `SameObservation`（`same`）                               | `src/catalog.ts` 按条目次序读判定的答复；探索器 `order.ts`                            |
| S6         | `AbortStops`                                              | `src/access/checkpoint.ts`；探索器 `abort.ts`                                         |
| S7         | `OwnMaterialOnly`（不含带依据时引用不带内容摘要的子情形） | `src/port-answer.ts` 的 `parseResolution`；探索器 `identity.ts`                       |

## 动作

| 模型动作                        | 实现（`src/`）                                                                |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `Start`                         | `access/gate.ts` 第一步（依据的能力标识）与第一次检查点；目录的空请求直接作答 |
| `Check`                         | `access/gate.ts` 的读取判定                                                   |
| `Resolve`、`ResolveMisdirected` | `access/gate.ts` 的对应解析；`service.ts` 的描述、钉材料与路径校验            |
| `Parsed`、`Misnames`            | `port-answer.ts` 的 `parseResolution`：引用身份一致的核对                     |
| `Snapshot`                      | `access/pin.ts` 与 `mapping.ts` 的快照列；`service.ts` 的列目录与条目查找     |
| `Open`                          | `access/bytes.ts` 与 `mapping.ts` 的读条目列；导出的逐条循环                  |
| `LawfulSet`、`CompleteCheck`    | `catalog.ts` 的合法集合与读取判定                                             |
| `undecided`                     | 端口没有作答：判定端口为未知，来源为不可用                                    |
| `abortAt`、`changeAt`、`smode`  | 探索器日程的 `abortAfter`、`change.after`、`addressing`                       |

## 配置的预期

| 配置                                    | 用途 | 预期                   |
| --------------------------------------- | ---- | ---------------------- |
| `ReadGate.cfg`                          | 正控 | 七个不变式全部成立     |
| `ReadGate_Change.cfg`                   | 正控 | 同上                   |
| `ReadGate_Abort.cfg`                    | 正控 | 同上                   |
| `ReadGate_Disclosure.cfg`               | 正控 | 同上                   |
| `ReadGate_Order.cfg`                    | 正控 | 同上                   |
| `ReadGate_FlawNoRefCheck.cfg`           | 负控 | `OwnMaterialOnly` 违反 |
| `ReadGate_FlawRefusedAsBasis.cfg`       | 负控 | `SameObservation` 违反 |
| `ReadGate_FlawUnknownAsEmpty.cfg`       | 负控 | `WholeUnknown` 违反    |
| `ReadGate_FlawNoEntryDigest.cfg`        | 负控 | `NoMixedVersion` 违反  |
| `ReadGate_FlawNoCheckAfterSnapshot.cfg` | 负控 | `AbortStops` 违反      |
| `ReadGate_FlawCompletionOrder.cfg`      | 负控 | `SameObservation` 违反 |

负控的非零退出本身不算通过：每个负控都必须报告指定的不变式被违反。
