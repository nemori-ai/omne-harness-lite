# 共享存储与时钟的承诺归属

共享存储和时钟的形状与行为由实际接口拥有者维护；本页只导航，不维护第二份实现承诺。

| 范围                                         | 唯一现行源                                                                                                               | 保留责任                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Storage 协议形状、错误、迁移、预检及维护类型 | `packages/core/storage/src/index.ts` 与既有公开子入口                                                                                | 原形状、Schema 身份及数据语义不变                  |
| StorageService、服务键与集成行为             | `packages/core/storage/src/cordis.ts`、`packages/core/storage/SPEC.md`                                                               | 只要求 read/write；atomic/close/maintenance 非强制 |
| Clock 形状与 offer 纯值                      | `packages/core/offer-expiry/src/index.ts`、原 Schema/testing 入口                                                                    | 各消费者仍按精确 v1/v2 使用，不倒灌语义            |
| ClockService、服务键及集成行为               | `packages/core/offer-expiry/src/cordis.ts`、`packages/core/offer-expiry/SPEC.md`                                                     | 不选择时间源或租约算法                             |
| SQL 独立提供者、正式 Service 与身份投影      | `packages/infra/storage-sql/SPEC.md`、`adr/service-faces.md`、公开接口                                                               | 独立与 Service 共享同一引擎；拥有/借用责任分开     |
| 租约提供者的绑定、限定名称与装卸             | `packages/infra/clock-lease/SPEC.md` 与公开接口                                                                                      | 原租约表、时间源、窗口、回拨和关闭算法保持         |
| 存储同提交、失败、污染、持久性与维护 | [Storage SPEC](../../../../packages/core/storage/SPEC.md) | 精确事务参与边界、未知提交和维护责任 |
| SQL启动、锁、升级、快照与收场 | [SQL SPEC](../../../../packages/infra/storage-sql/SPEC.md) | 实际方言、物理完成与失败前提 |
| 时钟租约与时间源 | [Clock lease SPEC](../../../../packages/infra/clock-lease/SPEC.md) | 窗口、回拨、装卸与关闭责任 |

真实关系仍由源码抽取，不在本页重复维护装配图。
公共依赖的边界不改变领域方法；账号/注册/组织/模型的业务方法、授权优先次序和事务参与语义保持。
接口变化及其消费者须通过源、声明、运行装载和真实制品四层验证。
运行中不可用、撤除中在途、迟到结果和原冷恢复责任不能由静态图替代。
