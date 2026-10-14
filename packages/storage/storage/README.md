# storage

## 职责与状态

本目录是目标文档。workspace 包尚未建立。这里没有 `package.json`、源码、公开导出或可运行入口。PanQiWei 于 2026-10-14 认可 [SPEC](SPEC.md) 的结果模型。断电耐久的提供者符合性仍由 [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 承接。

## 使用与集成

要判断操作身份、提交结果、查询证明、取消或关闭时，读 [SPEC](SPEC.md)。要判断组内依赖和参加者关系时，读[组入口](../README.md)。目前没有可运行示例。公开入口明确之后，Cordis 装配沿 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) 设计。命令携带版本化数据。Context、数据库句柄和闭包留在 Worker 之外。

## 契约与设计

[SPEC](SPEC.md) 是结果、失败、取消和关闭的唯一行为正文。SQLite 与 PostgreSQL 的差别也在 SPEC 的提供者义务。组入口不复制结果表。

## 配置与运行

Node 基线、写连接、`WAL` 读回和有限上限在 SPEC。运行装配尚未核实。调用方传入租户和操作键。

## 验证与维护

验证场景在 [SPEC 的验证义务](SPEC.md#验证义务与未覆盖)。本目录没有 `commit` 和 `query` 的探针。SPEC 里的探针是主线程上的 `node:sqlite` 读回。结果模型变化时，先改 SPEC，再改组入口里的链接。创建真实包前核对[成员文档规范](../../../docs/member-documentation.md)。
