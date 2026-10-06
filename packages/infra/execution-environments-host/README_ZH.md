# execution-environments-host

[English](README.md)

独立 createEnvironmentRegistry 与 createHostEnvironment 工厂。注册表保留原 lease 及提供者撤除责任。内置 host 不提供命令、文件设施、OS 后端或沙箱隔离。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/execution-environments-host run build
pnpm --filter @omne-harness-lite/execution-environments-host run typecheck
pnpm --filter @omne-harness-lite/execution-environments-host run test
```
