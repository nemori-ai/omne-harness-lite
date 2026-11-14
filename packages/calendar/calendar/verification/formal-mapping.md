# 有界第 N 个工作日：性质、模型与实现的对应

[CalendarTotalization.tla](models/CalendarTotalization.tla) 是正向「第 N 个工作日」有界扫描的有限实例：三个日期、覆盖前缀长度 0 到 3、全部八种工作日集合、序号 0 到 4、预算 0 到 3。序号 0 表示非法输入；覆盖长度 0 表示查询窗口内没有已知日期；预算 0 表示内部剩余预算。[models.json](models.json) 声明每份配置的预期，[check.py](check.py) 按它判读。性质归[包组规格](../../SPEC.md#不变式)。模型只覆盖连续的覆盖前缀与正向扫描，不覆盖反向、`last`、全部日期边界与日期库行为；它是抽象状态检查，不是对 TypeScript 的精化证明；终止性以 `Decide` 的弱公平为前提，不给耗时上界。

## 性质

| 规格不变式 | 模型性质                                   | 实现与用例                                                               |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| INV-CA04   | `coverageEnd`、`working` 与分类谓词        | `src/calculation.ts` 的覆盖与工作日谓词；`public-entry` 用例             |
| CA-1       | `SuccessSound`：找到的序号正确             | `src/calculation.ts` 的 `selectNthWorkingDay`；`public-entry` 的序号用例 |
| INV-CA06   | `AbsenceSound`：无结果必须有完整依据       | 同上；预算用尽与覆盖不足的用例                                           |
| CA-1       | `WorkAccounted` 与其余类型、结果标签不变式 | 已扫描前缀的计数、预算与结果标签                                         |
| CA-1       | `Terminates`、`SufficientFuelComplete`     | 有界求值；足够预算取得已有答案或确定的不存在                             |

## 配置预期

| 配置                      | 角色 | 预期                                      |
| ------------------------- | ---- | ----------------------------------------- |
| `total-positive`          | 正控 | 全部不变式与时序性质通过，完整成功        |
| `total-negative-coverage` | 负控 | 把缺覆盖改成无结果，命中 `AbsenceSound`   |
| `total-negative-limit`    | 负控 | 把预算用尽改成无结果，命中 `AbsenceSound` |
| `total-negative-spin`     | 负控 | 把步进改成空转，得到时序停滞反例          |

负控的「通过」表示检出了预期的缺陷，不表示错误模型满足性质。解析错误、错打的不变式、工具缺失、超时或中断都不算通过。
