# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

五个源文件：`index.ts` 是公开根，`cordis.ts` 是 `./cordis` 入口（插件 `skillPlugin`、三个服务子类与两个端口适配器，不导入 `directory-source.ts` 以外的内部模块），`directory-source.ts` 是来源工厂，`walk.ts` 是遍历、链接解析、根内判定与错误分类，`fs.ts` 是文件系统接缝及其默认实现。模块职责与依赖方向见 [docs/architecture.md](../docs/architecture.md)。除 `cordis.ts` 的三个服务子类外，源码中没有类；也没有 `any` 与类型断言（`as const` 除外）。
