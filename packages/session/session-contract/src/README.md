# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。本成员是 `module` 变体，没有 `cordis.ts`，根入口不导入 `@deepseek-ai/cordis`。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开入口与候选定义](../docs/public-api.md)、本目录 `index.md` 与导出测试。按[内部架构](../docs/architecture.md)的模块切分新增源文件，`index.ts` 只做再导出。

## 本包事实

现在只有 `index.ts` 一个源文件，内容是 `export {}` 与一行 `PACKAGE_TEMPLATE_DRAFT` 标记。根入口为空，没有类型也没有运行值。候选声明只写在公开入口页，那里是唯一的候选定义，不是源码。后继实现接管精确定义时，公开入口页改为源码导航。

对候选声明做过编译检查，探针只在任务临时目录，不是成员资源，也不进本目录。

当前缺口：值与结果项、工作与管理等操作、构造依赖端口与出站端口、块声明、纯函数 `decide` 与历史页的类型都还没有进入源码，清单见[公开入口与候选定义](../docs/public-api.md)。具名维护者由负责人指定。
