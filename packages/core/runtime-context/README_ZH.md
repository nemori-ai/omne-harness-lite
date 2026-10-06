# runtime-context

[English](README.md)

会话上下文登记、读取与观察契约，以及上下文解码。来源访问、耐久写入及提供者排空均有明确责任。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

[观察模型与前提](verification/models/README.md)

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/runtime-context run build
pnpm --filter @omne-harness-lite/runtime-context run typecheck
pnpm --filter @omne-harness-lite/runtime-context run test
```
