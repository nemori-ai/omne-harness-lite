# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

全部测试是快层。`cordis-entry.spec.ts` 使用真实的 Cordis `Context`，提供者是一个记录绑定、答 `admitted` 的探针子类；它不校验绑定，校验归 `telemetry-contract`。`public-entry.spec.ts` 从包名导入并读取 `dist`，所以先构建。`fixtures/` 目前没有固定输入。条款与测试的对应见 [SPEC.md](../SPEC.md#组合与验证)。
