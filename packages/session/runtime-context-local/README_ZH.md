# runtime-context-local

[English](README.md)

独立 `createRuntimeContext` 工厂共同拥有修改、SQL 当前投影、来源、观察和可信 initializer。日志仍是事实源。启动 owner 前，装配方先应用 `runtimeContextMigrations`。Cordis 的 `createRuntimeContextLocal` 工厂使用 managed assembly work，并借用原日志 backing；公共服务没有初始化方法。冷恢复核验日志前缀，热读取按所需 key 读取投影，并只折叠新后缀。

模型、前提及运行入口见 [verification](verification/README.md)。生命周期和成本要求必须由实际交付证据核验，不能根据包结构推断已完成。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/runtime-context-local run build
pnpm --filter @omne-harness-lite/runtime-context-local run typecheck
pnpm --filter @omne-harness-lite/runtime-context-local run test
```
