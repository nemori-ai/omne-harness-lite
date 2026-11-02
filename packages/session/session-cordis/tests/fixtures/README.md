# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格；数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

没有数据文件。夹具是代码：[assembly.ts](assembly.ts) 在真实 Cordis 根上装各端口的提供者，[backends.ts](backends.ts) 是内存事务对，[sql-backend.ts](sql-backend.ts) 是真实 SQL 对。后两个照 session 成员的 `tests/fixtures/backends.ts` 与 `sql.ts` 写成，因为包之间不能导入对方的测试目录；两边的夹具需要一起改。配置与通知载荷是小的类型化值，写在测试里。具名维护者由负责人指定。
