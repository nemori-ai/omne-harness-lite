# 公开入口

## 导出入口

[根入口](../src/index.ts)导出 SQL 发布持久化、供应材料/运行记录、来源适配，以及发行种子和供应运行器。`./cordis` 导出 CalendarLocalQueryProvider、CalendarLocalSupplyProvider 及各配置。

## 定义索引

| 责任                                                    | 定义入口                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 发布 repository/persistence、SQL materials 与 authority | [storage/provider.ts](../src/storage/provider.ts)、[storage/materials.ts](../src/storage/materials.ts)          |
| 材料保管、供应 journal、seed registry 端口              | [supply-storage/provider.ts](../src/supply-storage/provider.ts)、[custody.ts](../src/supply-storage/custody.ts) |
| 来源网络与知识 resolver、预算                           | [sources/index.ts](../src/sources/index.ts)                                                                     |
| 发行种子                                                | 根入口导出的 createShippedCalendarSeedRegistry、shippedCalendarSeedRelease，实现在 src/seeds/index.ts           |
| 供应运行器                                              | 根入口导出的 createCalendarSupplyRunner 及配置/事件类型，实现在 src/runner/                                     |
| 查询与供应 provider                                     | [cordis.ts](../src/cordis.ts)，配置与关闭责任见 [Cordis](cordis.md)                                             |

种子引用、许可和知识范围见[资源](../resources/README.md)。发行 data 清单和实际打包验证由发行拥有者核对，工作区文件存在不表示包内资产已获接受。
