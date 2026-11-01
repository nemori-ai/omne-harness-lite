# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格。数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

这里是测试夹具代码，不是固定数据文件：

- [sqlite-storage.ts](sqlite-storage.ts)：`SqlStorage` 的测试提供者。每个事务域一个 `node:sqlite` 内存库，运行本包真实的 participant、迁移与读 handler 模块。它模拟回执、停止响应触发的回滚、按完整身份认回与作用域分隔，**不**模拟 Worker、持久、受理队列与限额。夹具通过只说明模块的 SQL 语义成立。
- [app.ts](app.ts)：一个测试应用的组合：两个租户及各自的事务域、租户事务域目录、显式访问策略、固定的游标签名替身，以及经测试提供者构造的 `createSessionStorage` 端口、同一选项上的 `createSessionStoragePair` 端口对与 `createSessionPrincipalBindings` 读口。
- [entries.ts](entries.ts)：端口每个公开入口各一个调用，供隔离用例对每个入口重复同一断言。

本夹具是真实 sqlite-provider 的替代，对应 SPEC 义务只在 SQL 语义层面。
