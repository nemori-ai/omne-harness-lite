# 存储能力组

本组是条件性工程位置，依据为[数据与状态](../../docs/architecture/data-and-state.md)与[目标包组织](../../docs/package-organization.md#目标目录)。本组现有一个 workspace 成员 `sql-contract`，以及一份目标文档。SQLite 提供者的 workspace 包尚未建立。

## 责任与范围

数据拥有者确认事实、持久边界、保留与查询责任。存储契约规定共同提交的结果。相邻领域的业务规则和事实权威留在原拥有者。

## 成员与依赖

- [sql-contract](sql-contract/README_ZH.md)：SQL 存储契约的 workspace 成员，已建立。拥有身份、提交与认回结果、登记、读取、材料与清单摘要、关闭控制口、三个 Cordis 服务定义，以及内存替身与符合性套件。根与 `./worker` 不导入 Cordis。设计依据是 #687 revision 2 采用的 SQL r2 规格。
- SQLite 提供者（`sqlite-provider`）：尚未建立，由 #687 第二段交付。依赖 sql-contract，不被 sql-contract 依赖。
- 旧的目标文档仍在 [storage 目标文档](docs/storage-contract/README.md) 与其[事务行为](docs/storage-contract/SPEC.md)，在第二段按替换清单写回成员后退出。

依赖方向见[包边界与公开入口](../../docs/package-organization.md#包边界与公开入口)。PostgreSQL 提供者尚未建立。

## 关键协作

调用方、提交协调者、事实拥有者的命令和存储提供者参加同一次提交。结果与失败在[事务行为](docs/storage-contract/SPEC.md)。

## 组合验证

组合验证检查共同提交、未知结果和恢复。场景在[验证义务](docs/storage-contract/SPEC.md#验证义务与未覆盖)。[存储 Worker 探针](../../tools/storage-probe/README.md)保留现有设计验证。生产提供者的符合性套件尚未建立。当 `synchronous` 为 `FULL` 时，普通进程终止证明进程级持久。断电耐久另以故障试验为证据。

## 维护

组维护者同步导航和组合责任。契约维护者同步 SPEC 的结果模型。长期个人负责人尚未具名。建立真实包前核对[成员文档规范](../../docs/member-documentation.md)和[开发指南](../../docs/development.md#创建和整改产品包)。统一行为正文在目标文档的 SPEC，组根只保留本入口。
