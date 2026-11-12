# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口不导入 `@deepseek-ai/cordis`，Cordis 绑定只从 `cordis.ts` 导出（仅绑定变体）。非类型行为写在包根 `SPEC.md`，不写在源码注释里代替规格。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、`docs/public-api.md` 与本目录 `index.md`。

## 本包事实

[storage](../src/storage/provider.ts)提供发布 repository/persistence、迁移和参加者。[supply-storage](../src/supply-storage/provider.ts)保管材料、probe、运行记录及恢复分页。[sources](../src/sources/index.ts)执行受限 probe/acquire，纯解析与政策在 calendar。根入口还导出 seeds 的发行 registry 与 metadata，以及 runner 的构造器；`./cordis` 提供查询和供应两个 provider。精确入口见[公开索引](../docs/public-api.md)。
