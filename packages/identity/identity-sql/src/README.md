# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。`worker/` 下的模块由存储提供者在 Worker 线程里按文件加载，它们只执行 SQL，没有随机数、时间函数与跨调用状态，运行时只导入本目录内的模块。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。改 `worker/` 下任何文件的字节都改变材料摘要与组合版本，新构建会登记新版本。

## 本包事实

主线程：`index.ts`、`cordis.ts`、`provider.ts`、`materials.ts`、`config.ts`、`deadline.ts`、`identifiers.ts`。时钟不在本目录：它经 `identityClock` 服务键注入。Worker：`worker/schema.ts`、`worker/support.ts`、`worker/migration.ts`、`worker/participant.ts`、`worker/read-issue-basis.ts`、`worker/read-login-by-proof.ts`、`worker/read-standing.ts`。负责人是本成员的写者，当前没有缺口。
