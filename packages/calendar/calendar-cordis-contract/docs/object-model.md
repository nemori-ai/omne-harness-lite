# 对象模型

## 对象与关系

CalendarQueryService 实现 CalendarQueries，CalendarSupplyService 实现 CalendarSupply。calendarQueryKey/calendarSupplyKey 与对应静态 provide 同源。Context 类型增补提供本机属性，不产生第二份业务身份。CalendarLocalQueryProvider/CalendarLocalSupplyProvider 继承这些定义，应用和资源仍归提供者宿主。

精确类型与 schema 见[定义索引](public-api.md)，本页不复制类型声明。

## 生命周期

定义包不创建存储、fetch、timer 或业务循环。provider 实例归装载它的宿主，调用者 Context 不成为提供者资源归属。依赖变更和释放沿 Cordis 与 IC 约定执行。
