# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员只有服务定义，没有实现。测试在真实 Cordis 4.0.4 上运行，不用替身。测试通过不代替规格或验收。端口缺席、换代与撤除后的行为归使用方，见 [skill-host-local](../../skill-host-local/tests/README.md)。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

当前测试包括：

- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有运行导出；`src/index.ts` 不含 `@deepseek-ai/cordis`；构建产物 `dist/index.js` 没有导入。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：五个键常量等于各类的 `provide`，值是约定的键名；`./cordis` 的导出集合恰为五个抽象类与五个键常量；两个端口服务的子类作为插件装载后在键上提供服务，卸载后键上没有服务。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/skill-cordis-contract test`，或在本成员目录执行 `pnpm test` 与 `pnpm typecheck`。具名维护者由负责人指定。
