# src

本目录承载本包的公开定义与实现。[index.ts](index.ts) 是根入口，[cordis.ts](cordis.ts) 是 Cordis 绑定入口，[deliver-injected.ts](deliver-injected.ts) 是它转出的注入发送，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口及它到达的 [store.ts](store.ts)、[records.ts](records.ts) 不导入 `@deepseek-ai/cordis`、model-cordis-contract 或 cordis.ts。deliver-injected.ts 同样不导入 store.ts 与 records.ts。存在性与解析的判定不在本目录，来自 model。非类型行为写在包根 [SPEC.md](../SPEC.md)。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、[公开接口](../docs/public-api.md)与本目录 `index.md`。

## 本包事实

本目录已实现本地凭据保管库与 Cordis 插件。其他宿主能力没有实现。
