# 公开入口

## 导出入口

根入口导出 calculation、queries、supply 的公开类型、值和 schema。不提供 `./cordis`。运行服务由 calendar 实现，服务绑定由 calendar-cordis-contract 定义。

## 定义索引

| 定义                                                        | 唯一形状源                              |
| ----------------------------------------------------------- | --------------------------------------- |
| 日期、快照、计算输入/依据/结果                              | [calculation.ts](../src/calculation.ts) |
| 上下文、Owner、错误、分页、list/get/effective/resolve       | [queries.ts](../src/queries.ts)         |
| probe/refresh/importSeed/queryPublication/health、seed 封套 | [supply.ts](../src/supply.ts)           |

list/get 保留 observedAt 与分页位置，get 的 versions 单独分页。resolve 支持 day/count/shift/next/nth，结果分支使用 value 包装纯计算结果。queryPublication 要求 address 与 expectedFingerprint，不能只给 operationRef。CalendarSupply 指纹中的 expectedRevision/consentRef 固定为 null。

合法日期推进越过四位日期域使用 coverageInsufficient、date=null 和必填 boundary；普通覆盖不足保留缺失日期，预算先耗尽仍 searchLimit。供应 unknown 按原地址和指纹认回。supplyStanding=null 不表示健康通过。
