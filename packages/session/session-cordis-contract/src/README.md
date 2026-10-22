# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、[公开接口](../docs/public-api.md)与本目录 `index.md`。

## 本包事实

现在有 `index.ts` 与 `cordis.ts` 两个源文件，内容都是 `export {}` 与一行 `PACKAGE_TEMPLATE_DRAFT` 标记。根入口为空，`./cordis` 也没有导出。服务定义、端口服务键、intercept 配置与事件的候选声明写在 [Cordis 说明](../docs/cordis.md)，不是源码。

对候选声明做过编译检查，探针只在任务临时目录，不是成员资源，也不进本目录。

当前缺口：`SessionService` 抽象类、各端口的抽象类与键常量、intercept 配置类型、`Context` 与 `Events` 增补都还没有进入源码，清单见[公开接口](../docs/public-api.md#随实现进入的导出)。具名维护者由负责人指定。
