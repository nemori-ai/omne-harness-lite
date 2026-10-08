# asset-registry

[English](README.md)

资产注册表共享类型、表、报告与记录 codec。具体存储及注册表操作由提供者承担。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

未迁行为沿[架构维护入口](../../../.meta_harness/design/architecture/README.md)定位精确现行源。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/asset-registry run build
pnpm --filter @omne-harness-lite/asset-registry run typecheck
pnpm --filter @omne-harness-lite/asset-registry run test
```
