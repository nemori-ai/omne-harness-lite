# model-request-runtime

[English](README.md)

根入口拥有十五操作 runtime 接口、transport 与构造类型、日志 codec、OriginalIssue 参与协议及纯退避计算。`SPEC.md` 拥有已迁的行为承诺；完整耐久操作仍沿精确未迁旧源。local 提供者消费这些公共定义。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/model-request-runtime run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```
