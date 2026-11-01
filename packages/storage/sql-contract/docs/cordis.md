# Cordis 集成

本文件说明本包的 Cordis 集成：适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则引用仓库的 IC 约定，不在本文件复制。

## 集成入口

`./cordis` 导出三个抽象 Service 与键：`StorageService`（`storage`）、`StorageHostService`（`storageHost`）、`TenantDomainsService`（`tenantDomains`）。每个类的 `provide` 是静态只读字符串，构造函数调用 `super(ctx, <类>.provide)`，类上的 `@owner` 写 `packages/storage/sql-contract`。提供者继承 `StorageService` 而不再 provide 同一个键；消费者注入 `storageKey`，不导入提供者。`StorageHostService` 只由装配入口提供，装配只把它交给 `storage` 行，这是装配范围，不是访问控制。`StorageControl` 不是服务属性，也不进入 `Context`。根入口与 `./worker` 不导入 Cordis。

## 生命周期与清理

本包不启动 Worker、不持有资源，也不登记 effect。服务的卸载只移除键。提供者的 effect 与关闭协议由提供者包负责（#687 第二段）。卸载一个服务不撤销已提交的事实或已发出的外部效果。
