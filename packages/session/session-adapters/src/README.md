# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、[公开接口](../docs/public-api.md)与本目录 `index.md`。按[内部架构](../docs/architecture.md)的模块切分新增源文件，入口文件只做再导出。

## 本包事实

现在有 `index.ts` 与 `cordis.ts` 两个源文件，内容都是 `export {}` 与一行 `PACKAGE_TEMPLATE_DRAFT` 标记。两个入口都没有导出。根入口随实现承载翻译纯函数，`./cordis` 承载全部插件、端口提供者与 `ContextBlocks` 增补，目标导出清单在[公开接口](../docs/public-api.md#定义索引)。

当前缺口：模式翻译、身份编码与结果对应三类纯函数，以及[插件清单](../SPEC.md#插件清单)里的全部插件都还没有进入源码。具名维护者由负责人指定。
