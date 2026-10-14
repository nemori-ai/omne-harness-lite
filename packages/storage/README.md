# 存储能力组

本组是条件性工程位置，依据为[数据与状态](../../docs/architecture/data-and-state.md)与[目标包组织](../../docs/package-organization.md#目标目录)。本组现有一份目标文档。workspace 包、`package.json`、源码和可运行入口尚未建立。

## 责任与范围

数据拥有者确认事实、持久边界、保留与查询责任。存储契约规定共同提交的结果。相邻领域的业务规则和事实权威留在原拥有者。

## 成员与依赖

要读提交结果、未知、未提交、取消或关闭时，打开 [storage 目标文档](storage/README.md) 及其 [事务行为](storage/SPEC.md)。该目录是目标文档，workspace 包尚未建立。真实包在具名消费者和公开入口接受之后建立。依赖方向见[包边界与公开入口](../../docs/package-organization.md#包边界与公开入口)。

<!-- documentation:placeholder -->

SQLite 提供者与 PostgreSQL 提供者尚未建立。它们以后补充自己的配置和失败。公共结果在事务行为规格。

## 关键协作

调用方、提交协调者、事实拥有者的命令和存储提供者参加同一次提交。结果与失败在[事务行为](storage/SPEC.md)。

## 组合验证

组合验证检查共同提交、未知结果和恢复。场景在[验证义务](storage/SPEC.md#验证义务与未覆盖)。可执行验证资源尚未建立。进程级重启证明进程级持久。断电耐久另以故障试验为证据。

## 维护

组维护者同步导航和组合责任。契约维护者同步 SPEC 的结果模型。长期个人负责人尚未具名。建立真实包前核对[成员文档规范](../../docs/member-documentation.md)和[开发指南](../../docs/development.md#创建和整改产品包)。统一行为正文在目标文档的 SPEC，组根只保留本入口。
