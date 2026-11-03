# 关键流程

## 流程

外部消费者先使用对应公开 schema 解析值，再把合法请求交给 CalendarQueries 或 CalendarSupply 实现。查询实现返回 ok/error，resolve 的 value 仍保留纯计算判别。供应发布结果保留 recorded、unknown 或 rejected，不把未知当未提交。

完整业务流程见[Calendar 关键流程](../../calendar/docs/key-flows.md)。

## 失败与生命周期

非法结构在校验边界失败。业务计算区分 invalid、coverageInsufficient、searchLimit 和合法 empty。合法推进越过四位日期域时，coverageInsufficient 使用 date=null 与 beforeMinimum/afterMaximum；普通缺覆盖仍有日期。服务错误不能泄露跨租户存在性。本包无自有线程、定时器或释放步骤。
