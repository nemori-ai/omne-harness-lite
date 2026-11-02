# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明，本成员只有根入口。

## 边界

源码只用可擦除的 TypeScript 语法。本成员是 `module` 变体，没有 `cordis.ts`，任何源文件都不导入 `@deepseek-ai/cordis`。源码依赖 session-contract，以及它也依赖的公共包 legal-identity 与 operation-result。源码不导入邻域契约、Cordis 或存储实现。非类型行为写在包根 [SPEC.md](../SPEC.md)，调度策略的初值也以 SPEC 为准，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开入口页](../docs/public-api.md)、本目录 `index.md` 与导出测试。按[内部架构](../docs/architecture/README.md#模块与状态责任)的模块切分新增源文件，`index.ts` 只导出工厂、`SchedulingPolicy` 与它们需要的类型。

## 本包事实

`index.ts` 导出工厂、`defaultSchedulingPolicy` 与它们需要的类型。模块与 SPEC 条款的对应见本目录 [index.md](index.md)。

当前缺口：SPEC 的一部分机制还没有进入源码，清单与触发条件见 SPEC 的[实现现状](../SPEC.md#实现现状)。具名维护者由负责人指定。
