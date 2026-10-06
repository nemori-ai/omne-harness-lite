# R1-T1b：共享存储与时钟的承诺归属

本页接续 D-114/D-115 与[限定设计采用](../../record/decisions/shared-storage-clock-integration/decision.md)。
新源只拥有本批迁入的集成承诺。本批产品已完成[独立验收与限定技术接受](../../record/decisions/shared-storage-clock-delivery/decision.md)；旧行为源和证据义务继续有效。

| 范围                                         | 唯一现行源                                                                                                               | 保留责任                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Storage 协议形状、错误、迁移、预检及维护类型 | `packages/core/storage/src/index.ts` 与既有公开子入口                                                                                | 原形状、Schema 身份及数据语义不变                  |
| StorageService、服务键与集成行为             | `packages/core/storage/src/cordis.ts`、`packages/core/storage/SPEC.md`                                                               | 只要求 read/write；atomic/close/maintenance 非强制 |
| Clock 形状与 offer 纯值                      | `packages/core/offer-expiry/src/index.ts`、原 Schema/testing 入口                                                                    | 各消费者仍按精确 v1/v2 使用，不倒灌语义            |
| ClockService、服务键及集成行为               | `packages/core/offer-expiry/src/cordis.ts`、`packages/core/offer-expiry/SPEC.md`                                                     | 不选择时间源或租约算法                             |
| SQL 独立提供者、正式 Service 与身份投影      | `packages/infra/storage-sql/SPEC.md`、`adr/service-faces.md`、公开接口                                                               | 独立与 Service 共享同一引擎；拥有/借用责任分开     |
| 租约提供者的绑定、限定名称与装卸             | `packages/infra/clock-lease/SPEC.md` 与公开接口                                                                                      | 原租约表、时间源、窗口、回拨和关闭算法保持         |
| Storage P-1～12、显式 P-13 与维护协议        | [原 Storage 设计](../../realization/packages/core/storage/design.md)、[维护](../../realization/packages/core/storage/maintenance.md) | 仍是未迁行为源；同提交、污染、失败与持久性不降级   |
| SQL 启动、锁、升级、快照和收场               | [原 SQL 设计](../../realization/packages/infra/storage-sql/design.md)及相关验证义务                                                  | 只取代其原根插件/键与 raw 发布投影，其余有效       |
| Clock 租约业务与各消费者承诺                 | [原 Clock 设计](../../realization/packages/infra/clock/design.md)及各精确协议                                                        | 旧节点名作为未迁和历史入口保留，不提供产品兼容包   |

旧 realization 混合文件不整体删除；其 README 从本页定位新集成源。
真实关系仍由源码抽取，不在本页重复维护装配图。
本批只整改必要公共依赖；账号/注册/组织/模型的业务方法、授权优先次序和事务参与语义保持。
接口变化及其消费者须通过源、声明、运行装载和真实制品四层验证。
运行中不可用、撤除中在途、迟到结果和原冷恢复责任不能由静态图替代。
