# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明，本成员只有根入口。

## 边界

源码只用可擦除的 TypeScript 语法。本成员是 `module` 变体，没有 `cordis.ts`，任何源文件都不导入 `@deepseek-ai/cordis`。源码依赖 request-context-contract、call-account 与 legal-identity，不导入协调者、历史持有者或贡献者的契约。非类型行为写在包根 [SPEC.md](../SPEC.md)，默认策略的数值也以 SPEC 为准，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与导出测试。按[内部架构](../docs/architecture.md#模块与依赖)的模块切分新增源文件，`index.ts` 只导出工厂、默认策略与它们需要的类型。

## 本包事实

- `index.ts`：根入口，只导出两个工厂。
- `registry.ts`：`createContextSourceRegistry`。登记项、代际、借用、发布核对、撤除与关闭；操作组由契约的 `createAssemblyOperations` 按借用的来源集合构造。
- `accounting.ts`：`createContextAccounting`。收件口的核验顺序、按 `(call, dispatch)` 的修订指纹索引、窗口占用四种状态、系统恢复的暂存重建。

当前缺口：候选缓存、派生物、两个默认策略与修剪器还没有进入。清单见[公开接口页](../docs/public-api.md#随实现进入的导出)。具名维护者由负责人指定。
