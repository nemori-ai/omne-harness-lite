# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试装配代码、测试数据文件与说明。

## 边界

固定输入不能代替规格。数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

这里只有装配代码，没有数据文件：

- [harness.ts](harness.ts)：一个会话服务实例与全部端口替身。委派入口外面包一层计数与提交注入，访问检查按主体所属租户裁定，用例可以预排下几次裁定。
- [backends.ts](backends.ts)：session-contract 的内存替身对，以及初始化材料的来源。
- [sql.ts](sql.ts)：session-storage-sql 的 `createSessionStoragePair` 在真实 sqlite-provider 上的组装，临时目录，两个租户各一个事务域。只经各包的公开入口组装。
- [facade.ts](facade.ts)：把四个面包成 `SessionTransactionPort` 的形状，让 session-contract 的事务套件逐面驱动服务。用例交给 `commit` 的守卫材料转交证据桥。
