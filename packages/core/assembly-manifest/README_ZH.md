# assembly-manifest

[English](README.md)

装配清单值、操作类型与 Cordis Service 定义。清单记录所选装配输入，本包不持久化清单，也不装载插件。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

未迁行为沿[架构维护入口](../../../.meta_harness/design/architecture/README.md)定位精确现行源。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/assembly-manifest run build
pnpm --filter @omne-harness-lite/assembly-manifest run typecheck
pnpm --filter @omne-harness-lite/assembly-manifest run test
```
