# storage

## 职责与状态

本目录是存储公共契约的目标文档，不是 workspace 成员。这里没有 `package.json`、源码、公开导出或可运行入口。PanQiWei 于 2026-10-14 认可 [SPEC](SPEC.md) 的结果模型。这不关闭 SQL-T01，也不证明提供者已经实现。

## 使用与集成

消费者从 [SPEC](SPEC.md) 读取操作身份、提交结果和查询证明。目前不能提供可运行示例。Cordis 装配须在公开入口明确后沿 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) 设计。Context、数据库句柄和闭包不能当作业务数据跨线程传递。

## 契约与设计

[SPEC](SPEC.md) 维护提交、查询、失败、取消和关闭的行为。[组入口](../README.md) 只说明参加者关系和依赖，不复制结果表。SQLite 与 PostgreSQL 的差别写在 SPEC 里，作为未来提供者必须满足的义务，不是第二个公共契约。

## 配置与运行

运行基线、写连接、`WAL` 读回和有限上限沿 SPEC 的适用条件。尚无已核实的运行装配，不提供默认数据库文件或默认租户。

## 验证与维护

SPEC 的验证场景是后续义务。本次没有事务探针。改变结果模型时同步 SPEC、组入口和真实消费者。创建真实包前核对[成员文档规范](../../../docs/member-documentation.md)。
