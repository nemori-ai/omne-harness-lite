# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts` 不导入 `@deepseek-ai/cordis`，也不导入 `cordis.ts`。具体子类、插件与配置 Schema 只从 `cordis.ts` 导出。子类 `extends` 服务定义成员的抽象类，不写服务键。源码不导入任何上层领域的契约（[SPEC 性质 7](../SPEC.md#结果与不变量)）。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。改撤除顺序、配置或唤醒时，同步 [Cordis 说明](../docs/cordis.md)。

## 本包事实

`index.ts` 是空导出。`cordis.ts` 导出具体子类 `RuntimeContextProvider` 与插件入口 `createRuntimeContextPlugin`，并含配置的 Standard Schema。机制实例只在子类构造函数的闭包里。独立调用方从 `runtime-context` 取机制工厂。

当前缺口：同步失效来源不在本成员（缺口保留在 #677）。具名维护者由负责人指定。
