# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。本成员是 `module` 变体，没有 `cordis.ts`，根入口不导入 `@deepseek-ai/cordis`。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与导出测试。按[内部架构](../docs/architecture.md#模块与依赖)的模块切分新增源文件，`index.ts` 只做再导出。

## 本包事实

现在只有 `index.ts` 一个源文件，内容是 `export {}`，根入口没有类型，也没有运行值。文件头带 `PACKAGE_TEMPLATE_DRAFT` 标记，它表示公开契约还没有进入源码。

当前缺口：SPEC 与对象模型点名的全部值类型、纯操作、端口类型与契约常量都还没有进入，清单见[公开接口页](../docs/public-api.md#随实现切片进入的导出)。包外依赖随它们进入 `package.json`。具名维护者由负责人指定。
