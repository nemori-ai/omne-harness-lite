# session-tenancy

[English](README.md)

租户／会话值类型与活体 SessionAccess 契约。可信入口签发器核验当前身份及授权，品牌类型或序列化值不能复活访问绑定。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/session-tenancy run build
pnpm --filter @omne-harness-lite/session-tenancy run typecheck
pnpm --filter @omne-harness-lite/session-tenancy run test
```
