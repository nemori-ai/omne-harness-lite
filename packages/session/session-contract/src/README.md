# src

本目录承载本包的公开定义、纯函数与测试替身。`index.ts` 与 `testing.ts` 是两个代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：`.` 指向 `index.ts`，`./testing` 指向 `testing.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。本成员是 `module` 变体，没有 `cordis.ts`，根入口不导入 `@deepseek-ai/cordis`，也不导入 Agent、Model、Tool 的契约包。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。`testing*.ts` 只给 `./testing` 入口，根入口不加载它们。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开入口与源码导航](../docs/public-api.md)、本目录 `index.md`、`tests/public-entry.spec.ts` 的导出集合，并重新生成 `api/session-contract.api.md`。命令到条目的编码只在 `entries.ts` 一份；新增条目种类时同时改 `decide.ts`、`reduce.ts` 与事件目录。

## 本包事实

根入口导出公开接口页导航的类型、两个操作身份派生函数、九个领域服务、`decide`、`reduce`、`projectSessionLog` 与 `sessionModesBlock`。支持范围与具名限制见 SPEC 状态行。命令编码集中在 `entries.ts`。判定按命令族拆分，归约由 `reduce.ts`、`reduce-extended.ts` 与 `reduce-results.ts` 完成。`result-state.ts` 核对结果的原 Run 归属，并同步参加提交的当前与历史执行引用。`./testing` 提供有效端口的一致性套件、非耐久替身与合法测试值。它们不提供生产存储。

历史材料、调用登记和原条目引用分别在 `history-values.ts`、`call-values.ts`、`work-entry-values.ts`。校验由相应 state/validation 模块供 decide、project 与 reduce 共同调用。当前支持及提供者边界见[同日志纯层](../docs/same-log-pure.md)。
