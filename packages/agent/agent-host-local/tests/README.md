# tests

<!-- documentation:placeholder -->

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

<!-- documentation:placeholder -->

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

<!-- documentation:placeholder -->

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

<!-- documentation:placeholder -->

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

<!-- documentation:placeholder -->

待补：本目录对本包的实际内容、负责人与当前缺口。不适用时写明理由，并在 `documentation.json` 把本文件记为 `not-applicable`。

`public-entry.spec.ts` 经根入口实际创建接收方，以 Agent 公开 `createModelReceiverFixture` 装配同源内存 Journal。它验证 unsupported 拒绝、真实 push 的条目与材料、pending 报告及重装配后的同 handoff retry。Model、Access 与 outlet 是显式替身；该用例不证明完整 Cordis 插件、生产 Model host 或磁盘耐久。
