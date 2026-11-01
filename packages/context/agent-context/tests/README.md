# tests

<!-- documentation:placeholder -->

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

<!-- documentation:placeholder -->

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

<!-- documentation:placeholder -->

- `account-outlet.spec.ts`：出站的符合性套件（接真实的 `createContextAccounting`，目标由空重放重建）、事实字段、租户次序、缺席解析器、结果映射、解析器与收件口抛出、与真实账目投影的组合。收件口的替身只用来记录收到的事实与回放固定答复，真实的投影只在符合性与组合用例里。
- `cordis-entry.spec.ts`：真实 Cordis 4.0.4，真实的 `RequestContextProvider` 提供 `requestContext` 与 `contextAccountingInbox`，信任对象与内存来源是替身。覆盖缺依赖停在 `PENDING`、提供者撤除后回到 `PENDING`、停止后旧引用答 `outlet-closed`、不合的配置加载失败、真实装配上 `deliver` 答 `scope-unresolved`。
- `public-entry.spec.ts`：两个入口的导出清单。

测试经构建产物导入所用成员，先构建依赖。测试通过不代替规格或验收；真实装配里账目投影的初始化（ACCT-INIT）不在这里覆盖。

## 维护

<!-- documentation:placeholder -->

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

<!-- documentation:placeholder -->

待补：本目录对本包的实际内容、负责人与当前缺口。不适用时写明理由，并在 `documentation.json` 把本文件记为 `not-applicable`。
