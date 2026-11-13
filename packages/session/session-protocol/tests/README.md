# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

`shapes.spec-d.ts` 是类型断言，对照共同契约里旧家族 `session-public/1` 的手写类型。`operations.spec.ts`、`wire.spec.ts`、`observe-session.spec.ts` 经包名导入 `dist`，用真实的规则引擎读写；`wire.spec.ts` 同时用旧家族的 `readSessionRequest`、`readSessionResponse` 读同一份样本作对照。旧家族只在用例里导入，源码不导入。`browser-fixture.spec.ts` 是慢层，起一个 TypeScript 编译器进程。没有替身。
