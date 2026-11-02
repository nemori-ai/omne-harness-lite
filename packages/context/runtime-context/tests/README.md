# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员与 Cordis 无关，测试直接调用工厂，不装载 Cordis。测试用契约 `./testing` 的端口替身与整套 conformance，以及本目录的块声明与资格材料作输入，不需要真实存储，因为本成员不持有耐久状态。用例经包名导入 `dist`，改源码后先构建。持久化、跨进程一致性与租户隔离的端到端证据不在本目录，归持有者与装配的真实组合验证。测试通过不代替规格或验收。

## 维护

公开行为或 SPEC 条款变化时，同步对应测试与本目录 `index.md`。工厂进入根入口时，同一次修改要更新导出测试。

## 本包事实

用例清单见 [index.md](index.md)，与 SPEC [组合与验证](../SPEC.md#组合与验证)的场景一一对应。[support.ts](support.ts) 是共用的测试辅助。没有 `*.spec-d.ts` 类型测试。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/runtime-context`，或在本包目录先执行 `pnpm build`，再执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：当前点读取成本没有测量。持久化与真实组合不在本目录。具名维护者由负责人指定。
