# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

测试文件：

- [public-entry.spec.ts](public-entry.spec.ts)：断言根入口没有导出。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：断言 `./cordis` 入口只导出 `SessionProvider`，源码入口与发布入口一致。
- [provider-load.spec.ts](provider-load.spec.ts)：装载、五个 `inject` 键任一缺席时停在 `PENDING`、换代时先卸载再重跑、配置错误、重复装载、受理声明。
- [provider-callers.spec.ts](provider-callers.spec.ts)：调用方类核对。
- [provider-ports.spec.ts](provider-ports.spec.ts)：按调用现取的端口缺席与抛出。
- [provider-notice.spec.ts](provider-notice.spec.ts)：提交通知的派发、外来通知、扫描者绑定。
- [provider-teardown.spec.ts](provider-teardown.spec.ts)：撤除的两个触发、窗口、限时等待、有序关闭、换代时在途命令。
- [checkpoint-cp1.spec.ts](checkpoint-cp1.spec.ts)：线内贯通检查点 CP1，对真实 sqlite-provider 上的 session-storage-sql；真实存储上的有序关闭。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-cordis`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

插件测试在真实 Cordis 4.0.4 上装载插件，不用 Cordis 的替身。端口提供者、调用方插件与监听者用测试内的最小插件代替，它们包着 session-contract 与 session-cordis-contract 的内存替身。实例用真实的 session 工厂；多数用例的事务对是内存对，CP1 与真实存储上的有序关闭用 session-storage-sql 的真实对，底下是真实 sqlite-provider。`provider-teardown.spec.ts` 与 `provider-notice.spec.ts` 用一个包着真实工厂的探针（[session-spy.ts](fixtures/session-spy.ts)）数 `close`、`maintain` 与扫描者的释放，它不改变任何结果。一个放在委托提交前的闸门让一条命令保持在途。跨进程的每租户单扫描者、真实身份与授权、其他邻域的端到端组合不在本目录。

已知缺口：撤除第 1 步到 `close` 之间的窗口里，本地命令可能启动自己的推进，没有测试断言它；自己派发的通知被监听者跳过这个优化没有单独的测试（[SPEC 的实现现状](../SPEC.md#实现现状)）。具名维护者由负责人指定。
