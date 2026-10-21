# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts` 不导入 `@deepseek-ai/cordis`，也不导入 `cordis.ts`。具体子类、插件与配置 Schema 只从 `cordis.ts` 导出。子类 `extends` 服务定义成员的抽象类，不写服务键。源码不导入任何上层领域的契约（[SPEC 性质 7](../SPEC.md#结果与不变量)）。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。改撤除顺序、配置或唤醒时，同步 [Cordis 说明](../docs/cordis.md)。

## 本包事实

`index.ts` 与 `cordis.ts` 现在都只有 `PACKAGE_TEMPLATE_DRAFT` 标记与空导出。这个标记表示实现还没有进入源码。

当前缺口：具体子类、插件与配置 Schema 都还没有进入。根入口不导出任何东西，独立调用方从 `runtime-context` 取机制工厂。清单见[公开接口页](../docs/public-api.md#随实现进入的导出)。具名维护者由负责人指定。
