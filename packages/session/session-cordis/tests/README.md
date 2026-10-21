# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

现在有两个测试：

- [public-entry.spec.ts](public-entry.spec.ts)：断言根入口没有导出。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：断言 `./cordis` 入口没有导出。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-cordis`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

随实现进入的测试在真实 Cordis 4.0.4 上装载插件，不用 Cordis 的替身。端口提供者、调用方插件与监听者用测试内的最小插件代替。实例用真实的 session 工厂。跨进程的每租户单扫描者、持久化与真实邻域的端到端组合不在本目录。

当前缺口：[Cordis 说明的验证义务](../docs/cordis.md#验证义务)列出的九项都没有测试，随实现进入。具名维护者由负责人指定。
