# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

`contribution.spec-d.ts` 是类型断言：正确的贡献编得过，漏操作、处理函数的消息体或答复与契约不一致、结果集外的结果、契约外的操作都编不过。`public-entry.spec.ts`、`cordis-entry.spec.ts` 从包名核对两个入口的运行时导出。`mount` 在真实 Cordis 上的行为由服务端接入的 `tests/registry-cordis.spec.ts` 验证，因为提供者在那里。没有替身。
