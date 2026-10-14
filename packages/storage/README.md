# 存储能力组

本组是条件性工程位置，依据为[数据与状态](../../docs/architecture/data-and-state.md)与[目标包组织](../../docs/package-organization.md#目标目录)。目前有一份目标文档，没有 workspace 包、`package.json`、源码或可运行入口。

## 责任与范围

数据拥有者先确认事实、持久边界、保留与查询责任。存储契约规定共同提交的结果。本组不接管相邻领域的业务规则或事实权威。

## 成员与依赖

[storage 目标文档](storage/README.md)持有[事务行为](storage/SPEC.md)。它不是 workspace 成员。真实包仍须先有具名消费者和已接受的公开入口。依赖方向见[包边界与公开入口](../../docs/package-organization.md#包边界与公开入口)。

<!-- documentation:placeholder -->

SQLite 与 PostgreSQL 提供者尚未成立。它们以后只补充自己的配置和失败，不另写公共结果。

## 关键协作

调用方、提交协调者、事实拥有者的命令和存储提供者参加同一次提交。精确结果、拒绝、未知和未提交见[事务行为](storage/SPEC.md)。组页不复制这套结果。同路径或同库不是同一事务。外部效果不在数据库提交里。

## 组合验证

组合上要检验共同提交、未知结果和恢复。行为场景见[验证义务](storage/SPEC.md#验证义务与未覆盖)。目前没有本组可执行验证资源或通过证据。进程重启不能替代断电耐久证据。

## 维护

组维护者同步导航和组合责任。契约维护者同步 SPEC 的结果模型。长期个人负责人尚未具名。建真实包前核对[成员文档规范](../../docs/member-documentation.md)和[开发指南](../../docs/development.md#创建和整改产品包)。组根不设统一 SPEC。
