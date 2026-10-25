# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明，本成员只有根入口，对应 `index.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。任何模块都不导入 `@deepseek-ai/cordis`（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。本成员是 `module` 变体，没有 `cordis.ts`。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。

## 本包事实

`index.ts` 从 `registry.ts` 重导出 `createEnvironmentRegistry`、`RetirementPending` 与三个类型。`registry.ts` 是登记表，`access.ts` 是普通操作的访问核验，`original.ts` 是按配额域的原记录路由、查询与结清，`lease-view.ts` 是租约视图与逐操作门，`recovery.ts` 是资源路径与获取路径的恢复编排，`compare.ts` 是复制、指纹与比较函数。`index.ts` 带 `PACKAGE_TEMPLATE_DRAFT` 注释，写明受管设施操作对账本的使用、Runtime Context 块的生产与契约验证套件还没有接受。

当前缺口：SPEC [明确缺项](../SPEC.md#明确缺项)。具名维护者由负责人指定。
