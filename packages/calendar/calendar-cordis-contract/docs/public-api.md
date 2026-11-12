# 公开入口

## 导出入口

根入口无运行服务定义。`./cordis` 导出两个服务类和键；查询与供应分别装配，不混成单一全能服务。

## 定义索引

[cordis.ts](../src/cordis.ts)唯一拥有 CalendarQueryService/calendarQueryKey、CalendarSupplyService/calendarSupplyKey 和 Cordis Context 类型增补。查询键为 calendarQuery，供应键为 calendarSupply。方法签名沿 [calendar-contract](../../calendar-contract/docs/public-api.md)，不在此复制。
