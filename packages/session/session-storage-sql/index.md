# @omne-harness/session-storage-sql 索引

本文件列出包根文件、各目录与专题的阅读路径。本包的职责与状态见 [README_ZH.md](README_ZH.md)（[English](README.md)）。

## 包根

- [README_ZH.md](README_ZH.md)、[README.md](README.md)：用途、状态、目录结构与文档职责
- [SPEC.md](SPEC.md)：实现现状、表与索引、写路径、读路径、保留与缓存、符合性、失败分类
- `documentation.json`：本包的文档登记
- `package.json`：根入口、脚本与依赖
- `vitest.config.ts`、`tsconfig.build.json`、`tsconfig.test.json`：测试与构建配置

## 目录

- [docs/](docs/index.md)：架构、流程、对象模型、公开接口、使用与定位、装配边界
- [src/](src/index.md)：根入口、端口实现、游标、编解码、静态材料与 Worker 模块
- [tests/](tests/index.md)：入口与依赖、租户隔离用例，`node:sqlite` 夹具
- [schema/](schema/index.md)：不发布 Schema，表与索引的形状在对象模型
- [verification/](verification/index.md)：验证资源导航，义务表在 docs/；模型与证明现在为空
- [adr/](adr/index.md)：实现取舍，现在为空
- [examples/](examples/index.md)：使用示例，现在为空
- [resources/](resources/index.md)：非源码资源，现在为空
- [acceptance/](acceptance/index.md)：独立验收场景，现在为空

## 阅读路径

| 读者 | 起点 | 接着读 |
| --- | --- | --- |
| 应用装配者，要用 SQL 介质保存会话日志 | [docs/context.md](docs/context.md#使用方式) | [docs/cordis.md](docs/cordis.md)、[docs/public-api.md](docs/public-api.md#配置) |
| 不装配 Cordis 的独立调用方 | [docs/context.md](docs/context.md#独立使用) | [docs/public-api.md](docs/public-api.md) |
| 实现事务端口与读路径的开发者 | [SPEC.md](SPEC.md#实现现状) | [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md) |
| 改表、索引或迁移的开发者 | [docs/object-model.md](docs/object-model.md) | SPEC 的[派生行表](SPEC.md#w3)与[符合性](SPEC.md#符合性) |
| 存储契约拥有者，核对本成员对 sql-contract 的采用 | SPEC 的 [XP 表](SPEC.md#xp-table) | [docs/architecture.md](docs/architecture.md#当前设计限制) |
| 验证者 | [docs/verification-obligations.md](docs/verification-obligations.md) | SPEC 的[自有义务的验证](SPEC.md#自有义务的验证)、[tests/](tests/README.md) |
| 本包的维护者 | [docs/architecture.md](docs/architecture.md#验证与维护) | SPEC 的[组合与验证](SPEC.md#组合与验证) |
